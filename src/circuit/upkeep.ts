// HEADROOM (#255 package 2): the upkeep economy. This stack's engine.
//
// Every active instrument draws upkeep from a shared pool, and the pool refills
// slowly. Playing everything at once is affordable in bursts and impossible to
// sustain, so THE RESTING STATE OF A BAND IS PARTIAL. Running lean BANKS the
// surplus, and a full bank buys a BLACKOUT: a window of free upkeep where
// everything you own plays at once. The peak is paid for in advance, by exactly
// the amount you underspent.
//
// ---------------------------------------------------------------------------
// DESIGN CALL 1: UPKEEP IS DRAWN PER TRIGGER, NOT AS A FLAT PER-BAR RATE.
// ---------------------------------------------------------------------------
// #255 says "per bar". The alternative that was on the table is a table of flat
// per-bar costs, one number per (role, level) — simpler to read, simpler to
// balance. Per-trigger was chosen for four reasons, and it is the single most
// consequential call in this build:
//
//  1. DENSITY BECOMES THE COST, LITERALLY. The complaint that founded #247 is
//     that power and musical density ride one axis. Per-trigger upkeep points
//     that same axis at a budget: the busier a voice's chart, the more of the
//     pool it eats. Notes are the currency.
//  2. LEVELLING GETS EXPENSIVE FOR FREE. #255 asks that power buy force AND
//     upkeep together. It already does — a level-up steps the chart stage at
//     3, 5 and 7, which is more triggers, which is more draw. No second table
//     to keep in sync with the ladders, and no way for the two to drift.
//  3. THE INTERLOCK BECOMES REAL. #255's "locks together" for this package is
//     "two instruments whose upkeep peaks alternate cost less together than two
//     peaking in unison". Under a flat per-bar rate that is not true of
//     anything. Per trigger it is true by construction: two voices hitting the
//     same sixteenth spike the pool together, two that interleave spread the
//     same total draw over the bar and never trough it as deep.
//  4. THE METER MOVES WITH THE MUSIC. #270's kill criterion is "upkeep is
//     bookkeeping — if you are reading a meter instead of feeling a budget it is
//     a spreadsheet". A per-bar step function is a spreadsheet. A pool that
//     visibly dips on every kick is an instrument.
//
// What it costs: the pool wobbles at audio rate, so a raw number is unreadable.
// The fix is that THE DECISION IS AT THE BAR LINE, never mid-bar — see call 3.
//
// ---------------------------------------------------------------------------
// DESIGN CALL 2: THE FLOOR IS DERIVED, NOT TYPED IN.
// ---------------------------------------------------------------------------
// #255's floor rule, in the designer's own proposed form: "the kick's upkeep
// exactly equals your regeneration, so the opening is always affordable". Taken
// literally that protects the kick and nothing else — a run that opens on the
// Rhodes would drain from bar one, and the floor rule says "a player holding ONE
// weapon must always be able to play it", not "one particular weapon".
//
// So the FLOOR is computed at boot as the cost of the busiest level-1 chart in
// the whole palette (measured: 4.0 units a bar, a three-way tie between the kick,
// the hat and the shaker). Every single-weapon opening is then affordable, whichever
// weapon the run opened on. The number moves by itself if a ladder is ever
// re-authored, which is the point: a typed-in floor rots silently the first time
// someone edits a chart.
//
// Regeneration is TWO floors, not one, and that stretch past what #255 wrote is
// flagged as a call at `OPENING_FLOORS` below — measuring one floor showed it
// brownouts the second weapon a run is offered.
//
// ---------------------------------------------------------------------------
// DESIGN CALL 3: OVERSPENDING BROWNS THE BAND OUT AT THE BAR LINE.
// ---------------------------------------------------------------------------
// The pool cannot go negative and triggers are never dropped mid-bar — a voice
// that stuttered out halfway through a bar would be both musically ugly and
// illegible, and it would break the audibility rule's usefulness (you could not
// tell whether a weapon was attacking). Instead:
//
//   at each bar line, the coming bar's draw is priced against the pool. If it
//   does not fit, voices are switched OFF — most expensive first — until it
//   does. That is a BROWNOUT, it is announced, and it is the player's own
//   overspend arriving.
//
// This is automatic removal of the player's power, which #258 found Bandwagon
// doing and players accepting. The difference from Bandwagon's rubber band is
// the input: Bandwagon reads ENEMY COUNT, so your output is set by the game.
// Headroom reads YOUR OWN SPEND, so it is set by you. A brownout is never a
// surprise — the pool spent the previous bar visibly draining toward it.
//
// ---------------------------------------------------------------------------
// DESIGN CALL 4: A BLACKOUT IS A PHRASE LONG AND COSTS A FULL BANK.
// ---------------------------------------------------------------------------
// #255: "a full bank buys a Blackout". So the bank is a fixed size, the Blackout
// is a fixed four bars — one phrase, which is the unit this engine's charts are
// written in — and the payment is the TIME it took to fill the bank while
// running lean. Duration-proportional-to-bank was the alternative; it makes the
// peak's length a number the player computes rather than a shape they recognise,
// and a four-bar peak is a musical object.

import { getChart } from '../audio/chartstore';
import { PALETTE_ROLES, type Role } from '../audio/kits';
import { PALETTE_SAMPLES } from '../audio/palette-samples';
import { soundsetSupports } from '../audio/soundset';
import { chartStageForLevel } from '../game/weapons/levels';

/** Cost of one trigger, in pool units. Arbitrary scale — every other number in
 *  this file is derived from it — but fixed at 1 so the pool reads as "notes I
 *  can afford", which is the mental model the HUD paints. */
const PER_TRIGGER = 1;

/** What a held voice costs per bar. The texture seat (pad, air) has no triggers
 *  at all — a bed is one continuous looping source, so per-trigger pricing would
 *  make the palette's two most continuously audible voices FREE, which is the
 *  opposite of true.
 *
 *  Two units: a quarter of the opening budget. A bed is quiet and constant rather
 *  than loud and busy, so it should be the cheapest thing you can have playing —
 *  but not free, because it IS playing and the audibility rule cuts both ways. */
const BED_PER_BAR = 2;

/** Pool depth, in multiples of the derived floor. MEASURED, not guessed: a five-
 *  weapon maxed band of the original voices draws 34 units a bar (the same build
 *  `docs/palette-control/07-maxed-five` captures), and the opening budget is 8.
 *  So the full late band overspends by ~26 a bar, and a pool twelve floors deep
 *  (48) funds not quite two bars of it.
 *
 *  Two bars of everything-at-once is the shape #255 asks for in one sentence:
 *  "affordable in bursts and impossible to sustain". The `capacity` card buys more
 *  of exactly this — longer bursts, no cheaper to hold. */
const POOL_FLOORS = 12;

/** Bars of full-band Blackout a full bank buys. One phrase. */
const BLACKOUT_BARS = 4;

/** How much surplus a full bank holds, in bars of regeneration. Eight bars of
 *  running lean for four bars of playing everything: the peak costs twice the
 *  valley, so a Blackout is never something a run drifts into.
 *
 *  MEASURED UP FROM 8. At eight bars a two-voice band banked a full bank every
 *  eleven bars — about twenty-two seconds — and the harness fired four Blackouts
 *  inside ninety seconds. A peak that arrives every twenty seconds is not a peak, it
 *  is the resting state with a light show. Twenty bars puts a Blackout at roughly
 *  forty to sixty seconds of genuinely lean play: two or three inside a venue's set,
 *  and one buyable across a long walk.
 *
 *  That last part is the interlock, deliberately preserved through the change:
 *  #270's escape from the corridor problem is that the quiet route is MECHANICALLY
 *  rewarding, and "you arrive holding a Blackout" is that reward in one sentence. */
const BANK_BARS = 20;

/** Triggers one bar of a chart fires, averaged over the chart's own length. A
 *  four-bar chart's events are spread across four bars, so its per-bar rate is
 *  a quarter of its event count — which is exactly what the pool feels. */
function triggersPerBar(role: Role, level: number): number {
  const chart = getChart(role, chartStageForLevel(level));
  if (chart.events.length === 0) return 0;
  return chart.events.length / Math.max(1, chart.bars);
}

/** Whether a role is a bed: one continuous looping source rather than a sequence
 *  of hits.
 *
 *  READ OFF THE PALETTE DATA, NOT OFF THE CHART, and the first pass got this
 *  wrong in a way worth recording. A bed voice still HAS a ladder chart — the pad
 *  and the air both do — and the engine simply refuses to play it (`trigger()`
 *  returns early on `voice.kit.bed`). So "the chart is empty" is not the same
 *  question as "is this a bed", and asking the chart priced the pad at 0.3 units
 *  a bar off notes that never sound. `PALETTE_SAMPLES` is where bed-ness is
 *  actually declared, so that is where it is asked. */
export function isBed(role: Role): boolean {
  return PALETTE_SAMPLES[role]?.bed === true;
}

/** What one voice draws per bar at a given level. */
export function costPerBar(role: Role, level: number): number {
  if (level <= 0) return 0;
  if (isBed(role)) return BED_PER_BAR;
  return triggersPerBar(role, level) * PER_TRIGGER;
}

/** THE FLOOR, derived (call 2): the most expensive level-1 voice in the palette.
 *  Measured at 4.0 units a bar — the kick, the hat and the shaker tie for it.
 *
 *  Computed once, lazily, because the chart store applies localStorage edits at
 *  module load and a chart edited in the playground should move the floor with
 *  it rather than leave the economy priced against the shipped ladder. */
let cachedFloor: number | null = null;
export function upkeepFloor(): number {
  if (cachedFloor !== null) return cachedFloor;
  let worst = 0;
  for (const role of PALETTE_ROLES) {
    if (!soundsetSupports(role)) continue;
    worst = Math.max(worst, costPerBar(role, 1));
  }
  // A palette with no ladders at all (a fixture) still needs a positive rate or
  // nothing is ever affordable.
  cachedFloor = worst > 0 ? worst : 4;
  return cachedFloor;
}

/**
 * THE OPENING BUDGET: two floors, not one.
 *
 * #255's floor rule is "a player holding ONE weapon must always be able to play
 * it", and one floor satisfies it exactly. Measuring the first pass showed one
 * floor is not enough to be playable: a run opens on one weapon and its first
 * level-up is nearly always a second, so at regeneration 4.0 the SECOND weapon
 * arrives already over budget and the harness muted its opening kick at 0:13. A
 * band whose resting state is one voice is not "partial", it is "one voice", and
 * the whole point of the layer is the decision about WHICH voices.
 *
 * So the opening budget is 8.0 — two of the busiest level-1 voices, or three or
 * four ordinary ones. THIS IS A DELIBERATE STRETCH OF THE FLOOR RULE past what
 * #255 wrote, flagged as a call: the alternative reading (one floor, exactly as
 * written) is one line away and makes minute one a brownout.
 *
 * The band's late draw is 34 for five maxed voices, so 8 still leaves the full
 * band four times over budget. Nothing about the constraint is softened; what
 * moved is where it starts biting, from the second weapon to about the third.
 */
const OPENING_FLOORS = 2;

/** Not exported: the only callers are inside this file (Headroom's opening state
 *  and the bank's size). Everything outside reads the LIVE rate off the instance —
 *  `headroom.regen` — because the pick cards raise it and a caller that reads the
 *  opening figure mid-run is reading a number that stopped being true. */
function regenPerBar(): number {
  return upkeepFloor() * OPENING_FLOORS;
}

/** What the pool tops out at. Sized off the floor so the whole economy scales
 *  with the ladders rather than against a magic number. */
function poolMaxDefault(): number {
  return upkeepFloor() * POOL_FLOORS;
}

function bankMaxDefault(): number {
  return regenPerBar() * BANK_BARS;
}

/** Why a bar line changed the band, for the toast and the run log. */
export interface BarLineOutcome {
  /** Voices switched off to make the coming bar affordable, most expensive
   *  first. Empty on an affordable bar. */
  brownedOut: Role[];
  /** Units banked this bar (0 unless the band drew less than regeneration). */
  banked: number;
  /** The coming bar's priced draw, after any brownout. */
  draw: number;
  /** True on the bar the bank reached full — the Blackout became available. */
  bankFilled: boolean;
}

/** The live economy. One instance per run, owned by the world.
 *
 *  Everything is in "trigger units": one unit is one chart event's worth of
 *  upkeep. The HUD paints the pool as a bar and the bank as a second, smaller
 *  one; no number reaches the screen, because a number is the spreadsheet
 *  #270's kill criterion warns about. */
export class Headroom {
  pool: number;
  poolMax: number;
  bank = 0;
  bankMax: number;
  /** Units of regeneration per bar. Raised by the run's own pick cards. */
  regen: number;
  /** Bars of Blackout a full bank buys. Raised by a pick card. */
  blackoutBars = BLACKOUT_BARS;
  /** Bars of Blackout left to run, counted down at each bar line. 0 = off. */
  blackoutBarsLeft = 0;
  /** Lifetime counters, for the run report and the hard-floor argument. */
  blackoutsUsed = 0;
  brownoutsSuffered = 0;
  /** Units drawn and units regenerated over the whole run: the two halves of
   *  "did the player actually go thin, and did they choose to". */
  drawnTotal = 0;
  bankedTotal = 0;

  constructor() {
    this.regen = regenPerBar();
    this.poolMax = poolMaxDefault();
    this.bankMax = bankMaxDefault();
    this.pool = this.poolMax;
  }

  get blackout(): boolean {
    return this.blackoutBarsLeft > 0;
  }

  get pool01(): number {
    return this.poolMax > 0 ? Math.max(0, Math.min(1, this.pool / this.poolMax)) : 0;
  }

  get bank01(): number {
    return this.bankMax > 0 ? Math.max(0, Math.min(1, this.bank / this.bankMax)) : 0;
  }

  get blackoutReady(): boolean {
    return !this.blackout && this.bank >= this.bankMax - 1e-6;
  }

  /** One trigger fired: pay for it. Free during a Blackout — that is what the
   *  bank bought. Never pushes the pool below zero; the shortfall is not a debt,
   *  it is a brownout waiting at the next bar line. */
  spendTrigger(): void {
    if (this.blackout) return;
    this.drawnTotal += PER_TRIGGER;
    this.pool = Math.max(0, this.pool - PER_TRIGGER);
  }

  /** A bed's continuous draw, paid smoothly across the bar it covers. */
  spendBed(roles: number, barsElapsed: number): void {
    if (this.blackout || roles <= 0 || barsElapsed <= 0) return;
    const amount = roles * BED_PER_BAR * barsElapsed;
    this.drawnTotal += amount;
    this.pool = Math.max(0, this.pool - amount);
  }

  /** Regeneration, paid continuously so the meter rises visibly rather than
   *  jumping at bar lines. `barsElapsed` is how much of a bar has passed, so the
   *  rate follows the venue's tempo for free: a fast room regenerates the same
   *  amount per BAR and therefore less per second. */
  regenerate(barsElapsed: number): void {
    if (barsElapsed <= 0) return;
    this.pool = Math.min(this.poolMax, this.pool + this.regen * barsElapsed);
  }

  /**
   * THE BAR LINE: price the coming bar and decide what plays.
   *
   * `active` is the band as the player has left it, in the order voices were
   * hired (so the readout and the number keys agree). `levelOf` prices each one
   * at its live level. Returns what changed and what it cost.
   *
   * Everything expensive happens here, once a bar, which is what keeps the
   * per-trigger drain from turning into a per-frame decision.
   */
  atBarLine(active: readonly Role[], levelOf: (role: Role) => number): BarLineOutcome {
    if (this.blackout) {
      this.blackoutBarsLeft -= 1;
      return { brownedOut: [], banked: 0, draw: 0, bankFilled: false };
    }
    const priced = active
      .map((role) => ({ role, cost: costPerBar(role, levelOf(role)) }))
      .sort((a, b) => b.cost - a.cost || a.role.localeCompare(b.role));
    let draw = priced.reduce((sum, entry) => sum + entry.cost, 0);
    // What the coming bar can actually be paid out of: what is in the pool plus
    // what will regenerate while it plays.
    const affordable = this.pool + this.regen;
    const brownedOut: Role[] = [];
    for (const entry of priced) {
      if (draw <= affordable + 1e-6) break;
      // Never brown out the last voice standing. The floor rule outranks the
      // budget: a player holding one weapon must always be able to play it, and
      // regeneration is priced so that one voice is always affordable — this
      // guard only fires if a pick card has somehow lowered regen below the
      // floor, and it fails toward playable.
      if (brownedOut.length >= priced.length - 1) break;
      brownedOut.push(entry.role);
      draw -= entry.cost;
    }
    if (brownedOut.length > 0) this.brownoutsSuffered += 1;
    const banked = Math.max(0, this.regen - draw);
    if (banked > 0) {
      const before = this.bank;
      this.bank = Math.min(this.bankMax, this.bank + banked);
      this.bankedTotal += this.bank - before;
    }
    const bankFilled = banked > 0 && this.bank >= this.bankMax - 1e-6;
    return { brownedOut, banked, draw, bankFilled };
  }

  /** Spend the bank. Returns false if it is not full — the Blackout is all or
   *  nothing, so a half bank cannot buy a half peak. */
  startBlackout(): boolean {
    if (!this.blackoutReady) return false;
    this.bank = 0;
    this.blackoutBarsLeft = this.blackoutBars;
    this.blackoutsUsed += 1;
    // The pool refills to full for the window, so the bar the Blackout ENDS on
    // is not instantly a brownout. The peak is paid for; the landing is not a
    // punishment on top.
    this.pool = this.poolMax;
    return true;
  }
}
