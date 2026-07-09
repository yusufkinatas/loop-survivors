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

export type EnemyKind =
  | 'swarmer'
  | 'tank'
  | 'darter'
  | 'splitter'
  | 'charger'
  | 'circler'
  | 'shielded'
  | 'elite';

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
  /** Bursts into a knot of swarmers on death. */
  splitter: { radius: 14, speed: 70, hp: 24, damage: 16, xp: 4, color: 0x8fb46a },
  /** Telegraphs, then commits a fast fixed-direction dash. */
  charger: { radius: 12, speed: 60, hp: 30, damage: 20, xp: 5, color: 0xd06a5a },
  /** Fast, fragile, orbits the player at range and harasses. */
  circler: { radius: 10, speed: 170, hp: 10, damage: 14, xp: 3, color: 0x6ac2d0 },
  /** A shield pool absorbs damage before its hp; slow but tough. */
  shielded: { radius: 16, speed: 55, hp: 30, damage: 18, xp: 6, color: 0x9a86c0 },
  /** Slow, huge, tanky objective; drops one large gem (xp=big drop). */
  elite: { radius: 34, speed: 48, hp: 500, damage: 30, xp: 80, color: 0xd94f8a },
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
  /** Enemies farther than spawnDist*recycleFactor behind the moving player are
   *  silently recycled (no gem/kill). >1 so fresh spawns aren't culled. */
  recycleFactor: 1.7,
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
    splitter: [0x8fb46a, 0xa8b45e, 0xc09a4e, 0xc85a52],
    charger: [0xd06a5a, 0xdc7a4a, 0xe85a3c, 0xff4046],
    circler: [0x6ac2d0, 0x6ab0c8, 0x7a9ad0, 0x9a6ad0],
    shielded: [0x9a86c0, 0xa07ab0, 0xb06a90, 0xc04858],
    elite: [0xd94f8a, 0xe0507a, 0xe85068, 0xff4050],
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

/** Data-driven spawn Director (replaces the ramp + WAVES). `set` beats change
 *  the steady pressure (rate + weighted kind mix) from that time on; `event`
 *  beats fire a formation once. Breathers = low-rate `set` beats after event
 *  clusters. The steady rate must overrun an AFK player by the finale. */
export type Formation = 'ring' | 'surge' | 'pincer' | 'elite';
export type KindWeights = Partial<Record<EnemyKind, number>>;

export type DirectorBeat =
  | { atS: number; set: { rate: number; mix: KindWeights } }
  | { atS: number; event: { formation: Formation; kind: EnemyKind; count: number } };

/** Time-sorted. Beats at equal `atS` fire in array order in the same frame. */
export const SPAWN_DIRECTOR: DirectorBeat[] = [
  { atS: 0, set: { rate: 3, mix: { swarmer: 1 } } },
  { atS: 30, set: { rate: 5, mix: { swarmer: 1 } } },
  { atS: 45, event: { formation: 'surge', kind: 'darter', count: 8 } },
  { atS: 60, set: { rate: 7, mix: { swarmer: 0.9, circler: 0.1 } } },
  { atS: 75, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 90, set: { rate: 9, mix: { swarmer: 0.85, circler: 0.1 } } },
  { atS: 92, event: { formation: 'ring', kind: 'swarmer', count: 40 } },
  { atS: 94, set: { rate: 4, mix: { swarmer: 0.85, circler: 0.1 } } }, // breather
  { atS: 104, set: { rate: 9, mix: { swarmer: 0.85, circler: 0.1 } } },
  { atS: 120, set: { rate: 11, mix: { swarmer: 0.8, circler: 0.1, darter: 0.05 } } },
  { atS: 130, event: { formation: 'pincer', kind: 'charger', count: 6 } },
  {
    atS: 150,
    set: { rate: 14, mix: { swarmer: 0.72, circler: 0.1, darter: 0.08, splitter: 0.04 } },
  },
  { atS: 150, event: { formation: 'surge', kind: 'splitter', count: 6 } },
  { atS: 165, event: { formation: 'ring', kind: 'swarmer', count: 70 } },
  {
    atS: 167,
    set: { rate: 6, mix: { swarmer: 0.72, circler: 0.1, darter: 0.08, splitter: 0.04 } },
  }, // breather
  {
    atS: 177,
    set: { rate: 14, mix: { swarmer: 0.72, circler: 0.1, darter: 0.08, splitter: 0.04 } },
  },
  {
    atS: 180,
    set: {
      rate: 17,
      mix: { swarmer: 0.68, circler: 0.1, darter: 0.08, splitter: 0.04, charger: 0.04 },
    },
  },
  { atS: 200, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 200, event: { formation: 'surge', kind: 'swarmer', count: 20 } },
  {
    atS: 210,
    set: {
      rate: 20,
      mix: { swarmer: 0.66, circler: 0.1, darter: 0.08, splitter: 0.05, charger: 0.05 },
    },
  },
  { atS: 220, event: { formation: 'pincer', kind: 'darter', count: 16 } },
  {
    atS: 240,
    set: {
      rate: 24,
      mix: { swarmer: 0.62, circler: 0.1, darter: 0.1, splitter: 0.06, charger: 0.06 },
    },
  },
  { atS: 250, event: { formation: 'ring', kind: 'shielded', count: 10 } },
  { atS: 270, event: { formation: 'surge', kind: 'splitter', count: 12 } },
  { atS: 285, event: { formation: 'ring', kind: 'swarmer', count: 120 } },
  {
    atS: 287,
    set: {
      rate: 8,
      mix: { swarmer: 0.62, circler: 0.1, darter: 0.1, splitter: 0.06, charger: 0.06 },
    },
  }, // breather
  {
    atS: 298,
    set: {
      rate: 24,
      mix: { swarmer: 0.62, circler: 0.1, darter: 0.1, splitter: 0.06, charger: 0.06 },
    },
  },
  {
    atS: 300,
    set: {
      rate: 28,
      mix: { swarmer: 0.6, circler: 0.1, darter: 0.1, splitter: 0.07, charger: 0.06 },
    },
  },
  { atS: 300, event: { formation: 'elite', kind: 'elite', count: 2 } },
  { atS: 330, event: { formation: 'pincer', kind: 'charger', count: 14 } },
  {
    atS: 360,
    set: {
      rate: 32,
      mix: { swarmer: 0.58, circler: 0.1, darter: 0.1, splitter: 0.08, charger: 0.07 },
    },
  },
  { atS: 360, event: { formation: 'ring', kind: 'swarmer', count: 180 } },
  { atS: 360, event: { formation: 'surge', kind: 'darter', count: 30 } },
  { atS: 390, event: { formation: 'surge', kind: 'splitter', count: 20 } },
  {
    atS: 420,
    set: {
      rate: 38,
      mix: { swarmer: 0.56, circler: 0.1, darter: 0.1, splitter: 0.08, charger: 0.08 },
    },
  },
  { atS: 420, event: { formation: 'ring', kind: 'swarmer', count: 260 } },
  { atS: 440, event: { formation: 'elite', kind: 'elite', count: 3 } },
  { atS: 450, event: { formation: 'ring', kind: 'shielded', count: 14 } },
  { atS: 465, event: { formation: 'surge', kind: 'darter', count: 40 } },
];

export interface WeaponConf {
  damage: number;
  speed?: number;
  radius?: number;
  lifetimeS?: number;
  pierce?: number;
  /** clap: half-angle of the forward damage cone (radians). */
  arc?: number;
  /** tom: boomerangs thrown per trigger. */
  count?: number;
  /** arp: radius of the orbit around the player. */
  orbitRadius?: number;
  /** crash: knockback distance pushed onto enemies the wave front passes. */
  knockback?: number;
  /** acid gravity-well pull speed (px/s inward). */
  pull?: number;
}

/** Per-trigger gameplay effect of each kit, one block per tier ([tier-1]).
 *  Charts carry most of the growth (density = rate); stats bump where the
 *  ladder's character says so — bass per-trigger damage climbs hard (weight),
 *  hat barely moves (density is its whole story). */
// Balance anchor (VS-derived): a tier-1 weapon's chart fires ~2-4 triggers
// per 2s bar at 122bpm (~1.5/s), so a tier-1 single-target weapon lands
// ~10 DPS at ~7 damage per trigger. Tier 4 per-trigger sits at 2-3x tier 1
// (chart density adds its own 2-3x on top → ~5-8x total). Aura/zone/AoE
// weapons pay for coverage with roughly half the single-target rate.
export const WEAPONS: Record<Role, WeaponConf[]> = {
  // Downbeat aura pulse around the player. AoE: half-rate damage, the
  // radius is the growth story.
  kick: [
    { damage: 6, radius: 120 },
    { damage: 8, radius: 140 },
    { damage: 10, radius: 160 },
    { damage: 14, radius: 185 },
  ],
  // Backbeat sniper: few, fast, hard-hitting, drills a line. The premium
  // single-target trigger — sparse chart, so each hit is a statement.
  snare: [
    { damage: 16, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 2 },
    { damage: 22, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 3 },
    { damage: 28, speed: 680, radius: 8, lifetimeS: 1.5, pierce: 4 },
    { damage: 40, speed: 720, radius: 8, lifetimeS: 1.5, pierce: 6 },
  ],
  // Dense stream of weak fast chips, wide scatter. Density IS the ladder;
  // per-trigger damage barely moves.
  hat: [
    { damage: 3, speed: 440, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 3, speed: 450, radius: 3, lifetimeS: 0.85, pierce: 1 },
    { damage: 4, speed: 460, radius: 3, lifetimeS: 0.9, pierce: 1 },
    { damage: 5, speed: 480, radius: 3, lifetimeS: 0.95, pierce: 2 },
  ],
  // Slow wide low wave that rolls through everything. The weight ladder:
  // per-trigger damage climbs harder than any other kit.
  bass: [
    { damage: 15, speed: 135, radius: 42, lifetimeS: 2.6, pierce: Infinity },
    { damage: 20, speed: 140, radius: 48, lifetimeS: 2.6, pierce: Infinity },
    { damage: 28, speed: 145, radius: 55, lifetimeS: 2.7, pierce: Infinity },
    { damage: 40, speed: 150, radius: 64, lifetimeS: 2.8, pierce: Infinity },
  ],
  // Zone thrown onto the nearest pack: ticks damage and slows enemies
  // inside. Chip damage + control; the slow is the identity. NOTE: zone
  // `damage` is PER TICK (every ZONE_TICK_S) for the zone's whole life, so
  // effective DPS = trigger rate x damage x (lifetimeS / ZONE_TICK_S). Keep
  // per-tick numbers tiny; chart density and lifetime multiply them.
  chord: [
    { damage: 2, radius: 95, lifetimeS: 2.0 },
    { damage: 2, radius: 110, lifetimeS: 2.2 },
    { damage: 3, radius: 125, lifetimeS: 2.4 },
    { damage: 3, radius: 140, lifetimeS: 2.6 },
  ],
  // Homing seeker per melody note: mid damage, never misses.
  lead: [
    { damage: 7, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 8, speed: 350, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 9, speed: 360, radius: 6, lifetimeS: 2.3, pierce: 1 },
    { damage: 11, speed: 380, radius: 7, lifetimeS: 2.4, pierce: 2 },
  ],
  // Whip: a wide forward slash that hits everything in a close cone. Melee
  // crowd control — no travel, instant, safest when the wall is on top of you.
  clap: [
    { damage: 12, radius: 130, arc: 0.9 },
    { damage: 15, radius: 150, arc: 1.05 },
    { damage: 19, radius: 172, arc: 1.25 },
    { damage: 26, radius: 200, arc: 1.55 },
  ],
  // Cross: a boomerang lobbed outward that curves back to the player, hitting
  // on the way out and the way home. Deep pierce, both legs.
  tom: [
    { damage: 11, speed: 360, radius: 9, lifetimeS: 2.0, pierce: 4, count: 1 },
    { damage: 13, speed: 375, radius: 9, lifetimeS: 2.1, pierce: 5, count: 1 },
    { damage: 16, speed: 390, radius: 10, lifetimeS: 2.2, pierce: 6, count: 2 },
    { damage: 22, speed: 410, radius: 11, lifetimeS: 2.4, pierce: 8, count: 2 },
  ],
  // King Bible: notes that orbit the player, a rotating shield of damage.
  // Each trigger adds one orbiter; a melody makes a ring.
  arp: [
    { damage: 5, radius: 8, lifetimeS: 2.0, orbitRadius: 80 },
    { damage: 6, radius: 8, lifetimeS: 2.4, orbitRadius: 92 },
    { damage: 7, radius: 9, lifetimeS: 2.8, orbitRadius: 106 },
    { damage: 9, radius: 10, lifetimeS: 3.2, orbitRadius: 122 },
  ],
  // Shockwave: an expanding ring from the player that damages and knocks back
  // enemies its front passes. Rare and heavy — charts fire it on the accents.
  crash: [
    { damage: 16, speed: 520, radius: 260, knockback: 60 },
    { damage: 20, speed: 550, radius: 300, knockback: 70 },
    { damage: 26, speed: 580, radius: 345, knockback: 85 },
    { damage: 36, speed: 620, radius: 400, knockback: 110 },
  ],
  // Shaker (band, Hats): drops a short-lived damaging blob at your feet on each
  // hit, so moving strings a trail of them behind you. Per-tick zone damage
  // (see the chord note): the trail's high trigger rate at max tier means the
  // per-tick number must stay small.
  shaker: [
    { damage: 2, radius: 34, lifetimeS: 0.9 },
    { damage: 2, radius: 38, lifetimeS: 1.0 },
    { damage: 3, radius: 44, lifetimeS: 1.1 },
    { damage: 3, radius: 50, lifetimeS: 1.25 },
  ],
  // Acid (band, Motion): a placed gravity well that pulls enemies toward its
  // center and ticks damage while they are caught. Control first, chip second.
  // Per-tick zone damage (see the chord note): the pull is the payoff, so the
  // chip stays near-flat and the control stats (pull, radius) carry the ladder.
  acid: [
    { damage: 1, radius: 100, lifetimeS: 2.2, pull: 100 },
    { damage: 1, radius: 112, lifetimeS: 2.4, pull: 115 },
    { damage: 2, radius: 128, lifetimeS: 2.6, pull: 135 },
    { damage: 2, radius: 145, lifetimeS: 2.8, pull: 160 },
  ],
  // Pluck bass (band, Bass): a note lobbed on an arc to the nearest pack that
  // explodes on landing. Heavy, like the bass wave, but placed.
  pluck: [
    { damage: 14, speed: 300, lifetimeS: 0.7, radius: 70 },
    { damage: 18, speed: 315, lifetimeS: 0.72, radius: 78 },
    { damage: 24, speed: 330, lifetimeS: 0.74, radius: 88 },
    { damage: 34, speed: 350, lifetimeS: 0.78, radius: 100 },
  ],
  // Rhodes (band, Harmony): chord pools placed as mines that sit armed and
  // bloom into a damage burst when an enemy steps in.
  rhodes: [
    { damage: 10, radius: 70, lifetimeS: 4.0 },
    { damage: 13, radius: 80, lifetimeS: 4.5 },
    { damage: 17, radius: 90, lifetimeS: 5.0 },
    { damage: 24, radius: 104, lifetimeS: 5.5 },
  ],
  // Riser (band, FX — THE AUTO-DASH): its build-and-release grants a short
  // movement surge (see DASH) and a whoosh of damage around the player on
  // release. Radius is the whoosh reach.
  riser: [
    { damage: 5, radius: 95 },
    { damage: 6, radius: 108 },
    { damage: 8, radius: 122 },
    { damage: 11, radius: 140 },
  ],
  // Bell (band, Melody): a note lobbed straight that shatters into shards on
  // its first hit (shard count per tier in BELL). radius = the shot's own size.
  bell: [
    { damage: 7, speed: 360, radius: 6, lifetimeS: 1.8, pierce: 1 },
    { damage: 9, speed: 370, radius: 6, lifetimeS: 1.9, pierce: 1 },
    { damage: 11, speed: 380, radius: 7, lifetimeS: 2.0, pierce: 1 },
    { damage: 14, speed: 400, radius: 7, lifetimeS: 2.1, pierce: 2 },
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
  clap: [
    'a wide slash close to you',
    'wider, harder slash',
    'sweeps a bigger arc',
    'a huge slash all around you',
  ],
  tom: [
    'a boomerang that flies out and back',
    'flies further, pierces more',
    'throws two boomerangs',
    'two heavy boomerangs, deep pierce',
  ],
  arp: [
    'orbiting notes circle you',
    'the orbit lasts longer',
    'a wider, longer orbit',
    'a dense ring of orbiters',
  ],
  crash: [
    'a shockwave knocks enemies back',
    'a bigger, faster wave',
    'a wider wave, harder knock',
    'a massive wave, huge knockback',
  ],
  shaker: [
    'leaves a damaging trail as you move',
    'a longer-lasting trail',
    'a wider, hotter trail',
    'a blazing trail',
  ],
  acid: [
    'a well that pulls enemies in',
    'pulls harder, wider',
    'a stronger, bigger well',
    'a massive crushing well',
  ],
  pluck: [
    'a note lobbed that bursts on landing',
    'a bigger burst',
    'a heavier, wider burst',
    'a huge crushing burst',
  ],
  rhodes: [
    'a mine that blooms when stepped in',
    'a wider bloom',
    'a bigger, harder bloom',
    'a huge bloom',
  ],
  riser: [
    'a surge that dashes you forward',
    'a longer dash',
    'a faster, harder dash',
    'a huge dash surge',
  ],
  bell: [
    'a note that shatters into shards',
    'more shards on the shatter',
    'sharper shards, further',
    'a burst of shards, pierces',
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

/** Arp orbiters sweep around the player at this angular speed (rad/s) and
 *  can re-hit an enemy every ORBIT_REHIT_S, so a slow sweep keeps chipping. */
export const ARP_OMEGA = 3.4;
export const ORBIT_REHIT_S = 0.35;

/** Tom boomerangs fly outward for this fraction of their lifetime, then curve
 *  home; the hit set clears at the turn so both legs land. */
export const BOOMERANG_OUT_FRAC = 0.45;

/** Crash shockwave: thickness of the damaging front, and how long a knocked
 *  enemy is pushed before it resumes chasing. */
export const SHOCK_BAND = 46;
export const KNOCK_S = 0.18;

// ---- weapon feel constants (Feature 3) ----

/** How long an enemy rides a weapon shove before resuming its chase (shares
 *  the crash knock channel). */
export const SHOVE_S = 0.12;

/** Per-weapon knock distance applied on hit (Feature 3). Absent = no shove. */
export const WEAPON_SHOVE: Partial<Record<Role, number>> = { kick: 14, snare: 20, clap: 40, bass: 10 };

/** Screenshake magnitudes/durations (Feature 3, cosmetic). Shake is reserved
 *  for the rare, heavy moments only — the crash shockwave and the once-per-
 *  phrase bass sub-drop. Frequent triggers (kick, snare, clap) deliberately
 *  do NOT shake the camera; they punch through local fx (slam/spark/trails). */
export const SHAKE = {
  crash: { mag: 10, dur: 0.35 },
  bassSub: { mag: 8, dur: 0.3 },
} as const;

/** Full-screen colored flash per source (Feature 3, cosmetic). */
export const FLASH = {
  crash: { alpha: 0.16, dur: 0.18 },
  bassSub: { alpha: 0.12, dur: 0.16 },
} as const;

// ---- sub-phase C: the auto-dash utility + the shatter weapon ----

/** Riser, the auto-dash: the release grants a short movement surge. `speed` is
 *  added (px/s) along the dash direction for `surgeS` seconds (≈ a 180px dash),
 *  on top of normal movement. Direction is the player's current move input, or
 *  a fallback when standing still. */
export const DASH = { surgeS: 0.2, speed: 900 };

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

