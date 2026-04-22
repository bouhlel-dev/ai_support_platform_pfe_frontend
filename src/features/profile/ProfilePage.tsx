import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { KeyRound, Loader2, Save, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/features/auth/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { normalizeError } from '@/shared/api/client';
import { usersApi } from '@/shared/api/users';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [teamsEmail, setTeamsEmail] = useState('');
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const meQ = useQuery({
    queryKey: ['profile-me'],
    queryFn: usersApi.me,
  });

  useEffect(() => {
    const profile = meQ.data ?? user;
    if (!profile) {
      return;
    }

    setFullName(profile.full_name ?? profile.name ?? '');
    setPhoneNumber(profile.phone_number ?? '');
    setTeamsEmail(profile.teams_email ?? '');
    setTeamsWebhookUrl(profile.teams_webhook_url ?? '');
    setTimezone(profile.timezone ?? 'UTC');
    setLocale(profile.locale ?? 'en');
  }, [meQ.data, user]);

  const isProfileIncomplete = Boolean(
    meQ.data?.profile_completion_required && !meQ.data?.profile_completed,
  );

  const saveProfileMut = useMutation({
    mutationFn: () =>
      usersApi.updateMe({
        full_name: fullName.trim() || undefined,
        phone_number: phoneNumber.trim() || null,
        teams_email: teamsEmail.trim() || null,
        teams_webhook_url: teamsWebhookUrl.trim() || null,
        timezone: timezone.trim() || undefined,
        locale: locale.trim() || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([meQ.refetch(), refreshUser()]);
      toast({
        title: 'Profile updated',
        description: 'Your account details were saved successfully.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Profile update failed',
        description: normalizeError(error),
      });
    },
  });

  const changePasswordMut = useMutation({
    mutationFn: () =>
      usersApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: async () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await Promise.all([meQ.refetch(), refreshUser()]);
      toast({
        title: 'Password updated',
        description: 'Your password has been changed.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Password update failed',
        description: normalizeError(error),
      });
    },
  });

  const canSaveProfile = useMemo(() => {
    return fullName.trim().length > 0 && !saveProfileMut.isPending;
  }, [fullName, saveProfileMut.isPending]);

  const handlePasswordChange = () => {
    if (changePasswordMut.isPending) {
      return;
    }

    if (!currentPassword || !newPassword) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Current password and new password are required.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Passwords do not match',
        description: 'Confirm password must match the new password.',
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        variant: 'destructive',
        title: 'Password too short',
        description: 'Use at least 8 characters for the new password.',
      });
      return;
    }

    changePasswordMut.mutate();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile & Security</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep your account information complete and your credentials secure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {meQ.data?.must_change_password ? <Badge variant="destructive">Password update required</Badge> : null}
          {isProfileIncomplete ? <Badge variant="destructive">Profile completion required</Badge> : null}
          {meQ.data?.profile_completed ? <Badge variant="secondary">Profile complete</Badge> : null}
        </div>
      </div>

      {meQ.error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Failed to load profile: {normalizeError(meQ.error)}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Account Information</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-full-name">Full name</Label>
            <Input
              id="profile-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-phone">Phone number</Label>
            <Input
              id="profile-phone"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="+216..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-timezone">Timezone</Label>
            <Input
              id="profile-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              placeholder="UTC"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-locale">Locale</Label>
            <Input
              id="profile-locale"
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              placeholder="en"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-teams-email">Teams email (optional)</Label>
            <Input
              id="profile-teams-email"
              value={teamsEmail}
              onChange={(event) => setTeamsEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-teams-webhook">Teams webhook URL (optional)</Label>
            <Textarea
              id="profile-teams-webhook"
              value={teamsWebhookUrl}
              onChange={(event) => setTeamsWebhookUrl(event.target.value)}
              placeholder="https://..."
              rows={3}
            />
          </div>

          <Button onClick={() => saveProfileMut.mutate()} disabled={!canSaveProfile}>
            {saveProfileMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />Save profile
              </>
            )}
          </Button>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Change Password</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-current-password">Current password</Label>
            <Input
              id="profile-current-password"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="Current password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-new-password">New password</Label>
            <Input
              id="profile-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-confirm-password">Confirm new password</Label>
            <Input
              id="profile-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <Button
            variant="outline"
            onClick={handlePasswordChange}
            disabled={changePasswordMut.isPending}
          >
            {changePasswordMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating
              </>
            ) : (
              <>
                <KeyRound className="mr-2 h-4 w-4" />Update password
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
