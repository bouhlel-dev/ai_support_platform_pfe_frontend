import { apiBlobClient, apiClient } from './client';
import type {
  VoiceCallLog,
  VoiceCallLogListResponse,
  VoiceCallPostCallSummary,
  VoiceCallTicketLinkRequest,
  VoiceCallTicketLinkResponse,
} from '@/shared/types';
import { getClientConfigRaw } from '@/shared/config/clientConfig';

const BASE_URL =
  getClientConfigRaw('VITE_API_BASE_URL') ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8000/api/v1';

export const voiceCallsApi = {
  list: (skip = 0, limit = 50) =>
    apiClient<VoiceCallLogListResponse>('/voice-calls/', {
      params: { skip: String(skip), limit: String(limit) },
    }),

  get: (id: string) => apiClient<VoiceCallLog>(`/voice-calls/${id}`),

  postCallSummary: (id: string, payload?: { max_transcript_chars?: number }) =>
    apiClient<VoiceCallPostCallSummary>(`/voice-calls/${id}/post-call-summary`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),

  linkTicket: (id: string, payload: VoiceCallTicketLinkRequest) =>
    apiClient<VoiceCallTicketLinkResponse>(`/voice-calls/${id}/link-ticket`, {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        priority: payload.priority ? String(payload.priority).toUpperCase() : undefined,
      }),
    }),

  audio: (id: string) => apiBlobClient(`/voice-calls/${id}/audio`),

  audioUrl: (id: string) => `${BASE_URL}/voice-calls/${id}/audio`,
};
