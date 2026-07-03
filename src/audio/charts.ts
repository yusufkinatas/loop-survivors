// Charts: when each kit triggers, which variant, how hard, and (for pitched
// kits) which note as a semitone offset from the root. One chart per kit in
// M1, hardcoded but structured as data (docs/phases/m1-demo.md). These are
// AI-drafted and live or die by the developer's ear in the rehearsal room.

import { STEPS_PER_BAR, inNoteSet } from './scale';
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

const N = (bar: number, step: number) => bar * STEPS_PER_BAR + step;

export const CHARTS: Record<Role, Chart> = {
  // Downbeat pulse. Two-bar loop with a pickup into the repeat.
  kick: {
    role: 'kick',
    bars: 2,
    events: [
      { step: N(0, 0), velocity: 1.0, variant: 'hard' },
      { step: N(0, 8), velocity: 0.9, variant: 'hard' },
      { step: N(1, 0), velocity: 1.0, variant: 'hard' },
      { step: N(1, 8), velocity: 0.9, variant: 'hard' },
      { step: N(1, 14), velocity: 0.6, variant: 'soft' },
    ],
  },

  // Backbeat on 2 and 4 (the "clap along" beats). Gate feedback: the clap
  // variant sounded wrong, so the chart never switches away from the snare.
  snare: {
    role: 'snare',
    bars: 2,
    events: [
      { step: N(0, 4), velocity: 0.9, variant: 'snare' },
      { step: N(0, 12), velocity: 1.0, variant: 'snare' },
      { step: N(1, 4), velocity: 0.9, variant: 'snare' },
      { step: N(1, 12), velocity: 1.0, variant: 'snare' },
    ],
  },

  // Dense stream: 8ths with ghost 16ths, open hat on the "and" of 4.
  hat: {
    role: 'hat',
    bars: 1,
    events: [
      { step: 0, velocity: 0.9, variant: 'closed' },
      { step: 2, velocity: 0.55, variant: 'closed' },
      { step: 3, velocity: 0.3, variant: 'closed' },
      { step: 4, velocity: 0.8, variant: 'closed' },
      { step: 6, velocity: 0.55, variant: 'closed' },
      { step: 8, velocity: 0.9, variant: 'closed' },
      { step: 10, velocity: 0.55, variant: 'closed' },
      { step: 11, velocity: 0.3, variant: 'closed' },
      { step: 12, velocity: 0.8, variant: 'closed' },
      { step: 14, velocity: 0.7, variant: 'open' },
    ],
  },

  // Slow low wave: sparse two-bar line, root-heavy.
  bass: {
    role: 'bass',
    bars: 2,
    events: [
      { step: N(0, 0), velocity: 1.0, note: 0 },
      { step: N(0, 12), velocity: 0.7, note: 0 },
      { step: N(1, 0), velocity: 0.9, note: -2 }, // G below the root
      { step: N(1, 8), velocity: 0.8, note: -5 }, // E below the root
      { step: N(1, 14), velocity: 0.6, note: 0 },
    ],
  },

  // Quartal stabs. Allowed chord roots are 0, +5, +7 only: the voicing stays
  // inside the pentatonic note set at exactly those shifts (see kits.ts).
  chord: {
    role: 'chord',
    bars: 2,
    events: [
      { step: N(0, 4), velocity: 0.8, variant: 'stab', note: 0 },
      { step: N(0, 12), velocity: 0.7, variant: 'stab', note: 0 },
      { step: N(1, 4), velocity: 0.8, variant: 'stab', note: 5 },
      { step: N(1, 11), velocity: 0.6, variant: 'stab', note: 7 },
      { step: N(1, 14), velocity: 0.5, variant: 'stab', note: 5 },
    ],
  },

  // The melody: four bars, pentatonic, question in bars 1-2, answer in 3-4.
  lead: {
    role: 'lead',
    bars: 4,
    events: [
      { step: N(0, 0), velocity: 0.9, note: 0 },
      { step: N(0, 4), velocity: 0.7, note: 3 },
      { step: N(0, 6), velocity: 0.7, note: 5 },
      { step: N(0, 8), velocity: 0.8, note: 7 },
      { step: N(0, 14), velocity: 0.6, note: 5 },
      { step: N(1, 0), velocity: 0.8, note: 3 },
      { step: N(1, 6), velocity: 0.7, note: 0 },
      { step: N(1, 8), velocity: 0.7, note: -2 },
      { step: N(2, 0), velocity: 0.9, note: 0 },
      { step: N(2, 4), velocity: 0.7, note: 3 },
      { step: N(2, 6), velocity: 0.7, note: 5 },
      { step: N(2, 8), velocity: 0.8, note: 10 },
      { step: N(2, 12), velocity: 0.8, note: 12 },
      { step: N(3, 0), velocity: 0.8, note: 7 },
      { step: N(3, 6), velocity: 0.7, note: 5 },
      { step: N(3, 8), velocity: 0.7, note: 3 },
      { step: N(3, 12), velocity: 0.9, note: 0 },
    ],
  },
};

// Guard the coherence skeleton: a chart note outside the note set is a build
// error, not a runtime surprise. Chord roots additionally stay in {0, 5, 7}.
for (const chart of Object.values(CHARTS)) {
  for (const ev of chart.events) {
    if (ev.note === undefined) continue;
    if (!inNoteSet(ev.note)) {
      throw new Error(`${chart.role} chart: note ${ev.note} is outside the note set`);
    }
    if (chart.role === 'chord' && ![0, 5, 7].includes(((ev.note % 12) + 12) % 12)) {
      throw new Error(`chord chart: root shift ${ev.note} would leave the note set`);
    }
  }
}
