// Clean-room stage data for the first eight minutes of Mad Forest's normal
// rules. This file intentionally contains mechanics and numeric parameters
// only; no source assets, code, map art, or UI are copied.

import type { EnemyKind } from './config';

export interface StageWave {
  atS: number;
  /** One spawn attempt creates one of every entry; duplicates are meaningful. */
  pattern: readonly EnemyKind[];
  /** Live global-enemy floor. Event and boss bodies count while active. */
  minimum: number;
  intervalS: number;
}

export type StageEvent =
  | { atS: number; type: 'boss'; kind: 'glowingBat' | 'mantis'; rewardChance: number }
  | { atS: number; type: 'batSweep'; kind: 'batSwarm'; count: number; chance: number }
  | { atS: number; type: 'flowerWall'; kind: 'flower'; count: number; durationS: number };

/** Current normal Mad Forest starts with ten enemies already in play,
 * tripled here for the 3x-density pass. */
export const STAGE_STARTING_SPAWNS = 30;
export const STAGE_STARTING_KIND: EnemyKind = 'redBat2';

/** The user's run remains the locked eight-minute arc, so rows 0:00-7:59
 * are reproduced one-for-one rather than compressing thirty minutes. */
export const STAGE_WAVES: readonly StageWave[] = [
  { atS: 0, pattern: ['redBat2'], minimum: 45, intervalS: 1 },
  { atS: 60, pattern: ['zombie', 'bat'], minimum: 90, intervalS: 1 },
  { atS: 120, pattern: ['bat', 'redBat', 'redBat2'], minimum: 150, intervalS: 0.5 },
  { atS: 180, pattern: ['skeleton'], minimum: 120, intervalS: 0.25 },
  { atS: 240, pattern: ['skeleton', 'ghost'], minimum: 90, intervalS: 1 },
  { atS: 300, pattern: ['greenMudman'], minimum: 30, intervalS: 1 },
  { atS: 360, pattern: ['zombie', 'greenMudman'], minimum: 60, intervalS: 0.5 },
  { atS: 420, pattern: ['redBat', 'redBat2', 'grayMudman'], minimum: 240, intervalS: 0.5 },
] as const;

export const STAGE_EVENTS: readonly StageEvent[] = [
  { atS: 60, type: 'boss', kind: 'glowingBat', rewardChance: 0.3 },
  { atS: 125, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 1 },
  { atS: 130, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 1 },
  { atS: 135, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 1 },
  { atS: 180, type: 'boss', kind: 'glowingBat', rewardChance: 0.43 },
  { atS: 185, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.1 },
  { atS: 190, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.1 },
  { atS: 245, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.1 },
  { atS: 250, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.1 },
  { atS: 300, type: 'boss', kind: 'mantis', rewardChance: 1 },
  { atS: 300, type: 'flowerWall', kind: 'flower', count: 300, durationS: 30 },
  { atS: 365, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.1 },
  { atS: 370, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.1 },
  { atS: 420, type: 'boss', kind: 'glowingBat', rewardChance: 0.5635 },
  { atS: 425, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.8 },
  { atS: 430, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.8 },
  { atS: 435, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.8 },
  { atS: 440, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.8 },
  { atS: 445, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.8 },
  { atS: 450, type: 'batSweep', kind: 'batSwarm', count: 150, chance: 0.8 },
] as const;

/** Every enemy the active eight-minute stage can produce, ordered by its first
 *  appearance in the timeline. This is derived from the stage data so adding a
 *  wave/event enemy automatically exposes it to developer rosters. */
export const ACTIVE_ENEMY_KINDS: readonly EnemyKind[] = (() => {
  const rows = [
    { atS: -1, kinds: [STAGE_STARTING_KIND] as const },
    ...STAGE_WAVES.map((wave) => ({ atS: wave.atS, kinds: wave.pattern })),
    ...STAGE_EVENTS.map((event) => ({ atS: event.atS, kinds: [event.kind] as const })),
  ].sort((a, b) => a.atS - b.atS);
  const seen = new Set<EnemyKind>();
  const kinds: EnemyKind[] = [];
  for (const row of rows) {
    for (const kind of row.kinds) {
      if (seen.has(kind)) continue;
      seen.add(kind);
      kinds.push(kind);
    }
  }
  return Object.freeze(kinds);
})();
