// The pick economy's one source of truth. Offers are a weighted draw over new
// and upgraded weapons and take three. The pool is built in a fixed order.
//
// The band (docs/phases/the-band.md) shapes the pool and the draw: filling a
// slot permanently retires its other roster members (a fresh weapon is offered
// only while its slot is empty), an offer never shows two candidates for the
// same slot, and the weapon draw leans early toward the drum slots. All of it
// stays a pure function of tiers, rng, and time.

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
import {
  eligibleGear,
  type GearId,
} from './evolutions';

/** A normal reward: a new/tiered weapon or one silent Gear item. */
export type WeaponPickOption = { kind: 'weapon'; role: Role; tier: number };
export type PickOption =
  | WeaponPickOption
  | { kind: 'gear'; gear: GearId };

function buildPickPool(tiers: ReadonlyMap<Role, number>): WeaponPickOption[] {
  const pool: WeaponPickOption[] = [];
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
  gear: ReadonlySet<GearId>,
  rng: Rng,
  timeS: number,
): PickOption[] {
  const pool = buildPickPool(tiers);
  const keyed = pool.map((o) => ({ o, k: Math.pow(rng(), 1 / weaponWeight(o.role, timeS)) }));
  keyed.sort((a, b) => b.k - a.k);
  // One instrument candidate per slot per offer: walk the sorted draw and skip
  // a weapon whose band position is already spoken for this offer.
  const weapons: WeaponPickOption[] = [];
  const usedSlots = new Set<Slot>();
  for (const { o } of keyed) {
    if (weapons.length >= 3) break;
    const slot = slotOf(o.role);
    if (usedSlots.has(slot)) continue;
    usedSlots.add(slot);
    weapons.push(o);
  }

  const gearKeyed = eligibleGear(tiers, gear, timeS)
    .map((conf) => ({
      o: { kind: 'gear' as const, gear: conf.id },
      // A paired tier-II/III/IV weapon gives weight 1/2/3.
      k: Math.pow(rng(), 1 / Math.max(1, (tiers.get(conf.role) ?? 1) - 1)),
    }))
    .sort((a, b) => b.k - a.k);

  if (gearKeyed.length === 0) return weapons;
  if (weapons.length >= 2) return [...weapons.slice(0, 2), gearKeyed[0].o];
  return [...weapons, ...gearKeyed.slice(0, 3 - weapons.length).map(({ o }) => o)];
}
