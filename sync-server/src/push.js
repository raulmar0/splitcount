const CONFIG_KEY = 'push-config';
const pendingConfigs = new WeakMap();
const encoder = new TextEncoder();
const P256_PRIME = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const P256_B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const base64url = value => btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

export class PushValidationError extends Error {
  constructor() {
    super('La suscripción de notificaciones no es válida.');
    this.name = 'PushValidationError';
    this.status = 400;
    this.code = 'invalid_push_subscription';
  }
}

const invalid = () => { throw new PushValidationError(); };

function decodeKey(value, size) {
  if (typeof value !== 'string' || value.length !== Math.ceil(size * 8 / 6) || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  let decoded;
  try {
    decoded = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0));
  } catch { invalid(); }
  if (decoded.length !== size || base64url(decoded) !== value) invalid();
  return decoded;
}

function validateP256(bytes) {
  if (bytes[0] !== 4) invalid();
  const integer = value => value.reduce((number, byte) => number * 256n + BigInt(byte), 0n);
  const x = integer(bytes.subarray(1, 33));
  const y = integer(bytes.subarray(33));
  if (x >= P256_PRIME || y >= P256_PRIME) invalid();
  const right = ((x * x * x - 3n * x + P256_B) % P256_PRIME + P256_PRIME) % P256_PRIME;
  if (y * y % P256_PRIME !== right) invalid();
}

function trustedHost(hostname) {
  return hostname === 'fcm.googleapis.com'
    || hostname === 'push.services.mozilla.com' || hostname.endsWith('.push.services.mozilla.com')
    || hostname === 'web.push.apple.com' || hostname.endsWith('.web.push.apple.com')
    || hostname.endsWith('.notify.windows.com');
}

/** Keep provider capability URLs opaque, and never include them in validation errors. */
export function validatePushSubscription(value) {
  if (!isRecord(value) || !isRecord(value.keys) || typeof value.endpoint !== 'string'
    || value.endpoint.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value.endpoint)) invalid();
  let endpoint;
  try { endpoint = new URL(value.endpoint); } catch { invalid(); }
  if (endpoint.protocol !== 'https:' || !trustedHost(endpoint.hostname) || endpoint.port
    || endpoint.username || endpoint.password || endpoint.hash) invalid();
  const expirationTime = value.expirationTime ?? null;
  if (expirationTime !== null && (!Number.isSafeInteger(expirationTime) || expirationTime < 0)) invalid();
  validateP256(decodeKey(value.keys.p256dh, 65));
  decodeKey(value.keys.auth, 16);
  return { endpoint: endpoint.href, expirationTime, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}

/** Persist the identity before returning its public key to a subscribing browser. */
export async function getPushConfig(storage) {
  let pending = pendingConfigs.get(storage);
  if (!pending) {
    pending = (async () => {
      const stored = await storage.get(CONFIG_KEY);
      if (stored) return stored;
      const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const [privateJwk, rawPublic] = await Promise.all([
        crypto.subtle.exportKey('jwk', pair.privateKey),
        crypto.subtle.exportKey('raw', pair.publicKey),
      ]);
      const config = { privateJwk, publicKey: base64url(rawPublic) };
      await storage.put(CONFIG_KEY, config);
      return config;
    })();
    pendingConfigs.set(storage, pending);
  }
  try { return await pending; }
  finally { if (pendingConfigs.get(storage) === pending) pendingConfigs.delete(storage); }
}

/** RFC 8292 VAPID authentication; an empty body sends no account or applicant data. */
export async function sendAdminPush(subscription, config, { fetcher = globalThis.fetch } = {}) {
  const { endpoint } = validatePushSubscription(subscription);
  try {
    const key = await crypto.subtle.importKey('jwk', config.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const header = base64url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const payload = base64url(encoder.encode(JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: 'mailto:raulhdz40@gmail.com',
    })));
    const input = `${header}.${payload}`;
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(input));
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { TTL: '300', 'Content-Length': '0', Authorization: `vapid t=${input}.${base64url(signature)}, k=${config.publicKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 410) return { expired: true };
    if (response.ok) return { expired: false };
  } catch {
    // Fetch errors can contain the full subscription URL, which is a capability secret.
  }
  throw new Error('No se pudo enviar la notificación.');
}
