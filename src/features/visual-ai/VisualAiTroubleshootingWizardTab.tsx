import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { visualAiApi } from '@/shared/api/visual-ai';
import { normalizeError } from '@/shared/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  AlertCircle,
  WandSparkles,
  Clock,
  ShieldAlert,
  Cpu,
  ChevronRight,
  TriangleAlert,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TroubleshootingWizardResponse } from '@/shared/types';

function toList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function RiskBadge({ level }: { level: string }) {
  const lower = level.toLowerCase();
  const variant =
    lower.includes('low')
      ? 'default'
      : lower.includes('high')
      ? 'destructive'
      : 'secondary';

  const cls = cn(
    'text-xs font-medium px-2 py-0.5 rounded-full',
    lower.includes('low') && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    lower.includes('medium') && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    lower.includes('high') && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  );

  return <span className={cls}>{level}</span>;
}

export function VisualAiTroubleshootingWizardTab() {
  const [goal, setGoal] = useState('Help the user complete the checkout flow');
  const [issueSummary, setIssueSummary] = useState('User cannot submit payment after filling card details');
  const [observedCaption, setObservedCaption] = useState('Checkout screen with payment form and disabled submit button');
  const [observedText, setObservedText] = useState('Error shown near payment section: "Unable to process request".');
  const [attemptedActions, setAttemptedActions] = useState('Refreshed page\nRetried with another card');
  const [contextHints, setContextHints] = useState('Issue started today\nAffects one customer account');
  const [maxSteps, setMaxSteps] = useState(5);

  const mutation = useMutation({
    mutationFn: () =>
      visualAiApi.troubleshootingWizard({
        goal,
        issue_summary: issueSummary || undefined,
        observed_screen_caption: observedCaption || undefined,
        observed_text: observedText || undefined,
        user_actions_attempted: toList(attemptedActions),
        context_hints: toList(contextHints),
        max_steps: Math.min(8, Math.max(3, maxSteps)),
      }),
  });

  const result = mutation.data as TroubleshootingWizardResponse | undefined;

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Context */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground pb-2 border-b">
          Context
        </h3>
        <div className="space-y-1.5">
          <Label>Support goal</Label>
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What should the user achieve?"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Issue summary</Label>
          <Textarea
            value={issueSummary}
            onChange={(e) => setIssueSummary(e.target.value)}
            placeholder="Short problem summary"
            rows={2}
            className="resize-none"
          />
        </div>
      </section>

      {/* Observed state */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground pb-2 border-b">
          Observed state
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Screen caption</Label>
            <Textarea
              value={observedCaption}
              onChange={(e) => setObservedCaption(e.target.value)}
              placeholder="What do you see on screen?"
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Visible text / error</Label>
            <Textarea
              value={observedText}
              onChange={(e) => setObservedText(e.target.value)}
              placeholder="OCR snippets or error string"
              rows={3}
              className="resize-none"
            />
          </div>
        </div>
      </section>

      {/* History */}
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground pb-2 border-b">
          History & context
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Actions already attempted</Label>
            <Textarea
              value={attemptedActions}
              onChange={(e) => setAttemptedActions(e.target.value)}
              placeholder="One per line — e.g. Refresh page"
              rows={4}
              className="resize-none font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Context hints</Label>
            <Textarea
              value={contextHints}
              onChange={(e) => setContextHints(e.target.value)}
              placeholder="One per line — e.g. Started after deployment"
              rows={4}
              className="resize-none font-mono text-xs"
            />
          </div>
        </div>
      </section>

      {/* Actions row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Label className="whitespace-nowrap">Max steps</Label>
          <Input
            type="number"
            min={3}
            max={8}
            value={maxSteps}
            onChange={(e) => setMaxSteps(Number(e.target.value) || 5)}
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">3 – 8</span>
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || goal.trim().length < 5}
          size="sm"
          className="gap-1.5"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <WandSparkles className="h-3.5 w-3.5" />
          )}
          {mutation.isPending ? 'Generating…' : 'Generate wizard'}
        </Button>
      </div>

      {/* Error */}
      {mutation.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Wizard generation failed</AlertTitle>
          <AlertDescription>{normalizeError(mutation.error)}</AlertDescription>
        </Alert>
      )}

      {/* Result */}
      {result && (
        <section className="rounded-xl border bg-card p-5 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                Risk
              </div>
              <RiskBadge level={result.risk_level} />
            </div>
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Est. time
              </div>
              <p className="text-sm font-medium">{result.estimated_time_minutes} min</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Cpu className="h-3.5 w-3.5" />
                Engine
              </div>
              <p className="text-sm font-medium truncate">{result.provider}</p>
            </div>
          </div>

          {/* Diagnosis */}
          <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
            {result.diagnosis}
          </div>

          <Separator />

          {/* Steps */}
          <div className="space-y-3">
            {result.steps.map((step) => (
              <div
                key={step.step_number}
                className="rounded-lg border bg-background p-4 space-y-3"
              >
                {/* Step header */}
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full bg-foreground text-background text-xs font-medium mt-0.5">
                    {step.step_number}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.why}</p>
                  </div>
                </div>

                {/* Instructions */}
                <ol className="space-y-1.5 pl-9">
                  {step.instructions.map((instruction, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                      {instruction}
                    </li>
                  ))}
                </ol>

                {/* Signal / fallback */}
                <div className="grid grid-cols-2 gap-2 pl-9">
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Expected
                    </p>
                    <p className="text-xs">{step.expected_signal}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                      <TriangleAlert className="h-3 w-3" />
                      If not seen
                    </p>
                    <p className="text-xs">{step.if_not_seen}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Escalation */}
          <div className="rounded-lg border-l-2 border-border pl-4 pr-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
              Escalation hint
            </p>
            <p className="text-sm text-muted-foreground">{result.escalation_hint}</p>
          </div>
        </section>
      )}
    </div>
  );
}