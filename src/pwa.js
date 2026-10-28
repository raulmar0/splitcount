// iPadOS Safari se anuncia como Mac; el toque lo delata. Misma regla que el
// resto de las apps: el aviso solo explica los pasos de esa plataforma.
export function plataformaDe(ua = '', puntosTactiles = 0) {
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && puntosTactiles > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function aplicacionInstalada(pantallaCompleta, navigatorStandalone) {
  return pantallaCompleta === true || navigatorStandalone === true;
}

export function plataformaActual() {
  if (typeof navigator === 'undefined') return 'desktop';
  return plataformaDe(navigator.userAgent || '', navigator.maxTouchPoints || 0);
}

export function instaladaAhora() {
  if (typeof window === 'undefined') return false;
  const pantallaCompleta = window.matchMedia?.('(display-mode: standalone)').matches === true;
  return aplicacionInstalada(pantallaCompleta, window.navigator.standalone);
}

export const AVISO_CERRADO = 'splitcount-pwa-banner';

export const AVISOS = {
  ios: {
    titulo: 'Instala Splitcount',
    texto: 'En Safari, toca Compartir y elige Agregar a Inicio.',
  },
  android: {
    titulo: 'Instala Splitcount',
    texto: 'En Chrome, abre el menú ⋮ y elige Instalar app.',
  },
  desktop: {
    titulo: 'Instala Splitcount',
    texto: 'En Chrome o Edge, usa el ícono de instalar de la barra de direcciones.',
  },
};

export const avisoPara = plataforma => AVISOS[plataforma] ?? AVISOS.desktop;

export function almacenamiento() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function avisoCerrado(storage) {
  try { return storage?.getItem(AVISO_CERRADO) === '1'; } catch { return false; }
}

export function cerrarAviso(storage) {
  try { storage.setItem(AVISO_CERRADO, '1'); return true; } catch { return false; }
}

const ESPERA_ACTIVACION_MS = 20_000;
const GRACIA_UPDATEFOUND_MS = 500;

/** Espera un estado del worker. Devuelve null si se acaba el tiempo. Nunca lanza. */
export function esperarEstado(worker, estados, timeoutMs = ESPERA_ACTIVACION_MS) {
  return new Promise(resolve => {
    if (estados.includes(worker.state)) { resolve(worker.state); return; }
    const terminar = valor => {
      clearTimeout(reloj);
      worker.removeEventListener('statechange', alCambiar);
      resolve(valor);
    };
    const alCambiar = () => { if (estados.includes(worker.state)) terminar(worker.state); };
    const reloj = setTimeout(() => terminar(null), timeoutMs);
    worker.addEventListener('statechange', alCambiar);
  });
}

/**
 * Pregunta al servidor si hay otra versión. Devuelve su worker, null si esta
 * ya es la última, o 'sin-red' si no se pudo preguntar.
 */
export async function buscarWorkerNuevo(registro, graciaMs = GRACIA_UPDATEFOUND_MS) {
  const enCurso = registro.installing ?? registro.waiting;
  if (enCurso) return enCurso;
  try {
    await registro.update();
  } catch {
    return 'sin-red';
  }
  const encontrado = registro.installing ?? registro.waiting;
  if (encontrado) return encontrado;
  return new Promise(resolve => {
    const reloj = setTimeout(() => {
      registro.removeEventListener('updatefound', alEncontrar);
      resolve(registro.installing ?? registro.waiting ?? null);
    }, graciaMs);
    const alEncontrar = () => {
      clearTimeout(reloj);
      registro.removeEventListener('updatefound', alEncontrar);
      resolve(registro.installing ?? registro.waiting ?? null);
    };
    registro.addEventListener('updatefound', alEncontrar);
  });
}

async function aplicarWorker(worker, { recargar, esperar }) {
  worker.postMessage({ type: 'SKIP_WAITING' });
  const estado = await esperar(worker, ['activated', 'redundant']);
  if (estado !== 'activated') return estado === null ? 'instalando' : 'error';
  recargar();
  return 'actualizando';
}

/** Busca una versión nueva y, si la hay, la pone en marcha y recarga. */
export async function actualizarAplicacion(registro, { recargar = () => {}, esperar = esperarEstado, graciaMs = GRACIA_UPDATEFOUND_MS } = {}) {
  if (!registro) return 'sin-soporte';
  if (registro.waiting) return aplicarWorker(registro.waiting, { recargar, esperar });
  const nuevo = await buscarWorkerNuevo(registro, graciaMs);
  if (nuevo === 'sin-red') return 'error';
  if (!nuevo) return 'aldia';
  const listo = ['installed', 'activated'].includes(nuevo.state)
    ? nuevo.state
    : await esperar(nuevo, ['installed', 'activated', 'redundant']);
  if (listo === 'redundant' || listo === null) return listo === null ? 'instalando' : 'error';
  if (listo === 'activated') { recargar(); return 'actualizando'; }
  return aplicarWorker(nuevo, { recargar, esperar });
}

export async function actualizarApp() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistration) return 'sin-soporte';
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return 'sin-soporte';
  return actualizarAplicacion(registro, { recargar: () => window.location.reload() });
}
