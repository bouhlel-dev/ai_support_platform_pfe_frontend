import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/shared/api/dashboard';
import { KpiCard } from '@/shared/components/KpiCard';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { normalizeError } from '@/shared/api/client';
import {
  Ticket,
  AlertTriangle,
  Activity,
  Clock,
  Bot,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
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

type TrendDirection = 'up' | 'down' | 'flat';

function getWeekTrend(current: number, previous: number) {
  const delta = current - previous;

  if (delta === 0) {
    return {
      direction: 'flat' as TrendDirection,
      label: 'No change vs last week',
    };
  }

  if (previous === 0) {
    return {
      direction: delta > 0 ? ('up' as TrendDirection) : ('down' as TrendDirection),
      label: `${delta > 0 ? '+' : ''}${delta} vs last week`,
    };
  }

  const percent = Math.abs((delta / previous) * 100);

  return {
    direction: delta > 0 ? ('up' as TrendDirection) : ('down' as TrendDirection),
    label: `${delta > 0 ? '+' : ''}${delta} (${percent.toFixed(0)}%) vs last week`,
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

function formatSecondsCompact(seconds?: number | null) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return 'N/A';
  }

  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

const STATUS_CHART_COLORS = [
  'hsl(38,92%,50%)',
  'hsl(0,72%,51%)',
  'hsl(142,71%,45%)',
  'hsl(220,14%,45%)',
];

const ROLE_CHART_COLORS = [
  'hsl(220,65%,50%)',
  'hsl(142,71%,45%)',
  'hsl(38,92%,50%)',
];

const ASSISTED_DRAFT_RANGE_OPTIONS: Array<{ label: string; value: 7 | 30 | 90 }> = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

export function DashboardPage() {
  const [assistedDraftRangeDays, setAssistedDraftRangeDays] = useState<7 | 30 | 90>(30);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-summary', assistedDraftRangeDays],
    queryFn: () => dashboardApi.summary(assistedDraftRangeDays),
  });

  const [volumeRange, setVolumeRange] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [showAllUrgentTickets, setShowAllUrgentTickets] = useState(false);

  const counts = data?.counts;
  const weekly = data?.weekly;
  const recentTickets = data?.recent_tickets ?? [];
  const urgentTickets = data?.urgent_tickets ?? [];
  const leaderboard = data?.leaderboard ?? [];
  const aiOps = data?.ai_ops;
  const assistedDraft = data?.assisted_draft;
  const scope = data?.scope ?? 'client';
  const userStats = data?.user_stats;
  const dailyTickets = data?.daily_tickets;
  const weeklyTickets = data?.weekly_tickets;
  const monthlyTickets = data?.monthly_tickets;
  const isAdminScope = scope === 'admin';

  const createdTrend = getWeekTrend(weekly?.created_this_week ?? 0, weekly?.created_last_week ?? 0);
  const resolvedTrend = getWeekTrend(weekly?.resolved_this_week ?? 0, weekly?.resolved_last_week ?? 0);

  const createdTrendIcon =
    createdTrend.direction === 'up' ? ArrowUpRight : createdTrend.direction === 'down' ? ArrowDownRight : Minus;
  const resolvedTrendIcon =
    resolvedTrend.direction === 'up' ? ArrowUpRight : resolvedTrend.direction === 'down' ? ArrowDownRight : Minus;

  const totalDecisions = aiOps?.total_decisions ?? 0;
  const autoResolved = aiOps?.auto_resolved ?? 0;
  const escalated = aiOps?.escalated ?? 0;
  const autoResolvedShare = totalDecisions > 0 ? (autoResolved / totalDecisions) * 100 : 0;
  const escalatedShare = totalDecisions > 0 ? (escalated / totalDecisions) * 100 : 0;
  const escalationRatePct = ((aiOps?.escalation_rate ?? 0) * 100).toFixed(1);
  const urgentOpenCount = aiOps?.urgent_open_count ?? 0;
  const assistedDraftLookbackDays = assistedDraft?.lookback_days ?? 30;
  const assistedDraftGenerated = assistedDraft?.total_generated ?? 0;
  const assistedDraftAccepted = assistedDraft?.total_accepted ?? 0;
  const assistedDraftSent = assistedDraft?.total_sent ?? 0;
  const assistedDraftAcceptancePct = ((assistedDraft?.acceptance_rate ?? 0) * 100).toFixed(1);
  const assistedDraftSharePct = ((assistedDraft?.assisted_share ?? 0) * 100).toFixed(1);
  const assistedDraftEditedPct = ((assistedDraft?.edited_rate ?? 0) * 100).toFixed(1);
  const assistedDraftMedianDelay = formatSecondsCompact(assistedDraft?.median_seconds_to_send ?? null);
  const assistedDraftDaily = assistedDraft?.daily ?? [];
  const assistedDraftChannels = assistedDraft?.channels ?? [];
  const assistedDraftTopAgents = assistedDraft?.top_agents ?? [];
  const assistedDraftXAxisInterval = assistedDraftDaily.length > 35
    ? Math.ceil(assistedDraftDaily.length / 12)
    : 0;
  const hasAssistedDraftDailyData = assistedDraftDaily.some(
    (item) => item.generated > 0 || item.accepted > 0 || item.sent > 0,
  );

  const statusChartData = useMemo(
    () => [
      { label: 'In progress', value: counts?.in_progress ?? 0 },
      { label: 'Escalated', value: counts?.escalated ?? 0 },
      { label: 'Resolved', value: counts?.resolved ?? 0 },
      { label: 'Closed', value: counts?.closed ?? 0 },
    ],
    [counts],
  );

  const weeklyComparisonData = useMemo(
    () => [
      {
        period: 'Last week',
        created: weekly?.created_last_week ?? 0,
        resolved: weekly?.resolved_last_week ?? 0,
      },
      {
        period: 'This week',
        created: weekly?.created_this_week ?? 0,
        resolved: weekly?.resolved_this_week ?? 0,
      },
    ],
    [weekly],
  );

  const volumeChartData = useMemo(() => {
    if (volumeRange === 'daily') {
      if (Array.isArray(dailyTickets) && dailyTickets.length > 0) {
        return dailyTickets.map((item) => ({ label: item.day, count: item.count }));
      }

      const now = new Date();
      return Array.from({ length: 7 }, (_, idx) => {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - idx));
        return { label: date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }), count: 0 };
      });
    }

    if (volumeRange === 'weekly') {
      if (Array.isArray(weeklyTickets) && weeklyTickets.length > 0) {
        return weeklyTickets.map((item) => ({ label: item.week, count: item.count }));
      }

      const now = new Date();
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));

      return Array.from({ length: 8 }, (_, idx) => {
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(currentWeekStart.getDate() - (7 * (7 - idx)));
        return { label: `Week of ${weekStart.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}`, count: 0 };
      });
    }

    if (Array.isArray(monthlyTickets) && monthlyTickets.length > 0) {
      return monthlyTickets.map((item) => ({ label: item.month, count: item.count }));
    }

    const now = new Date();
    return Array.from({ length: 6 }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      return { label: date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), count: 0 };
    });
  }, [dailyTickets, weeklyTickets, monthlyTickets, volumeRange]);

  const volumeRangeLabel = volumeRange === 'daily' ? 'Last 7 days' : volumeRange === 'weekly' ? 'Last 8 weeks' : 'Last 6 months';

  const userRoleChartData = useMemo(
    () => [
      { label: 'Admins', value: userStats?.total_admins ?? 0 },
      { label: 'Agents', value: userStats?.total_agents ?? 0 },
      { label: 'Clients', value: userStats?.total_clients ?? 0 },
    ],
    [userStats],
  );

  const hasStatusChartData = statusChartData.some((item) => item.value > 0);
  const hasVolumeData = volumeChartData.some((item) => item.count > 0);
  const hasRoleChartData = userRoleChartData.some((item) => item.value > 0);
  const urgentTicketsPreviewCount = 3;
  const hasMoreUrgentTickets = urgentTickets.length > urgentTicketsPreviewCount;
  const visibleUrgentTickets = showAllUrgentTickets ? urgentTickets : urgentTickets.slice(0, urgentTicketsPreviewCount);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of your support operations</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Tickets" value={counts?.total ?? 0} icon={Ticket} variant="default" loading={isLoading} />
        <KpiCard title="Open" value={counts?.open ?? 0} icon={Clock} variant="info" loading={isLoading} />
        <KpiCard title="Escalated" value={counts?.escalated ?? 0} icon={AlertTriangle} variant="destructive" loading={isLoading} />
        <KpiCard
          title="AI Decisions"
          value={aiOps?.total_decisions ?? 0}
          icon={Bot}
          variant="success"
          loading={isLoading}
          trend={`${((aiOps?.escalation_rate ?? 0) * 100).toFixed(1)}% escalated`}
        />
      </div>

      {isAdminScope ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
            Assisted drafts ({assistedDraftLookbackDays}d): generated {assistedDraftGenerated} · accepted {assistedDraftAccepted} · {assistedDraftAcceptancePct}% acceptance
          </span>
          <span className="rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground">
            Assisted share {assistedDraftSharePct}% · median {assistedDraftMedianDelay}
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Weekly Activity</h2>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--info)/.12)] text-[hsl(var(--info))]">
              <Activity className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border bg-[hsl(var(--info)/.08)] p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Created</p>
              <p className="mt-1 text-2xl font-semibold leading-none">{weekly?.created_this_week ?? 0}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last week: {weekly?.created_last_week ?? 0}</p>
              <span
                className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${getTrendBadgeClass(createdTrend.direction)}`}
              >
                {createdTrendIcon === Minus ? (
                  <Minus className="h-3.5 w-3.5" />
                ) : createdTrendIcon === ArrowUpRight ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
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
                {resolvedTrendIcon === Minus ? (
                  <Minus className="h-3.5 w-3.5" />
                ) : resolvedTrendIcon === ArrowUpRight ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {resolvedTrend.label}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
              Urgent open tickets
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

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">AI Ops</h2>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--primary)/.12)] text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>

          <div className="mt-4 rounded-lg border bg-[hsl(var(--primary)/.1)] p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total decisions</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{totalDecisions}</p>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Auto resolved</span>
                <span className="font-medium">
                  {autoResolved}
                  <span className="ml-1 text-muted-foreground">({autoResolvedShare.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[hsl(var(--success))]" style={{ width: `${Math.min(100, autoResolvedShare)}%` }} />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Escalated</span>
                <span className="font-medium">
                  {escalated}
                  <span className="ml-1 text-muted-foreground">({escalatedShare.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-[hsl(var(--destructive))]" style={{ width: `${Math.min(100, escalatedShare)}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] px-3 py-3">
            <span className="text-sm font-medium text-muted-foreground">Escalation rate</span>
            <span className="text-2xl font-bold leading-none tracking-tight text-[hsl(var(--destructive))]">{escalationRatePct}%</span>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Agent Leaderboard</h2>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--warning)/.14)] text-[hsl(var(--warning))]">
              <Trophy className="h-4 w-4" />
            </span>
          </div>

          {leaderboard.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No leaderboard data available for this role.</p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {leaderboard.map((entry, index) => (
                <div
                  key={`${entry.user_id}-${index}`}
                  className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 text-sm transition-colors hover:border-primary/30"
                >
                  <span
                    className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      index === 0
                        ? 'bg-[hsl(var(--warning)/.16)] text-[hsl(var(--warning))]'
                        : index === 1
                          ? 'bg-muted text-foreground'
                          : index === 2
                            ? 'bg-[hsl(var(--info)/.16)] text-[hsl(var(--info))]'
                            : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{entry.full_name || 'Unknown agent'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full bg-[hsl(var(--success)/.12)] px-2 py-0.5 font-medium text-[hsl(var(--success))]">
                        Resolved {entry.resolved_count}
                      </span>
                      <span className="rounded-full bg-[hsl(var(--info)/.12)] px-2 py-0.5 font-medium text-[hsl(var(--info))]">
                        Open assigned {entry.open_assigned_count}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-lg font-semibold leading-none">{entry.resolved_count}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">resolved</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Urgent Tickets</h2>
          {hasMoreUrgentTickets && !error ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setShowAllUrgentTickets((current) => !current)}
            >
              {showAllUrgentTickets ? 'Show less' : `Show more (${urgentTickets.length - urgentTicketsPreviewCount})`}
            </button>
          ) : null}
        </div>
        {error ? (
          <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />
        ) : urgentTickets.length === 0 && !isLoading ? (
          <EmptyState title="No urgent tickets" description="High priority active tickets will appear here." />
        ) : (
          <div className="divide-y">
            {visibleUrgentTickets.map((ticket) => (
              <Link to={`/tickets/${ticket.id}`} key={ticket.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Updated {new Date(ticket.updated_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <StatusBadge status={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 xl:col-span-2">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Ticket Volume Trend</h2>
              <p className="text-xs text-muted-foreground">{volumeRangeLabel}</p>
            </div>

            <div className="inline-flex rounded-md border bg-muted/20 p-1 text-xs">
              <button
                type="button"
                className={`rounded px-2.5 py-1 transition-colors ${volumeRange === 'daily' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setVolumeRange('daily')}
              >
                Daily
              </button>
              <button
                type="button"
                className={`rounded px-2.5 py-1 transition-colors ${volumeRange === 'weekly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setVolumeRange('weekly')}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`rounded px-2.5 py-1 transition-colors ${volumeRange === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setVolumeRange('monthly')}
              >
                6 months
              </button>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={volumeChartData} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {!hasVolumeData ? (
            <p className="mt-2 text-xs text-muted-foreground">No created tickets in this range yet.</p>
          ) : null}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Ticket Status Mix</h2>
            <p className="text-xs text-muted-foreground">Current status distribution</p>
          </div>

          {hasStatusChartData ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusChartData.filter((item) => item.value > 0)}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {statusChartData.filter((item) => item.value > 0).map((_, index) => (
                      <Cell key={`status-cell-${index}`} fill={STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No ticket status data yet.</p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            {statusChartData.map((item, index) => (
              <div key={item.label} className="flex items-center justify-between rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length] }} />
                  {item.label}
                </span>
                <span className="font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={isAdminScope ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-4'}>
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Weekly Created vs Resolved</h2>
            <p className="text-xs text-muted-foreground">This week compared to last week</p>
          </div>

          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyComparisonData} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                <Tooltip />
                <Bar dataKey="created" name="Created" fill="hsl(220,65%,50%)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="hsl(142,71%,45%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {isAdminScope ? (
          <div className="rounded-xl border bg-card p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">User Role Composition</h2>
              <p className="text-xs text-muted-foreground">Admins, agents, and clients</p>
            </div>

            {hasRoleChartData ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={userRoleChartData} dataKey="value" nameKey="label" innerRadius={40} outerRadius={74}>
                        {userRoleChartData.map((_, index) => (
                          <Cell key={`role-cell-${index}`} fill={ROLE_CHART_COLORS[index % ROLE_CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid content-center gap-2">
                  {userRoleChartData.map((item, index) => (
                    <div key={item.label} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2 text-muted-foreground">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: ROLE_CHART_COLORS[index % ROLE_CHART_COLORS.length] }} />
                        {item.label}
                      </span>
                      <span className="font-semibold text-foreground">{item.value}</span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">Active agents: {userStats?.active_agents ?? 0} / {userStats?.total_agents ?? 0}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No user role data available.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Assisted Draft Performance Hub</h2>
            <p className="text-xs text-muted-foreground">Last {assistedDraftLookbackDays} days</p>
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
              generated {assistedDraftGenerated} · accepted {assistedDraftAccepted}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Acceptance rate</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{assistedDraftAcceptancePct}%</p>
            <p className="mt-1 text-xs text-muted-foreground">Accepted / generated drafts</p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Assisted share</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{assistedDraftSharePct}%</p>
            <p className="mt-1 text-xs text-muted-foreground">Accepted drafts / all operator sends ({assistedDraftSent})</p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Median draft-to-send</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{assistedDraftMedianDelay}</p>
            <p className="mt-1 text-xs text-muted-foreground">Sample size: {assistedDraft?.latency_samples ?? 0}</p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Edit rate</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{assistedDraftEditedPct}%</p>
            <p className="mt-1 text-xs text-muted-foreground">Edited before send: {assistedDraft?.edited_samples ?? 0} samples</p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Drafts generated</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{assistedDraftGenerated}</p>
            <p className="mt-1 text-xs text-muted-foreground">AI draft suggestions requested</p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Drafts accepted</p>
            <p className="mt-1 text-2xl font-semibold leading-none">{assistedDraftAccepted}</p>
            <p className="mt-1 text-xs text-muted-foreground">Drafts sent with operator confirmation</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-5">
          <div className="rounded-lg border bg-muted/10 p-3 xl:col-span-3">
            <div className="mb-2">
              <p className="text-sm font-medium">Daily Funnel</p>
              <p className="text-xs text-muted-foreground">Generated vs accepted vs total sends</p>
            </div>

            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={assistedDraftDaily} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    interval={assistedDraftXAxisInterval}
                    minTickGap={12}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={30} />
                  <Tooltip />
                  <Line type="monotone" dataKey="generated" name="Generated" stroke="hsl(var(--info))" strokeWidth={2.2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="accepted" name="Accepted" stroke="hsl(var(--success))" strokeWidth={2.2} dot={{ r: 2 }} />
                  <Line type="monotone" dataKey="sent" name="Sent" stroke="hsl(var(--warning))" strokeWidth={2.2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {!hasAssistedDraftDailyData ? (
              <p className="mt-2 text-xs text-muted-foreground">No assisted draft activity captured yet.</p>
            ) : null}
          </div>

          <div className="space-y-3 xl:col-span-2">
            <div className="rounded-lg border bg-muted/10 p-3">
              <p className="text-sm font-medium">Channel Breakdown</p>
              <div className="mt-2 space-y-2">
                {assistedDraftChannels.map((channel) => (
                  <div key={channel.channel} className="rounded-md border bg-background/80 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {channel.channel === 'whatsapp'
                          ? 'WhatsApp'
                          : channel.channel === 'email'
                            ? 'Email'
                            : 'Chat'}
                      </span>
                      <span className="text-muted-foreground">{(channel.acceptance_rate * 100).toFixed(1)}% accepted</span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      gen {channel.generated} · acc {channel.accepted} · sent {channel.sent}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      share {(channel.assisted_share * 100).toFixed(1)}% · median {formatSecondsCompact(channel.median_seconds_to_send)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/10 p-3">
              <p className="text-sm font-medium">Top Agents (Accepted Drafts)</p>
              {assistedDraftTopAgents.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Top-agent ranking appears for admin scope once events are available.</p>
              ) : (
                <div className="mt-2 space-y-1.5 text-xs">
                  {assistedDraftTopAgents.map((entry, index) => (
                    <div key={`${entry.user_id}-${index}`} className="flex items-center justify-between rounded-md border bg-background/80 px-2 py-1.5">
                      <span className="truncate pr-2 font-medium text-foreground">{entry.full_name || 'Unknown agent'}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {entry.accepted} accepted ({(entry.acceptance_rate * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold">Recent Tickets</h2>
        </div>
        {error ? (
          <ErrorState message={normalizeError(error)} onRetry={() => refetch()} />
        ) : recentTickets.length === 0 && !isLoading ? (
          <EmptyState title="No tickets yet" description="Recent tickets will appear here once created." />
        ) : (
          <div className="divide-y">
            {recentTickets.map((ticket) => (
              <Link to={`/tickets/${ticket.id}`} key={ticket.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ticket.channel_source} · {new Date(ticket.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <StatusBadge status={ticket.priority} />
                  <StatusBadge status={ticket.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
