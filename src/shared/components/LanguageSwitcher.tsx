import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supportedLanguages } from '@/shared/i18n/resources';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  const normalizedLanguage = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase().split('-')[0];
  const currentLanguage = supportedLanguages.includes(normalizedLanguage as (typeof supportedLanguages)[number])
    ? (normalizedLanguage as (typeof supportedLanguages)[number])
    : 'en';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('common.language')}
          title={t('common.language')}
          className="h-9 w-9 shrink-0 border border-border/70 bg-background/80 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {supportedLanguages.map((language) => (
          <DropdownMenuItem
            key={language}
            onSelect={() => void i18n.changeLanguage(language)}
            className={language === currentLanguage ? 'bg-accent text-accent-foreground' : ''}
          >
            {t(`common.${language === 'en' ? 'english' : language === 'fr' ? 'french' : 'arabic'}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
