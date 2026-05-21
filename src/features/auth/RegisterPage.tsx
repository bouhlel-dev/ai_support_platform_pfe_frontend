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

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const isRtl = isRtlLanguage(i18n.resolvedLanguage || i18n.language);

  const publicSettingsQ = useQuery({
    queryKey: ['public-auth-settings'],
    queryFn: settingsApi.getPublicAuth,
  });

  const allowRegistration = publicSettingsQ.data?.allow_registration ?? true;
  const minPasswordLength = publicSettingsQ.data?.min_password_length ?? 8;
  const requirePasswordComplexity = publicSettingsQ.data?.password_complexity ?? false;
  const appName = publicSettingsQ.data?.app_name || 'AI Support Agent';
  const appDescription = publicSettingsQ.data?.description || t('auth.registerDescription');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allowRegistration) {
      toast({
        variant: 'destructive',
        title: t('auth.registrationDisabled'),
        description: t('auth.registrationDisabledDesc'),
      });
      return;
    }

    if (password.length < minPasswordLength) {
      toast({
        variant: 'destructive',
        title: t('auth.passwordTooShort'),
        description: t('auth.passwordTooShortDesc', { min: minPasswordLength }),
      });
      return;
    }

    if (requirePasswordComplexity) {
      const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;
      if (!complexityRegex.test(password)) {
        toast({
          variant: 'destructive',
          title: t('auth.weakPassword'),
          description: t('auth.weakPasswordDesc'),
        });
        return;
      }
    }

    setLoading(true);
    try {
      await register(email, password, name);
    } catch (err) {
      toast({ variant: 'destructive', title: t('auth.registrationFailed'), description: normalizeError(err) });
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
          <CardTitle className="text-2xl font-semibold">{t('auth.registerTitle', { appName })}</CardTitle>
          <CardDescription>{appDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {!allowRegistration ? (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {t('auth.registrationDisabledDesc')}
            </div>
          ) : null}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('common.fullName')}</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('common.email')}</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('common.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={minPasswordLength}
                placeholder="••••••••"
              />
              <p className="text-xs text-muted-foreground">
                {t('auth.minimumChars', { min: minPasswordLength })}{requirePasswordComplexity ? `, ${t('auth.includeComplexity')}` : '.'}
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !allowRegistration}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t('common.createAccount')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('auth.haveAccount')} <Link to="/login" className="text-primary font-medium hover:underline">{t('common.signIn')}</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
