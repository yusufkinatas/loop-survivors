// The weapon gameplay ladder, and the one bridge from it to the sound.
//
// TWO LADDERS, NOT ONE. A weapon's LEVEL is a gameplay number: it indexes the
// module's stat table and its pedestal copy, the offer roll caps on it, the
// HUD counts pips with it. A CHART STAGE is an audio number: one of the
// hand-authored ladder rungs in src/audio/ladders (TIER_COUNT,
// src/audio/charts.ts). The two are equal today — four levels, level N plays
// stage N — but they are not the same concept, and chartStageForLevel is the
// only place they meet.

import { TIER_COUNT } from '../../audio/charts';

/** How far a weapon can be levelled. Owned by the gameplay side; nothing here
 *  is derived from the chart ladder's length. */
export const WEAPON_MAX_LEVEL = 4;

/** A table with exactly one entry per weapon level — a tuple, so a table that
 *  does not cover the whole ladder is a type error rather than an undefined
 *  lookup mid-run. */
export type PerWeaponLevel<T> = LevelTuple<T, typeof WEAPON_MAX_LEVEL>;

type LevelTuple<T, N extends number, A extends T[] = []> =
  A['length'] extends N ? readonly [...A] : LevelTuple<T, N, [...A, T]>;

/** Weapon level -> chart stage: the ONLY path by which a gameplay level
 *  reaches the audio engine, which never sees anything but 1..TIER_COUNT.
 *  Identity while the two ladders are the same length; a longer gameplay
 *  ladder bands onto the same four authored stages here and nowhere else. */
export function chartStageForLevel(level: number): number {
  return Math.max(1, Math.min(TIER_COUNT, Math.floor(level)));
}
