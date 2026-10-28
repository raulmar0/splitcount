export function normalizeMembers(members) {
  if (members.length < 2 || members.some(member => !member.name.trim())) return null;
  const cleaned = members.map(member => ({ ...member, name: member.name.trim() }));
  if (new Set(cleaned.map(member => member.name.toLocaleLowerCase('es-MX'))).size !== cleaned.length) return null;
  return cleaned;
}
