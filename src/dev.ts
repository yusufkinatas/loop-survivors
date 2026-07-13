/** Living Lab route parsing. The hub is public for now: its main-menu entry is
 * always visible and these direct routes work in development and production. */

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
