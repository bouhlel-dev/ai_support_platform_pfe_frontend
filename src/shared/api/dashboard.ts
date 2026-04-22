import { apiClient } from './client';
import type { DashboardSummary } from '@/shared/types';

function normalizeText(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function normalizeDashboardSummary(raw: any): DashboardSummary {
  const urgentTickets = Array.isArray(raw?.urgent_tickets)
    ? raw.urgent_tickets.map((item: any) => ({
      id: String(item?.id ?? ''),
      subject: String(item?.subject ?? ''),
      status: normalizeText(item?.status),
      priority: normalizeText(item?.priority),
      assigned_agent_id: item?.assigned_agent_id ? String(item.assigned_agent_id) : null,
      created_at: String(item?.created_at ?? ''),
      updated_at: String(item?.updated_at ?? ''),
    }))
    : [];

  const leaderboard = Array.isArray(raw?.leaderboard)
    ? raw.leaderboard.map((item: any) => ({
      user_id: String(item?.user_id ?? ''),
      full_name: String(item?.full_name ?? ''),
      resolved_count: Number(item?.resolved_count ?? 0),
      open_assigned_count: Number(item?.open_assigned_count ?? 0),
    }))
    : [];

  const recentTickets = Array.isArray(raw?.recent_tickets)
    ? raw.recent_tickets.map((item: any) => ({
      id: String(item?.id ?? ''),
      subject: String(item?.subject ?? ''),
      status: normalizeText(item?.status),
      priority: normalizeText(item?.priority),
      channel_source: String(item?.channel_source ?? ''),
      created_at: String(item?.created_at ?? ''),
    }))
    : [];

  const monthlyTickets = Array.isArray(raw?.monthly_tickets)
    ? raw.monthly_tickets.map((item: any) => ({
      month: String(item?.month ?? ''),
      count: Number(item?.count ?? 0),
    }))
    : [];

  const weeklyTickets = Array.isArray(raw?.weekly_tickets)
    ? raw.weekly_tickets.map((item: any) => ({
      week: String(item?.week ?? ''),
      count: Number(item?.count ?? 0),
    }))
    : [];

  const dailyTickets = Array.isArray(raw?.daily_tickets)
    ? raw.daily_tickets.map((item: any) => ({
      day: String(item?.day ?? ''),
      count: Number(item?.count ?? 0),
    }))
    : [];

  const assistedDraftChannels = Array.isArray(raw?.assisted_draft?.channels)
    ? raw.assisted_draft.channels.map((item: any) => ({
      channel: (() => {
        const normalized = String(item?.channel ?? 'chat').toLowerCase();
        if (normalized === 'whatsapp') return 'whatsapp';
        if (normalized === 'email') return 'email';
        return 'chat';
      })(),
      generated: Number(item?.generated ?? 0),
      accepted: Number(item?.accepted ?? 0),
      sent: Number(item?.sent ?? 0),
      acceptance_rate: Number(item?.acceptance_rate ?? 0),
      assisted_share: Number(item?.assisted_share ?? 0),
      edited_rate: Number(item?.edited_rate ?? 0),
      edited_samples: Number(item?.edited_samples ?? 0),
      median_seconds_to_send: item?.median_seconds_to_send === null || item?.median_seconds_to_send === undefined
        ? null
        : Number(item?.median_seconds_to_send ?? 0),
      latency_samples: Number(item?.latency_samples ?? 0),
    }))
    : [];

  const assistedDraftDaily = Array.isArray(raw?.assisted_draft?.daily)
    ? raw.assisted_draft.daily.map((item: any) => ({
      day: String(item?.day ?? ''),
      generated: Number(item?.generated ?? 0),
      accepted: Number(item?.accepted ?? 0),
      sent: Number(item?.sent ?? 0),
    }))
    : [];

  const assistedDraftTopAgents = Array.isArray(raw?.assisted_draft?.top_agents)
    ? raw.assisted_draft.top_agents.map((item: any) => ({
      user_id: String(item?.user_id ?? ''),
      full_name: String(item?.full_name ?? ''),
      generated: Number(item?.generated ?? 0),
      accepted: Number(item?.accepted ?? 0),
      acceptance_rate: Number(item?.acceptance_rate ?? 0),
    }))
    : [];

  return {
    scope: raw?.scope === 'admin' || raw?.scope === 'agent' ? raw.scope : 'client',
    counts: {
      total: Number(raw?.counts?.total ?? 0),
      open: Number(raw?.counts?.open ?? 0),
      in_progress: Number(raw?.counts?.in_progress ?? 0),
      escalated: Number(raw?.counts?.escalated ?? 0),
      resolved: Number(raw?.counts?.resolved ?? 0),
      closed: Number(raw?.counts?.closed ?? 0),
    },
    weekly: {
      created_this_week: Number(raw?.weekly?.created_this_week ?? 0),
      resolved_this_week: Number(raw?.weekly?.resolved_this_week ?? 0),
      created_last_week: Number(raw?.weekly?.created_last_week ?? 0),
      resolved_last_week: Number(raw?.weekly?.resolved_last_week ?? 0),
    },
    daily_tickets: dailyTickets,
    weekly_tickets: weeklyTickets,
    monthly_tickets: monthlyTickets,
    user_stats: {
      total_users: Number(raw?.user_stats?.total_users ?? 0),
      total_admins: Number(raw?.user_stats?.total_admins ?? 0),
      total_agents: Number(raw?.user_stats?.total_agents ?? 0),
      total_clients: Number(raw?.user_stats?.total_clients ?? 0),
      active_agents: Number(raw?.user_stats?.active_agents ?? 0),
    },
    personal_performance: {
      my_resolved_tickets: Number(raw?.personal_performance?.my_resolved_tickets ?? 0),
      my_open_assigned_tickets: Number(raw?.personal_performance?.my_open_assigned_tickets ?? 0),
    },
    urgent_tickets: urgentTickets,
    leaderboard,
    ai_ops: {
      total_decisions: Number(raw?.ai_ops?.total_decisions ?? 0),
      auto_resolved: Number(raw?.ai_ops?.auto_resolved ?? 0),
      escalated: Number(raw?.ai_ops?.escalated ?? 0),
      escalation_rate: Number(raw?.ai_ops?.escalation_rate ?? 0),
      urgent_open_count: Number(raw?.ai_ops?.urgent_open_count ?? 0),
    },
    assisted_draft: {
      lookback_days: Number(raw?.assisted_draft?.lookback_days ?? 30),
      total_generated: Number(raw?.assisted_draft?.total_generated ?? 0),
      total_accepted: Number(raw?.assisted_draft?.total_accepted ?? 0),
      total_sent: Number(raw?.assisted_draft?.total_sent ?? 0),
      acceptance_rate: Number(raw?.assisted_draft?.acceptance_rate ?? 0),
      assisted_share: Number(raw?.assisted_draft?.assisted_share ?? 0),
      edited_rate: Number(raw?.assisted_draft?.edited_rate ?? 0),
      edited_samples: Number(raw?.assisted_draft?.edited_samples ?? 0),
      median_seconds_to_send: raw?.assisted_draft?.median_seconds_to_send === null
        || raw?.assisted_draft?.median_seconds_to_send === undefined
        ? null
        : Number(raw?.assisted_draft?.median_seconds_to_send ?? 0),
      latency_samples: Number(raw?.assisted_draft?.latency_samples ?? 0),
      channels: assistedDraftChannels,
      daily: assistedDraftDaily,
      top_agents: assistedDraftTopAgents,
    },
    recent_tickets: recentTickets,
  };
}

export const dashboardApi = {
  summary: async (assistedDraftDays: 7 | 30 | 90 = 30) =>
    normalizeDashboardSummary(
      await apiClient<any>('/dashboard/summary', {
        params: {
          assisted_draft_days: String(assistedDraftDays),
        },
      }),
    ),
};
