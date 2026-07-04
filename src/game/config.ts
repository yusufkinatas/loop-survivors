// Every tuning number in one place. Sub-phase C's rough balance pass edits
// this file, not the systems. Weapon numbers are per-trigger: charts decide
// rate, so a kit's DPS = chart density x per-trigger damage (docs/plan.md,
// tempo and damage). M2: one stat block per tier, indexed [tier - 1].

import type { Role } from '../audio/kits';

export const RUN = {
  /** M2: the 8-minute arc. */
  durationS: 480,
  playerHp: 100,
  playerSpeed: 230,
  playerRadius: 12,
  /** Global invulnerability window after taking a hit. */
  iframesS: 0.5,
  magnetRadius: 110,
  pickupRadius: 18,
  /** XP needed to reach each next level. Tuned for ~12-14 level-ups over
   *  8 minutes (average pick gap ~35-40s, docs/phases/m2-the-arc.md). */
  xpCurve: [8, 14, 24, 38, 56, 80, 110, 148, 195, 250, 315, 390, 475, 570, 675, 790],
};

export type EnemyKind = 'swarmer' | 'tank' | 'darter';

export interface EnemyConf {
  radius: number;
  speed: number;
  hp: number;
  damage: number;
  xp: number;
  color: number;
}

// Gate B (M2) verdict carried forward: flat enemy HP against a build that
// grows every pick made the back half trivial. Enemies now scale HP and
// contact damage over the run, and the spawn ramp is superlinear so the
// late game reads as a horde being carved through, not stragglers.
export const ENEMIES: Record<EnemyKind, EnemyConf> & {
  swarmRateStart: number;
  swarmRateEnd: number;
  tankFromS: number;
  tankIntervalStartS: number;
  tankIntervalEndS: number;
  darterFromS: number;
  darterRateStart: number;
  darterRateEnd: number;
  spawnMargin: number;
  maxAlive: number;
  hpScaleEnd: number;
  damageScaleEnd: number;
  speedScaleEnd: number;
  rampExp: number;
} = {
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
  /** Fast, fragile, rushes the player in straight bursts. */
  darter: {
    radius: 8,
    speed: 360, // dash speed; it pauses between bursts (see run.ts)
    hp: 5,
    damage: 12,
    xp: 2,
    color: 0xe08a5a,
  },
  /** Swarmers per second: start to end over the run, curved by rampExp. */
  swarmRateStart: 2.0,
  swarmRateEnd: 36,
  /** Tanks enter at tankFromS; interval shrinks to the end. */
  tankFromS: 30,
  tankIntervalStartS: 12,
  tankIntervalEndS: 2,
  /** Darters per second once they enter, ramping to the end. */
  darterFromS: 150,
  darterRateStart: 0.3,
  darterRateEnd: 5,
  /** Spawn ring distance beyond the larger screen half-extent. */
  spawnMargin: 80,
  /** Soft cap on the steady-state horde (VS-density target, see gate B
   *  round 2: the screen must crowd, not trickle). */
  maxAlive: 2400,
  /** Enemy HP multiplier reached at minute 8 (curved by rampExp). Gate B
   *  round 2 calibration: any build's damage grows multiplicatively, so
   *  enemies must eventually win the scaling race — the player's damage
   *  carves a bubble in the horde, it never clears the screen, and an AFK
   *  player gets overrun no matter the build. */
  hpScaleEnd: 16,
  /** Contact damage multiplier reached at minute 8, linear. */
  damageScaleEnd: 2,
  /** Speed multiplier reached at minute 8, linear, darters excluded (their
   *  dash is tuned to stay dodgeable): open-field kiting stops being free
   *  once the pack can close during any hesitation. */
  speedScaleEnd: 1.3,
  /** Exponent shaping the spawn-rate and HP ramps: >1 keeps the early game
   *  close to M1 and piles the growth into the back half (the horde). */
  rampExp: 1.8,
};

/** Wave spawns may exceed maxAlive up to this absolute ceiling: a pinned
 *  cap must not silently swallow the designed spikes. */
export const MAX_ALIVE_HARD = 3000;

/** Visual toughness bands (gate B round 3: a minute-7 swarmer is 16x a
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
  } as Record<EnemyKind, number[]>,
};

/** The one scaling formula, shared by the run and the sandbox's stage-
 *  minute preview so both always agree on what "minute N" means. */
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

/** Wave events, pure spawn-script data (docs/phases/m2-the-arc.md): rings
 *  close in from all sides, surges pour in from one direction. Texture for
 *  the back half of the run; no new systems. */
export interface WaveEvent {
  atS: number;
  kind: 'ring' | 'surge';
  enemy: EnemyKind;
  count: number;
}

export const WAVES: WaveEvent[] = [
  { atS: 120, kind: 'ring', enemy: 'swarmer', count: 40 },
  { atS: 180, kind: 'surge', enemy: 'darter', count: 12 },
  { atS: 210, kind: 'ring', enemy: 'swarmer', count: 60 },
  { atS: 270, kind: 'surge', enemy: 'tank', count: 5 },
  { atS: 285, kind: 'ring', enemy: 'swarmer', count: 90 },
  { atS: 300, kind: 'ring', enemy: 'darter', count: 20 },
  { atS: 330, kind: 'surge', enemy: 'swarmer', count: 160 },
  { atS: 360, kind: 'ring', enemy: 'tank', count: 10 },
  { atS: 375, kind: 'ring', enemy: 'swarmer', count: 220 },
  { atS: 390, kind: 'surge', enemy: 'darter', count: 30 },
  { atS: 420, kind: 'ring', enemy: 'swarmer', count: 280 },
  { atS: 440, kind: 'surge', enemy: 'swarmer', count: 200 },
  { atS: 450, kind: 'ring', enemy: 'tank', count: 14 },
  { atS: 465, kind: 'surge', enemy: 'darter', count: 40 },
];

export interface WeaponConf {
  damage: number;
  speed?: number;
  radius?: number;
  lifetimeS?: number;
  pierce?: number;
}

/** Per-trigger gameplay effect of each kit, one block per tier ([tier-1]).
 *  Charts carry most of the growth (density = rate); stats bump where the
 *  ladder's character says so — bass per-trigger damage climbs hard (weight),
 *  hat barely moves (density is its whole story). */
export const WEAPONS: Record<Role, WeaponConf[]> = {
  // Downbeat aura pulse around the player.
  kick: [
    { damage: 8, radius: 130 },
    { damage: 9, radius: 150 },
    { damage: 9, radius: 165 },
    { damage: 10, radius: 180 },
  ],
  // Backbeat directional shot: few, fast, hard-hitting, pierces a line.
  snare: [
    { damage: 18, speed: 620, radius: 7, lifetimeS: 1.5, pierce: 2 },
    { damage: 20, speed: 620, radius: 7, lifetimeS: 1.5, pierce: 3 },
    { damage: 20, speed: 620, radius: 7, lifetimeS: 1.5, pierce: 4 },
    { damage: 22, speed: 640, radius: 7, lifetimeS: 1.5, pierce: 5 },
  ],
  // Dense stream of weak fast chip hits, short range, wide scatter.
  hat: [
    { damage: 3, speed: 430, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 3, speed: 430, radius: 3, lifetimeS: 0.85, pierce: 1 },
    { damage: 3, speed: 450, radius: 3, lifetimeS: 0.9, pierce: 1 },
    { damage: 4, speed: 460, radius: 3, lifetimeS: 0.95, pierce: 1 },
  ],
  // Slow wide low wave that rolls through everything. The weight ladder:
  // per-trigger damage climbs harder than any other kit.
  bass: [
    { damage: 16, speed: 140, radius: 42, lifetimeS: 2.6, pierce: Infinity },
    { damage: 18, speed: 140, radius: 46, lifetimeS: 2.6, pierce: Infinity },
    { damage: 26, speed: 145, radius: 52, lifetimeS: 2.6, pierce: Infinity },
    { damage: 34, speed: 150, radius: 60, lifetimeS: 2.8, pierce: Infinity },
  ],
  // Zone thrown onto the nearest pack: ticks damage and slows enemies
  // inside (gate B rework: zones under the player's own feet were dead
  // weight — the horde is never standing where you are).
  chord: [
    { damage: 3, radius: 95, lifetimeS: 2.0 },
    { damage: 4, radius: 105, lifetimeS: 2.2 },
    { damage: 5, radius: 120, lifetimeS: 2.4 },
    { damage: 6, radius: 135, lifetimeS: 2.6 },
  ],
  // Homing seeker per melody note.
  lead: [
    { damage: 8, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 8, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 9, speed: 350, radius: 6, lifetimeS: 2.3, pierce: 1 },
    { damage: 10, speed: 360, radius: 6, lifetimeS: 2.4, pierce: 2 },
  ],
};

/** The one honest gameplay-effect line on each pick card ([tier-1]). Terse
 *  VS-style, zero music description (docs/phases/m2-the-arc.md): the sound
 *  change is discovered by ear. Lines state what the chart + stat change
 *  actually does. */
export const TIER_LINES: Record<Role, string[]> = {
  kick: [
    'aura pulse around you, on the beat',
    'pulse reaches further',
    'pulses on every beat',
    'bigger pulse, double slam every 4th bar',
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
};

/** Bass tier 4's once-per-phrase sub drop and chord tier 4's pads get a
 *  matching gameplay peak: the same weapon, scaled up. */
export const VARIANT_EFFECTS = {
  bassSub: { radiusMul: 1.6, damageMul: 1.5 },
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
