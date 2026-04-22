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
import { cn } from '@/lib/utils';
import { normalizeError } from '@/shared/api/client';
import { usersApi } from '@/shared/api/users';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import type { ManagedUser, ManagedUserRole } from '@/shared/types';

type AccessRoleFilter = 'all' | 'AGENT' | 'ADMIN';

function isReadOnlyMode(user: ManagedUser) {
  return !user.can_reply_conversations || !user.can_reply_whatsapp;
}

function roleLabel(role: ManagedUserRole) {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'AGENT') return 'Agent';
  return 'Client';
}

function AccessBadge({ user }: { user: ManagedUser }) {
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
      {readOnly ? 'Read only mode' : 'Full reply access'}
    </Badge>
  );
}

export function ChatAccessPage() {
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
        title: `${updated.full_name} updated`,
        description: 'Reply access settings saved.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not update access settings',
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
          <h1 className="text-2xl font-bold tracking-tight">Chat Reply Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose who can reply in Conversations and WhatsApp. Disable access to keep accounts in read-only mode.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void usersQ.refetch();
          }}
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Operators tracked</p>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Full access</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{stats.fullAccess}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Read only mode</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{stats.readOnly}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Chat only</p>
          <p className="mt-2 text-2xl font-semibold">{stats.convOnly}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">WhatsApp only</p>
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
              placeholder="Search by name or email"
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
                {value === 'all' ? 'All' : value === 'AGENT' ? 'Agents' : 'Admins'}
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
            Loading access controls...
          </div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            description="No operator accounts match the current filters."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Conversations Reply</TableHead>
                <TableHead>WhatsApp Reply</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="text-right">Quick Actions</TableHead>
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
                        {roleLabel(entry.role)}
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
                          {entry.can_reply_conversations ? 'Can reply' : 'Read only'}
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
                          {entry.can_reply_whatsapp ? 'Can reply' : 'Read only'}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <AccessBadge user={entry} />
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
                          Read only
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={rowBusy || isSelf}
                          onClick={() => setReadOnlyMode(entry, false)}
                        >
                          Full access
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
