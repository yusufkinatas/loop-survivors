// The weapon gameplay ladder, and the one bridge from it to the sound.
//
// TWO LADDERS, NOT ONE. A weapon's LEVEL is a gameplay number: it indexes the
// module's stat table and its pedestal copy, the offer roll caps on it, the
// HUD counts pips with it. A CHART STAGE is an audio number: one of the
// hand-authored ladder rungs in src/audio/ladders (TIER_COUNT,
// src/audio/charts.ts). The gameplay ladder is twice as long as the chart one —
// eight levels over four authored stages — and chartStageForLevel is the only
// place they meet.

import { TIER_COUNT } from '../../audio/charts';

/** How far a weapon can be levelled. Owned by the gameplay side; nothing here
 *  is derived from the chart ladder's length. */
export const WEAPON_MAX_LEVEL = 8;

/** A table with exactly one entry per weapon level — a tuple, so a table that
 *  does not cover the whole ladder is a type error rather than an undefined
 *  lookup mid-run. */
export type PerWeaponLevel<T> = LevelTuple<T, typeof WEAPON_MAX_LEVEL>;

type LevelTuple<T, N extends number, A extends T[] = []> =
  A['length'] extends N ? readonly [...A] : LevelTuple<T, N, [...A, T]>;

/** Weapon level -> chart stage: the ONLY path by which a gameplay level
 *  reaches the audio engine, which never sees anything but 1..TIER_COUNT.
 *  The uniform two-per-stage banding of the player-power spec §3 — levels 1-2
 *  play stage 1, 3-4 stage 2, 5-6 stage 3, 7-8 stage 4 — so the sound (and with
 *  it trigger density) steps at levels 3, 5 and 7 and the even levels are
 *  payload-only. The four authored stages are untouched. */
export function chartStageForLevel(level: number): number {
  return Math.max(1, Math.min(TIER_COUNT, Math.ceil(Math.floor(level) / 2)));
}
