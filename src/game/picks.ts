// The weapon-only pick economy shared by the live game and autoplay bot.
// A pick either hires a weapon into an empty band slot or raises an owned
// weapon by one authored tier. Passive items and detachable enhancements were
// deliberately removed in the House foundation refactor.

import { TIER_COUNT } from '../audio/charts';
import { supportedRoles } from '../audio/soundset';
import type { Role } from '../audio/kits';
import {
  EARLY_NUDGE_FACTOR,
  earlyNudgeApplies,
  slotFilled,
  slotOf,
  type Slot,
} from './band';
import type { Rng } from './rng';

export interface PickOption {
  role: Role;
  tier: number;
}

/** Every legal next weapon state in deterministic catalog order. */
export function buildPickPool(
  tiers: ReadonlyMap<Role, number>,
  catalog: readonly Role[] = supportedRoles(),
): PickOption[] {
  const pool: PickOption[] = [];
  for (const role of catalog) {
    const tier = tiers.get(role);
    if (!tier) {
      if (!slotFilled(slotOf(role), tiers)) pool.push({ role, tier: 1 });
    } else if (tier < TIER_COUNT) {
      pool.push({ role, tier: tier + 1 });
    }
  }
  return pool;
}

/**
 * Draw up to three weapon cards without replacement. The weighted random key
 * keeps the early Beat/Snap nudge while every other option has equal weight.
 * One card per band slot keeps each offer about three different decisions.
 */
export function rollOffers(
  tiers: ReadonlyMap<Role, number>,
  rng: Rng,
  timeS: number,
  catalog?: readonly Role[],
): PickOption[] {
  const keyed = buildPickPool(tiers, catalog).map((option) => {
    const weight = earlyNudgeApplies(slotOf(option.role), timeS) ? EARLY_NUDGE_FACTOR : 1;
    return { option, key: Math.pow(rng(), 1 / weight) };
  });
  keyed.sort((a, b) => b.key - a.key);

  const out: PickOption[] = [];
  const usedSlots = new Set<Slot>();
  for (const { option } of keyed) {
    if (out.length >= 3) break;
    const slot = slotOf(option.role);
    if (usedSlots.has(slot)) continue;
    usedSlots.add(slot);
    out.push(option);
  }
  return out;
}
