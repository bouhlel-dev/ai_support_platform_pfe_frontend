import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { visualAiApi } from '@/shared/api/visual-ai';
import { normalizeError } from '@/shared/api/client';
import { getClientConfigBoolean, getClientConfigNumber } from '@/shared/config/clientConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  AlertCircle,
  CheckCircle2,
  Film,
  LayoutGrid,
  Loader2,
  MonitorUp,
  Square,
  Upload,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScreenshareResult } from '@/shared/types';

type FormValues = {
  consent: boolean;
  targetFps: number;
  referenceKey?: string;
  useGeminiEmbeddings?: boolean;
};

type Mode = 'live' | 'frames' | 'video';
type LiveAnalysisEntry = {
  id: string;
  frameNumber: number;
  text: string;
  recordedAt: string;
};

const LIVE_SCREEN_CAPTURE_MAX_FPS = 5;
const LIVE_SCREEN_CAPTURE_PLAY_TIMEOUT_MS = 750;
const LIVE_SCREEN_CAPTURE_READY_TIMEOUT_MS = 1_200;
const LIVE_SCREEN_CAPTURE_TO_BLOB_TIMEOUT_MS = 1_200;
const LIVE_SCREEN_CAPTURE_STABILIZE_DELAY_MS = 120;
const LIVE_SCREEN_CAPTURE_ERROR_RETRY_MS = 900;

const screenshareSchema = z.object({
  consent: z.preprocess(
    (v) => {
      if (typeof v === 'string') return v === 'true' || v === 'on';
      return v;
    },
    z.boolean().refine((v) => v === true, {
      message: 'Consent is required to analyze your screen.',
    }),
  ),
  targetFps: z.coerce
    .number()
    .min(0.1, 'Target FPS must be positive.')
    .max(60, 'Target FPS looks too high.'),
  referenceKey: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length ? v.trim() : undefined)),
  useGeminiEmbeddings: z.boolean().optional(),
});

export function VisualAiScreenshareTab() {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('live');
  const [frames, setFrames] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [result, setResult] = useState<ScreenshareResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [framesDragging, setFramesDragging] = useState(false);
  const [videoDragging, setVideoDragging] = useState(false);
  const [screenPreviewStream, setScreenPreviewStream] = useState<MediaStream | null>(null);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const [liveAnalysisText, setLiveAnalysisText] = useState<string | null>(null);
  const [lastScreenAnalysisAt, setLastScreenAnalysisAt] = useState<string | null>(null);
  const [screenAnalysisHistory, setScreenAnalysisHistory] = useState<LiveAnalysisEntry[]>([]);
  const [screenFrameNumber, setScreenFrameNumber] = useState(0);

  const previewRef = useRef<HTMLVideoElement | null>(null);
  const screenPreviewStreamRef = useRef<MediaStream | null>(null);
  const screenLoopActiveRef = useRef(false);
  const screenLoopTimeoutRef = useRef<number | null>(null);
  const screenFrameIndexRef = useRef(0);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(screenshareSchema),
    defaultValues: {
      consent: false,
      targetFps: getClientConfigNumber('VITE_DEFAULT_SCREENSHARE_TARGET_FPS', 2),
      referenceKey: '',
      useGeminiEmbeddings: getClientConfigBoolean(
        'VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS',
        true,
      ),
    },
    mode: 'onSubmit',
  });

  const values = watch();

  useEffect(() => {
    if (!previewRef.current) {
      return;
    }
    previewRef.current.srcObject = screenPreviewStream;
  }, [screenPreviewStream]);

  const clearScreenLoopTimeout = useCallback(() => {
    if (screenLoopTimeoutRef.current !== null) {
      window.clearTimeout(screenLoopTimeoutRef.current);
      screenLoopTimeoutRef.current = null;
    }
  }, []);

  const stopScreenSharingLoop = useCallback(
    (streamOverride?: MediaStream | null) => {
      screenLoopActiveRef.current = false;
      clearScreenLoopTimeout();
      stopStreamTracks(streamOverride ?? screenPreviewStreamRef.current);
      screenPreviewStreamRef.current = null;
      setScreenPreviewStream(null);
      setIsScreenSharing(false);
      setIsAnalyzingScreen(false);
    },
    [clearScreenLoopTimeout],
  );

  useEffect(() => {
    return () => {
      stopScreenSharingLoop();
    };
  }, [stopScreenSharingLoop]);

  const frameMut = useMutation({
    mutationFn: (payload: { files: File[]; opts: Record<string, unknown> }) =>
      visualAiApi.screenshareFrames(payload.files, payload.opts),
    onSuccess: (res) => {
      setResult(res);
      setApiError(null);
    },
    onError: (err) => {
      const msg = normalizeError(err);
      setApiError(msg);
      toast({ variant: 'destructive', title: 'Upload failed', description: msg });
    },
  });

  const videoMut = useMutation({
    mutationFn: (payload: { file: File; opts: Record<string, unknown> }) =>
      visualAiApi.screenshareVideo(payload.file, payload.opts),
    onSuccess: (res) => {
      setResult(res);
      setApiError(null);
    },
    onError: (err) => {
      const msg = normalizeError(err);
      setApiError(msg);
      toast({ variant: 'destructive', title: 'Upload failed', description: msg });
    },
  });

  const opts = useMemo(() => {
    const o: Record<string, unknown> = {
      consent: values.consent,
      target_fps: values.targetFps,
      reference_key: values.referenceKey || undefined,
      use_gemini_embeddings: values.useGeminiEmbeddings ? true : undefined,
    };
    Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
    return o;
  }, [values.consent, values.targetFps, values.referenceKey, values.useGeminiEmbeddings]);

  const recordScreenAnalysis = useCallback((frameNumber: number, text: string, recordedAt: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    setScreenAnalysisHistory((previous) => [
      {
        id: `live-${frameNumber}-${recordedAt}`,
        frameNumber,
        text: trimmed,
        recordedAt,
      },
      ...previous,
    ].slice(0, 24));
  }, []);

  const startScreenSharing = useCallback(async () => {
    if (!values.consent) {
      setValue('consent', false, { shouldValidate: true });
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      const message = 'This browser does not support live screen sharing.';
      setScreenShareError(message);
      toast({ variant: 'destructive', title: 'Screen sharing unavailable', description: message });
      return;
    }

    try {
      setApiError(null);
      setFileError(null);
      setScreenShareError(null);
      setResult(null);
      setLiveAnalysisText(null);
      setLastScreenAnalysisAt(null);
      setScreenAnalysisHistory([]);
      setScreenFrameNumber(0);
      screenFrameIndexRef.current = 0;

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: Math.min(Math.max(values.targetFps, 1), LIVE_SCREEN_CAPTURE_MAX_FPS),
        },
        audio: false,
      });

      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          setScreenShareError('Screen sharing ended. Click Share screen to resume.');
          stopScreenSharingLoop(stream);
        };
      });

      screenPreviewStreamRef.current = stream;
      setScreenPreviewStream(stream);
      setIsScreenSharing(true);
      screenLoopActiveRef.current = true;

      const scheduleNext = (delayMs: number, run: () => Promise<void>) => {
        clearScreenLoopTimeout();
        if (!screenLoopActiveRef.current) {
          return;
        }
        screenLoopTimeoutRef.current = window.setTimeout(() => {
          void run();
        }, delayMs);
      };

      const runIteration = async () => {
        if (!screenLoopActiveRef.current) {
          return;
        }

        const currentStream = screenPreviewStreamRef.current;
        const videoTrack = currentStream?.getVideoTracks?.()[0];
        if (!currentStream || !videoTrack || videoTrack.readyState !== 'live') {
          setScreenShareError('Screen sharing ended. Click Share screen to resume.');
          stopScreenSharingLoop(currentStream);
          return;
        }

        screenFrameIndexRef.current += 1;
        const frameNumber = screenFrameIndexRef.current;
        setScreenFrameNumber(frameNumber);
        setLiveAnalysisText(`Capturing frame #${frameNumber}...`);

        try {
          const frameFile = await captureScreenFrame(currentStream);
          if (!screenLoopActiveRef.current) {
            return;
          }
          if (!frameFile) {
            throw new Error('A frame could not be captured from the shared screen.');
          }

          setIsAnalyzingScreen(true);
          setLiveAnalysisText(`Uploading frame #${frameNumber} to Gemini...`);

          const liveOptions: Record<string, unknown> = {
            consent: true,
            source_fps: values.targetFps,
            target_fps: values.targetFps,
            reference_key: values.referenceKey || undefined,
            frame_number: frameNumber,
            chunk_index: frameNumber,
          };
          if (values.useGeminiEmbeddings) {
            liveOptions.use_gemini_embeddings = true;
          }

          const liveResult = await visualAiApi.screenshareFrames([frameFile], liveOptions);
          if (!screenLoopActiveRef.current) {
            return;
          }

          const caption = liveResult.final_frame?.caption?.trim();
          const preferredHint = getPreferredScreenAnalysisHint(liveResult.assistance_hints, caption);
          const summary = caption
            ? `The user is doing: ${caption}`
            : 'The user is interacting with the app interface.';
          const analysisText = preferredHint ? `${summary} ${preferredHint}` : summary;
          const recordedAt = new Date().toISOString();

          setResult(liveResult);
          setApiError(null);
          setScreenShareError(null);
          setLiveAnalysisText(analysisText);
          setLastScreenAnalysisAt(recordedAt);
          recordScreenAnalysis(frameNumber, analysisText, recordedAt);
        } catch (error) {
          if (!screenLoopActiveRef.current) {
            return;
          }

          const message = normalizeError(error);
          setScreenShareError(message);
          setLiveAnalysisText(message);
          scheduleNext(LIVE_SCREEN_CAPTURE_ERROR_RETRY_MS, runIteration);
          return;
        } finally {
          setIsAnalyzingScreen(false);
        }

        const delayMs = Math.max(
          400,
          Math.round(1000 / Math.min(Math.max(values.targetFps, 0.1), LIVE_SCREEN_CAPTURE_MAX_FPS)),
        );
        scheduleNext(delayMs, runIteration);
      };

      void runIteration();
    } catch (error) {
      const message = normalizeError(error);
      setScreenShareError(message);
      setIsScreenSharing(false);
      setIsAnalyzingScreen(false);
      stopScreenSharingLoop();
      toast({ variant: 'destructive', title: 'Screen sharing failed', description: message });
    }
  }, [
    clearScreenLoopTimeout,
    recordScreenAnalysis,
    setValue,
    stopScreenSharingLoop,
    toast,
    values.consent,
    values.referenceKey,
    values.targetFps,
    values.useGeminiEmbeddings,
  ]);

  const stopLiveSharing = useCallback(() => {
    setScreenShareError(null);
    setLiveAnalysisText(null);
    stopScreenSharingLoop();
  }, [stopScreenSharingLoop]);

  const onSubmit = async (_data: FormValues) => {
    setFileError(null);
    setApiError(null);
    if (mode === 'frames' && frames.length === 0) {
      setFileError('Please select at least one frame.');
      return;
    }
    if (mode === 'video' && !video) {
      setFileError('Please select a video file.');
      return;
    }
    if (mode === 'frames') {
      frameMut.mutate({ files: frames, opts });
    } else if (mode === 'video') {
      videoMut.mutate({ file: video, opts });
    }
  };

  const isPending = frameMut.isPending || videoMut.isPending;
  const analysisEngineLabel = values.useGeminiEmbeddings ? 'Gemini' : 'Gemini';
  const latestAnalysisMessage =
    screenShareError || getRetainedScreenAnalysisText(liveAnalysisText) || 'Share your screen to begin live Gemini analysis.';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4 transition-colors',
          values.consent
            ? 'border-emerald-200 bg-emerald-50/50'
            : errors.consent
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-border bg-muted/30',
        )}
      >
        <input type="hidden" {...register('consent')} />
        <Checkbox
          id="consent"
          checked={values.consent}
          onCheckedChange={(c) => setValue('consent', !!c, { shouldValidate: true })}
          className="mt-0.5"
        />
        <div className="space-y-0.5">
          <Label htmlFor="consent" className="cursor-pointer text-sm font-medium">
            I consent to screen analysis <span className="text-destructive">*</span>
          </Label>
          <p className={cn('text-xs', values.consent ? 'text-emerald-700' : 'text-muted-foreground')}>
            {values.consent
              ? 'Consent granted. Live share and uploads are ready.'
              : 'Required before starting a live share or uploading captures.'}
          </p>
          {errors.consent?.message && (
            <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {errors.consent.message}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Settings
        </p>
        <div className="grid gap-4 sm:grid-cols-[100px_1fr_auto]">
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Target FPS</Label>
            <Input type="number" step={0.1} {...register('targetFps')} />
            {errors.targetFps?.message && (
              <p className="text-xs text-destructive">{errors.targetFps.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
              Reference key <span className="font-normal opacity-50">(optional)</span>
            </Label>
            <Input {...register('referenceKey')} placeholder="e.g. checkout_confirmation" />
          </div>
          <div className="space-y-1">
            <Label className="mb-2 block text-xs font-medium text-muted-foreground">
              Gemini embeddings
            </Label>
            <div className="flex items-center gap-2">
              <Switch
                id="gemini"
                checked={!!values.useGeminiEmbeddings}
                onCheckedChange={(v) =>
                  setValue('useGeminiEmbeddings', v, { shouldValidate: false })
                }
              />
              <Label htmlFor="gemini" className="cursor-pointer text-xs text-muted-foreground">
                {values.useGeminiEmbeddings ? 'On' : 'Off'}
              </Label>
            </div>
          </div>
        </div>
      </div>

      {apiError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Request failed</p>
            <p className="mt-0.5 text-xs text-destructive/80">{apiError}</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 inline-flex gap-0.5 rounded-lg bg-muted p-1">
          {([
            { id: 'live', label: 'Live share', Icon: MonitorUp },
            { id: 'frames', label: 'Frame upload', Icon: LayoutGrid },
            { id: 'video', label: 'Video upload', Icon: Film },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setMode(id);
                setFileError(null);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === id
                  ? 'border border-border/40 bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {mode === 'live' && (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="overflow-hidden rounded-xl border bg-muted/20">
                <div className="relative aspect-video bg-muted/30">
                  {screenPreviewStream ? (
                    <video ref={previewRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="rounded-full border border-border/70 bg-background px-4 py-2 text-xs text-muted-foreground">
                        Live preview appears here
                      </div>
                    </div>
                  )}

                  <div className="absolute left-3 top-3 flex items-center gap-2">
                    <span className="rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground">
                      {analysisEngineLabel}
                    </span>
                    {isScreenSharing ? (
                      <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                        Live share active
                      </span>
                    ) : null}
                  </div>

                  {isAnalyzingScreen ? (
                    <div className="absolute inset-x-3 bottom-3">
                      <p className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs text-foreground shadow-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analyzing frame #{screenFrameNumber || 1} with Gemini...
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      Live summary
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      Browser capture + Gemini analysis
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium',
                      isScreenSharing
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {isScreenSharing ? 'Running' : 'Idle'}
                  </span>
                </div>

                <p
                  className={cn(
                    'mt-4 whitespace-pre-wrap text-sm leading-6',
                    screenShareError ? 'text-rose-700' : 'text-foreground',
                  )}
                >
                  {latestAnalysisMessage}
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2.5 py-1">
                    Frame #{screenFrameNumber || 0}
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1">
                    Target {values.targetFps} FPS
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1">
                    Engine {analysisEngineLabel}
                  </span>
                </div>

                {lastScreenAnalysisAt ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Last updated {formatScreenAnalysisTimestamp(lastScreenAnalysisAt)}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!values.consent || isScreenSharing}
                    onClick={() => {
                      void startScreenSharing();
                    }}
                  >
                    <MonitorUp className="mr-1.5 h-3.5 w-3.5" />
                    Share screen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!isScreenSharing}
                    onClick={stopLiveSharing}
                  >
                    <Square className="mr-1.5 h-3.5 w-3.5" />
                    Stop sharing
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Live frame history</p>
                  <p className="text-xs text-muted-foreground">
                    Readable Gemini summaries from this share session.
                  </p>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {screenAnalysisHistory.length}
                </span>
              </div>

              {screenAnalysisHistory.length > 0 ? (
                <div className="mt-3 space-y-2.5">
                  {screenAnalysisHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-border/70 bg-card/80 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Frame #{entry.frameNumber}</span>
                        <span>{formatScreenAnalysisTimestamp(entry.recordedAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                        {entry.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {isScreenSharing
                    ? 'Waiting for the first Gemini frame summary.'
                    : 'Start sharing your screen to build a live analysis timeline.'}
                </p>
              )}
            </div>
          </div>
        )}

        {mode === 'frames' && (
          <div className="space-y-3">
            <DropZone
              dragging={framesDragging}
              onDragOver={(e) => {
                e.preventDefault();
                setFramesDragging(true);
              }}
              onDragLeave={() => setFramesDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setFramesDragging(false);
                setFrames(Array.from(e.dataTransfer.files));
              }}
              onClick={() => document.getElementById('frames-input')?.click()}
              icon={<LayoutGrid className="h-6 w-6 text-muted-foreground/40" />}
              label={
                <>
                  Drop frames here or <span className="font-medium text-violet-600">browse</span>
                </>
              }
              sub="PNG, JPG - multiple files supported"
            >
              <input
                id="frames-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => setFrames(Array.from(e.target.files || []))}
              />
            </DropZone>
            {frames.length > 0 && (
              <FileChip label={`${frames.length} frame${frames.length !== 1 ? 's' : ''} selected`} />
            )}
            {fileError && mode === 'frames' && <FieldError message={fileError} />}
            <Button type="submit" size="sm" disabled={isPending || frames.length === 0}>
              {frameMut.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Analyze frames
                </>
              )}
            </Button>
          </div>
        )}

        {mode === 'video' && (
          <div className="space-y-3">
            <DropZone
              dragging={videoDragging}
              onDragOver={(e) => {
                e.preventDefault();
                setVideoDragging(true);
              }}
              onDragLeave={() => setVideoDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setVideoDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) setVideo(f);
              }}
              onClick={() => document.getElementById('video-input')?.click()}
              icon={<Video className="h-6 w-6 text-muted-foreground/40" />}
              label={
                <>
                  Drop a video here or <span className="font-medium text-violet-600">browse</span>
                </>
              }
              sub="MP4, MOV, WEBM supported"
            >
              <input
                id="video-input"
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setVideo(e.target.files?.[0] || null)}
              />
            </DropZone>
            {video && (
              <FileChip label={`${video.name} - ${(video.size / 1024 / 1024).toFixed(1)} MB`} />
            )}
            {fileError && mode === 'video' && <FieldError message={fileError} />}
            <Button type="submit" size="sm" disabled={isPending || !video}>
              {videoMut.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Video className="mr-1.5 h-3.5 w-3.5" />
                  Analyze video
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {isPending && !result && <ScreenshareLoading />}
      {result && <ScreenshareResults result={result} />}
    </form>
  );
}

function DropZone({
  dragging,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  icon,
  label,
  sub,
  children,
}: {
  dragging: boolean;
  onDragOver: React.DragEventHandler;
  onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler;
  onClick: () => void;
  icon: React.ReactNode;
  label: React.ReactNode;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'cursor-pointer rounded-lg border-[1.5px] border-dashed px-4 py-8 text-center transition-colors',
        dragging
          ? 'border-violet-400 bg-violet-50/60'
          : 'border-border/60 hover:border-violet-400/60 hover:bg-violet-50/30',
      )}
    >
      <div className="flex flex-col items-center gap-2">
        {icon}
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xs text-muted-foreground/60">{sub}</p>
      </div>
      {children}
    </div>
  );
}

function FileChip({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-destructive">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}

function ScreenshareResults({ result }: { result: ScreenshareResult }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          { label: 'Source FPS', value: result.source_fps },
          { label: 'Target FPS', value: result.target_fps },
          { label: 'Uploaded frames', value: result.uploaded_frames },
          { label: 'Processed frames', value: result.processed_frames },
        ].map((s) => (
          <div key={s.label} className="rounded-md bg-muted/40 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Transition scores
          </p>
          <div className="space-y-3">
            <GaugeBar label="Average" value={result.avg_transition_score} />
            <GaugeBar label="Maximum" value={result.max_transition_score} />
          </div>
          {typeof result.reference_similarity === 'number' && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Reference similarity
              </p>
              <GaugeBar label="Score" value={result.reference_similarity} />
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Final frame
          </p>
          <p className="mb-2 text-sm leading-relaxed">{result.final_frame.caption}</p>
          {result.final_frame.ocr_text_preview && (
            <pre className="mb-2 whitespace-pre-wrap rounded-md bg-muted/40 px-2.5 py-2 font-mono text-xs text-muted-foreground">
              {result.final_frame.ocr_text_preview}
            </pre>
          )}
          <div className="flex flex-wrap gap-1.5">
            {result.final_frame.labels.map((l, i) => (
              <span
                key={i}
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
              >
                {l}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {result.final_frame.element_count} elements detected
          </p>
        </div>
      </div>

      {result.assistance_hints.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Assistance hints
          </p>
          <ul className="space-y-0">
            {result.assistance_hints.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5 border-b py-2 text-sm last:border-b-0">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.embedding_backend && (
        <p className="text-xs text-muted-foreground">Embedding backend: {result.embedding_backend}</p>
      )}
    </div>
  );
}

function GaugeBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(Math.round(value * 100), 100);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScreenshareLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md bg-muted/40 px-3 py-2.5">
            <Skeleton className="mb-2 h-2.5 w-20" />
            <Skeleton className="h-6 w-10" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="mb-4 h-2.5 w-32" />
          <Skeleton className="mb-3 h-1.5 w-full" />
          <Skeleton className="h-1.5 w-full" />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="mb-4 h-2.5 w-24" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

async function captureScreenFrame(stream: MediaStream): Promise<File | null> {
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
          return undefined;
        }),
        waitForDuration(LIVE_SCREEN_CAPTURE_PLAY_TIMEOUT_MS),
      ]);
    }

    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      await new Promise<void>((resolve) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const timer = window.setTimeout(() => {
          cleanup();
          resolve();
        }, LIVE_SCREEN_CAPTURE_READY_TIMEOUT_MS);
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

    const frame = await renderCanvasImageToFile({
      imageSource: video,
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
    });
    if (frame) {
      return frame;
    }

    await waitForDuration(LIVE_SCREEN_CAPTURE_STABILIZE_DELAY_MS);
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
    waitForDuration<Blob | null>(LIVE_SCREEN_CAPTURE_TO_BLOB_TIMEOUT_MS, null),
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

async function waitForVideoPaint(video: HTMLVideoElement) {
  await waitForDuration(LIVE_SCREEN_CAPTURE_STABILIZE_DELAY_MS);
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

function getRetainedScreenAnalysisText(text: string | null | undefined) {
  const normalized = (text || '').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('Capturing frame ') || normalized.startsWith('Uploading frame ')) {
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
    return (
      normalized.startsWith('the shared frame looks blank') ||
      normalized.startsWith('the shared frame looks unreadable')
    );
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
