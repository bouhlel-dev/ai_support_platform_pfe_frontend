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
import { Loader2, ShieldCheck } from 'lucide-react';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const publicSettingsQ = useQuery({
    queryKey: ['public-auth-settings'],
    queryFn: settingsApi.getPublicAuth,
  });

  const allowRegistration = publicSettingsQ.data?.allow_registration ?? true;
  const minPasswordLength = publicSettingsQ.data?.min_password_length ?? 8;
  const requirePasswordComplexity = publicSettingsQ.data?.password_complexity ?? false;
  const appName = publicSettingsQ.data?.app_name || 'AI Support Agent';
  const appDescription = publicSettingsQ.data?.description || 'Get started with your support dashboard';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allowRegistration) {
      toast({
        variant: 'destructive',
        title: 'Registration disabled',
        description: 'Account registration is currently disabled by admin settings.',
      });
      return;
    }

    if (password.length < minPasswordLength) {
      toast({
        variant: 'destructive',
        title: 'Password too short',
        description: `Password must be at least ${minPasswordLength} characters long.`,
      });
      return;
    }

    if (requirePasswordComplexity) {
      const complexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/;
      if (!complexityRegex.test(password)) {
        toast({
          variant: 'destructive',
          title: 'Weak password',
          description: 'Use upper/lower letters, a number, and a symbol.',
        });
        return;
      }
    }

    setLoading(true);
    try {
      await register(email, password, name);
      navigate('/');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Registration failed', description: normalizeError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-semibold">Create account for {appName}</CardTitle>
          <CardDescription>{appDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {!allowRegistration ? (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Registration is disabled by administrator settings.
            </div>
          ) : null}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} required placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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
                Minimum {minPasswordLength} characters{requirePasswordComplexity ? ', include upper/lowercase, number, and symbol.' : '.'}
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !allowRegistration}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create account
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
