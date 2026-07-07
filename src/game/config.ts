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
  | 'spitter'
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
  /** Kites at range and fires enemy projectiles. */
  spitter: { radius: 11, speed: 90, hp: 16, damage: 8, xp: 4, color: 0xc9a04a },
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
    spitter: [0xc9a04a, 0xd09850, 0xd87848, 0xe05248],
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

/** Spitter: kites to keepMin..keepMax and fires enemy shots. shotSpeed is NOT
 *  run through speedScaleEnd (stays dodgeable, same rule as darter). */
export const SPITTER = {
  keepMin: 260,
  keepMax: 460,
  range: 520,
  cooldownS: 2.2,
  spread: 0.1,
  shotSpeed: 240,
  shotDamage: 14,
  shotRadius: 6,
  shotLifeS: 3.0,
};

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
  { atS: 90, set: { rate: 9, mix: { swarmer: 0.85, circler: 0.1, spitter: 0.05 } } },
  { atS: 92, event: { formation: 'ring', kind: 'swarmer', count: 40 } },
  { atS: 94, set: { rate: 4, mix: { swarmer: 0.85, circler: 0.1, spitter: 0.05 } } }, // breather
  { atS: 104, set: { rate: 9, mix: { swarmer: 0.85, circler: 0.1, spitter: 0.05 } } },
  { atS: 120, set: { rate: 11, mix: { swarmer: 0.8, circler: 0.1, spitter: 0.05, darter: 0.05 } } },
  { atS: 130, event: { formation: 'pincer', kind: 'charger', count: 6 } },
  {
    atS: 150,
    set: { rate: 14, mix: { swarmer: 0.72, circler: 0.1, spitter: 0.06, darter: 0.08, splitter: 0.04 } },
  },
  { atS: 150, event: { formation: 'surge', kind: 'splitter', count: 6 } },
  { atS: 165, event: { formation: 'ring', kind: 'swarmer', count: 70 } },
  {
    atS: 167,
    set: { rate: 6, mix: { swarmer: 0.72, circler: 0.1, spitter: 0.06, darter: 0.08, splitter: 0.04 } },
  }, // breather
  {
    atS: 177,
    set: { rate: 14, mix: { swarmer: 0.72, circler: 0.1, spitter: 0.06, darter: 0.08, splitter: 0.04 } },
  },
  {
    atS: 180,
    set: {
      rate: 17,
      mix: { swarmer: 0.68, circler: 0.1, spitter: 0.06, darter: 0.08, splitter: 0.04, charger: 0.04 },
    },
  },
  { atS: 200, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 200, event: { formation: 'surge', kind: 'swarmer', count: 20 } },
  {
    atS: 210,
    set: {
      rate: 20,
      mix: { swarmer: 0.66, circler: 0.1, spitter: 0.06, darter: 0.08, splitter: 0.05, charger: 0.05 },
    },
  },
  { atS: 220, event: { formation: 'pincer', kind: 'darter', count: 16 } },
  {
    atS: 240,
    set: {
      rate: 24,
      mix: { swarmer: 0.62, circler: 0.1, spitter: 0.06, darter: 0.1, splitter: 0.06, charger: 0.06 },
    },
  },
  { atS: 250, event: { formation: 'ring', kind: 'shielded', count: 10 } },
  { atS: 270, event: { formation: 'surge', kind: 'splitter', count: 12 } },
  { atS: 285, event: { formation: 'ring', kind: 'swarmer', count: 120 } },
  {
    atS: 287,
    set: {
      rate: 8,
      mix: { swarmer: 0.62, circler: 0.1, spitter: 0.06, darter: 0.1, splitter: 0.06, charger: 0.06 },
    },
  }, // breather
  {
    atS: 298,
    set: {
      rate: 24,
      mix: { swarmer: 0.62, circler: 0.1, spitter: 0.06, darter: 0.1, splitter: 0.06, charger: 0.06 },
    },
  },
  {
    atS: 300,
    set: {
      rate: 28,
      mix: { swarmer: 0.6, circler: 0.1, spitter: 0.07, darter: 0.1, splitter: 0.07, charger: 0.06 },
    },
  },
  { atS: 300, event: { formation: 'elite', kind: 'elite', count: 2 } },
  { atS: 330, event: { formation: 'pincer', kind: 'charger', count: 14 } },
  {
    atS: 360,
    set: {
      rate: 32,
      mix: { swarmer: 0.58, circler: 0.1, spitter: 0.07, darter: 0.1, splitter: 0.08, charger: 0.07 },
    },
  },
  { atS: 360, event: { formation: 'ring', kind: 'swarmer', count: 180 } },
  { atS: 360, event: { formation: 'surge', kind: 'darter', count: 30 } },
  { atS: 390, event: { formation: 'surge', kind: 'splitter', count: 20 } },
  {
    atS: 420,
    set: {
      rate: 38,
      mix: { swarmer: 0.56, circler: 0.1, spitter: 0.08, darter: 0.1, splitter: 0.08, charger: 0.08 },
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
  /** cowbell: ricochets off the view edges before dying. */
  bounces?: number;
  /** zap: how many random visible enemies each trigger strikes. */
  strikes?: number;
  /** arp: radius of the orbit around the player. */
  orbitRadius?: number;
  /** crash: knockback distance pushed onto enemies the wave front passes. */
  knockback?: number;
  /** rimshot: how many enemies the crack chains through (hops). */
  chains?: number;
  /** acid gravity-well pull speed (px/s inward); heartbeat's drag-back distance. */
  pull?: number;
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
  // Whip: a wide forward slash that hits everything in a close cone. Melee
  // crowd control — no travel, instant, safest when the wall is on top of you.
  clap: [
    { damage: 14, radius: 140, arc: 1.0 },
    { damage: 16, radius: 155, arc: 1.1 },
    { damage: 18, radius: 170, arc: 1.25 },
    { damage: 22, radius: 190, arc: 1.5 },
  ],
  // Cross: a boomerang lobbed outward that curves back to the player, hitting
  // on the way out and the way home. Deep pierce, both legs.
  tom: [
    { damage: 12, speed: 360, radius: 9, lifetimeS: 2.0, pierce: 4, count: 1 },
    { damage: 13, speed: 370, radius: 9, lifetimeS: 2.0, pierce: 5, count: 1 },
    { damage: 15, speed: 380, radius: 10, lifetimeS: 2.2, pierce: 6, count: 2 },
    { damage: 18, speed: 400, radius: 11, lifetimeS: 2.4, pierce: 8, count: 2 },
  ],
  // Runetracer: a fast bolt that ricochets off the view edges, carving
  // unpredictable lines through the horde. Re-hits after each bounce.
  cowbell: [
    { damage: 7, speed: 460, radius: 5, lifetimeS: 2.2, pierce: 2, bounces: 3 },
    { damage: 7, speed: 470, radius: 5, lifetimeS: 2.4, pierce: 2, bounces: 4 },
    { damage: 8, speed: 480, radius: 6, lifetimeS: 2.6, pierce: 3, bounces: 5 },
    { damage: 10, speed: 500, radius: 6, lifetimeS: 2.8, pierce: 3, bounces: 6 },
  ],
  // King Bible: notes that orbit the player, a rotating shield of damage.
  // Each trigger adds one orbiter; a melody makes a ring.
  arp: [
    { damage: 5, radius: 8, lifetimeS: 2.0, orbitRadius: 80 },
    { damage: 5, radius: 8, lifetimeS: 2.4, orbitRadius: 92 },
    { damage: 6, radius: 9, lifetimeS: 2.8, orbitRadius: 104 },
    { damage: 7, radius: 10, lifetimeS: 3.2, orbitRadius: 120 },
  ],
  // Lightning Ring: instant strikes on random enemies on screen, each a small
  // blast. No travel, no aim — pure horde thinning at range.
  zap: [
    { damage: 14, radius: 55, strikes: 1 },
    { damage: 15, radius: 58, strikes: 2 },
    { damage: 17, radius: 63, strikes: 3 },
    { damage: 20, radius: 70, strikes: 4 },
  ],
  // Shockwave: an expanding ring from the player that damages and knocks back
  // enemies its front passes. Rare and heavy — charts fire it on the accents.
  crash: [
    { damage: 18, speed: 520, radius: 260, knockback: 50 },
    { damage: 20, speed: 540, radius: 300, knockback: 55 },
    { damage: 24, speed: 560, radius: 340, knockback: 65 },
    { damage: 30, speed: 600, radius: 380, knockback: 80 },
  ],
  // Rimshot (band, Backbeat): a dry crack that leaps enemy-to-enemy through a
  // cluster. Single-target per link, but the chain grows tier to tier. radius
  // is only the hit-spark size.
  rimshot: [
    { damage: 10, radius: 22, chains: 2 },
    { damage: 11, radius: 24, chains: 3 },
    { damage: 13, radius: 26, chains: 4 },
    { damage: 16, radius: 28, chains: 5 },
  ],
  // Heartbeat (band, Pulse): a breathing field — shoves close enemies out
  // (knockback) and drags the outer ring in (pull), with a soft tick of damage.
  heartbeat: [
    { damage: 5, radius: 130, knockback: 30, pull: 260 },
    { damage: 6, radius: 150, knockback: 34, pull: 300 },
    { damage: 7, radius: 170, knockback: 38, pull: 340 },
    { damage: 9, radius: 190, knockback: 44, pull: 400 },
  ],
  // Shaker (band, Hats): drops a short-lived damaging blob at your feet on each
  // hit, so moving strings a trail of them behind you.
  shaker: [
    { damage: 3, radius: 34, lifetimeS: 0.9 },
    { damage: 3, radius: 38, lifetimeS: 1.0 },
    { damage: 4, radius: 42, lifetimeS: 1.1 },
    { damage: 5, radius: 48, lifetimeS: 1.2 },
  ],
  // Acid (band, Motion): a placed gravity well that pulls enemies toward its
  // center and ticks damage while they are caught.
  acid: [
    { damage: 4, radius: 100, lifetimeS: 2.2, pull: 90 },
    { damage: 5, radius: 112, lifetimeS: 2.4, pull: 100 },
    { damage: 6, radius: 126, lifetimeS: 2.6, pull: 115 },
    { damage: 8, radius: 142, lifetimeS: 2.8, pull: 135 },
  ],
  // Pluck bass (band, Bass): a note lobbed on an arc to the nearest pack that
  // explodes on landing. Heavy, like the bass wave, but placed.
  pluck: [
    { damage: 16, speed: 300, lifetimeS: 0.7, radius: 70 },
    { damage: 18, speed: 310, lifetimeS: 0.72, radius: 76 },
    { damage: 24, speed: 320, lifetimeS: 0.74, radius: 86 },
    { damage: 32, speed: 340, lifetimeS: 0.78, radius: 96 },
  ],
  // Rhodes (band, Harmony): chord pools placed as mines that sit armed and
  // bloom into a damage burst when an enemy steps in.
  rhodes: [
    { damage: 10, radius: 70, lifetimeS: 4.0 },
    { damage: 12, radius: 78, lifetimeS: 4.5 },
    { damage: 15, radius: 88, lifetimeS: 5.0 },
    { damage: 20, radius: 100, lifetimeS: 5.5 },
  ],
  // Ride (band, Hats — THE FREEZE WEAPON): a radar beam that sweeps a wedge of
  // the surrounding circle each trigger, freezing what it crosses. Token damage
  // (never zero, Pillar 1); radius is the sweep reach. Fires often, so a single
  // trigger only freezes a slice — never the whole screen (see RIDE).
  ride: [
    { damage: 3, radius: 210 },
    { damage: 3, radius: 235 },
    { damage: 4, radius: 260 },
    { damage: 5, radius: 290 },
  ],
  // Riser (band, FX — THE AUTO-DASH): its build-and-release grants a short
  // movement surge (see DASH) and a token whoosh of damage around the player on
  // release. Radius is the whoosh reach.
  riser: [
    { damage: 4, radius: 95 },
    { damage: 5, radius: 105 },
    { damage: 6, radius: 118 },
    { damage: 8, radius: 132 },
  ],
  // Reese (band, Bass): a growling wall placed on the nearest pack that grinds
  // (heavy slow) and ticks damage. Bass weight ladder — per-trigger climbs hard.
  reese: [
    { damage: 6, radius: 78, lifetimeS: 2.4 },
    { damage: 7, radius: 86, lifetimeS: 2.6 },
    { damage: 10, radius: 96, lifetimeS: 2.8 },
    { damage: 14, radius: 110, lifetimeS: 3.0 },
  ],
  // Choir pad (band, Harmony): a summoned singing orb placed on the nearest
  // pack that stays and pulses damage (a long-lived ticking zone, no slow).
  choir: [
    { damage: 4, radius: 92, lifetimeS: 3.5 },
    { damage: 5, radius: 102, lifetimeS: 4.0 },
    { damage: 6, radius: 114, lifetimeS: 4.5 },
    { damage: 8, radius: 128, lifetimeS: 5.0 },
  ],
  // Bell (band, Melody): a note lobbed straight that shatters into shards on
  // its first hit (shard count per tier in BELL). radius = the shot's own size.
  bell: [
    { damage: 7, speed: 360, radius: 6, lifetimeS: 1.8, pierce: 1 },
    { damage: 8, speed: 365, radius: 6, lifetimeS: 1.9, pierce: 1 },
    { damage: 10, speed: 375, radius: 7, lifetimeS: 2.0, pierce: 1 },
    { damage: 12, speed: 390, radius: 7, lifetimeS: 2.1, pierce: 2 },
  ],
  // Whistle (band, Melody): tags the nearest enemy; the tag pops a beat later
  // for a hard delayed burst (see WHISTLE). Hits heavy because it is delayed.
  whistle: [
    { damage: 16, radius: 60 },
    { damage: 19, radius: 66 },
    { damage: 23, radius: 74 },
    { damage: 30, radius: 84 },
  ],
};

/** Weapon capability tags: the single source of truth for which modifiers a
 *  weapon can legally take (D10). Effects declare the tags they require and
 *  eligibility is DERIVED against this (see effects.ts), so a modifier never
 *  lands where it makes no gameplay sense. `area` = a radius that can grow;
 *  `pierce` = passes through enemies; `projectile` = a travelling shot;
 *  `count` = can add another instance; `aimedfan` = aimed shots that fan out
 *  on multishot. */
export type WeaponTag = 'area' | 'pierce' | 'projectile' | 'count' | 'aimedfan';
export const WEAPON_TAGS: Record<Role, ReadonlySet<WeaponTag>> = {
  kick: new Set(['area']),
  snare: new Set(['projectile', 'pierce', 'count', 'aimedfan']),
  hat: new Set(['projectile', 'count', 'aimedfan']),
  bass: new Set(['projectile', 'pierce', 'area']), // area but NOT count -> never multishots
  chord: new Set(['area']),
  lead: new Set(['projectile', 'pierce', 'count', 'aimedfan']),
  clap: new Set(['area']),
  tom: new Set(['projectile', 'pierce', 'count']),
  cowbell: new Set(['projectile', 'pierce']),
  arp: new Set(['count', 'area']),
  zap: new Set(['count', 'area']),
  crash: new Set(['area']),
  rimshot: new Set(['count']),
  heartbeat: new Set(['area']),
  shaker: new Set(['area', 'count']),
  acid: new Set(['area']),
  pluck: new Set(['projectile', 'area']),
  rhodes: new Set(['area']),
  ride: new Set(['area']),
  riser: new Set(['area']),
  reese: new Set(['area']),
  choir: new Set(['area']),
  // Bell shatters on its first hit; it is not in the multishot/split spawn
  // paths, so 'count'/'aimedfan' would make Split/Layer legal no-op picks (D10:
  // a modifier never lands where it does nothing). Only 'projectile' — Drive
  // and Echo (which re-fires the whole note) are its meaningful modifiers.
  bell: new Set(['projectile']),
  whistle: new Set(['area']),
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
  cowbell: [
    'a bolt that ricochets off the edges',
    'bounces one more time',
    'bounces and pierces more',
    'a wild long-bouncing bolt',
  ],
  arp: [
    'orbiting notes circle you',
    'the orbit lasts longer',
    'a wider, longer orbit',
    'a dense ring of orbiters',
  ],
  zap: [
    'lightning hits a random foe',
    'strikes two at once',
    'strikes three at once',
    'strikes four, bigger blasts',
  ],
  crash: [
    'a shockwave knocks enemies back',
    'a bigger, faster wave',
    'a wider wave, harder knock',
    'a massive wave, huge knockback',
  ],
  rimshot: [
    'a crack that chains through a cluster',
    'jumps to one more enemy',
    'a longer chain, harder hits',
    'rips through the whole pack',
  ],
  heartbeat: [
    'a pulse that shoves near and gathers far',
    'a wider breathing field',
    'pushes harder, pulls further',
    'a huge breathing field',
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
  ride: [
    'a sweep that freezes what it crosses',
    'a wider freezing sweep',
    'freezes longer, reaches further',
    'a huge freezing sweep',
  ],
  riser: [
    'a surge that dashes you forward',
    'a longer dash',
    'a faster, harder dash',
    'a huge dash surge',
  ],
  reese: [
    'a grinding wall that holds a pack',
    'a bigger, longer wall',
    'a heavier grinding wall',
    'a massive crushing wall',
  ],
  choir: [
    'a singing orb that pulses damage',
    'a bigger, longer orb',
    'a stronger pulsing orb',
    'a huge singing orb',
  ],
  bell: [
    'a note that shatters into shards',
    'more shards on the shatter',
    'sharper shards, further',
    'a burst of shards, pierces',
  ],
  whistle: [
    'tags a foe; it pops a beat later',
    'a bigger delayed pop',
    'a harder pop',
    'a huge delayed pop',
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

/** Zap picks its random targets from enemies within this range of the player. */
export const ZAP_RANGE = 640;

/** Rimshot's crack seeks its first target within SEEK of the player, then each
 *  link hops to the next-nearest un-hit enemy within HOP (so it chains through
 *  a pack, not across the whole arena). */
export const CHAIN_SEEK = 360;
export const CHAIN_HOP = 150;

// ---- weapon feel & modifier constants (Features 3, 4, 5) ----

/** How long an enemy rides a weapon shove before resuming its chase (shares
 *  the crash knock channel). */
export const SHOVE_S = 0.12;

/** Per-weapon knock distance applied on hit (Feature 3). Absent = no shove. */
export const WEAPON_SHOVE: Partial<Record<Role, number>> = { kick: 14, snare: 20, clap: 40, bass: 10 };

/** Screenshake magnitudes/durations (Feature 3, cosmetic). Shake is reserved
 *  for the rare, heavy moments only — the crash shockwave and the once-per-
 *  phrase bass sub-drop. Frequent triggers (kick, snare, clap, zap) deliberately
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

/** Fan spacing (rad) between multishot/echo-split aimed projectiles. */
export const ECHO_FAN = 0.14;

// ---- sub-phase C: the two utility systems + the shatter/tag weapons ----

/** Ride, the freeze weapon: a radar beam that rotates a fixed step each trigger
 *  and freezes only the wedge it crosses, so a fast Hats-lane cadence never
 *  permafreezes the whole screen. `freezeS` is how long a crossed enemy stays
 *  frozen; `wedge` is the half-angle (rad) of the beam; `step` is how far the
 *  beam rotates per trigger (a golden-angle step so successive sweeps spread
 *  around the circle instead of retracing). */
export const RIDE = { freezeS: 1.2, wedge: 0.42, step: 2.399963 };

/** Riser, the auto-dash: the release grants a short movement surge. `speed` is
 *  added (px/s) along the dash direction for `surgeS` seconds (≈ a 180px dash),
 *  on top of normal movement. Direction is the player's current move input, or
 *  a fallback when standing still. */
export const DASH = { surgeS: 0.2, speed: 900 };

/** Bell shatter: per-tier shard count, and the shard projectiles' stats. Shards
 *  fly out radially from the first hit; each is a small, short-lived bell shot
 *  that does not itself re-shatter. */
export const BELL = {
  shards: [3, 4, 5, 6],
  shardSpeed: 300,
  shardDamageMul: 0.5,
  shardLifeS: 0.45,
  shardRadius: 4,
  shardPierce: 1,
};

/** Whistle: how long after the tag lands the enemy pops (a beat, roughly, at
 *  the mid-tempo genres — flavor, not tempo-locked). */
export const WHISTLE = { popS: 0.5 };

/** Hold & Drop (the pull-back mechanic, docs/phases/hold-and-drop.md).
 *  Pull an owned instrument back (it goes silent and stops firing) to bank
 *  charge over time; bring it back in on the beat for an area slam that clears
 *  space plus a short window where that instrument fires far harder. The
 *  buildup you hold is a bomb you release. */
export const HOLD = {
  /** Amplified-fire window opened by a drop (seconds). */
  payoffS: 4,
  /** Fire damage multiplier at full charge during the payoff window (area
   *  scales more gently, at 35% of this). */
  maxFireMul: 4,
  /** Drop slam: base radius (px) at power 1; grows with the summed charge. */
  slamRadius: 300,
  /** Drop slam damage at power 1 (scaled by summed charge × powerMul). */
  slamDamage: 90,
  slamKnockback: 460,
  /** Multi-drop combo (spec, kept): extra power per extra voice dropped, so
   *  spreading the same charge across more voices beats the sum of its parts.
   *  The synchronized full-band bonus (`sync`) is an additional edge on top. */
  comboBonus: 0.5,

  // ---- v2.1 rework (docs/phases/hold-and-drop-v2.md, "Sub-phase B rework") --
  // Charge is PER-ARMED-VOICE, anchored to the player's action (not a global
  // horde-driven pool). Each armed voice banks its own charge at a slow base
  // rate; danger MULTIPLIES that rate (it is not the source), so a safe player
  // can always eventually load a drop and charging under fire is bigger.

  /** Charge economy. */
  charge: {
    /** Per-voice charge/s at zero danger — the "always available" floor.
     *  Slow enough that arming-and-running is a real vulnerable commitment
     *  (~6.7s to fully load one voice while safe). Gate-B tuning knob. */
    baseRate: 0.15,
    /** Rate multiplier at danger01 = 1 (max danger). At the floor the rate is
     *  baseRate; surrounded it is baseRate × dangerMul (~2s to load a voice). */
    dangerMul: 3,
    /** Per-voice charge cap. */
    perVoiceMax: 1,
    /** Once a voice tops out while armed it starts bleeding this much per second
     *  (spend it or lose it). Tuned ABOVE baseRate but below the danger-boosted
     *  rate, so a full voice held while SAFE slowly drains, while a full voice
     *  held UNDER FIRE stays pinned at the top (with a waver cue) — you keep
     *  what you earned under danger but can't safely sit on a loaded bomb. */
    overflowBleedPerS: 0.28,
    /** Summed charge (across armed voices) that fills the HUD drop-size meter.
     *  ~4 fully-loaded voices maxes the visual; the meter is a preview of how
     *  big the pending drop is, so more/fuller voices read as a bigger drop. */
    meterFull: 4,
    /** A commit whose summed charge is below this fizzles: voices just pop
     *  back, a weak slam, no amplified window, no cooldown (an unearned drop is
     *  its own punishment). */
    fizzleBelow: 0.35,
    // ---- danger01 read (a MULTIPLIER input, not the charge source) ----
    /** px; enemies inside this radius feed the danger read. */
    pressureRadius: 260,
    /** Weighted crowd score (each in-range enemy contributes 0.5 + 0.5×closeness)
     *  that reads as maximum crowd danger. */
    crowdFull: 12,
    /** kills/s (decaying, ~1s memory) that reads as full kill-streak danger. */
    killRateFull: 4,
    /** Weight (0..1) of the kill-streak term in danger01 vs the crowd term. */
    killStreakWeight: 0.5,
  },
  /** Synchronized full-band drop (the one skill topping in scope). Arming the
   *  last of your owned voices within `windowBeats` beats locks the rack and
   *  the pending drop gets `bonus` extra power on top of the summed charge,
   *  plus a bigger build. Ship conservative; tune/toggle at gate B. */
  sync: {
    enabled: true,
    windowBeats: 2,
    bonus: 0.4,
  },
  /** Full-band drop cooldown — a short anti-double-tap floor (per-voice
   *  recharge is now the real rate limit, so the old hard 13s is gone). */
  fullBandCooldownS: 2.5,
  /** The grid-locked build. Sub-phase A pins a fixed 2-bar (slowGenreBars)
   *  build in House; the flex/wait-cap fields are wired in sub-phase C. */
  build: {
    minBars: 1,
    slowGenreBars: 2,
    fastGenreBars: 1,
    waitCapMs: 600,
    compressToHalfBar: true,
    gapBeats: 1,
    gapBeatsFast: 0.5,
    fizzleSlamMul: 0.25,
  },
  /** Gap intensity per genre (1 = full cut, <1 = a duck). Keyed by GenreId. */
  gapDuck: {
    lofi: 0.4,
    house: 1.0,
    synthwave: 0.7,
    hiphop: 1.0,
    dnb: 1.0,
    techno: 0.85,
  },
  /** Drop juice — RENDER-CLOCK ONLY. Never scales the sim timestep (that would
   *  desync seeded replays, docs/phases/hold-and-drop-v2.md determinism note). */
  juice: {
    hitstopMinMs: 80,
    hitstopMaxMs: 120,
    slowMoScale: 0.4,
    slowMoHoldS: 0.25,
    slowMoRampS: 0.2,
    zoomIn: 0.06,
    zoomSettleS: 0.3,
    flashAlphaMax: 0.45,
  },
};
