import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Play, RefreshCw, Settings2, Square } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ApiError, getToken, normalizeError } from '@/shared/api/client';
import { voiceAgentsApi } from '@/shared/api/voiceAgents';

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
    refetchInterval: (q) => (is401(q.state.error) || !hasLocalAuth || !statusQ.data?.running ? false : 3000),
  });

  const startMut = useMutation({
    mutationFn: () => voiceAgentsApi.start(mode),
    onSuccess: (res) => {
      toast({ title: res.message });
      void statusQ.refetch();
      void logsQ.refetch();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Start failed', description: normalizeError(err) }),
  });

  const stopMut = useMutation({
    mutationFn: () => voiceAgentsApi.stop(),
    onSuccess: (res) => {
      toast({ title: res.message });
      void statusQ.refetch();
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Stop failed', description: normalizeError(err) }),
  });

  const unauthorized = is401(statusQ.error) || is401(logsQ.error);
  const busy = startMut.isPending || stopMut.isPending;

  if (!hasLocalAuth) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border bg-card p-4">
          <h1 className="text-xl font-semibold">Voice Agents Runtime</h1>
          <p className="text-sm text-muted-foreground mt-2">Admin authentication is required. Please sign in again with an admin account.</p>
        </div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border bg-card p-4">
          <h1 className="text-xl font-semibold">Voice Agents Runtime</h1>
          <p className="text-sm text-muted-foreground mt-2">Session expired or unauthorized. Re-login as admin to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voice Agents Runtime</h1>
          <p className="text-sm text-muted-foreground">Launch or stop the voice agents process and monitor logs. Configuration has moved to Settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { void statusQ.refetch(); void logsQ.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />Refresh
          </Button>
          <Button asChild variant="outline">
            <Link to="/settings">
              <Settings2 className="h-4 w-4 mr-1" />Open Settings
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Runtime Status</h2>
        {statusQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading status...</p>
        ) : statusQ.error ? (
          <p className="text-sm text-destructive">{normalizeError(statusQ.error)}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <p><span className="text-muted-foreground">Running:</span> {statusQ.data?.running ? 'Yes' : 'No'}</p>
            <p><span className="text-muted-foreground">PID:</span> {statusQ.data?.pid ?? '-'}</p>
            <p><span className="text-muted-foreground">Mode:</span> {statusQ.data?.mode ?? '-'}</p>
            <p><span className="text-muted-foreground">Uptime:</span> {statusQ.data?.uptime_seconds ? `${Math.floor(statusQ.data.uptime_seconds)}s` : '-'}</p>
            <p><span className="text-muted-foreground">Last Exit Code:</span> {statusQ.data?.last_exit_code ?? '-'}</p>
            <p className="truncate"><span className="text-muted-foreground">Log File:</span> {statusQ.data?.log_file ?? '-'}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Select value={mode} onValueChange={(v) => setMode(v as 'dev' | 'start')}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="start">start</SelectItem>
              <SelectItem value="dev">dev</SelectItem>
            </SelectContent>
          </Select>

          <Button disabled={busy || !!statusQ.data?.running} onClick={() => startMut.mutate()}>
            {(startMut.isPending || stopMut.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <Play className="h-4 w-4 mr-1" />Start Voice Agents
          </Button>

          <Button variant="destructive" disabled={busy || !statusQ.data?.running} onClick={() => stopMut.mutate()}>
            {(stopMut.isPending || startMut.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <Square className="h-4 w-4 mr-1" />Stop
          </Button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Need to update API keys, models, or provider settings? Open Settings and use the Voice Agents Configuration section.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold mb-3">Process Logs</h2>
        {logsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading logs...</p>
        ) : logsQ.error ? (
          <p className="text-sm text-destructive">{normalizeError(logsQ.error)}</p>
        ) : (
          <pre className="text-xs font-mono bg-muted rounded p-3 max-h-[420px] overflow-auto whitespace-pre-wrap">
            {(logsQ.data?.lines ?? []).join('\n') || 'No logs yet.'}
          </pre>
        )}
      </div>
    </div>
  );
}
