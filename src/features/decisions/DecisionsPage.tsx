import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { decisionsApi } from '@/shared/api/decisions';
import { EmptyState, ErrorState } from '@/shared/components/EmptyState';
import { TableSkeleton } from '@/shared/components/Skeletons';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { normalizeError } from '@/shared/api/client';
import { useAuth } from '@/features/auth/AuthContext';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { useToast } from '@/hooks/use-toast';
import { Brain, Loader2, SlidersHorizontal, Sparkles, ShieldAlert, Gauge, GitBranch } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { DecisionResult } from '@/shared/types';

const COLORS = ['hsl(142,71%,45%)', 'hsl(38,92%,50%)', 'hsl(0,72%,51%)'];

function humanize(value: string | null | undefined) {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

export function DecisionsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [ticketId, setTicketId] = useState('');
  const [historyTicketId, setHistoryTicketId] = useState('');
  const [freeText, setFreeText] = useState('');
  const [freeSubject, setFreeSubject] = useState('');
  const [autoAssign, setAutoAssign] = useState(false);
  const [autoUpdatePriority, setAutoUpdatePriority] = useState(true);
  const [result, setResult] = useState<DecisionResult | null>(null);

  const ticketIdTrimmed = ticketId.trim();
  const historyTicketIdTrimmed = historyTicketId.trim();

  const { data: history, isLoading: histLoading, error: histError, refetch: histRefetch } = useQuery({
    queryKey: ['decision-history', historyTicketIdTrimmed || 'all'],
    queryFn: () => decisionsApi.history(historyTicketIdTrimmed || undefined),
  });

  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ['decision-stats'], queryFn: decisionsApi.stats });

  const outcomeDocsQuery = useQuery({
    queryKey: ['decision-outcomes-docs'],
    queryFn: decisionsApi.getOutcomeDocs,
  });

  const analyzeTicketMut = useMutation({
    mutationFn: () => decisionsApi.analyzeTicket(ticketIdTrimmed, {
      auto_assign: autoAssign,
      auto_update_priority: autoUpdatePriority,
    }),
    onSuccess: (next) => {
      setResult(next);
      toast({
        title: 'Ticket analysis complete',
        description: `Outcome ${humanize(next.outcome)} with ${(next.confidence * 100).toFixed(0)}% confidence.`,
      });
    },
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  const analyzeTextMut = useMutation({
    mutationFn: () => decisionsApi.analyzeText(freeText.trim(), freeSubject.trim() || undefined),
    onSuccess: (next) => {
      setResult(next);
      toast({ title: 'Preview analysis complete' });
    },
    onError: (err) => toast({ variant: 'destructive', description: normalizeError(err) }),
  });

  const outcomeChartData = useMemo(
    () => (stats?.decisions_by_outcome
      ? Object.entries(stats.decisions_by_outcome).map(([label, count]) => ({ label, count }))
      : []),
    [stats],
  );

  const categoryChartData = useMemo(
    () => (stats?.decisions_by_category
      ? Object.entries(stats.decisions_by_category).map(([label, count]) => ({ label, count }))
      : []),
    [stats],
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Decision Engine</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Analyze tickets, inspect rule outcomes, and keep triage behavior consistent.
            </p>
          </div>

          {user?.role === 'admin' ? (
            <Button asChild variant="outline" className="gap-2">
              <Link to="/decisions/config">
                <SlidersHorizontal className="h-4 w-4" />
                Configure rules
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total decisions</p>
            <p className="text-xl font-semibold mt-1">{stats?.total_decisions ?? '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Auto resolved</p>
            <p className="text-xl font-semibold mt-1">{stats?.auto_resolved ?? '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Escalated</p>
            <p className="text-xl font-semibold mt-1">{stats?.escalated ?? '-'}</p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Escalation rate</p>
            <p className="text-xl font-semibold mt-1">
              {stats?.escalation_rate !== undefined ? `${(stats.escalation_rate * 100).toFixed(0)}%` : '-'}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="analyze">Analyze</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          <TabsTrigger value="playbook">Playbook</TabsTrigger>
        </TabsList>

        <TabsContent value="analyze" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Analyze by ticket</h3>
              </div>
              <Input placeholder="Ticket ID" value={ticketId} onChange={(e) => setTicketId(e.target.value)} />

              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auto-assign" className="text-xs">Auto-assign suggested agent</Label>
                  <Switch id="auto-assign" checked={autoAssign} onCheckedChange={setAutoAssign} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="auto-update-priority" className="text-xs">Auto-update ticket priority</Label>
                  <Switch id="auto-update-priority" checked={autoUpdatePriority} onCheckedChange={setAutoUpdatePriority} />
                </div>
              </div>

              <Button
                size="sm"
                disabled={!ticketIdTrimmed || analyzeTicketMut.isPending}
                onClick={() => analyzeTicketMut.mutate()}
              >
                {analyzeTicketMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Brain className="h-4 w-4 mr-1" />
                )}
                Analyze ticket
              </Button>
            </div>

            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Analyze free text</h3>
              </div>
              <Input
                placeholder="Optional subject"
                value={freeSubject}
                onChange={(e) => setFreeSubject(e.target.value)}
              />
              <Textarea
                placeholder="Describe the issue..."
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={4}
              />
              <Button size="sm" disabled={!freeText.trim() || analyzeTextMut.isPending} onClick={() => analyzeTextMut.mutate()}>
                {analyzeTextMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Brain className="h-4 w-4 mr-1" />
                )}
                Analyze preview
              </Button>
            </div>
          </div>

          {result && (
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <h3 className="text-sm font-semibold">Decision result</h3>

              <div className="flex flex-wrap gap-2">
                <StatusBadge status={result.outcome} />
                <StatusBadge status={result.risk_level} />
                {result.suggested_priority ? <StatusBadge status={result.suggested_priority} /> : null}
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-info/10 text-info">
                  Confidence: {(result.confidence * 100).toFixed(0)}%
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded-md border bg-muted/20 px-2.5 py-2">
                  <p className="text-muted-foreground">Intent</p>
                  <p className="font-semibold mt-0.5">{humanize(result.intent_category)}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-2.5 py-2">
                  <p className="text-muted-foreground">Confidence level</p>
                  <p className="font-semibold mt-0.5">{humanize(result.confidence_level)}</p>
                </div>
                <div className="rounded-md border bg-muted/20 px-2.5 py-2">
                  <p className="text-muted-foreground">Risk score</p>
                  <p className="font-semibold mt-0.5">
                    {result.risk_score !== undefined ? `${(result.risk_score * 100).toFixed(0)}%` : '-'}
                  </p>
                </div>
                <div className="rounded-md border bg-muted/20 px-2.5 py-2">
                  <p className="text-muted-foreground">Suggested agent</p>
                  <p className="font-semibold mt-0.5">{result.suggested_agent_name ?? '-'}</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{result.reasoning}</p>

              {result.matched_rules.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Matched Rules</p>
                  <div className="flex flex-wrap gap-1">{result.matched_rules.map((r, i) => <span key={i} className="text-xs bg-muted rounded px-2 py-0.5">{r}</span>)}</div>
                </div>
              )}

              {result.response_suggestions && result.response_suggestions.length > 0 ? (
                <div>
                  <p className="text-xs font-medium mb-1">Suggested response options</p>
                  <ul className="space-y-1.5">
                    {result.response_suggestions.slice(0, 4).map((suggestion, idx) => (
                      <li key={`${suggestion}-${idx}`} className="text-sm rounded-md border bg-muted/10 px-2.5 py-2">
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result.escalation_summary ? (
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Escalation summary</AlertTitle>
                  <AlertDescription className="whitespace-pre-wrap">{result.escalation_summary}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  placeholder="Optional ticket ID filter"
                  value={historyTicketId}
                  onChange={(e) => setHistoryTicketId(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setHistoryTicketId('')}
                  disabled={!historyTicketIdTrimmed}
                >
                  Clear filter
                </Button>
              </div>
            </div>

            {histLoading ? (
              <div className="p-4"><TableSkeleton /></div>
            ) : histError ? (
              <ErrorState message={normalizeError(histError)} onRetry={() => histRefetch()} />
            ) : !history?.length ? (
              <EmptyState
                title="No decisions yet"
                description={historyTicketIdTrimmed ? 'No decisions matched this ticket filter.' : 'No decision logs found.'}
              />
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground">Ticket</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Outcome</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Intent</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Confidence</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Risk</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Rule</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Date</th>
                </tr></thead>
                <tbody className="divide-y">
                  {history.map(d => (
                    <tr key={d.id} className="hover:bg-muted/30">
                      <td className="p-3 text-xs text-muted-foreground">{d.ticket_id ?? '-'}</td>
                      <td className="p-3"><StatusBadge status={d.outcome} /></td>
                      <td className="p-3">{humanize(d.intent_category)}</td>
                      <td className="p-3">{(d.confidence * 100).toFixed(0)}%</td>
                      <td className="p-3"><StatusBadge status={d.risk_level} /></td>
                      <td className="p-3 text-xs text-muted-foreground">{d.matched_rules[0] ?? '-'}</td>
                      <td className="p-3 text-muted-foreground">{d.created_at ? new Date(d.created_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          {statsLoading ? <TableSkeleton /> : stats && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-semibold mb-4">Decisions by Category</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categoryChartData}>
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(220,65%,18%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-sm font-semibold mb-4">Decisions by Outcome</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={outcomeChartData}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label
                    >
                      {outcomeChartData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border bg-card p-4 md:col-span-2">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Confidence</p>
                    <p className="text-lg font-semibold">{(stats.avg_confidence * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Risk</p>
                    <p className="text-lg font-semibold">{stats.avg_risk !== undefined ? (stats.avg_risk * 100).toFixed(0) + "%" : "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Escalation Rate</p>
                    <p className="text-lg font-semibold">{stats.escalation_rate !== undefined ? (stats.escalation_rate * 100).toFixed(0) + "%" : "-"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="playbook" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <GitBranch className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">All possible outcomes</h3>
            </div>

            {outcomeDocsQuery.isLoading ? (
              <TableSkeleton rows={4} cols={1} />
            ) : outcomeDocsQuery.error ? (
              <ErrorState message={normalizeError(outcomeDocsQuery.error)} onRetry={() => outcomeDocsQuery.refetch()} />
            ) : !outcomeDocsQuery.data?.outcomes.length ? (
              <EmptyState title="No outcome documentation" description="Decision outcome docs are not available." />
            ) : (
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
                    {outcomeDocsQuery.data.outcomes.map((item) => (
                      <tr key={item.outcome}>
                        <td className="p-3 align-top"><StatusBadge status={item.outcome} /></td>
                        <td className="p-3 align-top text-muted-foreground">{item.description}</td>
                        <td className="p-3 align-top">{item.operator_guidance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Decision matrix (documentation view)</h3>

            {outcomeDocsQuery.isLoading ? (
              <TableSkeleton rows={6} cols={1} />
            ) : outcomeDocsQuery.error ? (
              <ErrorState message={normalizeError(outcomeDocsQuery.error)} onRetry={() => outcomeDocsQuery.refetch()} />
            ) : !outcomeDocsQuery.data?.matrix.length ? (
              <EmptyState title="No rule matrix" description="Decision matrix rows are not available." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Confidence</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Risk</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Outcome</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Matched rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {outcomeDocsQuery.data.matrix.map((row, index) => (
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
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
