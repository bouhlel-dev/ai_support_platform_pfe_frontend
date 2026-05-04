import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { notificationsApi } from '@/shared/api/notifications';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';

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

export function NotificationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const notificationsQ = useQuery({
    queryKey: ['notifications-center', unreadOnly],
    queryFn: () => notificationsApi.list({ unread_only: unreadOnly, skip: 0, limit: 50 }),
  });

  const markReadMut = useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markRead(notificationId),
    onSuccess: async () => {
      await Promise.all([
        notificationsQ.refetch(),
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
      ]);
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Update failed', description: normalizeError(error) });
    },
  });

  const markAllReadMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: async (result) => {
      await Promise.all([
        notificationsQ.refetch(),
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
      ]);
      toast({ title: 'All caught up', description: result.message });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Update failed', description: normalizeError(error) });
    },
  });

  const items = notificationsQ.data?.items ?? [];
  const unreadCount = notificationsQ.data?.unread_count ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Notifications</h1>
            <p className="text-xs text-muted-foreground">System alerts, assignments, and status changes.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
              {unreadCount}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => { void notificationsQ.refetch(); }}
            disabled={notificationsQ.isLoading || markAllReadMut.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${notificationsQ.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => markAllReadMut.mutate()}
            disabled={markAllReadMut.isPending || unreadCount === 0}
          >
            {markAllReadMut.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Marking…</>
            ) : (
              <><CheckCheck className="h-3.5 w-3.5" />Mark all read</>
            )}
          </Button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bell className="h-3.5 w-3.5" />
          Show unread only
        </div>
        <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} />
      </div>

      {/* ── List ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        {notificationsQ.error ? (
          <ErrorState
            message={normalizeError(notificationsQ.error)}
            onRetry={() => { void notificationsQ.refetch(); }}
          />
        ) : notificationsQ.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notifications…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No notifications</p>
              <p className="mt-0.5 text-xs text-muted-foreground">New events will appear here when activity occurs.</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((item) => (
              <li
                key={item.id}
                className={`group relative flex items-start gap-3 px-5 py-4 transition-colors hover:bg-muted/30 ${!item.is_read ? 'bg-primary/[0.03]' : ''}`}
              >
                {/* Unread dot */}
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full transition-colors ${!item.is_read ? 'bg-primary' : 'bg-transparent'}`} />

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm leading-snug ${!item.is_read ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                      {item.title}
                    </p>
                    {!item.is_read && (
                      <Badge variant="destructive" className="h-4 px-1.5 text-[10px] font-semibold">New</Badge>
                    )}
                  </div>
                  {item.body && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/60">{timeAgo(item.created_at)}</p>
                </div>

                {/* Actions — visible on hover */}
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {item.action_url?.startsWith('/') && (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
                      <Link to={item.action_url}>
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </Link>
                    </Button>
                  )}
                  {!item.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={() => markReadMut.mutate(item.id)}
                      disabled={markReadMut.isPending}
                    >
                      {markReadMut.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer count ── */}
      {items.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {items.length} notification{items.length !== 1 ? 's' : ''}
          {unreadCount > 0 ? ` · ${unreadCount} unread` : ' · all caught up'}
        </p>
      )}
    </div>
  );
}