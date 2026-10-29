import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import useSelectController from '../src/useSelectController.js';

const { act } = Renderer;
const roots = [];
const originalError = console.error;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); };
afterEach(async () => { await act(async () => { for (const root of roots.splice(0)) root.unmount(); }); });

async function mount(overrides = {}) {
  let current;
  const selections = [];
  const options = [{ value: 'mxn', label: 'Pesos' }, { value: 'usd', label: 'Dólares', disabled: true }, { value: 'eur', label: 'Euros' }];
  function Harness() { current = useSelectController({ options, value: 'mxn', onChange: value => selections.push(value), ...overrides }); return null; }
  await act(async () => roots.push(Renderer.create(React.createElement(Harness))));
  return { get current() { return current; }, selections, key: async key => act(async () => current.onKeyDown({ key, preventDefault() {} })) };
}

test('keyboard navigation skips unavailable options and only commits on Enter', async () => {
  const app = await mount();
  await app.key('ArrowDown');
  assert.equal(app.current.open, true);
  assert.equal(app.current.activeIndex, 0);
  await app.key('ArrowDown');
  assert.equal(app.current.activeIndex, 2);
  assert.deepEqual(app.selections, []);
  await app.key('Enter');
  assert.deepEqual(app.selections, ['eur']);
  assert.equal(app.current.open, false);
});

test('Escape and Tab dismiss without changing the saved choice', async () => {
  const app = await mount();
  await app.key('End');
  assert.equal(app.current.activeIndex, 2);
  await app.key('Escape');
  assert.equal(app.current.open, false);
  await app.key('Home');
  assert.equal(app.current.activeIndex, 0);
  await app.key('Tab');
  assert.equal(app.current.open, false);
  assert.deepEqual(app.selections, []);
});

test('typeahead finds accented option names and unavailable options cannot be chosen', async () => {
  const app = await mount({ value: 'ana', options: [
    { value: 'ana', label: 'Ana' }, { value: 'bruno', label: 'Bruno', disabled: true }, { value: 'oscar', label: 'Óscar' },
  ] });
  await app.key('o');
  assert.equal(app.current.open, true);
  assert.equal(app.current.activeIndex, 2);
  await act(async () => app.current.choose(1));
  assert.deepEqual(app.selections, []);
  await act(async () => app.current.choose(2));
  assert.deepEqual(app.selections, ['oscar']);
});

test('disabled and empty controls never open or emit a choice', async () => {
  for (const overrides of [{ disabled: true }, { options: [] }]) {
    const app = await mount(overrides);
    await app.key('ArrowDown');
    await act(async () => app.current.toggle());
    await act(async () => app.current.choose(0));
    assert.equal(app.current.open, false);
    assert.deepEqual(app.selections, []);
  }
});
