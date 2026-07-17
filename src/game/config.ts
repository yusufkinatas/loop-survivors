// Every tuning number in one place; balance edits land here, not in the
// systems. Weapon numbers are per-trigger: charts decide rate, so a kit's
// DPS = chart density x per-trigger damage (docs/plan.md, tempo and damage).
// One stat block per tier, indexed [tier - 1].

import type { Role } from '../audio/kits';

export const RUN = {
  /** The 8-minute run. */
  durationS: 480,
  /** Antonio baseline: 100 base HP +20 character bonus, +1 Armor. */
  playerHp: 120,
  playerArmor: 1,
  /** Legacy engine speed, normalized from its 456-high world to our 800-high
   * reference viewport, then multiplied by Mad Forest's normal x1.1. */
  playerSpeed: 82.5 * 1.1 * (800 / 456),
  playerRadius: 9 * (800 / 456),
  /** Vampire Survivors' unmodified Magnet stat. */
  magnetRadius: 53,
  pickupRadius: 16,
  gemPullSpeed: 420,
  maxGems: 400,
};

/** Player take-damage feedback, shared by every arena (normal run, sandbox,
 *  and boss) through damage-feedback.ts. One place for the whole feel: the
 *  recovery window, the red edge tint, and the hit screenshake. The flash
 *  timing/color/intensity are pushed onto the `.hit-flash` element as CSS
 *  variables at runtime, so changing them here is enough (no CSS edit needed).
 *  `flashDurS` is meant to track `iframesS`: the tint lasts exactly as long as
 *  the recovery window. */
export const DAMAGE_FEEDBACK = {
  /** Recovery window after a landed hit: no further contact damage until it
   *  elapses. Both the run and the boss read this one value. */
  iframesS: 0.5,
  /** How long the red edge tint holds, then fades (seconds). */
  flashDurS: 0.5,
  /** CSS color of the edge tint, including its own base alpha. */
  flashColor: 'rgba(255, 77, 94, 0.55)',
  /** Peak opacity of the flash during its hold (0..1). */
  flashIntensity: 0.9,
  /** Screenshake kicked on a landed hit (magnitude in view px, duration s). */
  shakeMag: 7,
  shakeDurS: 0.12,
} as const;

/** Level-up ground picks (diegetic reward). Instead of a full-screen menu, the
 * three offers drop as physical items in a triangle around the player, the
 * horde is shoved clear, and a slow-mo + weapon-volume duck marks the moment
 * (up to momentS, cut short the instant a pick is collected). Collecting one
 * means walking onto it.
 *
 * `itemPickupRadius` is a FIXED walk-onto range on purpose: it is deliberately
 * NOT `RUN.pickupRadius`/`magnetRadius`, so a future pickup-range buff grows
 * the gem magnet without silently making level-up items snap in from afar. */
export const LEVELUP = {
  /** World units from the player to each of the three dropped items. */
  itemRadius: 150,
  /** Enemies inside this ring at drop time are shoved out to it (> itemRadius,
   *  so the triangle spawns into cleared space). */
  enemyPushRadius: 300,
  /** Fixed proximity to collect a dropped item (independent of pickup buffs). */
  itemPickupRadius: 40,
  /** Triangle points, in degrees (placed with Math.cos/sin in the shell — a
   *  cosmetic, non-simulation position, so the native trig is fine here). */
  angles: [0, 120, 240] as const,
  /** Max duration of the cosmetic slow-mo / duck moment, real seconds. Ends
   *  early the instant the player collects a pick (see collectGroundPick). */
  momentS: 1,
  /** Time scale during the moment (composes with the dev timeScale). */
  slowScale: 0.75,
  /** Weapon (master) volume multiplier during the moment. */
  duckDepth: 0.32,
};

/** Exact Vampire Survivors XP requirement for the next level. `level` is the
 * player's current level (1 means the 5 XP step from level 1 -> 2). */
export function xpForNextLevel(level: number): number {
  if (level <= 19) return 5 + (level - 1) * 10;
  if (level === 20) return 795; // regular 195 step + the level-20 600 XP wall
  if (level <= 39) return 208 + (level - 21) * 13;
  if (level === 40) return 2855; // regular 455 step + the level-40 2400 XP wall
  return 471 + (level - 41) * 16;
}

/** The two documented XP-wall levels temporarily grant +100% Growth until
 * the wall is crossed. Growth multiplies picked-up experience. */
export function xpPickupMultiplier(level: number): number {
  return level === 20 || level === 40 ? 2 : 1;
}

export type EnemyKind =
  | 'swarmer'
  | 'tank'
  | 'darter'
  | 'splitter'
  | 'charger'
  | 'circler'
  | 'shielded'
  | 'elite'
  // Mad Forest parity roster. The legacy kinds above remain for development
  // fixtures and the dormant pre-parity director.
  | 'bat'
  | 'redBat'
  | 'redBat2'
  | 'zombie'
  | 'skeleton'
  | 'ghost'
  | 'greenMudman'
  | 'grayMudman'
  | 'flower'
  | 'glowingBat'
  | 'mantis'
  | 'batSwarm';

export interface EnemyConf {
  radius: number;
  speed: number;
  hp: number;
  damage: number;
  xp: number;
  color: number;
  /** Bestiary Power before Antonio's one point of Armor. */
  power?: number;
  /** HP is multiplied by the player's level when the enemy spawns. */
  hpPerLevel?: boolean;
  boss?: boolean;
  fixedDirection?: boolean;
  /** Source knockback multiplier: 0 ignores pushes, 1 receives them fully. */
  knockback?: number;
}

/** Official-demo coordinate conversion, normalized from a 456-high legacy
 * world to the 800-high reference view, with current normal Mad Forest's
 * enemy MoveSpeed x1.1 modifier (official wiki revision 89346). */
export const ENEMY_SPEED_UNIT = 0.231 * (800 / 456) * 1.1;

/** Phaser 3.55 floors the half-width used by circle intersection after the
 * source requests a radius of 40% of the active atlas-frame width. */
export function legacyEnemyRadius(spriteWidth: number): number {
  return Math.floor(spriteWidth * 0.4) * (800 / 456);
}

export interface LegacyEnemyFrame {
  width: number;
  height: number;
}

/** Source frame sizes. Repeated sizes preserve uniform frame-list weighting
 * even when different animation frames share the same dimensions. */
export const MAD_FOREST_FRAMES: Partial<Record<EnemyKind, readonly LegacyEnemyFrame[]>> = {
  bat: [{ width: 19, height: 21 }],
  redBat: [{ width: 25, height: 24 }],
  redBat2: [{ width: 30, height: 27 }],
  zombie: [
    { width: 31, height: 33 },
    { width: 31, height: 33 },
    { width: 31, height: 33 },
  ],
  skeleton: [
    { width: 28, height: 33 },
    { width: 32, height: 33 },
    { width: 32, height: 33 },
    { width: 34, height: 33 },
    { width: 32, height: 33 },
    { width: 34, height: 33 },
  ],
  ghost: [{ width: 29, height: 32 }],
  greenMudman: [{ width: 34, height: 34 }],
  grayMudman: [{ width: 34, height: 34 }],
  flower: [
    { width: 26, height: 26 },
    { width: 32, height: 32 },
  ],
  glowingBat: [{ width: 27, height: 25 }],
  mantis: [{ width: 48, height: 47 }],
  batSwarm: [
    { width: 19, height: 21 },
    { width: 25, height: 24 },
    { width: 30, height: 27 },
  ],
};

export const BAT_SWARM_RADII = MAD_FOREST_FRAMES.batSwarm!.map(
  (frame) => legacyEnemyRadius(frame.width),
) as readonly number[];

// The first eight entries and legacy scaling fields remain for sandbox and
// regression fixtures. RunWorld's active parity path reads the Mad
// Forest entries below and never applies those continuous scaling fields.
export const ENEMIES: Record<EnemyKind, EnemyConf> & {
  spawnMargin: number;
  maxAlive: number;
  hpScaleEnd: number;
  damageScaleEnd: number;
  speedScaleEnd: number;
  rampExp: number;
  recycleFactor: number;
} = {
  swarmer: {
    radius: 9,
    speed: 95,
    hp: 5,
    damage: 10,
    xp: 1,
    color: 0x9aa0b4,
  },
  /** The late-game wall: slow, fat, soaks a build for 5-10s. */
  tank: {
    radius: 22,
    speed: 45,
    hp: 110,
    damage: 22,
    xp: 10,
    color: 0x6a7086,
  },
  /** Fast, fragile, rushes the player in straight bursts. */
  darter: {
    radius: 8,
    speed: 360, // dash speed; it pauses between bursts (see run.ts)
    hp: 6,
    damage: 10,
    xp: 2,
    color: 0xe08a5a,
  },
  /** Bursts into a knot of swarmers on death. The early-mid wall. */
  splitter: { radius: 14, speed: 70, hp: 40, damage: 14, xp: 5, color: 0x8fb46a },
  /** Telegraphs, then commits a fast fixed-direction dash. Dodge check. */
  charger: { radius: 12, speed: 60, hp: 35, damage: 18, xp: 5, color: 0xd06a5a },
  /** Fast, fragile, orbits the player at range and harasses. */
  circler: { radius: 10, speed: 170, hp: 10, damage: 12, xp: 2, color: 0x6ac2d0 },
  /** A shield pool absorbs damage before its hp; the mid-game wall. */
  shielded: { radius: 16, speed: 55, hp: 40, damage: 16, xp: 7, color: 0x9a86c0 },
  /** Slow, huge, tanky objective; drops one large gem (xp=big drop). */
  elite: { radius: 34, speed: 48, hp: 420, damage: 25, xp: 80, color: 0xd94f8a },
  // Mad Forest normal-mode bestiary values. `damage` is what Antonio actually
  // loses after his +1 Armor; `power` retains the source number for audits/UI.
  bat: { radius: legacyEnemyRadius(19), speed: 140 * ENEMY_SPEED_UNIT, hp: 1, power: 5, damage: 4, xp: 1, color: 0x8d92b8, knockback: 1 },
  redBat: { radius: legacyEnemyRadius(25), speed: 140 * ENEMY_SPEED_UNIT, hp: 5, power: 5, damage: 4, xp: 1, color: 0xd15b68, knockback: 1 },
  redBat2: { radius: legacyEnemyRadius(30), speed: 140 * ENEMY_SPEED_UNIT, hp: 5, power: 5, damage: 4, xp: 1, color: 0xb94364, knockback: 1 },
  zombie: { radius: legacyEnemyRadius(31), speed: 100 * ENEMY_SPEED_UNIT, hp: 10, power: 10, damage: 9, xp: 1, color: 0x77906f, knockback: 0.8 },
  skeleton: { radius: legacyEnemyRadius(28), speed: 100 * ENEMY_SPEED_UNIT, hp: 15, power: 10, damage: 9, xp: 2, color: 0xd7d0b3, knockback: 1 },
  ghost: { radius: legacyEnemyRadius(29), speed: 200 * ENEMY_SPEED_UNIT, hp: 10, power: 5, damage: 4, xp: 1.5, color: 0x72c5d8, knockback: 0 },
  greenMudman: { radius: legacyEnemyRadius(34), speed: 100 * ENEMY_SPEED_UNIT, hp: 150, power: 10, damage: 9, xp: 2.5, color: 0x6f9d62, knockback: 0.3 },
  grayMudman: { radius: legacyEnemyRadius(34), speed: 100 * ENEMY_SPEED_UNIT, hp: 70, power: 10, damage: 9, xp: 2.5, color: 0x7f8390, knockback: 0.3 },
  flower: {
    radius: legacyEnemyRadius(26),
    speed: 20 * ENEMY_SPEED_UNIT,
    hp: 30,
    power: 1,
    damage: 1,
    xp: 2,
    color: 0xe26b9a,
    hpPerLevel: true,
    knockback: 1,
  },
  glowingBat: {
    radius: legacyEnemyRadius(27),
    speed: 140 * ENEMY_SPEED_UNIT,
    hp: 50,
    power: 10,
    damage: 9,
    xp: 30,
    color: 0xffc857,
    hpPerLevel: true,
    boss: true,
    knockback: 1,
  },
  mantis: {
    radius: legacyEnemyRadius(48),
    speed: 80 * ENEMY_SPEED_UNIT,
    hp: 500,
    power: 20,
    damage: 19,
    xp: 3,
    color: 0xb46cff,
    boss: true,
    knockback: 0,
  },
  batSwarm: {
    // pushEnemy selects the source's BAT1/BAT2/BAT3 frame-specific radius.
    radius: BAT_SWARM_RADII[0],
    speed: 700 * ENEMY_SPEED_UNIT,
    hp: 1,
    power: 1,
    damage: 1,
    xp: 1,
    color: 0xb9b6d8,
    fixedDirection: true,
    knockback: 1,
  },
  /** Spawn ring distance beyond the larger screen half-extent. */
  spawnMargin: 128,
  /** Soft cap on the steady-state horde (VS-density target, see gate B
   *  round 2: the screen must crowd, not trickle). */
  maxAlive: 300,
  /** Enemy HP multiplier reached at minute 8 (curved by rampExp). Gate B
   *  round 2 calibration: any build's damage grows multiplicatively, so
   *  enemies must eventually win the scaling race — the player's damage
   *  carves a bubble in the horde, it never clears the screen, and an AFK
   *  player gets overrun no matter the build. */
  hpScaleEnd: 8,
  /** Contact damage multiplier reached at minute 8, linear. Kept shallow:
   *  danger scales via density + HP (time-to-kill), never burst damage —
   *  a minute-8 swarmer still hits for ~13% of player HP, not 20%. */
  damageScaleEnd: 1.3,
  /** Speed multiplier reached at minute 8, linear, darters excluded (their
   *  dash is tuned to stay dodgeable): open-field kiting stops being free
   *  once the pack can close during any hesitation. */
  speedScaleEnd: 1.3,
  /** Exponent shaping the spawn-rate and HP ramps: >1 keeps the early game
   *  close to M1 and piles the growth into the back half (the horde). */
  rampExp: 1.8,
  /** Enemies farther than spawnDist*recycleFactor behind the moving player are
   *  silently recycled (no gem/kill). >1 so fresh spawns aren't culled. */
  recycleFactor: 1.45,
};

/** Wave spawns may exceed maxAlive up to this absolute ceiling: a pinned
 *  cap must not silently swallow the designed spikes. */
export const MAX_ALIVE_HARD = 500;

export const ENEMY_LABELS: Partial<Record<EnemyKind, string>> = {
  bat: 'small bat',
  redBat: 'red-eyed bat',
  redBat2: 'red-eyed bat (dark)',
  zombie: 'zombie',
  skeleton: 'skeleton',
  ghost: 'ghost',
  greenMudman: 'green mudman',
  grayMudman: 'gray mudman',
  flower: 'closing flower',
  glowingBat: 'glowing bat (elite)',
  mantis: 'mantis (elite)',
  batSwarm: 'sweeping bat',
};

/** Spawn-time stats. Mad Forest has no invented global time ramp: only the
 * documented HP x Level units multiply health by player level. */
export function madForestEnemyStats(kind: EnemyKind, playerLevel: number) {
  const conf = ENEMIES[kind];
  return {
    radius: conf.radius,
    hp: conf.hp * (conf.hpPerLevel ? Math.max(1, playerLevel) : 1),
    speed: conf.speed,
    damage: conf.power === undefined ? conf.damage : Math.max(1, conf.power - RUN.playerArmor),
    xp: conf.xp,
    color: conf.color,
    knockback: conf.knockback ?? 1,
  };
}

/** @deprecated Archival pre-parity visual scaling; RunWorld does not call it.
 * Visual toughness bands (gate B round 3: a minute-7 swarmer is 16x a
 *  minute-1 swarmer and looked identical). The shape stays the kind's
 *  read; the band carries the danger read: color runs cool to hot, size
 *  creeps up, and the top band gets a dark core. */
export const ENEMY_BANDS = {
  /** Run progress (0..1) at which the next band starts. */
  t01: [0.28, 0.55, 0.78],
  sizeMul: [1, 1.12, 1.22, 1.34],
  colors: {
    swarmer: [0x9aa0b4, 0xc9b478, 0xd98a56, 0xd94f5a],
    tank: [0x6a7086, 0x94805e, 0xb06a46, 0xc04858],
    darter: [0xe08a5a, 0xe8a04a, 0xff7a3c, 0xff4658],
    splitter: [0x8fb46a, 0xa8b45e, 0xc09a4e, 0xc85a52],
    charger: [0xd06a5a, 0xdc7a4a, 0xe85a3c, 0xff4046],
    circler: [0x6ac2d0, 0x6ab0c8, 0x7a9ad0, 0x9a6ad0],
    shielded: [0x9a86c0, 0xa07ab0, 0xb06a90, 0xc04858],
    elite: [0xd94f8a, 0xe0507a, 0xe85068, 0xff4050],
  } as Record<EnemyKind, number[]>,
};

/** @deprecated Archival pre-parity scaling. */
export function enemyScaling(
  t01: number,
  kind: EnemyKind,
): { hpMul: number; dmgMul: number; spdMul: number; xpMul: number; band: number } {
  const t = Math.min(1, Math.max(0, t01));
  let band = 0;
  for (const th of ENEMY_BANDS.t01) if (t >= th) band++;
  return {
    hpMul: 1 + (ENEMIES.hpScaleEnd - 1) * Math.pow(t, ENEMIES.rampExp),
    dmgMul: 1 + (ENEMIES.damageScaleEnd - 1) * t,
    spdMul: kind === 'darter' ? 1 : 1 + (ENEMIES.speedScaleEnd - 1) * t,
    xpMul: 1 + 3 * Math.pow(t, 1.3),
    band,
  };
}

/** Darter burst cycle: dash flat-out, stop, re-aim, dash again. */
export const DARTER = {
  dashS: 0.55,
  pauseS: 0.7,
};

/** Splitter: bursts into this many children of childKind on death. Children
 *  are swarmers (never split → no recursion). */
export const SPLITTER = { childKind: 'swarmer' as EnemyKind, childCount: 4 };

/** Charger: within triggerRange it stands still (windup), then commits a fast
 *  fixed-direction dash. dashSpeed is NOT run through speedScaleEnd (stays
 *  dodgeable, same rule as darter). */
export const CHARGER = { triggerRange: 240, windupS: 0.7, dashS: 0.5, dashSpeed: 640 };

/** Circler: orbits the player at this radius. */
export const CIRCLER = { orbitR: 150 };

/** Shielded: shield pool = hp*shieldMul, scaled by hpMul. */
export const SHIELDED = { shieldMul: 1.0 };

/** @deprecated Archival pre-parity director. Active stage data lives in
 * madforest.ts and this table is never read by RunWorld. `set` beats change
 *  the steady pressure (rate + weighted kind mix) from that time on; `event`
 *  beats fire a formation once. Breathers = low-rate `set` beats after event
 *  clusters. The steady rate must overrun an AFK player by the finale. */
export type Formation = 'ring' | 'surge' | 'pincer' | 'elite';
export type KindWeights = Partial<Record<EnemyKind, number>>;

export type DirectorBeat =
  | { atS: number; set: { rate: number; mix: KindWeights } }
  | { atS: number; event: { formation: Formation; kind: EnemyKind; count: number } };

/** Time-sorted. Beats at equal `atS` fire in array order in the same frame.
 *
 *  Sawtooth structure (VS compressed to 8 min): each minute introduces one
 *  new kind as a telegraphed spike (its intro event), pressure climbs to a
 *  minute-end event cluster, then a short low-rate breather resets tension.
 *  Introduction order: swarmer 0:00, darter 0:40, circler 1:30, splitter
 *  2:30, charger 3:30, shielded 4:30, tank 5:30; elite recurs as an
 *  objective event from 1:15. Danger scales via density + HP; the finale
 *  (7:00 on) drops the breathers and overruns any build. */
export const SPAWN_DIRECTOR: DirectorBeat[] = [
  // -- minute 0: swarmers only, hot enough that standing still already hurts.
  { atS: 0, set: { rate: 6, mix: { swarmer: 1 } } },
  { atS: 20, set: { rate: 9, mix: { swarmer: 1 } } },
  // -- 0:40 darter intro spike, then darters join the steady mix.
  { atS: 40, event: { formation: 'surge', kind: 'darter', count: 16 } },
  { atS: 45, set: { rate: 10, mix: { swarmer: 0.86, darter: 0.14 } } },
  // -- minute 1: first ring, breather, then the first elite objective.
  { atS: 60, event: { formation: 'ring', kind: 'swarmer', count: 30 } },
  { atS: 62, set: { rate: 5, mix: { swarmer: 0.86, darter: 0.14 } } }, // breather
  { atS: 72, set: { rate: 11, mix: { swarmer: 0.86, darter: 0.14 } } },
  { atS: 75, event: { formation: 'elite', kind: 'elite', count: 1 } },
  // -- 1:30 circler intro: a harassing orbit forces movement.
  { atS: 90, event: { formation: 'surge', kind: 'circler', count: 8 } },
  { atS: 92, set: { rate: 12, mix: { swarmer: 0.8, darter: 0.12, circler: 0.08 } } },
  { atS: 105, event: { formation: 'pincer', kind: 'darter', count: 10 } },
  // -- minute 2 spike: bigger ring, breather after.
  { atS: 120, event: { formation: 'ring', kind: 'swarmer', count: 50 } },
  { atS: 122, set: { rate: 6, mix: { swarmer: 0.84, darter: 0.08, circler: 0.08 } } }, // breather
  { atS: 135, set: { rate: 13, mix: { swarmer: 0.84, darter: 0.08, circler: 0.08 } } },
  // -- 2:30 splitter intro: the early-mid wall (5-10s of focused fire).
  { atS: 150, event: { formation: 'surge', kind: 'splitter', count: 5 } },
  {
    atS: 152,
    set: { rate: 14, mix: { swarmer: 0.78, darter: 0.08, circler: 0.08, splitter: 0.06 } },
  },
  // -- minute 3 spike: elite + darter pincer, breather after.
  { atS: 180, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 190, event: { formation: 'pincer', kind: 'darter', count: 12 } },
  {
    atS: 192,
    set: { rate: 7, mix: { swarmer: 0.78, darter: 0.08, circler: 0.08, splitter: 0.06 } },
  }, // breather
  {
    atS: 205,
    set: { rate: 14, mix: { swarmer: 0.78, darter: 0.08, circler: 0.08, splitter: 0.06 } },
  },
  // -- 3:30 charger intro: the dodge check arrives from two sides.
  { atS: 210, event: { formation: 'pincer', kind: 'charger', count: 8 } },
  {
    atS: 212,
    set: {
      rate: 15,
      mix: { swarmer: 0.72, darter: 0.08, circler: 0.08, splitter: 0.06, charger: 0.06 },
    },
  },
  // -- minute 4 spike: the biggest ring yet, breather after.
  { atS: 240, event: { formation: 'ring', kind: 'swarmer', count: 90 } },
  {
    atS: 242,
    set: {
      rate: 8,
      mix: { swarmer: 0.72, darter: 0.08, circler: 0.08, splitter: 0.06, charger: 0.06 },
    },
  }, // breather
  {
    atS: 256,
    set: {
      rate: 17,
      mix: { swarmer: 0.72, darter: 0.08, circler: 0.08, splitter: 0.06, charger: 0.06 },
    },
  },
  // -- 4:30 shielded intro: the mid-game wall closes in from all sides.
  { atS: 270, event: { formation: 'ring', kind: 'shielded', count: 8 } },
  {
    atS: 272,
    set: {
      rate: 18,
      mix: {
        swarmer: 0.68,
        darter: 0.08,
        circler: 0.08,
        splitter: 0.06,
        charger: 0.05,
        shielded: 0.05,
      },
    },
  },
  // -- minute 5 spike: double elite + splitter surge, breather after.
  { atS: 300, event: { formation: 'elite', kind: 'elite', count: 2 } },
  { atS: 308, event: { formation: 'surge', kind: 'splitter', count: 10 } },
  {
    atS: 312,
    set: {
      rate: 9,
      mix: {
        swarmer: 0.68,
        darter: 0.08,
        circler: 0.08,
        splitter: 0.06,
        charger: 0.05,
        shielded: 0.05,
      },
    },
  }, // breather
  {
    atS: 326,
    set: {
      rate: 21,
      mix: {
        swarmer: 0.68,
        darter: 0.08,
        circler: 0.08,
        splitter: 0.06,
        charger: 0.05,
        shielded: 0.05,
      },
    },
  },
  // -- 5:30 tank intro: the late wall lumbers in.
  { atS: 330, event: { formation: 'surge', kind: 'tank', count: 4 } },
  {
    atS: 332,
    set: {
      rate: 22,
      mix: {
        swarmer: 0.64,
        darter: 0.08,
        circler: 0.07,
        splitter: 0.06,
        charger: 0.05,
        shielded: 0.05,
        tank: 0.05,
      },
    },
  },
  // -- minute 6 spike: huge ring + darter surge, the last real breather.
  { atS: 360, event: { formation: 'ring', kind: 'swarmer', count: 140 } },
  { atS: 365, event: { formation: 'surge', kind: 'darter', count: 20 } },
  {
    atS: 367,
    set: {
      rate: 10,
      mix: {
        swarmer: 0.64,
        darter: 0.08,
        circler: 0.07,
        splitter: 0.06,
        charger: 0.05,
        shielded: 0.05,
        tank: 0.05,
      },
    },
  }, // breather
  {
    atS: 382,
    set: {
      rate: 26,
      mix: {
        swarmer: 0.64,
        darter: 0.08,
        circler: 0.07,
        splitter: 0.06,
        charger: 0.05,
        shielded: 0.05,
        tank: 0.05,
      },
    },
  },
  // -- 6:40 charger pincer: the last dodge check before the finale.
  { atS: 400, event: { formation: 'pincer', kind: 'charger', count: 12 } },
  // -- 7:00 finale: no more breathers, everything escalates until overrun.
  {
    atS: 420,
    set: {
      rate: 34,
      mix: {
        swarmer: 0.6,
        darter: 0.09,
        circler: 0.07,
        splitter: 0.07,
        charger: 0.06,
        shielded: 0.06,
        tank: 0.05,
      },
    },
  },
  { atS: 420, event: { formation: 'elite', kind: 'elite', count: 3 } },
  { atS: 435, event: { formation: 'ring', kind: 'swarmer', count: 200 } },
  {
    atS: 450,
    set: {
      rate: 42,
      mix: {
        swarmer: 0.58,
        darter: 0.1,
        circler: 0.07,
        splitter: 0.07,
        charger: 0.06,
        shielded: 0.06,
        tank: 0.06,
      },
    },
  },
  { atS: 450, event: { formation: 'ring', kind: 'shielded', count: 12 } },
  { atS: 460, event: { formation: 'surge', kind: 'splitter', count: 14 } },
  { atS: 470, event: { formation: 'surge', kind: 'darter', count: 40 } },
];

export interface WeaponConf {
  damage: number;
  speed?: number;
  radius?: number;
  lifetimeS?: number;
  pierce?: number;
  /** clap: half-angle of the forward damage cone (radians). */
  arc?: number;
  /** arp: radius of the orbit around the player. */
  orbitRadius?: number;
  /** kick: Whip-style hitbox scale (1 = 258 x 39 at the reference view). */
  area?: number;
  /** kick: slashes per trigger; the second lands on the opposite side. */
  amount?: number;
}

/** Per-trigger gameplay effect of each kit, one block per tier ([tier-1]).
 *  Charts carry most of the growth (density = rate); stats bump where the
 *  ladder's character says so — bass per-trigger damage climbs hard (weight),
 *  hat barely moves (density is its whole story). */
// Balance scale: per-trigger damage sits at ~1/3 of the earlier VS-derived
// anchor so early enemies take a couple of hits instead of vanishing (a
// tier-1 5-HP bat = 2 kick hits at 3 dmg). Relative weapon character is
// preserved (bass climbs hard, hat barely moves). Zone/DoT weapons carry a
// per-TICK number that floors at 1, so their listed damage can't drop a full
// third — their real output is damage x ticks x rate; they lean on coverage.
export const WEAPONS: Partial<Record<Role, WeaponConf[]>> = {
  // The starting Kick uses Whip's horizontal pass-through strip instead of a
  // radial aura. Damage/area/amount map to Whip levels 1, 3, 5 and 8.
  kick: [
    { damage: 3, area: 1, amount: 1 },
    { damage: 5, area: 1, amount: 2 },
    { damage: 9, area: 1.1, amount: 2 },
    { damage: 15, area: 1.2, amount: 2 },
  ],
  // Backbeat sniper: few, fast, hard-hitting, drills a line. The premium
  // single-target trigger — sparse chart, so each hit is a statement.
  snare: [
    { damage: 5, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 2 },
    { damage: 7, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 3 },
    { damage: 9, speed: 680, radius: 8, lifetimeS: 1.5, pierce: 4 },
    { damage: 13, speed: 720, radius: 8, lifetimeS: 1.5, pierce: 6 },
  ],
  // Dense stream of weak fast chips, wide scatter. Density IS the ladder;
  // per-trigger damage barely moves.
  hat: [
    { damage: 1, speed: 440, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 1, speed: 450, radius: 3, lifetimeS: 0.85, pierce: 1 },
    { damage: 1, speed: 460, radius: 3, lifetimeS: 0.9, pierce: 1 },
    { damage: 2, speed: 480, radius: 3, lifetimeS: 0.95, pierce: 2 },
  ],
  // Slow wide low wave that rolls through everything. The weight ladder:
  // per-trigger damage climbs harder than any other kit.
  bass: [
    { damage: 3, speed: 135, radius: 22, lifetimeS: 2.3, pierce: Infinity },
    { damage: 5, speed: 140, radius: 28, lifetimeS: 2.4, pierce: Infinity },
    { damage: 8, speed: 145, radius: 34, lifetimeS: 2.5, pierce: Infinity },
    { damage: 13, speed: 150, radius: 42, lifetimeS: 2.6, pierce: Infinity },
  ],
  // Zone thrown onto the nearest pack: ticks damage and slows enemies
  // inside. Chip damage + control; the slow is the identity. NOTE: zone
  // `damage` is PER TICK (every ZONE_TICK_S) for the zone's whole life, so
  // effective DPS = trigger rate x damage x (lifetimeS / ZONE_TICK_S). Keep
  // per-tick numbers tiny; chart density and lifetime multiply them.
  // Lifetime trimmed alongside the ~1/3 damage pass: per-tick is floored at 1
  // so it can't drop a full third, so the zone's life is shortened instead to
  // bring total tick output (and the slow duration) down in line.
  chord: [
    { damage: 1, radius: 48, lifetimeS: 1.0 },
    { damage: 1, radius: 56, lifetimeS: 1.15 },
    { damage: 1, radius: 64, lifetimeS: 1.3 },
    { damage: 2, radius: 76, lifetimeS: 1.45 },
  ],
  // Homing seeker per melody note: mid damage, never misses.
  lead: [
    { damage: 2, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 3, speed: 350, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 3, speed: 360, radius: 6, lifetimeS: 2.3, pierce: 1 },
    { damage: 4, speed: 380, radius: 7, lifetimeS: 2.4, pierce: 2 },
  ],
  // Whip: a wide forward slash that hits everything in a close cone. Melee
  // crowd control — no travel, instant, safest when the wall is on top of you.
  clap: [
    { damage: 2, radius: 80, arc: 0.65 },
    { damage: 3, radius: 88, arc: 0.72 },
    { damage: 4, radius: 98, arc: 0.8 },
    { damage: 6, radius: 108, arc: 0.9 },
  ],
  // King Bible: notes that orbit the player, a rotating shield of damage.
  // Each trigger adds one orbiter; a melody makes a ring.
  arp: [
    { damage: 2, radius: 8, lifetimeS: 2.0, orbitRadius: 80 },
    { damage: 2, radius: 8, lifetimeS: 2.4, orbitRadius: 92 },
    { damage: 2, radius: 9, lifetimeS: 2.8, orbitRadius: 106 },
    { damage: 3, radius: 10, lifetimeS: 3.2, orbitRadius: 122 },
  ],
  // Bell (band, Melody): a note lobbed straight that shatters into shards on
  // its first hit (shard count per tier in BELL). radius = the shot's own size.
  bell: [
    { damage: 2, speed: 360, radius: 6, lifetimeS: 1.8, pierce: 1 },
    { damage: 3, speed: 370, radius: 6, lifetimeS: 1.9, pierce: 1 },
    { damage: 4, speed: 380, radius: 7, lifetimeS: 2.0, pierce: 1 },
    { damage: 5, speed: 400, radius: 7, lifetimeS: 2.1, pierce: 2 },
  ],
};

/** The one honest gameplay-effect line on each pick card ([tier-1]). Terse
 *  VS-style, zero music description: the sound
 *  change is discovered by ear. Lines state what the chart + stat change
 *  actually does. */
export const TIER_LINES: Partial<Record<Role, string[]>> = {
  kick: [
    'a facing-side strip, on the beat',
    'adds an opposite-side follow-up',
    'harder, wider double strike',
    'maximum damage and reach',
  ],
  snare: [
    'piercing shot on the backbeat',
    'fires twice as often, pierces 1 more',
    'adds weak ghost shots, pierces 1 more',
    'burst of shots every 4th bar',
  ],
  hat: [
    'thin spray of fast chips',
    'twice the chips',
    'denser spray',
    'a wall of chips',
  ],
  bass: [
    'slow piercing wave',
    'waves twice as often',
    'heavier, wider waves',
    'massive wave every 4th bar',
  ],
  chord: [
    'zone on the nearest pack: damage + slow',
    'zones twice as often',
    'bigger, longer zones',
    'adds huge lingering zones every 4th bar',
  ],
  lead: [
    'a few homing seekers',
    'more seekers',
    'the full melody of seekers',
    'denser seekers that pierce',
  ],
  clap: [
    'a wide slash close to you',
    'wider, harder slash',
    'sweeps a bigger arc',
    'a huge slash all around you',
  ],
  arp: [
    'orbiting notes circle you',
    'the orbit lasts longer',
    'a wider, longer orbit',
    'a dense ring of orbiters',
  ],
  bell: [
    'a note that shatters into shards',
    'more shards on the shatter',
    'sharper shards, further',
    'a burst of shards, pierces',
  ],
};

/** Chord tier 4's pads get a matching gameplay peak: the same weapon, scaled
 *  up. */
export const VARIANT_EFFECTS = {
  chordPad: { radiusMul: 1.5, lifetimeMul: 2.0, damageMul: 0.6 },
};

/** How far weapons look for a target. */
export const AIM_RANGE = 750;

/** Zone damage tick interval (chord). Slower than M1's 0.3: the zone now
 *  lands on the pack, so its per-tick reach is the whole horde — the slow
 *  is the identity, the damage is chip. */
export const ZONE_TICK_S = 0.45;

/** Chord zones: enemy speed multiplier while inside, and how far a zone
 *  can be thrown toward the nearest pack. */
export const ZONE_SLOW_MUL = 0.55;
export const ZONE_THROW_RANGE = 420;

/** Arp orbiters sweep around the player at this angular speed (rad/s) and
 *  can re-hit an enemy every ORBIT_REHIT_S, so a slow sweep keeps chipping. */
export const ARP_OMEGA = 3.4;
export const ORBIT_REHIT_S = 0.35;

// ---- weapon feel constants (Feature 3) ----

/** How long an enemy rides a weapon shove before resuming its chase. */
export const SHOVE_S = 0.12;

/** Per-weapon knock distance applied on hit (Feature 3). Absent = no shove. */
export const WEAPON_SHOVE: Partial<Record<Role, number>> = { snare: 8, clap: 12, bass: 6 };

// ---- the shatter weapon ----

/** Bell shatter: per-tier shard count, and the shard projectiles' stats. Shards
 *  fly out radially from the first hit; each is a small, short-lived bell shot
 *  that does not itself re-shatter. */
export const BELL = {
  shards: [4, 5, 6, 8],
  shardSpeed: 320,
  shardDamageMul: 0.5,
  shardLifeS: 0.45,
  shardRadius: 4,
  shardPierce: 1,
};
