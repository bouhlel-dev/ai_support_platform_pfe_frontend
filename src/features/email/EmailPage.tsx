import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { emailApi } from '@/shared/api/email';
import { normalizeError } from '@/shared/api/client';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import type { Email, EmailBulkAction, EmailMailboxFolder } from '@/shared/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  SendHorizontal,
  Sparkles,
  Star,
  Unlink,
  XCircle,
} from 'lucide-react';

type ThreadSummary = {
  key: string;
  latest: Email;
  count: number;
  participants: string[];
  emailIds: string[];
  unreadCount: number;
  hasStarred: boolean;
  labels: string[];
};

type EmailActionLink = {
  label: string;
  url: string;
};

type DisplayEmailBody = {
  preview: string;
  textLines: string[];
  actionLinks: EmailActionLink[];
};

const EMAIL_STATUS_OPTIONS = ['all', 'RECEIVED', 'PROCESSING', 'CONVERTED', 'REPLIED', 'FAILED'] as const;
const URL_REGEX = /(https?:\/\/[^\s<>")\]]+)/g;
const FOOTER_SEPARATOR_REGEX = /^-{8,}\s*$/;
const TRAILING_PUNCTUATION_REGEX = /[),.;!?]+$/;
const TRACKING_QUERY_KEYS = new Set([
  'trk',
  'trkemail',
  'lipi',
  'midtoken',
  'midsig',
  'eid',
  'otptoken',
  'loid',
  'upsellorderorigin',
  'referenceid',
  'isss',
  'origin',
]);

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function toTimestamp(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function summarizeBody(body: string, max = 120) {
  const compact = body.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}...`;
}

function decodeQuotedPrintable(content: string) {
  const withoutSoftBreaks = content.replace(/=\r?\n/g, '');
  return withoutSoftBreaks.replace(/=([0-9A-F]{2})/gi, (_m, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

function htmlToPlainText(content: string) {
  if (!/<[a-z][\s\S]*>/i.test(content)) {
    return content;
  }

  return content
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h[1-6]|tr|section|article)\s*>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function sanitizeTrackingUrl(rawUrl: string) {
  const trimmed = rawUrl.replace(TRAILING_PUNCTUATION_REGEX, '');
  const trailing = rawUrl.slice(trimmed.length);

  try {
    const parsed = new URL(trimmed);
    for (const key of Array.from(parsed.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (TRACKING_QUERY_KEYS.has(lower) || lower.startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }

    if (!parsed.searchParams.toString()) {
      parsed.search = '';
    }

    return `${parsed.toString()}${trailing}`;
  } catch {
    return rawUrl;
  }
}

function removeCommonFooterNoise(lines: string[]) {
  const cutoffIndex = lines.findIndex((line) =>
    /^this email was intended for/i.test(line.trim()) ||
    /^you are receiving linkedin invitations emails\./i.test(line.trim()) ||
    /^©\s*\d{4}\s+linkedin/i.test(line.trim()),
  );

  let kept = cutoffIndex >= 0 ? lines.slice(0, cutoffIndex) : lines.slice();

  const promoIndex = kept.findIndex((line) => /^build your network with inmail/i.test(line.trim()));
  if (promoIndex >= 0) {
    const separatorAfterPromo = kept.findIndex(
      (line, idx) => idx > promoIndex && FOOTER_SEPARATOR_REGEX.test(line.trim()),
    );
    const removeUntil = separatorAfterPromo >= 0 ? separatorAfterPromo : Math.min(promoIndex + 4, kept.length - 1);
    kept = [...kept.slice(0, promoIndex), ...kept.slice(removeUntil + 1)];
  }

  return kept.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (FOOTER_SEPARATOR_REGEX.test(trimmed)) return false;
    if (/^unsubscribe:/i.test(trimmed)) return false;
    if (/^help:/i.test(trimmed)) return false;
    if (/^learn why we included this:/i.test(trimmed)) return false;
    return true;
  });
}

function normalizeEmailBody(rawBody: string) {
  let normalized = (rawBody || '').replace(/\r\n/g, '\n');
  normalized = decodeQuotedPrintable(normalized);
  normalized = htmlToPlainText(normalized);

  normalized = normalized.replace(/([^:\n]{2,80}):(https?:\/\/)/g, '$1: $2');
  normalized = normalized.replace(URL_REGEX, (url) => sanitizeTrackingUrl(url));

  const cleanedLines = removeCommonFooterNoise(
    normalized
      .split('\n')
      .map((line) => line.replace(/\t/g, ' ').replace(/\s+$/g, '')),
  );

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildDisplayEmailBody(rawBody: string): DisplayEmailBody {
  const cleaned = normalizeEmailBody(rawBody);
  const textLines: string[] = [];
  const actionLinks: EmailActionLink[] = [];

  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      textLines.push('');
      continue;
    }

    const actionMatch = trimmed.match(/^([^:\n]{2,80}):\s*(https?:\/\/\S+)$/i);
    if (actionMatch) {
      actionLinks.push({
        label: actionMatch[1].trim(),
        url: sanitizeTrackingUrl(actionMatch[2].trim()),
      });
      continue;
    }

    textLines.push(trimmed);
  }

  const preview = textLines.join(' ').replace(/\s+/g, ' ').trim();
  return { preview, textLines, actionLinks };
}

function linkifyTextLine(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let urlIndex = 0;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(line)) !== null) {
    const rawUrl = match[0];
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(line.slice(lastIndex, start));
    }

    const url = sanitizeTrackingUrl(rawUrl);
    nodes.push(
      <a
        key={`${keyPrefix}-url-${urlIndex}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline break-all"
      >
        {url}
      </a>,
    );

    lastIndex = start + rawUrl.length;
    urlIndex += 1;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes.length ? nodes : [line];
}

function statusLabel(status: string) {
  return status.toLowerCase().replace(/_/g, ' ');
}

function normalizeDraftTelemetryText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function humanizeLabel(label: string) {
  return label.replace(/_/g, ' ');
}

function parseLabels(raw: string) {
  const seen = new Set<string>();
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function groupEmailsByThread(emails: Email[]): ThreadSummary[] {
  const grouped = new Map<
    string,
    {
      latest: Email;
      count: number;
      participants: Set<string>;
      emailIds: Set<string>;
      unreadCount: number;
      hasStarred: boolean;
      labels: Set<string>;
    }
  >();

  emails.forEach((email) => {
    const key = email.gmail_thread_id || email.id;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        latest: email,
        count: 1,
        participants: new Set([email.sender_address, email.recipient_address].filter(Boolean)),
        emailIds: new Set([email.id]),
        unreadCount: !email.is_outbound && !email.is_read ? 1 : 0,
        hasStarred: email.is_starred,
        labels: new Set(email.labels ?? []),
      });
      return;
    }

    existing.count += 1;
    existing.emailIds.add(email.id);
    if (toTimestamp(email.created_at) >= toTimestamp(existing.latest.created_at)) {
      existing.latest = email;
    }
    if (email.sender_address) existing.participants.add(email.sender_address);
    if (email.recipient_address) existing.participants.add(email.recipient_address);
    if (!email.is_outbound && !email.is_read) {
      existing.unreadCount += 1;
    }
    existing.hasStarred = existing.hasStarred || email.is_starred;
    (email.labels ?? []).forEach((label) => existing.labels.add(label));
  });

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      latest: value.latest,
      count: value.count,
      participants: Array.from(value.participants),
      emailIds: Array.from(value.emailIds),
      unreadCount: value.unreadCount,
      hasStarred: value.hasStarred,
      labels: Array.from(value.labels),
    }))
    .sort((left, right) => toTimestamp(right.latest.created_at) - toTimestamp(left.latest.created_at));
}

export function EmailPage() {
  const { toast } = useToast();

  const [folder, setFolder] = useState<EmailMailboxFolder>('inbox');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof EMAIL_STATUS_OPTIONS)[number]>('all');
  const [labelFilter, setLabelFilter] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);

  const [selectedThreadKey, setSelectedThreadKey] = useState<string | null>(null);
  const [selectedThreadKeys, setSelectedThreadKeys] = useState<string[]>([]);

  const [replyBody, setReplyBody] = useState('');
  const [hasPendingAssistedDraft, setHasPendingAssistedDraft] = useState(false);
  const [pendingAssistedDraftText, setPendingAssistedDraftText] = useState<string | null>(null);
  const [pendingAssistedDraftGeneratedAt, setPendingAssistedDraftGeneratedAt] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeLabels, setComposeLabels] = useState('');

  const [bulkLabel, setBulkLabel] = useState('');

  const gmailStatusQ = useQuery({
    queryKey: ['gmail-status'],
    queryFn: emailApi.gmailStatus,
  });

  const mailboxQ = useQuery({
    queryKey: [
      'emails-mailbox',
      folder,
      search,
      statusFilter,
      labelFilter,
      showUnreadOnly,
      showStarredOnly,
    ],
    queryFn: () =>
      emailApi.list({
        folder,
        search: search.trim() || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        unreadOnly: showUnreadOnly,
        starredOnly: showStarredOnly,
        label: labelFilter.trim() || undefined,
        skip: 0,
        limit: 200,
      }),
  });

  const threadSummaries = useMemo(
    () => groupEmailsByThread(mailboxQ.data?.emails ?? []),
    [mailboxQ.data?.emails],
  );

  const threadByKey = useMemo(
    () => new Map(threadSummaries.map((thread) => [thread.key, thread])),
    [threadSummaries],
  );

  useEffect(() => {
    if (!threadSummaries.length) {
      setSelectedThreadKey(null);
      setSelectedThreadKeys([]);
      return;
    }

    if (!selectedThreadKey || !threadSummaries.some((thread) => thread.key === selectedThreadKey)) {
      setSelectedThreadKey(threadSummaries[0].key);
    }

    setSelectedThreadKeys((prev) => {
      const valid = prev.filter((key) => threadByKey.has(key));
      return valid.length === prev.length ? prev : valid;
    });
  }, [threadByKey, threadSummaries, selectedThreadKey]);

  const selectedThread = useMemo(
    () => threadSummaries.find((thread) => thread.key === selectedThreadKey) ?? null,
    [selectedThreadKey, threadSummaries],
  );

  const selectedEmailIds = useMemo(() => {
    const ids = new Set<string>();
    selectedThreadKeys.forEach((key) => {
      const thread = threadByKey.get(key);
      if (!thread) return;
      thread.emailIds.forEach((id) => ids.add(id));
    });
    return Array.from(ids);
  }, [selectedThreadKeys, threadByKey]);

  const threadQ = useQuery({
    queryKey: ['emails-thread', selectedThread?.latest.id],
    queryFn: () => emailApi.thread(selectedThread!.latest.id),
    enabled: Boolean(selectedThread?.latest.id),
  });

  const threadEmails = useMemo(
    () => [...(threadQ.data ?? [])].sort((left, right) => toTimestamp(left.created_at) - toTimestamp(right.created_at)),
    [threadQ.data],
  );

  const latestInboundEmail = useMemo(
    () => [...threadEmails].reverse().find((email) => !email.is_outbound) ?? null,
    [threadEmails],
  );

  useEffect(() => {
    setHasPendingAssistedDraft(false);
    setPendingAssistedDraftText(null);
    setPendingAssistedDraftGeneratedAt(null);
  }, [selectedThreadKey]);

  const authorizeMut = useMutation({
    mutationFn: emailApi.gmailAuthorize,
    onSuccess: (res) => {
      window.open(res.authorization_url, '_blank', 'noopener,noreferrer');
      toast({
        title: 'Authorize Gmail',
        description: 'Complete authorization in the opened tab, then return and click Sync.',
      });
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: 'Authorization failed',
        description: normalizeError(err),
      }),
  });

  const syncMut = useMutation({
    mutationFn: emailApi.gmailSync,
    onSuccess: (res) => {
      toast({
        title: 'Gmail sync queued',
        description: `Fetched ${res.emails_fetched}, ingested ${res.emails_ingested}, errors ${res.errors}.`,
      });
      void gmailStatusQ.refetch();
      void mailboxQ.refetch();
      if (selectedThread) {
        void threadQ.refetch();
      }
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: normalizeError(err),
      }),
  });

  const disconnectMut = useMutation({
    mutationFn: emailApi.gmailDisconnect,
    onSuccess: () => {
      toast({ title: 'Gmail disconnected' });
      void gmailStatusQ.refetch();
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: 'Disconnect failed',
        description: normalizeError(err),
      }),
  });

  const composeMut = useMutation({
    mutationFn: () =>
      emailApi.compose({
        recipient: composeTo.trim(),
        subject: composeSubject.trim(),
        body: composeBody.trim(),
        labels: parseLabels(composeLabels),
      }),
    onSuccess: () => {
      toast({
        title: 'Email queued',
        description: 'Your message was queued and will appear in Sent shortly.',
      });
      setComposeOpen(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setComposeLabels('');
      setFolder('sent');
      void mailboxQ.refetch();
      void gmailStatusQ.refetch();
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: 'Send failed',
        description: normalizeError(err),
      }),
  });

  const assistedDraftMut = useMutation({
    mutationFn: () => emailApi.assistedDraft(latestInboundEmail!.id),
    onSuccess: (response) => {
      setReplyBody(response.draft);
      setHasPendingAssistedDraft(true);
      setPendingAssistedDraftText(response.draft);
      setPendingAssistedDraftGeneratedAt(response.generated_at);
      toast({
        title: 'Assisted draft ready',
        description: 'Review and edit before sending.',
      });
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: 'Assisted draft failed',
        description: normalizeError(err),
      }),
  });

  const replyMut = useMutation({
    mutationFn: () => {
      const trimmedReply = replyBody.trim();
      const usedAssistedDraft = hasPendingAssistedDraft;
      const assistedDraftEdited =
        usedAssistedDraft && pendingAssistedDraftText !== null
          ? normalizeDraftTelemetryText(trimmedReply)
            !== normalizeDraftTelemetryText(pendingAssistedDraftText)
          : undefined;

      return emailApi.reply(latestInboundEmail!.id, {
        body: trimmedReply,
        used_assisted_draft: usedAssistedDraft,
        assisted_draft_edited: assistedDraftEdited,
        assisted_draft_generated_at: usedAssistedDraft
          ? pendingAssistedDraftGeneratedAt ?? undefined
          : undefined,
      });
    },
    onSuccess: () => {
      setReplyBody('');
      setHasPendingAssistedDraft(false);
      setPendingAssistedDraftText(null);
      setPendingAssistedDraftGeneratedAt(null);
      toast({
        title: 'Reply queued',
        description: 'Your reply was queued for sending and will appear in this thread shortly.',
      });
      void mailboxQ.refetch();
      void threadQ.refetch();
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: 'Reply failed',
        description: normalizeError(err),
      }),
  });

  const bulkMut = useMutation({
    mutationFn: (params: { emailIds: string[]; action: EmailBulkAction; label?: string }) =>
      emailApi.bulkAction(params.emailIds, params.action, params.label),
    onSuccess: (res, params) => {
      toast({
        title: 'Mailbox updated',
        description: `${res.updated} emails updated (${params.action.replace(/_/g, ' ')}).`,
      });
      void mailboxQ.refetch();
      if (selectedThread) {
        void threadQ.refetch();
      }
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: 'Mailbox action failed',
        description: normalizeError(err),
      }),
  });

  const gmailStatus = gmailStatusQ.data;
  const mailboxBusy = mailboxQ.isLoading || mailboxQ.isFetching;
  const threadBusy = threadQ.isLoading || threadQ.isFetching;
  const actionsBusy =
    authorizeMut.isPending ||
    syncMut.isPending ||
    disconnectMut.isPending ||
    composeMut.isPending ||
    assistedDraftMut.isPending ||
    replyMut.isPending ||
    bulkMut.isPending;

  const allThreadsSelected =
    threadSummaries.length > 0 && selectedThreadKeys.length === threadSummaries.length;

  function toggleThreadSelection(threadKey: string) {
    setSelectedThreadKeys((prev) =>
      prev.includes(threadKey)
        ? prev.filter((key) => key !== threadKey)
        : [...prev, threadKey],
    );
  }

  function toggleSelectAllThreads() {
    if (allThreadsSelected) {
      setSelectedThreadKeys([]);
      return;
    }
    setSelectedThreadKeys(threadSummaries.map((thread) => thread.key));
  }

  function runBulkAction(action: EmailBulkAction, label?: string) {
    if (!selectedEmailIds.length) {
      toast({
        variant: 'destructive',
        title: 'No threads selected',
        description: 'Select at least one thread before applying bulk actions.',
      });
      return;
    }

    if ((action === 'add_label' || action === 'remove_label') && !(label || '').trim()) {
      toast({
        variant: 'destructive',
        title: 'Label required',
        description: 'Enter a label before running add/remove label.',
      });
      return;
    }

    bulkMut.mutate({
      emailIds: selectedEmailIds,
      action,
      label: (label || '').trim() || undefined,
    });
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Workspace</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inbox, thread reading, compose, and mailbox controls without leaving the app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={composeOpen ? 'secondary' : 'outline'}
            onClick={() => setComposeOpen((prev) => !prev)}
          >
            <Plus className="h-4 w-4 mr-1" />
            {composeOpen ? 'Close compose' : 'Compose'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending || !gmailStatus?.connected}
          >
            {syncMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Sync
          </Button>
        </div>
      </div>

      {gmailStatus ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/70 p-3.5">
          {gmailStatus.connected ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-destructive" />
          )}

          <span className="text-sm">
            {gmailStatus.connected
              ? `Connected: ${gmailStatus.gmail_address || 'Unknown account'}`
              : 'Gmail not connected'}
          </span>

          {gmailStatus.last_synced ? (
            <span className="text-xs text-muted-foreground ml-auto">
              Last sync: {formatDate(gmailStatus.last_synced)}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => authorizeMut.mutate()}
              disabled={authorizeMut.isPending}
            >
              {authorizeMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-1" />
              )}
              {gmailStatus.connected ? 'Reconnect' : 'Connect Gmail'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => disconnectMut.mutate()}
              disabled={!gmailStatus.connected || disconnectMut.isPending}
            >
              {disconnectMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4 mr-1" />
              )}
              Disconnect
            </Button>
          </div>
        </div>
      ) : null}

      {composeOpen ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">New Email</p>
            <Badge variant="outline">New thread</Badge>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <Input
              type="email"
              value={composeTo}
              onChange={(event) => setComposeTo(event.target.value)}
              placeholder="To"
            />
            <Input
              value={composeSubject}
              onChange={(event) => setComposeSubject(event.target.value)}
              placeholder="Subject"
            />
            <Input
              value={composeLabels}
              onChange={(event) => setComposeLabels(event.target.value)}
              placeholder="Labels (comma separated, optional)"
            />
          </div>

          <Textarea
            rows={6}
            value={composeBody}
            onChange={(event) => setComposeBody(event.target.value)}
            placeholder="Write your email..."
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Composed emails are sent through your connected Gmail account.
            </p>
            <Button
              onClick={() => composeMut.mutate()}
              disabled={
                !gmailStatus?.connected ||
                !composeTo.trim() ||
                !composeSubject.trim() ||
                !composeBody.trim() ||
                actionsBusy
              }
            >
              {composeMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4 mr-1" />
              )}
              Send Email
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-card/70 p-3.5">
        <div className="grid gap-2 md:grid-cols-5">
          <Input
            className="md:col-span-2"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search subject, sender, recipient, message"
          />

          <Select value={folder} onValueChange={(value) => setFolder(value as EmailMailboxFolder)}>
            <SelectTrigger>
              <SelectValue placeholder="Folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inbox">Inbox</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="all">All Mail</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as (typeof EMAIL_STATUS_OPTIONS)[number])}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {EMAIL_STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status === 'all' ? 'All statuses' : statusLabel(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={labelFilter}
            onChange={(event) => setLabelFilter(event.target.value)}
            placeholder="Filter label"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={showUnreadOnly ? 'default' : 'outline'}
            className="h-8 rounded-full px-3"
            onClick={() => setShowUnreadOnly((prev) => !prev)}
          >
            Unread only
          </Button>
          <Button
            size="sm"
            variant={showStarredOnly ? 'default' : 'outline'}
            className="h-8 rounded-full px-3"
            onClick={() => setShowStarredOnly((prev) => !prev)}
          >
            Starred only
          </Button>
          {(showUnreadOnly || showStarredOnly || labelFilter.trim()) ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-full px-3"
              onClick={() => {
                setShowUnreadOnly(false);
                setShowStarredOnly(false);
                setLabelFilter('');
              }}
            >
              Clear quick filters
            </Button>
          ) : null}
        </div>
      </div>

      {selectedEmailIds.length > 0 ? (
        <div className="rounded-xl border bg-card/70 p-3.5 space-y-2">
          <p className="text-sm font-medium">
            {selectedThreadKeys.length} selected thread(s), {selectedEmailIds.length} email(s)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => runBulkAction('mark_read')} disabled={actionsBusy}>
              Mark read
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulkAction('mark_unread')} disabled={actionsBusy}>
              Mark unread
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulkAction('star')} disabled={actionsBusy}>
              Star
            </Button>
            <Button size="sm" variant="outline" onClick={() => runBulkAction('unstar')} disabled={actionsBusy}>
              Unstar
            </Button>
            <Input
              className="max-w-[220px]"
              value={bulkLabel}
              onChange={(event) => setBulkLabel(event.target.value)}
              placeholder="Label"
              disabled={actionsBusy}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => runBulkAction('add_label', bulkLabel)}
              disabled={actionsBusy}
            >
              Add label
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runBulkAction('remove_label', bulkLabel)}
              disabled={actionsBusy}
            >
              Remove label
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runBulkAction('clear_labels')}
              disabled={actionsBusy}
            >
              Clear labels
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="border-b bg-card/50 p-3 flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={allThreadsSelected}
                onChange={toggleSelectAllThreads}
              />
              Threads
            </label>
            <span className="text-xs text-muted-foreground">{mailboxQ.data?.total ?? 0} emails</span>
          </div>

          {mailboxQ.error ? (
            <ErrorState message={normalizeError(mailboxQ.error)} onRetry={() => mailboxQ.refetch()} />
          ) : mailboxBusy ? (
            <div className="p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading mailbox...
            </div>
          ) : !threadSummaries.length ? (
            <EmptyState title="No emails" description="Your selected mailbox view is empty." />
          ) : (
            <div className="max-h-[65vh] overflow-y-auto divide-y">
              {threadSummaries.map((thread) => {
                const active = selectedThreadKey === thread.key;
                const threadLabels = thread.labels
                  .filter((label) => label && label !== 'inbox' && label !== 'sent')
                  .slice(0, 4);
                const latestBodyDisplay = buildDisplayEmailBody(thread.latest.body);

                return (
                  <div
                    key={thread.key}
                    className={`group relative px-3.5 py-2.5 transition-all ${
                      active
                        ? 'bg-accent/70 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.16)]'
                        : 'hover:bg-muted/35'
                    }`}
                  >
                    <span
                      className={`pointer-events-none absolute bottom-2 top-2 left-0 w-0.5 rounded-r-full bg-primary/80 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-primary"
                        checked={selectedThreadKeys.includes(thread.key)}
                        onChange={() => toggleThreadSelection(thread.key)}
                      />

                      <button
                        type="button"
                        className="mt-0.5 text-muted-foreground hover:text-primary"
                        onClick={() => {
                          bulkMut.mutate({
                            emailIds: thread.emailIds,
                            action: thread.hasStarred ? 'unstar' : 'star',
                          });
                        }}
                      >
                        <Star
                          className={`h-4 w-4 ${thread.hasStarred ? 'fill-amber-400 text-amber-500' : ''}`}
                        />
                      </button>

                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => setSelectedThreadKey(thread.key)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm line-clamp-1 ${thread.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>
                            {thread.latest.subject || '(No subject)'}
                          </p>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatDate(thread.latest.created_at)}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {thread.latest.is_outbound
                            ? `To ${thread.latest.recipient_address}`
                            : `From ${thread.latest.sender_address}`}
                        </p>

                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {summarizeBody(latestBodyDisplay.preview || thread.latest.body)}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={thread.latest.status.toLowerCase()} />
                          {thread.unreadCount > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {thread.unreadCount} unread
                            </Badge>
                          ) : null}
                          {thread.count > 1 ? (
                            <span className="text-[11px] text-muted-foreground">{thread.count} messages</span>
                          ) : null}
                          {threadLabels.map((label) => (
                            <Badge key={`${thread.key}-${label}`} variant="outline" className="text-[10px]">
                              {humanizeLabel(label)}
                            </Badge>
                          ))}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          {!selectedThread ? (
            <EmptyState title="No thread selected" description="Pick a thread from the mailbox list." />
          ) : threadQ.error ? (
            <ErrorState message={normalizeError(threadQ.error)} onRetry={() => threadQ.refetch()} />
          ) : threadBusy ? (
            <div className="p-4 text-sm text-muted-foreground inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading thread...
            </div>
          ) : !threadEmails.length ? (
            <EmptyState title="Thread is empty" description="No messages found for this thread." />
          ) : (
            <div className="flex min-h-[65vh] flex-col">
              <div className="border-b bg-card/50 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{selectedThread.latest.subject || '(No subject)'}</p>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        bulkMut.mutate({
                          emailIds: selectedThread.emailIds,
                          action: 'mark_read',
                        })
                      }
                      disabled={actionsBusy}
                    >
                      Mark read
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        bulkMut.mutate({
                          emailIds: selectedThread.emailIds,
                          action: 'mark_unread',
                        })
                      }
                      disabled={actionsBusy}
                    >
                      Mark unread
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        bulkMut.mutate({
                          emailIds: selectedThread.emailIds,
                          action: selectedThread.hasStarred ? 'unstar' : 'star',
                        })
                      }
                      disabled={actionsBusy}
                    >
                      {selectedThread.hasStarred ? 'Unstar' : 'Star'}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Participants: {selectedThread.participants.join(', ') || '-'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {threadEmails.map((email) => {
                  const labels = (email.labels ?? []).filter((label) => label && label !== 'inbox' && label !== 'sent');
                  const bodyDisplay = buildDisplayEmailBody(email.body);
                  return (
                    <div
                      key={email.id}
                      className={`rounded-xl border p-3 ${email.is_outbound ? 'bg-muted/30 border-primary/30 ml-8' : 'bg-background mr-8'}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">From: {email.sender_address}</p>
                        <span className="text-xs text-muted-foreground">{formatDate(email.created_at)}</span>
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">To: {email.recipient_address}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={email.status.toLowerCase()} />
                        {email.is_outbound ? (
                          <span className="text-[11px] text-muted-foreground">Sent</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Inbox</span>
                        )}
                        {!email.is_read && !email.is_outbound ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Unread
                          </Badge>
                        ) : null}
                        {email.is_starred ? (
                          <Badge variant="outline" className="text-[10px]">
                            Starred
                          </Badge>
                        ) : null}
                        {labels.map((label) => (
                          <Badge key={`${email.id}-${label}`} variant="outline" className="text-[10px]">
                            {humanizeLabel(label)}
                          </Badge>
                        ))}
                      </div>

                      <div className="mt-2 space-y-2 text-sm break-words">
                        {bodyDisplay.actionLinks.length ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {bodyDisplay.actionLinks.map((action) => (
                              <a
                                key={`${email.id}-${action.label}-${action.url}`}
                                href={action.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                              >
                                {action.label}
                              </a>
                            ))}
                          </div>
                        ) : null}

                        {bodyDisplay.textLines.length ? (
                          bodyDisplay.textLines.map((line, lineIndex) =>
                            line ? (
                              <p key={`${email.id}-line-${lineIndex}`} className="whitespace-pre-wrap">
                                {linkifyTextLine(line, `${email.id}-${lineIndex}`)}
                              </p>
                            ) : (
                              <div key={`${email.id}-line-${lineIndex}`} className="h-2" />
                            ),
                          )
                        ) : (
                          <p className="text-xs text-muted-foreground">(empty message body)</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t p-3 space-y-2">
                {!latestInboundEmail ? (
                  <p className="text-xs text-muted-foreground">
                    No inbound message available to reply to in this thread.
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => assistedDraftMut.mutate()}
                    disabled={!latestInboundEmail || actionsBusy}
                  >
                    {assistedDraftMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    Generate Assisted Draft
                  </Button>

                  {hasPendingAssistedDraft ? (
                    <Badge variant="secondary" className="text-[11px]">
                      Assisted draft attached
                    </Badge>
                  ) : null}
                </div>

                <Textarea
                  rows={4}
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder={
                    latestInboundEmail
                      ? 'Write your reply...'
                      : 'Reply is disabled until an inbound message exists in this thread.'
                  }
                  disabled={!latestInboundEmail || actionsBusy}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter'
                      && (event.ctrlKey || event.metaKey)
                      && latestInboundEmail
                      && replyBody.trim()
                      && !actionsBusy
                    ) {
                      event.preventDefault();
                      replyMut.mutate();
                    }
                  }}
                />

                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    New outbound messages can be composed via the Compose panel or sent as replies here. Press Ctrl+Enter (or Cmd+Enter) to send quickly.
                  </p>
                  <Button
                    onClick={() => replyMut.mutate()}
                    disabled={!latestInboundEmail || !replyBody.trim() || actionsBusy}
                  >
                    {replyMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <SendHorizontal className="h-4 w-4 mr-1" />
                    )}
                    Send Reply
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!gmailStatus?.connected ? (
        <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          Gmail is not connected. Use Connect Gmail above, complete authorization, then Sync.
        </div>
      ) : null}
    </div>
  );
}
