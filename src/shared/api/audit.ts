import { apiBlobClient, apiClient } from './client';
import type { AuditLogAction, AuditLogEntry, AuditLogListResponse } from '@/shared/types';

type ListAuditLogsParams = {
  action?: AuditLogAction;
  resource_type?: string;
  user_id?: string;
  skip?: number;
  limit?: number;
};

function mapAuditLog(raw: any): AuditLogEntry {
  return {
    id: String(raw?.id ?? ''),
    user_id: raw?.user_id ?? null,
    action: String(raw?.action ?? 'UPDATE').toUpperCase() as AuditLogAction,
    resource_type: String(raw?.resource_type ?? 'unknown'),
    resource_id: raw?.resource_id ?? null,
    description: raw?.description ?? null,
    meta: raw?.meta ?? null,
    trace_id: raw?.trace_id ?? null,
    ip_address: raw?.ip_address ?? null,
    created_at: String(raw?.created_at ?? ''),
  };
}

export const auditApi = {
  list: async (params: ListAuditLogsParams = {}): Promise<AuditLogListResponse> => {
    const response = await apiClient<any>('/audit', {
      params: {
        action: params.action,
        resource_type: params.resource_type,
        user_id: params.user_id,
        skip: params.skip !== undefined ? String(params.skip) : undefined,
        limit: params.limit !== undefined ? String(params.limit) : undefined,
      },
    });

    return {
      logs: Array.isArray(response?.logs) ? response.logs.map(mapAuditLog) : [],
      total: Number(response?.total ?? 0),
    };
  },
  exportCsv: (params: ListAuditLogsParams = {}) =>
    apiBlobClient('/audit/export', {
      params: {
        action: params.action,
        resource_type: params.resource_type,
        user_id: params.user_id,
      },
    }),
  clear: (confirmation: string) =>
    apiClient<{ message: string }>('/audit/clear', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
};
