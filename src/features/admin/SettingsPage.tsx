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
  Smartphone,
  Ticket,
  Upload,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Zap,
  Lock,
  Mail,
  MessageSquare,
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
import { useTranslation } from 'react-i18next';
import { apiClient, ApiError, getToken, normalizeError } from '@/shared/api/client';
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
type SettingsSection = 'general' | 'branding' | 'tickets' | 'security' | 'notifications' | 'automation' | 'sms';

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
  sms_api_url: string;
  sms_api_key: string;
  sms_sender: string;
  sms_language: string;
  sms_notify_new_ticket: boolean;
  sms_notify_status_change: boolean;
  sms_notify_reply: boolean;
  sms_notify_resolved: boolean;
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
  sms_api_url: '',
  sms_api_key: '',
  sms_sender: 'L2T',
  sms_language: 'en',
  sms_notify_new_ticket: false,
  sms_notify_status_change: false,
  sms_notify_reply: false,
  sms_notify_resolved: false,
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
    sms_api_url: coerceString(input.sms_api_url, DEFAULT_ADVANCED_SETTINGS.sms_api_url),
    sms_api_key: coerceString(input.sms_api_key, DEFAULT_ADVANCED_SETTINGS.sms_api_key),
    sms_sender: coerceString(input.sms_sender, DEFAULT_ADVANCED_SETTINGS.sms_sender),
    sms_language: coerceEnum(input.sms_language, DEFAULT_ADVANCED_SETTINGS.sms_language, ['en', 'fr', 'ar']),
    sms_notify_new_ticket: coerceBoolean(input.sms_notify_new_ticket, DEFAULT_ADVANCED_SETTINGS.sms_notify_new_ticket),
    sms_notify_status_change: coerceBoolean(input.sms_notify_status_change, DEFAULT_ADVANCED_SETTINGS.sms_notify_status_change),
    sms_notify_reply: coerceBoolean(input.sms_notify_reply, DEFAULT_ADVANCED_SETTINGS.sms_notify_reply),
    sms_notify_resolved: coerceBoolean(input.sms_notify_resolved, DEFAULT_ADVANCED_SETTINGS.sms_notify_resolved),
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

// ─── SMS Phone Preview ────────────────────────────────────────────────────────

function SmsPhonePreview({
  sender,
  language,
  testMessage,
  triggers,
}: {
  sender: string;
  language: string;
  testMessage: string;
  triggers: { new_ticket: boolean; status_change: boolean; reply: boolean; resolved: boolean };
}) {
  const langLabel = { en: 'EN', fr: 'FR', ar: 'AR' }[language] ?? 'EN';

  const MESSAGES: Record<string, { new_ticket: string; status_change: string; reply: string; resolved: string }> = {
    en: {
      new_ticket: `New ticket #1234 created: "Help with account"\nWe'll follow up shortly.`,
      status_change: `Ticket #1234 status updated to "In Progress"`,
      reply: `Agent replied to ticket #1234:\n"Thank you for your patience, we are working on it."`,
      resolved: `Ticket #1234 has been resolved.\nThank you for your trust in ${sender || 'our support'}.`,
    },
    fr: {
      new_ticket: `Nouveau ticket #1234 créé : "Aide avec le compte"\nNous vous suivrons sous peu.`,
      status_change: `Statut du ticket #1234 mis à jour : "En cours"`,
      reply: `Un agent a répondu au ticket #1234 :\n"Merci pour votre patience, nous travaillons sur le problème."`,
      resolved: `Le ticket #1234 a été résolu.\nMerci de votre confiance envers ${sender || 'notre support'}.`,
    },
    ar: {
      new_ticket: `تذكرة جديدة #1234: "مساعدة في الحساب"\nسنقوم بالمتابعة قريبًا.`,
      status_change: `تم تحديث حالة التذكرة #1234 إلى "قيد المعالجة"`,
      reply: `رد الوكيل على التذكرة #1234:\n"نشكرك على صبرك، نحن نعمل على حل المشكلة."`,
      resolved: `تم حل التذكرة #1234.\nنشكرك على ثقتك في ${sender || 'دعمنا'}.`,
    },
  };

  const msg = MESSAGES[language] ?? MESSAGES.en;

  const sampleMessages = [
    triggers.new_ticket && { from: 'system', text: msg.new_ticket },
    triggers.status_change && { from: 'system', text: msg.status_change },
    triggers.reply && { from: 'system', text: msg.reply },
    triggers.resolved && { from: 'system', text: msg.resolved },
    testMessage && { from: 'test', text: testMessage },
  ].filter(Boolean) as { from: string; text: string }[];

  return (
    <div className="relative mx-auto w-[240px]">
      {/* Phone frame */}
      <div className="relative rounded-[2.5rem] border-[3px] border-black bg-background shadow-2xl overflow-hidden">
        {/* Notch */}
        <div className="relative flex items-center justify-center pt-3 pb-2">
          <div className="h-5 w-28 rounded-full bg-black flex items-center justify-center gap-2 px-3">
            <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
            <div className="h-1 w-16 rounded-full bg-white/40" />
          </div>
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between px-6 pb-1 text-[10px] font-medium text-muted-foreground">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <div className="h-2.5 w-4 rounded-sm border border-muted-foreground/40 relative">
              <div className="absolute inset-0.5 rounded-sm bg-muted-foreground/40" />
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="border-y border-border/40 bg-muted/30 px-4 py-2 text-center">
          <p className="text-xs font-semibold text-foreground">{sender || 'L2T'}</p>
          <p className="text-[10px] text-muted-foreground">SMS Notifications <span className="ml-1 rounded bg-muted-foreground/10 px-1 py-0.5 font-mono text-[8px]">{langLabel}</span></p>
        </div>

        {/* Messages */}
        <div className="h-[140px] space-y-2 overflow-y-auto bg-gradient-to-b from-background to-muted/10 p-2.5">
          {sampleMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Smartphone className="mx-auto h-8 w-8 text-muted-foreground/30" />
                <p className="mt-2 text-xs text-muted-foreground/50">Enable triggers or type a test message</p>
              </div>
            </div>
          ) : (
            sampleMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'test' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                    msg.from === 'test'
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : msg.text?.includes('✅')
                      ? 'rounded-bl-md bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : msg.text?.includes('🔄')
                      ? 'rounded-bl-md bg-amber-50 text-amber-800 border border-amber-200'
                      : msg.text?.includes('💬')
                      ? 'rounded-bl-md bg-blue-50 text-blue-800 border border-blue-200'
                      : 'rounded-bl-md bg-muted text-foreground border border-border/50'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat input bar */}
        <div className="border-t border-border/40 bg-muted/20 px-2 py-1.5">
          <div className="flex items-center gap-1.5 rounded-xl bg-muted/60 border border-border/40 px-3 py-2">
            <div className="h-3 w-3 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="h-2.5 flex-1 rounded bg-muted-foreground/10" />
            <div className="h-4 w-4 rounded-md bg-primary/20 flex items-center justify-center">
              <div className="h-2 w-2 rotate-45 border-t-2 border-r-2 border-primary/60" />
            </div>
          </div>
        </div>

        {/* Keyboard */}
        <div className="bg-muted/30 px-1.5 pb-2 pt-1">
          <div className="grid grid-cols-10 gap-1">
            {[
              '1','2','3','4','5','6','7','8','9','0',
              'q','w','e','r','t','y','u','i','o','p',
              'a','s','d','f','g','h','j','k','l','',
              '⇧','z','x','c','v','b','n','m','⌫','',
            ].map((key, i) => (
              <div
                key={i}
                className={`flex items-center justify-center rounded-md text-[9px] font-medium ${
                  key === ''
                    ? ''
                    : key === '⇧' || key === '⌫'
                    ? 'bg-muted-foreground/15 text-muted-foreground col-span-1.5 h-7'
                    : 'bg-background text-foreground/80 border border-border/40 h-7 shadow-sm'
                } ${key === '' ? '' : 'col-span-1'}`}
              >
                {key}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-center">
            <div className="h-6 w-20 rounded-md bg-muted-foreground/15 flex items-center justify-center text-[9px] font-medium text-muted-foreground">
              space
            </div>
          </div>
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pb-2">
          <div className="h-1 w-24 rounded-full bg-muted-foreground/30" />
        </div>
      </div>
    </div>
  );
}

// ─── Email Preview ────────────────────────────────────────────────────────────

function EmailPreview({
  senderName,
  senderEmail,
  triggers,
}: {
  senderName: string;
  senderEmail: string;
  triggers: { new_ticket: boolean; status_change: boolean; assigned: boolean; overdue: boolean; resolved: boolean };
}) {
  return (
    <div className="w-full max-w-[380px]">
      {/* Email client window frame */}
      <div className="rounded-xl border border-border/60 bg-background shadow-2xl overflow-hidden">
        {/* Window title bar */}
        <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className="flex-1 text-center">
            <span className="rounded-md bg-muted/60 px-3 py-0.5 text-[10px] font-medium text-muted-foreground">Mail Client</span>
          </div>
          <div className="w-10" />
        </div>

        {/* Mailbox toolbar */}
        <div className="flex items-center gap-1 border-b border-border/40 bg-muted/10 px-3 py-1.5">
          {['Inbox', 'Sent', 'Drafts'].map((label) => (
            <span key={label} className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${label === 'Inbox' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
              {label}
            </span>
          ))}
          <div className="flex-1" />
          <div className="h-3 w-3 rounded border border-muted-foreground/30 flex items-center justify-center">
            <div className="text-[6px] text-muted-foreground/50">+</div>
          </div>
        </div>

        {/* Email list sidebar */}
        <div className="flex">
          {/* Email list */}
          <div className="w-2/5 border-r border-border/30">
            {[
              triggers.new_ticket && { subject: 'New Ticket #1234', snippet: 'A new ticket has been created...', time: '2m ago', active: true },
              triggers.status_change && { subject: 'Status Update #1234', snippet: 'Ticket status changed to...', time: '15m ago', active: false },
              triggers.assigned && { subject: 'Ticket Assigned #1234', snippet: 'You have been assigned to...', time: '1h ago', active: false },
              triggers.overdue && { subject: 'SLA Alert #1234', snippet: 'Ticket is approaching SLA...', time: '2h ago', active: false },
              triggers.resolved && { subject: 'Ticket Resolved #1234', snippet: 'Ticket has been resolved...', time: '3h ago', active: false },
            ].filter(Boolean).slice(0, 4).map((item: any, i: number) => (
              <div key={i} className={`border-b border-border/20 px-2.5 py-2 ${item.active ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}>
                <p className="truncate text-[11px] font-medium text-foreground">{item.subject}</p>
                <p className="truncate text-[9px] text-muted-foreground">{item.snippet}</p>
                <p className="text-[8px] text-muted-foreground/50">{item.time}</p>
              </div>
            ))}
            {!triggers.new_ticket && !triggers.status_change && !triggers.assigned && !triggers.overdue && !triggers.resolved && (
              <div className="flex items-center justify-center h-20">
                <p className="text-[10px] text-muted-foreground/40">Enable triggers</p>
              </div>
            )}
          </div>

          {/* Email detail */}
          <div className="w-3/5 p-3">
            <div className="space-y-2">
              <div className="h-2 w-3/4 rounded bg-muted-foreground/10" />
              <div className="flex gap-2">
                <div className="h-2 w-1/4 rounded bg-muted-foreground/10" />
                <div className="h-2 w-1/2 rounded bg-muted-foreground/10" />
              </div>
              <div className="pt-2 space-y-1.5">
                <div className="h-1.5 w-full rounded bg-muted-foreground/10" />
                <div className="h-1.5 w-5/6 rounded bg-muted-foreground/10" />
                <div className="h-1.5 w-4/6 rounded bg-muted-foreground/10" />
                <div className="h-1.5 w-3/4 rounded bg-muted-foreground/10" />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-border/20 pt-2">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-medium text-emerald-700">
                  {senderName || 'Support'}
                </span>
                <span className="text-[8px] text-muted-foreground/50">{senderEmail || 'support@example.com'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [runtimeValues, setRuntimeValues] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<AdvancedSettings>({ ...DEFAULT_ADVANCED_SETTINGS });
  const [voiceAgentConfig, setVoiceAgentConfig] = useState<VoiceAgentConfig | null>(null);
  const [savingSection, setSavingSection] = useState<SettingsSection | null>(null);
  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [smsTestMessage, setSmsTestMessage] = useState('');
  const [smsTestSending, setSmsTestSending] = useState(false);
  const [smsTestResult, setSmsTestResult] = useState<{ success: boolean; message: string } | null>(null);
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
    if (score >= 4) return { label: 'Strong', variant: 'success' as const };
    if (score >= 2) return { label: 'Standard', variant: 'default' as const };
    return { label: 'Basic', variant: 'warn' as const };
  }, [settings.min_password_length, settings.password_complexity, settings.require_email_verification, settings.two_factor_auth]);

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
      if (section === 'security') return settingsApi.updateSecurity({ min_password_length: settings.min_password_length, session_timeout: settings.session_timeout, max_login_attempts: settings.max_login_attempts, password_complexity: settings.password_complexity, allow_registration: settings.allow_registration, require_email_verification: settings.require_email_verification, two_factor_auth: settings.two_factor_auth });
      if (section === 'automation') return settingsApi.updateAutomation({ ai_auto_reply_chat_enabled: settings.ai_auto_reply_chat_enabled, ai_auto_reply_whatsapp_enabled: settings.ai_auto_reply_whatsapp_enabled, ai_auto_reply_email_enabled: settings.ai_auto_reply_email_enabled, conversation_sla_autopilot_enabled: settings.conversation_sla_autopilot_enabled, conversation_sla_auto_escalate_minutes_before_breach: settings.conversation_sla_auto_escalate_minutes_before_breach, conversation_sla_auto_assign_enabled: settings.conversation_sla_auto_assign_enabled, conversation_sla_auto_assign_minutes_before_breach: settings.conversation_sla_auto_assign_minutes_before_breach, conversation_sla_autopilot_respect_snooze: settings.conversation_sla_autopilot_respect_snooze });
      return settingsApi.updateNotifications({ mail_mode: settings.mail_mode, gmail_from_email: settings.gmail_from_email, gmail_client_id: settings.gmail_client_id, gmail_client_secret: settings.gmail_client_secret, gmail_refresh_token: settings.gmail_refresh_token, smtp_from_name: settings.smtp_from_name, smtp_from_email: settings.smtp_from_email, smtp_host: settings.smtp_host, smtp_port: settings.smtp_port, smtp_encryption: settings.smtp_encryption, smtp_username: settings.smtp_username, smtp_password: settings.smtp_password, notify_new_ticket: settings.notify_new_ticket, notify_status_change: settings.notify_status_change, notify_assigned: settings.notify_assigned, notify_overdue: settings.notify_overdue, notify_resolved: settings.notify_resolved, sms_api_url: settings.sms_api_url, sms_api_key: settings.sms_api_key, sms_sender: settings.sms_sender, sms_language: settings.sms_language, sms_notify_new_ticket: settings.sms_notify_new_ticket, sms_notify_status_change: settings.sms_notify_status_change, sms_notify_reply: settings.sms_notify_reply, sms_notify_resolved: settings.sms_notify_resolved });
    },
    onMutate: (section) => setSavingSection(section),
    onSuccess: (saved) => {
      setSettings((prev) => ({
        ...normalizeAdvancedSettings(saved),
        sms_api_url: prev.sms_api_url,
        sms_api_key: prev.sms_api_key,
        sms_sender: prev.sms_sender,
        sms_language: prev.sms_language,
        sms_notify_new_ticket: prev.sms_notify_new_ticket,
        sms_notify_status_change: prev.sms_notify_status_change,
        sms_notify_reply: prev.sms_notify_reply,
        sms_notify_resolved: prev.sms_notify_resolved,
      }));
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

  const handleSendTestSms = async () => {
    setSmsTestSending(true);
    setSmsTestResult(null);
    try {
      const result = await apiClient<{ success: boolean; message: string }>('/settings/sms/test', {
        method: 'POST',
        body: JSON.stringify({ phone: smsTestPhone, message: smsTestMessage, language: settings.sms_language }),
      });
      setSmsTestResult(result);
    } catch (error) {
      setSmsTestResult({ success: false, message: normalizeError(error) });
    } finally {
      setSmsTestSending(false);
    }
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
          <h1 className="text-xl font-semibold tracking-tight">{t('common.settings')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.notificationsDesc')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label={t('admin.overrides')} value={runtimeOverrideCount} />
          <StatPill label={t('admin.alerts')} value={`${enabledNotifications}/5`} variant={enabledNotifications > 0 ? 'success' : 'warn'} />
          <StatPill label={t('admin.securityTab')} value={securityStrength.label} variant={securityStrength.variant} />
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
            { value: 'general', icon: Globe2, label: t('admin.generalTab') },
            { value: 'branding', icon: Palette, label: t('admin.brandingTab') },
            { value: 'tickets', icon: Ticket, label: t('admin.ticketsTab') },
            { value: 'security', icon: ShieldCheck, label: t('admin.securityTab') },
            { value: 'notifications', icon: Bell, label: t('admin.notificationsTab') },
            { value: 'automation', icon: Bot, label: t('admin.automationTab') },
            { value: 'system', icon: Settings2, label: t('admin.systemTab') },
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
            title={t('admin.generalInformation')}
            description={t('admin.generalDesc')}
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
              <Field label={t('admin.applicationName')}>
                <Input value={settings.app_name} onChange={(e) => updateSetting('app_name', e.target.value)} placeholder={t('admin.appNamePlaceholder')} />
              </Field>
              <Field label={t('admin.supportEmail')}>
                <Input type="email" value={settings.support_email} onChange={(e) => updateSetting('support_email', e.target.value)} placeholder={t('admin.supportEmailPlaceholder')} />
              </Field>
              <Field label={t('admin.description')} span="full">
                <Textarea rows={3} value={settings.description} onChange={(e) => updateSetting('description', e.target.value)} placeholder={t('admin.descriptionPlaceholder')} className="resize-none" />
              </Field>
              <Field label={t('admin.locale')}>
                <Select value={settings.locale} onValueChange={(v) => updateSetting('locale', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t('admin.english')}</SelectItem>
                    <SelectItem value="fr">{t('admin.french')}</SelectItem>
                    <SelectItem value="ar">{t('common.arabic')}</SelectItem>
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
            title={t('admin.brandingTheme')}
            description={t('admin.brandingDesc')}
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
              <Field label={t('admin.ticketLabel')} hint="Used throughout the UI in place of 'Ticket'.">
                <Input value={settings.ticket_label} onChange={(e) => updateSetting('ticket_label', e.target.value)} placeholder={t('admin.ticketPlaceholder')} />
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
            title={t('admin.ticketRules')}
            description={t('admin.ticketsDesc')}
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
                <ToggleRow id="auto-assignment" label={t('admin.autoAssignment')} description={t('admin.autoAssignmentDesc')} checked={settings.auto_assignment} onCheckedChange={(v) => updateSetting('auto_assignment', v)} />
                <ToggleRow id="allow-client-close" label={t('admin.clientCanClose')} description={t('admin.clientCanCloseDesc')} checked={settings.allow_client_close} onCheckedChange={(v) => updateSetting('allow_client_close', v)} />
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
            title={t('admin.securityAccessPolicy')}
            description={t('admin.securityDesc')}
            icon={Lock}
            footer={
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t('admin.currentStrength')}&nbsp;
                  <span className={securityStrength.variant === 'success' ? 'text-emerald-600 font-semibold' : securityStrength.variant === 'warn' ? 'text-amber-600 font-semibold' : 'font-semibold'}>
                    {securityStrength.label}
                  </span>
                </div>
                <SaveButton
                  section="security"
                  currentlySaving={savingSection}
                  isPending={persistSettingsMut.isPending}
                  onClick={() => saveAdvanced('security')}
                  label={t('admin.saveSecurity')}
                />
              </div>
            }
          >
            <FieldGroup className="md:grid-cols-3">
                <Field label={t('admin.minPasswordLength')}>
                  <Input type="number" min={6} max={64} value={settings.min_password_length} onChange={(e) => updateSetting('min_password_length', coerceNumber(e.target.value, settings.min_password_length, 6, 64))} />
                </Field>
                <Field label={t('admin.sessionTimeout')}>
                  <Input type="number" min={5} max={1440} value={settings.session_timeout} onChange={(e) => updateSetting('session_timeout', coerceNumber(e.target.value, settings.session_timeout, 5, 1440))} />
                </Field>
                <Field label={t('admin.maxLoginAttempts')}>
                  <Input type="number" min={3} max={50} value={settings.max_login_attempts} onChange={(e) => updateSetting('max_login_attempts', coerceNumber(e.target.value, settings.max_login_attempts, 3, 50))} />
                </Field>
            </FieldGroup>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow id="password-complexity" label={t('admin.passwordComplexity')} description={t('admin.passwordComplexityDesc')} checked={settings.password_complexity} onCheckedChange={(v) => updateSetting('password_complexity', v)} />
              <ToggleRow id="allow-registration" label={t('admin.allowClientRegistration')} description={t('admin.allowClientRegistrationDesc')} checked={settings.allow_registration} onCheckedChange={(v) => updateSetting('allow_registration', v)} />
              <ToggleRow id="require-email-verification" label={t('admin.emailVerification')} description={t('admin.emailVerificationDesc')} checked={settings.require_email_verification} onCheckedChange={(v) => updateSetting('require_email_verification', v)} />
              <ToggleRow id="two-factor-auth" label={t('admin.twoFa')} description={t('admin.twoFaDesc')} checked={settings.two_factor_auth} onCheckedChange={(v) => updateSetting('two_factor_auth', v)} />
            </div>
          </SectionCard>
        </TabsContent>

        {/* ───────── NOTIFICATIONS ───────── */}
        <TabsContent value="notifications" className="space-y-4">
          <SectionCard
            title={t('admin.emailNotifications')}
            description={t('admin.notificationsDesc')}
            icon={Mail}
            footer={
              <SaveButton
                section="notifications"
                currentlySaving={savingSection}
                isPending={persistSettingsMut.isPending}
                onClick={() => saveAdvanced('notifications')}
                label={t('admin.saveNotifications')}
              />
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              {/* ── Left: Tabs (Config / Triggers) ── */}
              <Tabs defaultValue="config" className="w-full">
                <TabsList className="grid w-full grid-cols-2 rounded-lg">
                  <TabsTrigger value="config" className="text-xs">{t('admin.emailConfigTab')}</TabsTrigger>
                  <TabsTrigger value="triggers" className="text-xs">{t('admin.emailTriggersTab')}</TabsTrigger>
                </TabsList>

                <TabsContent value="config" className="mt-4 space-y-4">
                  {/* Mail mode switch */}
                  <div className="flex items-center gap-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">{t('admin.mailMode')}</Label>
                    <div className="flex rounded-lg border border-border/60 overflow-hidden">
                      {(['gmail', 'smtp'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => updateSetting('mail_mode', mode)}
                          className={`px-4 py-1.5 text-xs font-medium transition-colors ${settings.mail_mode === mode ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-muted'}`}
                        >
                          {mode === 'gmail' ? t('admin.mailGmail') : t('admin.mailSmtp')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {settings.mail_mode === 'gmail' ? (
                    <FieldGroup className="md:grid-cols-1">
                      <Field label={t('admin.gmailSenderEmail')}>
                        <Input value={settings.gmail_from_email} onChange={(e) => updateSetting('gmail_from_email', e.target.value)} placeholder="support@gmail.com" />
                      </Field>
                      <Field label={t('admin.senderName')}>
                        <Input value={settings.smtp_from_name} onChange={(e) => updateSetting('smtp_from_name', e.target.value)} placeholder={t('admin.senderPlaceholder')} />
                      </Field>
                      <Field label="Gmail Client ID">
                        <Input value={settings.gmail_client_id} onChange={(e) => updateSetting('gmail_client_id', e.target.value)} placeholder={t('admin.googleClientIdPlaceholder')} />
                      </Field>
                      <Field label="Gmail Client Secret">
                        <Input type="password" value={settings.gmail_client_secret} onChange={(e) => updateSetting('gmail_client_secret', e.target.value)} placeholder={t('admin.clientSecretPlaceholder')} />
                      </Field>
                      <Field label="Gmail Refresh Token" span="full">
                        <Input type="password" value={settings.gmail_refresh_token} onChange={(e) => updateSetting('gmail_refresh_token', e.target.value)} placeholder={t('admin.refreshTokenPlaceholder')} />
                      </Field>
                    </FieldGroup>
                  ) : (
                    <FieldGroup className="md:grid-cols-1">
                      <Field label={t('admin.gmailSenderEmail')}>
                        <Input value={settings.smtp_from_email} onChange={(e) => updateSetting('smtp_from_email', e.target.value)} placeholder={t('admin.supportEmailPlaceholder')} />
                      </Field>
                      <Field label={t('admin.senderName')}>
                        <Input value={settings.smtp_from_name} onChange={(e) => updateSetting('smtp_from_name', e.target.value)} />
                      </Field>
                      <Field label={t('admin.smtpHost')}>
                        <Input value={settings.smtp_host} onChange={(e) => updateSetting('smtp_host', e.target.value)} />
                      </Field>
                      <Field label={t('admin.smtpPort')}>
                        <Input type="number" min={1} max={65535} value={settings.smtp_port} onChange={(e) => updateSetting('smtp_port', coerceNumber(e.target.value, settings.smtp_port, 1, 65535))} />
                      </Field>
                      <Field label={t('admin.smtpEncryption')}>
                        <Select value={settings.smtp_encryption} onValueChange={(v) => updateSetting('smtp_encryption', v as SmtpEncryption)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tls">TLS</SelectItem>
                            <SelectItem value="ssl">SSL</SelectItem>
                            <SelectItem value="none">{t('admin.noEncryption') || 'None'}</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={t('admin.smtpUsername')}>
                        <Input value={settings.smtp_username} onChange={(e) => updateSetting('smtp_username', e.target.value)} />
                      </Field>
                      <Field label={t('admin.smtpPassword')} span="full">
                        <Input type="password" value={settings.smtp_password} onChange={(e) => updateSetting('smtp_password', e.target.value)} placeholder={t('admin.refreshTokenNote')} />
                      </Field>
                    </FieldGroup>
                  )}
                </TabsContent>

                <TabsContent value="triggers" className="mt-4 space-y-2.5">
                  <ToggleRow id="notify-new-ticket" label={t('admin.newTickets')} checked={settings.notify_new_ticket} onCheckedChange={(v) => updateSetting('notify_new_ticket', v)} />
                  <ToggleRow id="notify-status-change" label={t('admin.statusChanges')} checked={settings.notify_status_change} onCheckedChange={(v) => updateSetting('notify_status_change', v)} />
                  <ToggleRow id="notify-assigned" label={t('admin.assignment')} checked={settings.notify_assigned} onCheckedChange={(v) => updateSetting('notify_assigned', v)} />
                  <ToggleRow id="notify-overdue" label={t('admin.overdueSla')} checked={settings.notify_overdue} onCheckedChange={(v) => updateSetting('notify_overdue', v)} />
                  <ToggleRow id="notify-resolved" label={t('admin.resolution')} checked={settings.notify_resolved} onCheckedChange={(v) => updateSetting('notify_resolved', v)} />
                </TabsContent>
              </Tabs>

              {/* ── Right: Email Preview ── */}
              <div className="flex items-start justify-center lg:sticky lg:top-6">
                <EmailPreview
                  senderName={settings.smtp_from_name || 'Support Team'}
                  senderEmail={settings.mail_mode === 'gmail' ? settings.gmail_from_email : settings.smtp_from_email}
                  triggers={{
                    new_ticket: settings.notify_new_ticket,
                    status_change: settings.notify_status_change,
                    assigned: settings.notify_assigned,
                    overdue: settings.notify_overdue,
                    resolved: settings.notify_resolved,
                  }}
                />
              </div>
            </div>
          </SectionCard>

          {/* ── SMS Notifications ── */}
          <SectionCard
            title={t('admin.smsNotifications')}
            description={t('admin.smsNotificationsDesc')}
            icon={Smartphone}
            footer={
              <SaveButton
                section="notifications"
                currentlySaving={savingSection}
                isPending={persistSettingsMut.isPending}
                onClick={() => saveAdvanced('notifications')}
                label={t('admin.saveSms')}
              />
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              {/* ── Left: Tabs (Config / Triggers / Test SMS) ── */}
              <Tabs defaultValue="config" className="w-full">
                <TabsList className="grid w-full grid-cols-3 rounded-lg">
                  <TabsTrigger value="config" className="text-xs">{t('admin.smsConfigTab')}</TabsTrigger>
                  <TabsTrigger value="triggers" className="text-xs">{t('admin.smsTriggersTab')}</TabsTrigger>
                  <TabsTrigger value="test" className="text-xs">{t('admin.smsTestTab')}</TabsTrigger>
                </TabsList>

                <TabsContent value="config" className="mt-4 space-y-4">
                  <FieldGroup className="md:grid-cols-1">
                    <Field label={t('admin.smsApiUrl')}>
                      <Input
                        value={settings.sms_api_url}
                        onChange={(e) => updateSetting('sms_api_url', e.target.value)}
                        placeholder="https://mystudents.tunisiesms.tn/api/sms"
                      />
                    </Field>
                    <Field label={t('admin.smsApiKey')}>
                      <Input
                        type="password"
                        value={settings.sms_api_key}
                        onChange={(e) => updateSetting('sms_api_key', e.target.value)}
                        placeholder="Enter your SMS provider API key"
                      />
                    </Field>
                    <Field label={t('admin.smsSender')} hint={t('admin.smsSenderHint')}>
                      <Input
                        value={settings.sms_sender}
                        onChange={(e) => updateSetting('sms_sender', e.target.value.slice(0, 11))}
                        placeholder="L2T"
                        maxLength={11}
                      />
                    </Field>
                  </FieldGroup>
                </TabsContent>

                <TabsContent value="triggers" className="mt-4 space-y-2.5">
                  <ToggleRow
                    id="sms-notify-new-ticket"
                    label={t('admin.smsNewTicket')}
                    description={t('admin.smsNewTicketDesc')}
                    checked={settings.sms_notify_new_ticket}
                    onCheckedChange={(v) => updateSetting('sms_notify_new_ticket', v)}
                  />
                  <ToggleRow
                    id="sms-notify-status-change"
                    label={t('admin.smsStatusChange')}
                    description={t('admin.smsStatusChangeDesc')}
                    checked={settings.sms_notify_status_change}
                    onCheckedChange={(v) => updateSetting('sms_notify_status_change', v)}
                  />
                  <ToggleRow
                    id="sms-notify-reply"
                    label={t('admin.smsAdminReply')}
                    description={t('admin.smsAdminReplyDesc')}
                    checked={settings.sms_notify_reply}
                    onCheckedChange={(v) => updateSetting('sms_notify_reply', v)}
                  />
                  <ToggleRow
                    id="sms-notify-resolved"
                    label={t('admin.smsResolved')}
                    description={t('admin.smsResolvedDesc')}
                    checked={settings.sms_notify_resolved}
                    onCheckedChange={(v) => updateSetting('sms_notify_resolved', v)}
                  />
                </TabsContent>

                <TabsContent value="test" className="mt-4 space-y-3">
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                    <Field label={t('admin.smsTestPhone')} hint={t('admin.smsTestPhoneHint')}>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded-md border border-input bg-muted px-2.5 py-1.5 text-xs font-mono text-muted-foreground">+216</span>
                        <Input
                          value={smsTestPhone}
                          onChange={(e) => setSmsTestPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                          placeholder="20123456"
                          maxLength={8}
                        />
                      </div>
                    </Field>
                    <Field label={t('admin.smsTestMessage')} hint={`${smsTestMessage.length}/160 ${t('admin.characters')}`}>
                      <Textarea
                        rows={3}
                        value={smsTestMessage}
                        onChange={(e) => setSmsTestMessage(e.target.value.slice(0, 160))}
                        placeholder={t('admin.smsTestTab') + '...'}
                        className="resize-none"
                      />
                    </Field>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 w-full"
                      onClick={handleSendTestSms}
                      disabled={smsTestSending || !smsTestPhone || smsTestPhone.length < 8 || !smsTestMessage}
                    >
                      {smsTestSending ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('admin.smsSending')}</>
                      ) : (
                        <><MessageSquare className="h-3.5 w-3.5" />{t('admin.smsTestSend')}</>
                      )}
                    </Button>
                    {smsTestResult && (
                      <div className={`flex items-center gap-2 text-xs ${smsTestResult.success ? 'text-emerald-600' : 'text-destructive'}`}>
                        {smsTestResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        {smsTestResult.message}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* ── Right: Mobile Preview ── */}
              <div className="flex items-start justify-center lg:sticky lg:top-6">
                <SmsPhonePreview
                  sender={settings.sms_sender || 'L2T'}
                  language={settings.sms_language}
                  testMessage={smsTestMessage}
                  triggers={{
                    new_ticket: settings.sms_notify_new_ticket,
                    status_change: settings.sms_notify_status_change,
                    reply: settings.sms_notify_reply,
                    resolved: settings.sms_notify_resolved,
                  }}
                />
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ───────── AUTOMATION ───────── */}
        <TabsContent value="automation" className="space-y-4">
          <SectionCard
            title={t('admin.aiAutoReply')}
            description={t('admin.autoReplyDesc')}
            icon={Zap}
          >
            <div className="grid gap-2.5 md:grid-cols-3">
              <ToggleRow id="ai-auto-reply-chat" label="Chat conversations" checked={settings.ai_auto_reply_chat_enabled} onCheckedChange={(v) => updateSetting('ai_auto_reply_chat_enabled', v)} />
              <ToggleRow id="ai-auto-reply-whatsapp" label="WhatsApp" checked={settings.ai_auto_reply_whatsapp_enabled} onCheckedChange={(v) => updateSetting('ai_auto_reply_whatsapp_enabled', v)} />
              <ToggleRow id="ai-auto-reply-email" label="Email" checked={settings.ai_auto_reply_email_enabled} onCheckedChange={(v) => updateSetting('ai_auto_reply_email_enabled', v)} />
            </div>
          </SectionCard>

          <SectionCard
            title={t('admin.slaAutopilot')}
            description={t('admin.slaDesc')}
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
            <SectionCard title={t('admin.systemInformation')} icon={Server}>
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
            <SectionCard title={t('admin.adminActions')} description={t('admin.systemDesc')} icon={Settings2}>
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
            title={t('admin.frontendRuntimeOverrides')}
            description={t('admin.runtimeDesc')}
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
            title={t('admin.voiceAgentConfiguration')}
            description={t('admin.voiceDesc')}
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
          <SectionCard title={t('admin.runtimeEnvExample')} icon={Server}>
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