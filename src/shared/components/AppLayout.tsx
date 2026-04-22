import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { Bell, Moon, Sun, UserRound } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { notificationsApi } from '@/shared/api/notifications';

export function AppLayout() {
  const { theme, setTheme, systemTheme } = useTheme();
  const { user } = useAuth();
  const resolvedTheme = theme === 'system' ? systemTheme : theme;
  const isDark = resolvedTheme === 'dark';

  const unreadCountQ = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: notificationsApi.unreadCount,
    enabled: !!user,
    refetchInterval: () => {
      if (!user) {
        return false;
      }
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return false;
      }
      return 60_000;
    },
  });

  const unreadCount = unreadCountQ.data ?? 0;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild aria-label="Open notifications" className="relative">
                <Link to="/notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild aria-label="Open profile">
                <Link to="/profile">
                  <UserRound className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Toggle dark mode"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
