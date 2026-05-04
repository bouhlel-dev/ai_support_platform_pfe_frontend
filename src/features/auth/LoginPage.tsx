import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { normalizeError } from '@/shared/api/client';
import { settingsApi } from '@/shared/api/settings';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isRtlLanguage } from '@/shared/i18n/DirectionSync';
import { CursorParticleField } from '@/shared/components/CursorParticleField';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const isRtl = isRtlLanguage(i18n.resolvedLanguage || i18n.language);

  const publicSettingsQ = useQuery({
    queryKey: ['public-auth-settings'],
    queryFn: settingsApi.getPublicAuth,
  });

  const appName = publicSettingsQ.data?.app_name || 'AI Support Agent';
  const appDescription = publicSettingsQ.data?.description || t('auth.loginDescription');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      toast({ variant: 'destructive', title: t('auth.loginFailed'), description: normalizeError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/30 p-4">
      <CursorParticleField />
      <Link
        to="/landing"
        aria-label={t('common.backToLanding')}
        className={`absolute top-4 z-10 rounded-md p-2 text-foreground transition-colors shadow-sm hover:bg-muted/60 dark:hover:bg-muted/50 ${isRtl ? 'right-4' : 'left-4'}`}
      >
        <ChevronLeft className={`h-5 w-5 ${isRtl ? 'rotate-180' : ''}`} />
      </Link>
      <Card className="relative z-10 w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <img src="/logo-l2t.png" alt="L2T" className="mx-auto mb-3 h-10 w-auto" />
          <CardTitle className="text-2xl font-semibold">{t('auth.loginWelcome', { appName })}</CardTitle>
          <CardDescription>{appDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('common.email')}</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('common.password')}</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('common.signIn')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('auth.noAccount')} <Link to="/register" className="text-primary font-medium hover:underline">{t('auth.register')}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
