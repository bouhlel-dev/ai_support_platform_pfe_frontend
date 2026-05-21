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
      <div className="rounded-xl border bg-card p-4 sm:p-5 max-sm:aspect-square max-sm:flex max-sm:flex-col max-sm:items-center max-sm:justify-center max-sm:gap-1.5">
        <div className="sm:mb-3 sm:flex sm:items-center sm:justify-between">
          <Skeleton className="h-4 w-20 sm:w-24" />
          <Skeleton className="h-8 w-8 rounded-lg sm:block hidden" />
        </div>
        <Skeleton className="h-6 w-12 sm:h-8 sm:w-16" />
        <Skeleton className="h-3 w-14 sm:w-20" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 transition-shadow hover:shadow-md max-sm:aspect-square max-sm:flex max-sm:flex-col max-sm:items-center max-sm:justify-center max-sm:text-center max-sm:gap-0.5">
      <div className="sm:flex sm:items-center sm:justify-between sm:mb-3">
        <span className="text-sm font-medium text-muted-foreground block max-sm:text-[10px]">{title}</span>
        <div className={cn('flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg max-sm:mx-auto', variantClasses[variant])}>
          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
      <div className="text-lg sm:text-2xl font-bold tracking-tight">{value}</div>
      {trend && <p className="text-[10px] sm:text-xs text-muted-foreground">{trend}</p>}
    </div>
  );
}
