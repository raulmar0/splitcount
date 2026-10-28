import { loadState, saveState, validateState } from './domain.js';
import { createInitialState } from './seed.js';
import { isAccountMetadata } from './account-sync.js';

export const accountStorageKey = id => `splitcount-account-v1:${id}`;
export const emptyState = () => ({ version: 1, activeGroupId: null, groups: [] });
export function asGuestWorkspace(state) {
  const { accountRevision, ...guest } = state;
  return { ...guest, groups: guest.groups.map(({ _account, ...group }) => group) };
}

export function loadWorkspace(accountId, storage) {
  if (!accountId) return asGuestWorkspace(loadState(storage) || createInitialState());
  try {
    const data = JSON.parse((storage ?? globalThis.localStorage).getItem(accountStorageKey(accountId)));
    if (validateState(data) && (data.accountRevision === undefined || Number.isSafeInteger(data.accountRevision) && data.accountRevision >= 0)
      && data.groups.every(group => group._shared && isAccountMetadata(group._account))) return data;
  } catch { /* An unavailable cache never replaces the remote account. */ }
  return emptyState();
}

export function saveWorkspace(state, accountId, storage) {
  if (!accountId) return saveState(state, storage);
  try {
    if (!validateState(state) || !state.groups.every(group => group._shared && isAccountMetadata(group._account))) return false;
    (storage ?? globalThis.localStorage).setItem(accountStorageKey(accountId), JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function clearAccountCache(accountId, storage) {
  try { (storage ?? globalThis.localStorage)?.removeItem(accountStorageKey(accountId)); } catch { /* Sign-out must still clear the in-memory workspace. */ }
}
