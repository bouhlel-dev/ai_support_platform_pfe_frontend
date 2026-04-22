import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Bell,
  Bot,
  Download,
  Globe2,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  Ticket,
  Upload,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ApiError, getToken, normalizeError } from '@/shared/api/client';
import { getClientConfigRaw } from '@/shared/config/clientConfig';
import { settingsApi } from '@/shared/api/settings';
import { voiceAgentsApi, type VoiceAgentConfig } from '@/shared/api/voiceAgents';

const RUNTIME_ENV_KEYS = [
  {
    key: 'VITE_API_BASE_URL',
    label: 'API Base URL',
    description: 'Backend API endpoint used by the frontend client.',
  },
  {
    key: 'VITE_QR_BRIDGE_URL',
    label: 'QR Bridge URL',
    description: 'Where the QR bridge page is embedded for device pairing.',
  },
  {
    key: 'VITE_DEFAULT_SCREENSHARE_TARGET_FPS',
    label: 'Screenshare Target FPS',
    description: 'Default target FPS for screen assistance capture loops.',
  },
  {
    key: 'VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS',
    label: 'Use Gemini Embeddings',
    description: 'Default toggle for Gemini embeddings in screenshare assistance.',
  },
];

type ThemeMode = 'light' | 'dark' | 'system';
type AutoAssignmentMethod = 'Round-robin' | 'By category' | 'By workload';
type MailMode = 'gmail' | 'smtp';
type SmtpEncryption = 'tls' | 'ssl' | 'none';
type SettingsSection = 'general' | 'branding' | 'tickets' | 'security' | 'notifications' | 'automation';

type AdvancedSettings = {
  app_name: string;
  support_email: string;
  description: string;
  locale: string;
  timezone: string;

  primary_color: string;
  secondary_color: string;
  theme_mode: ThemeMode;
  ticket_label: string;

  auto_assignment: boolean;
  auto_assignment_method: AutoAssignmentMethod;
  allow_client_close: boolean;
  sla_critical_hours: number;
  sla_high_hours: number;
  sla_medium_hours: number;
  sla_low_hours: number;

  min_password_length: number;
  session_timeout: number;
  max_login_attempts: number;
  password_complexity: boolean;
  allow_registration: boolean;
  require_email_verification: boolean;
  two_factor_auth: boolean;
  require_admin_profile_completion: boolean;

  mail_mode: MailMode;
  gmail_from_email: string;
  gmail_client_id: string;
  gmail_client_secret: string;
  gmail_refresh_token: string;
  smtp_from_name: string;
  smtp_from_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_encryption: SmtpEncryption;
  smtp_username: string;
  smtp_password: string;

  notify_new_ticket: boolean;
  notify_status_change: boolean;
  notify_new_comment: boolean;
  notify_assigned: boolean;
  notify_overdue: boolean;
  notify_resolved: boolean;

  ai_auto_reply_chat_enabled: boolean;
  ai_auto_reply_whatsapp_enabled: boolean;
  ai_auto_reply_email_enabled: boolean;
  conversation_sla_autopilot_enabled: boolean;
  conversation_sla_auto_escalate_minutes_before_breach: number;
  conversation_sla_auto_assign_enabled: boolean;
  conversation_sla_auto_assign_minutes_before_breach: number;
  conversation_sla_autopilot_respect_snooze: boolean;
};

const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  app_name: 'AI Support Agent',
  support_email: 'support@example.com',
  description: 'AI-powered support operations workspace.',
  locale: 'en',
  timezone: 'UTC',

  primary_color: '#1f3a6f',
  secondary_color: '#2f6f9f',
  theme_mode: 'light',
  ticket_label: 'Ticket',

  auto_assignment: false,
  auto_assignment_method: 'Round-robin',
  allow_client_close: true,
  sla_critical_hours: 4,
  sla_high_hours: 8,
  sla_medium_hours: 24,
  sla_low_hours: 48,

  min_password_length: 8,
  session_timeout: 120,
  max_login_attempts: 5,
  password_complexity: true,
  allow_registration: true,
  require_email_verification: false,
  two_factor_auth: false,
  require_admin_profile_completion: false,

  mail_mode: 'gmail',
  gmail_from_email: '',
  gmail_client_id: '',
  gmail_client_secret: '',
  gmail_refresh_token: '',
  smtp_from_name: 'Support',
  smtp_from_email: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
  smtp_encryption: 'tls',
  smtp_username: '',
  smtp_password: '',

  notify_new_ticket: true,
  notify_status_change: true,
  notify_new_comment: true,
  notify_assigned: true,
  notify_overdue: true,
  notify_resolved: true,

  ai_auto_reply_chat_enabled: true,
  ai_auto_reply_whatsapp_enabled: true,
  ai_auto_reply_email_enabled: true,
  conversation_sla_autopilot_enabled: true,
  conversation_sla_auto_escalate_minutes_before_breach: 15,
  conversation_sla_auto_assign_enabled: true,
  conversation_sla_auto_assign_minutes_before_breach: 10,
  conversation_sla_autopilot_respect_snooze: true,
};

const VOICE_AGENT_CONFIG_FIELD_ORDER: Array<keyof VoiceAgentConfig> = [
  'livekit_api_key',
  'livekit_api_secret',
  'livekit_url',
  'ai_response_provider',
  'use_realtime',
  'google_api_key',
  'openai_api_key',
  'anthropic_api_key',
  'gemini_api_key',
  'gemini_model',
  'openai_model',
  'backend_api_url',
  'internal_service_key',
  'voice_recordings_dir',
  'database_url',
];

const VOICE_AGENT_CONFIG_LABELS: Record<keyof VoiceAgentConfig, string> = {
  livekit_api_key: 'LiveKit API Key',
  livekit_api_secret: 'LiveKit API Secret',
  livekit_url: 'LiveKit URL',
  ai_response_provider: 'AI Provider',
  use_realtime: 'Use Realtime Mode',
  google_api_key: 'Google API Key',
  openai_api_key: 'OpenAI API Key',
  anthropic_api_key: 'Anthropic API Key',
  gemini_api_key: 'Gemini API Key',
  gemini_model: 'Gemini Model',
  openai_model: 'OpenAI Model',
  backend_api_url: 'Backend API URL',
  internal_service_key: 'Internal Service Key',
  voice_recordings_dir: 'Recordings Directory',
  database_url: 'Database URL',
};

const VOICE_AGENT_CONFIG_SECRET_FIELDS: Array<keyof VoiceAgentConfig> = [
  'livekit_api_key',
  'livekit_api_secret',
  'google_api_key',
  'openai_api_key',
  'anthropic_api_key',
  'gemini_api_key',
  'internal_service_key',
  'database_url',
];

function coerceString(value: unknown, fallback: string) {
  if (typeof value === 'string') {
    return value;
  }
  return fallback;
}

function coerceNumber(value: unknown, fallback: number, min?: number, max?: number) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  if (typeof min === 'number' && num < min) {
    return min;
  }
  if (typeof max === 'number' && num > max) {
    return max;
  }
  return num;
}

function coerceBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return false;
    }
  }
  return fallback;
}

function coerceEnum<T extends string>(value: unknown, fallback: T, validValues: readonly T[]) {
  if (typeof value === 'string' && validValues.includes(value as T)) {
    return value as T;
  }
  return fallback;
}

function normalizeAdvancedSettings(raw: unknown): AdvancedSettings {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    app_name: coerceString(input.app_name, DEFAULT_ADVANCED_SETTINGS.app_name),
    support_email: coerceString(input.support_email, DEFAULT_ADVANCED_SETTINGS.support_email),
    description: coerceString(input.description, DEFAULT_ADVANCED_SETTINGS.description),
    locale: coerceString(input.locale, DEFAULT_ADVANCED_SETTINGS.locale),
    timezone: coerceString(input.timezone, DEFAULT_ADVANCED_SETTINGS.timezone),

    primary_color: coerceString(input.primary_color, DEFAULT_ADVANCED_SETTINGS.primary_color),
    secondary_color: coerceString(input.secondary_color, DEFAULT_ADVANCED_SETTINGS.secondary_color),
    theme_mode: coerceEnum(input.theme_mode, DEFAULT_ADVANCED_SETTINGS.theme_mode, ['light', 'dark', 'system']),
    ticket_label: coerceString(input.ticket_label, DEFAULT_ADVANCED_SETTINGS.ticket_label),

    auto_assignment: coerceBoolean(input.auto_assignment, DEFAULT_ADVANCED_SETTINGS.auto_assignment),
    auto_assignment_method: coerceEnum(
      input.auto_assignment_method,
      DEFAULT_ADVANCED_SETTINGS.auto_assignment_method,
      ['Round-robin', 'By category', 'By workload'],
    ),
    allow_client_close: coerceBoolean(input.allow_client_close, DEFAULT_ADVANCED_SETTINGS.allow_client_close),
    sla_critical_hours: coerceNumber(input.sla_critical_hours, DEFAULT_ADVANCED_SETTINGS.sla_critical_hours, 1, 999),
    sla_high_hours: coerceNumber(input.sla_high_hours, DEFAULT_ADVANCED_SETTINGS.sla_high_hours, 1, 999),
    sla_medium_hours: coerceNumber(input.sla_medium_hours, DEFAULT_ADVANCED_SETTINGS.sla_medium_hours, 1, 999),
    sla_low_hours: coerceNumber(input.sla_low_hours, DEFAULT_ADVANCED_SETTINGS.sla_low_hours, 1, 999),

    min_password_length: coerceNumber(input.min_password_length, DEFAULT_ADVANCED_SETTINGS.min_password_length, 6, 64),
    session_timeout: coerceNumber(input.session_timeout, DEFAULT_ADVANCED_SETTINGS.session_timeout, 5, 1440),
    max_login_attempts: coerceNumber(input.max_login_attempts, DEFAULT_ADVANCED_SETTINGS.max_login_attempts, 3, 50),
    password_complexity: coerceBoolean(input.password_complexity, DEFAULT_ADVANCED_SETTINGS.password_complexity),
    allow_registration: coerceBoolean(input.allow_registration, DEFAULT_ADVANCED_SETTINGS.allow_registration),
    require_email_verification: coerceBoolean(
      input.require_email_verification,
      DEFAULT_ADVANCED_SETTINGS.require_email_verification,
    ),
    two_factor_auth: coerceBoolean(input.two_factor_auth, DEFAULT_ADVANCED_SETTINGS.two_factor_auth),
    require_admin_profile_completion: coerceBoolean(
      input.require_admin_profile_completion,
      DEFAULT_ADVANCED_SETTINGS.require_admin_profile_completion,
    ),

    mail_mode: coerceEnum(input.mail_mode, DEFAULT_ADVANCED_SETTINGS.mail_mode, ['gmail', 'smtp']),
    gmail_from_email: coerceString(input.gmail_from_email, DEFAULT_ADVANCED_SETTINGS.gmail_from_email),
    gmail_client_id: coerceString(input.gmail_client_id, DEFAULT_ADVANCED_SETTINGS.gmail_client_id),
    gmail_client_secret: coerceString(input.gmail_client_secret, DEFAULT_ADVANCED_SETTINGS.gmail_client_secret),
    gmail_refresh_token: coerceString(input.gmail_refresh_token, DEFAULT_ADVANCED_SETTINGS.gmail_refresh_token),
    smtp_from_name: coerceString(input.smtp_from_name, DEFAULT_ADVANCED_SETTINGS.smtp_from_name),
    smtp_from_email: coerceString(input.smtp_from_email, DEFAULT_ADVANCED_SETTINGS.smtp_from_email),
    smtp_host: coerceString(input.smtp_host, DEFAULT_ADVANCED_SETTINGS.smtp_host),
    smtp_port: coerceNumber(input.smtp_port, DEFAULT_ADVANCED_SETTINGS.smtp_port, 1, 65535),
    smtp_encryption: coerceEnum(input.smtp_encryption, DEFAULT_ADVANCED_SETTINGS.smtp_encryption, ['tls', 'ssl', 'none']),
    smtp_username: coerceString(input.smtp_username, DEFAULT_ADVANCED_SETTINGS.smtp_username),
    smtp_password: coerceString(input.smtp_password, DEFAULT_ADVANCED_SETTINGS.smtp_password),

    notify_new_ticket: coerceBoolean(input.notify_new_ticket, DEFAULT_ADVANCED_SETTINGS.notify_new_ticket),
    notify_status_change: coerceBoolean(input.notify_status_change, DEFAULT_ADVANCED_SETTINGS.notify_status_change),
    notify_new_comment: coerceBoolean(input.notify_new_comment, DEFAULT_ADVANCED_SETTINGS.notify_new_comment),
    notify_assigned: coerceBoolean(input.notify_assigned, DEFAULT_ADVANCED_SETTINGS.notify_assigned),
    notify_overdue: coerceBoolean(input.notify_overdue, DEFAULT_ADVANCED_SETTINGS.notify_overdue),
    notify_resolved: coerceBoolean(input.notify_resolved, DEFAULT_ADVANCED_SETTINGS.notify_resolved),

    ai_auto_reply_chat_enabled: coerceBoolean(
      input.ai_auto_reply_chat_enabled,
      DEFAULT_ADVANCED_SETTINGS.ai_auto_reply_chat_enabled,
    ),
    ai_auto_reply_whatsapp_enabled: coerceBoolean(
      input.ai_auto_reply_whatsapp_enabled,
      DEFAULT_ADVANCED_SETTINGS.ai_auto_reply_whatsapp_enabled,
    ),
    ai_auto_reply_email_enabled: coerceBoolean(
      input.ai_auto_reply_email_enabled,
      DEFAULT_ADVANCED_SETTINGS.ai_auto_reply_email_enabled,
    ),
    conversation_sla_autopilot_enabled: coerceBoolean(
      input.conversation_sla_autopilot_enabled,
      DEFAULT_ADVANCED_SETTINGS.conversation_sla_autopilot_enabled,
    ),
    conversation_sla_auto_escalate_minutes_before_breach: coerceNumber(
      input.conversation_sla_auto_escalate_minutes_before_breach,
      DEFAULT_ADVANCED_SETTINGS.conversation_sla_auto_escalate_minutes_before_breach,
      0,
      24 * 60,
    ),
    conversation_sla_auto_assign_enabled: coerceBoolean(
      input.conversation_sla_auto_assign_enabled,
      DEFAULT_ADVANCED_SETTINGS.conversation_sla_auto_assign_enabled,
    ),
    conversation_sla_auto_assign_minutes_before_breach: coerceNumber(
      input.conversation_sla_auto_assign_minutes_before_breach,
      DEFAULT_ADVANCED_SETTINGS.conversation_sla_auto_assign_minutes_before_breach,
      0,
      24 * 60,
    ),
    conversation_sla_autopilot_respect_snooze: coerceBoolean(
      input.conversation_sla_autopilot_respect_snooze,
      DEFAULT_ADVANCED_SETTINGS.conversation_sla_autopilot_respect_snooze,
    ),
  };
}

function loadRuntimeOverrides() {
  const values: Record<string, string> = {};
  RUNTIME_ENV_KEYS.forEach(({ key }) => {
    values[key] = getClientConfigRaw(key) || '';
  });
  return values;
}

export function SettingsPage() {
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [runtimeValues, setRuntimeValues] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AdvancedSettings>({ ...DEFAULT_ADVANCED_SETTINGS });
  const [voiceAgentConfig, setVoiceAgentConfig] = useState<VoiceAgentConfig | null>(null);
  const [savingSection, setSavingSection] = useState<SettingsSection | null>(null);
  const hasLocalToken = !!getToken();
  const is401 = (error: unknown) => error instanceof ApiError && error.status === 401;

  const adminSettingsQ = useQuery({
    queryKey: ['admin-settings'],
    queryFn: settingsApi.getAdmin,
  });

  const voiceAgentConfigQ = useQuery({
    queryKey: ['settings-voice-agents-config'],
    queryFn: voiceAgentsApi.getConfig,
    enabled: hasLocalToken,
    retry: false,
  });

  const saveVoiceAgentConfigMut = useMutation({
    mutationFn: (payload: VoiceAgentConfig) => voiceAgentsApi.saveConfig(payload),
    onSuccess: (saved) => {
      setVoiceAgentConfig(saved);
      void voiceAgentConfigQ.refetch();
      toast({ title: 'Voice agent configuration saved' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: normalizeError(error),
      });
    },
  });

  useEffect(() => {
    setRuntimeValues(loadRuntimeOverrides());
  }, []);

  useEffect(() => {
    if (adminSettingsQ.data) {
      setSettings(normalizeAdvancedSettings(adminSettingsQ.data));
    }
  }, [adminSettingsQ.data]);

  useEffect(() => {
    if (voiceAgentConfigQ.data) {
      setVoiceAgentConfig(voiceAgentConfigQ.data);
    }
  }, [voiceAgentConfigQ.data]);

  const runtimeOverrideCount = useMemo(
    () => Object.values(runtimeValues).filter((value) => value.trim().length > 0).length,
    [runtimeValues],
  );

  const enabledNotifications = useMemo(
    () =>
      [
        settings.notify_new_ticket,
        settings.notify_status_change,
        settings.notify_new_comment,
        settings.notify_assigned,
        settings.notify_overdue,
        settings.notify_resolved,
      ].filter(Boolean).length,
    [
      settings.notify_assigned,
      settings.notify_new_comment,
      settings.notify_new_ticket,
      settings.notify_overdue,
      settings.notify_resolved,
      settings.notify_status_change,
    ],
  );

  const securityStrength = useMemo(() => {
    let score = 0;
    if (settings.min_password_length >= 8) score += 1;
    if (settings.password_complexity) score += 1;
    if (settings.require_email_verification) score += 1;
    if (settings.two_factor_auth) score += 1;
    if (settings.require_admin_profile_completion) score += 1;
    if (score >= 4) return 'Strong';
    if (score >= 2) return 'Standard';
    return 'Basic';
  }, [
    settings.min_password_length,
    settings.password_complexity,
    settings.require_email_verification,
    settings.require_admin_profile_completion,
    settings.two_factor_auth,
  ]);

  const updateSetting = <K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const saveRuntimeOverrides = () => {
    Object.entries(runtimeValues).forEach(([key, value]) => {
      localStorage.setItem(`config_${key}`, value);
    });

    toast({
      title: 'Runtime overrides saved',
      description: 'Reload the app to apply frontend runtime config changes.',
    });
  };

  const persistSettingsMut = useMutation({
    mutationFn: async (section: SettingsSection) => {
      if (section === 'general') {
        return settingsApi.updateGeneral({
          app_name: settings.app_name,
          support_email: settings.support_email,
          description: settings.description,
          locale: settings.locale,
          timezone: settings.timezone,
        });
      }

      if (section === 'branding') {
        return settingsApi.updateBranding({
          primary_color: settings.primary_color,
          secondary_color: settings.secondary_color,
          theme_mode: settings.theme_mode,
          ticket_label: settings.ticket_label,
        });
      }

      if (section === 'tickets') {
        return settingsApi.updateTickets({
          auto_assignment: settings.auto_assignment,
          auto_assignment_method: settings.auto_assignment_method,
          allow_client_close: settings.allow_client_close,
          sla_critical_hours: settings.sla_critical_hours,
          sla_high_hours: settings.sla_high_hours,
          sla_medium_hours: settings.sla_medium_hours,
          sla_low_hours: settings.sla_low_hours,
        });
      }

      if (section === 'security') {
        return settingsApi.updateSecurity({
          min_password_length: settings.min_password_length,
          session_timeout: settings.session_timeout,
          max_login_attempts: settings.max_login_attempts,
          password_complexity: settings.password_complexity,
          allow_registration: settings.allow_registration,
          require_email_verification: settings.require_email_verification,
          two_factor_auth: settings.two_factor_auth,
          require_admin_profile_completion: settings.require_admin_profile_completion,
        });
      }

      if (section === 'automation') {
        return settingsApi.updateAutomation({
          ai_auto_reply_chat_enabled: settings.ai_auto_reply_chat_enabled,
          ai_auto_reply_whatsapp_enabled: settings.ai_auto_reply_whatsapp_enabled,
          ai_auto_reply_email_enabled: settings.ai_auto_reply_email_enabled,
          conversation_sla_autopilot_enabled: settings.conversation_sla_autopilot_enabled,
          conversation_sla_auto_escalate_minutes_before_breach:
            settings.conversation_sla_auto_escalate_minutes_before_breach,
          conversation_sla_auto_assign_enabled: settings.conversation_sla_auto_assign_enabled,
          conversation_sla_auto_assign_minutes_before_breach:
            settings.conversation_sla_auto_assign_minutes_before_breach,
          conversation_sla_autopilot_respect_snooze: settings.conversation_sla_autopilot_respect_snooze,
        });
      }

      return settingsApi.updateNotifications({
        mail_mode: settings.mail_mode,
        gmail_from_email: settings.gmail_from_email,
        gmail_client_id: settings.gmail_client_id,
        gmail_client_secret: settings.gmail_client_secret,
        gmail_refresh_token: settings.gmail_refresh_token,
        smtp_from_name: settings.smtp_from_name,
        smtp_from_email: settings.smtp_from_email,
        smtp_host: settings.smtp_host,
        smtp_port: settings.smtp_port,
        smtp_encryption: settings.smtp_encryption,
        smtp_username: settings.smtp_username,
        smtp_password: settings.smtp_password,
        notify_new_ticket: settings.notify_new_ticket,
        notify_status_change: settings.notify_status_change,
        notify_new_comment: settings.notify_new_comment,
        notify_assigned: settings.notify_assigned,
        notify_overdue: settings.notify_overdue,
        notify_resolved: settings.notify_resolved,
      });
    },
    onMutate: (section) => {
      setSavingSection(section);
    },
    onSuccess: (saved) => {
      setSettings(normalizeAdvancedSettings(saved));
      void adminSettingsQ.refetch();
      toast({ title: 'Settings saved', description: 'Persisted to backend configuration.' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: normalizeError(error),
      });
    },
    onSettled: () => {
      setSavingSection(null);
    },
  });

  const saveAdvanced = (section: SettingsSection) => {
    persistSettingsMut.mutate(section);
  };

  const resetAdvancedSettings = () => {
    if (!window.confirm('Discard unsaved changes and reload persisted settings?')) {
      return;
    }

    if (adminSettingsQ.data) {
      setSettings(normalizeAdvancedSettings(adminSettingsQ.data));
      toast({ title: 'Changes discarded', description: 'Reloaded persisted backend settings.' });
      return;
    }

    setSettings({ ...DEFAULT_ADVANCED_SETTINGS });
    toast({ title: 'Settings reset', description: 'No persisted settings were available to reload.' });
  };

  const clearRuntimeOverrides = () => {
    if (!window.confirm('Clear all runtime overrides and revert to env defaults?')) {
      return;
    }
    RUNTIME_ENV_KEYS.forEach(({ key }) => {
      localStorage.removeItem(`config_${key}`);
    });
    setRuntimeValues(loadRuntimeOverrides());
    toast({ title: 'Runtime overrides cleared', description: 'Values reverted to env defaults.' });
  };

  const exportSettings = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      schema_version: 1,
      runtime_overrides: runtimeValues,
      advanced_settings: settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `admin-settings-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importSettingsFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;

      const importedRuntime =
        parsed.runtime_overrides && typeof parsed.runtime_overrides === 'object'
          ? (parsed.runtime_overrides as Record<string, unknown>)
          : {};

      const nextRuntime: Record<string, string> = {};
      RUNTIME_ENV_KEYS.forEach(({ key }) => {
        const rawValue = importedRuntime[key];
        const value = typeof rawValue === 'string' ? rawValue : '';
        nextRuntime[key] = value;
        localStorage.setItem(`config_${key}`, value);
      });

      const advancedSource =
        parsed.advanced_settings && typeof parsed.advanced_settings === 'object'
          ? parsed.advanced_settings
          : parsed;
      const nextAdvanced = normalizeAdvancedSettings(advancedSource);

      setRuntimeValues(nextRuntime);
      setSettings(nextAdvanced);
      toast({ title: 'Settings imported', description: 'Review and save each section to persist backend changes.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: 'The selected file is not a valid admin settings export.',
      });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Advanced Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Super-admin style system settings parity with tabbed controls and runtime overrides.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Runtime overrides: {runtimeOverrideCount}</Badge>
          <Badge variant="secondary">Notifications: {enabledNotifications}/6</Badge>
          <Badge variant="secondary">Security: {securityStrength}</Badge>
        </div>
      </div>

      {adminSettingsQ.isLoading ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Loading persisted settings...
        </div>
      ) : null}

      {adminSettingsQ.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Failed to load persisted settings: {normalizeError(adminSettingsQ.error)}
        </div>
      ) : null}

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border bg-muted/70 p-1 md:grid-cols-7">
          <TabsTrigger value="general" className="gap-1.5 rounded-lg">
            <Globe2 className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-1.5 rounded-lg">
            <Palette className="h-3.5 w-3.5" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-1.5 rounded-lg">
            <Ticket className="h-3.5 w-3.5" />
            Tickets
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5 rounded-lg">
            <ShieldCheck className="h-3.5 w-3.5" />
            Security
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 rounded-lg">
            <Bell className="h-3.5 w-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="automation" className="gap-1.5 rounded-lg">
            <Bot className="h-3.5 w-3.5" />
            Automation
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-1.5 rounded-lg">
            <Settings2 className="h-3.5 w-3.5" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">General Information</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Application Name</Label>
                <Input
                  value={settings.app_name}
                  onChange={(event) => updateSetting('app_name', event.target.value)}
                  placeholder="AI Support Agent"
                />
              </div>
              <div className="space-y-1">
                <Label>Support Email</Label>
                <Input
                  type="email"
                  value={settings.support_email}
                  onChange={(event) => updateSetting('support_email', event.target.value)}
                  placeholder="support@example.com"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  value={settings.description}
                  onChange={(event) => updateSetting('description', event.target.value)}
                  placeholder="Platform summary shown across admin surfaces"
                />
              </div>
              <div className="space-y-1">
                <Label>Locale</Label>
                <Select value={settings.locale} onValueChange={(value) => updateSetting('locale', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Timezone</Label>
                <Select
                  value={settings.timezone}
                  onValueChange={(value) => updateSetting('timezone', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Africa/Tunis">Africa/Tunis</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => saveAdvanced('general')} disabled={persistSettingsMut.isPending}>
              {savingSection === 'general' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />Save General Settings
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="branding" className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Branding and Theme</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Primary Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={settings.primary_color}
                    onChange={(event) => updateSetting('primary_color', event.target.value)}
                    className="h-10 w-16 p-1"
                  />
                  <Input
                    value={settings.primary_color}
                    onChange={(event) => updateSetting('primary_color', event.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Secondary Color</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    value={settings.secondary_color}
                    onChange={(event) => updateSetting('secondary_color', event.target.value)}
                    className="h-10 w-16 p-1"
                  />
                  <Input
                    value={settings.secondary_color}
                    onChange={(event) => updateSetting('secondary_color', event.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Default Theme Mode</Label>
                <Select
                  value={settings.theme_mode}
                  onValueChange={(value) => updateSetting('theme_mode', value as ThemeMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ticket Label</Label>
                <Input
                  value={settings.ticket_label}
                  onChange={(event) => updateSetting('ticket_label', event.target.value)}
                  placeholder="Ticket"
                />
              </div>
            </div>

            <div
              className="rounded-xl border p-4 text-sm"
              style={{
                background: `linear-gradient(135deg, ${settings.primary_color}, ${settings.secondary_color})`,
                color: '#ffffff',
              }}
            >
              Live preview for branding colors and theme accent.
            </div>

            <Button onClick={() => saveAdvanced('branding')} disabled={persistSettingsMut.isPending}>
              {savingSection === 'branding' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />Save Branding
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="tickets" className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Ticket Rules and Behavior</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="auto-assignment">Auto assignment</Label>
                  <Switch
                    id="auto-assignment"
                    checked={settings.auto_assignment}
                    onCheckedChange={(checked) => updateSetting('auto_assignment', checked)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="allow-client-close">Client can close ticket</Label>
                  <Switch
                    id="allow-client-close"
                    checked={settings.allow_client_close}
                    onCheckedChange={(checked) => updateSetting('allow_client_close', checked)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Auto assignment method</Label>
                  <Select
                    value={settings.auto_assignment_method}
                    onValueChange={(value) =>
                      updateSetting('auto_assignment_method', value as AutoAssignmentMethod)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Round-robin">Round-robin</SelectItem>
                      <SelectItem value="By category">By category</SelectItem>
                      <SelectItem value="By workload">By workload</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">SLA by priority (hours)</p>
                <div className="grid gap-2 grid-cols-2">
                  <div className="space-y-1">
                    <Label>Critical</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.sla_critical_hours}
                      onChange={(event) =>
                        updateSetting('sla_critical_hours', coerceNumber(event.target.value, settings.sla_critical_hours, 1, 999))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>High</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.sla_high_hours}
                      onChange={(event) =>
                        updateSetting('sla_high_hours', coerceNumber(event.target.value, settings.sla_high_hours, 1, 999))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Medium</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.sla_medium_hours}
                      onChange={(event) =>
                        updateSetting('sla_medium_hours', coerceNumber(event.target.value, settings.sla_medium_hours, 1, 999))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Low</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.sla_low_hours}
                      onChange={(event) =>
                        updateSetting('sla_low_hours', coerceNumber(event.target.value, settings.sla_low_hours, 1, 999))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button onClick={() => saveAdvanced('tickets')} disabled={persistSettingsMut.isPending}>
              {savingSection === 'tickets' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />Save Ticket Rules
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Security and Access Policy</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Password min length</Label>
                <Input
                  type="number"
                  min={6}
                  max={64}
                  value={settings.min_password_length}
                  onChange={(event) =>
                    updateSetting(
                      'min_password_length',
                      coerceNumber(event.target.value, settings.min_password_length, 6, 64),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Session timeout (minutes)</Label>
                <Input
                  type="number"
                  min={5}
                  max={1440}
                  value={settings.session_timeout}
                  onChange={(event) =>
                    updateSetting(
                      'session_timeout',
                      coerceNumber(event.target.value, settings.session_timeout, 5, 1440),
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Max login attempts</Label>
                <Input
                  type="number"
                  min={3}
                  max={50}
                  value={settings.max_login_attempts}
                  onChange={(event) =>
                    updateSetting(
                      'max_login_attempts',
                      coerceNumber(event.target.value, settings.max_login_attempts, 3, 50),
                    )
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="password-complexity">Enforce password complexity</Label>
                <Switch
                  id="password-complexity"
                  checked={settings.password_complexity}
                  onCheckedChange={(checked) => updateSetting('password_complexity', checked)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="allow-registration">Allow client registration</Label>
                <Switch
                  id="allow-registration"
                  checked={settings.allow_registration}
                  onCheckedChange={(checked) => updateSetting('allow_registration', checked)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="require-email-verification">Require email verification</Label>
                <Switch
                  id="require-email-verification"
                  checked={settings.require_email_verification}
                  onCheckedChange={(checked) => updateSetting('require_email_verification', checked)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="two-factor-auth">Enable optional 2FA</Label>
                <Switch
                  id="two-factor-auth"
                  checked={settings.two_factor_auth}
                  onCheckedChange={(checked) => updateSetting('two_factor_auth', checked)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                <Label htmlFor="require-admin-profile">Require admin profile completion</Label>
                <Switch
                  id="require-admin-profile"
                  checked={settings.require_admin_profile_completion}
                  onCheckedChange={(checked) => updateSetting('require_admin_profile_completion', checked)}
                />
              </div>
            </div>

            <Button onClick={() => saveAdvanced('security')} disabled={persistSettingsMut.isPending}>
              {savingSection === 'security' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />Save Security Policy
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Email and Notification Routing</h3>

            <div className="space-y-1 max-w-xs">
              <Label>Mail Mode</Label>
              <Select value={settings.mail_mode} onValueChange={(value) => updateSetting('mail_mode', value as MailMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmail">Gmail OAuth</SelectItem>
                  <SelectItem value="smtp">SMTP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settings.mail_mode === 'gmail' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Gmail sender email</Label>
                  <Input
                    value={settings.gmail_from_email}
                    onChange={(event) => updateSetting('gmail_from_email', event.target.value)}
                    placeholder="support@gmail.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sender name</Label>
                  <Input
                    value={settings.smtp_from_name}
                    onChange={(event) => updateSetting('smtp_from_name', event.target.value)}
                    placeholder="Support Team"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Gmail client ID</Label>
                  <Input
                    value={settings.gmail_client_id}
                    onChange={(event) => updateSetting('gmail_client_id', event.target.value)}
                    placeholder="xxxx.apps.googleusercontent.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Gmail client secret</Label>
                  <Input
                    type="password"
                    value={settings.gmail_client_secret}
                    onChange={(event) => updateSetting('gmail_client_secret', event.target.value)}
                    placeholder="Client secret"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Gmail refresh token</Label>
                  <Input
                    type="password"
                    value={settings.gmail_refresh_token}
                    onChange={(event) => updateSetting('gmail_refresh_token', event.target.value)}
                    placeholder="Refresh token"
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Sender email</Label>
                  <Input
                    value={settings.smtp_from_email}
                    onChange={(event) => updateSetting('smtp_from_email', event.target.value)}
                    placeholder="support@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sender name</Label>
                  <Input
                    value={settings.smtp_from_name}
                    onChange={(event) => updateSetting('smtp_from_name', event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>SMTP host</Label>
                  <Input
                    value={settings.smtp_host}
                    onChange={(event) => updateSetting('smtp_host', event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>SMTP port</Label>
                  <Input
                    type="number"
                    min={1}
                    max={65535}
                    value={settings.smtp_port}
                    onChange={(event) =>
                      updateSetting('smtp_port', coerceNumber(event.target.value, settings.smtp_port, 1, 65535))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Encryption</Label>
                  <Select
                    value={settings.smtp_encryption}
                    onValueChange={(value) => updateSetting('smtp_encryption', value as SmtpEncryption)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>SMTP username</Label>
                  <Input
                    value={settings.smtp_username}
                    onChange={(event) => updateSetting('smtp_username', event.target.value)}
                  />
                </div>
                <div className="space-y-1 md:col-span-3">
                  <Label>SMTP password</Label>
                  <Input
                    type="password"
                    value={settings.smtp_password}
                    onChange={(event) => updateSetting('smtp_password', event.target.value)}
                    placeholder="Leave as-is unless rotating credentials"
                  />
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              <ToggleRow
                id="notify-new-ticket"
                label="Notify on new tickets"
                checked={settings.notify_new_ticket}
                onCheckedChange={(checked) => updateSetting('notify_new_ticket', checked)}
              />
              <ToggleRow
                id="notify-status-change"
                label="Notify on status changes"
                checked={settings.notify_status_change}
                onCheckedChange={(checked) => updateSetting('notify_status_change', checked)}
              />
              <ToggleRow
                id="notify-new-comment"
                label="Notify on new comments"
                checked={settings.notify_new_comment}
                onCheckedChange={(checked) => updateSetting('notify_new_comment', checked)}
              />
              <ToggleRow
                id="notify-assigned"
                label="Notify on assignment"
                checked={settings.notify_assigned}
                onCheckedChange={(checked) => updateSetting('notify_assigned', checked)}
              />
              <ToggleRow
                id="notify-overdue"
                label="Notify on overdue SLA"
                checked={settings.notify_overdue}
                onCheckedChange={(checked) => updateSetting('notify_overdue', checked)}
              />
              <ToggleRow
                id="notify-resolved"
                label="Notify on resolution"
                checked={settings.notify_resolved}
                onCheckedChange={(checked) => updateSetting('notify_resolved', checked)}
              />
            </div>

            <Button onClick={() => saveAdvanced('notifications')} disabled={persistSettingsMut.isPending}>
              {savingSection === 'notifications' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />Save Notification Settings
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">AI Auto-Reply Controls</h3>
            <p className="text-xs text-muted-foreground">
              Configure channel AI auto-reply and SLA autopilot behaviors before a breach occurs.
            </p>

            <div className="grid gap-2 md:grid-cols-3">
              <ToggleRow
                id="ai-auto-reply-chat"
                label="Conversations (Chat)"
                checked={settings.ai_auto_reply_chat_enabled}
                onCheckedChange={(checked) => updateSetting('ai_auto_reply_chat_enabled', checked)}
              />
              <ToggleRow
                id="ai-auto-reply-whatsapp"
                label="WhatsApp"
                checked={settings.ai_auto_reply_whatsapp_enabled}
                onCheckedChange={(checked) => updateSetting('ai_auto_reply_whatsapp_enabled', checked)}
              />
              <ToggleRow
                id="ai-auto-reply-email"
                label="Email"
                checked={settings.ai_auto_reply_email_enabled}
                onCheckedChange={(checked) => updateSetting('ai_auto_reply_email_enabled', checked)}
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <p className="text-sm font-medium">Conversation SLA Autopilot</p>

              <div className="grid gap-2 md:grid-cols-3">
                <ToggleRow
                  id="conversation-sla-autopilot-enabled"
                  label="Enable SLA autopilot"
                  checked={settings.conversation_sla_autopilot_enabled}
                  onCheckedChange={(checked) => updateSetting('conversation_sla_autopilot_enabled', checked)}
                />
                <ToggleRow
                  id="conversation-sla-auto-assign-enabled"
                  label="Enable auto-assign"
                  checked={settings.conversation_sla_auto_assign_enabled}
                  onCheckedChange={(checked) => updateSetting('conversation_sla_auto_assign_enabled', checked)}
                />
                <ToggleRow
                  id="conversation-sla-autopilot-respect-snooze"
                  label="Respect snooze windows"
                  checked={settings.conversation_sla_autopilot_respect_snooze}
                  onCheckedChange={(checked) => updateSetting('conversation_sla_autopilot_respect_snooze', checked)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Escalate before breach (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={24 * 60}
                    value={settings.conversation_sla_auto_escalate_minutes_before_breach}
                    onChange={(event) =>
                      updateSetting(
                        'conversation_sla_auto_escalate_minutes_before_breach',
                        coerceNumber(
                          event.target.value,
                          settings.conversation_sla_auto_escalate_minutes_before_breach,
                          0,
                          24 * 60,
                        ),
                      )
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Auto-assign before breach (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={24 * 60}
                    value={settings.conversation_sla_auto_assign_minutes_before_breach}
                    onChange={(event) =>
                      updateSetting(
                        'conversation_sla_auto_assign_minutes_before_breach',
                        coerceNumber(
                          event.target.value,
                          settings.conversation_sla_auto_assign_minutes_before_breach,
                          0,
                          24 * 60,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            </div>

            <Button onClick={() => saveAdvanced('automation')} disabled={persistSettingsMut.isPending}>
              {savingSection === 'automation' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />Save Automation Settings
                </>
              )}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">System Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Environment</span>
                  <Badge variant="outline">{import.meta.env.MODE}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Browser</span>
                  <span className="max-w-[16rem] truncate text-right">{navigator.userAgent}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Origin</span>
                  <span className="max-w-[16rem] truncate text-right">{window.location.origin}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Current time</span>
                  <span>{new Date().toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">Local Admin Actions</h3>
              <p className="text-xs text-muted-foreground">
                Import and export manage your current settings draft; use section save buttons to persist backend changes.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={resetAdvancedSettings}>
                  <RotateCcw className="mr-2 h-4 w-4" />Reset advanced
                </Button>
                <Button variant="outline" onClick={clearRuntimeOverrides}>
                  <Wrench className="mr-2 h-4 w-4" />Clear overrides
                </Button>
                <Button variant="outline" onClick={exportSettings}>
                  <Download className="mr-2 h-4 w-4" />Export settings
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    importInputRef.current?.click();
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" />Import settings
                </Button>
              </div>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(event) => {
                  void importSettingsFromFile(event);
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Frontend Runtime Overrides</h3>
            <p className="text-xs text-muted-foreground">
              Overrides are stored in localStorage and take precedence over frontend env values.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              {RUNTIME_ENV_KEYS.map(({ key, label, description }) => (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                  <Input
                    value={runtimeValues[key] || ''}
                    onChange={(event) =>
                      setRuntimeValues((prev) => ({
                        ...prev,
                        [key]: event.target.value,
                      }))
                    }
                    placeholder={key}
                    className="font-mono text-sm"
                  />
                </div>
              ))}
            </div>

            <Button onClick={saveRuntimeOverrides}>
              <Save className="mr-2 h-4 w-4" />Save Runtime Overrides
            </Button>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-4">
            <h3 className="text-sm font-semibold">Voice Agents Configuration</h3>
            <p className="text-xs text-muted-foreground">
              Voice agent environment settings are now managed from this System tab.
            </p>

            {!hasLocalToken ? (
              <p className="text-sm text-muted-foreground">
                Admin authentication token is missing. Re-login to load voice agent configuration.
              </p>
            ) : is401(voiceAgentConfigQ.error) ? (
              <p className="text-sm text-muted-foreground">
                Session expired or unauthorized. Re-login as admin to continue.
              </p>
            ) : voiceAgentConfigQ.isLoading && !voiceAgentConfig ? (
              <p className="inline-flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading voice agent configuration...
              </p>
            ) : voiceAgentConfigQ.error ? (
              <p className="text-sm text-destructive">{normalizeError(voiceAgentConfigQ.error)}</p>
            ) : !voiceAgentConfig ? (
              <p className="text-sm text-muted-foreground">No voice agent configuration available.</p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {VOICE_AGENT_CONFIG_FIELD_ORDER.map((key) => {
                    const value = voiceAgentConfig[key];
                    if (typeof value === 'boolean') {
                      return (
                        <div key={key} className="flex flex-col space-y-3 py-1">
                          <Label className="text-sm">{VOICE_AGENT_CONFIG_LABELS[key]}</Label>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={value}
                              onCheckedChange={(checked) =>
                                setVoiceAgentConfig((prev) =>
                                  prev ? { ...prev, [key]: checked } : prev,
                                )
                              }
                              id={`settings-voice-config-${key}`}
                            />
                            <Label
                              htmlFor={`settings-voice-config-${key}`}
                              className="text-xs text-muted-foreground font-normal"
                            >
                              {value ? 'Enabled' : 'Disabled'}
                            </Label>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={key} className="space-y-1">
                        <Label className="text-sm">{VOICE_AGENT_CONFIG_LABELS[key]}</Label>
                        <Input
                          type={VOICE_AGENT_CONFIG_SECRET_FIELDS.includes(key) ? 'password' : 'text'}
                          value={String(value ?? '')}
                          onChange={(event) =>
                            setVoiceAgentConfig((prev) =>
                              prev ? { ...prev, [key]: event.target.value } : prev,
                            )
                          }
                          className="font-mono text-sm"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      void voiceAgentConfigQ.refetch();
                    }}
                  >
                    Reload config
                  </Button>
                  <Button
                    disabled={saveVoiceAgentConfigMut.isPending}
                    onClick={() => {
                      if (voiceAgentConfig) {
                        saveVoiceAgentConfigMut.mutate(voiceAgentConfig);
                      }
                    }}
                  >
                    {saveVoiceAgentConfigMut.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />Save Voice Agent Config
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-2">Runtime .env Example</h3>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs font-mono">
{`VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_QR_BRIDGE_URL=http://localhost:3000/qr

# Default screenshare assistance parameters
VITE_DEFAULT_SCREENSHARE_TARGET_FPS=2
VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS=false`}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
