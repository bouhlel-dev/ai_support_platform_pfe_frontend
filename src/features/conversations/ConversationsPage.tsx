import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  Bot,
  ChevronDown,
  Download,
  File as FileIcon,
  Loader2,
  Menu,
  MessageSquareText,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Ticket,
  Trash2,
  UserCircle2,
  X,
  Zap,
  Clock,
  AlertTriangle,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { getClientConfigBoolean } from '@/shared/config/clientConfig';
import { conversationsApi } from '@/shared/api/conversations';
import { usersApi } from '@/shared/api/users';
import { visualAiApi } from '@/shared/api/visual-ai';
import { voiceApi } from '@/shared/api/voice';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TableSkeleton } from '@/shared/components/Skeletons';
import type {
  Conversation,
  ConversationAutoReplyPolicy,
  Message,
} from '@/shared/types';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const CLIENT_STARTERS = [
  'I need help with my account setup',
  'Can you explain my latest ticket update?',
  'I want to understand SMS pricing',
];

const TEMP_CONVERSATION_PREFIX = 'temp-conversation-';
const CLIENT_ACTION_BUTTON_CLASS =
  'h-11 shrink-0 justify-center whitespace-nowrap rounded-full px-4';
const CHAT_SCREEN_CAPTURE_TARGET_FPS = 2;
const CHAT_SCREEN_CAPTURE_MAX_FPS = 5;
const CHAT_SCREEN_CAPTURE_LOOP_DELAY_MS = 1_250;
const CHAT_SCREEN_CAPTURE_READY_TIMEOUT_MS = 1_200;
const CLIENT_CHAT_PENDING_MESSAGES_POLL_MS = 700;
const CLIENT_CHAT_PENDING_CONVERSATIONS_POLL_MS = 3_000;
const CLIENT_CHAT_POST_SEND_EAGER_REFETCH_MS = 350;

type ChatMessage = Message & {
  local_attachment_url?: string | null;
};

type RecordingState = 'idle' | 'recording' | 'processing';
type PendingResponseMode = 'poll' | 'stream';
type OperatorConversationsTab = 'all' | 'open' | 'active' | 'resolved';
type ContextAccordionSection = 'customer' | 'ai-control' | 'ai-summary';

const OPERATOR_CONVERSATION_TABS: Array<{ key: OperatorConversationsTab; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'active', label: 'Active' },
  { key: 'resolved', label: 'Resolved' },
];

// ─── Shared utilities ────────────────────────────────────────────────────────

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
function formatPauseUntilLabel(value: string | null | undefined) {
  if (!value) return 'not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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

function formatAutoReplyBlockReason(reason: string | null | undefined) {
  switch (reason) {
    case 'channel_disabled': return 'Blocked by channel policy';
    case 'conversation_disabled': return 'Blocked by conversation toggle';
    case 'pause_active': return 'Paused by timer';
    default: return 'Not blocked';
  }
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

// ─── Context panel (accordion) ───────────────────────────────────────────────

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

function ContextField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="self-start pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn('break-all text-[12px] leading-relaxed', mono && 'font-mono text-[11px]')}>{value}</dd>
    </>
  );
}

export function ConversationsPage() {
  const { user } = useAuth();
  if (user?.role === 'client') {
    return <ClientConversationsPage />;
  }
  return <OperatorConversationsPage />;
}

function OperatorConversationsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OperatorConversationsTab>('all');
  const [search, setSearch] = useState('');
  const [openContextSection, setOpenContextSection] = useState<ContextAccordionSection | null>('customer');
  const [searchParams] = useSearchParams();
  const userFilter = (searchParams.get('user') ?? '').trim().toLowerCase();
  const deepLinkedConversationId = (searchParams.get('conversation') ?? '').trim().toLowerCase();
  const [appliedDeepLinkId, setAppliedDeepLinkId] = useState<string | null>(null);

  const {
    data: convos,
    isLoading: conversationsLoading,
    isFetching: conversationsRefreshing,
    error: conversationsError,
    refetch: refetchConversations,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationsApi.list({ channel: 'CHAT', includeTotal: false }),
    refetchInterval: () => visiblePollingInterval(20_000),
    refetchOnWindowFocus: false,
  });

  const sortedConversations = useMemo(() => {
    const source = (convos ?? []).filter(isChatConversation);
    return [...source].sort(sortConversationsByPinAndUpdated);
  }, [convos]);

  const tabCounts = useMemo((): Record<OperatorConversationsTab, number> => {
    return {
      all: sortedConversations.length,
      open: sortedConversations.filter((c) => matchesOperatorConversationTab(c.status, 'open')).length,
      active: sortedConversations.filter((c) => matchesOperatorConversationTab(c.status, 'active')).length,
      resolved: sortedConversations.filter((c) => matchesOperatorConversationTab(c.status, 'resolved')).length,
    };
  }, [sortedConversations]);

  const filteredConversations = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return sortedConversations
      .filter((c) => matchesOperatorConversationTab(c.status, activeTab))
      .filter((c) => {
        if (userFilter && !c.user_id.toLowerCase().includes(userFilter)) return false;
        if (!searchText) return true;
        const haystack = [getConversationTitle(c), c.user_id, c.channel, c.status].join(' ').toLowerCase();
        return haystack.includes(searchText);
      });
  }, [activeTab, search, sortedConversations, userFilter]);

  const selectedConversation = filteredConversations.find((c) => c.id === selectedId) ?? null;
  const selectedConversationId = selectedConversation?.id ?? null;
  const selectedCustomerId = selectedConversation?.user_id ?? null;
  const canToggleConversationAutoReply = user?.role === 'admin';
  const canPauseConversationAutoReply = user?.role === 'admin' || user?.role === 'agent';

  const customerProfileQ = useQuery({
    queryKey: ['conversation-customer-profile', selectedCustomerId],
    queryFn: () => usersApi.getById(selectedCustomerId as string),
    enabled: Boolean(selectedCustomerId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const customerProfile = customerProfileQ.data ?? null;

  const deepLinkedConversation = useMemo(() => {
    if (!deepLinkedConversationId) return null;
    return filteredConversations.find((c) => c.id.toLowerCase() === deepLinkedConversationId) ?? null;
  }, [deepLinkedConversationId, filteredConversations]);

  const conversationAutoReplyQ = useQuery({
    queryKey: ['conversation-auto-reply', selectedConversationId],
    queryFn: () => conversationsApi.conversationAutoReply(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
    refetchInterval: () => (selectedConversationId ? visiblePollingInterval(30_000) : false),
    refetchOnWindowFocus: false,
  });
  const conversationPolicy = conversationAutoReplyQ.data ?? null;

  const conversationSlaQ = useQuery({
    queryKey: ['conversation-sla-predictor', selectedConversationId],
    queryFn: () => conversationsApi.slaPredictor(selectedConversationId as string),
    enabled: Boolean(selectedConversationId),
    refetchInterval: () => (selectedConversationId ? visiblePollingInterval(30_000) : false),
    refetchOnWindowFocus: false,
  });
  const conversationSla = conversationSlaQ.data ?? null;

  const syncConversationPolicy = useCallback(
    (policy: ConversationAutoReplyPolicy) => {
      queryClient.setQueryData(['conversation-auto-reply', policy.conversation_id], policy);
      queryClient.setQueryData<Conversation[]>(['conversations'], (current = []) =>
        current.map((c) =>
          c.id === policy.conversation_id
            ? { ...c, ai_auto_reply_enabled: policy.ai_auto_reply_enabled, ai_auto_reply_paused_until: policy.ai_auto_reply_paused_until ?? null }
            : c,
        ),
      );
    },
    [queryClient],
  );

  const setConversationAutoReplyMut = useMutation({
    mutationFn: (enabled: boolean) =>
      conversationsApi.setConversationAutoReply(selectedConversationId as string, { ai_auto_reply_enabled: enabled }),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({
        title: policy.ai_auto_reply_enabled ? 'AI auto-reply enabled' : 'AI auto-reply disabled',
        description: policy.ai_auto_reply_enabled
          ? 'This conversation can auto-reply when channel policy allows it.'
          : 'This conversation now requires manual operator replies.',
      });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Could not update conversation policy', description: normalizeError(error) }),
  });

  const setConversationPauseMut = useMutation({
    mutationFn: (minutes: number) =>
      conversationsApi.setConversationAutoReplyPause(selectedConversationId as string, { minutes }),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({
        title: 'AI auto-reply paused',
        description: policy.ai_auto_reply_paused_until
          ? `Auto-reply paused until ${formatPauseUntilLabel(policy.ai_auto_reply_paused_until)}.`
          : 'Auto-reply pause cleared.',
      });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Could not pause auto-reply', description: normalizeError(error) }),
  });

  const clearConversationPauseMut = useMutation({
    mutationFn: () => conversationsApi.clearConversationAutoReplyPause(selectedConversationId as string),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({ title: 'Auto-reply pause cleared', description: 'AI auto-replies can resume if other policies allow it.' });
    },
    onError: (error) => toast({ variant: 'destructive', title: 'Could not clear pause', description: normalizeError(error) }),
  });

  const threadQ = useQuery({
    queryKey: ['messages', selectedId],
    queryFn: () => conversationsApi.messages(selectedId as string),
    enabled: Boolean(selectedId),
    refetchInterval: () => (selectedId ? visiblePollingInterval(12_000) : false),
    refetchOnWindowFocus: false,
  });

  const summaryQ = useQuery({
    queryKey: ['conversation-summary', selectedId],
    queryFn: () => conversationsApi.summary(selectedId as string, { maxMessages: 120 }),
    enabled: false,
    staleTime: 60_000,
    retry: 1,
  });

  const selectedMessages = useMemo(() => {
    const source = threadQ.data ?? [];
    return [...source].sort((l, r) => compareMessageCreatedAt(l.created_at, r.created_at));
  }, [threadQ.data]);

  const latestMessage = selectedMessages[selectedMessages.length - 1] ?? null;
  const conversationPolicyMutating =
    setConversationAutoReplyMut.isPending || setConversationPauseMut.isPending || clearConversationPauseMut.isPending;

  const linkedTicketId = conversationSla?.escalation_ticket_id?.trim() || null;

  const openConversationTicket = useCallback(() => {
    if (!linkedTicketId) return;
    navigate(`/tickets/${linkedTicketId}`);
  }, [linkedTicketId, navigate]);

  useEffect(() => {
    if (!deepLinkedConversationId) { if (appliedDeepLinkId) setAppliedDeepLinkId(null); return; }
    if (appliedDeepLinkId === deepLinkedConversationId) return;
    if (!deepLinkedConversation) return;
    setSelectedId(deepLinkedConversation.id);
    setAppliedDeepLinkId(deepLinkedConversationId);
  }, [appliedDeepLinkId, deepLinkedConversation, deepLinkedConversationId]);

  useEffect(() => {
    if (!selectedId && filteredConversations.length > 0) { setSelectedId(filteredConversations[0].id); return; }
    if (selectedId && !filteredConversations.some((c) => c.id === selectedId)) {
      setSelectedId(filteredConversations[0]?.id ?? null);
    }
  }, [filteredConversations, selectedId]);

  return (
    <div className="grid h-[calc(100vh-3rem)] grid-cols-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)_300px]">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex min-h-0 flex-col border-r bg-background">
        <div className="flex items-center justify-between border-b bg-card px-4 py-3.5">
          <div>
            <p className="text-[13px] font-semibold leading-tight">{t('common.conversations')}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">{t('conversations.operatorWorkflow')}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            aria-label={t('conversations.refreshConversations')}
            onClick={() => { void refetchConversations(); if (selectedId) void threadQ.refetch(); }}
          >
            {conversationsRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <div className="space-y-2.5 border-b px-3 pb-2.5 pt-3">
          <div className="flex gap-1">
            {OPERATOR_CONVERSATION_TABS.map((tab) => (
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
                {tab.label}
                <span className={cn('ml-1 text-[10px]', activeTab === tab.key ? 'opacity-80' : 'opacity-60')}>
                  {tabCounts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder={userFilter ? t('conversations.scopedUser', { user: userFilter }) : t('conversations.searchConversations')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {userFilter && (
            <p className="text-[11px] text-muted-foreground">{t('conversations.listScopedByUser')}</p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversationsLoading ? (
            <div className="p-4"><TableSkeleton rows={6} cols={1} /></div>
          ) : conversationsError ? (
            <ErrorState message={normalizeError(conversationsError)} onRetry={() => void refetchConversations()} />
          ) : filteredConversations.length === 0 ? (
            <EmptyState
              title={userFilter ? t('conversations.noConversationsForUser') : t('whatsapp.noConversations')}
              description={userFilter ? t('conversations.tryAnotherProfile') : t('conversations.noConversationMatchesFilters')}
            />
          ) : (
            filteredConversations.map((conversation) => {
              const selected = selectedId === conversation.id;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                  className={cn(
                    'group relative flex w-full items-start gap-3 border-b px-3.5 py-3 text-left transition-colors hover:bg-muted/50',
                    selected && 'bg-accent/60',
                  )}
                >
                  <span className={cn('pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary opacity-0 transition-opacity', selected && 'opacity-100')} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-1">
                      <p className="truncate text-[13px] font-medium leading-snug text-foreground">
                        {getConversationTitle(conversation)}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatConversationDate(conversation.updated_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{conversation.user_id}</p>
                      <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {conversation.channel}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Center: thread ───────────────────────────────────────────────── */}
      <section className="flex min-h-0 flex-col border-r bg-background">
        <header className="flex items-center justify-between gap-3 border-b bg-card/50 px-4 py-3 backdrop-blur">
          {selectedConversation ? (
            <>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">{getConversationTitle(selectedConversation)}</h3>
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs text-muted-foreground">User {selectedConversation.user_id}</p>
                  {conversationSla && <SlaChip sla={conversationSla} />}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 rounded-full text-[11px] font-medium">
                {selectedConversation.channel}
              </Badge>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t('whatsapp.selectConversation')}</p>
          )}
        </header>

        {selectedConversation ? (
          <OperatorMessageThread
            conversationId={selectedConversation.id}
            conversationUserId={selectedConversation.user_id}
            autoReplyPolicy={conversationPolicy}
            messages={selectedMessages}
            isLoading={threadQ.isLoading}
            error={threadQ.error}
            onRetry={() => void threadQ.refetch()}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title={t('conversations.noConversationSelected')} description={t('conversations.chooseConversation')} />
          </div>
        )}
      </section>

      {/* ── Right panel: context ─────────────────────────────────────────── */}
      <aside className="hidden min-h-0 flex-col bg-background lg:flex">
        <div className="border-b bg-card px-4 py-3.5">
          <p className="text-[13px] font-semibold">{t('conversations.conversationContext')}</p>
          <p className="text-[11px] text-muted-foreground">{t('conversations.quickOperationalMetadata')}</p>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2.5 p-3 pb-20">
            {!selectedConversation ? (
              <EmptyState title={t('conversations.noContext')} description={t('conversations.selectConversationDetails')} />
            ) : (
              <>
                {/* Customer */}
                <ContextPanel
                  label={t('conversations.customer')}
                  icon={<UserCircle2 className="h-3.5 w-3.5" />}
                  open={openContextSection === 'customer'}
                  onOpenChange={(o) => setOpenContextSection(o ? 'customer' : null)}
                >
                  {customerProfileQ.isLoading ? (
                    <p className="text-[12px] text-muted-foreground">{t('conversations.loadingCustomerProfile')}</p>
                  ) : customerProfileQ.error ? (
                    <p className="text-[12px] text-destructive">{normalizeError(customerProfileQ.error)}</p>
                  ) : (
                    <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-2">
                      <ContextField label={t('conversations.name')} value={customerProfile?.full_name?.trim() || t('conversations.notAvailable')} />
                      <ContextField label={t('conversations.emailLabel')} value={customerProfile?.email?.trim() || t('conversations.notAvailable')} />
                      <ContextField label={t('conversations.phone')} value={customerProfile?.phone_number?.trim() || t('conversations.notProvided')} />
                      <ContextField label={t('conversations.id')} value={selectedConversation.user_id} mono />
                    </dl>
                  )}
                </ContextPanel>

                {/* AI Control */}
                <ContextPanel
                  label={t('conversations.aiControls')}
                  icon={<Zap className="h-3.5 w-3.5" />}
                  open={openContextSection === 'ai-control'}
                  onOpenChange={(o) => setOpenContextSection(o ? 'ai-control' : null)}
                  loading={conversationAutoReplyQ.isLoading || conversationPolicyMutating}
                >
                  {conversationAutoReplyQ.error ? (
                    <p className="text-[12px] text-destructive">{normalizeError(conversationAutoReplyQ.error)}</p>
                  ) : conversationPolicy ? (
                    <div className="space-y-3">
                      <div className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium',
                        conversationPolicy.effective_ai_auto_reply_enabled
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700',
                      )}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', conversationPolicy.effective_ai_auto_reply_enabled ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {conversationPolicy.effective_ai_auto_reply_enabled
                          ? t('conversations.autoReplyActive')
                          : formatAutoReplyBlockReason(conversationPolicy.block_reason)}
                      </div>

                      <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-2.5 py-2">
                        <div>
                          <p className="text-[12px] font-medium">{t('conversations.conversationToggle')}</p>
                          <p className="text-[10px] text-muted-foreground">{t('conversations.persistentPerConversation')}</p>
                        </div>
                        <Switch
                          checked={conversationPolicy.ai_auto_reply_enabled}
                          disabled={!canToggleConversationAutoReply || conversationPolicyMutating}
                          onCheckedChange={(checked) => setConversationAutoReplyMut.mutate(checked)}
                        />
                      </div>
                      {!canToggleConversationAutoReply && (
                        <p className="text-[10px] text-muted-foreground">{t('conversations.adminOnly')}</p>
                      )}

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('conversations.pauseTimer')}</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[{ label: '30m', minutes: 30 }, { label: '2h', minutes: 120 }, { label: '24h', minutes: 24 * 60 }].map(({ label, minutes }) => (
                            <Button
                              key={label}
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-full text-[11px]"
                              disabled={!canPauseConversationAutoReply || conversationPolicyMutating}
                              onClick={() => setConversationPauseMut.mutate(minutes)}
                            >
                              {t('conversations.pauseFor', { label })}
                            </Button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-full text-[11px]"
                            disabled={!canPauseConversationAutoReply || conversationPolicyMutating || !conversationPolicy.ai_auto_reply_paused_until}
                            onClick={() => clearConversationPauseMut.mutate()}
                          >
                            {t('conversations.resume')}
                          </Button>
                        </div>
                        {conversationPolicy.ai_auto_reply_paused_until && (
                          <p className="text-[10px] text-muted-foreground">
                            {t('conversations.pausedUntil')} {formatPauseUntilLabel(conversationPolicy.ai_auto_reply_paused_until)}
                          </p>
                        )}
                        {!canPauseConversationAutoReply && (
                          <p className="text-[10px] text-muted-foreground">{t('conversations.availableAgentsAdmins')}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">{t('conversations.selectConversationAiControls')}</p>
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
                      {summaryQ.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {summaryQ.data ? '' : ''}
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
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Problem</p>
                        <p className="mt-1 text-[12px] leading-relaxed">{summaryQ.data.problem_summary}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Resolution</p>
                        <span className={cn('mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', resolutionStateBadgeClass(summaryQ.data.resolution_state))}>
                          {formatResolutionStateLabel(summaryQ.data.resolution_state)}
                        </span>
                        <p className="mt-1 text-[12px] text-muted-foreground">{summaryQ.data.resolution_description}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next action</p>
                        <p className="mt-1 text-[12px] text-muted-foreground">{summaryQ.data.next_action}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      Generate a summary on demand to avoid background loading delays.
                    </p>
                  )}
                </ContextPanel>

                {/* Snapshot */}
                <div className="space-y-3 rounded-xl border bg-background/80 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Snapshot</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Created', value: formatConversationDate(selectedConversation.created_at) },
                      { label: 'Updated', value: formatConversationDate(selectedConversation.updated_at) },
                      { label: 'Messages', value: String(selectedMessages.length) },
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
                      <p className="mt-0.5 line-clamp-4 text-[12px] text-muted-foreground">{latestMessage.content || 'No messages yet'}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatMessageTime(latestMessage.created_at)}</p>
                    </div>
                  )}

                  <div>
                    <p className="mb-1.5 text-[10px] text-muted-foreground">SLA</p>
                    {conversationSlaQ.isLoading ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />Loading…
                      </span>
                    ) : conversationSla ? (
                      <div className="flex flex-wrap gap-1.5">
                        <SlaChip sla={conversationSla} />
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                          conversationSla.risk_level === 'critical' ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : conversationSla.risk_level === 'high' ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : conversationSla.risk_level === 'medium' ? 'border-orange-200 bg-orange-50 text-orange-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700',
                        )}>
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {conversationSla.risk_level.toUpperCase()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">SLA unavailable</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Floating View Ticket button */}
          {selectedConversation && (
            <div className="sticky bottom-0 border-t bg-background/95 px-3 py-3 backdrop-blur">
              <Button
                type="button"
                className="h-9 w-full rounded-full shadow-sm"
                onClick={openConversationTicket}
                disabled={!linkedTicketId}
              >
                <Ticket className="mr-1.5 h-4 w-4" />
                {linkedTicketId ? 'View linked ticket' : 'No ticket linked'}
              </Button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ─── Operator message thread ──────────────────────────────────────────────────

function OperatorMessageThread({
  conversationId,
  conversationUserId,
  autoReplyPolicy,
  messages,
  isLoading,
  error,
  onRetry,
}: {
  conversationId: string;
  conversationUserId: string | null;
  autoReplyPolicy?: ConversationAutoReplyPolicy | null;
  messages: Message[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const normalizeDraftTelemetryText = (value: string) => value.replace(/\s+/g, ' ').trim();

  const [draft, setDraft] = useState('');
  const [assistedDraftMode, setAssistedDraftMode] = useState(true);
  const [assistToolsOpen, setAssistToolsOpen] = useState(false);
  const [lastDraftSourceMessageId, setLastDraftSourceMessageId] = useState<string | null>(null);
  const [hasPendingAssistedDraft, setHasPendingAssistedDraft] = useState(false);
  const [pendingAssistedDraftText, setPendingAssistedDraftText] = useState<string | null>(null);
  const [pendingAssistedDraftGeneratedAt, setPendingAssistedDraftGeneratedAt] = useState<string | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string>('');
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const canReplyConversations = user?.role === 'agent' || user?.role === 'admin'
    ? user.can_reply_conversations
    : true;
  const shouldCheckConversationSuspension =
    Boolean(conversationId) && user?.role === 'agent' && Boolean(user?.id);

  const conversationSuspensionQ = useQuery({
    queryKey: ['conversation-agent-reply-suspension-self', conversationId, user?.id],
    queryFn: () => conversationsApi.agentReplySuspension(conversationId, user?.id as string),
    enabled: shouldCheckConversationSuspension,
    refetchInterval: shouldCheckConversationSuspension ? 15_000 : false,
  });

  const isConversationReplySuspended =
    shouldCheckConversationSuspension && (conversationSuspensionQ.data?.suspended ?? false);
  const suspensionReason = conversationSuspensionQ.data?.reason?.trim() || null;
  const canSendConversationReply = canReplyConversations && !isConversationReplySuspended;

  const latestCustomerMessage = useMemo(
    () =>
      [...messages].reverse().find(
        (m) => !m.is_internal && Boolean(conversationUserId) && m.sender_id === conversationUserId,
      ) ?? null,
    [conversationUserId, messages],
  );

  const assistedDraftAvailable =
    Boolean(autoReplyPolicy?.assisted_draft_available ?? true) &&
    String(autoReplyPolicy?.channel ?? 'CHAT').toLowerCase() === 'chat';

  const snippetsQ = useQuery({
    queryKey: ['conversation-snippets', String(autoReplyPolicy?.channel ?? 'CHAT').toUpperCase()],
    queryFn: () => conversationsApi.listSnippets({ channel: String(autoReplyPolicy?.channel ?? 'CHAT').toUpperCase() }),
    staleTime: 120_000,
  });
  const snippetOptions = useMemo(() => snippetsQ.data?.snippets ?? [], [snippetsQ.data?.snippets]);

  const sendMut = useMutation({
    mutationFn: (content: string) => {
      const usedAssistedDraft = hasPendingAssistedDraft;
      const assistedDraftEdited =
        usedAssistedDraft && pendingAssistedDraftText !== null
          ? normalizeDraftTelemetryText(content) !== normalizeDraftTelemetryText(pendingAssistedDraftText)
          : undefined;
      return conversationsApi.send(conversationId, content, {
        usedAssistedDraft,
        assistedDraftEdited,
        assistedDraftGeneratedAt: usedAssistedDraft ? pendingAssistedDraftGeneratedAt ?? undefined : undefined,
      });
    },
    onSuccess: () => {
      setDraft('');
      setHasPendingAssistedDraft(false);
      setPendingAssistedDraftText(null);
      setPendingAssistedDraftGeneratedAt(null);
      void qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  const assistedDraftMut = useMutation({
    mutationFn: () => conversationsApi.assistedDraft(conversationId),
    onSuccess: (response) => {
      setDraft(response.draft);
      setLastDraftSourceMessageId(response.source_message_id);
      setHasPendingAssistedDraft(true);
      setPendingAssistedDraftText(response.draft);
      setPendingAssistedDraftGeneratedAt(response.generated_at);
    },
  });

  const requestAssistedDraft = useCallback(
    async (showErrors: boolean) => {
      try {
        await assistedDraftMut.mutateAsync();
      } catch (error) {
        if (showErrors) toast({ variant: 'destructive', title: 'Could not generate assisted draft', description: normalizeError(error) });
      }
    },
    [assistedDraftMut, toast],
  );

  useEffect(() => {
    setLastDraftSourceMessageId(null);
    setHasPendingAssistedDraft(false);
    setPendingAssistedDraftText(null);
    setPendingAssistedDraftGeneratedAt(null);
  }, [conversationId]);

  useEffect(() => {
    if (!snippetOptions.length) { if (selectedSnippetId) setSelectedSnippetId(''); return; }
    if (!snippetOptions.some((s) => s.id === selectedSnippetId)) setSelectedSnippetId(snippetOptions[0].id);
  }, [selectedSnippetId, snippetOptions]);

  useEffect(() => {
    if (!assistedDraftMode || !assistedDraftAvailable) return;
    if (!latestCustomerMessage || draft.trim()) return;
    if (sendMut.isPending || assistedDraftMut.isPending) return;
    if (lastDraftSourceMessageId === latestCustomerMessage.id) return;
    void requestAssistedDraft(false);
  }, [assistedDraftAvailable, assistedDraftMode, assistedDraftMut.isPending, draft, lastDraftSourceMessageId, latestCustomerMessage, requestAssistedDraft, sendMut.isPending]);

  const handleInsertSnippet = useCallback(() => {
    if (!selectedSnippetId) return;
    const snippet = snippetOptions.find((s) => s.id === selectedSnippetId);
    if (!snippet) return;
    const rendered = renderConversationSnippet(snippet.body, {
      conversationId,
      customerId: conversationUserId,
      latestCustomerMessage: latestCustomerMessage?.content ?? '',
      currentDraft: draft,
    }).trim();
    if (!rendered) return;
    setDraft((curr) => {
      const current = curr.trim();
      return current ? `${rendered}\n\n${current}` : rendered;
    });
    toast({ title: 'Snippet inserted', description: `${snippet.title} was inserted into the draft.` });
  }, [conversationId, conversationUserId, draft, latestCustomerMessage?.content, selectedSnippetId, snippetOptions, toast]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <TableSkeleton rows={4} cols={1} />
        ) : error ? (
          <ErrorState message={normalizeError(error)} onRetry={onRetry} />
        ) : messages.length === 0 ? (
          <EmptyState title="No messages" description="This conversation has no messages yet." />
        ) : (
          <div className="space-y-2">
            {messages.map((message) => {
              const isUserMessage = Boolean(conversationUserId) && message.sender_id === conversationUserId;
              const isInternal = message.is_internal;

              if (isInternal) {
                return (
                  <div key={message.id} className="mx-auto max-w-[75%] rounded-xl border border-border/70 bg-muted/60 px-3 py-2 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">Internal note</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground">{message.content}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatMessageTime(message.created_at)}</p>
                  </div>
                );
              }

              return (
                <div key={message.id} className={cn('flex items-end gap-2', isUserMessage ? 'justify-end' : 'justify-start')}>
                  {!isUserMessage && (
                    <Avatar className="h-8 w-8 border border-border/70 bg-background">
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        <Bot className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn(
                    'max-w-[72%] rounded-xl px-3 py-2 text-sm',
                    isUserMessage
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md border border-border/70 bg-muted text-foreground',
                  )}>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <span className={cn('text-[10px]', isUserMessage ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                        {formatMessageTime(message.created_at)}
                      </span>
                      <StatusBadge status={message.is_read ? 'read' : 'sent'} className="text-[10px]" />
                    </div>
                  </div>
                  {isUserMessage && (
                    <Avatar className="h-8 w-8 border border-primary/20 bg-primary/10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <UserCircle2 className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t bg-card/40 p-3">
        {/* Assist tools */}
        <Collapsible open={assistToolsOpen} onOpenChange={setAssistToolsOpen} className="mb-2.5 rounded-xl border bg-background">
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
                disabled={!assistedDraftAvailable || !assistedDraftMode || !latestCustomerMessage || assistedDraftMut.isPending}
                onClick={() => void requestAssistedDraft(true)}
              >
                {assistedDraftMut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                Generate
              </Button>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full text-muted-foreground">
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', assistToolsOpen && 'rotate-180')} />
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
                    <SelectValue placeholder={snippetOptions.length === 0 ? 'No snippets available' : 'Select a snippet…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {snippetOptions.map((snippet) => (
                      <SelectItem key={snippet.id} value={snippet.id} className="text-[12px]">
                        {snippet.shortcut ? `${snippet.shortcut} · ` : ''}{snippet.title}
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
                <p className="text-[11px] text-muted-foreground">Assisted drafts are available for chat conversations only.</p>
              )}
              {assistedDraftAvailable && !latestCustomerMessage && (
                <p className="text-[11px] text-muted-foreground">Waiting for a customer message before generating a draft.</p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Suspension banner */}
        {isConversationReplySuspended && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-rose-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Reply blocked for this conversation</p>
              <p className="mt-0.5 text-xs">
                An admin suspended your replies in this thread.{suspensionReason ? ` Reason: ${suspensionReason}` : ''}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            value={draft}
            onChange={(e) => {
              const v = e.target.value;
              setDraft(v);
              if (!v.trim()) {
                setHasPendingAssistedDraft(false);
                setPendingAssistedDraftText(null);
                setPendingAssistedDraftGeneratedAt(null);
              }
            }}
            placeholder={
              !canReplyConversations
                ? 'Read-only mode is enabled for conversations'
                : isConversationReplySuspended
                  ? 'Reply is suspended for this conversation'
                  : 'Reply to this conversation (Ctrl+Enter to send)'
            }
            disabled={!canSendConversationReply || sendMut.isPending || conversationSuspensionQ.isLoading}
            className={cn(
              'min-h-[88px] resize-y',
              hasPendingAssistedDraft && 'border-violet-300 bg-violet-50/30 focus-visible:ring-violet-300',
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim() && canSendConversationReply && !sendMut.isPending && !conversationSuspensionQ.isLoading) {
                e.preventDefault();
                sendMut.mutate(draft.trim());
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full"
            disabled={!draft.trim() || sendMut.isPending || !canSendConversationReply || conversationSuspensionQ.isLoading}
            onClick={() => sendMut.mutate(draft.trim())}
          >
            {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>

        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Ctrl+Enter to send</p>
          {!canReplyConversations && <p className="text-[10px] text-amber-600">Read-only mode</p>}
          {isConversationReplySuspended && <p className="text-[10px] text-rose-600">Contact an admin to restore access.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Client conversations page ────────────────────────────────────────────────

function ClientConversationsPage() {
  const [showAllConversations, setShowAllConversations] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const screenshareUseGeminiEmbeddings = getClientConfigBoolean('VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS', true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionConversationId, setActionConversationId] = useState<string | null>(null);
  const [renamingConversationId, setRenamingConversationId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteConfirmConversationId, setDeleteConfirmConversationId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [startingFresh, setStartingFresh] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [temporaryConversation, setTemporaryConversation] = useState<Conversation | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Record<string, ChatMessage[]>>({});
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [pendingResponse, setPendingResponse] = useState<{ conversationId: string; sentAt: string; mode: PendingResponseMode } | null>(null);
  const [streamingAssistantMessage, setStreamingAssistantMessage] = useState<ChatMessage | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isAnalyzingScreen, setIsAnalyzingScreen] = useState(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);
  const [screenAnalysisText, setScreenAnalysisText] = useState<string | null>(null);
  const [screenFrameNumber, setScreenFrameNumber] = useState(0);
  const [lastScreenAnalysisAt, setLastScreenAnalysisAt] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const threadScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const screenShareLoopActiveRef = useRef(false);
  const screenShareLoopTimeoutRef = useRef<number | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const screenShareFrameIndexRef = useRef(0);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const streamingAssistantBufferRef = useRef('');
  const streamingAssistantFrameRef = useRef<number | null>(null);

  const {
    data: conversations = [],
    isLoading: conversationsLoading,
    error: conversationsError,
    refetch: refetchConversations,
    isFetching: conversationsRefreshing,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationsApi.list({ channel: 'CHAT', includeTotal: false }),
    refetchInterval: pendingResponse?.mode === 'poll' ? () => visiblePollingInterval(CLIENT_CHAT_PENDING_CONVERSATIONS_POLL_MS) : false,
    refetchOnWindowFocus: false,
  });

  const displayedConversations = useMemo(() => {
    const chatConversations = conversations.filter(isChatConversation);
    const hasTemporaryConversationInList = temporaryConversation && chatConversations.some((c) => c.id === temporaryConversation.id);
    const showTemporaryConversation = Boolean(temporaryConversation) && isChatConversation(temporaryConversation) && !hasTemporaryConversationInList;
    const baseConversations = showTemporaryConversation ? [temporaryConversation as Conversation, ...chatConversations] : chatConversations;
    return [...baseConversations].sort(sortConversationsByPinAndUpdated);
  }, [conversations, temporaryConversation]);

  useEffect(() => {
    if (temporaryConversation && conversations.some((c) => c.id === temporaryConversation.id)) {
      setTemporaryConversation(null);
    }
  }, [conversations, temporaryConversation]);

  useEffect(() => {
    if (selectedId && displayedConversations.some((c) => c.id === selectedId)) return;
    if (!selectedId && !startingFresh && displayedConversations.length > 0) {
      startTransition(() => setSelectedId(displayedConversations[0].id));
      return;
    }
    if (selectedId && !displayedConversations.some((c) => c.id === selectedId)) {
      startTransition(() => setSelectedId(displayedConversations[0]?.id ?? null));
    }
  }, [displayedConversations, selectedId, startingFresh]);

  const selectedConversation = useMemo(
    () => displayedConversations.find((c) => c.id === selectedId) ?? null,
    [displayedConversations, selectedId],
  );

  const shouldFetchMessages = Boolean(selectedId) && !isTemporaryConversationId(selectedId);

  const {
    data: rawMessages = [],
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: ['messages', selectedId],
    queryFn: () => conversationsApi.messages(selectedId as string),
    enabled: shouldFetchMessages,
    refetchInterval: () => {
      if (!shouldFetchMessages) return false;
      if (pendingResponse?.conversationId === selectedId && pendingResponse.mode === 'poll') {
        return visiblePollingInterval(CLIENT_CHAT_PENDING_MESSAGES_POLL_MS);
      }
      return false;
    },
    refetchOnWindowFocus: false,
  });

  const serverMessages = useMemo(() => rawMessages.filter((m) => !m.is_internal), [rawMessages]);
  const messages = useMemo(
    () => mergeMessages(serverMessages, selectedId ? optimisticMessages[selectedId] ?? [] : []),
    [optimisticMessages, selectedId, serverMessages],
  );
  const deferredStreamingAssistantMessage = useDeferredValue(streamingAssistantMessage);
  const renderedMessages = useMemo(() => {
    if (!selectedId || !deferredStreamingAssistantMessage || deferredStreamingAssistantMessage.conversation_id !== selectedId) {
      return messages;
    }
    return mergeMessages(messages, [deferredStreamingAssistantMessage]);
  }, [deferredStreamingAssistantMessage, messages, selectedId]);

  const newestMessageKey = useMemo(() => {
    if (!renderedMessages.length) return '';
    const newest = renderedMessages.reduce((curr, candidate) =>
      compareMessageCreatedAt(candidate.created_at, curr.created_at) > 0 ? candidate : curr,
    );
    return `${newest.id}:${newest.created_at}`;
  }, [renderedMessages]);

  useEffect(() => {
    return () => {
      streamAbortControllerRef.current?.abort();
      if (streamingAssistantFrameRef.current !== null) {
        window.cancelAnimationFrame(streamingAssistantFrameRef.current);
        streamingAssistantFrameRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
      stopMediaStream(recordingStreamRef.current);
      if (screenShareLoopTimeoutRef.current !== null) { window.clearTimeout(screenShareLoopTimeoutRef.current); screenShareLoopTimeoutRef.current = null; }
      stopMediaStream(screenShareStreamRef.current);
      screenShareStreamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedId || isTemporaryConversationId(selectedId)) return;
    const queuedMessages = optimisticMessages[selectedId];
    if (queuedMessages?.length) {
      setOptimisticMessages((current) => {
        const existing = current[selectedId];
        if (!existing?.length) return current;
        const remaining = existing.filter((queued) => !serverMessages.some((m) => isServerMatch(m, queued, user?.id)));
        if (remaining.length === existing.length) return current;
        const next = { ...current };
        if (remaining.length > 0) next[selectedId] = remaining;
        else delete next[selectedId];
        return next;
      });
    }
    if (pendingResponse?.conversationId === selectedId && pendingResponse.mode === 'poll') {
      const latestServerMessage = serverMessages[serverMessages.length - 1];
      if (latestServerMessage && !isOwnMessage(latestServerMessage, user?.id)) setPendingResponse(null);
    }
  }, [optimisticMessages, pendingResponse, selectedId, serverMessages, user?.id]);

  useEffect(() => {
    if (!selectedId || startingFresh) return;
    shouldAutoScrollRef.current = true;
    requestAnimationFrame(() => { bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }); });
  }, [selectedId, startingFresh]);

  useEffect(() => {
    if (!selectedId || startingFresh) return;
    const scrollAreaRoot = threadScrollAreaRef.current;
    const viewport = scrollAreaRoot?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null;
    if (!viewport) return;
    const updateAutoScrollState = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom <= 24;
    };
    viewport.addEventListener('scroll', updateAutoScrollState, { passive: true });
    return () => viewport.removeEventListener('scroll', updateAutoScrollState);
  }, [selectedId, startingFresh]);

  useEffect(() => {
    if (!selectedId || startingFresh || !shouldAutoScrollRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [newestMessageKey, selectedId, startingFresh]);

  useEffect(() => {
    if (renamingConversationId && !displayedConversations.some((c) => c.id === renamingConversationId)) {
      setRenamingConversationId(null); setRenameDraft(''); setRenameError(null);
    }
    if (deleteConfirmConversationId && !displayedConversations.some((c) => c.id === deleteConfirmConversationId)) {
      setDeleteConfirmConversationId(null); setDeleteError(null);
    }
  }, [deleteConfirmConversationId, displayedConversations, renamingConversationId]);

  const flushStreamingAssistantMessage = useCallback((contentOverride?: string) => {
    if (streamingAssistantFrameRef.current !== null) { window.cancelAnimationFrame(streamingAssistantFrameRef.current); streamingAssistantFrameRef.current = null; }
    const nextContent = contentOverride ?? streamingAssistantBufferRef.current;
    startTransition(() => { setStreamingAssistantMessage((curr) => curr ? { ...curr, content: nextContent } : curr); });
  }, []);

  const scheduleStreamingAssistantFlush = useCallback(() => {
    if (streamingAssistantFrameRef.current !== null) return;
    streamingAssistantFrameRef.current = window.requestAnimationFrame(() => {
      streamingAssistantFrameRef.current = null;
      flushStreamingAssistantMessage();
    });
  }, [flushStreamingAssistantMessage]);

  const clearStreamingAssistantMessage = useCallback(() => {
    if (streamingAssistantFrameRef.current !== null) { window.cancelAnimationFrame(streamingAssistantFrameRef.current); streamingAssistantFrameRef.current = null; }
    streamingAssistantBufferRef.current = '';
    setStreamingAssistantMessage(null);
  }, []);

  const streamConversationReply = useCallback(
    async ({ content, displayConversationId, optimisticMessageId, sentAt }: { content: string; displayConversationId: string; optimisticMessageId: string; sentAt: string }) => {
      streamAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      streamAbortControllerRef.current = abortController;
      let resolvedConversationId = displayConversationId;
      let metaReceived = false;
      let confirmedUserMessage: Message | null = null;
      let confirmedConversation: Conversation | null = null;
      streamingAssistantBufferRef.current = '';
      setStreamingAssistantMessage({ id: `streaming-assistant-${sentAt}`, conversation_id: displayConversationId, sender_id: 'support-assistant-stream', content: '', is_internal: false, is_read: false, created_at: sentAt });

      try {
        await conversationsApi.sendStream(
          { conversationId: isTemporaryConversationId(displayConversationId) ? undefined : displayConversationId, content, subject: buildConversationSubject(content) },
          {
            onMeta: async (event) => {
              metaReceived = true; confirmedConversation = event.conversation; confirmedUserMessage = event.user_message; resolvedConversationId = event.conversation.id;
              qc.setQueryData<Message[]>(['messages', event.conversation.id], (curr = []) => mergeMessages(curr, [event.user_message]));
              qc.setQueryData<Conversation[]>(['conversations'], (curr = []) => upsertConversationList(curr, event.conversation));
              setOptimisticMessages((curr) => {
                const next = { ...curr }; const existing = next[displayConversationId] ?? [];
                const mapped = existing.map((m) => m.id === optimisticMessageId ? event.user_message : { ...m, conversation_id: event.conversation.id });
                if (displayConversationId !== event.conversation.id) { delete next[displayConversationId]; next[event.conversation.id] = mergeMessages(next[event.conversation.id] ?? [], mapped); }
                else next[event.conversation.id] = mapped;
                return next;
              });
              if (displayConversationId !== event.conversation.id) { setTemporaryConversation(null); startTransition(() => setSelectedId(event.conversation.id)); }
              setPendingResponse((curr) => curr?.conversationId === displayConversationId ? { conversationId: event.conversation.id, sentAt, mode: 'stream' } : curr);
              setStreamingAssistantMessage((curr) => curr ? { ...curr, conversation_id: event.conversation.id } : curr);
            },
            onToken: async (event) => { streamingAssistantBufferRef.current += event.delta; scheduleStreamingAssistantFlush(); },
            onDone: async (event) => {
              const finalConversationId = resolvedConversationId;
              if (event.assistant_message) {
                flushStreamingAssistantMessage(event.assistant_message.content);
                qc.setQueryData<Message[]>(['messages', finalConversationId], (curr = []) => mergeMessages(curr, [event.assistant_message]));
                if (confirmedConversation) qc.setQueryData<Conversation[]>(['conversations'], (curr = []) => upsertConversationList(curr, { ...confirmedConversation, updated_at: event.assistant_message?.created_at ?? confirmedConversation.updated_at }));
              } else {
                if (event.auto_reply_enabled === false) toast({ title: 'AI auto-reply is disabled', description: 'Your message was sent. A support agent can continue the conversation.' });
                void qc.invalidateQueries({ queryKey: ['messages', finalConversationId] });
                void qc.invalidateQueries({ queryKey: ['conversations'] });
              }
              setOptimisticMessages((curr) => {
                const existing = curr[finalConversationId] ?? []; const remaining = existing.filter((m) => m.id !== optimisticMessageId);
                if (remaining.length === existing.length) return curr;
                const next = { ...curr }; if (remaining.length > 0) next[finalConversationId] = remaining; else delete next[finalConversationId];
                return next;
              });
              setPendingResponse((curr) => curr?.conversationId === finalConversationId ? null : curr);
              clearStreamingAssistantMessage();
            },
            onError: async (event) => { throw new Error(event.detail); },
          },
          abortController.signal,
        );
      } catch (error) {
        if (!metaReceived) {
          setDraft(content);
          setOptimisticMessages((curr) => {
            const existing = curr[displayConversationId] ?? []; const remaining = existing.filter((m) => m.id !== optimisticMessageId);
            if (remaining.length === existing.length) return curr;
            const next = { ...curr }; if (remaining.length > 0) next[displayConversationId] = remaining; else delete next[displayConversationId];
            return next;
          });
          if (isTemporaryConversationId(displayConversationId)) { setTemporaryConversation(null); setStartingFresh(true); startTransition(() => setSelectedId(conversations[0]?.id ?? null)); }
        } else if (confirmedUserMessage) {
          qc.setQueryData<Message[]>(['messages', resolvedConversationId], (curr = []) => mergeMessages(curr, [confirmedUserMessage as Message]));
        }
        setPendingResponse((curr) => curr?.conversationId === resolvedConversationId || curr?.conversationId === displayConversationId ? null : curr);
        clearStreamingAssistantMessage();
        if (!(error instanceof DOMException && error.name === 'AbortError')) toast({ variant: 'destructive', title: 'Message failed', description: normalizeError(error) });
      } finally {
        if (streamAbortControllerRef.current === abortController) streamAbortControllerRef.current = null;
      }
    },
    [clearStreamingAssistantMessage, conversations, flushStreamingAssistantMessage, qc, scheduleStreamingAssistantFlush, toast],
  );

  const sendMutation = useMutation({
    mutationFn: async ({ content, file, displayConversationId }: { content: string; file: File | null; displayConversationId: string; sentAt: string; optimisticMessageId: string }) => {
      let conversationId = displayConversationId; let createdConversation: Conversation | null = null;
      if (isTemporaryConversationId(conversationId)) { const created = await conversationsApi.create({ subject: buildConversationSubject(buildOutgoingMessageContent(content, file)) }); createdConversation = created; conversationId = created.id; }
      const sentMessage = file ? await conversationsApi.sendAttachment(conversationId, { file, content }) : await conversationsApi.send(conversationId, content);
      return { conversationId, createdConversation, sentMessage };
    },
    onSuccess: async (result, variables) => {
      setStartingFresh(false); setSelectedAttachment(null);
      setOptimisticMessages((curr) => {
        const next = { ...curr }; const existing = next[variables.displayConversationId] ?? [];
        const mapped = existing.map((m) => m.id === variables.optimisticMessageId ? result.sentMessage : { ...m, conversation_id: result.conversationId });
        if (variables.displayConversationId !== result.conversationId) { delete next[variables.displayConversationId]; next[result.conversationId] = mergeMessages(next[result.conversationId] ?? [], mapped); }
        else next[result.conversationId] = mapped;
        return next;
      });
      if (result.createdConversation) { setTemporaryConversation(null); startTransition(() => setSelectedId(result.conversationId)); }
      setPendingResponse((curr) => curr?.conversationId === variables.displayConversationId ? { conversationId: result.conversationId, sentAt: variables.sentAt, mode: 'poll' } : curr);
      await Promise.all([qc.invalidateQueries({ queryKey: ['conversations'] }), qc.invalidateQueries({ queryKey: ['messages', result.conversationId] })]);
      window.setTimeout(() => void qc.invalidateQueries({ queryKey: ['messages', result.conversationId] }), CLIENT_CHAT_POST_SEND_EAGER_REFETCH_MS);
    },
    onError: (error, variables) => {
      setDraft(variables.content); setSelectedAttachment(variables.file);
      setPendingResponse((curr) => curr?.conversationId === variables.displayConversationId ? null : curr);
      setOptimisticMessages((curr) => {
        const existing = curr[variables.displayConversationId] ?? []; const remaining = existing.filter((m) => m.id !== variables.optimisticMessageId);
        if (remaining.length === existing.length) return curr;
        const next = { ...curr }; if (remaining.length > 0) next[variables.displayConversationId] = remaining; else delete next[variables.displayConversationId];
        return next;
      });
      if (isTemporaryConversationId(variables.displayConversationId)) { setTemporaryConversation(null); setStartingFresh(true); startTransition(() => setSelectedId(conversations[0]?.id ?? null)); }
      toast({ variant: 'destructive', title: 'Message failed', description: normalizeError(error) });
    },
  });

  const updateConversationMutation = useMutation({
    mutationFn: ({ conversationId, payload }: { conversationId: string; payload: { subject?: string; is_pinned?: boolean } }) =>
      conversationsApi.update(conversationId, payload),
  });

  const deleteConversationMutation = useMutation({
    mutationFn: (conversationId: string) => conversationsApi.delete(conversationId),
  });

  const isConversationActionPending = updateConversationMutation.isPending || deleteConversationMutation.isPending;

  const removeConversationFromView = useCallback((conversationId: string) => {
    if (pendingResponse?.conversationId === conversationId) { streamAbortControllerRef.current?.abort(); clearStreamingAssistantMessage(); }
    setPendingResponse((curr) => curr?.conversationId === conversationId ? null : curr);
    setOptimisticMessages((curr) => { if (!(conversationId in curr)) return curr; const next = { ...curr }; delete next[conversationId]; return next; });
    if (temporaryConversation?.id === conversationId) setTemporaryConversation(null);
    if (selectedId === conversationId) {
      const nextId = displayedConversations.find((c) => c.id !== conversationId)?.id ?? null;
      setStartingFresh(nextId === null);
      startTransition(() => setSelectedId(nextId));
    }
  }, [clearStreamingAssistantMessage, displayedConversations, pendingResponse?.conversationId, selectedId, temporaryConversation?.id]);

  const isStreamingReplyActive = pendingResponse?.mode === 'stream';
  const isSendingMessage = sendMutation.isPending || recordingState === 'processing' || isStreamingReplyActive;

  const clearScreenShareLoopTimeout = useCallback(() => {
    if (screenShareLoopTimeoutRef.current !== null) { window.clearTimeout(screenShareLoopTimeoutRef.current); screenShareLoopTimeoutRef.current = null; }
  }, []);

  const stopChatScreenSharing = useCallback((options?: { reason?: 'manual' | 'ended' | 'cleanup' }) => {
    screenShareLoopActiveRef.current = false; clearScreenShareLoopTimeout(); stopMediaStream(screenShareStreamRef.current); screenShareStreamRef.current = null;
    setIsAnalyzingScreen(false); setIsScreenSharing(false); setScreenFrameNumber(0); setLastScreenAnalysisAt(null);
    if (options?.reason === 'manual') { setScreenShareError(null); setScreenAnalysisText(null); }
  }, [clearScreenShareLoopTimeout]);

  const captureScreenFrameForChat = useCallback(async (stream: MediaStream): Promise<File | null> => {
    const video = document.createElement('video');
    try { video.srcObject = stream; } catch { return null; }
    video.autoplay = true; video.muted = true; video.playsInline = true;
    try {
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.then === 'function') await playAttempt.catch(() => {});
      if (!video.videoWidth || !video.videoHeight || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve) => {
          const onReady = () => { cleanup(); resolve(); };
          const timer = window.setTimeout(() => { cleanup(); resolve(); }, CHAT_SCREEN_CAPTURE_READY_TIMEOUT_MS);
          const cleanup = () => { window.clearTimeout(timer); video.removeEventListener('loadeddata', onReady); video.removeEventListener('loadedmetadata', onReady); };
          video.addEventListener('loadeddata', onReady, { once: true }); video.addEventListener('loadedmetadata', onReady, { once: true });
        });
      }
      const width = video.videoWidth || 1280; const height = video.videoHeight || 720;
      if (!width || !height) return null;
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      ctx.drawImage(video, 0, 0, width, height);
      const frameBlob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/png'); });
      if (!frameBlob) return null;
      return new File([frameBlob], `chat-screenshare-frame-${Date.now()}.png`, { type: 'image/png' });
    } finally { video.pause(); video.srcObject = null; }
  }, []);

  const startChatScreenSharingLoop = useCallback((stream: MediaStream) => {
    screenShareLoopActiveRef.current = true; clearScreenShareLoopTimeout(); screenShareFrameIndexRef.current = 0; setScreenFrameNumber(0); setLastScreenAnalysisAt(null);
    const scheduleNext = (run: () => Promise<void>) => { clearScreenShareLoopTimeout(); if (!screenShareLoopActiveRef.current) return; screenShareLoopTimeoutRef.current = window.setTimeout(() => void run(), CHAT_SCREEN_CAPTURE_LOOP_DELAY_MS); };
    const runIteration = async () => {
      if (!screenShareLoopActiveRef.current) return;
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length === 0 || videoTracks.every((t) => t.readyState !== 'live')) { setScreenShareError('Screen sharing ended. Click Share screen to resume.'); stopChatScreenSharing({ reason: 'ended' }); return; }
      screenShareFrameIndexRef.current += 1; const frameNumber = screenShareFrameIndexRef.current; setScreenFrameNumber(frameNumber); setScreenAnalysisText(`Capturing screen frame #${frameNumber}...`);
      const frameFile = await captureScreenFrameForChat(stream); if (!screenShareLoopActiveRef.current) return;
      if (!frameFile) { setScreenShareError('Unable to capture a readable screen frame.'); scheduleNext(runIteration); return; }
      try {
        setIsAnalyzingScreen(true); setScreenShareError(null); setScreenAnalysisText(`Uploading frame #${frameNumber} for analysis...`);
        const options: Record<string, unknown> = { consent: true, source_fps: CHAT_SCREEN_CAPTURE_TARGET_FPS, target_fps: CHAT_SCREEN_CAPTURE_TARGET_FPS };
        if (screenshareUseGeminiEmbeddings) options.use_gemini_embeddings = true;
        const result = await visualAiApi.screenshareFrames([frameFile], options);
        const caption = result.final_frame?.caption?.trim();
        const firstHint = (result.assistance_hints || []).find((h) => { const n = (h || '').trim().toLowerCase(); return n && !n.startsWith('processed ') && !n.startsWith('average ui transition score:'); })?.trim();
        const summary = caption ? `The user is doing: ${caption}` : 'The user is interacting with the app interface.';
        const recordedAt = new Date().toISOString();
        setScreenAnalysisText(firstHint ? `${summary} ${firstHint}` : summary); setLastScreenAnalysisAt(recordedAt);
      } catch (error) { if (screenShareLoopActiveRef.current) setScreenShareError(normalizeError(error)); }
      finally { if (screenShareLoopActiveRef.current) { setIsAnalyzingScreen(false); scheduleNext(runIteration); } }
    };
    void runIteration();
  }, [captureScreenFrameForChat, clearScreenShareLoopTimeout, screenshareUseGeminiEmbeddings, stopChatScreenSharing]);

  const handleCreateNewChat = () => {
    streamAbortControllerRef.current?.abort(); clearStreamingAssistantMessage(); setDraft(''); setSelectedAttachment(null); setPendingResponse(null);
    if (temporaryConversation) { setOptimisticMessages((curr) => { const next = { ...curr }; delete next[temporaryConversation.id]; return next; }); setPendingResponse((curr) => curr?.conversationId === temporaryConversation.id ? null : curr); setTemporaryConversation(null); }
    setStartingFresh(true); startTransition(() => setSelectedId(null));
  };

  const handleShareScreenFromChat = useCallback(async () => {
    if (isScreenSharing) { stopChatScreenSharing({ reason: 'manual' }); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) { setScreenShareError('Screen sharing is not supported in this browser.'); return; }
    try {
      setScreenShareError(null); setScreenAnalysisText(null);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: CHAT_SCREEN_CAPTURE_TARGET_FPS, max: CHAT_SCREEN_CAPTURE_MAX_FPS } }, audio: false });
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) { videoTrack.onended = () => { setScreenShareError('Screen sharing ended. Click Share screen to resume.'); stopChatScreenSharing({ reason: 'ended' }); }; try { await videoTrack.applyConstraints({ frameRate: CHAT_SCREEN_CAPTURE_TARGET_FPS }); } catch {} }
      screenShareStreamRef.current = stream; setIsScreenSharing(true); startChatScreenSharingLoop(stream);
    } catch (error) { setScreenShareError(normalizeError(error)); setIsScreenSharing(false); stopMediaStream(screenShareStreamRef.current); screenShareStreamRef.current = null; }
  }, [isScreenSharing, startChatScreenSharingLoop, stopChatScreenSharing]);

  useEffect(() => { return () => stopChatScreenSharing({ reason: 'cleanup' }); }, [stopChatScreenSharing]);

  const handleSelectConversation = (conversationId: string) => { setStartingFresh(false); startTransition(() => setSelectedId(conversationId)); };

  const startInlineRenameConversation = useCallback((conversation: Conversation) => {
    setDeleteConfirmConversationId(null); setDeleteError(null); setRenamingConversationId(conversation.id); setRenameDraft(conversation.subject?.trim() ?? ''); setRenameError(null);
  }, []);

  const cancelInlineRenameConversation = useCallback(() => { setRenamingConversationId(null); setRenameDraft(''); setRenameError(null); }, []);

  const openDeleteConversationCard = useCallback((conversation: Conversation) => {
    setRenamingConversationId(null); setRenameDraft(''); setRenameError(null); setDeleteConfirmConversationId(conversation.id); setDeleteError(null);
  }, []);

  const closeDeleteConversationCard = useCallback(() => { setDeleteConfirmConversationId(null); setDeleteError(null); }, []);

  const handleRenameConversation = useCallback(async (conversation: Conversation, nextSubjectRaw: string) => {
    const currentSubject = conversation.subject?.trim() ?? ''; const nextSubject = nextSubjectRaw.trim();
    if (!nextSubject) { setRenameError('Conversation name cannot be empty.'); return; }
    if (nextSubject === currentSubject) { cancelInlineRenameConversation(); return; }
    if (isTemporaryConversationId(conversation.id)) {
      if (temporaryConversation?.id !== conversation.id) return;
      setTemporaryConversation({ ...temporaryConversation, subject: nextSubject, updated_at: new Date().toISOString() }); cancelInlineRenameConversation(); return;
    }
    try {
      setRenameError(null); setActionConversationId(conversation.id);
      const updated = await updateConversationMutation.mutateAsync({ conversationId: conversation.id, payload: { subject: nextSubject } });
      qc.setQueryData<Conversation[]>(['conversations'], (curr = []) => upsertConversationList(curr, updated));
      cancelInlineRenameConversation();
    } catch (error) { setRenameError(normalizeError(error)); }
    finally { setActionConversationId(null); }
  }, [cancelInlineRenameConversation, qc, temporaryConversation, updateConversationMutation]);

  const handleTogglePinConversation = useCallback(async (conversation: Conversation) => {
    const nextPinnedState = !isConversationPinned(conversation);
    if (isTemporaryConversationId(conversation.id)) {
      if (temporaryConversation?.id !== conversation.id) return;
      setTemporaryConversation({ ...temporaryConversation, is_pinned: nextPinnedState, updated_at: new Date().toISOString() }); return;
    }
    try {
      setActionConversationId(conversation.id);
      const updated = await updateConversationMutation.mutateAsync({ conversationId: conversation.id, payload: { is_pinned: nextPinnedState } });
      qc.setQueryData<Conversation[]>(['conversations'], (curr = []) => upsertConversationList(curr, updated));
    } catch {}
    finally { setActionConversationId(null); }
  }, [qc, temporaryConversation, updateConversationMutation]);

  const handleDeleteConversation = useCallback(async (conversation: Conversation) => {
    if (isTemporaryConversationId(conversation.id)) { removeConversationFromView(conversation.id); setDeleteConfirmConversationId(null); setDeleteError(null); return; }
    try {
      setDeleteError(null); setActionConversationId(conversation.id);
      await deleteConversationMutation.mutateAsync(conversation.id);
      qc.setQueryData<Conversation[]>(['conversations'], (curr = []) => removeConversationList(curr, conversation.id));
      qc.removeQueries({ queryKey: ['messages', conversation.id] });
      removeConversationFromView(conversation.id); void qc.invalidateQueries({ queryKey: ['conversations'] });
      setDeleteConfirmConversationId(null); setDeleteError(null);
    } catch (error) { setDeleteError(normalizeError(error)); }
    finally { setActionConversationId(null); }
  }, [deleteConversationMutation, qc, removeConversationFromView]);

  const handleAttachmentPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file) setSelectedAttachment(file);
    event.target.value = '';
  };

  const handleSend = ({ seedText, attachmentFile }: { seedText?: string; attachmentFile?: File | null } = {}) => {
    const file = attachmentFile ?? selectedAttachment;
    const content = (seedText ?? draft).trim();
    if ((!content && !file) || isSendingMessage || recordingState === 'recording') return;
    const sentAt = new Date().toISOString();
    const optimisticMessageId = `${sentAt}-${Math.random().toString(36).slice(2)}`;
    const outgoingContent = buildOutgoingMessageContent(content, file);
    const optimisticConversationId = selectedId ?? `${TEMP_CONVERSATION_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    if (!selectedId) {
      setTemporaryConversation({ id: optimisticConversationId, user_id: user?.id ?? 'client-temporary', channel: 'CHAT', status: 'OPEN', subject: buildConversationSubject(outgoingContent), is_pinned: false, created_at: sentAt, updated_at: sentAt });
      setStartingFresh(false); startTransition(() => setSelectedId(optimisticConversationId));
    }
    setDraft(''); setSelectedAttachment(null);
    setOptimisticMessages((curr) => ({ ...curr, [optimisticConversationId]: mergeMessages(curr[optimisticConversationId] ?? [], [{ id: optimisticMessageId, conversation_id: optimisticConversationId, sender_id: user?.id ?? 'client-temporary', content: outgoingContent, is_internal: false, is_read: false, attachment_filename: file?.name ?? null, attachment_content_type: file?.type ?? null, attachment_size: file?.size ?? null, local_attachment_url: file ? URL.createObjectURL(file) : null, created_at: sentAt }]) }));
    const pendingMode: PendingResponseMode = file ? 'poll' : 'stream';
    setPendingResponse({ conversationId: optimisticConversationId, sentAt, mode: pendingMode });
    if (file) { sendMutation.mutate({ content, file, displayConversationId: optimisticConversationId, sentAt, optimisticMessageId }); return; }
    void streamConversationReply({ content, displayConversationId: optimisticConversationId, sentAt, optimisticMessageId });
  };

  const handleRecordVoice = async () => {
    if (recordingState === 'processing' || isSendingMessage) return;
    if (recordingState === 'recording') { setRecordingState('processing'); mediaRecorderRef.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast({ variant: 'destructive', title: 'Voice recording unavailable', description: 'This browser cannot record audio messages here.' }); return; }
    try {
      setSelectedAttachment(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream; recordingChunksRef.current = [];
      const preferredMimeType = getPreferredRecordingMimeType();
      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
      recorder.onstop = () => { const mimeType = recorder.mimeType || preferredMimeType || 'audio/webm'; stopMediaStream(recordingStreamRef.current); recordingStreamRef.current = null; mediaRecorderRef.current = null; void processRecordedVoice(mimeType); };
      recorder.start(); mediaRecorderRef.current = recorder; setRecordingState('recording');
    } catch (error) { stopMediaStream(recordingStreamRef.current); recordingStreamRef.current = null; mediaRecorderRef.current = null; setRecordingState('idle'); toast({ variant: 'destructive', title: 'Microphone access failed', description: normalizeError(error) }); }
  };

  const processRecordedVoice = async (mimeType: string) => {
    try {
      const blob = new Blob(recordingChunksRef.current, { type: mimeType || 'audio/webm' }); recordingChunksRef.current = [];
      if (!blob.size) throw new Error('No audio was captured from the microphone.');
      const file = new File([blob], `voice-message-${Date.now()}.${getAudioFileExtension(mimeType)}`, { type: mimeType || 'audio/webm' });
      const transcription = await voiceApi.transcribe(file); const transcript = transcription.text.trim();
      if (!transcript) throw new Error('No speech was detected in the recording.');
      setRecordingState('idle'); handleSend({ seedText: transcript, attachmentFile: file });
    } catch (error) { setRecordingState('idle'); toast({ variant: 'destructive', title: 'Voice message failed', description: normalizeError(error) }); }
  };

  const introMode = !selectedConversation || startingFresh;
  const showPreparingResponse = pendingResponse?.conversationId === selectedId && (pendingResponse.mode === 'poll' || !deferredStreamingAssistantMessage || !deferredStreamingAssistantMessage.content.trim());
  const ownSenderIds = useMemo(() => { const ids = new Set<string>(); if (user?.id) ids.add(user.id); if (selectedConversation?.user_id) ids.add(selectedConversation.user_id); return ids; }, [selectedConversation?.user_id, user?.id]);

  const renderSidebarPanel = (inSheet: boolean) => (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', !inSheet && 'rounded-2xl border border-border/50 bg-card/80 backdrop-blur-xl transition-all duration-300 ease-in-out', !inSheet && (sidebarOpen ? 'translate-x-0 scale-100 opacity-100 visible' : '-translate-x-6 scale-95 opacity-0 invisible'))}>
      <div className="px-4 pt-4 pb-0">
        <div className="flex items-center justify-between pb-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Support chat</p>
          {!inSheet && (
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-border/70" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Button type="button" className="w-full h-9 rounded-lg text-sm font-medium mb-3" onClick={handleCreateNewChat}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New chat
        </Button>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input type="text" placeholder="Search conversations…" className="h-8 pl-8 pr-3 text-xs rounded-lg border-border/50 bg-background/50" />
        </div>
      </div>
      <div className="h-px bg-border/50"></div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden">
        <div className="px-2 py-2 pr-4">
          {displayedConversations.some((c) => isConversationPinned(c)) && (
            <>
              <div className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Pinned</div>
              <div className="space-y-0.5">
                {displayedConversations.filter((c) => isConversationPinned(c)).map((conversation) => {
                  const isActive = selectedId === conversation.id && !startingFresh;
                  const conversationTitle = getConversationTitle(conversation);
                  return (
                    <div key={conversation.id} role="button" tabIndex={0} onClick={() => handleSelectConversation(conversation.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectConversation(conversation.id); } }}
                      className={cn('group relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors', isActive ? 'bg-muted' : 'hover:bg-muted/50')}>
                      {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-r bg-blue-600"></div>}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{truncateSidebarTitle(conversationTitle)}</p>
                        <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{formatConversationDate(conversation.updated_at)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); startInlineRenameConversation(conversation); }}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleTogglePinConversation(conversation); }}>
                              <PinOff className="mr-2 h-3.5 w-3.5" />Unpin
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onSelect={(e) => { e.preventDefault(); openDeleteConversationCard(conversation); }}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {conversationsLoading ? (
            <div className="p-2"><TableSkeleton rows={4} cols={1} /></div>
          ) : conversationsError ? (
            <ErrorState message={normalizeError(conversationsError)} onRetry={() => refetchConversations()} />
          ) : displayedConversations.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">No conversations yet</div>
          ) : (
            <>
              {displayedConversations.some((c) => !isConversationPinned(c)) && (
                <div className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mt-2">Recent</div>
              )}
              <div className="space-y-0.5">
                {displayedConversations.filter((c) => !isConversationPinned(c)).map((conversation) => {
                  const isActive = selectedId === conversation.id && !startingFresh;
                  const conversationTitle = getConversationTitle(conversation);
                  const isRenaming = renamingConversationId === conversation.id;
                  return (
                    <div key={conversation.id}>
                      {isRenaming ? (
                        <div className="px-2 py-2">
                          <Input value={renameDraft} onChange={(e) => { setRenameDraft(e.target.value); if (renameError) setRenameError(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleRenameConversation(conversation, renameDraft); } else if (e.key === 'Escape') { e.preventDefault(); cancelInlineRenameConversation(); } }}
                            placeholder={conversationTitle} autoFocus className="h-7 text-xs" />
                          {renameError && <p className="mt-1 text-xs text-destructive">{renameError}</p>}
                        </div>
                      ) : (
                    <div role="button" tabIndex={0} onClick={() => handleSelectConversation(conversation.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectConversation(conversation.id); } }}
                      className={cn('group relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors', isActive ? 'bg-muted' : 'hover:bg-muted/50')}>
                          {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-r bg-blue-600"></div>}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{truncateSidebarTitle(conversationTitle)}</p>
                            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{formatConversationDate(conversation.updated_at)}</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); startInlineRenameConversation(conversation); }}>
                                  <Pencil className="mr-2 h-3.5 w-3.5" />Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleTogglePinConversation(conversation); }}>
                                  <Pin className="mr-2 h-3.5 w-3.5" />Pin
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onSelect={(e) => { e.preventDefault(); openDeleteConversationCard(conversation); }}>
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                  </div>
                </div>
              )}
            </div>
              );
              })}
              {displayedConversations.length > 20 && (
                <div className="px-2 pt-1">
                  <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setShowAllConversations((v) => !v)}>
                    {showAllConversations ? 'Show less' : `Show ${displayedConversations.length - 20} more`}
                  </Button>
                </div>
              )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.10),_transparent_40%),linear-gradient(180deg,_rgba(255,255,255,0.97),_rgba(248,250,252,0.98))] dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_35%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]">

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside aria-hidden={!sidebarOpen} className={cn('fixed inset-y-0 left-0 z-40 flex w-[min(320px,85vw)] flex-col transition-transform duration-300 ease-in-out md:static md:z-auto md:w-72 md:translate-x-0 md:transition-none md:p-3 2xl:w-80', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden bg-card/80 backdrop-blur-xl md:rounded-2xl md:border md:border-border/50')}>
          {/* Header */}
          <div className="px-4 pt-4 pb-0">
            <div className="flex items-center justify-between pb-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Support chat</p>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-border/70" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
                <X className="h-3 w-3" />
              </Button>
            </div>

            {/* New Chat Button */}
            <Button type="button" className="w-full h-9 rounded-lg text-sm font-medium mb-3" onClick={handleCreateNewChat}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New chat
            </Button>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search conversations…"
                className="h-8 pl-8 pr-3 text-xs rounded-lg border-border/50 bg-background/50"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border/50"></div>

          {/* List */}
          <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden">
            <div className="px-2 py-2 pr-4">
              {/* Pinned Section */}
              {displayedConversations.some((c) => isConversationPinned(c)) && (
                <>
                  <div className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">Pinned</div>
                  <div className="space-y-0.5">
                    {displayedConversations
                      .filter((c) => isConversationPinned(c))
                      .map((conversation) => {
                        const isActive = selectedId === conversation.id && !startingFresh;
                        const conversationTitle = getConversationTitle(conversation);
                        return (
                          <div
                            key={conversation.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelectConversation(conversation.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectConversation(conversation.id); } }}
                            className={cn(
                              'group relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors',
                              isActive ? 'bg-muted' : 'hover:bg-muted/50',
                            )}
                          >
                            {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-r bg-blue-600"></div>}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">{truncateSidebarTitle(conversationTitle)}</p>
                              <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{formatConversationDate(conversation.updated_at)}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                  >
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); startInlineRenameConversation(conversation); }}>
                                    <Pencil className="mr-2 h-3.5 w-3.5" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleTogglePinConversation(conversation); }}>
                                    <PinOff className="mr-2 h-3.5 w-3.5" />
                                    Unpin
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onSelect={(e) => { e.preventDefault(); openDeleteConversationCard(conversation); }}>
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </>
              )}

              {/* Recent Section */}
              {conversationsLoading ? (
                <div className="p-2">
                  <TableSkeleton rows={4} cols={1} />
                </div>
              ) : conversationsError ? (
                <ErrorState message={normalizeError(conversationsError)} onRetry={() => refetchConversations()} />
              ) : displayedConversations.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">No conversations yet</div>
              ) : (
                <>
                  {displayedConversations.some((c) => !isConversationPinned(c)) && (
                    <div className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mt-2">Recent</div>
                  )}
                  <div className="space-y-0.5">
                    {displayedConversations
                      .filter((c) => !isConversationPinned(c))
                      .map((conversation) => {
                        const isActive = selectedId === conversation.id && !startingFresh;
                        const conversationTitle = getConversationTitle(conversation);
                        const isRenaming = renamingConversationId === conversation.id;
                        return (
                          <div key={conversation.id}>
                            {isRenaming ? (
                              <div className="px-2 py-2">
                                <Input
                                  value={renameDraft}
                                  onChange={(e) => {
                                    setRenameDraft(e.target.value);
                                    if (renameError) setRenameError(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void handleRenameConversation(conversation, renameDraft);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelInlineRenameConversation();
                                    }
                                  }}
                                  placeholder={conversationTitle}
                                  autoFocus
                                  className="h-7 text-xs"
                                />
                                {renameError && <p className="mt-1 text-xs text-destructive">{renameError}</p>}
                              </div>
                            ) : (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => handleSelectConversation(conversation.id)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectConversation(conversation.id); } }}
                                className={cn(
                                  'group relative w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left transition-colors',
                                  isActive ? 'bg-muted' : 'hover:bg-muted/50',
                                )}
                              >
                                {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-r bg-blue-600"></div>}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground truncate">{truncateSidebarTitle(conversationTitle)}</p>
                                  <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{formatConversationDate(conversation.updated_at)}</p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                      >
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-40">
                                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); startInlineRenameConversation(conversation); }}>
                                        <Pencil className="mr-2 h-3.5 w-3.5" />
                                        Rename
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void handleTogglePinConversation(conversation); }}>
                                        <Pin className="mr-2 h-3.5 w-3.5" />
                                        Pin
                                      </DropdownMenuItem>
                                      <DropdownMenuItem className="text-destructive" onSelect={(e) => { e.preventDefault(); openDeleteConversationCard(conversation); }}>
                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                        Delete
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative border-b border-border/70 bg-background/84 px-3 py-3 backdrop-blur sm:px-4">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full md:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open conversations"><Menu className="h-4 w-4" /></Button>
            {!sidebarOpen && (
              <Button type="button" variant="ghost" size="icon" className="hidden h-9 w-9 rounded-full md:inline-flex" onClick={() => setSidebarOpen(true)} aria-label="Expand sidebar"><Menu className="h-4 w-4" /></Button>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground sm:text-2xl">{introMode ? 'New conversation' : getConversationTitle(selectedConversation)}</h1>
              <p className="mt-0.5 hidden max-w-2xl text-sm text-muted-foreground sm:block">Ask a question, follow up on an existing ticket, or keep the discussion going.</p>
              {conversationsRefreshing && <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Syncing</span>}
            </div>
            <div className="hidden flex-nowrap items-center justify-end gap-2 md:flex">
              <Button type="button" variant="outline" className={CLIENT_ACTION_BUTTON_CLASS} onClick={() => navigate('/support-call')}><PhoneCall className="mr-2 h-4 w-4" />Start call</Button>
              <Button type="button" variant="secondary" className={CLIENT_ACTION_BUTTON_CLASS} onClick={handleCreateNewChat}><Plus className="mr-2 h-4 w-4" />New chat</Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full md:hidden"><MoreHorizontal className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={handleCreateNewChat}><Plus className="mr-2 h-4 w-4" />New chat</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/support-call')}><PhoneCall className="mr-2 h-4 w-4" />Start call</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {screenShareError && <p className="mx-auto mt-2 max-w-5xl truncate text-xs text-rose-600 max-sm:px-4">{screenShareError}</p>}
          {isScreenSharing && (
            <p className="mx-auto mt-2 max-w-5xl truncate text-xs text-muted-foreground max-sm:px-4">
              Live screen analysis - frame #{Math.max(1, screenFrameNumber)}{lastScreenAnalysisAt ? ` - updated ${formatScreenShareStatusTime(lastScreenAnalysisAt)}` : ''}{isAnalyzingScreen ? ' - analyzing...' : ''}{screenAnalysisText ? ` - ${screenAnalysisText}` : ''}
            </p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-hidden">
          {conversationsError ? (
            <ErrorState message={normalizeError(conversationsError)} onRetry={() => refetchConversations()} />
          ) : messagesError ? (
            <ErrorState message={normalizeError(messagesError)} onRetry={() => refetchMessages()} />
          ) : introMode ? (
            <ScrollArea className="h-full">
              <ClientConversationIntro userName={user?.name ?? 'there'} onStartPrompt={(value) => handleSend({ seedText: value })} isPending={isSendingMessage || recordingState === 'recording'} />
            </ScrollArea>
          ) : (
            <ScrollArea ref={threadScrollAreaRef} className="h-full">
              <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6">
                {messagesLoading ? (
                  <TableSkeleton rows={6} cols={1} />
                ) : renderedMessages.length === 0 ? (
                  <div className="mx-auto flex max-w-xl flex-col items-center rounded-[2rem] border border-dashed border-border/70 bg-card/70 px-6 py-10 text-center sm:px-8 sm:py-12">
                    <MessageSquareText className="h-8 w-8 text-muted-foreground sm:h-10 sm:w-10" />
                    <h3 className="mt-3 text-base font-semibold sm:mt-4 sm:text-lg">No replies yet</h3>
                    <p className="mt-2 text-sm text-muted-foreground">This thread is open. Send the next message below and keep the conversation moving.</p>
                  </div>
                ) : (
                  renderedMessages.map((message) => (
                    <ClientMessageBubble key={message.id} message={message} isOwn={ownSenderIds.has(message.sender_id)} isStreaming={deferredStreamingAssistantMessage?.id === message.id} />
                  ))
                )}
                {showPreparingResponse && <AiPreparingResponseBubble />}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="bg-transparent px-4 pb-4 pt-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto max-w-5xl">
            <div className="rounded-[1.75rem] border border-border/50 bg-card/70 p-2 shadow-[0_24px_70px_-44px_rgba(15,23,42,0.7)] backdrop-blur-xl sm:p-2.5">
              <input ref={attachmentInputRef} type="file" className="hidden" accept="image/*,audio/*,.pdf,.txt,.doc,.docx,.csv,.xls,.xlsx" onChange={handleAttachmentPicked} />
              {selectedAttachment && (
                <div className="mb-2 flex items-center justify-between gap-3 rounded-[1.1rem] border border-border/50 bg-background/60 px-3 py-2 backdrop-blur-sm">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{selectedAttachment.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {getAttachmentKind(selectedAttachment.type) === 'image' ? 'Image ready to send' : getAttachmentKind(selectedAttachment.type) === 'audio' ? 'Voice or audio file ready to send' : 'File ready to send'}
                      {' • '}{formatFileSize(selectedAttachment.size)}
                    </p>
                  </div>
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setSelectedAttachment(null)} aria-label="Remove attachment"><X className="h-4 w-4" /></Button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" disabled={isSendingMessage || recordingState === 'recording'} onClick={() => attachmentInputRef.current?.click()} aria-label="Attach a file"><Paperclip className="h-4 w-4" /></Button>
                <Textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask anything" className="h-9 min-h-0 max-h-9 flex-1 resize-none rounded-full border-0 bg-transparent px-3 py-1.5 text-sm leading-5 text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" size="icon" variant={recordingState === 'recording' ? 'destructive' : 'ghost'} className={cn('h-9 w-9 rounded-full', recordingState === 'recording' ? '' : 'text-muted-foreground hover:bg-muted hover:text-foreground')} disabled={recordingState === 'processing' || sendMutation.isPending} onClick={() => void handleRecordVoice()} aria-label={recordingState === 'recording' ? 'Stop voice recording' : 'Record voice message'}>
                    {recordingState === 'recording' ? <Square className="h-4 w-4" /> : recordingState === 'processing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                  </Button>
                  <Button type="button" size="icon" className="h-9 w-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground" disabled={(!draft.trim() && !selectedAttachment) || isSendingMessage || recordingState === 'recording'} onClick={() => handleSend()} aria-label="Send message">
                    {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2">
              <p className="text-xs text-muted-foreground">Press Enter to send and Shift + Enter for a new line.</p>
              {recordingState === 'recording' && <p className="text-xs font-medium text-destructive">Recording voice message. Tap the mic again to stop.</p>}
              {recordingState === 'processing' && <p className="text-xs font-medium text-muted-foreground">Transcribing your voice message before sending.</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AiPreparingResponseBubble() {
  return (
    <div className="flex items-center gap-2 justify-start sm:gap-3">
      <Avatar className="h-8 w-8 border border-border/70 bg-background shadow-sm sm:h-10 sm:w-10">
        <AvatarFallback className="bg-secondary/85 text-secondary-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" /></AvatarFallback>
      </Avatar>
      <div className="max-w-[min(32rem,88%)] py-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Support</span>
          <span>&middot;</span>
          <span>AI is preparing a response</span>
        </div>
        <div className="mt-2 flex items-center gap-2 pl-0.5" aria-label="AI is typing">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/85 shadow-[0_0_0_4px_rgba(59,130,246,0.10)]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/65 [animation-delay:150ms]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/45 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function ClientConversationIntro({ userName, onStartPrompt, isPending }: { userName: string; onStartPrompt: (value: string) => void; isPending: boolean }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Welcome back, {userName.split(' ')[0]}.</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">This interface is designed to feel like a focused chat workspace: your history on the left, the current thread in the center, and one composer for every follow-up.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {CLIENT_STARTERS.map((prompt) => (
          <button key={prompt} type="button" onClick={() => onStartPrompt(prompt)} disabled={isPending} className="rounded-[1.4rem] border border-border/70 bg-card/80 p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Sparkles className="h-4 w-4 text-primary" />Try this</div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{prompt}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ClientMessageBubble({ message, isOwn, isStreaming = false }: { message: ChatMessage; isOwn: boolean; isStreaming?: boolean }) {
  const audioOnlyMessage = hasAudioAttachment(message);
  const displayContent = getVisibleMessageContent(message);
  const resolvedTextContent = isOwn ? displayContent || message.content : sanitizeIncomingSupportMessage(displayContent || message.content);
  const showStandaloneAttachment = Boolean(message.attachment_filename) && !audioOnlyMessage;
  const showTextBubble = Boolean(displayContent) || !message.attachment_filename;

  return (
    <div className={cn('flex items-end gap-3', isOwn ? 'justify-end' : 'justify-start')}>
      {!isOwn && (
        <Avatar className="h-8 w-8 border border-border/70 bg-background sm:h-10 sm:w-10">
          <AvatarFallback className="bg-secondary text-secondary-foreground"><Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></AvatarFallback>
        </Avatar>
      )}
      <div className={cn('max-w-[min(46rem,88%)]', isOwn ? 'items-end' : 'items-start')}>
        <div className={cn('mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground sm:mb-2 sm:gap-2', isOwn ? 'justify-end' : 'justify-start')}>
          <span className="font-medium text-foreground">{isOwn ? 'You' : 'Support'}</span>
          <span>·</span>
          <span>{formatMessageTime(message.created_at)}</span>
        </div>
        <div>
          {audioOnlyMessage ? (
            <MessageAttachmentPreview message={message} isOwn={isOwn} standalone />
          ) : (
            <div className={cn('flex flex-col gap-2', isOwn ? 'items-end' : 'items-start')}>
              {showStandaloneAttachment && <MessageAttachmentPreview message={message} isOwn={isOwn} standalone />}
              {showTextBubble && (
                <div className={cn('whitespace-pre-wrap rounded-[1.6rem] px-3.5 py-2.5 text-sm leading-6 shadow-sm sm:px-4 sm:py-3 sm:leading-7', isOwn ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border/70 bg-card/90 text-foreground')}>
                  <div>
                    {resolvedTextContent}
                    {isStreaming && <span className="ml-1 inline-block animate-pulse align-baseline opacity-60">|</span>}
                  </div>
                  {!showStandaloneAttachment && <MessageAttachmentPreview message={message} isOwn={isOwn} />}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {isOwn && (
        <Avatar className="h-8 w-8 border border-primary/20 bg-primary/10 sm:h-10 sm:w-10">
          <AvatarFallback className="bg-primary/10 text-primary"><UserCircle2 className="h-4 w-4 sm:h-5 sm:w-5" /></AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

function MessageAttachmentPreview({ message, isOwn, standalone = false }: { message: ChatMessage; isOwn: boolean; standalone?: boolean }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const attachmentKind = getAttachmentKind(message.attachment_content_type);
  const hasAttachment = Boolean(message.attachment_filename);
  const { data: attachmentBlob, isLoading, error } = useQuery({
    queryKey: ['message-attachment', message.conversation_id, message.id],
    queryFn: () => conversationsApi.attachmentBlob(message.conversation_id, message.id),
    enabled: hasAttachment && !message.local_attachment_url && !isTemporaryConversationId(message.conversation_id),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!attachmentBlob) { setDownloadUrl(null); return; }
    const objectUrl = URL.createObjectURL(attachmentBlob);
    setDownloadUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachmentBlob]);

  if (!hasAttachment) return null;
  const resolvedUrl = message.local_attachment_url ?? downloadUrl;

  if (attachmentKind === 'image') {
    const cardClassName = cn(standalone ? '' : 'mt-3', 'w-[min(15rem,72vw)] overflow-hidden rounded-[1.6rem] p-1.5 shadow-sm sm:w-[17rem]', isOwn ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border border-border/70 bg-card/90 text-foreground');
    return (
      <div className={cardClassName}>
        {resolvedUrl ? <img src={resolvedUrl} alt={message.attachment_filename ?? 'Attached image'} className="max-h-[20rem] w-full rounded-[1.2rem] object-cover" />
          : error ? <p className={cn('px-3 py-4 text-xs', isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground')}>Image preview is unavailable right now.</p>
          : <p className={cn('px-3 py-4 text-xs', isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{isLoading ? 'Loading image...' : 'Preparing image...'}</p>}
      </div>
    );
  }

  if (attachmentKind === 'audio') {
    const audioBubbleClassName = cn(standalone ? '' : 'mt-3', 'w-[18rem] max-w-full rounded-[1.6rem] px-3 py-3 shadow-sm sm:w-[22rem]', isOwn ? 'rounded-br-md bg-primary text-primary-foreground' : 'border border-border/70 bg-card/90 text-foreground');
    return (
      <div className={audioBubbleClassName} aria-label="Voice message">
        {resolvedUrl ? <audio controls className={cn('block h-12 w-full', isOwn && 'chat-audio-player chat-audio-player-own')} preload="metadata"><source src={resolvedUrl} type={message.attachment_content_type ?? 'audio/webm'} />Your browser does not support the audio element.</audio>
          : error ? <p className="text-xs opacity-80">Audio preview is unavailable right now.</p>
          : <p className="text-xs opacity-80">{isLoading ? 'Loading audio...' : 'Preparing audio...'}</p>}
      </div>
    );
  }

  const cardClassName = cn(standalone ? '' : 'mt-3', 'w-[min(22rem,72vw)] rounded-[1.3rem] px-3 py-3 shadow-sm', isOwn ? 'rounded-br-md bg-primary text-primary-foreground' : 'border border-border/70 bg-card/90 text-foreground');
  const fileBadgeLabel = getAttachmentBadgeLabel(message);
  const fileCardContent = (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', isOwn ? 'bg-white/14 text-primary-foreground' : 'bg-secondary text-secondary-foreground')}><FileIcon className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[0.98rem] font-semibold leading-6', isOwn ? 'text-primary-foreground' : 'text-foreground')}>{message.attachment_filename}</p>
        <p className={cn('text-sm', isOwn ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{fileBadgeLabel}</p>
      </div>
      {resolvedUrl && <div className={cn('flex h-9 w-9 items-center justify-center rounded-full transition-colors', isOwn ? 'bg-white/10 text-primary-foreground/85 group-hover:bg-white/20 group-hover:text-primary-foreground' : 'bg-secondary text-muted-foreground group-hover:bg-secondary/80 group-hover:text-foreground')}><Download className="h-4 w-4" /></div>}
    </div>
  );

  if (resolvedUrl) return <a href={resolvedUrl} download={message.attachment_filename ?? undefined} className={cn(cardClassName, 'group block transition-transform hover:-translate-y-0.5')} aria-label={`Download ${message.attachment_filename ?? 'attachment'}`}>{fileCardContent}</a>;
  return (
    <div className={cardClassName}>
      {fileCardContent}
      {!resolvedUrl && !error && <p className={cn('mt-2 text-xs', isOwn ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{isLoading ? 'Loading file...' : 'Preparing file...'}</p>}
      {error && <p className={cn('mt-2 text-xs', isOwn ? 'text-primary-foreground/75' : 'text-muted-foreground')}>This file could not be loaded.</p>}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function renderConversationSnippet(template: string, context: { conversationId: string; customerId: string | null; latestCustomerMessage: string; currentDraft: string }) {
  const customerLabel = (() => {
    const id = (context.customerId || '').trim();
    if (!id) return 'Customer';
    if (id.includes('@')) return id.split('@')[0] || 'Customer';
    return `Customer ${id.slice(0, 8)}`;
  })();
  const dictionary: Record<string, string> = { customer_name: customerLabel, customer_id: context.customerId || '', conversation_id: context.conversationId, latest_customer_message: context.latestCustomerMessage, assisted_draft: context.currentDraft, current_draft: context.currentDraft };
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, token: string) => dictionary[token.trim().toLowerCase()] ?? '');
}

function truncateSidebarTitle(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length <= 3) return text;
  return words.slice(0, 3).join(' ') + '...';
}

function getConversationTitle(conversation: Conversation | null | undefined) {
  if (!conversation) return 'New conversation';
  const subject = conversation.subject?.trim();
  if (subject) return subject;
  return `Conversation ${conversation.id.slice(0, 8)}`;
}

function visiblePollingInterval(intervalMs: number): number | false {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
  return intervalMs;
}

function upsertConversationList(current: Conversation[], conversation: Conversation) {
  const existing = current.filter((item) => item.id !== conversation.id);
  return [conversation, ...existing].sort(sortConversationsByPinAndUpdated);
}

function removeConversationList(current: Conversation[], conversationId: string) {
  return current.filter((item) => item.id !== conversationId);
}

function isConversationPinned(conversation: Conversation | null | undefined) {
  return Boolean(conversation?.is_pinned);
}

function isChatConversation(conversation: Conversation | null | undefined) {
  return String(conversation?.channel ?? '').trim().toUpperCase() === 'CHAT';
}

function sortConversationsByPinAndUpdated(left: Conversation, right: Conversation) {
  const leftPinned = isConversationPinned(left); const rightPinned = isConversationPinned(right);
  if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
  const leftUpdatedAt = Date.parse(left.updated_at); const rightUpdatedAt = Date.parse(right.updated_at);
  const leftTimestamp = Number.isNaN(leftUpdatedAt) ? 0 : leftUpdatedAt; const rightTimestamp = Number.isNaN(rightUpdatedAt) ? 0 : rightUpdatedAt;
  return rightTimestamp - leftTimestamp;
}

function buildConversationSubject(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (!compact) return 'New support chat';
  return compact.length > 72 ? `${compact.slice(0, 72).trim()}...` : compact;
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated recently';
  const now = new Date(); const diffMs = now.getTime() - date.getTime(); const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function matchesOperatorConversationTab(statusRaw: string | null | undefined, tab: OperatorConversationsTab) {
  const status = String(statusRaw ?? '').trim().toLowerCase();
  if (tab === 'all') return true;
  if (tab === 'open') return status === 'open' || status === 'new';
  if (tab === 'active') return status === 'in_progress' || status === 'pending' || status === 'escalated';
  return status === 'resolved' || status === 'closed';
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatScreenShareStatusTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isTemporaryConversationId(value: string | null | undefined) {
  return Boolean(value && value.startsWith(TEMP_CONVERSATION_PREFIX));
}

function isOwnMessage(message: ChatMessage, userId: string | undefined) {
  return Boolean(userId && message.sender_id === userId);
}

function isServerMatch(serverMessage: ChatMessage, queuedMessage: ChatMessage, userId: string | undefined) {
  if (!userId || serverMessage.sender_id !== userId) return false;
  const serverHasAttachment = Boolean(serverMessage.attachment_filename); const queuedHasAttachment = Boolean(queuedMessage.attachment_filename);
  if (serverHasAttachment !== queuedHasAttachment) return false;
  if (serverHasAttachment && serverMessage.attachment_filename !== queuedMessage.attachment_filename) return false;
  return serverMessage.content === queuedMessage.content;
}

function mergeMessages(serverMessages: ChatMessage[], queuedMessages: ChatMessage[]) {
  const merged = [...serverMessages]; const seenIds = new Set(serverMessages.map((m) => m.id));
  queuedMessages.forEach((m) => { if (seenIds.has(m.id)) return; merged.push(m); });
  return merged.sort((l, r) => compareMessageCreatedAt(l.created_at, r.created_at));
}

function compareMessageCreatedAt(leftCreatedAt: string, rightCreatedAt: string) {
  const leftTime = Date.parse(leftCreatedAt); const rightTime = Date.parse(rightCreatedAt);
  const leftIsValid = Number.isFinite(leftTime); const rightIsValid = Number.isFinite(rightTime);
  if (leftIsValid && rightIsValid) return leftTime - rightTime;
  if (leftIsValid) return 1;
  if (rightIsValid) return -1;
  return leftCreatedAt.localeCompare(rightCreatedAt);
}

function getAttachmentKind(contentType: string | null | undefined): 'image' | 'audio' | 'file' {
  if (contentType?.startsWith('image/')) return 'image';
  if (contentType?.startsWith('audio/')) return 'audio';
  return 'file';
}

function hasAudioAttachment(message: Pick<ChatMessage, 'attachment_filename' | 'attachment_content_type'>) {
  return Boolean(message.attachment_filename && getAttachmentKind(message.attachment_content_type) === 'audio');
}

function getVisibleMessageContent(message: Pick<ChatMessage, 'content' | 'attachment_filename' | 'attachment_content_type'>) {
  const content = message.content.trim(); if (!content) return '';
  if (!message.attachment_filename) return content;
  const normalized = content.toLowerCase(); const filename = message.attachment_filename.toLowerCase(); const attachmentKind = getAttachmentKind(message.attachment_content_type);
  if (attachmentKind === 'image' && normalized === `shared an image: ${filename}`) return '';
  if (attachmentKind === 'audio' && normalized === `sent a voice message: ${filename}`) return '';
  if (attachmentKind === 'file' && normalized === `shared a file: ${filename}`) return '';
  return content;
}

function sanitizeIncomingSupportMessage(content: string) {
  return content.replace(/^[!.,:;\-\u2022]+\s*/, '').trimStart();
}

function getAttachmentBadgeLabel(message: Pick<ChatMessage, 'attachment_filename' | 'attachment_content_type' | 'attachment_size'>) {
  const filename = message.attachment_filename ?? ''; const suffix = filename.includes('.') ? filename.split('.').pop()?.trim() ?? '' : '';
  if (suffix) return suffix.toUpperCase();
  const contentType = (message.attachment_content_type ?? '').trim().toLowerCase();
  if (contentType === 'application/pdf') return 'PDF';
  if (contentType.startsWith('text/')) return 'TEXT';
  if (contentType.startsWith('application/')) return 'FILE';
  return formatFileSize(message.attachment_size);
}

function buildOutgoingMessageContent(content: string, file: File | null | undefined) {
  const trimmed = content.trim(); if (trimmed) return trimmed;
  if (!file) return '';
  if (getAttachmentKind(file.type) === 'image') return `Shared an image: ${file.name}`;
  if (getAttachmentKind(file.type) === 'audio') return `Sent a voice message: ${file.name}`;
  return `Shared a file: ${file.name}`;
}

function formatFileSize(size: number | null | undefined) {
  if (!size || size <= 0) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getPreferredRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
}

function getAudioFileExtension(mimeType: string) {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

function stopMediaStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}