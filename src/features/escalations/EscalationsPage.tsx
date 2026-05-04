import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { conversationsApi } from '@/shared/api/conversations';
import { normalizeError } from '@/shared/api/client';
import { decisionsApi } from '@/shared/api/decisions';
import { ticketsApi } from '@/shared/api/tickets';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TableSkeleton } from '@/shared/components/Skeletons';
import type {
  DecisionSuggestionsResponse,
  EscalationPackage,
  TicketPriority,
  TicketStatus,
} from '@/shared/types';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

function isHighRisk(risk: EscalationPackage['risk_level']) {
  return risk === 'high' || risk === 'critical';
}

function isUrgentPriority(priority: TicketPriority) {
  return priority === 'high' || priority === 'critical';
}

function normalizeRiskLevel(risk?: string): EscalationPackage['risk_level'] {
  const normalized = String(risk ?? '').toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
    return normalized;
  }
  return 'medium';
}

function humanizeLabel(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

function badgeToken(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function summarizeText(value: string | null | undefined, maxChars = 120) {
  const compact = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!compact) return 'No description available.';
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars - 1).trimEnd()}…`;
}

function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function formatCompactDate(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';

  const diffMs = parsed.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60000);

  if (absMinutes < 1) return 'Just now';
  if (absMinutes < 60) return diffMs < 0 ? `${absMinutes}m ago` : `In ${absMinutes}m`;

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) return diffMs < 0 ? `${absHours}h ago` : `In ${absHours}h`;

  const absDays = Math.round(absHours / 24);
  return diffMs < 0 ? `${absDays}d ago` : `In ${absDays}d`;
}

function riskSurfaceClass(risk: EscalationPackage['risk_level']) {
  switch (risk) {
    case 'critical':
      return 'border-destructive/50 bg-destructive/10';
    case 'high':
      return 'border-amber-500/50 bg-amber-500/10';
    case 'medium':
      return 'border-yellow-500/40 bg-yellow-500/10';
    default:
      return 'border-emerald-500/40 bg-emerald-500/10';
  }
}

function riskTextClass(risk: EscalationPackage['risk_level']) {
  switch (risk) {
    case 'critical':
      return 'text-destructive';
    case 'high':
      return 'text-amber-700 dark:text-amber-300';
    case 'medium':
      return 'text-yellow-700 dark:text-yellow-300';
    default:
      return 'text-emerald-700 dark:text-emerald-300';
  }
}

function decisionBorderClass(risk: EscalationPackage['risk_level']) {
  switch (risk) {
    case 'critical':
      return 'border-destructive/40';
    case 'high':
      return 'border-amber-500/40';
    case 'low':
      return 'border-emerald-500/40';
    default:
      return 'border-border';
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

  let section: 'none' | 'risk-factors' | 'description' | 'action-required' = 'none';
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^===\s*ESCALATION SUMMARY\s*===$/i.test(line) || /^---\s*AI ANALYSIS\s*---$/i.test(line)) {
      section = 'none';
      continue;
    }

    if (/^RISK FACTORS\s*:\s*$/i.test(line)) {
      section = 'risk-factors';
      continue;
    }

    if (/^---\s*DESCRIPTION\s*---$/i.test(line)) {
      section = 'description';
      continue;
    }

    if (/^===\s*ACTION REQUIRED\s*===$/i.test(line)) {
      section = 'action-required';
      continue;
    }

    if (!line) {
      if (section === 'description' && descriptionLines.length > 0 && descriptionLines[descriptionLines.length - 1] !== '') {
        descriptionLines.push('');
      }
      continue;
    }

    const ticket = readSummaryValue(line, 'Ticket');
    if (ticket !== null) {
      parsed.ticket = ticket;
      section = 'none';
      continue;
    }

    const status = readSummaryValue(line, 'Status');
    if (status !== null) {
      parsed.status = status;
      section = 'none';
      continue;
    }

    const priority = readSummaryValue(line, 'Priority');
    if (priority !== null) {
      parsed.priority = priority;
      section = 'none';
      continue;
    }

    const channel = readSummaryValue(line, 'Channel');
    if (channel !== null) {
      parsed.channel = channel;
      section = 'none';
      continue;
    }

    const intentCategory = readSummaryValue(line, 'Intent Category');
    if (intentCategory !== null) {
      parsed.intentCategory = intentCategory;
      section = 'none';
      continue;
    }

    const confidenceScore = readSummaryValue(line, 'Confidence Score');
    if (confidenceScore !== null) {
      parsed.confidenceScore = confidenceScore;
      section = 'none';
      continue;
    }

    const riskScore = readSummaryValue(line, 'Risk Score');
    if (riskScore !== null) {
      parsed.riskScore = riskScore;
      section = 'none';
      continue;
    }

    if (section === 'risk-factors') {
      const factor = line.replace(/^[â€¢*-]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
      if (factor) {
        parsed.riskFactors.push(factor);
      }
      continue;
    }

    if (section === 'description') {
      descriptionLines.push(rawLine.trim());
      continue;
    }

    if (section === 'action-required') {
      actionLines.push(line);
      continue;
    }
  }

  const description = descriptionLines.join('\n').trim();
  const actionRequired = actionLines.join(' ').replace(/\s+/g, ' ').trim();

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

type MetricTileProps = {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
  valueClassName?: string;
};

function MetricTile({ label, value, hint, className, valueClassName }: MetricTileProps) {
  return (
    <div className={cn('rounded-xl border bg-muted/20 p-3', className)}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 text-xl font-semibold tracking-tight', valueClassName)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function EscalationsPage() {
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [queueSearch, setQueueSearch] = useState('');
  const [queueMode, setQueueMode] = useState<'all' | 'urgent'>('all');

  const [packageData, setPackageData] = useState<EscalationPackage | null>(null);
  const [packageLoading, setPackageLoading] = useState(false);

  const [overrideStatus, setOverrideStatus] = useState<TicketStatus>('resolved');
  const [overridePriority, setOverridePriority] = useState<TicketPriority>('medium');
  const [replyText, setReplyText] = useState('');

  const deferredQueueSearch = useDeferredValue(queueSearch);

  const {
    data: ticketList,
    isLoading: listLoading,
    error: listError,
    refetch: listRefetch,
  } = useQuery({
    queryKey: ['tickets', { page, status: 'escalated' }],
    queryFn: () => ticketsApi.list({ page, size: 20, status: 'escalated' }),
  });

  const escalatedTickets = ticketList?.tickets ?? [];
  const totalPages = Math.max(1, Math.ceil((ticketList?.total ?? 0) / 20));

  useEffect(() => {
    if (escalatedTickets.length === 0) {
      setSelectedTicketId(null);
      return;
    }

    if (!selectedTicketId) {
      setSelectedTicketId(escalatedTickets[0].id);
      return;
    }

    if (!escalatedTickets.some((ticketItem) => ticketItem.id === selectedTicketId)) {
      setSelectedTicketId(escalatedTickets[0].id);
    }
  }, [escalatedTickets, selectedTicketId]);

  const filteredEscalatedTickets = useMemo(() => {
    let items = escalatedTickets;
    if (queueMode === 'urgent') {
      items = items.filter((ticketItem) => isUrgentPriority(ticketItem.priority));
    }

    const q = deferredQueueSearch.trim().toLowerCase();
    if (!q) return items;

    return items.filter((ticketItem) =>
      [
        ticketItem.subject,
        ticketItem.description,
        ticketItem.id,
        ticketItem.priority,
        ticketItem.status,
        ticketItem.channel_source,
      ].some((field) => String(field ?? '').toLowerCase().includes(q)),
    );
  }, [deferredQueueSearch, escalatedTickets, queueMode]);

  const urgentTicketsCount = useMemo(
    () => escalatedTickets.filter((ticketItem) => isUrgentPriority(ticketItem.priority)).length,
    [escalatedTickets],
  );

  const criticalTicketsCount = useMemo(
    () => escalatedTickets.filter((ticketItem) => ticketItem.priority === 'critical').length,
    [escalatedTickets],
  );

  const selectedVisibleIndex = useMemo(
    () => filteredEscalatedTickets.findIndex((ticketItem) => ticketItem.id === selectedTicketId),
    [filteredEscalatedTickets, selectedTicketId],
  );

  const {
    data: ticket,
    isLoading: ticketLoading,
    error: ticketError,
    refetch: ticketRefetch,
  } = useQuery({
    queryKey: ['ticket', selectedTicketId],
    queryFn: () => (selectedTicketId ? ticketsApi.get(selectedTicketId) : Promise.resolve(null)),
    enabled: Boolean(selectedTicketId),
  });

  const suggestionsQuery = useQuery({
    queryKey: ['ticket-suggestions', selectedTicketId],
    queryFn: () => (selectedTicketId ? decisionsApi.suggestions(selectedTicketId) : Promise.resolve(null as any)),
    enabled: Boolean(selectedTicketId),
  });

  const packageMut = useMutation({
    mutationFn: (ticketId: string) => decisionsApi.escalateTicket(ticketId),
    onSuccess: (res) => {
      setPackageData(res);
      setPackageLoading(false);
    },
    onError: (err) => {
      setPackageLoading(false);
      toast({ variant: 'destructive', title: 'Failed to load escalation', description: normalizeError(err) });
    },
  });

  useEffect(() => {
    if (!selectedTicketId) return;
    setPackageData(null);
    setReplyText('');
    setPackageLoading(true);
    packageMut.mutate(selectedTicketId);
  }, [selectedTicketId]);

  useEffect(() => {
    if (!ticket) return;
    setOverrideStatus('resolved');
    setOverridePriority(ticket.priority ?? 'medium');
  }, [ticket]);

  const applyOverride = async () => {
    if (!selectedTicketId) return;

    try {
      await ticketsApi.update(selectedTicketId, {
        status: overrideStatus,
        priority: overridePriority,
        escalation_flag: overrideStatus === 'resolved' ? false : true,
      });

      toast({
        title: 'Override applied',
        description: 'The ticket was updated and the escalation queue is refreshing.',
      });

      setPackageData(null);
      setReplyText('');
      setSelectedTicketId(null);
      void listRefetch();
      void ticketRefetch();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Override failed', description: normalizeError(err) });
    }
  };

  const sendReplyMut = useMutation({
    mutationFn: (content: string) => {
      if (!ticket?.conversation_id) throw new Error('Conversation ID missing for this ticket.');
      return conversationsApi.send(ticket.conversation_id, content);
    },
    onSuccess: () => {
      setReplyText('');
      toast({ title: 'Reply sent' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to send reply', description: normalizeError(err) });
    },
  });

  const suggestions: DecisionSuggestionsResponse | null = suggestionsQuery.data ?? null;
  const suggestionButtons = suggestions?.suggestions ?? [];
  const primaryRecommendedAction = packageData?.recommended_actions[0] ?? null;
  const parsedSummary = useMemo(() => parseEscalationSummary(packageData?.summary), [packageData?.summary]);

  const conversationStats = useMemo(() => {
    const history = packageData?.conversation_history ?? [];
    return {
      total: history.length,
      customer: history.filter((event) => !event.is_internal).length,
      internal: history.filter((event) => event.is_internal).length,
      lastAt: history[history.length - 1]?.created_at ?? ticket?.updated_at ?? null,
    };
  }, [packageData?.conversation_history, ticket?.updated_at]);

  const previousAttempts = packageData?.previous_decisions ?? [];
  const headerSummaryText = useMemo(() => {
    if (primaryRecommendedAction) return primaryRecommendedAction;
    if (parsedSummary?.actionRequired) return parsedSummary.actionRequired;
    if (parsedSummary?.description) return summarizeText(parsedSummary.description, 220);
    return summarizeText(ticket?.description, 220);
  }, [parsedSummary?.actionRequired, parsedSummary?.description, primaryRecommendedAction, ticket?.description]);
  const railSummaryText = useMemo(() => summarizeText(headerSummaryText, 180), [headerSummaryText]);

  const riskWarning = useMemo(() => {
    if (!packageData || !isHighRisk(packageData.risk_level)) return null;

    return (
      <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Immediate review recommended</AlertTitle>
        <AlertDescription>
          Risk is {packageData.risk_level} with {formatPercent(packageData.confidence_score, 0)} confidence. Confirm
          customer impact before closing this case.
        </AlertDescription>
      </Alert>
    );
  }, [packageData]);

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 lg:p-6">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Escalations</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1">
                Escalated queue: {ticketList?.total ?? 0}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full px-3 py-1',
                  urgentTicketsCount > 0 && 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                )}
              >
                Urgent: {urgentTicketsCount}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'rounded-full px-3 py-1',
                  criticalTicketsCount > 0 && 'border-destructive/50 bg-destructive/10 text-destructive',
                )}
              >
                Critical: {criticalTicketsCount}
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {selectedVisibleIndex >= 0
                  ? `Viewing ${selectedVisibleIndex + 1} of ${filteredEscalatedTickets.length}`
                  : `${filteredEscalatedTickets.length} visible`}
              </Badge>
            </div>
          </div>

          <Button size="sm" variant="outline" onClick={() => listRefetch()} disabled={listLoading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', listLoading && 'animate-spin')} />
            Refresh queue
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <div className="xl:sticky xl:top-4">
          {ticket && !ticketLoading && !ticketError ? (
            <div className="hidden rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Case summary</p>
                  <h2 className="mt-1 truncate text-base font-semibold tracking-tight">{ticket.subject}</h2>
                </div>
                <Badge
                  variant={ticket.conversation_id ? 'secondary' : 'outline'}
                  className="rounded-full text-[10px] uppercase tracking-wide"
                >
                  {ticket.conversation_id ? 'Conversation linked' : 'No conversation'}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status ?? 'escalated'} />
                <StatusBadge status={ticket.priority ?? 'medium'} />
                {packageData ? <StatusBadge status={packageData.risk_level} /> : null}
                <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">
                  {humanizeLabel(ticket.channel_source)}
                </Badge>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {ticket.id} · Updated {formatRelativeTime(ticket.updated_at)} · Created {formatRelativeTime(ticket.created_at)}
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">AI confidence</p>
                  <p className="mt-1 text-sm font-semibold">
                    {packageData ? formatPercent(packageData.confidence_score, 0) : '...'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk score</p>
                  <p className="mt-1 text-sm font-semibold">
                    {packageData ? formatPercent(packageData.risk_score, 0) : '...'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Replies</p>
                  <p className="mt-1 text-sm font-semibold">{suggestionButtons.length}</p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">What matters now</p>
                  <span className="text-xs text-muted-foreground">
                    {packageData
                      ? `${conversationStats.total} event${conversationStats.total === 1 ? '' : 's'} · ${humanizeLabel(packageData.intent_category)}`
                      : 'Preparing AI handoff'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium leading-5">
                  {packageLoading || !packageData ? 'Loading AI handoff summary...' : railSummaryText}
                </p>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Escalation queue</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Browse flagged tickets and pick the next case.</p>
                </div>
                <Badge variant="outline" className="rounded-full">
                  Page {page}/{totalPages}
                </Badge>
              </div>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={queueSearch}
                  onChange={(event) => setQueueSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search subject, case ID, priority, channel"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={queueMode === 'all' ? 'default' : 'outline'}
                  onClick={() => setQueueMode('all')}
                >
                  All cases
                  <span className="ml-2 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold">
                    {escalatedTickets.length}
                  </span>
                </Button>
                <Button
                  size="sm"
                  variant={queueMode === 'urgent' ? 'default' : 'outline'}
                  onClick={() => setQueueMode('urgent')}
                >
                  Urgent only
                  <span className="ml-2 rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-semibold">
                    {urgentTicketsCount}
                  </span>
                </Button>
              </div>
            </div>

            {listLoading ? (
              <div className="p-4">
                <TableSkeleton rows={6} cols={1} />
              </div>
            ) : listError ? (
              <div className="p-4">
                <ErrorState message={normalizeError(listError)} onRetry={() => listRefetch()} />
              </div>
            ) : escalatedTickets.length === 0 ? (
              <EmptyState title="No escalated tickets" description="Your escalation queue is clear right now." />
            ) : filteredEscalatedTickets.length === 0 ? (
              <EmptyState title="No matching tickets" description="Try a broader search or switch filters." />
            ) : (
              <ScrollArea className="h-[28rem] xl:h-[calc(100vh-21rem)]">
                <div className="divide-y">
                  {filteredEscalatedTickets.map((ticketItem) => {
                    const selected = selectedTicketId === ticketItem.id;
                    const urgent = isUrgentPriority(ticketItem.priority);

                    return (
                      <button
                        key={ticketItem.id}
                        type="button"
                        onClick={() => setSelectedTicketId(ticketItem.id)}
                        className={cn(
                          'w-full border-l-4 p-4 text-left transition-colors hover:bg-muted/30',
                          selected && 'border-primary bg-primary/5',
                          !selected && urgent && 'border-amber-500/70 bg-amber-500/5',
                          !selected && !urgent && 'border-transparent',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{ticketItem.subject}</p>
                              {urgent ? (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/50 bg-amber-500/10 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300"
                                >
                                  urgent
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {summarizeText(ticketItem.description, 120)}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="text-[11px] font-medium text-muted-foreground">{formatRelativeTime(ticketItem.updated_at)}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{formatCompactDate(ticketItem.updated_at)}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <StatusBadge status={ticketItem.priority} />
                          <StatusBadge status={ticketItem.status} />
                          <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">
                            {humanizeLabel(ticketItem.channel_source)}
                          </Badge>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                          <span className="truncate">{ticketItem.id}</span>
                          <span>{selected ? 'Open' : 'Review case'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            <div className="flex items-center justify-between border-t p-3">
              <span className="text-xs text-muted-foreground">
                {filteredEscalatedTickets.length} visible on this page
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages}
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                >
                  <span className="sr-only">Next page</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {!selectedTicketId ? (
            <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
              <h3 className="text-lg font-semibold">Pick a case to start</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Choose an escalated ticket from the queue to inspect the AI handoff package, conversation trail, and
                recommended next actions.
              </p>
            </div>
          ) : ticketLoading ? (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <TableSkeleton rows={4} cols={2} />
              </div>
              <div className="rounded-2xl border bg-card p-5 shadow-sm">
                <TableSkeleton rows={8} cols={1} />
              </div>
            </div>
          ) : ticketError ? (
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <ErrorState message={normalizeError(ticketError)} onRetry={() => ticketRefetch()} />
            </div>
          ) : (
            <>
              <div className="hidden rounded-2xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-xl font-semibold tracking-tight">{ticket?.subject}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={ticket?.status ?? 'escalated'} />
                      <StatusBadge status={ticket?.priority ?? 'medium'} />
                      {packageData ? <StatusBadge status={packageData.risk_level} /> : null}
                      <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">
                        {humanizeLabel(ticket?.channel_source)}
                      </Badge>
                      <Badge variant={ticket?.conversation_id ? 'secondary' : 'outline'} className="rounded-full text-[10px] uppercase tracking-wide">
                        {ticket?.conversation_id ? 'Conversation linked' : 'No conversation'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {ticket?.id} · Updated {formatRelativeTime(ticket?.updated_at)} · Created {formatRelativeTime(ticket?.created_at)}
                    </p>
                  </div>

                  <div className="grid min-w-[280px] gap-2 sm:grid-cols-3">
                    <div className="rounded-lg border bg-muted/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">AI confidence</p>
                      <p className="mt-1 text-base font-semibold">
                        {packageData ? formatPercent(packageData.confidence_score, 0) : '...'}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk score</p>
                      <p className="mt-1 text-base font-semibold">
                        {packageData ? formatPercent(packageData.risk_score, 0) : '...'}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Replies</p>
                      <p className="mt-1 text-base font-semibold">{suggestionButtons.length}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border bg-muted/20 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">What matters now</p>
                    {packageData ? (
                      <span className="text-xs text-muted-foreground">
                        {conversationStats.total} event{conversationStats.total === 1 ? '' : 's'} · {packageData.intent_category}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-6">{headerSummaryText}</p>
                </div>
              </div>

              {packageLoading || !packageData ? (
                <div className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p className="text-sm font-medium">AI is preparing the escalation dossier…</p>
                  </div>
                  <div className="mt-4">
                    <TableSkeleton rows={8} cols={1} />
                  </div>
                </div>
              ) : (
                <Tabs key={selectedTicketId} defaultValue="overview" className="space-y-4">
                  <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-xl bg-muted/60 p-1">
                    <TabsTrigger value="overview" className="rounded-lg px-4 py-2">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="timeline" className="rounded-lg px-4 py-2">
                      Timeline
                    </TabsTrigger>
                    <TabsTrigger value="decisions" className="rounded-lg px-4 py-2">
                      Decision trail
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-5">
                    {riskWarning}

                    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.15fr),minmax(0,0.85fr)]">
                      <div className="space-y-5">
                        <div className="rounded-2xl border bg-card p-4 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Brain className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">AI handoff summary</h3>
                          </div>

                          {parsedSummary ? (
                            <ScrollArea className="mt-4 h-[22rem] pr-4 xl:h-[24rem]">
                              <div className="space-y-3">
                                <div className="rounded-xl border bg-muted/20 p-3">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                        Ticket snapshot
                                      </p>
                                      <p className="mt-1.5 text-sm font-medium leading-6">
                                        {parsedSummary.ticket ?? packageData.ticket_subject ?? ticket?.subject ?? '-'}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {parsedSummary.status ? (
                                        <StatusBadge status={badgeToken(parsedSummary.status)} />
                                      ) : null}
                                      {parsedSummary.priority ? (
                                        <StatusBadge status={badgeToken(parsedSummary.priority)} />
                                      ) : null}
                                      {parsedSummary.channel ? (
                                        <Badge
                                          variant="outline"
                                          className="rounded-full text-[10px] uppercase tracking-wide"
                                        >
                                          {parsedSummary.channel}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-3">
                                  <MetricTile
                                    label="Intent"
                                    value={parsedSummary.intentCategory ?? humanizeLabel(packageData.intent_category)}
                                    className="p-2.5"
                                    valueClassName="text-sm"
                                  />
                                  <MetricTile
                                    label="Confidence"
                                    value={parsedSummary.confidenceScore ?? formatPercent(packageData.confidence_score, 1)}
                                    className="p-2.5"
                                    valueClassName="text-sm"
                                  />
                                  <MetricTile
                                    label="Risk score"
                                    value={parsedSummary.riskScore ?? formatPercent(packageData.risk_score, 1)}
                                    className="p-2.5"
                                    valueClassName="text-sm"
                                  />
                                </div>

                                {parsedSummary.riskFactors.length > 0 ? (
                                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                      Risk factors
                                    </p>
                                    <ul className="mt-2 space-y-2">
                                      {parsedSummary.riskFactors.map((factor, index) => (
                                        <li key={`${factor}-${index}`} className="flex items-start gap-2 text-sm leading-6">
                                          <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                                          <span>{factor}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}

                                <div className="rounded-xl border bg-background/60 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Description</p>
                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                    {parsedSummary.description ?? packageData.ticket_description ?? 'No ticket description available.'}
                                  </p>
                                </div>

                                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Action required</p>
                                  <p className="mt-2 text-sm font-medium leading-6">
                                    {parsedSummary.actionRequired ?? 'This case requires human review and decision.'}
                                  </p>
                                </div>
                              </div>
                            </ScrollArea>
                          ) : (
                            <ScrollArea className="mt-4 h-[22rem] pr-4 xl:h-[24rem]">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                                {packageData.summary}
                              </p>
                            </ScrollArea>
                          )}
                        </div>
                      </div>

                      <div className="space-y-5">
                        <div className="rounded-2xl border bg-card p-5 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold">Recommended next steps</h3>
                          </div>

                          {primaryRecommendedAction ? (
                            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Primary action</p>
                              <p className="mt-2 text-sm font-medium leading-6">{primaryRecommendedAction}</p>
                            </div>
                          ) : null}

                          {packageData.recommended_actions.length === 0 ? (
                            <p className="mt-4 text-sm text-muted-foreground">No recommendations were provided for this case.</p>
                          ) : (
                            <ul className="mt-4 space-y-3">
                              {packageData.recommended_actions.map((action, index) => (
                                <li key={`${action}-${index}`} className="flex items-start gap-3 rounded-xl border bg-muted/10 p-3">
                                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                                  <span className="text-sm leading-6">{action}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="timeline">
                    <div className="rounded-2xl border bg-card p-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold">Conversation timeline</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Review the customer exchange and internal notes in chronological order.
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {packageData.conversation_history.length} events
                        </Badge>
                      </div>

                      {packageData.conversation_history.length === 0 ? (
                        <div className="mt-4">
                          <EmptyState
                            title="No conversation history"
                            description="No messages were captured for this escalated ticket."
                          />
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4">
                          {packageData.conversation_history.map((message, idx) => (
                            <div key={`${message.created_at}-${idx}`} className="relative pl-6">
                              <span
                                className={cn(
                                  'absolute left-0 top-6 h-3 w-3 rounded-full border-2 border-background',
                                  message.is_internal ? 'bg-sky-500' : 'bg-primary',
                                )}
                              />
                              {idx < packageData.conversation_history.length - 1 ? (
                                <span className="absolute left-[5px] top-9 h-[calc(100%-1rem)] w-px bg-border" />
                              ) : null}

                              <div
                                className={cn(
                                  'rounded-2xl border p-4',
                                  message.is_internal ? 'border-sky-300/50 bg-sky-500/5' : 'border-border bg-card',
                                )}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={message.is_internal ? 'secondary' : 'outline'} className="rounded-full">
                                      {message.is_internal ? 'Internal note' : 'Customer message'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{message.sender_id}</span>
                                  </div>
                                  <span className="text-xs text-muted-foreground">{formatDateTime(message.created_at)}</span>
                                </div>
                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="decisions">
                    <div className="rounded-2xl border bg-card p-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold">Decision trail</h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            See previous AI outcomes and why the case reached human review.
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {previousAttempts.length} attempts
                        </Badge>
                      </div>

                      {previousAttempts.length === 0 ? (
                        <div className="mt-4">
                          <EmptyState
                            title="No previous decisions"
                            description="This case has no logged decision attempts yet."
                          />
                        </div>
                      ) : (
                        <div className="mt-5 space-y-4">
                          {previousAttempts.map((decision, index) => {
                            const riskLevel = normalizeRiskLevel(decision.risk_level);

                            return (
                              <div
                                key={decision.id ?? index}
                                className={cn('rounded-2xl border bg-background p-4', decisionBorderClass(riskLevel))}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge status={riskLevel} />
                                  <Badge variant="outline" className="rounded-full">
                                    Outcome: {humanizeLabel(decision.decision_outcome)}
                                  </Badge>
                                  {decision.confidence_score !== undefined ? (
                                    <Badge variant="outline" className="rounded-full">
                                      Confidence {formatPercent(decision.confidence_score, 0)}
                                    </Badge>
                                  ) : null}
                                  {decision.created_at ? (
                                    <span className="text-xs text-muted-foreground">{formatDateTime(decision.created_at)}</span>
                                  ) : null}
                                </div>

                                <Separator className="my-4" />

                                <p className="text-sm leading-6 text-muted-foreground">{decision.reasoning ?? '-'}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          {ticket && !ticketLoading && !ticketError ? (
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Case summary</p>
                  <h2 className="mt-1 truncate text-base font-semibold tracking-tight">{ticket.subject}</h2>
                </div>
                <Badge
                  variant={ticket.conversation_id ? 'secondary' : 'outline'}
                  className="rounded-full text-[10px] uppercase tracking-wide"
                >
                  {ticket.conversation_id ? 'Conversation linked' : 'No conversation'}
                </Badge>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={ticket.status ?? 'escalated'} />
                <StatusBadge status={ticket.priority ?? 'medium'} />
                {packageData ? <StatusBadge status={packageData.risk_level} /> : null}
                <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wide">
                  {humanizeLabel(ticket.channel_source)}
                </Badge>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                {ticket.id} · Updated {formatRelativeTime(ticket.updated_at)} · Created {formatRelativeTime(ticket.created_at)}
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">AI confidence</p>
                  <p className="mt-1 text-sm font-semibold">
                    {packageData ? formatPercent(packageData.confidence_score, 0) : '...'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Risk score</p>
                  <p className="mt-1 text-sm font-semibold">
                    {packageData ? formatPercent(packageData.risk_score, 0) : '...'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Replies</p>
                  <p className="mt-1 text-sm font-semibold">{suggestionButtons.length}</p>
                </div>
              </div>

              <div className="mt-3 rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">What matters now</p>
                  <span className="text-xs text-muted-foreground">
                    {packageData
                      ? `${conversationStats.total} event${conversationStats.total === 1 ? '' : 's'} · ${humanizeLabel(packageData.intent_category)}`
                      : 'Preparing AI handoff'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium leading-5">
                  {packageLoading || !packageData ? 'Loading AI handoff summary...' : railSummaryText}
                </p>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="border-b p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Operator actions</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Resolve the case, adjust priority, or send a response from one place.
                  </p>
                </div>
                {ticket ? (
                  <Badge variant={ticket.conversation_id ? 'secondary' : 'outline'} className="rounded-full green-500/50 bg-green-500/10 text-[10px] uppercase tracking-wide">
                    {ticket.conversation_id ? 'Reply enabled' : 'Reply unavailable'}
                  </Badge>
                ) : null}
              </div>
            </div>

            <ScrollArea className="h-[24rem] xl:h-[calc(100vh-26rem)]">
              <div className="space-y-5 p-4">
                {!selectedTicketId ? (
                  <EmptyState title="No ticket selected" description="Choose a case from the queue to unlock actions." />
                ) : packageLoading || !packageData ? (
                  <TableSkeleton rows={5} cols={1} />
                ) : (
                  <>
                    <div className={cn('rounded-2xl border p-4', riskSurfaceClass(packageData.risk_level))}>
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4" />
                        <p className="text-sm font-semibold">Escalation spotlight</p>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">Risk level</span>
                            <span className={cn('font-semibold uppercase tracking-wide', riskTextClass(packageData.risk_level))}>
                              {humanizeLabel(packageData.risk_level)}
                            </span>
                          </div>
                          <Progress className="h-2" value={packageData.risk_score * 100} />
                        </div>

                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                            <span className="text-muted-foreground">AI confidence</span>
                            <span className="font-semibold">{formatPercent(packageData.confidence_score, 0)}</span>
                          </div>
                          <Progress className="h-2" value={packageData.confidence_score * 100} />
                        </div>

                        {primaryRecommendedAction ? (
                          <div className="rounded-xl border bg-background/70 p-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Best next move</p>
                            <p className="mt-2 text-sm font-medium leading-6">{primaryRecommendedAction}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Customer response</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Start from an AI suggestion, edit it, then send it through the linked conversation.
                          </p>
                        </div>
                        <Badge variant={ticket?.conversation_id ? 'secondary' : 'outline'} className="rounded-full">
                          {ticket?.conversation_id ? 'Linked conversation' : 'No conversation'}
                        </Badge>
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Suggested replies</p>
                        {suggestionsQuery.isLoading ? (
                          <TableSkeleton rows={3} cols={1} />
                        ) : suggestionsQuery.error ? (
                          <p className="text-sm text-destructive">{normalizeError(suggestionsQuery.error)}</p>
                        ) : suggestionButtons.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No suggestions available yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {suggestionButtons.slice(0, 4).map((suggestion, index) => (
                              <Button
                                key={`${suggestion}-${index}`}
                                type="button"
                                variant="outline"
                                className="h-auto w-full justify-start whitespace-normal rounded-xl px-3 py-2 text-left"
                                onClick={() => setReplyText(suggestion)}
                              >
                                {suggestion}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-4">
                        <Label className="text-xs">Reply draft</Label>
                        <Textarea
                          value={replyText}
                          onChange={(event) => setReplyText(event.target.value)}
                          placeholder={
                            ticket?.conversation_id
                              ? 'Write your message to the customer...'
                              : 'Reply is disabled because this ticket does not have a linked conversation.'
                          }
                          rows={5}
                          disabled={!ticket?.conversation_id}
                          aria-label="Reply text"
                          className="mt-1"
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {ticket?.conversation_id
                            ? `${replyText.trim().length} characters. Sending will notify the customer.`
                            : 'No conversation ID found for this ticket.'}
                        </p>
                        <Button
                          disabled={!ticket?.conversation_id || !replyText.trim() || sendReplyMut.isPending}
                          onClick={() => sendReplyMut.mutate(replyText)}
                        >
                          {sendReplyMut.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <SendHorizontal className="mr-2 h-4 w-4" />
                          )}
                          Send reply
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Manual override</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Adjust the ticket outcome after your review when the AI recommendation is not the right fit.
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          Current: {humanizeLabel(ticket?.status)}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3">
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Current state</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusBadge status={ticket?.status ?? 'escalated'} />
                            <StatusBadge status={ticket?.priority ?? 'medium'} />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Next status</Label>
                          <Select value={overrideStatus} onValueChange={(value) => setOverrideStatus(value as TicketStatus)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['open', 'in_progress', 'resolved', 'closed'] as TicketStatus[]).map((statusValue) => (
                                <SelectItem key={statusValue} value={statusValue}>
                                  {humanizeLabel(statusValue)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-xs">Priority</Label>
                          <Select
                            value={overridePriority}
                            onValueChange={(value) => setOverridePriority(value as TicketPriority)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['low', 'medium', 'high', 'critical'] as TicketPriority[]).map((priorityValue) => (
                                <SelectItem key={priorityValue} value={priorityValue}>
                                  {humanizeLabel(priorityValue)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <Button className="flex-1" onClick={applyOverride}>
                          Apply override
                        </Button>
                        <Button
                          variant="outline"
                          disabled={packageLoading}
                          onClick={() => {
                            if (!selectedTicketId) return;
                            setPackageLoading(true);
                            packageMut.mutate(selectedTicketId);
                          }}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Re-run AI
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
