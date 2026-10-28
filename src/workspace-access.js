/** Pending Google accounts keep using this browser's existing guest workspace. */
export function workspaceAccess(auth) {
  const access = auth.access ?? auth.session?.access;
  const pendingApproval = !!auth.account && access?.status === 'pending';
  const accountId = pendingApproval ? undefined : auth.account?.id;
  const canSyncAccount = !!auth.session && access?.status === 'approved';
  return {
    accountId,
    key: accountId ?? 'guest',
    pendingApproval,
    canSyncAccount,
    groupSyncEnabled: !accountId || canSyncAccount,
    // Anonymous capabilities do not depend on the Google session lifetime.
    groupSyncSignal: accountId ? auth.signal : undefined,
  };
}
