import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  CheckCircle,
  ChevronDown,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Ticket,
  UserCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  Zap,
  Search,
  Eye,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { conversationsApi } from '@/shared/api/conversations';
import { normalizeError } from '@/shared/api/client';
import { usersApi } from '@/shared/api/users';
import { whatsappApi } from '@/shared/api/whatsapp';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TableSkeleton } from '@/shared/components/Skeletons';
import type {
  ConversationAutoReplyPolicy,
  ConversationSnippet,
  WhatsAppInboxConversation,
  WhatsAppThreadMessage,
} from '@/shared/types';
import { cn } from '@/lib/utils';

type WhatsAppTab = 'all' | 'unread' | 'ia' | 'tickets';
type ContextAccordionSection = 'customer' | 'ai-control' | 'ai-summary';

const TABS: Array<{ key: WhatsAppTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'ia', label: 'IA Auto' },
  { key: 'tickets', label: 'Tickets' },
];

const WHATSAPP_FALLBACK_SNIPPETS: ConversationSnippet[] = [
  {
    id: 'fallback-whatsapp-handoff',
    title: 'Handoff acknowledgement',
    body:
      'Thanks for your patience. I am handing this over to a specialist now so we can look into it properly. We will keep you updated as soon as we have the next step.',
    description: 'Acknowledge that the issue is being handed off.',
    shortcut: 'handoff',
    channel: 'WHATSAPP',
    is_active: true,
    created_by_id: null,
    updated_by_id: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fallback-whatsapp-investigating',
    title: 'Investigation in progress',
    body:
      'Thanks for your patience. We are currently investigating this and I will share an update with you as soon as I have more information.',
    description: 'Let the customer know the team is investigating.',
    shortcut: 'investigating',
    channel: 'WHATSAPP',
    is_active: true,
    created_by_id: null,
    updated_by_id: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'fallback-whatsapp-need-details',
    title: 'Missing details request',
    body:
      'To help us move this forward, could you please share a bit more detail about the issue, any exact error message, and a screenshot if one is available?',
    description: 'Ask the customer for more details.',
    shortcut: 'need-details',
    channel: 'WHATSAPP',
    is_active: true,
    created_by_id: null,
    updated_by_id: null,
    created_at: '',
    updated_at: '',
  },
];

function withFallbackSnippets(snippets: ConversationSnippet[], fallbacks: ConversationSnippet[]) {
  const merged = [...snippets];
  const seen = new Set(
    snippets.map((snippet) => `${(snippet.shortcut ?? '').trim().toLowerCase()}::${snippet.title.trim().toLowerCase()}`),
  );

  for (const fallback of fallbacks) {
    const key = `${(fallback.shortcut ?? '').trim().toLowerCase()}::${fallback.title.trim().toLowerCase()}`;
    if (!seen.has(key)) {
      merged.push(fallback);
    }
  }

  return merged;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function formatDateTime(value?: string | null) {
  if (!value) return 'Now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Now';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getConversationLabel(conversation: WhatsAppInboxConversation) {
  return (
    conversation.contact_name ||
    conversation.contact_phone ||
    conversation.subject ||
    conversation.id.slice(0, 8)
  );
}

function getInitials(label: string) {
  return (
    label
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function hasIaAutoSignal(c: WhatsAppInboxConversation) {
  const s = `${c.subject || ''} ${c.last_message || ''}`.toLowerCase();
  return /(assistant|bot|ia|auto)/.test(s);
}

function hasTicketSignal(c: WhatsAppInboxConversation) {
  const s = `${c.subject || ''} ${c.last_message || ''}`.toLowerCase();
  return /(ticket|tk-|#\d+)/.test(s);
}

function formatAutoReplyBlockReason(reason: string | null | undefined) {
  switch (reason) {
    case 'channel_disabled': return 'Blocked by channel policy';
    case 'conversation_disabled': return 'Blocked by conversation toggle';
    case 'pause_active': return 'Paused by timer';
    default: return 'Not blocked';
  }
}

function formatPauseUntilLabel(value: string | null | undefined) {
  if (!value) return 'not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatSlaCountdown(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) return 'soon';
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function formatResolutionStateLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function resolutionStateBadgeClass(value: string) {
  switch (value) {
    case 'resolved': return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'partially_resolved': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'in_progress': return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'unresolved': return 'border-rose-200 bg-rose-50 text-rose-700';
    default: return 'border-muted bg-muted/40 text-muted-foreground';
  }
}

function normalizeDraftTelemetryText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function renderConversationSnippet(
  template: string,
  context: {
    conversationId: string;
    customerId: string | null;
    latestCustomerMessage: string;
    currentDraft: string;
  },
) {
  const customerLabel = (() => {
    const id = (context.customerId || '').trim();
    if (!id) return 'Customer';
    if (id.includes('@')) return id.split('@')[0] || 'Customer';
    return `Customer ${id.slice(0, 8)}`;
  })();

  const dictionary: Record<string, string> = {
    customer_name: customerLabel,
    customer_id: context.customerId || '',
    conversation_id: context.conversationId,
    latest_customer_message: context.latestCustomerMessage,
    assisted_draft: context.currentDraft,
    current_draft: context.currentDraft,
  };

  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token: string) => {
    return dictionary[token.trim().toLowerCase()] ?? '';
  });
}

// ─── Avatar color palette ────────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-pink-100 text-pink-700',
];

function avatarColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── SLA chip ────────────────────────────────────────────────────────────────

function SlaChip({ sla }: { sla: { seconds_remaining?: number | null; risk_level: string } }) {
  const sr = sla.seconds_remaining;
  const pending = sr !== null && sr !== undefined;
  const overdue = pending && sr! <= 0;

  const label = pending
    ? overdue
      ? `Overdue ${formatSlaCountdown(Math.abs(sr!))} ago`
      : `${formatSlaCountdown(sr!)} left`
    : 'No pending reply';

  const chipClass = pending
    ? overdue
      ? 'bg-rose-50 border-rose-200 text-rose-700'
      : 'bg-sky-50 border-sky-200 text-sky-700'
    : 'bg-muted/50 border-border text-muted-foreground';

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', chipClass)}>
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}

// ─── Context panel (reusable accordion) ─────────────────────────────────────

function ContextPanel({
  label,
  icon,
  open,
  onOpenChange,
  loading,
  action,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="rounded-xl border bg-background/80">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left"
          onClick={() => onOpenChange(!open)}
        >
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        </button>
        <div className="flex items-center gap-1">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {action}
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded-full text-muted-foreground">
              <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', open && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent>
        <div className="border-t px-3.5 py-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Context field ───────────────────────────────────────────────────────────

function ContextField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="self-start pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('break-all text-[12px] leading-relaxed', mono && 'font-mono text-[11px]')}>{value}</dd>
    </>
  );
}

// ─── Thread message bubble ───────────────────────────────────────────────────

function ThreadMessageBubble({
  message,
  customerUserId,
}: {
  message: WhatsAppThreadMessage;
  customerUserId: string;
}) {
  const isUserMessage = message.direction
    ? message.direction === 'inbound'
    : message.sender_id === customerUserId;

  return (
    <div className={cn('flex items-end gap-2', isUserMessage ? 'justify-end' : 'justify-start')}>
      {!isUserMessage && (
        <Avatar className="h-7 w-7 shrink-0 border bg-muted">
          <AvatarFallback className="bg-muted">
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13px] shadow-sm',
          isUserMessage
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm border border-border/60 bg-card text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className={cn('text-[10px]', isUserMessage ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
            {formatDateTime(message.created_at)}
          </span>
          <StatusBadge status={message.is_read ? 'read' : 'sent'} className="text-[10px]" />
        </div>
      </div>

      {isUserMessage && (
        <Avatar className="h-7 w-7 shrink-0 border border-primary/20 bg-primary/10">
          <AvatarFallback className="bg-primary/10">
            <UserCircle2 className="h-3.5 w-3.5 text-primary" />
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export function WhatsAppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<WhatsAppTab>('all');
  const [search, setSearch] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [appliedDeepLinkId, setAppliedDeepLinkId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [assistedDraftMode, setAssistedDraftMode] = useState(true);
  const [assistToolsOpen, setAssistToolsOpen] = useState(false);
  const [lastDraftSourceMessageId, setLastDraftSourceMessageId] = useState<string | null>(null);
  const [hasPendingAssistedDraft, setHasPendingAssistedDraft] = useState(false);
  const [pendingAssistedDraftText, setPendingAssistedDraftText] = useState<string | null>(null);
  const [pendingAssistedDraftGeneratedAt, setPendingAssistedDraftGeneratedAt] = useState<string | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>('');
  const [openContextSection, setOpenContextSection] = useState<ContextAccordionSection | null>('customer');

  const deepLinkedConversationId = (searchParams.get('conversation') ?? '').trim().toLowerCase();
  const canReplyWhatsApp =
    user?.role === 'agent' || user?.role === 'admin' ? user.can_reply_whatsapp : true;
  const shouldCheckConversationSuspension =
    Boolean(selectedConversationId) && user?.role === 'agent' && Boolean(user?.id);

  const conversationSuspensionQ = useQuery({
    queryKey: ['wa-agent-reply-suspension-self', selectedConversationId, user?.id],
    queryFn: () =>
      conversationsApi.agentReplySuspension(selectedConversationId as string, user?.id as string),
    enabled: shouldCheckConversationSuspension,
    refetchInterval: shouldCheckConversationSuspension ? 15_000 : false,
  });

  const isConversationReplySuspended =
    shouldCheckConversationSuspension && (conversationSuspensionQ.data?.suspended ?? false);
  const suspensionReason = conversationSuspensionQ.data?.reason?.trim() || null;
  const canSendWhatsAppReply = canReplyWhatsApp && !isConversationReplySuspended;

  const statusQ = useQuery({
    queryKey: ['wa-status'],
    queryFn: whatsappApi.status,
    refetchInterval: 20_000,
  });

  const inboxQ = useQuery({
    queryKey: ['wa-inbox', activeTab === 'unread'],
    queryFn: () => whatsappApi.inbox({ unreadOnly: activeTab === 'unread', limit: 200 }),
    refetchInterval: 10_000,
  });

  const conversations = useMemo(() => inboxQ.data?.conversations ?? [], [inboxQ.data]);

  const filteredConversations = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return conversations
      .filter((c) => {
        if (activeTab === 'unread') return c.unread_count > 0;
        if (activeTab === 'ia') return hasIaAutoSignal(c);
        if (activeTab === 'tickets') return hasTicketSignal(c);
        return true;
      })
      .filter((c) => {
        if (!searchText) return true;
        const hay = [getConversationLabel(c), c.contact_phone || '', c.subject || '', c.last_message || '']
          .join(' ')
          .toLowerCase();
        return hay.includes(searchText);
      });
  }, [activeTab, conversations, search]);

  const deepLinkedConversation = useMemo(() => {
    if (!deepLinkedConversationId) return null;
    return conversations.find((c) => c.id.toLowerCase() === deepLinkedConversationId) ?? null;
  }, [conversations, deepLinkedConversationId]);

  useEffect(() => {
    if (!deepLinkedConversationId) {
      if (appliedDeepLinkId) setAppliedDeepLinkId(null);
      return;
    }
    if (appliedDeepLinkId === deepLinkedConversationId) return;
    if (activeTab !== 'all') { setActiveTab('all'); return; }
    if (search.trim()) { setSearch(''); return; }
    if (!deepLinkedConversation) return;
    setSelectedConversationId(deepLinkedConversation.id);
    setAppliedDeepLinkId(deepLinkedConversationId);
  }, [activeTab, appliedDeepLinkId, deepLinkedConversation, deepLinkedConversationId, search]);

  useEffect(() => {
    if (!selectedConversationId && filteredConversations.length > 0) {
      setSelectedConversationId(filteredConversations[0].id);
      return;
    }
    if (
      selectedConversationId &&
      !filteredConversations.some((c) => c.id === selectedConversationId)
    ) {
      setSelectedConversationId(filteredConversations[0]?.id ?? null);
    }
  }, [filteredConversations, selectedConversationId]);

  const selectedConversation =
    filteredConversations.find((c) => c.id === selectedConversationId) || null;
  const selectedCustomerId = selectedConversation?.user_id ?? null;
  const canToggleConversationAutoReply = user?.role === 'admin';
  const canPauseConversationAutoReply = user?.role === 'admin' || user?.role === 'agent';

  const customerProfileQ = useQuery({
    queryKey: ['wa-conversation-customer-profile', selectedCustomerId],
    queryFn: () => usersApi.getById(selectedCustomerId as string),
    enabled: Boolean(selectedCustomerId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const customerProfile = customerProfileQ.data ?? null;

  const conversationAutoReplyQ = useQuery({
    queryKey: ['conversation-auto-reply', selectedConversationId],
    queryFn: () => conversationsApi.conversationAutoReply(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
    refetchInterval: selectedConversationId ? 15_000 : false,
    refetchOnWindowFocus: false,
  });
  const conversationPolicy = conversationAutoReplyQ.data ?? null;
  const assistedDraftAvailable = Boolean(conversationPolicy?.assisted_draft_available ?? false);

  const snippetsQ = useQuery({
    queryKey: ['conversation-snippets', 'WHATSAPP'],
    queryFn: () => conversationsApi.listSnippets({ channel: 'WHATSAPP' }),
    staleTime: 120_000,
  });
  const snippetOptions = useMemo(
    () => withFallbackSnippets(snippetsQ.data?.snippets ?? [], WHATSAPP_FALLBACK_SNIPPETS),
    [snippetsQ.data?.snippets],
  );

  const conversationSlaQ = useQuery({
    queryKey: ['conversation-sla-predictor', selectedConversationId],
    queryFn: () => conversationsApi.slaPredictor(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
    refetchInterval: selectedConversationId ? 15_000 : false,
    refetchOnWindowFocus: false,
  });
  const conversationSla = conversationSlaQ.data ?? null;

  const syncConversationPolicy = useCallback(
    (policy: ConversationAutoReplyPolicy) => {
      queryClient.setQueryData(['conversation-auto-reply', policy.conversation_id], policy);
    },
    [queryClient],
  );

  const setConversationAutoReplyMut = useMutation({
    mutationFn: (enabled: boolean) =>
      conversationsApi.setConversationAutoReply(selectedConversationId as string, {
        ai_auto_reply_enabled: enabled,
      }),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({
        title: policy.ai_auto_reply_enabled ? 'AI auto-reply enabled' : 'AI auto-reply disabled',
        description: policy.ai_auto_reply_enabled
          ? 'Auto-reply active when channel policy allows.'
          : 'Manual replies required.',
      });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: 'Could not update policy', description: normalizeError(error) }),
  });

  const setConversationPauseMut = useMutation({
    mutationFn: (minutes: number) =>
      conversationsApi.setConversationAutoReplyPause(selectedConversationId as string, { minutes }),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({
        title: 'AI auto-reply paused',
        description: policy.ai_auto_reply_paused_until
          ? `Paused until ${formatPauseUntilLabel(policy.ai_auto_reply_paused_until)}.`
          : 'Pause cleared.',
      });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: 'Could not pause', description: normalizeError(error) }),
  });

  const clearConversationPauseMut = useMutation({
    mutationFn: () =>
      conversationsApi.clearConversationAutoReplyPause(selectedConversationId as string),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({ title: 'Pause cleared', description: 'AI auto-replies can resume.' });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: 'Could not clear pause', description: normalizeError(error) }),
  });

  const threadQ = useQuery({
    queryKey: ['wa-thread', selectedConversationId],
    queryFn: () => whatsappApi.thread(selectedConversationId as string, { limit: 500 }),
    enabled: Boolean(selectedConversationId),
    refetchInterval: selectedConversationId ? 6_000 : false,
  });

  const summaryQ = useQuery({
    queryKey: ['wa-summary', selectedConversationId],
    queryFn: () => whatsappApi.summary(selectedConversationId as string, { maxMessages: 200 }),
    enabled: Boolean(selectedConversationId),
    staleTime: 60_000,
    retry: 1,
  });

  const messages = useMemo(() => {
    const raw = threadQ.data?.messages ?? [];
    return [...raw].sort((a, b) => {
      const aTs = Date.parse(a.created_at || '');
      const bTs = Date.parse(b.created_at || '');
      const aHas = !Number.isNaN(aTs);
      const bHas = !Number.isNaN(bTs);
      if (aHas && bHas && aTs !== bTs) return aTs - bTs;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
  }, [threadQ.data?.messages]);

  const latestCustomerMessage = useMemo(
    () =>
      [...messages].reverse().find((m) => {
        if (m.direction) return m.direction === 'inbound';
        return Boolean(selectedConversation?.user_id) && m.sender_id === selectedConversation.user_id;
      }) ?? null,
    [messages, selectedConversation?.user_id],
  );

  const latestMessage = messages[messages.length - 1] ?? null;
  const conversationPolicyMutating =
    setConversationAutoReplyMut.isPending ||
    setConversationPauseMut.isPending ||
    clearConversationPauseMut.isPending;
  const linkedTicketId = conversationSla?.escalation_ticket_id?.trim() || null;

  const openConversationTicket = useCallback(() => {
    if (!linkedTicketId) return;
    navigate(`/tickets/${linkedTicketId}`);
  }, [linkedTicketId, navigate]);

  const unreadForSelection = selectedConversation?.unread_count ?? 0;

  const sendMut = useMutation({
    mutationFn: () => {
      const content = reply.trim();
      const usedAssistedDraft = hasPendingAssistedDraft;
      const assistedDraftEdited =
        usedAssistedDraft && pendingAssistedDraftText !== null
          ? normalizeDraftTelemetryText(content) !== normalizeDraftTelemetryText(pendingAssistedDraftText)
          : undefined;
      return whatsappApi.reply(selectedConversationId as string, content, {
        usedAssistedDraft,
        assistedDraftEdited,
        assistedDraftGeneratedAt: usedAssistedDraft ? pendingAssistedDraftGeneratedAt ?? undefined : undefined,
      });
    },
    onSuccess: async () => {
      setReply('');
      setHasPendingAssistedDraft(false);
      setPendingAssistedDraftText(null);
      setPendingAssistedDraftGeneratedAt(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wa-thread', selectedConversationId] }),
        queryClient.invalidateQueries({ queryKey: ['wa-inbox'] }),
      ]);
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: 'Reply failed', description: normalizeError(error) }),
  });

  const assistedDraftMut = useMutation({
    mutationFn: () => conversationsApi.assistedDraft(selectedConversationId as string),
    onSuccess: (response) => {
      setReply(response.draft);
      setLastDraftSourceMessageId(response.source_message_id);
      setHasPendingAssistedDraft(true);
      setPendingAssistedDraftText(response.draft);
      setPendingAssistedDraftGeneratedAt(response.generated_at);
    },
  });

  const requestAssistedDraft = useCallback(
    async (showErrors: boolean) => {
      if (!selectedConversationId) return;
      if (!assistedDraftAvailable) {
        if (showErrors)
          toast({
            variant: 'destructive',
            title: 'Assisted draft unavailable',
            description: 'Available for chat conversations only.',
          });
        return;
      }
      try {
        await assistedDraftMut.mutateAsync();
      } catch (error) {
        if (showErrors)
          toast({
            variant: 'destructive',
            title: 'Could not generate draft',
            description: normalizeError(error),
          });
      }
    },
    [assistedDraftAvailable, assistedDraftMut, selectedConversationId, toast],
  );

  const handleInsertSnippet = useCallback(() => {
    if (!selectedSnippetId) return;
    const snippet = snippetOptions.find((s) => s.id === selectedSnippetId);
    if (!snippet) return;
    const rendered = renderConversationSnippet(snippet.body, {
      conversationId: selectedConversationId || '',
      customerId: selectedConversation?.user_id || null,
      latestCustomerMessage: latestCustomerMessage?.content || '',
      currentDraft: reply,
    }).trim();
    if (!rendered) return;
    setReply((curr) => {
      const current = curr.trim();
      return current ? `${rendered}\n\n${current}` : rendered;
    });
    toast({ title: 'Snippet inserted', description: `${snippet.title} was inserted into the draft.` });
  }, [latestCustomerMessage?.content, reply, selectedConversation?.user_id, selectedConversationId, selectedSnippetId, snippetOptions, toast]);

  useEffect(() => {
    setLastDraftSourceMessageId(null);
    setHasPendingAssistedDraft(false);
    setPendingAssistedDraftText(null);
    setPendingAssistedDraftGeneratedAt(null);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!snippetOptions.length) {
      if (selectedSnippetId) setSelectedSnippetId('');
      return;
    }
    if (!snippetOptions.some((s) => s.id === selectedSnippetId)) {
      setSelectedSnippetId(snippetOptions[0].id);
    }
  }, [selectedSnippetId, snippetOptions]);

  useEffect(() => {
    if (!assistedDraftMode || !assistedDraftAvailable) return;
    if (!latestCustomerMessage || reply.trim()) return;
    if (sendMut.isPending || assistedDraftMut.isPending) return;
    if (lastDraftSourceMessageId === latestCustomerMessage.id) return;
    void requestAssistedDraft(false);
  }, [
    assistedDraftAvailable, assistedDraftMode, assistedDraftMut.isPending,
    lastDraftSourceMessageId, latestCustomerMessage, reply, requestAssistedDraft, sendMut.isPending,
  ]);

  const markReadMut = useMutation({
    mutationFn: () => whatsappApi.markRead(selectedConversationId as string),
    onSuccess: async (result) => {
      toast({ title: 'Marked as read', description: `${result.messages_marked_read} message(s) updated.` });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wa-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['wa-thread', selectedConversationId] }),
      ]);
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: 'Mark read failed', description: normalizeError(error) }),
  });

  const tabCounts = useMemo(() => {
    const unread = conversations.filter((c) => c.unread_count > 0).length;
    const ia = conversations.filter((c) => hasIaAutoSignal(c)).length;
    const tickets = conversations.filter((c) => hasTicketSignal(c)).length;
    return { all: conversations.length, unread, ia, tickets };
  }, [conversations]);

  const isConnected = statusQ.data?.connected;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="grid h-[calc(100vh-3rem)] grid-cols-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)_300px]">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col border-r bg-background">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-card px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                isConnected === true
                  ? 'bg-emerald-100 text-emerald-600'
                  : isConnected === false
                  ? 'bg-rose-100 text-rose-600'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {isConnected === true ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : isConnected === false ? (
                <WifiOff className="h-3.5 w-3.5" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
            </div>
            <div>
              <p className="text-[13px] font-semibold leading-tight">WhatsApp Inbox</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {isConnected === true ? t('whatsapp.connected') : isConnected === false ? t('whatsapp.disconnected') : t('whatsapp.checking')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => {
              void statusQ.refetch();
              void inboxQ.refetch();
              if (selectedConversationId) {
                void threadQ.refetch();
                void summaryQ.refetch();
                void conversationSlaQ.refetch();
                void conversationAutoReplyQ.refetch();
              }
            }}
            aria-label={t('whatsapp.refreshLabel')}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', inboxQ.isFetching && 'animate-spin')} />
          </Button>
        </div>

        {/* Tabs + Search */}
        <div className="space-y-2.5 border-b px-3 pb-2.5 pt-3">
          <div className="flex gap-1">
            {TABS.map((tab) => {
              const count = tabCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-all',
                    activeTab === tab.key
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {tab.key === 'all'
                    ? t('whatsapp.tabAll')
                    : tab.key === 'unread'
                      ? t('whatsapp.tabUnread')
                      : tab.key === 'ia'
                        ? t('whatsapp.tabIaAuto')
                        : t('whatsapp.tabTickets')}
                  {count > 0 && (
                    <span className={cn('ml-1 text-[10px]', activeTab === tab.key ? 'opacity-80' : 'opacity-60')}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder={t('whatsapp.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {inboxQ.isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={6} cols={1} />
            </div>
          ) : inboxQ.error ? (
            <ErrorState message={normalizeError(inboxQ.error)} onRetry={() => void inboxQ.refetch()} />
          ) : filteredConversations.length === 0 ? (
            <EmptyState title={t('whatsapp.noConversations')} description={t('whatsapp.nothingMatches')} />
          ) : (
            filteredConversations.map((conversation) => {
              const selected = selectedConversationId === conversation.id;
              const label = getConversationLabel(conversation);
              const colorClass = avatarColor(conversation.id);
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedConversationId(conversation.id)}
                  className={cn(
                    'group relative flex w-full items-center gap-3 border-b px-3.5 py-3 text-left transition-colors hover:bg-muted/50',
                    selected && 'bg-accent/60',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary opacity-0 transition-opacity',
                      selected && 'opacity-100',
                    )}
                  />

                  {/* Avatar with unread badge */}
                  <div
                    className={cn(
                      'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                      colorClass,
                    )}
                  >
                    {getInitials(label)}
                    {conversation.unread_count > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                        {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                      </span>
                    )}
                  </div>

                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <p
                        className={cn(
                          'truncate text-[13px] leading-snug',
                          conversation.unread_count > 0
                            ? 'font-semibold text-foreground'
                            : 'font-medium text-foreground/80',
                        )}
                      >
                        {label}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDateTime(conversation.last_message_at || conversation.updated_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {conversation.last_message || t('whatsapp.conversationEmpty')}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Center: thread ───────────────────────────────────────────────── */}
      <section className="flex min-h-0 flex-col border-r bg-background">
        {/* Thread header */}
        <header className="flex items-center justify-between gap-3 border-b bg-card/50 px-4 py-3 backdrop-blur">
          {selectedConversation ? (
            <>
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
                    avatarColor(selectedConversation.id),
                  )}
                >
                  {getInitials(getConversationLabel(selectedConversation))}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {getConversationLabel(selectedConversation)}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[11px] text-muted-foreground">
                      {selectedConversation.contact_phone || t('whatsapp.conversationThread')}
                    </p>
                    {conversationSla && <SlaChip sla={conversationSla} />}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {unreadForSelection > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[12px]"
                    disabled={markReadMut.isPending}
                    onClick={() => markReadMut.mutate()}
                  >
                    {markReadMut.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="mr-1 h-3.5 w-3.5" />
                    )}
                    {t('whatsapp.markRead')}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('whatsapp.selectConversation')}</p>
          )}
        </header>

        {/* Message list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!selectedConversation ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState title={t('whatsapp.noConversationSelected')} description={t('whatsapp.chooseContact')} />
            </div>
          ) : threadQ.isLoading ? (
            <TableSkeleton rows={5} cols={1} />
          ) : threadQ.error ? (
            <ErrorState message={normalizeError(threadQ.error)} onRetry={() => void threadQ.refetch()} />
          ) : messages.length === 0 ? (
            <EmptyState title={t('whatsapp.noMessages')} description={t('whatsapp.conversationEmpty')} />
          ) : (
            <div className="space-y-1.5">
              {messages.map((message, i) => {
                const prev = messages[i - 1];
                const showSeparator =
                  !prev ||
                  new Date(message.created_at || '').toDateString() !==
                    new Date(prev.created_at || '').toDateString();
                return (
                  <div key={message.id}>
                    {showSeparator && (
                      <div className="flex items-center gap-2 py-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {new Date(message.created_at || '').toLocaleDateString([], {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <ThreadMessageBubble
                      message={message}
                      customerUserId={selectedConversation.user_id}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reply composer */}
        <div className="border-t bg-card/50 p-3">
          {/* Assist tools */}
          <Collapsible
            open={assistToolsOpen}
            onOpenChange={setAssistToolsOpen}
            className="mb-2.5 rounded-xl border bg-background"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={assistedDraftMode}
                  onCheckedChange={setAssistedDraftMode}
                  disabled={!assistedDraftAvailable || assistedDraftMut.isPending}
                  className="scale-90"
                />
                <div>
                  <p className="text-[12px] font-medium leading-tight">AI draft mode</p>
                  <p className="text-[10px] leading-tight text-muted-foreground">
                    {assistedDraftAvailable ? 'Suggest replies automatically' : 'Chat conversations only'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {hasPendingAssistedDraft && (
                  <span className="flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                    <Sparkles className="h-2.5 w-2.5" />
                    AI draft
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-full px-2.5 text-[12px]"
                  disabled={
                    !assistedDraftAvailable ||
                    !assistedDraftMode ||
                    !latestCustomerMessage ||
                    assistedDraftMut.isPending
                  }
                  onClick={() => void requestAssistedDraft(true)}
                >
                  {assistedDraftMut.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  Generate
                </Button>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground"
                  >
                    <ChevronDown
                      className={cn('h-3.5 w-3.5 transition-transform duration-200', assistToolsOpen && 'rotate-180')}
                    />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>

            <CollapsibleContent>
              <div className="space-y-2 border-t px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedSnippetId}
                    onValueChange={setSelectedSnippetId}
                    disabled={snippetsQ.isLoading || snippetOptions.length === 0}
                  >
                    <SelectTrigger className="h-8 flex-1 text-[12px]">
                      <SelectValue
                        placeholder={snippetOptions.length === 0 ? 'No snippets available' : 'Select a snippet…'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {snippetOptions.map((snippet) => (
                        <SelectItem key={snippet.id} value={snippet.id} className="text-[12px]">
                          {snippet.shortcut ? `${snippet.shortcut} · ` : ''}
                          {snippet.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0 rounded-full px-2.5 text-[12px]"
                    disabled={!selectedSnippetId || sendMut.isPending}
                    onClick={handleInsertSnippet}
                  >
                    <MessageSquareText className="mr-1 h-3 w-3" />
                    Insert
                  </Button>
                </div>
                {snippetsQ.isLoading && <p className="text-[11px] text-muted-foreground">Loading snippets…</p>}
                {!snippetsQ.isLoading && snippetOptions.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No shared snippets available for this channel yet.</p>
                )}
                {!assistedDraftAvailable && (
                  <p className="text-[11px] text-muted-foreground">
                    Assisted drafts are available for chat conversations only.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Suspension banner */}
          {isConversationReplySuspended && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <div>
                <p className="text-[12px] font-semibold text-rose-800">Reply suspended</p>
                <p className="text-[11px] text-rose-700">
                  An admin suspended your replies.{suspensionReason ? ` Reason: ${suspensionReason}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Textarea + send button */}
          <div className="flex items-end gap-2">
            <Textarea
              value={reply}
              onChange={(e) => {
                const v = e.target.value;
                setReply(v);
                if (!v.trim()) {
                  setHasPendingAssistedDraft(false);
                  setPendingAssistedDraftText(null);
                  setPendingAssistedDraftGeneratedAt(null);
                }
              }}
              placeholder={
                !canReplyWhatsApp
                  ? 'Read-only — your account cannot send replies'
                  : isConversationReplySuspended
                  ? 'Reply suspended for this conversation'
                  : 'Type a reply… (Ctrl+Enter to send)'
              }
              className={cn(
                'min-h-[80px] flex-1 resize-none text-sm transition-colors',
                hasPendingAssistedDraft &&
                  'border-violet-300 bg-violet-50/30 focus-visible:ring-violet-300',
              )}
              disabled={
                !selectedConversation ||
                sendMut.isPending ||
                !canSendWhatsAppReply ||
                conversationSuspensionQ.isLoading
              }
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  (e.ctrlKey || e.metaKey) &&
                  reply.trim() &&
                  selectedConversation &&
                  !sendMut.isPending &&
                  canSendWhatsAppReply &&
                  !conversationSuspensionQ.isLoading
                ) {
                  e.preventDefault();
                  sendMut.mutate();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full shadow-sm"
              disabled={
                !selectedConversation ||
                !reply.trim() ||
                sendMut.isPending ||
                !canSendWhatsAppReply ||
                conversationSuspensionQ.isLoading
              }
              onClick={() => sendMut.mutate()}
            >
              {sendMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="mt-1.5 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">Ctrl+Enter to send</p>
            {!canReplyWhatsApp && (
              <p className="text-[10px] text-amber-600">Read-only mode</p>
            )}
            {isConversationReplySuspended && (
              <p className="text-[10px] text-rose-600">Contact an admin to restore access.</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Right panel: context ─────────────────────────────────────────── */}
      <aside className="hidden min-h-0 flex-col bg-background lg:flex">
        <div className="border-b bg-card px-4 py-3.5">
          <p className="text-[13px] font-semibold">Context</p>
          <p className="text-[11px] text-muted-foreground">Metadata & AI controls</p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
          {!selectedConversation ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState title="No context" description="Select a conversation." />
            </div>
          ) : (
            <>
              {/* Customer */}
              <ContextPanel
                label="Customer"
                icon={<UserCircle2 className="h-3.5 w-3.5" />}
                open={openContextSection === 'customer'}
                onOpenChange={(o) => setOpenContextSection(o ? 'customer' : null)}
              >
                {customerProfileQ.isLoading ? (
                  <p className="text-[12px] text-muted-foreground">Loading…</p>
                ) : customerProfileQ.error ? (
                  <p className="text-[12px] text-destructive">{normalizeError(customerProfileQ.error)}</p>
                ) : (
                  <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2">
                    <ContextField
                      label="Name"
                      value={customerProfile?.full_name?.trim() || getConversationLabel(selectedConversation)}
                    />
                    <ContextField label="Email" value={customerProfile?.email?.trim() || '—'} />
                    <ContextField
                      label="Phone"
                      value={customerProfile?.phone_number?.trim() || selectedConversation.contact_phone || '—'}
                    />
                    <ContextField label="ID" value={selectedConversation.user_id} mono />
                  </dl>
                )}
              </ContextPanel>

              {/* AI Controls */}
              <ContextPanel
                label="AI Controls"
                icon={<Zap className="h-3.5 w-3.5" />}
                open={openContextSection === 'ai-control'}
                onOpenChange={(o) => setOpenContextSection(o ? 'ai-control' : null)}
                loading={conversationAutoReplyQ.isLoading || conversationPolicyMutating}
              >
                {conversationAutoReplyQ.error ? (
                  <p className="text-[12px] text-destructive">
                    {normalizeError(conversationAutoReplyQ.error)}
                  </p>
                ) : conversationPolicy ? (
                  <div className="space-y-3">
                    {/* Status pill */}
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium',
                        conversationPolicy.effective_ai_auto_reply_enabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          conversationPolicy.effective_ai_auto_reply_enabled
                            ? 'bg-emerald-500'
                            : 'bg-amber-500',
                        )}
                      />
                      {conversationPolicy.effective_ai_auto_reply_enabled
                        ? 'Auto-reply active'
                        : formatAutoReplyBlockReason(conversationPolicy.block_reason)}
                    </div>

                    {/* Toggle */}
                    <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-2.5 py-2">
                      <div>
                        <p className="text-[12px] font-medium">Conversation toggle</p>
                        <p className="text-[10px] text-muted-foreground">Persistent setting</p>
                      </div>
                      <Switch
                        checked={conversationPolicy.ai_auto_reply_enabled}
                        disabled={!canToggleConversationAutoReply || conversationPolicyMutating}
                        onCheckedChange={(checked) => setConversationAutoReplyMut.mutate(checked)}
                      />
                    </div>
                    {!canToggleConversationAutoReply && (
                      <p className="text-[10px] text-muted-foreground">Admin only.</p>
                    )}

                    {/* Pause controls */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Pause timer
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { label: '30m', minutes: 30 },
                          { label: '2h', minutes: 120 },
                          { label: '24h', minutes: 24 * 60 },
                        ].map(({ label, minutes }) => (
                          <Button
                            key={label}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-full text-[11px]"
                            disabled={!canPauseConversationAutoReply || conversationPolicyMutating}
                            onClick={() => setConversationPauseMut.mutate(minutes)}
                          >
                            Pause {label}
                          </Button>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-full text-[11px]"
                          disabled={
                            !canPauseConversationAutoReply ||
                            conversationPolicyMutating ||
                            !conversationPolicy.ai_auto_reply_paused_until
                          }
                          onClick={() => clearConversationPauseMut.mutate()}
                        >
                          Resume
                        </Button>
                      </div>
                      {conversationPolicy.ai_auto_reply_paused_until && (
                        <p className="text-[10px] text-muted-foreground">
                          Paused until{' '}
                          {formatPauseUntilLabel(conversationPolicy.ai_auto_reply_paused_until)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">Select a conversation.</p>
                )}
              </ContextPanel>

              {/* AI Summary */}
              <ContextPanel
                label="AI Summary"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                open={openContextSection === 'ai-summary'}
                onOpenChange={(o) => setOpenContextSection(o ? 'ai-summary' : null)}
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 rounded-full px-2 text-[10px]"
                    disabled={summaryQ.isFetching}
                    onClick={() => void summaryQ.refetch()}
                  >
                    {summaryQ.isFetching ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                }
              >
                {!summaryQ.data && summaryQ.isLoading ? (
                  <p className="text-[12px] text-muted-foreground">Generating summary…</p>
                ) : summaryQ.error && !summaryQ.data ? (
                  <p className="text-[12px] text-destructive">{normalizeError(summaryQ.error)}</p>
                ) : summaryQ.data ? (
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Problem
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed">{summaryQ.data.problem_summary}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Resolution
                      </p>
                      <span
                        className={cn(
                          'mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          resolutionStateBadgeClass(summaryQ.data.resolution_state),
                        )}
                      >
                        {formatResolutionStateLabel(summaryQ.data.resolution_state)}
                      </span>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {summaryQ.data.resolution_description}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Next action
                      </p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{summaryQ.data.next_action}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[12px] text-muted-foreground">Not yet available.</p>
                )}
              </ContextPanel>

              {/* Snapshot */}
              <div className="space-y-3 rounded-xl border bg-background/80 p-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Snapshot
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Created', value: formatDateTime(selectedConversation.created_at) },
                    { label: 'Updated', value: formatDateTime(selectedConversation.updated_at) },
                    { label: 'Messages', value: String(messages.length) },
                    { label: 'Unread', value: String(unreadForSelection) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className="mt-0.5 text-[12px] font-medium">{value}</p>
                    </div>
                  ))}
                </div>

                {latestMessage && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">Latest message</p>
                    <p className="mt-0.5 line-clamp-3 text-[12px] text-muted-foreground">
                      {latestMessage.content}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDateTime(latestMessage.created_at)}
                    </p>
                  </div>
                )}

                {/* SLA */}
                <div>
                  <p className="mb-1.5 text-[10px] text-muted-foreground">SLA</p>
                  {conversationSlaQ.isLoading ? (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading…
                    </span>
                  ) : conversationSla ? (
                    <div className="flex flex-wrap gap-1.5">
                      <SlaChip sla={conversationSla} />
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          conversationSla.risk_level === 'critical'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : conversationSla.risk_level === 'high'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : conversationSla.risk_level === 'medium'
                            ? 'border-orange-200 bg-orange-50 text-orange-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                        )}
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {conversationSla.risk_level.toUpperCase()}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">SLA unavailable</span>
                  )}
                </div>
              </div>

              {/* View ticket CTA */}
              <div className="pb-2 pt-1">
                <Button
                  type="button"
                  className="h-9 w-full rounded-full text-[13px] shadow-sm"
                  onClick={openConversationTicket}
                  disabled={!linkedTicketId}
                >
                  <Ticket className="mr-1.5 h-4 w-4" />
                  {linkedTicketId ? 'View linked ticket' : 'No ticket linked'}
                </Button>
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
