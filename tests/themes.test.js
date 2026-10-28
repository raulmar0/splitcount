import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTheme, saveTheme, THEME_STORAGE_KEY } from '../src/themes.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('theme defaults to dark and persists a light preference', () => {
  const storage = memoryStorage();
  assert.equal(loadTheme(storage), 'dark');
  assert.equal(saveTheme('light', storage), true);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'light');
  assert.equal(loadTheme(storage), 'light');
  assert.equal(saveTheme('dark', storage), true);
  assert.equal(loadTheme(storage), 'dark');
});

test('invalid stored themes fall back to dark and invalid writes are rejected', () => {
  const storage = memoryStorage();
  storage.setItem(THEME_STORAGE_KEY, 'system');
  assert.equal(loadTheme(storage), 'dark');
  assert.equal(saveTheme('sepia', storage), false);
  assert.equal(storage.getItem(THEME_STORAGE_KEY), 'system');
});

test('blocked storage reads and writes fail safely', () => {
  const storage = {
    getItem() { throw new Error('Storage is blocked'); },
    setItem() { throw new Error('Quota exceeded'); },
  };
  assert.equal(loadTheme(storage), 'dark');
  assert.equal(saveTheme('light', storage), false);
});

test('unavailable browser storage defaults to dark and cannot persist', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
    assert.equal(loadTheme(), 'dark');
    assert.equal(saveTheme('light'), false);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Access denied'); } });
    assert.equal(loadTheme(), 'dark');
    assert.equal(saveTheme('light'), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
