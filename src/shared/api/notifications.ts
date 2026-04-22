import { apiClient } from './client';
import type { NotificationItem, NotificationListResult } from '@/shared/types';

function mapNotification(raw: any): NotificationItem {
  return {
    id: String(raw?.id ?? ''),
    type: String(raw?.type ?? 'system'),
    title: String(raw?.title ?? ''),
    body: String(raw?.body ?? ''),
    is_read: Boolean(raw?.is_read),
    read_at: raw?.read_at ?? null,
    resource_type: raw?.resource_type ?? null,
    resource_id: raw?.resource_id ?? null,
    action_url: raw?.action_url ?? null,
    meta: raw?.meta ?? null,
    created_at: String(raw?.created_at ?? ''),
    updated_at: String(raw?.updated_at ?? ''),
  };
}

export const notificationsApi = {
  list: async (params?: { unread_only?: boolean; skip?: number; limit?: number }): Promise<NotificationListResult> => {
    const response = await apiClient<any>('/notifications', {
      params: {
        unread_only: params?.unread_only ? 'true' : undefined,
        skip: params?.skip !== undefined ? String(params.skip) : undefined,
        limit: params?.limit !== undefined ? String(params.limit) : undefined,
      },
    });

    return {
      items: Array.isArray(response?.items) ? response.items.map(mapNotification) : [],
      total: Number(response?.total ?? 0),
      unread_count: Number(response?.unread_count ?? 0),
    };
  },
  unreadCount: async (): Promise<number> => {
    const response = await apiClient<{ unread_count: number }>('/notifications/unread-count');
    return Number(response?.unread_count ?? 0);
  },
  markRead: (notificationId: string) =>
    apiClient<any>(`/notifications/${notificationId}/read`, { method: 'POST' }).then(mapNotification),
  markAllRead: () => apiClient<{ message: string }>('/notifications/read-all', { method: 'POST' }),
};
