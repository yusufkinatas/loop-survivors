// Chart types and the coherence-skeleton validator. A chart says, per grid
// step, when a weapon fires, how hard, which sample variant, and (for pitched
// weapons) which note — so a synth chart is a melody and a drum chart is a
// groove.
//
// The actual patterns live in the soundset: a hand-authored four-tier ladder
// per supported weapon (src/audio/soundset.ts, src/audio/ladders/).

import { STEPS_PER_BAR, BARS_PER_PHRASE, inNoteSet } from './scale';
import type { Role } from './kits';

export interface ChartEvent {
  /** Grid step within the chart's loop (16ths, 16 per bar). */
  step: number;
  velocity: number;
  /** Sample variant id; kit default when omitted. */
  variant?: string;
  /** Semitone offset from the root, pitched kits only. */
  note?: number;
}

export interface Chart {
  role: Role;
  bars: number;
  events: ChartEvent[];
}

/** Chart stages per weapon ladder: the hand-authored sound rungs, stage 1 to
 *  stage 4. AUDIO ONLY — a weapon's gameplay ladder has its own length
 *  (WEAPON_MAX_LEVEL, src/game/weapons/levels.ts), and a level reaches a voice
 *  only through chartStageForLevel. */
export const TIER_COUNT = 4;

/** Validate one chart against the coherence skeleton. Used when the soundset's
 *  ladders load and by the chart store for edited charts. */
export function validateChart(chart: Chart): void {
  if (chart.bars < 1 || chart.bars > BARS_PER_PHRASE) {
    throw new Error(`${chart.role} chart: ${chart.bars} bars (must be 1-${BARS_PER_PHRASE})`);
  }
  for (const ev of chart.events) {
    if (ev.step < 0 || ev.step >= chart.bars * STEPS_PER_BAR) {
      throw new Error(`${chart.role} chart: step ${ev.step} is outside its ${chart.bars} bars`);
    }
    if (ev.note === undefined) continue;
    if (!inNoteSet(ev.note)) {
      throw new Error(`${chart.role} chart: note ${ev.note} is outside the note set`);
    }
    if (chart.role === 'chord' && ![0, 5, 7].includes(((ev.note % 12) + 12) % 12)) {
      throw new Error(`chord chart: root shift ${ev.note} would leave the note set`);
    }
  }
}
