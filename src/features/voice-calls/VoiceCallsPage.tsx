import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { voiceCallsApi } from '@/shared/api/voiceCalls';
import { ticketsApi } from '@/shared/api/tickets';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { normalizeError } from '@/shared/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Phone,
  Clock,
  FileText,
  ChevronLeft,
  Loader2,
  Link2,
  TicketPlus,
  Mic,
  MicOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  User,
  Flag,
} from 'lucide-react';
import type {
  VoiceCallLog,
  VoiceCallPostCallSummary,
  VoiceCallTicketLinkResponse,
} from '@/shared/types';

function formatDuration(secs?: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Shared section card ───────────────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  description,
  action,
  children,
}: {
  title: string;
  icon?: React.ElementType;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border/40 bg-muted/20">
        <div className="flex items-start gap-2.5">
          {Icon && (
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-semibold leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Priority badge ────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  const cls = map[priority?.toLowerCase()] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {priority}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST VIEW
// ─────────────────────────────────────────────────────────────────────────────

export function VoiceCallsPage() {
  const { t } = useTranslation();
  const [selectedCall, setSelectedCall] = useState<VoiceCallLog | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['voice-calls'],
    queryFn: () => voiceCallsApi.list(0, 100),
  });

  const calls = data?.items ?? [];

  if (selectedCall) {
    return <CallDetailView call={selectedCall} onBack={() => setSelectedCall(null)} />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t('voiceAgents.voiceCalls')}</h1>
            <p className="text-xs text-muted-foreground">{t('voiceAgents.voiceCallsSubtitle')}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {t('whatsapp.refreshLabel')}
        </Button>
      </div>

      {/* List card */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-muted/20">
          <p className="text-sm font-semibold">
            Call History
            {data ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">({data.total})</span> : null}
          </p>
        </div>

        {isLoading ? (
          <div className="p-5"><TableSkeleton rows={6} cols={4} /></div>
        ) : error ? (
          <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Phone className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('voiceAgents.noVoiceCalls')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('voiceAgents.noVoiceCallsDescription')}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-2 border-b border-border/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Room</span>
              <span>{t('voiceAgents.duration')}</span>
              <span>Date</span>
              <span>Transcript</span>
              <span>Recording</span>
            </div>

            <ul className="divide-y divide-border/40">
              {calls.map((call) => (
                <li key={call.id}>
                  <button
                    onClick={() => setSelectedCall(call)}
                    className="group w-full text-left sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-3.5 hover:bg-muted/30 transition-colors items-center"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary/70 group-hover:bg-primary/15 transition-colors">
                        <Phone className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm font-medium truncate">{call.room_name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {formatDuration(call.duration_seconds)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="hidden sm:block">{new Date(call.started_at).toLocaleDateString()}</span>
                      <span className="text-[11px] text-muted-foreground/60 sm:block hidden">{timeAgo(call.started_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      {call.transcript ? `${call.transcript.length} chars` : <span className="italic text-xs">None</span>}
                    </div>
                    <div>
                      {call.audio_file_path ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <Mic className="h-3 w-3" />Recorded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted border border-border/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          <MicOff className="h-3 w-3" />None
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL VIEW
// ─────────────────────────────────────────────────────────────────────────────

function CallDetailView({ call, onBack }: { call: VoiceCallLog; onBack: () => void }) {
  const { t } = useTranslation();
  const { data: detail } = useQuery({
    queryKey: ['voice-call-detail', call.id],
    queryFn: () => voiceCallsApi.get(call.id),
    initialData: call,
  });

  const c = detail ?? call;
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioLoadError, setAudioLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<VoiceCallPostCallSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [existingTicketId, setExistingTicketId] = useState('');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [linkResult, setLinkResult] = useState<VoiceCallTicketLinkResponse | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const summaryMut = useMutation({
    mutationFn: () => voiceCallsApi.postCallSummary(c.id),
    onSuccess: (result) => {
      setSummary(result);
      setSummaryError(null);
      if (!ticketSubject.trim()) setTicketSubject(result.ticket_subject_suggestion || '');
      if (!ticketDescription.trim()) setTicketDescription(result.ticket_description_suggestion || '');
    },
    onError: (error) => setSummaryError(normalizeError(error)),
  });

  const linkMut = useMutation({
    mutationFn: (payload: { ticket_id?: string; subject?: string; description?: string }) =>
      voiceCallsApi.linkTicket(c.id, payload),
    onSuccess: (result) => { setLinkResult(result); setLinkError(null); },
    onError: (error) => setLinkError(normalizeError(error)),
  });

  const escalateMut = useMutation({
    mutationFn: async (payload?: { ticket_id?: string }) => {
      // If a ticket id is provided, use it. Otherwise create/link a ticket first.
      let ticketId = payload?.ticket_id ?? existingTicketId?.trim() ?? null;

      if (!ticketId) {
        // try to create/link using current subject/description or summary suggestions
        const subject = ticketSubject.trim() || summary?.ticket_subject_suggestion || '';
        const description = ticketDescription.trim() || summary?.ticket_description_suggestion || '';
        if (!subject && !description) {
          throw new Error('Provide a ticket subject/description or link an existing ticket before escalating.');
        }
        const res = await voiceCallsApi.linkTicket(c.id, { subject, description });
        ticketId = res.ticket_id;
      }

      // Mark the ticket as escalated
      const updated = await ticketsApi.updateStatus(ticketId, { status: 'escalated' });
      return { ticketId, updated };
    },
    onSuccess: (res) => {
      setLinkResult((prev) => ({ ...(prev ?? {}), ticket_id: String(res.ticketId) } as any));
      setLinkError(null);
    },
    onError: (error) => setLinkError(normalizeError(error)),
  });

  const handleCreateLinkedTicket = () => {
    setLinkResult(null);
    const subject = ticketSubject.trim() || summary?.ticket_subject_suggestion || '';
    const description = ticketDescription.trim() || summary?.ticket_description_suggestion || '';
    if (!subject || !description) {
      setLinkError('Generate a summary first or provide a subject and description.');
      return;
    }
    setLinkError(null);
    linkMut.mutate({ subject, description });
  };

  const handleAttachExistingTicket = () => {
    setLinkResult(null);
    const ticketId = existingTicketId.trim();
    if (!ticketId) { setLinkError('Provide an existing ticket ID to link this call.'); return; }
    setLinkError(null);
    linkMut.mutate({ ticket_id: ticketId });
  };

  useEffect(() => {
    let isDisposed = false;
    let objectUrl: string | null = null;
    const loadAudio = async () => {
      if (!c.audio_file_path) { setAudioSrc(null); setAudioLoadError(null); return; }
      setAudioSrc(null); setAudioLoadError(null);
      try {
        const blob = await voiceCallsApi.audio(c.id);
        objectUrl = URL.createObjectURL(blob);
        if (!isDisposed) setAudioSrc(objectUrl);
      } catch (error) {
        if (!isDisposed) setAudioLoadError(normalizeError(error));
      }
    };
    void loadAudio();
    return () => { isDisposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [c.audio_file_path, c.id]);

  useEffect(() => {
    setSummary(null); setSummaryError(null); setLinkResult(null); setLinkError(null);
    setExistingTicketId(''); setTicketSubject(''); setTicketDescription('');
  }, [c.id]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      {/* Back + heading */}
      <Button variant="ghost" size="sm" className="gap-1.5 text-xs -ml-2" onClick={onBack}>
        <ChevronLeft className="h-3.5 w-3.5" />{t('voiceAgents.backToCalls')}
      </Button>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Phone className="h-4.5 w-4.5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{c.room_name}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(c.started_at).toLocaleString()}
            {c.ended_at && <> — {new Date(c.ended_at).toLocaleString()}</>}
          </p>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t('voiceAgents.duration')}
          value={formatDuration(c.duration_seconds)}
        />
        <StatTile
          label="Room SID"
          value={<span className="font-mono text-sm">{c.room_sid || '—'}</span>}
        />
        <StatTile
          label="Recording"
          value={
            c.audio_file_path ? (
              <span className="flex items-center gap-1.5 text-emerald-600"><Mic className="h-4 w-4" />Recorded</span>
            ) : (
              <span className="flex items-center gap-1.5 text-muted-foreground"><MicOff className="h-4 w-4" />None</span>
            )
          }
        />
      </div>

      {/* Audio player */}
      {c.audio_file_path && (
        <SectionCard title={t('voiceAgents.audioRecording')} icon={Mic}>
          {audioSrc ? (
            <audio controls className="w-full rounded-lg" preload="metadata" src={audioSrc}>
              Your browser does not support the audio element.
            </audio>
          ) : audioLoadError ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Unable to load audio: {audioLoadError}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('voiceAgents.loadingAudio')}
            </div>
          )}
        </SectionCard>
      )}

      {/* Transcript */}
      <SectionCard title={t('voiceAgents.transcript')} icon={FileText}>
        {c.transcript ? (
          <div className="rounded-xl bg-muted/50 border border-border/40 p-4 text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed font-mono text-xs">
            {c.transcript}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">{t('voiceAgents.noTranscriptAvailable')}</p>
        )}
      </SectionCard>

      {/* Post-call summary */}
      <SectionCard
        title={t('voiceAgents.postCallSummary')}
        icon={Sparkles}
        description={t('voiceAgents.summaryDescription')}
        action={
          <Button size="sm" className="gap-1.5 text-xs" onClick={() => summaryMut.mutate()} disabled={summaryMut.isPending}>
            {summaryMut.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating…</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5" />{summary ? 'Regenerate' : 'Generate'}</>
            )}
          </Button>
        }
      >
        {summaryError && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{summaryError}
          </div>
        )}

        {!summary && !summaryError && !summaryMut.isPending && (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            Click "Generate" to produce an AI summary of this call.
          </p>
        )}

        {summaryMut.isPending && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Analysing transcript…
          </div>
        )}

        {summary && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Issue</p>
                <p className="text-sm">{summary.customer_issue}</p>
              </div>
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resolution Status</p>
                <p className="text-sm">{summary.resolution_status}</p>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Summary</p>
              <p className="text-sm leading-relaxed">{summary.summary}</p>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Follow-up Recommendation</p>
              <p className="text-sm leading-relaxed">{summary.follow_up_recommendation}</p>
            </div>

            {summary.action_items?.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action Items</p>
                <ul className="space-y-2">
                  {summary.action_items.map((item, index) => (
                    <li
                      key={`${item.title}-${index}`}
                      className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{item.owner}</span>
                          <PriorityBadge priority={item.priority} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Ticket linkage */}
      <SectionCard
        title={t('voiceAgents.ticketLinkage')}
        icon={TicketPlus}
        description={t('voiceAgents.linkageDescription')}
      >
        {/* Link existing */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Link Existing Ticket</p>
          <div className="flex gap-2">
            <Input
              value={existingTicketId}
              onChange={(e) => setExistingTicketId(e.target.value)}
              placeholder={t('voiceAgents.ticketUuidPlaceholder')}
              className="font-mono text-sm"
            />
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={handleAttachExistingTicket} disabled={linkMut.isPending}>
              {linkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Link
            </Button>
          </div>
        </div>

        <div className="relative flex items-center gap-3 py-1">
          <div className="flex-1 border-t border-border/40" />
          <span className="text-[11px] font-medium text-muted-foreground">or create new</span>
          <div className="flex-1 border-t border-border/40" />
        </div>

        {/* Create new */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('voiceAgents.subjectLabel')}</Label>
            <Input
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              placeholder={t('voiceAgents.ticketSubjectPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('voiceAgents.descriptionLabel')}</Label>
            <Textarea
              value={ticketDescription}
              onChange={(e) => setTicketDescription(e.target.value)}
              placeholder={t('voiceAgents.ticketDescriptionPlaceholder')}
              rows={5}
              className="resize-none text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={handleCreateLinkedTicket} disabled={linkMut.isPending || escalateMut.isPending}>
              {linkMut.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating…</>
              ) : (
                <><TicketPlus className="h-3.5 w-3.5" />Create &amp; Link Ticket</>
              )}
            </Button>
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => escalateMut.mutate(undefined)} disabled={escalateMut.isPending}>
              {escalateMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Flag className="h-3.5 w-3.5" />
              )}
              Escalate
            </Button>
          </div>
        </div>

        {/* Feedback */}
        {linkError && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />{linkError}
          </div>
        )}
        {linkResult && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Ticket <span className="font-mono font-semibold mx-1">{linkResult.ticket_id}</span> was {linkResult.link_type === 'created' ? 'created and linked' : 'linked'}.
          </div>
        )}
      </SectionCard>
    </div>
  );
}