import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { rtlLanguages, type SupportedLanguage } from './resources';

export function isRtlLanguage(language?: string | null) {
  if (!language) return false;
  const normalized = language.toLowerCase().split('-')[0] as SupportedLanguage;
  return rtlLanguages.includes(normalized);
}

export function DirectionSync() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const language = i18n.resolvedLanguage || i18n.language || 'en';
    const rtl = isRtlLanguage(language);

    document.documentElement.lang = language;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.body.dir = rtl ? 'rtl' : 'ltr';
  }, [i18n.language, i18n.resolvedLanguage]);

  return null;
}
