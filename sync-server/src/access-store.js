import { errorResponse, HttpError, json, readJson } from './service.js';
import { getPushConfig, sendAdminPush, validatePushSubscription, PushValidationError, PushDeliveryError } from './push.js';

export const OWNER_EMAIL = 'raulhdz40@gmail.com';
export const MAX_ACCESS_ACCOUNTS = 2000;
export const MAX_ACCESS_BYTES = 2 * 1024 * 1024;
export const MAX_ADMIN_SUBSCRIPTIONS = 10;
const STATE_KEY = 'access-registry';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new HttpError(400, 'invalid_access_request', 'Los datos de acceso no son válidos.'); };
const unavailable = () => new HttpError(503, 'access_unavailable', 'No pudimos consultar el acceso de la cuenta. Vuelve a intentarlo.');

export function isAdminUser(user) { return typeof user?.email === 'string' && user.email.toLowerCase() === OWNER_EMAIL; }

/** Singleton registry: all requests, decisions and notifications share one queue. */
export class AccessStore {
  #tail = Promise.resolve();

  constructor(storage, { waitUntil } = {}) { this.storage = storage; this.waitUntil = waitUntil; }

  #enqueue(operation) {
    const result = this.#tail.then(operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  fetch(request) {
    return this.#enqueue(async () => {
      try { return await this.#handle(request); }
      catch (error) {
        if (error instanceof PushValidationError) return errorResponse(new HttpError(400, error.code, error.message));
        return errorResponse(error instanceof HttpError ? error : unavailable());
      }
    });
  }

  async #save(state) {
    if (state.accounts.length > MAX_ACCESS_ACCOUNTS || new TextEncoder().encode(JSON.stringify(state)).byteLength > MAX_ACCESS_BYTES) throw unavailable();
    await this.storage.put(STATE_KEY, state);
  }

  async #deliver(subscriptions) {
    const result = { sent: 0, expired: 0, failed: 0, errors: [], endpoints: new Set() };
    if (!subscriptions.length) return result;
    const failed = (subscription, error) => {
      let provider = 'desconocido';
      try { provider = new URL(subscription.endpoint).hostname; } catch { /* A malformed stored URL cannot be identified safely. */ }
      result.failed += 1;
      result.errors.push({ provider, status: error instanceof PushDeliveryError ? error.status : null });
    };
    try {
      const config = await getPushConfig(this.storage);
      const outcomes = await Promise.allSettled(subscriptions.map(subscription => sendAdminPush(subscription, config)));
      outcomes.forEach((outcome, index) => {
        if (outcome.status !== 'fulfilled') { failed(subscriptions[index], outcome.reason); return; }
        if (outcome.value.expired) { result.endpoints.add(subscriptions[index].endpoint); result.expired += 1; }
        else result.sent += 1;
      });
    } catch {
      // Push is best effort; report safe diagnostics without retaining the error.
      subscriptions.forEach(subscription => failed(subscription));
    }
    return result;
  }

  async #pruneExpired(state, endpoints) {
    if (!endpoints.size) return;
    const active = state.subscriptions.filter(subscription => !endpoints.has(subscription.endpoint));
    if (active.length === state.subscriptions.length) return;
    state.subscriptions = active;
    await this.#save(state);
  }

  async #notify(state) {
    const { sent, expired, failed, errors, endpoints } = await this.#deliver(state.subscriptions);
    try { await this.#pruneExpired(state, endpoints); } catch { /* Retry removal on a later delivery. */ }
    return { sent, expired, failed, errors };
  }

  #notifyInBackground(state) {
    const subscriptions = structuredClone(state.subscriptions);
    const task = this.#deliver(subscriptions).then(async ({ endpoints }) => {
      if (!endpoints.size) return;
      // Reload inside the mutation queue so delivery cannot rewind a decision.
      await this.#enqueue(async () => {
        const latest = await this.storage.get(STATE_KEY);
        if (latest) await this.#pruneExpired(latest, endpoints);
      });
    }).catch(() => {});
    this.waitUntil(task);
  }

  async #session(request, state) {
    const payload = await readJson(request, 8192);
    const user = payload?.user;
    if (!isRecord(user) || typeof user.id !== 'string' || !user.id || user.id.length > 255
      || typeof user.email !== 'string' || !user.email || user.email.length > 320
      || typeof user.name !== 'string' || user.name.length > 160) invalid();
    if (isAdminUser(user)) {
      const previous = state.accounts.findIndex(account => account.id === user.id);
      if (previous >= 0) {
        state.accounts.splice(previous, 1);
        state.revision += 1;
        await this.#save(state);
      }
      return json({ status: 'approved', isAdmin: true });
    }
    let row = state.accounts.find(account => account.id === user.id);
    const email = user.email.toLowerCase();
    if (!row) {
      const now = Date.now();
      row = { id: user.id, email, name: user.name, status: 'pending', requestedAt: now, updatedAt: now, version: 1 };
      state.accounts.push(row);
      state.revision += 1;
      // Commit before notifying. A crash or delivery failure cannot re-request.
      await this.#save(state);
      if (this.waitUntil) this.#notifyInBackground(state);
      else await this.#notify(state);
    } else if (row.email !== email || row.name !== user.name) {
      row.email = email;
      row.name = user.name;
      row.updatedAt = Date.now();
      row.version += 1;
      state.revision += 1;
      await this.#save(state);
    }
    return json({ status: row.status, isAdmin: false });
  }

  async #decision(request, state, encodedId) {
    let id;
    try { id = decodeURIComponent(encodedId); } catch { invalid(); }
    if (!id || id.length > 255) invalid();
    const payload = await readJson(request, 1024);
    if (!isRecord(payload) || Object.keys(payload).some(key => !['status', 'version'].includes(key))
      || !['approved', 'rejected'].includes(payload.status) || !Number.isSafeInteger(payload.version) || payload.version < 1) invalid();
    const row = state.accounts.find(account => account.id === id);
    if (!row) throw new HttpError(404, 'not_found', 'No se encontró esta solicitud de acceso.');
    if (isAdminUser(row)) throw new HttpError(403, 'owner_protected', 'La cuenta administradora conserva su acceso.');
    if (payload.version !== row.version) return json({ error: 'access_conflict', message: 'Esta solicitud cambió. Revisa la versión más reciente.', account: row, revision: state.revision }, 409);
    if (payload.status !== row.status) {
      row.status = payload.status;
      row.version += 1;
      row.updatedAt = Date.now();
      state.revision += 1;
      await this.#save(state);
    }
    return json({ account: row, revision: state.revision });
  }

  async #push(request, state) {
    if (request.method === 'POST' || request.method === 'DELETE') {
      const payload = await readJson(request, 8192);
      const field = request.method === 'POST' ? 'subscription' : 'endpoint';
      if (!isRecord(payload) || Object.keys(payload).some(key => key !== field)) invalid();
      if (request.method === 'POST') {
        const subscription = validatePushSubscription(payload.subscription);
        const index = state.subscriptions.findIndex(item => item.endpoint === subscription.endpoint);
        if (index < 0) {
          if (state.subscriptions.length >= MAX_ADMIN_SUBSCRIPTIONS) throw new HttpError(409, 'push_subscription_limit', 'Ya registraste el máximo de dispositivos.');
          state.subscriptions.push(subscription);
        } else state.subscriptions[index] = subscription;
      } else {
        if (typeof payload.endpoint !== 'string' || payload.endpoint.length > 4096 || !payload.endpoint) invalid();
        state.subscriptions = state.subscriptions.filter(item => item.endpoint !== payload.endpoint);
      }
      await this.#save(state);
    } else if (request.method !== 'GET') throw new HttpError(404, 'not_found', 'No se encontró esta ruta.');
    const { publicKey } = await getPushConfig(this.storage);
    return json({ publicKey, subscriptions: state.subscriptions.length, endpoints: state.subscriptions.map(subscription => subscription.endpoint) });
  }

  async #handle(request) {
    const path = new URL(request.url).pathname;
    const state = await this.storage.get(STATE_KEY) ?? { revision: 0, accounts: [], subscriptions: [] };
    // /session accepts identities only from the verified public Worker router.
    if (path === '/session' && request.method === 'POST') return this.#session(request, state);
    if (path === '/admin/accounts' && request.method === 'GET') return json({ revision: state.revision, accounts: state.accounts });
    if (path.startsWith('/admin/accounts/') && request.method === 'PATCH') return this.#decision(request, state, path.slice('/admin/accounts/'.length));
    if (path === '/admin/push') return this.#push(request, state);
    if (path === '/admin/push/test' && request.method === 'POST') {
      const result = await this.#notify(state);
      if (result.sent === 0 && result.failed > 0) {
        const { provider, status } = result.errors[0];
        const detail = status === null ? 'sin respuesta del proveedor (conexión o tiempo de espera)' : `HTTP ${status}`;
        return json({ error: 'push_delivery_failed', message: `No se pudo enviar la notificación mediante ${provider}: ${detail}.`, ...result }, 502);
      }
      return json(result);
    }
    throw new HttpError(404, 'not_found', 'No se encontró esta ruta.');
  }
}
