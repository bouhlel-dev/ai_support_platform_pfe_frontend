import { useMemo, useState, type ElementType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  Clock,
  Headset,
  MessageSquare,
  Minus,
  Plus,
  Shield,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from 'recharts';
import { useAuth } from '@/features/auth/AuthContext';
import { dashboardApi } from '@/shared/api/dashboard';
import { normalizeError } from '@/shared/api/client';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { KpiCard } from '@/shared/components/KpiCard';
import { StatusBadge } from '@/shared/components/StatusBadge';
import type { DashboardSummary } from '@/shared/types';
import { useTranslation } from 'react-i18next';

type TrendDirection = 'up' | 'down' | 'flat';
type VolumeRange = 'daily' | 'weekly' | 'monthly';
type RoleView = 'client' | 'agent' | 'admin';

const STATUS_CHART_COLORS = [
  'hsl(220, 70%, 52%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(142, 71%, 45%)',
];

const ROLE_CHART_COLORS = [
  'hsl(220, 70%, 52%)',
  'hsl(142, 71%, 45%)',
  'hsl(38, 92%, 50%)',
];

const ASSISTED_DRAFT_RANGE_OPTIONS: Array<{ label: string; value: 7 | 30 | 90 }> = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

function getWeekTrend(
  current: number,
  previous: number,
  noChangeLabel: string,
  vsLastWeekSuffix: string,
) {
  const delta = current - previous;
  if (delta === 0) {
    return { direction: 'flat' as TrendDirection, label: noChangeLabel };
  }
  if (previous === 0) {
    return {
      direction: delta > 0 ? ('up' as TrendDirection) : ('down' as TrendDirection),
      label: `${delta > 0 ? '+' : ''}${delta} ${vsLastWeekSuffix}`,
    };
  }

  const percent = Math.abs((delta / previous) * 100);
  return {
    direction: delta > 0 ? ('up' as TrendDirection) : ('down' as TrendDirection),
    label: `${delta > 0 ? '+' : ''}${delta} (${percent.toFixed(0)}%) ${vsLastWeekSuffix}`,
  };
}

function getTrendBadgeClass(direction: TrendDirection) {
  if (direction === 'up') {
    return 'bg-[hsl(var(--success)/.12)] text-[hsl(var(--success))]';
  }
  if (direction === 'down') {
    return 'bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]';
  }
  return 'bg-muted text-muted-foreground';
}

function getTrendIcon(direction: TrendDirection) {
  if (direction === 'up') return ArrowUpRight;
  if (direction === 'down') return ArrowDownRight;
  return Minus;
}

function formatSecondsCompact(seconds?: number | null) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return 'N/A';
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function formatDailyLabel(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthlyLabel(value: string) {
  const parsed = new Date(`${value}-01`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function getRoleCopy(role: RoleView) {
  if (role === 'admin') {
    return {
      titleKey: 'dashboard.operationsTitle',
      subtitleKey: 'dashboard.operationsSubtitle',
    };
  }
  if (role === 'agent') {
    return {
      titleKey: 'dashboard.agentTitle',
      subtitleKey: 'dashboard.agentSubtitle',
    };
  }
  return {
    titleKey: 'dashboard.clientTitle',
    subtitleKey: 'dashboard.clientSubtitle',
  };
}

function DashboardHeader({
  title,
  subtitle,
  name,
  welcomeBack,
}: {
  title: string;
  subtitle: string;
  name: string;
  welcomeBack: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{welcomeBack}</p>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  description,
  to,
  variant = 'default',
}: {
  icon: ElementType;
  title: string;
  description: string;
  to: string;
  variant?: 'default' | 'primary' | 'success';
}) {
  const surfaceClass =
    variant === 'primary'
      ? 'border-primary/20 bg-[hsl(var(--primary)/.08)] hover:bg-[hsl(var(--primary)/.12)]'
      : variant === 'success'
        ? 'border-[hsl(var(--success)/.22)] bg-[hsl(var(--success)/.08)] hover:bg-[hsl(var(--success)/.12)]'
        : 'border-border bg-muted/20 hover:bg-muted/40';
  const iconClass =
    variant === 'primary'
      ? 'text-primary'
      : variant === 'success'
        ? 'text-[hsl(var(--success))]'
        : 'text-foreground';

  return (
    <Link
      to={to}
      className={`group flex items-start gap-4 rounded-xl border p-4 transition-colors ${surfaceClass}`}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card shadow-sm">
        <Icon className={`h-5 w-5 ${iconClass}`} />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${iconClass}`}>{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

function WeeklyActivityCard({
  weekly,
  urgentOpenCount,
}: {
  weekly?: DashboardSummary['weekly'];
  urgentOpenCount: number;
}) {
  const { t } = useTranslation();
  const createdTrend = getWeekTrend(
    weekly?.created_this_week ?? 0,
    weekly?.created_last_week ?? 0,
    t('dashboardCharts.noChangeVsLastWeek'),
    t('dashboardCharts.vsLastWeek'),
  );
  const resolvedTrend = getWeekTrend(
    weekly?.resolved_this_week ?? 0,
    weekly?.resolved_last_week ?? 0,
    t('dashboardCharts.noChangeVsLastWeek'),
    t('dashboardCharts.vsLastWeek'),
  );
  const CreatedIcon = getTrendIcon(createdTrend.direction);
  const ResolvedIcon = getTrendIcon(resolvedTrend.direction);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t('dashboardCharts.weeklyActivity')}</h2>
          <p className="text-xs text-muted-foreground">{t('dashboardCharts.weeklyActivityDesc')}</p>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--info)/.12)] text-[hsl(var(--info))]">
          <Activity className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-[hsl(var(--info)/.08)] p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{weekly?.created_this_week ?? 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last week: {weekly?.created_last_week ?? 0}</p>
          <span
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${getTrendBadgeClass(createdTrend.direction)}`}
          >
            <CreatedIcon className="h-3.5 w-3.5" />
            {createdTrend.label}
          </span>
        </div>

        <div className="rounded-lg border bg-[hsl(var(--success)/.08)] p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Resolved</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{weekly?.resolved_this_week ?? 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last week: {weekly?.resolved_last_week ?? 0}</p>
          <span
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${getTrendBadgeClass(resolvedTrend.direction)}`}
          >
            <ResolvedIcon className="h-3.5 w-3.5" />
            {resolvedTrend.label}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
          {t('dashboardCharts.urgentOpenTickets')}
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            urgentOpenCount > 0
              ? 'bg-[hsl(var(--destructive)/.12)] text-[hsl(var(--destructive))]'
              : 'bg-[hsl(var(--success)/.12)] text-[hsl(var(--success))]'
          }`}
        >
          {urgentOpenCount}
        </span>
      </div>
    </div>
  );
}

function AiOpsCard({ aiOps }: { aiOps?: DashboardSummary['ai_ops'] }) {
  const { t } = useTranslation();
  const totalDecisions = aiOps?.total_decisions ?? 0;
  const autoResolved = aiOps?.auto_resolved ?? 0;
  const escalated = aiOps?.escalated ?? 0;
  const autoResolvedShare = totalDecisions > 0 ? (autoResolved / totalDecisions) * 100 : 0;
  const escalatedShare = totalDecisions > 0 ? (escalated / totalDecisions) * 100 : 0;
  const escalationRatePct = ((aiOps?.escalation_rate ?? 0) * 100).toFixed(1);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t('dashboardCharts.aiOps')}</h2>
          <p className="text-xs text-muted-foreground">{t('dashboardCharts.aiOpsDesc')}</p>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--primary)/.12)] text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 rounded-lg border bg-[hsl(var(--primary)/.1)] p-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.totalDecisions')}</p>
        <p className="mt-1 text-2xl font-semibold leading-none">{totalDecisions}</p>
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('dashboardCharts.autoResolved')}</span>
            <span className="font-medium">
              {autoResolved}
              <span className="ml-1 text-muted-foreground">({autoResolvedShare.toFixed(1)}%)</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[hsl(var(--success))]"
              style={{ width: `${Math.min(100, autoResolvedShare)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('dashboardCharts.escalated')}</span>
            <span className="font-medium">
              {escalated}
              <span className="ml-1 text-muted-foreground">({escalatedShare.toFixed(1)}%)</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[hsl(var(--destructive))]"
              style={{ width: `${Math.min(100, escalatedShare)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] px-3 py-3">
        <span className="text-sm font-medium text-muted-foreground">{t('dashboardCharts.escalationRate')}</span>
        <span className="text-2xl font-bold leading-none tracking-tight text-[hsl(var(--destructive))]">
          {escalationRatePct}%
        </span>
      </div>
    </div>
  );
}

function LeaderboardCard({
  leaderboard,
  title,
  currentUserId,
  currentUserName,
}: {
  leaderboard: DashboardSummary['leaderboard'];
  title?: string;
  currentUserId?: string | null;
  currentUserName?: string | null;
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('dashboardCharts.agentLeaderboard');
  const normalizedCurrentName = currentUserName?.trim().toLowerCase() ?? null;
  const currentUserIndex = leaderboard.findIndex((entry) => {
    if (currentUserId && entry.user_id === currentUserId) {
      return true;
    }

    if (!normalizedCurrentName) {
      return false;
    }

    return (entry.full_name ?? '').trim().toLowerCase() === normalizedCurrentName;
  });
  const currentUserEntry = currentUserIndex >= 0 ? leaderboard[currentUserIndex] : null;

  const getRankBadge = (index: number) => {
    if (index === 0) {
      return {
        className: 'border-[#d4a72c]/30 bg-[#fff7db] text-[#b7791f]',
        shieldClassName: 'text-[#d4a72c]',
      };
    }
    if (index === 1) {
      return {
        className: 'border-slate-300/70 bg-slate-100 text-slate-700',
        shieldClassName: 'text-slate-500',
      };
    }
    if (index === 2) {
      return {
        className: 'border-[#b7791f]/25 bg-[#f8e3d3] text-[#9a5b19]',
        shieldClassName: 'text-[#b7791f]',
      };
    }
    return null;
  };

  return (
    <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">{resolvedTitle}</h2>
            <p className="text-xs text-muted-foreground">{t('dashboardCharts.resolvedVolumeAndLoad')}</p>
          </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--warning)/.14)] text-[hsl(var(--warning))]">
          <Trophy className="h-4 w-4" />
        </span>
      </div>

        {leaderboard.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('dashboardCharts.noLeaderboardDataAvailable')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {currentUserId || currentUserName ? (
              <div className="rounded-lg border border-primary/20 bg-[hsl(var(--primary)/.07)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{t('dashboardCharts.yourRank')}</p>
                {currentUserEntry ? (
                  <>
                    <div className="mt-1 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-bold leading-none text-foreground">
                          #{currentUserIndex + 1}
                        </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                          {t('dashboardCharts.outOfRankedAgents', { count: leaderboard.length })}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{t('dashboardCharts.resolvedCount', { count: currentUserEntry.resolved_count })}</p>
                        <p>{t('dashboardCharts.openAssignedCount', { count: currentUserEntry.open_assigned_count })}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('dashboardCharts.noRankingYet')}
                  </p>
                )}
              </div>
            ) : null}

            <div className="space-y-2.5">
            {leaderboard.map((entry, index) => {
              const rankBadge = getRankBadge(index);
              const isCurrentUser =
                (currentUserId && entry.user_id === currentUserId) ||
                (!!normalizedCurrentName &&
                  (entry.full_name ?? '').trim().toLowerCase() === normalizedCurrentName);

              return (
                <div
                  key={`${entry.user_id}-${index}`}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                    isCurrentUser
                      ? 'border-primary/30 bg-[hsl(var(--primary)/.08)] shadow-sm'
                      : 'bg-muted/20'
                  }`}
                >
                  {rankBadge ? (
                    <span
                    className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${rankBadge.className}`}
                  >
                    <Shield className={`h-4.5 w-4.5 ${rankBadge.shieldClassName}`} />
                    <span className="absolute inset-0 flex items-center justify-center pt-[1px] text-[10px] font-bold">
                      {index + 1}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{entry.full_name || t('dashboardCharts.unknownAgent')}</p>
                      {isCurrentUser ? (
                        <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          You
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-[hsl(var(--success)/.12)] px-2 py-0.5 font-medium text-[hsl(var(--success))]">
                        {t('dashboardCharts.resolvedCount', { count: entry.resolved_count })}
                    </span>
                    <span className="rounded-full bg-[hsl(var(--info)/.12)] px-2 py-0.5 font-medium text-[hsl(var(--info))]">
                      {t('dashboardCharts.openAssignedCount', { count: entry.open_assigned_count })}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold leading-none">{entry.resolved_count}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.resolved')}</p>
                </div>
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    );
  }

function ClientSupportStatusCard({
  counts,
  weekly,
}: {
  counts?: DashboardSummary['counts'];
  weekly?: DashboardSummary['weekly'];
}) {
  const { t } = useTranslation();
  const openCount = counts?.open ?? 0;
  const inProgressCount = counts?.in_progress ?? 0;
  const escalatedCount = counts?.escalated ?? 0;
  const isAllClear = openCount === 0 && inProgressCount === 0 && escalatedCount === 0;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{t('dashboardCharts.supportStatus')}</h2>
          <p className="text-xs text-muted-foreground">{t('dashboardCharts.supportStatusDesc')}</p>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--info)/.12)] text-[hsl(var(--info))]">
          <Headset className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 rounded-lg border p-3">
        <p className="text-sm font-medium">
          {isAllClear ? t('dashboardCharts.allCaughtUp') : t('dashboardCharts.activeSupportWork')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {isAllClear
            ? t('dashboardCharts.noOpenInProgress')
            : t('dashboardCharts.useQuickActions')}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboard.openTickets')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{openCount}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboard.inProgress')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{inProgressCount}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.escalated')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{escalatedCount}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
        {t('dashboardCharts.thisWeekSummary', {
          created: weekly?.created_this_week ?? 0,
          resolved: weekly?.resolved_this_week ?? 0,
        })}
      </div>
    </div>
  );
}

function TicketVolumeChart({
  volumeChartData,
  volumeRange,
  setVolumeRange,
  hasVolumeData,
  volumeRangeLabel,
}: {
  volumeChartData: Array<{ label: string; count: number }>;
  volumeRange: VolumeRange;
  setVolumeRange: (value: VolumeRange) => void;
  hasVolumeData: boolean;
  volumeRangeLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border bg-card p-4 xl:col-span-2">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t('dashboardCharts.ticketVolumeTrend')}</h2>
          <p className="text-xs text-muted-foreground">{volumeRangeLabel}</p>
        </div>

        <div className="inline-flex rounded-md border bg-muted/20 p-1 text-xs">
          <button
            type="button"
            className={`rounded px-2.5 py-1 transition-colors ${
              volumeRange === 'daily'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setVolumeRange('daily')}
          >
            {t('dashboardCharts.daily')}
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 transition-colors ${
              volumeRange === 'weekly'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setVolumeRange('weekly')}
          >
            {t('dashboardCharts.weekly')}
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 transition-colors ${
              volumeRange === 'monthly'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setVolumeRange('monthly')}
          >
            {t('dashboardCharts.sixMonths')}
          </button>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={volumeChartData} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!hasVolumeData ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('dashboardCharts.noCreatedTickets')}</p>
      ) : null}
    </div>
  );
}

function TicketStatusMixChart({
  statusChartData,
  hasStatusChartData,
}: {
  statusChartData: Array<{ label: string; value: number }>;
  hasStatusChartData: boolean;
}) {
  const { t } = useTranslation();
  const visibleData = statusChartData.filter((item) => item.value > 0);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t('dashboardCharts.ticketStatusMix')}</h2>
        <p className="text-xs text-muted-foreground">{t('dashboardCharts.ticketStatusMixDesc')}</p>
      </div>

      {hasStatusChartData ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={visibleData}
                dataKey="value"
                nameKey="label"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {visibleData.map((_, index) => (
                  <Cell
                    key={`status-cell-${index}`}
                    fill={STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('dashboardCharts.noTicketStatusData')}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {statusChartData.map((item, index) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-xs"
          >
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length] }}
              />
              {item.label}
            </span>
            <span className="font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyComparisonChart({
  weeklyComparisonData,
}: {
  weeklyComparisonData: Array<{ period: string; created: number; resolved: number }>;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t('dashboardCharts.weeklyCreatedVsResolved')}</h2>
        <p className="text-xs text-muted-foreground">{t('dashboardCharts.weeklyCreatedVsResolvedDesc')}</p>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyComparisonData} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />
            <Tooltip />
            <Bar dataKey="created" name={t('dashboardCharts.created')} fill="hsl(220, 65%, 50%)" radius={[6, 6, 0, 0]} />
            <Bar dataKey="resolved" name={t('dashboardCharts.resolved')} fill="hsl(142, 71%, 45%)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function UserRoleCompositionChart({
  userRoleChartData,
  activeAgents,
  totalAgents,
}: {
  userRoleChartData: Array<{ label: string; value: number }>;
  activeAgents: number;
  totalAgents: number;
}) {
  const { t } = useTranslation();
  const hasRoleChartData = userRoleChartData.some((item) => item.value > 0);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{t('dashboardCharts.userRoleComposition')}</h2>
        <p className="text-xs text-muted-foreground">{t('dashboardCharts.userRoleCompositionDesc')}</p>
      </div>

      {hasRoleChartData ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={userRoleChartData} dataKey="value" nameKey="label" innerRadius={40} outerRadius={74}>
                  {userRoleChartData.map((_, index) => (
                    <Cell
                      key={`role-cell-${index}`}
                      fill={ROLE_CHART_COLORS[index % ROLE_CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid content-center gap-2">
            {userRoleChartData.map((item, index) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm"
              >
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: ROLE_CHART_COLORS[index % ROLE_CHART_COLORS.length] }}
                  />
                  {item.label}
                </span>
                <span className="font-semibold text-foreground">{item.value}</span>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              {t('dashboardCharts.activeAgentsSummary', { active: activeAgents, total: totalAgents })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('dashboardCharts.noUserRoleData')}</p>
      )}
    </div>
  );
}

function AssistedDraftHub({
  assistedDraft,
  assistedDraftRangeDays,
  setAssistedDraftRangeDays,
  isLoading,
  showTopAgents,
}: {
  assistedDraft?: DashboardSummary['assisted_draft'];
  assistedDraftRangeDays: 7 | 30 | 90;
  setAssistedDraftRangeDays: (value: 7 | 30 | 90) => void;
  isLoading: boolean;
  showTopAgents: boolean;
}) {
  const { t } = useTranslation();
  const lookbackDays = assistedDraft?.lookback_days ?? 30;
  const generated = assistedDraft?.total_generated ?? 0;
  const accepted = assistedDraft?.total_accepted ?? 0;
  const sent = assistedDraft?.total_sent ?? 0;
  const acceptancePct = ((assistedDraft?.acceptance_rate ?? 0) * 100).toFixed(1);
  const sharePct = ((assistedDraft?.assisted_share ?? 0) * 100).toFixed(1);
  const editedPct = ((assistedDraft?.edited_rate ?? 0) * 100).toFixed(1);
  const medianDelay = formatSecondsCompact(assistedDraft?.median_seconds_to_send ?? null);
  const daily = assistedDraft?.daily ?? [];
  const channels = assistedDraft?.channels ?? [];
  const topAgents = assistedDraft?.top_agents ?? [];
  const xAxisInterval = daily.length > 35 ? Math.ceil(daily.length / 12) : 0;
  const hasDailyData = daily.some((item) => item.generated > 0 || item.accepted > 0 || item.sent > 0);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{t('dashboardCharts.assistedDraftPerformance')}</h2>
          <p className="text-xs text-muted-foreground">{t('dashboardCharts.lastDays', { days: lookbackDays })}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border bg-muted/20 p-1 text-xs">
            {ASSISTED_DRAFT_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`rounded px-2.5 py-1 transition-colors ${
                  assistedDraftRangeDays === option.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setAssistedDraftRangeDays(option.value)}
                disabled={isLoading}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="rounded-full border bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {t('dashboardCharts.generatedAcceptedSummary', { generated, accepted })}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.acceptanceRate')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{acceptancePct}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('dashboardCharts.acceptedOverGenerated')}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.assistedShare')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{sharePct}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('dashboardCharts.acceptedOverSends', { sent })}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.medianDraftToSend')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{medianDelay}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('dashboardCharts.sampleSize', { count: assistedDraft?.latency_samples ?? 0 })}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.editRate')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{editedPct}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('dashboardCharts.editedBeforeSend', { count: assistedDraft?.edited_samples ?? 0 })}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.draftsGenerated')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{generated}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('dashboardCharts.aiDraftSuggestionsRequested')}</p>
        </div>
        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('dashboardCharts.draftsAccepted')}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{accepted}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('dashboardCharts.sentWithOperatorConfirmation')}</p>
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${showTopAgents ? 'xl:grid-cols-5' : 'xl:grid-cols-3'}`}>
        <div className={`rounded-lg border bg-muted/10 p-3 ${showTopAgents ? 'xl:col-span-3' : 'xl:col-span-2'}`}>
          <div className="mb-2">
            <p className="text-sm font-medium">{t('dashboardCharts.dailyFunnel')}</p>
            <p className="text-xs text-muted-foreground">{t('dashboardCharts.generatedVsAcceptedVsSends')}</p>
          </div>

          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={daily} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval={xAxisInterval}
                  minTickGap={12}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip />
                <Line type="monotone" dataKey="generated" name={t('dashboardCharts.generated')} stroke="hsl(var(--info))" strokeWidth={2.2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="accepted" name={t('dashboardCharts.accepted')} stroke="hsl(var(--success))" strokeWidth={2.2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="sent" name={t('dashboardCharts.sent')} stroke="hsl(var(--warning))" strokeWidth={2.2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {!hasDailyData ? (
            <p className="mt-2 text-xs text-muted-foreground">{t('dashboardCharts.noAssistedDraftActivity')}</p>
          ) : null}
        </div>

        <div className={`space-y-3 ${showTopAgents ? 'xl:col-span-2' : 'xl:col-span-1'}`}>
          <div className="rounded-lg border bg-muted/10 p-3">
            <p className="text-sm font-medium">{t('dashboardCharts.channelBreakdown')}</p>
            {channels.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t('dashboardCharts.noChannelActivity')}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {channels.map((channel) => (
                  <div key={channel.channel} className="rounded-md border bg-background/80 p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {channel.channel === 'whatsapp'
                          ? 'WhatsApp'
                          : channel.channel === 'email'
                            ? 'Email'
                            : 'Chat'}
                      </span>
                      <span className="text-muted-foreground">
                        {(channel.acceptance_rate * 100).toFixed(1)}% accepted
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      generated {channel.generated}, accepted {channel.accepted}, sent {channel.sent}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      share {(channel.assisted_share * 100).toFixed(1)}%, median {formatSecondsCompact(channel.median_seconds_to_send)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showTopAgents ? (
            <div className="rounded-lg border bg-muted/10 p-3">
              <p className="text-sm font-medium">{t('dashboardCharts.topAgents')}</p>
              {topAgents.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('dashboardCharts.topAgentsNoData')}
                </p>
              ) : (
                <div className="mt-2 space-y-1.5 text-xs">
                  {topAgents.map((entry, index) => (
                    <div
                      key={`${entry.user_id}-${index}`}
                      className="flex items-center justify-between rounded-md border bg-background/80 px-2 py-1.5"
                    >
                      <span className="truncate pr-2 font-medium text-foreground">
                        {entry.full_name || t('dashboardCharts.unknownAgent')}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {entry.accepted} accepted ({(entry.acceptance_rate * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UrgentTicketsSection({
  urgentTickets,
  error,
  isLoading,
  onRetry,
}: {
  urgentTickets: DashboardSummary['urgent_tickets'];
  error: unknown;
  isLoading: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const previewCount = 3;
  const hasMore = urgentTickets.length > previewCount;
  const visibleTickets = showAll ? urgentTickets : urgentTickets.slice(0, previewCount);

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <h2 className="text-sm font-semibold">{t('dashboardCharts.urgentTickets')}</h2>
        {hasMore && !error ? (
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll
              ? t('dashboardCharts.showLess')
              : t('dashboardCharts.showMore', { count: urgentTickets.length - previewCount })}
          </button>
        ) : null}
      </div>

      {error ? (
        <ErrorState message={normalizeError(error)} onRetry={onRetry} />
      ) : urgentTickets.length === 0 && !isLoading ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">{t('dashboardCharts.noUrgentTickets')}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t('dashboardCharts.highPriorityActive')}
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {visibleTickets.map((ticket) => (
            <Link
              to={`/tickets/${ticket.id}`}
              key={ticket.id}
              className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{ticket.subject}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('dashboardCharts.updatedLabel')} {new Date(ticket.updated_at).toLocaleString()}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-2">
                <StatusBadge status={ticket.priority} />
                <StatusBadge status={ticket.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentTicketsSection({
  recentTickets,
  error,
  isLoading,
  onRetry,
  title,
}: {
  recentTickets: DashboardSummary['recent_tickets'];
  error: unknown;
  isLoading: boolean;
  onRetry: () => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('dashboard.myRecentTickets');
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="text-sm font-semibold">{resolvedTitle}</h2>
      </div>

      {error ? (
        <ErrorState message={normalizeError(error)} onRetry={onRetry} />
      ) : recentTickets.length === 0 && !isLoading ? (
        <EmptyState
          title="No tickets yet"
          description={t('dashboardCharts.recentTicketsEmpty')}
        />
      ) : (
        <div className="divide-y">
          {recentTickets.map((ticket) => (
            <Link
              to={`/tickets/${ticket.id}`}
              key={ticket.id}
              className="flex items-center justify-between p-4 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{ticket.subject}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {ticket.channel_source} - {new Date(ticket.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-2">
                <StatusBadge status={ticket.priority} />
                <StatusBadge status={ticket.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [assistedDraftRangeDays, setAssistedDraftRangeDays] = useState<7 | 30 | 90>(30);
  const [volumeRange, setVolumeRange] = useState<VolumeRange>('monthly');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-summary', assistedDraftRangeDays],
    queryFn: () => dashboardApi.summary(assistedDraftRangeDays),
  });

  const role = (user?.role ?? data?.scope ?? 'client') as RoleView;
  const copy = getRoleCopy(role);
  const displayName = user?.full_name || user?.name || user?.email?.split('@')[0] || 'there';

  const counts = data?.counts;
  const weekly = data?.weekly;
  const dailyTickets = data?.daily_tickets ?? [];
  const weeklyTickets = data?.weekly_tickets ?? [];
  const monthlyTickets = data?.monthly_tickets ?? [];
  const recentTickets = data?.recent_tickets ?? [];
  const urgentTickets = data?.urgent_tickets ?? [];
  const leaderboard = data?.leaderboard ?? [];
  const aiOps = data?.ai_ops;
  const assistedDraft = data?.assisted_draft;
  const userStats = data?.user_stats;
  const personalPerformance = data?.personal_performance;
  const urgentOpenCount = aiOps?.urgent_open_count ?? 0;

  const volumeChartData = useMemo(() => {
    if (volumeRange === 'daily') {
      return dailyTickets.map((item) => ({
        label: formatDailyLabel(item.day),
        count: item.count,
      }));
    }
    if (volumeRange === 'weekly') {
      return weeklyTickets.map((item) => ({
        label: item.week,
        count: item.count,
      }));
    }
    return monthlyTickets.map((item) => ({
      label: formatMonthlyLabel(item.month),
      count: item.count,
    }));
  }, [dailyTickets, monthlyTickets, volumeRange, weeklyTickets]);

  const hasVolumeData = volumeChartData.some((item) => item.count > 0);
  const volumeRangeLabel =
    volumeRange === 'daily'
      ? t('dashboardCharts.dailyCreatedTickets')
      : volumeRange === 'weekly'
        ? t('dashboardCharts.weeklyCreatedTickets')
        : t('dashboardCharts.monthlyCreatedTickets');

  const statusChartData = useMemo(
    () => [
      { label: t('dashboard.inProgress'), value: counts?.in_progress ?? 0 },
      { label: t('dashboardCharts.escalated'), value: counts?.escalated ?? 0 },
      { label: t('dashboard.resolved'), value: counts?.resolved ?? 0 },
    ],
    [counts, t],
  );
  const hasStatusChartData = statusChartData.some((item) => item.value > 0);

  const weeklyComparisonData = useMemo(
    () => [
      {
        period: t('dashboardCharts.lastWeek'),
        created: weekly?.created_last_week ?? 0,
        resolved: weekly?.resolved_last_week ?? 0,
      },
      {
        period: t('dashboardCharts.thisWeek'),
        created: weekly?.created_this_week ?? 0,
        resolved: weekly?.resolved_this_week ?? 0,
      },
    ],
    [t, weekly],
  );

  const userRoleChartData = useMemo(
    () => [
      { label: t('common.admins'), value: userStats?.total_admins ?? 0 },
      { label: t('common.agents'), value: userStats?.total_agents ?? 0 },
      { label: t('common.clients'), value: userStats?.total_clients ?? 0 },
    ],
    [t, userStats],
  );

  if (error && !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <DashboardHeader
          title={t(copy.titleKey)}
          subtitle={t(copy.subtitleKey)}
          name={displayName}
          welcomeBack={t('dashboard.welcomeBack', { name: displayName })}
        />
        <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <DashboardHeader
        title={t(copy.titleKey)}
        subtitle={t(copy.subtitleKey)}
        name={displayName}
        welcomeBack={t('dashboard.welcomeBack', { name: displayName })}
      />

      {role === 'client' ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <QuickActionCard
              icon={MessageSquare}
              title={t('dashboard.startSupportChat')}
              description={t('dashboard.startSupportChatDesc')}
              to="/conversations"
              variant="primary"
            />
            <QuickActionCard
              icon={Plus}
              title={t('dashboard.createTicket')}
              description={t('dashboard.createTicketDesc')}
              to="/tickets"
              variant="success"
            />
            <QuickActionCard
              icon={Bell}
              title={t('dashboard.viewNotifications')}
              description={t('dashboard.viewNotificationsDesc')}
              to="/notifications"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title={t('dashboard.myTotalTickets')} value={counts?.total ?? 0} icon={Ticket} loading={isLoading} />
            <KpiCard title={t('dashboard.myOpenTickets')} value={counts?.open ?? 0} icon={Clock} variant="info" loading={isLoading} />
            <KpiCard title={t('dashboard.inProgress')} value={counts?.in_progress ?? 0} icon={Activity} variant="warning" loading={isLoading} />
            <KpiCard title={t('dashboard.resolved')} value={counts?.resolved ?? 0} icon={ShieldCheck} variant="success" loading={isLoading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ClientSupportStatusCard counts={counts} weekly={weekly} />
            <WeeklyActivityCard weekly={weekly} urgentOpenCount={urgentOpenCount} />
          </div>

          <RecentTicketsSection
            recentTickets={recentTickets}
            error={error}
            isLoading={isLoading}
            onRetry={() => refetch()}
            title={t('dashboard.myRecentTickets')}
          />
        </>
      ) : null}

      {role === 'agent' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              title={t('dashboardCharts.myResolved')}
              value={personalPerformance?.my_resolved_tickets ?? 0}
              icon={ShieldCheck}
              variant="success"
              loading={isLoading}
            />
            <KpiCard
              title={t('dashboardCharts.myOpenAssigned')}
              value={personalPerformance?.my_open_assigned_tickets ?? 0}
              icon={Clock}
              variant="info"
              loading={isLoading}
            />
            <KpiCard
              title={t('dashboard.teamTotal')}
              value={counts?.total ?? 0}
              icon={Users}
              loading={isLoading}
            />
            <KpiCard
              title={t('dashboard.teamEscalated')}
              value={counts?.escalated ?? 0}
              icon={AlertTriangle}
              variant="destructive"
              loading={isLoading}
            />
          </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <WeeklyActivityCard weekly={weekly} urgentOpenCount={urgentOpenCount} />
              <AiOpsCard aiOps={aiOps} />
              <LeaderboardCard
                leaderboard={leaderboard}
                currentUserId={user?.id ?? null}
                currentUserName={displayName}
              />
            </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <TicketVolumeChart
              volumeChartData={volumeChartData}
              volumeRange={volumeRange}
              setVolumeRange={setVolumeRange}
              hasVolumeData={hasVolumeData}
              volumeRangeLabel={volumeRangeLabel}
            />
            <TicketStatusMixChart
              statusChartData={statusChartData}
              hasStatusChartData={hasStatusChartData}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <UrgentTicketsSection
              urgentTickets={urgentTickets}
              error={error}
              isLoading={isLoading}
              onRetry={() => refetch()}
            />
            <RecentTicketsSection
              recentTickets={recentTickets}
              error={error}
              isLoading={isLoading}
              onRetry={() => refetch()}
            />
          </div>

          <WeeklyComparisonChart weeklyComparisonData={weeklyComparisonData} />

          <AssistedDraftHub
            assistedDraft={assistedDraft}
            assistedDraftRangeDays={assistedDraftRangeDays}
            setAssistedDraftRangeDays={setAssistedDraftRangeDays}
            isLoading={isLoading}
            showTopAgents={false}
          />
        </>
      ) : null}

      {role === 'admin' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard title={t('dashboard.totalTickets')} value={counts?.total ?? 0} icon={Ticket} loading={isLoading} />
            <KpiCard title={t('dashboard.openTickets')} value={counts?.open ?? 0} icon={Clock} variant="info" loading={isLoading} />
            <KpiCard
              title={t('dashboardCharts.escalated')}
              value={counts?.escalated ?? 0}
              icon={AlertTriangle}
              variant="destructive"
              loading={isLoading}
            />
            <KpiCard
              title={t('dashboard.aiDecisions')}
              value={aiOps?.total_decisions ?? 0}
              icon={Bot}
              variant="success"
              loading={isLoading}
              trend={t('dashboardCharts.escalatedTrend', {
                value: ((aiOps?.escalation_rate ?? 0) * 100).toFixed(1),
              })}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <WeeklyActivityCard weekly={weekly} urgentOpenCount={urgentOpenCount} />
            <AiOpsCard aiOps={aiOps} />
            <LeaderboardCard leaderboard={leaderboard} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <TicketVolumeChart
              volumeChartData={volumeChartData}
              volumeRange={volumeRange}
              setVolumeRange={setVolumeRange}
              hasVolumeData={hasVolumeData}
              volumeRangeLabel={volumeRangeLabel}
            />
            <TicketStatusMixChart
              statusChartData={statusChartData}
              hasStatusChartData={hasStatusChartData}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <WeeklyComparisonChart weeklyComparisonData={weeklyComparisonData} />
            <UserRoleCompositionChart
              userRoleChartData={userRoleChartData}
              activeAgents={userStats?.active_agents ?? 0}
              totalAgents={userStats?.total_agents ?? 0}
            />
            <UrgentTicketsSection
              urgentTickets={urgentTickets}
              error={error}
              isLoading={isLoading}
              onRetry={() => refetch()}
            />
          </div>

          <AssistedDraftHub
            assistedDraft={assistedDraft}
            assistedDraftRangeDays={assistedDraftRangeDays}
            setAssistedDraftRangeDays={setAssistedDraftRangeDays}
            isLoading={isLoading}
            showTopAgents
          />

          <RecentTicketsSection
            recentTickets={recentTickets}
            error={error}
            isLoading={isLoading}
            onRetry={() => refetch()}
          />
        </>
      ) : null}

      {role !== 'client' && role !== 'agent' && role !== 'admin' ? (
        <div className="rounded-xl border bg-card p-6">
          <EmptyState
            title={t('dashboard.unknownRoleTitle')}
            description={t('dashboard.unknownRoleDescription')}
          />
        </div>
      ) : null}
    </div>
  );
}
