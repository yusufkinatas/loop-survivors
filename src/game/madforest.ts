// Clean-room stage data for the first eight minutes of Mad Forest's normal
// rules. This file intentionally contains mechanics and numeric parameters
// only; no source assets, code, map art, or UI are copied.

import type { EnemyKind } from './config';

export interface StageWave {
  atS: number;
  /** One spawn attempt creates one of every entry; duplicates are meaningful. */
  pattern: readonly EnemyKind[];
  /** Live regular-enemy floor. A spawn attempt backfills to this number. */
  minimum: number;
  intervalS: number;
}

export type StageEvent =
  | { atS: number; type: 'boss'; kind: 'glowingBat' | 'mantis'; rewardChance: number }
  | { atS: number; type: 'batSweep'; count: number; chance: number }
  | { atS: number; type: 'flowerWall'; count: number; durationS: number };

/** Current normal Mad Forest starts with ten enemies already in play. */
export const STAGE_STARTING_SPAWNS = 10;

/** The user's run remains the locked eight-minute arc, so rows 0:00-7:59
 * are reproduced one-for-one rather than compressing thirty minutes. */
export const STAGE_WAVES: readonly StageWave[] = [
  { atS: 0, pattern: ['redBat2'], minimum: 15, intervalS: 1 },
  { atS: 60, pattern: ['zombie', 'bat'], minimum: 30, intervalS: 1 },
  { atS: 120, pattern: ['bat', 'redBat', 'redBat2'], minimum: 50, intervalS: 0.5 },
  { atS: 180, pattern: ['skeleton'], minimum: 40, intervalS: 0.25 },
  { atS: 240, pattern: ['skeleton', 'ghost'], minimum: 30, intervalS: 1 },
  { atS: 300, pattern: ['greenMudman'], minimum: 10, intervalS: 1 },
  { atS: 360, pattern: ['zombie', 'greenMudman'], minimum: 20, intervalS: 0.5 },
  { atS: 420, pattern: ['redBat', 'redBat2', 'grayMudman'], minimum: 80, intervalS: 0.5 },
] as const;

export const STAGE_EVENTS: readonly StageEvent[] = [
  { atS: 60, type: 'boss', kind: 'glowingBat', rewardChance: 0.3 },
  { atS: 125, type: 'batSweep', count: 50, chance: 1 },
  { atS: 130, type: 'batSweep', count: 50, chance: 1 },
  { atS: 135, type: 'batSweep', count: 50, chance: 1 },
  { atS: 180, type: 'boss', kind: 'glowingBat', rewardChance: 0.43 },
  { atS: 185, type: 'batSweep', count: 50, chance: 0.1 },
  { atS: 190, type: 'batSweep', count: 50, chance: 0.1 },
  { atS: 245, type: 'batSweep', count: 50, chance: 0.1 },
  { atS: 250, type: 'batSweep', count: 50, chance: 0.1 },
  { atS: 300, type: 'boss', kind: 'mantis', rewardChance: 1 },
  { atS: 300, type: 'flowerWall', count: 100, durationS: 30 },
  { atS: 365, type: 'batSweep', count: 50, chance: 0.1 },
  { atS: 370, type: 'batSweep', count: 50, chance: 0.1 },
  { atS: 420, type: 'boss', kind: 'glowingBat', rewardChance: 0.5635 },
  { atS: 425, type: 'batSweep', count: 50, chance: 0.8 },
  { atS: 430, type: 'batSweep', count: 50, chance: 0.8 },
  { atS: 435, type: 'batSweep', count: 50, chance: 0.8 },
  { atS: 440, type: 'batSweep', count: 50, chance: 0.8 },
  { atS: 445, type: 'batSweep', count: 50, chance: 0.8 },
  { atS: 450, type: 'batSweep', count: 50, chance: 0.8 },
] as const;
