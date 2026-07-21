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

/** One data row per wiki table cell (mad-forest-spec §4). Repeatable events are
 *  authored as occurrence *groups*, never unrolled by hand: occurrence i
 *  (0-based) fires at `atS + i * spacingS`, and each occurrence independently
 *  rolls `chance`. The row's `atS` already includes the first occurrence's
 *  offset from the minute start, so `spacingS` is purely the gap between
 *  occurrences (and is ignored when `occurrences` is 1).
 *
 *  `boss` rows are the exception: they fire at their exact timestamp, always,
 *  exactly once. `chest: false` means that boss drops nothing on death. */
export type StageEvent =
  | { atS: number; type: 'boss'; kind: EnemyKind; chest: boolean }
  | {
      atS: number;
      type: 'sweep';
      kind: EnemyKind;
      /** Bodies spawned by ONE occurrence, not by the whole group. */
      countPer: number;
      chance: number;
      occurrences: number;
      spacingS: number;
    }
  | {
      atS: number;
      type: 'flowerWall';
      kind: 'flower';
      ringCount: number;
      durationS: number;
      chance: number;
      occurrences: number;
      spacingS: number;
    };

/** Current normal Mad Forest starts with ten enemies already in play,
 * tripled here for the 3x-density pass. */
export const STAGE_STARTING_SPAWNS = 30;
export const STAGE_STARTING_KIND: EnemyKind = 'redBat2';

/** The authored opening act. Endless procedural rows take over at minute 8. */
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
  { atS: 60, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 125, type: 'sweep', kind: 'batSwarm', countPer: 150, chance: 1, occurrences: 3, spacingS: 5 },
  { atS: 180, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 185, type: 'sweep', kind: 'batSwarm', countPer: 150, chance: 0.1, occurrences: 2, spacingS: 5 },
  { atS: 245, type: 'sweep', kind: 'batSwarm', countPer: 150, chance: 0.1, occurrences: 2, spacingS: 5 },
  { atS: 300, type: 'boss', kind: 'mantis', chest: true },
  {
    atS: 300,
    type: 'flowerWall',
    kind: 'flower',
    ringCount: 300,
    durationS: 30,
    chance: 1,
    occurrences: 1,
    spacingS: 0,
  },
  { atS: 365, type: 'sweep', kind: 'batSwarm', countPer: 150, chance: 0.1, occurrences: 2, spacingS: 5 },
  { atS: 420, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 425, type: 'sweep', kind: 'batSwarm', countPer: 150, chance: 0.8, occurrences: 6, spacingS: 5 },
] as const;
