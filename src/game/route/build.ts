// THE BUILD, under The Shell: what the band is playing, and the one thing that
// knows it.
//
// The base's build is `RunWorld.tiers` — a role and a number. That is exactly the
// model #247 exists to replace, because the number is simultaneously the damage
// and the notes. Here a shell carries four things instead, and only one of them
// is audible:
//
//   level    gameplay only. The module's stat table, eight rungs, SILENT.
//   pattern  the notes. All of them. This is the whole of what the band plays.
//   weight   what the tolls paid back. Damage and LOUDNESS, no notes.
//   dial     an optional live lever on the pattern's own density.
//
// Nothing here touches the engine, the world, or the DOM: this is a value the UI
// paints, `sync.ts` pushes into the engine, and the gate rules mutate. Keeping it
// that way is what makes the whole band re-derivable from scratch on every change
// — which is the only reason a mechanic as destructive as a toll can be trusted
// not to leave a voice half-converted.

import { getChart } from '../../audio/chartstore';
import { PALETTE_SEATS, type Role } from '../../audio/kits';
import type { Chart } from '../../audio/charts';
import { BUILD } from '../config';
import { chartStageForLevel, WEAPON_MAX_LEVEL } from '../weapons/levels';
import {
  heftFor,
  isBedRole,
  pattern,
  renderPattern,
  shapeMulFor,
  shellFits,
  silentChart,
  starterPattern,
  type Dial,
  type PatternBars,
  type PatternId,
} from './patterns';
import { toggles } from './toggles';

export type Seat = keyof typeof PALETTE_SEATS;

/** Which chair each voice takes. #266 shipped the palette UNGROUPED and left the
 *  grouping to each stack (#256); this stack uses the seat for two things only —
 *  the optional one-per-seat rule, and the bench's collision marks — and never
 *  to decide what a weapon does. */
export const SEAT_OF: Readonly<Partial<Record<Role, Seat>>> = (() => {
  const out: Partial<Record<Role, Seat>> = {};
  for (const [seat, roles] of Object.entries(PALETTE_SEATS) as [Seat, readonly Role[]][]) {
    for (const role of roles) out[role] = seat;
  }
  return out;
})();

export interface Shell {
  role: Role;
  /** 1..WEAPON_MAX_LEVEL. Buys the module's stat rung and a little loudness, and
   *  buys NO NOTES — which is the point. */
  level: number;
  /** What it is playing, or null: pulled out, and therefore silent, and therefore
   *  not attacking (the audibility rule). A bed is always null. */
  pattern: PatternId | null;
  /** Stacks paid back by the gates. */
  weight: number;
  dial: Dial;
}

/** Per level above the first. A level buys the module's stat rung and this — a
 *  voice that is a little more PRESENT in the mix.
 *
 *  This exists because the alternative is the disease. `docs/baseline/`
 *  found half of every weapon's levels inaudible and evolution inaudible too, and
 *  #273 confirmed it at nineteen voices: "an evolution buys GEOMETRY, and geometry
 *  makes no sound." Under The Shell a level cannot buy notes — the pattern owns
 *  those — so if it bought nothing audible either, eight of the ladder's rungs
 *  would be silent by construction. Loudness is the honest currency for power in
 *  a mix: pushing a weapon makes it LOUDER, not busier. */
const LEVEL_TRIM_DB = 0.35;

/** Per weight stack. Deliberately larger than a level: a toll is a sacrifice and
 *  has to be heard landing. */
const WEIGHT_TRIM_DB = 1.2;

/** Damage a weight stack multiplies by. */
const WEIGHT_DAMAGE_MUL = 1.3;

/**
 * HOW HEAVY ONE INSTRUMENT MAY GET, and it exists because a scripted route walk
 * broke without it.
 *
 * A route has eleven gates and the tolls pay onto whichever shell you name, so a
 * player who names the same one every time was ending a run at SEVENTEEN stacks:
 * eighty-six times the damage and twenty decibels over the rest of the band. That
 * is not concentration, it is a single voice eating the mix and the limiter with
 * it — and it makes every gate after the third a formality, because there is only
 * ever one right receiver.
 *
 * Four is a real transformation (nearly three times the damage, about five
 * decibels, four tolls to reach) and it means a route long enough to fill one
 * shell has to start filling a second. The cap is the reason a build ends up with
 * two or three heavy voices instead of one god and four passengers, which is a
 * more interesting arrangement as well as a survivable mix.
 */
export const WEIGHT_CAP = 4;

/** Footprint a weight stack multiplies by. Small: area compounds against a
 *  crowd, and a toll should read as CONCENTRATION rather than as a bigger blob. */
const WEIGHT_AREA_MUL = 1.08;

/** How many patterns the case holds. ONE, and it is load-bearing rather than
 *  arbitrary.
 *
 *  #255's valley for The Shell is "pull a pattern out — that shell goes silent,
 *  and you chose which one". With nowhere to put it, pulling is a permanent
 *  sacrifice and no player would ever do it twice, which would make the authored
 *  valley unreachable and the hard floor (#256: density must fall BECAUSE THE
 *  PLAYER CHOSE IT) unmeetable. One slot is the smallest thing that makes going
 *  thin reversible without turning the build into an inventory to shop from. */
const CASE_SLOTS = 1;

export class RouteBuild {
  /** Owned shells, ACQUISITION ORDER — the order the rack and the number keys
   *  read. Unlike the base's `tiers` this map is genuinely removed from (a gate
   *  can eat a whole instrument), so the rack renumbers when it does. Accepted:
   *  the number keys are a developer mechanism, and a build that loses an
   *  instrument should visibly lose its slot. */
  readonly shells = new Map<Role, Shell>();

  /** The one pattern you can carry unslotted. Null when empty. */
  case: PatternId | null = null;

  /** How long a pattern this build may hold — the progression axis the designer
   *  added to #255: start arranging one bar, unlock the second, then the fourth.
   *  Expressive room rather than a number, and it sits inside what the engine
   *  already does (a chart may be up to a phrase long). */
  unlockedBars: PatternBars = 1;

  /** Patterns this run has already been offered, so the loot does not repeat
   *  itself while there is anything new left to find. */
  readonly seenPatterns = new Set<PatternId>();

  // ---- ownership --------------------------------------------------------

  get count(): number {
    return this.shells.size;
  }

  /** Seats already filled. Only consulted when the one-per-seat layer is on. */
  filledSeats(): Set<Seat> {
    const seats = new Set<Seat>();
    for (const role of this.shells.keys()) {
      const seat = SEAT_OF[role];
      if (seat) seats.add(seat);
    }
    return seats;
  }

  /** Whether this build may take on this instrument. The flat cap always
   *  applies; the seat rule only when the layer is on. */
  canHire(role: Role): boolean {
    if (this.shells.has(role)) return false;
    if (this.shells.size >= BUILD.weaponCap) return false;
    if (!toggles().exclusive) return true;
    const seat = SEAT_OF[role];
    return !seat || !this.filledSeats().has(seat);
  }

  /** Take on an instrument. It arrives holding the plainest thing it can play
   *  (see `starterPattern` — the floor rule forbids a silent hire), or nothing at
   *  all if it is a bed, which has no notes to hold. */
  hire(role: Role): Shell {
    const existing = this.shells.get(role);
    if (existing) return existing;
    const shell: Shell = {
      role,
      level: 1,
      pattern: toggles().shells ? starterPattern(role) : null,
      weight: 0,
      dial: 0,
    };
    this.shells.set(role, shell);
    if (shell.pattern) this.seenPatterns.add(shell.pattern);
    return shell;
  }

  /** Give up an instrument entirely: the shell, its level, its pattern and its
   *  weight all go. Returns what was lost, for the toast. */
  release(role: Role): Shell | null {
    const shell = this.shells.get(role);
    if (!shell) return null;
    this.shells.delete(role);
    return shell;
  }

  levelUp(role: Role, by = 1): number {
    const shell = this.shells.get(role);
    if (!shell) return 0;
    const before = shell.level;
    shell.level = Math.min(WEAPON_MAX_LEVEL, shell.level + Math.max(0, Math.floor(by)));
    return shell.level - before;
  }

  levelDown(role: Role, by = 1): number {
    const shell = this.shells.get(role);
    if (!shell) return 0;
    const before = shell.level;
    shell.level = Math.max(1, shell.level - Math.max(0, Math.floor(by)));
    return before - shell.level;
  }

  /** Landed stacks, which may be fewer than asked for: a shell at the cap takes
   *  none, and the caller says so rather than pretending the toll paid. */
  addWeight(role: Role, stacks = 1): number {
    const shell = this.shells.get(role);
    if (!shell) return 0;
    const before = shell.weight;
    shell.weight = Math.min(WEIGHT_CAP, shell.weight + Math.max(0, Math.floor(stacks)));
    return shell.weight - before;
  }

  /** Whether this shell can take any more weight. Read by the gate so a capped
   *  shell is not offered as a receiver — a toll paid onto it would vanish. */
  canTakeWeight(role: Role): boolean {
    const shell = this.shells.get(role);
    return !!shell && shell.weight < WEIGHT_CAP;
  }

  /** Shells that could take a level (anything not already at the top). */
  levellable(): Shell[] {
    return [...this.shells.values()].filter((s) => s.level < WEAPON_MAX_LEVEL);
  }

  // ---- patterns ---------------------------------------------------------

  /** Slot a pattern, DESTRUCTIVELY: whatever was in there is gone, which is
   *  #255's own rule for this package ("one pattern per shell, swaps are
   *  destructive"). Returns what it displaced so the toast can name the loss —
   *  a swap the player cannot see the cost of is not a decision.
   *
   *  Refuses a pattern the shell cannot play (see `SHELL_CEILING`), so the
   *  arrangement can never be pushed into mud from any surface. */
  slot(role: Role, id: PatternId): { ok: boolean; displaced: PatternId | null } {
    const shell = this.shells.get(role);
    if (!shell || isBedRole(role) || !shellFits(role, pattern(id))) {
      return { ok: false, displaced: null };
    }
    const displaced = shell.pattern;
    shell.pattern = id;
    this.seenPatterns.add(id);
    return { ok: true, displaced };
  }

  /** Pull a pattern out into the case. THE VALLEY, in one verb: that shell goes
   *  silent and the player chose which one. Whatever was in the case is gone —
   *  the case holds one. */
  pull(role: Role): { ok: boolean; displaced: PatternId | null } {
    const shell = this.shells.get(role);
    if (!shell || !shell.pattern) return { ok: false, displaced: null };
    const displaced = this.case;
    this.case = shell.pattern;
    shell.pattern = null;
    void CASE_SLOTS; // one slot, stated as a constant so the reason is readable
    return { ok: true, displaced };
  }

  /** Put the case's pattern into a shell. The way back up out of the valley. */
  put(role: Role): { ok: boolean; displaced: PatternId | null } {
    if (!this.case) return { ok: false, displaced: null };
    const id = this.case;
    const result = this.slot(role, id);
    if (result.ok) this.case = result.displaced;
    return result;
  }

  /** Trade two shells' patterns. The only non-destructive arranging verb, and
   *  the one the bench is really for: the same notes, a different instrument
   *  playing them. */
  swap(a: Role, b: Role): boolean {
    const left = this.shells.get(a);
    const right = this.shells.get(b);
    if (!left || !right || a === b) return false;
    if (isBedRole(a) || isBedRole(b)) return false;
    if (right.pattern && !shellFits(a, pattern(right.pattern))) return false;
    if (left.pattern && !shellFits(b, pattern(left.pattern))) return false;
    const held = left.pattern;
    left.pattern = right.pattern;
    right.pattern = held;
    return true;
  }

  setDial(role: Role, dial: Dial): void {
    const shell = this.shells.get(role);
    if (shell) shell.dial = dial;
  }

  /** Open the next bar. One-way, and announced: 1 -> 2 -> 4. */
  unlockNextBar(): PatternBars | null {
    if (this.unlockedBars === 1) return (this.unlockedBars = 2);
    if (this.unlockedBars === 2) return (this.unlockedBars = 4);
    return null;
  }

  // ---- what the band is playing ----------------------------------------

  /** The chart one shell plays. With The Shell off this is the base's answer —
   *  the authored rung the level selects — so the toggle genuinely A/Bs the
   *  layer rather than approximating it. */
  chartFor(role: Role): Chart {
    const shell = this.shells.get(role);
    if (!shell) return silentChart(role);
    if (!toggles().shells) return getChart(role, chartStageForLevel(shell.level));
    if (!shell.pattern) return silentChart(role);
    return renderPattern(role, pattern(shell.pattern), toggles().dial ? shell.dial : 0);
  }

  /** Hits per bar this shell contributes. A bed contributes none: it is one
   *  continuous source the sequencer never triggers. */
  densityOf(role: Role): number {
    if (isBedRole(role)) return 0;
    const chart = this.chartFor(role);
    return chart.events.length / Math.max(1, chart.bars);
  }

  /** THE NUMBER THE HARD FLOOR IS ABOUT (#256): the whole band's hits per bar.
   *  `docs/baseline/` measured this climbing 2.00 -> 23.00 across a run and
   *  "never once falling". Every gate on this route is a chance to make it fall. */
  density(): number {
    let total = 0;
    for (const role of this.shells.keys()) total += this.densityOf(role);
    return total;
  }

  /** Voices actually making a sound right now. */
  playingCount(): number {
    let count = 0;
    for (const role of this.shells.keys()) {
      if (isBedRole(role) || this.densityOf(role) > 0) count += 1;
    }
    return count;
  }

  /** Per-trigger damage multiplier for this shell: the density compensation
   *  (`heftFor`) times what the tolls paid back. With The Shell off it is the
   *  toll's contribution alone, and with both layers off it is 1 — the base. */
  damageMulFor(role: Role): number {
    const shell = this.shells.get(role);
    if (!shell) return 1;
    return this.heftOf(role) * Math.pow(WEIGHT_DAMAGE_MUL, shell.weight);
  }

  heftOf(role: Role): number {
    const shell = this.shells.get(role);
    if (!shell || !toggles().shells) return 1;
    return heftFor(role, chartStageForLevel(shell.level), this.densityOf(role));
  }

  /** Footprint multiplier: a heavier hit sweeps wider. */
  areaMulFor(role: Role): number {
    const shell = this.shells.get(role);
    if (!shell) return 1;
    return shapeMulFor(this.heftOf(role)) * Math.pow(WEIGHT_AREA_MUL, shell.weight);
  }

  /** How much louder this voice sits in the mix than a fresh level-1 shell, in
   *  decibels. The only place power becomes audible in this stack. */
  trimDbFor(role: Role): number {
    const shell = this.shells.get(role);
    if (!shell || !toggles().shells) return 0;
    return (shell.level - 1) * LEVEL_TRIM_DB + shell.weight * WEIGHT_TRIM_DB;
  }

  // ---- legibility ------------------------------------------------------

  /**
   * Same-seat step collisions: pairs of shells in one chair landing on the same
   * steps, and how many steps they share.
   *
   * #266's arrangement rule was "no two voices in the same seat share a rhythm",
   * and it explained why: two voices far apart in pitch never fight, but two in
   * one seat on the same steps "read as one thicker, blurrier instrument, the way
   * two people singing the exact same note read as one louder person." That rule
   * was the AUTHOR's to keep. Under The Shell it becomes the player's, so the
   * bench has to show it — #255's own words for this package are that the fit is
   * "visible on the grid".
   *
   * Reported, never enforced. The one-per-seat toggle is the version that
   * enforces it, and whether enforcing beats showing is exactly what the A/B is
   * for.
   */
  collisions(): { a: Role; b: Role; steps: number }[] {
    const out: { a: Role; b: Role; steps: number }[] = [];
    const owned = [...this.shells.keys()].filter((role) => !isBedRole(role));
    for (let i = 0; i < owned.length; i++) {
      for (let j = i + 1; j < owned.length; j++) {
        const a = owned[i];
        const b = owned[j];
        if (!SEAT_OF[a] || SEAT_OF[a] !== SEAT_OF[b]) continue;
        const shared = sharedSteps(this.chartFor(a), this.chartFor(b));
        if (shared > 0) out.push({ a, b, steps: shared });
      }
    }
    return out;
  }

  /** A one-line description of the arrangement, for toasts and the run report. */
  describe(): string {
    const parts: string[] = [];
    for (const [role, shell] of this.shells) {
      const held = shell.pattern ? pattern(shell.pattern).name : isBedRole(role) ? 'held' : 'SILENT';
      parts.push(`${role} ${shell.level}${shell.weight ? `+${shell.weight}w` : ''} · ${held}`);
    }
    return parts.join(' | ');
  }
}

/** How many 16ths two charts land on together, compared over the phrase so a
 *  one-bar pattern and a four-bar one are measured where they actually meet. */
function sharedSteps(a: Chart, b: Chart): number {
  const phrase = 4 * 16;
  const expand = (chart: Chart): Set<number> => {
    const out = new Set<number>();
    const len = Math.max(1, chart.bars) * 16;
    for (const ev of chart.events) {
      for (let at = ev.step; at < phrase; at += len) out.add(at);
    }
    return out;
  };
  const left = expand(a);
  let shared = 0;
  for (const step of expand(b)) if (left.has(step)) shared += 1;
  return shared;
}
