import { apiClient } from './client';
import type {
  EmailAssistedDraftResponse,
  EmailBulkAction,
  EmailBulkActionResponse,
  EmailComposeRequest,
  EmailComposeResponse,
  EmailFlagUpdateRequest,
  Email,
  EmailListResponse,
  EmailMailboxFolder,
  EmailReplyRequest,
  EmailReplyResponse,
  GmailAuthURL,
  GmailStatus,
  GmailSyncResult,
} from '@/shared/types';

export const emailApi = {
  list: (params?: {
    folder?: EmailMailboxFolder;
    status?: string;
    search?: string;
    unreadOnly?: boolean;
    starredOnly?: boolean;
    label?: string;
    skip?: number;
    limit?: number;
  }) =>
    apiClient<EmailListResponse>('/emails', {
      params: {
        folder: params?.folder,
        status: params?.status,
        search: params?.search,
        unread_only: params?.unreadOnly ? 'true' : undefined,
        starred_only: params?.starredOnly ? 'true' : undefined,
        label: params?.label,
        skip: params?.skip?.toString(),
        limit: params?.limit?.toString(),
      },
    }),
  compose: (payload: EmailComposeRequest) =>
    apiClient<EmailComposeResponse>('/emails/compose', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  get: (id: string) => apiClient<Email>(`/emails/${id}`),
  thread: (id: string) => apiClient<Email[]>(`/emails/${id}/thread`),
  assistedDraft: (id: string) =>
    apiClient<EmailAssistedDraftResponse>(`/emails/${id}/assisted-draft`, {
      method: 'POST',
    }),
  reply: (id: string, payload: EmailReplyRequest) =>
    apiClient<EmailReplyResponse>(`/emails/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateFlags: (id: string, payload: EmailFlagUpdateRequest) =>
    apiClient<Email>(`/emails/${id}/flags`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  bulkAction: (emailIds: string[], action: EmailBulkAction, label?: string) =>
    apiClient<EmailBulkActionResponse>('/emails/bulk-action', {
      method: 'POST',
      body: JSON.stringify({ email_ids: emailIds, action, label }),
    }),
  gmailAuthorize: () => apiClient<GmailAuthURL>('/gmail/authorize'),
  gmailStatus: () => apiClient<GmailStatus>('/gmail/status'),
  gmailSync: () => apiClient<GmailSyncResult>('/gmail/sync', { method: 'POST' }),
  gmailDisconnect: () => apiClient<{ message: string }>('/gmail/disconnect', { method: 'DELETE' }),
};
