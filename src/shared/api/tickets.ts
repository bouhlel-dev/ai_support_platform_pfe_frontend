import { apiClient } from './client';
import type {
  SimilarTicket,
  SimilarTicketsResult,
  Ticket,
  TicketClassifyResult,
  TicketListResponse,
  TicketPriority,
  TicketReformulateResult,
  TicketStatus,
  TicketTotalsResponse,
} from '@/shared/types';

function normalizeTicketStatus(status: string): TicketStatus {
  const raw = (status || '').toUpperCase();
  if (raw === 'OPEN') return 'open';
  if (raw === 'IN_PROGRESS' || raw === 'WAITING_ON_CUSTOMER') return 'in_progress';
  if (raw === 'ESCALATED') return 'escalated';
  if (raw === 'RESOLVED') return 'resolved';
  if (raw === 'CLOSED') return 'closed';
  return 'open';
}

function normalizeTicketPriority(priority: string): TicketPriority {
  const raw = (priority || '').toUpperCase();
  if (raw === 'LOW') return 'low';
  if (raw === 'MEDIUM') return 'medium';
  if (raw === 'HIGH') return 'high';
  if (raw === 'CRITICAL') return 'critical';
  return 'medium';
}

function mapTicket(ticket: any): Ticket {
  return {
    id: String(ticket.id),
    subject: String(ticket.subject ?? ''),
    description: String(ticket.description ?? ''),
    status: normalizeTicketStatus(ticket.status),
    priority: normalizeTicketPriority(ticket.priority),
    channel_source: String(ticket.channel_source ?? ''),
    escalation_flag: !!ticket.escalation_flag,
    creator_id: String(ticket.creator_id ?? ''),
    assigned_agent_id: ticket.assigned_agent_id ? String(ticket.assigned_agent_id) : undefined,
    source_email_id: ticket.source_email_id ? String(ticket.source_email_id) : undefined,
    conversation_id: ticket.conversation_id ? String(ticket.conversation_id) : undefined,
    source_voice_call_id: ticket.source_voice_call_id ? String(ticket.source_voice_call_id) : null,
    resolution_note: ticket.resolution_note ?? null,
    solved_by_id: ticket.solved_by_id ? String(ticket.solved_by_id) : null,
    resolved_at: ticket.resolved_at ?? null,
    created_at: String(ticket.created_at),
    updated_at: String(ticket.updated_at),
  };
}

function denormalizeTicketStatus(status: TicketStatus): string {
  switch (status) {
    case 'open':
      return 'OPEN';
    case 'in_progress':
      return 'IN_PROGRESS';
    case 'escalated':
      return 'ESCALATED';
    case 'resolved':
      return 'RESOLVED';
    case 'closed':
      return 'CLOSED';
  }
}

function denormalizeTicketPriority(priority: TicketPriority): string {
  switch (priority) {
    case 'low':
      return 'LOW';
    case 'medium':
      return 'MEDIUM';
    case 'high':
      return 'HIGH';
    case 'critical':
      return 'CRITICAL';
  }
}

function buildTicketPayload(data: Partial<Ticket>) {
  return {
    subject: data.subject,
    description: data.description,
    status: data.status ? denormalizeTicketStatus(data.status) : undefined,
    priority: data.priority ? denormalizeTicketPriority(data.priority) : undefined,
    channel_source: data.channel_source ? String(data.channel_source).toUpperCase() : undefined,
    assigned_agent_id: data.assigned_agent_id,
    conversation_id: data.conversation_id,
    source_voice_call_id: data.source_voice_call_id,
    escalation_flag: data.escalation_flag,
  };
}

function mapClassifyResult(raw: any): TicketClassifyResult {
  return {
    available: Boolean(raw?.available),
    category: raw?.category ?? null,
    category_label: raw?.category_label ?? null,
    priority: raw?.priority ?? null,
    priority_label: raw?.priority_label ?? null,
    urgency: raw?.urgency ?? null,
    confidence: raw?.confidence ?? null,
    solutions: Array.isArray(raw?.solutions) ? raw.solutions.map((item: unknown) => String(item)) : [],
  };
}

function mapReformulateResult(raw: any): TicketReformulateResult {
  return {
    available: Boolean(raw?.available),
    reformulated: String(raw?.reformulated ?? ''),
  };
}

function mapSimilarTicket(raw: any): SimilarTicket {
  return {
    id: raw?.id ? String(raw.id) : undefined,
    title: String(raw?.title ?? ''),
    description: raw?.description ?? null,
    solution: raw?.solution ?? null,
    source: String(raw?.source ?? 'local'),
  };
}

export const ticketsApi = {
  list: (
    params?: {
      page?: number;
      size?: number;
      status?: TicketStatus;
      priority?: TicketPriority;
      includeTotal?: boolean;
    },
  ) => {
    const page = params?.page ?? 1;
    const size = params?.size ?? 20;
    const skip = Math.max(0, page - 1) * size;

    return apiClient<any>('/tickets', {
      params: {
        status: params?.status ? String(params.status).toUpperCase() : undefined,
        priority: params?.priority ? String(params.priority).toUpperCase() : undefined,
        include_total: params?.includeTotal === false ? 'false' : undefined,
        skip: String(skip),
        limit: String(size),
      } as any,
    }).then((response): TicketListResponse => ({
      tickets: Array.isArray(response?.tickets) ? response.tickets.map(mapTicket) : [],
      total: Number(response?.total ?? 0),
    }));
  },
  totals: (params?: { priority?: TicketPriority }) =>
    apiClient<any>('/tickets/totals', {
      params: {
        priority: params?.priority ? String(params.priority).toUpperCase() : undefined,
      },
    }).then((response): TicketTotalsResponse => ({
      total: Number(response?.total ?? 0),
      open: Number(response?.open ?? 0),
      in_progress: Number(response?.in_progress ?? 0),
      escalated: Number(response?.escalated ?? 0),
      resolved: Number(response?.resolved ?? 0),
      closed: Number(response?.closed ?? 0),
    })),
  get: (id: string) => apiClient<any>(`/tickets/${id}`).then(mapTicket),
  create: (data: Partial<Ticket>) =>
    apiClient<any>('/tickets', {
      method: 'POST',
      body: JSON.stringify(buildTicketPayload(data)),
    }).then(mapTicket),
  update: (id: string, data: Partial<Ticket>) =>
    apiClient<any>(`/tickets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(buildTicketPayload(data)),
    }).then(mapTicket),
  updateStatus: (id: string, payload: { status: TicketStatus; resolution_note?: string }) =>
    apiClient<any>(`/tickets/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: denormalizeTicketStatus(payload.status),
        resolution_note: payload.resolution_note,
      }),
    }).then(mapTicket),
  delete: (id: string) => apiClient<void>(`/tickets/${id}`, { method: 'DELETE' }),
  assign: (id: string, agentId: string) =>
    apiClient<any>(`/tickets/${id}/assign/${agentId}`, { method: 'POST' }).then(mapTicket),
  classify: (payload: { title: string; description: string }) =>
    apiClient<any>('/tickets/classify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(mapClassifyResult),
  reformulate: (payload: { title: string; description: string }) =>
    apiClient<any>('/tickets/reformulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(mapReformulateResult),
  similar: (query: string): Promise<SimilarTicketsResult> =>
    apiClient<any>('/tickets/similar', {
      params: {
        q: query,
      },
    }).then((response) => ({
      tickets: Array.isArray(response?.tickets) ? response.tickets.map(mapSimilarTicket) : [],
    })),
};
