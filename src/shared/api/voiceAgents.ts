import { apiClient } from './client';

export interface VoiceAgentConfig {
  livekit_api_key: string;
  livekit_api_secret: string;
  livekit_url: string;
  ai_response_provider: string;
  use_realtime: boolean;
  google_api_key: string;
  openai_api_key: string;
  anthropic_api_key: string;
  gemini_api_key: string;
  gemini_model: string;
  openai_model: string;
  backend_api_url: string;
  internal_service_key: string;
  voice_recordings_dir: string;
  database_url: string;
}

export interface VoiceAgentStatus {
  running: boolean;
  pid?: number | null;
  mode?: 'dev' | 'start' | null;
  started_at?: string | null;
  uptime_seconds?: number | null;
  log_file?: string | null;
  last_exit_code?: number | null;
}

export interface VoiceAgentTokenResponse {
  token: string;
  url: string;
}

export interface SupportCallScreenContextPayload {
  analysis_text: string;
  caption?: string;
  assistance_hints?: string[];
  frame_number?: number;
  capture_mode?: 'chunk' | 'frame';
  recorded_at?: string;
  session_id?: string;
  chunk_index?: number;
}

export interface SupportCallScreenContextResponse {
  room_name: string;
  updated_at: string;
  events_stored: number;
}

export const voiceAgentsApi = {
  getConfig: () => apiClient<{ config: VoiceAgentConfig }>('/voice-agents/config').then((res) => res.config),
  saveConfig: (config: VoiceAgentConfig) =>
    apiClient<{ config: VoiceAgentConfig }>('/voice-agents/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }).then((res) => res.config),
  getStatus: () => apiClient<VoiceAgentStatus>('/voice-agents/status'),
  start: (mode: 'dev' | 'start') =>
    apiClient<{ message: string }>('/voice-agents/start', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),
  stop: () => apiClient<{ message: string }>('/voice-agents/stop', { method: 'POST' }),
  logs: (lines = 200) => apiClient<{ lines: string[] }>('/voice-agents/logs', { params: { lines: String(lines) } }),
  getTestToken: () => apiClient<VoiceAgentTokenResponse>('/voice-agents/test-token'),
  getSupportCallToken: () => apiClient<VoiceAgentTokenResponse>('/voice-agents/support-call-token'),
  publishSupportCallScreenContext: (payload: SupportCallScreenContextPayload) =>
    apiClient<SupportCallScreenContextResponse>('/voice-agents/support-call-screen-context', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
