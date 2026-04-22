import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { notificationsApi } from '@/shared/api/notifications';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';

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
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: normalizeError(error),
      });
    },
  });

  const markAllReadMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: async (result) => {
      await Promise.all([
        notificationsQ.refetch(),
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
      ]);
      toast({ title: 'Notifications updated', description: result.message });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: normalizeError(error),
      });
    },
  });

  const items = notificationsQ.data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review system alerts, assignments, and status changes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary">Unread: {notificationsQ.data?.unread_count ?? 0}</Badge>
          <Button
            variant="outline"
            onClick={() => {
              void notificationsQ.refetch();
            }}
            disabled={notificationsQ.isLoading || markAllReadMut.isPending}
          >
            Refresh
          </Button>
          <Button
            onClick={() => markAllReadMut.mutate()}
            disabled={markAllReadMut.isPending || (notificationsQ.data?.unread_count ?? 0) === 0}
          >
            {markAllReadMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />Marking
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />Mark all read
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-sm">
            <Bell className="h-4 w-4 text-muted-foreground" />
            Show unread only
          </div>
          <Switch checked={unreadOnly} onCheckedChange={setUnreadOnly} />
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {notificationsQ.error ? (
          <ErrorState
            message={normalizeError(notificationsQ.error)}
            onRetry={() => {
              void notificationsQ.refetch();
            }}
          />
        ) : notificationsQ.isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading notifications...
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="New events will appear here when activity occurs."
          />
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      {!item.is_read ? <Badge variant="destructive">Unread</Badge> : <Badge variant="outline">Read</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.body}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.action_url?.startsWith('/') ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to={item.action_url}>Open</Link>
                      </Button>
                    ) : null}
                    {!item.is_read ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markReadMut.mutate(item.id)}
                        disabled={markReadMut.isPending}
                      >
                        Mark read
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
