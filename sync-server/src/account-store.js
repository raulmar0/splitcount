import { canonicalizeGroup, MAX_GROUP_BYTES } from '../../src/sync-protocol.js';
import { errorResponse, hashToken, HttpError, json, readJson } from './service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const MAX_ACCOUNT_GROUPS = 6;
export const MAX_ACCOUNT_OPERATIONS = 1000;
export const MAX_ACCOUNT_BYTES = 1024 * 1024;
export const MAX_ACCOUNT_REQUEST_BYTES = MAX_GROUP_BYTES + 1024;
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const invalid = () => { throw new HttpError(400, 'invalid_account_request', 'Los datos de la cuenta no son válidos.'); };
const removed = () => { throw new HttpError(410, 'group_removed', 'Ya saliste de este grupo. Usa una invitación para volver a unirte.'); };
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const selfIdValid = value => value === null || typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const entryFor = row => ({ id: row.id, token: row.token, selfId: row.selfId, version: row.version, sourceId: row.sourceId });

function validateSelf(selfId, group) {
  if (!selfIdValid(selfId) || selfId !== null && !group.members.some(member => member.id === selfId)) {
    throw new HttpError(400, 'invalid_self_id', 'La persona elegida no pertenece a este grupo.');
  }
}

/** One serialized queue covers storage and all remote ledger awaits. */
export class AccountStore {
  #tail = Promise.resolve();

  constructor(storage, env) { this.storage = storage; this.env = env; }

  fetch(request) {
    const result = this.#tail.then(async () => {
      try { return await this.#handle(request); }
      catch (error) { return errorResponse(error); }
    });
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #save(state) {
    if (state.operations.length > MAX_ACCOUNT_OPERATIONS || bytes(state) > MAX_ACCOUNT_BYTES) {
      throw new HttpError(409, 'account_limit', 'La cuenta alcanzó el límite de registros.');
    }
    await this.storage.put('directory', state);
  }

  async #ledger(id, token, group) {
    const stub = this.env.GROUPS.get(this.env.GROUPS.idFromName(id));
    if (group) {
      const response = await stub.fetch(new Request('https://internal/initialize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, tokenHash: await hashToken(token) }),
      }));
      if (response.status === 201) return response.json();
      // A crash after ledger creation is recovered using the already-persisted key.
      if (response.status !== 409) throw new HttpError(503, 'group_unavailable', 'No se pudo guardar el grupo. Vuelve a intentarlo.');
    }
    const response = await stub.fetch(new Request(`https://internal/groups/${id}`, { headers: { Authorization: `Bearer ${token}` } }));
    if (response.status === 401) throw new HttpError(401, 'unauthorized', 'El enlace compartido no es válido.');
    if (response.status === 404) throw new HttpError(404, 'not_found', 'No se encontró este grupo.');
    if (!response.ok) throw new HttpError(503, 'group_unavailable', 'No se pudo recuperar el grupo. Vuelve a intentarlo.');
    return response.json();
  }

  #conflict(row, state) {
    return json({ error: 'account_conflict', message: 'Este grupo cambió en otro dispositivo. Revisa la versión más reciente.', entry: row.active ? entryFor(row) : null, revision: state.revision }, 409);
  }

  async #handle(request) {
    const path = new URL(request.url).pathname;
    const state = await this.storage.get('directory') ?? { revision: 0, rows: [], operations: [] };
    if (path === '/account/groups') {
      if (request.method === 'GET') return json({ revision: state.revision, groups: state.rows.filter(row => row.active).map(entryFor) });
      if (request.method === 'POST') return this.#post(request, state);
    }
    const id = path.startsWith('/account/groups/') ? path.slice('/account/groups/'.length) : '';
    if (!UUID.test(id) || !['PATCH', 'DELETE'].includes(request.method)) throw new HttpError(404, 'not_found', 'No se encontró esta ruta.');
    const payload = await readJson(request, 1024);
    const keys = request.method === 'PATCH' ? ['selfId', 'version'] : ['version'];
    if (!isRecord(payload) || Object.keys(payload).some(key => !keys.includes(key))
      || !Number.isSafeInteger(payload.version) || payload.version < 1
      || request.method === 'PATCH' && !selfIdValid(payload.selfId)) invalid();
    const row = state.rows.find(item => item.id === id);
    if (!row) throw new HttpError(404, 'not_found', 'No se encontró este grupo en tu cuenta.');
    if (!row.active) {
      if (request.method === 'DELETE' && payload.version === row.deletedVersion) return json({ revision: state.revision });
      return this.#conflict(row, state);
    }
    if (request.method === 'PATCH') {
      const envelope = await this.#ledger(row.id, row.token);
      validateSelf(payload.selfId, envelope.group);
      if (payload.version !== row.version) {
        if (payload.version === row.version - 1 && payload.selfId === row.selfId && row.lastMutation === 'identity') return json({ entry: entryFor(row), revision: state.revision });
        return this.#conflict(row, state);
      }
      if (payload.selfId === row.selfId) return json({ entry: entryFor(row), revision: state.revision });
      row.selfId = payload.selfId;
      row.version += 1;
      row.lastMutation = 'identity';
    } else {
      if (payload.version !== row.version) return this.#conflict(row, state);
      row.active = false;
      row.deletedVersion = row.version;
      row.version += 1;
      row.lastMutation = 'delete';
      // Preserve compact operation fingerprints, never old snapshots or keys.
      for (const operation of state.operations.filter(item => item.id === id)) {
        operation.removed = true;
        delete operation.pending;
      }
      delete row.token;
      delete row.selfId;
    }
    state.revision += 1;
    await this.#save(state);
    return json(request.method === 'DELETE' ? { revision: state.revision } : { entry: entryFor(row), revision: state.revision });
  }

  async #post(request, state) {
    const payload = await readJson(request, MAX_ACCOUNT_REQUEST_BYTES);
    if (!isRecord(payload) || typeof payload.sourceId !== 'string' || !payload.sourceId.trim() || payload.sourceId.length > 160 || !selfIdValid(payload.selfId)) invalid();
    const create = Object.hasOwn(payload, 'group');
    const keys = create ? ['sourceId', 'group', 'selfId'] : ['sourceId', 'id', 'token', 'selfId'];
    if (Object.keys(payload).some(key => !keys.includes(key))) invalid();
    const group = create ? canonicalizeGroup(payload.group) : null;
    if (!create && (typeof payload.id !== 'string' || !UUID.test(payload.id) || typeof payload.token !== 'string' || !TOKEN.test(payload.token))) invalid();
    if (group) validateSelf(payload.selfId, group);
    const fingerprint = await hashToken(JSON.stringify(create
      ? { group, selfId: payload.selfId }
      : { id: payload.id, token: payload.token, selfId: payload.selfId }));
    let operation = state.operations.find(item => item.sourceId === payload.sourceId);
    if (operation?.removed) removed();
    if (operation && operation.fingerprint !== fingerprint) throw new HttpError(409, 'operation_conflict', 'La solicitud original cambió. Conserva tus cambios y vuelve a intentarlo.');
    if (operation && !operation.pending) {
      const row = state.rows.find(item => item.id === operation.id && item.active);
      if (!row) removed();
      return json({ entry: entryFor(row), envelope: await this.#ledger(row.id, row.token), revision: state.revision });
    }
    if (!operation) {
      if (state.operations.length >= MAX_ACCOUNT_OPERATIONS) throw new HttpError(409, 'account_limit', 'La cuenta alcanzó el límite de registros.');
      if (create) {
        const reserved = state.rows.filter(row => row.active).length + state.operations.filter(item => item.pending).length;
        if (reserved >= MAX_ACCOUNT_GROUPS) throw new HttpError(409, 'account_limit', 'La cuenta admite hasta 6 grupos compartidos. Sal de uno para agregar otro.');
        const id = crypto.randomUUID();
        const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
        operation = { sourceId: payload.sourceId, id, fingerprint, pending: { token, group: canonicalizeGroup({ ...group, id }), selfId: payload.selfId } };
        state.operations.push(operation);
        // Persist identity and original request fingerprint before any remote side effect.
        await this.#save(state);
      }
    }
    const id = operation?.id ?? payload.id;
    const token = operation?.pending?.token ?? payload.token;
    const envelope = await this.#ledger(id, token, operation?.pending?.group);
    validateSelf(payload.selfId, envelope.group);
    let row = state.rows.find(item => item.id === id);
    // Persisted creates already reserved a slot. Let their retries finish even
    // when an older directory predates the current account limit.
    if (!row?.active && !operation?.pending && state.rows.filter(item => item.active).length + state.operations.filter(item => item.pending).length >= MAX_ACCOUNT_GROUPS) {
      throw new HttpError(409, 'account_limit', 'La cuenta admite hasta 6 grupos compartidos. Sal de uno para agregar otro.');
    }
    const existing = row?.active;
    if (!existing) {
      const next = { id, token, selfId: payload.selfId, version: row ? row.version + 1 : 1, sourceId: payload.sourceId, active: true, lastMutation: 'join' };
      if (row) Object.assign(row, next);
      else { row = next; state.rows.push(row); }
      state.revision += 1;
    }
    if (!operation) {
      operation = { sourceId: payload.sourceId, id, fingerprint };
      state.operations.push(operation);
    }
    delete operation.pending;
    await this.#save(state);
    return json({ entry: entryFor(row), envelope, revision: state.revision }, existing ? 200 : 201);
  }
}
