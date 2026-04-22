import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/shared/api/client';
import { AuthProvider } from '@/features/auth/AuthContext';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { AppLayout } from '@/shared/components/AppLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { Loader2 } from 'lucide-react';

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const TicketsPage = lazy(() => import('@/features/tickets/TicketsPage').then(m => ({ default: m.TicketsPage })));
const TicketDetailPage = lazy(() => import('@/features/tickets/TicketDetailPage').then(m => ({ default: m.TicketDetailPage })));
const ConversationsPage = lazy(() => import('@/features/conversations/ConversationsPage').then(m => ({ default: m.ConversationsPage })));
const EmailPage = lazy(() => import('@/features/email/EmailPage').then(m => ({ default: m.EmailPage })));
const WhatsAppPage = lazy(() => import('@/features/whatsapp/WhatsAppPage').then(m => ({ default: m.WhatsAppPage })));
const WhatsAppSupervisionPage = lazy(() => import('@/features/whatsapp/WhatsAppSupervisionPage').then(m => ({ default: m.WhatsAppSupervisionPage })));
const DecisionsPage = lazy(() => import('@/features/decisions/DecisionsPage').then(m => ({ default: m.DecisionsPage })));
const DecisionConfigPage = lazy(() => import('@/features/decisions/DecisionConfigPage').then(m => ({ default: m.DecisionConfigPage })));
const RagPage = lazy(() => import('@/features/rag/RagPage').then(m => ({ default: m.RagPage })));
const VisualAiPage = lazy(() => import('@/features/visual-ai/VisualAiPage').then(m => ({ default: m.VisualAiPage })));
const QrBridgePage = lazy(() => import('@/features/admin/QrBridgePage').then(m => ({ default: m.QrBridgePage })));
const SettingsPage = lazy(() => import('@/features/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));
const VoiceAgentsPage = lazy(() => import('@/features/admin/VoiceAgentsPage').then(m => ({ default: m.VoiceAgentsPage })));
const AdminsPage = lazy(() => import('@/features/admin/UsersManagementPage').then(m => ({ default: m.AdminsPage })));
const AgentsPage = lazy(() => import('@/features/admin/UsersManagementPage').then(m => ({ default: m.AgentsPage })));
const ClientsPage = lazy(() => import('@/features/admin/UsersManagementPage').then(m => ({ default: m.ClientsPage })));
const ChatAccessPage = lazy(() => import('@/features/admin/ChatAccessPage').then(m => ({ default: m.ChatAccessPage })));
const AuditLogsPage = lazy(() => import('@/features/admin/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })));
const EscalationsPage = lazy(() => import('@/features/escalations/EscalationsPage').then(m => ({ default: m.EscalationsPage })));
const VoiceCallsPage = lazy(() => import('@/features/voice-calls/VoiceCallsPage').then(m => ({ default: m.VoiceCallsPage })));
const VoiceTestPage = lazy(() => import('@/features/voice-calls/VoiceTestPage').then(m => ({ default: m.VoiceTestPage })));
const ClientCallPage = lazy(() => import('@/features/voice-calls/ClientCallPage').then(m => ({ default: m.ClientCallPage })));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then(m => ({ default: m.ProfilePage })));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage').then(m => ({ default: m.NotificationsPage })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
        return failureCount < 1;
      },
      retryDelay: (attemptIndex) => Math.min(300 * 2 ** attemptIndex, 2_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 60_000,
    },
  },
});

const Loading = () => <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/support-call" element={<ProtectedRoute><ClientCallPage /></ProtectedRoute>} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/tickets" element={<TicketsPage />} />
                <Route path="/tickets/:id" element={<TicketDetailPage />} />
                <Route path="/conversations" element={<ConversationsPage />} />
                <Route path="/email" element={<EmailPage />} />
                <Route path="/whatsapp" element={<WhatsAppPage />} />
                <Route path="/supervision" element={<ProtectedRoute roles={['admin']}><WhatsAppSupervisionPage /></ProtectedRoute>} />
                <Route path="/whatsapp-supervision" element={<Navigate to="/supervision" replace />} />
                <Route path="/decisions" element={<DecisionsPage />} />
                <Route path="/decisions/config" element={<ProtectedRoute roles={['admin']}><DecisionConfigPage /></ProtectedRoute>} />
                <Route path="/rag" element={<RagPage />} />
                <Route path="/visual-ai" element={<VisualAiPage />} />
                <Route path="/escalations" element={<ProtectedRoute roles={['agent', 'admin']}><EscalationsPage /></ProtectedRoute>} />
                <Route path="/test-agent" element={<ProtectedRoute roles={['agent', 'admin']}><VoiceTestPage /></ProtectedRoute>} />
                <Route path="/voice-calls" element={<ProtectedRoute roles={['agent', 'admin']}><VoiceCallsPage /></ProtectedRoute>} />
                <Route path="/qr" element={<ProtectedRoute roles={['admin']}><QrBridgePage /></ProtectedRoute>} />
                <Route path="/voice-agents" element={<ProtectedRoute roles={['admin']}><VoiceAgentsPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute roles={['admin']}><SettingsPage /></ProtectedRoute>} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/admins" element={<ProtectedRoute roles={['admin']}><AdminsPage /></ProtectedRoute>} />
                <Route path="/agents" element={<ProtectedRoute roles={['admin']}><AgentsPage /></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute roles={['admin']}><ClientsPage /></ProtectedRoute>} />
                <Route path="/chat-access" element={<ProtectedRoute roles={['admin']}><ChatAccessPage /></ProtectedRoute>} />
                <Route path="/logs" element={<ProtectedRoute roles={['admin']}><AuditLogsPage /></ProtectedRoute>} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
