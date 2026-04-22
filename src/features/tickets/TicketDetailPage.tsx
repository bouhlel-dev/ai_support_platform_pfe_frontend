import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Brain, Loader2, Save, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { decisionsApi } from '@/shared/api/decisions';
import { ticketsApi } from '@/shared/api/tickets';
import { ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { PageSkeleton } from '@/shared/components/Skeletons';
import { ClientTicketAiHelpers } from '@/features/tickets/ClientTicketAiHelpers';
import type { Ticket, TicketPriority, TicketStatus } from '@/shared/types';
import { buildMailLikeDisplay, sanitizeTrackingUrl } from '@/shared/utils/mailLikeContent';

const STATUS_OPTIONS: TicketStatus[] = ['open', 'in_progress', 'escalated', 'resolved', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['low', 'medium', 'high', 'critical'];
const RESOLUTION_REQUIRED_STATUSES: TicketStatus[] = ['resolved', 'closed'];
const URL_REGEX = /(https?:\/\/[^\s<>")\]]+)/g;

function linkifyTextLine(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let urlIndex = 0;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(line)) !== null) {
    const rawUrl = match[0];
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(line.slice(lastIndex, start));
    }

    const url = sanitizeTrackingUrl(rawUrl);
    nodes.push(
      <a
        key={`${keyPrefix}-url-${urlIndex}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline break-all"
      >
        {url}
      </a>,
    );

    lastIndex = start + rawUrl.length;
    urlIndex += 1;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes.length ? nodes : [line];
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: ticket, isLoading, error, refetch } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => ticketsApi.get(id!),
    enabled: !!id,
  });

  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />;
  if (!ticket || !id) return null;

  if (user?.role === 'client') {
    return <ClientTicketDetailView id={id} ticket={ticket} />;
  }

  return <OperatorTicketDetailView id={id} ticket={ticket} />;
}

function OperatorTicketDetailView({ id, ticket }: { id: string; ticket: Ticket }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const descriptionDisplay = useMemo(() => buildMailLikeDisplay(ticket.description), [ticket.description]);

  const refreshTicketData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['tickets-command-center'] }),
      queryClient.invalidateQueries({ queryKey: ['tickets-command-center-totals'] }),
    ]);
  };

  const updatePriorityMutation = useMutation({
    mutationFn: (priority: TicketPriority) => ticketsApi.update(id, { priority }),
    onSuccess: async () => {
      await refreshTicketData();
      toast({ title: 'Ticket priority updated' });
    },
    onError: (mutationError) =>
      toast({
        variant: 'destructive',
        title: 'Priority update failed',
        description: normalizeError(mutationError),
      }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ status, resolutionNote }: { status: TicketStatus; resolutionNote?: string }) =>
      ticketsApi.updateStatus(id, {
        status,
        resolution_note: resolutionNote,
      }),
    onSuccess: async (updatedTicket) => {
      await refreshTicketData();
      toast({
        title: 'Ticket status updated',
        description: `${updatedTicket.subject} is now ${updatedTicket.status.replace(/_/g, ' ')}.`,
      });
    },
    onError: (mutationError) =>
      toast({
        variant: 'destructive',
        title: 'Status update failed',
        description: normalizeError(mutationError),
      }),
  });

  const handleStatusChange = (status: TicketStatus) => {
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

    updateStatusMutation.mutate({ status, resolutionNote });
  };

  const analyzeMutation = useMutation({
    mutationFn: () => decisionsApi.analyzeTicket(id),
    onSuccess: (result) =>
      toast({
        title: 'Analysis complete',
        description: `Outcome: ${result.outcome} (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
      }),
    onError: (mutationError) =>
      toast({
        variant: 'destructive',
        title: 'Analysis failed',
        description: normalizeError(mutationError),
      }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Link
        to="/tickets"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to tickets
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ID: {ticket.id} · Channel: {ticket.channel_source}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
        >
          <Brain className="mr-1 h-4 w-4" />
          Analyze
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Details</h3>
          <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Description</p>

            {descriptionDisplay.actionLinks.length ? (
              <div className="flex flex-wrap gap-2">
                {descriptionDisplay.actionLinks.map((action) => (
                  <a
                    key={`${ticket.id}-${action.label}-${action.url}`}
                    href={action.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    {action.label}
                  </a>
                ))}
              </div>
            ) : null}

            <div className="space-y-1.5 text-sm text-muted-foreground">
              {descriptionDisplay.textLines.length ? (
                descriptionDisplay.textLines.map((line, lineIndex) =>
                  line ? (
                    <p key={`${ticket.id}-line-${lineIndex}`} className="whitespace-pre-wrap break-words leading-relaxed">
                      {linkifyTextLine(line, `${ticket.id}-${lineIndex}`)}
                    </p>
                  ) : (
                    <div key={`${ticket.id}-line-${lineIndex}`} className="h-2" />
                  ),
                )
              ) : (
                <p className="text-xs text-muted-foreground">No description available.</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3 text-xs text-muted-foreground space-y-1.5">
            <p>ID: {ticket.id}</p>
            <p>Channel: {ticket.channel_source || '-'}</p>
            <p>Source email: {ticket.source_email_id || '-'}</p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={ticket.status} />
            <StatusBadge status={ticket.priority} />
          </div>
          <p className="text-xs text-muted-foreground">
            Created: {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">Actions</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select
                value={ticket.status}
                onValueChange={(value) => handleStatusChange(value as TicketStatus)}
                disabled={updateStatusMutation.isPending || updatePriorityMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Priority</label>
              <Select
                value={ticket.priority}
                onValueChange={(value) => updatePriorityMutation.mutate(value as TicketPriority)}
                disabled={updateStatusMutation.isPending || updatePriorityMutation.isPending}
              >
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
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientTicketDetailView({ id, ticket }: { id: string; ticket: Ticket }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const descriptionDisplay = useMemo(() => buildMailLikeDisplay(description), [description]);

  const clientStatusOptions = useMemo(() => {
    if (ticket.status === 'closed') {
      return ['closed'] as TicketStatus[];
    }
    return [ticket.status, 'closed'] as TicketStatus[];
  }, [ticket.status]);

  useEffect(() => {
    setSubject(ticket.subject);
    setDescription(ticket.description);
    setStatus(ticket.status);
    setPriority(ticket.priority);
  }, [ticket]);

  const updateMutation = useMutation({
    mutationFn: () =>
      ticketsApi.update(id, {
        subject: subject.trim(),
        description: description.trim(),
        status,
        priority,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ticket', id] }),
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      ]);
      toast({
        title: 'Ticket updated',
        description: 'Your changes have been saved.',
      });
    },
    onError: (mutationError) =>
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: normalizeError(mutationError),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => ticketsApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({
        title: 'Ticket deleted',
        description: 'The ticket has been removed from your portal.',
      });
      navigate('/tickets');
    },
    onError: (mutationError) =>
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: normalizeError(mutationError),
      }),
  });

  const handleDelete = () => {
    if (deleteMutation.isPending) {
      return;
    }
    if (!window.confirm('Delete this ticket from your portal?')) {
      return;
    }
    deleteMutation.mutate();
  };

  const handleSave = () => {
    if (!subject.trim() || !description.trim() || updateMutation.isPending) {
      return;
    }
    updateMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link
        to="/tickets"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back to tickets
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manage Ticket</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Update the details below, save your changes, or remove the ticket entirely.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <StatusBadge status={priority} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="ticket-detail-subject">
              Subject
            </label>
            <Input
              id="ticket-detail-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Ticket subject"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="ticket-detail-description">
              Description
            </label>
            <Textarea
              id="ticket-detail-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the issue in detail"
              className="min-h-52"
            />

            {descriptionDisplay.actionLinks.length ? (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Detected action links</p>
                <div className="flex flex-wrap gap-2">
                  {descriptionDisplay.actionLinks.map((action) => (
                    <a
                      key={`${ticket.id}-${action.label}-${action.url}`}
                      href={action.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      {action.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={(value) => setStatus(value as TicketStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clientStatusOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>ID: {ticket.id}</p>
            <p className="mt-1">Channel: {ticket.channel_source}</p>
            <p className="mt-1">Created: {new Date(ticket.created_at).toLocaleString()}</p>
            <p className="mt-1">Last updated: {new Date(ticket.updated_at).toLocaleString()}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSave}
              disabled={!subject.trim() || !description.trim() || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Ticket
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
