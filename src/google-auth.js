import { SYNC_API } from './sync.js';

let activeLoad;
let loadedLanguage;
let scriptElement;

function insertIdentityScript(language) {
  return new Promise((resolve, reject) => {
    // Keep a single owned script; the initialized SDK and active credentials stay in memory.
    scriptElement?.remove();
    const script = document.createElement('script');
    scriptElement = script;
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) {
        script.remove();
        if (scriptElement === script) scriptElement = null;
        reject(error);
      } else {
        loadedLanguage = language;
        resolve(globalThis.google.accounts.id);
      }
    };
    const timer = setTimeout(() => finish(new Error('Google está tardando en responder. Comprueba tu conexión y vuelve a intentarlo.')), 12000);
    script.src = `https://accounts.google.com/gsi/client?hl=${language}`;
    script.async = true;
    script.onload = () => finish(globalThis.google?.accounts?.id ? null : new Error('No se pudo cargar el acceso con Google. Vuelve a intentarlo.'));
    script.onerror = () => finish(new Error('No se pudo conectar con Google. Comprueba tu conexión o el bloqueador del navegador.'));
    document.head.appendChild(script);
  });
}

export function loadGoogleIdentity(locale = 'es') {
  const requested = String(locale).toLowerCase().split(/[-_]/)[0];
  const language = ['es', 'en', 'fr', 'pt', 'it'].includes(requested) ? requested : 'es';
  if (activeLoad?.language === language) return activeLoad.promise;
  if (!activeLoad && loadedLanguage === language && globalThis.google?.accounts?.id) {
    return Promise.resolve(globalThis.google.accounts.id);
  }
  const previous = activeLoad;
  const request = { language };
  // Loading different SDK locales concurrently can let a slower old script win.
  // Serialize them, while same-language callers share the current request.
  const loading = previous
    ? previous.promise.catch(() => {}).then(() => insertIdentityScript(language))
    : insertIdentityScript(language);
  request.promise = loading.then(sdk => {
    if (activeLoad === request) activeLoad = null;
    return sdk;
  }, error => {
    if (activeLoad === request) activeLoad = null;
    throw error;
  });
  activeLoad = request;
  return request.promise;
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
