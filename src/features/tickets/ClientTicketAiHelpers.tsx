import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Lightbulb, Loader2, Search, Sparkles, Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { ticketsApi } from '@/shared/api/tickets';

type ClientTicketAiHelpersProps = {
  title: string;
  description: string;
  onApplyReformulation: (value: string) => void;
};

export function ClientTicketAiHelpers({
  title,
  description,
  onApplyReformulation,
}: ClientTicketAiHelpersProps) {
  const { toast } = useToast();

  const normalizedTitle = title.trim();
  const normalizedDescription = description.trim();

  const similarityQuery = useMemo(
    () => `${normalizedTitle} ${normalizedDescription}`.trim(),
    [normalizedDescription, normalizedTitle],
  );

  const classifyMut = useMutation({
    mutationFn: () => ticketsApi.classify({ title: normalizedTitle, description: normalizedDescription }),
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not classify ticket',
        description: normalizeError(error),
      });
    },
  });

  const reformulateMut = useMutation({
    mutationFn: () => ticketsApi.reformulate({ title: normalizedTitle, description: normalizedDescription }),
    onSuccess: (result) => {
      if (!result.available || !result.reformulated.trim()) {
        toast({
          title: 'No reformulation generated',
          description: 'Add more details to your description and try again.',
        });
        return;
      }

      onApplyReformulation(result.reformulated);
      toast({
        title: 'Description reformulated',
        description: 'AI suggestions have been applied to your ticket description.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not reformulate description',
        description: normalizeError(error),
      });
    },
  });

  const similarMut = useMutation({
    mutationFn: () => ticketsApi.similar(similarityQuery),
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not load similar tickets',
        description: normalizeError(error),
      });
    },
  });

  const classifyResult = classifyMut.data;
  const similarTickets = similarMut.data?.tickets ?? [];

  return (
    <div className="space-y-3 rounded-xl border bg-muted/25 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">AI Ticket Helper</h3>
      </div>

      <p className="text-xs text-muted-foreground">
        Improve your draft with quick classification, reformulation, and similar solved ticket lookup.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={normalizedTitle.length < 5 || classifyMut.isPending}
          onClick={() => classifyMut.mutate()}
        >
          {classifyMut.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Lightbulb className="mr-1 h-3.5 w-3.5" />
          )}
          Classify
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!normalizedDescription || reformulateMut.isPending}
          onClick={() => reformulateMut.mutate()}
        >
          {reformulateMut.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1 h-3.5 w-3.5" />
          )}
          Reformulate
        </Button>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={similarityQuery.length < 4 || similarMut.isPending}
          onClick={() => similarMut.mutate()}
        >
          {similarMut.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="mr-1 h-3.5 w-3.5" />
          )}
          Similar
        </Button>
      </div>

      {classifyResult?.available ? (
        <div className="space-y-2 rounded-lg border bg-background p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{classifyResult.category_label || 'Category'}</Badge>
            <Badge variant="outline">Priority {classifyResult.priority ?? '-'}</Badge>
            <Badge variant="outline">{classifyResult.confidence ?? 0}% confidence</Badge>
          </div>

          {classifyResult.solutions.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {classifyResult.solutions.map((suggestion, index) => (
                <li key={`${suggestion}-${index}`}>- {suggestion}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {similarMut.data ? (
        similarTickets.length > 0 ? (
          <div className="space-y-2 rounded-lg border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Similar solved tickets</p>
            <div className="space-y-2">
              {similarTickets.map((ticket, index) => (
                <div key={`${ticket.id ?? ticket.title}-${index}`} className="rounded-md border p-2">
                  <p className="text-xs font-medium">{ticket.title}</p>
                  {ticket.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ticket.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No similar solved tickets found yet.</p>
        )
      ) : null}
    </div>
  );
}
