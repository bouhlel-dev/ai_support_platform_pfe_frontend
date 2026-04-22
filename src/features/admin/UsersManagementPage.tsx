import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { auditApi } from '@/shared/api/audit';
import { normalizeError } from '@/shared/api/client';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { usersApi } from '@/shared/api/users';
import type {
  AuditLogEntry,
  ManagedUser,
  ManagedUserRole,
  ManagedUserStatus,
} from '@/shared/types';

type DirectoryRole = Extract<ManagedUserRole, 'ADMIN' | 'AGENT' | 'CLIENT'>;

const STATUS_FILTERS: Array<'all' | ManagedUserStatus> = ['all', 'ACTIVE', 'SUSPENDED'];

const DIRECTORY_COPY: Record<DirectoryRole, { title: string; description: string; emptyLabel: string }> = {
  ADMIN: {
    title: 'Admins',
    description: 'Manage administrator access, status, and moderation actions.',
    emptyLabel: 'No admins found for the selected filters.',
  },
  AGENT: {
    title: 'Agents',
    description: 'Manage agent access, status, and moderation actions.',
    emptyLabel: 'No agents found for the selected filters.',
  },
  CLIENT: {
    title: 'Clients',
    description: 'Review client accounts and quickly suspend or reactivate access.',
    emptyLabel: 'No clients found for the selected filters.',
  },
};

function UserStatusBadge({ status }: { status: ManagedUserStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium',
        status === 'ACTIVE'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100'
          : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100',
      )}
    >
      {status === 'ACTIVE' ? 'Active' : 'Suspended'}
    </Badge>
  );
}

function formatRole(role: ManagedUserRole) {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'AGENT') return 'Agent';
  return 'Client';
}

function formatAuditActionLabel(action: string) {
  return action.toLowerCase().replace(/_/g, ' ');
}

function getStatusHistory(logs: AuditLogEntry[]) {
  return logs.filter((entry) => {
    if (entry.action === 'STATUS_CHANGE') {
      return true;
    }
    const text = `${entry.description ?? ''} ${entry.resource_type ?? ''}`.toLowerCase();
    return text.includes('status') || text.includes('activate') || text.includes('suspend');
  });
}

function UserDirectoryPage({ role }: { role: DirectoryRole }) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ManagedUserStatus>('all');
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

  const usersQ = useQuery({
    queryKey: ['admin-users-directory', role, statusFilter],
    queryFn: () =>
      usersApi.list({
        role,
        status: statusFilter === 'all' ? undefined : statusFilter,
        skip: 0,
        limit: 200,
      }),
  });

  const userActivityQ = useQuery({
    queryKey: ['admin-user-activity', selectedUser?.id],
    enabled: Boolean(selectedUser?.id),
    queryFn: () =>
      auditApi.list({
        user_id: selectedUser?.id,
        skip: 0,
        limit: 50,
      }),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: ManagedUserStatus }) =>
      usersApi.update(userId, { status }),
    onSuccess: (updatedUser) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users-directory'] });
      toast({
        title: `${updatedUser.full_name} updated`,
        description: `Status set to ${updatedUser.status.toLowerCase()}.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not update user status',
        description: normalizeError(error),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => usersApi.remove(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users-directory'] });
      toast({ title: 'User deleted' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not delete user',
        description: normalizeError(error),
      });
    },
  });

  const users = useMemo(() => {
    const rawUsers = usersQ.data?.users ?? [];
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return rawUsers;
    }

    return rawUsers.filter((entry) => {
      const name = entry.full_name.toLowerCase();
      const email = entry.email.toLowerCase();
      return name.includes(normalizedSearch) || email.includes(normalizedSearch);
    });
  }, [usersQ.data?.users, search]);

  const statusHistory = useMemo(
    () => getStatusHistory(userActivityQ.data?.logs ?? []),
    [userActivityQ.data?.logs],
  );

  const totalUsers = usersQ.data?.total ?? 0;
  const activeUsers = (usersQ.data?.users ?? []).filter((entry) => entry.status === 'ACTIVE').length;
  const suspendedUsers = (usersQ.data?.users ?? []).filter((entry) => entry.status === 'SUSPENDED').length;

  const handleToggleStatus = (entry: ManagedUser) => {
    const nextStatus: ManagedUserStatus = entry.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    updateStatusMut.mutate({ userId: entry.id, status: nextStatus });
  };

  const handleDelete = (entry: ManagedUser) => {
    if (!window.confirm(`Delete ${entry.full_name}? This action cannot be undone.`)) {
      return;
    }
    deleteMut.mutate(entry.id);
  };

  const openWorkspace = (target: 'tickets' | 'conversations') => {
    if (!selectedUser) {
      return;
    }

    if (target === 'tickets') {
      navigate(`/tickets?search=${encodeURIComponent(selectedUser.id)}`);
    } else {
      navigate(`/conversations?user=${encodeURIComponent(selectedUser.id)}`);
    }
    setSelectedUser(null);
  };

  const isBusy = updateStatusMut.isPending || deleteMut.isPending;
  const canDelete = role === 'ADMIN' || role === 'AGENT' || role === 'CLIENT';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{DIRECTORY_COPY[role].title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{DIRECTORY_COPY[role].description}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void usersQ.refetch();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-2 text-2xl font-semibold">{totalUsers}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Active</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{activeUsers}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Suspended</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{suspendedUsers}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="pl-8"
            />
          </div>

          <div className="inline-flex rounded-md border bg-muted p-1">
            {STATUS_FILTERS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={statusFilter === value ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setStatusFilter(value)}
              >
                {value === 'all' ? 'All' : value === 'ACTIVE' ? 'Active' : 'Suspended'}
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
          <div className="flex items-center justify-center py-14 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <EmptyState title="No users" description={DIRECTORY_COPY[role].emptyLabel} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((entry) => {
                const isSelf = currentUser?.id === entry.id;
                return (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          {role === 'ADMIN' ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{entry.full_name}</p>
                          <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatRole(entry.role)}</TableCell>
                    <TableCell>
                      <UserStatusBadge status={entry.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setSelectedUser(entry)}
                        >
                          Details
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isBusy || isSelf}
                          onClick={() => handleToggleStatus(entry)}
                        >
                          {updateStatusMut.isPending ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          {entry.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </Button>

                        {canDelete ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={isBusy || isSelf}
                            onClick={() => handleDelete(entry)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog
        open={Boolean(selectedUser)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUser(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selectedUser ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    {selectedUser.role === 'ADMIN' ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <UserRound className="h-4 w-4" />
                    )}
                  </span>
                  {selectedUser.full_name}
                </DialogTitle>
                <DialogDescription>
                  {selectedUser.email} - {formatRole(selectedUser.role)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Current status</p>
                  <div className="mt-2">
                    <UserStatusBadge status={selectedUser.status} />
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
                  <p className="mt-2 text-sm font-medium">{selectedUser.phone_number || '-'}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
                  <p className="mt-2 text-sm font-medium">
                    {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : '-'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Last updated</p>
                  <p className="mt-2 text-sm font-medium">
                    {selectedUser.updated_at ? new Date(selectedUser.updated_at).toLocaleString() : '-'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Status and activity history</h3>
                </div>

                {userActivityQ.isLoading ? (
                  <div className="mt-3 flex items-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading history...
                  </div>
                ) : userActivityQ.error ? (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">
                    {normalizeError(userActivityQ.error)}
                  </p>
                ) : statusHistory.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No status-focused audit entries found for this user yet.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {statusHistory.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="rounded-md border bg-muted/20 px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {formatAuditActionLabel(entry.action)}
                        </p>
                        <p className="mt-1 text-sm">{entry.description || 'No description provided.'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={() => openWorkspace('conversations')}>
                  <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                  Open Conversations
                </Button>
                <Button type="button" variant="outline" onClick={() => openWorkspace('tickets')}>
                  <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                  Open Tickets
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminsPage() {
  return <UserDirectoryPage role="ADMIN" />;
}

export function AgentsPage() {
  return <UserDirectoryPage role="AGENT" />;
}

export function ClientsPage() {
  return <UserDirectoryPage role="CLIENT" />;
}
