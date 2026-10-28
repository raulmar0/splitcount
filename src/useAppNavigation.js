import { useCallback, useEffect, useRef, useState } from 'react';
import { nextHistoryState, resolveRoute } from './navigation.js';

export default function useAppNavigation({ state, setState, onPop }) {
  const current = useRef(state);
  current.current = state;
  const onPopRef = useRef(onPop);
  onPopRef.current = onPop;
  const [screen, setScreen] = useState(() => resolveRoute(globalThis.history?.state, state.groups).screen);
  const positions = useRef({});
  const screenRef = useRef(screen);
  screenRef.current = screen;
  useEffect(() => {
    const restored = resolveRoute(globalThis.history?.state, current.current.groups);
    if(restored.groupId && restored.groupId !== current.current.activeGroupId) setState(previous => ({...previous,activeGroupId:restored.groupId}));
    if (!globalThis.history?.state?.buenpar) {
      globalThis.history?.replaceState({ ...globalThis.history.state, buenpar: { screen: 'groups', groupId: null, depth: 0 } }, '', globalThis.location?.href);
    }
    const pop = event => {
      if (onPopRef.current?.(event) === false) return;
      const route = resolveRoute(event.state, current.current.groups);
      setScreen(route.screen);
      if (route.groupId) setState(previous => ({ ...previous, activeGroupId: route.groupId }));
      globalThis.requestAnimationFrame?.(() => globalThis.scrollTo?.(0, positions.current[route.screen] || 0));
    };
    globalThis.addEventListener?.('popstate', pop);
    return () => globalThis.removeEventListener?.('popstate', pop);
  }, [setState]);
  const change = useCallback((nextScreen, groupId, replace) => {
    positions.current[screenRef.current] = globalThis.scrollY || 0;
    const historyState = nextHistoryState(globalThis.history?.state, nextScreen, groupId, replace);
    const path = `${globalThis.location?.pathname || '/'}${globalThis.location?.search || ''}`;
    globalThis.history?.[replace ? 'replaceState' : 'pushState'](historyState, '', path);
    if (groupId) setState(previous => ({ ...previous, activeGroupId: groupId }));
    setScreen(nextScreen);
    globalThis.requestAnimationFrame?.(() => globalThis.scrollTo?.(0, nextScreen === 'groups' ? positions.current.groups || 0 : 0));
  }, [setState]);
  const navigate = useCallback((nextScreen, options = {}) => change(nextScreen, null, options.replace || false), [change]);
  const openGroup = useCallback((id, options = {}) => change('group', id, options.replace || false), [change]);
  const goBack = useCallback(() => {
    if ((globalThis.history?.state?.buenpar?.depth || 0) > 0) globalThis.history.back();
    else change('groups', null, true);
  }, [change]);
  return { screen, navigate, openGroup, goBack };
}
