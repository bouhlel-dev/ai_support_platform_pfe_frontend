import { apiClient } from './client';
import type {
  ManagedUser,
  ManagedUserListResponse,
  ManagedUserRole,
  ManagedUserStatus,
  User,
} from '@/shared/types';

type ListUsersParams = {
  role?: ManagedUserRole;
  status?: ManagedUserStatus;
  skip?: number;
  limit?: number;
};

type UpdateUserPayload = {
  full_name?: string;
  role?: ManagedUserRole;
  status?: ManagedUserStatus;
  phone_number?: string | null;
  can_reply_conversations?: boolean;
  can_reply_whatsapp?: boolean;
  is_vip?: boolean;
};

function mapManagedUser(raw: any): ManagedUser {
  return {
    id: String(raw?.id ?? ''),
    email: String(raw?.email ?? ''),
    full_name: String(raw?.full_name ?? raw?.name ?? ''),
    phone_number: raw?.phone_number ?? null,
    role: String(raw?.role ?? 'CLIENT').toUpperCase() as ManagedUserRole,
    status: String(raw?.status ?? 'ACTIVE').toUpperCase() as ManagedUserStatus,
    can_reply_conversations: Boolean(raw?.can_reply_conversations ?? true),
    can_reply_whatsapp: Boolean(raw?.can_reply_whatsapp ?? true),
    is_vip: Boolean(raw?.is_vip ?? false),
    created_at: String(raw?.created_at ?? ''),
    updated_at: String(raw?.updated_at ?? ''),
  };
}

function mapCurrentUser(raw: any): User {
  const roleRaw = String(raw?.role ?? '').toUpperCase();
  return {
    id: String(raw?.id ?? ''),
    email: String(raw?.email ?? ''),
    name: String(raw?.full_name ?? raw?.name ?? ''),
    role: roleRaw === 'ADMIN' ? 'admin' : roleRaw === 'AGENT' ? 'agent' : 'client',
    can_reply_conversations: Boolean(raw?.can_reply_conversations ?? true),
    can_reply_whatsapp: Boolean(raw?.can_reply_whatsapp ?? true),
    is_vip: Boolean(raw?.is_vip ?? false),
    full_name: String(raw?.full_name ?? raw?.name ?? ''),
    phone_number: raw?.phone_number ?? null,
    teams_email: raw?.teams_email ?? null,
    teams_webhook_url: raw?.teams_webhook_url ?? null,
    timezone: raw?.timezone ? String(raw.timezone) : undefined,
    locale: raw?.locale ? String(raw.locale) : undefined,
    must_change_password: Boolean(raw?.must_change_password ?? false),
    profile_completed: Boolean(raw?.profile_completed ?? false),
    profile_completion_required: Boolean(raw?.profile_completion_required ?? false),
  };
}

export const usersApi = {
  me: async (): Promise<User> => mapCurrentUser(await apiClient<any>('/users/me')),

  list: async (params: ListUsersParams = {}): Promise<ManagedUserListResponse> => {
    const clampedLimit = params.limit !== undefined
      ? String(Math.min(200, Math.max(1, params.limit)))
      : undefined;

    const response = await apiClient<any>('/users', {
      params: {
        role: params.role,
        status: params.status,
        skip: params.skip !== undefined ? String(params.skip) : undefined,
        limit: clampedLimit,
      },
    });

    return {
      users: Array.isArray(response?.users) ? response.users.map(mapManagedUser) : [],
      total: Number(response?.total ?? 0),
    };
  },

  getById: async (userId: string): Promise<ManagedUser> => {
    const response = await apiClient<any>(`/users/${userId}`);
    return mapManagedUser(response);
  },

  update: async (userId: string, payload: UpdateUserPayload): Promise<ManagedUser> => {
    const response = await apiClient<any>(`/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    return mapManagedUser(response);
  },

  remove: (userId: string) =>
    apiClient<{ message: string }>(`/users/${userId}`, {
      method: 'DELETE',
    }),

  updateMe: async (payload: {
    full_name?: string;
    phone_number?: string | null;
    teams_email?: string | null;
    teams_webhook_url?: string | null;
    timezone?: string;
    locale?: string;
  }): Promise<User> => mapCurrentUser(await apiClient<any>('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })),

  changePassword: (payload: { current_password: string; new_password: string }) =>
    apiClient<{ message: string }>('/users/me/password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
