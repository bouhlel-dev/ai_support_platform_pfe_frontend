import { apiClient } from './client';
import type {
  ScreenshotAnalysis,
  ReferenceScreen,
  ScreenshareRealtimeChunkResult,
  ScreenshareResult,
  TroubleshootingWizardRequest,
  TroubleshootingWizardResponse,
} from '@/shared/types';

type ReferenceListPayload = {
  items?: unknown[];
  total?: number;
};

type RawReferenceScreen = {
  id?: string;
  name?: string;
  key?: string;
  screen_key?: string;
  description?: string | null;
  file_path?: string;
  expected_elements?: Array<Record<string, unknown>> | null;
  expected_ocr_text?: string | null;
  created_at?: string;
  updated_at?: string;
};

function makeAnalysisId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapReferenceScreen(raw: RawReferenceScreen): ReferenceScreen {
  const key = raw.screen_key || raw.key || '';
  return {
    id: raw.id || '',
    name: raw.name || key || 'Reference',
    key,
    screen_key: key,
    description: raw.description ?? null,
    file_path: raw.file_path,
    expected_elements: raw.expected_elements ?? null,
    expected_ocr_text: raw.expected_ocr_text ?? null,
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at,
  };
}

function mapAnalyzeRawToScreenshotAnalysis(res: any): ScreenshotAnalysis {
  const rawElements = Array.isArray(res?.ui_analysis?.elements)
    ? res.ui_analysis.elements
    : Array.isArray(res?.elements)
      ? res.elements
      : [];

  const labels = Array.isArray(res?.ui_analysis?.labels)
    ? res.ui_analysis.labels
    : Array.isArray(res?.labels)
      ? res.labels
      : [];

  const ocrText =
    res?.ocr?.text
    || res?.ocr_text
    || '';

  const caption =
    res?.ui_analysis?.caption
    || res?.caption
    || '';

  return {
    id: makeAnalysisId(),
    caption,
    ocr_text: ocrText,
    labels,
    elements: rawElements.length,
    guidance: Array.isArray(res?.guidance_hints) && res.guidance_hints.length
      ? res.guidance_hints
      : (!caption && !ocrText && labels.length === 0 && rawElements.length === 0
          ? ['No clear UI content was detected in this screenshot. Try a sharper or larger capture.']
          : []),
    gaps: [],
    provider: res?.provider || 'gemini',
    confidence: typeof res?.confidence === 'number' ? res.confidence : undefined,
    processing_ms: typeof res?.processing_ms === 'number' ? res.processing_ms : undefined,
    ui_elements: rawElements.map((e: any) => ({
      type: e?.element_type || e?.type,
      label: e?.label,
      confidence: typeof e?.confidence === 'number' ? e.confidence : undefined,
      bbox: Array.isArray(e?.bbox) ? e.bbox : undefined,
      text: e?.text,
    })),
    regions: Array.isArray(res?.ui_analysis?.regions)
      ? res.ui_analysis.regions.map((r: any) => ({
          description: r?.description,
          bbox: Array.isArray(r?.bbox) ? r.bbox : undefined,
        }))
      : [],
    raw_result: res?.raw_result,
  };
}

export const visualAiApi = {
  analyzeScreenshot: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient<any>('/visual-ai/analyze-raw', { method: 'POST', body: fd }).then(mapAnalyzeRawToScreenshotAnalysis);
  },
  gapDetect: (file: File, referenceKey: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('reference_key', referenceKey);
    return apiClient<ScreenshotAnalysis>('/visual-ai/screenshot/gap-detect', { method: 'POST', body: fd });
  },
  references: {
    list: () =>
      apiClient<ReferenceListPayload>('/visual-ai/references').then((res) =>
        Array.isArray(res?.items)
          ? res.items.map((item) => mapReferenceScreen(item as RawReferenceScreen))
          : [],
      ),
    get: (id: string) =>
      apiClient<RawReferenceScreen>(`/visual-ai/references/${id}`).then(mapReferenceScreen),
    create: (data: FormData) =>
      apiClient<RawReferenceScreen>('/visual-ai/references', { method: 'POST', body: data }).then(mapReferenceScreen),
    delete: (id: string) => apiClient<void>(`/visual-ai/references/${id}`, { method: 'DELETE' }),
  },
  timeline: (conversationId: string) => apiClient<ScreenshotAnalysis[]>(`/visual-ai/timeline/${conversationId}`),
  screenshareFrames: (files: File[], opts: Record<string, any>) => {
    const fd = new FormData();
    files.forEach(f => fd.append('frames', f));
    Object.entries(opts).forEach(([k, v]) => { if (v !== undefined) fd.append(k, String(v)); });
    return apiClient<ScreenshareResult>('/visual-ai/screenshare/assist', { method: 'POST', body: fd });
  },
  screenshareVideo: (video: File, opts: Record<string, any>) => {
    const fd = new FormData();
    fd.append('file', video);
    fd.append('video', video);
    Object.entries(opts).forEach(([k, v]) => { if (v !== undefined) fd.append(k, String(v)); });
    return apiClient<ScreenshareResult>('/visual-ai/screenshare/assist-video', { method: 'POST', body: fd });
  },
  screenshareRealtimeChunk: (videoChunk: Blob | File, opts: Record<string, any>) => {
    const fd = new FormData();
    const file =
      videoChunk instanceof File
        ? videoChunk
        : new File([videoChunk], `screenshare-chunk-${Date.now()}.webm`, {
            type: videoChunk.type || 'video/webm',
          });

    fd.append('file', file);
    fd.append('video', file);
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined) {
        fd.append(k, String(v));
      }
    });

    return apiClient<ScreenshareRealtimeChunkResult>('/visual-ai/screenshare/assist-realtime-chunk', {
      method: 'POST',
      body: fd,
    });
  },
  troubleshootingWizard: (payload: TroubleshootingWizardRequest) =>
    apiClient<TroubleshootingWizardResponse>('/visual-ai/troubleshooting/wizard', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
