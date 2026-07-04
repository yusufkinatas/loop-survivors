// The pick economy's one source of truth, shared by the game's level-up
// screen and the autoplay bot (docs/tools/autoplay-bot.md): unowned weapons
// enter at tier 1, owned ones offer their next tier, tier-4 weapons leave
// the pool. Both consumers shuffle with their own RNG (the game unseeded,
// the bot seeded) and offer three.

import { TIER_COUNT } from '../audio/charts';
import { ROLES, type Role } from '../audio/kits';
import type { Rng } from './rng';

/** A level-up option: a new weapon (tier 1) or a tier-up of an owned one. */
export interface PickOption {
  role: Role;
  tier: number;
}

export function buildPickPool(tiers: ReadonlyMap<Role, number>): PickOption[] {
  const pool: PickOption[] = [];
  for (const role of ROLES) {
    const tier = tiers.get(role);
    if (!tier) pool.push({ role, tier: 1 });
    else if (tier < TIER_COUNT) pool.push({ role, tier: tier + 1 });
  }
  return pool;
}

export function shuffleWith<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The three cards a level-up offers (fewer once the pool thins out). */
export function rollPickOptions(tiers: ReadonlyMap<Role, number>, rng: Rng): PickOption[] {
  return shuffleWith(buildPickPool(tiers), rng).slice(0, 3);
}
