// Clean-room stage data for the full 30 authored minutes of Mad Forest's
// normal rules, at exact 1x density. This file intentionally contains
// mechanics and numeric parameters only; no source assets, code, map art, or
// UI are copied.
//
// The tables below are transcribed row-for-row from docs/mad-forest-spec.md
// (§3 waves, §4a bosses, §4b sweeps and flower walls) so they diff line by
// line against the spec. Nothing here is derived: if a number looks wrong,
// the spec is the thing to argue with.
//
// The wave table IS the whole stage script. There is no procedural director
// after it and no endless era: past the last row the 29:00 wave simply keeps
// running until the demo-end ticket lands.

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

/** Mad Forest starts with ten enemies already in play (mad-forest-spec §6).
 *  The source doesn't say which pool fills the batch; ours stays the minute-0
 *  kind, a documented micro-deviation (§9.8). */
export const STAGE_STARTING_SPAWNS = 10;
export const STAGE_STARTING_KIND: EnemyKind = 'redBat2';

/** The 30-minute wave table, verbatim at 1x (mad-forest-spec §3). One row per
 *  minute; `atS = minute × 60`. Duplicates inside a `pattern` are meaningful —
 *  13:00's double `ghost` is the table's only intra-minute duplicate, and it is
 *  intentional. `flower` in minutes 21-24 and 26 is an ORDINARY crowd enemy
 *  there: it walks, drops its gem, and recycles by distance like anything else.
 *  Only the `flowerWall` event rows below build event-bodied rings. */
export const STAGE_WAVES: readonly StageWave[] = [
  { atS: 0, pattern: ['redBat2'], minimum: 15, intervalS: 1 },
  { atS: 60, pattern: ['zombie', 'bat'], minimum: 30, intervalS: 1 },
  { atS: 120, pattern: ['bat', 'redBat', 'redBat2'], minimum: 50, intervalS: 0.5 },
  { atS: 180, pattern: ['skeleton'], minimum: 40, intervalS: 0.25 },
  { atS: 240, pattern: ['skeleton', 'ghost'], minimum: 30, intervalS: 1 },
  { atS: 300, pattern: ['greenMudman'], minimum: 10, intervalS: 1 },
  { atS: 360, pattern: ['zombie', 'greenMudman'], minimum: 20, intervalS: 0.5 },
  { atS: 420, pattern: ['redBat', 'redBat2', 'grayMudman'], minimum: 80, intervalS: 0.5 },
  { atS: 480, pattern: ['zombie'], minimum: 100, intervalS: 1.5 },
  { atS: 540, pattern: ['giantBat', 'zombie'], minimum: 30, intervalS: 0.5 },
  { atS: 600, pattern: ['grayMudman', 'greenMudman'], minimum: 10, intervalS: 0.5 },
  { atS: 660, pattern: ['skeleton'], minimum: 300, intervalS: 0.1 },
  { atS: 720, pattern: ['werewolf', 'ghost', 'skeleton'], minimum: 20, intervalS: 0.25 },
  { atS: 780, pattern: ['werewolf', 'ghost', 'ghost'], minimum: 150, intervalS: 0.5 },
  { atS: 840, pattern: ['giantBat', 'werewolf'], minimum: 20, intervalS: 0.1 },
  { atS: 900, pattern: ['werewolf', 'giantBat', 'greenMudman'], minimum: 100, intervalS: 0.1 },
  { atS: 960, pattern: ['mantis', 'grayMudman', 'greenMudman'], minimum: 100, intervalS: 0.1 },
  { atS: 1020, pattern: ['bigMummy'], minimum: 20, intervalS: 1 },
  { atS: 1080, pattern: ['bigMummy', 'grayMudman'], minimum: 60, intervalS: 0.5 },
  { atS: 1140, pattern: ['bigMummy', 'grayMudman'], minimum: 100, intervalS: 0.5 },
  { atS: 1200, pattern: ['bigMummy', 'greenMudman', 'giantBat'], minimum: 100, intervalS: 0.1 },
  { atS: 1260, pattern: ['flower'], minimum: 300, intervalS: 0.1 },
  { atS: 1320, pattern: ['flower', 'bigMummy'], minimum: 200, intervalS: 0.1 },
  { atS: 1380, pattern: ['flower', 'bigMummy'], minimum: 300, intervalS: 0.1 },
  { atS: 1440, pattern: ['flower', 'bigMummy'], minimum: 300, intervalS: 0.1 },
  { atS: 1500, pattern: ['venus'], minimum: 100, intervalS: 0.1 },
  { atS: 1560, pattern: ['venus', 'flower'], minimum: 150, intervalS: 0.1 },
  { atS: 1620, pattern: ['bigMummy', 'grayMudman', 'greenMudman'], minimum: 300, intervalS: 0.1 },
  { atS: 1680, pattern: ['giantBat', 'glowingBat'], minimum: 300, intervalS: 0.1 },
  { atS: 1740, pattern: ['glowingBat', 'silverBat'], minimum: 300, intervalS: 0.1 },
] as const;

/** The authored event schedule: 22 boss rows (mad-forest-spec §4a) followed by
 *  21 sweep / flower-wall rows (§4b), each block in spec order. The director
 *  sorts by time and unrolls occurrence groups at runtime, so a shared
 *  timestamp resolves boss-first (5:00's Shearjaw lands before its flower
 *  wall).
 *
 *  Single-occurrence rows carry `spacingS: 0` — the spec prints `—` there,
 *  and spacing is unread when `occurrences` is 1. */
export const STAGE_EVENTS: readonly StageEvent[] = [
  // §4a — boss schedule. Always fires, no chance, no repeats. `chest: false`
  // on exactly two rows (8:00 and 24:00), where the source carries no treasure.
  { atS: 60, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 180, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 300, type: 'boss', kind: 'mantis', chest: true },
  { atS: 420, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 480, type: 'boss', kind: 'giantBat', chest: false },
  { atS: 540, type: 'boss', kind: 'silverBat', chest: true },
  { atS: 600, type: 'boss', kind: 'giantMantis', chest: true },
  { atS: 660, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 720, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 840, type: 'boss', kind: 'silverBat', chest: true },
  { atS: 900, type: 'boss', kind: 'giantWerewolf', chest: true },
  { atS: 960, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 1080, type: 'boss', kind: 'silverBat', chest: true },
  { atS: 1200, type: 'boss', kind: 'giantMummy', chest: true },
  // 21:00 is a double boss: two rows at one timestamp.
  { atS: 1260, type: 'boss', kind: 'venus', chest: true },
  { atS: 1260, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 1320, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 1380, type: 'boss', kind: 'silverBat', chest: true },
  { atS: 1440, type: 'boss', kind: 'venus', chest: false },
  { atS: 1500, type: 'boss', kind: 'giantBlueVenus', chest: true },
  { atS: 1620, type: 'boss', kind: 'glowingBat', chest: true },
  { atS: 1740, type: 'boss', kind: 'glowingBat', chest: true },

  // §4b — sweeps and flower walls. `atS` is the FIRST occurrence (minute start
  // plus the source's delay); `spacingS` repeats that same delay.
  { atS: 125, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 1, occurrences: 3, spacingS: 5 },
  { atS: 185, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.1, occurrences: 2, spacingS: 5 },
  { atS: 245, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.1, occurrences: 2, spacingS: 5 },
  {
    atS: 300,
    type: 'flowerWall',
    kind: 'flower',
    ringCount: 100,
    durationS: 30,
    chance: 1,
    occurrences: 1,
    spacingS: 0,
  },
  { atS: 365, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.1, occurrences: 2, spacingS: 5 },
  { atS: 425, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.8, occurrences: 6, spacingS: 5 },
  { atS: 495, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.8, occurrences: 3, spacingS: 15 },
  { atS: 555, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.7, occurrences: 3, spacingS: 15 },
  {
    atS: 600,
    type: 'flowerWall',
    kind: 'flower',
    ringCount: 100,
    durationS: 60,
    chance: 1,
    occurrences: 1,
    spacingS: 0,
  },
  { atS: 665, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.1, occurrences: 2, spacingS: 5 },
  { atS: 725, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.1, occurrences: 2, spacingS: 5 },
  // The 13:00 and 20:00 storm minutes intentionally compress 21 occurrences
  // into the front half of their minute (§4 encoding rules).
  { atS: 781.2, type: 'sweep', kind: 'ghostSwarm', countPer: 20, chance: 0.7, occurrences: 21, spacingS: 1.2 },
  { atS: 782.3, type: 'sweep', kind: 'ghostSwarm', countPer: 20, chance: 0.7, occurrences: 21, spacingS: 2.3 },
  // 60 s, not 30: the wave table wins the source's self-contradiction (§4b).
  {
    atS: 900,
    type: 'flowerWall',
    kind: 'flower',
    ringCount: 100,
    durationS: 60,
    chance: 0.8,
    occurrences: 1,
    spacingS: 0,
  },
  { atS: 1201.2, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.7, occurrences: 21, spacingS: 1.2 },
  { atS: 1202.3, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 0.7, occurrences: 21, spacingS: 2.3 },
  {
    atS: 1510,
    type: 'flowerWall',
    kind: 'flower',
    ringCount: 100,
    durationS: 10,
    chance: 1,
    occurrences: 6,
    spacingS: 10,
  },
  { atS: 1620, type: 'sweep', kind: 'ghostSwarm', countPer: 20, chance: 1, occurrences: 1, spacingS: 0 },
  { atS: 1623, type: 'sweep', kind: 'ghostSwarm', countPer: 20, chance: 1, occurrences: 20, spacingS: 3 },
  { atS: 1740, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 1, occurrences: 1, spacingS: 0 },
  { atS: 1743, type: 'sweep', kind: 'batSwarm', countPer: 50, chance: 1, occurrences: 20, spacingS: 3 },
] as const;
