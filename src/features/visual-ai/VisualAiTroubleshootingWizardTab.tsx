import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { visualAiApi } from '@/shared/api/visual-ai';
import { normalizeError } from '@/shared/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, WandSparkles } from 'lucide-react';
import type { TroubleshootingWizardResponse } from '@/shared/types';

function toList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
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
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div>
          <Label>Support Goal</Label>
          <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should the user achieve?" />
        </div>

        <div>
          <Label>Issue Summary</Label>
          <Textarea
            value={issueSummary}
            onChange={(e) => setIssueSummary(e.target.value)}
            placeholder="Short problem summary"
            rows={3}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Observed Screen Caption</Label>
            <Textarea
              value={observedCaption}
              onChange={(e) => setObservedCaption(e.target.value)}
              placeholder="What do you see on screen?"
              rows={3}
            />
          </div>
          <div>
            <Label>Observed Text / Error</Label>
            <Textarea
              value={observedText}
              onChange={(e) => setObservedText(e.target.value)}
              placeholder="Visible text, OCR snippets, or error string"
              rows={3}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Actions Already Attempted (one per line)</Label>
            <Textarea
              value={attemptedActions}
              onChange={(e) => setAttemptedActions(e.target.value)}
              placeholder="Refresh page"
              rows={4}
            />
          </div>
          <div>
            <Label>Context Hints (one per line)</Label>
            <Textarea
              value={contextHints}
              onChange={(e) => setContextHints(e.target.value)}
              placeholder="Started after latest deployment"
              rows={4}
            />
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <Label>Max Steps</Label>
            <Input
              type="number"
              min={3}
              max={8}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value) || 5)}
              className="w-24"
            />
          </div>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || goal.trim().length < 5}
            size="sm"
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <WandSparkles className="h-4 w-4 mr-1" />
            )}
            Generate Wizard
          </Button>
        </div>
      </div>

      {mutation.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Wizard generation failed</AlertTitle>
          <AlertDescription>{normalizeError(mutation.error)}</AlertDescription>
        </Alert>
      )}

      {result && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Risk</p>
              <p className="text-sm font-semibold mt-1">{result.risk_level}</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Estimated Time</p>
              <p className="text-sm font-semibold mt-1">{result.estimated_time_minutes} min</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Engine</p>
              <p className="text-sm font-semibold mt-1">{result.provider}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Diagnosis</p>
            <p className="text-sm mt-1">{result.diagnosis}</p>
          </div>

          <div className="space-y-3">
            {result.steps.map((step) => (
              <div key={step.step_number} className="rounded-lg border p-3">
                <p className="text-sm font-semibold">
                  Step {step.step_number}: {step.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{step.why}</p>
                <ul className="mt-2 space-y-1">
                  {step.instructions.map((instruction, index) => (
                    <li key={index} className="text-sm">
                      {index + 1}. {instruction}
                    </li>
                  ))}
                </ul>
                <p className="text-xs mt-2">
                  <span className="font-medium">Expected:</span> {step.expected_signal}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-medium">If not seen:</span> {step.if_not_seen}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">Escalation Hint</p>
            <p className="text-sm mt-1">{result.escalation_hint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
