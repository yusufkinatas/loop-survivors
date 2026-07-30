// THE FRONTMAN (#271). The band plays itself and you play along with it.
//
// One weapon of your build stands at THE MIC. A miked weapon stops auto-firing —
// its chart goes quiet — and fires only when you press the placement key. Land on
// a tick of the run's feel and the hit is strong; land between ticks and it is
// weak. The skill is PLACEMENT, not mashing, and the thing that makes it
// placement rather than mashing is the per-bar budget: you get a handful of
// placements a bar and each tick can only be claimed once, so hammering the key
// spends the bar in half a second and gets almost nothing for it.
//
// Everything here is one axis expressed at three timescales:
//
//   structural  — how many of your weapons stand at the mic (0 .. the whole band)
//   economic    — whether a level-up buys the band's ladder or your hand's
//   momentary   — which ticks of this bar you spend your placements on
//
// and two synergies bridge the axis so it is a build rather than a slider (#248:
// synergy's legible form is a gated combination object, a thing you can point at):
//
//   hands -> band   THE CUE. A landed placement marks bodies. The band's next
//                   downbeat cashes every mark. You point, the band shoots.
//   band -> hands   THE CHARGE. Every band trigger that lands stacks a pip on
//                   the body it hit. A landed placement spends every pip in
//                   reach. The band loads, your hand fires.
//
// Both die at the ends of the axis and are strongest in the middle, which is what
// stops either end dominating: a pure band wastes its charge, and a solo player
// has no band to cash a cue or to load a pip.
//
// THIS FILE OWNS THE TIMING AND THE ECONOMY AND NOTHING ELSE. What a hit does to
// the world goes through FrontmanStage, the same shape as WeaponContext —
// queries in, effects out — so the hand never touches an entity array and this
// module never imports the world.

import { STEPS_PER_BAR } from '../audio/scale';
import { swingOffsetSteps } from '../audio/clock';
import { getChart } from '../audio/chartstore';
import type { ChartEvent } from '../audio/charts';
import type { Role } from '../audio/kits';
import { chartStageForLevel } from './weapons/levels';

// ---------------------------------------------------------------------------
// The feel: which steps of the bar your hand plays on
// ---------------------------------------------------------------------------

/** THE RUN-TO-RUN ROLL. A feel is the grid your hand plays on, and it changes
 *  what your hand physically does for a whole run — not just what the run sounds
 *  like. Named by feel and never by theory, per #255's L2 ceiling: no player-
 *  facing text here says "eighth", "offbeat" or "dotted".
 *
 *  `ticks` are steps of the bar on the engine's 16th grid. `windowMul` widens the
 *  tolerance where the ticks are further apart, so a sparse feel is not merely a
 *  harder version of a dense one — it is a slower, wider, more deliberate one. */
export interface Feel {
  id: FeelId;
  name: string;
  blurb: string;
  ticks: readonly number[];
  windowMul: number;
}

type FeelId = 'straight' | 'anchor' | 'push' | 'roll';

const FEELS: readonly Feel[] = [
  {
    id: 'straight',
    name: 'STRAIGHT',
    blurb: 'eight places a bar, evenly spread — the most room, the least margin',
    ticks: [0, 2, 4, 6, 8, 10, 12, 14],
    windowMul: 1,
  },
  {
    id: 'anchor',
    name: 'THE ANCHOR',
    blurb: 'four heavy places a bar, right on the pulse — wide and slow',
    ticks: [0, 4, 8, 12],
    windowMul: 1.5,
  },
  {
    id: 'push',
    name: 'THE PUSH',
    blurb: 'four places a bar, all of them between the beats — you never land with the drums',
    ticks: [2, 6, 10, 14],
    windowMul: 1.35,
  },
  {
    id: 'roll',
    name: 'THE ROLL',
    blurb: 'five places a bar that walk across the pulse — it comes round wrong on purpose',
    ticks: [0, 3, 6, 9, 12],
    windowMul: 1.2,
  },
];

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** The hand's numbers. Nothing here is a multiplier on AUTOMATIC output: every
 *  rank buys what your verb does or how often you may use it (#271). */
const HAND = {
  /** Seconds either side of a tick that still counts as landed, before the feel's
   *  own widening and before The Pocket's ranks. At 110 BPM one 16th step is
   *  136 ms and the straight feel's ticks are 273 ms apart, so this window covers
   *  a third of the bar — which is the number that decides whether hammering can
   *  approach placing, and tools/verify-frontman.ts prices exactly that. */
  windowS: 0.045,
  /** Placements a bar at rank 0. Fewer than the sparsest feel has ticks, so
   *  WHICH ticks you spend on is a choice from the first bar of the run. */
  placements: 3,
  /** A landed hit's damage against the miked weapon's own per-trigger number.
   *  Set so that a rank-0 hand at 3 placements a bar is worth a hair MORE than
   *  the chart it silenced — #255's floor rule says a player holding one weapon
   *  must always be able to play it, and the opening hands them the mic. */
  handMul: 2.6,
  /** A loose hit still fires and still sounds — it is just weak. Kept above zero
   *  so a miss is never a dead bar, and far enough below the groove ladder that
   *  spraying cannot approach placing. */
  looseMul: 0.2,
  /** Reach of the cue mark and the charge detonation, in world units. */
  reach: 190,
} as const;

/** THE GROOVE. Consecutive landed placements, and what the streak multiplies.
 *  This is the anti-mash mechanism that does not depend on the window alone: a
 *  loose hit resets the streak to zero, so a player spraying at a third accuracy
 *  never holds a rung, while a player placing deliberately climbs it and stays.
 *
 *  The top rung is deliberately modest. Making the streak worth a lot would put
 *  the whole skill gradient in one multiplier, and a player who dropped a streak
 *  late in a run would lose more than a bar's worth of play to one slip. The
 *  gradient lives in the loose penalty and the streak together. */
const GROOVE_LADDER: readonly { at: number; mul: number }[] = [
  { at: 0, mul: 1 },
  { at: 3, mul: 1.15 },
  { at: 6, mul: 1.3 },
  { at: 9, mul: 1.5 },
];

/** THE CUE — hands -> band. A landed placement marks bodies; the band's next
 *  downbeat cashes them. Burst scales with HOW MUCH BAND YOU KEPT, which is what
 *  makes it a synergy across the axis rather than a flat bonus: it is worth most
 *  to a build that plays with a band and worth nothing to a soloist. */
const CUE = {
  /** Damage per marked body per playing band voice, at rank 0. */
  perVoice: 14,
  /** Bodies one landed placement may mark. */
  count: 3,
} as const;

/** THE CHARGE — band -> hands. Each band trigger that lands stacks a pip; a
 *  landed placement spends every pip in reach. Worth nothing to a soloist and
 *  wasted by a band nobody is playing over. */
export const CHARGE = {
  /** Pips one body can hold. Past this the band is loading a full magazine and
   *  throwing the rest away — the visible cost of never using your hand. */
  max: 6,
  /** Damage per pip spent, at rank 0. */
  perPip: 9,
  /** Seconds a pip survives unspent. Long enough that the band can fill a body
   *  between two of your placements, short enough that charge is not a pool that
   *  quietly accumulates all run. */
  lifeS: 6,
} as const;

/** SOLO — the valley, and the one place a run's density falls because the player
 *  chose it. Auto-fire off entirely; only your hits count. */
export const SOLO = {
  /** Meter a landed placement fills, before the groove multiplier. Full is 100. */
  fillPerLanded: 1.6,
  /** How many voices must be playing before you may strip them. #253: the drop
   *  is hard-gated until there is something worth stripping — you cannot drop out
   *  of a kick and a snare. */
  minBandVoices: 3,
  /** Bars the band stays down. One phrase, so the return lands on a phrase line. */
  bars: 4,
  /** Hand damage while alone. Paid for in advance: the band's whole output is off
   *  for four bars, and this does not come close to replacing it. */
  handMul: 2.5,
  /** Placements a bar while alone — doubled, because there is nothing else
   *  playing and the job down here is to play. */
  placementMul: 2,
  /** THE RE-ENTRY. Damage to everything on screen per placement landed during the
   *  solo. The peak the player authored: they paid for it by going quiet, the job
   *  in the valley sized it, and the band comes back on the phrase line carrying
   *  it. */
  reentryPerLanded: 26,
} as const;

// ---------------------------------------------------------------------------
// The hand's ladders — the level-up currency
// ---------------------------------------------------------------------------

/** What a level-up buys when it does not buy the band. Five ladders of five, so
 *  the mic has 25 picks in it — deliberately sized to fill the hole #265
 *  measured, where the stripped base runs out of decisions at minute fourteen.
 *
 *  Named by what they do to your hand, never by the stat they scale. */
export const MIC_STATS = [
  { id: 'weight', name: 'THE WEIGHT', glyph: '▲', blurb: 'your hits land harder' },
  { id: 'hand', name: 'THE HAND', glyph: '▮', blurb: 'one more place to put a hit, every bar' },
  { id: 'pocket', name: 'THE POCKET', glyph: '⌖', blurb: 'a wider place to land in' },
  { id: 'reach', name: 'THE REACH', glyph: '◉', blurb: 'your hits touch further out' },
  { id: 'cash', name: 'THE CASH', glyph: '✦', blurb: 'the band pays your cues and your charge better' },
] as const;

export type MicStatId = (typeof MIC_STATS)[number]['id'];

export const MIC_MAX_RANK = 5;

/** What one rank adds. Flat steps, not percentages: a hand upgrade should read as
 *  "one more place to put a hit" rather than "+14% placement".
 *
 *  THE POCKET IS DELIBERATELY THE SMALLEST OF THEM. Widening the window reduces
 *  the skill the mechanic exists to test, so it buys forgiveness at a price: five
 *  ranks take the straight feel from a third of the bar to half of it, and every
 *  one of those ranks is a rank that did not buy output. A player who wants to
 *  land more reliably can, and pays for it — which is a build decision rather than
 *  a difficulty setting. */
const PER_RANK = {
  weight: 0.3,
  hand: 1,
  pocket: 0.005,
  reach: 26,
  cash: 0.36,
} as const;

/** THE CALL (package 20, hosted here per #271). Your sounds do not only damage
 *  bodies, they COMMAND them — and the command is far more legible coming from
 *  your hand than from an automatic weapon. Which order you give is its own
 *  one-off pick, so commanding is a build choice rather than a free rider. */
export type MicOrder = 'shove' | 'pull' | 'hold';

export const MIC_ORDERS: readonly { id: MicOrder; name: string; blurb: string }[] = [
  { id: 'shove', name: 'THE SHOVE', blurb: 'your hits throw the crowd outward' },
  { id: 'pull', name: 'THE PULL', blurb: 'your hits drag the crowd into one place' },
  { id: 'hold', name: 'THE HOLD', blurb: 'your hits stop the crowd where it stands' },
];

// ---------------------------------------------------------------------------
// The world surface
// ---------------------------------------------------------------------------

/** What the hand can ask the world to do. Queries in, effects out — the same
 *  shape as WeaponContext, and for the same reason: the hand is not allowed to
 *  reach into an entity array, so every one of these is a thing the world does
 *  and none of them hands an entity back. */
export interface FrontmanStage {
  readonly playerX: number;
  readonly playerY: number;
  /** Fire the miked weapon once at its owned level, with its per-trigger damage
   *  scaled by `damageMul`. Returns false when the role owns no gameplay. */
  handFire(role: Role, damageMul: number): boolean;
  /** Mark up to `count` bodies within `radius` for the band's next downbeat.
   *  Returns how many were marked. */
  markCues(x: number, y: number, radius: number, count: number): number;
  /** Cash every live cue: `perBody` damage each, marks cleared. Returns bodies
   *  hit. Called on the bar line — this is the band's downbeat. */
  cashCues(perBody: number, source: Role | undefined): number;
  /** Spend every charge pip within `radius`. Returns pips spent. */
  spendCharge(x: number, y: number, radius: number, perPip: number, source: Role | undefined): number;
  /** The Call: order every body within `radius`. Returns bodies ordered. */
  command(x: number, y: number, radius: number, order: MicOrder, power: number): number;
  /** Everything on screen takes `damage`. The re-entry. Returns bodies hit. */
  sweep(damage: number, source: Role | undefined): number;
  /** Cosmetic: a ring at a world point. */
  ring(x: number, y: number, radius: number, color: number, durS: number): void;
  /** Cosmetic: a labelled callout over the player. */
  callout(label: string, color: number): void;
}

/** Everything the shell has to do for the hand that is not the world's job:
 *  reading the grid and making sound. Kept as an interface so this module does
 *  not import the engine either. */
export interface FrontmanBand {
  /** The audio grid's last heard step, its time, and a step's duration. */
  anchor(): { step: number; time: number; stepDuration: number; swing: number } | null;
  /** Seconds between a scheduled audio time and the ear. */
  latencyS(): number;
  /** Play one event immediately, sound only. */
  strike(role: Role, ev: ChartEvent, gainMul: number): void;
  /** Re-apply whatever this voice's chart state should now be.
   *
   *  Deliberately not `setChartPlaying(role, on)`: three separate things can
   *  silence a voice — the dev toggle, the mic, a live solo — and only the shell
   *  composes them. A hand that asserted "on" would clobber the other two. */
  syncChart(role: Role): void;
}

// ---------------------------------------------------------------------------
// A placement, resolved
// ---------------------------------------------------------------------------

export type PlacementResult =
  | { kind: 'landed'; tick: number; offsetMs: number; groove: number; grooveMul: number; damageMul: number }
  | { kind: 'loose'; offsetMs: number; damageMul: number }
  | { kind: 'spent' }
  | { kind: 'taken'; tick: number }
  | { kind: 'silent' };

/** The live view the HUD paints. Everything the strip needs and nothing it does
 *  not, so the HUD never reads the mechanic's internals. */
export interface FrontmanReadout {
  micRole: Role | null;
  micEntering: Role | null | undefined;
  feel: Feel;
  /** Bar step the ear is on, or -1 when the transport is not running. */
  playhead: number;
  ticks: readonly number[];
  /** Bar steps already claimed this bar. */
  claimed: readonly number[];
  placementsLeft: number;
  placementsTotal: number;
  groove: number;
  grooveMul: number;
  soloMeter: number;
  soloReady: boolean;
  soloBarsLeft: number;
  soloLanded: number;
  ranks: Readonly<Record<MicStatId, number>>;
  order: MicOrder | null;
  lastOffsetMs: number | null;
  lastLanded: boolean | null;
}

// ---------------------------------------------------------------------------
// The mechanic
// ---------------------------------------------------------------------------

export class Frontman {
  private band: FrontmanBand;

  /** The weapon at the mic, or null for a hands-off run. */
  micRole: Role | null = null;
  /** A mic change scheduled for the next bar line. `undefined` means none is
   *  pending; `null` means "the mic is being emptied". */
  private micPending: Role | null | undefined = undefined;

  feel: Feel = FEELS[0];

  private ranks: Record<MicStatId, number> = {
    weight: 0, hand: 0, pocket: 0, reach: 0, cash: 0,
  };
  /** The Call's order, once picked. Null until then; a hit still damages. */
  order: MicOrder | null = null;

  /** Absolute grid step of the last bar line seen, so a new bar resets the
   *  budget exactly once however many times the caller asks. */
  private barStep = -1;
  private claimed = new Set<number>();
  private placementsLeft = 0;

  groove = 0;
  soloMeter = 0;
  /** Live solo, or null. `endsAtStep` is the absolute grid step the band returns
   *  on; `landed` is the job done down in the valley. */
  private soloState: { endsAtStep: number; landed: number } | null = null;
  /** Set while a solo is armed but the bar line has not arrived yet. */
  private soloArmed = false;

  /** Where the next hand hit takes its note from: charts are walked in order so
   *  the notes your hand plays are notes the weapon would have played, which is
   *  what keeps pillar 2 true — nothing the player does can put a wrong note in
   *  the mix, because they are not choosing notes at all. */
  private notePos = new Map<Role, number>();

  private lastOffsetMs: number | null = null;
  private lastLanded: boolean | null = null;

  /** Which layers are live. Every one is individually switchable so each earns
   *  its own verdict (#256). */
  layers = {
    mic: true,
    cue: true,
    charge: true,
    solo: true,
    feels: true,
    call: false,
    micCards: true,
    seatExclusive: false,
  };

  /** Live calibration for the gap between a key press and the sound the player
   *  was aiming at. Starts at the browser's own report and is nudged by the dev
   *  row, because the only instrument that can tell whether it is right is an
   *  ear and this build was made without one. */
  latencyBiasMs = 0;

  constructor(band: FrontmanBand) {
    this.band = band;
  }

  // -- run lifecycle --------------------------------------------------------

  /** Start a run: roll the feel, empty the mic, clear every ladder. */
  reset(rng: () => number = Math.random): void {
    this.micRole = null;
    this.micPending = undefined;
    this.feel = this.layers.feels
      ? FEELS[Math.min(FEELS.length - 1, Math.floor(rng() * FEELS.length))]
      : FEELS[0];
    this.ranks = { weight: 0, hand: 0, pocket: 0, reach: 0, cash: 0 };
    this.order = null;
    this.barStep = -1;
    this.claimed.clear();
    // Full, not empty. The first bar line of a run is a couple of seconds away and
    // a hand that cannot play until it arrives is a hand that does not work when
    // the player first presses the key.
    this.placementsLeft = HAND.placements;
    this.groove = 0;
    this.soloMeter = 0;
    this.soloState = null;
    this.soloArmed = false;
    this.notePos.clear();
    this.lastOffsetMs = null;
    this.lastLanded = null;
  }

  // -- the ladders ----------------------------------------------------------

  rank(stat: MicStatId): number {
    return this.ranks[stat];
  }

  rankUp(stat: MicStatId): number {
    this.ranks[stat] = Math.min(MIC_MAX_RANK, this.ranks[stat] + 1);
    return this.ranks[stat];
  }

  /** Ladders with a rank still to buy. `rollOffers` asks this. */
  openStats(): MicStatId[] {
    return MIC_STATS.map(({ id }) => id).filter((id) => this.ranks[id] < MIC_MAX_RANK);
  }

  get windowS(): number {
    return (HAND.windowS + PER_RANK.pocket * this.ranks.pocket) * this.feel.windowMul;
  }

  get reach(): number {
    return HAND.reach + PER_RANK.reach * this.ranks.reach;
  }

  get placementsPerBar(): number {
    const base = HAND.placements + PER_RANK.hand * this.ranks.hand;
    return this.soloState ? base * SOLO.placementMul : base;
  }

  get handMul(): number {
    const base = HAND.handMul + PER_RANK.weight * this.ranks.weight;
    return this.soloState ? base * SOLO.handMul : base;
  }

  get cashMul(): number {
    return 1 + PER_RANK.cash * this.ranks.cash;
  }

  get grooveMul(): number {
    let mul = 1;
    for (const rung of GROOVE_LADDER) if (this.groove >= rung.at) mul = rung.mul;
    return mul;
  }

  get soloing(): boolean {
    return this.soloState !== null;
  }

  // -- the mic -------------------------------------------------------------

  /** Cycle the mic through the owned weapons that can hold it, then past the end
   *  to nobody. Takes effect at the next bar line, like every other change to
   *  what the band is playing.
   *
   *  A TEXTURE VOICE CANNOT HOLD THE MIC. A bed has no triggers at all (Kit.bed)
   *  — it is one continuous source, so there is nothing for a hand to place. The
   *  caller filters; this only records. */
  cycleMic(candidates: readonly Role[]): Role | null {
    const current = this.micPending !== undefined ? this.micPending : this.micRole;
    const at = current === null ? -1 : candidates.indexOf(current);
    const next = at + 1 >= candidates.length ? null : candidates[at + 1];
    this.micPending = next;
    return next;
  }

  /** The mic change lands. Called from the shell's bar-line callback. */
  settleMic(): { was: Role | null; now: Role | null } | null {
    if (this.micPending === undefined) return null;
    const was = this.micRole;
    this.micRole = this.micPending;
    this.micPending = undefined;
    if (was === this.micRole) return null;
    // A weapon leaving the mic goes back to playing itself; the one arriving goes
    // quiet. Density falls the moment the player takes an instrument — that is
    // the whole of the structural half of the axis.
    if (was) this.band.syncChart(was);
    if (this.micRole) this.band.syncChart(this.micRole);
    this.groove = 0;
    return { was, now: this.micRole };
  }

  get micPendingRole(): Role | null | undefined {
    return this.micPending;
  }

  /** The mic must let go of a weapon the build no longer has (the sandbox's
   *  loadout editor can take one away underneath it). */
  forgetRole(role: Role): void {
    if (this.micPending === role) this.micPending = undefined;
    if (this.micRole === role) {
      this.micRole = null;
      this.groove = 0;
    }
  }

  // -- the bar -------------------------------------------------------------

  /** A bar line arrived at absolute grid step `step`. Refills the budget, cashes
   *  the cues the band's downbeat owes, and returns the solo the phrase line
   *  ended so the shell can bring the band back.
   *
   *  Idempotent per bar: called from a bar-line callback that the shell re-arms,
   *  and a duplicate call for the same bar does nothing. */
  onBarLine(step: number, stage: FrontmanStage, bandVoices: number): {
    cued: number;
    reentry: { landed: number; damage: number } | null;
    soloStarted: boolean;
  } {
    const out = { cued: 0, reentry: null as { landed: number; damage: number } | null, soloStarted: false };
    if (step === this.barStep) return out;
    this.barStep = step;
    this.claimed.clear();

    // The band's downbeat cashes what your hand marked. Worth what the band is,
    // so it grows with every voice you left playing and pays a soloist nothing.
    if (this.layers.cue && bandVoices > 0) {
      const perBody = CUE.perVoice * bandVoices * this.cashMul;
      out.cued = stage.cashCues(perBody, this.micRole ?? undefined);
      if (out.cued > 0) stage.ring(stage.playerX, stage.playerY, 120, 0x76ff92, 0.32);
    }

    // A solo armed last bar starts on this line, and a live one may end on it.
    if (this.soloArmed) {
      this.soloArmed = false;
      this.soloState = { endsAtStep: step + SOLO.bars * STEPS_PER_BAR, landed: 0 };
      this.soloMeter = 0;
      this.groove = 0;
      out.soloStarted = true;
    } else if (this.soloState && step >= this.soloState.endsAtStep) {
      const landed = this.soloState.landed;
      this.soloState = null;
      const damage = SOLO.reentryPerLanded * landed * this.cashMul;
      if (damage > 0) stage.sweep(damage, this.micRole ?? undefined);
      out.reentry = { landed, damage };
    }

    this.placementsLeft = Math.floor(this.placementsPerBar);
    return out;
  }

  // -- solo ----------------------------------------------------------------

  soloReady(bandVoices: number): boolean {
    return (
      this.layers.solo &&
      !this.soloState &&
      !this.soloArmed &&
      this.soloMeter >= 100 &&
      bandVoices >= SOLO.minBandVoices
    );
  }

  /** Arm the solo. The band goes down on the next bar line, never mid-bar. */
  armSolo(bandVoices: number): boolean {
    if (!this.soloReady(bandVoices)) return false;
    this.soloArmed = true;
    return true;
  }

  get soloArming(): boolean {
    return this.soloArmed;
  }

  /** Placements landed so far in the live solo — the job in the valley, and what
   *  sizes the re-entry. */
  get soloLanded(): number {
    return this.soloState?.landed ?? 0;
  }

  soloBarsLeft(step: number): number {
    if (!this.soloState) return 0;
    return Math.max(0, Math.ceil((this.soloState.endsAtStep - step) / STEPS_PER_BAR));
  }

  // -- the placement -------------------------------------------------------

  /** The player pressed the key. Resolve it against the grid, spend the budget,
   *  fire the weapon and pay out both synergies.
   *
   *  `pressedAt` is the audio-clock instant of the press. It is compared against
   *  where the tick is HEARD, not where it is scheduled — the output latency and
   *  the shuffle both move the ear's beat away from the arithmetic one, and a
   *  player aiming at what they hear must not be punished for either. */
  place(stage: FrontmanStage, pressedAt: number, tiers: ReadonlyMap<Role, number>): PlacementResult {
    if (!this.layers.mic) return { kind: 'silent' };
    const role = this.micRole;
    if (!role || !tiers.get(role)) return { kind: 'silent' };
    const anchor = this.band.anchor();
    if (!anchor) return { kind: 'silent' };
    if (this.placementsLeft <= 0) return { kind: 'spent' };

    // Where the ear was when the key went down.
    const heardAt = pressedAt - this.band.latencyS() - this.latencyBiasMs / 1000;
    const nearest = this.nearestTick(anchor, heardAt);
    const offsetS = heardAt - nearest.time;
    const landed = Math.abs(offsetS) <= this.windowS;
    const offsetMs = Math.round(offsetS * 1000);
    this.lastOffsetMs = offsetMs;
    this.lastLanded = landed;

    // ONE PLACEMENT PER TICK. Without this, mashing on top of a single strong
    // tick would beat spreading placements across the bar, and the budget would
    // stop being an allocation.
    if (landed && this.claimed.has(nearest.step)) return { kind: 'taken', tick: nearest.barStep };

    this.placementsLeft -= 1;
    if (landed) {
      this.claimed.add(nearest.step);
      this.groove += 1;
      if (this.soloState) this.soloState.landed += 1;
      this.soloMeter = Math.min(100, this.soloMeter + SOLO.fillPerLanded * this.grooveMul);
    } else {
      this.groove = 0;
    }

    const grooveMul = this.grooveMul;
    const damageMul = this.handMul * (landed ? grooveMul : HAND.looseMul);
    this.strikeSound(role, tiers, landed ? 1 : 0.42);
    stage.handFire(role, damageMul);

    if (landed) {
      const reach = this.reach;
      if (this.layers.cue) stage.markCues(stage.playerX, stage.playerY, reach, CUE.count);
      if (this.layers.charge) {
        stage.spendCharge(stage.playerX, stage.playerY, reach, CHARGE.perPip * this.cashMul, role);
      }
      if (this.layers.call) {
        stage.command(stage.playerX, stage.playerY, reach, this.order ?? 'shove', grooveMul);
      }
    }

    // `damageMul` rides out on the result because it is THE MECHANIC'S OWN
    // GRADIENT — what placing is worth against hammering, before any weapon's
    // shape gets involved. tools/verify-frontman.ts sums it, which is the only way
    // to price the kill criterion without a weapon's own quirks in the number: the
    // kick keeps ONE floor strip alive at a time, so firing it three times a bar
    // deals nearly the same damage however hard each fire hit.
    return landed
      ? { kind: 'landed', tick: nearest.barStep, offsetMs, groove: this.groove, grooveMul, damageMul }
      : { kind: 'loose', offsetMs, damageMul };
  }

  /** THE RE-ENTRY FILL. A short run of hits across the whole band on the phrase
   *  line the band comes back on — a drum roll into a chorus, in the game's own
   *  voices. The one place in this branch where something ADDS triggers rather
   *  than removing them, and it exists because a peak the player paid four bars
   *  of silence for has to be audible as well as lethal. */
  fill(roles: readonly Role[], tiers: ReadonlyMap<Role, number>, strength: number): void {
    if (roles.length === 0 || strength <= 0) return;
    const hits = Math.min(14, 4 + Math.floor(strength));
    for (let i = 0; i < hits; i++) {
      const role = roles[i % roles.length];
      this.strikeSound(role, tiers, 0.7 + 0.3 * (i / hits));
    }
  }

  /** The sound half of a hand hit: the miked weapon's own kit, playing the next
   *  note its own chart would have played. */
  private strikeSound(role: Role, tiers: ReadonlyMap<Role, number>, gainMul: number): void {
    const level = tiers.get(role) ?? 1;
    const chart = getChart(role, chartStageForLevel(level));
    const events = chart.events;
    let ev: ChartEvent = { step: 0, velocity: 0.95 };
    if (events.length > 0) {
      const at = (this.notePos.get(role) ?? 0) % events.length;
      this.notePos.set(role, at + 1);
      ev = { ...events[at], step: 0 };
    }
    this.band.strike(role, ev, gainMul);
  }

  /** The heard time of the tick nearest `at`, by extrapolation from the anchor.
   *  Reaches steps the lookahead has not queued and steps it has dropped, and
   *  adds the shuffle per step exactly as the clock does. */
  private nearestTick(
    anchor: { step: number; time: number; stepDuration: number; swing: number },
    at: number,
  ): { step: number; barStep: number; time: number } {
    const dur = anchor.stepDuration;
    const timeOf = (step: number): number =>
      anchor.time + (step - anchor.step) * dur + swingOffsetSteps(step, anchor.swing) * dur;
    // Search the two bars around the anchor; the window is a fraction of a step,
    // so the answer is always inside it, and 32 candidates a press is nothing.
    const from = anchor.step - STEPS_PER_BAR;
    let best = { step: from, barStep: 0, time: timeOf(from) };
    let bestGap = Infinity;
    for (let step = from; step <= anchor.step + STEPS_PER_BAR; step++) {
      const barStep = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
      if (!this.feel.ticks.includes(barStep)) continue;
      const time = timeOf(step);
      const gap = Math.abs(at - time);
      if (gap < bestGap) {
        bestGap = gap;
        best = { step, barStep, time };
      }
    }
    return best;
  }

  // -- the readout ---------------------------------------------------------

  readout(currentStep: number, bandVoices: number): FrontmanReadout {
    return {
      micRole: this.micRole,
      micEntering: this.micPending,
      feel: this.feel,
      playhead: currentStep < 0 ? -1 : ((currentStep % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR,
      ticks: this.feel.ticks,
      claimed: [...this.claimed].map(
        (step) => ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR,
      ),
      placementsLeft: this.placementsLeft,
      placementsTotal: Math.floor(this.placementsPerBar),
      groove: this.groove,
      grooveMul: this.grooveMul,
      soloMeter: this.soloMeter,
      soloReady: this.soloReady(bandVoices) || this.soloArmed,
      soloBarsLeft: this.soloBarsLeft(currentStep),
      soloLanded: this.soloLanded,
      ranks: { ...this.ranks },
      order: this.order,
      lastOffsetMs: this.lastOffsetMs,
      lastLanded: this.lastLanded,
    };
  }
}
