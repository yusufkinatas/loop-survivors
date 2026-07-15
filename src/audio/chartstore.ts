// The chart store: working copies of the soundset's ladder charts, shared by
// the engine (which plays them) and the chart playground (which edits them).
// Object identity is the contract: getChart(role, tier) returns the same Chart
// instance, mutated in place, so an edit in the playground is heard on the very
// next pass of the loop with no rewiring.
//
// Persistence (plumbing) saves edits to localStorage and re-applies them on
// load.

import { TIER_COUNT, EVOLVED_TIER, validateChart, type Chart } from './charts';
import { SOUNDSET, supportedRoles } from './soundset';
import { type Role } from './kits';

const storageKey = (role: Role, tier: number) => `loop.chart.${role}.${tier}`;

// Non-browser tools have no localStorage and use the shipped charts.
const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined'
    ? localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function cloneChart(chart: Chart): Chart {
  return { role: chart.role, bars: chart.bars, events: chart.events.map((e) => ({ ...e })) };
}

const working = new Map<string, Chart>();
const edited = new Set<string>();

// An empty stand-in for a role the soundset does not support: getChart stays
// total, so an unsupported voice that is never enabled reads a silent chart
// instead of crashing. Never mutated; treat as read-only.
const EMPTY_CHART = (role: Role): Chart => ({ role, bars: 1, events: [] });

// Build working copies for every SUPPORTED role, overlaying any saved edits
// that still validate. Unsupported roles have no working copy (getChart
// returns a silent stand-in).
for (const role of supportedRoles()) {
  for (let tier = 1; tier <= TIER_COUNT; tier++) {
    const key = storageKey(role, tier);
    const chart = cloneChart(SOUNDSET.ladders[role]![tier - 1]);
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

// Evolved charts get a fifth working copy at EVOLVED_TIER for each role the
// soundset evolves (docs/phases/weapon-evolutions.md). The chart playground
// only edits tiers 1..TIER_COUNT, so evolved charts carry no localStorage
// overlay — the shipped chart is the working copy.
for (const role of supportedRoles()) {
  const evolved = SOUNDSET.evolved[role];
  if (!evolved) continue;
  working.set(storageKey(role, EVOLVED_TIER), cloneChart(evolved));
}

/** The live working chart for a (role, tier). Stable object identity. Returns a
 *  silent stand-in for a role the soundset does not support (never enabled). */
export function getChart(role: Role, tier: number): Chart {
  return working.get(storageKey(role, tier)) ?? EMPTY_CHART(role);
}

export function isEdited(role: Role, tier: number): boolean {
  return edited.has(storageKey(role, tier));
}

/** Persist the current state of a chart after mutating it. */
export function saveChart(role: Role, tier: number): void {
  const key = storageKey(role, tier);
  const chart = working.get(key)!;
  validateChart(chart);
  storage.setItem(key, JSON.stringify({ bars: chart.bars, events: chart.events }));
  edited.add(key);
}

/** Throw away the edit and restore the shipped chart, in place. */
export function resetChart(role: Role, tier: number): void {
  const key = storageKey(role, tier);
  const chart = working.get(key);
  const shipped = SOUNDSET.ladders[role]?.[tier - 1];
  if (!chart || !shipped) return; // unsupported role: nothing to reset
  chart.bars = shipped.bars;
  chart.events = shipped.events.map((e) => ({ ...e }));
  storage.removeItem(key);
  edited.delete(key);
}

/** JSON of every edited chart, for baking edits back into the ladder file.
 *  Console: copy(loop.charts.exportEdits()) */
export function exportEdits(): string {
  const out: Record<string, { bars: number; events: Chart['events'] }> = {};
  for (const key of edited) {
    const chart = working.get(key)!;
    out[key.replace('loop.chart.', '')] = { bars: chart.bars, events: chart.events };
  }
  return JSON.stringify(out, null, 2);
}
