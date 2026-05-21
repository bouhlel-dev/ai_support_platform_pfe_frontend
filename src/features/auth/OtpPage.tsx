import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { normalizeError, setTokens } from '@/shared/api/client';
import { authApi } from '@/shared/api/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function OtpPage() {
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { t } = useTranslation();

  const tempToken = searchParams.get('token');

  if (!tempToken) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const result = await authApi.verifyOtp({ temp_token: tempToken, otp_code: otp });
      setTokens(result.access_token, result.refresh_token);
      window.location.href = '/';
    } catch (err) {
      const msg = normalizeError(err);
      setError(t('auth.invalidOtp'));
      toast({ variant: 'destructive', title: t('auth.verifyOtpTitle'), description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-semibold">{t('auth.verifyOtpTitle')}</CardTitle>
          <CardDescription>{t('auth.verifyOtpSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && (
                <p className="text-center text-sm text-destructive">{error}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading || otp.length !== 6}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {loading ? t('auth.verifying') : t('auth.verify')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <button type="button" className="text-primary font-medium hover:underline">
                {t('auth.useRecoveryCode')}
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
