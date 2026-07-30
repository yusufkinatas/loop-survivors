// THE TAPE: what a build IS under The Gig (#268).
//
// In the base a weapon's pattern is one of four hand-authored rungs
// (src/audio/ladders/house.ts) and a level-up moves you up that ladder. Here
// nobody authored your pattern. A weapon arrives as a bar of empty tape, you
// tap out a rhythm under fire, and from that moment the tape loops and attacks
// forever. A level-up does not buy a better pattern; it buys MORE TAPE — a
// longer loop and more room on it — and then hands you the microphone again.
//
// So this file holds two things:
//
//   1. THE TAPE LADDER — the eight rungs a track climbs, in bars and hits.
//   2. THE THEORY THE SYSTEM OWNS — how a bare list of tapped 16th-note steps
//      becomes a Chart with notes, velocities and variants that cannot land
//      wrong.
//
// (2) is the load-bearing half, and it is pillar 2 doing precisely the job it
// was written for. #255 recorded the designer's own fear about this package —
// *"what if it sounds terrible?"* — and their own four mitigations: quantise
// every hit to the grid, lock all pitch to the run's allowed notes, cap
// density, and let the system silently correct a take. All four live here.
//
// THE PLAYER TOUCHES RHYTHM AND NOTHING ELSE. That is exactly L2, the ceiling
// #255 set: the player arranges, the system owns the theory. No key, no scale,
// no note name and no BPM ever reaches the screen. (An L3 arm where the player
// picks notes too is deliberately NOT built here — see docs/gig.md.)

import { validateChart, type Chart, type ChartEvent } from '../../audio/charts';
import { getChart } from '../../audio/chartstore';
import { inNoteSet } from '../../audio/scale';
import { ROLE_META, type Role } from '../../audio/kits';
import { STEPS_PER_BAR, BARS_PER_PHRASE } from '../../audio/scale';
import { chartStageForLevel, WEAPON_MAX_LEVEL, type PerWeaponLevel } from '../weapons/levels';

/** A loop length in bars. Capped at the phrase (BARS_PER_PHRASE) because the
 *  engine loops every chart inside the four-bar phrase — a five-bar tape would
 *  silently wrap. */
export type TapeBars = 1 | 2 | 4;

/** One rung of the tape ladder: how long the loop is, and how many hits it will
 *  hold. `hits` is a CEILING the player fills by playing, never a quota — a
 *  half-filled tape is a thinner track and less damage, and that is a legal
 *  build rather than a mistake. */
export interface TapeRung {
  bars: TapeBars;
  hits: number;
}

/** THE TAPE LADDER. Eight rungs, so it slots straight into the base's existing
 *  eight-level weapon economy: a level-up, a chest drop and the evolution gate
 *  all keep working unchanged and a "level" simply means a rung of tape.
 *
 *  TWO PROPERTIES ARE DELIBERATE AND BOTH ARE LOAD-BEARING.
 *
 *  **Per-bar density never falls as you climb.** 2.0, 3.0, 3.5, 4.5, 5.5, 5.75,
 *  6.5, 7.0 triggers per bar. A level-up that quietly thinned your track would
 *  be a trap, and the hard floor (#256) asks for density to fall *because the
 *  player chose it* — never because they took a reward.
 *
 *  **No single recording pass asks for more than a few taps.** When the loop
 *  grows, whatever is already on the tape is COPIED into the new bars (see
 *  `growTake`), so the rung's extra hits are only ever the delta: 1, 1, 2, 2, 1,
 *  3, 2 taps across the whole eight-rung climb. That is what keeps this an
 *  overdubbing session rather than a button-mashing test — #253 ranked build
 *  knowledge above judgment above execution, and a ladder that demanded 28 taps
 *  in one pass would invert that order.
 *
 *  The one place execution genuinely costs is a voluntary RE-CUT at the top,
 *  which asks for all 28 in a single loop. That is the point: re-cutting is the
 *  move the changeover is built around, and it is meant to be expensive.
 *
 *  The ceiling — five tracks at 7.0/bar — is 35 triggers a bar, which is
 *  deliberately about where the control's maxed five-weapon build sits (34.00,
 *  docs/palette-control/). Same ceiling, but the shape under it is the
 *  player's. */
export const TAPE_LADDER: PerWeaponLevel<TapeRung> = [
  { bars: 1, hits: 2 },
  { bars: 1, hits: 3 },
  { bars: 2, hits: 7 },
  { bars: 2, hits: 9 },
  { bars: 2, hits: 11 },
  { bars: 4, hits: 23 },
  { bars: 4, hits: 26 },
  { bars: 4, hits: 28 },
];

export function tapeRung(level: number): TapeRung {
  const clamped = Math.max(1, Math.min(WEAPON_MAX_LEVEL, Math.floor(level)));
  return TAPE_LADDER[clamped - 1];
}

/** A performance, in the only terms the player ever gives one: which 16th-note
 *  steps of the loop carry a hit. Everything musical about it — which note,
 *  how hard, which sample variant — is derived, never stored, so the theory
 *  cannot drift out of sync with the take. */
export interface Take {
  role: Role;
  bars: TapeBars;
  /** Loop steps carrying a hit, ascending and unique. 0 <= step < bars * 16. */
  steps: number[];
}

// ---------------------------------------------------------------------------
// The theory the system owns
// ---------------------------------------------------------------------------

/** THE RUN'S FOUR-BAR HARMONY, one note pool per bar of the phrase.
 *
 *  Every pitched voice in the band reads its notes off THIS, which is the whole
 *  reason a band of five independently-tapped takes cannot disagree with
 *  itself. It is the most ordinary progression there is — home, home, up a
 *  fourth, up a fifth, pulling home — and it is the same movement the shipped
 *  chord ladder already makes (roots 0 -> 5/7 across its two bars).
 *
 *  Every value is in the run's note set (minor pentatonic, any octave) and
 *  every value is inside 0..15, which is exactly the range the shipped ladders
 *  use. Staying inside a measured range rather than inventing one is what keeps
 *  a tapped take from ever asking a multi-sampled instrument for a pitch its
 *  recordings do not cover. */
const HARMONY: readonly (readonly number[])[] = [
  [0, 3, 7, 12], // bar 1 — home
  [0, 3, 10, 12], // bar 2 — home, with the flat seventh for colour
  [5, 10, 12, 15], // bar 3 — up to the fourth
  [7, 10, 12, 15], // bar 4 — the fifth, pulling home
];

/** The chord voice moves its whole stack rather than picking a note out of a
 *  pool, and `validateChart` only permits a root shift of 0, 5 or 7 (anything
 *  else would take the stacked voicing outside the note set). So it reads the
 *  bar's root directly. */
const CHORD_ROOTS: readonly number[] = [0, 0, 5, 7];

/** Which slice of the bar's pool a voice draws from — register separation
 *  without an octave shift, so nothing can leave the measured 0..15 range.
 *  `low` takes the bottom of the pool, `high` the top. */
type Register = 'low' | 'mid' | 'high';

const REGISTER_SLICE: Readonly<Record<Register, readonly [number, number]>> = {
  low: [0, 2], // pool indices 0..1
  mid: [0, 3], // 0..2
  high: [1, 4], // 1..3
};

/** How a voice moves through its register, one entry per 16th of a bar. The
 *  numbers are positions inside the register slice, so the SAME line reads as
 *  a bass line, a comping figure or a melody depending only on the slice.
 *
 *  This is what makes any rhythm musical: the note is a function of WHERE IN
 *  THE BAR the hit landed, not of the order the player tapped. So a hit on the
 *  downbeat gets the chord's root and a hit on the last 16th gets its colour
 *  note — which is how real lines are written, and it means a take the player
 *  bashed out at random still comes back as a line rather than as noise. */
interface VoiceLine {
  register: Register;
  /** 16 positions, one per 16th step of a bar. */
  degrees: readonly number[];
}

const LINES: Partial<Record<Role, VoiceLine>> = {
  // ---- low anchor: roots, and the fifth as colour ------------------------
  bass: { register: 'low', degrees: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1] },
  sub: { register: 'low', degrees: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  upright: { register: 'low', degrees: [0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1] },
  drone: { register: 'low', degrees: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  // ---- harmonic body: comping figures ------------------------------------
  rhodes: { register: 'mid', degrees: [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1] },
  organ: { register: 'mid', degrees: [0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 0, 2, 2, 2, 2] },
  chank: { register: 'mid', degrees: [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2] },
  // ---- bright line: melodies --------------------------------------------
  lead: { register: 'high', degrees: [0, 1, 2, 1, 0, 1, 2, 1, 2, 1, 0, 1, 2, 1, 0, 2] },
  arp: { register: 'high', degrees: [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1] },
  bell: { register: 'high', degrees: [2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0] },
  flute: { register: 'high', degrees: [1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0] },
};

/** THE GROOVE, and it is free. Velocity by metric position: the downbeat
 *  loudest, the other beats strong, the offbeat eighths mid, the in-between
 *  16ths soft. Every take gets accents in the right places whether the player
 *  thought about it or not, which is a large part of why a tapped pattern reads
 *  as a performance rather than as a metronome. */
const VELOCITY_BY_STEP: readonly number[] = [
  1.0, 0.5, 0.68, 0.52,
  0.88, 0.5, 0.72, 0.55,
  0.94, 0.5, 0.72, 0.5,
  0.88, 0.52, 0.74, 0.62,
];

/** The one voice with a variant worth choosing: the hat's signature is that its
 *  OPEN sound lands on the offbeat eighths. Every other role has a single
 *  chartable variant (ROLE_META) or one the kit picks itself, so there is
 *  nothing to decide. */
function variantFor(role: Role, step: number): string | undefined {
  if (role !== 'hat') return undefined;
  return step % 4 === 2 ? 'open' : 'closed';
}

/** The note a hit at this loop step plays. Pure, total, and guaranteed inside
 *  the run's note set — a tapped step can never produce a pitch that clashes,
 *  because the player is not the one choosing it. */
export function noteForStep(role: Role, step: number): number | undefined {
  if (!ROLE_META[role].pitched) return undefined;
  const bar = Math.floor(step / STEPS_PER_BAR) % BARS_PER_PHRASE;
  if (role === 'chord') return CHORD_ROOTS[bar];
  const line = LINES[role];
  const pool = HARMONY[bar];
  if (!line) return pool[0];
  const [from, to] = REGISTER_SLICE[line.register];
  const slice = pool.slice(from, to);
  const note = slice[line.degrees[step % STEPS_PER_BAR] % slice.length];
  // Belt and braces. Every authored number above is in the set, so this can
  // only fire if someone edits HARMONY or a slice carelessly — and a take is
  // the one thing in this game that must never be able to break a run.
  return inNoteSet(note) ? note : pool[0];
}

/** A take, compiled into the Chart the engine plays. The engine is untouched:
 *  it still reads `voice.chart` and fires whatever is on it, so a player-cut
 *  loop and an authored ladder rung are the same kind of object. */
export function chartFromTake(take: Take): Chart {
  const events: ChartEvent[] = [];
  for (const step of [...take.steps].sort((a, b) => a - b)) {
    events.push({
      step,
      velocity: VELOCITY_BY_STEP[step % STEPS_PER_BAR],
      variant: variantFor(take.role, step),
      note: noteForStep(take.role, step),
    });
  }
  const chart: Chart = { role: take.role, bars: take.bars, events };
  // The same validator the shipped ladders pass at load. A take that somehow
  // fails it is dropped to a single hit on the downbeat rather than crashing a
  // run — the floor rule (#255) in its most literal form: a player holding one
  // weapon must always be able to play it.
  try {
    validateChart(chart);
    return chart;
  } catch {
    return {
      role: take.role,
      bars: take.bars,
      events: [{ step: 0, velocity: 1, variant: variantFor(take.role, 0), note: noteForStep(take.role, 0) }],
    };
  }
}

// ---------------------------------------------------------------------------
// Take arithmetic
// ---------------------------------------------------------------------------

/** THE SILENT CORRECTION, and there are only three rules.
 *
 *  1. Every tap is snapped to a 16th (done at capture — see recorder.ts).
 *  2. Two taps on one step are one hit; a loop step either fires or it does
 *     not, so a frantic double-tap reads as one confident hit.
 *  3. A take with nothing on it gets the downbeat. The floor rule again: you
 *     cannot end a recording pass holding a silent weapon. */
export function normalizeTake(role: Role, bars: TapeBars, steps: readonly number[]): Take {
  const limit = bars * STEPS_PER_BAR;
  const unique = [...new Set(steps.filter((s) => Number.isInteger(s) && s >= 0 && s < limit))];
  unique.sort((a, b) => a - b);
  return { role, bars, steps: unique.length > 0 ? unique : [0] };
}

/** Grow a take onto a longer loop by COPYING what is already there into the new
 *  bars. This is what "more tape" means musically — the loop gets longer and
 *  the material carries on until you overdub into the new room — and it is what
 *  keeps per-bar density exactly constant across a bars change, so the ladder's
 *  monotonicity is a property of the code rather than a hope. */
export function growTake(take: Take, bars: TapeBars): Take {
  if (bars <= take.bars) return take;
  const from = take.bars * STEPS_PER_BAR;
  const to = bars * STEPS_PER_BAR;
  const steps: number[] = [];
  for (let offset = 0; offset < to; offset += from) {
    for (const step of take.steps) steps.push(step + offset);
  }
  return normalizeTake(take.role, bars, steps);
}

/** Triggers per bar this take fires. The one number the density table and the
 *  hard floor both read. */
export function takeDensity(take: Take): number {
  return take.steps.length / take.bars;
}

/** THE CONTROL ARM. The system cuts the take instead of the player, off the
 *  shipped ladder rung the base would have given this level — so `autoTakes`
 *  is literally *finding* the pattern where the rest of the branch is *making*
 *  it, and #268's question ("does making it beat finding it?") becomes an A/B
 *  a player can flip between rather than an argument.
 *
 *  Also the mercy valve: a player who declines a recording pass, or bails out
 *  of one, gets this rather than a hole in their band.
 *
 *  The authored rung is tiled or trimmed onto the tape's own loop length, then
 *  cut to the hit budget by taking the LOUDEST hits first — an authored pattern
 *  thinned by dropping its ghost notes is still that pattern, where one thinned
 *  by dropping its last bar is not. */
export function autoTake(role: Role, level: number): Take {
  const rung = tapeRung(level);
  const source = getChart(role, chartStageForLevel(level));
  const loop = rung.bars * STEPS_PER_BAR;
  const sourceLoop = Math.max(1, source.bars) * STEPS_PER_BAR;
  const scored: { step: number; velocity: number }[] = [];
  const seen = new Set<number>();
  for (const ev of source.events) {
    // Tile a short rung across a longer tape; a longer rung is trimmed by the
    // modulo, which keeps its opening bars rather than an arbitrary slice.
    for (let step = ev.step % sourceLoop; step < loop; step += sourceLoop) {
      if (seen.has(step)) continue;
      seen.add(step);
      scored.push({ step, velocity: ev.velocity });
    }
  }
  scored.sort((a, b) => b.velocity - a.velocity || a.step - b.step);
  return normalizeTake(role, rung.bars, scored.slice(0, rung.hits).map(({ step }) => step));
}
