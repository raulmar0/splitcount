export const THEME_STORAGE_KEY = 'entre-theme-v1';

const isTheme = value => value === 'dark' || value === 'light';

export function loadTheme(storage) {
  try {
    const theme = (storage ?? globalThis.localStorage)?.getItem(THEME_STORAGE_KEY);
    return isTheme(theme) ? theme : 'dark';
  } catch {
    return 'dark';
  }
}

export function saveTheme(theme, storage) {
  if (!isTheme(theme)) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(THEME_STORAGE_KEY, theme);
    return true;
  } catch {
    return false;
  }
}
