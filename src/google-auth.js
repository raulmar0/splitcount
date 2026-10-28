import { SYNC_API } from './sync.js';

let scriptPromise;

export function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const finish = error => {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve(globalThis.google.accounts.id);
      };
      const timer = setTimeout(() => finish(new Error('Google está tardando en responder. Comprueba tu conexión y vuelve a intentarlo.')), 12000);
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => finish(globalThis.google?.accounts?.id ? null : new Error('No se pudo cargar el acceso con Google. Vuelve a intentarlo.'));
      script.onerror = () => finish(new Error('No se pudo conectar con Google. Comprueba tu conexión o el bloqueador del navegador.'));
      document.head.appendChild(script);
    }).catch(error => { scriptPromise = null; throw error; });
  }
  return scriptPromise;
}

export async function verifyGoogleCredential(credential, { fetcher = globalThis.fetch, base = SYNC_API, signal = AbortSignal.timeout(12000) } = {}) {
  if (typeof credential !== 'string' || !credential || credential.length > 8192) throw new Error('Google no devolvió una credencial válida. Vuelve a iniciar sesión.');
  let response;
  try {
    response = await fetcher(`${base.replace(/\/$/, '')}/auth/me`, {
      headers: { Authorization: `Bearer ${credential}` },
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
  } catch { throw new Error('No pudimos verificar tu cuenta. Comprueba tu conexión y vuelve a iniciar sesión.'); }
  if (!response.ok) throw new Error(response.status === 401
    ? 'Tu acceso con Google no es válido o ya venció. Vuelve a iniciar sesión.'
    : 'No pudimos verificar tu cuenta con el servidor. Vuelve a intentarlo.');
  let data;
  try { data = await response.json(); } catch { throw new Error('El servidor devolvió una respuesta inválida. Vuelve a intentarlo.'); }
  if (typeof data?.user?.id !== 'string' || !data.user.id || typeof data.user.name !== 'string'
    || typeof data.user.email !== 'string' || !data.user.email || !Number.isSafeInteger(data.expiresAt)
    || data.expiresAt <= Date.now() || data.expiresAt > Date.now() + 7200000
    || !['pending', 'approved', 'rejected'].includes(data.access?.status) || typeof data.access?.isAdmin !== 'boolean') {
    throw new Error('El servidor devolvió una cuenta inválida. Vuelve a iniciar sesión.');
  }
  return {
    user: { id: data.user.id, name: data.user.name, email: data.user.email }, expiresAt: data.expiresAt,
    access: { status: data.access.status, isAdmin: data.access.isAdmin },
  };
}
