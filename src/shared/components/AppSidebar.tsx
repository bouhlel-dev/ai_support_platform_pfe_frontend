import { useAuth } from '@/features/auth/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from '@/components/NavLink';
import { useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard, Ticket, MessageSquare, Mail, MessageCircle,
  Settings, LogOut, QrCode,
  AlertTriangle, Phone, PhoneCall, ShieldCheck, Users, ScrollText, UserRound, Bell, Brain, FileText, Eye, Mic, Layers, Camera, Database,
} from 'lucide-react';
import { usersApi } from '@/shared/api/users';
import { useTranslation } from 'react-i18next';
import { isRtlLanguage } from '@/shared/i18n/DirectionSync';

const operatorNavItems = [
  { titleKey: 'common.dashboard', url: '/', icon: LayoutDashboard },
  { titleKey: 'common.tickets', url: '/tickets', icon: Ticket },
  { titleKey: 'common.voiceCallTranscripts', url: '/voice-calls', icon: PhoneCall },
  { titleKey: 'common.notifications', url: '/notifications', icon: Bell },
];

const clientNavItems = [
  { titleKey: 'common.dashboard', url: '/', icon: LayoutDashboard },
  { titleKey: 'common.conversations', url: '/conversations', icon: MessageSquare },
  { titleKey: 'common.tickets', url: '/tickets', icon: Ticket },
  { titleKey: 'common.notifications', url: '/notifications', icon: Bell },
];

const adminItems = [
  { titleKey: 'common.admins', url: '/admins', icon: ShieldCheck },
  { titleKey: 'common.agents', url: '/agents', icon: UserRound },
  { titleKey: 'common.clients', url: '/clients', icon: Users },
  { titleKey: 'common.chatAccess', url: '/chat-access', icon: MessageSquare },
  { titleKey: 'common.supervision', url: '/supervision', icon: Eye },
  { titleKey: 'common.qrBridge', url: '/qr', icon: QrCode },
  { titleKey: 'common.voiceAgentsRuntime', url: '/voice-agents', icon: Phone },
  { titleKey: 'common.aiDraftSnippets', url: '/ai-draft-snippets', icon: FileText },
  { titleKey: 'common.decisionEngine', url: '/decisions', icon: Brain },
  { titleKey: 'common.visualAi', url: '/visual-ai', icon: Camera },
  { titleKey: 'common.rag', url: '/rag', icon: Database },
  { titleKey: 'common.logsAudit', url: '/logs', icon: ScrollText },
  { titleKey: 'common.settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isRtl = isRtlLanguage(i18n.resolvedLanguage || i18n.language);
  const userQ = useQuery({
    queryKey: ['sidebar-profile-me'],
    queryFn: usersApi.me,
    enabled: !!user,
  });
  const isActive = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const navItems = user?.role === 'client' ? clientNavItems : operatorNavItems;
  const displayUser = userQ.data ?? user;
  const translatedNavItems = navItems.map((item) => ({ ...item, title: t(item.titleKey) }));
  const translatedAdminItems = adminItems.map((item) => ({ ...item, title: t(item.titleKey) }));

  return (
    <Sidebar side={isRtl ? 'right' : 'left'} collapsible="icon" className={isRtl ? 'border-l-0' : 'border-r-0'}>
      <SidebarContent className="bg-sidebar">
        <div className="flex flex-col items-center justify-center gap-1 px-3 py-4 border-b border-sidebar-border">
          <img src="/logo-l2t.png" alt="L2T" className="h-8 w-auto object-contain" />
          {!collapsed && <span className="text-xs font-medium text-white/80">{t('shell.appName')}</span>}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            {!collapsed && t('shell.supportOps')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {translatedNavItems.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 me-2 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.role === 'admin' && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                {!collapsed && 'Voice'}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem key="/voice-agents">
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/voice-agents"
                        className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <Phone className="h-4 w-4 me-2 shrink-0" />
                        {!collapsed && <span>{t('common.voiceAgentsRuntime')}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem key="/test-agent">
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/test-agent"
                        className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <Mic className="h-4 w-4 me-2 shrink-0" />
                        {!collapsed && <span>{t('common.testVoiceAgent')}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                {!collapsed && t('shell.admin')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {translatedAdminItems.filter(item => item.url !== '/voice-agents').map(item => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                        >
                          <item.icon className="h-4 w-4 me-2 shrink-0" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-3">
        {!collapsed && displayUser && (
          <Link
            to="/profile"
            className="mb-2 flex items-center gap-3 px-2 rounded-md hover:bg-sidebar-accent/50 transition-colors"
          >
            <Avatar className="h-10 w-10 shrink-0 border border-sidebar-border">
              {displayUser.profile_picture_url && (
                <AvatarImage src={displayUser.profile_picture_url} alt="Profile" />
              )}
              <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground text-xs font-semibold">
                {(displayUser.full_name || displayUser.name || 'U')
                  .split(' ')
                  .slice(0, 2)
                  .map(n => n[0]?.toUpperCase())
                  .join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{displayUser.name}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{displayUser.email}</p>
            </div>
          </Link>
        )}
        <Button variant="ghost" size="sm" onClick={() => { void logout(); }} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4 me-2" />{!collapsed && t('common.signOut')}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
