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

export const ENEMIES = {
  swarmer: {
    radius: 9,
    speed: 75,
    hp: 3,
    damage: 8,
    xp: 1,
    color: 0x9aa0b4,
  },
  tank: {
    radius: 22,
    speed: 32,
    hp: 45,
    damage: 18,
    xp: 6,
    color: 0x6a7086,
  },
  /** Swarmers per second: ramps linearly from start to end over the run. */
  swarmRateStart: 0.9,
  swarmRateEnd: 5.0,
  /** Tanks enter at tankFromS; interval shrinks linearly to the end. */
  tankFromS: 30,
  tankIntervalStartS: 15,
  tankIntervalEndS: 6,
  /** Spawn ring distance beyond the larger screen half-extent. */
  spawnMargin: 80,
  /** Hard cap for M1 (spatial hash comfort zone). */
  maxAlive: 900,
};

export interface WeaponConf {
  damage: number;
  speed?: number;
  radius?: number;
  lifetimeS?: number;
  pierce?: number;
}

/** Per-trigger gameplay effect of each kit. */
export const WEAPONS: Record<Role, WeaponConf> = {
  // Downbeat aura pulse around the player.
  kick: { damage: 8, radius: 150 },
  // Backbeat directional shot at the nearest enemy.
  snare: { damage: 14, speed: 520, radius: 7, lifetimeS: 1.2, pierce: 2 },
  // Dense stream of weak fast hits.
  hat: { damage: 3, speed: 430, radius: 4, lifetimeS: 0.9, pierce: 1 },
  // Slow piercing low wave.
  bass: { damage: 15, speed: 150, radius: 42, lifetimeS: 2.4, pierce: Infinity },
  // Zone that lingers and ticks damage on enemies inside.
  chord: { damage: 4, radius: 95, lifetimeS: 1.6 },
  // Homing projectile; its chart is a melody.
  lead: { damage: 7, speed: 320, radius: 6, lifetimeS: 2.0, pierce: 1 },
};

/** How far weapons look for a target. */
export const AIM_RANGE = 750;

/** Zone damage tick interval (chord). */
export const ZONE_TICK_S = 0.3;
