// Exact-count four-bar patterns. The shipped ladders remain the musical source
// material, but runtime Complexity is now a literal number of triggers rather
// than a tier. Events are ranked by the first authored ladder in which their
// step appears; higher ladders enrich the event data without changing rank.

import { SOUNDSET } from './soundset';
import type { Chart, ChartEvent } from './charts';
import type { Role } from './kits';
import { STEPS_PER_BAR, STEPS_PER_PHRASE } from './scale';

const ranked = new Map<Role, ChartEvent[]>();
const cache = new Map<string, Chart>();

function rankedEvents(role: Role): ChartEvent[] {
  const found = ranked.get(role);
  if (found) return found;
  const order: number[] = [];
  const byStep = new Map<number, ChartEvent>();
  for (const chart of SOUNDSET.ladders[role] ?? []) {
    const loop = chart.bars * STEPS_PER_BAR;
    for (let base = 0; base < STEPS_PER_PHRASE; base += loop) {
      for (const event of chart.events) {
        const step = base + event.step;
        if (!byStep.has(step)) order.push(step);
        // Keep the richest authored version of a ranked position.
        byStep.set(step, { ...event, step });
      }
    }
  }
  const events = order.map((step) => byStep.get(step)!).slice(0, maxAuthoredHits(role));
  ranked.set(role, events);
  return events;
}

function maxAuthoredHits(role: Role): number {
  return Math.max(
    1,
    ...(SOUNDSET.ladders[role] ?? []).map(
      (chart) => chart.events.length * (STEPS_PER_PHRASE / (chart.bars * STEPS_PER_BAR)),
    ),
  );
}

export function complexityCap(role: Role): number {
  return rankedEvents(role).length;
}

export function complexityRedline(role: Role): number {
  return Math.max(1, Math.ceil(complexityCap(role) * 0.8));
}

export function getComplexityChart(role: Role, hits: number): Chart {
  const count = Math.max(0, Math.min(complexityCap(role), Math.floor(hits)));
  const key = `${role}:${count}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const chart: Chart = {
    role,
    bars: 4,
    events: rankedEvents(role)
      .slice(0, count)
      .map((event) => ({ ...event }))
      .sort((a, b) => a.step - b.step),
  };
  if (chart.events.length !== count) throw new Error(`${role} complexity ${count} is not exact`);
  cache.set(key, chart);
  return chart;
}
