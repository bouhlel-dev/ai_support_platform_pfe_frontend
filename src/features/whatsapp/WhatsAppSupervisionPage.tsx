import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Copy, Loader2, MessageCircle, MessageSquare, Shield, UserCheck, UserX } from 'lucide-react';

import { conversationsApi } from '@/shared/api/conversations';
import { usersApi } from '@/shared/api/users';
import { whatsappApi } from '@/shared/api/whatsapp';
import { normalizeError } from '@/shared/api/client';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type {
  Conversation,
  Message,
  WhatsAppInboxConversation,
  WhatsAppThreadMessage,
} from '@/shared/types';

type SupervisionSource = 'whatsapp' | 'conversations';

type SupervisionConversation = {
  id: string;
  user_id: string;
  title: string;
  subtitle: string;
  status: string;
  preview: string | null;
  updated_at: string | null;
  contact_phone: string | null;
};

type SupervisionThreadMessage = {
  id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  is_internal: boolean;
  created_at: string;
  direction: 'inbound' | 'outbound';
};

const SUPERVISION_SOURCE_OPTIONS: Array<{ value: SupervisionSource; label: string }> = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'conversations', label: 'Conversations' },
];

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

function conversationTitle(conversation: WhatsAppInboxConversation) {
  return (
    conversation.contact_name ||
    conversation.contact_phone ||
    conversation.subject ||
    conversation.id.slice(0, 8)
  );
}

function mapWhatsAppConversation(conversation: WhatsAppInboxConversation): SupervisionConversation {
  return {
    id: conversation.id,
    user_id: conversation.user_id,
    title: conversationTitle(conversation),
    subtitle: conversation.contact_phone || conversation.user_id,
    status: conversation.status,
    preview: conversation.last_message || null,
    updated_at: conversation.last_message_at || conversation.updated_at,
    contact_phone: conversation.contact_phone || null,
  };
}

function mapConversationsInbox(conversation: Conversation): SupervisionConversation {
  return {
    id: conversation.id,
    user_id: conversation.user_id,
    title: conversation.subject?.trim() || `Conversation ${conversation.id.slice(0, 8)}`,
    subtitle: conversation.user_id,
    status: conversation.status,
    preview: `${conversation.channel.toUpperCase()} · ${conversation.status.replace(/_/g, ' ')}`,
    updated_at: conversation.updated_at,
    contact_phone: null,
  };
}

function mapWhatsAppThread(
  message: WhatsAppThreadMessage,
  customerUserId: string,
): SupervisionThreadMessage {
  const incoming =
    message.direction ? message.direction === 'inbound' : message.sender_id === customerUserId;

  return {
    id: message.id,
    sender_id: message.sender_id,
    content: message.content,
    is_read: message.is_read,
    is_internal: false,
    created_at: message.created_at,
    direction: incoming ? 'inbound' : 'outbound',
  };
}

function mapConversationThread(message: Message, customerUserId: string): SupervisionThreadMessage {
  return {
    id: message.id,
    sender_id: message.sender_id,
    content: message.content,
    is_read: message.is_read,
    is_internal: message.is_internal,
    created_at: message.created_at,
    direction: message.sender_id === customerUserId ? 'inbound' : 'outbound',
  };
}

function isLikelyIdentifier(value?: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    || normalized.length >= 24
  );
}

function truncateWithDots(value: string, head = 12, tail = 8) {
  const normalized = value.trim();
  if (!normalized) {
    return normalized;
  }

  if (normalized.length <= head + tail + 3) {
    return normalized;
  }

  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`;
}

export function WhatsAppSupervisionPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<SupervisionSource>('whatsapp');
  const [agentSearch, setAgentSearch] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const sourceLabel = source === 'whatsapp' ? 'WhatsApp' : 'Conversations';

  const agentsQ = useQuery({
    queryKey: ['supervision-agents'],
    queryFn: () => usersApi.list({ role: 'AGENT', status: 'ACTIVE', limit: 200 }),
    refetchInterval: 30_000,
  });

  const inboxQ = useQuery({
    queryKey: ['supervision-inbox', source],
    queryFn: async () => {
      if (source === 'whatsapp') {
        const inbox = await whatsappApi.inbox({ limit: 200 });
        return inbox.conversations.map(mapWhatsAppConversation);
      }

      const conversations = await conversationsApi.list({ limit: 200 });
      return conversations.map(mapConversationsInbox);
    },
    refetchInterval: source === 'whatsapp' ? 10_000 : 12_000,
  });

  const agents = useMemo(() => agentsQ.data?.users ?? [], [agentsQ.data]);
  const conversations = useMemo(() => inboxQ.data ?? [], [inboxQ.data]);

  useEffect(() => {
    setConversationSearch('');
    setSelectedConversationId(null);
  }, [source]);

  const filteredAgents = useMemo(() => {
    const query = agentSearch.trim().toLowerCase();
    if (!query) {
      return agents;
    }

    return agents.filter((agent) => {
      const haystack = `${agent.full_name} ${agent.email}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [agentSearch, agents]);

  useEffect(() => {
    if (!selectedAgentId && filteredAgents.length > 0) {
      setSelectedAgentId(filteredAgents[0].id);
      return;
    }

    if (selectedAgentId && !filteredAgents.some((agent) => agent.id === selectedAgentId)) {
      setSelectedAgentId(filteredAgents[0]?.id ?? null);
    }
  }, [filteredAgents, selectedAgentId]);

  const agentConversationMapQ = useQuery({
    queryKey: [
      'supervision-agent-conversations',
      source,
      selectedAgentId,
      conversations.map((conversation) => conversation.id).join(','),
    ],
    enabled: !!selectedAgentId && conversations.length > 0,
    queryFn: async () => {
      const activeAgentId = selectedAgentId as string;
      const checks = await Promise.all(
        conversations.map(async (conversation) => {
          try {
            if (source === 'whatsapp') {
              const detail = await whatsappApi.thread(conversation.id, { limit: 120 });
              const touchedByAgent = detail.messages.some((message) => message.sender_id === activeAgentId);
              return touchedByAgent ? conversation.id : null;
            }

            const thread = await conversationsApi.messages(conversation.id, { limit: 500 });
            const touchedByAgent = thread.some((message) => message.sender_id === activeAgentId);
            return touchedByAgent ? conversation.id : null;
          } catch {
            return null;
          }
        }),
      );

      return checks.filter((value): value is string => Boolean(value));
    },
  });

  const scopedConversationIds = useMemo(
    () => agentConversationMapQ.data ?? [],
    [agentConversationMapQ.data],
  );

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();

    const base = selectedAgentId
      ? conversations.filter((conversation) => scopedConversationIds.includes(conversation.id))
      : conversations;

    if (!query) {
      return base;
    }

    return base.filter((conversation) => {
      const haystack = `${conversation.title} ${conversation.preview || ''} ${conversation.subtitle || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [conversationSearch, conversations, scopedConversationIds, selectedAgentId]);

  useEffect(() => {
    if (!selectedConversationId && filteredConversations.length > 0) {
      setSelectedConversationId(filteredConversations[0].id);
      return;
    }

    if (
      selectedConversationId &&
      !filteredConversations.some((conversation) => conversation.id === selectedConversationId)
    ) {
      setSelectedConversationId(filteredConversations[0]?.id ?? null);
    }
  }, [filteredConversations, selectedConversationId]);

  const selectedConversation =
    filteredConversations.find((conversation) => conversation.id === selectedConversationId) || null;
  const headerSecondaryText =
    selectedConversation?.contact_phone || selectedConversation?.subtitle || 'Read-only message timeline';
  const copyableConversationId =
    source === 'conversations' && isLikelyIdentifier(selectedConversation?.subtitle)
      ? selectedConversation?.subtitle || null
      : null;
  const headerSecondaryDisplayText = copyableConversationId
    ? truncateWithDots(copyableConversationId)
    : headerSecondaryText;

  const copyConversationId = async (value: string) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }

      await navigator.clipboard.writeText(value);
      toast({
        title: 'ID copied',
        description: 'Conversation ID copied to clipboard.',
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Copy failed',
        description: 'Could not copy this conversation ID.',
      });
    }
  };

  const threadQ = useQuery({
    queryKey: ['supervision-thread', source, selectedConversationId],
    queryFn: async () => {
      const conversationId = selectedConversationId as string;
      const customerUserId = selectedConversation?.user_id || '';

      if (source === 'whatsapp') {
        const detail = await whatsappApi.thread(conversationId, { limit: 500 });
        return detail.messages.map((message) => mapWhatsAppThread(message, customerUserId));
      }

      const messages = await conversationsApi.messages(conversationId, { limit: 500 });
      return messages.map((message) => mapConversationThread(message, customerUserId));
    },
    enabled: !!selectedConversationId,
    refetchInterval: 8_000,
  });

  const threadMessages = threadQ.data ?? [];

  const selectedAgent = filteredAgents.find((agent) => agent.id === selectedAgentId) || null;

  const conversationAutoReplyQ = useQuery({
    queryKey: ['supervision-conversation-auto-reply', selectedConversationId],
    queryFn: () =>
      conversationsApi.conversationAutoReply(selectedConversationId as string),
    enabled: !!selectedConversationId,
  });

  const isConversationAutoReplyEnabled =
    conversationAutoReplyQ.data?.ai_auto_reply_enabled ?? true;

  const setConversationAutoReplyMut = useMutation({
    mutationFn: ({ enabled }: { enabled: boolean }) =>
      conversationsApi.setConversationAutoReply(selectedConversationId as string, {
        ai_auto_reply_enabled: enabled,
      }),
    onSuccess: (nextState) => {
      queryClient.setQueryData(
        ['supervision-conversation-auto-reply', selectedConversationId],
        nextState,
      );

      toast({
        title: nextState.ai_auto_reply_enabled ? 'AI auto-reply enabled' : 'AI auto-reply paused',
        description: nextState.ai_auto_reply_enabled
          ? 'Automatic AI replies are enabled for this conversation.'
          : 'Automatic AI replies are paused for this conversation.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update AI auto-reply',
        description: normalizeError(error),
      });
    },
  });

  const agentReplySuspensionQ = useQuery({
    queryKey: ['supervision-agent-reply-suspension', selectedConversationId, selectedAgentId],
    queryFn: () =>
      conversationsApi.agentReplySuspension(
        selectedConversationId as string,
        selectedAgentId as string,
      ),
    enabled: !!selectedConversationId && !!selectedAgentId,
  });

  const isAgentSuspendedForConversation = agentReplySuspensionQ.data?.suspended ?? false;
  const setAgentReplySuspensionMut = useMutation({
    mutationFn: ({ suspended }: { suspended: boolean }) =>
      conversationsApi.setAgentReplySuspension(
        selectedConversationId as string,
        selectedAgentId as string,
        { suspended },
      ),
    onSuccess: (nextState) => {
      queryClient.setQueryData(
        ['supervision-agent-reply-suspension', selectedConversationId, selectedAgentId],
        nextState,
      );

      const action = nextState.suspended ? 'suspended' : 'allowed';
      toast({
        title: `Reply ${action}`,
        description: selectedAgent
          ? `${selectedAgent.full_name} is now ${nextState.suspended ? 'blocked from' : 'allowed to'} replying in this conversation.`
          : 'Conversation reply access updated.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update reply access',
        description: normalizeError(error),
      });
    },
  });

  return (
    <div className="grid h-[calc(100vh-3rem)] grid-cols-1 lg:grid-cols-[280px_360px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r bg-card/70">
        <div className="border-b px-4 py-3">
          <h1 className="text-sm font-semibold">Supervision</h1>
          <p className="text-xs text-muted-foreground">Switch between WhatsApp and Conversations</p>
          <div className="mt-2 inline-flex rounded-md border border-border bg-muted/40 p-1">
            {SUPERVISION_SOURCE_OPTIONS.map((option) => {
              const selected = source === option.value;
              const Icon = option.value === 'whatsapp' ? MessageCircle : MessageSquare;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSource(option.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? option.value === 'whatsapp'
                        ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-600'
                        : 'bg-blue-600 text-white shadow-sm hover:bg-blue-600'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>
          <h2 className="text-sm font-semibold">Agents</h2>
          <p className="text-xs text-muted-foreground">Read-only supervision scope</p>
          <InputWithLabel
            id="supervision-agent-search"
            label="Find agent"
            value={agentSearch}
            onChange={setAgentSearch}
            placeholder="Search name or email"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {agentsQ.isLoading ? (
            <div className="p-3">
              <TableSkeleton rows={6} cols={1} />
            </div>
          ) : agentsQ.error ? (
            <ErrorState
              message={normalizeError(agentsQ.error)}
              onRetry={() => {
                void agentsQ.refetch();
              }}
            />
          ) : filteredAgents.length === 0 ? (
            <EmptyState title="No agents" description="No agent profiles match this search." />
          ) : (
            filteredAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setSelectedAgentId(agent.id)}
                className={cn(
                  'w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  selectedAgentId === agent.id && 'bg-accent',
                )}
              >
                <p className="truncate text-sm font-medium">{agent.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{agent.email}</p>
              </button>
            ))
          )}
        </div>
      </aside>

      <aside className="flex min-h-0 flex-col border-r bg-card/40">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{sourceLabel} Conversations</h2>
          <p className="text-xs text-muted-foreground">
            {selectedAgent ? `Touched by ${selectedAgent.full_name}` : 'Select an agent'}
          </p>
          <InputWithLabel
            id="supervision-conv-search"
            label="Filter conversations"
            value={conversationSearch}
            onChange={setConversationSearch}
            placeholder="Search contact or message"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {inboxQ.isLoading || agentConversationMapQ.isLoading ? (
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
          ) : agentConversationMapQ.error ? (
            <ErrorState
              message={normalizeError(agentConversationMapQ.error)}
              onRetry={() => {
                void agentConversationMapQ.refetch();
              }}
            />
          ) : filteredConversations.length === 0 ? (
            <EmptyState
              title="No conversations"
              description={`No ${sourceLabel.toLowerCase()} conversations match this agent filter yet.`}
            />
          ) : (
            filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedConversationId(conversation.id)}
                className={cn(
                  'w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  selectedConversationId === conversation.id && 'bg-accent',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{conversation.title}</p>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTime(conversation.updated_at)}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {conversation.preview || conversation.subtitle || 'No messages yet'}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">
              {selectedConversation ? selectedConversation.title : 'Conversation'}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5">
              <p className="max-w-[260px] truncate text-xs text-muted-foreground" title={headerSecondaryText}>
                {headerSecondaryDisplayText}
              </p>
              {copyableConversationId ? (
                <button
                  type="button"
                  onClick={() => {
                    void copyConversationId(copyableConversationId);
                  }}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Copy conversation ID"
                  title="Copy conversation ID"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                isConversationAutoReplyEnabled
                  ? 'border-amber-500/50 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300'
                  : 'border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300',
              )}
              onClick={() => {
                setConversationAutoReplyMut.mutate({ enabled: !isConversationAutoReplyEnabled });
              }}
              disabled={
                !selectedConversation
                || conversationAutoReplyQ.isLoading
                || setConversationAutoReplyMut.isPending
              }
            >
              {conversationAutoReplyQ.isLoading || setConversationAutoReplyMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bot className="h-3.5 w-3.5" />
              )}
              {isConversationAutoReplyEnabled ? 'Pause AI auto-reply' : 'Enable AI auto-reply'}
            </button>
            {selectedAgent ? (
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  isAgentSuspendedForConversation
                    ? 'border-emerald-500/50 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-destructive/50 text-destructive hover:bg-destructive/10',
                )}
                onClick={() => {
                  setAgentReplySuspensionMut.mutate({
                    suspended: !isAgentSuspendedForConversation,
                  });
                }}
                disabled={
                  !selectedConversation
                  || agentReplySuspensionQ.isLoading
                  || setAgentReplySuspensionMut.isPending
                }
              >
                {agentReplySuspensionQ.isLoading || setAgentReplySuspensionMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isAgentSuspendedForConversation ? (
                  <UserCheck className="h-3.5 w-3.5" />
                ) : (
                  <UserX className="h-3.5 w-3.5" />
                )}
                {isAgentSuspendedForConversation ? 'Allow reply' : 'Suspend reply'}
              </button>
            ) : null}
            <span className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              {sourceLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Read only
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!selectedConversation ? (
            <EmptyState title="No conversation selected" description="Choose a conversation from the center column." />
          ) : threadQ.isLoading ? (
            <TableSkeleton rows={6} cols={1} />
          ) : threadQ.error ? (
            <ErrorState
              message={normalizeError(threadQ.error)}
              onRetry={() => {
                void threadQ.refetch();
              }}
            />
          ) : threadMessages.length === 0 ? (
            <EmptyState title="No messages" description="This conversation is empty." />
          ) : (
            <div className="space-y-2">
              {threadMessages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  customerUserId={selectedConversation.user_id}
                  source={source}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InputWithLabel({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mt-2 space-y-1">
      <label htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function MessageRow({
  message,
  customerUserId,
  source,
}: {
  message: SupervisionThreadMessage;
  customerUserId: string;
  source: SupervisionSource;
}) {
  if (source === 'conversations' && message.is_internal) {
    return (
      <div className="mx-auto max-w-[75%] rounded-xl border border-border/70 bg-muted/60 px-3 py-2 text-sm">
        <p className="text-xs font-medium text-muted-foreground">Internal note</p>
        <p className="mt-1 whitespace-pre-wrap text-foreground">{message.content}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(message.created_at)}</p>
      </div>
    );
  }

  const incoming = message.direction === 'inbound' || message.sender_id === customerUserId;

  return (
    <div className={cn('flex', incoming ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[72%] rounded-xl px-3 py-2 text-sm',
          incoming ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        <p className={cn('mt-1 text-[10px]', incoming ? 'text-muted-foreground' : 'text-primary-foreground/80')}>
          {formatDateTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
