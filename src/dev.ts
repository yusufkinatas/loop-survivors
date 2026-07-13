/** Central developer-surface gate.
 *
 * Vite's development server enables the tools automatically. A production
 * build keeps them unreachable unless the build explicitly opts in with
 * VITE_LOOP_DEV_TOOLS=1. The same build-time predicate guards both menu links
 * and direct boots, so a player cannot reveal the suite by guessing a URL.
 */

export type LabRoomId = 'hub' | 'movement' | 'enemies' | 'instruments' | 'systems';
export type LabBootRoom = LabRoomId | 'auto';

const LAB_ROOMS: ReadonlySet<string> = new Set([
  'hub',
  'movement',
  'enemies',
  'instruments',
  'systems',
  'auto',
]);

export function devToolsEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_LOOP_DEV_TOOLS === '1';
}

/** Requested lab boot, from either #lab, ?lab=<room>, or the Vite env
 * shortcut VITE_LOOP_LAB_ROOM=<room>. Query wins so `?lab=off` can escape an
 * env-forced boot. */
export function requestedLabRoom(): LabBootRoom | null {
  const params = new URLSearchParams(location.search);
  const query = params.get('lab');
  if (query === 'off') return null;
  const raw = query ?? import.meta.env.VITE_LOOP_LAB_ROOM;
  if (raw && LAB_ROOMS.has(raw)) return raw as LabBootRoom;
  return location.hash === '#lab' ? 'hub' : null;
}
