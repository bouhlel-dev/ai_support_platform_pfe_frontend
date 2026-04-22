import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTrackVolume,
  useVoiceAssistant,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Sparkles,
  User,
  Volume2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { normalizeError } from '@/shared/api/client';
import { getClientConfigBoolean } from '@/shared/config/clientConfig';
import { visualAiApi } from '@/shared/api/visual-ai';
import { voiceAgentsApi } from '@/shared/api/voiceAgents';
import { cn } from '@/lib/utils';

type OrbVisualState = 'standby' | 'listening' | 'speaking' | 'muted' | 'thinking';
type AssistantState = 'connecting' | 'disconnected' | 'initializing' | 'listening' | 'thinking' | 'speaking' | string;
type ScreenCaptureMode = 'chunk' | 'frame';
type ScreenAnalysisEntry = {
  id: string;
  frameNumber: number;
  captureMode: ScreenCaptureMode;
  text: string;
  recordedAt: string;
};
type VideoFrameAwareElement = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};
type ImageCaptureLike = {
  grabFrame: () => Promise<ImageBitmap>;
};
type ImageCaptureConstructor = new (track: MediaStreamTrack) => ImageCaptureLike;

const SPEECH_ACTIVITY_THRESHOLD = 0.08;
const TRACK_VOLUME_OPTIONS = { fftSize: 32, smoothingTimeConstant: 0.35 } as const;
const SCREEN_CAPTURE_TARGET_FPS = 2;
const SCREEN_CAPTURE_MAX_FPS = 5;
const SCREEN_CAPTURE_CHUNK_DURATION_MS = 2_500;
const SCREEN_CAPTURE_LOOP_DELAY_MS = 250;
const SCREEN_CAPTURE_TIMESLICE_MS = 700;
const SCREEN_CAPTURE_CHUNK_HARD_TIMEOUT_MS = 8_000;
const SCREEN_CAPTURE_CHUNK_RACE_TIMEOUT_MS = 4_500;
const SCREEN_NO_LIVE_TRACK_MAX_CYCLES = 10;
const SCREEN_CAPTURE_PREFER_FRAME_FALLBACK = true;
const SCREEN_ANALYSIS_REQUEST_TIMEOUT_MS = 35_000;
const SCREEN_FRAME_CAPTURE_PLAY_TIMEOUT_MS = 750;
const SCREEN_FRAME_CAPTURE_READY_TIMEOUT_MS = 1_200;
const SCREEN_FRAME_CAPTURE_TO_BLOB_TIMEOUT_MS = 1_200;
const SCREEN_FRAME_CAPTURE_STABILIZE_DELAY_MS = 120;
const SCREEN_RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
];

export function ClientCallPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const screenshareUseGeminiEmbeddings = getClientConfigBoolean(
    'VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS',
    true,
  );
  const screenAnalysisEngineLabel = getScreenAnalysisEngineLabel({
    useGeminiEmbeddings: screenshareUseGeminiEmbeddings,
  });
  const [roomError, setRoomError] = useState<string | null>(null);
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
  const [screenAnalysisText, setScreenAnalysisText] = useState<string | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const [screenChunkNumber, setScreenChunkNumber] = useState(0);
  const [lastScreenAnalysisAt, setLastScreenAnalysisAt] = useState<string | null>(null);
  const [screenAnalysisHistory, setScreenAnalysisHistory] = useState<ScreenAnalysisEntry[]>([]);
  const [screenCaptureMode, setScreenCaptureMode] = useState<ScreenCaptureMode>(
    SCREEN_CAPTURE_PREFER_FRAME_FALLBACK ? 'frame' : 'chunk',
  );
  const screenChunkRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunkStopTimeoutRef = useRef<number | null>(null);
  const screenLoopTimeoutRef = useRef<number | null>(null);
  const screenLoopActiveRef = useRef(false);
  const screenPreviewStreamRef = useRef<MediaStream | null>(null);
  const screenSessionIdRef = useRef<string | null>(null);
  const screenChunkIndexRef = useRef(0);
  const screenNoLiveTrackCyclesRef = useRef(0);
  const screenUseFrameFallbackRef = useRef(false);
  const autoShareTriggeredRef = useRef(false);

  const tokenQuery = useQuery({
    queryKey: ['support-call-token'],
    queryFn: voiceAgentsApi.getSupportCallToken,
    retry: false,
  });
  const autoShareRequested = searchParams.get('shareScreen') === '1';

  const displayName = user?.name?.trim() || 'Client';
  const initials = getInitials(displayName);
  const supportCallRoomName = user?.id ? `support-call-${user.id}` : undefined;
  const handleLeave = () => navigate('/conversations');

  const recordScreenAnalysis = useCallback(
    ({
      frameNumber,
      captureMode,
      text,
      recordedAt,
    }: {
      frameNumber: number;
      captureMode: ScreenCaptureMode;
      text: string;
      recordedAt: string;
    }) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      setScreenAnalysisHistory((previous) => [
        {
          id: `${captureMode}-${frameNumber}-${recordedAt}`,
          frameNumber,
          captureMode,
          text: trimmed,
          recordedAt,
        },
        ...previous,
      ].slice(0, 24));
    },
    [],
  );

  const clearScreenChunkStopTimeout = useCallback(() => {
    if (screenChunkStopTimeoutRef.current !== null) {
      window.clearTimeout(screenChunkStopTimeoutRef.current);
      screenChunkStopTimeoutRef.current = null;
    }
  }, []);

  const clearScreenLoopTimeout = useCallback(() => {
    if (screenLoopTimeoutRef.current !== null) {
      window.clearTimeout(screenLoopTimeoutRef.current);
      screenLoopTimeoutRef.current = null;
    }
  }, []);

  const captureScreenChunk = useCallback(
    (stream: MediaStream) =>
      new Promise<{ blob: Blob | null; mimeType: string }>((resolve, reject) => {
        const preferredMimeType = getPreferredScreenRecordingMimeType();
        const recorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream);

        const chunks: Blob[] = [];
        let finished = false;
        let hardTimeoutId: number | null = null;

        const clearHardTimeout = () => {
          if (hardTimeoutId !== null) {
            window.clearTimeout(hardTimeoutId);
            hardTimeoutId = null;
          }
        };

        const finish = (payload: { blob: Blob | null; mimeType: string }) => {
          if (finished) {
            return;
          }
          finished = true;
          clearHardTimeout();
          clearScreenChunkStopTimeout();
          if (screenChunkRecorderRef.current === recorder) {
            screenChunkRecorderRef.current = null;
          }
          resolve(payload);
        };

        const fail = (error: unknown) => {
          if (finished) {
            return;
          }
          finished = true;
          clearHardTimeout();
          clearScreenChunkStopTimeout();
          if (screenChunkRecorderRef.current === recorder) {
            screenChunkRecorderRef.current = null;
          }
          reject(error instanceof Error ? error : new Error('Screen recorder failed.'));
        };

        const finalizeFromBufferedChunks = () => {
          const resolvedMimeType = recorder.mimeType || preferredMimeType || 'video/webm';
          const blob = chunks.length > 0 ? new Blob(chunks, { type: resolvedMimeType }) : null;
          finish({ blob, mimeType: resolvedMimeType });
        };

        const stopRecorderSafely = () => {
          if (recorder.state === 'inactive') {
            finalizeFromBufferedChunks();
            return;
          }

          try {
            recorder.requestData();
          } catch {
            // requestData may not be supported in all runtimes.
          }

          try {
            recorder.stop();
          } catch {
            finalizeFromBufferedChunks();
          }
        };

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = (event) => {
          fail(event.error ?? new Error('Screen recorder failed.'));
        };

        recorder.onstop = () => {
          finalizeFromBufferedChunks();
        };

        try {
          screenChunkRecorderRef.current = recorder;
          recorder.start(SCREEN_CAPTURE_TIMESLICE_MS);
          screenChunkStopTimeoutRef.current = window.setTimeout(() => {
            stopRecorderSafely();
          }, SCREEN_CAPTURE_CHUNK_DURATION_MS);

          hardTimeoutId = window.setTimeout(() => {
            stopRecorderSafely();
            window.setTimeout(() => {
              if (!finished) {
                fail(new Error('Screen capture timed out. Retrying with frame fallback.'));
              }
            }, 120);
          }, SCREEN_CAPTURE_CHUNK_HARD_TIMEOUT_MS);
        } catch (error) {
          fail(error);
        }
      }),
    [clearScreenChunkStopTimeout],
  );

  const captureScreenChunkWithTimeout = useCallback(
    (stream: MediaStream) =>
      new Promise<{ blob: Blob | null; mimeType: string }>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error('Screen chunk capture timed out.'));
        }, SCREEN_CAPTURE_CHUNK_RACE_TIMEOUT_MS);

        captureScreenChunk(stream)
          .then((result) => {
            window.clearTimeout(timeoutId);
            resolve(result);
          })
          .catch((error: unknown) => {
            window.clearTimeout(timeoutId);
            reject(error);
          });
      }),
    [captureScreenChunk],
  );

  const captureScreenFrame = useCallback(async (stream: MediaStream): Promise<File | null> => {
    const directTrackFrame = await captureFrameFromTrack(stream.getVideoTracks()[0]);
    if (directTrackFrame) {
      return directTrackFrame;
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    try {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.then === 'function') {
        await Promise.race([
          playAttempt.catch(() => {
            // Best effort only.
          }),
          waitForDuration(SCREEN_FRAME_CAPTURE_PLAY_TIMEOUT_MS),
        ]);
      }

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
        await new Promise<void>((resolve) => {
          const onReady = () => {
            cleanup();
            resolve();
          };
          const timer = window.setTimeout(() => {
            cleanup();
            resolve();
          }, SCREEN_FRAME_CAPTURE_READY_TIMEOUT_MS);
          const cleanup = () => {
            window.clearTimeout(timer);
            video.removeEventListener('loadeddata', onReady);
            video.removeEventListener('loadedmetadata', onReady);
          };

          video.addEventListener('loadeddata', onReady, { once: true });
          video.addEventListener('loadedmetadata', onReady, { once: true });
        });
      }

      await waitForVideoPaint(video);

      const renderedFrame = await renderCanvasImageToFile({
        imageSource: video,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
      });
      if (renderedFrame) {
        return renderedFrame;
      }

      await waitForDuration(SCREEN_FRAME_CAPTURE_STABILIZE_DELAY_MS);
      await waitForVideoPaint(video);

      return renderCanvasImageToFile({
        imageSource: video,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
      });
    } finally {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const stopScreenSharingLoop = useCallback(
    (
      streamOverride?: MediaStream | null,
      options?: {
        reason?: 'manual' | 'ended' | 'cleanup';
      },
    ) => {
      screenLoopActiveRef.current = false;
      clearScreenLoopTimeout();
      clearScreenChunkStopTimeout();
      screenNoLiveTrackCyclesRef.current = 0;
      screenUseFrameFallbackRef.current = false;
      setScreenCaptureMode(SCREEN_CAPTURE_PREFER_FRAME_FALLBACK ? 'frame' : 'chunk');
      const streamToStop = streamOverride ?? screenPreviewStreamRef.current;

      const recorder = screenChunkRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.requestData();
        } catch {
          // Best effort only.
        }
        recorder.stop();
      }
      screenChunkRecorderRef.current = null;

      stopStreamTracks(streamToStop);
      screenPreviewStreamRef.current = null;
      setIsAnalyzingScreen(false);
      setIsScreenSharing(false);
      setScreenPreviewStream(null);
      setScreenChunkNumber(0);
      setLastScreenAnalysisAt(null);

      if (options?.reason === 'manual') {
        setScreenShareError(null);
      }
    },
    [clearScreenChunkStopTimeout, clearScreenLoopTimeout],
  );

  const startScreenSharingLoop = useCallback(
    (stream: MediaStream) => {
      screenLoopActiveRef.current = true;
      clearScreenLoopTimeout();
      clearScreenChunkStopTimeout();
      screenSessionIdRef.current = createScreenSessionId();
      screenChunkIndexRef.current = 0;
      screenNoLiveTrackCyclesRef.current = 0;
      screenUseFrameFallbackRef.current = SCREEN_CAPTURE_PREFER_FRAME_FALLBACK;
      setScreenCaptureMode(SCREEN_CAPTURE_PREFER_FRAME_FALLBACK ? 'frame' : 'chunk');
      setScreenChunkNumber(0);
      setScreenAnalysisHistory([]);
      setLastScreenAnalysisAt(null);

      const scheduleNext = (run: () => Promise<void>) => {
        clearScreenLoopTimeout();
        if (!screenLoopActiveRef.current) {
          return;
        }
        screenLoopTimeoutRef.current = window.setTimeout(() => {
          void run();
        }, SCREEN_CAPTURE_LOOP_DELAY_MS);
      };

      const runIteration = async () => {
        if (!screenLoopActiveRef.current) {
          return;
        }

        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length === 0) {
          setScreenShareError('No screen track is available. Please start sharing again.');
          stopScreenSharingLoop(stream, { reason: 'ended' });
          return;
        }

        const hasLiveTrack = videoTracks.some((track) => track.readyState === 'live');
        if (!hasLiveTrack) {
          screenNoLiveTrackCyclesRef.current += 1;
          if (screenNoLiveTrackCyclesRef.current >= SCREEN_NO_LIVE_TRACK_MAX_CYCLES) {
            setScreenShareError('Screen sharing ended. Click Share screen to resume live analysis.');
            stopScreenSharingLoop(stream, { reason: 'ended' });
            return;
          }
          setScreenShareError('Waiting for the screen stream...');
          scheduleNext(runIteration);
          return;
        }
        screenNoLiveTrackCyclesRef.current = 0;

        const sessionId = screenSessionIdRef.current;
        if (!sessionId) {
          stopScreenSharingLoop(stream);
          return;
        }

        screenChunkIndexRef.current += 1;
        const chunkIndex = screenChunkIndexRef.current;
        const captureUnit = screenUseFrameFallbackRef.current ? 'frame' : 'chunk';
        setScreenChunkNumber(chunkIndex);
        setScreenAnalysisText(`Capturing screen ${captureUnit} #${chunkIndex}...`);

        try {
          if (screenUseFrameFallbackRef.current) {
            throw new Error('Using frame fallback mode.');
          }

          const { blob } = await captureScreenChunkWithTimeout(stream);
          if (!screenLoopActiveRef.current) {
            return;
          }

          if (!blob || !blob.size) {
            screenUseFrameFallbackRef.current = true;
            setScreenCaptureMode('frame');
            throw new Error('No screen video bytes captured. Switching to frame fallback.');
          }

          setIsAnalyzingScreen(true);
          setScreenShareError(null);
          setScreenAnalysisText(`Uploading chunk #${chunkIndex} for analysis...`);

          const chunkRequestOptions: Record<string, unknown> = {
            consent: true,
            session_id: sessionId,
            chunk_index: chunkIndex,
            target_fps: SCREEN_CAPTURE_TARGET_FPS,
            support_call_room_name: supportCallRoomName,
          };
          if (screenshareUseGeminiEmbeddings) {
            chunkRequestOptions.use_gemini_embeddings = true;
          }

          const result = await visualAiApi.screenshareRealtimeChunk(blob, chunkRequestOptions);

          const caption = result.final_frame?.caption?.trim();
          const firstHint = getPreferredScreenAnalysisHint(result.assistance_hints, caption);
          const summary = caption
            ? `The user is doing: ${caption}`
            : 'The user is interacting with the app interface.';
          const analysisText = firstHint ? `${summary} ${firstHint}` : summary;
          const recordedAt = new Date().toISOString();

          setScreenAnalysisText(analysisText);
          setLastScreenAnalysisAt(recordedAt);
          recordScreenAnalysis({
            frameNumber: chunkIndex,
            captureMode: screenUseFrameFallbackRef.current ? 'frame' : 'chunk',
            text: analysisText,
            recordedAt,
          });
        } catch (error) {
          if (!screenLoopActiveRef.current) {
            return;
          }

          const fallbackFrame = await captureScreenFrame(stream);
          if (!fallbackFrame) {
            setScreenShareError(normalizeError(error));
            return;
          }

          try {
            screenUseFrameFallbackRef.current = true;
            setScreenCaptureMode('frame');
            setIsAnalyzingScreen(true);
            setScreenAnalysisText(`Uploading frame fallback for chunk #${chunkIndex}...`);

            const fallbackOptions: Record<string, unknown> = {
              consent: true,
              source_fps: SCREEN_CAPTURE_TARGET_FPS,
              target_fps: SCREEN_CAPTURE_TARGET_FPS,
              support_call_room_name: supportCallRoomName,
              frame_number: chunkIndex,
              chunk_index: chunkIndex,
            };
            if (screenshareUseGeminiEmbeddings) {
              fallbackOptions.use_gemini_embeddings = true;
            }

            const fallback = await visualAiApi.screenshareFrames([fallbackFrame], fallbackOptions);
            const caption = fallback.final_frame?.caption?.trim();
            const firstHint = getPreferredScreenAnalysisHint(fallback.assistance_hints, caption);
            const summary = caption
              ? `The user is doing: ${caption}`
              : 'The user is interacting with the app interface.';
            const analysisText = firstHint ? `${summary} ${firstHint}` : summary;
            const recordedAt = new Date().toISOString();

            setScreenAnalysisText(analysisText);
            setLastScreenAnalysisAt(recordedAt);
            setScreenShareError(null);
            recordScreenAnalysis({
              frameNumber: chunkIndex,
              captureMode: 'frame',
              text: analysisText,
              recordedAt,
            });
          } catch (fallbackError) {
            setScreenShareError(normalizeError(fallbackError));
          }
        } finally {
          if (screenLoopActiveRef.current) {
            setIsAnalyzingScreen(false);
            scheduleNext(runIteration);
          }
        }
      };

      void runIteration();
    },
    [
      captureScreenChunk,
      captureScreenChunkWithTimeout,
      clearScreenChunkStopTimeout,
      clearScreenLoopTimeout,
      captureScreenFrame,
      recordScreenAnalysis,
      screenshareUseGeminiEmbeddings,
      stopScreenSharingLoop,
      supportCallRoomName,
    ],
  );

  const handleShareScreen = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenSharingLoop(undefined, { reason: 'manual' });
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareError('Screen sharing is not supported in this browser.');
      return;
    }

    if (!SCREEN_CAPTURE_PREFER_FRAME_FALLBACK && typeof MediaRecorder === 'undefined') {
      setScreenShareError('Screen sharing is not supported in this browser.');
      return;
    }

    try {
      setScreenShareError(null);
      setScreenAnalysisText(null);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: SCREEN_CAPTURE_TARGET_FPS, max: SCREEN_CAPTURE_MAX_FPS },
        },
        audio: false,
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        if ('contentHint' in videoTrack) {
          try {
            videoTrack.contentHint = 'detail';
          } catch {
            // Best effort only.
          }
        }
        videoTrack.onended = () => {
          setScreenShareError('Screen sharing ended. Click Share screen to resume live analysis.');
          stopScreenSharingLoop(stream, { reason: 'ended' });
        };
        try {
          await videoTrack.applyConstraints({ frameRate: SCREEN_CAPTURE_TARGET_FPS });
        } catch {
          // Best effort: browser may ignore or reject stricter FPS constraints.
        }
      }

      screenPreviewStreamRef.current = stream;
      setScreenPreviewStream(stream);
      setIsScreenSharing(true);
      setScreenAnalysisText(null);
      startScreenSharingLoop(stream);
    } catch (error) {
      setScreenShareError(normalizeError(error));
      setIsScreenSharing(false);
      screenPreviewStreamRef.current = null;
      setScreenPreviewStream(null);
    }
  }, [isScreenSharing, startScreenSharingLoop, stopScreenSharingLoop]);

  useEffect(() => {
    if (!autoShareRequested || autoShareTriggeredRef.current) {
      return;
    }
    if (tokenQuery.isLoading || tokenQuery.isError || !tokenQuery.data) {
      return;
    }

    autoShareTriggeredRef.current = true;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('shareScreen');
    setSearchParams(nextSearchParams, { replace: true });
    void handleShareScreen();
  }, [
    autoShareRequested,
    handleShareScreen,
    searchParams,
    setSearchParams,
    tokenQuery.data,
    tokenQuery.isError,
    tokenQuery.isLoading,
  ]);

  useEffect(() => {
    return () => {
      stopScreenSharingLoop(undefined, { reason: 'cleanup' });
    };
  }, [stopScreenSharingLoop]);

  if (tokenQuery.isLoading) {
    return (
      <div className="relative h-[100dvh] overflow-hidden bg-background text-foreground dark:bg-slate-950 dark:text-white">
        <ClientCallShell
          displayName={displayName}
          helperContent={
            <p className="inline-flex items-center gap-2 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Starting your live support call...
            </p>
          }
          initials={initials}
          isAnalyzingScreen={isAnalyzingScreen}
          isScreenSharing={isScreenSharing}
          muted={false}
          onBack={handleLeave}
          onEndCall={handleLeave}
          onShareScreen={handleShareScreen}
          orbLabel="Joining"
          orbState="standby"
          screenCaptureMode={screenCaptureMode}
          screenAnalysisEngineLabel={screenAnalysisEngineLabel}
          screenAnalysisHistory={screenAnalysisHistory}
          screenAnalysisText={screenAnalysisText}
          screenChunkNumber={screenChunkNumber}
          lastScreenAnalysisAt={lastScreenAnalysisAt}
          screenPreviewStream={screenPreviewStream}
          screenShareError={screenShareError}
          statusLabel="Joining..."
        />
      </div>
    );
  }

  if (tokenQuery.isError || !tokenQuery.data) {
    return (
      <div className="relative h-[100dvh] overflow-hidden bg-background text-foreground dark:bg-slate-950 dark:text-white">
        <ClientCallShell
          displayName={displayName}
          helperContent={
            <p className="inline-flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{normalizeError(tokenQuery.error)}</span>
            </p>
          }
          initials={initials}
          isAnalyzingScreen={isAnalyzingScreen}
          isScreenSharing={isScreenSharing}
          muted={true}
          onBack={handleLeave}
          onEndCall={handleLeave}
          onShareScreen={handleShareScreen}
          orbLabel="Unavailable"
          orbState="standby"
          screenCaptureMode={screenCaptureMode}
          screenAnalysisEngineLabel={screenAnalysisEngineLabel}
          screenAnalysisHistory={screenAnalysisHistory}
          screenAnalysisText={screenAnalysisText}
          screenChunkNumber={screenChunkNumber}
          lastScreenAnalysisAt={lastScreenAnalysisAt}
          screenPreviewStream={screenPreviewStream}
          screenShareError={screenShareError}
          statusLabel="Call unavailable"
        />
      </div>
    );
  }

  return (
    <LiveKitRoom
      audio={true}
      className="relative h-[100dvh] overflow-hidden bg-background text-foreground dark:bg-slate-950 dark:text-white"
      connect={true}
      onDisconnected={handleLeave}
      onError={(error) => setRoomError(error.message)}
      onMediaDeviceFailure={(failure, kind) => {
        const label = kind ? `${kind}` : 'audio device';
        setRoomError(failure ? `${failure}: unable to access ${label}` : `Unable to access ${label}`);
      }}
      serverUrl={tokenQuery.data.url}
      token={tokenQuery.data.token}
      video={false}
    >
      <RoomAudioRenderer />
      <ClientCallRoomStage
        displayName={displayName}
        initials={initials}
        isAnalyzingScreen={isAnalyzingScreen}
        isScreenSharing={isScreenSharing}
        onBack={handleLeave}
        onEndCall={handleLeave}
        onShareScreen={handleShareScreen}
        roomError={roomError}
        screenCaptureMode={screenCaptureMode}
        screenAnalysisEngineLabel={screenAnalysisEngineLabel}
        screenAnalysisHistory={screenAnalysisHistory}
        screenAnalysisText={screenAnalysisText}
        screenChunkNumber={screenChunkNumber}
        lastScreenAnalysisAt={lastScreenAnalysisAt}
        screenPreviewStream={screenPreviewStream}
        screenShareError={screenShareError}
      />
    </LiveKitRoom>
  );
}

function ClientCallRoomStage({
  displayName,
  initials,
  isAnalyzingScreen,
  isScreenSharing,
  onBack,
  onEndCall,
  onShareScreen,
  roomError,
  screenCaptureMode,
  screenAnalysisEngineLabel,
  screenAnalysisHistory,
  screenAnalysisText,
  screenChunkNumber,
  lastScreenAnalysisAt,
  screenPreviewStream,
  screenShareError,
}: {
  displayName: string;
  initials: string;
  isAnalyzingScreen: boolean;
  isScreenSharing: boolean;
  onBack: () => void;
  onEndCall: () => void;
  onShareScreen: () => void;
  roomError: string | null;
  screenCaptureMode: ScreenCaptureMode;
  screenAnalysisEngineLabel: string;
  screenAnalysisHistory: ScreenAnalysisEntry[];
  screenAnalysisText: string | null;
  screenChunkNumber: number;
  lastScreenAnalysisAt: string | null;
  screenPreviewStream: MediaStream | null;
  screenShareError: string | null;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { state: assistantState, audioTrack } = useVoiceAssistant();
  const { isMicrophoneEnabled, lastMicrophoneError, localParticipant, microphoneTrack } =
    useLocalParticipant();

  const userLevel = useTrackVolume(microphoneTrack?.track as any, TRACK_VOLUME_OPTIONS);
  const assistantLevel = useTrackVolume(audioTrack, TRACK_VOLUME_OPTIONS);
  const muted = !isMicrophoneEnabled;
  const orbState = getOrbVisualState({
    assistantLevel,
    assistantState,
    connectionState,
    muted,
    userLevel,
  });
  const motionLevel = getOrbMotionLevel({
    assistantLevel,
    assistantState,
    orbState,
    userLevel,
  });

  return (
    <ClientCallShell
      displayName={displayName}
      helperContent={getCallHelperContent({ assistantState, connectionState, lastMicrophoneError, roomError })}
      initials={initials}
      isAnalyzingScreen={isAnalyzingScreen}
      isScreenSharing={isScreenSharing}
      motionLevel={motionLevel}
      muted={muted}
      onBack={onBack}
      onEndCall={() => {
        void room.disconnect();
      }}
      onShareScreen={onShareScreen}
      onToggleMute={() => {
        void localParticipant.setMicrophoneEnabled(muted);
      }}
      orbLabel={getOrbStateLabel({ assistantState, connectionState, state: orbState })}
      orbState={orbState}
      screenCaptureMode={screenCaptureMode}
      screenAnalysisEngineLabel={screenAnalysisEngineLabel}
      screenAnalysisHistory={screenAnalysisHistory}
      screenAnalysisText={screenAnalysisText}
      screenChunkNumber={screenChunkNumber}
      lastScreenAnalysisAt={lastScreenAnalysisAt}
      screenPreviewStream={screenPreviewStream}
      screenShareError={screenShareError}
      statusLabel={getStatusLabel({ connectionState, lastMicrophoneError, roomError })}
    />
  );
}

function ClientCallShell({
  displayName,
  helperContent,
  initials,
  isAnalyzingScreen = false,
  isScreenSharing = false,
  motionLevel = 0,
  muted,
  onBack,
  onEndCall,
  onShareScreen,
  onToggleMute,
  orbLabel,
  orbState,
  screenCaptureMode = SCREEN_CAPTURE_PREFER_FRAME_FALLBACK ? 'frame' : 'chunk',
  screenAnalysisEngineLabel,
  screenAnalysisHistory = [],
  screenAnalysisText,
  screenChunkNumber = 0,
  lastScreenAnalysisAt,
  screenPreviewStream,
  screenShareError,
  statusLabel,
}: {
  displayName: string;
  helperContent: ReactNode;
  initials: string;
  isAnalyzingScreen?: boolean;
  isScreenSharing?: boolean;
  motionLevel?: number;
  muted: boolean;
  onBack: () => void;
  onEndCall: () => void;
  onShareScreen?: () => void;
  onToggleMute?: () => void;
  orbLabel: string;
  orbState: OrbVisualState;
  screenCaptureMode?: ScreenCaptureMode;
  screenAnalysisEngineLabel?: string;
  screenAnalysisHistory?: ScreenAnalysisEntry[];
  screenAnalysisText?: string | null;
  screenChunkNumber?: number;
  lastScreenAnalysisAt?: string | null;
  screenPreviewStream?: MediaStream | null;
  screenShareError?: string | null;
  statusLabel: string;
}) {
  const analysisEngineLabel = screenAnalysisEngineLabel || 'Live analysis';
  const orbScale = 1 + motionLevel * 0.22;
  const orbGlow = 20 + motionLevel * 56;
  const orbInnerGlow = 14 + motionLevel * 34;
  const orbActive = orbState === 'listening' || orbState === 'speaking';
  const isMobileLayout = useIsMobile();
  const [analysisSidebarOpen, setAnalysisSidebarOpen] = useState(true);
  const retainedScreenAnalysisText = getRetainedScreenAnalysisText(screenAnalysisText);
  const latestAnalysisEntry = screenAnalysisHistory[0] ?? null;
  const showScreenAnalysisPanel =
    isScreenSharing || Boolean(screenShareError) || screenAnalysisHistory.length > 0 || Boolean(retainedScreenAnalysisText);
  const showLiveAnalysisBubble = false;
  const currentFrameNumber = Math.max(1, screenChunkNumber);
  const currentCaptureLabel = `${capitalizeScreenCaptureMode(screenCaptureMode)} #${currentFrameNumber}`;
  const liveAnalysisTitle = screenShareError ? 'Screen Analysis Issue' : 'Live Screen Analysis';
  const liveAnalysisStatusLabel = screenShareError
    ? 'Issue'
    : isAnalyzingScreen
      ? 'Running'
      : isScreenSharing
        ? 'Live'
        : 'Ready';
  const latestInsightMessage =
    latestAnalysisEntry?.text || retainedScreenAnalysisText;
  const liveAnalysisMessage =
    latestInsightMessage ||
    screenShareError ||
    `${analysisEngineLabel} will add readable frame summaries here as the shared screen updates.`;

  useEffect(() => {
    if (!showScreenAnalysisPanel) {
      setAnalysisSidebarOpen(true);
    }
  }, [showScreenAnalysisPanel]);

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between px-6 py-5">
        <Button
          type="button"
          variant="ghost"
          className="rounded-full border border-border/70 bg-card/75 px-4 text-foreground shadow-sm backdrop-blur hover:bg-card dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 dark:hover:text-white"
          onClick={onBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to chat
        </Button>

        <div className="text-center">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            Support call
          </Badge>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground dark:text-white">
            Live support session
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full border border-border/70 bg-card/75 px-4 py-2 text-sm text-muted-foreground shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
            {statusLabel}
          </div>
          {showScreenAnalysisPanel && isScreenSharing && !isMobileLayout && !analysisSidebarOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full border border-border/70 bg-card/75 shadow-sm backdrop-blur hover:bg-card dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
              onClick={() => setAnalysisSidebarOpen(true)}
              aria-label="Expand sidebar"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 overflow-hidden px-6 pb-36 pt-6 lg:gap-6">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
          <div className="relative flex h-[16rem] w-[16rem] items-center justify-center sm:h-[19rem] sm:w-[19rem]">
            <div
              className={cn(
                'call-liquid-sphere relative flex h-56 w-56 items-center justify-center overflow-hidden border border-primary/18 bg-primary text-primary-foreground transition-all duration-150 dark:border-primary/24 dark:bg-primary sm:h-64 sm:w-64',
                orbActive ? 'call-liquid-sphere-active' : undefined,
              )}
              data-orb-state={orbState}
              style={{
                transform: `scale(${orbScale})`,
                boxShadow: `0 0 ${orbGlow}px hsl(var(--primary) / 0.24), 0 0 ${orbGlow + 26}px hsl(var(--primary) / 0.16), inset 0 -18px ${orbInnerGlow}px hsl(var(--primary) / 0.24)`,
              }}
            >
              <div className="relative z-10 flex items-center justify-center px-8">
                <span className="rounded-full border border-white/18 bg-white/12 px-3 py-1 text-xs uppercase tracking-[0.26em] text-primary-foreground/88">
                  {orbLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 max-w-lg space-y-2 sm:mt-8">
            <p className="text-2xl font-semibold tracking-tight text-foreground dark:text-white">
              <span>{displayName}</span>, your call is ready
            </p>
            <p className="text-sm leading-7 text-muted-foreground dark:text-slate-300">
              Keep the conversation focused here while live screen guidance updates alongside the call.
            </p>
            {helperContent}
          </div>
        </div>

        {showScreenAnalysisPanel && isMobileLayout ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-0 top-0 z-20 flex items-end justify-center pb-2 pt-2 lg:hidden">
            <ClientCallScreenAnalysisPanel
              analysisEngineLabel={analysisEngineLabel}
              currentCaptureLabel={currentCaptureLabel}
              currentFrameNumber={currentFrameNumber}
              initials={initials}
              isAnalyzingScreen={isAnalyzingScreen}
              isScreenSharing={isScreenSharing}
              lastScreenAnalysisAt={lastScreenAnalysisAt}
              layout="overlay"
              latestAnalysisEntry={latestAnalysisEntry}
              latestAnalysisMessage={liveAnalysisMessage}
              liveAnalysisStatusLabel={liveAnalysisStatusLabel}
              liveAnalysisTitle={liveAnalysisTitle}
              screenAnalysisHistory={screenAnalysisHistory}
              screenPreviewStream={screenPreviewStream}
              screenShareError={screenShareError}
            />
          </div>
        ) : null}

        {showScreenAnalysisPanel && !isMobileLayout ? (
          <div
            className={cn(
              'hidden min-h-0 shrink-0 overflow-hidden transition-all duration-300 ease-in-out lg:flex lg:flex-col',
              analysisSidebarOpen ? 'w-72 pl-2 opacity-100' : 'w-0 pl-0 opacity-0 pointer-events-none',
            )}
          >
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col transition-all duration-300 ease-in-out',
                analysisSidebarOpen
                  ? 'translate-x-0 scale-100 opacity-100 visible'
                  : 'translate-x-6 scale-95 opacity-0 invisible',
              )}
            >
              <ClientCallScreenAnalysisPanel
                analysisEngineLabel={analysisEngineLabel}
                currentCaptureLabel={currentCaptureLabel}
                currentFrameNumber={currentFrameNumber}
                initials={initials}
                isAnalyzingScreen={isAnalyzingScreen}
                isScreenSharing={isScreenSharing}
                lastScreenAnalysisAt={lastScreenAnalysisAt}
                layout="sidebar"
                latestAnalysisEntry={latestAnalysisEntry}
                latestAnalysisMessage={liveAnalysisMessage}
                liveAnalysisStatusLabel={liveAnalysisStatusLabel}
                liveAnalysisTitle={liveAnalysisTitle}
                onCloseSidebar={() => setAnalysisSidebarOpen(false)}
                screenAnalysisHistory={screenAnalysisHistory}
                screenPreviewStream={screenPreviewStream}
                screenShareError={screenShareError}
                showCloseButton
              />
            </div>
          </div>
        ) : null}

        <div className="hidden">
          <div className="w-80">
            <div className="relative h-44 w-80 overflow-hidden rounded-2xl border border-white/14 bg-[radial-gradient(circle_at_center,_rgba(30,64,83,0.24),_rgba(8,12,19,0.96)_72%)] shadow-[0_24px_70px_rgba(2,6,23,0.52)]">
              {screenPreviewStream ? (
                <video
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-neutral-400 shadow-[0_16px_30px_rgba(2,6,23,0.45)]">
                    <User className="h-11 w-11 text-white" />
                    <span className="sr-only">{initials}</span>
                  </div>
                </div>
              )}

              {isScreenSharing ? (
                <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
                  Recording {SCREEN_CAPTURE_TARGET_FPS} FPS
                </span>
              ) : null}

              {isAnalyzingScreen ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                  <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-xs text-white">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analyzing with {analysisEngineLabel}...
                  </p>
                </div>
              ) : null}
            </div>

            {screenShareError ? (
              <p className="mt-2 text-xs text-rose-300">{screenShareError}</p>
            ) : null}

            {screenAnalysisText ? (
              <p className="mt-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs leading-5 text-slate-100">
                {screenAnalysisText}
              </p>
            ) : null}

            {isScreenSharing ? (
              <p className="mt-1 text-[11px] text-slate-300/90">
                Live analysis · {screenCaptureMode} #{Math.max(1, screenChunkNumber)}
                {lastScreenAnalysisAt
                  ? ` · updated ${formatScreenAnalysisTimestamp(lastScreenAnalysisAt)}`
                  : ' · awaiting first result'}
              </p>
            ) : null}
          </div>
        </div>

        {showLiveAnalysisBubble ? (
          <aside className="absolute right-8 top-1/2 hidden w-80 -translate-y-1/2 md:block">
            <div
              className={cn(
                'rounded-2xl border px-4 py-3 shadow-[0_24px_70px_rgba(2,6,23,0.45)] backdrop-blur',
                screenShareError
                  ? 'border-rose-300/40 bg-rose-950/55 text-rose-50'
                  : 'border-white/14 bg-slate-950/72 text-slate-100',
              )}
            >
              <p
                className={cn(
                  'text-[11px] font-medium uppercase tracking-[0.16em]',
                  screenShareError ? 'text-rose-100/90' : 'text-slate-300/90',
                )}
              >
                {liveAnalysisTitle}
              </p>
              <p className="mt-2 text-sm leading-6">{liveAnalysisMessage}</p>
              <p
                className={cn(
                  'mt-2 text-[11px]',
                  screenShareError ? 'text-rose-100/85' : 'text-slate-300/85',
                )}
              >
                {isScreenSharing
                  ? `${capitalizeScreenCaptureMode(screenCaptureMode)} #${Math.max(1, screenChunkNumber)}`
                  : screenShareError
                    ? 'Capture stopped'
                    : 'Capture paused'}
                {lastScreenAnalysisAt
                  ? ` · updated ${formatScreenAnalysisTimestamp(lastScreenAnalysisAt)}`
                  : ''}
              </p>
            </div>
          </aside>
        ) : null}

        {showLiveAnalysisBubble ? (
          <aside className="pointer-events-none absolute inset-x-4 bottom-28 z-20 md:hidden">
            <div
              className={cn(
                'rounded-2xl border px-4 py-3 shadow-[0_16px_42px_rgba(2,6,23,0.4)] backdrop-blur',
                screenShareError
                  ? 'border-rose-300/40 bg-rose-950/55 text-rose-50'
                  : 'border-white/14 bg-slate-950/78 text-slate-100',
              )}
            >
              <p
                className={cn(
                  'text-[11px] font-medium uppercase tracking-[0.16em]',
                  screenShareError ? 'text-rose-100/90' : 'text-slate-300/90',
                )}
              >
                {liveAnalysisTitle}
              </p>
              <p className="mt-2 text-sm leading-6">{liveAnalysisMessage}</p>
              <p
                className={cn(
                  'mt-2 text-[11px]',
                  screenShareError ? 'text-rose-100/85' : 'text-slate-300/85',
                )}
              >
                {isScreenSharing
                  ? `${capitalizeScreenCaptureMode(screenCaptureMode)} #${Math.max(1, screenChunkNumber)}`
                  : screenShareError
                    ? 'Capture stopped'
                    : 'Capture paused'}
                {lastScreenAnalysisAt
                  ? ` · updated ${formatScreenAnalysisTimestamp(lastScreenAnalysisAt)}`
                  : ''}
              </p>
            </div>
          </aside>
        ) : null}
      </main>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-8">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border/70 bg-card px-4 py-3 shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:border-white/10 dark:bg-slate-950 dark:shadow-[0_24px_80px_rgba(2,6,23,0.55)]">
          <CallControlButton
            label={muted ? 'Unmute' : 'Mute'}
            disabled={!onToggleMute}
            onClick={onToggleMute}
            className={muted ? 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-100' : undefined}
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </CallControlButton>
          <CallControlButton label="Audio status" disabled>
            <Volume2 className="h-5 w-5" />
          </CallControlButton>
          <CallControlButton
            label={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
            disabled={!onShareScreen || (isAnalyzingScreen && !isScreenSharing)}
            onClick={onShareScreen}
            className={isScreenSharing ? 'bg-primary/15 text-primary hover:bg-primary/25 dark:text-sky-200' : undefined}
          >
            <MonitorUp className={cn('h-5 w-5', isScreenSharing && 'animate-pulse')} />
          </CallControlButton>
          <CallControlButton
            label="End call"
            onClick={onEndCall}
            className="bg-rose-600 text-white hover:bg-rose-500"
          >
            <PhoneOff className="h-5 w-5" />
          </CallControlButton>
        </div>
      </div>
    </div>
  );
}

function ClientCallScreenAnalysisPanel({
  analysisEngineLabel,
  currentCaptureLabel,
  currentFrameNumber,
  initials,
  isAnalyzingScreen,
  isScreenSharing,
  lastScreenAnalysisAt,
  layout,
  latestAnalysisEntry,
  latestAnalysisMessage,
  liveAnalysisStatusLabel,
  liveAnalysisTitle,
  onCloseSidebar,
  screenAnalysisHistory,
  screenPreviewStream,
  screenShareError,
  showCloseButton,
}: {
  analysisEngineLabel: string;
  currentCaptureLabel: string;
  currentFrameNumber: number;
  initials: string;
  isAnalyzingScreen: boolean;
  isScreenSharing: boolean;
  lastScreenAnalysisAt: string | null | undefined;
  layout?: 'overlay' | 'sidebar';
  latestAnalysisEntry: ScreenAnalysisEntry | null;
  latestAnalysisMessage: string;
  liveAnalysisStatusLabel: string;
  liveAnalysisTitle: string;
  onCloseSidebar?: () => void;
  screenAnalysisHistory: ScreenAnalysisEntry[];
  screenPreviewStream: MediaStream | null | undefined;
  screenShareError: string | null | undefined;
  showCloseButton?: boolean;
}) {
  const previewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const previewEl = previewRef.current;
    if (!previewEl) {
      return;
    }

    if (screenPreviewStream) {
      previewEl.srcObject = screenPreviewStream;
      void previewEl.play().catch(() => {
        // Autoplay can be blocked depending on browser policy.
      });
      return;
    }

    previewEl.srcObject = null;
  }, [screenPreviewStream]);

  const panelLayout = layout ?? 'sidebar';

  const statusClasses = cn(
    'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm',
    screenShareError
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-100'
      : isAnalyzingScreen
        ? 'border-primary/20 bg-primary/10 text-primary dark:border-primary/30 dark:bg-primary/15 dark:text-sky-100'
        : isScreenSharing
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100'
          : 'border-border bg-muted/70 text-muted-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-300',
  );

  const latestMeta = latestAnalysisEntry
    ? `${capitalizeScreenCaptureMode(latestAnalysisEntry.captureMode)} #${latestAnalysisEntry.frameNumber} - ${formatScreenAnalysisTimestamp(latestAnalysisEntry.recordedAt)}`
    : lastScreenAnalysisAt
      ? `Updated ${formatScreenAnalysisTimestamp(lastScreenAnalysisAt)}`
      : isScreenSharing
        ? 'Waiting for the first readable frame analysis.'
        : 'Recent frame summaries stay visible here.';
  const showPreview = Boolean(screenPreviewStream) || isScreenSharing || isAnalyzingScreen;
  const latestCompletedFrameNumber = latestAnalysisEntry?.frameNumber ?? 0;
  const latestCompletedFrameLabel = latestAnalysisEntry
    ? `${capitalizeScreenCaptureMode(latestAnalysisEntry.captureMode)} #${latestAnalysisEntry.frameNumber}`
    : null;
  const isAwaitingCurrentFrameResult = isAnalyzingScreen && currentFrameNumber > latestCompletedFrameNumber;
  const latestInsightLabel =
    isAwaitingCurrentFrameResult && latestCompletedFrameLabel ? 'Latest completed insight' : 'Latest insight';
  const pendingInsightLabel = isAwaitingCurrentFrameResult
    ? latestCompletedFrameLabel
      ? `${currentCaptureLabel} is still processing. ${latestCompletedFrameLabel} is the most recent completed result.`
      : `${currentCaptureLabel} is still processing. A fresh summary will appear here when Gemini finishes.`
    : null;

  return (
    <aside
      className={cn(
        'pointer-events-auto',
        panelLayout === 'sidebar'
          ? 'h-full min-h-0 w-full'
          : 'h-[min(28rem,calc(100dvh-7rem))] w-[min(20rem,calc(100vw-2rem))]',
      )}
    >
      <div
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-[1.75rem] border bg-background/95 shadow-[0_24px_64px_rgba(15,23,42,0.14)] backdrop-blur dark:bg-slate-950/90 dark:shadow-[0_28px_80px_rgba(2,6,23,0.45)]',
          screenShareError
            ? 'border-rose-200/80 dark:border-rose-400/30'
            : 'border-border/70 dark:border-white/10',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {analysisEngineLabel}
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground dark:text-white">{liveAnalysisTitle}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-slate-400">
              {isAnalyzingScreen
                ? latestCompletedFrameLabel && isAwaitingCurrentFrameResult
                  ? `Reviewing ${currentCaptureLabel.toLowerCase()} now. Last completed result: ${latestCompletedFrameLabel.toLowerCase()}.`
                  : `Reviewing ${currentCaptureLabel.toLowerCase()} now.`
                : panelLayout === 'sidebar'
                  ? 'Sidebar with live frame summaries.'
                  : 'Floating overlay with live frame summaries.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={statusClasses}>{liveAnalysisStatusLabel}</span>
            {panelLayout === 'sidebar' && showCloseButton ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                onClick={onCloseSidebar}
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="space-y-4 pt-4">
            {showPreview ? (
              <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/20 dark:border-white/10 dark:bg-white/5">
                <div className="relative aspect-video bg-muted/30 dark:bg-slate-900/80">
                  {screenPreviewStream ? (
                    <video ref={previewRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                        <User className="h-6 w-6" />
                        <span className="sr-only">{initials}</span>
                      </div>
                    </div>
                  )}

                  <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm dark:border-white/10 dark:bg-slate-950/85 dark:text-white">
                      {currentCaptureLabel}
                    </span>
                    {isScreenSharing ? (
                      <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-300">
                        Live share
                      </span>
                    ) : null}
                  </div>

                  {isAnalyzingScreen ? (
                    <div className="absolute inset-x-3 bottom-3">
                      <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs text-foreground shadow-sm dark:border-white/10 dark:bg-slate-950/90 dark:text-slate-100">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analyzing with {analysisEngineLabel}...
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="border-b border-border/60 pb-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {latestInsightLabel}
                </p>
                <span className="text-[11px] text-muted-foreground dark:text-slate-400">{latestMeta}</span>
              </div>
              {pendingInsightLabel ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground dark:text-slate-400">
                  {pendingInsightLabel}
                </p>
              ) : null}
              <p
                className={cn(
                  'mt-2 whitespace-pre-wrap break-words text-sm leading-6',
                  screenShareError ? 'text-rose-700 dark:text-rose-100' : 'text-foreground dark:text-slate-100',
                )}
              >
                {latestAnalysisMessage}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground dark:text-white">Frame history</p>
                  <p className="text-xs text-muted-foreground dark:text-slate-400">
                    Readable summaries from this share session.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground dark:bg-white/5 dark:text-slate-400">
                  {screenAnalysisHistory.length}
                </span>
              </div>

            {screenAnalysisHistory.length > 0 ? (
                <div className="mt-3 space-y-2.5">
                {screenAnalysisHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-border/70 bg-card/80 px-3 py-3 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground dark:text-slate-400">
                      <span className="font-medium text-foreground dark:text-slate-100">
                        {capitalizeScreenCaptureMode(entry.captureMode)} #{entry.frameNumber}
                      </span>
                      <span>{formatScreenAnalysisTimestamp(entry.recordedAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground dark:text-slate-100">
                      {entry.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-slate-400">
                {isScreenSharing
                  ? 'Waiting for the first frame summary.'
                  : 'Start sharing your screen to build a readable analysis timeline.'}
              </p>
            )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function getOrbVisualState({
  assistantLevel,
  assistantState,
  connectionState,
  muted,
  userLevel,
}: {
  assistantLevel: number;
  assistantState: AssistantState;
  connectionState: ConnectionState | string;
  muted: boolean;
  userLevel: number;
}): OrbVisualState {
  if (muted) {
    return 'muted';
  }

  if (assistantState === 'speaking' || assistantLevel >= SPEECH_ACTIVITY_THRESHOLD) {
    return 'speaking';
  }

  if (isConnectedState(connectionState) && userLevel >= SPEECH_ACTIVITY_THRESHOLD) {
    return 'listening';
  }

  if (assistantState === 'thinking') {
    return 'thinking';
  }

  return 'standby';
}

function CallControlButton({
  children,
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full bg-background text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/8 dark:text-white dark:hover:bg-white/14',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function getCallHelperContent({
  assistantState,
  connectionState,
  lastMicrophoneError,
  roomError,
}: {
  assistantState: AssistantState;
  connectionState: ConnectionState;
  lastMicrophoneError: Error | undefined;
  roomError: string | null;
}) {
  if (roomError) {
    return (
      <p className="inline-flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{roomError}</span>
      </p>
    );
  }

  if (lastMicrophoneError) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-200">
        Microphone access is blocked. Allow mic permission to join the live support call.
      </p>
    );
  }

  if (connectionState === ConnectionState.Connecting) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-primary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Connecting to your microphone...
      </p>
    );
  }

  if (
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  ) {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-primary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Reconnecting to your support call...
      </p>
    );
  }

  if (assistantState === 'speaking') {
    return (
      <p className="text-sm text-muted-foreground dark:text-slate-300">
        Support is responding in real time. Jump back in whenever you are ready.
      </p>
    );
  }

  if (assistantState === 'thinking') {
    return (
      <p className="text-sm text-muted-foreground dark:text-slate-300">
        Support is thinking through your last message.
      </p>
    );
  }

  if (assistantState === 'connecting' || assistantState === 'initializing') {
    return (
      <p className="inline-flex items-center gap-2 text-sm text-primary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Bringing the voice assistant into your room...
      </p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground dark:text-slate-300">
      Speak naturally to continue the conversation with support.
    </p>
  );
}

function getOrbMotionLevel({
  assistantLevel,
  assistantState,
  orbState,
  userLevel,
}: {
  assistantLevel: number;
  assistantState: AssistantState;
  orbState: OrbVisualState;
  userLevel: number;
}) {
  const userMotion = orbState === 'listening' ? userLevel : 0;
  const assistantMotion =
    orbState === 'speaking'
      ? Math.max(assistantLevel, assistantState === 'speaking' ? 0.16 : 0)
      : 0;

  return Math.max(userMotion, assistantMotion);
}

function getOrbStateLabel({
  assistantState,
  connectionState,
  state,
}: {
  assistantState: AssistantState;
  connectionState: ConnectionState;
  state: OrbVisualState;
}) {
  if (state === 'muted') {
    return 'Muted';
  }

  if (state === 'speaking') {
    return 'Speaking';
  }

  if (state === 'listening') {
    return 'Listening';
  }

  if (state === 'thinking' || assistantState === 'thinking') {
    return 'Thinking';
  }

  if (
    connectionState === ConnectionState.Connecting ||
    assistantState === 'connecting' ||
    assistantState === 'initializing'
  ) {
    return 'Joining';
  }

  if (
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  ) {
    return 'Rejoining';
  }

  return 'Standby';
}

function getStatusLabel({
  connectionState,
  lastMicrophoneError,
  roomError,
}: {
  connectionState: ConnectionState;
  lastMicrophoneError?: Error;
  roomError?: string | null;
}) {
  if (roomError) {
    return 'Call issue';
  }

  if (lastMicrophoneError) {
    return 'Permission needed';
  }

  if (connectionState === ConnectionState.Connected) {
    return 'Mic connected';
  }

  if (
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting
  ) {
    return 'Reconnecting';
  }

  if (connectionState === ConnectionState.Disconnected) {
    return 'Disconnected';
  }

  return 'Joining...';
}

function getPreferredScreenRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  return SCREEN_RECORDING_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

async function captureFrameFromTrack(track: MediaStreamTrack | undefined) {
  if (!track || track.readyState !== 'live') {
    return null;
  }

  const ImageCaptureClass = (window as unknown as { ImageCapture?: ImageCaptureConstructor }).ImageCapture;
  if (typeof ImageCaptureClass !== 'function') {
    return null;
  }

  try {
    const imageCapture = new ImageCaptureClass(track);
    const bitmap = await imageCapture.grabFrame();
    try {
      return await renderCanvasImageToFile({
        imageSource: bitmap,
        width: bitmap.width,
        height: bitmap.height,
      });
    } finally {
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  } catch {
    return null;
  }
}

async function renderCanvasImageToFile({
  imageSource,
  width,
  height,
}: {
  imageSource: CanvasImageSource;
  width: number;
  height: number;
}) {
  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.drawImage(imageSource, 0, 0, width, height);
  const blob = await Promise.race([
    new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    }),
    waitForDuration<Blob | null>(SCREEN_FRAME_CAPTURE_TO_BLOB_TIMEOUT_MS, null),
  ]);
  if (!blob) {
    return null;
  }

  return new File([blob], `screenshare-frame-${Date.now()}.png`, { type: 'image/png' });
}

function waitForDuration<T = void>(durationMs: number, value?: T) {
  return new Promise<T>((resolve) => {
    window.setTimeout(() => {
      resolve(value as T);
    }, durationMs);
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function waitForVideoPaint(video: HTMLVideoElement) {
  const frameAwareVideo = video as VideoFrameAwareElement;
  if (typeof frameAwareVideo.requestVideoFrameCallback === 'function') {
    await new Promise<void>((resolve) => {
      let settled = false;
      let handle: number | null = null;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (handle !== null && typeof frameAwareVideo.cancelVideoFrameCallback === 'function') {
          frameAwareVideo.cancelVideoFrameCallback(handle);
        }
        resolve();
      };

      const timer = window.setTimeout(finish, SCREEN_FRAME_CAPTURE_READY_TIMEOUT_MS);
      handle = frameAwareVideo.requestVideoFrameCallback(() => {
        window.clearTimeout(timer);
        finish();
      });
    });
    return;
  }

  await waitForDuration(SCREEN_FRAME_CAPTURE_STABILIZE_DELAY_MS);
  if (typeof window.requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  }
}

function capitalizeScreenCaptureMode(mode: ScreenCaptureMode) {
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function getRetainedScreenAnalysisText(text: string | null | undefined) {
  const normalized = (text || '').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('Capturing screen ') || normalized.startsWith('Uploading ')) {
    return '';
  }

  return normalized;
}

function captionSuggestsVisibleContent(caption: string | null | undefined) {
  const normalized = (caption || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const lowSignalMarkers = [
    'black image',
    'blank image',
    'blank screen',
    'nothing visible',
    'no visible content',
    'no discernible content',
    'fully obscured',
    'entirely obscured',
  ];
  return !lowSignalMarkers.some((marker) => normalized.includes(marker));
}

function getPreferredScreenAnalysisHint(hints: string[] | undefined, caption?: string | null) {
  if (!Array.isArray(hints) || hints.length === 0) {
    return '';
  }

  const lowSignalFrameWarning = hints.find((hint) => {
    const normalized = (hint || '').trim().toLowerCase();
    return normalized.startsWith('the shared frame looks blank') || normalized.startsWith('the shared frame looks unreadable');
  });

  const preferredHint = hints.find((hint) => {
    const normalized = (hint || '').trim().toLowerCase();
    return (
      Boolean(normalized) &&
      !normalized.startsWith('processed ') &&
      !normalized.startsWith('average ui transition score:') &&
      normalized !== (lowSignalFrameWarning || '').trim().toLowerCase()
    );
  });

  if (preferredHint) {
    return preferredHint.trim();
  }

  if (lowSignalFrameWarning && captionSuggestsVisibleContent(caption)) {
    return '';
  }

  return (preferredHint || hints[0] || '').trim();
}

function getScreenAnalysisEngineLabel({
  useGeminiEmbeddings,
}: {
  useGeminiEmbeddings?: boolean;
}) {
  if (useGeminiEmbeddings) {
    return 'Gemini';
  }

  return 'Gemini';
}

function createScreenSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `screen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatScreenAnalysisTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'just now';
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function stopStreamTracks(stream: MediaStream | null | undefined) {
  if (!stream) {
    return;
  }

  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

function getInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'CL';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function isConnectedState(connectionState: ConnectionState | string) {
  return (
    connectionState === ConnectionState.Connected ||
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting ||
    connectionState === 'connected' ||
    connectionState === 'reconnecting' ||
    connectionState === 'signalReconnecting'
  );
}
