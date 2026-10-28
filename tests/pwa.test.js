import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));

test('manifest installs within its deployment path and supplies correctly sized PNG icons', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  for (const icon of [...manifest.icons, { src: 'brand/apple-touch-icon.png', sizes: '180x180' }]) {
    const png = await readFile(join(root, 'public', icon.src));
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test('production build registers a scoped worker and precaches the app without the shared API', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'splitcount-pwa-'));
  try {
    await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const html = await readFile(join(outDir, 'index.html'), 'utf8');
    assert.match(html, /href="\.\/manifest\.webmanifest"/);
    assert.match(html, /src="\.\/registerSW\.js"/);
    const registration = await readFile(join(outDir, 'registerSW.js'), 'utf8');
    assert.match(registration, /register\('\.\/sw\.js', \{ scope: '\.\/'/);
    const worker = await readFile(join(outDir, 'sw.js'), 'utf8');
    assert.match(worker, /push-worker\.js/);
    assert.ok((await readFile(join(outDir, 'push-worker.js'), 'utf8')).includes('notificationclick'));
    assert.match(worker, /index\.html/);
    assert.match(worker, /brand\/icon-192\.png/);
    assert.match(worker, /brand\/icon-512\.png/);
    for (const asset of await readdir(join(outDir, 'assets'))) {
      if (/\.(js|css)$/.test(asset)) assert.ok(worker.includes(asset), `${asset} must work offline`);
    }
    assert.doesNotMatch(worker, /entre-sync|workers\.dev/);
    assert.doesNotMatch(worker, /registerRoute\([^;]*CacheFirst/);
    let forcedActivation = false;
    let claimedClients = false;
    const listeners = [];
    runInNewContext(worker, {
      importScripts(path) { assert.equal(path, 'push-worker.js'); },
      define: (_dependencies, factory) => factory({
        precacheAndRoute() {},
        cleanupOutdatedCaches() {},
        registerRoute() {},
        createHandlerBoundToURL() { return () => {}; },
        NavigationRoute: class {},
        clientsClaim() { claimedClients = true; },
      }),
      self: {
        addEventListener(type, listener) { listeners.push([type, listener]); },
        skipWaiting() { forcedActivation = true; },
      },
    });
    assert.equal(forcedActivation, false, 'updates must wait for existing tabs to close');
    assert.equal(claimedClients, false, 'updates must not take over an open editor');
    const onMessage = listeners.find(([type]) => type === 'message')?.[1];
    assert.equal(typeof onMessage, 'function');
    onMessage({ data: { type: 'SKIP_WAITING' } });
    assert.equal(forcedActivation, true, 'the update button must be able to apply a waiting version');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
