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
