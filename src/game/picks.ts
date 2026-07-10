// Hire offers (branch mixer-system): the only card screen left. Milestone
// level-ups (mixer.ts HIRE_LEVELS) offer up to three instruments, one per
// still-unopened band slot; everything else a level-up grants is points
// (+1 complexity, +1 power), spent in the mixer panel, not on cards.
//
// Shared by the game's hire screen and the autoplay bot. Both consumers roll
// with their own RNG (the game unseeded, the bot seeded); the rng->offer
// mapping is deterministic: the pool is built in fixed SLOTS x roster order
// and drawn with weighted keys (Efraimidis-Spirakis), one candidate per slot,
// keeping the early drum nudge.

import { soundsetSupports } from '../audio/soundset';
import type { Role } from '../audio/kits';
import {
  EARLY_NUDGE_FACTOR,
  earlyNudgeApplies,
  SLOT_ROSTER,
  SLOTS,
  slotOf,
  type Slot,
} from './band';
import type { Rng } from './rng';

/** Every hireable instrument given the current arsenal: supported roles whose
 *  band slot is still unowned. Fixed SLOTS x roster order (deterministic). */
export function buildHirePool(arsenal: readonly Role[]): Role[] {
  const ownedSlots = new Set<Slot>(arsenal.map((r) => slotOf(r)));
  const pool: Role[] = [];
  for (const slot of SLOTS) {
    if (ownedSlots.has(slot)) continue;
    for (const role of SLOT_ROSTER[slot]) {
      if (soundsetSupports(role)) pool.push(role);
    }
  }
  return pool;
}

/** The (up to) three hire cards a milestone level offers: weighted draw over
 *  the hire pool (early drum nudge intact), capped to one candidate per band
 *  slot so the cards always span three different positions. Empty once all
 *  supported slots are owned (the caller falls back to a point grant). */
export function rollHireOffers(
  arsenal: readonly Role[],
  rng: Rng,
  timeS: number,
): Role[] {
  const pool = buildHirePool(arsenal);
  const keyed = pool.map((role) => {
    const w = earlyNudgeApplies(slotOf(role), timeS) ? EARLY_NUDGE_FACTOR : 1;
    return { role, k: Math.pow(rng(), 1 / w) };
  });
  keyed.sort((a, b) => b.k - a.k);
  const out: Role[] = [];
  const usedSlots = new Set<Slot>();
  for (const { role } of keyed) {
    if (out.length >= 3) break;
    const slot = slotOf(role);
    if (usedSlots.has(slot)) continue;
    usedSlots.add(slot);
    out.push(role);
  }
  return out;
}
