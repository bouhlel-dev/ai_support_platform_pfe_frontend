import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

function formatUptime(t: (key: string) => string, seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}${t('voiceAgentsRuntime:hours')} ${m}${t('voiceAgentsRuntime:minutes')}`;
  if (m > 0) return `${m}${t('voiceAgentsRuntime:minutes')} ${s}${t('voiceAgentsRuntime:seconds')}`;
  return `${s}${t('voiceAgentsRuntime:seconds')}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AccessDenied({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/40 bg-muted/20">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
          </div>
           <p className="text-sm font-semibold">{t('voiceAgentsRuntime:accessDenied')}</p>
        </div>
        <div className="p-5">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ running }: { running: boolean }) {
  const { t } = useTranslation();
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
          {t('voiceAgentsRuntime:running')}
        </>
      ) : (
        <>
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
          {t('voiceAgentsRuntime:stopped')}
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
  const { t } = useTranslation();
  const lower = line.toLowerCase();
  let levelColor = '#e6edf3';
  let levelLabel = '';

  if (/\b(error|err|exception|traceback|failed|fatal)\b/.test(lower)) {
    levelColor = '#f85149';
    levelLabel = t('voiceAgentsRuntime:err');
  } else if (/\b(warn|warning)\b/.test(lower)) {
    levelColor = '#d29922';
    levelLabel = t('voiceAgentsRuntime:warn');
  } else if (/\b(info)\b/.test(lower)) {
    levelColor = '#58a6ff';
    levelLabel = t('voiceAgentsRuntime:info');
  } else if (/\b(ok|success|started|ready|connected|complete)\b/.test(lower)) {
    levelColor = '#3fb950';
    levelLabel = t('voiceAgentsRuntime:ok');
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
  const { t } = useTranslation();
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
      toast({ variant: 'destructive', title: t('voiceAgentsRuntime:startFailed'), description: normalizeError(err) }),
  });

  const stopMut = useMutation({
    mutationFn: () => voiceAgentsApi.stop(),
    onSuccess: (res) => {
      toast({ title: res.message });
      void statusQ.refetch();
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: t('voiceAgentsRuntime:stopFailed'), description: normalizeError(err) }),
  });

  const escalateMut = useMutation({
    mutationFn: (payload: { room_name: string; reason: string }) => voiceAgentsApi.escalate(payload),
    onSuccess: (res) => {
      toast({ title: t('voiceAgentsRuntime:escalationCreated', { id: res.ticket_id }) });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('voiceAgentsRuntime:escalationFailed'), description: normalizeError(err) }),
  });

  const unauthorized = is401(statusQ.error) || is401(logsQ.error);
  const busy = startMut.isPending || stopMut.isPending;
  const isRunning = !!statusQ.data?.running;

  if (!hasLocalAuth) {
    return (
      <AccessDenied message={t('voiceAgentsRuntime:authRequired')} />
    );
  }

  if (unauthorized) {
    return (
      <AccessDenied message={t('voiceAgentsRuntime:sessionExpired')} />
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
            <h1 className="text-lg font-semibold tracking-tight">{t('voiceAgentsRuntime:title')}</h1>
            <p className="text-xs text-muted-foreground">{t('voiceAgentsRuntime:subtitle')}</p>
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
            {t('voiceAgentsRuntime:refresh')}
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link to="/settings">
              <Settings2 className="h-3.5 w-3.5" />{t('voiceAgentsRuntime:settings')}
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
            <p className="text-sm font-semibold">{t('voiceAgentsRuntime:runtimeStatus')}</p>
          </div>
          {!statusQ.isLoading && !statusQ.error && <StatusPill running={isRunning} />}
        </div>

        <div className="p-5 space-y-5">
          {statusQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />{t('voiceAgentsRuntime:loadingStatus')}
            </div>
          ) : statusQ.error ? (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />{normalizeError(statusQ.error)}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile icon={Hash} label={t('voiceAgentsRuntime:pid')} value={statusQ.data?.pid ?? '—'} />
              <StatTile icon={Settings2} label={t('voiceAgentsRuntime:mode')} value={statusQ.data?.mode ?? '—'} />
              <StatTile
                icon={Clock}
                label={t('voiceAgentsRuntime:uptime')}
                value={statusQ.data?.uptime_seconds ? formatUptime(t, statusQ.data.uptime_seconds) : '—'}
              />
              <StatTile
                icon={Activity}
                label={t('voiceAgentsRuntime:lastExitCode')}
                value={statusQ.data?.last_exit_code ?? '—'}
                valueClassName={
                  statusQ.data?.last_exit_code != null && statusQ.data.last_exit_code !== 0
                    ? 'text-destructive'
                    : undefined
                }
              />
              <StatTile
                icon={FileText}
                label={t('voiceAgentsRuntime:logFile')}
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
                <SelectItem value="start">{t('voiceAgentsRuntime:modeStart')}</SelectItem>
                <SelectItem value="dev">{t('voiceAgentsRuntime:modeDev')}</SelectItem>
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
              {t('voiceAgentsRuntime:start')}
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
              {t('voiceAgentsRuntime:stop')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5 text-xs"
              disabled={escalateMut.isPending}
              onClick={() => {
                const room = window.prompt(t('voiceAgentsRuntime:roomNamePrompt'));
                if (!room) return;
                const reason = window.prompt(t('voiceAgentsRuntime:reasonPrompt'));
                if (!reason) return;
                escalateMut.mutate({ room_name: room.trim(), reason: reason.trim() });
              }}
            >
              {escalateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
              {t('voiceAgentsRuntime:escalateCall')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('voiceAgentsRuntime:settingsHint')}
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
            {t('voiceAgentsRuntime:processLogs')}
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
              {t('voiceAgentsRuntime:lines', { count: logsQ.data.lines.length })}
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
              {t('voiceAgentsRuntime:loadingLogs')}
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
              {t('voiceAgentsRuntime:noLogsYet')}
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