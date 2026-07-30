// THE LAYER SWITCHES (#256's rule, generalised from #255's constraint on The
// Call): "every layer in every stack is individually switchable so each gets its
// own verdict." Round 1 must return "patterns as loot holds, tolls fail", not a
// score — which is only possible if the same game can be played with each layer
// off.
//
// Read once at boot from the URL, then persisted. `?route=rooms,shells` sets
// exactly those; `?route=off` plays the base. The panel on the start screen is
// the everyday surface (game.ts mounts it), and the URL is there so a capture or
// a bug report can pin a configuration in a link.

const KEY = 'loop.route.toggles';

export interface RouteToggles {
  /** THE ROOMS. A route of discrete rooms with doors between them, instead of
   *  Mad Forest's one continuous thirty-minute clock. Off: the base's run. */
  rooms: boolean;
  /** THE SHELL. An instrument is a shell with a sound and no notes; patterns are
   *  the loot and a level buys gameplay only. Off: the authored four-rung ladder
   *  decides what every voice plays, exactly as the base does. */
  shells: boolean;
  /** THE TOLL. Every door costs something, and what you feed it comes back
   *  transformed onto something you kept. Off: the doors are free.
   *
   *  Depends on `rooms` — with no gates there is nothing to pay at, and the
   *  panel says so rather than pretending otherwise. */
  toll: boolean;
  /** Role exclusivity: at most one shell per seat (#258's Bandwagon form, one
   *  low anchor / one harmonic body / one bright line...). Off: the base's flat
   *  cap of five, any five. */
  exclusive: boolean;
  /** The Dial: a per-shell live lever between many small hits and few huge ones.
   *  Off: a pattern plays as written. */
  dial: boolean;
}

export const TOGGLE_LABELS: Readonly<Record<keyof RouteToggles, string>> = {
  rooms: 'The Rooms',
  shells: 'The Shell',
  toll: 'The Toll',
  exclusive: 'One per seat',
  dial: 'The Dial',
};

/** The stack as #267 specifies it: the three named layers on, the two A/B
 *  variants off. */
const DEFAULT_TOGGLES: RouteToggles = {
  rooms: true,
  shells: true,
  toll: true,
  exclusive: false,
  dial: false,
};

const NAMES = Object.keys(DEFAULT_TOGGLES) as (keyof RouteToggles)[];

function fromQuery(raw: string): RouteToggles | null {
  const wanted = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (wanted.length === 0) return null;
  if (wanted.length === 1 && (wanted[0] === 'off' || wanted[0] === 'base')) {
    return { rooms: false, shells: false, toll: false, exclusive: false, dial: false };
  }
  if (wanted.length === 1 && wanted[0] === 'all') {
    return { rooms: true, shells: true, toll: true, exclusive: true, dial: true };
  }
  const out = { rooms: false, shells: false, toll: false, exclusive: false, dial: false };
  for (const name of wanted) if (NAMES.includes(name as keyof RouteToggles)) out[name as keyof RouteToggles] = true;
  return out;
}

function load(): RouteToggles {
  const query = new URLSearchParams(location.search).get('route');
  const fromUrl = query === null ? null : fromQuery(query);
  if (fromUrl) return normalize(fromUrl);
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return normalize({ ...DEFAULT_TOGGLES, ...(JSON.parse(saved) as Partial<RouteToggles>) });
  } catch {
    // A corrupt save is not worth a broken boot.
  }
  return { ...DEFAULT_TOGGLES };
}

/** The one dependency between layers, applied in one place: a toll needs a gate
 *  to be paid at. */
function normalize(t: RouteToggles): RouteToggles {
  return { ...t, toll: t.toll && t.rooms };
}

const live: RouteToggles = load();

export function toggles(): Readonly<RouteToggles> {
  return live;
}

/** Flip one layer. Takes effect on the next run — the run shape and the build
 *  model are both decided at run start, and changing either mid-run would leave
 *  a half-converted band on the field. */
export function setToggle(name: keyof RouteToggles, on: boolean): void {
  live[name] = on;
  const fixed = normalize(live);
  for (const key of NAMES) live[key] = fixed[key];
  try {
    localStorage.setItem(KEY, JSON.stringify(live));
  } catch {
    // Private-mode browsers refuse writes; the session still works.
  }
}

/** A short line naming what is on, for the HUD and for a capture's filename. */
export function toggleSummary(): string {
  const on = NAMES.filter((name) => live[name]);
  return on.length === 0 ? 'base' : on.join('+');
}
