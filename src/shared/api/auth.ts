import { apiClient, setTokens, clearToken } from './client';
import type { LoginRequest, RegisterRequest, AuthResponse, User, LoginResponse, VerifyOtpRequest, SetupTwoFactorResponse, VerifyTwoFactorSetupRequest } from '@/shared/types';

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
    two_factor_enabled: Boolean(u?.two_factor_enabled ?? false),
  };
}

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response as LoginResponse;
  },

  verifyOtp: async (data: VerifyOtpRequest): Promise<AuthResponse> => {
    const response = await apiClient<any>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response as AuthResponse;
  },

  setupTwoFactor: async (): Promise<SetupTwoFactorResponse> => {
    return apiClient<any>('/auth/2fa/setup', { method: 'POST' });
  },

  verifyTwoFactorSetup: async (data: VerifyTwoFactorSetupRequest): Promise<{ message: string }> => {
    return apiClient<any>('/auth/2fa/verify-setup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  disableTwoFactor: async (password: string): Promise<{ message: string }> => {
    return apiClient<any>('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
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
