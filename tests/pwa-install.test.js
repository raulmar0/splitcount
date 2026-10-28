import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';
import { AVISO_CERRADO, actualizarAplicacion, almacenamiento, aplicacionInstalada, avisoCerrado, avisoPara, cerrarAviso, plataformaDe } from '../src/pwa.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('la versión que se muestra es la de package.json', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('el aviso de instalación depende de la plataforma', () => {
  assert.equal(plataformaDe('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'ios');
  assert.equal(plataformaDe('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)'), 'ios');
  assert.equal(plataformaDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5), 'ios');
  assert.equal(plataformaDe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0), 'desktop');
  assert.equal(plataformaDe('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'android');
  assert.equal(plataformaDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'desktop');

  assert.match(avisoPara('ios').texto, /Compartir/);
  assert.match(avisoPara('ios').texto, /Agregar a Inicio/);
  assert.match(avisoPara('android').texto, /Instalar app/);
  assert.match(avisoPara('desktop').texto, /barra de direcciones/);
  assert.equal(avisoPara('otra'), avisoPara('desktop'));
});

test('una app ya abierta a pantalla completa no vuelve a pedir instalación', () => {
  assert.equal(aplicacionInstalada(true, undefined), true);
  assert.equal(aplicacionInstalada(false, true), true);
  assert.equal(aplicacionInstalada(false, undefined), false);
});

test('cerrar el aviso se recuerda y un almacenamiento bloqueado no rompe la página', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(avisoCerrado(storage), false);
  assert.equal(cerrarAviso(storage), true);
  assert.equal(values.get(AVISO_CERRADO), '1');
  assert.equal(avisoCerrado(storage), true);
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(avisoCerrado(blocked), false);
  assert.equal(cerrarAviso(blocked), false);
  assert.equal(avisoCerrado(undefined), false);
});

function workerFalso(estado, alAvisar) {
  const worker = new EventTarget();
  worker.state = estado;
  worker.mensajes = [];
  worker.postMessage = data => {
    worker.mensajes.push(data);
    if (alAvisar) alAvisar(worker);
  };
  return worker;
}

function registroFalso({ waiting = null, installing = null, update = async () => {} } = {}) {
  const registro = {
    waiting,
    installing,
    update,
    addEventListener(tipo, fn) { registro[tipo] = fn; },
    removeEventListener(tipo) { delete registro[tipo]; },
  };
  return registro;
}

test('un clic aplica la versión que ya espera y recarga', async () => {
  const worker = workerFalso('installed', actual => { actual.state = 'activated'; });
  let recargas = 0;
  const resultado = await actualizarAplicacion(registroFalso({ waiting: worker }), {
    recargar: () => { recargas += 1; },
  });
  assert.deepEqual(worker.mensajes, [{ type: 'SKIP_WAITING' }]);
  assert.equal(recargas, 1);
  assert.equal(resultado, 'actualizando');
});

test('un clic sin versión nueva dice que ya está al día y no recarga', async () => {
  let consultas = 0;
  let recargas = 0;
  const resultado = await actualizarAplicacion(registroFalso({
    update: async () => { consultas += 1; },
  }), { recargar: () => { recargas += 1; }, graciaMs: 0 });
  assert.equal(consultas, 1);
  assert.equal(recargas, 0);
  assert.equal(resultado, 'aldia');
});

test('sin conexión el clic no afirma que la app está al día', async () => {
  const resultado = await actualizarAplicacion(registroFalso({
    update: async () => { throw new Error('offline'); },
  }), { graciaMs: 0 });
  assert.equal(resultado, 'error');
});

test('si la versión nueva todavía se descarga, el clic espera y luego la aplica', async () => {
  const worker = workerFalso('installing', actual => { actual.state = 'activated'; });
  let recargas = 0;
  const promesa = actualizarAplicacion(registroFalso({
    update: async function update() { this.installing = worker; },
  }), { recargar: () => { recargas += 1; }, graciaMs: 0 });
  setTimeout(() => {
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
  }, 10);
  assert.equal(await promesa, 'actualizando');
  assert.deepEqual(worker.mensajes, [{ type: 'SKIP_WAITING' }]);
  assert.equal(recargas, 1);
});

test('leer el almacenamiento no lanza si el navegador lo bloquea al tocarlo', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { get() { throw new Error('blocked'); }, configurable: true });
  try {
    assert.equal(almacenamiento(), undefined);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
