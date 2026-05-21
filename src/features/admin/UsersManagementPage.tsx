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
import { useTranslation } from 'react-i18next';
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

const ROLE_KEY = { ADMIN: 'admin', AGENT: 'agent', CLIENT: 'client' } as const;

function UserStatusBadge({ status, t }: { status: ManagedUserStatus; t: (key: string) => string }) {
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
      {status === 'ACTIVE' ? t('usersManagement.active') : t('usersManagement.suspended')}
    </Badge>
  );
}

function formatRole(role: ManagedUserRole, t: (key: string) => string) {
  if (role === 'ADMIN') return t('usersManagement.adminRole');
  if (role === 'AGENT') return t('usersManagement.agentRole');
  return t('usersManagement.clientRole');
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
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ManagedUserStatus>('all');
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPhone, setCreatePhone] = useState('');

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
        title: t('usersManagement.userUpdated', { name: updatedUser.full_name }),
        description: t('usersManagement.statusSetTo', { status: updatedUser.status.toLowerCase() }),
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('usersManagement.updateStatusFailed'),
        description: normalizeError(error),
      });
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      usersApi.create({
        full_name: createName.trim(),
        email: createEmail.trim(),
        password: createPassword,
        role,
        phone_number: createPhone.trim() || null,
      }),
    onSuccess: () => {
      setCreateOpen(false);
      setCreateName('');
      setCreateEmail('');
      setCreatePassword('');
      setCreatePhone('');
      void queryClient.invalidateQueries({ queryKey: ['admin-users-directory'] });
      toast({ title: t('usersManagement.userCreated') });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('usersManagement.createUserFailed'),
        description: normalizeError(error),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (userId: string) => usersApi.remove(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users-directory'] });
      toast({ title: t('usersManagement.userDeleted') });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('usersManagement.deleteUserFailed'),
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
    if (!window.confirm(t('usersManagement.deleteConfirm', { name: entry.full_name }))) {
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
          <h1 className="text-2xl font-bold tracking-tight">{t(`usersManagement.${ROLE_KEY[role]}Title`)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t(`usersManagement.${ROLE_KEY[role]}Desc`)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserRound className="mr-1.5 h-4 w-4" />
            {t('usersManagement.create')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void usersQ.refetch(); }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('usersManagement.refresh')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('usersManagement.total')}</p>
          <p className="mt-2 text-2xl font-semibold">{totalUsers}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('usersManagement.active')}</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{activeUsers}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('usersManagement.suspended')}</p>
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
              placeholder={t('usersManagement.searchUsers')}
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
                {value === 'all' ? t('usersManagement.allStatus') : value === 'ACTIVE' ? t('usersManagement.active') : t('usersManagement.suspended')}
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
            {t('usersManagement.loadingUsers')}
          </div>
        ) : users.length === 0 ? (
          <EmptyState title={t('usersManagement.noUsers')} description={t(`usersManagement.${ROLE_KEY[role]}Empty`)} />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <div className="inline-block min-w-full align-middle px-4 sm:px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('usersManagement.user')}</TableHead>
                    <TableHead>{t('usersManagement.role')}</TableHead>
                    <TableHead>{t('usersManagement.status')}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t('usersManagement.created')}</TableHead>
                    <TableHead className="text-right">{t('usersManagement.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((entry) => {
                    const isSelf = currentUser?.id === entry.id;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
                              {role === 'ADMIN' ? <ShieldCheck className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{entry.full_name}</p>
                              <p className="truncate text-xs text-muted-foreground">{entry.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatRole(entry.role, t)}</TableCell>
                        <TableCell>
                          <UserStatusBadge status={entry.status} t={t} />
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                          {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => setSelectedUser(entry)}
                            >
                              {t('usersManagement.details')}
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isBusy || isSelf}
                              onClick={() => handleToggleStatus(entry)}
                            >
                              {updateStatusMut.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              <span className="hidden sm:inline ml-1">{entry.status === 'ACTIVE' ? t('usersManagement.suspend') : t('usersManagement.activate')}</span>
                            </Button>

                            {canDelete ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={isBusy || isSelf}
                                onClick={() => handleDelete(entry)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('usersManagement.createUser')}</DialogTitle>
            <DialogDescription>
              {t(`usersManagement.createDesc.${ROLE_KEY[role]}`)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('usersManagement.fullName')}</label>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t('usersManagement.fullNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('usersManagement.emailLabel')}</label>
              <Input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('usersManagement.password')}</label>
              <Input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder={t('usersManagement.passwordPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('usersManagement.phone')}</label>
              <Input
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="+216 XX XXX XXX"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMut.isPending}
            >
              {t('usersManagement.cancel')}
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!createName.trim() || !createEmail.trim() || !createPassword || createMut.isPending}
            >
              {createMut.isPending ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" />{t('usersManagement.creating')}</>
              ) : (
                t('usersManagement.create')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  {selectedUser.email} - {formatRole(selectedUser.role, t)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('usersManagement.currentStatus')}</p>
                  <div className="mt-2">
                    <UserStatusBadge status={selectedUser.status} t={t} />
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('usersManagement.phone')}</p>
                  <p className="mt-2 text-sm font-medium">{selectedUser.phone_number || '-'}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('usersManagement.created')}</p>
                  <p className="mt-2 text-sm font-medium">
                    {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : '-'}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('usersManagement.lastUpdated')}</p>
                  <p className="mt-2 text-sm font-medium">
                    {selectedUser.updated_at ? new Date(selectedUser.updated_at).toLocaleString() : '-'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">{t('usersManagement.statusHistory')}</h3>
                </div>

                {userActivityQ.isLoading ? (
                  <div className="mt-3 flex items-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('usersManagement.loadingHistory')}
                  </div>
                ) : userActivityQ.error ? (
                  <p className="mt-3 text-sm text-rose-600 dark:text-rose-300">
                    {normalizeError(userActivityQ.error)}
                  </p>
                ) : statusHistory.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t('usersManagement.noHistory')}
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {statusHistory.slice(0, 8).map((entry) => (
                      <div key={entry.id} className="rounded-md border bg-muted/20 px-3 py-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {formatAuditActionLabel(entry.action)}
                        </p>
                        <p className="mt-1 text-sm">{entry.description || t('usersManagement.noDescription')}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row flex-wrap gap-2 sm:justify-between">
                <Button type="button" variant="outline" onClick={() => openWorkspace('conversations')} className="w-full sm:w-auto">
                  <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                  {t('usersManagement.openConversations')}
                </Button>
                <Button type="button" variant="outline" onClick={() => openWorkspace('tickets')} className="w-full sm:w-auto">
                  <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                  {t('usersManagement.openTickets')}
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
