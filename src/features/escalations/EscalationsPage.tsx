import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { conversationsApi } from "@/shared/api/conversations";
import { normalizeError } from "@/shared/api/client";
import { decisionsApi } from "@/shared/api/decisions";
import { ticketsApi } from "@/shared/api/tickets";
import { EmptyState, ErrorState } from "@/shared/components/EmptyState";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { TableSkeleton } from "@/shared/components/Skeletons";
import type {
  DecisionSuggestionsResponse,
  EscalationPackage,
  TicketPriority,
  TicketStatus,
} from "@/shared/types";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  SendHorizontal,
  Sparkles,
} from "lucide-react";

function isHighRisk(risk: EscalationPackage["risk_level"]) {
  return risk === "high" || risk === "critical";
}

function isUrgentPriority(priority: TicketPriority) {
  return priority === "high" || priority === "critical";
}

function normalizeRiskLevel(risk?: string): EscalationPackage["risk_level"] {
  const normalized = String(risk ?? "").toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "medium";
}

function humanizeLabel(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/_/g, " ");
}

function riskSurfaceClass(risk: EscalationPackage["risk_level"]) {
  switch (risk) {
    case "critical":
      return "border-destructive/50 bg-destructive/10";
    case "high":
      return "border-amber-500/50 bg-amber-500/10";
    case "medium":
      return "border-yellow-500/40 bg-yellow-500/10";
    default:
      return "border-emerald-500/40 bg-emerald-500/10";
  }
}

function decisionBorderClass(risk: EscalationPackage["risk_level"]) {
  switch (risk) {
    case "critical":
      return "border-destructive/40";
    case "high":
      return "border-amber-500/40";
    case "low":
      return "border-emerald-500/40";
    default:
      return "border-border";
  }
}

type ParsedEscalationSummary = {
  ticket?: string;
  status?: string;
  priority?: string;
  channel?: string;
  intentCategory?: string;
  confidenceScore?: string;
  riskScore?: string;
  riskFactors: string[];
  description?: string;
  actionRequired?: string;
};

function readSummaryValue(line: string, label: string) {
  const prefix = `${label}:`;
  if (!line.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  return line.slice(prefix.length).trim();
}

function parseEscalationSummary(summary?: string): ParsedEscalationSummary | null {
  const text = summary?.trim();
  if (!text) return null;

  const parsed: ParsedEscalationSummary = { riskFactors: [] };
  const descriptionLines: string[] = [];
  const actionLines: string[] = [];

  let section: "none" | "risk-factors" | "description" | "action-required" = "none";
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^===\s*ESCALATION SUMMARY\s*===$/i.test(line) || /^---\s*AI ANALYSIS\s*---$/i.test(line)) {
      section = "none";
      continue;
    }

    if (/^RISK FACTORS\s*:\s*$/i.test(line)) {
      section = "risk-factors";
      continue;
    }

    if (/^---\s*DESCRIPTION\s*---$/i.test(line)) {
      section = "description";
      continue;
    }

    if (/^===\s*ACTION REQUIRED\s*===$/i.test(line)) {
      section = "action-required";
      continue;
    }

    if (!line) {
      if (section === "description" && descriptionLines.length > 0 && descriptionLines[descriptionLines.length - 1] !== "") {
        descriptionLines.push("");
      }
      continue;
    }

    const ticket = readSummaryValue(line, "Ticket");
    if (ticket !== null) {
      parsed.ticket = ticket;
      section = "none";
      continue;
    }

    const status = readSummaryValue(line, "Status");
    if (status !== null) {
      parsed.status = status;
      section = "none";
      continue;
    }

    const priority = readSummaryValue(line, "Priority");
    if (priority !== null) {
      parsed.priority = priority;
      section = "none";
      continue;
    }

    const channel = readSummaryValue(line, "Channel");
    if (channel !== null) {
      parsed.channel = channel;
      section = "none";
      continue;
    }

    const intentCategory = readSummaryValue(line, "Intent Category");
    if (intentCategory !== null) {
      parsed.intentCategory = intentCategory;
      section = "none";
      continue;
    }

    const confidenceScore = readSummaryValue(line, "Confidence Score");
    if (confidenceScore !== null) {
      parsed.confidenceScore = confidenceScore;
      section = "none";
      continue;
    }

    const riskScore = readSummaryValue(line, "Risk Score");
    if (riskScore !== null) {
      parsed.riskScore = riskScore;
      section = "none";
      continue;
    }

    if (section === "risk-factors") {
      const factor = line.replace(/^[•*-]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
      if (factor) {
        parsed.riskFactors.push(factor);
      }
      continue;
    }

    if (section === "description") {
      descriptionLines.push(rawLine.trim());
      continue;
    }

    if (section === "action-required") {
      actionLines.push(line);
      continue;
    }
  }

  const description = descriptionLines.join("\n").trim();
  const actionRequired = actionLines.join(" ").replace(/\s+/g, " ").trim();

  if (description) {
    parsed.description = description;
  }
  if (actionRequired) {
    parsed.actionRequired = actionRequired;
  }

  const hasParsedContent = Boolean(
    parsed.ticket
      || parsed.status
      || parsed.priority
      || parsed.channel
      || parsed.intentCategory
      || parsed.confidenceScore
      || parsed.riskScore
      || parsed.description
      || parsed.actionRequired
      || parsed.riskFactors.length,
  );

  return hasParsedContent ? parsed : null;
}

export function EscalationsPage() {
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState("");

  const [packageData, setPackageData] = useState<EscalationPackage | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);

  const [overrideStatus, setOverrideStatus] = useState<TicketStatus>("resolved");
  const [overridePriority, setOverridePriority] = useState<TicketPriority>("medium");
  const [replyText, setReplyText] = useState("");

  const {
    data: ticketList,
    isLoading: listLoading,
    error: listError,
    refetch: listRefetch,
  } = useQuery({
    queryKey: ["tickets", { page, status: "escalated" }],
    queryFn: () => ticketsApi.list({ page, size: 20, status: "escalated" }),
  });

  const escalatedTickets = ticketList?.tickets ?? [];

  const filteredEscalatedTickets = useMemo(() => {
    const q = queueSearch.trim().toLowerCase();
    if (!q) return escalatedTickets;
    return escalatedTickets.filter((ticketItem) =>
      [ticketItem.subject, ticketItem.id, ticketItem.priority, ticketItem.status].some((field) =>
        field.toLowerCase().includes(q),
      ),
    );
  }, [escalatedTickets, queueSearch]);

  const urgentTicketsCount = useMemo(
    () => escalatedTickets.filter((ticketItem) => isUrgentPriority(ticketItem.priority)).length,
    [escalatedTickets],
  );

  const {
    data: ticket,
    isLoading: ticketLoading,
    error: ticketError,
    refetch: ticketRefetch,
  } = useQuery({
    queryKey: ["ticket", selectedTicketId],
    queryFn: () => (selectedTicketId ? ticketsApi.get(selectedTicketId) : Promise.resolve(null)),
    enabled: !!selectedTicketId,
  });

  const suggestionsQuery = useQuery({
    queryKey: ["ticket-suggestions", selectedTicketId],
    queryFn: () => (selectedTicketId ? decisionsApi.suggestions(selectedTicketId) : Promise.resolve(null as any)),
    enabled: !!selectedTicketId,
  });

  const packageMut = useMutation({
    mutationFn: (ticketId: string) => decisionsApi.escalateTicket(ticketId),
    onSuccess: (res) => {
      setPackageData(res);
      setPackageLoading(false);
      toast({ title: "Escalation insights ready" });
    },
    onError: (err) => {
      setPackageLoading(false);
      toast({ variant: "destructive", title: "Failed to load escalation", description: normalizeError(err) });
    },
  });

  useEffect(() => {
    if (!selectedTicketId) return;
    setPackageData(null);
    setReplyText("");
    setPackageLoading(true);
    packageMut.mutate(selectedTicketId);
  }, [selectedTicketId]);

  useEffect(() => {
    if (!ticket) return;
    setOverrideStatus("resolved");
    setOverridePriority(ticket.priority ?? "medium");
  }, [ticket]);

  const applyOverride = async () => {
    if (!selectedTicketId) return;
    try {
      await ticketsApi.update(selectedTicketId, {
        status: overrideStatus,
        priority: overridePriority,
        escalation_flag: overrideStatus === "resolved" ? false : true,
      });
      toast({ title: "Override applied" });
      // Refetch package and ticket to reflect changes.
      ticketRefetch();
      setPackageLoading(true);
      packageMut.mutate(selectedTicketId);
    } catch (err) {
      toast({ variant: "destructive", title: "Override failed", description: normalizeError(err) });
    }
  };

  const sendReplyMut = useMutation({
    mutationFn: (content: string) => {
      if (!ticket?.conversation_id) throw new Error("Conversation ID missing for this ticket.");
      return conversationsApi.send(ticket.conversation_id, content);
    },
    onSuccess: () => {
      setReplyText("");
      toast({ title: "Reply sent" });
    },
    onError: (err) => toast({ variant: "destructive", title: "Failed to send reply", description: normalizeError(err) }),
  });

  const suggestions: DecisionSuggestionsResponse | null = suggestionsQuery.data ?? null;
  const suggestionButtons = suggestions?.suggestions ?? [];

  const riskWarning = useMemo(() => {
    if (!packageData) return null;
    if (!isHighRisk(packageData.risk_level)) return null;
    return (
      <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Immediate review recommended</AlertTitle>
        <AlertDescription>
          Risk is {packageData.risk_level} with {(packageData.confidence_score * 100).toFixed(0)}% confidence.
          Confirm customer impact before resolving.
        </AlertDescription>
      </Alert>
    );
  }, [packageData]);

  const primaryRecommendedAction = packageData?.recommended_actions[0] ?? null;
  const parsedSummary = useMemo(() => parseEscalationSummary(packageData?.summary), [packageData?.summary]);

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <div className="w-96 border-r overflow-y-auto shrink-0">
        <div className="space-y-3 p-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Escalations</h2>
              <p className="text-xs text-muted-foreground mt-1">Human handoff workspace</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => listRefetch()} disabled={listLoading}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Escalated queue</p>
              <p className="text-lg font-semibold mt-0.5">{ticketList?.total ?? 0}</p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Urgent tickets</p>
              <p
                className={cn(
                  "text-lg font-semibold mt-0.5",
                  urgentTicketsCount > 0 ? "text-amber-600 dark:text-amber-300" : "text-foreground",
                )}
              >
                {urgentTicketsCount}
              </p>
            </div>
          </div>

          <div className="relative">
            <Search className="h-4 w-4 text-muted-foreground pointer-events-none absolute left-2.5 top-2.5" />
            <Input
              value={queueSearch}
              onChange={(event) => setQueueSearch(event.target.value)}
              className="pl-8"
              placeholder="Search subject, id, status, priority"
            />
          </div>
        </div>

        {listLoading ? (
          <div className="p-3"><TableSkeleton rows={6} cols={1} /></div>
        ) : listError ? (
          <div className="p-3">
            <ErrorState message={normalizeError(listError)} onRetry={() => listRefetch()} />
          </div>
        ) : escalatedTickets.length === 0 ? (
          <EmptyState title="No escalated tickets" description="Your queue is clear right now." />
        ) : filteredEscalatedTickets.length === 0 ? (
          <EmptyState title="No matching tickets" description="Try a different search term." />
        ) : (
          <div className="divide-y">
            {filteredEscalatedTickets.map((ticketItem) => {
              const selected = selectedTicketId === ticketItem.id;
              const urgent = isUrgentPriority(ticketItem.priority);
              return (
                <button
                  key={ticketItem.id}
                  onClick={() => setSelectedTicketId(ticketItem.id)}
                  className={cn(
                    "w-full border-l-4 border-transparent p-3 text-left transition-colors hover:bg-muted/50",
                    selected && "border-l-primary bg-accent shadow-sm",
                    !selected && urgent && "border-l-amber-500/80 bg-amber-500/5",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium truncate">{ticketItem.subject}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(ticketItem.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge status={ticketItem.priority} />
                    <StatusBadge status={ticketItem.status} />
                    {urgent ? (
                      <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        urgent
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-muted-foreground mt-2 truncate">{ticketItem.id}</p>
                </button>
              );
            })}
          </div>
        )}

        <div className="p-3 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing {filteredEscalatedTickets.length} of {ticketList?.total ?? 0}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => setPage((p) => p + 1)}>
              <span className="sr-only">Next page</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border-r">
        {!selectedTicketId ? (
          <div className="h-full flex items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">
              Select an escalated ticket to review timeline, AI context, and next actions.
            </p>
          </div>
        ) : ticketLoading ? (
          <div className="p-4 space-y-4"><TableSkeleton rows={4} cols={2} /></div>
        ) : ticketError ? (
          <div className="p-4">
            <ErrorState message={normalizeError(ticketError)} onRetry={() => ticketRefetch()} />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{ticket?.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ticket?.channel_source} · {ticket?.id}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={ticket?.status ?? "escalated"} />
                  <StatusBadge status={ticket?.priority ?? "medium"} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{ticket?.description}</p>

              <div className="grid gap-2 sm:grid-cols-3">
                <div
                  className={cn(
                    "rounded-lg border px-3 py-2",
                    packageData ? riskSurfaceClass(packageData.risk_level) : "border-border bg-muted/20",
                  )}
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Risk level</p>
                  <p className="text-sm font-semibold mt-1">
                    {packageData ? humanizeLabel(packageData.risk_level) : "Analyzing..."}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">AI confidence</p>
                  <p className="text-sm font-semibold mt-1">
                    {packageData ? `${(packageData.confidence_score * 100).toFixed(0)}%` : "Analyzing..."}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Intent category</p>
                  <p className="text-sm font-semibold mt-1 truncate">
                    {packageData ? humanizeLabel(packageData.intent_category) : "Analyzing..."}
                  </p>
                </div>
              </div>
            </div>

            {packageLoading || !packageData ? (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <p className="text-sm font-medium">AI is preparing escalation package...</p>
                </div>
                <TableSkeleton rows={6} cols={1} />
              </div>
            ) : (
              <>
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Conversation timeline</h3>
                    <span className="text-xs text-muted-foreground">
                      {packageData.conversation_history.length} events
                    </span>
                  </div>
                  {packageData.conversation_history.length === 0 ? (
                    <EmptyState title="No conversation history" description="No messages were captured for this ticket." />
                  ) : (
                    <div className="space-y-3">
                      {packageData.conversation_history.map((message, idx) => (
                        <div
                          key={`${message.created_at}-${idx}`}
                          className={cn(
                            "rounded-lg border p-3",
                            message.is_internal ? "border-sky-300/50 bg-sky-500/5" : "border-border bg-card",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              {message.is_internal ? "Internal note" : "Customer message"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(message.created_at).toLocaleString()}
                            </p>
                          </div>
                          <p className="text-sm mt-2 whitespace-pre-wrap leading-relaxed">{message.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-semibold">Actions already attempted</h3>
                    <span className="text-xs text-muted-foreground">
                      {packageData.previous_decisions.length} attempts
                    </span>
                  </div>
                  {packageData.previous_decisions.length === 0 ? (
                    <EmptyState title="No previous decisions" description="This ticket has no decision attempts yet." />
                  ) : (
                    <div className="space-y-3">
                      {packageData.previous_decisions.map((decision, index) => {
                        const riskLevel = normalizeRiskLevel(decision.risk_level);
                        return (
                        <div
                          key={decision.id ?? index}
                          className={cn("p-3 rounded-lg border bg-background", decisionBorderClass(riskLevel))}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={riskLevel} />
                            <span className="text-xs text-muted-foreground">
                              Outcome: {humanizeLabel(decision.decision_outcome)}
                            </span>
                            {decision.confidence_score !== undefined && (
                              <span className="text-xs text-muted-foreground">
                                Confidence: {(decision.confidence_score * 100).toFixed(0)}%
                              </span>
                            )}
                            {decision.created_at && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(decision.created_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-2">{decision.reasoning ?? "-"}</p>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="w-96 overflow-y-auto shrink-0">
        <div className="p-3 border-b">
          <h3 className="text-sm font-semibold">Operator Actions</h3>
          <p className="text-xs text-muted-foreground mt-1">Highlighted insights and manual controls</p>
        </div>

        <div className="p-4 space-y-4">
          {!selectedTicketId ? (
            <EmptyState title="No ticket selected" description="Pick a ticket from the queue." />
          ) : packageLoading || !packageData ? (
            <div className="space-y-3">
              <TableSkeleton rows={4} cols={1} />
            </div>
          ) : (
            <>
              {riskWarning}

              <div className={cn("rounded-xl border p-4 space-y-3", riskSurfaceClass(packageData.risk_level))}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-semibold">Escalation spotlight</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border bg-background/70 px-2 py-1.5">
                    <p className="text-muted-foreground">Risk level</p>
                    <p className="font-semibold">{humanizeLabel(packageData.risk_level)}</p>
                  </div>
                  <div className="rounded-md border bg-background/70 px-2 py-1.5">
                    <p className="text-muted-foreground">Confidence</p>
                    <p className="font-semibold">{(packageData.confidence_score * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded-md border bg-background/70 px-2 py-1.5">
                    <p className="text-muted-foreground">Risk score</p>
                    <p className="font-semibold">{packageData.risk_score.toFixed(2)}</p>
                  </div>
                  <div className="rounded-md border bg-background/70 px-2 py-1.5">
                    <p className="text-muted-foreground">Intent</p>
                    <p className="font-semibold truncate">{humanizeLabel(packageData.intent_category)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">AI summary</p>
                </div>

                {parsedSummary ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Ticket snapshot</p>
                      <p className="mt-1 text-sm font-medium leading-relaxed">
                        {parsedSummary.ticket ?? packageData.ticket_subject ?? "-"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {parsedSummary.status ? <StatusBadge status={parsedSummary.status.toLowerCase()} /> : null}
                        {parsedSummary.priority ? <StatusBadge status={parsedSummary.priority.toLowerCase()} /> : null}
                        {parsedSummary.channel ? (
                          <span className="inline-flex items-center rounded-full border bg-background/70 px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
                            {parsedSummary.channel}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border bg-background/70 px-2 py-1.5">
                        <p className="text-muted-foreground">Intent</p>
                        <p className="font-semibold truncate">
                          {parsedSummary.intentCategory ?? humanizeLabel(packageData.intent_category)}
                        </p>
                      </div>
                      <div className="rounded-md border bg-background/70 px-2 py-1.5">
                        <p className="text-muted-foreground">Confidence</p>
                        <p className="font-semibold">
                          {parsedSummary.confidenceScore ?? `${(packageData.confidence_score * 100).toFixed(1)}%`}
                        </p>
                      </div>
                      <div className="rounded-md border bg-background/70 px-2 py-1.5">
                        <p className="text-muted-foreground">Risk score</p>
                        <p className="font-semibold">
                          {parsedSummary.riskScore ?? `${(packageData.risk_score * 100).toFixed(1)}%`}
                        </p>
                      </div>
                    </div>

                    {parsedSummary.riskFactors.length > 0 ? (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Risk factors</p>
                        <ul className="mt-2 space-y-1.5">
                          {parsedSummary.riskFactors.map((factor, index) => (
                            <li key={`${factor}-${index}`} className="flex items-start gap-2 text-sm">
                              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
                              <span>{factor}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="rounded-lg border bg-background/70 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Description</p>
                      <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {parsedSummary.description ?? packageData.ticket_description ?? "No ticket description available."}
                      </p>
                    </div>

                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Action required</p>
                      <p className="mt-1 text-sm font-medium">
                        {parsedSummary.actionRequired ?? "This ticket requires human review."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{packageData.summary}</p>
                )}
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <p className="text-sm font-semibold">Recommended actions</p>
                {primaryRecommendedAction ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Top next action</p>
                    <p className="text-sm font-medium mt-1">{primaryRecommendedAction}</p>
                  </div>
                ) : null}

                {packageData.recommended_actions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recommendations provided.</p>
                ) : (
                  <ul className="space-y-2">
                    {packageData.recommended_actions.slice(primaryRecommendedAction ? 1 : 0).map((action, index) => (
                      <li key={index} className="text-sm flex gap-2">
                        <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        {action}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <p className="text-sm font-semibold">Override and status control</p>
                <p className="text-xs text-muted-foreground">
                  Use this when manual review differs from AI recommendation.
                </p>

                <div className="grid gap-3">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={overrideStatus} onValueChange={(value) => setOverrideStatus(value as TicketStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["open", "in_progress", "resolved", "closed"] as TicketStatus[]).map((statusValue) => (
                          <SelectItem key={statusValue} value={statusValue}>{humanizeLabel(statusValue)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Priority</Label>
                    <Select value={overridePriority} onValueChange={(value) => setOverridePriority(value as TicketPriority)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["low", "medium", "high", "critical"] as TicketPriority[]).map((priorityValue) => (
                          <SelectItem key={priorityValue} value={priorityValue}>{priorityValue}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={applyOverride}>
                    Apply Override
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={packageLoading}
                    onClick={() => selectedTicketId && packageMut.mutate(selectedTicketId)}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Re-run
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-4 space-y-3">
                <p className="text-sm font-semibold">Suggested replies (editable)</p>
                {suggestionsQuery.isLoading ? (
                  <TableSkeleton rows={3} cols={1} />
                ) : suggestionsQuery.error ? (
                  <p className="text-sm text-destructive">{normalizeError(suggestionsQuery.error)}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {suggestionButtons.slice(0, 6).map((suggestion, index) => (
                      <Button
                        key={index}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReplyText(suggestion)}
                      >
                        {suggestion.length > 28 ? suggestion.slice(0, 28) + "..." : suggestion}
                      </Button>
                    ))}
                    {suggestionButtons.length === 0 && (
                      <p className="text-sm text-muted-foreground">No suggestions available yet.</p>
                    )}
                  </div>
                )}

                <div>
                  <Label className="text-xs">Reply to customer</Label>
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={ticket?.conversation_id ? "Type a reply..." : "No conversation linked to this ticket."}
                    rows={4}
                    disabled={!ticket?.conversation_id}
                    aria-label="Reply text"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {ticket?.conversation_id ? "Conversation linked. Sending will notify the customer." : "No conversation_id found."}
                  </p>
                  <Button
                    size="sm"
                    disabled={!ticket?.conversation_id || !replyText.trim() || sendReplyMut.isPending}
                    onClick={() => sendReplyMut.mutate(replyText)}
                  >
                    <SendHorizontal className="h-4 w-4 mr-1" />
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

