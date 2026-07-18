// Dedicated opening-weapon selection. This deliberately does not use the
// level-up offer economy: a new round samples only unlocked, live weapons and
// choosing one consumes the entire opening selection without granting XP.

import { type Role } from '../audio/kits';
import { soundsetSupports, supportedRoles } from '../audio/soundset';
import type { Rng } from './rng';

export const STARTING_WEAPON_CHOICE_COUNT = 3;

export interface StartingWeaponSelection {
  readonly offered: readonly Role[];
  readonly selected: Role | null;
}

/** Clamp hostile/injected RNG values to a valid array index. */
function randomIndex(rng: Rng, length: number): number {
  if (length <= 1) return 0;
  const drawn = rng();
  const normalized = Number.isFinite(drawn)
    ? Math.max(0, Math.min(1 - Number.EPSILON, drawn))
    : 0.5;
  return Math.floor(normalized * length);
}

function sampleWithoutReplacement(pool: readonly Role[], count: number, rng: Rng): Role[] {
  const shuffled = [...pool];
  const take = Math.min(Math.max(0, Math.floor(count)), shuffled.length);
  for (let i = 0; i < take; i++) {
    const next = i + randomIndex(rng, shuffled.length - i);
    [shuffled[i], shuffled[next]] = [shuffled[next], shuffled[i]];
  }
  return shuffled.slice(0, take);
}

/**
 * Roll up to three distinct starting weapons from the unlocked live catalog.
 *
 * A malformed/legacy save can theoretically expose no unlocked live weapon.
 * In that case, return one randomly selected supported weapon so the round is
 * still playable. The soundset validates that at least one supported role
 * ships, but the final empty guard keeps this helper total in isolation.
 */
export function rollStartingWeapons(
  unlockedRoles: Iterable<Role>,
  rng: Rng,
): Role[] {
  const unlocked = new Set(unlockedRoles);
  const live = supportedRoles();
  const available = live.filter((role) => unlocked.has(role) && soundsetSupports(role));
  if (available.length > 0) {
    return sampleWithoutReplacement(available, STARTING_WEAPON_CHOICE_COUNT, rng);
  }
  return live.length > 0
    ? sampleWithoutReplacement(live, 1, rng)
    : [];
}

export function createStartingWeaponSelection(
  unlockedRoles: Iterable<Role>,
  rng: Rng,
): StartingWeaponSelection {
  return { offered: rollStartingWeapons(unlockedRoles, rng), selected: null };
}

/**
 * Resolve exactly one offered opening weapon. A successful choice consumes
 * every pedestal; stale, duplicated, or already-resolved collection attempts
 * return null and cannot replace the selection.
 */
export function chooseStartingWeapon(
  selection: StartingWeaponSelection,
  role: Role,
): StartingWeaponSelection | null {
  if (selection.selected !== null || !selection.offered.includes(role)) return null;
  return { offered: [], selected: role };
}
