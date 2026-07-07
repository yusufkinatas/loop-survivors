// The Tension Cycle arranger (Hype Layer v3, sub-phase A). Spec:
// docs/phases/hype-layer-v3.md.
//
// This is the one place the arrangement TRANSFORMS what a voice plays, instead of
// only filtering one fixed pattern louder/quieter (the v2 failure). Given a voice,
// its base chart, the grid step, and an arrangement context (which section of the
// build->hold->drop->release cycle we're in, plus the tension level), it returns
// the events that voice should actually fire this step. Because fired events are
// the damage stream (Model A), the arrangement and the combat move together.
//
// Sub-phase A scope: the transformation is genre-agnostic (a full-band peak drop
// for all) and driven live by a debug controller, so the developer can judge by ear whether
// the DROP finally sounds DIFFERENT from the groove before aggression/combat (B)
// and per-genre drop moves (C) are wired. All transforms are pure functions of
// (bar, step, section, tension, seed) — deterministic, ready to move onto the
// shared engine+bot path in sub-phase B.

import { chartEventsAtStep } from './arranger';
import type { Chart, ChartEvent } from './charts';
import type { Role } from './kits';
import { slotOf, type Slot } from '../game/band';

/** The cycle sections. GROOVE is the resting/winding state (with a held READY
 *  plateau tracked by the controller); the rest are the committed drop sequence. */
export type Section = 'groove' | 'build' | 'hold' | 'drop' | 'release';

export interface ArrangeCtx {
  section: Section;
  /** 0..1 winding level; in GROOVE it gently intensifies the groove. */
  tension: number;
  /** Bars elapsed within the current section (0-based), for ramps. */
  sectionBar: number;
  /** Absolute bar index, for the deterministic gate hash. */
  bar: number;
  /** Run seed for the gate hash (0 in sub-phase A, live-only). */
  seed: number;
}

/** Committed drop-sequence bar lengths (spec: BUILD 4 -> HOLD 1 -> DROP 8 ->
 *  RELEASE 4). Exported so the controller's state machine and the arranger agree. */
export const BUILD_BARS = 4;
export const HOLD_BARS = 1;
export const DROP_BARS = 8;
export const RELEASE_BARS = 4;

function clampVel(v: number): number {
  return Math.max(0.01, Math.min(1, v));
}

/** Pure integer hash -> 0..1. Deterministic gate for thinning (no RNG). */
function hash01(bar: number, step: number, seed: number): number {
  let h = (Math.imul(bar, 73856093) ^ Math.imul(step, 19349663) ^ Math.imul(seed, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h / 4294967296;
}

/** A representative low note for the voice's drop sub-bass: the lowest note the
 *  chart uses, dropped an octave. Falls back to the root. */
function dropBassNote(chart: Chart): number {
  let lo = 0;
  let found = false;
  for (const ev of chart.events) {
    if (ev.note === undefined) continue;
    if (!found || ev.note < lo) lo = ev.note;
    found = true;
  }
  return lo - 12;
}

/** The one entry point: which events this voice fires this step, transformed for
 *  the current arrangement section. Replaces a bare chartEventsAtStep call. */
export function programEvents(
  role: Role,
  chart: Chart,
  phraseStep: number,
  ctx: ArrangeCtx,
): ChartEvent[] {
  const slot = slotOf(role);
  switch (ctx.section) {
    case 'hold':
      // The floor drops out: near silence, the coiled intake before the slam.
      // (The controller schedules the riser through the engine.) Kick silenced
      // here is a real ~1-bar vulnerability — the cost of the payoff (Model A).
      return [];
    case 'drop':
      return dropEvents(slot, chart, phraseStep);
    case 'build':
      return buildEvents(slot, chartEventsAtStep(chart, phraseStep), phraseStep, ctx);
    case 'release':
      return thin(chartEventsAtStep(chart, phraseStep), ctx, 0.35, 0.85);
    case 'groove':
    default:
      // Resting state: near-full, gently intensifying with tension (velocity +
      // a light thin at low tension) so playing harder audibly heats the track.
      return thin(chartEventsAtStep(chart, phraseStep), ctx, 0.8, 0.85 + 0.15 * ctx.tension);
  }
}

/** Keep events by a deterministic gate at `keepProb`, scaling velocity. Used for
 *  the groove's gentle breathing and the release's thinning. */
function thin(base: ChartEvent[], ctx: ArrangeCtx, minKeep: number, vScale: number): ChartEvent[] {
  const keep = minKeep + (1 - minKeep) * ctx.tension;
  const out: ChartEvent[] = [];
  for (const ev of base) {
    if (hash01(ctx.bar, ev.step, ctx.seed) < keep) out.push({ ...ev, velocity: clampVel(ev.velocity * vScale) });
  }
  return out;
}

/** BUILD: the groove at rising velocity, plus an accelerating tick roll on the
 *  hats so the ear hears the wind-up (the riser is scheduled separately). */
function buildEvents(slot: Slot, base: ChartEvent[], phraseStep: number, ctx: ArrangeCtx): ChartEvent[] {
  const vScale = 1 + 0.12 * ctx.sectionBar;
  const out = base.map((ev) => ({ ...ev, velocity: clampVel(ev.velocity * vScale) }));
  if (slot === 'hats') {
    // Density doubles across the build: emit an extra tick on a widening grid.
    const div = Math.max(1, 4 >> Math.min(2, ctx.sectionBar)); // 4,2,1,1
    if (phraseStep % div === 0 && !out.some((e) => e.step === phraseStep)) {
      out.push({ step: phraseStep, velocity: clampVel(0.4 + 0.15 * ctx.sectionBar) });
    }
  }
  return out;
}

/** DROP: the peak. The whole band plays, at full weight, denser than the groove —
 *  the fullest, most complex section of the run, not a stripped half-time break.
 *  Every voice fires its full chart at max velocity; the low end is thickened by an
 *  added sub an octave down under the bass, and the percussion is filled in so the
 *  groove drives harder. Big AND busy. */
function dropEvents(slot: Slot, chart: Chart, phraseStep: number): ChartEvent[] {
  const base = chartEventsAtStep(chart, phraseStep).map((ev) => ({ ...ev, velocity: 1 }));

  if (slot === 'bass') {
    // The sub arrives WITH the full bassline: keep every note at full weight and
    // stack a sub an octave below the lowest note on each hit for the drop's floor.
    const sub = dropBassNote(chart);
    const out = base.slice();
    for (const ev of base) out.push({ ...ev, note: (ev.note ?? 0) < sub + 12 ? sub : (ev.note ?? 0) - 12, velocity: 1 });
    return out;
  }

  if (slot === 'pulse') {
    // Four-on-the-floor stays full; fill the offbeats so the kick pounds harder.
    const out = base.slice();
    if (phraseStep % 4 === 0 && !out.some((e) => e.step === phraseStep)) {
      out.push({ step: phraseStep, velocity: 1 });
    }
    return out;
  }

  if (slot === 'hats' || slot === 'backbeat') {
    // Densest they get: an extra tick on every sixteenth so the top end shimmers.
    const out = base.slice();
    if (!out.some((e) => e.step === phraseStep)) out.push({ step: phraseStep, velocity: 0.7 });
    return out;
  }

  // Motion, fx, harmony, melody: full chart at full weight — nothing removed.
  return base;
}
