import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
  loading?: boolean;
}

const variantClasses: Record<string, string> = {
  default: 'bg-primary/5 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

export function KpiCard({ title, value, icon: Icon, trend, variant = 'default', loading }: KpiCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', variantClasses[variant])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {trend && <p className="mt-1 text-xs text-muted-foreground">{trend}</p>}
    </div>
  );
}
