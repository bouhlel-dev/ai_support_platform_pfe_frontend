import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { visualAiApi } from '@/shared/api/visual-ai';
import { normalizeError } from '@/shared/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VisualAiScreenshareTab } from '@/features/visual-ai/VisualAiScreenshareTab';
import { VisualAiTroubleshootingWizardTab } from '@/features/visual-ai/VisualAiTroubleshootingWizardTab';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth/AuthContext';
import {
  Upload,
  Loader2,
  Trash2,
  AlertCircle,
  Plus,
  Info,
  CheckCircle2,
  ImageIcon,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScreenshotAnalysis, ReferenceScreen } from '@/shared/types';

// ─── Tab config ───────────────────────────────────────────────────────────────

type TabId = 'analyze' | 'screenshare' | 'wizard' | 'references';

const ALL_TABS: { id: TabId; key: string }[] = [
  { id: 'analyze', key: 'screenshotTab' },
  { id: 'screenshare', key: 'screenshareTab' },
  { id: 'wizard', key: 'wizardTab' },
  { id: 'references', key: 'referencesTab' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export function VisualAiPage() {
  const { t } = useTranslation();
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

  const isAdmin = user?.role === 'admin';
  const visibleTabs = ALL_TABS.filter((t) => t.id !== 'references' || isAdmin);
  const requestedTab = searchParams.get('tab') as TabId | null;
  const validTab =
    requestedTab && visibleTabs.some((t) => t.id === requestedTab)
      ? requestedTab
      : 'analyze';
  const [activeTab, setActiveTab] = useState<TabId>(validTab);

  // ── analyze ───────────────────────────────────────────────────────────────

  const analyzeMut = useMutation({
    mutationFn: () => visualAiApi.analyzeScreenshot(file!),
    onSuccess: setAnalysis,
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  useEffect(() => {
    if (!file) { setFilePreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── reference mutations ───────────────────────────────────────────────────

  const createRefMut = useMutation({
    mutationFn: async () => {
      const trimmedName = refName.trim();
      const trimmedKey = refKey.trim();
      if (!refFile) throw new Error(t('visualAi.refImageRequired'));
      if (!trimmedName) throw new Error(t('visualAi.nameRequired'));
      if (!trimmedKey) throw new Error(t('visualAi.keyRequired'));

      const fd = new FormData();
      fd.append('file', refFile);
      fd.append('name', trimmedName);
      fd.append('screen_key', trimmedKey);

      const trimmedDescription = refDescription.trim();
      const trimmedExpectedOcr = refExpectedOcr.trim();
      const trimmedExpectedElements = refExpectedElements.trim();
      if (trimmedDescription) fd.append('description', trimmedDescription);
      if (trimmedExpectedOcr) fd.append('expected_ocr_text', trimmedExpectedOcr);
      if (trimmedExpectedElements) {
        let parsed: unknown;
        try { parsed = JSON.parse(trimmedExpectedElements); } catch {
          throw new Error(t('visualAi.elementsInvalid'));
        }
        if (!Array.isArray(parsed)) throw new Error(t('visualAi.elementsNotArray'));
        fd.append('expected_elements', JSON.stringify(parsed));
      }
      return visualAiApi.references.create(fd);
    },
    onSuccess: () => {
      setRefName(''); setRefKey(''); setRefDescription('');
      setRefExpectedOcr(''); setRefExpectedElements('');
      setRefFile(null); setRefFormError(null);
      void qc.invalidateQueries({ queryKey: ['visual-ai-refs'] });
      toast({ title: t('visualAi.referenceCreated') });
    },
    onError: (err) => {
      const msg = normalizeError(err);
      setRefFormError(msg);
      toast({ variant: 'destructive', description: msg });
    },
  });

  const { data: refs, isLoading: refsLoading } = useQuery({
    queryKey: ['visual-ai-refs'],
    queryFn: visualAiApi.references.list,
  });

  const deleteMut = useMutation({
    mutationFn: visualAiApi.references.delete,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['visual-ai-refs'] });
      toast({ title: t('visualAi.referenceDeleted') });
    },
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('visualAi.title')}</h1>
        {isAdmin && (
          <span className="rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-xs font-medium px-2.5 py-0.5">
            {t('visualAi.admin')}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm border border-border/40'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`visualAi.${tab.key}`)}
          </button>
        ))}
      </div>

      {/* Analyze tab */}
      {activeTab === 'analyze' && (
        <div className="space-y-4">
          <SectionCard>
            <p className="text-sm text-muted-foreground mb-4">
              {t('visualAi.screenshotDesc')}
            </p>
            <DropZone onFile={(f) => { setFile(f); setAnalysis(null); }} selectedFile={file} />
            <div className="mt-4 flex items-center gap-3">
              <Button size="sm" disabled={!file || analyzeMut.isPending} onClick={() => analyzeMut.mutate()}>
                {analyzeMut.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />{t('visualAi.analyzing')}</>
                  : <><Upload className="h-3.5 w-3.5 mr-1.5" />{t('visualAi.analyze')}</>}
              </Button>
              {!file && <span className="text-xs text-muted-foreground">{t('visualAi.selectImageFirst')}</span>}
            </div>
          </SectionCard>
          {analysis && <AnalysisResult analysis={analysis} previewUrl={filePreviewUrl} />}
        </div>
      )}

      {/* Screenshare tab */}
      {activeTab === 'screenshare' && (
        <div className="space-y-4">
          <SectionCard>
            <p className="text-sm text-muted-foreground">
              {t('visualAi.screenshareDesc')}
            </p>
          </SectionCard>
          <VisualAiScreenshareTab />
        </div>
      )}

      {/* Wizard tab */}
      {activeTab === 'wizard' && (
        <div className="space-y-4">
          <SectionCard>
            <p className="text-sm text-muted-foreground">
              {t('visualAi.wizardDesc')}
            </p>
          </SectionCard>
          <VisualAiTroubleshootingWizardTab />
        </div>
      )}

      {/* References tab */}
      {activeTab === 'references' && isAdmin && (
        <ReferencesTab
          refName={refName} setRefName={setRefName}
          refKey={refKey} setRefKey={setRefKey}
          refDescription={refDescription} setRefDescription={setRefDescription}
          refExpectedOcr={refExpectedOcr} setRefExpectedOcr={setRefExpectedOcr}
          refExpectedElements={refExpectedElements} setRefExpectedElements={setRefExpectedElements}
          refFile={refFile} setRefFile={setRefFile}
          refFormError={refFormError} setRefFormError={setRefFormError}
          refs={refs} refsLoading={refsLoading}
          createRefMut={createRefMut}
          deleteMut={deleteMut}
        />
      )}
    </div>
  );
}

// ─── References tab ───────────────────────────────────────────────────────────

function ReferencesTab({
  refName, setRefName,
  refKey, setRefKey,
  refDescription, setRefDescription,
  refExpectedOcr, setRefExpectedOcr,
  refExpectedElements, setRefExpectedElements,
  refFile, setRefFile,
  refFormError, setRefFormError,
  refs, refsLoading,
  createRefMut,
  deleteMut,
}: any) {
  const { t } = useTranslation();
  const canCreate = !createRefMut.isPending && refFile && refName.trim() && refKey.trim();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

      {/* ── Create form ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-4 py-3.5 border-b">
          <p className="text-sm font-medium">{t('visualAi.newReference')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('visualAi.referencesDesc')}
          </p>
        </div>

        <div className="p-4">
          {/* Identity */}
          <div className="space-y-3 mb-4">
            <FormField label={t('visualAi.name')}>
              <Input
                value={refName}
                onChange={(e) => { setRefName(e.target.value); setRefFormError(null); }}
                placeholder={t('visualAi.namePlaceholder')}
              />
            </FormField>
            <FormField label={t('visualAi.screenKey')} hint={t('visualAi.slugHint')}>
              <Input
                value={refKey}
                onChange={(e) => { setRefKey(e.target.value); setRefFormError(null); }}
                placeholder={t('visualAi.keyPlaceholder')}
                className="font-mono text-sm"
              />
            </FormField>
            <FormField label={t('visualAi.description')} optional>
              <Input
                value={refDescription}
                onChange={(e) => setRefDescription(e.target.value)}
                placeholder={t('visualAi.descPlaceholder')}
              />
            </FormField>
          </div>

          <div className="border-t my-4" />

          {/* Matching hints */}
          <div className="space-y-3 mb-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('visualAi.matchingHints')}
            </p>
            <FormField label={t('visualAi.expectedOcr')} optional>
              <Input
                value={refExpectedOcr}
                onChange={(e) => setRefExpectedOcr(e.target.value)}
                placeholder={t('visualAi.ocrPlaceholder')}
              />
            </FormField>
            <FormField label={t('visualAi.expectedElements')} optional hint={t('visualAi.jsonArray')}>
              <Textarea
                value={refExpectedElements}
                onChange={(e) => { setRefExpectedElements(e.target.value); setRefFormError(null); }}
                placeholder={t('visualAi.elementsPlaceholder')}
                rows={2}
                className="font-mono text-xs resize-none"
              />
            </FormField>
          </div>

          <div className="border-t my-4" />

          {/* Image upload */}
          <div className="mb-4">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
              {t('visualAi.referenceImage')}
            </p>
            <DropZone
              onFile={(f: File) => { setRefFile(f); setRefFormError(null); }}
              selectedFile={refFile}
              compact
            />
          </div>

          {refFormError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive mb-3">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {refFormError}
            </p>
          )}

          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={!canCreate}
            onClick={() => createRefMut.mutate()}
          >
            {createRefMut.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('visualAi.creating')}</>
              : <><Plus className="h-3.5 w-3.5" />{t('visualAi.createReference')}</>}
          </Button>
        </div>
      </div>

      {/* ── List ── */}
      <div className="rounded-xl border bg-card overflow-hidden self-start">
        <div className="flex items-center justify-between px-4 py-3.5 border-b">
          <p className="text-sm font-medium">{t('visualAi.savedReferences')}</p>
          {refs?.length ? (
            <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5">
              {refs.length}
            </span>
          ) : null}
        </div>

        {refsLoading ? (
          <div className="flex items-center justify-center p-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !refs?.length ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Monitor className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('visualAi.noReferences')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('visualAi.noReferencesHint')}
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y">
            {refs.map((r: ReferenceScreen) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3.5 group">
                {/* Thumbnail */}
                <div className="h-11 w-11 flex-shrink-0 rounded-md border bg-muted/40 flex items-center justify-center overflow-hidden">
                  {(r as any).thumbnail_url ? (
                    <img
                      src={(r as any).thumbnail_url}
                      alt={r.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>

                {/* Meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="font-mono text-[11px] bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400 rounded px-1.5 py-0.5">
                      {r.key}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                  {r.description && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">{r.description}</p>
                  )}
                </div>

                {/* Delete — revealed on hover */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'h-8 w-8 shrink-0 text-muted-foreground transition-all',
                    'opacity-0 group-hover:opacity-100',
                    'hover:text-destructive hover:bg-destructive/10',
                  )}
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate(r.id)}
                  aria-label={t('visualAi.deleteLabel', { name: r.name })}
                >
                  {deleteMut.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-card p-4">{children}</div>;
}

function FormField({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        {label}
        {hint && <span className="font-mono font-normal opacity-50 text-[10px]">({hint})</span>}
        {optional && <span className="font-normal opacity-50">{t('visualAi.referenceOptional')}</span>}
      </Label>
      {children}
    </div>
  );
}

function DropZone({
  onFile,
  selectedFile,
  compact = false,
}: {
  onFile: (f: File) => void;
  selectedFile: File | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'relative cursor-pointer rounded-lg border-[1.5px] border-dashed transition-colors',
        dragging
          ? 'border-violet-400 bg-violet-50/60 dark:bg-violet-900/20'
          : 'border-border/60 hover:border-violet-400/60 hover:bg-violet-50/30 dark:hover:bg-violet-900/10',
        compact ? 'px-3 py-3.5' : 'px-4 py-8',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {selectedFile ? (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-medium truncate">{selectedFile.name}</span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {(selectedFile.size / 1024).toFixed(0)} KB
          </span>
        </div>
      ) : (
        <div className={cn('flex flex-col items-center gap-1 text-center', compact && 'gap-0.5')}>
          <Upload className={cn('text-muted-foreground/50', compact ? 'h-4 w-4' : 'h-6 w-6')} />
          <p className="text-sm text-muted-foreground">
            {t('visualAi.dropImage')}
          </p>
          {!compact && <p className="text-xs text-muted-foreground/60">{t('visualAi.imageFormats')}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Analysis result ──────────────────────────────────────────────────────────

function AnalysisResult({
  analysis,
  previewUrl,
}: {
  analysis: ScreenshotAnalysis;
  previewUrl?: string | null;
}) {
  const { t } = useTranslation();
  const confidencePct =
    typeof analysis.confidence === 'number'
      ? `${Math.round(Math.max(0, Math.min(1, analysis.confidence)) * 100)}%`
      : 'N/A';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
        <div className="rounded-lg border bg-muted/30 flex items-center justify-center h-44 overflow-hidden">
          {previewUrl ? (
            <img src={previewUrl} alt="Analyzed screenshot" className="h-full w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground/40">
              <ImageIcon className="h-6 w-6" />
              <span className="text-xs">{t('visualAi.noPreview')}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t('visualAi.provider'), value: analysis.provider || 'gemini' },
              { label: t('visualAi.confidence'), value: confidencePct },
              { label: t('visualAi.latency'), value: typeof analysis.processing_ms === 'number' ? `${analysis.processing_ms} ms` : 'N/A' },
            ].map((m) => (
              <div key={m.label} className="rounded-md bg-muted/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
                <p className="text-sm font-semibold mt-0.5">{m.value}</p>
              </div>
            ))}
          </div>

          <div>
            <SectionLabel>{t('visualAi.noCaption')}</SectionLabel>
            <p className="text-sm leading-relaxed text-muted-foreground mt-1">
              {analysis.caption || t('visualAi.noCaption')}
            </p>
          </div>

          <div>
            <SectionLabel>{t('visualAi.noLabels')}</SectionLabel>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {analysis.labels.length
                ? analysis.labels.map((l, i) => (
                    <span key={i} className="text-xs bg-secondary rounded-full px-2.5 py-0.5 text-secondary-foreground">
                      {l}
                    </span>
                  ))
                : <span className="text-xs text-muted-foreground">{t('visualAi.noLabels')}</span>}
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>{t('visualAi.noOcr')}</SectionLabel>
        <pre className="mt-1 rounded-md bg-muted/40 px-3 py-2 text-xs font-mono whitespace-pre-wrap leading-relaxed text-muted-foreground">
          {analysis.ocr_text || t('visualAi.noOcr')}
        </pre>
      </div>

      {analysis.ui_elements && analysis.ui_elements.length > 0 && (
        <div>
          <SectionLabel>{t('visualAi.detectedElements', { count: analysis.ui_elements.length })}</SectionLabel>
          <div className="mt-1 rounded-md border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('visualAi.type')}</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('visualAi.label')}</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('visualAi.confidence')}</th>
                </tr>
              </thead>
              <tbody>
                {analysis.ui_elements.map((e: any, i: number) => (
                  <tr key={`${e.type}-${i}`} className="border-t">
                    <td className="px-3 py-2 font-mono">{e.type || '—'}</td>
                    <td className="px-3 py-2">{e.label || e.text || '—'}</td>
                    <td className="px-3 py-2">
                      {typeof e.confidence === 'number' ? `${Math.round(e.confidence * 100)}%` : '—'}
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
          <SectionLabel>{t('visualAi.detectedRegions')}</SectionLabel>
          <ul className="mt-1 space-y-1">
            {analysis.regions.map((r: any, i: number) => (
              <li key={i} className="text-xs text-muted-foreground">{r.description || t('visualAi.unnamedRegion')}</li>
            ))}
          </ul>
        </div>
      )}

      {analysis.guidance.length > 0 && (
        <div>
          <SectionLabel>{t('visualAi.guidance')}</SectionLabel>
          <ul className="mt-1 space-y-1.5">
            {analysis.guidance.map((g: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.gaps && analysis.gaps.length > 0 && (
        <div>
          <SectionLabel className="text-destructive">{t('visualAi.gapsDetected')}</SectionLabel>
          <ul className="mt-1 space-y-1.5">
            {analysis.gaps.map((g: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="rounded-md border bg-muted/20 p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
          {t('visualAi.rawPayload')}
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[11px] font-mono leading-relaxed">
          {JSON.stringify(analysis.raw_result ?? {}, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-semibold uppercase tracking-wide text-muted-foreground', className)}>
      {children}
    </p>
  );
}
