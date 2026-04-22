import { apiClient, setTokens, clearToken } from './client';
import type { LoginRequest, RegisterRequest, AuthResponse, User } from '@/shared/types';

function normalizeUser(u: any): User {
  const roleRaw = String(u?.role ?? "").toUpperCase();
  const role = roleRaw === "ADMIN" ? "admin" : roleRaw === "AGENT" ? "agent" : "client";
  return {
    id: String(u?.id ?? ""),
    email: String(u?.email ?? ""),
    name: String(u?.full_name ?? u?.name ?? ""),
    role,
    can_reply_conversations: Boolean(u?.can_reply_conversations ?? true),
    can_reply_whatsapp: Boolean(u?.can_reply_whatsapp ?? true),
    full_name: String(u?.full_name ?? u?.name ?? ""),
    phone_number: u?.phone_number ?? null,
    teams_email: u?.teams_email ?? null,
    teams_webhook_url: u?.teams_webhook_url ?? null,
    timezone: u?.timezone ? String(u.timezone) : undefined,
    locale: u?.locale ? String(u.locale) : undefined,
    must_change_password: Boolean(u?.must_change_password ?? false),
    profile_completed: Boolean(u?.profile_completed ?? false),
    profile_completion_required: Boolean(u?.profile_completion_required ?? false),
  };
}

export const authApi = {
  login: async (data: LoginRequest) => {
    const res = await apiClient<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    setTokens(res.access_token, res.refresh_token);
    return res;
  },
  register: async (data: RegisterRequest) =>
    apiClient<any>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  me: async (): Promise<User> => {
    const u = await apiClient<any>('/users/me');
    return normalizeUser(u);
  },
  logout: async () => {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
    }
  },
};
