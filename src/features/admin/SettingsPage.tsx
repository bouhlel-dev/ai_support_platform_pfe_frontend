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
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Zap,
  Lock,
  Mail,
  Server,
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
  if (typeof value === 'string') return value;
  return fallback;
}

function coerceNumber(value: unknown, fallback: number, min?: number, max?: number) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (typeof min === 'number' && num < min) return min;
  if (typeof max === 'number' && num > max) return max;
  return num;
}

function coerceBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    if (n === 'true' || n === '1' || n === 'yes' || n === 'on') return true;
    if (n === 'false' || n === '0' || n === 'no' || n === 'off') return false;
  }
  return fallback;
}

function coerceEnum<T extends string>(value: unknown, fallback: T, validValues: readonly T[]) {
  if (typeof value === 'string' && validValues.includes(value as T)) return value as T;
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
    auto_assignment_method: coerceEnum(input.auto_assignment_method, DEFAULT_ADVANCED_SETTINGS.auto_assignment_method, ['Round-robin', 'By category', 'By workload']),
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
    require_email_verification: coerceBoolean(input.require_email_verification, DEFAULT_ADVANCED_SETTINGS.require_email_verification),
    two_factor_auth: coerceBoolean(input.two_factor_auth, DEFAULT_ADVANCED_SETTINGS.two_factor_auth),
    require_admin_profile_completion: coerceBoolean(input.require_admin_profile_completion, DEFAULT_ADVANCED_SETTINGS.require_admin_profile_completion),
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
    notify_assigned: coerceBoolean(input.notify_assigned, DEFAULT_ADVANCED_SETTINGS.notify_assigned),
    notify_overdue: coerceBoolean(input.notify_overdue, DEFAULT_ADVANCED_SETTINGS.notify_overdue),
    notify_resolved: coerceBoolean(input.notify_resolved, DEFAULT_ADVANCED_SETTINGS.notify_resolved),
    ai_auto_reply_chat_enabled: coerceBoolean(input.ai_auto_reply_chat_enabled, DEFAULT_ADVANCED_SETTINGS.ai_auto_reply_chat_enabled),
    ai_auto_reply_whatsapp_enabled: coerceBoolean(input.ai_auto_reply_whatsapp_enabled, DEFAULT_ADVANCED_SETTINGS.ai_auto_reply_whatsapp_enabled),
    ai_auto_reply_email_enabled: coerceBoolean(input.ai_auto_reply_email_enabled, DEFAULT_ADVANCED_SETTINGS.ai_auto_reply_email_enabled),
    conversation_sla_autopilot_enabled: coerceBoolean(input.conversation_sla_autopilot_enabled, DEFAULT_ADVANCED_SETTINGS.conversation_sla_autopilot_enabled),
    conversation_sla_auto_escalate_minutes_before_breach: coerceNumber(input.conversation_sla_auto_escalate_minutes_before_breach, DEFAULT_ADVANCED_SETTINGS.conversation_sla_auto_escalate_minutes_before_breach, 0, 24 * 60),
    conversation_sla_auto_assign_enabled: coerceBoolean(input.conversation_sla_auto_assign_enabled, DEFAULT_ADVANCED_SETTINGS.conversation_sla_auto_assign_enabled),
    conversation_sla_auto_assign_minutes_before_breach: coerceNumber(input.conversation_sla_auto_assign_minutes_before_breach, DEFAULT_ADVANCED_SETTINGS.conversation_sla_auto_assign_minutes_before_breach, 0, 24 * 60),
    conversation_sla_autopilot_respect_snooze: coerceBoolean(input.conversation_sla_autopilot_respect_snooze, DEFAULT_ADVANCED_SETTINGS.conversation_sla_autopilot_respect_snooze),
  };
}

function loadRuntimeOverrides() {
  const values: Record<string, string> = {};
  RUNTIME_ENV_KEYS.forEach(({ key }) => {
    values[key] = getClientConfigRaw(key) || '';
  });
  return values;
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  footer,
}: {
  title: string;
  description?: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      {(title || description) && (
        <div className="flex items-start gap-3 px-6 py-5 border-b border-border/40 bg-muted/20">
          {Icon && (
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}
      <div className="p-6 space-y-5">{children}</div>
      {footer && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-border/40 bg-muted/10">
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── Field Group ──────────────────────────────────────────────────────────────

function FieldGroup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid gap-5 ${className}`}>{children}</div>;
}

function Field({ label, hint, children, span }: { label: string; hint?: string; children: React.ReactNode; span?: 'full' }) {
  return (
    <div className={`space-y-1.5 ${span === 'full' ? 'col-span-full' : ''}`}>
      <Label className="text-xs font-medium text-foreground/80 uppercase tracking-wide">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Save Button ──────────────────────────────────────────────────────────────

function SaveButton({
  section,
  currentlySaving,
  isPending,
  onClick,
  label = 'Save Changes',
}: {
  section: SettingsSection;
  currentlySaving: SettingsSection | null;
  isPending: boolean;
  onClick: () => void;
  label?: string;
}) {
  const saving = currentlySaving === section;
  return (
    <Button onClick={onClick} disabled={isPending} size="sm" className="gap-2 min-w-[140px]">
      {saving ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Save className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </Button>
  );
}

// ─── Toggle Row (improved) ────────────────────────────────────────────────────

function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors ${checked ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-muted/20'}`}>
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium leading-none">
          {label}
        </Label>
        {description && <p className="mt-1 text-xs text-muted-foreground truncate">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="shrink-0" />
    </div>
  );
}

// ─── Stat Badge ───────────────────────────────────────────────────────────────

function StatPill({ label, value, variant = 'default' }: { label: string; value: string | number; variant?: 'default' | 'success' | 'warn' }) {
  const colors = {
    default: 'bg-muted text-muted-foreground border-border/40',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colors[variant]}`}>
      <span className="text-foreground/50">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

// ─── SLA Priority Row ─────────────────────────────────────────────────────────

function SlaRow({
  label,
  value,
  color,
  onChange,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} />
      <Label className="w-16 shrink-0 text-xs font-medium">{label}</Label>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(coerceNumber(e.target.value, value, 1, 999))}
        className="h-8 w-24 text-sm"
      />
      <span className="text-xs text-muted-foreground">hrs</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [runtimeValues, setRuntimeValues] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AdvancedSettings>({ ...DEFAULT_ADVANCED_SETTINGS });
  const [voiceAgentConfig, setVoiceAgentConfig] = useState<VoiceAgentConfig | null>(null);
  const [savingSection, setSavingSection] = useState<SettingsSection | null>(null);
  const hasLocalToken = !!getToken();
  const is401 = (error: unknown) => error instanceof ApiError && error.status === 401;

  const adminSettingsQ = useQuery({ queryKey: ['admin-settings'], queryFn: settingsApi.getAdmin });
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
    onError: (error) => toast({ variant: 'destructive', title: 'Save failed', description: normalizeError(error) }),
  });

  useEffect(() => { setRuntimeValues(loadRuntimeOverrides()); }, []);
  useEffect(() => { if (adminSettingsQ.data) setSettings(normalizeAdvancedSettings(adminSettingsQ.data)); }, [adminSettingsQ.data]);
  useEffect(() => { if (voiceAgentConfigQ.data) setVoiceAgentConfig(voiceAgentConfigQ.data); }, [voiceAgentConfigQ.data]);

  const runtimeOverrideCount = useMemo(
    () => Object.values(runtimeValues).filter((v) => v.trim().length > 0).length,
    [runtimeValues],
  );

  const enabledNotifications = useMemo(
    () => [settings.notify_new_ticket, settings.notify_status_change, settings.notify_assigned, settings.notify_overdue, settings.notify_resolved].filter(Boolean).length,
    [settings.notify_assigned, settings.notify_new_ticket, settings.notify_overdue, settings.notify_resolved, settings.notify_status_change],
  );

  const securityStrength = useMemo(() => {
    let score = 0;
    if (settings.min_password_length >= 8) score++;
    if (settings.password_complexity) score++;
    if (settings.require_email_verification) score++;
    if (settings.two_factor_auth) score++;
    if (settings.require_admin_profile_completion) score++;
    if (score >= 4) return { label: 'Strong', variant: 'success' as const };
    if (score >= 2) return { label: 'Standard', variant: 'default' as const };
    return { label: 'Basic', variant: 'warn' as const };
  }, [settings.min_password_length, settings.password_complexity, settings.require_email_verification, settings.require_admin_profile_completion, settings.two_factor_auth]);

  const updateSetting = <K extends keyof AdvancedSettings>(key: K, value: AdvancedSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const saveRuntimeOverrides = () => {
    Object.entries(runtimeValues).forEach(([key, value]) => localStorage.setItem(`config_${key}`, value));
    toast({ title: 'Runtime overrides saved', description: 'Reload the app to apply frontend runtime config changes.' });
  };

  const persistSettingsMut = useMutation({
    mutationFn: async (section: SettingsSection) => {
      if (section === 'general') return settingsApi.updateGeneral({ app_name: settings.app_name, support_email: settings.support_email, description: settings.description, locale: settings.locale, timezone: settings.timezone });
      if (section === 'branding') return settingsApi.updateBranding({ primary_color: settings.primary_color, secondary_color: settings.secondary_color, theme_mode: settings.theme_mode, ticket_label: settings.ticket_label });
      if (section === 'tickets') return settingsApi.updateTickets({ auto_assignment: settings.auto_assignment, auto_assignment_method: settings.auto_assignment_method, allow_client_close: settings.allow_client_close, sla_critical_hours: settings.sla_critical_hours, sla_high_hours: settings.sla_high_hours, sla_medium_hours: settings.sla_medium_hours, sla_low_hours: settings.sla_low_hours });
      if (section === 'security') return settingsApi.updateSecurity({ min_password_length: settings.min_password_length, session_timeout: settings.session_timeout, max_login_attempts: settings.max_login_attempts, password_complexity: settings.password_complexity, allow_registration: settings.allow_registration, require_email_verification: settings.require_email_verification, two_factor_auth: settings.two_factor_auth, require_admin_profile_completion: settings.require_admin_profile_completion });
      if (section === 'automation') return settingsApi.updateAutomation({ ai_auto_reply_chat_enabled: settings.ai_auto_reply_chat_enabled, ai_auto_reply_whatsapp_enabled: settings.ai_auto_reply_whatsapp_enabled, ai_auto_reply_email_enabled: settings.ai_auto_reply_email_enabled, conversation_sla_autopilot_enabled: settings.conversation_sla_autopilot_enabled, conversation_sla_auto_escalate_minutes_before_breach: settings.conversation_sla_auto_escalate_minutes_before_breach, conversation_sla_auto_assign_enabled: settings.conversation_sla_auto_assign_enabled, conversation_sla_auto_assign_minutes_before_breach: settings.conversation_sla_auto_assign_minutes_before_breach, conversation_sla_autopilot_respect_snooze: settings.conversation_sla_autopilot_respect_snooze });
      return settingsApi.updateNotifications({ mail_mode: settings.mail_mode, gmail_from_email: settings.gmail_from_email, gmail_client_id: settings.gmail_client_id, gmail_client_secret: settings.gmail_client_secret, gmail_refresh_token: settings.gmail_refresh_token, smtp_from_name: settings.smtp_from_name, smtp_from_email: settings.smtp_from_email, smtp_host: settings.smtp_host, smtp_port: settings.smtp_port, smtp_encryption: settings.smtp_encryption, smtp_username: settings.smtp_username, smtp_password: settings.smtp_password, notify_new_ticket: settings.notify_new_ticket, notify_status_change: settings.notify_status_change, notify_assigned: settings.notify_assigned, notify_overdue: settings.notify_overdue, notify_resolved: settings.notify_resolved });
    },
    onMutate: (section) => setSavingSection(section),
    onSuccess: (saved) => {
      setSettings(normalizeAdvancedSettings(saved));
      void adminSettingsQ.refetch();
      toast({ title: 'Settings saved', description: 'Persisted to backend configuration.' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Save failed', description: normalizeError(error) }),
    onSettled: () => setSavingSection(null),
  });

  const saveAdvanced = (section: SettingsSection) => persistSettingsMut.mutate(section);

  const resetAdvancedSettings = () => {
    if (!window.confirm('Discard unsaved changes and reload persisted settings?')) return;
    if (adminSettingsQ.data) {
      setSettings(normalizeAdvancedSettings(adminSettingsQ.data));
      toast({ title: 'Changes discarded', description: 'Reloaded persisted backend settings.' });
      return;
    }
    setSettings({ ...DEFAULT_ADVANCED_SETTINGS });
    toast({ title: 'Settings reset', description: 'No persisted settings were available to reload.' });
  };

  const clearRuntimeOverrides = () => {
    if (!window.confirm('Clear all runtime overrides and revert to env defaults?')) return;
    RUNTIME_ENV_KEYS.forEach(({ key }) => localStorage.removeItem(`config_${key}`));
    setRuntimeValues(loadRuntimeOverrides());
    toast({ title: 'Runtime overrides cleared', description: 'Values reverted to env defaults.' });
  };

  const exportSettings = () => {
    const payload = { exported_at: new Date().toISOString(), schema_version: 1, runtime_overrides: runtimeValues, advanced_settings: settings };
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
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const importedRuntime = parsed.runtime_overrides && typeof parsed.runtime_overrides === 'object' ? (parsed.runtime_overrides as Record<string, unknown>) : {};
      const nextRuntime: Record<string, string> = {};
      RUNTIME_ENV_KEYS.forEach(({ key }) => {
        const rawValue = importedRuntime[key];
        const value = typeof rawValue === 'string' ? rawValue : '';
        nextRuntime[key] = value;
        localStorage.setItem(`config_${key}`, value);
      });
      const advancedSource = parsed.advanced_settings && typeof parsed.advanced_settings === 'object' ? parsed.advanced_settings : parsed;
      setRuntimeValues(nextRuntime);
      setSettings(normalizeAdvancedSettings(advancedSource));
      toast({ title: 'Settings imported', description: 'Review and save each section to persist backend changes.' });
    } catch {
      toast({ variant: 'destructive', title: 'Import failed', description: 'The selected file is not a valid admin settings export.' });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* ── Page header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Advanced Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            System configuration, branding, security, and automation controls.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="Overrides" value={runtimeOverrideCount} />
          <StatPill label="Alerts" value={`${enabledNotifications}/5`} variant={enabledNotifications > 0 ? 'success' : 'warn'} />
          <StatPill label="Security" value={securityStrength.label} variant={securityStrength.variant} />
        </div>
      </div>

      {/* ── Loading / Error banners ── */}
      {adminSettingsQ.isLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading persisted settings…
        </div>
      )}
      {adminSettingsQ.error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Failed to load persisted settings: {normalizeError(adminSettingsQ.error)}
        </div>
      )}

      {/* ── Tabs ── */}
      <Tabs defaultValue="general" className="space-y-5">
        <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl border bg-muted/50 p-1">
          {[
            { value: 'general', icon: Globe2, label: 'General' },
            { value: 'branding', icon: Palette, label: 'Branding' },
            { value: 'tickets', icon: Ticket, label: 'Tickets' },
            { value: 'security', icon: ShieldCheck, label: 'Security' },
            { value: 'notifications', icon: Bell, label: 'Notifications' },
            { value: 'automation', icon: Bot, label: 'Automation' },
            { value: 'system', icon: Settings2, label: 'System' },
          ].map(({ value, icon: Icon, label }) => (
            <TabsTrigger key={value} value={value} className="flex-1 gap-1.5 rounded-lg text-xs font-medium">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ───────── GENERAL ───────── */}
        <TabsContent value="general" className="space-y-4">
          <SectionCard
            title="General Information"
            description="Basic platform identity and regional defaults."
            icon={Globe2}
            footer={
              <SaveButton
                section="general"
                currentlySaving={savingSection}
                isPending={persistSettingsMut.isPending}
                onClick={() => saveAdvanced('general')}
                label="Save General"
              />
            }
          >
            <FieldGroup className="md:grid-cols-2">
              <Field label="Application Name">
                <Input value={settings.app_name} onChange={(e) => updateSetting('app_name', e.target.value)} placeholder="AI Support Agent" />
              </Field>
              <Field label="Support Email">
                <Input type="email" value={settings.support_email} onChange={(e) => updateSetting('support_email', e.target.value)} placeholder="support@example.com" />
              </Field>
              <Field label="Description" span="full">
                <Textarea rows={3} value={settings.description} onChange={(e) => updateSetting('description', e.target.value)} placeholder="Platform summary shown across admin surfaces" className="resize-none" />
              </Field>
              <Field label="Locale">
                <Select value={settings.locale} onValueChange={(v) => updateSetting('locale', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Timezone">
                <Select value={settings.timezone} onValueChange={(v) => updateSetting('timezone', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Africa/Tunis">Africa/Tunis</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </SectionCard>
        </TabsContent>

        {/* ───────── BRANDING ───────── */}
        <TabsContent value="branding" className="space-y-4">
          <SectionCard
            title="Branding &amp; Theme"
            description="Customize colors, themes, and terminology."
            icon={Palette}
            footer={
              <SaveButton
                section="branding"
                currentlySaving={savingSection}
                isPending={persistSettingsMut.isPending}
                onClick={() => saveAdvanced('branding')}
                label="Save Branding"
              />
            }
          >
            <FieldGroup className="md:grid-cols-2">
              <Field label="Primary Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.primary_color}
                    onChange={(e) => updateSetting('primary_color', e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                  <Input value={settings.primary_color} onChange={(e) => updateSetting('primary_color', e.target.value)} className="font-mono" />
                </div>
              </Field>
              <Field label="Secondary Color">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.secondary_color}
                    onChange={(e) => updateSetting('secondary_color', e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                  />
                  <Input value={settings.secondary_color} onChange={(e) => updateSetting('secondary_color', e.target.value)} className="font-mono" />
                </div>
              </Field>
              <Field label="Default Theme Mode">
                <Select value={settings.theme_mode} onValueChange={(v) => updateSetting('theme_mode', v as ThemeMode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">☀️ Light</SelectItem>
                    <SelectItem value="dark">🌙 Dark</SelectItem>
                    <SelectItem value="system">💻 System</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Ticket Label" hint="Used throughout the UI in place of 'Ticket'.">
                <Input value={settings.ticket_label} onChange={(e) => updateSetting('ticket_label', e.target.value)} placeholder="Ticket" />
              </Field>
            </FieldGroup>

            {/* Live preview */}
            <div
              className="relative overflow-hidden rounded-xl p-5 text-white"
              style={{ background: `linear-gradient(135deg, ${settings.primary_color} 0%, ${settings.secondary_color} 100%)` }}
            >
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 60%)' }} />
              <p className="relative text-xs font-medium uppercase tracking-widest opacity-70">Color preview</p>
              <p className="relative mt-1 text-lg font-semibold">{settings.app_name}</p>
              <div className="relative mt-3 flex gap-2">
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs">Primary</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs">Secondary</span>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ───────── TICKETS ───────── */}
        <TabsContent value="tickets" className="space-y-4">
          <SectionCard
            title="Ticket Rules"
            description="Assignment behavior and SLA enforcement."
            icon={Ticket}
            footer={
              <SaveButton
                section="tickets"
                currentlySaving={savingSection}
                isPending={persistSettingsMut.isPending}
                onClick={() => saveAdvanced('tickets')}
                label="Save Tickets"
              />
            }
          >
            <div className="grid gap-5 md:grid-cols-2">
              {/* Assignment toggles */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignment</p>
                <ToggleRow id="auto-assignment" label="Auto assignment" description="Automatically assign new tickets" checked={settings.auto_assignment} onCheckedChange={(v) => updateSetting('auto_assignment', v)} />
                <ToggleRow id="allow-client-close" label="Client can close ticket" description="Allow end-users to close their own tickets" checked={settings.allow_client_close} onCheckedChange={(v) => updateSetting('allow_client_close', v)} />
                <Field label="Assignment Method">
                  <Select value={settings.auto_assignment_method} onValueChange={(v) => updateSetting('auto_assignment_method', v as AutoAssignmentMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Round-robin">Round-robin</SelectItem>
                      <SelectItem value="By category">By category</SelectItem>
                      <SelectItem value="By workload">By workload</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {/* SLA */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">SLA by Priority</p>
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                  <SlaRow label="Critical" value={settings.sla_critical_hours} color="bg-red-500" onChange={(v) => updateSetting('sla_critical_hours', v)} />
                  <SlaRow label="High" value={settings.sla_high_hours} color="bg-orange-400" onChange={(v) => updateSetting('sla_high_hours', v)} />
                  <SlaRow label="Medium" value={settings.sla_medium_hours} color="bg-yellow-400" onChange={(v) => updateSetting('sla_medium_hours', v)} />
                  <SlaRow label="Low" value={settings.sla_low_hours} color="bg-green-400" onChange={(v) => updateSetting('sla_low_hours', v)} />
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ───────── SECURITY ───────── */}
        <TabsContent value="security" className="space-y-4">
          <SectionCard
            title="Security &amp; Access Policy"
            description="Password rules, session limits, and authentication controls."
            icon={Lock}
            footer={
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Current strength:&nbsp;
                  <span className={securityStrength.variant === 'success' ? 'text-emerald-600 font-semibold' : securityStrength.variant === 'warn' ? 'text-amber-600 font-semibold' : 'font-semibold'}>
                    {securityStrength.label}
                  </span>
                </div>
                <SaveButton
                  section="security"
                  currentlySaving={savingSection}
                  isPending={persistSettingsMut.isPending}
                  onClick={() => saveAdvanced('security')}
                  label="Save Security"
                />
              </div>
            }
          >
            <FieldGroup className="md:grid-cols-3">
              <Field label="Min Password Length">
                <Input type="number" min={6} max={64} value={settings.min_password_length} onChange={(e) => updateSetting('min_password_length', coerceNumber(e.target.value, settings.min_password_length, 6, 64))} />
              </Field>
              <Field label="Session Timeout (min)">
                <Input type="number" min={5} max={1440} value={settings.session_timeout} onChange={(e) => updateSetting('session_timeout', coerceNumber(e.target.value, settings.session_timeout, 5, 1440))} />
              </Field>
              <Field label="Max Login Attempts">
                <Input type="number" min={3} max={50} value={settings.max_login_attempts} onChange={(e) => updateSetting('max_login_attempts', coerceNumber(e.target.value, settings.max_login_attempts, 3, 50))} />
              </Field>
            </FieldGroup>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow id="password-complexity" label="Enforce password complexity" description="Require uppercase, numbers, and symbols" checked={settings.password_complexity} onCheckedChange={(v) => updateSetting('password_complexity', v)} />
              <ToggleRow id="allow-registration" label="Allow client registration" description="Let new users self-register" checked={settings.allow_registration} onCheckedChange={(v) => updateSetting('allow_registration', v)} />
              <ToggleRow id="require-email-verification" label="Require email verification" description="Email must be confirmed before access" checked={settings.require_email_verification} onCheckedChange={(v) => updateSetting('require_email_verification', v)} />
              <ToggleRow id="two-factor-auth" label="Enable optional 2FA" description="Allow agents to set up two-factor auth" checked={settings.two_factor_auth} onCheckedChange={(v) => updateSetting('two_factor_auth', v)} />
              <ToggleRow id="require-admin-profile" label="Require admin profile completion" description="Enforce profile fields before access" checked={settings.require_admin_profile_completion} onCheckedChange={(v) => updateSetting('require_admin_profile_completion', v)} />
            </div>
          </SectionCard>
        </TabsContent>

        {/* ───────── NOTIFICATIONS ───────── */}
        <TabsContent value="notifications" className="space-y-4">
          <SectionCard
            title="Email &amp; Notifications"
            description="Configure outbound mail and event-based notifications."
            icon={Mail}
            footer={
              <SaveButton
                section="notifications"
                currentlySaving={savingSection}
                isPending={persistSettingsMut.isPending}
                onClick={() => saveAdvanced('notifications')}
                label="Save Notifications"
              />
            }
          >
            {/* Mail mode switch */}
            <div className="flex items-center gap-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Mail Mode</Label>
              <div className="flex rounded-lg border border-border/60 overflow-hidden">
                {(['gmail', 'smtp'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateSetting('mail_mode', mode)}
                    className={`px-4 py-1.5 text-xs font-medium transition-colors ${settings.mail_mode === mode ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'}`}
                  >
                    {mode === 'gmail' ? 'Gmail OAuth' : 'SMTP'}
                  </button>
                ))}
              </div>
            </div>

            {settings.mail_mode === 'gmail' ? (
              <FieldGroup className="md:grid-cols-2">
                <Field label="Gmail Sender Email">
                  <Input value={settings.gmail_from_email} onChange={(e) => updateSetting('gmail_from_email', e.target.value)} placeholder="support@gmail.com" />
                </Field>
                <Field label="Sender Name">
                  <Input value={settings.smtp_from_name} onChange={(e) => updateSetting('smtp_from_name', e.target.value)} placeholder="Support Team" />
                </Field>
                <Field label="Gmail Client ID">
                  <Input value={settings.gmail_client_id} onChange={(e) => updateSetting('gmail_client_id', e.target.value)} placeholder="xxxx.apps.googleusercontent.com" />
                </Field>
                <Field label="Gmail Client Secret">
                  <Input type="password" value={settings.gmail_client_secret} onChange={(e) => updateSetting('gmail_client_secret', e.target.value)} placeholder="Client secret" />
                </Field>
                <Field label="Gmail Refresh Token" span="full">
                  <Input type="password" value={settings.gmail_refresh_token} onChange={(e) => updateSetting('gmail_refresh_token', e.target.value)} placeholder="Refresh token" />
                </Field>
              </FieldGroup>
            ) : (
              <FieldGroup className="md:grid-cols-3">
                <Field label="Sender Email">
                  <Input value={settings.smtp_from_email} onChange={(e) => updateSetting('smtp_from_email', e.target.value)} placeholder="support@example.com" />
                </Field>
                <Field label="Sender Name">
                  <Input value={settings.smtp_from_name} onChange={(e) => updateSetting('smtp_from_name', e.target.value)} />
                </Field>
                <Field label="SMTP Host">
                  <Input value={settings.smtp_host} onChange={(e) => updateSetting('smtp_host', e.target.value)} />
                </Field>
                <Field label="SMTP Port">
                  <Input type="number" min={1} max={65535} value={settings.smtp_port} onChange={(e) => updateSetting('smtp_port', coerceNumber(e.target.value, settings.smtp_port, 1, 65535))} />
                </Field>
                <Field label="Encryption">
                  <Select value={settings.smtp_encryption} onValueChange={(v) => updateSetting('smtp_encryption', v as SmtpEncryption)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="ssl">SSL</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="SMTP Username">
                  <Input value={settings.smtp_username} onChange={(e) => updateSetting('smtp_username', e.target.value)} />
                </Field>
                <Field label="SMTP Password" span="full">
                  <Input type="password" value={settings.smtp_password} onChange={(e) => updateSetting('smtp_password', e.target.value)} placeholder="Leave as-is unless rotating credentials" />
                </Field>
              </FieldGroup>
            )}

            <div className="border-t border-border/40 pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notification Triggers</p>
              <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                <ToggleRow id="notify-new-ticket" label="New tickets" checked={settings.notify_new_ticket} onCheckedChange={(v) => updateSetting('notify_new_ticket', v)} />
                <ToggleRow id="notify-status-change" label="Status changes" checked={settings.notify_status_change} onCheckedChange={(v) => updateSetting('notify_status_change', v)} />
                <ToggleRow id="notify-assigned" label="Assignment" checked={settings.notify_assigned} onCheckedChange={(v) => updateSetting('notify_assigned', v)} />
                <ToggleRow id="notify-overdue" label="Overdue SLA" checked={settings.notify_overdue} onCheckedChange={(v) => updateSetting('notify_overdue', v)} />
                <ToggleRow id="notify-resolved" label="Resolution" checked={settings.notify_resolved} onCheckedChange={(v) => updateSetting('notify_resolved', v)} />
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ───────── AUTOMATION ───────── */}
        <TabsContent value="automation" className="space-y-4">
          <SectionCard
            title="AI Auto-Reply"
            description="Enable automated AI responses per channel."
            icon={Zap}
          >
            <div className="grid gap-2.5 md:grid-cols-3">
              <ToggleRow id="ai-auto-reply-chat" label="Chat conversations" checked={settings.ai_auto_reply_chat_enabled} onCheckedChange={(v) => updateSetting('ai_auto_reply_chat_enabled', v)} />
              <ToggleRow id="ai-auto-reply-whatsapp" label="WhatsApp" checked={settings.ai_auto_reply_whatsapp_enabled} onCheckedChange={(v) => updateSetting('ai_auto_reply_whatsapp_enabled', v)} />
              <ToggleRow id="ai-auto-reply-email" label="Email" checked={settings.ai_auto_reply_email_enabled} onCheckedChange={(v) => updateSetting('ai_auto_reply_email_enabled', v)} />
            </div>
          </SectionCard>

          <SectionCard
            title="SLA Autopilot"
            description="Proactive escalation and assignment before SLA breach."
            icon={Bot}
            footer={
              <SaveButton
                section="automation"
                currentlySaving={savingSection}
                isPending={persistSettingsMut.isPending}
                onClick={() => saveAdvanced('automation')}
                label="Save Automation"
              />
            }
          >
            <div className="grid gap-2.5 md:grid-cols-3">
              <ToggleRow id="conversation-sla-autopilot-enabled" label="Enable SLA autopilot" checked={settings.conversation_sla_autopilot_enabled} onCheckedChange={(v) => updateSetting('conversation_sla_autopilot_enabled', v)} />
              <ToggleRow id="conversation-sla-auto-assign-enabled" label="Enable auto-assign" checked={settings.conversation_sla_auto_assign_enabled} onCheckedChange={(v) => updateSetting('conversation_sla_auto_assign_enabled', v)} />
              <ToggleRow id="conversation-sla-autopilot-respect-snooze" label="Respect snooze windows" checked={settings.conversation_sla_autopilot_respect_snooze} onCheckedChange={(v) => updateSetting('conversation_sla_autopilot_respect_snooze', v)} />
            </div>

            <FieldGroup className="md:grid-cols-2">
              <Field label="Escalate Before Breach" hint="Minutes before SLA breach to trigger escalation.">
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={24 * 60} value={settings.conversation_sla_auto_escalate_minutes_before_breach} onChange={(e) => updateSetting('conversation_sla_auto_escalate_minutes_before_breach', coerceNumber(e.target.value, settings.conversation_sla_auto_escalate_minutes_before_breach, 0, 24 * 60))} />
                  <span className="shrink-0 text-xs text-muted-foreground">min</span>
                </div>
              </Field>
              <Field label="Auto-Assign Before Breach" hint="Minutes before SLA breach to trigger auto-assignment.">
                <div className="flex items-center gap-2">
                  <Input type="number" min={0} max={24 * 60} value={settings.conversation_sla_auto_assign_minutes_before_breach} onChange={(e) => updateSetting('conversation_sla_auto_assign_minutes_before_breach', coerceNumber(e.target.value, settings.conversation_sla_auto_assign_minutes_before_breach, 0, 24 * 60))} />
                  <span className="shrink-0 text-xs text-muted-foreground">min</span>
                </div>
              </Field>
            </FieldGroup>
          </SectionCard>
        </TabsContent>

        {/* ───────── SYSTEM ───────── */}
        <TabsContent value="system" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* System info */}
            <SectionCard title="System Information" icon={Server}>
              <dl className="space-y-2.5 text-sm">
                {[
                  { label: 'Environment', value: <Badge variant="outline" className="font-mono text-xs">{import.meta.env.MODE}</Badge> },
                  { label: 'Origin', value: <span className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">{window.location.origin}</span> },
                  { label: 'Time', value: <span className="text-xs text-muted-foreground">{new Date().toLocaleString()}</span> },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="flex items-center">{value}</dd>
                  </div>
                ))}
              </dl>
            </SectionCard>

            {/* Local actions */}
            <SectionCard title="Admin Actions" description="Import/export your settings draft. Use section save buttons for backend persistence." icon={Settings2}>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={resetAdvancedSettings}>
                  <RotateCcw className="h-3.5 w-3.5" />Reset
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={clearRuntimeOverrides}>
                  <Wrench className="h-3.5 w-3.5" />Clear overrides
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={exportSettings}>
                  <Download className="h-3.5 w-3.5" />Export
                </Button>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => importInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />Import
                </Button>
              </div>
              <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={(e) => { void importSettingsFromFile(e); }} />
            </SectionCard>
          </div>

          {/* Runtime overrides */}
          <SectionCard
            title="Frontend Runtime Overrides"
            description="Stored in localStorage, these take precedence over frontend env values."
            icon={Wrench}
            footer={
              <Button size="sm" className="gap-2" onClick={saveRuntimeOverrides}>
                <Save className="h-3.5 w-3.5" />Save Overrides
              </Button>
            }
          >
            <FieldGroup className="md:grid-cols-2">
              {RUNTIME_ENV_KEYS.map(({ key, label, description }) => (
                <Field key={key} label={label} hint={description}>
                  <Input
                    value={runtimeValues[key] || ''}
                    onChange={(e) => setRuntimeValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={key}
                    className="font-mono text-sm"
                  />
                </Field>
              ))}
            </FieldGroup>
          </SectionCard>

          {/* Voice agents */}
          <SectionCard
            title="Voice Agent Configuration"
            description="LiveKit and AI provider settings for voice agents."
            icon={Bot}
          >
            {!hasLocalToken ? (
              <p className="text-sm text-muted-foreground">Admin authentication token is missing. Re-login to load voice agent configuration.</p>
            ) : is401(voiceAgentConfigQ.error) ? (
              <p className="text-sm text-muted-foreground">Session expired or unauthorized. Re-login as admin to continue.</p>
            ) : voiceAgentConfigQ.isLoading && !voiceAgentConfig ? (
              <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading voice agent configuration…
              </p>
            ) : voiceAgentConfigQ.error ? (
              <p className="text-sm text-destructive">{normalizeError(voiceAgentConfigQ.error)}</p>
            ) : !voiceAgentConfig ? (
              <p className="text-sm text-muted-foreground">No voice agent configuration available.</p>
            ) : (
              <>
                <FieldGroup className="md:grid-cols-2">
                  {VOICE_AGENT_CONFIG_FIELD_ORDER.map((key) => {
                    const value = voiceAgentConfig[key];
                    if (typeof value === 'boolean') {
                      return (
                        <ToggleRow
                          key={key}
                          id={`settings-voice-config-${key}`}
                          label={VOICE_AGENT_CONFIG_LABELS[key]}
                          checked={value}
                          onCheckedChange={(checked) => setVoiceAgentConfig((prev) => prev ? { ...prev, [key]: checked } : prev)}
                        />
                      );
                    }
                    return (
                      <Field key={key} label={VOICE_AGENT_CONFIG_LABELS[key]}>
                        <Input
                          type={VOICE_AGENT_CONFIG_SECRET_FIELDS.includes(key) ? 'password' : 'text'}
                          value={String(value ?? '')}
                          onChange={(e) => setVoiceAgentConfig((prev) => prev ? { ...prev, [key]: e.target.value } : prev)}
                          className="font-mono text-sm"
                        />
                      </Field>
                    );
                  })}
                </FieldGroup>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => { void voiceAgentConfigQ.refetch(); }}>
                    <RotateCcw className="h-3.5 w-3.5" />Reload
                  </Button>
                  <Button size="sm" className="gap-2" disabled={saveVoiceAgentConfigMut.isPending} onClick={() => { if (voiceAgentConfig) saveVoiceAgentConfigMut.mutate(voiceAgentConfig); }}>
                    {saveVoiceAgentConfigMut.isPending ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving</>
                    ) : (
                      <><Save className="h-3.5 w-3.5" />Save Config</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </SectionCard>

          {/* .env example */}
          <SectionCard title="Runtime .env Example" icon={Server}>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs font-mono leading-relaxed text-muted-foreground">
{`VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_QR_BRIDGE_URL=http://localhost:3000/qr

# Default screenshare assistance parameters
VITE_DEFAULT_SCREENSHARE_TARGET_FPS=2
VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS=false`}
            </pre>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}