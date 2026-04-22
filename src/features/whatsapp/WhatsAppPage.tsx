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
import { conversationsApi } from '@/shared/api/conversations';
import { normalizeError } from '@/shared/api/client';
import { usersApi } from '@/shared/api/users';
import { whatsappApi } from '@/shared/api/whatsapp';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TableSkeleton } from '@/shared/components/Skeletons';
import type {
  ConversationAutoReplyPolicy,
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

const WHATSAPP_QUICK_ACTION_BUTTON_CLASS = 'h-9 rounded-full px-3.5';

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Now';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getConversationLabel(conversation: WhatsAppInboxConversation) {
  return (
    conversation.contact_name
    || conversation.contact_phone
    || conversation.subject
    || conversation.id.slice(0, 8)
  );
}

function hasIaAutoSignal(conversation: WhatsAppInboxConversation) {
  const content = `${conversation.subject || ''} ${conversation.last_message || ''}`.toLowerCase();
  return /(assistant|bot|ia|auto)/.test(content);
}

function hasTicketSignal(conversation: WhatsAppInboxConversation) {
  const content = `${conversation.subject || ''} ${conversation.last_message || ''}`.toLowerCase();
  return /(ticket|tk-|#\d+)/.test(content);
}

function formatAutoReplyBlockReason(reason: string | null | undefined) {
  switch (reason) {
    case 'channel_disabled':
      return 'Blocked by channel policy';
    case 'conversation_disabled':
      return 'Blocked by conversation toggle';
    case 'pause_active':
      return 'Paused by timer';
    default:
      return 'Not blocked';
  }
}

function formatPauseUntilLabel(value: string | null | undefined) {
  if (!value) {
    return 'not scheduled';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'soon';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatSlaCountdown(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) {
    return 'soon';
  }

  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function formatResolutionStateLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolutionStateBadgeClass(value: string) {
  switch (value) {
    case 'resolved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'partially_resolved':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'in_progress':
      return 'border-blue-200 bg-blue-50 text-blue-700';
    case 'unresolved':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-muted bg-muted/40 text-muted-foreground';
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
    const customerId = (context.customerId || '').trim();
    if (!customerId) {
      return 'Customer';
    }
    if (customerId.includes('@')) {
      return customerId.split('@')[0] || 'Customer';
    }
    return `Customer ${customerId.slice(0, 8)}`;
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
    const key = token.trim().toLowerCase();
    return dictionary[key] ?? '';
  });
}
export function WhatsAppPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
  const canReplyWhatsApp = user?.role === 'agent' || user?.role === 'admin'
    ? user.can_reply_whatsapp
    : true;
  const shouldCheckConversationSuspension =
    Boolean(selectedConversationId) && user?.role === 'agent' && Boolean(user?.id);

  const conversationSuspensionQ = useQuery({
    queryKey: ['wa-agent-reply-suspension-self', selectedConversationId, user?.id],
    queryFn: () =>
      conversationsApi.agentReplySuspension(
        selectedConversationId as string,
        user?.id as string,
      ),
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
    queryFn: () =>
      whatsappApi.inbox({
        unreadOnly: activeTab === 'unread',
        limit: 200,
      }),
    refetchInterval: 10_000,
  });

  const conversations = useMemo(() => inboxQ.data?.conversations ?? [], [inboxQ.data]);

  const filteredConversations = useMemo(() => {
    const searchText = search.trim().toLowerCase();
    return conversations
      .filter((conversation) => {
        if (activeTab === 'unread') {
          return conversation.unread_count > 0;
        }
        if (activeTab === 'ia') {
          return hasIaAutoSignal(conversation);
        }
        if (activeTab === 'tickets') {
          return hasTicketSignal(conversation);
        }
        return true;
      })
      .filter((conversation) => {
        if (!searchText) {
          return true;
        }

        const haystack = [
          getConversationLabel(conversation),
          conversation.contact_phone || '',
          conversation.subject || '',
          conversation.last_message || '',
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(searchText);
      });
  }, [activeTab, conversations, search]);

  const deepLinkedConversation = useMemo(() => {
    if (!deepLinkedConversationId) {
      return null;
    }

    return (
      conversations.find(
        (conversation) => conversation.id.toLowerCase() === deepLinkedConversationId,
      ) ?? null
    );
  }, [conversations, deepLinkedConversationId]);

  useEffect(() => {
    if (!deepLinkedConversationId) {
      if (appliedDeepLinkId) {
        setAppliedDeepLinkId(null);
      }
      return;
    }

    if (appliedDeepLinkId === deepLinkedConversationId) {
      return;
    }

    if (activeTab !== 'all') {
      setActiveTab('all');
      return;
    }

    if (search.trim()) {
      setSearch('');
      return;
    }

    if (!deepLinkedConversation) {
      return;
    }

    setSelectedConversationId(deepLinkedConversation.id);
    setAppliedDeepLinkId(deepLinkedConversationId);
  }, [
    activeTab,
    appliedDeepLinkId,
    deepLinkedConversation,
    deepLinkedConversationId,
    search,
  ]);

  useEffect(() => {
    if (!selectedConversationId && filteredConversations.length > 0) {
      setSelectedConversationId(filteredConversations[0].id);
      return;
    }

    if (
      selectedConversationId
      && !filteredConversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(filteredConversations[0]?.id ?? null);
    }
  }, [filteredConversations, selectedConversationId]);

  const selectedConversation =
    filteredConversations.find((conversation) => conversation.id === selectedConversationId) || null;
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
    queryFn: () =>
      conversationsApi.listSnippets({
        channel: 'WHATSAPP',
      }),
    staleTime: 120_000,
  });

  const snippetOptions = useMemo(() => snippetsQ.data?.snippets ?? [], [snippetsQ.data?.snippets]);

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
          ? 'This conversation can auto-reply when channel policy allows it.'
          : 'This conversation now requires manual operator replies.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not update conversation policy',
        description: normalizeError(error),
      });
    },
  });

  const setConversationPauseMut = useMutation({
    mutationFn: (minutes: number) =>
      conversationsApi.setConversationAutoReplyPause(selectedConversationId as string, {
        minutes,
      }),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({
        title: 'AI auto-reply paused',
        description: policy.ai_auto_reply_paused_until
          ? `Auto-reply paused until ${formatPauseUntilLabel(policy.ai_auto_reply_paused_until)}.`
          : 'Auto-reply pause cleared.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not pause auto-reply',
        description: normalizeError(error),
      });
    },
  });

  const clearConversationPauseMut = useMutation({
    mutationFn: () => conversationsApi.clearConversationAutoReplyPause(selectedConversationId as string),
    onSuccess: (policy) => {
      syncConversationPolicy(policy);
      toast({
        title: 'Auto-reply pause cleared',
        description: 'AI auto-replies can resume if other policies allow it.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not clear pause',
        description: normalizeError(error),
      });
    },
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
    const rawMessages = threadQ.data?.messages ?? [];
    return [...rawMessages].sort((left, right) => {
      const leftTs = Date.parse(left.created_at || '');
      const rightTs = Date.parse(right.created_at || '');

      const leftHasTs = !Number.isNaN(leftTs);
      const rightHasTs = !Number.isNaN(rightTs);
      if (leftHasTs && rightHasTs && leftTs !== rightTs) {
        return leftTs - rightTs;
      }
      if (leftHasTs !== rightHasTs) {
        return leftHasTs ? -1 : 1;
      }

      return left.id.localeCompare(right.id);
    });
  }, [threadQ.data?.messages]);

  const latestCustomerMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => {
          if (message.direction) {
            return message.direction === 'inbound';
          }
          return Boolean(selectedConversation?.user_id) && message.sender_id === selectedConversation.user_id;
        }) ?? null,
    [messages, selectedConversation?.user_id],
  );

  const latestMessage = messages[messages.length - 1] ?? null;
  const conversationPolicyMutating =
    setConversationAutoReplyMut.isPending
    || setConversationPauseMut.isPending
    || clearConversationPauseMut.isPending;
  const linkedTicketId = conversationSla?.escalation_ticket_id?.trim() || null;

  const openConversationTicket = useCallback(() => {
    if (!linkedTicketId) {
      return;
    }

    navigate(`/tickets/${linkedTicketId}`);
  }, [linkedTicketId, navigate]);

  const unreadForSelection = selectedConversation?.unread_count ?? 0;

  const sendMut = useMutation({
    mutationFn: () => {
      const content = reply.trim();
      const usedAssistedDraft = hasPendingAssistedDraft;
      const assistedDraftEdited =
        usedAssistedDraft && pendingAssistedDraftText !== null
          ? normalizeDraftTelemetryText(content)
            !== normalizeDraftTelemetryText(pendingAssistedDraftText)
          : undefined;

      return whatsappApi.reply(selectedConversationId as string, content, {
        usedAssistedDraft,
        assistedDraftEdited,
        assistedDraftGeneratedAt: usedAssistedDraft
          ? pendingAssistedDraftGeneratedAt ?? undefined
          : undefined,
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
      toast({
        variant: 'destructive',
        title: 'Reply failed',
        description: normalizeError(error),
      }),
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
      if (!selectedConversationId) {
        return;
      }

      if (!assistedDraftAvailable) {
        if (showErrors) {
          toast({
            variant: 'destructive',
            title: 'Assisted draft unavailable',
            description: 'Assisted drafts are available for chat conversations only.',
          });
        }
        return;
      }

      try {
        await assistedDraftMut.mutateAsync();
      } catch (error) {
        if (showErrors) {
          toast({
            variant: 'destructive',
            title: 'Could not generate assisted draft',
            description: normalizeError(error),
          });
        }
      }
    },
    [assistedDraftAvailable, assistedDraftMut, selectedConversationId, toast],
  );

  const handleInsertSnippet = useCallback(() => {
    if (!selectedSnippetId) {
      return;
    }

    const snippet = snippetOptions.find((item) => item.id === selectedSnippetId);
    if (!snippet) {
      return;
    }

    const renderedSnippet = renderConversationSnippet(snippet.body, {
      conversationId: selectedConversationId || '',
      customerId: selectedConversation?.user_id || null,
      latestCustomerMessage: latestCustomerMessage?.content || '',
      currentDraft: reply,
    }).trim();

    if (!renderedSnippet) {
      return;
    }

    setReply((currentDraft) => {
      const current = currentDraft.trim();
      if (!current) {
        return renderedSnippet;
      }
      return `${renderedSnippet}\n\n${current}`;
    });

    toast({
      title: 'Snippet inserted',
      description: `${snippet.title} was inserted into the draft.`,
    });
  }, [
    latestCustomerMessage?.content,
    reply,
    selectedConversation?.user_id,
    selectedConversationId,
    selectedSnippetId,
    snippetOptions,
    toast,
  ]);

  useEffect(() => {
    setLastDraftSourceMessageId(null);
    setHasPendingAssistedDraft(false);
    setPendingAssistedDraftText(null);
    setPendingAssistedDraftGeneratedAt(null);
  }, [selectedConversationId]);

  useEffect(() => {
    if (!snippetOptions.length) {
      if (selectedSnippetId) {
        setSelectedSnippetId('');
      }
      return;
    }

    if (!snippetOptions.some((snippet) => snippet.id === selectedSnippetId)) {
      setSelectedSnippetId(snippetOptions[0].id);
    }
  }, [selectedSnippetId, snippetOptions]);

  useEffect(() => {
    if (!assistedDraftMode || !assistedDraftAvailable) {
      return;
    }
    if (!latestCustomerMessage || reply.trim()) {
      return;
    }
    if (sendMut.isPending || assistedDraftMut.isPending) {
      return;
    }
    if (lastDraftSourceMessageId === latestCustomerMessage.id) {
      return;
    }
    void requestAssistedDraft(false);
  }, [
    assistedDraftAvailable,
    assistedDraftMode,
    assistedDraftMut.isPending,
    lastDraftSourceMessageId,
    latestCustomerMessage,
    reply,
    requestAssistedDraft,
    sendMut.isPending,
  ]);

  const markReadMut = useMutation({
    mutationFn: () => whatsappApi.markRead(selectedConversationId as string),
    onSuccess: async (result) => {
      toast({
        title: 'Messages marked as read',
        description: `${result.messages_marked_read} message(s) updated.`,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wa-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['wa-thread', selectedConversationId] }),
      ]);
    },
    onError: (error) =>
      toast({
        variant: 'destructive',
        title: 'Mark read failed',
        description: normalizeError(error),
      }),
  });

  const tabCounts = useMemo(() => {
    const unread = conversations.filter((conversation) => conversation.unread_count > 0).length;
    const ia = conversations.filter((conversation) => hasIaAutoSignal(conversation)).length;
    const tickets = conversations.filter((conversation) => hasTicketSignal(conversation)).length;
    return {
      all: conversations.length,
      unread,
      ia,
      tickets,
    };
  }, [conversations]);

  return (
    <>
      <div className="grid h-[calc(100vh-3rem)] grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-0 flex-col border-r bg-card/60">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">WhatsApp Inbox</h2>
              <p className="text-xs text-muted-foreground">Operator workflow</p>
            </div>
            <div className="flex items-center gap-1">
              {statusQ.data ? (
                statusQ.data.connected ? (
                  <CheckCircle className="h-4 w-4 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
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
                aria-label="Refresh inbox"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="border-b px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {TABS.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  size="sm"
                  variant={activeTab === tab.key ? 'default' : 'ghost'}
                  className="h-8 rounded-full px-3"
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  <span className="ml-1 text-[11px] opacity-80">{tabCounts[tab.key]}</span>
                </Button>
              ))}
            </div>
            <Input
              className="mt-2"
              placeholder="Search contact or message"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {inboxQ.isLoading ? (
              <div className="p-3">
                <TableSkeleton rows={6} cols={1} />
              </div>
            ) : inboxQ.error ? (
              <ErrorState
                message={normalizeError(inboxQ.error)}
                onRetry={() => {
                  void inboxQ.refetch();
                }}
              />
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                title="No conversations"
                description="No WhatsApp conversations match this filter."
              />
            ) : (
              filteredConversations.map((conversation) => {
                const selected = selectedConversationId === conversation.id;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={cn(
                      'group relative w-full border-b px-3.5 py-2.5 text-left transition-all hover:bg-muted/40',
                      selected && 'bg-accent/70 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16)]',
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none absolute bottom-2 top-2 left-0 w-0.5 rounded-r-full bg-primary/80 opacity-0 transition-opacity',
                        selected && 'opacity-100',
                      )}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{getConversationLabel(conversation)}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatDateTime(conversation.last_message_at || conversation.updated_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2.5">
                      <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {conversation.last_message || 'No messages yet'}
                      </p>
                      {conversation.unread_count > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                          {conversation.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col border-r">
          <header className="flex items-center justify-between border-b bg-card/30 px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">
                {selectedConversation ? getConversationLabel(selectedConversation) : 'Select a conversation'}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {selectedConversation?.contact_phone || 'Conversation thread'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedConversation ? (
                <Button
                  type="button"
                  variant="outline"
                  className={WHATSAPP_QUICK_ACTION_BUTTON_CLASS}
                  disabled={unreadForSelection === 0 || markReadMut.isPending}
                  onClick={() => markReadMut.mutate()}
                >
                  {markReadMut.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Mark Read
                </Button>
              ) : null}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!selectedConversation ? (
              <EmptyState title="No conversation selected" description="Choose a contact from the inbox." />
            ) : threadQ.isLoading ? (
              <TableSkeleton rows={5} cols={1} />
            ) : threadQ.error ? (
              <ErrorState
                message={normalizeError(threadQ.error)}
                onRetry={() => {
                  void threadQ.refetch();
                }}
              />
            ) : messages.length === 0 ? (
              <EmptyState title="No messages" description="This conversation has no messages yet." />
            ) : (
              <div className="space-y-2">
                {messages.map((message) => (
                  <ThreadMessageBubble
                    key={message.id}
                    message={message}
                    customerUserId={selectedConversation.user_id}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t bg-card/40 p-3">
            <Collapsible
              open={assistToolsOpen}
              onOpenChange={setAssistToolsOpen}
              className="mb-3 rounded-2xl border bg-background/70 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={assistedDraftMode}
                    onCheckedChange={setAssistedDraftMode}
                    disabled={!assistedDraftAvailable || assistedDraftMut.isPending}
                  />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Assisted draft mode</p>
                    <p className="text-[11px] text-muted-foreground">
                      Generate AI reply suggestions before sending.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-full px-3"
                    disabled={
                      !assistedDraftAvailable
                      || !assistedDraftMode
                      || !latestCustomerMessage
                      || assistedDraftMut.isPending
                    }
                    onClick={() => {
                      void requestAssistedDraft(true);
                    }}
                  >
                    {assistedDraftMut.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                    )}
                    Generate draft
                  </Button>

                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full text-muted-foreground"
                      aria-label={assistToolsOpen ? 'Collapse draft tools' : 'Expand draft tools'}
                    >
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-200',
                          assistToolsOpen && 'rotate-180',
                        )}
                      />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>

              <CollapsibleContent className="mt-3 space-y-2">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <Select
                    value={selectedSnippetId}
                    onValueChange={setSelectedSnippetId}
                    disabled={snippetsQ.isLoading || snippetOptions.length === 0}
                  >
                    <SelectTrigger className="h-9 w-full min-w-0">
                      <SelectValue placeholder="Select a shared snippet" />
                    </SelectTrigger>
                    <SelectContent>
                      {snippetOptions.map((snippet) => (
                        <SelectItem key={snippet.id} value={snippet.id}>
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
                    className="h-9 rounded-full px-3"
                    disabled={!selectedSnippetId || sendMut.isPending}
                    onClick={handleInsertSnippet}
                  >
                    <MessageSquareText className="mr-1 h-3.5 w-3.5" />
                    Insert snippet
                  </Button>

                  {snippetsQ.isLoading ? (
                    <span className="text-[11px] text-muted-foreground">Loading shared snippets...</span>
                  ) : snippetOptions.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      No shared snippets available for this channel yet.
                    </span>
                  ) : null}
                </div>

                {!assistedDraftAvailable ? (
                  <p className="text-xs text-muted-foreground">
                    Assisted drafts are available for chat conversations only.
                  </p>
                ) : !latestCustomerMessage ? (
                  <p className="text-xs text-muted-foreground">
                    Waiting for a customer message before generating a draft.
                  </p>
                ) : null}
              </CollapsibleContent>
            </Collapsible>

            {isConversationReplySuspended ? (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-rose-800">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-xs font-semibold">Reply blocked for this conversation</p>
                  <p className="mt-0.5 text-xs">
                    An admin suspended your replies in this thread.
                    {suspensionReason ? ` Reason: ${suspensionReason}` : ''}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Textarea
                value={reply}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setReply(nextValue);
                  if (!nextValue.trim()) {
                    setHasPendingAssistedDraft(false);
                    setPendingAssistedDraftText(null);
                    setPendingAssistedDraftGeneratedAt(null);
                  }
                }}
                placeholder={
                  !canReplyWhatsApp
                    ? 'Read-only mode is enabled for WhatsApp'
                    : isConversationReplySuspended
                      ? 'Reply is suspended for this conversation'
                      : 'Reply to this WhatsApp thread (Ctrl+Enter to send)'
                }
                className="min-h-[88px] resize-y"
                disabled={!selectedConversation || sendMut.isPending || !canSendWhatsAppReply || conversationSuspensionQ.isLoading}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter'
                    && (event.ctrlKey || event.metaKey)
                    && reply.trim()
                    && selectedConversation
                    && !sendMut.isPending
                    && canSendWhatsAppReply
                    && !conversationSuspensionQ.isLoading
                  ) {
                    event.preventDefault();
                    sendMut.mutate();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-full"
                disabled={!selectedConversation || !reply.trim() || sendMut.isPending || !canSendWhatsAppReply || conversationSuspensionQ.isLoading}
                onClick={() => sendMut.mutate()}
              >
                {sendMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Tip: press Ctrl+Enter (or Cmd+Enter on macOS) to send quickly.
            </p>
            {!canReplyWhatsApp ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Read-only mode: your account cannot send WhatsApp replies.
              </p>
            ) : isConversationReplySuspended ? (
              <p className="mt-2 text-xs text-rose-700">
                Conversation-level block is active. Contact an admin to restore reply access.
              </p>
            ) : null}
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col bg-card/40 lg:flex">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">Conversation Context</h3>
            <p className="text-xs text-muted-foreground">Quick operational metadata</p>
          </div>

          <div className="space-y-3.5 overflow-y-auto p-4 text-sm">
            {!selectedConversation ? (
              <EmptyState title="No context" description="Select a conversation to inspect details." />
            ) : (
              <>
                <Collapsible
                  open={openContextSection === 'customer'}
                  onOpenChange={(open) => {
                    setOpenContextSection(open ? 'customer' : null);
                  }}
                  className="rounded-xl border bg-background/80 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full text-muted-foreground"
                        aria-label={
                          openContextSection === 'customer'
                            ? 'Collapse customer details'
                            : 'Expand customer details'
                        }
                      >
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 transition-transform duration-200',
                            openContextSection === 'customer' && 'rotate-180',
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>

                  <CollapsibleContent className="mt-2 space-y-2">
                    {customerProfileQ.isLoading ? (
                      <p className="text-xs text-muted-foreground">Loading customer profile...</p>
                    ) : customerProfileQ.error ? (
                      <p className="text-xs text-destructive">{normalizeError(customerProfileQ.error)}</p>
                    ) : (
                      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Name</span>
                        <span className="break-words text-sm text-foreground">
                          {customerProfile?.full_name?.trim() || getConversationLabel(selectedConversation)}
                        </span>

                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Email</span>
                        <span className="break-all text-sm text-foreground">
                          {customerProfile?.email?.trim() || 'Not available'}
                        </span>

                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Phone</span>
                        <span className="break-all text-sm text-foreground">
                          {customerProfile?.phone_number?.trim() || selectedConversation.contact_phone || 'Not provided'}
                        </span>

                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">ID</span>
                        <span className="break-all font-mono text-[12px] leading-relaxed text-foreground">
                          {selectedConversation.user_id}
                        </span>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  open={openContextSection === 'ai-control'}
                  onOpenChange={(open) => {
                    setOpenContextSection(open ? 'ai-control' : null);
                  }}
                  className="rounded-xl border bg-background/80 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      AI Control Center
                    </p>
                    <div className="flex items-center gap-1">
                      {conversationAutoReplyQ.isLoading || conversationPolicyMutating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : null}
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-muted-foreground"
                          aria-label={
                            openContextSection === 'ai-control'
                              ? 'Collapse AI control center'
                              : 'Expand AI control center'
                          }
                        >
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 transition-transform duration-200',
                              openContextSection === 'ai-control' && 'rotate-180',
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  <CollapsibleContent className="mt-2 space-y-2">
                    {conversationAutoReplyQ.error ? (
                      <p className="text-xs text-destructive">{normalizeError(conversationAutoReplyQ.error)}</p>
                    ) : conversationPolicy ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {conversationPolicy.effective_ai_auto_reply_enabled
                            ? 'AI auto-reply is active for this conversation.'
                            : `AI auto-reply is blocked: ${formatAutoReplyBlockReason(conversationPolicy.block_reason)}.`}
                        </p>

                        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-2">
                          <div>
                            <p className="text-sm font-medium">Conversation auto-reply</p>
                            <p className="text-xs text-muted-foreground">Persistent per-conversation setting</p>
                          </div>
                          <Switch
                            checked={conversationPolicy.ai_auto_reply_enabled}
                            disabled={!canToggleConversationAutoReply || conversationPolicyMutating}
                            onCheckedChange={(checked) => {
                              setConversationAutoReplyMut.mutate(checked);
                            }}
                          />
                        </div>

                        {!canToggleConversationAutoReply ? (
                          <p className="text-xs text-muted-foreground">
                            Only admins can change the persistent conversation toggle.
                          </p>
                        ) : null}

                        <div>
                          <p className="text-xs text-muted-foreground">Pause timer</p>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full"
                              disabled={!canPauseConversationAutoReply || conversationPolicyMutating}
                              onClick={() => setConversationPauseMut.mutate(30)}
                            >
                              Pause 30m
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full"
                              disabled={!canPauseConversationAutoReply || conversationPolicyMutating}
                              onClick={() => setConversationPauseMut.mutate(120)}
                            >
                              Pause 2h
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full"
                              disabled={!canPauseConversationAutoReply || conversationPolicyMutating}
                              onClick={() => setConversationPauseMut.mutate(24 * 60)}
                            >
                              Pause 24h
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-full"
                              disabled={!canPauseConversationAutoReply || conversationPolicyMutating || !conversationPolicy.ai_auto_reply_paused_until}
                              onClick={() => clearConversationPauseMut.mutate()}
                            >
                              Resume now
                            </Button>
                          </div>

                          {conversationPolicy.ai_auto_reply_paused_until ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Paused until {formatPauseUntilLabel(conversationPolicy.ai_auto_reply_paused_until)}
                            </p>
                          ) : null}

                          {!canPauseConversationAutoReply ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Pause controls are available for agents and admins.
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Select a conversation to inspect AI controls.
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible
                  open={openContextSection === 'ai-summary'}
                  onOpenChange={(open) => {
                    setOpenContextSection(open ? 'ai-summary' : null);
                  }}
                  className="rounded-xl border bg-background/80 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI summary
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-full px-2.5 text-xs"
                        disabled={summaryQ.isFetching}
                        onClick={() => {
                          void summaryQ.refetch();
                        }}
                      >
                        {summaryQ.isFetching ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        )}
                        Refresh
                      </Button>

                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-muted-foreground"
                          aria-label={
                            openContextSection === 'ai-summary'
                              ? 'Collapse AI summary'
                              : 'Expand AI summary'
                          }
                        >
                          <ChevronDown
                            className={cn(
                              'h-3.5 w-3.5 transition-transform duration-200',
                              openContextSection === 'ai-summary' && 'rotate-180',
                            )}
                          />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  <CollapsibleContent className="mt-2 space-y-2">
                    {!summaryQ.data && summaryQ.isLoading ? (
                      <p className="text-sm text-muted-foreground">Generating conversation summary...</p>
                    ) : summaryQ.error && !summaryQ.data ? (
                      <p className="text-sm text-destructive">{normalizeError(summaryQ.error)}</p>
                    ) : summaryQ.data ? (
                      <div className="space-y-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Problem</p>
                          <p className="text-sm">{summaryQ.data.problem_summary}</p>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Resolution state</p>
                          <span
                            className={cn(
                              'mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                              resolutionStateBadgeClass(summaryQ.data.resolution_state),
                            )}
                          >
                            {formatResolutionStateLabel(summaryQ.data.resolution_state)}
                          </span>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {summaryQ.data.resolution_description}
                          </p>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Next action</p>
                          <p className="text-sm text-muted-foreground">{summaryQ.data.next_action}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        AI summary is not available for this conversation yet.
                      </p>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <div className="rounded-xl border bg-background/80 p-3.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Conversation snapshot
                  </p>

                  <div className="mt-2 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Created</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatDateTime(selectedConversation.created_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Updated</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatDateTime(selectedConversation.updated_at)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest message</p>
                      <p className="mt-1 line-clamp-5 text-sm text-muted-foreground">
                        {latestMessage?.content || 'No messages yet'}
                      </p>
                      {latestMessage ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          {formatDateTime(latestMessage.created_at)}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Thread size</p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {messages.length} message(s)
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">SLA</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {conversationSlaQ.isLoading ? (
                          <Badge variant="outline" className="gap-1 rounded-full text-[11px] font-medium">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading SLA
                          </Badge>
                        ) : conversationSla ? (
                          <>
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full text-[11px] font-medium',
                                conversationSla.seconds_remaining !== null && conversationSla.seconds_remaining !== undefined
                                  ? conversationSla.seconds_remaining <= 0
                                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                                    : 'border-sky-300 bg-sky-50 text-sky-700'
                                  : 'text-muted-foreground',
                              )}
                            >
                              {conversationSla.seconds_remaining !== null && conversationSla.seconds_remaining !== undefined
                                ? conversationSla.seconds_remaining <= 0
                                  ? `Overdue ${formatSlaCountdown(Math.abs(conversationSla.seconds_remaining))}`
                                  : `Reply due in ${formatSlaCountdown(conversationSla.seconds_remaining)}`
                                : 'No pending customer reply'}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                'rounded-full text-[11px] font-medium',
                                conversationSla.risk_level === 'critical'
                                  ? 'border-rose-300 bg-rose-50 text-rose-700'
                                  : conversationSla.risk_level === 'high'
                                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                                    : conversationSla.risk_level === 'medium'
                                      ? 'border-orange-300 bg-orange-50 text-orange-700'
                                      : 'border-emerald-300 bg-emerald-50 text-emerald-700',
                              )}
                            >
                              Risk {conversationSla.risk_level.toUpperCase()}
                            </Badge>
                          </>
                        ) : (
                          <Badge variant="outline" className="rounded-full text-[11px] font-medium text-muted-foreground">
                            SLA unavailable
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-4 mt-2 px-4 pb-1 pt-3">
                  <Button
                    type="button"
                    className="h-10 w-full rounded-full shadow-sm"
                    onClick={openConversationTicket}
                    disabled={!linkedTicketId}
                  >
                    <Ticket className="mr-1 h-4 w-4" />
                    View ticket
                  </Button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

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
      {!isUserMessage ? (
        <Avatar className="h-8 w-8 border border-border/70 bg-background">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      ) : null}

      <div
        className={cn(
          'max-w-[72%] rounded-xl px-3 py-2 text-sm',
          isUserMessage
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md border border-border/70 bg-muted text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <div className="mt-1 flex items-center justify-end gap-1">
          <span className={cn('text-[10px]', isUserMessage ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
            {formatDateTime(message.created_at)}
          </span>
          <StatusBadge status={message.is_read ? 'read' : 'sent'} className="text-[10px]" />
        </div>
      </div>

      {isUserMessage ? (
        <Avatar className="h-8 w-8 border border-primary/20 bg-primary/10">
          <AvatarFallback className="bg-primary/10 text-primary">
            <UserCircle2 className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      ) : null}
    </div>
  );
}