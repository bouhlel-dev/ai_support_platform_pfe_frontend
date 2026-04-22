import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { voiceCallsApi } from '@/shared/api/voiceCalls';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { normalizeError } from '@/shared/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw, Phone, Clock, FileText, ChevronLeft, Loader2, Link2, TicketPlus } from 'lucide-react';
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

export function VoiceCallsPage() {
  const [selectedCall, setSelectedCall] = useState<VoiceCallLog | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['voice-calls'],
    queryFn: () => voiceCallsApi.list(0, 100),
  });

  const calls = data?.items ?? [];

  if (selectedCall) {
    return <CallDetailView call={selectedCall} onBack={() => setSelectedCall(null)} />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voice Calls</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View recorded voice call transcripts and audio
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold">
            Call History {data ? `(${data.total})` : ''}
          </h2>
        </div>

        {isLoading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={4} /></div>
        ) : error ? (
          <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />
        ) : calls.length === 0 ? (
          <EmptyState title="No voice calls" description="Voice call recordings will appear here after calls end." />
        ) : (
          <>
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <span>Room</span>
              <span>Duration</span>
              <span>Date</span>
              <span>Transcript</span>
              <span>Status</span>
            </div>

            {/* Rows */}
            <div className="divide-y">
              {calls.map(call => (
                <button
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className="w-full text-left sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 p-4 hover:bg-muted/50 transition-colors items-center"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{call.room_name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(call.duration_seconds)}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(call.started_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {call.transcript ? `${call.transcript.length} chars` : 'None'}
                  </div>
                  <div>
                    {call.audio_file_path ? (
                      <StatusBadge status="resolved" />
                    ) : (
                      <StatusBadge status="open" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CallDetailView({ call, onBack }: { call: VoiceCallLog; onBack: () => void }) {
  // Fetch fresh details (in case transcript was summarized in listing)
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
      if (!ticketSubject.trim()) {
        setTicketSubject(result.ticket_subject_suggestion || '');
      }
      if (!ticketDescription.trim()) {
        setTicketDescription(result.ticket_description_suggestion || '');
      }
    },
    onError: (error) => {
      setSummaryError(normalizeError(error));
    },
  });

  const linkMut = useMutation({
    mutationFn: (payload: { ticket_id?: string; subject?: string; description?: string }) =>
      voiceCallsApi.linkTicket(c.id, payload),
    onSuccess: (result) => {
      setLinkResult(result);
      setLinkError(null);
    },
    onError: (error) => {
      setLinkError(normalizeError(error));
    },
  });

  const handleCreateLinkedTicket = () => {
    setLinkResult(null);
    const subject = ticketSubject.trim() || summary?.ticket_subject_suggestion || '';
    const description = ticketDescription.trim() || summary?.ticket_description_suggestion || '';

    if (!subject || !description) {
      setLinkError('Generate a summary first or provide a ticket subject and description.');
      return;
    }

    setLinkError(null);
    linkMut.mutate({ subject, description });
  };

  const handleAttachExistingTicket = () => {
    setLinkResult(null);
    const ticketId = existingTicketId.trim();
    if (!ticketId) {
      setLinkError('Provide an existing ticket ID to link this call.');
      return;
    }

    setLinkError(null);
    linkMut.mutate({ ticket_id: ticketId });
  };

  useEffect(() => {
    let isDisposed = false;
    let objectUrl: string | null = null;

    const loadAudio = async () => {
      if (!c.audio_file_path) {
        setAudioSrc(null);
        setAudioLoadError(null);
        return;
      }

      setAudioSrc(null);
      setAudioLoadError(null);

      try {
        const blob = await voiceCallsApi.audio(c.id);
        objectUrl = URL.createObjectURL(blob);
        if (!isDisposed) {
          setAudioSrc(objectUrl);
        }
      } catch (error) {
        if (!isDisposed) {
          setAudioLoadError(normalizeError(error));
        }
      }
    };

    void loadAudio();

    return () => {
      isDisposed = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [c.audio_file_path, c.id]);

  useEffect(() => {
    setSummary(null);
    setSummaryError(null);
    setLinkResult(null);
    setLinkError(null);
    setExistingTicketId('');
    setTicketSubject('');
    setTicketDescription('');
  }, [c.id]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ChevronLeft className="h-4 w-4 mr-1" />Back to calls
      </Button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Phone className="h-5 w-5" />
          {c.room_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date(c.started_at).toLocaleString()}
          {c.ended_at && ` — ${new Date(c.ended_at).toLocaleString()}`}
        </p>
      </div>

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Duration</p>
          <p className="text-lg font-semibold mt-1">{formatDuration(c.duration_seconds)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Room SID</p>
          <p className="text-sm font-mono mt-1 truncate">{c.room_sid || '—'}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Audio</p>
          <p className="text-sm mt-1">{c.audio_file_path ? '✓ Recorded' : '✗ No recording'}</p>
        </div>
      </div>

      {/* Audio Player */}
      {c.audio_file_path && (
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Phone className="h-4 w-4" />Audio Recording
          </h2>
          {audioSrc ? (
            <audio controls className="w-full" preload="metadata" src={audioSrc}>
              Your browser does not support the audio element.
            </audio>
          ) : audioLoadError ? (
            <p className="text-sm text-destructive">Unable to load audio: {audioLoadError}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Loading audio...</p>
          )}
        </div>
      )}

      {/* Transcript */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4" />Transcript
        </h2>
        {c.transcript ? (
          <div className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap max-h-[500px] overflow-y-auto leading-relaxed">
            {c.transcript}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No transcript available for this call.</p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Post-Call Summary</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Generate an actionable handoff with suggested next steps and ticket content.
            </p>
          </div>
          <Button size="sm" onClick={() => summaryMut.mutate()} disabled={summaryMut.isPending}>
            {summaryMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-1" />
            )}
            Generate Summary
          </Button>
        </div>

        {summaryError && <p className="text-sm text-destructive">{summaryError}</p>}

        {summary && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Issue</p>
                <p className="text-sm mt-1">{summary.customer_issue}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Resolution Status</p>
                <p className="text-sm mt-1">{summary.resolution_status}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">Summary</p>
              <p className="text-sm mt-1">{summary.summary}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">Follow-up Recommendation</p>
              <p className="text-sm mt-1">{summary.follow_up_recommendation}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Action Items</p>
              <div className="space-y-2">
                {summary.action_items.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-md border p-2 text-sm">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Owner: {item.owner} | Priority: {item.priority}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">Ticket Linkage</h2>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <Label>Link Existing Ticket ID</Label>
            <Input
              value={existingTicketId}
              onChange={(e) => setExistingTicketId(e.target.value)}
              placeholder="ticket uuid"
            />
          </div>
          <div className="md:pt-6">
            <Button size="sm" variant="outline" onClick={handleAttachExistingTicket} disabled={linkMut.isPending}>
              {linkMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4 mr-1" />
              )}
              Link Existing
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          <div>
            <Label>New Ticket Subject</Label>
            <Input
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              placeholder="Ticket subject"
            />
          </div>
          <div>
            <Label>New Ticket Description</Label>
            <Textarea
              value={ticketDescription}
              onChange={(e) => setTicketDescription(e.target.value)}
              placeholder="Ticket description"
              rows={6}
            />
          </div>
          <div>
            <Button size="sm" onClick={handleCreateLinkedTicket} disabled={linkMut.isPending}>
              {linkMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <TicketPlus className="h-4 w-4 mr-1" />
              )}
              Create Linked Ticket
            </Button>
          </div>
        </div>

        {linkError && <p className="text-sm text-destructive">{linkError}</p>}
        {linkResult && (
          <p className="text-sm text-emerald-600">
            Ticket {linkResult.ticket_id} was {linkResult.link_type === 'created' ? 'created and linked' : 'linked'}.
          </p>
        )}
      </div>
    </div>
  );
}
