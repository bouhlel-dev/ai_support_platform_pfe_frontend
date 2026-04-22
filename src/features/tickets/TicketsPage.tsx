import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Plus, Search, Trash2, UserCog } from 'lucide-react';

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

function formatStatus(status: TicketStatus | 'all') {
  if (status === 'all') return 'All';
  return status.replace(/_/g, ' ');
}

function formatAgentLabel(agent: ManagedUser) {
  return `${agent.full_name} (${agent.email})`;
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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
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
        title: 'Ticket created',
        description: 'Your ticket is now available in the list below.',
      });
    },
    onError: (mutationError) =>
      toast({
        variant: 'destructive',
        title: 'Ticket creation failed',
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

  const emptyTitle = hasFilters ? 'No tickets match your filters' : 'No tickets found';
  const emptyDescription = hasFilters
    ? 'Try a different keyword or adjust the created date range.'
    : 'Create your first ticket to start tracking support work.';

  return (
    <>
      <div className="mx-auto max-w-7xl space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tickets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create, track, and update support requests from one place.
            </p>
          </div>
          <Button size="sm" className="h-9 rounded-full px-3.5" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New Ticket
          </Button>
        </div>

        <div className="rounded-xl border bg-card/70 p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-1 md:col-span-2 xl:col-span-2">
              <p className="text-xs text-muted-foreground">Search</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tickets..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Created from</p>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Created to</p>
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
                Clear filters
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {tickets.length} of {data?.total ?? 0} tickets.
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
                      <th className="p-3 text-left font-medium text-muted-foreground">Subject</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Priority</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Channel</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Created</th>
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
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed max-w-[52ch]">
                              {preview}
                            </p>
                          </td>
                          <td className="p-2.5">
                            <StatusBadge status={ticket.status} />
                          </td>
                          <td className="p-2.5">
                            <StatusBadge status={ticket.priority} />
                          </td>
                          <td className="p-2.5 text-muted-foreground">{ticket.channel_source}</td>
                          <td className="p-2.5 text-muted-foreground">
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t p-3">
                <span className="text-xs text-muted-foreground">{data?.total ?? 0} total</span>
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
                    onClick={() => setPage((currentPage) => currentPage + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
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
            <DialogTitle>Create Ticket</DialogTitle>
            <DialogDescription>
              Add a subject, describe the issue, and choose the urgency level.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ticket-subject">
                Subject
              </label>
              <Input
                id="ticket-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Example: Need help with billing"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ticket-description">
                Description
              </label>
              <Textarea
                id="ticket-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Tell us what happened and what you need."
                className="min-h-32"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
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
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!subject.trim() || !description.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating
                </>
              ) : (
                'Create Ticket'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OperatorTicketsCommandCenter({ role }: { role: OperatorRole }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [statusTab, setStatusTab] = useState<'all' | TicketStatus>('all');
  const [search, setSearch] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [assignBusyId, setAssignBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

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
        title: 'Ticket status updated',
        description: `${updatedTicket.subject} is now ${updatedTicket.status.replace(/_/g, ' ')}.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Status update failed',
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
      toast({ title: 'Ticket assigned' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Assignment failed',
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
      toast({ title: 'Ticket deleted' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
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
      const input = window.prompt('Add a resolution note (minimum 5 characters).', '')?.trim();
      if (!input) {
        return;
      }

      if (input.length < 5) {
        toast({
          variant: 'destructive',
          title: 'Resolution note required',
          description: 'Provide at least 5 characters for resolved or closed tickets.',
        });
        return;
      }

      resolutionNote = input;
    }

    updateStatusMut.mutate({ ticketId, status, resolutionNote });
  };

  const handleAssign = (ticket: Ticket) => {
    const nextAgentId = assignmentDrafts[ticket.id] ?? ticket.assigned_agent_id ?? '';
    if (!nextAgentId || nextAgentId === ticket.assigned_agent_id) {
      return;
    }
    assignMut.mutate({ ticketId: ticket.id, agentId: nextAgentId });
  };

  const handleDelete = (ticket: Ticket) => {
    if (deleteMut.isPending) {
      return;
    }
    if (!window.confirm(`Delete "${ticket.subject}"? This action cannot be undone.`)) {
      return;
    }
    deleteMut.mutate(ticket.id);
  };

  const currentRoleBanner =
    role === 'admin'
      ? 'Super-admin parity active: mapped to admin role in this project.'
      : 'Admin parity active: mapped to agent role in this project.';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ticket Command Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status tabs, inline lifecycle updates, and assignment workflow for operations teams.
          </p>
        </div>
        <div className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
          {currentRoleBanner}
        </div>
      </div>

      <div className="rounded-xl border bg-card/70 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab}
              type="button"
              size="sm"
              variant={statusTab === tab ? 'default' : 'ghost'}
              className="h-8 rounded-full px-3"
              onClick={() => {
                setStatusTab(tab);
                setPage(1);
              }}
            >
              {formatStatus(tab)}
              <span className="ml-1.5 rounded-full bg-background/60 px-1.5 py-0.5 text-[11px]">
                {totalsQ.data?.[tab] ?? 0}
              </span>
            </Button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1 md:col-span-2 xl:col-span-2">
            <p className="text-xs text-muted-foreground">Search</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by ticket, customer ID, agent, or channel"
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Created from</p>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Created to</p>
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
              Clear filters
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing {filteredTickets.length} of {ticketsQ.data?.total ?? 0} tickets.
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
            title="No tickets"
            description={
              hasFilters
                ? 'No tickets match your search for this status view.'
                : 'No tickets found for the selected status.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-card/50">
                    <th className="p-3 text-left font-medium text-muted-foreground">Ticket</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Priority</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Assigned</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Updated</th>
                    <th className="p-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTickets.map((ticket) => {
                    const assignedAgent = ticket.assigned_agent_id
                      ? agentLookup.get(ticket.assigned_agent_id)
                      : undefined;
                    const assignmentValue = assignmentDrafts[ticket.id] ?? ticket.assigned_agent_id ?? '';
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
                          <p className="mt-1 text-xs text-muted-foreground">
                            Channel: {ticket.channel_source || '-'}
                          </p>
                          <p className="mt-1.5 line-clamp-2 max-w-[56ch] text-xs text-muted-foreground leading-relaxed">
                            {preview}
                          </p>
                        </td>

                        <td className="p-2.5">
                          <StatusBadge status={ticket.priority} />
                        </td>

                        <td className="p-2.5 min-w-[180px]">
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
                                  {formatStatus(value)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {statusBusyId === ticket.id ? (
                            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Updating...
                            </p>
                          ) : null}
                        </td>

                        <td className="p-2.5 min-w-[220px]">
                          <p className="text-sm font-medium">
                            {assignedAgent?.full_name ?? (ticket.assigned_agent_id ? ticket.assigned_agent_id : 'Unassigned')}
                          </p>
                          <p className="text-xs text-muted-foreground">{assignedAgent?.email ?? ''}</p>
                        </td>

                        <td className="p-2.5 text-xs text-muted-foreground">
                          {new Date(ticket.updated_at).toLocaleString()}
                        </td>

                        <td className="p-2.5 min-w-[250px]">
                          {role === 'admin' ? (
                            <div className="space-y-2">
                              <div className="inline-flex w-full items-center gap-2">
                                <Select
                                  value={assignmentValue}
                                  onValueChange={(value) =>
                                    setAssignmentDrafts((current) => ({
                                      ...current,
                                      [ticket.id]: value,
                                    }))
                                  }
                                  disabled={assignBusyId === ticket.id || deleteBusyId === ticket.id || agentsQ.isLoading}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select agent" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(agentsQ.data?.users ?? []).map((agent) => (
                                      <SelectItem key={agent.id} value={agent.id}>
                                        {formatAgentLabel(agent)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-full"
                                  disabled={
                                    assignBusyId === ticket.id ||
                                    deleteBusyId === ticket.id ||
                                    !assignmentValue ||
                                    assignmentValue === ticket.assigned_agent_id
                                  }
                                  onClick={() => handleAssign(ticket)}
                                >
                                  <UserCog className="mr-1 h-3.5 w-3.5" />
                                  Assign
                                </Button>

                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8 rounded-full"
                                  disabled={deleteBusyId === ticket.id || assignBusyId === ticket.id}
                                  onClick={() => handleDelete(ticket)}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  Delete
                                </Button>
                              </div>

                              {assignBusyId === ticket.id ? (
                                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Assigning...
                                </p>
                              ) : null}

                              {deleteBusyId === ticket.id ? (
                                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Deleting...
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Assignment is managed by admin role.</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t p-3">
              <span className="text-xs text-muted-foreground">{ticketsQ.data?.total ?? 0} total</span>
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
    </div>
  );
}
