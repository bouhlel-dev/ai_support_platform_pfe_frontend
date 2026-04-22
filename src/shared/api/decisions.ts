import { apiClient } from './client';
import type {
  DecisionEngineConfig,
  DecisionOutcomeDocs,
  DecisionResult,
  DecisionStats,
  DecisionSuggestionsResponse,
  EscalationPackage,
} from '@/shared/types';

export const decisionsApi = {
  analyzeTicket: (ticketId: string, opts?: { auto_assign?: boolean; auto_update_priority?: boolean }) =>
    apiClient<any>('/decision-engine/analyze', {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        auto_assign: opts?.auto_assign ?? false,
        auto_update_priority: opts?.auto_update_priority ?? false,
      }),
    }).then((res): DecisionResult => ({
      outcome: String(res.decision_outcome ?? '').toLowerCase(),
      confidence: Number(res.confidence_score ?? 0),
      confidence_level: String(res.confidence_level ?? '').toLowerCase(),
      intent_category: String(res.intent_category ?? '').toLowerCase(),
      risk_score: Number(res.risk_score ?? 0),
      risk_level: String(res.risk_level ?? 'medium').toLowerCase(),
      matched_rules: Array.isArray(res.matched_rules) ? res.matched_rules : [],
      reasoning: String(res.reasoning ?? ''),
      response_suggestions: Array.isArray(res.response_suggestions) ? res.response_suggestions.map(String) : [],
      suggested_priority: String(res.suggested_priority ?? '').toLowerCase(),
      suggested_agent_name: res.suggested_agent_name ? String(res.suggested_agent_name) : null,
      escalation_summary: res.escalation_summary ? String(res.escalation_summary) : null,
      ticket_id: res.ticket_id ? String(res.ticket_id) : ticketId,
    })),

  analyzeText: (text: string, subject?: string) =>
    apiClient<any>('/decision-engine/analyze-text', {
      method: 'POST',
      body: JSON.stringify({ text, subject }),
    }).then((res): DecisionResult => ({
      outcome: String(res.decision_outcome ?? '').toLowerCase(),
      confidence: Number(res.confidence_score ?? 0),
      confidence_level: String(res.confidence_level ?? '').toLowerCase(),
      intent_category: String(res.intent_category ?? '').toLowerCase(),
      risk_score: Number(res.risk_score ?? 0),
      risk_level: String(res.risk_level ?? 'medium').toLowerCase(),
      matched_rules: Array.isArray(res.matched_rules) ? res.matched_rules : [],
      reasoning: String(res.reasoning ?? ''),
      response_suggestions: Array.isArray(res.response_suggestions) ? res.response_suggestions.map(String) : [],
      suggested_priority: String(res.suggested_priority ?? '').toLowerCase(),
      suggested_agent_name: res.suggested_agent_name ? String(res.suggested_agent_name) : null,
      escalation_summary: res.escalation_summary ? String(res.escalation_summary) : null,
    })),

  history: (ticketId?: string) =>
    apiClient<any>(
      ticketId
        ? `/decision-engine/decisions/${ticketId}`
        : '/decision-engine/decisions',
    ).then((res): DecisionResult[] => {
      const decisions = Array.isArray(res?.decisions) ? res.decisions : [];
      return decisions.map((d: any): DecisionResult => ({
        id: d.id ? String(d.id) : undefined,
        ticket_id: d.ticket_id ? String(d.ticket_id) : ticketId,
        outcome: String(d.decision_outcome ?? '').toLowerCase(),
        confidence: Number(d.confidence_score ?? 0),
        confidence_level: String(d.confidence_level ?? '').toLowerCase(),
        intent_category: String(d.intent_category ?? '').toLowerCase(),
        risk_score: Number(d.risk_score ?? 0),
        risk_level: String(d.risk_level ?? 'medium').toLowerCase(),
        matched_rules: Array.isArray(d?.matched_rules?.rules)
          ? d.matched_rules.rules.map(String)
          : Array.isArray(d?.matched_rules)
            ? d.matched_rules.map(String)
            : [],
        reasoning: String(d.reasoning ?? ''),
        response_suggestions: Array.isArray(d?.response_suggestions?.suggestions)
          ? d.response_suggestions.suggestions.map(String)
          : [],
        suggested_priority: String(d.suggested_priority ?? '').toLowerCase(),
        escalation_summary: d.escalation_summary ? String(d.escalation_summary) : null,
        created_at: d.created_at ? String(d.created_at) : undefined,
      }));
    }),

  suggestions: (ticketId: string) =>
    apiClient<any>(`/decision-engine/suggestions/${ticketId}`).then((res): DecisionSuggestionsResponse => ({
      ticket_id: String(res.ticket_id),
      intent_category: String(res.intent_category ?? ''),
      suggestions: Array.isArray(res.suggestions) ? res.suggestions.map(String) : [],
      confidence: Number(res.confidence ?? 0),
    })),

  escalateTicket: (ticketId: string) =>
    apiClient<any>(`/decision-engine/escalate/${ticketId}`, {
      method: 'POST',
    }).then((res): EscalationPackage => {
      const riskRaw = String(res.risk_level ?? 'MEDIUM').toUpperCase();
      const risk_level = (riskRaw === 'CRITICAL'
        ? 'critical'
        : riskRaw === 'HIGH'
          ? 'high'
          : riskRaw === 'LOW'
            ? 'low'
            : 'medium') as EscalationPackage['risk_level'];

      return {
        ticket_id: String(res.ticket_id),
        ticket_subject: String(res.ticket_subject ?? ''),
        ticket_description: String(res.ticket_description ?? ''),
        intent_category: String(res.intent_category ?? ''),
        confidence_score: Number(res.confidence_score ?? 0),
        risk_score: Number(res.risk_score ?? 0),
        risk_level,
        conversation_history: Array.isArray(res.conversation_history)
          ? res.conversation_history.map((m: any) => ({
              sender_id: String(m.sender_id ?? ''),
              content: String(m.content ?? ''),
              is_internal: !!m.is_internal,
              created_at: String(m.created_at ?? ''),
            }))
          : [],
        previous_decisions: Array.isArray(res.previous_decisions)
          ? res.previous_decisions.map((d: any) => ({
              id: d.id ? String(d.id) : undefined,
              ticket_id: d.ticket_id ? String(d.ticket_id) : undefined,
              decision_outcome: d.decision_outcome ? String(d.decision_outcome) : undefined,
              confidence_score: d.confidence_score !== undefined ? Number(d.confidence_score) : undefined,
              risk_level: d.risk_level ? String(d.risk_level) : undefined,
              reasoning: d.reasoning ? String(d.reasoning) : undefined,
              matched_rules: d.matched_rules ?? null,
              created_at: d.created_at ? String(d.created_at) : undefined,
            }))
          : [],
        summary: String(res.summary ?? ''),
        recommended_actions: Array.isArray(res.recommended_actions) ? res.recommended_actions.map(String) : [],
      };
    }),

  getConfig: () =>
    apiClient<any>('/decision-engine/config').then((res): DecisionEngineConfig => ({
      confidence_high_threshold: Number(res.confidence_high_threshold ?? 0.7),
      confidence_medium_threshold: Number(res.confidence_medium_threshold ?? 0.4),
      risk_critical_threshold: Number(res.risk_critical_threshold ?? 0.7),
      risk_high_threshold: Number(res.risk_high_threshold ?? 0.5),
      risk_medium_threshold: Number(res.risk_medium_threshold ?? 0.3),
      low_confidence_risk_boost: Number(res.low_confidence_risk_boost ?? 0.08),
      medium_confidence_risk_boost: Number(res.medium_confidence_risk_boost ?? 0.03),
      enforce_security_escalation: Boolean(res.enforce_security_escalation),
      enforce_critical_escalation: Boolean(res.enforce_critical_escalation),
      low_confidence_general_suggest: Boolean(res.low_confidence_general_suggest),
    })),

  updateConfig: (payload: DecisionEngineConfig) =>
    apiClient<any>('/decision-engine/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }).then((res): DecisionEngineConfig => ({
      confidence_high_threshold: Number(res.confidence_high_threshold ?? 0.7),
      confidence_medium_threshold: Number(res.confidence_medium_threshold ?? 0.4),
      risk_critical_threshold: Number(res.risk_critical_threshold ?? 0.7),
      risk_high_threshold: Number(res.risk_high_threshold ?? 0.5),
      risk_medium_threshold: Number(res.risk_medium_threshold ?? 0.3),
      low_confidence_risk_boost: Number(res.low_confidence_risk_boost ?? 0.08),
      medium_confidence_risk_boost: Number(res.medium_confidence_risk_boost ?? 0.03),
      enforce_security_escalation: Boolean(res.enforce_security_escalation),
      enforce_critical_escalation: Boolean(res.enforce_critical_escalation),
      low_confidence_general_suggest: Boolean(res.low_confidence_general_suggest),
    })),

  getOutcomeDocs: () =>
    apiClient<any>('/decision-engine/outcomes-docs').then((res): DecisionOutcomeDocs => ({
      outcomes: Array.isArray(res?.outcomes)
        ? res.outcomes.map((item: any) => ({
            outcome: String(item.outcome ?? '').toLowerCase(),
            title: String(item.title ?? ''),
            description: String(item.description ?? ''),
            operator_guidance: String(item.operator_guidance ?? ''),
          }))
        : [],
      matrix: Array.isArray(res?.matrix)
        ? res.matrix.map((row: any) => ({
            confidence_level: String(row.confidence_level ?? '').toLowerCase(),
            risk_level: String(row.risk_level ?? '').toLowerCase(),
            category: String(row.category ?? '').toLowerCase(),
            outcome: String(row.outcome ?? '').toLowerCase(),
            matched_rule: String(row.matched_rule ?? ''),
            notes: String(row.notes ?? ''),
          }))
        : [],
    })),

  stats: () => apiClient<DecisionStats>('/decision-engine/stats'),
};
