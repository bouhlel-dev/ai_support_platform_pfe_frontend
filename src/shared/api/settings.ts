import { apiClient } from './client';
import type { AdminSettings, PublicAuthSettings } from '@/shared/types';

export const settingsApi = {
  getAdmin: () => apiClient<AdminSettings>('/settings'),
  getPublicAuth: () => apiClient<PublicAuthSettings>('/settings/public'),
  updateGeneral: (payload: Partial<AdminSettings>) =>
    apiClient<AdminSettings>('/settings/general', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateBranding: (payload: Partial<AdminSettings>) =>
    apiClient<AdminSettings>('/settings/branding', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateTickets: (payload: Partial<AdminSettings>) =>
    apiClient<AdminSettings>('/settings/tickets', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateSecurity: (payload: Partial<AdminSettings>) =>
    apiClient<AdminSettings>('/settings/security', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateNotifications: (payload: Partial<AdminSettings>) =>
    apiClient<AdminSettings>('/settings/notifications', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  updateAutomation: (payload: Partial<AdminSettings>) =>
    apiClient<AdminSettings>('/settings/automation', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
