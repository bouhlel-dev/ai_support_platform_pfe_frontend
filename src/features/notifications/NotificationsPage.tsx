import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { notificationsApi } from '@/shared/api/notifications';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';

function timeAgo(dateStr: string, t: (key: string, options?: any) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notificationsCenter.justNow');
  if (mins < 60) return t('notificationsCenter.minutesAgo', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('notificationsCenter.hoursAgo', { count: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t('notificationsCenter.daysAgo', { count: days });
  return new Date(dateStr).toLocaleDateString();
}

export function NotificationsPage() {
  const { toast } = useToast();
  const { t } = useTranslation();
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
      toast({ variant: 'destructive', title: t('notificationsCenter.updateFailed'), description: normalizeError(error) });
    },
  });

  const markAllReadMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: async (result) => {
      await Promise.all([
        notificationsQ.refetch(),
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] }),
      ]);
      toast({ title: t('notificationsCenter.allCaughtUpTitle'), description: result.message });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: t('notificationsCenter.updateFailed'), description: normalizeError(error) });
    },
  });

  const items = notificationsQ.data?.items ?? [];
  const unreadCount = notificationsQ.data?.unread_count ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-9 sm:w-9">
            <Bell className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight sm:text-lg">{t('notificationsCenter.title')}</h1>
            <p className="text-xs text-muted-foreground">{t('notificationsCenter.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-[11px]">
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
            <span className="max-sm:hidden">{t('notificationsCenter.refresh')}</span>
          </Button>
          <Button
            size="sm"
            className="gap-0 px-2 text-xs sm:gap-1.5 sm:px-3"
            onClick={() => markAllReadMut.mutate()}
            disabled={markAllReadMut.isPending || unreadCount === 0}
          >
            {markAllReadMut.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="max-sm:hidden">{t('notificationsCenter.marking')}</span></>
            ) : (
              <><CheckCheck className="h-3.5 w-3.5" /><span className="max-sm:hidden">{t('notificationsCenter.markAllRead')}</span></>
            )}
          </Button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bell className="h-3.5 w-3.5" />
          {t('notificationsCenter.showUnreadOnly')}
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
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground sm:py-16">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('notificationsCenter.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center sm:py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('notificationsCenter.noNotifications')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('notificationsCenter.noNotificationsDesc')}</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((item) => (
              <li
                key={item.id}
                className={`group relative flex items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/30 sm:px-5 sm:py-4 ${!item.is_read ? 'bg-primary/[0.03]' : ''}`}
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
                      <Badge variant="destructive" className="h-4 px-1.5 text-[10px] font-semibold">{t('notificationsCenter.new')}</Badge>
                    )}
                  </div>
                  {item.body && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground/60">{timeAgo(item.created_at, t)}</p>
                </div>

                {/* Actions — visible on hover */}
                <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  {item.action_url?.startsWith('/') && (
                    <Button variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs sm:px-2" asChild>
                      <Link to={item.action_url}>
                        <ExternalLink className="h-3 w-3" />
                        <span className="max-sm:hidden">{t('notificationsCenter.open')}</span>
                      </Link>
                    </Button>
                  )}
                  {!item.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-1.5 text-xs sm:px-2"
                      onClick={() => markReadMut.mutate(item.id)}
                      disabled={markReadMut.isPending}
                    >
                      {markReadMut.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      <span className="max-sm:hidden">{t('notificationsCenter.read')}</span>
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
          {t('notificationsCenter.showing', { count: items.length })}
          {unreadCount > 0 ? ` · ${t('notificationsCenter.unread', { count: unreadCount })}` : ` · ${t('notificationsCenter.allCaughtUp')}`}
        </p>
      )}
    </div>
  );
}