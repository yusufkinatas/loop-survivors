// THE CIRCUIT'S RUN STATE: the one object that holds a night together.
//
// Owned by RunWorld, read by the shell and the HUD. It exists so that the three
// layers can interlock without any of them reaching into the others: the venue
// asks the coverage wheel whether a door opens, the coverage wheel asks the band
// what is switched on, and the band is switched on or off by the upkeep budget.
// All three questions are answered here.

import { type Attack, type Role } from '../audio/kits';
import { Headroom, isBed } from './upkeep';
import { coveredAttacks, type Armour } from './coverage';
import {
  rollBill,
  venueAt,
  VENUES,
  type Venue,
  type VenueSet,
} from './venues';
import type { Rng } from '../game/rng';

/** Where the player is, at the resolution the whole stack cares about. */
export interface Place {
  venue: Venue | null;
  /** The set playing in that room tonight, or null on the street. */
  set: VenueSet | null;
  /** Seconds of this room's set that have actually been played. Stands still
   *  while the player is outside the room — see `Standing outside` below. */
  playedS: number;
  /** True once the door has been opened and the set has started. A dark room the
   *  player is standing in but cannot enter has `playing: false`. */
  playing: boolean;
}

export class CircuitRun {
  readonly headroom = new Headroom();
  /** Tonight's bill: which of each room's two sets is on. Rolled once per run. */
  readonly bill: Map<string, VenueSet>;
  /** Rooms whose sets have been survived to the end. */
  readonly finished = new Set<string>();
  /** The band's OFF switches. The same Set object the shell's number keys write
   *  to, handed in rather than duplicated — two copies of "what is playing" is
   *  how the coverage wheel and the doors would come to disagree. */
  readonly deactivated: Set<Role>;

  place: Place = { venue: null, set: null, playedS: 0, playing: false };
  /** The room the player is inside but has not been let into, if any: what the
   *  door readout is about. */
  blockedAt: Venue | null = null;
  /** Armour kinds the run has already explained. The matrix is taught once each,
   *  at the moment a hit bounces off one — see RunWorld.damageEnemy. */
  readonly taught = new Set<Armour>();

  /** Bars elapsed since the last bar line, accumulated from the audio clock's
   *  step rate. Drives continuous regeneration and bed draw. */
  private barFraction = 0;

  constructor(deactivated: Set<Role>, rng: Rng) {
    this.deactivated = deactivated;
    this.bill = rollBill(rng);
  }

  /** The band as it is PLAYING: owned, not muted. Everything downstream —
   *  the coverage wheel, the doors, the bar-line price — reads this and not
   *  `tiers`, which is the band as OWNED. #255's audibility rule in one getter:
   *  if a weapon is not audible it is not attacking, so it is not covering
   *  anything and it is not costing anything either. */
  activeBand(tiers: ReadonlyMap<Role, number>): Role[] {
    const out: Role[] = [];
    for (const [role, tier] of tiers) {
      if (tier > 0 && !this.deactivated.has(role)) out.push(role);
    }
    return out;
  }

  /** What the playing band can answer. During a Blackout everything you own is
   *  playing, so everything you own counts. */
  covered(tiers: ReadonlyMap<Role, number>): Set<Attack> {
    if (this.headroom.blackout) return coveredAttacks([...tiers.keys()]);
    return coveredAttacks(this.activeBand(tiers));
  }

  /**
   * WHETHER A BLACKOUT IS WORTH BUYING — a full bank, AND something switched off
   * to switch back on.
   *
   * The bank half is #255's rule ("a full bank buys a Blackout"). The second half
   * is #253's, mirrored: it asks that the drop be "hard-gated until there is
   * something worth stripping", and a peak deserves the same test from the other
   * side. With the whole band already playing, a Blackout buys four bars of free
   * upkeep and NOT ONE NEW NOTE — so offering it there teaches the player that the
   * run's one active verb sometimes does nothing, which is worse than not offering
   * it at all.
   *
   * Found by the harness, which spent its first bank at 0:33 on a one-weapon band
   * and produced a "peak" identical to the bar before it.
   */
  blackoutAvailable(): boolean {
    return this.headroom.blackoutReady && this.deactivated.size > 0;
  }

  /** Beds in the playing band — the voices that cost by the bar rather than by
   *  the trigger. A bed with no chart is invisible to `spendTrigger`, so this is
   *  the only way the texture seat ever pays for itself. */
  activeBeds(tiers: ReadonlyMap<Role, number>): number {
    let count = 0;
    for (const role of this.activeBand(tiers)) if (isBed(role)) count += 1;
    return count;
  }

  /** Advance the continuous half of the economy. `barsElapsed` is how much of a
   *  musical bar went by, which the shell derives from the live clock — so the
   *  economy follows the venue's tempo without knowing what a venue is. */
  tickEconomy(barsElapsed: number, beds: number, regenMul: number): void {
    if (barsElapsed <= 0) return;
    this.barFraction += barsElapsed;
    const before = this.headroom.regen;
    this.headroom.regen = before * regenMul;
    this.headroom.regenerate(barsElapsed);
    this.headroom.regen = before;
    this.headroom.spendBed(beds, barsElapsed);
  }

  /** How far through the current room's set the player is, 0..1. */
  setProgress01(): number {
    const { set, playedS, playing } = this.place;
    if (!set || !playing) return 0;
    return Math.max(0, Math.min(1, playedS / set.lengthS));
  }

  /** The room at a position, and the set booked into it tonight. */
  lookUp(x: number, y: number): { venue: Venue; set: VenueSet } | null {
    const venue = venueAt(x, y);
    if (!venue) return null;
    return { venue, set: this.bill.get(venue.id)! };
  }

  /** Rooms finished, which is what the Headliner's door counts. */
  get finishedCount(): number {
    return this.finished.size;
  }

  /** Every room and whether it is finished — the map readout's data. */
  roomStates(): { venue: Venue; set: VenueSet; finished: boolean }[] {
    return VENUES.map((venue) => ({
      venue,
      set: this.bill.get(venue.id)!,
      finished: this.finished.has(venue.id),
    }));
  }
}
