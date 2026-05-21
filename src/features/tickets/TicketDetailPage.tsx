import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Brain, Loader2, Save, Trash2, Hash, Calendar, Radio, Mail, Zap, ChevronDown, TrendingUp, CheckCircle2, AlertTriangle, XCircle, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { decisionsApi } from '@/shared/api/decisions';
import { ticketsApi } from '@/shared/api/tickets';
import { ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { PageSkeleton } from '@/shared/components/Skeletons';
import { ClientTicketAiHelpers } from '@/features/tickets/ClientTicketAiHelpers';
import type { Ticket, TicketPriority, TicketStatus } from '@/shared/types';
import { buildMailLikeDisplay, sanitizeTrackingUrl } from '@/shared/utils/mailLikeContent';

const STATUS_OPTIONS: TicketStatus[] = ['open', 'in_progress', 'escalated', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'medium', 'high', 'critical'];
const RESOLUTION_REQUIRED_STATUSES: TicketStatus[] = ['resolved', 'closed'];
const URL_REGEX = /(https?:\/\/[^\s<>")\]]+)/g;

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-sky-100 text-sky-700 ring-sky-200',
  in_progress: 'bg-violet-100 text-violet-700 ring-violet-200',
  escalated: 'bg-orange-100 text-orange-700 ring-orange-200',
  resolved: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  closed: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
  medium: 'bg-amber-100 text-amber-700 ring-amber-200',
  high: 'bg-orange-100 text-orange-700 ring-orange-200',
  critical: 'bg-red-100 text-red-700 ring-red-200',
};

function Pill({ value, colorMap }: { value: string; colorMap: Record<string, string> }) {
  const cls = colorMap[value] ?? 'bg-zinc-100 text-zinc-600 ring-zinc-200';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

function MetaRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-100 last:border-0">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-50 text-zinc-400">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-zinc-700">{value || '—'}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="border-b border-zinc-100 px-5 py-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{title}</h3>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

type AnalysisResult = { outcome: string; confidence: number; reasoning?: string; recommendation?: string };

const OUTCOME_CONFIG: Record<string, { icon: React.ElementType; bg: string; border: string; text: string; badge: string }> = {
  escalate:         { icon: AlertTriangle, bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700 ring-orange-200' },
  resolve:          { icon: CheckCircle2, bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  close:            { icon: XCircle,      bg: 'bg-zinc-50',    border: 'border-zinc-200',   text: 'text-zinc-700',   badge: 'bg-zinc-100 text-zinc-600 ring-zinc-200' },
  investigate:      { icon: TrendingUp,   bg: 'bg-violet-50',  border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-700 ring-violet-200' },
  suggest_response: { icon: Sparkles,     bg: 'bg-sky-50',     border: 'border-sky-200',    text: 'text-sky-700',    badge: 'bg-sky-100 text-sky-700 ring-sky-200' },
};

function AnalysisCard({ result, onDismiss }: { result: AnalysisResult; onDismiss: () => void }) {
  const { t } = useTranslation();
  const key = result.outcome.toLowerCase().replace(/\s+/g, '_');
  const cfg = OUTCOME_CONFIG[key] ?? OUTCOME_CONFIG['investigate'];
  const Icon = cfg.icon;
  const pct = Math.round(result.confidence * 100);
  const confidenceColor = pct >= 75 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500';
  const barColor = pct >= 75 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className={`rounded-2xl border ${cfg.border} bg-white shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300`}>
      {/* Header strip */}
      <div className={`flex items-center justify-between px-5 py-3 ${cfg.bg} border-b ${cfg.border}`}>
        <div className="flex items-center gap-2">
          <Brain className={`h-3.5 w-3.5 ${cfg.text}`} />
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">{t('ticketDetail.aiAnalysis')}</span>
        </div>
        <button
          onClick={onDismiss}
          className="rounded-md p-0.5 text-zinc-400 hover:text-zinc-600 transition-colors"
          aria-label={t('ticketDetail.dismiss')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Outcome + confidence row */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1.5">{t('ticketDetail.outcome')}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${cfg.badge}`}>
              <Icon className="h-3 w-3" />
              {result.outcome.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">{t('ticketDetail.confidence')}</p>
            <p className={`text-2xl font-bold tabular-nums leading-none ${confidenceColor}`}>{pct}<span className="text-sm font-medium">%</span></p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Reasoning */}
        {result.reasoning && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{t('ticketDetail.reasoning')}</p>
            <p className="text-sm leading-relaxed text-zinc-600">{result.reasoning}</p>
          </div>
        )}

        {/* Recommendation */}
        {result.recommendation && (
          <div className={`flex items-start gap-2.5 rounded-xl border ${cfg.border} ${cfg.bg} p-3`}>
            <Sparkles className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cfg.text}`} />
            <p className="text-sm leading-relaxed text-zinc-600">{result.recommendation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function linkifyTextLine(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let urlIndex = 0;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(line)) !== null) {
    const rawUrl = match[0];
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(line.slice(lastIndex, start));
    }

    const url = sanitizeTrackingUrl(rawUrl);
    nodes.push(
      <a
        key={`${keyPrefix}-url-${urlIndex}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="font-medium text-violet-600 underline underline-offset-2 break-all hover:text-violet-800 transition-colors"
      >
        {url}
      </a>,
    );

    lastIndex = start + rawUrl.length;
    urlIndex += 1;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes.length ? nodes : [line];
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: ticket, isLoading, error, refetch } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />;
  if (!ticket || !id) return null;

  if (user?.role === 'client') {
    return <ClientTicketDetailView id={id} ticket={ticket} />;
  }

  return <OperatorTicketDetailView id={id} ticket={ticket} />;
}

/* ─────────────────────────────────────────── Operator View ── */

function OperatorTicketDetailView({ id, ticket }: { id: string; ticket: Ticket }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const descriptionDisplay = useMemo(() => buildMailLikeDisplay(ticket.description), [ticket.description]);

  const refreshTicketData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['tickets-command-center'] }),
      queryClient.invalidateQueries({ queryKey: ['tickets-command-center-totals'] }),
    ]);
  };

  const updatePriorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) => ticketsApi.update(id, { priority }),
    onSuccess: async () => {
      await refreshTicketData();
      toast({ title: t('ticketDetail.priorityUpdated') });
    },
    onError: (e) => toast({ variant: 'destructive', title: t('ticketDetail.priorityUpdateFailed'), description: normalizeError(e) }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ status, resolutionNote }: { status: TicketStatus; resolutionNote?: string }) =>
      ticketsApi.updateStatus(id, { status, resolution_note: resolutionNote }),
    onSuccess: async (updatedTicket) => {
      await refreshTicketData();
      toast({
        title: t('ticketDetail.statusUpdated'),
        description: `${updatedTicket.subject} → ${updatedTicket.status.replace(/_/g, ' ')}`,
      });
    },
    onError: (e) => toast({ variant: 'destructive', title: t('ticketDetail.statusUpdateFailed'), description: normalizeError(e) }),
  });

  const handleStatusChange = (status: TicketStatus) => {
    let resolutionNote: string | undefined;
    if (RESOLUTION_REQUIRED_STATUSES.includes(status)) {
      const input = window.prompt(t('ticketDetail.resolutionNote'), '')?.trim();
      if (!input) return;
      if (input.length < 5) {
        toast({ variant: 'destructive', title: t('ticketDetail.noteTooShort'), description: t('ticketDetail.minCharsRequired') });
        return;
      }
      resolutionNote = input;
    }
    updateStatusMutation.mutate({ status, resolutionNote });
  };

  const analyzeMutation = useMutation({
    mutationFn: () => decisionsApi.analyzeTicket(id),
    onSuccess: (result) => setAnalysisResult(result),
    onError: (e) => toast({ variant: 'destructive', title: t('ticketDetail.analysisFailed'), description: normalizeError(e) }),
  });

  const isBusy = updateStatusMutation.isPending || updatePriorityMutation.isPending;

  return (
    <div className="min-h-screen bg-zinc-50/60">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* Back */}
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('ticketDetail.allTickets')}
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{ticket.subject}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Pill value={ticket.status} colorMap={STATUS_COLORS} />
              <Pill value={ticket.priority} colorMap={PRIORITY_COLORS} />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="shrink-0 gap-1.5 rounded-xl border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Brain className="h-3.5 w-3.5" />
            )}
            {t('ticketDetail.analyze')}
          </Button>
        </div>

        {/* Body grid */}
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          {/* Left column: analysis + description */}
          <div className="space-y-5">
            {/* Analysis result card — appears above description after clicking Analyze */}
            {analyzeMutation.isPending && (
              <div className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                <p className="text-sm font-medium text-violet-600">{t('ticketDetail.runningAnalysis')}</p>
              </div>
            )}
            {analysisResult && !analyzeMutation.isPending && (
              <AnalysisCard result={analysisResult} onDismiss={() => setAnalysisResult(null)} />
            )}

            <SectionCard title={t('ticketDetail.description')}>
              {descriptionDisplay.actionLinks.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {descriptionDisplay.actionLinks.map((action) => (
                    <a
                      key={`${ticket.id}-${action.label}-${action.url}`}
                      href={action.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      <Zap className="h-3 w-3" />
                      {action.label}
                    </a>
                  ))}
                </div>
              )}
              <div className="space-y-1.5 text-sm leading-relaxed text-zinc-600">
                {descriptionDisplay.textLines.length ? (
                  descriptionDisplay.textLines.map((line, i) =>
                    line ? (
                      <p key={i} className="whitespace-pre-wrap break-words">
                        {linkifyTextLine(line, `${ticket.id}-${i}`)}
                      </p>
                    ) : (
                      <div key={i} className="h-2" />
                    ),
                  )
                ) : (
                  <p className="text-zinc-400 italic">{t('ticketDetail.noDescription')}</p>
                )}
              </div>
            </SectionCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <SectionCard title={t('ticketDetail.ticketInfo')}>
              <MetaRow icon={Hash} label={t('ticketDetail.id')} value={ticket.id} />
              <MetaRow icon={Radio} label={t('ticketDetail.channel')} value={ticket.channel_source} />
              <MetaRow icon={Mail} label={t('ticketDetail.sourceEmail')} value={ticket.source_email_id} />
              <MetaRow icon={Calendar} label={t('ticketDetail.created')} value={new Date(ticket.created_at).toLocaleString()} />
            </SectionCard>

            <SectionCard title={t('ticketDetail.actions')}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500">{t('ticketDetail.status')}</label>
                  <Select
                    value={ticket.status}
                    onValueChange={(v) => handleStatusChange(v as TicketStatus)}
                    disabled={isBusy}
                  >
                    <SelectTrigger className="rounded-xl border-zinc-200 bg-zinc-50 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>{v.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500">{t('ticketDetail.priority')}</label>
                  <Select
                    value={ticket.priority}
                    onValueChange={(v) => updatePriorityMutation.mutate(v as TicketPriority)}
                    disabled={isBusy}
                  >
                    <SelectTrigger className="rounded-xl border-zinc-200 bg-zinc-50 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── Client View ── */

function ClientTicketDetailView({ id, ticket }: { id: string; ticket: Ticket }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const descriptionDisplay = useMemo(() => buildMailLikeDisplay(description), [description]);

  const clientStatusOptions = useMemo(() => {
    if (ticket.status === 'closed') return ['closed'] as TicketStatus[];
    return [ticket.status, 'closed'] as TicketStatus[];
  }, [ticket.status]);

  useEffect(() => {
    setSubject(ticket.subject);
    setDescription(ticket.description);
    setStatus(ticket.status);
    setPriority(ticket.priority);
  }, [ticket]);

  const updateMutation = useMutation({
    mutationFn: () =>
      ticketsApi.update(id, {
        subject: subject.trim(),
        description: description.trim(),
        status,
        priority,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      ]);
      toast({ title: t('ticketDetail.changesSaved'), description: t('ticketDetail.ticketUpdated') });
    },
    onError: (e) => toast({ variant: 'destructive', title: t('ticketDetail.updateFailed'), description: normalizeError(e) }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => ticketsApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: t('ticketDetail.ticketDeleted') });
      navigate('/tickets');
    },
    onError: (e) => toast({ variant: 'destructive', title: t('ticketDetail.deleteFailed'), description: normalizeError(e) }),
  });

  const handleDelete = () => {
    if (deleteMutation.isPending) return;
    if (!window.confirm(t('ticketDetail.deleteConfirm'))) return;
    deleteMutation.mutate();
  };

  const handleSave = () => {
    if (!subject.trim() || !description.trim() || updateMutation.isPending) return;
    updateMutation.mutate();
  };

  const hasChanges =
    subject !== ticket.subject ||
    description !== ticket.description ||
    status !== ticket.status ||
    priority !== ticket.priority;

  return (
    <div className="min-h-screen bg-zinc-50/60">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* Back */}
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('ticketDetail.allTickets')}
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{t('ticketDetail.editTicket')}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t('ticketDetail.editDesc')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill value={status} colorMap={STATUS_COLORS} />
            <Pill value={priority} colorMap={PRIORITY_COLORS} />
          </div>
        </div>

        {/* Body grid */}
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          {/* Main form */}
          <div className="space-y-5">
            <SectionCard title={t('ticketDetail.subject')}>
              <Input
                id="ticket-detail-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t('ticketDetail.subjectPlaceholder')}
                className="rounded-xl border-zinc-200 bg-zinc-50 text-base font-medium placeholder:font-normal focus-visible:ring-violet-500"
              />
            </SectionCard>

            <SectionCard title={t('ticketDetail.description')}>
              <Textarea
                id="ticket-detail-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('ticketDetail.descriptionPlaceholder')}
                className="min-h-56 rounded-xl border-zinc-200 bg-zinc-50 text-sm leading-relaxed resize-y focus-visible:ring-violet-500"
              />

              {descriptionDisplay.actionLinks.length > 0 && (
                <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-500">
                    {t('ticketDetail.detectedLinks')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {descriptionDisplay.actionLinks.map((action) => (
                      <a
                        key={`${ticket.id}-${action.label}-${action.url}`}
                        href={action.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                      >
                        <Zap className="h-3 w-3" />
                        {action.label}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <SectionCard title={t('ticketDetail.properties')}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500">{t('ticketDetail.status')}</label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
                    <SelectTrigger className="rounded-xl border-zinc-200 bg-zinc-50 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {clientStatusOptions.map((v) => (
                        <SelectItem key={v} value={v}>{v.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500">{t('ticketDetail.priority')}</label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                    <SelectTrigger className="rounded-xl border-zinc-200 bg-zinc-50 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionCard>

            <ClientTicketAiHelpers
              title={subject}
              description={description}
              onApplyReformulation={setDescription}
            />

            <SectionCard title={t('ticketDetail.metadata')}>
              <MetaRow icon={Hash} label={t('ticketDetail.id')} value={ticket.id} />
              <MetaRow icon={Radio} label={t('ticketDetail.channel')} value={ticket.channel_source} />
              <MetaRow icon={Calendar} label={t('ticketDetail.created')} value={new Date(ticket.created_at).toLocaleString()} />
              <MetaRow icon={Calendar} label={t('ticketDetail.lastUpdated')} value={new Date(ticket.updated_at).toLocaleString()} />
            </SectionCard>

            {/* Actions */}
            <div className="space-y-2.5">
              <Button
                onClick={handleSave}
                disabled={!subject.trim() || !description.trim() || updateMutation.isPending || !hasChanges}
                className="w-full rounded-xl bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                {updateMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {t('ticketDetail.saving')}</>
                ) : (
                  <><Save className="h-4 w-4" /> {t('ticketDetail.saveChanges')}</>
                )}
              </Button>

              <Button
                variant="ghost"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="w-full rounded-xl border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 transition-colors"
              >
                {deleteMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {t('ticketDetail.deleting')}</>
                ) : (
                  <><Trash2 className="h-4 w-4" /> {t('ticketDetail.deleteTicket')}</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
