// The chart store: working copies of every genre's ladder charts, shared by
// the engine (which plays the active genre) and the chart playground (which
// edits it). Object identity is the contract: getChart(role, tier) returns the
// same Chart instance for the active genre, mutated in place, so an edit in the
// playground is heard on the very next pass of the loop with no rewiring.
//
// Genre-aware: the game picks a genre at the start of a run; setActiveGenre
// swaps which working charts getChart/saveChart/etc. resolve to. Persistence
// (plumbing) saves edits to localStorage per genre and re-applies them on load.

import { TIER_COUNT, validateChart, type Chart } from './charts';
import {
  GENRES,
  GENRE_BY_ID,
  DEFAULT_GENRE,
  supportedRoles,
  type Genre,
  type GenreId,
} from './genres';
import { type Role } from './kits';

const storageKey = (genre: GenreId, role: Role, tier: number) =>
  `loop.chart.${genre}.${role}.${tier}`;

// The autoplay bot imports this store under Node, where localStorage does not
// exist: headless runs always play the shipped charts, never local edits.
const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined'
    ? localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function cloneChart(chart: Chart): Chart {
  return { role: chart.role, bars: chart.bars, events: chart.events.map((e) => ({ ...e })) };
}

const working = new Map<string, Chart>();
const edited = new Set<string>();

// An empty stand-in for a (genre, role) the genre does not support: getChart
// stays total, so an unsupported voice that is never enabled reads a silent
// chart instead of crashing. Never mutated; treat as read-only.
const EMPTY_CHART = (role: Role): Chart => ({ role, bars: 1, events: [] });

// Build working copies for every genre's SUPPORTED roles only, overlaying any
// saved edits that still validate. A genre omits the roles it is not optimized
// for; those have no working copy (getChart returns a silent stand-in).
for (const genre of GENRES) {
  for (const role of supportedRoles(genre.id)) {
    for (let tier = 1; tier <= TIER_COUNT; tier++) {
      const key = storageKey(genre.id, role, tier);
      const chart = cloneChart(genre.ladders[role]![tier - 1]);
      const saved = storage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as Chart;
          parsed.role = role;
          validateChart(parsed);
          chart.bars = parsed.bars;
          chart.events = parsed.events;
          edited.add(key);
        } catch {
          storage.removeItem(key); // stale or invalid edit: fall back to shipped
        }
      }
      working.set(key, chart);
    }
  }
}

let active: Genre = GENRE_BY_ID[DEFAULT_GENRE];

/** Switch which genre getChart/saveChart/etc. resolve to. */
export function setActiveGenre(id: GenreId): void {
  active = GENRE_BY_ID[id] ?? active;
}

export function activeGenre(): Genre {
  return active;
}

/** The active genre's tempo, so the headless conductor times its grid to the
 *  same clock the audio engine uses. */
export function activeGenreBpm(): number {
  return active.bpm;
}

/** The live working chart for the active genre's (role, tier). Stable object
 *  identity within a genre. Returns a silent stand-in for a role the active
 *  genre does not support (that voice is never enabled). */
export function getChart(role: Role, tier: number): Chart {
  return working.get(storageKey(active.id, role, tier)) ?? EMPTY_CHART(role);
}

export function isEdited(role: Role, tier: number): boolean {
  return edited.has(storageKey(active.id, role, tier));
}

/** Persist the current state of a chart after mutating it. */
export function saveChart(role: Role, tier: number): void {
  const key = storageKey(active.id, role, tier);
  const chart = working.get(key)!;
  validateChart(chart);
  storage.setItem(key, JSON.stringify({ bars: chart.bars, events: chart.events }));
  edited.add(key);
}

/** Throw away the edit and restore the shipped chart, in place. */
export function resetChart(role: Role, tier: number): void {
  const key = storageKey(active.id, role, tier);
  const chart = working.get(key);
  const shipped = active.ladders[role]?.[tier - 1];
  if (!chart || !shipped) return; // unsupported role: nothing to reset
  chart.bars = shipped.bars;
  chart.events = shipped.events.map((e) => ({ ...e }));
  storage.removeItem(key);
  edited.delete(key);
}

/** JSON of every edited chart, for baking edits back into genres.ts.
 *  Console: copy(loop.charts.exportEdits()) */
export function exportEdits(): string {
  const out: Record<string, { bars: number; events: Chart['events'] }> = {};
  for (const key of edited) {
    const chart = working.get(key)!;
    out[key.replace('loop.chart.', '')] = { bars: chart.bars, events: chart.events };
  }
  return JSON.stringify(out, null, 2);
}
