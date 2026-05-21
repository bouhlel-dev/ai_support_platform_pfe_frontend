import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, SlidersHorizontal, Trash2, UserCog } from 'lucide-react';

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { ticketsApi } from '@/shared/api/tickets';
import { usersApi } from '@/shared/api/users';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { ClientTicketAiHelpers } from '@/features/tickets/ClientTicketAiHelpers';
import type { ManagedUser, Ticket, TicketPriority, TicketStatus } from '@/shared/types';
import { buildMailLikeDisplay } from '@/shared/utils/mailLikeContent';

const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'medium', 'high', 'critical'];
const STATUS_OPTIONS: TicketStatus[] = ['open', 'in_progress', 'escalated', 'resolved', 'closed'];
const STATUS_TABS: Array<'all' | TicketStatus> = ['all', ...STATUS_OPTIONS];
const RESOLUTION_REQUIRED_STATUSES: TicketStatus[] = ['resolved', 'closed'];

type OperatorRole = 'admin' | 'agent';

function formatStatus(status: TicketStatus | 'all', t: (key: string, options?: Record<string, unknown>) => string) {
  if (status === 'all') return t('ticketsPage.all');
  const statusKeys: Record<string, string> = {
    open: 'ticketsPage.open',
    in_progress: 'ticketsPage.inProgress',
    escalated: 'ticketsPage.escalated',
    resolved: 'ticketsPage.resolved',
    closed: 'ticketsPage.closed',
  };
  return t(statusKeys[status] || 'ticketsPage.open');
}

function formatAgentLabel(agent: ManagedUser) {
  return `${agent.full_name} (${agent.email})`;
}

function AgentSelectItem({ agent }: { agent: ManagedUser }) {
  const initials = agent.full_name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-5 w-5">
        {agent.profile_picture_url && <AvatarImage src={agent.profile_picture_url} alt={agent.full_name} />}
        <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
      </Avatar>
      <span>{formatAgentLabel(agent)}</span>
    </div>
  );
}

function isTicketWithinDateRange(ticket: Ticket, dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) {
    return true;
  }

  const createdAt = ticket.created_at ? new Date(ticket.created_at) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) {
    return false;
  }

  const fromBoundary = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
  const toBoundary = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

  if (fromBoundary && createdAt < fromBoundary) {
    return false;
  }

  if (toBoundary && createdAt > toBoundary) {
    return false;
  }

  return true;
}

export function TicketsPage() {
  const { user } = useAuth();

  if (user?.role === 'client') {
    return <ClientTicketsPage />;
  }

  const mappedRole: OperatorRole = user?.role === 'admin' ? 'admin' : 'agent';
  return <OperatorTicketsCommandCenter role={mappedRole} />;
}

function ClientTicketsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tickets', { page, size: 20 }],
    queryFn: () => ticketsApi.list({ page, size: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      ticketsApi.create({
        subject: subject.trim(),
        description: description.trim(),
        priority,
      }),
    onSuccess: async () => {
      resetCreateForm();
      setIsCreateOpen(false);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({
        title: t('ticketsPage.ticketCreated'),
        description: t('ticketsPage.ticketCreatedDesc'),
      });
    },
    onError: (mutationError) =>
      toast({
        variant: 'destructive',
        title: t('ticketsPage.createFailed'),
        description: normalizeError(mutationError),
      }),
  });

  const tickets = (data?.tickets || []).filter((ticket) => {
    if (!isTicketWithinDateRange(ticket, dateFrom, dateTo)) {
      return false;
    }

    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return (
      ticket.subject.toLowerCase().includes(query) ||
      ticket.description.toLowerCase().includes(query) ||
      ticket.id.toLowerCase().includes(query)
    );
  });

  const hasFilters = Boolean(search.trim() || dateFrom || dateTo);

  const resetCreateForm = () => {
    setSubject('');
    setDescription('');
    setPriority('medium');
  };

  const handleCreate = () => {
    if (!subject.trim() || !description.trim() || createMutation.isPending) {
      return;
    }
    createMutation.mutate();
  };

  const emptyTitle = hasFilters ? t('ticketsPage.noTicketsFilter') : t('ticketsPage.noTicketsCreate');
  const emptyDescription = hasFilters
    ? t('ticketsPage.noTicketsFilterDesc')
    : t('ticketsPage.noTicketsCreateDesc');

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('ticketsPage.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('ticketsPage.clientSubtitle')}
            </p>
          </div>
          <Button size="sm" className="h-8 rounded-full px-3 text-xs sm:h-9 sm:px-3.5 sm:text-sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('ticketsPage.newTicket')}
          </Button>
        </div>

        <div className="rounded-xl border bg-card/70 p-3 sm:p-4 space-y-2 sm:space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('ticketsPage.searchPlaceholder')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0 sm:hidden" onClick={() => setFilterOpen((v) => !v)} aria-label="Toggle filters">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          <div className={`${filterOpen ? 'grid' : 'hidden'} gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3 sm:grid`}>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('ticketsPage.createdFrom')}</p>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('ticketsPage.createdTo')}</p>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                {t('ticketsPage.clearFilters')}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('ticketsPage.showing', { count: tickets.length, total: data?.total ?? 0 })}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton />
            </div>
          ) : error ? (
            <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />
          ) : !tickets.length ? (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-card/50">
                      <th className="p-2.5 sm:p-3 text-left font-medium text-muted-foreground">{t('ticketsPage.columnSubject')}</th>
                      <th className="p-2.5 sm:p-3 text-left font-medium text-muted-foreground">{t('ticketsPage.columnStatus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tickets.map((ticket) => {
                      const preview = buildMailLikeDisplay(ticket.description).preview || ticket.description;
                      return (
                        <tr key={ticket.id} className="transition-colors hover:bg-muted/25">
                          <td className="p-2.5">
                            <Link
                              to={`/tickets/${ticket.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              {ticket.subject}
                            </Link>
                            <p className="mt-1 text-xs text-muted-foreground">
                              ID: {ticket.id} · Customer: {ticket.creator_id}
                            </p>
                          </td>
                          <td className="p-2.5">
                            <StatusBadge status={ticket.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open && !createMutation.isPending) {
              resetCreateForm();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('ticketsPage.createTicket')}</DialogTitle>
              <DialogDescription>
                {t('ticketsPage.createDesc')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ticket-subject">
                {t('ticketsPage.subject')}
              </label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={t('ticketsPage.subjectPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ticket-description">
                {t('ticketsPage.description')}
              </label>
              <Textarea
                id="ticket-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('ticketsPage.descriptionPlaceholder')}
                className="min-h-32"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('ticketsPage.priority')}</label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ClientTicketAiHelpers
              title={subject}
              description={description}
              onApplyReformulation={setDescription}
            />

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={createMutation.isPending}
              >
                {t('ticketsPage.cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!subject.trim() || !description.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('ticketsPage.creating')}
                  </>
                ) : (
                  t('ticketsPage.createTicket')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      </>
    );
  }

// --- Assign Agent Dialog ---
function AssignAgentDialog({
  open,
  onOpenChange,
  ticket,
  agents,
  onAssign,
  isBusy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket | null;
  agents: ManagedUser[];
  onAssign: (agentId: string) => void;
  isBusy: boolean;
}) {
  const { t } = useTranslation();
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [search, setSearch] = useState('');

  const filtered = agents.filter((a) =>
    `${a.full_name} ${a.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpen = (open: boolean) => {
    if (!open) {
      setSelectedAgentId('');
      setSearch('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ticketsPage.assignAgent')}</DialogTitle>
          <DialogDescription>
            {t('ticketsPage.assignAgentDesc', { subject: ticket?.subject ?? '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('ticketsPage.searchAgents')}
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">{t('ticketsPage.noAgentsFound')}</p>
            ) : (
              filtered.map((agent) => {
                const initials = agent.full_name
                  .split(' ')
                  .slice(0, 2)
                  .map((n) => n[0]?.toUpperCase())
                  .join('');
                const isSelected = selectedAgentId === agent.id;
                const isCurrent = ticket?.assigned_agent_id === agent.id;

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 ${
                      isSelected ? 'bg-primary/10' : ''
                    }`}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      {agent.profile_picture_url && (
                        <AvatarImage src={agent.profile_picture_url} alt={agent.full_name} />
                      )}
                      <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{agent.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{agent.email}</p>
                    </div>
                    {isCurrent && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t('ticketsPage.current')}
                      </span>
                    )}
                    {isSelected && !isCurrent && (
                      <span className="shrink-0 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={isBusy}>
            {t('ticketsPage.cancel')}
          </Button>
          <Button
            onClick={() => {
              if (selectedAgentId) onAssign(selectedAgentId);
            }}
            disabled={
              !selectedAgentId ||
              selectedAgentId === ticket?.assigned_agent_id ||
              isBusy
            }
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('ticketsPage.assigning')}
              </>
            ) : (
              t('ticketsPage.assign')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OperatorTicketsCommandCenter({ role }: { role: OperatorRole }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [statusTab, setStatusTab] = useState<'all' | TicketStatus>('all');
  const [search, setSearch] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [assignDialogTicket, setAssignDialogTicket] = useState<Ticket | null>(null);

  const ticketsQ = useQuery({
    queryKey: ['tickets-command-center', { page, size: 20, status: statusTab }],
    queryFn: () =>
      ticketsApi.list({
        page,
        size: 20,
        status: statusTab === 'all' ? undefined : statusTab,
      }),
  });

  const totalsQ = useQuery({
    queryKey: ['tickets-command-center-totals'],
    queryFn: async () => {
      const totals = await ticketsApi.totals();
      return {
        all: totals.total,
        open: totals.open,
        in_progress: totals.in_progress,
        escalated: totals.escalated,
        resolved: totals.resolved,
        closed: totals.closed,
      } as Record<'all' | TicketStatus, number>;
    },
    staleTime: 30_000,
  });

  const agentsQ = useQuery({
    queryKey: ['tickets-command-center-agents'],
    queryFn: () =>
      usersApi.list({
        role: 'AGENT',
        status: 'ACTIVE',
        skip: 0,
        limit: 200,
      }),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({
      ticketId,
      status,
      resolutionNote,
    }: {
      ticketId: string;
      status: TicketStatus;
      resolutionNote?: string;
    }) =>
      ticketsApi.updateStatus(ticketId, {
        status,
        resolution_note: resolutionNote,
      }),
    onMutate: ({ ticketId }) => {
      setStatusBusyId(ticketId);
    },
    onSuccess: async (updatedTicket) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tickets-command-center'] }),
        queryClient.invalidateQueries({ queryKey: ['tickets-command-center-totals'] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['ticket', updatedTicket.id] }),
      ]);
      toast({
        title: t('ticketsPage.statusUpdated'),
        description: t('ticketsPage.statusUpdatedDesc', { subject: updatedTicket.subject, status: updatedTicket.status.replace(/_/g, ' ') }),
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('ticketsPage.statusUpdateFailed'),
        description: normalizeError(error),
      });
    },
    onSettled: () => {
      setStatusBusyId(null);
    },
  });

  const assignMut = useMutation({
    mutationFn: ({ ticketId, agentId }: { ticketId: string; agentId: string }) =>
      ticketsApi.assign(ticketId, agentId),
    onMutate: ({ ticketId }) => {
      setAssignBusyId(ticketId);
    },
    onSuccess: async (updatedTicket) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tickets-command-center'] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['ticket', updatedTicket.id] }),
      ]);
      setAssignDialogTicket(null);
      toast({ title: t('ticketsPage.ticketAssigned') });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('ticketsPage.assignmentFailed'),
        description: normalizeError(error),
      });
    },
    onSettled: () => {
      setAssignBusyId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (ticketId: string) => ticketsApi.delete(ticketId),
    onMutate: (ticketId) => {
      setDeleteBusyId(ticketId);
    },
    onSuccess: async (_result, ticketId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tickets-command-center'] }),
        queryClient.invalidateQueries({ queryKey: ['tickets-command-center-totals'] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      ]);
      queryClient.removeQueries({ queryKey: ['ticket', ticketId] });
      toast({ title: t('ticketsPage.ticketDeleted') });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('ticketsPage.deleteFailed'),
        description: normalizeError(error),
      });
    },
    onSettled: () => {
      setDeleteBusyId(null);
    },
  });

  const agentLookup = useMemo(() => {
    const lookup = new Map<string, ManagedUser>();
    (agentsQ.data?.users ?? []).forEach((agent) => {
      lookup.set(agent.id, agent);
    });
    return lookup;
  }, [agentsQ.data?.users]);

  const filteredTickets = useMemo(() => {
    const source = ticketsQ.data?.tickets ?? [];
    const query = search.trim().toLowerCase();
    if (!query) {
      return source.filter((ticket) => isTicketWithinDateRange(ticket, dateFrom, dateTo));
    }

    return source.filter((ticket) => {
      if (!isTicketWithinDateRange(ticket, dateFrom, dateTo)) {
        return false;
      }

      const assignedLabel = ticket.assigned_agent_id
        ? agentLookup.get(ticket.assigned_agent_id)?.full_name ?? ticket.assigned_agent_id
        : '';
      return (
        ticket.id.toLowerCase().includes(query) ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query) ||
        ticket.channel_source.toLowerCase().includes(query) ||
        ticket.creator_id.toLowerCase().includes(query) ||
        assignedLabel.toLowerCase().includes(query)
      );
    });
  }, [agentLookup, dateFrom, dateTo, search, ticketsQ.data?.tickets]);

  const hasFilters = Boolean(search.trim() || dateFrom || dateTo);

  const handleStatusChange = (ticketId: string, status: TicketStatus) => {
    let resolutionNote: string | undefined;
    if (RESOLUTION_REQUIRED_STATUSES.includes(status)) {
      const input = window.prompt(t('ticketsPage.resolutionNoteRequired'), '')?.trim();
      if (!input) {
        return;
      }

      if (input.length < 5) {
        toast({
          variant: 'destructive',
          title: t('ticketsPage.resolutionNoteRequired'),
          description: t('ticketsPage.resolutionNoteRequiredDesc'),
        });
        return;
      }

      resolutionNote = input;
    }

    updateStatusMut.mutate({ ticketId, status, resolutionNote });
  };

  const handleAssign = (agentId: string) => {
    if (!assignDialogTicket) return;
    assignMut.mutate({ ticketId: assignDialogTicket.id, agentId });
  };

  const handleDelete = (ticket: Ticket) => {
    if (deleteMut.isPending) {
      return;
    }
    if (!window.confirm(t('ticketsPage.deleteConfirm', { subject: ticket.subject }))) {
      return;
    }
    deleteMut.mutate(ticket.id);
  };

  const currentRoleBanner = role === 'admin' ? t('ticketsPage.adminParity') : t('ticketsPage.agentParity');

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t('ticketsPage.operatorTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('ticketsPage.operatorSubtitle')}
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          {currentRoleBanner}
        </div>
      </div>

      <div className="rounded-xl border bg-card/70 p-3 sm:p-4 space-y-2 sm:space-y-3">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab}
              type="button"
              size="sm"
              variant={statusTab === tab ? 'default' : 'ghost'}
              className="h-7 rounded-full px-2.5 text-xs sm:h-8 sm:px-3 sm:text-sm"
              onClick={() => {
                setStatusTab(tab);
                setPage(1);
              }}
            >
              {formatStatus(tab, t)}
              <span className="ml-1 rounded-full bg-background/60 px-1 py-0.5 text-[10px] sm:ml-1.5 sm:px-1.5 sm:text-[11px]">
                {totalsQ.data?.[tab] ?? 0}
              </span>
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('ticketsPage.searchOperatorPlaceholder')}
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0 sm:hidden" onClick={() => setFilterOpen((v) => !v)} aria-label="Toggle filters">
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          <div className={`${filterOpen ? 'grid' : 'hidden'} gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3 sm:grid`}>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('ticketsPage.createdFrom')}</p>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('ticketsPage.createdTo')}</p>
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSearch('');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                  {t('ticketsPage.clearFilters')}
                </Button>
              </div>
            </div>

          <p className="text-xs text-muted-foreground">
            {t('ticketsPage.showing', { count: filteredTickets.length, total: ticketsQ.data?.total ?? 0 })}
          </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        {ticketsQ.isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : ticketsQ.error ? (
          <ErrorState
            message={normalizeError(ticketsQ.error)}
            onRetry={() => {
              void ticketsQ.refetch();
            }}
          />
        ) : filteredTickets.length === 0 ? (
          <EmptyState
            title={t('ticketsPage.noTickets')}
            description={
              hasFilters
                ? t('ticketsPage.noTicketsMatch')
                : t('ticketsPage.noTicketsStatus')
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-card/50">
                    <th className="p-2.5 sm:p-3 text-left font-medium text-muted-foreground">{t('ticketsPage.columnTicket')}</th>
                    <th className="p-2.5 sm:p-3 text-left font-medium text-muted-foreground">{t('ticketsPage.columnStatus')}</th>
                    <th className="hidden p-2.5 sm:p-3 text-left font-medium text-muted-foreground sm:table-cell">{t('ticketsPage.columnAssigned')}</th>
                    <th className="hidden p-2.5 sm:p-3 text-left font-medium text-muted-foreground sm:table-cell">{t('ticketsPage.columnUpdated')}</th>
                    {role === 'admin' && (
                      <th className="hidden p-2.5 sm:p-3 text-left font-medium text-muted-foreground sm:table-cell">{t('ticketsPage.columnActions')}</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTickets.map((ticket) => {
                    const assignedAgent = ticket.assigned_agent_id
                      ? agentLookup.get(ticket.assigned_agent_id)
                      : undefined;
                    const preview = buildMailLikeDisplay(ticket.description).preview || ticket.description;

                    return (
                      <tr key={ticket.id} className="align-top transition-colors hover:bg-muted/25">
                        <td className="p-2.5">
                          <Link to={`/tickets/${ticket.id}`} className="font-medium text-primary hover:underline">
                            {ticket.subject}
                          </Link>
                          <p className="mt-1 text-xs text-muted-foreground">
                            ID: {ticket.id} · Customer: {ticket.creator_id}
                          </p>
                        </td>

                        <td className="p-2.5 min-w-[140px] sm:min-w-[180px]">
                          <Select
                            value={ticket.status}
                            onValueChange={(value) => handleStatusChange(ticket.id, value as TicketStatus)}
                            disabled={statusBusyId === ticket.id || deleteBusyId === ticket.id}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {formatStatus(value, t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {statusBusyId === ticket.id ? (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {t('ticketsPage.updating')}
                            </p>
                          ) : null}
                        </td>

                        <td className="hidden p-2.5 min-w-[180px] sm:table-cell">
                          <p className="text-sm font-medium">
                            {assignedAgent?.full_name ?? (ticket.assigned_agent_id ? ticket.assigned_agent_id : t('ticketsPage.unassigned'))}
                          </p>
                          <p className="text-xs text-muted-foreground">{assignedAgent?.email ?? ''}</p>
                        </td>

                        <td className="hidden p-2.5 text-xs text-muted-foreground sm:table-cell">
                          {new Date(ticket.updated_at).toLocaleString()}
                        </td>

                        {role === 'admin' && (
                          <td className="hidden p-2.5 sm:table-cell">
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 rounded-full"
                                title={t('ticketsPage.assignAgent')}
                                disabled={assignBusyId === ticket.id || deleteBusyId === ticket.id}
                                onClick={() => setAssignDialogTicket(ticket)}
                              >
                                {assignBusyId === ticket.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <UserCog className="h-3.5 w-3.5" />
                                )}
                              </Button>

                              <Button
                                size="icon"
                                variant="destructive"
                                className="h-8 w-8 rounded-full"
                                title={t('ticketsPage.deleteTitle')}
                                disabled={deleteBusyId === ticket.id || assignBusyId === ticket.id}
                                onClick={() => handleDelete(ticket)}
                              >
                                {deleteBusyId === ticket.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t p-3">
              <span className="text-xs text-muted-foreground">{t('ticketsPage.total', { count: ticketsQ.data?.total ?? 0 })}</span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page * 20 >= (ticketsQ.data?.total ?? 0)}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <AssignAgentDialog
        open={assignDialogTicket !== null}
        onOpenChange={(open) => {
          if (!open) setAssignDialogTicket(null);
        }}
        ticket={assignDialogTicket}
        agents={agentsQ.data?.users ?? []}
        onAssign={handleAssign}
        isBusy={assignBusyId === assignDialogTicket?.id}
      />
    </div>
  );
}
