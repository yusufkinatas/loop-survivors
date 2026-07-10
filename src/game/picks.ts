// Arsenal auditions. Complexity and Power are deterministic level rewards and
// are freely distributed on the Mix board; the only random offer is which new
// instruments audition when lifetime Power opens an Arsenal slot.

import { soundsetSupports } from '../audio/soundset';
import { ROLES, type Role } from '../audio/kits';
import { EARLY_NUDGE_FACTOR, earlyNudgeApplies, slotFilled, slotOf } from './band';
import { arsenalCapacity, type Arsenal } from './progression';
import type { Rng } from './rng';

export type PickOption = { kind: 'arsenal'; role: Role };

export function rollOffers(
  arsenal: Arsenal,
  lifetimePower: number,
  rng: Rng,
  timeS: number,
): PickOption[] {
  if (arsenal.size >= arsenalCapacity(lifetimePower)) return [];
  const keyed = ROLES.filter(
    (role) => soundsetSupports(role) && !arsenal.has(role) && !slotFilled(slotOf(role), arsenal),
  ).map((role) => {
    const weight = earlyNudgeApplies(slotOf(role), timeS) ? EARLY_NUDGE_FACTOR : 1;
    return { role, key: Math.pow(rng(), 1 / weight) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, 3).map(({ role }) => ({ kind: 'arsenal', role }));
}
