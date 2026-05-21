import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ragApi } from '@/shared/api/rag';
import { normalizeError } from '@/shared/api/client';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Activity,
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Filter,
  Hash,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import type { RagArticleCategory, RagArticleStatus, RagResponse } from '@/shared/types';

const ARTICLE_CATEGORIES: RagArticleCategory[] = [
  'TECHNICAL',
  'BILLING',
  'ACCOUNT',
  'GENERAL',
  'SECURITY',
  'TROUBLESHOOTING',
  'FAQ',
  'POLICY',
  'ONBOARDING',
  'FEATURE_GUIDE',
];

const ARTICLE_STATUS_FILTERS: Array<'all' | RagArticleStatus> = ['all', 'DRAFT', 'PUBLISHED', 'ARCHIVED'];

const STATUS_COLORS: Record<RagArticleStatus, string> = {
  DRAFT: 'bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800',
  PUBLISHED: 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:border-emerald-800',
  ARCHIVED: 'bg-slate-500/10 text-slate-500 border-slate-200 dark:border-slate-700',
};

const STATUS_PILL_ACTIVE: Record<string, string> = {
  all: 'bg-foreground text-background',
  DRAFT: 'bg-amber-500 text-white',
  PUBLISHED: 'bg-emerald-500 text-white',
  ARCHIVED: 'bg-slate-500 text-white',
};

function titleCaseEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function parseCsvTags(raw: string) {
  return Array.from(new Set(raw.split(',').map((t) => t.trim()).filter(Boolean)));
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 px-3 py-2.5">
      <div>
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
  );
}

// ─── Source card ──────────────────────────────────────────────────────────────
function SourceCard({ title, score, content }: { title: string; score: number; content: string }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round(score * 100);
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{title}</span>
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-1.5 w-16 rounded-full bg-border overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{score.toFixed(2)}</span>
        </div>
      </div>
      <p className={`text-xs text-muted-foreground leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>{content}</p>
      {content.length > 120 && (
        <button
          className="flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <><ChevronUp className="h-3 w-3" /> {t('rag.showLess')}</> : <><ChevronDown className="h-3 w-3" /> {t('rag.showMore')}</>}
        </button>
      )}
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function FilterPill({
  label,
  active,
  activeClass,
  onClick,
}: {
  label: string;
  active: boolean;
  activeClass: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
        active
          ? `${activeClass} border-transparent`
          : 'bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

// ─── Create Article Dialog ────────────────────────────────────────────────────
function CreateArticleDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<RagArticleCategory>('GENERAL');
  const [lang, setLang] = useState('en');
  const [tagsRaw, setTagsRaw] = useState('');
  const [autoIndex, setAutoIndex] = useState(true);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      ragApi.createArticle({
        title: title.trim(),
        content: content.trim(),
        summary: summary.trim() || undefined,
        category,
        tags: parseCsvTags(tagsRaw),
        language: lang.trim() || 'en',
        auto_index: autoIndex,
      }),
    onSuccess: () => {
      setOpen(false);
      setTitle('');
      setSummary('');
      setContent('');
      setTagsRaw('');
      onCreated();
      toast({ title: t('rag.articleCreated'), description: t('rag.articleCreatedDesc') });
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: t('rag.createFailed'), description: normalizeError(err) }),
  });

  const canCreate = title.trim().length >= 3 && content.trim().length >= 10;
  const tagPreviews = parseCsvTags(tagsRaw);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {t('rag.newArticle')}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('rag.createArticleTitle')}</DialogTitle>
          <DialogDescription>{t('rag.createArticleDesc')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-title" className="text-xs font-medium text-muted-foreground">
              {t('rag.title')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="modal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('rag.titlePlaceholder')}
              autoFocus
            />
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-summary" className="text-xs font-medium text-muted-foreground">
              {t('rag.summary')}{' '}
              <span className="text-muted-foreground/50 font-normal">({t('rag.optional')})</span>
            </Label>
            <Input
              id="modal-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t('rag.summaryPlaceholder')}
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="modal-content" className="text-xs font-medium text-muted-foreground">
                {t('rag.content')} <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs text-muted-foreground tabular-nums">{content.length} chars</span>
            </div>
            <Textarea
              id="modal-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              className="resize-none"
              placeholder={t('rag.contentPlaceholder')}
            />
          </div>

          {/* Category + Language */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{t('rag.category')}</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as RagArticleCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTICLE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{titleCaseEnum(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{t('rag.language')}</Label>
              <Input value={lang} onChange={(e) => setLang(e.target.value)} placeholder={t('rag.langPlaceholder')} />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {t('rag.tags')}{' '}
              <span className="text-muted-foreground/50 font-normal">({t('rag.commaSeparated')})</span>
            </Label>
            <Input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder={t('rag.tagsExample')}
            />
            {tagPreviews.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {tagPreviews.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 rounded-md bg-primary/8 px-1.5 py-0.5 text-xs text-primary/80"
                  >
                    <Hash className="h-2.5 w-2.5" />{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Auto-index toggle */}
          <ToggleRow
            label={t('rag.autoIndex')}
            description={t('rag.autoIndexDesc')}
            checked={autoIndex}
            onCheckedChange={setAutoIndex}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {t('rag.cancel')}
          </Button>
          <Button onClick={() => mutate()} disabled={!canCreate || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {t('rag.createArticle')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function RagPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAgentOrAdmin = user?.role === 'admin' || user?.role === 'agent';
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'tester' | 'articles' | 'pdfs'>('tester');

  // Tester
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('');
  const [tone, setTone] = useState('');
  const [topK, setTopK] = useState('5');
  const [language, setLanguage] = useState('');
  const [result, setResult] = useState<RagResponse | null>(null);

  // Articles — filters
  const [articleSearch, setArticleSearch] = useState('');
  const [articleStatus, setArticleStatus] = useState<'all' | RagArticleStatus>('all');
  const [articleCategory, setArticleCategory] = useState<'all' | RagArticleCategory>('all');
  const [articleLanguage, setArticleLanguage] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // PDFs
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfCategory, setPdfCategory] = useState<RagArticleCategory>('GENERAL');
  const [pdfLanguage, setPdfLanguage] = useState('en');
  const [pdfTagsRaw, setPdfTagsRaw] = useState('');
  const [pdfAutoPublish, setPdfAutoPublish] = useState(false);
  const [pdfAutoIndex, setPdfAutoIndex] = useState(true);
  const [pdfSkipExisting, setPdfSkipExisting] = useState(true);

  const statusQ = useQuery({ queryKey: ['rag-status'], queryFn: ragApi.status, enabled: isAgentOrAdmin });

  const articlesQ = useQuery({
    queryKey: ['rag-articles', articleSearch, articleStatus, articleCategory, articleLanguage],
    queryFn: () =>
      ragApi.listArticles({
        skip: 0,
        limit: 100,
        search: articleSearch.trim() || undefined,
        status: articleStatus === 'all' ? undefined : articleStatus,
        category: articleCategory === 'all' ? undefined : articleCategory,
        language: articleLanguage.trim() || undefined,
      }),
    enabled: isAgentOrAdmin,
  });

  const docsQ = useQuery({ queryKey: ['rag-documents'], queryFn: ragApi.listDocuments, enabled: isAgentOrAdmin });

  const queryMut = useMutation({
    mutationFn: () =>
      ragApi.query({
        query,
        channel: channel || undefined,
        tone: tone || undefined,
        top_k: parseInt(topK) || 5,
        language: language || undefined,
      }),
    onSuccess: setResult,
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  const indexArticleMut = useMutation({
    mutationFn: (id: string) => ragApi.indexArticle(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: t('rag.articleIndexed') });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('rag.indexFailed'), description: normalizeError(err) }),
  });

  const publishArticleMut = useMutation({
    mutationFn: (id: string) => ragApi.publishArticle(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: t('rag.articlePublished') });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('rag.publishFailed'), description: normalizeError(err) }),
  });

  const archiveArticleMut = useMutation({
    mutationFn: (id: string) => ragApi.archiveArticle(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: t('rag.articleArchived') });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('rag.archiveFailed'), description: normalizeError(err) }),
  });

  const deleteArticleMut = useMutation({
    mutationFn: (id: string) => ragApi.deleteArticle(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: t('rag.articleDeleted') });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('rag.deleteFailed'), description: normalizeError(err) }),
  });

  const uploadPdfMut = useMutation({
    mutationFn: () => ragApi.uploadDocument(pdfFile as File),
    onSuccess: async (uploadResult) => {
      setPdfFile(null);
      await queryClient.invalidateQueries({ queryKey: ['rag-documents'] });
      toast({ title: t('rag.pdfUploaded'), description: uploadResult.message });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('rag.uploadFailed'), description: normalizeError(err) }),
  });

  const ingestPdfMut = useMutation({
    mutationFn: (filename: string) =>
      ragApi.ingestDocument({
        filename,
        category: pdfCategory,
        language: pdfLanguage.trim() || 'en',
        tags: parseCsvTags(pdfTagsRaw),
        auto_publish: pdfAutoPublish,
        auto_index: pdfAutoIndex,
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: t('rag.pdfIngested'), description: `Created article: ${r.title}` });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('rag.ingestFailed'), description: normalizeError(err) }),
  });

  const ingestAllMut = useMutation({
    mutationFn: () =>
      ragApi.ingestAllDocuments({
        category: pdfCategory,
        language: pdfLanguage.trim() || 'en',
        tags: parseCsvTags(pdfTagsRaw),
        auto_publish: pdfAutoPublish,
        auto_index: pdfAutoIndex,
        skip_existing: pdfSkipExisting,
      }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({
        title: t('rag.bulkComplete'),
        description: t('rag.bulkDesc', { ingested: r.ingested, skipped: r.skipped, failed: r.failed }),
      });
    },
    onError: (err) => toast({ variant: 'destructive', title: t('rag.bulkFailed'), description: normalizeError(err) }),
  });

  const documents = docsQ.data?.files ?? [];
  const articles = articlesQ.data?.items ?? [];

  const hasAnyArticleActionPending =
    indexArticleMut.isPending || publishArticleMut.isPending || archiveArticleMut.isPending || deleteArticleMut.isPending;

  const hasAnyPdfActionPending = uploadPdfMut.isPending || ingestPdfMut.isPending || ingestAllMut.isPending;
  const isRefreshing = statusQ.isFetching || articlesQ.isFetching || docsQ.isFetching;

  const publishedCount = articles.filter((a) => a.status === 'PUBLISHED').length;
  const indexedCount = articles.filter((a) => a.is_indexed).length;

  const activeFilterCount = [
    articleStatus !== 'all',
    articleCategory !== 'all',
    articleLanguage.trim().length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setArticleSearch('');
    setArticleStatus('all');
    setArticleCategory('all');
    setArticleLanguage('');
  };

  if (!isAgentOrAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-12 text-center space-y-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto">
          <Layers className="h-5 w-5 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">{t('rag.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('rag.accessRestricted')}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('rag.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('rag.subtitle')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void statusQ.refetch();
            void articlesQ.refetch();
            void docsQ.refetch();
          }}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('rag.refresh')}
        </Button>
      </div>

      {/* ── Status bar ── */}
      {statusQ.data && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
            statusQ.data.status === 'active'
              ? 'bg-emerald-500/5 border-emerald-200 dark:border-emerald-800'
              : 'bg-destructive/5 border-destructive/20'
          }`}
        >
          {statusQ.data.status === 'active' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive shrink-0" />
          )}
          <span className="font-medium">{statusQ.data.provider}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground capitalize">{statusQ.data.status}</span>
          {statusQ.data.model && (
            <Badge variant="secondary" className="ml-auto text-xs font-mono">
              {statusQ.data.model}
            </Badge>
          )}
        </div>
      )}

      {/* ── Summary stats ── */}
      {articlesQ.data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t('rag.totalArticles')} value={articles.length} icon={BookOpen} />
          <StatCard label={t('rag.published')} value={publishedCount} icon={Activity} />
          <StatCard label={t('rag.indexed')} value={indexedCount} icon={Zap} />
          <StatCard label={t('rag.pdfDocuments')} value={docsQ.data?.total_files ?? 0} icon={FileText} />
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="h-9">
          <TabsTrigger value="tester" className="text-xs gap-1.5">
            <Search className="h-3.5 w-3.5" />{t('rag.testingTab')}
          </TabsTrigger>
          <TabsTrigger value="articles" className="text-xs gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />{t('rag.articlesTab')}
          </TabsTrigger>
          <TabsTrigger value="pdfs" className="text-xs gap-1.5">
            <FileText className="h-3.5 w-3.5" />{t('rag.pdfsTab')}
          </TabsTrigger>
        </TabsList>

        {/* ══ TESTER TAB ══════════════════════════════════════════════════════ */}
        <TabsContent value="tester" className="space-y-4 mt-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <SectionHeading
              title={t('rag.queryKnowledge')}
              description={t('rag.queryDesc')}
            />

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{t('rag.query')}</Label>
              <Textarea
                placeholder={t('rag.queryPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={3}
                className="resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && query.trim() && !queryMut.isPending) {
                    queryMut.mutate();
                  }
                }}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t('rag.channel')}</Label>
                <Input placeholder={t('rag.channelPlaceholder')} value={channel} onChange={(e) => setChannel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t('rag.tone')}</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger><SelectValue placeholder={t('rag.any')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">{t('rag.professional')}</SelectItem>
                    <SelectItem value="friendly">{t('rag.friendly')}</SelectItem>
                    <SelectItem value="concise">{t('rag.concise')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t('rag.topK')}</Label>
                <Input type="number" value={topK} onChange={(e) => setTopK(e.target.value)} min={1} max={20} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">{t('rag.language')}</Label>
                <Input placeholder={t('rag.langPlaceholder')} value={language} onChange={(e) => setLanguage(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">{t('rag.tip')}</p>
              <Button disabled={!query.trim() || queryMut.isPending} onClick={() => queryMut.mutate()}>
                {queryMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                {t('rag.generate')}
              </Button>
            </div>
          </div>

          {result && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <Zap className="h-3 w-3 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold">{t('rag.response')}</h3>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
              </div>
              {result.sources.length > 0 && (
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <Layers className="h-3 w-3 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold">{t('rag.sources')}</h3>
                    </div>
                    <Badge variant="secondary">{result.sources.length} {t('rag.matched')}</Badge>
                  </div>
                  <div className="space-y-2">
                    {result.sources.map((source, i) => (
                      <SourceCard key={`${source.title}-${i}`} title={source.title} score={source.score} content={source.content} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ══ ARTICLES TAB ════════════════════════════════════════════════════ */}
        <TabsContent value="articles" className="mt-4">
          <div className="rounded-xl border bg-card p-5">
            {/* Header row: title + New article button */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold">{t('rag.articleLibrary')}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {articlesQ.isLoading ? t('rag.loading') : (
                    <>
                      {articles.length} article{articles.length !== 1 ? 's' : ''}
                      {activeFilterCount > 0
                        ? ` · ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} active`
                        : ''}
                    </>
                  )}
                </p>
              </div>
              <CreateArticleDialog
                onCreated={() => { void queryClient.invalidateQueries({ queryKey: ['rag-articles'] }); }}
              />
            </div>

            {/* Search bar + filter toggle */}
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-8"
                  value={articleSearch}
                  onChange={(e) => setArticleSearch(e.target.value)}
                  placeholder={t('rag.searchPlaceholder')}
                />
              </div>
              <Button
                variant={showFilterPanel ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => setShowFilterPanel((v) => !v)}
              >
                <Filter className="h-3.5 w-3.5" />
                {t('rag.filters')}
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground shrink-0 px-2" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" />
                  {t('rag.clear')}
                </Button>
              )}
            </div>

            {/* Expandable filter panel */}
            {showFilterPanel && (
              <div className="rounded-lg border bg-muted/20 px-4 py-3.5 mb-4 space-y-4">
                {/* Status */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('rag.status')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ARTICLE_STATUS_FILTERS.map((s) => (
                      <FilterPill
                        key={s}
                        label={s === 'all' ? t('rag.all') : titleCaseEnum(s)}
                        active={articleStatus === s}
                        activeClass={STATUS_PILL_ACTIVE[s]}
                        onClick={() => setArticleStatus(s)}
                      />
                    ))}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('rag.category')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill
                      label={t('rag.all')}
                      active={articleCategory === 'all'}
                      activeClass="bg-foreground text-background"
                      onClick={() => setArticleCategory('all')}
                    />
                    {ARTICLE_CATEGORIES.map((c) => (
                      <FilterPill
                        key={c}
                        label={titleCaseEnum(c)}
                        active={articleCategory === c}
                        activeClass="bg-foreground text-background"
                        onClick={() => setArticleCategory(c)}
                      />
                    ))}
                  </div>
                </div>

                {/* Language */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('rag.language')}</p>
                  <Input
                    className="max-w-[160px] h-8 text-xs"
                    value={articleLanguage}
                    onChange={(e) => setArticleLanguage(e.target.value)}
                    placeholder={t('rag.langFilterPlaceholder')}
                  />
                </div>
              </div>
            )}

            {/* Active filter chips (shown when panel is closed) */}
            {!showFilterPanel && activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {articleStatus !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                    {t('rag.status')}: {titleCaseEnum(articleStatus)}
                    <button onClick={() => setArticleStatus('all')} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {articleCategory !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                    {t('rag.category')}: {titleCaseEnum(articleCategory)}
                    <button onClick={() => setArticleCategory('all')} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {articleLanguage.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                    {t('rag.language')}: {articleLanguage.trim()}
                    <button onClick={() => setArticleLanguage('')} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Article list */}
            {articlesQ.isLoading ? (
              <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('rag.loadingArticles')}
              </div>
            ) : articlesQ.error ? (
              <ErrorState message={normalizeError(articlesQ.error)} onRetry={() => { void articlesQ.refetch(); }} />
            ) : articles.length === 0 ? (
              <EmptyState
                title={t('rag.noArticles')}
                description={
                  activeFilterCount > 0 || articleSearch
                    ? t('rag.noArticlesFilter')
                    : t('rag.noArticlesCreate')
                }
              />
            ) : (
              <div className="space-y-2.5">
                {articles.map((article) => (
                  <div
                    key={article.id}
                    className="rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{article.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Updated {new Date(article.updated_at).toLocaleString()} · {article.language.toUpperCase()}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <Badge
                          className={`text-xs border ${STATUS_COLORS[article.status as RagArticleStatus]}`}
                          variant="outline"
                        >
                          {titleCaseEnum(article.status)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{titleCaseEnum(article.category)}</Badge>
                        <Badge
                          variant={article.is_indexed ? 'secondary' : 'outline'}
                          className={`text-xs ${article.is_indexed ? '' : 'text-muted-foreground'}`}
                        >
                          <Zap className={`h-2.5 w-2.5 mr-1 ${article.is_indexed ? 'text-primary' : ''}`} />
                          {article.is_indexed ? `${article.chunk_count} chunks` : t('rag.notIndexed')}
                        </Badge>
                      </div>
                    </div>

                    {article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {article.tags.map((tag) => (
                          <span
                            key={`${article.id}-${tag}`}
                            className="inline-flex items-center gap-0.5 rounded-md bg-primary/8 px-1.5 py-0.5 text-xs text-primary/80"
                          >
                            <Hash className="h-2.5 w-2.5" />{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-0.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={hasAnyArticleActionPending}
                        onClick={() => indexArticleMut.mutate(article.id)}
                      >
                        {indexArticleMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                        {t('rag.reIndex')}
                      </Button>

                      {isAdmin && (
                        <>
                          {article.status !== 'PUBLISHED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={hasAnyArticleActionPending}
                              onClick={() => publishArticleMut.mutate(article.id)}
                            >
                              {publishArticleMut.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                              )}
                              {t('rag.publish')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={hasAnyArticleActionPending}
                              onClick={() => archiveArticleMut.mutate(article.id)}
                            >
                              {archiveArticleMut.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Archive className="h-3 w-3 mr-1" />
                              )}
                              {t('rag.archive')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={hasAnyArticleActionPending}
                            onClick={() => {
                              if (!window.confirm(t('rag.deleteConfirm', { title: article.title }))) return;
                              deleteArticleMut.mutate(article.id);
                            }}
                          >
                            {deleteArticleMut.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Trash2 className="h-3 w-3 mr-1" />
                            )}
                            {t('rag.delete')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══ PDFs TAB ════════════════════════════════════════════════════════ */}
        <TabsContent value="pdfs" className="space-y-4 mt-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <SectionHeading title="Ingestion settings" description="These defaults apply to all upload and ingest operations below." />

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Default category</Label>
                <Select value={pdfCategory} onValueChange={(v) => setPdfCategory(v as RagArticleCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARTICLE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{titleCaseEnum(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Language</Label>
                <Input value={pdfLanguage} onChange={(e) => setPdfLanguage(e.target.value)} placeholder="en" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  <Hash className="h-3 w-3 inline mr-1" />Tags
                </Label>
                <Input value={pdfTagsRaw} onChange={(e) => setPdfTagsRaw(e.target.value)} placeholder="policy, onboarding" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ToggleRow label="Auto publish" description="Publish the article immediately after ingest." checked={pdfAutoPublish} onCheckedChange={setPdfAutoPublish} />
              <ToggleRow label="Auto index" description="Create chunks and embeddings on ingest." checked={pdfAutoIndex} onCheckedChange={setPdfAutoIndex} />
              <ToggleRow label="Skip existing" description="Skip files that already have an article (Ingest All)." checked={pdfSkipExisting} onCheckedChange={setPdfSkipExisting} />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <SectionHeading title="Upload & ingest" description="Upload a new PDF or run bulk ingestion on all stored files." />

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 min-w-[280px] flex-1">
                <Label className="text-xs font-medium text-muted-foreground">
                  Select PDF {!isAdmin && <span className="text-muted-foreground/60">(admin only)</span>}
                </Label>
                <Input
                  type="file"
                  accept="application/pdf"
                  disabled={!isAdmin}
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                />
              </div>
              <Button variant="outline" disabled={!isAdmin || !pdfFile || hasAnyPdfActionPending} onClick={() => uploadPdfMut.mutate()}>
                {uploadPdfMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload
              </Button>
              <Button disabled={!isAdmin || documents.length === 0 || hasAnyPdfActionPending} onClick={() => ingestAllMut.mutate()}>
                {ingestAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Layers className="h-4 w-4 mr-2" />}
                Ingest All
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <SectionHeading title="Stored documents" />
              <Badge variant="secondary" className="mb-4">
                {docsQ.data?.total_files ?? 0} file{docsQ.data?.total_files !== 1 ? 's' : ''}
              </Badge>
            </div>

            {docsQ.isLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
              </div>
            ) : docsQ.error ? (
              <ErrorState message={normalizeError(docsQ.error)} onRetry={() => { void docsQ.refetch(); }} />
            ) : documents.length === 0 ? (
              <EmptyState title="No PDF documents" description="Upload PDF files above to start ingestion." />
            ) : (
              <div className="space-y-2">
                {documents.map((file) => (
                  <div
                    key={file.filename}
                    className="rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">{file.size_human} · {file.size_bytes.toLocaleString()} bytes</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={!isAdmin || hasAnyPdfActionPending}
                      onClick={() => ingestPdfMut.mutate(file.filename)}
                    >
                      {ingestPdfMut.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Zap className="h-3 w-3 mr-1" />}
                      Ingest
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}