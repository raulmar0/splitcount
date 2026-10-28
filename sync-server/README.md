# Entre shared groups

This Cloudflare Worker keeps one SQLite-backed Durable Object per group and one private directory per Google account. The React app remains static on GitHub Pages. Google authentication recovers account references; possession of a group's secret link still permits reading and editing it. There is no stored Google token, duplicated account ledger, or public group directory.

## Local development

Use Node.js 22.18 or newer. Dependencies are separate from the frontend:

```sh
cd sync-server
npm ci
npm test
npm run dev
```

The API listens on `http://127.0.0.1:8787`. Set `ENTRE_SYNC_PORT` to use another port. Vite's CORS middleware is disabled so the Worker enforces the same origin rules locally. Local Durable Object storage survives server restarts under the ignored Cloudflare local-state directory.

## Build and deploy

The project uses the Cloudflare `cf` CLI and `cloudflare.config.ts`. It does not use Wrangler configuration. The account ID and Worker name are explicit so it cannot silently replace the unrelated Pizarra service.

```sh
cd sync-server
npm run build
# After review and authorization to deploy:
npm run deploy
```

The deployed API origin is `https://entre-sync.raulhdz40.workers.dev`. The first deployment creates the `GroupLedger` SQLite Durable Object namespace through the config's exports declaration. Cloudflare authentication must already exist on the machine; no API secret is embedded in the repository. Build artifacts and local state are ignored.

Deployment verified on 2026-10-27: Cloudflare version `5e286e15-6235-4168-b0dc-5e5522c6ac40`, API version `1.0.0`. Production smoke checks exercised health, a synthetic create near the 256 KiB body cap, authenticated reads and patches, concurrent independent expense inserts, idempotent retry, conflict responses and CORS. Synthetic histories were cleared afterward.

If authenticated reads/writes fail or concurrent expenses disappear, restore a reviewed working backend snapshot, run `npm ci`, and redeploy. Preserve the Worker name, `GroupLedger` export and `GROUPS` binding so existing stored groups remain available; do not delete/recreate the namespace as part of a code rollback.

Account synchronization adds the SQLite `AccountDirectory` export and `ACCOUNTS` binding; it does not rename or migrate `GroupLedger`. Deploy this backend before publishing the new frontend. After the first account deployment, preserve **both** Durable Object exports and bindings in rollbacks, even if account UI is temporarily disabled. No account namespace migration has been deployed merely by building this checkout.

Official configuration documentation: <https://developers.cloudflare.com/cf/projects/cloudflare-config/>.

## HTTP API

Every response is JSON, except empty OPTIONS responses, and sends `Cache-Control: no-store`. A browser origin must be exactly `https://raulmar0.github.io`, or HTTP/HTTPS localhost or `127.0.0.1` with an optional port. Requests without an Origin header are accepted with the same authorization rules. Allowed CORS headers are Content-Type and Authorization; supported methods are GET, POST, PATCH, DELETE and OPTIONS.

- `GET /health`: `{ "service": "entre-sync", "version": "1.0.0" }`.
- `GET /auth/me`, `Authorization: Bearer <Google ID token>`: verifies Google's RS256 signature with cached, rotating public JWKS, issuer, the configured client audience, issue time, expiry, stable subject and verified email. Returns `{ "user": { "id": sub, "name": name, "email": email }, "expiresAt": milliseconds }`. Invalid credentials return 401; missing configuration or unavailable Google verification returns 503. This route does not allocate group storage, persist tokens or issue session cookies.
- `POST /groups`, JSON `{ "group": group }`: creates a new UUID identity and returns HTTP 201 `{ "group": canonicalGroup, "revision": 1, "token": secret }`. Local group IDs are replaced. The random secret is 32 bytes encoded as 43 base64url characters. Only its SHA-256 hash is persisted.
- `GET /groups/:uuid`, `Authorization: Bearer <secret>`: returns `{ "group": group, "revision": number }`.
- `PATCH /groups/:uuid`, same authorization, JSON `{ "changes": [...] }`: atomically validates, merges and persists changes; returns `{ "group": group, "revision": number }`. Each accepted patch increments the revision, including safe retries.

Missing or incorrect authorization returns 401. Unknown valid UUIDs return 404. A conflict returns HTTP 409 `{ "error": "conflict", "message": "…", "group": latestGroup, "revision": latestRevision }`. Validation returns 400, oversized requests 413, unsupported content types 415, and disallowed browser origins 403. Other errors use `{ "error": code, "message": safeMessage }`; internal errors reveal no storage details.

There is no public list, lookup by name, initialization or ledger deletion endpoint.

## Private account directory

All `/account/groups` requests use `Authorization: Bearer <Google ID token>`. The Worker validates it for every request and derives the directory namespace exclusively from the signed `sub`, not from request data. It strips this header before forwarding to the internal Durable Object. The directory stores private group capabilities and the selected member identity so another authenticated device can recover them. Group storage retains only each capability's hash; recoverable keys in the directory are protected by Google authentication and Cloudflare storage, not by end-to-end encryption.

- `GET /account/groups`: `{ revision, groups: [{ id, token, selfId, version, sourceId }] }`, containing only active references.
- `POST /account/groups`: `{ sourceId, group, selfId }` creates a ledger, or `{ sourceId, id, token, selfId }` associates an existing one after verifying the key. Returns `{ entry, envelope: { group, revision }, revision }`. `selfId` is null or an existing member ID. An active association preserves its current identity.
- `PATCH /account/groups/:uuid`: `{ selfId, version }` updates the account's selected member with compare-and-swap; returns `{ entry, revision }`.
- `DELETE /account/groups/:uuid`: `{ version }` removes only this account's reference, not the ledger or other accounts' access; returns `{ revision }`.

`sourceId` is a stable operation ID of up to 160 characters. The directory persists a create reservation (random UUID/key, original snapshot and fingerprint) before touching a ledger, allowing retries across interruption or a lost response. Finalized reservations retain only their fingerprint/reference. A changed initial payload returns `409 operation_conflict`, never an overwrite. A source ID that has been removed returns `410 group_removed`; explicit rejoining requires a fresh source ID.

Identity/removal conflicts return `409 account_conflict` with authoritative `{ entry, revision }`; `entry: null` means the reference was removed. Versions remain monotonic across removal and rejoin, fencing old deletion attempts. Account writes are serialized across storage and ledger awaits. An identical accepted operation can be retried without duplicating groups.

Limits: 100 active/reserved groups, 1,000 lifetime operation records/tombstones, 1 MiB of directory state, 256 KiB + 1 KiB per streamed create/link request and 1 KiB per identity/removal request. Exhaustion returns `account_limit` rather than evicting tombstones and allowing stale resurrection. Increasing these limits requires a reviewed storage strategy; no automatic tombstone compaction is implemented.

The client requests a bounded directory and fetches its ledgers with at most four concurrent reads. It replaces the cached account list only after full validated recovery, rejects stale revisions, pauses list replacement while forms are open, and aborts session-bound requests on logout/expiry. Guest and account caches are separate. Google credentials remain memory-only; there are no refresh tokens or persistent server sessions.
## Google configuration

`cloudflare.config.ts` declares `GOOGLE_CLIENT_ID` as a public text binding using `src/google-config.js` from the parent app. The OAuth client secret and downloaded credential JSON are not needed by this popup/ID-token flow. Do not deploy them as static assets or commit them. `jose` is the Worker's JWT verification dependency; install this project's dependencies before running the root test suite as well.

The browser sends the credential in an explicit Authorization header with cookies omitted. Existing origin validation and preflight rules apply to `/auth/me` and the account routes; profiles and errors use `Cache-Control: no-store`. Google identity tokens cannot replace the invitation capability on `/groups/:uuid`. Account recovery does not add member roles or revoke existing invitation keys.

## Changes and concurrency

The frontend and Worker import `src/sync-protocol.js` from the parent app. `diffGroups(before, after)` returns changes of this form:

```js
{
  collection: 'expenses', // also 'settlements' or 'members'
  id: 'stable-entity-id',
  before: oldEntity,      // null for insert
  after: newEntity,       // null for delete
}
```

Group details use `{ collection: 'details', before: { name, emoji, currency, description }, after: { name, emoji, currency, description } }` without an entity ID. Identity and device metadata never become changes.

`applyChanges(current, changes)` returns an independent canonical group. It applies a change if the current entity equals `before`, accepts an already-matching `after` as an idempotent retry, and throws `SyncConflictError` (`code: 'conflict'`) otherwise. Object-key order is irrelevant; array order inside an entity is meaningful. Distinct new expenses from the same base both survive. Conflicting batches never partially persist. Invalid changes throw `SyncValidationError` (`code: 'invalid_changes'` or `'invalid_group'`). Each Durable Object serializes reads, authorization and writes across asynchronous operations.

The service reuses the app's `validateState` for splits, cents, dates, references and unique IDs. Shared groups additionally allow at most 100 members, 2,000 expenses and 2,000 repayments; IDs are at most 128 characters, names 160, expense titles 240, emoji 32, and descriptions/notes 4,000. Both streamed request bodies and complete canonical groups are capped at 256 KiB. Currency cannot change when the current group has expense or repayment history, including a patch that deletes that history. Canonical storage strips all unrecognized group/member/expense/repayment fields.

Clients should poll the authenticated GET endpoint every three seconds while a shared group is active. Keep the bearer token in the URL fragment and local device metadata so the web host does not receive it. Anyone with the link can edit; sharing that link grants group access.

## Verification

`npm test` exercises the real service over a small in-memory substitute for Cloudflare storage and namespace bindings: token hashing and access checks, strict CORS, streamed byte limits, durable recreation, concurrent patches, retries, safe failures, and atomic conflicts/validation. `npm run build` verifies the Worker and shared protocol bundle together.
