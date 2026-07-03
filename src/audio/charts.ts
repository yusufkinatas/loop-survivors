// Tier ladders (M2): four charts per weapon, tier 1 sparse to tier 4 dense
// and rich. Density is the spine (more hits per bar = more damage triggers);
// richness lands at designed tiers so six dense weapons never stack into
// mush. Ladder character is per weapon: hat leans density, lead leans
// richness, bass leans weight with a designed tier-4 peak (the sub drop).
// M1's charts are recycled as ladder material (see M1_TIER below).
//
// These are AI drafts. They live or die by the developer's ear: every
// tier-up must be audibly different from the tier below, and the chart
// playground in the rehearsal room is where they get sculpted.

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

export const TIER_COUNT = 4;

const N = (bar: number, step: number) => bar * STEPS_PER_BAR + step;

/** Where each M1 chart sits in its ladder. The engine defaults every voice
 *  to this tier so the M1 game keeps sounding and hitting exactly as it did
 *  until sub-phase B wires real tiers into the run. */
export const M1_TIER: Record<Role, number> = {
  kick: 2,
  snare: 2,
  hat: 3,
  bass: 2,
  chord: 2,
  lead: 3,
};

// Hat tier 4 is a full 16th grid; written as a loop, not 64 hand lines.
// Accents on the beats, ghosts between, open hats marking the phrase.
function hatTier4Events(): ChartEvent[] {
  const events: ChartEvent[] = [];
  for (let bar = 0; bar < BARS_PER_PHRASE; bar++) {
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      if (s === 14 || (bar === 3 && s === 6)) continue; // open hats own these slots
      const onBeat = s % 4 === 0;
      const onEighth = s % 2 === 0;
      events.push({
        step: N(bar, s),
        velocity: onBeat ? 0.9 : onEighth ? 0.55 : 0.3,
        variant: 'closed',
      });
    }
    events.push({ step: N(bar, 14), velocity: 0.7, variant: 'open' });
  }
  // bar-4 lift: an extra open hat pulling into the next phrase
  events.push({ step: N(3, 6), velocity: 0.65, variant: 'open' });
  return events;
}

/** LADDERS[role][t] is tier t+1. Tier 1 = first pick, tier 4 = maxed. */
export const LADDERS: Record<Role, Chart[]> = {
  kick: [
    // I: a bare pulse, two hits a bar. The lone-instrument opening.
    {
      role: 'kick',
      bars: 1,
      events: [
        { step: 0, velocity: 1.0, variant: 'hard' },
        { step: 8, velocity: 0.9, variant: 'hard' },
      ],
    },
    // II: the M1 chart — downbeat pulse with a pickup into the repeat.
    {
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
    // III: a kick on every beat — the floor starts driving.
    {
      role: 'kick',
      bars: 2,
      events: [
        { step: N(0, 0), velocity: 1.0, variant: 'hard' },
        { step: N(0, 4), velocity: 0.8, variant: 'hard' },
        { step: N(0, 8), velocity: 0.95, variant: 'hard' },
        { step: N(0, 12), velocity: 0.8, variant: 'hard' },
        { step: N(1, 0), velocity: 1.0, variant: 'hard' },
        { step: N(1, 4), velocity: 0.8, variant: 'hard' },
        { step: N(1, 8), velocity: 0.95, variant: 'hard' },
        { step: N(1, 12), velocity: 0.8, variant: 'hard' },
        { step: N(1, 14), velocity: 0.55, variant: 'soft' },
      ],
    },
    // IV: every beat plus soft push-offs, and a doubled-kick fill closing
    // bar 4 — the once-per-phrase personality hit.
    {
      role: 'kick',
      bars: 4,
      events: [
        { step: N(0, 0), velocity: 1.0, variant: 'hard' },
        { step: N(0, 4), velocity: 0.8, variant: 'hard' },
        { step: N(0, 6), velocity: 0.45, variant: 'soft' },
        { step: N(0, 8), velocity: 0.95, variant: 'hard' },
        { step: N(0, 12), velocity: 0.8, variant: 'hard' },
        { step: N(1, 0), velocity: 1.0, variant: 'hard' },
        { step: N(1, 4), velocity: 0.8, variant: 'hard' },
        { step: N(1, 6), velocity: 0.45, variant: 'soft' },
        { step: N(1, 8), velocity: 0.95, variant: 'hard' },
        { step: N(1, 12), velocity: 0.8, variant: 'hard' },
        { step: N(2, 0), velocity: 1.0, variant: 'hard' },
        { step: N(2, 4), velocity: 0.8, variant: 'hard' },
        { step: N(2, 6), velocity: 0.45, variant: 'soft' },
        { step: N(2, 8), velocity: 0.95, variant: 'hard' },
        { step: N(2, 12), velocity: 0.8, variant: 'hard' },
        { step: N(3, 0), velocity: 1.0, variant: 'hard' },
        { step: N(3, 4), velocity: 0.8, variant: 'hard' },
        { step: N(3, 8), velocity: 0.95, variant: 'hard' },
        { step: N(3, 12), velocity: 0.85, variant: 'hard' },
        { step: N(3, 14), velocity: 1.0, variant: 'hard' },
      ],
    },
  ],

  snare: [
    // I: one crack per bar, on beat 3. Half-time feel.
    {
      role: 'snare',
      bars: 1,
      events: [{ step: 8, velocity: 1.0, variant: 'snare' }],
    },
    // II: the M1 backbeat on 2 and 4 (the "clap along" beats). Gate feedback:
    // the clap variant sounded wrong, so the chart never switches away.
    {
      role: 'snare',
      bars: 2,
      events: [
        { step: N(0, 4), velocity: 0.9, variant: 'snare' },
        { step: N(0, 12), velocity: 1.0, variant: 'snare' },
        { step: N(1, 4), velocity: 0.9, variant: 'snare' },
        { step: N(1, 12), velocity: 1.0, variant: 'snare' },
      ],
    },
    // III: backbeat plus ghost hits — quiet in-between taps that make the
    // beat feel played rather than programmed.
    {
      role: 'snare',
      bars: 2,
      events: [
        { step: N(0, 4), velocity: 0.9, variant: 'snare' },
        { step: N(0, 10), velocity: 0.3, variant: 'snare' },
        { step: N(0, 12), velocity: 1.0, variant: 'snare' },
        { step: N(1, 4), velocity: 0.9, variant: 'snare' },
        { step: N(1, 7), velocity: 0.3, variant: 'snare' },
        { step: N(1, 12), velocity: 1.0, variant: 'snare' },
        { step: N(1, 15), velocity: 0.35, variant: 'snare' },
      ],
    },
    // IV: tier III across the phrase, closing with a rising four-hit roll in
    // bar 4 that tips into the next phrase — the once-per-phrase fill.
    {
      role: 'snare',
      bars: 4,
      events: [
        { step: N(0, 4), velocity: 0.9, variant: 'snare' },
        { step: N(0, 10), velocity: 0.3, variant: 'snare' },
        { step: N(0, 12), velocity: 1.0, variant: 'snare' },
        { step: N(1, 4), velocity: 0.9, variant: 'snare' },
        { step: N(1, 7), velocity: 0.3, variant: 'snare' },
        { step: N(1, 12), velocity: 1.0, variant: 'snare' },
        { step: N(2, 4), velocity: 0.9, variant: 'snare' },
        { step: N(2, 10), velocity: 0.3, variant: 'snare' },
        { step: N(2, 12), velocity: 1.0, variant: 'snare' },
        { step: N(3, 4), velocity: 0.9, variant: 'snare' },
        { step: N(3, 12), velocity: 0.5, variant: 'snare' },
        { step: N(3, 13), velocity: 0.6, variant: 'snare' },
        { step: N(3, 14), velocity: 0.8, variant: 'snare' },
        { step: N(3, 15), velocity: 1.0, variant: 'snare' },
      ],
    },
  ],

  hat: [
    // I: offbeat ticks only — air between every hit.
    {
      role: 'hat',
      bars: 1,
      events: [
        { step: 2, velocity: 0.6, variant: 'closed' },
        { step: 6, velocity: 0.55, variant: 'closed' },
        { step: 10, velocity: 0.6, variant: 'closed' },
        { step: 14, velocity: 0.55, variant: 'closed' },
      ],
    },
    // II: straight 8ths, accented on the beats.
    {
      role: 'hat',
      bars: 1,
      events: [
        { step: 0, velocity: 0.85, variant: 'closed' },
        { step: 2, velocity: 0.5, variant: 'closed' },
        { step: 4, velocity: 0.8, variant: 'closed' },
        { step: 6, velocity: 0.5, variant: 'closed' },
        { step: 8, velocity: 0.85, variant: 'closed' },
        { step: 10, velocity: 0.5, variant: 'closed' },
        { step: 12, velocity: 0.8, variant: 'closed' },
        { step: 14, velocity: 0.5, variant: 'closed' },
      ],
    },
    // III: the M1 chart — 8ths with ghost 16ths, open hat on the "and" of 4.
    {
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
    // IV: the full 16th grid across the phrase — maximum density, the hat
    // ladder's whole character — with open hats marking the cycle.
    {
      role: 'hat',
      bars: 4,
      events: hatTier4Events(),
    },
  ],

  bass: [
    // I: the root, once a bar. Weight without motion.
    {
      role: 'bass',
      bars: 2,
      events: [
        { step: N(0, 0), velocity: 1.0, note: 0 },
        { step: N(1, 0), velocity: 0.9, note: 0 },
      ],
    },
    // II: the M1 chart — sparse two-bar line, root-heavy.
    {
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
    // III: barely more hits, every one fatter — the weight ladder. Same M1
    // line on the "fat" variant plus one extra push.
    {
      role: 'bass',
      bars: 2,
      events: [
        { step: N(0, 0), velocity: 1.0, variant: 'fat', note: 0 },
        { step: N(0, 8), velocity: 0.6, variant: 'fat', note: 0 },
        { step: N(0, 12), velocity: 0.7, variant: 'fat', note: 0 },
        { step: N(1, 0), velocity: 0.9, variant: 'fat', note: -2 },
        { step: N(1, 8), velocity: 0.8, variant: 'fat', note: -5 },
        { step: N(1, 14), velocity: 0.6, variant: 'fat', note: 0 },
      ],
    },
    // IV: the designed peak. Fat line for three bars, then bar 4 opens with
    // the sub drop — one long falling hit, once per phrase — and a pickup
    // that walks back to the top.
    {
      role: 'bass',
      bars: 4,
      events: [
        { step: N(0, 0), velocity: 1.0, variant: 'fat', note: 0 },
        { step: N(0, 8), velocity: 0.6, variant: 'fat', note: 0 },
        { step: N(0, 12), velocity: 0.7, variant: 'fat', note: 0 },
        { step: N(1, 0), velocity: 0.9, variant: 'fat', note: -2 },
        { step: N(1, 8), velocity: 0.8, variant: 'fat', note: -5 },
        { step: N(1, 14), velocity: 0.6, variant: 'fat', note: 0 },
        { step: N(2, 0), velocity: 1.0, variant: 'fat', note: 0 },
        { step: N(2, 8), velocity: 0.7, variant: 'fat', note: -2 },
        { step: N(2, 12), velocity: 0.6, variant: 'fat', note: 0 },
        { step: N(3, 0), velocity: 1.0, variant: 'sub', note: 0 },
        { step: N(3, 10), velocity: 0.7, variant: 'fat', note: -5 },
        { step: N(3, 14), velocity: 0.6, variant: 'fat', note: -2 },
      ],
    },
  ],

  chord: [
    // I: one stab a bar — several notes played together as one short punchy
    // hit — answering the kick.
    {
      role: 'chord',
      bars: 2,
      events: [
        { step: N(0, 4), velocity: 0.75, variant: 'stab', note: 0 },
        { step: N(1, 12), velocity: 0.7, variant: 'stab', note: 0 },
      ],
    },
    // II: the M1 chart. Allowed chord roots are 0, +5, +7 only: the voicing
    // stays inside the pentatonic note set at exactly those shifts.
    {
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
    // III: the M1 movement plus syncopated echoes — stabs answering
    // themselves off the beat.
    {
      role: 'chord',
      bars: 2,
      events: [
        { step: N(0, 4), velocity: 0.8, variant: 'stab', note: 0 },
        { step: N(0, 7), velocity: 0.45, variant: 'stab', note: 0 },
        { step: N(0, 12), velocity: 0.7, variant: 'stab', note: 0 },
        { step: N(1, 4), velocity: 0.8, variant: 'stab', note: 5 },
        { step: N(1, 7), velocity: 0.45, variant: 'stab', note: 5 },
        { step: N(1, 11), velocity: 0.6, variant: 'stab', note: 7 },
        { step: N(1, 14), velocity: 0.5, variant: 'stab', note: 5 },
      ],
    },
    // IV: richness tier — the stab pattern rides over pad swells (the long
    // soft version of the chord) that only happen once per phrase, and bar 4
    // walks the roots home.
    {
      role: 'chord',
      bars: 4,
      events: [
        { step: N(0, 0), velocity: 0.55, variant: 'pad', note: 0 },
        { step: N(0, 4), velocity: 0.8, variant: 'stab', note: 0 },
        { step: N(0, 12), velocity: 0.7, variant: 'stab', note: 0 },
        { step: N(1, 4), velocity: 0.8, variant: 'stab', note: 5 },
        { step: N(1, 11), velocity: 0.6, variant: 'stab', note: 7 },
        { step: N(1, 14), velocity: 0.5, variant: 'stab', note: 5 },
        { step: N(2, 0), velocity: 0.55, variant: 'pad', note: 5 },
        { step: N(2, 4), velocity: 0.8, variant: 'stab', note: 5 },
        { step: N(2, 12), velocity: 0.7, variant: 'stab', note: 7 },
        { step: N(3, 4), velocity: 0.8, variant: 'stab', note: 7 },
        { step: N(3, 11), velocity: 0.6, variant: 'stab', note: 5 },
        { step: N(3, 14), velocity: 0.7, variant: 'stab', note: 0 },
      ],
    },
  ],

  lead: [
    // I: a three-note call. The melody in embryo.
    {
      role: 'lead',
      bars: 1,
      events: [
        { step: 0, velocity: 0.8, note: 0 },
        { step: 6, velocity: 0.6, note: 3 },
        { step: 8, velocity: 0.7, note: 5 },
      ],
    },
    // II: the question — the first half of the M1 melody, asked and left
    // hanging.
    {
      role: 'lead',
      bars: 2,
      events: [
        { step: N(0, 0), velocity: 0.9, note: 0 },
        { step: N(0, 4), velocity: 0.7, note: 3 },
        { step: N(0, 6), velocity: 0.7, note: 5 },
        { step: N(0, 8), velocity: 0.8, note: 7 },
        { step: N(0, 14), velocity: 0.6, note: 5 },
        { step: N(1, 0), velocity: 0.8, note: 3 },
        { step: N(1, 6), velocity: 0.7, note: 0 },
        { step: N(1, 8), velocity: 0.7, note: -2 },
      ],
    },
    // III: the M1 chart — the full four bars, question in 1-2, answer in 3-4.
    {
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
    // IV: richness tier — the same melody ornamented: high sparkle notes an
    // octave up, extra passing tones, and a rising three-note flourish at
    // the very end of bar 4 that hands the phrase back to its top.
    {
      role: 'lead',
      bars: 4,
      events: [
        { step: N(0, 0), velocity: 0.9, note: 0 },
        { step: N(0, 4), velocity: 0.7, note: 3 },
        { step: N(0, 6), velocity: 0.7, note: 5 },
        { step: N(0, 8), velocity: 0.8, note: 7 },
        { step: N(0, 10), velocity: 0.5, note: 12 },
        { step: N(0, 14), velocity: 0.6, note: 5 },
        { step: N(1, 0), velocity: 0.8, note: 3 },
        { step: N(1, 6), velocity: 0.7, note: 0 },
        { step: N(1, 8), velocity: 0.7, note: -2 },
        { step: N(1, 14), velocity: 0.55, note: 0 },
        { step: N(2, 0), velocity: 0.9, note: 0 },
        { step: N(2, 4), velocity: 0.7, note: 3 },
        { step: N(2, 6), velocity: 0.7, note: 5 },
        { step: N(2, 8), velocity: 0.8, note: 10 },
        { step: N(2, 12), velocity: 0.8, note: 12 },
        { step: N(2, 14), velocity: 0.6, note: 15 },
        { step: N(3, 0), velocity: 0.8, note: 7 },
        { step: N(3, 6), velocity: 0.7, note: 5 },
        { step: N(3, 8), velocity: 0.7, note: 3 },
        { step: N(3, 12), velocity: 0.9, note: 0 },
        { step: N(3, 13), velocity: 0.5, note: 7 },
        { step: N(3, 14), velocity: 0.6, note: 10 },
        { step: N(3, 15), velocity: 0.7, note: 12 },
      ],
    },
  ],
};

/** Validate one chart against the coherence skeleton. Used at module load
 *  for the shipped ladders and by the chart store for edited charts. */
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

// Guard the skeleton at build time: a bad shipped chart is a build error,
// not a runtime surprise.
for (const ladder of Object.values(LADDERS)) {
  if (ladder.length !== TIER_COUNT) {
    throw new Error(`${ladder[0].role} ladder has ${ladder.length} tiers, expected ${TIER_COUNT}`);
  }
  for (const chart of ladder) validateChart(chart);
}
