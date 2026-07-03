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
  magnetRadius: 90,
  pickupRadius: 18,
  /** XP needed to reach each next level. Tuned for ~12-14 level-ups over
   *  8 minutes (average pick gap ~35-40s, docs/phases/m2-the-arc.md). */
  xpCurve: [8, 14, 22, 34, 50, 70, 95, 125, 160, 200, 245, 295, 350, 410, 475, 545],
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

// Gate B (M1) verdict carried forward: the curve stays mean. Stretched from
// 5 to 8 minutes; the darter threatens by demanding dodges, not attrition.
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
  /** Swarmers per second: ramps linearly from start to end over the run. */
  swarmRateStart: 2.0,
  swarmRateEnd: 14,
  /** Tanks enter at tankFromS; interval shrinks linearly to the end. */
  tankFromS: 30,
  tankIntervalStartS: 12,
  tankIntervalEndS: 3,
  /** Darters per second once they enter, ramping to the end. */
  darterFromS: 150,
  darterRateStart: 0.3,
  darterRateEnd: 2.2,
  /** Spawn ring distance beyond the larger screen half-extent. */
  spawnMargin: 80,
  /** Hard cap (spatial hash comfort zone). */
  maxAlive: 1200,
};

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
  { atS: 120, kind: 'ring', enemy: 'swarmer', count: 30 },
  { atS: 180, kind: 'surge', enemy: 'darter', count: 10 },
  { atS: 240, kind: 'ring', enemy: 'swarmer', count: 45 },
  { atS: 270, kind: 'surge', enemy: 'tank', count: 4 },
  { atS: 300, kind: 'ring', enemy: 'darter', count: 16 },
  { atS: 330, kind: 'surge', enemy: 'swarmer', count: 60 },
  { atS: 360, kind: 'ring', enemy: 'tank', count: 8 },
  { atS: 390, kind: 'surge', enemy: 'darter', count: 24 },
  { atS: 420, kind: 'ring', enemy: 'swarmer', count: 80 },
  { atS: 450, kind: 'ring', enemy: 'tank', count: 10 },
  { atS: 465, kind: 'surge', enemy: 'darter', count: 30 },
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
  // Zone that lingers and ticks damage on enemies inside.
  chord: [
    { damage: 5, radius: 85, lifetimeS: 1.5 },
    { damage: 5, radius: 95, lifetimeS: 1.6 },
    { damage: 6, radius: 105, lifetimeS: 1.8 },
    { damage: 7, radius: 115, lifetimeS: 2.0 },
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
    'lingering damage zone',
    'zones twice as often',
    'bigger, longer zones',
    'adds wide slow zones every 4th bar',
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

/** Zone damage tick interval (chord). */
export const ZONE_TICK_S = 0.3;
