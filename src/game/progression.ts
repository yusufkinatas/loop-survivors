import type { Role } from '../audio/kits';

export const MAX_POWER = 5;
export const STARTING_COMPLEXITY = 16;
export const COMPLEXITY_PER_LEVEL = 4;
export const POWER_PER_LEVEL = 1;

export interface WeaponState {
  /** Literal triggers scheduled in every complete four-bar phrase. */
  complexity: number;
  power: number;
  active: boolean;
  activePhrases: number;
  restPhrases: number;
  strain: number;
  comebackPhrases: number;
  overplayed: boolean;
}

export type Arsenal = ReadonlyMap<Role, WeaponState>;

export interface MixBudgets {
  complexity: number;
  power: number;
  lifetimePower: number;
}

export const ARSENAL_POWER_THRESHOLDS = [1, 3, 5, 7, 9, 12, 15, 18] as const;

export function arsenalCapacity(lifetimePower: number): number {
  let capacity = 1;
  for (let i = 1; i < ARSENAL_POWER_THRESHOLDS.length; i++) {
    if (lifetimePower >= ARSENAL_POWER_THRESHOLDS[i]) capacity = i + 1;
  }
  return capacity;
}

export function nextArsenalThreshold(lifetimePower: number): number | null {
  return ARSENAL_POWER_THRESHOLDS.find((n) => n > lifetimePower) ?? null;
}

export function allocatedComplexity(arsenal: Arsenal): number {
  let total = 0;
  for (const weapon of arsenal.values()) total += weapon.complexity;
  return total;
}

export function allocatedPower(arsenal: Arsenal): number {
  let total = 0;
  for (const weapon of arsenal.values()) total += weapon.power;
  return total;
}

export function newWeaponState(complexity = 0, power = 0): WeaponState {
  return {
    complexity,
    power,
    active: complexity > 0 && power > 0,
    activePhrases: 0,
    restPhrases: 0,
    strain: 0,
    comebackPhrases: 0,
    overplayed: false,
  };
}
