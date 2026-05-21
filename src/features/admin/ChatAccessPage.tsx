import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, MessageCircle, MessageSquare, Search, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { normalizeError } from '@/shared/api/client';
import { usersApi } from '@/shared/api/users';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import type { ManagedUser, ManagedUserRole } from '@/shared/types';

type AccessRoleFilter = 'all' | 'AGENT' | 'ADMIN';

function isReadOnlyMode(user: ManagedUser) {
  return !user.can_reply_conversations || !user.can_reply_whatsapp;
}

function roleLabel(t: (key: string) => string, role: ManagedUserRole) {
  if (role === 'ADMIN') return t('chatAccess.adminRole');
  if (role === 'AGENT') return t('chatAccess.agentRole');
  return t('chatAccess.clientRole');
}

function AccessBadge({ user, t }: { user: ManagedUser; t: (key: string) => string }) {
  const readOnly = isReadOnlyMode(user);

  return (
    <Badge
      variant="outline"
      className={cn(
        readOnly
          ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100',
      )}
    >
      {readOnly ? t('chatAccess.readOnlyMode') : t('chatAccess.fullReplyAccess')}
    </Badge>
  );
}

export function ChatAccessPage() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<AccessRoleFilter>('all');

  const usersQ = useQuery({
    queryKey: ['chat-access-controls'],
    queryFn: async () => {
      const [admins, agents] = await Promise.all([
        usersApi.list({ role: 'ADMIN', skip: 0, limit: 200 }),
        usersApi.list({ role: 'AGENT', skip: 0, limit: 200 }),
      ]);
      return [...admins.users, ...agents.users];
    },
  });

  const updateMut = useMutation({
    mutationFn: ({
      userId,
      payload,
    }: {
      userId: string;
      payload: { can_reply_conversations?: boolean; can_reply_whatsapp?: boolean };
    }) => usersApi.update(userId, payload),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['chat-access-controls'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-users-directory'] });
      toast({
        title: t('chatAccess.userUpdated', { name: updated.full_name }),
        description: t('chatAccess.replyAccessSaved'),
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('chatAccess.updateAccessFailed'),
        description: normalizeError(error),
      });
    },
  });

  const users = useMemo(() => {
    const all = usersQ.data ?? [];
    const query = search.trim().toLowerCase();

    return all
      .filter((entry) => {
        if (roleFilter === 'all') return true;
        return entry.role === roleFilter;
      })
      .filter((entry) => {
        if (!query) return true;
        const haystack = `${entry.full_name} ${entry.email}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [roleFilter, search, usersQ.data]);

  const stats = useMemo(() => {
    const all = usersQ.data ?? [];
    const fullAccess = all.filter((entry) => !isReadOnlyMode(entry)).length;
    const readOnly = all.filter((entry) => isReadOnlyMode(entry)).length;
    const convOnly = all.filter(
      (entry) => entry.can_reply_conversations && !entry.can_reply_whatsapp,
    ).length;
    const waOnly = all.filter(
      (entry) => !entry.can_reply_conversations && entry.can_reply_whatsapp,
    ).length;

    return {
      total: all.length,
      fullAccess,
      readOnly,
      convOnly,
      waOnly,
    };
  }, [usersQ.data]);

  const setReadOnlyMode = (target: ManagedUser, readOnly: boolean) => {
    updateMut.mutate({
      userId: target.id,
      payload: {
        can_reply_conversations: !readOnly,
        can_reply_whatsapp: !readOnly,
      },
    });
  };

  const updateChannelAccess = (
    target: ManagedUser,
    field: 'can_reply_conversations' | 'can_reply_whatsapp',
    value: boolean,
  ) => {
    updateMut.mutate({
      userId: target.id,
      payload: {
        [field]: value,
      },
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('chatAccess.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('chatAccess.subtitle')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void usersQ.refetch();
          }}
        >
          {t('whatsapp.refreshLabel')}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('chatAccess.operatorsTracked')}</p>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('chatAccess.fullAccess')}</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{stats.fullAccess}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('chatAccess.readOnlyMode')}</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{stats.readOnly}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('chatAccess.chatOnly')}</p>
          <p className="mt-2 text-2xl font-semibold">{stats.convOnly}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('chatAccess.whatsappOnly')}</p>
          <p className="mt-2 text-2xl font-semibold">{stats.waOnly}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('chatAccess.searchUsersChat')}
              className="pl-8"
            />
          </div>

          <div className="inline-flex rounded-md border bg-muted p-1">
            {(['all', 'AGENT', 'ADMIN'] as AccessRoleFilter[]).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={roleFilter === value ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setRoleFilter(value)}
              >
                {value === 'all' ? t('chatAccess.allFilter') : value === 'AGENT' ? t('chatAccess.agentsFilter') : t('chatAccess.adminsFilter')}
              </Button>
            ))}
          </div>
        </div>

        {usersQ.error ? (
          <ErrorState
            message={normalizeError(usersQ.error)}
            onRetry={() => {
              void usersQ.refetch();
            }}
          />
        ) : usersQ.isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('chatAccess.loadingAccessControls')}
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title={t('chatAccess.noUsersFound')}
            description={t('chatAccess.noOperators')}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('chatAccess.user')}</TableHead>
                <TableHead>{t('chatAccess.role')}</TableHead>
                <TableHead>{t('chatAccess.conversationsReply')}</TableHead>
                <TableHead>{t('chatAccess.whatsappReply')}</TableHead>
                <TableHead>{t('chatAccess.mode')}</TableHead>
                <TableHead className="text-right">{t('chatAccess.quickActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((entry) => {
                const isSelf = currentUser?.id === entry.id;
                const rowBusy = updateMut.isPending;

                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{entry.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="inline-flex items-center gap-2 text-sm">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        {roleLabel(t, entry.role)}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={entry.can_reply_conversations}
                          disabled={rowBusy || isSelf}
                          onCheckedChange={(checked) => {
                            updateChannelAccess(entry, 'can_reply_conversations', checked);
                          }}
                        />
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {entry.can_reply_conversations ? t('chatAccess.canReply') : t('chatAccess.readOnly')}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={entry.can_reply_whatsapp}
                          disabled={rowBusy || isSelf}
                          onCheckedChange={(checked) => {
                            updateChannelAccess(entry, 'can_reply_whatsapp', checked);
                          }}
                        />
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {entry.can_reply_whatsapp ? t('chatAccess.canReply') : t('chatAccess.readOnly')}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <AccessBadge user={entry} t={t} />
                    </TableCell>

                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={rowBusy || isSelf}
                          onClick={() => setReadOnlyMode(entry, true)}
                        >
                          <Lock className="mr-1 h-3.5 w-3.5" />
                          {t('chatAccess.setReadOnly')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={rowBusy || isSelf}
                          onClick={() => setReadOnlyMode(entry, false)}
                        >
                          {t('chatAccess.setFullAccess')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
