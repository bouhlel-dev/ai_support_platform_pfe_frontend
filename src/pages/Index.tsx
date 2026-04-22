import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/" replace />;
};

export default Index;
