import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  FileText,
  Loader2,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { conversationsApi } from '@/shared/api/conversations';
import { normalizeError } from '@/shared/api/client';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { TableSkeleton } from '@/shared/components/Skeletons';
import type { ConversationSnippet } from '@/shared/types';

type SnippetChannel = 'CHAT' | 'WHATSAPP' | 'EMAIL';
type SnippetFilter = 'ALL' | SnippetChannel;
type SnippetPayload = Parameters<typeof conversationsApi.createSnippet>[0];

const CHANNEL_OPTIONS: Array<{
  value: SnippetFilter;
  labelKey: string;
  descKey: string;
}> = [
  { value: 'ALL', labelKey: 'allChannels', descKey: 'allChannelsDesc' },
  { value: 'CHAT', labelKey: 'chatLabelOption', descKey: 'chatDesc' },
  { value: 'WHATSAPP', labelKey: 'whatsappLabelOption', descKey: 'whatsappDesc' },
  { value: 'EMAIL', labelKey: 'emailLabelOption', descKey: 'emailDesc' },
];

const EDITOR_CHANNELS: SnippetChannel[] = ['CHAT', 'WHATSAPP', 'EMAIL'];

const EMPTY_SNIPPET_FORM: SnippetPayload = {
  title: '',
  body: '',
  description: '',
  shortcut: '',
  channel: 'CHAT',
  is_active: true,
};

function normalizeChannel(channel?: string | null): SnippetChannel {
  const value = String(channel ?? 'CHAT').toUpperCase();
  if (value === 'WHATSAPP') return 'WHATSAPP';
  if (value === 'EMAIL') return 'EMAIL';
  return 'CHAT';
}

function channelLabel(t: (key: string) => string, channel?: string | null) {
  const value = normalizeChannel(channel);
  if (value === 'WHATSAPP') return t('aiDraftSnippets.whatsappLabel');
  if (value === 'EMAIL') return t('aiDraftSnippets.emailLabel');
  return t('aiDraftSnippets.chatLabel');
}

function formatDateTime(t: (key: string) => string, value?: string | null) {
  if (!value) return t('aiDraftSnippets.unknown');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('aiDraftSnippets.unknown');
  return date.toLocaleString();
}

function toEditorState(snippet: ConversationSnippet): SnippetPayload {
  return {
    title: snippet.title,
    body: snippet.body,
    description: snippet.description ?? '',
    shortcut: snippet.shortcut ?? '',
    channel: normalizeChannel(snippet.channel),
    is_active: snippet.is_active,
  };
}

function trimPayload(payload: SnippetPayload): SnippetPayload {
  return {
    title: payload.title.trim(),
    body: payload.body.trim(),
    description: payload.description?.trim() ? payload.description.trim() : null,
    shortcut: payload.shortcut?.trim() ? payload.shortcut.trim() : null,
    channel: payload.channel ? normalizeChannel(payload.channel) : 'CHAT',
    is_active: payload.is_active ?? true,
  };
}

export function AiDraftSnippetsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [channelFilter, setChannelFilter] = useState<SnippetFilter>('ALL');
  const [search, setSearch] = useState('');
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);
  const [form, setForm] = useState<SnippetPayload>(EMPTY_SNIPPET_FORM);
  const [createForm, setCreateForm] = useState<SnippetPayload>(EMPTY_SNIPPET_FORM);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const snippetsQ = useQuery({
    queryKey: ['admin-conversation-snippets'],
    queryFn: () => conversationsApi.listSnippets({ includeInactive: true }),
  });

  const createMut = useMutation({
    mutationFn: (payload: SnippetPayload) => conversationsApi.createSnippet(trimPayload(payload)),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-conversation-snippets'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-snippets'] });
      setSelectedSnippetId(saved.id);
      setForm(toEditorState(saved));
      setCreateForm(EMPTY_SNIPPET_FORM);
      setIsCreateDialogOpen(false);
      toast({
        title: t('aiDraftSnippets.snippetCreated'),
        description: `${saved.title} is ready to use.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('aiDraftSnippets.createSnippetFailed'),
        description: normalizeError(error),
      });
    },
  });

  const updateMut = useMutation({
    mutationFn: async (payload: SnippetPayload) => {
      if (!selectedSnippetId) {
        throw new Error('No snippet selected.');
      }
      return conversationsApi.updateSnippet(selectedSnippetId, trimPayload(payload));
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-conversation-snippets'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-snippets'] });
      setSelectedSnippetId(saved.id);
      setForm(toEditorState(saved));
      toast({
        title: t('aiDraftSnippets.snippetUpdated'),
        description: `${saved.title} is ready to use.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('aiDraftSnippets.updateSnippetFailed'),
        description: normalizeError(error),
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (snippetId: string) => conversationsApi.deleteSnippet(snippetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-conversation-snippets'] });
      void queryClient.invalidateQueries({ queryKey: ['conversation-snippets'] });
      setSelectedSnippetId(null);
      setForm(EMPTY_SNIPPET_FORM);
      toast({
        title: t('aiDraftSnippets.snippetDeleted'),
        description: t('aiDraftSnippets.sharedSnippetRemoved'),
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('aiDraftSnippets.deleteSnippetFailed'),
        description: normalizeError(error),
      });
    },
  });

  const allSnippets = useMemo(() => {
    const snippets = snippetsQ.data?.snippets ?? [];
    return [...snippets].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [snippetsQ.data?.snippets]);

  const filteredSnippets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allSnippets.filter((snippet) => {
      const snippetChannel = normalizeChannel(snippet.channel);
      if (channelFilter !== 'ALL' && snippetChannel !== channelFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${snippet.title} ${snippet.description ?? ''} ${snippet.shortcut ?? ''} ${snippet.body}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [allSnippets, channelFilter, search]);

  const selectedSnippet = useMemo(
    () => allSnippets.find((snippet) => snippet.id === selectedSnippetId) ?? null,
    [allSnippets, selectedSnippetId],
  );

  const stats = useMemo(() => {
    const scoped =
      channelFilter === 'ALL'
        ? allSnippets
        : allSnippets.filter((snippet) => normalizeChannel(snippet.channel) === channelFilter);

    return {
      total: scoped.length,
      active: scoped.filter((snippet) => snippet.is_active).length,
      inactive: scoped.filter((snippet) => !snippet.is_active).length,
      chat: allSnippets.filter((snippet) => normalizeChannel(snippet.channel) === 'CHAT').length,
      whatsapp: allSnippets.filter((snippet) => normalizeChannel(snippet.channel) === 'WHATSAPP').length,
      email: allSnippets.filter((snippet) => normalizeChannel(snippet.channel) === 'EMAIL').length,
    };
  }, [allSnippets, channelFilter]);

  useEffect(() => {
    if (!allSnippets.length) {
      setSelectedSnippetId(null);
      return;
    }
    if (!selectedSnippetId || !allSnippets.some((snippet) => snippet.id === selectedSnippetId)) {
      setSelectedSnippetId(allSnippets[0].id);
    }
  }, [allSnippets, selectedSnippetId]);

  useEffect(() => {
    if (!selectedSnippet) {
      return;
    }
    setForm(toEditorState(selectedSnippet));
  }, [selectedSnippet]);

  const selectedChannelOption = useMemo(() => {
    const option = CHANNEL_OPTIONS.find((o) => o.value === channelFilter) ?? CHANNEL_OPTIONS[0];
    return {
      value: option.value,
      label: t(`aiDraftSnippets.${option.labelKey}`),
      description: t(`aiDraftSnippets.${option.descKey}`),
    };
  }, [channelFilter, t]);

  const startNewSnippet = () => {
    setCreateForm({
      ...EMPTY_SNIPPET_FORM,
      channel: channelFilter === 'ALL' ? 'CHAT' : channelFilter,
    });
    setIsCreateDialogOpen(true);
  };

  const validatePayload = (payload: SnippetPayload) => {
    const normalized = trimPayload(payload);
    if (!normalized.title) {
      toast({
        variant: 'destructive',
        title: t('aiDraftSnippets.titleRequired'),
        description: t('aiDraftSnippets.titleRequiredDesc'),
      });
      return false;
    }
    if (!normalized.body) {
      toast({
        variant: 'destructive',
        title: t('aiDraftSnippets.bodyRequired'),
        description: t('aiDraftSnippets.bodyRequiredDesc'),
      });
      return false;
    }
    return true;
  };

  const handleSave = () => {
    if (!validatePayload(form)) {
      return;
    }
    updateMut.mutate(form);
  };

  const handleCreate = () => {
    if (!validatePayload(createForm)) {
      return;
    }
    createMut.mutate(createForm);
  };

  const handleDelete = () => {
    if (!selectedSnippet) {
      return;
    }
    const confirmed = window.confirm(t('aiDraftSnippets.deleteConfirm', { title: selectedSnippet.title }));
    if (!confirmed) {
      return;
    }
    deleteMut.mutate(selectedSnippet.id);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('aiDraftSnippets.pageTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('aiDraftSnippets.pageSubtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void snippetsQ.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('aiDraftSnippets.refresh')}
          </Button>
          <Button onClick={startNewSnippet}>
            <Plus className="mr-2 h-4 w-4" />
            {t('aiDraftSnippets.newSnippet')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('aiDraftSnippets.visibleInScope')}</p>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
          <p className="mt-1 text-xs text-muted-foreground">{selectedChannelOption.label}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('aiDraftSnippets.activeLabel')}</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">
            {stats.active}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('aiDraftSnippets.readyForOperators')}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('aiDraftSnippets.inactiveLabel')}</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">
            {stats.inactive}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('aiDraftSnippets.savedButHidden')}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('aiDraftSnippets.chatWhatsapp')}</p>
          <p className="mt-2 text-2xl font-semibold">{stats.chat + stats.whatsapp}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('aiDraftSnippets.chatWhatsappDesc', { chat: stats.chat, whatsapp: stats.whatsapp })}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('aiDraftSnippets.emailStat')}</p>
          <p className="mt-2 text-2xl font-semibold">{stats.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('aiDraftSnippets.draftReplyTemplates')}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px,minmax(0,1fr)]">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t('aiDraftSnippets.snippetLibrary')}</h2>
              <p className="text-xs text-muted-foreground">{selectedChannelOption.description}</p>
            </div>
            <Badge variant="outline">{t('aiDraftSnippets.countShown', { count: filteredSnippets.length })}</Badge>
          </div>

          <div className="mt-4 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('aiDraftSnippets.searchSnippets')}
                className="pl-8"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CHANNEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors',
                    channelFilter === option.value
                      ? 'border-primary bg-[hsl(var(--primary)/.08)] text-foreground'
                      : 'bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                  )}
                  onClick={() => setChannelFilter(option.value)}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide">{t(`aiDraftSnippets.${option.labelKey}`)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 min-h-[420px]">
            {snippetsQ.isLoading ? (
              <TableSkeleton rows={6} cols={1} />
            ) : snippetsQ.error ? (
              <ErrorState
                message={normalizeError(snippetsQ.error)}
                onRetry={() => void snippetsQ.refetch()}
              />
            ) : filteredSnippets.length === 0 ? (
              <EmptyState
                title={t('aiDraftSnippets.noSnippets')}
                description={t('aiDraftSnippets.noSnippetsDesc')}
              />
            ) : (
              <div className="space-y-2">
                {filteredSnippets.map((snippet) => {
                  const snippetChannel = normalizeChannel(snippet.channel);
                  const isSelected = selectedSnippetId === snippet.id;

                  return (
                    <button
                      key={snippet.id}
                      type="button"
                      className={cn(
                        'w-full rounded-xl border p-3 text-left transition-colors',
                        isSelected
                          ? 'border-primary bg-[hsl(var(--primary)/.07)]'
                          : 'bg-muted/20 hover:bg-muted/40',
                      )}
                      onClick={() => setSelectedSnippetId(snippet.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{snippet.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {snippet.description?.trim() || snippet.body}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={snippet.is_active ? 'default' : 'outline'}>
                            {snippet.is_active ? t('aiDraftSnippets.activeBadge') : t('aiDraftSnippets.inactiveBadge')}
                          </Badge>
                          <Badge variant="outline">{channelLabel(t, snippetChannel)}</Badge>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{snippet.shortcut ? t('aiDraftSnippets.shortcutPrefix', { shortcut: snippet.shortcut }) : t('aiDraftSnippets.noShortcut')}</span>
                        <span>{t('aiDraftSnippets.updatedPrefix', { date: formatDateTime(t, snippet.updated_at) })}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t('aiDraftSnippets.snippetEditor')}</h2>
              <p className="text-xs text-muted-foreground">
                {selectedSnippet
                  ? t('aiDraftSnippets.editingSnippet', { title: selectedSnippet.title })
                  : t('aiDraftSnippets.editorDescription')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedSnippet ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleteMut.isPending || updateMut.isPending}
                >
                  {deleteMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  {t('aiDraftSnippets.delete')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (selectedSnippet) {
                    setForm(toEditorState(selectedSnippet));
                  }
                }}
                disabled={!selectedSnippet || updateMut.isPending || deleteMut.isPending}
              >
                {t('aiDraftSnippets.reset')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!selectedSnippet || updateMut.isPending || deleteMut.isPending}
              >
                {updateMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('aiDraftSnippets.saveSnippet')}
              </Button>
            </div>
          </div>

          {!selectedSnippet && !snippetsQ.isLoading ? (
            <EmptyState
              title={t('aiDraftSnippets.noSnippetSelected')}
              description={t('aiDraftSnippets.noSnippetSelectedDesc')}
            />
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="snippet-title">{t('aiDraftSnippets.titleLabel')}</Label>
                  <Input
                    id="snippet-title"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder={t('aiDraftSnippets.titlePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="snippet-shortcut">{t('aiDraftSnippets.shortcutLabel')}</Label>
                  <Input
                    id="snippet-shortcut"
                    value={form.shortcut ?? ''}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, shortcut: event.target.value }))
                    }
                    placeholder={t('aiDraftSnippets.shortcutPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,220px),1fr]">
                <div className="space-y-2">
                  <Label htmlFor="snippet-channel">{t('aiDraftSnippets.channelLabel')}</Label>
                  <Select
                    value={normalizeChannel(form.channel)}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, channel: normalizeChannel(value) }))
                    }
                  >
                    <SelectTrigger id="snippet-channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EDITOR_CHANNELS.map((channel) => (
                        <SelectItem key={channel} value={channel}>
                          {channelLabel(t, channel)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border bg-muted/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t('aiDraftSnippets.activeForOperators')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('aiDraftSnippets.inactiveDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={Boolean(form.is_active)}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, is_active: checked }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="snippet-description">{t('aiDraftSnippets.descriptionLabel')}</Label>
                <Input
                  id="snippet-description"
                  value={form.description ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder={t('aiDraftSnippets.descriptionPlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="snippet-body">{t('aiDraftSnippets.bodyLabel')}</Label>
                <Textarea
                  id="snippet-body"
                  rows={12}
                  value={form.body}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, body: event.target.value }))
                  }
                  placeholder={t('aiDraftSnippets.bodyPlaceholder')}
                  className="resize-y"
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">{t('aiDraftSnippets.chatPlaceholders')}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('aiDraftSnippets.chatPlaceholdersDesc')}
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">{t('aiDraftSnippets.whatsappAlignment')}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('aiDraftSnippets.whatsappAlignmentDesc')}
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">{t('aiDraftSnippets.draftWorkflow')}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('aiDraftSnippets.draftWorkflowDesc')}
                  </p>
                </div>
              </div>

              {selectedSnippet ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {t('aiDraftSnippets.createdLabel', { date: formatDateTime(t, selectedSnippet.created_at) })}
                  </span>
                  <span>{t('aiDraftSnippets.lastUpdatedLabel', { date: formatDateTime(t, selectedSnippet.updated_at) })}</span>
                  <span>{t('aiDraftSnippets.channelInfo', { channel: channelLabel(t, selectedSnippet.channel) })}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('aiDraftSnippets.createNewSnippet')}</DialogTitle>
            <DialogDescription>
              {t('aiDraftSnippets.createDialogDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-snippet-title">{t('aiDraftSnippets.titleLabel')}</Label>
                <Input
                  id="new-snippet-title"
                  value={createForm.title}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder={t('aiDraftSnippets.titlePlaceholder')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-snippet-shortcut">{t('aiDraftSnippets.shortcutLabel')}</Label>
                <Input
                  id="new-snippet-shortcut"
                  value={createForm.shortcut ?? ''}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, shortcut: event.target.value }))
                  }
                  placeholder={t('aiDraftSnippets.shortcutPlaceholder')}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,220px),1fr]">
              <div className="space-y-2">
                <Label htmlFor="new-snippet-channel">{t('aiDraftSnippets.channelLabel')}</Label>
                <Select
                  value={normalizeChannel(createForm.channel)}
                  onValueChange={(value) =>
                    setCreateForm((current) => ({ ...current, channel: normalizeChannel(value) }))
                  }
                >
                  <SelectTrigger id="new-snippet-channel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                      {EDITOR_CHANNELS.map((channel) => (
                        <SelectItem key={channel} value={channel}>
                          {channelLabel(t, channel)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border bg-muted/20 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{t('aiDraftSnippets.activeForOperators')}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('aiDraftSnippets.dialogActiveDesc')}
                      </p>
                    </div>
                  <Switch
                    checked={Boolean(createForm.is_active)}
                    onCheckedChange={(checked) =>
                      setCreateForm((current) => ({ ...current, is_active: checked }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-snippet-description">{t('aiDraftSnippets.descriptionLabel')}</Label>
              <Input
                id="new-snippet-description"
                value={createForm.description ?? ''}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder={t('aiDraftSnippets.descriptionPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-snippet-body">{t('aiDraftSnippets.bodyLabel')}</Label>
              <Textarea
                id="new-snippet-body"
                rows={10}
                value={createForm.body}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, body: event.target.value }))
                }
                placeholder={t('aiDraftSnippets.bodyPlaceholder')}
                className="resize-y"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setCreateForm(EMPTY_SNIPPET_FORM);
              }}
              disabled={createMut.isPending}
            >
              {t('aiDraftSnippets.cancel')}
            </Button>
            <Button type="button" onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              {t('aiDraftSnippets.createSnippet')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
