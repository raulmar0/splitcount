import { validateState } from './domain.js';
import { canonicalizeGroup, diffGroups } from './sync-protocol.js';

export const SYNC_API = import.meta.env?.VITE_SYNC_API || 'https://entre-sync.raulhdz40.workers.dev';
const ID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export class SyncError extends Error {
  constructor(message, code = 'invalid_response', latest = null) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.latest = latest;
  }
}

export function isSharedMetadata(value) {
  return !!value && ID.test(value.id) && TOKEN.test(value.token)
    && Number.isSafeInteger(value.revision) && value.revision >= 1;
}

export function parseInvite(hash) {
  if (typeof hash !== 'string') return null;
  const match = /^#grupo=([a-f\d-]{36})\.([A-Za-z0-9_-]{43})$/i.exec(hash);
  return match && ID.test(match[1]) ? { id: match[1], token: match[2] } : null;
}

export function buildInviteLink(capability, base = globalThis.location?.href) {
  if (!ID.test(capability?.id) || !TOKEN.test(capability?.token)) throw new SyncError('El enlace del grupo no es válido.');
  const url = new URL(base);
  url.search = '';
  url.hash = `grupo=${capability.id}.${capability.token}`;
  return url.href;
}

function validEnvelope(envelope, id) {
  return !!envelope && envelope.group?.id === id && Number.isSafeInteger(envelope.revision) && envelope.revision >= 1
    && validateState({ version: 1, activeGroupId: id, groups: [envelope.group] });
}

export function attachRemoteGroup(local, envelope, capability) {
  if (!validEnvelope(envelope, capability.id) || !TOKEN.test(capability.token)) throw new SyncError('El servidor devolvió un grupo inválido. Tus datos locales se conservan.');
  const group = canonicalizeGroup(envelope.group);
  return {
    ...group,
    _shared: { id: group.id, token: capability.token, revision: envelope.revision },
    ...(local?._selfId && group.members.some(m => m.id === local._selfId) ? { _selfId: local._selfId } : {}),
  };
}

async function request(path, { method = 'GET', body, token, fetcher = globalThis.fetch, base = SYNC_API } = {}) {
  let res;
  try {
    res = await fetcher(`${base.replace(/\/$/, '')}${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new SyncError('No hay conexión con el grupo. Conservamos tus cambios en el formulario; vuelve a intentarlo.', 'network');
  }
  let data;
  try { data = await res.json(); } catch { throw new SyncError('No se pudo leer la respuesta. Vuelve a intentarlo.', 'network'); }
  if (!res.ok) {
    if (res.status === 409) throw new SyncError('Otra persona modificó estos datos. Cierra este formulario y vuelve a abrirlo para editar la versión más reciente.', 'conflict', data);
    if (res.status === 401 || res.status === 403 || res.status === 404) throw new SyncError('No se pudo acceder al grupo. Comprueba el enlace con quien lo compartió.', 'access');
    throw new SyncError(data.message || 'No se pudo guardar el cambio. Vuelve a intentarlo.', data.error || 'server');
  }
  return data;
}

export async function createSharedGroup(group, options = {}) {
  const data = await request('/groups', { ...options, method: 'POST', body: { group: canonicalizeGroup(group) } });
  return attachRemoteGroup(group, data, { id: data.group?.id, token: data.token });
}

export async function fetchSharedGroup(capability, options = {}) {
  if (!ID.test(capability?.id) || !TOKEN.test(capability?.token)) throw new SyncError('El enlace del grupo no es válido.', 'access');
  const data = await request(`/groups/${capability.id}`, { ...options, token: capability.token });
  if (!validEnvelope(data, capability.id)) throw new SyncError('El grupo recibido no es válido. Conservamos la última copia.');
  return data;
}

export async function commitSharedGroup(before, after, options = {}) {
  if (!isSharedMetadata(before._shared)) throw new SyncError('Este grupo no tiene un enlace válido.', 'access');
  const changes = diffGroups(before, after);
  if (!changes.length) return before;
  const data = await request(`/groups/${before._shared.id}`, { ...options, method: 'PATCH', token: before._shared.token, body: { changes } });
  return attachRemoteGroup(before, data, before._shared);
}
