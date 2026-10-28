export const GUEST_SHARED_GROUP_LIMIT = 1;
export const ACCOUNT_SHARED_GROUP_LIMIT = 6;

export const sharedGroupLimit = signedIn => signedIn ? ACCOUNT_SHARED_GROUP_LIMIT : GUEST_SHARED_GROUP_LIMIT;
export const countSharedGroups = groups => new Set(groups.filter(group => group._shared).map(group => group._shared.id)).size;
export const sharedCreationId = (groups, localId) => groups.find(group => group._shared
  && group._account?.sourceId === `create:${localId}`)?._shared.id ?? localId;
export const sharedGroupLimitMessage = signedIn => signedIn
  ? 'Tu cuenta admite hasta 6 grupos compartidos. Sal de uno para añadir otro. Puedes seguir creando grupos locales sin límite.'
  : 'Puedes tener 1 grupo compartido en este navegador. Una cuenta de Google aprobada permite hasta 6. Los grupos locales son ilimitados.';

// Existing workspaces above the limit remain readable and editable; only growth is blocked.
export function assertSharedGroupCapacity(groups, incomingIds = [], signedIn = false) {
  const existing = new Set(groups.filter(group => group._shared).map(group => group._shared.id));
  const combined = new Set([...existing, ...incomingIds]);
  if (combined.size > sharedGroupLimit(signedIn) && combined.size > existing.size) {
    const error = new Error(sharedGroupLimitMessage(signedIn));
    error.code = 'shared_group_limit';
    throw error;
  }
}
