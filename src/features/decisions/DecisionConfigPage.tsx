import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { decisionsApi } from '@/shared/api/decisions';
import { normalizeError } from '@/shared/api/client';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { StatusBadge } from '@/shared/components/StatusBadge';
import type { DecisionEngineConfig } from '@/shared/types';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RotateCcw, Save, ShieldAlert, SlidersHorizontal } from 'lucide-react';

const DEFAULT_CONFIG: DecisionEngineConfig = {
  confidence_high_threshold: 0.7,
  confidence_medium_threshold: 0.4,
  risk_critical_threshold: 0.7,
  risk_high_threshold: 0.5,
  risk_medium_threshold: 0.3,
  low_confidence_risk_boost: 0.08,
  medium_confidence_risk_boost: 0.03,
  enforce_security_escalation: true,
  enforce_critical_escalation: true,
  low_confidence_general_suggest: true,
};

type NumericDecisionConfigKey =
  | 'confidence_high_threshold'
  | 'confidence_medium_threshold'
  | 'risk_critical_threshold'
  | 'risk_high_threshold'
  | 'risk_medium_threshold'
  | 'low_confidence_risk_boost'
  | 'medium_confidence_risk_boost';

const THRESHOLD_SLIDER_FIELDS: Array<{
  key: NumericDecisionConfigKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  {
    key: 'confidence_high_threshold',
    label: 'Confidence high threshold',
    min: 0.45,
    max: 0.98,
    step: 0.01,
  },
  {
    key: 'confidence_medium_threshold',
    label: 'Confidence medium threshold',
    min: 0.05,
    max: 0.94,
    step: 0.01,
  },
  {
    key: 'risk_critical_threshold',
    label: 'Risk critical threshold',
    min: 0.45,
    max: 1,
    step: 0.01,
  },
  {
    key: 'risk_high_threshold',
    label: 'Risk high threshold',
    min: 0.2,
    max: 0.98,
    step: 0.01,
  },
  {
    key: 'risk_medium_threshold',
    label: 'Risk medium threshold',
    min: 0.05,
    max: 0.9,
    step: 0.01,
  },
  {
    key: 'low_confidence_risk_boost',
    label: 'Low confidence risk boost',
    min: 0,
    max: 0.4,
    step: 0.01,
  },
  {
    key: 'medium_confidence_risk_boost',
    label: 'Medium confidence risk boost',
    min: 0,
    max: 0.25,
    step: 0.01,
  },
];

function formatSliderValue(value: number, step: number) {
  const rawStep = `${step}`;
  const decimals = rawStep.includes('.') ? rawStep.split('.')[1].length : 0;
  return value.toFixed(decimals);
}

function humanize(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

export function DecisionConfigPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<DecisionEngineConfig | null>(null);

  const configQuery = useQuery({
    queryKey: ['decision-engine-config'],
    queryFn: decisionsApi.getConfig,
  });

  const docsQuery = useQuery({
    queryKey: ['decision-outcomes-docs'],
    queryFn: decisionsApi.getOutcomeDocs,
  });

  useEffect(() => {
    if (configQuery.data) {
      setDraft(configQuery.data);
    }
  }, [configQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: DecisionEngineConfig) => decisionsApi.updateConfig(payload),
    onSuccess: (next) => {
      setDraft(next);
      queryClient.invalidateQueries({ queryKey: ['decision-engine-config'] });
      queryClient.invalidateQueries({ queryKey: ['decision-outcomes-docs'] });
      queryClient.invalidateQueries({ queryKey: ['decision-stats'] });
      toast({ title: 'Decision engine configuration saved' });
    },
    onError: (err) => {
      toast({ variant: 'destructive', title: 'Failed to save config', description: normalizeError(err) });
    },
  });

  const hasOrderingIssue = useMemo(() => {
    if (!draft) return false;
    return (
      draft.confidence_medium_threshold >= draft.confidence_high_threshold
      || draft.risk_medium_threshold >= draft.risk_high_threshold
      || draft.risk_high_threshold >= draft.risk_critical_threshold
    );
  }, [draft]);

  const setThresholdValue = (key: NumericDecisionConfigKey, values: number[]) => {
    const next = values[0];
    if (typeof next !== 'number' || Number.isNaN(next)) return;
    setDraft((prev) => (prev ? { ...prev, [key]: next } : prev));
  };

  const setToggle = (key: keyof DecisionEngineConfig, value: boolean) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Decision Rule Configuration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Fine-tune confidence, risk, and escalation behavior used by the decision engine.
            </p>
          </div>

          <Button asChild variant="outline" className="gap-2">
            <Link to="/decisions">
              <ArrowLeft className="h-4 w-4" />
              Back to Decisions
            </Link>
          </Button>
        </div>

        <Alert>
          <SlidersHorizontal className="h-4 w-4" />
          <AlertTitle>Live runtime tuning</AlertTitle>
          <AlertDescription>
            Changes here affect ticket analysis endpoints immediately. Save only after validating impact.
          </AlertDescription>
        </Alert>
      </div>

      {configQuery.isLoading ? (
        <TableSkeleton rows={6} cols={1} />
      ) : configQuery.error ? (
        <ErrorState message={normalizeError(configQuery.error)} onRetry={() => configQuery.refetch()} />
      ) : !draft ? (
        <EmptyState title="No configuration available" description="Decision engine config could not be loaded." />
      ) : (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Threshold tuning</h2>

          {hasOrderingIssue ? (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Threshold ordering warning</AlertTitle>
              <AlertDescription>
                Medium thresholds must remain lower than high thresholds, and high risk must remain lower than critical risk.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {THRESHOLD_SLIDER_FIELDS.map((field) => {
              const value = draft[field.key];
              return (
                <div key={field.key} className="space-y-2 rounded-lg border bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs">{field.label}</Label>
                    <span className="rounded-md border bg-background px-2 py-0.5 text-xs font-medium tabular-nums">
                      {formatSliderValue(value, field.step)}
                    </span>
                  </div>
                  <Slider
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={[value]}
                    onValueChange={(values) => setThresholdValue(field.key, values)}
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{formatSliderValue(field.min, field.step)}</span>
                    <span>{formatSliderValue(field.max, field.step)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-border/70" />

          <h2 className="text-sm font-semibold pt-2">Rule toggles</h2>

          <div className="grid gap-2">
            <div className="flex items-center justify-between rounded-lg border bg-muted/10 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Enforce security escalation</p>
                <p className="text-xs text-muted-foreground">Always escalate SECURITY category tickets.</p>
              </div>
              <Switch
                checked={draft.enforce_security_escalation}
                onCheckedChange={(v) => setToggle('enforce_security_escalation', v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/10 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Enforce critical escalation</p>
                <p className="text-xs text-muted-foreground">Always escalate CRITICAL risk tickets.</p>
              </div>
              <Switch
                checked={draft.enforce_critical_escalation}
                onCheckedChange={(v) => setToggle('enforce_critical_escalation', v)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/10 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Low confidence general suggest</p>
                <p className="text-xs text-muted-foreground">Allow GENERAL + low confidence + low risk to suggest responses instead of clarify.</p>
              </div>
              <Switch
                checked={draft.low_confidence_general_suggest}
                onCheckedChange={(v) => setToggle('low_confidence_general_suggest', v)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending || hasOrderingIssue}
            >
              {saveMutation.isPending ? <RotateCcw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save configuration
            </Button>

            <Button variant="outline" onClick={() => setDraft(configQuery.data ?? null)} disabled={saveMutation.isPending}>
              Revert unsaved changes
            </Button>

            <Button variant="ghost" onClick={() => setDraft(DEFAULT_CONFIG)} disabled={saveMutation.isPending}>
              Reset to defaults
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">Outcomes documentation</h2>

        {docsQuery.isLoading ? (
          <TableSkeleton rows={6} cols={1} />
        ) : docsQuery.error ? (
          <ErrorState message={normalizeError(docsQuery.error)} onRetry={() => docsQuery.refetch()} />
        ) : !docsQuery.data ? (
          <EmptyState title="No documentation" description="Could not load decision outcomes documentation." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Outcome</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Operator guidance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docsQuery.data.outcomes.map((item) => (
                    <tr key={item.outcome}>
                      <td className="p-3 align-top">
                        <div className="space-y-1">
                          <StatusBadge status={item.outcome} />
                          <p className="text-xs text-muted-foreground">{item.title}</p>
                        </div>
                      </td>
                      <td className="p-3 align-top text-muted-foreground">{item.description}</td>
                      <td className="p-3 align-top">{item.operator_guidance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Confidence</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Risk</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Outcome</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {docsQuery.data.matrix.map((row, index) => (
                    <tr key={`${row.category}-${row.confidence_level}-${row.risk_level}-${index}`}>
                      <td className="p-3">{humanize(row.category)}</td>
                      <td className="p-3">{humanize(row.confidence_level)}</td>
                      <td className="p-3"><StatusBadge status={row.risk_level} /></td>
                      <td className="p-3"><StatusBadge status={row.outcome} /></td>
                      <td className="p-3 text-xs text-muted-foreground">{row.matched_rule}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
