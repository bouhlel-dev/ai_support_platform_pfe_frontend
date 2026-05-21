import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Filter, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { auditApi } from '@/shared/api/audit';
import { normalizeError } from '@/shared/api/client';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import type { AuditLogAction, AuditLogEntry } from '@/shared/types';

const CLEAR_AUDIT_CONFIRMATION = 'CLEAR AUDIT LOGS';

const ACTION_FILTERS: Array<'all' | AuditLogAction> = [
  'all',
  'LOGIN',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'ASSIGN',
  'STATUS_CHANGE',
  'ESCALATE',
  'REPLY',
  'WHATSAPP_IN',
  'WHATSAPP_OUT',
];

function AuditActionBadge({ action }: { action: AuditLogAction }) {
  const classes =
    action === 'DELETE'
      ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100'
      : action === 'CREATE'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-100'
        : action === 'LOGIN' || action === 'LOGOUT'
          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-100'
          : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100';

  return (
    <Badge variant="outline" className={cn('font-medium', classes)}>
      {action.toLowerCase().replace(/_/g, ' ')}
    </Badge>
  );
}

function getActionCounts(logs: AuditLogEntry[]) {
  return logs.reduce(
    (acc, entry) => {
      if (entry.action === 'CREATE') acc.creates += 1;
      if (entry.action === 'DELETE') acc.deletes += 1;
      if (entry.action === 'LOGIN') acc.logins += 1;
      return acc;
    },
    { creates: 0, deletes: 0, logins: 0 },
  );
}

export function AuditLogsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [actionFilter, setActionFilter] = useState<'all' | AuditLogAction>('all');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const logsQ = useQuery({
    queryKey: ['admin-audit-logs', actionFilter],
    queryFn: () =>
      auditApi.list({
        action: actionFilter === 'all' ? undefined : actionFilter,
        skip: 0,
        limit: 300,
      }),
  });

  const logs = useMemo(() => {
    const source = logsQ.data?.logs ?? [];
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedUserFilter = userFilter.trim().toLowerCase();
    const fromBoundary = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toBoundary = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;

    return source.filter((entry) => {
      const createdAt = entry.created_at ? new Date(entry.created_at) : null;
      const hasValidDate = createdAt !== null && !Number.isNaN(createdAt.getTime());

      if (resourceFilter !== 'all' && entry.resource_type !== resourceFilter) {
        return false;
      }

      if (normalizedUserFilter) {
        const userId = (entry.user_id ?? '').toLowerCase();
        if (!userId.includes(normalizedUserFilter)) {
          return false;
        }
      }

      if (fromBoundary) {
        if (!hasValidDate || createdAt < fromBoundary) {
          return false;
        }
      }

      if (toBoundary) {
        if (!hasValidDate || createdAt > toBoundary) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      const description = (entry.description ?? '').toLowerCase();
      const resourceType = (entry.resource_type ?? '').toLowerCase();
      const action = (entry.action ?? '').toLowerCase();
      const userId = (entry.user_id ?? '').toLowerCase();
      const meta = entry.meta ? JSON.stringify(entry.meta).toLowerCase() : '';
      return (
        description.includes(normalizedSearch) ||
        resourceType.includes(normalizedSearch) ||
        action.includes(normalizedSearch) ||
        userId.includes(normalizedSearch) ||
        meta.includes(normalizedSearch)
      );
    });
  }, [dateFrom, dateTo, logsQ.data?.logs, resourceFilter, search, userFilter]);

  const clearLogsMut = useMutation({
    mutationFn: (confirmation: string) => auditApi.clear(confirmation),
    onSuccess: async (result) => {
      await logsQ.refetch();
      toast({
        title: t('auditLogs.logsCleared'),
        description: result.message,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: t('auditLogs.clearFailed'),
        description: normalizeError(error),
      });
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await auditApi.exportCsv({
        action: actionFilter === 'all' ? undefined : actionFilter,
        resource_type: resourceFilter === 'all' ? undefined : resourceFilter,
        user_id: userFilter.trim() || undefined,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-export-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: t('auditLogs.exportComplete'), description: t('auditLogs.auditCsvDownloaded') });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('auditLogs.exportFailed'),
        description: normalizeError(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearAudit = () => {
    if (clearLogsMut.isPending) {
      return;
    }

    const confirmation = window.prompt(
      t('auditLogs.confirmClear', { phrase: CLEAR_AUDIT_CONFIRMATION }),
      '',
    );
    if (!confirmation) {
      return;
    }

    if (confirmation.trim() !== CLEAR_AUDIT_CONFIRMATION) {
      toast({
        variant: 'destructive',
        title: t('auditLogs.confirmationMismatch'),
        description: t('auditLogs.typeExact', { phrase: CLEAR_AUDIT_CONFIRMATION }),
      });
      return;
    }

    clearLogsMut.mutate(confirmation.trim());
  };

  const resourceOptions = useMemo(() => {
    const values = new Set<string>();
    (logsQ.data?.logs ?? []).forEach((entry) => {
      if (entry.resource_type) {
        values.add(entry.resource_type);
      }
    });
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [logsQ.data?.logs]);

  const actionCounts = getActionCounts(logsQ.data?.logs ?? []);
  const hasDateRangeFilter = Boolean(dateFrom || dateTo);
  const dateRangeSummary = useMemo(() => {
    const formatDateLabel = (value: string) => {
      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        return value;
      }
      return parsed.toLocaleDateString();
    };

    if (dateFrom && dateTo) {
      return t('auditLogs.dateFromTo', { from: formatDateLabel(dateFrom), to: formatDateLabel(dateTo) });
    }
    if (dateFrom) {
      return t('auditLogs.fromDate', { date: formatDateLabel(dateFrom) });
    }
    if (dateTo) {
      return t('auditLogs.toDate', { date: formatDateLabel(dateTo) });
    }
    return t('auditLogs.allDates');
  }, [dateFrom, dateTo, t]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('auditLogs.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('auditLogs.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => { void handleExport(); }} disabled={isExporting || clearLogsMut.isPending}>
            {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {t('auditLogs.exportCsv')}
          </Button>
          <Button variant="destructive" onClick={handleClearAudit} disabled={clearLogsMut.isPending || isExporting}>
            {clearLogsMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {t('auditLogs.clearLogs')}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void logsQ.refetch();
            }}
            disabled={isExporting || clearLogsMut.isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('auditLogs.refresh')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.totalEvents')}</p>
          <p className="mt-2 text-2xl font-semibold">{logsQ.data?.total ?? 0}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.creates')}</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300">{actionCounts.creates}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.deletes')}</p>
          <p className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-300">{actionCounts.deletes}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.logins')}</p>
          <p className="mt-2 text-2xl font-semibold text-blue-600 dark:text-blue-300">{actionCounts.logins}</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('auditLogs.searchAuditLogs')}
              className="pl-8"
            />
          </div>

          <div className="inline-flex rounded-md border bg-muted p-1">
            {ACTION_FILTERS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={actionFilter === value ? 'default' : 'ghost'}
                className="h-8"
                onClick={() => setActionFilter(value)}
              >
                {value === 'all' ? (
                  <span className="inline-flex items-center gap-1">
                    <Filter className="h-3.5 w-3.5" />
                    {t('auditLogs.allActions')}
                  </span>
                ) : (
                  value.toLowerCase().replace(/_/g, ' ')
                )}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('auditLogs.resourceType')}</p>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('auditLogs.resourceType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('auditLogs.allResources')}</SelectItem>
                {resourceOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('auditLogs.userId')}</p>
            <Input
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
              placeholder={t('auditLogs.filterUserId')}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('auditLogs.createdFrom')}</p>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('auditLogs.createdTo')}</p>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setResourceFilter('all');
                setUserFilter('');
                setDateFrom('');
                setDateTo('');
                setSearch('');
              }}
            >
              {t('auditLogs.clearFilters')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={hasDateRangeFilter ? 'default' : 'outline'}>
            {t('auditLogs.dateRange')}
          </Badge>
          <span className="text-muted-foreground">{dateRangeSummary}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('auditLogs.showing', { count: logs.length, total: logsQ.data?.total ?? 0 })}
        </p>

        {logsQ.error ? (
          <ErrorState
            message={normalizeError(logsQ.error)}
            onRetry={() => {
              void logsQ.refetch();
            }}
          />
        ) : logsQ.isLoading ? (
          <div className="flex items-center justify-center py-14 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('auditLogs.loadingLogs')}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title={t('auditLogs.noLogs')} description={t('auditLogs.noLogsMatch')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('auditLogs.action')}</TableHead>
                <TableHead>{t('auditLogs.resource')}</TableHead>
                <TableHead>{t('auditLogs.description')}</TableHead>
                <TableHead>{t('auditLogs.user')}</TableHead>
                <TableHead>{t('auditLogs.timestamp')}</TableHead>
                <TableHead className="text-right">{t('auditLogs.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((entry) => {
                const expanded = expandedLogId === entry.id;

                return (
                  <Fragment key={entry.id}>
                    <TableRow>
                      <TableCell>
                        <AuditActionBadge action={entry.action} />
                      </TableCell>
                      <TableCell className="font-medium">{entry.resource_type}</TableCell>
                      <TableCell className="max-w-[420px] truncate text-sm text-muted-foreground">
                        {entry.description || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {entry.user_id || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedLogId(expanded ? null : entry.id)}
                        >
                          {expanded ? t('auditLogs.hide') : t('auditLogs.view')}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {expanded ? (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/20">
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-md border bg-background p-3">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.resourceId')}</p>
                              <p className="mt-1 break-all text-xs">{entry.resource_id || '-'}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.traceId')}</p>
                              <p className="mt-1 break-all text-xs">{entry.trace_id || '-'}</p>
                            </div>
                            <div className="rounded-md border bg-background p-3">
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.ipAddress')}</p>
                              <p className="mt-1 break-all text-xs">{entry.ip_address || '-'}</p>
                            </div>
                          </div>

                          <div className="mt-3 rounded-md border bg-background p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.description')}</p>
                            <p className="mt-1 text-sm">{entry.description || t('auditLogs.noDescription')}</p>
                          </div>

                          <div className="mt-3 rounded-md border bg-background p-3">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('auditLogs.metadata')}</p>
                            <pre className="mt-2 max-h-56 overflow-auto rounded bg-muted p-2 text-xs">
                              {entry.meta ? JSON.stringify(entry.meta, null, 2) : t('auditLogs.noMetadata')}
                            </pre>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
