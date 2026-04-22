import { apiBlobClient, apiClient, apiStreamClient } from './client';
import type {
  ConversationAiJobQueued,
  ConversationAssistedDraft,
  ConversationAssistedDraftJobStatus,
  ConversationAgentReplySuspension,
  ConversationAutoReplyPolicy,
  ConversationSnippet,
  ConversationSnippetListResponse,
  ConversationSlaActionResult,
  ConversationSlaPredictor,
  Conversation,
  ConversationSummaryJobStatus,
  ConversationSummary,
  ConversationStreamDone,
  ConversationStreamError,
  ConversationStreamMeta,
  ConversationStreamStatus,
  ConversationStreamToken,
  Message,
} from '@/shared/types';

type ConversationSummaryParams = {
  maxMessages?: number;
};

type ConversationListParams = {
  status?: string;
  channel?: string;
  includeTotal?: boolean;
  skip?: number;
  limit?: number;
};

type ConversationMessagesParams = {
  skip?: number;
  limit?: number;
};

type ConversationAgentReplySuspensionPayload = {
  suspended: boolean;
  reason?: string | null;
};

type ConversationAutoReplyPayload = {
  ai_auto_reply_enabled: boolean;
};

type ConversationAutoReplyPausePayload = {
  minutes?: number;
  pause_until?: string;
  clear?: boolean;
};

type ConversationSnippetPayload = {
  title: string;
  body: string;
  description?: string | null;
  shortcut?: string | null;
  channel?: string | null;
  is_active?: boolean;
};

function normalizeTicketPriority(priority?: string | null): 'low' | 'medium' | 'high' | 'critical' | null {
  const raw = String(priority ?? '').toUpperCase();
  if (raw === 'LOW') return 'low';
  if (raw === 'MEDIUM') return 'medium';
  if (raw === 'HIGH') return 'high';
  if (raw === 'CRITICAL') return 'critical';
  return null;
}

function mapConversationSlaPredictor(raw: any): ConversationSlaPredictor {
  return {
    conversation_id: String(raw?.conversation_id ?? ''),
    channel: String(raw?.channel ?? ''),
    pending_customer_message_id: raw?.pending_customer_message_id ? String(raw.pending_customer_message_id) : null,
    pending_customer_message_at: raw?.pending_customer_message_at ? String(raw.pending_customer_message_at) : null,
    latest_agent_reply_at: raw?.latest_agent_reply_at ? String(raw.latest_agent_reply_at) : null,
    reply_due_at: raw?.reply_due_at ? String(raw.reply_due_at) : null,
    seconds_remaining: raw?.seconds_remaining ?? null,
    risk_level: String(raw?.risk_level ?? 'low').toLowerCase() as ConversationSlaPredictor['risk_level'],
    at_risk: Boolean(raw?.at_risk ?? false),
    breached: Boolean(raw?.breached ?? false),
    snoozed: Boolean(raw?.snoozed ?? false),
    snoozed_until: raw?.snoozed_until ? String(raw.snoozed_until) : null,
    triggers: Array.isArray(raw?.triggers)
      ? raw.triggers.map((trigger: any) => ({
          key: String(trigger?.key ?? 'no_agent_reply_within_sla') as ConversationSlaPredictor['triggers'][number]['key'],
          reason: String(trigger?.reason ?? ''),
          meta: trigger?.meta && typeof trigger.meta === 'object' ? trigger.meta : {},
        }))
      : [],
    recommended_actions: Array.isArray(raw?.recommended_actions)
      ? raw.recommended_actions
        .map((action: unknown) => String(action ?? '').toLowerCase())
        .filter((action: string): action is 'escalate' | 'assign' | 'snooze' =>
          action === 'escalate' || action === 'assign' || action === 'snooze'
        )
      : [],
    escalation_ticket_id: raw?.escalation_ticket_id ? String(raw.escalation_ticket_id) : null,
    escalation_ticket_priority: normalizeTicketPriority(raw?.escalation_ticket_priority),
    generated_at: String(raw?.generated_at ?? new Date().toISOString()),
  };
}

function mapConversationSlaActionResult(raw: any): ConversationSlaActionResult {
  return {
    conversation_id: String(raw?.conversation_id ?? ''),
    action: String(raw?.action ?? 'escalate').toLowerCase() as ConversationSlaActionResult['action'],
    success: Boolean(raw?.success ?? false),
    ticket_id: raw?.ticket_id ? String(raw.ticket_id) : null,
    assigned_agent_id: raw?.assigned_agent_id ? String(raw.assigned_agent_id) : null,
    snoozed_until: raw?.snoozed_until ? String(raw.snoozed_until) : null,
    predictor: mapConversationSlaPredictor(raw?.predictor ?? {}),
  };
}

function mapConversationSnippet(raw: any): ConversationSnippet {
  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title ?? ''),
    body: String(raw?.body ?? ''),
    description: raw?.description ?? null,
    shortcut: raw?.shortcut ?? null,
    channel: raw?.channel ?? null,
    is_active: Boolean(raw?.is_active ?? true),
    created_by_id: raw?.created_by_id ? String(raw.created_by_id) : null,
    updated_by_id: raw?.updated_by_id ? String(raw.updated_by_id) : null,
    created_at: String(raw?.created_at ?? ''),
    updated_at: String(raw?.updated_at ?? ''),
  };
}

const CONVERSATION_AI_JOB_POLL_INTERVAL_MS = 1_000;
const CONVERSATION_AI_JOB_TIMEOUT_MS = 90_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForSummaryJob(conversationId: string, jobId: string): Promise<ConversationSummary> {
  const startedAt = Date.now();

  while (true) {
    const status = await apiClient<ConversationSummaryJobStatus>(
      `/conversations/${conversationId}/summary/jobs/${jobId}`,
    );

    if (status.status === 'succeeded') {
      if (status.summary) {
        return status.summary;
      }
      throw new Error('Conversation summary job succeeded without summary payload');
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Conversation summary generation failed');
    }

    if (Date.now() - startedAt >= CONVERSATION_AI_JOB_TIMEOUT_MS) {
      throw new Error('Conversation summary job timed out');
    }

    await sleep(CONVERSATION_AI_JOB_POLL_INTERVAL_MS);
  }
}

async function waitForAssistedDraftJob(
  conversationId: string,
  jobId: string,
): Promise<ConversationAssistedDraft> {
  const startedAt = Date.now();

  while (true) {
    const status = await apiClient<ConversationAssistedDraftJobStatus>(
      `/conversations/${conversationId}/assisted-draft/jobs/${jobId}`,
    );

    if (status.status === 'succeeded') {
      if (status.assisted_draft) {
        return status.assisted_draft;
      }
      throw new Error('Assisted draft job succeeded without draft payload');
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Assisted draft generation failed');
    }

    if (Date.now() - startedAt >= CONVERSATION_AI_JOB_TIMEOUT_MS) {
      throw new Error('Assisted draft generation job timed out');
    }

    await sleep(CONVERSATION_AI_JOB_POLL_INTERVAL_MS);
  }
}

export const conversationsApi = {
  create: (payload?: { subject?: string; channel?: string }) =>
    apiClient<Conversation>('/conversations', {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  list: (params: ConversationListParams = {}) =>
    apiClient<{ conversations: Conversation[]; total: number }>('/conversations', {
      params: {
        status: params.status,
        channel: params.channel ? String(params.channel).toUpperCase() : undefined,
        include_total: params.includeTotal === false ? 'false' : undefined,
        skip: params.skip !== undefined ? String(params.skip) : undefined,
        limit: params.limit !== undefined ? String(params.limit) : undefined,
      },
    }).then((res) => res.conversations),
  get: (id: string) => apiClient<Conversation>(`/conversations/${id}`),
  update: (
    id: string,
    payload: { status?: string; subject?: string; is_pinned?: boolean },
  ) =>
    apiClient<Conversation>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  delete: (id: string) => apiClient<void>(`/conversations/${id}`, { method: 'DELETE' }),
  messages: (id: string, params: ConversationMessagesParams = {}) =>
    apiClient<Message[]>(`/conversations/${id}/messages`, {
      params: {
        skip: params.skip !== undefined ? String(params.skip) : undefined,
        limit: params.limit !== undefined ? String(params.limit) : undefined,
      },
    }),
  send: (
    id: string,
    content: string,
    options?: {
      usedAssistedDraft?: boolean;
      assistedDraftEdited?: boolean;
      assistedDraftGeneratedAt?: string;
    },
  ) =>
    apiClient<Message>(`/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        used_assisted_draft: Boolean(options?.usedAssistedDraft),
        ...(options?.usedAssistedDraft
          ? {
            assisted_draft_edited: options.assistedDraftEdited,
            assisted_draft_generated_at: options.assistedDraftGeneratedAt,
          }
          : {}),
      }),
    }),
  sendAttachment: (id: string, payload: { file: File; content?: string; isInternal?: boolean }) => {
    const formData = new FormData();
    formData.append('file', payload.file);
    if (payload.content) {
      formData.append('content', payload.content);
    }
    if (payload.isInternal) {
      formData.append('is_internal', 'true');
    }

    return apiClient<Message>(`/conversations/${id}/messages/attachment`, {
      method: 'POST',
      body: formData,
    });
  },
  summary: (id: string, params: ConversationSummaryParams = {}) =>
    apiClient<ConversationAiJobQueued>(`/conversations/${id}/summary/jobs`, {
      method: 'POST',
      params: {
        max_messages: params.maxMessages !== undefined ? String(params.maxMessages) : undefined,
      },
    }).then((job) => waitForSummaryJob(id, job.job_id)),
  agentReplySuspension: (conversationId: string, agentId: string) =>
    apiClient<ConversationAgentReplySuspension>(
      `/conversations/${conversationId}/agent-reply-suspensions/${agentId}`,
    ),
  setAgentReplySuspension: (
    conversationId: string,
    agentId: string,
    payload: ConversationAgentReplySuspensionPayload,
  ) =>
    apiClient<ConversationAgentReplySuspension>(
      `/conversations/${conversationId}/agent-reply-suspensions/${agentId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          suspended: payload.suspended,
          reason: payload.reason ?? null,
        }),
      },
    ),
  conversationAutoReply: (conversationId: string) =>
    apiClient<ConversationAutoReplyPolicy>(`/conversations/${conversationId}/ai-auto-reply`),
  setConversationAutoReply: (
    conversationId: string,
    payload: ConversationAutoReplyPayload,
  ) =>
    apiClient<ConversationAutoReplyPolicy>(`/conversations/${conversationId}/ai-auto-reply`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  setConversationAutoReplyPause: (
    conversationId: string,
    payload: ConversationAutoReplyPausePayload,
  ) =>
    apiClient<ConversationAutoReplyPolicy>(`/conversations/${conversationId}/ai-auto-reply/pause`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  clearConversationAutoReplyPause: (conversationId: string) =>
    apiClient<ConversationAutoReplyPolicy>(`/conversations/${conversationId}/ai-auto-reply/pause`, {
      method: 'DELETE',
    }),
  assistedDraft: (conversationId: string) =>
    apiClient<ConversationAiJobQueued>(`/conversations/${conversationId}/assisted-draft/jobs`, {
      method: 'POST',
    }).then((job) => waitForAssistedDraftJob(conversationId, job.job_id)),
  slaPredictor: (conversationId: string) =>
    apiClient<any>(`/conversations/${conversationId}/sla-predictor`).then(mapConversationSlaPredictor),
  slaEscalate: (conversationId: string, payload?: { note?: string }) =>
    apiClient<any>(`/conversations/${conversationId}/sla-actions/escalate`, {
      method: 'POST',
      body: JSON.stringify({ note: payload?.note }),
    }).then(mapConversationSlaActionResult),
  slaAssign: (conversationId: string, payload?: { agent_id?: string }) =>
    apiClient<any>(`/conversations/${conversationId}/sla-actions/assign`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: payload?.agent_id }),
    }).then(mapConversationSlaActionResult),
  slaSnooze: (conversationId: string, payload: { minutes: number }) =>
    apiClient<any>(`/conversations/${conversationId}/sla-actions/snooze`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }).then(mapConversationSlaActionResult),
  listSnippets: (params: { channel?: string; includeInactive?: boolean } = {}): Promise<ConversationSnippetListResponse> =>
    apiClient<any>('/conversations/automation/snippets', {
      params: {
        channel: params.channel ? String(params.channel).toUpperCase() : undefined,
        include_inactive: params.includeInactive ? 'true' : undefined,
      },
    }).then((response) => ({
      snippets: Array.isArray(response?.snippets)
        ? response.snippets.map(mapConversationSnippet)
        : [],
      total: Number(response?.total ?? 0),
    })),
  createSnippet: (payload: ConversationSnippetPayload) =>
    apiClient<any>('/conversations/automation/snippets', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        channel: payload.channel ? payload.channel.toUpperCase() : null,
      }),
    }).then(mapConversationSnippet),
  updateSnippet: (snippetId: string, payload: Partial<ConversationSnippetPayload>) =>
    apiClient<any>(`/conversations/automation/snippets/${snippetId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...payload,
        channel: payload.channel === undefined
          ? undefined
          : payload.channel
            ? payload.channel.toUpperCase()
            : null,
      }),
    }).then(mapConversationSnippet),
  deleteSnippet: (snippetId: string) =>
    apiClient<void>(`/conversations/automation/snippets/${snippetId}`, { method: 'DELETE' }),
  sendStream: (
    payload: { conversationId?: string; content: string; subject?: string },
    handlers: {
      onMeta?: (event: ConversationStreamMeta) => void | Promise<void>;
      onStatus?: (event: ConversationStreamStatus) => void | Promise<void>;
      onToken?: (event: ConversationStreamToken) => void | Promise<void>;
      onDone?: (event: ConversationStreamDone) => void | Promise<void>;
      onError?: (event: ConversationStreamError) => void | Promise<void>;
    },
    signal?: AbortSignal,
  ) =>
    apiStreamClient(
      '/conversations/stream',
      async (event) => {
        switch (event.event) {
          case 'meta':
            await handlers.onMeta?.(event.data as ConversationStreamMeta);
            break;
          case 'status':
            await handlers.onStatus?.(event.data as ConversationStreamStatus);
            break;
          case 'token':
            await handlers.onToken?.(event.data as ConversationStreamToken);
            break;
          case 'done':
            await handlers.onDone?.(event.data as ConversationStreamDone);
            break;
          case 'error':
            await handlers.onError?.(event.data as ConversationStreamError);
            break;
          default:
            break;
        }
      },
      {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: payload.conversationId,
          content: payload.content,
          subject: payload.subject,
        }),
        signal,
      },
    ),
  attachmentBlob: (conversationId: string, messageId: string) =>
    apiBlobClient(`/conversations/${conversationId}/messages/${messageId}/attachment`),
};
