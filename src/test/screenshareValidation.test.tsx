import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { VisualAiScreenshareTab } from '@/features/visual-ai/VisualAiScreenshareTab';

const screenshareFramesMock = vi.fn();
const screenshareVideoMock = vi.fn();

vi.mock('@/shared/api/visual-ai', () => {
  return {
    visualAiApi: {
      screenshareFrames: (...args: any[]) => screenshareFramesMock(...args),
      screenshareVideo: (...args: any[]) => screenshareVideoMock(...args),
    },
  };
});

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('VisualAiScreenshareTab', () => {
  let getDisplayMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    screenshareFramesMock.mockResolvedValue({
      source_fps: 2,
      target_fps: 2,
      uploaded_frames: 1,
      processed_frames: 1,
      embedding_backend: 'gemini',
      embedding_dimension: 512,
      avg_transition_score: 0.08,
      max_transition_score: 0.08,
      reference_similarity: null,
      final_frame: {
        provider: 'google',
        caption: 'billing page is visible',
        ocr_text_preview: 'billing',
        labels: ['billing'],
        element_count: 2,
      },
      assistance_hints: ['Continue on the billing page.'],
    });

    getDisplayMediaMock = vi.fn().mockResolvedValue({
      getVideoTracks: () => [
        {
          readyState: 'live',
          stop: vi.fn(),
          onended: null,
        },
      ],
      getTracks: () => [
        {
          readyState: 'live',
          stop: vi.fn(),
          onended: null,
        },
      ],
    } as unknown as MediaStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: getDisplayMediaMock,
      },
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() {
        return (this as HTMLMediaElement & { __srcObject?: MediaStream | null }).__srcObject ?? null;
      },
      set(value) {
        (this as HTMLMediaElement & { __srcObject?: MediaStream | null }).__srcObject =
          value as MediaStream | null;
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get() {
        return 2;
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get() {
        return 1280;
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get() {
        return 720;
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () =>
        ({
          drawImage: vi.fn(),
        }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) {
      callback(new Blob(['frame-image'], { type: 'image/png' }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires consent before analyzing frames', async () => {
    renderWithProviders(<VisualAiScreenshareTab />);

    fireEvent.click(screen.getByRole('button', { name: /frame upload/i }));

    const fileInput = document.querySelector(
      'input[type="file"][accept="image/*"]',
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();

    const file = new File(['fake'], 'frame.png', { type: 'image/png' });
    Object.defineProperty(fileInput!, 'files', { value: [file] });
    fireEvent.change(fileInput!);

    const analyzeBtn = screen.getByRole('button', { name: /analyze frames/i });
    expect(analyzeBtn).not.toBeDisabled();
    fireEvent.click(analyzeBtn);

    expect(
      screen.getByText(/Required before starting a live share or uploading captures\./i),
    ).toBeInTheDocument();
    expect(screenshareFramesMock).not.toHaveBeenCalled();
  });

  it('shares the screen live and sends Gemini frame analysis by default', async () => {
    renderWithProviders(<VisualAiScreenshareTab />);

    fireEvent.click(screen.getByRole('checkbox', { name: /i consent to screen analysis/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /share screen/i }));
    });

    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screenshareFramesMock).toHaveBeenCalledTimes(1);
    });

    const [files, options] = screenshareFramesMock.mock.calls[0];
    expect(Array.isArray(files)).toBe(true);
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(options).toMatchObject({
      consent: true,
      source_fps: 2,
      target_fps: 2,
      frame_number: 1,
      chunk_index: 1,
      use_gemini_embeddings: true,
    });

    expect(await screen.findByText(/The user is doing: billing page is visible/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Continue on the billing page\./i).length).toBeGreaterThan(0);
  });
});
