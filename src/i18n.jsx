import { useSyncExternalStore } from 'react';
import { getLanguage, getLanguagePreference, getLocale, setLanguagePreference, subscribeLanguage, translate } from './i18n.js';

export function useI18n() {
  // Preference is part of the snapshot even when it resolves to the same system language.
  useSyncExternalStore(subscribeLanguage, () => `${getLanguagePreference()}:${getLanguage()}`);
  return { t: translate, language: getLanguagePreference(), resolvedLanguage: getLanguage(), locale: getLocale(), setLanguage: setLanguagePreference };
}
