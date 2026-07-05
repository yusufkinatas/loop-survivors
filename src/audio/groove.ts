// A tiny pattern language so a genre's twelve four-tier ladders stay short and
// legible. Drums are written as 16-character-per-bar strings; pitched voices
// are written as note tuples. Both compile to plain Charts and are validated
// like any other chart when the genre loads.

import type { Chart, ChartEvent } from './charts';
import type { Role } from './kits';
import { STEPS_PER_BAR } from './scale';

/** One 16th step of a bar; the length of a one-bar drum string. */
export const B = STEPS_PER_BAR;

// Drum-string velocity legend:
//   '.' rest   '-' ghost (0.30)   'o' soft (0.55)   'x' hit (0.80)
//   'X' accent (1.00)   'O' open hat / accented alt-variant (0.70)
const VEL: Record<string, number | undefined> = {
  '.': undefined,
  ' ': undefined,
  '-': 0.3,
  o: 0.55,
  x: 0.8,
  X: 1.0,
  O: 0.7,
};

/** Which sample variant a drum hit uses, by role and character. Only hat and
 *  kick carry two variants; everything else uses the kit default. */
function drumVariant(role: Role, char: string): string | undefined {
  if (role === 'hat') return char === 'O' ? 'open' : 'closed';
  if (role === 'kick') return char === '-' ? 'soft' : 'hard';
  return undefined;
}

/** Build a drum chart from one 16-char string per bar. */
export function d(role: Role, ...bars: string[]): Chart {
  const events: ChartEvent[] = [];
  bars.forEach((pat, bar) => {
    for (let s = 0; s < B; s++) {
      const c = pat[s] ?? '.';
      const v = VEL[c];
      if (v === undefined) continue;
      events.push({ step: bar * B + s, velocity: v, variant: drumVariant(role, c) });
    }
  });
  return { role, bars: Math.max(1, bars.length), events };
}

/** A pitched hit: [step, velocity, note?, variant?]. note defaults to the
 *  root (0), variant to the kit default. Step is absolute across all bars. */
export type Hit = [step: number, vel: number, note?: number, variant?: string];

/** Build a pitched (melodic) chart from note tuples. */
export function m(role: Role, bars: number, hits: Hit[]): Chart {
  return {
    role,
    bars,
    events: hits.map(([step, vel, note, variant]) => ({
      step,
      velocity: vel,
      note: note ?? 0,
      variant,
    })),
  };
}

/** A full four-tier ladder for one role. */
export type Ladder = [Chart, Chart, Chart, Chart];
