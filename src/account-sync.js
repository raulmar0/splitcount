import { SYNC_API, attachRemoteGroup, isSharedMetadata, SyncError } from './sync.js';
import { canonicalizeGroup } from './sync-protocol.js';

export const isAccountMetadata = value => !!value && Number.isSafeInteger(value.version) && value.version > 0
  && typeof value.sourceId === 'string' && value.sourceId.length > 0 && value.sourceId.length <= 160;

export const isAccountEntry = entry => !!entry && isAccountMetadata(entry)
  && isSharedMetadata({ ...entry, revision: 1 })
  && (entry.selfId === null || typeof entry.selfId === 'string' && entry.selfId.length > 0 && entry.selfId.length <= 128);

export function validateDirectory(data) {
  if (!Number.isSafeInteger(data?.revision) || data.revision < 0 || !Array.isArray(data.groups)
    || data.groups.length > 100 || !data.groups.every(isAccountEntry)
    || new Set(data.groups.map(entry => entry.id)).size !== data.groups.length) {
    throw new SyncError('La lista de grupos recibida no es válida. Conservamos tu copia.', 'invalid_response');
  }
  return data;
}

export function attachAccountGroup(local, envelope, entry) {
  if (!isAccountEntry(entry)) throw new SyncError('El grupo de tu cuenta no es válido.', 'invalid_response');
  const group = attachRemoteGroup(local, envelope, entry);
  delete group._selfId;
  if (entry.selfId && group.members.some(member => member.id === entry.selfId)) group._selfId = entry.selfId;
  group._account = { version: entry.version, sourceId: entry.sourceId };
  return group;
}

export function registrationBody(group, sourceId) {
  const selfId = group._selfId ?? (group._shared ? null : group.members.find(member => member.id === 'you')?.id ?? group.members[0]?.id ?? null);
  return group._shared
    ? { sourceId, id: group._shared.id, token: group._shared.token, selfId }
    : { sourceId, group: canonicalizeGroup(group), selfId };
}

export function isAccountApiPath(path) {
  if (typeof path !== 'string') return false;
  if (/^\/account\/groups(?:\/[0-9a-f-]{36})?$/.test(path)
    || ['/admin/accounts', '/admin/push', '/admin/push/test'].includes(path)) return true;
  const match = /^\/admin\/accounts\/([^/?#\\]+)$/.exec(path);
  if (!match) return false;
  try {
    const subject = decodeURIComponent(match[1]);
    return subject.length > 0 && subject.length <= 256 && subject !== '.' && subject !== '..'
      && !/[\/\\%\u0000-\u001f\u007f]/.test(subject) && encodeURIComponent(subject) === match[1];
  } catch { return false; }
}

export async function accountRequest(credential, path, { method = 'GET', body, signal, fetcher = globalThis.fetch, base = SYNC_API } = {}) {
  if (!isAccountApiPath(path)) throw new SyncError('La ruta de tu cuenta no es válida.', 'invalid_request');
  if (typeof credential !== 'string' || !credential) throw new SyncError('Vuelve a iniciar sesión para sincronizar tus grupos.', 'auth_required');
  let response, data;
  try {
    response = await fetcher(`${base.replace(/\/$/, '')}${path}`, {
      method, headers: { Authorization: `Bearer ${credential}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    });
    data = await response.json();
  } catch { throw new SyncError('No pudimos conectar con tu cuenta. Tu copia y tus borradores se conservan.', 'network'); }
  if (!response.ok) {
    const code = response.status === 401 && data?.error === 'invalid_google_token' ? 'auth_required' : typeof data?.error === 'string' ? data.error : 'server';
    const message = code === 'auth_required' ? 'Tu sesión venció. Vuelve a iniciar sesión para sincronizar.'
      : typeof data?.message === 'string' ? data.message : 'No pudimos sincronizar tu cuenta. Vuelve a intentarlo.';
    throw new SyncError(message, code, data);
  }
  return data;
}
