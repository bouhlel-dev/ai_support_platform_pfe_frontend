import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@/shared/types';
import { authApi } from '@/shared/api/auth';
import { getToken, clearToken, setToken, onAuthChanged, onSessionExpired } from '@/shared/api/client';
import { getClientConfigBoolean } from '@/shared/config/clientConfig';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Demo user for testing UI without a backend
const DEMO_USER: User = {
  id: 'demo-001',
  email: 'admin@demo.com',
  name: 'Demo Admin',
  role: 'admin',
  can_reply_conversations: true,
  can_reply_whatsapp: true,
};
const DEMO_CREDENTIALS = { email: 'admin@demo.com', password: 'demo1234' };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const enableDemoAuth = getClientConfigBoolean('VITE_ENABLE_DEMO_AUTH', false);
  const { toast } = useToast();
  const sessionExpiredRef = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (enableDemoAuth && token === 'demo-token') {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }
    if (token) {
      authApi.me().then(setUser).catch(() => clearToken()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [enableDemoAuth]);

  useEffect(() => {
    return onAuthChanged(() => {
      const token = getToken();
      if (!token) {
        setUser(null);
      }
    });
  }, []);

  // ── Auto-logout when session expires (refresh token also invalid) ──
  useEffect(() => {
    return onSessionExpired(() => {
      if (sessionExpiredRef.current) return; // Prevent duplicate toasts
      sessionExpiredRef.current = true;

      clearToken();
      setUser(null);

      toast({
        variant: 'destructive',
        title: 'Session expired',
        description: 'Your session has ended. Please log in again.',
      });

      // Reset flag after a short delay so future sessions can still trigger
      setTimeout(() => {
        sessionExpiredRef.current = false;
      }, 2000);
    });
  }, [toast]);

  const refreshUser = useCallback(async () => {
    if (enableDemoAuth && getToken() === 'demo-token') {
      setUser(DEMO_USER);
      return;
    }
    const me = await authApi.me();
    setUser(me);
  }, [enableDemoAuth]);

  const login = useCallback(async (email: string, password: string) => {
    // Demo mode bypass
    if (enableDemoAuth && email === DEMO_CREDENTIALS.email && password === DEMO_CREDENTIALS.password) {
      setToken('demo-token');
      setUser(DEMO_USER);
      return;
    }
    await authApi.login({ email, password });
    await refreshUser();
  }, [enableDemoAuth, refreshUser]);

  const register = useCallback(async (email: string, password: string, name: string) => {
    await authApi.register({ email, password, full_name: name });
    await authApi.login({ email, password });
    await refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
