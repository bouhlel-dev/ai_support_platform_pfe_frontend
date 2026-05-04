import { useMemo, useState } from 'react';
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
          {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
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
      toast({ title: 'Article created', description: 'Knowledge article saved successfully.' });
    },
    onError: (err) =>
      toast({ variant: 'destructive', title: 'Create article failed', description: normalizeError(err) }),
  });

  const canCreate = title.trim().length >= 3 && content.trim().length >= 10;
  const tagPreviews = parseCsvTags(tagsRaw);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          New article
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create article</DialogTitle>
          <DialogDescription>Add a new knowledge article to the base.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-title" className="text-xs font-medium text-muted-foreground">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="modal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. How to reset your password"
              autoFocus
            />
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <Label htmlFor="modal-summary" className="text-xs font-medium text-muted-foreground">
              Summary{' '}
              <span className="text-muted-foreground/50 font-normal">(optional)</span>
            </Label>
            <Input
              id="modal-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-line description shown in search results"
            />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="modal-content" className="text-xs font-medium text-muted-foreground">
                Content <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs text-muted-foreground tabular-nums">{content.length} chars</span>
            </div>
            <Textarea
              id="modal-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              className="resize-none"
              placeholder="Full knowledge article content…"
            />
          </div>

          {/* Category + Language */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Category</Label>
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
              <Label className="text-xs font-medium text-muted-foreground">Language</Label>
              <Input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="en" />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Tags{' '}
              <span className="text-muted-foreground/50 font-normal">(comma-separated)</span>
            </Label>
            <Input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="billing, invoice, refund"
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
            label="Auto-index on create"
            description="Chunk and embed this article immediately after saving."
            checked={autoIndex}
            onCheckedChange={setAutoIndex}
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutate()} disabled={!canCreate || isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create article
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function RagPage() {
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
      toast({ title: 'Article indexed' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Indexing failed', description: normalizeError(err) }),
  });

  const publishArticleMut = useMutation({
    mutationFn: (id: string) => ragApi.publishArticle(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'Article published' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Publish failed', description: normalizeError(err) }),
  });

  const archiveArticleMut = useMutation({
    mutationFn: (id: string) => ragApi.archiveArticle(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'Article archived' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Archive failed', description: normalizeError(err) }),
  });

  const deleteArticleMut = useMutation({
    mutationFn: (id: string) => ragApi.deleteArticle(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'Article deleted' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Delete failed', description: normalizeError(err) }),
  });

  const uploadPdfMut = useMutation({
    mutationFn: () => ragApi.uploadDocument(pdfFile as File),
    onSuccess: async (uploadResult) => {
      setPdfFile(null);
      await queryClient.invalidateQueries({ queryKey: ['rag-documents'] });
      toast({ title: 'PDF uploaded', description: uploadResult.message });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Upload failed', description: normalizeError(err) }),
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
      toast({ title: 'PDF ingested', description: `Created article: ${r.title}` });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Ingest failed', description: normalizeError(err) }),
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
        title: 'Bulk ingest completed',
        description: `Ingested ${r.ingested}, skipped ${r.skipped}, failed ${r.failed}.`,
      });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Bulk ingest failed', description: normalizeError(err) }),
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
        <h1 className="text-lg font-semibold">RAG Workspace</h1>
        <p className="text-sm text-muted-foreground">
          RAG testing and knowledge management are available to agent and admin accounts only.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">RAG Workspace</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Test responses, manage knowledge articles, and control PDF ingestion.
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
          Refresh
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
          <StatCard label="Total articles" value={articles.length} icon={BookOpen} />
          <StatCard label="Published" value={publishedCount} icon={Activity} />
          <StatCard label="Indexed" value={indexedCount} icon={Zap} />
          <StatCard label="PDF documents" value={docsQ.data?.total_files ?? 0} icon={FileText} />
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="h-9">
          <TabsTrigger value="tester" className="text-xs gap-1.5">
            <Search className="h-3.5 w-3.5" />Testing
          </TabsTrigger>
          <TabsTrigger value="articles" className="text-xs gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />Articles
          </TabsTrigger>
          <TabsTrigger value="pdfs" className="text-xs gap-1.5">
            <FileText className="h-3.5 w-3.5" />PDFs
          </TabsTrigger>
        </TabsList>

        {/* ══ TESTER TAB ══════════════════════════════════════════════════════ */}
        <TabsContent value="tester" className="space-y-4 mt-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <SectionHeading
              title="Query the knowledge base"
              description="Simulate how the AI retrieves and responds to a user question."
            />

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Query</Label>
              <Textarea
                placeholder="Ask a question about your knowledge base..."
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
                <Label className="text-xs font-medium text-muted-foreground">Channel</Label>
                <Input placeholder="e.g. chat" value={channel} onChange={(e) => setChannel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="concise">Concise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Top K results</Label>
                <Input type="number" value={topK} onChange={(e) => setTopK(e.target.value)} min={1} max={20} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Language</Label>
                <Input placeholder="en" value={language} onChange={(e) => setLanguage(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">Tip: ⌘+Enter to submit</p>
              <Button disabled={!query.trim() || queryMut.isPending} onClick={() => queryMut.mutate()}>
                {queryMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Generate
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
                  <h3 className="text-sm font-semibold">Response</h3>
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
                      <h3 className="text-sm font-semibold">Sources</h3>
                    </div>
                    <Badge variant="secondary">{result.sources.length} matched</Badge>
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
                <h2 className="text-sm font-semibold">Article library</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {articlesQ.isLoading ? 'Loading…' : (
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
                  placeholder="Search by title…"
                />
              </div>
              <Button
                variant={showFilterPanel ? 'secondary' : 'outline'}
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => setShowFilterPanel((v) => !v)}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground shrink-0 px-2" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
            </div>

            {/* Expandable filter panel */}
            {showFilterPanel && (
              <div className="rounded-lg border bg-muted/20 px-4 py-3.5 mb-4 space-y-4">
                {/* Status */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ARTICLE_STATUS_FILTERS.map((s) => (
                      <FilterPill
                        key={s}
                        label={s === 'all' ? 'All' : titleCaseEnum(s)}
                        active={articleStatus === s}
                        activeClass={STATUS_PILL_ACTIVE[s]}
                        onClick={() => setArticleStatus(s)}
                      />
                    ))}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Category</p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill
                      label="All"
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Language</p>
                  <Input
                    className="max-w-[160px] h-8 text-xs"
                    value={articleLanguage}
                    onChange={(e) => setArticleLanguage(e.target.value)}
                    placeholder="e.g. en, fr, ar"
                  />
                </div>
              </div>
            )}

            {/* Active filter chips (shown when panel is closed) */}
            {!showFilterPanel && activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {articleStatus !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                    Status: {titleCaseEnum(articleStatus)}
                    <button onClick={() => setArticleStatus('all')} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {articleCategory !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                    Category: {titleCaseEnum(articleCategory)}
                    <button onClick={() => setArticleCategory('all')} className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
                {articleLanguage.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                    Language: {articleLanguage.trim()}
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
                <Loader2 className="h-4 w-4 animate-spin" /> Loading articles…
              </div>
            ) : articlesQ.error ? (
              <ErrorState message={normalizeError(articlesQ.error)} onRetry={() => { void articlesQ.refetch(); }} />
            ) : articles.length === 0 ? (
              <EmptyState
                title="No articles found"
                description={
                  activeFilterCount > 0 || articleSearch
                    ? 'Try adjusting your filters or search query.'
                    : 'Create your first article using the "New article" button above.'
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
                          {article.is_indexed ? `${article.chunk_count} chunks` : 'Not indexed'}
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
                        Re-index
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
                              Publish
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
                              Archive
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={hasAnyArticleActionPending}
                            onClick={() => {
                              if (!window.confirm(`Delete "${article.title}"?`)) return;
                              deleteArticleMut.mutate(article.id);
                            }}
                          >
                            {deleteArticleMut.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Trash2 className="h-3 w-3 mr-1" />
                            )}
                            Delete
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