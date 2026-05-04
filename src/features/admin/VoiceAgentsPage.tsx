import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Activity,
  Clock,
  Hash,
  FileText,
  AlertCircle,
  Radio,
  Flag,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ApiError, getToken, normalizeError } from '@/shared/api/client';
import { voiceAgentsApi } from '@/shared/api/voiceAgents';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/40 bg-muted/20">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
          </div>
          <p className="text-sm font-semibold">Access Denied</p>
        </div>
        <div className="p-5">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ running }: { running: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        running
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-muted border-border/50 text-muted-foreground'
      }`}
    >
      {running ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Running
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          Stopped
        </>
      )}
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  mono,
  truncate,
  className,
  valueClassName,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  truncate?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`rounded-xl border border-border/50 bg-muted/20 px-4 py-3 space-y-0.5 min-w-0 ${className ?? ''}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p
        className={`text-sm font-medium leading-tight ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''} ${valueClassName ?? ''}`}
      >
        {value}
      </p>
    </div>
  );
}

const TERM_FONT = 'Menlo, Monaco, "Courier New", monospace';

function LogLine({ line }: { line: string }) {
  const lower = line.toLowerCase();
  let levelColor = '#e6edf3';
  let levelLabel = '';

  if (/\b(error|err|exception|traceback|failed|fatal)\b/.test(lower)) {
    levelColor = '#f85149';
    levelLabel = ' ERR';
  } else if (/\b(warn|warning)\b/.test(lower)) {
    levelColor = '#d29922';
    levelLabel = 'WARN';
  } else if (/\b(info)\b/.test(lower)) {
    levelColor = '#58a6ff';
    levelLabel = 'INFO';
  } else if (/\b(ok|success|started|ready|connected|complete)\b/.test(lower)) {
    levelColor = '#3fb950';
    levelLabel = '  OK';
  }

  const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2})/);
  const ts = tsMatch?.[1];
  const body = ts ? line.slice(ts.length).trim() : line;

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '1px 0' }}>
      {ts && (
        <span style={{ color: '#3d4f65', fontSize: 11, flexShrink: 0, fontFamily: TERM_FONT }}>
          {ts}
        </span>
      )}
      {levelLabel && (
        <span style={{ color: levelColor, fontSize: 12, flexShrink: 0, minWidth: 36, fontFamily: TERM_FONT }}>
          {levelLabel}
        </span>
      )}
      <span style={{ color: levelColor, fontSize: 12, wordBreak: 'break-all', fontFamily: TERM_FONT }}>
        {body}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function VoiceAgentsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'dev' | 'start'>('start');
  const hasLocalAuth = user?.role === 'admin' && !!getToken();

  const is401 = (err: unknown) => err instanceof ApiError && err.status === 401;

  const statusQ = useQuery({
    queryKey: ['voice-agents-status'],
    queryFn: voiceAgentsApi.getStatus,
    enabled: hasLocalAuth,
    retry: false,
    refetchInterval: (q) => (is401(q.state.error) || !hasLocalAuth ? false : 3000),
  });

  const logsQ = useQuery({
    queryKey: ['voice-agents-logs'],
    queryFn: () => voiceAgentsApi.logs(200),
    enabled: hasLocalAuth,
    retry: false,
    refetchInterval: (q) =>
      is401(q.state.error) || !hasLocalAuth || !statusQ.data?.running ? false : 3000,
  });

  const startMut = useMutation({
    mutationFn: () => voiceAgentsApi.start(mode),
    onSuccess: (res) => {
      toast({ title: res.message });
      void statusQ.refetch();
      void logsQ.refetch();
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'Start failed', description: normalizeError(err) }),
  });

  const stopMut = useMutation({
    mutationFn: () => voiceAgentsApi.stop(),
    onSuccess: (res) => {
      toast({ title: res.message });
      void statusQ.refetch();
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'Stop failed', description: normalizeError(err) }),
  });

  const escalateMut = useMutation({
    mutationFn: (payload: { room_name: string; reason: string }) => voiceAgentsApi.escalate(payload),
    onSuccess: (res) => {
      toast({ title: `Escalation created: ${res.ticket_id}` });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Escalation failed', description: normalizeError(err) }),
  });

  const unauthorized = is401(statusQ.error) || is401(logsQ.error);
  const busy = startMut.isPending || stopMut.isPending;
  const isRunning = !!statusQ.data?.running;

  if (!hasLocalAuth) {
    return (
      <AccessDenied message="Admin authentication is required. Please sign in again with an admin account." />
    );
  }

  if (unauthorized) {
    return (
      <AccessDenied message="Session expired or unauthorized. Re-login as admin to continue." />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Voice Agents Runtime</h1>
            <p className="text-xs text-muted-foreground">Launch, stop, and monitor the voice agents process.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { void statusQ.refetch(); void logsQ.refetch(); }}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${statusQ.isFetching || logsQ.isFetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/settings">
              <Settings2 className="h-3.5 w-3.5" />Settings
            </Link>
          </Button>
        </div>
      </div>

      {/* Status card */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="h-3.5 w-3.5" />
            </div>
            <p className="text-sm font-semibold">Runtime Status</p>
          </div>
          {!statusQ.isLoading && !statusQ.error && <StatusPill running={isRunning} />}
        </div>

        <div className="p-5 space-y-5">
          {statusQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading status…
            </div>
          ) : statusQ.error ? (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />{normalizeError(statusQ.error)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile icon={Hash} label="PID" value={statusQ.data?.pid ?? '—'} />
              <StatTile icon={Settings2} label="Mode" value={statusQ.data?.mode ?? '—'} />
              <StatTile
                icon={Clock}
                label="Uptime"
                value={statusQ.data?.uptime_seconds ? formatUptime(statusQ.data.uptime_seconds) : '—'}
              />
              <StatTile
                icon={Activity}
                label="Last Exit Code"
                value={statusQ.data?.last_exit_code ?? '—'}
                valueClassName={
                  statusQ.data?.last_exit_code != null && statusQ.data.last_exit_code !== 0
                    ? 'text-destructive'
                    : undefined
                }
              />
              <StatTile
                icon={FileText}
                label="Log File"
                value={statusQ.data?.log_file ?? '—'}
                mono
                truncate
                className="sm:col-span-2"
              />
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select value={mode} onValueChange={(v) => setMode(v as 'dev' | 'start')}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">start</SelectItem>
                <SelectItem value="dev">dev</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              className="gap-1.5 text-xs"
              disabled={busy || isRunning}
              onClick={() => startMut.mutate()}
            >
              {startMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Play className="h-3.5 w-3.5" />}
              Start
            </Button>

            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 text-xs"
              disabled={busy || !isRunning}
              onClick={() => stopMut.mutate()}
            >
              {stopMut.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Square className="h-3.5 w-3.5" />}
              Stop
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 text-xs"
              disabled={escalateMut.isPending}
              onClick={() => {
                const room = window.prompt('Enter room name to escalate (e.g. support-call-123):');
                if (!room) return;
                const reason = window.prompt('Reason for escalation:');
                if (!reason) return;
                escalateMut.mutate({ room_name: room.trim(), reason: reason.trim() });
              }}
            >
              {escalateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
              Escalate Call
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            To update API keys, models, or provider settings, open{' '}
            <Link
              to="/settings"
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Settings → Voice Agents Configuration
            </Link>.
          </p>
        </div>
      </div>

      {/* Terminal logs */}
      <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #30363d' }}>

        {/* Titlebar */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ background: '#21262d', borderBottom: '1px solid #30363d' }}
        >
          <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: '#ff5f57' }} />
          <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: '#febc2e' }} />
          <span className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: '#28c840' }} />
          <span
            className="flex-1 text-center"
            style={{ fontFamily: TERM_FONT, fontSize: 11, color: '#8b949e', letterSpacing: '0.02em' }}
          >
            voice-agents — process logs
          </span>
          {logsQ.data?.lines && (
            <span
              className="rounded px-2 py-0.5"
              style={{
                fontFamily: TERM_FONT,
                fontSize: 10,
                color: '#8b949e',
                background: '#161b22',
                border: '1px solid #30363d',
              }}
            >
              {logsQ.data.lines.length} lines
            </span>
          )}
        </div>

        {/* Body */}
        <div
          className="px-4 py-3 max-h-[480px] overflow-auto"
          style={{ background: '#0d1117' }}
        >
          {logsQ.isLoading ? (
            <div
              className="flex items-center gap-2"
              style={{ fontFamily: TERM_FONT, fontSize: 12, color: '#8b949e' }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading logs…
            </div>
          ) : logsQ.error ? (
            <div
              className="flex items-center gap-2"
              style={{ fontFamily: TERM_FONT, fontSize: 12, color: '#f85149' }}
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {normalizeError(logsQ.error)}
            </div>
          ) : (logsQ.data?.lines ?? []).length === 0 ? (
            <span style={{ fontFamily: TERM_FONT, fontSize: 12, color: '#6e7681' }}>
              No logs yet.
            </span>
          ) : (
            <div>
              {(logsQ.data?.lines ?? []).map((line, i) => (
                <LogLine key={i} line={line} />
              ))}
              {/* Blinking cursor */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 6,
                  fontFamily: TERM_FONT,
                  fontSize: 12,
                  color: '#6e7681',
                }}
              >
                <span>$</span>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 14,
                    background: '#58a6ff',
                    verticalAlign: 'middle',
                    animation: 'termBlink 1.1s step-end infinite',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes termBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}