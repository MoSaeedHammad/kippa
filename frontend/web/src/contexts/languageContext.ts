import { createContext } from 'react';

export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type AppDirection = 'ltr' | 'rtl';

export const LANGUAGE_STORAGE_KEY = 'kippa.lang';

export const LANGUAGE_DIRECTIONS: Record<AppLanguage, AppDirection> = {
  en: 'ltr',
  ar: 'rtl',
};

export function readStoredLanguage(): AppLanguage | null {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw && (SUPPORTED_LANGUAGES as readonly string[]).includes(raw)) {
      return raw as AppLanguage;
    }
  } catch {
    // localStorage unavailable (private mode) — fall through
  }
  return null;
}

export function readBrowserLanguage(): AppLanguage | null {
  const nav = typeof navigator !== 'undefined' ? navigator.language : undefined;
  if (!nav) return null;
  if (nav.toLowerCase().startsWith('ar')) return 'ar';
  if (nav.toLowerCase().startsWith('en')) return 'en';
  return null;
}

export function storeLanguage(lang: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // non-fatal
  }
}

export interface LanguageContextValue {
  language: AppLanguage;
  direction: AppDirection;
  setLanguage: (lang: AppLanguage) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);
