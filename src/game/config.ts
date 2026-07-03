// Every tuning number in one place. Sub-phase C's rough balance pass edits
// this file, not the systems. Weapon numbers are per-trigger: charts decide
// rate, so a kit's DPS = chart density x per-trigger damage (docs/plan.md,
// tempo and damage).

import type { Role } from '../audio/kits';

export const RUN = {
  durationS: 300,
  playerHp: 100,
  playerSpeed: 230,
  playerRadius: 12,
  /** Global invulnerability window after taking a hit. */
  iframesS: 0.5,
  magnetRadius: 70,
  pickupRadius: 18,
  /** XP needed to reach each next level. ~6 level-ups per run. */
  xpCurve: [8, 20, 40, 70, 110, 160, 220],
};

// Gate B verdict: the developer never got hit once. The whole curve moved up:
// faster swarmers, more of them sooner, meaner tanks on a tighter clock.
export const ENEMIES = {
  swarmer: {
    radius: 9,
    speed: 95,
    hp: 3,
    damage: 10,
    xp: 1,
    color: 0x9aa0b4,
  },
  tank: {
    radius: 22,
    speed: 40,
    hp: 70,
    damage: 22,
    xp: 8,
    color: 0x6a7086,
  },
  /** Swarmers per second: ramps linearly from start to end over the run. */
  swarmRateStart: 2.2,
  swarmRateEnd: 13,
  /** Tanks enter at tankFromS; interval shrinks linearly to the end. */
  tankFromS: 25,
  tankIntervalStartS: 10,
  tankIntervalEndS: 3.5,
  /** Spawn ring distance beyond the larger screen half-extent. */
  spawnMargin: 80,
  /** Hard cap for M1 (spatial hash comfort zone). */
  maxAlive: 1200,
};

export interface WeaponConf {
  damage: number;
  speed?: number;
  radius?: number;
  lifetimeS?: number;
  pierce?: number;
}

/** Per-trigger gameplay effect of each kit. Exaggerated per-archetype so
 *  picks read as different weapons, not palette swaps (gate B feedback). */
export const WEAPONS: Record<Role, WeaponConf> = {
  // Downbeat aura pulse around the player.
  kick: { damage: 9, radius: 150 },
  // Backbeat directional shot: few, fast, hard-hitting, pierces a line.
  snare: { damage: 20, speed: 620, radius: 7, lifetimeS: 1.5, pierce: 3 },
  // Dense stream of weak fast chip hits, short range, wide scatter.
  hat: { damage: 3, speed: 430, radius: 3, lifetimeS: 0.8, pierce: 1 },
  // Slow wide low wave that rolls through everything.
  bass: { damage: 18, speed: 140, radius: 46, lifetimeS: 2.6, pierce: Infinity },
  // Zone that lingers and ticks damage on enemies inside.
  chord: { damage: 5, radius: 95, lifetimeS: 1.6 },
  // Homing seeker per melody note.
  lead: { damage: 8, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
};

/** How far weapons look for a target. */
export const AIM_RANGE = 750;

/** Zone damage tick interval (chord). */
export const ZONE_TICK_S = 0.3;
