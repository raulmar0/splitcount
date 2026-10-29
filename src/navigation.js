const screens = new Set(['groups', 'group', 'settings']);
export function resolveRoute(value, groups) {
  const route = value?.buenpar;
  if (!screens.has(route?.screen) || (route.screen === 'group' && !groups.some(group => group.id === route.groupId))) {
    return { screen: 'groups', groupId: null, depth: 0 };
  }
  return { screen: route.screen, groupId: route.screen === 'group' ? route.groupId : null, depth: Number.isSafeInteger(route.depth) && route.depth >= 0 ? route.depth : 0 };
}
export function nextHistoryState(current, screen, groupId = null, replace = false) {
  const depth = Number.isSafeInteger(current?.buenpar?.depth) && current.buenpar.depth >= 0 ? current.buenpar.depth : 0;
  return { ...current, buenpar: { screen, groupId: screen === 'group' ? groupId : null, depth: replace ? depth : depth + 1 } };
}
