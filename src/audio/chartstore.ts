// The chart store: working copies of every ladder chart, shared by the
// engine (which plays them) and the chart playground (which edits them).
// Object identity is the contract: getChart(role, tier) always returns the
// same Chart instance, mutated in place, so an edit in the playground is
// heard on the very next pass of the loop with no rewiring.
//
// Persistence (the spec calls it plumbing): edits are saved to localStorage
// on every change and re-applied on load. `exportEdits()` dumps everything
// as JSON so sculpted charts can be baked back into charts.ts.

import { LADDERS, TIER_COUNT, validateChart, type Chart } from './charts';
import { ROLES, type Role } from './kits';

const storageKey = (role: Role, tier: number) => `loop.chart.${role}.${tier}`;

function cloneChart(chart: Chart): Chart {
  return { role: chart.role, bars: chart.bars, events: chart.events.map((e) => ({ ...e })) };
}

const working = new Map<string, Chart>();
const edited = new Set<string>();

// Build working copies, overlaying any saved edits that still validate.
for (const role of ROLES) {
  for (let tier = 1; tier <= TIER_COUNT; tier++) {
    const key = storageKey(role, tier);
    const chart = cloneChart(LADDERS[role][tier - 1]);
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Chart;
        parsed.role = role;
        validateChart(parsed);
        chart.bars = parsed.bars;
        chart.events = parsed.events;
        edited.add(key);
      } catch {
        localStorage.removeItem(key); // stale or invalid edit: fall back to the shipped chart
      }
    }
    working.set(key, chart);
  }
}

/** The live working chart for a (role, tier). Stable object identity. */
export function getChart(role: Role, tier: number): Chart {
  return working.get(storageKey(role, tier))!;
}

export function isEdited(role: Role, tier: number): boolean {
  return edited.has(storageKey(role, tier));
}

/** Persist the current state of a chart after mutating it. */
export function saveChart(role: Role, tier: number): void {
  const key = storageKey(role, tier);
  const chart = working.get(key)!;
  validateChart(chart);
  localStorage.setItem(key, JSON.stringify({ bars: chart.bars, events: chart.events }));
  edited.add(key);
}

/** Throw away the edit and restore the shipped chart, in place. */
export function resetChart(role: Role, tier: number): void {
  const key = storageKey(role, tier);
  const chart = working.get(key)!;
  const shipped = LADDERS[role][tier - 1];
  chart.bars = shipped.bars;
  chart.events = shipped.events.map((e) => ({ ...e }));
  localStorage.removeItem(key);
  edited.delete(key);
}

/** JSON of every edited chart, for baking edits back into charts.ts.
 *  Console: copy(loop.charts.exportEdits()) */
export function exportEdits(): string {
  const out: Record<string, { bars: number; events: Chart['events'] }> = {};
  for (const key of edited) {
    const chart = working.get(key)!;
    out[key.replace('loop.chart.', '')] = { bars: chart.bars, events: chart.events };
  }
  return JSON.stringify(out, null, 2);
}
