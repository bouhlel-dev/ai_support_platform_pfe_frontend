import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from 'next-themes';
import { Bell, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { notificationsApi } from '@/shared/api/notifications';
import { usersApi } from '@/shared/api/users';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';

export function AppLayout() {
  const { theme, setTheme, systemTheme } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
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

  // Fetch fresh user data including profile picture
  const userQ = useQuery({
    queryKey: ['profile-me'],
    queryFn: usersApi.me,
    enabled: !!user,
  });

  const unreadCount = unreadCountQ.data ?? 0;
  // Use React Query user data if available, fall back to AuthContext user
  const displayUser = userQ.data ?? user;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b bg-card px-4 shrink-0">
            <SidebarTrigger />
            <div className="ms-auto flex items-center gap-2">
              <LanguageSwitcher />
              <Button variant="ghost" size="icon" asChild aria-label={t('shell.openNotifications')} className="relative">
                <Link to="/notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild aria-label={t('shell.openProfile')} className="h-8 w-8">
                <Link to="/profile" className="flex items-center justify-center">
                  <Avatar className="h-6 w-6 border border-border/50 overflow-hidden">
                    {displayUser?.profile_picture_url && <AvatarImage src={displayUser.profile_picture_url} alt="Profile" className="h-full w-full object-cover" />}
                    <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-semibold">
                      {(displayUser?.full_name || displayUser?.name || 'U')
                        .split(' ')
                        .slice(0, 2)
                        .map(n => n[0]?.toUpperCase())
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('shell.toggleTheme')}
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
