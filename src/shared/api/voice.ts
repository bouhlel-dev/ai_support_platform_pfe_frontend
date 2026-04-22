import { apiClient } from './client';

export interface VoiceTranscriptionResult {
  text: string;
  language: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export const voiceApi = {
  transcribe: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient<VoiceTranscriptionResult>('/voice/transcribe', {
      method: 'POST',
      body: formData,
    });
  },
};
