import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguage, loadLanguage, saveLanguage, translate, setLanguagePreference, getLocale, catalogs } from '../src/i18n.js';
import { formatMoney, parseMoney } from '../src/domain.js';

test('system preference follows the first supported regional system language', () => {
  assert.equal(resolveLanguage('system', ['de-DE', 'fr-CA', 'en-US']), 'fr');
  assert.equal(resolveLanguage('system', ['pt-PT']), 'pt');
  assert.equal(resolveLanguage('system', ['it-CH']), 'it');
  assert.equal(resolveLanguage('system', ['zh-CN']), 'es');
  assert.equal(resolveLanguage('en', ['es-MX']), 'en');
});

test('missing, invalid or unavailable storage uses system without losing valid choices', () => {
  assert.equal(loadLanguage({ getItem: () => null }), 'system');
  assert.equal(loadLanguage({ getItem: () => 'xx' }), 'system');
  assert.equal(loadLanguage({ getItem: () => 'fr' }), 'fr');
  assert.equal(loadLanguage({ getItem() { throw new Error('blocked'); } }), 'system');
  assert.equal(saveLanguage('it', { setItem() { throw new Error('blocked'); } }), false);
  const saved = new Map();
  assert.equal(saveLanguage('pt', { setItem: (key, value) => saved.set(key, value) }), true);
  assert.equal(saved.get('splitcount-language-v1'), 'pt');
});

test('translations interpolate values without translating names or dropping zero', () => {
  assert.equal(translate('Integrantes de {name}', { name: 'La casa' }, 'en'), 'Members of La casa');
  assert.equal(translate('{count} resultados', { count: 0 }, 'en'), '0 results');
  assert.equal(translate('Custom user title', {}, 'it'), 'Custom user title');
});

test('changing language formats integer cents and currencies in the selected locale', () => {
  setLanguagePreference('fr', { persist: false });
  assert.equal(getLocale(), 'fr-FR');
  assert.equal(formatMoney(123456, 'EUR'), '1\u202f234,56\u00a0€');
  setLanguagePreference('en', { persist: false });
  assert.equal(formatMoney(123456, 'USD'), '$1,234.56');
  setLanguagePreference('es', { persist: false });
  assert.equal(formatMoney(123456, 'MXN'), '$1,234.56');
});

test('every translation supplies all four target languages and preserves placeholders', () => {
  for (const [source, values] of Object.entries(catalogs)) {
    assert.equal(values.length, 4, source);
    const placeholders = [...source.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const value of values) {
      assert.equal(typeof value, 'string', source);
      assert.ok(value.length, source);
      assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(), placeholders, source);
    }
  }
});

test('French amounts accept properly grouped spaces and decimal comma without ambiguous separators', () => {
  setLanguagePreference('fr', { persist: false });
  assert.equal(parseMoney('1 234,56'), 123456);
  assert.equal(parseMoney('1\u202f234\u00a0567,89'), 123456789);
  assert.equal(parseMoney('12 34,56'), null);
  assert.equal(parseMoney('1,234.56'), null);
  assert.equal(parseMoney('1234.56'), 123456);
  setLanguagePreference('es', { persist: false });
  assert.equal(parseMoney('1 234,56'), null);
});
