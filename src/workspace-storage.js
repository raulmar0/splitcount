import { loadState, saveState, validateState } from './domain.js';
import { createInitialState } from './seed.js';
import { isAccountMetadata } from './account-sync.js';

export const accountStorageKey = id => `splitcount-account-v1:${id}`;
export const emptyState = () => ({ version: 1, activeGroupId: null, groups: [] });
const isLocal = group => group._shared === undefined && group._account === undefined;
const validAccountWorkspace = state => validateState(state)
  && (state.accountRevision === undefined || Number.isSafeInteger(state.accountRevision) && state.accountRevision >= 0)
  && state.groups.every(group => isLocal(group) || group._shared && isAccountMetadata(group._account));
export function asGuestWorkspace(state) {
  const { accountRevision, ...guest } = state;
  return { ...guest, groups: guest.groups.map(({ _account, ...group }) => group) };
}

export function loadWorkspace(accountId, storage) {
  if (!accountId) return asGuestWorkspace(loadState(storage) || createInitialState());
  try {
    const data = JSON.parse((storage ?? globalThis.localStorage).getItem(accountStorageKey(accountId)));
    if (validAccountWorkspace(data)) return data;
  } catch { /* An unavailable cache never replaces the remote account. */ }
  return emptyState();
}

export function saveWorkspace(state, accountId, storage) {
  if (!accountId) return saveState(state, storage);
  try {
    if (!validAccountWorkspace(state)) return false;
    (storage ?? globalThis.localStorage).setItem(accountStorageKey(accountId), JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function clearAccountCache(accountId, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const previous = loadWorkspace(accountId, target);
    const groups = previous.groups.filter(isLocal);
    if (!groups.length) target?.removeItem(accountStorageKey(accountId));
    else {
      const activeGroupId = groups.some(group => group.id === previous.activeGroupId) ? previous.activeGroupId : groups[0].id;
      target.setItem(accountStorageKey(accountId), JSON.stringify({ version: 1, activeGroupId, groups }));
    }
  } catch { /* Sign-out must still clear the in-memory workspace. */ }
}
