import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import useAppNavigation from '../src/useAppNavigation.js';

const { act } = Renderer;
const roots = new Set();
const browserGlobals = [
  'IS_REACT_ACT_ENVIRONMENT', 'addEventListener', 'removeEventListener',
  'history', 'location', 'requestAnimationFrame', 'scrollTo', 'scrollY',
];
const originalGlobals = new Map(browserGlobals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalConsoleError = console.error;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  console.error = (...args) => {
    if (args[0] === 'react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer') return;
    originalConsoleError(...args);
  };
});

afterEach(async () => {
  try {
    await act(async () => { for (const root of roots) root.unmount(); });
  } finally {
    roots.clear();
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
    console.error = originalConsoleError;
  }
});

async function mount(initialHistory = {}) {
  const events = new EventTarget();
  globalThis.addEventListener = events.addEventListener.bind(events);
  globalThis.removeEventListener = events.removeEventListener.bind(events);
  globalThis.location = { pathname: '/entre-app/', search: '?source=test', href: 'https://example.test/entre-app/?source=test' };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.scrollTo = () => {};
  globalThis.scrollY = 0;
  const entries = [structuredClone(initialHistory)];
  let position = 0;
  globalThis.history = {
    get state() { return entries[position]; },
    replaceState(value) { entries[position] = structuredClone(value); },
    pushState(value) { entries.splice(++position); entries[position] = structuredClone(value); },
    back() {
      if (position === 0) return;
      const event = new Event('popstate');
      Object.defineProperty(event, 'state', { value: entries[--position] });
      events.dispatchEvent(event);
    },
  };
  let latest;
  let popCount = 0;
  function Harness() {
    const [state, setState] = React.useState({ activeGroupId: 'trip', groups: [{ id: 'trip' }, { id: 'home' }] });
    const [overlay, setOverlay] = React.useState(false);
    const snapshot = React.useRef(null);
    const navigation = useAppNavigation({ state, setState, onPop: () => {
      popCount++;
      if (!overlay) return;
      globalThis.history.pushState(snapshot.current, '', globalThis.location.href);
      setOverlay(false);
      return false;
    } });
    latest = { state, overlay, ...navigation, openOverlay: () => {
      snapshot.current = structuredClone(globalThis.history.state);
      setOverlay(true);
    } };
    return null;
  }
  let renderer;
  await act(async () => {
    renderer = Renderer.create(React.createElement(React.StrictMode, null, React.createElement(Harness)));
    roots.add(renderer);
  });
  return {
    get current() { return latest; },
    get popCount() { return popCount; },
    close: async () => {
      await act(async () => renderer.unmount());
      roots.delete(renderer);
    },
  };
}

test('Back closes an overlay without moving its form to a different group, then navigates normally', async () => {
  const app = await mount();
  await act(async () => app.current.openGroup('trip'));
  await act(async () => app.current.navigate('groups'));
  await act(async () => app.current.openGroup('home'));
  await act(async () => app.current.openOverlay());

  await act(async () => globalThis.history.back());
  assert.equal(app.current.screen, 'group');
  assert.equal(app.current.state.activeGroupId, 'home');
  assert.equal(app.current.overlay, false);
  assert.deepEqual(globalThis.history.state.buenpar, { screen: 'group', groupId: 'home', depth: 3 });

  await act(async () => globalThis.history.back());
  assert.equal(app.current.screen, 'groups');
  await act(async () => globalThis.history.back());
  assert.equal(app.current.screen, 'group');
  assert.equal(app.current.state.activeGroupId, 'trip');
});

test('reload restores the group recorded in history instead of the previously active group', async () => {
  const app = await mount({ other: 'keep', buenpar: { screen: 'group', groupId: 'home', depth: 2 } });
  assert.equal(app.current.screen, 'group');
  assert.equal(app.current.state.activeGroupId, 'home');
  assert.equal(globalThis.history.state.other, 'keep');
});

test('intercepting Back also keeps the active group when the previous entry is another group', async () => {
  const app = await mount();
  await act(async () => app.current.openGroup('trip'));
  await act(async () => app.current.openGroup('home'));
  await act(async () => app.current.openOverlay());
  await act(async () => globalThis.history.back());
  assert.equal(app.current.screen, 'group');
  assert.equal(app.current.state.activeGroupId, 'home');
  assert.equal(app.current.overlay, false);
});

test('unmount removes the Back listener after StrictMode remounting', async () => {
  const app = await mount();
  await act(async () => app.current.openGroup('home'));
  await act(async () => globalThis.history.back());
  assert.equal(app.popCount, 1);
  await act(async () => app.current.openGroup('trip'));
  await app.close();
  globalThis.history.back();
  assert.equal(app.popCount, 1);
});
