import { useAuth } from '@/features/auth/AuthContext';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import {
  LayoutDashboard, Ticket, MessageSquare, Mail, MessageCircle,
  Brain, Database, Eye, Settings, LogOut, QrCode,
  AlertTriangle, Phone, PhoneCall, Mic, ShieldCheck, Users, ScrollText, UserRound, Bell, SlidersHorizontal,
} from 'lucide-react';

const operatorNavItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Tickets', url: '/tickets', icon: Ticket },
  { title: 'Conversations', url: '/conversations', icon: MessageSquare },
  { title: 'Email', url: '/email', icon: Mail },
  { title: 'WhatsApp', url: '/whatsapp', icon: MessageCircle },
  { title: 'Decisions', url: '/decisions', icon: Brain },
  { title: 'RAG', url: '/rag', icon: Database },
  { title: 'Visual AI', url: '/visual-ai', icon: Eye },
  { title: 'Notifications', url: '/notifications', icon: Bell },
  { title: 'Profile', url: '/profile', icon: UserRound },
];

const clientNavItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Support Chat', url: '/conversations', icon: MessageSquare },
  { title: 'Tickets', url: '/tickets', icon: Ticket },
  { title: 'Notifications', url: '/notifications', icon: Bell },
  { title: 'Profile', url: '/profile', icon: UserRound },
];

const adminItems = [
  { title: 'Admins', url: '/admins', icon: ShieldCheck },
  { title: 'Agents', url: '/agents', icon: UserRound },
  { title: 'Clients', url: '/clients', icon: Users },
  { title: 'Chat Access', url: '/chat-access', icon: MessageSquare },
  { title: 'Supervision', url: '/supervision', icon: Eye },
  { title: 'QR Bridge', url: '/qr', icon: QrCode },
  { title: 'Voice Agents Runtime', url: '/voice-agents', icon: Phone },
  { title: 'Decision Config', url: '/decisions/config', icon: SlidersHorizontal },
  { title: 'Logs & Audit', url: '/logs', icon: ScrollText },
  { title: 'Settings', url: '/settings', icon: Settings },
];

const agentItems = [
  { title: 'Escalations', url: '/escalations', icon: AlertTriangle },
  { title: 'Test Voice Agent', url: '/test-agent', icon: Mic },
  { title: 'Voice Calls', url: '/voice-calls', icon: PhoneCall },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isActive = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const navItems = user?.role === 'client' ? clientNavItems : operatorNavItems;

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
            {!collapsed && 'Support Ops'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === '/'}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 mr-2 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(user?.role === 'agent' || user?.role === 'admin') && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              {!collapsed && 'Agent Workspace'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {agentItems.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4 mr-2 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {user?.role === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
              {!collapsed && 'Admin'}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map(item => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4 mr-2 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="bg-sidebar border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <div className="mb-2 px-2">
            <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate">{user.email}</p>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => { void logout(); }} className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4 mr-2" />{!collapsed && 'Sign out'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
