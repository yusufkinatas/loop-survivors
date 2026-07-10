// The pick economy's one source of truth, shared by the game's level-up
// screen and the autoplay bot (docs/tools/autoplay-bot.md). Offers are a
// weighted draw over new/upgraded weapons. Both consumers roll with their own
// RNG (the game unseeded, the bot seeded) and take three. The rng->option
// mapping is deterministic: the pool is built in a fixed order (ROLES).
//
// The band (docs/phases/the-band.md) shapes the pool and the draw: filling a
// slot permanently retires its other roster members (a fresh weapon is offered
// only while its slot is empty), an offer never shows two candidates for the
// same slot, and the weapon draw leans early toward the drum slots. All of it
// stays a pure function of (tiers, rng, timeS) so bot runs and replays stay
// deterministic; changing it re-baselines the bot's comparative numbers.

import { TIER_COUNT } from '../audio/charts';
import { soundsetSupports } from '../audio/soundset';
import { ROLES, type Role } from '../audio/kits';
import {
  EARLY_NUDGE_FACTOR,
  earlyNudgeApplies,
  slotFilled,
  slotOf,
  type Slot,
} from './band';
import type { Rng } from './rng';

/** A level-up option: a new weapon or a tier-up of an owned one. */
export type PickOption = { kind: 'weapon'; role: Role; tier: number };

function buildPickPool(tiers: ReadonlyMap<Role, number>): PickOption[] {
  const pool: PickOption[] = [];
  for (const role of ROLES) {
    // The soundset is built around a subset of the catalog: a role it does not
    // support is never offered (nor voiced by the engine).
    if (!soundsetSupports(role)) continue;
    const tier = tiers.get(role);
    // Permanent picks (the band): a fresh instrument is offered only while its
    // slot is still empty — once a slot's drummer is hired, its roster rivals
    // leave the pool for the rest of the run. An owned instrument still tiers
    // up (its slot is its own).
    if (!tier) {
      if (!slotFilled(slotOf(role), tiers)) pool.push({ kind: 'weapon', role, tier: 1 });
    } else if (tier < TIER_COUNT) {
      pool.push({ kind: 'weapon', role, tier: tier + 1 });
    }
  }
  return pool;
}

const WEAPON_WEIGHT = 3;

/** A weapon option's draw weight: the base weapon weight, tilted by the early
 *  drum nudge. Pure in (role, timeS) — no rng. */
function weaponWeight(role: Role, timeS: number): number {
  let w = WEAPON_WEIGHT;
  if (earlyNudgeApplies(slotOf(role), timeS)) w *= EARLY_NUDGE_FACTOR;
  return w;
}

/** The three cards a level-up offers (fewer once the pool thins out). Weighted
 *  draw (Efraimidis-Spirakis: key = rng()^(1/weight), take the top three).
 *  The band caps the draw to one instrument candidate per slot per offer, so
 *  three cards always span three different band positions. */
export function rollOffers(
  tiers: ReadonlyMap<Role, number>,
  rng: Rng,
  timeS: number,
): PickOption[] {
  const pool = buildPickPool(tiers);
  const keyed = pool.map((o) => ({ o, k: Math.pow(rng(), 1 / weaponWeight(o.role, timeS)) }));
  keyed.sort((a, b) => b.k - a.k);
  // One instrument candidate per slot per offer: walk the sorted draw and skip
  // a weapon whose band position is already spoken for this offer.
  const out: PickOption[] = [];
  const usedSlots = new Set<Slot>();
  for (const { o } of keyed) {
    if (out.length >= 3) break;
    const slot = slotOf(o.role);
    if (usedSlots.has(slot)) continue;
    usedSlots.add(slot);
    out.push(o);
  }
  return out;
}
