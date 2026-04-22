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
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, Loader2, RefreshCw, Search, Upload, XCircle } from 'lucide-react';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import type {
  RagArticleCategory,
  RagArticleStatus,
  RagResponse,
} from '@/shared/types';

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

const ARTICLE_STATUS_FILTERS: Array<'all' | RagArticleStatus> = [
  'all',
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED',
];

function titleCaseEnum(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function parseCsvTags(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

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

  // Articles
  const [articleSearch, setArticleSearch] = useState('');
  const [articleStatus, setArticleStatus] = useState<'all' | RagArticleStatus>('all');
  const [articleCategory, setArticleCategory] = useState<'all' | RagArticleCategory>('all');
  const [articleLanguage, setArticleLanguage] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [articleSummary, setArticleSummary] = useState('');
  const [articleContent, setArticleContent] = useState('');
  const [articleCreateCategory, setArticleCreateCategory] = useState<RagArticleCategory>('GENERAL');
  const [articleCreateLanguage, setArticleCreateLanguage] = useState('en');
  const [articleTagsRaw, setArticleTagsRaw] = useState('');
  const [articleAutoIndex, setArticleAutoIndex] = useState(true);

  // PDFs
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfCategory, setPdfCategory] = useState<RagArticleCategory>('GENERAL');
  const [pdfLanguage, setPdfLanguage] = useState('en');
  const [pdfTagsRaw, setPdfTagsRaw] = useState('');
  const [pdfAutoPublish, setPdfAutoPublish] = useState(false);
  const [pdfAutoIndex, setPdfAutoIndex] = useState(true);
  const [pdfSkipExisting, setPdfSkipExisting] = useState(true);

  const statusQ = useQuery({
    queryKey: ['rag-status'],
    queryFn: ragApi.status,
    enabled: isAgentOrAdmin,
  });

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

  const docsQ = useQuery({
    queryKey: ['rag-documents'],
    queryFn: ragApi.listDocuments,
    enabled: isAgentOrAdmin,
  });

  const queryMut = useMutation({
    mutationFn: () => ragApi.query({ query, channel: channel || undefined, tone: tone || undefined, top_k: parseInt(topK) || 5, language: language || undefined }),
    onSuccess: setResult,
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  const createArticleMut = useMutation({
    mutationFn: () =>
      ragApi.createArticle({
        title: articleTitle.trim(),
        content: articleContent.trim(),
        summary: articleSummary.trim() || undefined,
        category: articleCreateCategory,
        tags: parseCsvTags(articleTagsRaw),
        language: articleCreateLanguage.trim() || 'en',
        auto_index: articleAutoIndex,
      }),
    onSuccess: async () => {
      setArticleTitle('');
      setArticleSummary('');
      setArticleContent('');
      setArticleTagsRaw('');
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'Article created', description: 'Knowledge article saved successfully.' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Create article failed', description: normalizeError(err) }),
  });

  const indexArticleMut = useMutation({
    mutationFn: (articleId: string) => ragApi.indexArticle(articleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'Article indexed' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Indexing failed', description: normalizeError(err) }),
  });

  const publishArticleMut = useMutation({
    mutationFn: (articleId: string) => ragApi.publishArticle(articleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'Article published' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Publish failed', description: normalizeError(err) }),
  });

  const archiveArticleMut = useMutation({
    mutationFn: (articleId: string) => ragApi.archiveArticle(articleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'Article archived' });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Archive failed', description: normalizeError(err) }),
  });

  const deleteArticleMut = useMutation({
    mutationFn: (articleId: string) => ragApi.deleteArticle(articleId),
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
    onSuccess: async (ingestResult) => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({ title: 'PDF ingested', description: `Created article: ${ingestResult.title}` });
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
    onSuccess: async (bulkResult) => {
      await queryClient.invalidateQueries({ queryKey: ['rag-articles'] });
      toast({
        title: 'Bulk ingest completed',
        description: `Ingested ${bulkResult.ingested}, skipped ${bulkResult.skipped}, failed ${bulkResult.failed}.`,
      });
    },
    onError: (err) => toast({ variant: 'destructive', title: 'Bulk ingest failed', description: normalizeError(err) }),
  });

  const documents = docsQ.data?.files ?? [];
  const articles = articlesQ.data?.items ?? [];

  const hasAnyArticleActionPending =
    createArticleMut.isPending ||
    indexArticleMut.isPending ||
    publishArticleMut.isPending ||
    archiveArticleMut.isPending ||
    deleteArticleMut.isPending;

  const hasAnyPdfActionPending =
    uploadPdfMut.isPending || ingestPdfMut.isPending || ingestAllMut.isPending;

  const canCreateArticle = useMemo(
    () => articleTitle.trim().length >= 3 && articleContent.trim().length >= 10,
    [articleContent, articleTitle],
  );

  if (!isAgentOrAdmin) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight">RAG Workspace</h1>
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          RAG testing and knowledge management are available to agent and admin accounts only.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RAG Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Test responses, manage knowledge articles, and control PDF ingestion.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void statusQ.refetch();
            void articlesQ.refetch();
            void docsQ.refetch();
          }}
          disabled={statusQ.isFetching || articlesQ.isFetching || docsQ.isFetching}
        >
          <RefreshCw className="h-4 w-4 mr-1" />Refresh
        </Button>
      </div>

      {statusQ.data ? (
        <div className="flex items-center gap-2 rounded-lg border p-3 bg-card">
          {statusQ.data.status === 'active' ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="text-sm">Provider: {statusQ.data.provider} · {statusQ.data.status}</span>
          {statusQ.data.model ? (
            <span className="text-xs text-muted-foreground ml-auto">Model: {statusQ.data.model}</span>
          ) : null}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'tester' | 'articles' | 'pdfs')}>
        <TabsList>
          <TabsTrigger value="tester">Testing Interface</TabsTrigger>
          <TabsTrigger value="articles">Article Management</TabsTrigger>
          <TabsTrigger value="pdfs">PDF Management</TabsTrigger>
        </TabsList>

        <TabsContent value="tester" className="space-y-4 mt-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="space-y-2">
              <Label>Query</Label>
              <Textarea
                placeholder="Ask a question..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                rows={3}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Channel</Label>
                <Input placeholder="chat" value={channel} onChange={(event) => setChannel(event.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="concise">Concise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Top K</Label>
                <Input
                  type="number"
                  value={topK}
                  onChange={(event) => setTopK(event.target.value)}
                  min={1}
                  max={20}
                />
              </div>
              <div>
                <Label className="text-xs">Language</Label>
                <Input placeholder="en" value={language} onChange={(event) => setLanguage(event.target.value)} />
              </div>
            </div>
            <Button disabled={!query.trim() || queryMut.isPending} onClick={() => queryMut.mutate()}>
              {queryMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Search className="h-4 w-4 mr-1" />
              )}
              Generate
            </Button>
          </div>

          {result ? (
            <div className="space-y-4">
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-semibold mb-2">Response</h3>
                <p className="text-sm whitespace-pre-wrap">{result.answer}</p>
              </div>
              {result.sources.length > 0 ? (
                <div className="rounded-xl border bg-card p-4">
                  <h3 className="text-sm font-semibold mb-3">Sources</h3>
                  <div className="space-y-2">
                    {result.sources.map((source, index) => (
                      <div key={`${source.title}-${index}`} className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{source.title}</span>
                          <span className="text-xs text-muted-foreground">Score: {source.score.toFixed(2)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{source.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="articles" className="space-y-4 mt-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold">Create article</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Title</Label>
                <Input value={articleTitle} onChange={(event) => setArticleTitle(event.target.value)} placeholder="Article title" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Summary (optional)</Label>
                <Input value={articleSummary} onChange={(event) => setArticleSummary(event.target.value)} placeholder="Short summary" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Content</Label>
                <Textarea
                  value={articleContent}
                  onChange={(event) => setArticleContent(event.target.value)}
                  rows={6}
                  placeholder="Knowledge article content"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={articleCreateCategory} onValueChange={(value) => setArticleCreateCategory(value as RagArticleCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARTICLE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{titleCaseEnum(category)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Language</Label>
                <Input value={articleCreateLanguage} onChange={(event) => setArticleCreateLanguage(event.target.value)} placeholder="en" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Tags (comma-separated)</Label>
                <Input value={articleTagsRaw} onChange={(event) => setArticleTagsRaw(event.target.value)} placeholder="billing, invoice, refund" />
              </div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Auto-index on create</p>
                  <p className="text-xs text-muted-foreground">Chunk and embed article immediately after save.</p>
                </div>
                <Switch checked={articleAutoIndex} onCheckedChange={setArticleAutoIndex} />
              </div>
            </div>
            <Button
              onClick={() => createArticleMut.mutate()}
              disabled={!canCreateArticle || hasAnyArticleActionPending}
            >
              {createArticleMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Article
            </Button>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-[240px] flex-1">
                <Label className="text-xs">Search title</Label>
                <Input value={articleSearch} onChange={(event) => setArticleSearch(event.target.value)} placeholder="Search articles" />
              </div>
              <div className="space-y-1 min-w-[180px]">
                <Label className="text-xs">Status</Label>
                <Select value={articleStatus} onValueChange={(value) => setArticleStatus(value as 'all' | RagArticleStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARTICLE_STATUS_FILTERS.map((status) => (
                      <SelectItem key={status} value={status}>{status === 'all' ? 'All' : titleCaseEnum(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[200px]">
                <Label className="text-xs">Category</Label>
                <Select value={articleCategory} onValueChange={(value) => setArticleCategory(value as 'all' | RagArticleCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {ARTICLE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{titleCaseEnum(category)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 min-w-[140px]">
                <Label className="text-xs">Language</Label>
                <Input value={articleLanguage} onChange={(event) => setArticleLanguage(event.target.value)} placeholder="en" />
              </div>
            </div>

            {articlesQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading articles...</div>
            ) : articlesQ.error ? (
              <ErrorState message={normalizeError(articlesQ.error)} onRetry={() => { void articlesQ.refetch(); }} />
            ) : articles.length === 0 ? (
              <EmptyState title="No articles" description="Create or ingest knowledge content to populate this list." />
            ) : (
              <div className="space-y-3">
                {articles.map((article) => (
                  <div key={article.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{article.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Updated {new Date(article.updated_at).toLocaleString()} · Language {article.language}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline">{titleCaseEnum(article.category)}</Badge>
                        <Badge variant="outline">{titleCaseEnum(article.status)}</Badge>
                        <Badge variant={article.is_indexed ? 'secondary' : 'outline'}>
                          {article.is_indexed ? `Indexed (${article.chunk_count})` : 'Not indexed'}
                        </Badge>
                      </div>
                    </div>

                    {article.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {article.tags.map((tag) => (
                          <Badge key={`${article.id}-${tag}`} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={hasAnyArticleActionPending}
                        onClick={() => indexArticleMut.mutate(article.id)}
                      >
                        {indexArticleMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                        Re-index
                      </Button>

                      {isAdmin ? (
                        <>
                          {article.status !== 'PUBLISHED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={hasAnyArticleActionPending}
                              onClick={() => publishArticleMut.mutate(article.id)}
                            >
                              {publishArticleMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                              Publish
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={hasAnyArticleActionPending}
                              onClick={() => archiveArticleMut.mutate(article.id)}
                            >
                              {archiveArticleMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                              Archive
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={hasAnyArticleActionPending}
                            onClick={() => {
                              if (!window.confirm(`Delete article "${article.title}"?`)) {
                                return;
                              }
                              deleteArticleMut.mutate(article.id);
                            }}
                          >
                            {deleteArticleMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                            Delete
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="pdfs" className="space-y-4 mt-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold">Ingestion defaults</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={pdfCategory} onValueChange={(value) => setPdfCategory(value as RagArticleCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ARTICLE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>{titleCaseEnum(category)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Language</Label>
                <Input value={pdfLanguage} onChange={(event) => setPdfLanguage(event.target.value)} placeholder="en" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tags (comma-separated)</Label>
                <Input value={pdfTagsRaw} onChange={(event) => setPdfTagsRaw(event.target.value)} placeholder="policy, onboarding" />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto publish</p>
                  <p className="text-xs text-muted-foreground">Publish article after ingest.</p>
                </div>
                <Switch checked={pdfAutoPublish} onCheckedChange={setPdfAutoPublish} />
              </div>
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto index</p>
                  <p className="text-xs text-muted-foreground">Create chunks and embeddings.</p>
                </div>
                <Switch checked={pdfAutoIndex} onCheckedChange={setPdfAutoIndex} />
              </div>
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Skip existing</p>
                  <p className="text-xs text-muted-foreground">Used by ingest-all.</p>
                </div>
                <Switch checked={pdfSkipExisting} onCheckedChange={setPdfSkipExisting} />
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 min-w-[280px] flex-1">
                <Label className="text-xs">Upload PDF (admin)</Label>
                <Input
                  type="file"
                  accept="application/pdf"
                  disabled={!isAdmin}
                  onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!isAdmin || !pdfFile || hasAnyPdfActionPending}
                onClick={() => uploadPdfMut.mutate()}
              >
                {uploadPdfMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Upload
              </Button>
              <Button
                disabled={!isAdmin || documents.length === 0 || hasAnyPdfActionPending}
                onClick={() => ingestAllMut.mutate()}
              >
                {ingestAllMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Ingest All
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Documents</h2>
              <span className="text-xs text-muted-foreground">{docsQ.data?.total_files ?? 0} file(s)</span>
            </div>

            {docsQ.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading PDF documents...</div>
            ) : docsQ.error ? (
              <ErrorState message={normalizeError(docsQ.error)} onRetry={() => { void docsQ.refetch(); }} />
            ) : documents.length === 0 ? (
              <EmptyState title="No PDF documents" description="Upload PDF files to start ingestion." />
            ) : (
              <div className="space-y-2">
                {documents.map((file) => (
                  <div key={file.filename} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{file.filename}</p>
                      <p className="text-xs text-muted-foreground">{file.size_human} · {file.size_bytes.toLocaleString()} bytes</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!isAdmin || hasAnyPdfActionPending}
                      onClick={() => ingestPdfMut.mutate(file.filename)}
                    >
                      {ingestPdfMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
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
