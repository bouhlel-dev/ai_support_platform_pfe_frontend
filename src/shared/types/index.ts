// Auth
export interface LoginRequest { email: string; password: string }
export interface RegisterRequest {
  email: string;
  password: string;
  // Backend expects `full_name` (see app/schemas/user.py)
  full_name: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  two_factor_required?: boolean;
  temp_token?: string | null;
}

export interface VerifyOtpRequest {
  temp_token: string;
  otp_code: string;
}

export interface SetupTwoFactorResponse {
  secret: string;
  qr_code_url: string;
}

export interface VerifyTwoFactorSetupRequest {
  otp_code: string;
}
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'client' | 'agent' | 'admin';
  can_reply_conversations: boolean;
  can_reply_whatsapp: boolean;
  is_vip?: boolean;
  full_name?: string;
  phone_number?: string | null;
  teams_email?: string | null;
  teams_webhook_url?: string | null;
  timezone?: string;
  locale?: string;
  profile_picture_url?: string | null;
  must_change_password?: boolean;
  two_factor_enabled?: boolean;
  two_factor_auth?: boolean;
}

export interface PublicAuthSettings {
  app_name: string;
  description: string;
  allow_registration: boolean;
  min_password_length: number;
  password_complexity: boolean;
}

// Tickets
export type TicketStatus = 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';
export interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  // Backend: ChannelType (e.g. TICKET, EMAIL, WHATSAPP, CALL)
  channel_source: string;
  escalation_flag: boolean;
  creator_id: string;
  assigned_agent_id?: string;
  source_email_id?: string;
  conversation_id?: string;
  source_voice_call_id?: string | null;
  resolution_note?: string | null;
  solved_by_id?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}
export interface TicketListResponse { tickets: Ticket[]; total: number }

export interface TicketTotalsResponse {
  total: number;
  open: number;
  in_progress: number;
  escalated: number;
  resolved: number;
  closed: number;
}

export interface TicketClassifyResult {
  available: boolean;
  category?: string | null;
  category_label?: string | null;
  priority?: number | null;
  priority_label?: string | null;
  urgency?: number | null;
  confidence?: number | null;
  solutions: string[];
}

export interface TicketReformulateResult {
  available: boolean;
  reformulated: string;
}

export interface SimilarTicket {
  id?: string;
  title: string;
  description?: string | null;
  solution?: string | null;
  source: string;
}

export interface SimilarTicketsResult {
  tickets: SimilarTicket[];
}

// Conversations
export interface Conversation {
  id: string;
  user_id: string;
  channel: string;
  status: string;
  subject?: string | null;
  is_pinned?: boolean;
  ai_auto_reply_enabled?: boolean;
  ai_auto_reply_paused_until?: string | null;
  created_at: string;
  updated_at: string;
}
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_internal: boolean;
  is_read: boolean;
  attachment_filename?: string | null;
  attachment_content_type?: string | null;
  attachment_size?: number | null;
  created_at: string;
}
export interface ConversationStreamMeta {
  conversation: Conversation;
  user_message: Message;
  created_conversation: boolean;
}
export interface ConversationStreamStatus {
  phase: string;
}
export interface ConversationStreamToken {
  delta: string;
}
export interface ConversationStreamDone {
  assistant_message: Message | null;
  auto_reply_enabled?: boolean;
  auto_reply_block_reason?: 'channel_disabled' | 'conversation_disabled' | 'pause_active' | null;
  auto_reply_paused_until?: string | null;
}
export interface ConversationStreamError {
  detail: string;
}

export type ConversationResolutionState =
  | 'unresolved'
  | 'in_progress'
  | 'partially_resolved'
  | 'resolved'
  | 'unknown';

export type ConversationCustomerSentiment =
  | 'calm'
  | 'frustrated'
  | 'urgent'
  | 'neutral'
  | 'unknown';

export interface ConversationSummary {
  conversation_id: string;
  message_count: number;
  provider: string;
  model: string;
  problem_summary: string;
  resolution_state: ConversationResolutionState;
  resolution_description: string;
  next_action: string;
  customer_sentiment: ConversationCustomerSentiment;
  language?: string | null;
  generated_at: string;
}

export interface ConversationAgentReplySuspension {
  conversation_id: string;
  agent_id: string;
  suspended: boolean;
  reason?: string | null;
  suspended_by_id?: string | null;
  updated_at?: string | null;
}

export interface ConversationAutoReplyPolicy {
  conversation_id: string;
  channel: string;
  channel_auto_reply_enabled: boolean;
  ai_auto_reply_enabled: boolean;
  ai_auto_reply_paused_until?: string | null;
  pause_active?: boolean;
  effective_ai_auto_reply_enabled?: boolean;
  block_reason?: 'channel_disabled' | 'conversation_disabled' | 'pause_active' | null;
  assisted_draft_available?: boolean;
  updated_at: string;
}

export interface ConversationAssistedDraft {
  conversation_id: string;
  source_message_id: string;
  draft: string;
  language?: string | null;
  generated_at: string;
}

export type ConversationAiJobType = 'summary' | 'assisted_draft';
export type ConversationAiJobStatus = 'queued' | 'started' | 'succeeded' | 'failed';

export interface ConversationAiJobQueued {
  job_id: string;
  job_type: ConversationAiJobType;
  status: 'queued';
}

export interface ConversationSummaryJobStatus {
  job_id: string;
  job_type: 'summary';
  status: ConversationAiJobStatus;
  summary?: ConversationSummary | null;
  error?: string | null;
}

export interface ConversationAssistedDraftJobStatus {
  job_id: string;
  job_type: 'assisted_draft';
  status: ConversationAiJobStatus;
  assisted_draft?: ConversationAssistedDraft | null;
  error?: string | null;
}

export type ConversationPlaybookTriggerKey =
  | 'pause_active_too_long'
  | 'conversation_toggle_off'
  | 'high_risk_intent'
  | 'no_agent_reply_within_sla'
  | 'vip_customer';

export interface ConversationPlaybookTrigger {
  key: ConversationPlaybookTriggerKey;
  reason: string;
  meta: Record<string, unknown>;
}

export type ConversationSlaRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ConversationSlaPredictor {
  conversation_id: string;
  channel: string;
  pending_customer_message_id?: string | null;
  pending_customer_message_at?: string | null;
  latest_agent_reply_at?: string | null;
  reply_due_at?: string | null;
  seconds_remaining?: number | null;
  risk_level: ConversationSlaRiskLevel;
  at_risk: boolean;
  breached: boolean;
  snoozed: boolean;
  snoozed_until?: string | null;
  triggers: ConversationPlaybookTrigger[];
  recommended_actions: Array<'escalate' | 'assign' | 'snooze'>;
  escalation_ticket_id?: string | null;
  escalation_ticket_priority?: TicketPriority | null;
  generated_at: string;
}

export interface ConversationSlaActionResult {
  conversation_id: string;
  action: 'escalate' | 'assign' | 'snooze';
  success: boolean;
  ticket_id?: string | null;
  assigned_agent_id?: string | null;
  snoozed_until?: string | null;
  predictor: ConversationSlaPredictor;
}

export interface ConversationSnippet {
  id: string;
  title: string;
  body: string;
  description?: string | null;
  shortcut?: string | null;
  channel?: string | null;
  is_active: boolean;
  created_by_id?: string | null;
  updated_by_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationSnippetListResponse {
  snippets: ConversationSnippet[];
  total: number;
}

// Email
export interface Email {
  id: string;
  sender_address: string;
  recipient_address: string;
  subject: string;
  body: string;
  status: string;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  is_outbound: boolean;
  is_read: boolean;
  is_starred: boolean;
  labels: string[];
  in_reply_to_id?: string | null;
  replied_by_id?: string | null;
  created_at: string;
}

export type EmailMailboxFolder = 'inbox' | 'sent' | 'all';

export interface EmailListResponse {
  emails: Email[];
  total: number;
}

export interface EmailReplyRequest {
  body: string;
  used_assisted_draft?: boolean;
  assisted_draft_edited?: boolean;
  assisted_draft_generated_at?: string;
}

export interface EmailAssistedDraftResponse {
  original_email_id: string;
  draft: string;
  language?: string | null;
  generated_at: string;
}

export interface EmailComposeRequest {
  recipient: string;
  subject: string;
  body: string;
  labels?: string[];
}

export interface EmailComposeResponse {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  sent_at: string;
}

export interface EmailFlagUpdateRequest {
  is_read?: boolean;
  is_starred?: boolean;
  labels?: string[];
}

export type EmailBulkAction =
  | 'mark_read'
  | 'mark_unread'
  | 'star'
  | 'unstar'
  | 'add_label'
  | 'remove_label'
  | 'clear_labels';

export interface EmailBulkActionRequest {
  email_ids: string[];
  action: EmailBulkAction;
  label?: string;
}

export interface EmailBulkActionResponse {
  action: EmailBulkAction;
  updated: number;
}

export interface EmailReplyResponse {
  id: string;
  original_email_id: string;
  recipient: string;
  subject: string;
  body: string;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  sent_at: string;
}

export interface GmailAuthURL {
  authorization_url: string;
}

export interface GmailStatus {
  connected: boolean;
  gmail_address?: string | null;
  is_active: boolean;
  last_synced?: string | null;
}

export interface EmailDeliveryStatus {
  mail_mode: MailMode;
  ready: boolean;
  gmail_connected: boolean;
  gmail_address?: string | null;
  gmail_last_synced?: string | null;
  smtp_ready: boolean;
  smtp_sender_email?: string | null;
  smtp_missing_fields: string[];
}

export interface GmailSyncResult {
  emails_fetched: number;
  emails_ingested: number;
  errors: number;
}

// WhatsApp
export interface WhatsAppStatus {
  connected: boolean;
  provider: string;
}

export interface WhatsAppInboxConversation {
  id: string;
  user_id: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  subject?: string | null;
  status: string;
  unread_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppInbox {
  conversations: WhatsAppInboxConversation[];
  total: number;
}

export interface WhatsAppThreadMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string | null;
  sender_phone?: string | null;
  direction?: 'inbound' | 'outbound';
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface WhatsAppConversationDetail {
  id: string;
  user_id: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  subject?: string | null;
  status: string;
  messages: WhatsAppThreadMessage[];
  total_messages: number;
}

export interface WhatsAppMarkReadResult {
  status: string;
  conversation_id: string;
  messages_marked_read: number;
}

export type WhatsAppResolutionState =
  | 'unresolved'
  | 'in_progress'
  | 'partially_resolved'
  | 'resolved'
  | 'unknown';

export type WhatsAppCustomerSentiment =
  | 'calm'
  | 'frustrated'
  | 'urgent'
  | 'neutral'
  | 'unknown';

export interface WhatsAppConversationSummary {
  conversation_id: string;
  message_count: number;
  provider: string;
  model: string;
  problem_summary: string;
  resolution_state: WhatsAppResolutionState;
  resolution_description: string;
  next_action: string;
  customer_sentiment: WhatsAppCustomerSentiment;
  language?: string | null;
  generated_at: string;
}

// Decision Engine
export interface DecisionResult {
  id?: string;
  ticket_id?: string;
  outcome: string;
  confidence: number;
  confidence_level?: string;
  intent_category?: string;
  risk_score?: number;
  risk_level: "low" | "medium" | "high" | "critical";
  matched_rules: string[];
  reasoning: string;
  response_suggestions?: string[];
  suggested_priority?: string;
  suggested_agent_name?: string | null;
  escalation_summary?: string | null;
  created_at?: string;
}

export interface DecisionEngineConfig {
  confidence_high_threshold: number;
  confidence_medium_threshold: number;
  risk_critical_threshold: number;
  risk_high_threshold: number;
  risk_medium_threshold: number;
  low_confidence_risk_boost: number;
  medium_confidence_risk_boost: number;
  enforce_security_escalation: boolean;
  enforce_critical_escalation: boolean;
  low_confidence_general_suggest: boolean;
}

export interface DecisionOutcomeDoc {
  outcome: string;
  title: string;
  description: string;
  operator_guidance: string;
}

export interface DecisionMatrixRow {
  confidence_level: string;
  risk_level: string;
  category: string;
  outcome: string;
  matched_rule: string;
  notes: string;
}

export interface DecisionOutcomeDocs {
  outcomes: DecisionOutcomeDoc[];
  matrix: DecisionMatrixRow[];
}

export interface DecisionStats {
  total_decisions: number;
  auto_resolved: number;
  escalated: number;
  avg_confidence: number;
  avg_risk?: number;
  confidence_distribution?: { range: string; count: number }[];
  risk_distribution?: { level: string; count: number }[];
  decisions_by_category?: Record<string, number>;
  decisions_by_outcome?: Record<string, number>;
  escalation_rate?: number;
}

// RAG
export interface RagQuery { query: string; channel?: string; tone?: string; top_k?: number; language?: string }
export interface RagResponse { answer: string; sources: { title: string; content: string; score: number }[] }
export interface RagProviderStatus { provider: string; status: string; model?: string }
export type RagArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type RagArticleCategory =
  | 'TECHNICAL'
  | 'BILLING'
  | 'ACCOUNT'
  | 'GENERAL'
  | 'SECURITY'
  | 'TROUBLESHOOTING'
  | 'FAQ'
  | 'POLICY'
  | 'ONBOARDING'
  | 'FEATURE_GUIDE'

export interface RagArticleSummary {
  id: string
  title: string
  category: RagArticleCategory
  status: RagArticleStatus
  language: string
  is_indexed: boolean
  chunk_count: number
  tags: string[]
  created_at: string
  updated_at: string
}

export interface RagArticleListResponse {
  items: RagArticleSummary[]
  total: number
  skip: number
  limit: number
}

export interface RagArticle {
  id: string
  title: string
  content: string
  summary?: string | null
  category: RagArticleCategory
  status: RagArticleStatus
  tags: string[]
  source?: string | null
  language: string
  metadata_extra?: Record<string, unknown> | null
  is_indexed: boolean
  chunk_count: number
  total_tokens: number
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export interface RagArticleCreateRequest {
  title: string
  content: string
  summary?: string
  category: RagArticleCategory
  tags?: string[]
  source?: string
  language?: string
  metadata_extra?: Record<string, unknown>
  auto_index?: boolean
}

export interface RagArticleListParams {
  skip?: number
  limit?: number
  category?: RagArticleCategory
  status?: RagArticleStatus
  language?: string
  search?: string
}

export interface RagIndexArticleResponse {
  article_id: string
  chunks_created: number
  total_tokens: number
  status: string
}

export interface RagPdfFileInfo {
  filename: string
  size_bytes: number
  size_human: string
}

export interface RagPdfListResponse {
  directory: string
  files: RagPdfFileInfo[]
  total_files: number
}

export interface RagPdfUploadResponse {
  filename: string
  size_bytes: number
  message: string
}

export interface RagPdfIngestRequest {
  filename: string
  category?: RagArticleCategory
  language?: string
  tags?: string[]
  auto_publish?: boolean
  auto_index?: boolean
}

export interface RagPdfIngestResponse {
  filename: string
  article_id: string
  title: string
  page_count: number
  total_words: number
  chunks_created: number
  total_tokens: number
  status: string
  is_published: boolean
}

export interface RagPdfBulkIngestRequest {
  category?: RagArticleCategory
  language?: string
  tags?: string[]
  auto_publish?: boolean
  auto_index?: boolean
  skip_existing?: boolean
}

export interface RagPdfBulkIngestResponse {
  total_files: number
  ingested: number
  skipped: number
  failed: number
  results: RagPdfIngestResponse[]
  errors: Array<Record<string, unknown>>
}

// Visual AI
export interface ScreenshotAnalysis {
  id: string;
  caption: string;
  ocr_text: string;
  labels: string[];
  elements: number;
  guidance: string[];
  gaps?: string[];
  provider?: string;
  confidence?: number;
  processing_ms?: number;
  ui_elements?: Array<{
    type?: string;
    label?: string;
    confidence?: number;
    bbox?: number[];
    text?: string;
  }>;
  regions?: Array<{
    description?: string;
    bbox?: number[];
  }>;
  raw_result?: unknown;
}
export interface ReferenceScreen {
  id: string;
  name: string;
  key: string;
  screen_key?: string;
  description?: string | null;
  file_path?: string;
  expected_elements?: Array<Record<string, unknown>> | null;
  expected_ocr_text?: string | null;
  created_at: string;
  updated_at?: string;
  image_url?: string;
}

// Screenshare
export interface ScreenshareRequest {
  consent: boolean;
  target_fps: number;
  // Frames mode only (optional; backend defaults to 8.0)
  source_fps?: number;
  // Visual AI provider override (backend form field: `provider`).
  // Accepts `gemini` as an alias for the Google/Gemini visual provider.
  provider?: string;
  reference_key?: string;
  use_gemini_embeddings?: boolean;
}

export interface ScreenshareResult {
  source_fps: number;
  target_fps: number;
  uploaded_frames: number;
  processed_frames: number;

  embedding_backend: string;
  embedding_dimension: number;
  avg_transition_score: number;
  max_transition_score: number;

  reference_similarity?: number;
  final_frame: {
    provider: string;
    caption: string;
    ocr_text_preview: string;
    labels: string[];
    element_count: number;
  };
  assistance_hints: string[];
}

export interface ScreenshareRealtimeChunkResult extends ScreenshareResult {
  session_id: string;
  chunk_index: number;
}

export interface TroubleshootingWizardRequest {
  goal: string;
  issue_summary?: string;
  observed_screen_caption?: string;
  observed_text?: string;
  user_actions_attempted?: string[];
  context_hints?: string[];
  max_steps?: number;
}

export interface TroubleshootingWizardStep {
  step_number: number;
  title: string;
  why: string;
  instructions: string[];
  expected_signal: string;
  if_not_seen: string;
}

export interface TroubleshootingWizardResponse {
  issue_summary: string;
  diagnosis: string;
  risk_level: 'low' | 'medium' | 'high';
  estimated_time_minutes: number;
  steps: TroubleshootingWizardStep[];
  escalation_hint: string;
  provider: string;
  model: string;
  generated_at: string;
}

// Escalations / Human-in-the-loop
export interface EscalationConversationEvent {
  sender_id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface EscalationPreviousDecision {
  id?: string;
  ticket_id?: string;
  decision_outcome?: string;
  confidence_score?: number;
  risk_level?: string;
  reasoning?: string;
  matched_rules?: Record<string, unknown> | null;
  created_at?: string;
}

export interface EscalationPackage {
  ticket_id: string;
  ticket_subject: string;
  ticket_description: string;
  intent_category: string;
  confidence_score: number;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  conversation_history: EscalationConversationEvent[];
  previous_decisions: EscalationPreviousDecision[];
  summary: string;
  recommended_actions: string[];
}

export interface DecisionSuggestionsResponse {
  ticket_id: string;
  intent_category: string;
  suggestions: string[];
  confidence: number;
}

// Voice Call Logs
export interface VoiceCallLog {
  id: string;
  room_name: string;
  room_sid?: string | null;
  transcript?: string | null;
  audio_file_path?: string | null;
  duration_seconds?: number | null;
  started_at: string;
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
}
export interface VoiceCallLogListResponse {
  items: VoiceCallLog[];
  total: number;
  skip: number;
  limit: number;
}

export interface VoiceCallActionItem {
  title: string;
  owner: 'agent' | 'client' | 'system';
  priority: 'low' | 'medium' | 'high';
}

export interface VoiceCallPostCallSummary {
  call_id: string;
  room_name: string;
  provider: string;
  model: string;
  summary: string;
  customer_issue: string;
  resolution_status: 'unresolved' | 'in_progress' | 'resolved' | 'unknown';
  follow_up_recommendation: string;
  action_items: VoiceCallActionItem[];
  ticket_subject_suggestion: string;
  ticket_description_suggestion: string;
  generated_at: string;
}

export interface VoiceCallTicketLinkRequest {
  ticket_id?: string;
  subject?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface VoiceCallTicketLinkResponse {
  call_id: string;
  ticket_id: string;
  ticket_subject: string;
  link_type: 'created' | 'attached';
  source_voice_call_id: string;
}

// Admin user management
export type ManagedUserRole = 'ADMIN' | 'AGENT' | 'CLIENT';
export type ManagedUserStatus = 'ACTIVE' | 'SUSPENDED';

export interface ManagedUser {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string | null;
  role: ManagedUserRole;
  status: ManagedUserStatus;
  can_reply_conversations: boolean;
  can_reply_whatsapp: boolean;
  is_vip?: boolean;
  profile_picture_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManagedUserListResponse {
  users: ManagedUser[];
  total: number;
}

// Admin audit logs
export type AuditLogAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ESCALATE'
  | 'ASSIGN'
  | 'STATUS_CHANGE'
  | 'REPLY'
  | 'WHATSAPP_IN'
  | 'WHATSAPP_OUT';

export interface AuditLogEntry {
  id: string;
  user_id?: string | null;
  action: AuditLogAction;
  resource_type: string;
  resource_id?: string | null;
  description?: string | null;
  meta?: Record<string, unknown> | null;
  trace_id?: string | null;
  ip_address?: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  logs: AuditLogEntry[];
  total: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type AutoAssignmentMethod = 'Round-robin' | 'By category' | 'By workload';
export type MailMode = 'gmail' | 'smtp';
export type SmtpEncryption = 'tls' | 'ssl' | 'none';

export interface AdminSettings {
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
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  read_at?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  action_url?: string | null;
  meta?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface NotificationListResult {
  items: NotificationItem[];
  total: number;
  unread_count: number;
}

export interface DashboardCounts {
  total: number;
  open: number;
  in_progress: number;
  escalated: number;
  resolved: number;
  closed: number;
}

export interface WeeklyActivitySummary {
  created_this_week: number;
  resolved_this_week: number;
  created_last_week: number;
  resolved_last_week: number;
}

export interface UrgentTicketSummary {
  id: string;
  subject: string;
  status: string;
  priority: string;
  assigned_agent_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  resolved_count: number;
  open_assigned_count: number;
}

export interface AiOpsSummary {
  total_decisions: number;
  auto_resolved: number;
  escalated: number;
  escalation_rate: number;
  urgent_open_count: number;
}

export interface AssistedDraftChannelSummary {
  channel: 'chat' | 'whatsapp' | 'email';
  generated: number;
  accepted: number;
  sent: number;
  acceptance_rate: number;
  assisted_share: number;
  edited_rate: number;
  edited_samples: number;
  median_seconds_to_send?: number | null;
  latency_samples: number;
}

export interface AssistedDraftDailySummary {
  day: string;
  generated: number;
  accepted: number;
  sent: number;
}

export interface AssistedDraftAgentSummary {
  user_id: string;
  full_name: string;
  generated: number;
  accepted: number;
  acceptance_rate: number;
}

export interface AssistedDraftPerformanceSummary {
  lookback_days: number;
  total_generated: number;
  total_accepted: number;
  total_sent: number;
  acceptance_rate: number;
  assisted_share: number;
  edited_rate: number;
  edited_samples: number;
  median_seconds_to_send?: number | null;
  latency_samples: number;
  channels: AssistedDraftChannelSummary[];
  daily: AssistedDraftDailySummary[];
  top_agents: AssistedDraftAgentSummary[];
}

export interface DashboardUserStats {
  total_users: number;
  total_admins: number;
  total_agents: number;
  total_clients: number;
  active_agents: number;
}

export interface PersonalPerformanceSummary {
  my_resolved_tickets: number;
  my_open_assigned_tickets: number;
}

export interface MonthlyTicketSummary {
  month: string;
  count: number;
}

export interface WeeklyTicketSummary {
  week: string;
  count: number;
}

export interface DailyTicketSummary {
  day: string;
  count: number;
}

export interface RecentTicketSummary {
  id: string;
  subject: string;
  status: string;
  priority: string;
  channel_source: string;
  created_at: string;
}

export interface DashboardSummary {
  scope: 'client' | 'agent' | 'admin';
  counts: DashboardCounts;
  weekly: WeeklyActivitySummary;
  daily_tickets: DailyTicketSummary[];
  weekly_tickets: WeeklyTicketSummary[];
  monthly_tickets: MonthlyTicketSummary[];
  user_stats: DashboardUserStats;
  personal_performance: PersonalPerformanceSummary;
  urgent_tickets: UrgentTicketSummary[];
  leaderboard: LeaderboardEntry[];
  ai_ops: AiOpsSummary;
  assisted_draft: AssistedDraftPerformanceSummary;
  recent_tickets: RecentTicketSummary[];
}

// Pagination
export interface PaginationParams { page?: number; size?: number; search?: string; sort?: string; order?: 'asc' | 'desc' }
