import { useEffect, useMemo, useState, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  KeyRound,
  Loader2,
  Save,
  UserRound,
  Phone,
  Globe,
  Languages,
  Mail,
  Link2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Lock,
  Camera,
  Info,
  Smartphone,
  QrCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { authApi } from '@/shared/api/auth';
import { usersApi } from '@/shared/api/users';
import { useTranslation } from 'react-i18next';

/* ── tiny shared primitives (inline, no extra files) ─────────── */

function FieldRow({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: React.ElementType;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <label className="text-xs font-semibold text-muted-foreground">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground/70">({hint})</span>}
      </div>
      {children}
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-muted/30">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-background border border-border">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { t } = useTranslation();
  const score = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  if (!password) return null;

  const levels = [
    { label: t('profilePage.weakLabel'), color: 'bg-destructive' },
    { label: t('profilePage.weak'),      color: 'bg-orange-500' },
    { label: t('profilePage.fair'),      color: 'bg-yellow-500' },
    { label: t('profilePage.good'),      color: 'bg-lime-500' },
    { label: t('profilePage.strong'),    color: 'bg-emerald-500' },
  ];
  const level = levels[Math.min(score - 1, 4)] ?? levels[0];

  return (
    <div className="space-y-1.5 mt-1">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < score ? level.color : 'bg-muted'}`}
          />
        ))}
      </div>
      <p className="text-[10px] font-medium text-muted-foreground">{level.label}</p>
    </div>
  );
}

function StatusBanner({ type, message }: { type: 'warning' | 'success' | 'info'; message: string }) {
  const variantMap: Record<string, { bg: string; icon: React.ElementType; textColor: string; iconColor: string }> = {
    warning: { bg: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900', icon: AlertTriangle, textColor: 'text-yellow-800 dark:text-yellow-300', iconColor: 'text-yellow-600 dark:text-yellow-400' },
    success: { bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900', icon: CheckCircle2, textColor: 'text-emerald-800 dark:text-emerald-300', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    info: { bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900', icon: Info, textColor: 'text-blue-800 dark:text-blue-300', iconColor: 'text-blue-600 dark:text-blue-400' },
  };
  const variant = variantMap[type];
  const Icon = variant.icon;
  return (
    <div className={cn('flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium', variant.bg, variant.textColor)}>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', variant.iconColor)} />
      {message}
    </div>
  );
}

/* ── main page ─────────────────────────────────────────────── */

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName,    setFullName]    = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [timezone,    setTimezone]    = useState('UTC');
  const [locale,      setLocale]      = useState('en');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [show2faSetup, setShow2faSetup] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [setupOtpCode, setSetupOtpCode] = useState('');
  const [show2faDisableDialog, setShow2faDisableDialog] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  const meQ = useQuery({ queryKey: ['profile-me'], queryFn: usersApi.me });

  useEffect(() => {
    const profile = meQ.data ?? user;
    if (!profile) return;
    setFullName(profile.full_name ?? profile.name ?? '');
    setPhoneNumber(profile.phone_number ?? '');
    setTimezone(profile.timezone ?? 'UTC');
    setLocale(profile.locale ?? 'en');
  }, [meQ.data, user]);

  const saveProfileMut = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        full_name:         fullName.trim()        || undefined,
        phone_number:      phoneNumber.trim()     || null,
        timezone:          timezone.trim()        || undefined,
        locale:            locale.trim()          || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([meQ.refetch(), refreshUser()]);
      toast({ title: t('profilePage.profileSaved'), description: t('profilePage.profileSavedDesc') });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t('profilePage.saveFailed'), description: normalizeError(error) }),
  });

  const changePasswordMut = useMutation({
    mutationFn: () =>
      usersApi.changePassword({ current_password: currentPassword, new_password: newPassword }),
    onSuccess: async () => {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      await Promise.all([meQ.refetch(), refreshUser()]);
      toast({ title: t('profilePage.passwordUpdated'), description: t('profilePage.passwordUpdatedDesc') });
      setShowPasswordModal(false);
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t('profilePage.passwordUpdateFailed'), description: normalizeError(error) }),
  });

  const uploadProfilePictureMut = useMutation({
    mutationFn: (file: File) => usersApi.uploadProfilePicture(file),
    onSuccess: async () => {
      await Promise.all([meQ.refetch(), refreshUser()]);
      toast({ title: t('profilePage.profilePictureUpdated'), description: t('profilePage.profilePictureUpdatedDesc') });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t('profilePage.uploadFailed'), description: normalizeError(error) }),
  });

  const setup2faMut = useMutation({
    mutationFn: authApi.setupTwoFactor,
    onSuccess: (data) => {
      setQrCodeUrl(data.qr_code_url);
      setShow2faSetup(true);
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t('profilePage.twoFactorSetupFailed'), description: normalizeError(error) }),
  });

  const verify2faSetupMut = useMutation({
    mutationFn: () => authApi.verifyTwoFactorSetup({ otp_code: setupOtpCode }),
    onSuccess: () => {
      setShow2faSetup(false);
      setQrCodeUrl('');
      setSetupOtpCode('');
      void meQ.refetch();
      void refreshUser();
      toast({ title: t('profilePage.twoFactorEnabled') });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t('profilePage.twoFactorSetupFailed'), description: normalizeError(error) }),
  });

  const disable2faMut = useMutation({
    mutationFn: () => authApi.disableTwoFactor(disablePassword),
    onSuccess: () => {
      setShow2faDisableDialog(false);
      setDisablePassword('');
      void meQ.refetch();
      void refreshUser();
      toast({ title: t('profilePage.twoFactorDisabled') });
    },
    onError: (error) =>
      toast({ variant: 'destructive', title: t('profilePage.twoFactorDisableFailed'), description: normalizeError(error) }),
  });

  const canSaveProfile = fullName.trim().length > 0 && !saveProfileMut.isPending;

  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handlePasswordChange = () => {
    if (changePasswordMut.isPending) return;
    if (!currentPassword || !newPassword) {
      toast({ variant: 'destructive', title: t('profilePage.missingFields'), description: t('profilePage.missingFieldsDesc') });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: t('profilePage.passwordsDoNotMatch'), description: t('profilePage.passwordsDoNotMatchDesc') });
      return;
    }
    if (newPassword.length < 8) {
      toast({ variant: 'destructive', title: t('profilePage.passwordTooShort'), description: t('profilePage.passwordTooShortDesc') });
      return;
    }
    changePasswordMut.mutate();
  };

  const handleProfilePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast({ variant: 'destructive', title: t('profilePage.invalidFile'), description: t('profilePage.invalidFileDesc') });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: t('profilePage.fileTooLarge'), description: t('profilePage.fileTooLargeDesc') });
      return;
    }

    uploadProfilePictureMut.mutate(file);
  };

  const initials = (fullName || user?.name || 'U')
    .split(' ')
    .slice(0, 2)
    .map(n => n[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-background">
      {/* Cover banner */}
      <div className="h-32 sm:h-48 bg-slate-900"></div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-12">
        {/* Profile header with avatar */}
        <div className="relative -mt-24 mb-8 flex flex-col sm:flex-row gap-6 sm:gap-8">
          {/* Avatar */}
          <div className="flex justify-center sm:justify-start">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProfilePictureMut.isPending}
              className="group relative flex h-24 w-24 sm:h-32 sm:w-32 items-center justify-center rounded-full border-4 border-background shadow-lg bg-gradient-to-br from-primary to-blue-500 overflow-hidden hover:shadow-xl transition-all hover:scale-105"
            >
              {meQ.data?.profile_picture_url ? (
                <img
                  src={meQ.data.profile_picture_url}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-3xl sm:text-4xl font-bold text-white">{initials}</span>
              )}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                {uploadProfilePictureMut.isPending ? (
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </button>
          </div>

          {/* Profile info and actions */}
          <div className="flex flex-1 flex-col justify-center gap-4">
            <div className="text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{fullName || t('profilePage.title')}</h1>
                {(meQ.data?.role || user?.role) && (
                  <Badge variant="secondary" className="capitalize w-fit">
                    {meQ.data?.role || user?.role}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-white/80">{t('profilePage.subtitle')}</p>
            </div>

            {/* Status badges */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-2">
              {meQ.data?.must_change_password && (
                <StatusBanner type="warning" message={t('profilePage.passwordUpdateRequired')} />
              )}
            </div>
          </div>
        </div>

        {/* API error */}
        {meQ.error && (
          <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('profilePage.failedToLoad')}: {normalizeError(meQ.error)}
          </div>
        )}

        {/* Main content */}
        <div className="space-y-6">
          {/* Account Information */}
          <SectionCard
            icon={UserRound}
            title={t('profilePage.accountInfo')}
            subtitle={t('profilePage.accountInfoDesc')}
          >
            <FieldRow icon={UserRound} label={t('profilePage.fullName')}>
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('profilePage.fullNamePlaceholder')}
              />
            </FieldRow>

            <FieldRow icon={Phone} label={t('profilePage.phoneNumber')}>
              <Input
                id="profile-phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder={t('profilePage.phonePlaceholder')}
              />
            </FieldRow>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldRow icon={Globe} label={t('profilePage.timezone')}>
                <Input
                  id="profile-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder={t('profilePage.timezonePlaceholder')}
                />
              </FieldRow>
              <FieldRow icon={Languages} label={t('profilePage.locale')}>
                <Input
                  id="profile-locale"
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  placeholder={t('profilePage.localePlaceholder')}
                />
              </FieldRow>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2 border-t">
              <Button
                onClick={() => saveProfileMut.mutate()}
                disabled={!canSaveProfile}
                className="flex-1"
              >
                {saveProfileMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {t('profilePage.saving')}…</>
                ) : (
                  <><Save className="h-4 w-4" /> {t('profilePage.saveProfile')}</>
                )}
              </Button>
              <Button
                onClick={() => setShowPasswordModal(true)}
                variant="outline"
                className="flex-1"
              >
                <Lock className="h-4 w-4" /> {t('profilePage.changePassword')}
              </Button>
            </div>
          </SectionCard>
        </div>

        {/* Security / 2FA */}
        <div className="mt-6">
          <SectionCard
            icon={ShieldCheck}
            title={t('profilePage.security')}
            subtitle={t('profilePage.twoFactorAuth')}
          >
            {(meQ.data?.two_factor_enabled ?? user?.two_factor_enabled) ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-sm font-medium">{t('profilePage.twoFactorEnabledDescription')}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShow2faDisableDialog(true)}
                  disabled={disable2faMut.isPending}
                  className="w-full sm:w-auto"
                >
                  {disable2faMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('profilePage.disable2fa')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {!show2faSetup ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground">{t('profilePage.twoFactorAuth')}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setup2faMut.mutate()}
                      disabled={setup2faMut.isPending || !(meQ.data?.two_factor_auth ?? user?.two_factor_auth)}
                      title={!(meQ.data?.two_factor_auth ?? user?.two_factor_auth) ? t('profilePage.twoFactorDisabledByAdmin') : ''}
                      className="w-full sm:w-auto"
                    >
                      {setup2faMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t('profilePage.enable2fa')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">{t('profilePage.scanQrCode')}</p>
                    {qrCodeUrl && (
                      <div className="flex justify-center">
                        <img src={qrCodeUrl} alt="QR Code" className="h-40 w-40 sm:h-48 sm:w-48 border rounded-lg" />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="setup-otp">{t('profilePage.enterSetupOtp')}</Label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          id="setup-otp"
                          value={setupOtpCode}
                          onChange={(e) => setSetupOtpCode(e.target.value)}
                          placeholder="000000"
                          maxLength={6}
                          className="text-center text-lg tracking-widest"
                        />
                        <Button
                          onClick={() => verify2faSetupMut.mutate()}
                          disabled={verify2faSetupMut.isPending || setupOtpCode.length !== 6}
                          className="w-full sm:w-auto"
                        >
                          {verify2faSetupMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {t('auth.verify')}
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setShow2faSetup(false); setQrCodeUrl(''); setSetupOtpCode(''); }}
                    >
                      {t('profilePage.cancel')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Change Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              {t('profilePage.passwordModalTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('profilePage.passwordModalDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FieldRow icon={KeyRound} label={t('profilePage.currentPassword')}>
              <PasswordInput
                id="modal-current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={t('profilePage.currentPasswordPlaceholder')}
              />
            </FieldRow>

            <FieldRow icon={KeyRound} label={t('profilePage.newPassword')}>
              <PasswordInput
                id="modal-new-password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder={t('profilePage.newPasswordPlaceholder')}
              />
              <PasswordStrengthBar password={newPassword} />
            </FieldRow>

            <FieldRow icon={KeyRound} label={t('profilePage.confirmPassword')}>
              <PasswordInput
                id="modal-confirm-password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t('profilePage.confirmPasswordPlaceholder')}
              />
              {passwordsMatch && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> {t('profilePage.passwordsMatch')}
                </p>
              )}
              {passwordMismatch && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" /> {t('profilePage.passwordsMismatch')}
                </p>
              )}
            </FieldRow>

            {/* Password requirements */}
            <div className="rounded-xl border bg-muted/50 px-3.5 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t('profilePage.requirements')}</p>
              {[
                [t('profilePage.reqMinChars'),              newPassword.length >= 8],
                [t('profilePage.reqUppercase'),               /[A-Z]/.test(newPassword)],
                [t('profilePage.reqNumber'),                         /[0-9]/.test(newPassword)],
                [t('profilePage.reqSpecial'),              /[^A-Za-z0-9]/.test(newPassword)],
              ].map(([rule, met]) => (
                <div key={rule as string} className="flex items-center gap-2">
                  <div className={`h-1.5 w-1.5 rounded-full ${met ? 'bg-emerald-500' : 'bg-muted'}`} />
                  <span className={`text-xs transition-colors ${met ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-muted-foreground'}`}>
                    {rule as string}
                  </span>
                </div>
              ))}
            </div>

            {/* Modal actions */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowPasswordModal(false)}
                className="flex-1"
              >
                {t('profilePage.cancel')}
              </Button>
              <Button
                onClick={handlePasswordChange}
                disabled={changePasswordMut.isPending || passwordMismatch}
                className="flex-1"
              >
                {changePasswordMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {t('profilePage.updating')}…</>
                ) : (
                  <><KeyRound className="h-4 w-4" /> {t('profilePage.update')}</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable 2FA Dialog */}
      <Dialog open={show2faDisableDialog} onOpenChange={setShow2faDisableDialog}>
        <DialogContent className="max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              {t('profilePage.disable2fa')}
            </DialogTitle>
            <DialogDescription>
              {t('profilePage.passwordToDisable2fa')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FieldRow icon={Lock} label={t('common.password')}>
              <Input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="••••••••"
              />
            </FieldRow>
          </div>
          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => { setShow2faDisableDialog(false); setDisablePassword(''); }}
              className="flex-1"
            >
              {t('profilePage.cancel')}
            </Button>
            <Button
              onClick={() => disable2faMut.mutate()}
              disabled={disable2faMut.isPending || !disablePassword}
              className="flex-1"
            >
              {disable2faMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('profilePage.disable2fa')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}