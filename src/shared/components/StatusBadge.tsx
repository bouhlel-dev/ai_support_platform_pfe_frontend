import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  open: 'status-active',
  in_progress: 'status-pending',
  escalated: 'status-escalated',
  resolved: 'status-resolved',
  closed: 'status-resolved',
  pending: 'status-pending',
  connected: 'status-resolved',
  disconnected: 'status-escalated',
  sent: 'status-resolved',
  delivered: 'status-resolved',
  read: 'status-resolved',
  failed: 'status-escalated',
  low: 'status-resolved',
  medium: 'status-pending',
  high: 'status-escalated',
  critical: 'status-escalated',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
      statusStyles[status] || 'bg-muted text-muted-foreground',
      className
    )}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
