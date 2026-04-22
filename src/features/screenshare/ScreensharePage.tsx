import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { visualAiApi } from "@/shared/api/visual-ai";
import { normalizeError } from "@/shared/api/client";
import { getClientConfigBoolean, getClientConfigNumber } from "@/shared/config/clientConfig";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, Loader2, Video, AlertCircle, CheckCircle } from "lucide-react";
import type { ScreenshareResult } from "@/shared/types";

type FormValues = {
  consent: boolean;
  targetFps: number;
  referenceKey?: string;
  useGeminiEmbeddings?: boolean;
};

type ScreensharePageProps = {
  embedded?: boolean;
};

const screenshareSchema = z.object({
  consent: z.preprocess(
    (v) => {
      if (typeof v === "string") return v === "true" || v === "on";
      return v;
    },
    z.boolean().refine((v) => v === true, { message: "Consent is required to analyze your screen." }),
  ),
  targetFps: z.coerce.number().min(0.1, "Target FPS must be positive.").max(60, "Target FPS looks too high."),
  referenceKey: z
    .string()
    .optional()
    .transform((v) => (v && v.trim().length ? v.trim() : undefined)),
  useGeminiEmbeddings: z.boolean().optional(),
});

export function ScreensharePage({ embedded = false }: ScreensharePageProps = {}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"frames" | "video">("frames");
  const [frames, setFrames] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [result, setResult] = useState<ScreenshareResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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
      targetFps: getClientConfigNumber("VITE_DEFAULT_SCREENSHARE_TARGET_FPS", 2),
      referenceKey: "",
      useGeminiEmbeddings: getClientConfigBoolean("VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS", false),
    },
    mode: "onSubmit",
  });

  const values = watch();

  const frameMut = useMutation({
    mutationFn: (payload: { files: File[]; opts: Record<string, any> }) =>
      visualAiApi.screenshareFrames(payload.files, payload.opts),
    onSuccess: (res) => {
      setResult(res);
      setApiError(null);
    },
    onError: (err) => {
      const msg = normalizeError(err);
      setApiError(msg);
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    },
  });

  const videoMut = useMutation({
    mutationFn: (payload: { file: File; opts: Record<string, any> }) =>
      visualAiApi.screenshareVideo(payload.file, payload.opts),
    onSuccess: (res) => {
      setResult(res);
      setApiError(null);
    },
    onError: (err) => {
      const msg = normalizeError(err);
      setApiError(msg);
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    },
  });

  const opts = useMemo(() => {
    const o: Record<string, any> = {
      consent: values.consent,
      target_fps: values.targetFps,
      reference_key: values.referenceKey || undefined,
      use_gemini_embeddings: values.useGeminiEmbeddings ? true : undefined,
    };

    // FastAPI ignores undefined fields; omit them entirely for cleaner requests.
    Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
    return o;
  }, [values.consent, values.targetFps, values.referenceKey, values.useGeminiEmbeddings]);

  const onSubmit = async (_data: FormValues) => {
    setFileError(null);
    setApiError(null);
    // Zod handles consent/target FPS, but file presence is mode-dependent.
    if (mode === "frames" && frames.length === 0) {
      setFileError("Please select at least one frame.");
      return;
    }
    if (mode === "video" && !video) {
      setFileError("Please select a video file.");
      return;
    }

    if (mode === "frames") {
      frameMut.mutate({ files: frames, opts });
    } else {
      videoMut.mutate({ file: video!, opts });
    }
  };

  return (
    <div className={embedded ? "space-y-6" : "p-6 space-y-6 max-w-5xl mx-auto"}>
      {!embedded && <h1 className="text-2xl font-bold tracking-tight">Screenshare Assistance</h1>}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Shared controls */}
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <h3 className="text-sm font-semibold">Settings</h3>

          <div className="flex items-start gap-3">
            <input type="hidden" {...register("consent")} />
            <Checkbox
              id="consent"
              checked={values.consent}
              onCheckedChange={(c) => setValue("consent", !!c, { shouldValidate: true })}
            />
            <div>
              <Label htmlFor="consent" className="text-sm">
                I consent to screen analysis <span className="text-destructive">*</span>
              </Label>
              {errors.consent?.message && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.consent.message}
                </p>
              )}
              {!errors.consent?.message && !values.consent && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Consent is required to analyze your screen.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs">Target FPS</Label>
              <Input type="number" step={0.1} {...register("targetFps")} />
              {errors.targetFps?.message && <p className="text-xs text-destructive mt-1">{errors.targetFps.message}</p>}
            </div>
            <div>
              <Label className="text-xs">Reference Key</Label>
              <Input {...register("referenceKey")} placeholder="optional" />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch
                checked={!!values.useGeminiEmbeddings}
                onCheckedChange={(v) => setValue("useGeminiEmbeddings", v, { shouldValidate: false })}
                id="gemini"
              />
              <Label htmlFor="gemini" className="text-xs">
                Gemini Embeddings
              </Label>
            </div>
          </div>
        </div>

        {apiError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{apiError}</AlertDescription>
          </Alert>
        )}

        <Tabs value={mode} onValueChange={(v) => setMode(v as "frames" | "video")}>
          <TabsList>
            <TabsTrigger value="frames">Frame Upload Mode</TabsTrigger>
            <TabsTrigger value="video">Video Upload Mode</TabsTrigger>
          </TabsList>

          <TabsContent value="frames" className="mt-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label>Upload Frames</Label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFrames(Array.from(e.target.files || []))}
              />
              {frames.length > 0 && <p className="text-xs text-muted-foreground">{frames.length} frames selected</p>}
              {mode === "frames" && fileError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {fileError}
                </p>
              )}

              <Button type="submit" size="sm" disabled={frameMut.isPending || frames.length === 0}>
                {frameMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Analyze Frames
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="video" className="mt-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <Label>Upload Video</Label>
              <Input
                type="file"
                accept="video/*"
                onChange={(e) => setVideo(e.target.files?.[0] || null)}
              />
              {video && (
                <p className="text-xs text-muted-foreground">
                  {video.name} ({(video.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}
              {mode === "video" && fileError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {fileError}
                </p>
              )}

              <Button type="submit" size="sm" disabled={videoMut.isPending || !video}>
                {videoMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Video className="h-4 w-4 mr-1" />
                )}
                Analyze Video
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {(frameMut.isPending || videoMut.isPending) && !result && <ScreenshareLoading />}

        {result && <ScreenshareResults result={result} />}
      </form>
    </div>
  );
}

function ScreenshareResults({ result }: { result: ScreenshareResult }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <ResultCard label="Source FPS" value={result.source_fps} />
        <ResultCard label="Target FPS" value={result.target_fps} />
        <ResultCard label="Uploaded Frames" value={result.uploaded_frames} />
        <ResultCard label="Processed Frames" value={result.processed_frames} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Transition Scores</h3>
          <div className="space-y-3">
            <GaugeBar label="Average" value={result.avg_transition_score} />
            <GaugeBar label="Maximum" value={result.max_transition_score} />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Final Frame Summary</h3>
          <p className="text-sm">{result.final_frame.caption}</p>
          {result.final_frame.ocr_text_preview && (
            <p className="text-xs font-mono bg-muted rounded p-2 mt-2 whitespace-pre-wrap">{result.final_frame.ocr_text_preview}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-2" aria-label="Detected labels">
            {result.final_frame.labels.map((l, i) => (
              <span key={i} className="text-xs bg-accent rounded-full px-2 py-0.5">
                {l}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Elements: {result.final_frame.element_count}</p>
        </div>
      </div>

      {result.assistance_hints.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">Assistance Hints</h3>
          <ul className="space-y-1.5">
            {result.assistance_hints.map((h, i) => (
              <li key={i} className="text-sm flex gap-2"><CheckCircle className="h-3 w-3 mt-1 text-success shrink-0" />{h}</li>
            ))}
          </ul>
        </div>
      )}

      {typeof result.reference_similarity === "number" && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">Reference Similarity</h3>
          <GaugeBar label="Score" value={result.reference_similarity} />
        </div>
      )}

      {result.embedding_backend && (
        <p className="text-xs text-muted-foreground">Embedding backend: {result.embedding_backend}</p>
      )}
    </div>
  );
}

function ResultCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function GaugeBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(value * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span className="font-medium">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScreenshareLoading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16 mt-3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-40 mb-3" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-full mt-2" />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <Skeleton className="h-4 w-52 mb-3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full mt-2" />
        </div>
      </div>
    </div>
  );
}
