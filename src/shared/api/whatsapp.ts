import { apiClient } from './client';
import type {
  WhatsAppConversationSummary,
  WhatsAppConversationDetail,
  WhatsAppInbox,
  WhatsAppMarkReadResult,
  WhatsAppStatus,
} from '@/shared/types';

type WhatsAppInboxParams = {
  status?: string;
  unreadOnly?: boolean;
  skip?: number;
  limit?: number;
};

type WhatsAppThreadParams = {
  skip?: number;
  limit?: number;
};

type WhatsAppSummaryParams = {
  maxMessages?: number;
};

export const whatsappApi = {
  inbox: (params: WhatsAppInboxParams = {}) =>
    apiClient<WhatsAppInbox>('/whatsapp/inbox', {
      params: {
        status: params.status,
        unread_only: params.unreadOnly ? 'true' : undefined,
        skip: params.skip !== undefined ? String(params.skip) : undefined,
        limit: params.limit !== undefined ? String(params.limit) : undefined,
      },
    }),

  thread: (conversationId: string, params: WhatsAppThreadParams = {}) =>
    apiClient<WhatsAppConversationDetail>(`/whatsapp/inbox/${conversationId}`, {
      params: {
        skip: params.skip !== undefined ? String(params.skip) : undefined,
        limit: params.limit !== undefined ? String(params.limit) : undefined,
      },
    }),

  summary: (conversationId: string, params: WhatsAppSummaryParams = {}) =>
    apiClient<WhatsAppConversationSummary>(`/whatsapp/inbox/${conversationId}/summary`, {
      method: 'POST',
      params: {
        max_messages: params.maxMessages !== undefined ? String(params.maxMessages) : undefined,
      },
    }),

  reply: (
    conversationId: string,
    message: string,
    options?: {
      usedAssistedDraft?: boolean;
      assistedDraftEdited?: boolean;
      assistedDraftGeneratedAt?: string;
    },
  ) =>
    apiClient<any>(`/whatsapp/reply/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        used_assisted_draft: Boolean(options?.usedAssistedDraft),
        ...(options?.usedAssistedDraft
          ? {
            assisted_draft_edited: options.assistedDraftEdited,
            assisted_draft_generated_at: options.assistedDraftGeneratedAt,
          }
          : {}),
      }),
    }),

  markRead: (conversationId: string, messageIds?: string[]) =>
    apiClient<WhatsAppMarkReadResult>(`/whatsapp/inbox/${conversationId}/read`, {
      method: 'POST',
      body: JSON.stringify({
        message_ids: messageIds && messageIds.length > 0 ? messageIds : null,
      }),
    }),

  send: (toNumber: string, message: string) =>
    apiClient<any>('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ to_number: toNumber, message }),
    }),

  status: () =>
    apiClient<any>('/whatsapp/status').then((res): WhatsAppStatus => ({
      connected: !!res.configured,
      provider: String(res.provider ?? ''),
    })),
};
