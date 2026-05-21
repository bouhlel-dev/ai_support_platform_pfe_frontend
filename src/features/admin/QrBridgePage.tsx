import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock3, ExternalLink, Phone, QrCode, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getClientConfigRaw } from '@/shared/config/clientConfig';
import { useTranslation } from 'react-i18next';

const QR_EXPIRES_AFTER_SECONDS = 60;
const QR_WAIT_RETRY_SECONDS = 3;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type ConnectMode = 'qr' | 'phone' | 'code';

function generatePairingCode(): string[] {
  return Array.from({ length: 8 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]);
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 5) {
    return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

function buildQrPngUrl(qrUrl: string, version: number): string {
  try {
    const parsed = new URL(qrUrl);
    if (parsed.pathname.endsWith('/qr/')) {
      parsed.pathname = parsed.pathname.replace(/\/qr\/$/, '/qr.png');
    } else if (parsed.pathname.endsWith('/qr.json')) {
      parsed.pathname = parsed.pathname.replace(/\/qr\.json$/, '/qr.png');
    } else if (parsed.pathname.endsWith('/qr')) {
      parsed.pathname = `${parsed.pathname}.png`;
    } else if (!parsed.pathname.endsWith('/qr.png')) {
      parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}/qr.png`;
    }
    parsed.searchParams.set('_v', String(version));
    return parsed.toString();
  } catch {
    const baseUrl = qrUrl.split('?')[0].replace(/\/$/, '');
    const endpoint = baseUrl.endsWith('/qr')
      ? `${baseUrl}.png`
      : baseUrl.endsWith('/qr.png')
        ? baseUrl
        : `${baseUrl}/qr.png`;
    return `${endpoint}?_v=${version}`;
  }
}

export function QrBridgePage() {
  const { t } = useTranslation();
  const qrUrl = getClientConfigRaw('VITE_QR_BRIDGE_URL') || 'http://localhost:3000/qr';
  const [mode, setMode] = useState<ConnectMode>('qr');
  const [qrVersion, setQrVersion] = useState(0);
  const [qrImageUnavailable, setQrImageUnavailable] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(QR_EXPIRES_AFTER_SECONDS);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState<string[]>(() => generatePairingCode());

  const phoneDigits = useMemo(() => phoneNumber.replace(/\D/g, ''), [phoneNumber]);
  const qrImageUrl = useMemo(() => buildQrPngUrl(qrUrl, qrVersion), [qrUrl, qrVersion]);
  const qrExpired = mode === 'qr' && secondsRemaining <= 0;
  const showQrOverlay = qrExpired || qrImageUnavailable;
  const canProceedToCode = phoneDigits.length >= 8;

  useEffect(() => {
    if (mode !== 'qr') {
      return;
    }

    setQrImageUnavailable(false);
    setSecondsRemaining(QR_EXPIRES_AFTER_SECONDS);
    const timer = window.setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [mode, qrVersion]);

  const refreshQr = useCallback(() => {
    setQrImageUnavailable(false);
    setQrVersion((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (mode !== 'qr' || secondsRemaining > 0) {
      return;
    }

    const autoRefreshTimer = window.setTimeout(() => {
      refreshQr();
    }, 250);

    return () => window.clearTimeout(autoRefreshTimer);
  }, [mode, refreshQr, secondsRemaining]);

  useEffect(() => {
    if (mode !== 'qr' || !qrImageUnavailable) {
      return;
    }

    const retryTimer = window.setTimeout(() => {
      refreshQr();
    }, QR_WAIT_RETRY_SECONDS * 1000);

    return () => window.clearTimeout(retryTimer);
  }, [mode, qrImageUnavailable, refreshQr]);

  function goToCodeMode() {
    if (!canProceedToCode) {
      return;
    }
    setPairingCode(generatePairingCode());
    setMode('code');
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('qrBridge.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('qrBridge.subtitle')}</p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <a href={qrUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            {t('qrBridge.openBridgeUrl')}
          </a>
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border bg-slate-900 text-slate-100 shadow-sm">
        {mode !== 'qr' && (
          <button
            type="button"
            onClick={() => setMode('qr')}
            className="absolute left-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-200 transition hover:bg-slate-700"
            aria-label={t('qrBridge.backToQr')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        {mode === 'qr' && (
          <div className="grid gap-8 p-6 md:grid-cols-[1.15fr_0.85fr] md:p-8">
            <div className="space-y-6">
              <h2 className="text-3xl font-medium leading-tight">{t('qrBridge.connectOnWhatsapp')}</h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-500 text-xs font-semibold">1</span>
                  <p className="text-sm text-slate-300">{t('qrBridge.stepScanQr')}</p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-500 text-xs font-semibold">2</span>
                  <p className="text-sm text-slate-300">{t('qrBridge.stepOpenLinkedDevices')}</p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-500 text-xs font-semibold">3</span>
                  <p className="text-sm text-slate-300">{t('qrBridge.stepRescanIfExpired')}</p>
                </div>
              </div>
              <p className="text-sm text-emerald-400">{t('qrBridge.helpHint')}</p>
            </div>

            <div className="space-y-3">
              <div className="relative mx-auto w-full max-w-[340px] rounded-xl bg-white p-2">
                <img
                  key={qrVersion}
                  src={qrImageUrl}
                  alt={t('qrBridge.qrAlt')}
                  className="h-[320px] w-full rounded-lg object-contain"
                  onLoad={() => setQrImageUnavailable(false)}
                  onError={() => setQrImageUnavailable(true)}
                />

                {showQrOverlay && (
                  <div className="absolute inset-2 flex flex-col items-center justify-center rounded-lg bg-white/95 p-4 text-center">
                    <p className="text-sm font-medium text-slate-700">
                      {qrExpired ? t('qrBridge.qrExpired') : t('qrBridge.waitingForQr')}
                    </p>
                    <Button onClick={refreshQr} className="mt-3 gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t('qrBridge.clickToRefresh')}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
                <Clock3 className="h-4 w-4" />
                <span>{secondsRemaining}s</span>
              </div>

              <Button variant="secondary" className="w-full gap-2" onClick={() => setMode('phone')}>
                <Phone className="h-4 w-4" />
                {t('qrBridge.connectWithPhoneNumber')}
              </Button>

              <Button variant="outline" className="w-full gap-2 border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800" onClick={refreshQr}>
                <RefreshCw className="h-4 w-4" />
                {t('qrBridge.refreshNow')}
              </Button>
            </div>
          </div>
        )}

        {mode === 'phone' && (
          <div className="mx-auto w-full max-w-xl space-y-6 p-8 pt-14 text-center">
            <h2 className="text-2xl font-medium">{t('qrBridge.enterPhoneNumber')}</h2>
            <p className="text-sm text-slate-300">{t('qrBridge.phonePairingHint')}</p>

            <div className="space-y-3">
              <div className="rounded-full border border-slate-600 bg-slate-800 px-4 py-3 text-sm text-slate-200">{t('qrBridge.tunisiaLabel')}</div>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-300">+216</span>
                <Input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(formatPhoneInput(event.target.value))}
                  placeholder="__ ___ ___"
                  className="h-12 rounded-full border-slate-600 bg-slate-800 pl-16 text-center text-base text-slate-100 placeholder:text-slate-500"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      goToCodeMode();
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={goToCodeMode} disabled={!canProceedToCode} className="min-w-28">
                {t('qrBridge.next')}
              </Button>
              <Button variant="outline" className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800" onClick={() => setMode('qr')}>
                {t('qrBridge.connectWithQrCode')}
              </Button>
            </div>
          </div>
        )}

        {mode === 'code' && (
          <div className="mx-auto w-full max-w-2xl space-y-6 p-8 pt-14">
            <div className="text-center">
              <h2 className="text-2xl font-medium">{t('qrBridge.enterCodeOnPhone')}</h2>
              <button type="button" className="mt-1 text-sm text-emerald-400 hover:underline" onClick={() => setMode('phone')}>
                {t('qrBridge.edit')}
              </button>
            </div>

            <div className="rounded-xl bg-white p-5">
              <div className="flex flex-wrap items-center justify-center gap-2">
                {pairingCode.map((char, index) => (
                  <div key={`${char}-${index}`} className="flex items-center gap-2">
                    {index === 4 && <span className="text-2xl font-light text-slate-400">-</span>}
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 font-mono text-lg font-semibold text-slate-900">
                      {char}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 text-sm text-slate-300">
              <p>{t('qrBridge.step1')}</p>
              <p>{t('qrBridge.step2')}</p>
              <p>{t('qrBridge.step3')}</p>
              <p>{t('qrBridge.step4')}</p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" className="border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800" onClick={() => setPairingCode(generatePairingCode())}>
                {t('qrBridge.newCode')}
              </Button>
              <Button onClick={() => setMode('qr')}>
                <QrCode className="mr-2 h-4 w-4" />
                {t('qrBridge.backToQr')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
