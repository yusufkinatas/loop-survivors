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
import { EVOLVED_TIER, canEvolve } from './evolutions';
import type { Rng } from './rng';

/** A level-up option: a new weapon, a tier-up of an owned one, or (at tier
 *  EVOLVED_TIER) a maxed weapon's evolution. */
export type PickOption = { kind: 'weapon'; role: Role; tier: number };

/** Whether an option is an evolution card (its tier is the evolved tier). */
export function isEvolutionOption(o: PickOption): boolean {
  return o.tier === EVOLVED_TIER;
}

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
    } else if (canEvolve(role, tiers)) {
      // Maxed with an evolution: the tier-4 weapon no longer leaves the pool —
      // it contributes its evolution card (docs/phases/weapon-evolutions.md).
      // Once evolved (tier EVOLVED_TIER) it drops out for good.
      pool.push({ kind: 'weapon', role, tier: EVOLVED_TIER });
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
 *  three cards always span three different band positions.
 *
 *  Evolution cards are GUARANTEED (docs/phases/weapon-evolutions.md): every
 *  eligible evolution takes one of the offer's slots before the weighted draw
 *  fills the rest, so a maxed weapon's payoff is never hidden behind a bad
 *  roll. Each evolving weapon owns its slot, so a guaranteed card never
 *  collides with a tier-up of the same slot. */
export function rollOffers(
  tiers: ReadonlyMap<Role, number>,
  rng: Rng,
  timeS: number,
): PickOption[] {
  const pool = buildPickPool(tiers);
  const out: PickOption[] = [];
  const usedSlots = new Set<Slot>();
  // Guaranteed first: every eligible evolution card (up to the three-card cap).
  for (const o of pool) {
    if (out.length >= 3) break;
    if (!isEvolutionOption(o)) continue;
    const slot = slotOf(o.role);
    if (usedSlots.has(slot)) continue;
    usedSlots.add(slot);
    out.push(o);
  }
  // Then the weighted draw fills the remaining slots.
  const keyed = pool
    .filter((o) => !isEvolutionOption(o))
    .map((o) => ({ o, k: Math.pow(rng(), 1 / weaponWeight(o.role, timeS)) }));
  keyed.sort((a, b) => b.k - a.k);
  // One instrument candidate per slot per offer: walk the sorted draw and skip
  // a weapon whose band position is already spoken for this offer.
  for (const { o } of keyed) {
    if (out.length >= 3) break;
    const slot = slotOf(o.role);
    if (usedSlots.has(slot)) continue;
    usedSlots.add(slot);
    out.push(o);
  }
  return out;
}
