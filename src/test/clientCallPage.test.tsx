import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ClientCallPage, getOrbVisualState } from '@/features/voice-calls/ClientCallPage';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/shared/api/voiceAgents', () => ({
  voiceAgentsApi: {
    getSupportCallToken: vi.fn(),
    publishSupportCallScreenContext: vi.fn(),
  },
}));

vi.mock('@/shared/api/visual-ai', () => ({
  visualAiApi: {
    screenshareRealtimeChunk: vi.fn(),
    screenshareFrames: vi.fn(),
  },
}));

vi.mock('@livekit/components-react', () => ({
  LiveKitRoom: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="livekit-room">{children}</div>
  ),
  RoomAudioRenderer: () => null,
  useConnectionState: vi.fn(),
  useLocalParticipant: vi.fn(),
  useRoomContext: vi.fn(),
  useTrackVolume: vi.fn(),
  useVoiceAssistant: vi.fn(),
}));

import { useAuth } from '@/features/auth/AuthContext';
import { visualAiApi } from '@/shared/api/visual-ai';
import { voiceAgentsApi } from '@/shared/api/voiceAgents';
import {
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTrackVolume,
  useVoiceAssistant,
} from '@livekit/components-react';

class MockMediaRecorder {
  static isTypeSupported(type: string) {
    return type.includes('video/webm');
  }

  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: { error?: Error }) => void) | null = null;
  onstop: (() => void) | null = null;
  state: 'inactive' | 'recording' = 'inactive';

  constructor(
    _stream: MediaStream,
    options?: {
      mimeType?: string;
    },
  ) {
    this.mimeType = options?.mimeType || 'video/webm';
  }

  start() {
    this.state = 'recording';
    window.setTimeout(() => {
      if (this.state !== 'recording') {
        return;
      }
      this.ondataavailable?.({
        data: new Blob(['screen-chunk'], { type: this.mimeType }),
      });
      this.stop();
    }, 0);
  }

  requestData() {
    if (this.state !== 'recording') {
      return;
    }

    this.ondataavailable?.({
      data: new Blob(['screen-chunk'], { type: this.mimeType }),
    });
  }

  stop() {
    if (this.state === 'inactive') {
      return;
    }

    this.state = 'inactive';
    window.setTimeout(() => {
      this.onstop?.();
    }, 0);
  }
}

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ClientCallPage', () => {
  let getDisplayMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    (useAuth as any).mockReturnValue({
      user: {
        id: 'client-1',
        email: 'client@example.com',
        name: 'Jane Doe',
        role: 'client',
      },
    });

    (voiceAgentsApi.getSupportCallToken as any).mockResolvedValue({
      token: 'support-call-token',
      url: 'ws://127.0.0.1:7880',
    });
    (voiceAgentsApi.publishSupportCallScreenContext as any).mockResolvedValue({
      room_name: 'support-call-client-1',
      updated_at: '2026-04-07T19:00:00Z',
      events_stored: 1,
    });

    (visualAiApi.screenshareFrames as any).mockResolvedValue({
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
        caption: 'frame fallback summary',
        ocr_text_preview: 'billing',
        labels: ['billing'],
        element_count: 2,
      },
      assistance_hints: ['Processed 1 low-FPS frames (from 1 uploaded).', 'Continue on the billing page.'],
    });

    (useConnectionState as any).mockReturnValue('connected');
    (useVoiceAssistant as any).mockReturnValue({
      state: 'listening',
      audioTrack: undefined,
    });
    (useTrackVolume as any).mockImplementation((track: unknown) => (track ? 0.2 : 0));
    (useRoomContext as any).mockReturnValue({
      disconnect: vi.fn(),
    });
    (useLocalParticipant as any).mockReturnValue({
      isMicrophoneEnabled: true,
      lastMicrophoneError: undefined,
      localParticipant: {
        setMicrophoneEnabled: vi.fn(),
      },
      microphoneTrack: {
        track: { kind: 'audio' },
      },
    });

    const displayTrack = {
      readyState: 'live',
      stop: vi.fn(),
      applyConstraints: vi.fn().mockResolvedValue(undefined),
      onended: null,
    };
    const displayStream = {
      getVideoTracks: () => [displayTrack],
      getTracks: () => [displayTrack],
    } as unknown as MediaStream;
    getDisplayMediaMock = vi.fn().mockResolvedValue(displayStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getDisplayMedia: getDisplayMediaMock,
      },
    });

    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'screen-session-1'),
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
    vi.unstubAllGlobals();
  });

  it('fetches a support-call token and mounts the live voice room', async () => {
    const { container } = renderWithQueryClient(<ClientCallPage />);

    await waitFor(() => {
      expect(voiceAgentsApi.getSupportCallToken).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByTestId('livekit-room')).toBeInTheDocument();
    expect(screen.getByText('Live support session')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Mic connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to chat' })).toBeInTheDocument();
    expect(container.querySelector('[data-orb-state="listening"]')).toBeTruthy();
  });

  it('toggles the microphone through the LiveKit local participant', async () => {
    const setMicrophoneEnabled = vi.fn();
    (useLocalParticipant as any).mockReturnValue({
      isMicrophoneEnabled: true,
      lastMicrophoneError: undefined,
      localParticipant: {
        setMicrophoneEnabled,
      },
      microphoneTrack: {
        track: { kind: 'audio' },
      },
    });

    renderWithQueryClient(<ClientCallPage />);

    await screen.findByTestId('livekit-room');
    fireEvent.click(await screen.findByRole('button', { name: 'Mute' }));

    expect(setMicrophoneEnabled).toHaveBeenCalledWith(false);
  });

  it('shares the screen and sends Gemini live analysis frames by default', async () => {
    renderWithQueryClient(<ClientCallPage />);
    await screen.findByTestId('livekit-room');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));
    });

    expect(getDisplayMediaMock).toHaveBeenCalledTimes(1);
    expect(visualAiApi.screenshareRealtimeChunk).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(visualAiApi.screenshareFrames).toHaveBeenCalledTimes(1);
    });

    expect(voiceAgentsApi.publishSupportCallScreenContext).not.toHaveBeenCalled();

    const [files, options] = (visualAiApi.screenshareFrames as any).mock.calls[0];
    expect(Array.isArray(files)).toBe(true);
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(options).toMatchObject({
      consent: true,
      source_fps: 2,
      target_fps: 2,
      support_call_room_name: 'support-call-client-1',
      frame_number: 1,
      chunk_index: 1,
      use_gemini_embeddings: true,
    });
    expect(options.provider).toBeUndefined();

    expect((await screen.findAllByText(/The user is doing: frame fallback summary/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Stop sharing screen' })).toBeInTheDocument();
    expect(screen.queryByText(/Capture paused/i)).not.toBeInTheDocument();
  }, 10000);

  it('does not show the generic blank-frame warning when a meaningful caption is available', async () => {
    (visualAiApi.screenshareFrames as any).mockResolvedValueOnce({
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
        caption: 'a dark streaming video scene is visible in the player',
        ocr_text_preview: 'Bloodhounds',
        labels: ['video player'],
        element_count: 2,
      },
      assistance_hints: [
        'The shared frame looks blank or obstructed. Keep the target app visible and avoid sharing the live call page itself.',
        'Visible text includes: Bloodhounds.',
      ],
    });

    renderWithQueryClient(<ClientCallPage />);
    await screen.findByTestId('livekit-room');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share screen' }));
    });

    expect(
      screen.queryByText(/The shared frame looks blank or obstructed/i),
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/Visible text includes: Bloodhounds\./i)).toBeInTheDocument();
  }, 10000);

  it('only marks the orb active when there is user or assistant speech', () => {
    expect(
      getOrbVisualState({
        assistantLevel: 0,
        assistantState: 'listening',
        connectionState: 'connected',
        muted: false,
        userLevel: 0.03,
      }),
    ).toBe('standby');

    expect(
      getOrbVisualState({
        assistantLevel: 0,
        assistantState: 'listening',
        connectionState: 'connected',
        muted: false,
        userLevel: 0.18,
      }),
    ).toBe('listening');

    expect(
      getOrbVisualState({
        assistantLevel: 0.24,
        assistantState: 'speaking',
        connectionState: 'connected',
        muted: false,
        userLevel: 0,
      }),
    ).toBe('speaking');

    expect(
      getOrbVisualState({
        assistantLevel: 0.24,
        assistantState: 'speaking',
        connectionState: 'connected',
        muted: true,
        userLevel: 0.4,
      }),
    ).toBe('muted');
  });
});
