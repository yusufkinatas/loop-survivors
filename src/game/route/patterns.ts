// THE PATTERNS — the loot of The Shell (#267, package 12 of #255).
//
// An instrument is an empty shell: a sound and no notes. A PATTERN is the notes,
// and patterns are what a level-up hands out. The same shell with a different
// pattern is a different weapon.
//
// A pattern is deliberately NOT a chart. A chart is written for one role — the
// hats' ladder knows about open hats, the bass's knows it lives on the offbeats.
// A pattern is written once, in the abstract, and RENDERED into whichever shell
// holds it: its steps become that voice's steps, its contour becomes that voice's
// notes in that voice's register, and its accents become that voice's variants.
// That is what lets a pattern MOVE between shells, which is the whole reason
// patterns are a currency rather than a ladder rung with a name on it.
//
// TWO RULES CARRY THE MUSIC, and both are read off the authored ladders rather
// than invented here:
//
//   1. A SHELL CAN PLAY AS BUSY AS ITS OWN TOP RUNG, AND NO BUSIER. `ceiling`
//      below is the role's stage-4 authored density, computed at load. So the
//      drone can hold one hit a bar and the arp can hold thirteen, because that
//      is what #266 decided those voices are. No new numbers, and the mix cannot
//      be broken by dropping a sixteenth-note wall into the sub.
//
//   2. DAMAGE IS COMPENSATED AGAINST THE ROLE'S OWN AUTHORED DENSITY. `heft`
//      below is `authored density / pattern density`, so a shell playing half as
//      many notes as its ladder would hits twice as hard, and its DPS at every
//      level is EXACTLY the base game's. This is the join that makes the whole
//      stack possible: density stops being power, so the player can go thin
//      without going weak, and `docs/baseline/`'s never-falling density curve
//      becomes something a player can choose to bend.
//
// Names are FEEL WORDS, never theory (pillar 2's L2 ceiling, #255): "The
// Anchor", "The Push", "The Rush". No key, no scale, no bar-and-beat arithmetic
// ever reaches the screen — the copy on each pattern is one plain sentence about
// what it does to the ear.

import { getChart } from '../../audio/chartstore';
import { TIER_COUNT, validateChart, type Chart, type ChartEvent } from '../../audio/charts';
import { ROLE_META, type Role } from '../../audio/kits';
import { STEPS_PER_BAR, BARS_PER_PHRASE, SKELETON } from '../../audio/scale';

/** How hard a step is struck. SOUND ONLY — velocity never reaches damage
 *  (CONTEXT.md), so this is free expression: a ghost costs the same as an
 *  accent and only the ear can tell. */
export type StepWeight = 'ghost' | 'hit' | 'accent';

const WEIGHT_VELOCITY: Record<StepWeight, number> = { ghost: 0.34, hit: 0.78, accent: 0.96 };

export interface PatternStep {
  /** 16th step, absolute across the pattern's bars (16 per bar). */
  step: number;
  weight: StepWeight;
  /** Where on the pattern's own shape this note sits, counted in NOTES OF THE
   *  RUN'S NOTE SET rather than semitones: 0 is the shell's home note, +1 the
   *  next one up, -1 the one below. An unpitched shell ignores it entirely, so
   *  the same pattern is a melody in the Bell and a groove in the Clap. */
  degree: number;
}

export type PatternBars = 1 | 2 | 4;

export interface Pattern {
  id: PatternId;
  /** By feel, never by theory. */
  name: string;
  /** One plain sentence. This is the only thing the player reads. */
  feel: string;
  bars: PatternBars;
  steps: readonly PatternStep[];
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------
//
// EVERY PATTERN HAS TO BE TELLABLE FROM EVERY OTHER AT SPEED — that is #267's
// first kill criterion, in its own words: "if you cannot hear or read the
// difference at speed, a pattern pickup is a level with more text on it." So the
// catalog is built along the two axes an ear picks up instantly:
//
//   WHERE the hits land   on the beat / between the beats / late / in twos
//   HOW MANY there are    one a bar up to thirteen a bar
//
// and no two entries share a cell. A pattern that was only a small variation of
// another one was cut rather than tuned.

const B = STEPS_PER_BAR;

/** A step written the short way: [step, weight, degree?]. */
type Step = [step: number, weight: StepWeight, degree?: number];

function steps(list: Step[]): PatternStep[] {
  return list.map(([step, weight, degree]) => ({ step, weight, degree: degree ?? 0 }));
}

/** Every 16th of a bar except the listed ones. */
function bar(exclude: number[], weight: StepWeight = 'hit'): Step[] {
  const out: Step[] = [];
  for (let s = 0; s < B; s++) if (!exclude.includes(s)) out.push([s, weight]);
  return out;
}

const CATALOG = {
  // ---- one bar: the pool a run opens on ----------------------------------
  anchor: {
    name: 'The Anchor', bars: 1,
    feel: 'Four hits, dead on the beat. Nothing simpler and nothing steadier.',
    steps: steps([[0, 'accent'], [4, 'hit'], [8, 'accent'], [12, 'hit']]),
  },
  backbeat: {
    name: 'The Backbeat', bars: 1,
    feel: 'Two hits a bar, both landing where a hand claps.',
    steps: steps([[4, 'accent'], [12, 'accent']]),
  },
  push: {
    name: 'The Push', bars: 1,
    feel: 'Four hits, every one of them between the beats. It leans forward.',
    steps: steps([[2, 'accent', 0], [6, 'hit', 1], [10, 'accent', 0], [14, 'hit', 2]]),
  },
  hold: {
    name: 'The Hold', bars: 1,
    feel: 'One hit a bar. The heaviest single thing you can play.',
    steps: steps([[0, 'accent']]),
  },
  drag: {
    name: 'The Drag', bars: 1,
    feel: 'One on the beat and one that turns up late. Lazy on purpose.',
    steps: steps([[0, 'accent'], [7, 'hit', -1]]),
  },
  pair: {
    name: 'The Pair', bars: 1,
    feel: 'Hits in twos — one hard, one falling off the back of it.',
    steps: steps([[0, 'accent'], [1, 'ghost'], [8, 'accent', 1], [9, 'ghost', 1]]),
  },
  tail: {
    name: 'The Tail', bars: 1,
    feel: 'The last flicker before each beat. Always arriving, never landing.',
    steps: steps([[3, 'hit'], [7, 'ghost'], [11, 'hit'], [15, 'ghost']]),
  },
  stagger: {
    name: 'The Stagger', bars: 1,
    feel: 'Long, long, short — over and over. It limps, and the limp is the hook.',
    steps: steps([[0, 'accent', 0], [3, 'hit', 1], [6, 'hit', 2], [8, 'accent', 3], [11, 'hit', 2], [14, 'hit', 1]]),
  },
  climb: {
    name: 'The Climb', bars: 1,
    feel: 'Four hits on the beat, each one higher than the last.',
    steps: steps([[0, 'hit', 0], [4, 'hit', 1], [8, 'hit', 2], [12, 'accent', 3]]),
  },
  fall: {
    name: 'The Fall', bars: 1,
    feel: 'Starts high and walks itself back down to the floor.',
    steps: steps([[0, 'accent', 3], [3, 'hit', 2], [6, 'hit', 1], [10, 'hit', 0]]),
  },
  sprint: {
    name: 'The Sprint', bars: 1,
    feel: 'Eight even hits. It runs and it does not stop.',
    steps: steps([0, 2, 4, 6, 8, 10, 12, 14].map((s, i): Step => [s, i % 2 ? 'hit' : 'accent'])),
  },
  knock: {
    name: 'The Knock', bars: 1,
    feel: 'Every beat doubled up. Twice as insistent, same shape.',
    steps: steps([[0, 'accent'], [1, 'hit'], [4, 'accent'], [5, 'hit'], [8, 'accent'], [9, 'hit'], [12, 'accent'], [13, 'hit']]),
  },
  rush: {
    name: 'The Rush', bars: 1,
    feel: 'Almost every sixteenth there is. A wall with four holes punched in it.',
    steps: steps(bar([5, 7, 9, 13])),
  },
  late: {
    name: 'The Late One', bars: 1,
    feel: 'One hit a bar, and it turns up after everybody else has played theirs.',
    steps: steps([[10, 'accent']]),
  },

  // ---- two bars: opens at the second bar ---------------------------------
  question: {
    name: 'The Question', bars: 2,
    feel: 'Says something in the first bar and leaves the second one wide open.',
    steps: steps([[0, 'accent', 0], [3, 'hit', 2], [6, 'accent', 3]]),
  },
  answer: {
    name: 'The Answer', bars: 2,
    feel: 'Sits out the first bar entirely, then replies in the second.',
    steps: steps([[B + 4, 'accent', 3], [B + 10, 'hit', 2], [B + 14, 'hit', 0]]),
  },
  longWay: {
    name: 'The Long Way', bars: 2,
    feel: 'Four hits stretched over two bars. Mostly air.',
    steps: steps([[0, 'accent', 0], [6, 'hit', 2], [B + 4, 'accent', 1], [B + 10, 'hit', 0]]),
  },
  everyOther: {
    name: 'The Every Other', bars: 2,
    feel: 'One hit every two bars. You end up waiting for it.',
    steps: steps([[0, 'accent']]),
  },
  walk: {
    name: 'The Walk', bars: 2,
    feel: 'Walks up for a bar and back down for the next. Never stands still.',
    steps: steps([
      [0, 'hit', 0], [4, 'hit', 1], [8, 'hit', 2], [12, 'hit', 3],
      [B, 'hit', 3], [B + 4, 'hit', 2], [B + 8, 'hit', 1], [B + 12, 'hit', 0],
    ]),
  },
  turnaround: {
    name: 'The Turnaround', bars: 2,
    feel: 'Quiet through the first bar, then floods the second one.',
    steps: steps([
      [0, 'accent', 0], [8, 'hit', 0],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i): Step => [B + s, i % 2 ? 'ghost' : 'hit', i % 4]),
    ]),
  },

  // ---- four bars: opens at the fourth bar --------------------------------
  slowBurn: {
    name: 'The Slow Burn', bars: 4,
    feel: 'One hit a bar for four bars, climbing the whole way up.',
    steps: steps([[0, 'hit', 0], [B, 'hit', 1], [2 * B, 'hit', 2], [3 * B, 'accent', 3]]),
  },
  sway: {
    name: 'The Sway', bars: 4,
    feel: 'Two hits in four bars, and neither is where you expect it.',
    steps: steps([[6, 'accent', 0], [2 * B + 10, 'hit', 3]]),
  },
  breath: {
    name: 'The Breath', bars: 4,
    feel: 'Plays three bars and takes the fourth one off. You notice the gap.',
    steps: steps([
      [0, 'accent', 0], [6, 'hit', 1], [10, 'hit', 0],
      [B, 'accent', 2], [B + 6, 'hit', 3], [B + 10, 'hit', 2],
      [2 * B, 'accent', 1], [2 * B + 6, 'hit', 2], [2 * B + 10, 'hit', 1],
    ]),
  },
  lift: {
    name: 'The Lift', bars: 4,
    feel: 'Busier every bar for four bars, then straight back to one hit.',
    steps: steps([
      [0, 'accent', 0],
      [B, 'accent', 0], [B + 8, 'hit', 1],
      [2 * B, 'accent', 0], [2 * B + 4, 'hit', 1], [2 * B + 8, 'hit', 2], [2 * B + 12, 'hit', 3],
      ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i): Step => [3 * B + s, i % 2 ? 'ghost' : 'hit', i % 4]),
    ]),
  },
  wholeStory: {
    name: 'The Whole Story', bars: 4,
    feel: 'A whole four-bar sentence with a proper fill at the end of it.',
    steps: steps([
      [0, 'accent', 0], [6, 'hit', 2], [10, 'hit', 1],
      [B, 'accent', 0], [B + 6, 'hit', 3], [B + 10, 'hit', 2],
      [2 * B, 'accent', 1], [2 * B + 6, 'hit', 3], [2 * B + 10, 'hit', 4],
      [3 * B, 'accent', 2], [3 * B + 2, 'ghost', 2], [3 * B + 4, 'hit', 3],
      [3 * B + 6, 'ghost', 3], [3 * B + 8, 'hit', 4], [3 * B + 11, 'hit', 2], [3 * B + 14, 'accent', 0],
    ]),
  },
} as const satisfies Record<string, Omit<Pattern, 'id'>>;

/** A catalog entry's key. Kept as a literal union so the starter table below
 *  cannot name a pattern that does not exist. */
export type CatalogPatternId = keyof typeof CATALOG;

/** A pattern's identity anywhere in the game. Deliberately a plain string rather
 *  than the catalog's literal union: a gate can FUSE two patterns into a named
 *  third (#248's gated combination object, which #255 named as this layer's
 *  interlock), and a pattern that only exists because the player made it cannot
 *  be a key in a table written at build time. */
export type PatternId = string;

const REGISTRY = new Map<PatternId, Pattern>(
  (Object.entries(CATALOG) as [CatalogPatternId, Omit<Pattern, 'id'>][]).map(([id, p]) => [id, { ...p, id }]),
);

/** Catalog order, which is offer order and bench order. Fused patterns are
 *  deliberately absent: they are not loot, they are something the player built. */
export const PATTERN_IDS = Object.keys(CATALOG) as readonly CatalogPatternId[];

/** The pattern with this id. Throws rather than returning null: every id in the
 *  game comes from this module or from `registerPattern`, so a miss is a wiring
 *  bug and silently playing nothing would hide it. */
export function pattern(id: PatternId): Pattern {
  const found = REGISTRY.get(id);
  if (!found) throw new Error(`unknown pattern ${id}`);
  return found;
}

export function hasPattern(id: PatternId): boolean {
  return REGISTRY.has(id);
}

/** Add a pattern the player made. Idempotent on id, so re-fusing the same pair
 *  reuses the same object (and therefore the same rendered chart). */
export function registerPattern(p: Pattern): Pattern {
  const existing = REGISTRY.get(p.id);
  if (existing) return existing;
  REGISTRY.set(p.id, p);
  return p;
}

/** Hits per bar. THE number: it decides how the arrangement reads, how often the
 *  weapon fires, and (through `heft`) how hard each of those hits lands. */
export function patternDensity(pattern: Pattern): number {
  return pattern.steps.length / pattern.bars;
}

// ---------------------------------------------------------------------------
// What each shell can hold, and in what register
// ---------------------------------------------------------------------------

/** Hits per bar in a role's own authored ladder rung. */
function ladderDensity(role: Role, stage: number): number {
  const chart = getChart(role, Math.max(1, Math.min(TIER_COUNT, stage)));
  return chart.events.length / Math.max(1, chart.bars);
}

/** A BED has no notes at all (Kit.bed, #266): one continuous source, never
 *  triggered by the sequencer. There is nothing for a pattern to be, so a bed
 *  shell holds none — see `SHELL_CEILING`. */
const BED_ROLES: ReadonlySet<Role> = new Set<Role>(['pad', 'air']);

export function isBedRole(role: Role): boolean {
  return BED_ROLES.has(role);
}

/** THE DENSITY CEILING, read off the authored ladders rather than invented: a
 *  shell can play as busy as its own top rung and no busier.
 *
 *  This is the one rule that keeps the mix intact once the player owns the
 *  notes. #266 spent a whole ticket deciding that the sub holds and the arp runs
 *  — "a busy sub is just a muddy bass" — and the pattern economy would hand that
 *  decision straight back to a player who has no way to know it. So the ladder's
 *  own verdict becomes the constraint, and the bench says so in plain words
 *  ("the Sub cannot play this fast") rather than silently refusing.
 *
 *  It also does the work of a per-shell identity: the Drone and the Arp are
 *  offered the same catalog and can hold almost none of the same patterns, which
 *  is #255's pistol test satisfied by construction — every shell is worth
 *  switching in because every shell can play things the others cannot. */
export const SHELL_CEILING: Readonly<Partial<Record<Role, number>>> = (() => {
  const out: Partial<Record<Role, number>> = {};
  for (const role of Object.keys(ROLE_META) as Role[]) {
    if (isBedRole(role)) continue;
    // ROUNDED UP TO A WHOLE HIT PER BAR. A two-bar rung that AVERAGES 5.5 hits
    // a bar plays six of them in one of its two bars, so the average is the
    // wrong side of the boundary: the lead's own ladder phrasing (six hits in a
    // bar) would not fit the lead. The ceiling asks "how busy does this voice
    // ever get", and the answer is the busiest bar, not the mean.
    const top = Math.ceil(ladderDensity(role, TIER_COUNT));
    if (top > 0) out[role] = top;
  }
  return out;
})();

/** Whether this shell can hold this pattern at all. A bed holds nothing. */
export function shellFits(role: Role, pattern: Pattern): boolean {
  const ceiling = SHELL_CEILING[role];
  if (ceiling === undefined) return false;
  return patternDensity(pattern) <= ceiling + 1e-9;
}

/** Every pattern a shell could hold, catalog order. */
function patternsForShell(role: Role, unlockedBars: PatternBars): Pattern[] {
  return PATTERN_IDS
    .map((id) => pattern(id))
    .filter((p) => p.bars <= unlockedBars && shellFits(role, p));
}

/** THE PLAINEST THING A SHELL CAN PLAY, and the reason a hire is never dead.
 *
 *  #255's floor rule is absolute: "a player holding one weapon must always be
 *  able to play it. No mechanic may make the opening feel powerless." A shell
 *  that arrives literally empty — the purest reading of the package — breaks it
 *  outright, so a hire arrives holding this. Finding a great pattern is still the
 *  event; starting from silence is not. (See the record on #267: the alternative,
 *  a genuinely empty shell with the first pattern as loot, was rejected on the
 *  floor rule.)
 *
 *  The choices reproduce roughly what each voice plays in the authored track, so
 *  a fresh band already sounds like a band and every pattern found from there is
 *  a departure from something rather than a first attempt at something. */
/** Where character beats arithmetic. Four voices whose identity is WHERE they sit
 *  rather than how many notes they play, and whose nearest-by-density answer
 *  would have thrown that away: the hat lives between the beats, the shaker on the
 *  "a", the chank on the "e", and the bass answers the kick rather than doubling
 *  the backbeat. Each of these is the SAME density as the automatic answer, so it
 *  costs the opening nothing. */
const STARTER_OVERRIDE: Readonly<Partial<Record<Role, CatalogPatternId>>> = {
  hat: 'push', shaker: 'tail', chank: 'late', bass: 'drag',
};

/**
 * A hire arrives holding the pattern CLOSEST IN DENSITY TO ITS OWN OPENING RUNG.
 *
 * The first pass hand-picked these for character and the numbers caught it out: a
 * five-shell band at level one came to fifteen hits a bar, where the shipped
 * game's opening is two. That is not "the arrangement is the player's" — it is the
 * late-run mud this map exists to remove, moved to the front of the run. And it
 * quietly broke the balance too, since heft compensates against the AUTHORED rung:
 * a starter four times denser than the rung means a starter hitting at a quarter
 * damage before the player has chosen anything.
 *
 * Reading the density off stage 1 fixes both at once. The band opens as sparse as
 * the base's, every shell starts at roughly heft 1, and the run has somewhere to
 * go. `STARTER_OVERRIDE` then picks between the equally-dense candidates on
 * character.
 */
export function starterPattern(role: Role): PatternId | null {
  if (isBedRole(role)) return null;
  const override = STARTER_OVERRIDE[role];
  if (override && shellFits(role, pattern(override))) return override;
  const target = ladderDensity(role, 1);
  // One bar only: the second and fourth bars are a progression the run unlocks,
  // so nothing may arrive already holding one.
  const candidates = patternsForShell(role, 1);
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const candidate of candidates) {
    const closer = Math.abs(patternDensity(candidate) - target)
      < Math.abs(patternDensity(best) - target) - 1e-9;
    if (closer) best = candidate;
  }
  return best.id;
}

// ---------------------------------------------------------------------------
// Rendering a pattern into one shell's voice
// ---------------------------------------------------------------------------

const PENT = SKELETON.noteSet;

/** A note of the run's note set, counted from the root, as a semitone. Degree 5
 *  is the root an octave up, degree -1 the note below the root. */
function degreeToSemitone(degree: number): number {
  const octave = Math.floor(degree / PENT.length);
  const index = ((degree % PENT.length) + PENT.length) % PENT.length;
  return PENT[index] + 12 * octave;
}

/** WHERE EACH SHELL SITS, in notes of the note set rather than semitones. Read
 *  off the authored ladders: the low anchor and the harmonic body work from the
 *  root up, the bright line lives a fifth above it, and the bell is an octave
 *  clear of everything. A contour is relative, so this is what stops a bass line
 *  moved into the Bell from playing bass notes on a bell. */
const HOME_DEGREE: Readonly<Partial<Record<Role, number>>> = {
  lead: 3, flute: 3, bell: 5,
};

/** How far a shell may stray from home before the contour folds back. Keeps a
 *  four-note climb inside the register the voice was recorded for — #266 built
 *  multi-sampling precisely because a recording stretched too far "turns
 *  chipmunky at the top and sludgy at the bottom". */
const CONTOUR_REACH = 4;

/** The Chord weapon may only ever land on the note set's three chord roots
 *  (charts.ts enforces it: a stab anywhere else would leave the note set). So
 *  its contour is mapped onto those three rather than onto the scale. */
const CHORD_ROOTS = [0, 5, 7] as const;

function noteFor(role: Role, degree: number): number | undefined {
  if (!ROLE_META[role].pitched) return undefined;
  if (role === 'chord') {
    const i = ((Math.round(degree) % CHORD_ROOTS.length) + CHORD_ROOTS.length) % CHORD_ROOTS.length;
    return CHORD_ROOTS[i];
  }
  const home = HOME_DEGREE[role] ?? 0;
  const clamped = Math.max(-CONTOUR_REACH, Math.min(CONTOUR_REACH, degree));
  return degreeToSemitone(home + clamped);
}

/** Which recorded variant a step uses. Only two voices have a second variant to
 *  reach for, and both use it the way their own ladder does: an accented hat is
 *  an OPEN hat, an accented bass is the FAT one. Everything else has one sound
 *  and expresses weight through velocity alone. */
function variantFor(role: Role, weight: StepWeight): string | undefined {
  if (role === 'hat') return weight === 'accent' ? 'open' : 'closed';
  if (role === 'bass') return weight === 'accent' ? 'fat' : 'bass';
  return undefined;
}

/** THE DIAL (#255's Fewer, Bigger, kept only as an opt-in lever). A per-shell
 *  three-way live setting between many small hits and few huge ones, applied to
 *  whatever pattern is in the shell rather than replacing it. Rides as a toggle
 *  because #255 killed the compulsory version outright: "a tradeoff you cannot
 *  decline is a tax, not a decision."
 *
 *  Thin drops the ghosts (and, failing that, every other hit); thick fills the
 *  gaps with ghosts up to the shell's ceiling. Damage needs no adjustment — heft
 *  is read off the RENDERED density, so the dial pays for itself automatically. */
export type Dial = -1 | 0 | 1;

function applyDial(role: Role, pattern: Pattern, dial: Dial): readonly PatternStep[] {
  if (dial === 0) return pattern.steps;
  const ceiling = SHELL_CEILING[role] ?? 0;
  if (dial < 0) {
    const ghostless = pattern.steps.filter((s) => s.weight !== 'ghost');
    if (ghostless.length < pattern.steps.length && ghostless.length > 0) return ghostless;
    // Nothing to drop softly: halve it, keeping the first of every pair so the
    // downbeat survives.
    const halved = pattern.steps.filter((_, i) => i % 2 === 0);
    return halved.length > 0 ? halved : pattern.steps;
  }
  // Thicken: a ghost one sixteenth after each existing hit, wherever the step is
  // free and the ceiling allows it.
  const taken = new Set(pattern.steps.map((s) => s.step));
  const total = pattern.bars * B;
  const added: PatternStep[] = [];
  const room = Math.floor(ceiling * pattern.bars) - pattern.steps.length;
  for (const s of pattern.steps) {
    if (added.length >= room) break;
    const next = (s.step + 1) % total;
    if (taken.has(next)) continue;
    taken.add(next);
    added.push({ step: next, weight: 'ghost', degree: s.degree });
  }
  return [...pattern.steps, ...added].sort((a, b) => a.step - b.step);
}

/** One rendered chart per (role, pattern, dial). Cached because OBJECT IDENTITY
 *  IS THE ENGINE'S CONTRACT (chartstore.ts says so): the engine holds
 *  `voice.chart` and reads it every step, so handing it a fresh object on every
 *  frame would be a new allocation sixteen times a bar for no gain. */
const rendered = new Map<string, Chart>();

/** A pattern, as the chart one shell plays. */
export function renderPattern(role: Role, pattern: Pattern, dial: Dial = 0): Chart {
  const key = `${role}/${pattern.id}/${dial}`;
  const cached = rendered.get(key);
  if (cached) return cached;
  const list = applyDial(role, pattern, dial);
  const events: ChartEvent[] = list.map((step) => ({
    step: step.step % (pattern.bars * B),
    velocity: WEIGHT_VELOCITY[step.weight],
    variant: variantFor(role, step.weight),
    note: noteFor(role, step.degree),
  }));
  const chart: Chart = { role, bars: pattern.bars, events };
  validateChart(chart); // a bad render is a load error, not a runtime surprise
  rendered.set(key, chart);
  return chart;
}

/** What a shell with no pattern plays: nothing. The audibility rule (#255,
 *  locked) makes this the whole of "that shell went silent" — a voice with no
 *  events fires no triggers, so it makes no sound AND deals no damage, and the
 *  two stop together with nothing to keep in sync. */
const SILENT = new Map<Role, Chart>();

export function silentChart(role: Role): Chart {
  let chart = SILENT.get(role);
  if (!chart) {
    chart = { role, bars: 1, events: [] };
    SILENT.set(role, chart);
  }
  return chart;
}

// ---------------------------------------------------------------------------
// Heft: the join that decouples density from power
// ---------------------------------------------------------------------------

/** Guard rails only. The ceiling rule keeps real cases well inside these; they
 *  exist so a future ladder edit cannot turn into a 30x weapon in silence. */
const HEFT_MIN = 0.2;
const HEFT_MAX = 6;

/**
 * How hard one trigger of this shell hits, relative to the authored weapon.
 *
 * THE WHOLE STACK TURNS ON THIS ONE RATIO. In the shipped game a weapon level
 * buys chart events, so more notes *is* more damage and the two can never move
 * apart — which is the structural cause `docs/baseline/` measured as a density
 * curve that "never once falls" and a loudness range of 0.4-0.6 LU everywhere.
 *
 * Here damage is divided by the density the player chose and multiplied by the
 * density the ladder would have played. A shell on The Hold plays a quarter of
 * The Anchor's notes and each one lands four times as hard; its damage per
 * second is identical, and identical to the base game's at that level. So:
 *
 *   - going thin costs nothing but the notes, which is what makes an authored
 *     valley a decision rather than a sacrifice (#253's peaks-paid-for-in-advance)
 *   - the level ladder still climbs exactly as it did, because the authored
 *     density it is measured against climbs with it
 *   - a run's density becomes free to fall, which is half of #256's hard floor
 *
 * `stage` is the authored rung the level would have played (chartStageForLevel),
 * so the comparison is always level-for-level.
 */
export function heftFor(role: Role, stage: number, density: number): number {
  if (isBedRole(role) || density <= 0) return 1;
  const authored = ladderDensity(role, stage);
  if (authored <= 0) return 1;
  return Math.max(HEFT_MIN, Math.min(HEFT_MAX, authored / density));
}

/** How much of a shell's heft reaches its FOOTPRINT rather than its damage
 *  number. A heavy hit should look and sweep heavier — that is the read that
 *  makes a sparse arrangement feel like a choice rather than a handicap — but
 *  area compounds against a crowd, so it takes a fractional power of heft
 *  instead of all of it. */
const SHAPE_EXPONENT = 0.45;

export function shapeMulFor(heft: number): number {
  return Math.pow(heft, SHAPE_EXPONENT);
}

/** Sanity on the catalog itself, at load: a pattern outside its own bar count,
 *  or longer than the phrase, is a build error. */
{
  for (const id of PATTERN_IDS) {
    const p = pattern(id);
    if (p.bars > BARS_PER_PHRASE) {
      throw new Error(`pattern ${id}: ${p.bars} bars is longer than the phrase`);
    }
    const total = p.bars * B;
    if (p.steps.length === 0) throw new Error(`pattern ${id} has no steps`);
    // Two hits on one step would be one hit that costs two — the sort of thing
    // that only shows up as a density number that does not match the ear.
    const seen = new Set<number>();
    for (const step of p.steps) {
      if (step.step < 0 || step.step >= total) {
        throw new Error(`pattern ${id}: step ${step.step} is outside its ${p.bars} bars`);
      }
      if (seen.has(step.step)) throw new Error(`pattern ${id}: two hits on step ${step.step}`);
      seen.add(step.step);
    }
  }
  // Every shell must be able to hold SOMETHING from the opening pool, or a hire
  // of it would arrive silent and break the floor rule.
  for (const role of Object.keys(SHELL_CEILING) as Role[]) {
    if (patternsForShell(role, 1).length === 0) {
      throw new Error(`shell ${role}: ceiling ${SHELL_CEILING[role]} holds no one-bar pattern`);
    }
    if (!starterPattern(role)) throw new Error(`shell ${role}: no starter pattern`);
  }
}
