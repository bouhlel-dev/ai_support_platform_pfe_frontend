import { apiClient } from './client';
import type {
  RagArticle,
  RagArticleCreateRequest,
  RagArticleListParams,
  RagArticleListResponse,
  RagIndexArticleResponse,
  RagPdfBulkIngestRequest,
  RagPdfBulkIngestResponse,
  RagPdfIngestRequest,
  RagPdfIngestResponse,
  RagPdfListResponse,
  RagPdfUploadResponse,
  RagProviderStatus,
  RagQuery,
  RagResponse,
} from '@/shared/types';

export const ragApi = {
  query: (data: RagQuery) =>
    apiClient<any>('/rag/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((res): RagResponse => ({
      answer: String(res?.response ?? ''),
      sources: Array.isArray(res?.sources)
        ? res.sources.map((s: any) => ({
            title: String(s.article_title ?? ''),
            content: String(s.chunk_preview ?? ''),
            score: Number(s.similarity ?? 0),
          }))
        : [],
    })),

  status: () =>
    apiClient<any>('/rag/generate/providers').then((res): RagProviderStatus => {
      const defaultProvider = String(res?.default_provider ?? 'unknown');
      const providers = Array.isArray(res?.providers) ? res.providers : [];
      const current = providers.find((p: any) => String(p.provider) === defaultProvider);
      return {
        provider: defaultProvider,
        status: current?.is_configured ? 'active' : 'not-configured',
        model: current?.default_model ? String(current.default_model) : undefined,
      };
    }),

  listArticles: (params?: RagArticleListParams) =>
    apiClient<RagArticleListResponse>('/rag/articles', {
      params: {
        skip: String(params?.skip ?? 0),
        limit: String(params?.limit ?? 100),
        category: params?.category,
        status: params?.status,
        language: params?.language,
        search: params?.search,
      },
    }),

  createArticle: (payload: RagArticleCreateRequest) =>
    apiClient<RagArticle>('/rag/articles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  publishArticle: (articleId: string) =>
    apiClient<RagArticle>(`/rag/articles/${articleId}/publish`, {
      method: 'POST',
    }),

  archiveArticle: (articleId: string) =>
    apiClient<RagArticle>(`/rag/articles/${articleId}/archive`, {
      method: 'POST',
    }),

  deleteArticle: (articleId: string) =>
    apiClient<void>(`/rag/articles/${articleId}`, {
      method: 'DELETE',
    }),

  indexArticle: (articleId: string, options?: { chunkSize?: number; chunkOverlap?: number }) =>
    apiClient<RagIndexArticleResponse>(`/rag/articles/${articleId}/index`, {
      method: 'POST',
      params: {
        chunk_size: String(options?.chunkSize ?? 512),
        chunk_overlap: String(options?.chunkOverlap ?? 64),
      },
    }),

  listDocuments: () => apiClient<RagPdfListResponse>('/rag/documents'),

  uploadDocument: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient<RagPdfUploadResponse>('/rag/documents/upload', {
      method: 'POST',
      body: fd,
    });
  },

  ingestDocument: (payload: RagPdfIngestRequest) =>
    apiClient<RagPdfIngestResponse>('/rag/documents/ingest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  ingestAllDocuments: (payload: RagPdfBulkIngestRequest) =>
    apiClient<RagPdfBulkIngestResponse>('/rag/documents/ingest-all', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
