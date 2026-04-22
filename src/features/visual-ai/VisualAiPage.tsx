import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { visualAiApi } from '@/shared/api/visual-ai';
import { normalizeError } from '@/shared/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VisualAiScreenshareTab } from '@/features/visual-ai/VisualAiScreenshareTab';
import { VisualAiTroubleshootingWizardTab } from '@/features/visual-ai/VisualAiTroubleshootingWizardTab';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth/AuthContext';
import { Upload, Loader2, Trash2, AlertCircle, Plus } from 'lucide-react';
import type { ScreenshotAnalysis, ReferenceScreen } from '@/shared/types';

export function VisualAiPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ScreenshotAnalysis | null>(null);
  const [refName, setRefName] = useState('');
  const [refKey, setRefKey] = useState('');
  const [refDescription, setRefDescription] = useState('');
  const [refExpectedOcr, setRefExpectedOcr] = useState('');
  const [refExpectedElements, setRefExpectedElements] = useState('');
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refFormError, setRefFormError] = useState<string | null>(null);

  const requestedTab = searchParams.get('tab');
  const availableTabs = user?.role === 'admin'
    ? ['analyze', 'screenshare', 'wizard', 'references']
    : ['analyze', 'screenshare', 'wizard'];
  const defaultTab = requestedTab && availableTabs.includes(requestedTab) ? requestedTab : 'analyze';

  const analyzeMut = useMutation({
    mutationFn: () => visualAiApi.analyzeScreenshot(file!),
    onSuccess: setAnalysis,
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  const createRefMut = useMutation({
    mutationFn: async () => {
      const trimmedName = refName.trim();
      const trimmedKey = refKey.trim();

      if (!refFile) {
        throw new Error('Please select a reference image.');
      }
      if (!trimmedName) {
        throw new Error('Reference name is required.');
      }
      if (!trimmedKey) {
        throw new Error('Reference key is required.');
      }

      const fd = new FormData();
      fd.append('file', refFile);
      fd.append('name', trimmedName);
      fd.append('screen_key', trimmedKey);

      const trimmedDescription = refDescription.trim();
      const trimmedExpectedOcr = refExpectedOcr.trim();
      const trimmedExpectedElements = refExpectedElements.trim();

      if (trimmedDescription) {
        fd.append('description', trimmedDescription);
      }
      if (trimmedExpectedOcr) {
        fd.append('expected_ocr_text', trimmedExpectedOcr);
      }
      if (trimmedExpectedElements) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmedExpectedElements);
        } catch {
          throw new Error('Expected elements must be valid JSON.');
        }
        if (!Array.isArray(parsed)) {
          throw new Error('Expected elements JSON must be an array.');
        }
        fd.append('expected_elements', JSON.stringify(parsed));
      }

      return visualAiApi.references.create(fd);
    },
    onSuccess: () => {
      setRefName('');
      setRefKey('');
      setRefDescription('');
      setRefExpectedOcr('');
      setRefExpectedElements('');
      setRefFile(null);
      setRefFormError(null);
      void qc.invalidateQueries({ queryKey: ['visual-ai-refs'] });
      toast({ title: 'Reference created' });
    },
    onError: (err) => {
      const msg = normalizeError(err);
      setRefFormError(msg);
      toast({ variant: 'destructive', description: msg });
    },
  });

  const { data: refs, isLoading: refsLoading } = useQuery({ queryKey: ['visual-ai-refs'], queryFn: visualAiApi.references.list });
  const deleteMut = useMutation({
    mutationFn: visualAiApi.references.delete,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['visual-ai-refs'] });
      toast({ title: 'Reference deleted' });
    },
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Visual AI</h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="analyze">Screenshot Assistant</TabsTrigger>
          <TabsTrigger value="screenshare">Live Screenshare Help</TabsTrigger>
          <TabsTrigger value="wizard">Troubleshooting Wizard</TabsTrigger>
          {user?.role === 'admin' && <TabsTrigger value="references">References</TabsTrigger>}
        </TabsList>

        <TabsContent value="analyze" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload one screenshot to get OCR, detected elements, and actionable guidance.
            </p>
            <Label>Upload Screenshot</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={e => {
                setFile(e.target.files?.[0] || null);
                setAnalysis(null);
              }}
            />
            <Button size="sm" disabled={!file || analyzeMut.isPending} onClick={() => analyzeMut.mutate()}>
              {analyzeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}Analyze
            </Button>
          </div>
          {analysis && <AnalysisResult analysis={analysis} previewUrl={filePreviewUrl} />}
        </TabsContent>

        <TabsContent value="screenshare" className="mt-4">
          <div className="mb-4 rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Use this mode during a live user session to analyze frame/video captures and receive step-by-step assistance hints.
            </p>
          </div>
          <VisualAiScreenshareTab />
        </TabsContent>

        <TabsContent value="wizard" className="mt-4">
          <div className="mb-4 rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Generate a guided troubleshooting flow from the user goal and current on-screen context.
            </p>
          </div>
          <VisualAiTroubleshootingWizardTab />
        </TabsContent>

        {user?.role === 'admin' && (
          <TabsContent value="references" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold">Create Reference Screen</h3>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={refName}
                    onChange={(e) => {
                      setRefName(e.target.value);
                      setRefFormError(null);
                    }}
                    placeholder="Checkout confirmation screen"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Reference Key</Label>
                  <Input
                    value={refKey}
                    onChange={(e) => {
                      setRefKey(e.target.value);
                      setRefFormError(null);
                    }}
                    placeholder="checkout_confirmation"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description (optional)</Label>
                  <Input
                    value={refDescription}
                    onChange={(e) => setRefDescription(e.target.value)}
                    placeholder="Expected page after successful checkout"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Expected OCR text (optional)</Label>
                  <Input
                    value={refExpectedOcr}
                    onChange={(e) => setRefExpectedOcr(e.target.value)}
                    placeholder="Order confirmed"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Expected elements JSON array (optional)</Label>
                  <Input
                    value={refExpectedElements}
                    onChange={(e) => {
                      setRefExpectedElements(e.target.value);
                      setRefFormError(null);
                    }}
                    placeholder='[{"type":"BUTTON","label":"Continue"}]'
                  />
                </div>
                <div className="space-y-1">
                  <Label>Reference image</Label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setRefFile(e.target.files?.[0] || null);
                      setRefFormError(null);
                    }}
                  />
                </div>
                {refFormError ? <p className="text-xs text-destructive">{refFormError}</p> : null}
                <Button
                  size="sm"
                  disabled={createRefMut.isPending || !refFile || !refName.trim() || !refKey.trim()}
                  onClick={() => createRefMut.mutate()}
                >
                  {createRefMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1" />
                  )}
                  Create reference
                </Button>
              </div>

              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="border-b px-4 py-3">
                  <h3 className="text-sm font-semibold">Saved References</h3>
                </div>
                {refsLoading ? <div className="p-4 text-sm text-muted-foreground">Loading...</div> : !refs?.length ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">No reference screens</div>
                ) : (
                  <div className="divide-y">
                    {refs.map((r: ReferenceScreen) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            Key: {r.key} · {new Date(r.created_at).toLocaleDateString()}
                          </p>
                          {r.description ? (
                            <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                          ) : null}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(r.id)}
                        >
                          {deleteMut.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function AnalysisResult({
  analysis,
  previewUrl,
}: {
  analysis: ScreenshotAnalysis;
  previewUrl?: string | null;
}) {
  const confidencePercent =
    typeof analysis.confidence === 'number'
      ? `${Math.round(Math.max(0, Math.min(1, analysis.confidence)) * 100)}%`
      : 'N/A';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Analysis Result</h3>

      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-lg border bg-muted/20 p-2">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Analyzed screenshot"
              className="h-40 w-full rounded object-contain bg-background"
            />
          ) : (
            <div className="flex h-40 items-center justify-center rounded bg-background text-xs text-muted-foreground">
              No preview
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase text-muted-foreground">Provider</p>
              <p className="text-sm font-medium">{analysis.provider || 'gemini'}</p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase text-muted-foreground">Confidence</p>
              <p className="text-sm font-medium">{confidencePercent}</p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase text-muted-foreground">Latency</p>
              <p className="text-sm font-medium">
                {typeof analysis.processing_ms === 'number' ? `${analysis.processing_ms} ms` : 'N/A'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Caption</p>
            <p className="text-sm mt-1">{analysis.caption || 'No caption detected for this screenshot.'}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">OCR Text</p>
            <p className="text-sm bg-muted rounded p-2 mt-1 font-mono text-xs whitespace-pre-wrap">
              {analysis.ocr_text || 'No OCR text detected.'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {analysis.labels.length ? analysis.labels.map((l, i) => <span key={i} className="text-xs bg-accent rounded-full px-2 py-0.5">{l}</span>) : (
          <span className="text-xs text-muted-foreground">No labels detected.</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Elements detected: {analysis.elements}</p>

      {analysis.ui_elements && analysis.ui_elements.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Detected Elements</p>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Type</th>
                  <th className="px-2 py-1 text-left font-medium">Label</th>
                  <th className="px-2 py-1 text-left font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {analysis.ui_elements.map((e, i) => (
                  <tr key={`${e.type || 'unknown'}-${i}`} className="border-t">
                    <td className="px-2 py-1">{e.type || '-'}</td>
                    <td className="px-2 py-1">{e.label || e.text || '-'}</td>
                    <td className="px-2 py-1">
                      {typeof e.confidence === 'number' ? `${Math.round(e.confidence * 100)}%` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {analysis.regions && analysis.regions.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Detected Regions</p>
          <ul className="space-y-1">
            {analysis.regions.map((r, i) => (
              <li key={`region-${i}`} className="text-xs text-muted-foreground">
                {r.description || 'Unnamed region'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.guidance.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Guidance</p>
          <ul className="space-y-1">{analysis.guidance.map((g, i) => <li key={i} className="text-sm flex gap-2"><AlertCircle className="h-3 w-3 mt-1 text-info shrink-0" />{g}</li>)}</ul>
        </div>
      )}
      {analysis.gaps && analysis.gaps.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1 text-destructive">Gaps Detected</p>
          <ul className="space-y-1">{analysis.gaps.map((g, i) => <li key={i} className="text-sm text-destructive">{g}</li>)}</ul>
        </div>
      )}

      <details className="rounded-md border bg-muted/20 p-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Raw provider payload</summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px]">
          {JSON.stringify(analysis.raw_result ?? {}, null, 2)}
        </pre>
      </details>
    </div>
  );
}
