import { applyChanges, canonicalizeGroup, MAX_GROUP_BYTES, SyncConflictError, SyncValidationError } from '../../src/sync-protocol.js';
import { authenticateGoogleRequest, GoogleAuthError } from './google-auth.js';

const VERSION = '1.0.0';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const GROUP_PATH = /^\/groups\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;
const HASH = /^[0-9a-f]{64}$/;

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function errorResponse(error) {
  if (error instanceof HttpError || error instanceof GoogleAuthError) return json({ error: error.code, message: error.message }, error.status);
  if (error instanceof SyncValidationError) return json({ error: error.code, message: error.message }, 400);
  return json({ error: 'internal_error', message: 'No se pudo completar la solicitud.' }, 500);
}

function allowedOrigin(origin) {
  return origin === 'https://raulmar0.github.io' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.append('Vary', 'Origin');
  if (origin && allowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(response.body, { status: response.status, headers });
}

function tokenFromRequest(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') ?? '');
  if (!match) throw new HttpError(401, 'unauthorized', 'El enlace compartido no es válido.');
  return match[1];
}

export async function hashToken(token) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function sameHash(left, right) {
  if (typeof left !== 'string' || !HASH.test(left) || typeof right !== 'string' || !HASH.test(right)) return false;
  let difference = 0;
  for (let index = 0; index < 64; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function readJson(request, maximumBytes = MAX_GROUP_BYTES) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') ?? '')) throw new HttpError(415, 'unsupported_media_type', 'Envía los datos como JSON.');
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null && Number(declaredLength) > maximumBytes) throw new HttpError(413, 'payload_too_large', 'La solicitud supera el tamaño permitido.');
  if (!request.body) throw new HttpError(400, 'invalid_json', 'Faltan los datos de la solicitud.');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new HttpError(413, 'payload_too_large', 'La solicitud supera el tamaño permitido.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'invalid_json', 'Los datos JSON no son válidos.'); }
}

/** Durable storage operations are serialized across every await, including auth. */
export class GroupStore {
  #tail = Promise.resolve();

  constructor(storage) { this.storage = storage; }

  fetch(request) {
    const result = this.#tail.then(() => this.#respond(request));
    // Keep serving the group even after an unexpected storage/request failure.
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  async #respond(request) {
    try { return await this.#handle(request); }
    catch (error) { return errorResponse(error); }
  }

  async #handle(request) {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/initialize') {
      // This internal route is never exposed by the public Worker router.
      if (await this.storage.get('record')) throw new HttpError(409, 'already_exists', 'El grupo ya existe.');
      // The public request has already passed the strict 256 KiB cap. Allow
      // the small internal wrapper containing the token hash on top of it.
      const payload = await readJson(request, MAX_GROUP_BYTES + 256);
      const group = canonicalizeGroup(payload?.group);
      if (typeof payload?.tokenHash !== 'string' || !HASH.test(payload.tokenHash)) throw new HttpError(400, 'invalid_token', 'El enlace compartido no es válido.');
      await this.storage.put('record', { group, tokenHash: payload.tokenHash, revision: 1 });
      return json({ group, revision: 1 }, 201);
    }
    const token = tokenFromRequest(request);
    const record = await this.storage.get('record');
    if (!record) throw new HttpError(404, 'not_found', 'No se encontró este grupo.');
    if (!sameHash(record.tokenHash, await hashToken(token))) throw new HttpError(401, 'unauthorized', 'El enlace compartido no es válido.');
    if (request.method === 'GET') return json({ group: record.group, revision: record.revision });
    if (request.method !== 'PATCH') throw new HttpError(404, 'not_found', 'No se encontró esta ruta.');
    const payload = await readJson(request);
    let group;
    try { group = applyChanges(record.group, payload?.changes); }
    catch (error) {
      if (error instanceof SyncConflictError) return json({ error: 'conflict', message: error.message, group: record.group, revision: record.revision }, 409);
      throw error;
    }
    const revision = record.revision + 1;
    await this.storage.put('record', { group, tokenHash: record.tokenHash, revision });
    return json({ group, revision });
  }
}

export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin');
  try {
    if (origin !== null && !allowedOrigin(origin)) throw new HttpError(403, 'origin_forbidden', 'Este origen no está permitido.');
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/health') return withCors(json({ service: 'entre-sync', version: VERSION }), origin);
    if (request.method === 'GET' && path === '/auth/me') return withCors(json(await authenticateGoogleRequest(request, env.GOOGLE_CLIENT_ID)), origin);
    if (path === '/account/groups' || path.startsWith('/account/groups/')) {
      const { user } = await authenticateGoogleRequest(request, env.GOOGLE_CLIENT_ID);
      const forwarded = new Request(request);
      forwarded.headers.delete('Authorization');
      const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(user.id));
      return withCors(await stub.fetch(forwarded), origin);
    }
    if (request.method === 'POST' && path === '/groups') {
      const payload = await readJson(request);
      if (!payload?.group || typeof payload.group !== 'object' || Array.isArray(payload.group)) throw new SyncValidationError();
      const group = canonicalizeGroup({ ...payload.group, id: crypto.randomUUID() });
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
      if (!TOKEN.test(token)) throw new Error('Invalid generated token');
      const tokenHash = await hashToken(token);
      const stub = env.GROUPS.get(env.GROUPS.idFromName(group.id));
      const response = await stub.fetch(new Request('https://internal/initialize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ group, tokenHash }) }));
      if (response.status !== 201) return withCors(response, origin);
      const created = await response.json();
      return withCors(json({ ...created, token }, 201), origin);
    }
    const match = GROUP_PATH.exec(path);
    if (match && ['GET', 'PATCH'].includes(request.method)) {
      tokenFromRequest(request); // Reject malformed authorization before allocating an object.
      const stub = env.GROUPS.get(env.GROUPS.idFromName(match[1]));
      return withCors(await stub.fetch(request), origin);
    }
    throw new HttpError(404, 'not_found', 'No se encontró esta ruta.');
  } catch (error) { return withCors(errorResponse(error), origin); }
}
