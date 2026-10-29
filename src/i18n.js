import app from './locales/app.js';
import forms from './locales/forms.js';
import account from './locales/account.js';
import errors from './locales/errors.js';

export const catalogs = { ...app, ...forms, ...account, ...errors };
export const LANGUAGE_KEY = 'splitcount-language-v1';
export const LANGUAGES = ['es', 'en', 'fr', 'pt', 'it'];
const LOCALES = { es: 'es-MX', en: 'en-US', fr: 'fr-FR', pt: 'pt-BR', it: 'it-IT' };
const valid = value => value === 'system' || LANGUAGES.includes(value);
const systemLanguages = () => typeof window === 'undefined' ? ['es-MX'] : globalThis.navigator?.languages || [globalThis.navigator?.language || 'es-MX'];
export function resolveLanguage(preference = 'system', languages = systemLanguages()) {
  if (LANGUAGES.includes(preference)) return preference;
  for (const language of languages) {
    const code = String(language).toLowerCase().split(/[-_]/)[0];
    if (LANGUAGES.includes(code)) return code;
  }
  return 'es';
}
export function loadLanguage(storage) {
  try {
    const value = (storage === undefined ? globalThis.localStorage : storage)?.getItem(LANGUAGE_KEY);
    return valid(value) ? value : 'system';
  } catch { return 'system'; }
}
export function saveLanguage(value, storage) {
  try {
    const target = storage === undefined ? globalThis.localStorage : storage;
    if (!target) return false;
    target.setItem(LANGUAGE_KEY, valid(value) ? value : 'system');
    return true;
  } catch { return false; }
}
let preference = typeof window === 'undefined' ? 'system' : loadLanguage();
let resolved = resolveLanguage(preference);
const listeners = new Set();
export const getLanguagePreference = () => preference;
export const getLanguage = () => resolved;
export const getLocale = () => LOCALES[resolved];
export const subscribeLanguage = listener => { listeners.add(listener); return () => listeners.delete(listener); };
function publish() {
  if (globalThis.document) { document.documentElement.lang = resolved; document.title = 'Splitcount'; }
  for (const listener of listeners) listener();
}
export function setLanguagePreference(value, { persist = true } = {}) {
  preference = valid(value) ? value : 'system';
  resolved = resolveLanguage(preference);
  if (persist) saveLanguage(preference);
  publish();
}
export function refreshSystemLanguage() {
  if (preference !== 'system') return;
  resolved = resolveLanguage(preference);
  publish();
}
globalThis.addEventListener?.('languagechange', refreshSystemLanguage);
globalThis.addEventListener?.('storage', event => {
  if (event.key === LANGUAGE_KEY) setLanguagePreference(loadLanguage(), { persist: false });
});
if (globalThis.document) { document.documentElement.lang = resolved; document.title = 'Splitcount'; }
export function translate(source, params = {}, language = resolved) {
  if (source === undefined || source === null) return '';
  const code = LANGUAGES.includes(language) ? language : resolved;
  const value = code === 'es' ? source : catalogs[source]?.[LANGUAGES.indexOf(code) - 1] || source;
  return String(value).replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
