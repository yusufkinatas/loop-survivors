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
  // Large enough to keep a moving player in the upgrade loop, but smaller
  // than the broadest attacks: standing still leaves outer-ring gems behind
  // while moving through the arena turns combat success into build growth.
  magnetRadius: 180,
  pickupRadius: 18,
  /** Game-wide XP needed for each next level. Tracks never override this:
   *  selecting music changes weapons and sound, not progression rules. The
   *  curve covers every level of the largest possible 8x4 weapon build. */
  xpCurve: [
    1, 11, 15, 16, 18, 19, 21, 22, 24, 26, 27, 29, 31, 33, 35, 37,
    39, 41, 42, 44, 46, 48, 51, 53, 55, 57, 59, 61, 63, 65, 67,
  ],
};

export type EnemyKind =
  | 'swarmer'
  | 'tank'
  | 'darter'
  | 'splitter'
  | 'charger'
  | 'elite';

export interface EnemyConf {
  radius: number;
  speed: number;
  hp: number;
  damage: number;
  xp: number;
  color: number;
}

// The stage grows through a changing roster and authored pressure beats. The
// global curve keeps late enemies relevant without turning every body into a
// bullet sponge; the adaptive Director below supplies density independently.
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
    speed: 100,
    hp: 4,
    damage: 8,
    xp: 1,
    color: 0x9aa0b4,
  },
  tank: {
    radius: 20,
    speed: 58,
    hp: 50,
    damage: 18,
    xp: 5,
    color: 0x6a7086,
  },
  /** Fast, fragile, visibly aims before each straight burst. */
  darter: {
    radius: 8,
    speed: 380, // fixed dash speed; it does not use the global speed curve
    hp: 10,
    damage: 16,
    xp: 2,
    color: 0xe08a5a,
  },
  /** Bursts into a knot of swarmers on death. */
  splitter: { radius: 14, speed: 70, hp: 24, damage: 14, xp: 3, color: 0x8fb46a },
  /** Telegraphs, then commits a fast fixed-direction dash. */
  charger: { radius: 12, speed: 62, hp: 32, damage: 20, xp: 5, color: 0xd06a5a },
  /** Slow, large, persistent objective; reward is XP only. */
  elite: { radius: 30, speed: 45, hp: 160, damage: 26, xp: 24, color: 0xd94f8a },
  /** Spawn ring distance beyond the larger screen half-extent. */
  spawnMargin: 80,
  /** Soft ceiling for adaptive steady spawning; formations may exceed it up
   *  to MAX_ALIVE_HARD so authored spikes are never swallowed. */
  maxAlive: 450,
  /** Enemy HP multiplier reached at minute 8 (curved by rampExp). */
  hpScaleEnd: 5,
  /** Contact damage multiplier reached at minute 8, linear. */
  damageScaleEnd: 1.65,
  /** Speed multiplier reached at minute 8; fixed dash speeds are excluded. */
  speedScaleEnd: 1.18,
  /** HP grows gently early, then asks more of the finished build. */
  rampExp: 1.35,
  /** Enemies farther than spawnDist*recycleFactor behind the moving player are
   *  silently recycled (no gem/kill). >1 so fresh spawns aren't culled. */
  recycleFactor: 1.7,
};

/** Wave spawns may exceed maxAlive up to this absolute ceiling: a pinned
 *  cap must not silently swallow the designed spikes. */
export const MAX_ALIVE_HARD = 600;

/** The shape stays the kind's read; restrained size/color bands communicate
 *  the shared run scaling without making collision radii jump dramatically. */
export const ENEMY_BANDS = {
  /** Run progress (0..1) at which the next band starts. */
  t01: [0.25, 0.5, 0.75],
  sizeMul: [1, 1.06, 1.12, 1.18],
  colors: {
    swarmer: [0x9aa0b4, 0xc9b478, 0xd98a56, 0xd94f5a],
    tank: [0x6a7086, 0x94805e, 0xb06a46, 0xc04858],
    darter: [0xe08a5a, 0xe8a04a, 0xff7a3c, 0xff4658],
    splitter: [0x8fb46a, 0xa8b45e, 0xc09a4e, 0xc85a52],
    charger: [0xd06a5a, 0xdc7a4a, 0xe85a3c, 0xff4046],
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
  const hpMul = 1 + (ENEMIES.hpScaleEnd - 1) * Math.pow(t, ENEMIES.rampExp);
  return {
    hpMul,
    dmgMul: 1 + (ENEMIES.damageScaleEnd - 1) * t,
    spdMul: kind === 'darter' ? 1 : 1 + (ENEMIES.speedScaleEnd - 1) * t,
    xpMul: Math.sqrt(hpMul),
    band,
  };
}

/** Darter cycle: rest, visibly aim, then dash flat-out. */
export const DARTER = {
  tellS: 0.34,
  dashS: 0.46,
  pauseS: 0.9,
};

/** Splitter: bursts into this many children of childKind on death. Children
 *  are swarmers (never split → no recursion). */
export const SPLITTER = { childKind: 'swarmer' as EnemyKind, childCount: 3 };

/** Charger: within triggerRange it stands still (windup), then commits a fast
 *  fixed-direction dash. dashSpeed is NOT run through speedScaleEnd (stays
 *  dodgeable, same rule as darter). */
export const CHARGER = {
  triggerRange: 230,
  windupS: 0.85,
  dashS: 0.42,
  dashSpeed: 520,
  recoveryS: 0.45,
};

/** `set` beats define a regular-enemy population target, the maximum refill
 *  rate while below it, and the weighted roster. Elites never consume that
 *  target. `event` beats are authored spikes and may exceed it. */
export type Formation = 'ring' | 'surge' | 'pincer' | 'elite';
export type KindWeights = Partial<Record<EnemyKind, number>>;

export type DirectorBeat =
  | { atS: number; set: { targetAlive: number; refillRate: number; mix: KindWeights } }
  | { atS: number; event: { formation: Formation; kind: EnemyKind; count: number } };

/** Time-sorted. Beats at equal `atS` fire in array order in the same frame. */
export const SPAWN_DIRECTOR: DirectorBeat[] = [
  { atS: 0, set: { targetAlive: 24, refillRate: 10, mix: { swarmer: 100 } } },
  // Tanks enter at 0:30 rather than waiting a full minute: their durable wall
  // is the first movement check and prevents the starting aura from making a
  // stationary player safe. Darters follow as the second, dodgeable check.
  { atS: 30, set: { targetAlive: 36, refillRate: 12, mix: { swarmer: 70, tank: 20, darter: 10 } } },
  { atS: 35, event: { formation: 'pincer', kind: 'darter', count: 4 } },
  { atS: 45, event: { formation: 'pincer', kind: 'darter', count: 6 } },
  { atS: 50, event: { formation: 'pincer', kind: 'darter', count: 6 } },
  { atS: 60, set: { targetAlive: 55, refillRate: 14, mix: { swarmer: 60, tank: 25, darter: 15 } } },
  { atS: 60, event: { formation: 'surge', kind: 'darter', count: 8 } },
  { atS: 65, event: { formation: 'pincer', kind: 'darter', count: 5 } },
  { atS: 75, event: { formation: 'pincer', kind: 'darter', count: 8 } },
  { atS: 85, event: { formation: 'pincer', kind: 'darter', count: 8 } },
  { atS: 90, set: { targetAlive: 72, refillRate: 16, mix: { swarmer: 55, tank: 25, darter: 15, splitter: 5 } } },
  { atS: 90, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 95, event: { formation: 'pincer', kind: 'darter', count: 6 } },
  { atS: 105, set: { targetAlive: 45, refillRate: 8, mix: { swarmer: 70, tank: 15, darter: 15 } } },
  { atS: 110, event: { formation: 'pincer', kind: 'darter', count: 10 } },
  { atS: 120, set: { targetAlive: 90, refillRate: 18, mix: { swarmer: 65, tank: 15, darter: 10, splitter: 10 } } },
  { atS: 120, event: { formation: 'ring', kind: 'swarmer', count: 32 } },
  { atS: 150, set: { targetAlive: 115, refillRate: 20, mix: { swarmer: 55, tank: 20, darter: 10, splitter: 10, charger: 5 } } },
  { atS: 150, event: { formation: 'pincer', kind: 'charger', count: 4 } },
  { atS: 170, set: { targetAlive: 75, refillRate: 10, mix: { swarmer: 55, tank: 20, darter: 10, splitter: 10, charger: 5 } } },
  { atS: 180, set: { targetAlive: 140, refillRate: 22, mix: { swarmer: 52, tank: 18, darter: 10, splitter: 15, charger: 5 } } },
  { atS: 210, set: { targetAlive: 165, refillRate: 24, mix: { swarmer: 47, tank: 20, darter: 10, splitter: 15, charger: 8 } } },
  { atS: 210, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 210, event: { formation: 'surge', kind: 'splitter', count: 8 } },
  { atS: 230, set: { targetAlive: 110, refillRate: 12, mix: { swarmer: 47, tank: 20, darter: 10, splitter: 15, charger: 8 } } },
  { atS: 240, set: { targetAlive: 195, refillRate: 26, mix: { swarmer: 45, tank: 22, darter: 10, splitter: 15, charger: 8 } } },
  { atS: 240, event: { formation: 'ring', kind: 'swarmer', count: 50 } },
  { atS: 270, set: { targetAlive: 225, refillRate: 28, mix: { swarmer: 42, tank: 23, darter: 10, splitter: 15, charger: 10 } } },
  { atS: 270, event: { formation: 'pincer', kind: 'charger', count: 8 } },
  { atS: 290, set: { targetAlive: 145, refillRate: 14, mix: { swarmer: 42, tank: 23, darter: 10, splitter: 15, charger: 10 } } },
  { atS: 300, set: { targetAlive: 255, refillRate: 30, mix: { swarmer: 40, tank: 25, darter: 10, splitter: 15, charger: 10 } } },
  { atS: 330, set: { targetAlive: 285, refillRate: 32, mix: { swarmer: 38, tank: 25, darter: 12, splitter: 15, charger: 10 } } },
  { atS: 330, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 330, event: { formation: 'surge', kind: 'darter', count: 16 } },
  { atS: 350, set: { targetAlive: 190, refillRate: 16, mix: { swarmer: 38, tank: 25, darter: 12, splitter: 15, charger: 10 } } },
  { atS: 360, set: { targetAlive: 320, refillRate: 34, mix: { swarmer: 36, tank: 26, darter: 12, splitter: 16, charger: 10 } } },
  { atS: 360, event: { formation: 'ring', kind: 'swarmer', count: 70 } },
  { atS: 390, set: { targetAlive: 350, refillRate: 36, mix: { swarmer: 34, tank: 26, darter: 14, splitter: 16, charger: 10 } } },
  { atS: 390, event: { formation: 'pincer', kind: 'charger', count: 10 } },
  { atS: 410, set: { targetAlive: 230, refillRate: 18, mix: { swarmer: 34, tank: 26, darter: 14, splitter: 16, charger: 10 } } },
  { atS: 420, set: { targetAlive: 385, refillRate: 38, mix: { swarmer: 32, tank: 28, darter: 14, splitter: 16, charger: 10 } } },
  { atS: 420, event: { formation: 'elite', kind: 'elite', count: 2 } },
  { atS: 450, set: { targetAlive: 420, refillRate: 42, mix: { swarmer: 30, tank: 28, darter: 16, splitter: 16, charger: 10 } } },
  { atS: 450, event: { formation: 'ring', kind: 'swarmer', count: 90 } },
  { atS: 450, event: { formation: 'surge', kind: 'darter', count: 20 } },
  { atS: 470, event: { formation: 'pincer', kind: 'charger', count: 12 } },
  { atS: 470, event: { formation: 'surge', kind: 'splitter', count: 12 } },
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
    { damage: 6, radius: 112 },
    { damage: 8, radius: 128 },
    { damage: 10, radius: 144 },
    { damage: 12, radius: 162 },
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
    { damage: 5, speed: 430, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 6, speed: 430, radius: 3, lifetimeS: 0.85, pierce: 1 },
    { damage: 7, speed: 450, radius: 3, lifetimeS: 0.9, pierce: 2 },
    { damage: 8, speed: 460, radius: 3, lifetimeS: 0.95, pierce: 2 },
  ],
  // Slow wide low wave that rolls through everything. The weight ladder:
  // per-trigger damage climbs harder than any other kit.
  bass: [
    { damage: 10, speed: 150, radius: 34, lifetimeS: 2.4, pierce: 6 },
    { damage: 12, speed: 155, radius: 38, lifetimeS: 2.4, pierce: 8 },
    { damage: 15, speed: 160, radius: 43, lifetimeS: 2.5, pierce: 12 },
    { damage: 18, speed: 165, radius: 48, lifetimeS: 2.6, pierce: 16 },
  ],
  // Zone thrown onto the nearest pack: ticks damage and slows enemies
  // inside (gate B rework: zones under the player's own feet were dead
  // weight — the horde is never standing where you are).
  chord: [
    { damage: 2, radius: 90, lifetimeS: 1.8 },
    { damage: 3, radius: 100, lifetimeS: 2.0 },
    { damage: 4, radius: 112, lifetimeS: 2.2 },
    { damage: 5, radius: 126, lifetimeS: 2.4 },
  ],
  // Homing seeker per melody note.
  lead: [
    { damage: 12, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 15, speed: 345, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 19, speed: 350, radius: 6, lifetimeS: 2.3, pierce: 1 },
    { damage: 24, speed: 360, radius: 7, lifetimeS: 2.4, pierce: 2 },
  ],
  // Whip: a wide forward slash that hits everything in a close cone. Melee
  // crowd control — no travel, instant, safest when the wall is on top of you.
  clap: [
    { damage: 16, radius: 135, arc: 1.0 },
    { damage: 20, radius: 150, arc: 1.1 },
    { damage: 25, radius: 170, arc: 1.25 },
    { damage: 32, radius: 190, arc: 1.45 },
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
    { damage: 12, speed: 500, radius: 190, knockback: 36 },
    { damage: 15, speed: 520, radius: 225, knockback: 44 },
    { damage: 18, speed: 545, radius: 260, knockback: 54 },
    { damage: 22, speed: 570, radius: 300, knockback: 66 },
  ],
  // Rimshot (band, Backbeat): a dry crack that leaps enemy-to-enemy through a
  // cluster. Single-target per link, but the chain grows tier to tier. radius
  // is only the hit-spark size.
  rimshot: [
    { damage: 9, radius: 22, chains: 2 },
    { damage: 10, radius: 24, chains: 3 },
    { damage: 12, radius: 26, chains: 4 },
    { damage: 14, radius: 28, chains: 5 },
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
    { damage: 6, radius: 52, lifetimeS: 1.4 },
    { damage: 8, radius: 60, lifetimeS: 1.6 },
    { damage: 10, radius: 68, lifetimeS: 1.8 },
    { damage: 12, radius: 78, lifetimeS: 2.0 },
  ],
  // Acid (band, Motion): a placed gravity well that pulls enemies toward its
  // center and ticks damage while they are caught.
  acid: [
    { damage: 2, radius: 86, lifetimeS: 1.5, pull: 76 },
    { damage: 3, radius: 96, lifetimeS: 1.7, pull: 86 },
    { damage: 4, radius: 108, lifetimeS: 1.9, pull: 98 },
    { damage: 5, radius: 120, lifetimeS: 2.1, pull: 110 },
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
    { damage: 12, radius: 66, lifetimeS: 3.2 },
    { damage: 15, radius: 76, lifetimeS: 3.6 },
    { damage: 19, radius: 88, lifetimeS: 4.0 },
    { damage: 24, radius: 100, lifetimeS: 4.4 },
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
    { damage: 18, radius: 58 },
    { damage: 22, radius: 64 },
    { damage: 28, radius: 72 },
    { damage: 36, radius: 82 },
  ],
};

/** The one honest gameplay-effect line on each pick card ([tier-1]). Terse
 *  VS-style, zero music description (docs/phases/m2-the-arc.md): the sound
 *  change is discovered by ear. Lines state what the chart + stat change
 *  actually does. */
export const TIER_LINES: Record<Role, string[]> = {
  kick: [
    'steady close pulse around you',
    'harder, wider pulse with a soft turnaround',
    'stronger coverage and phrase pickup',
    'largest pulse with a heavy turnaround fill',
  ],
  snare: [
    'piercing shot on the backbeat',
    'fires twice as often, pierces 1 more',
    'adds weak ghost shots, pierces 1 more',
    'burst of shots every 4th bar',
  ],
  hat: [
    'fast aimed chips in the spaces between beats',
    'adds short closed-hit answers',
    'harder chips with stronger accents',
    'dense but controlled close-hit pattern',
  ],
  bass: [
    'slow wide wave that pierces a lane',
    'adds an offbeat wave',
    'heavier, wider two-bar movement',
    'largest waves with a phrase-turnaround drop',
  ],
  chord: [
    'throws a slowing field onto the nearest pack',
    'adds a second offbeat field',
    'bigger, longer fields with chord movement',
    'largest fields with a phrase-turnaround stab',
  ],
  lead: [
    'sparse homing shots trace a short hook',
    'the hook answers itself',
    'harder shots extend the phrase',
    'full hook; final shots pierce',
  ],
  clap: [
    'wide forward hit on the backbeat',
    'harder hit with a quiet pickup',
    'wider arc and stronger turnaround',
    'huge backbeat sweep with a short fill',
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
    'rare shockwave knocks the horde back',
    'adds a mid-phrase impact',
    'wider wave with a quiet turnaround hit',
    'massive phrase accents and heavy knockback',
  ],
  rimshot: [
    'dry crack chains through a small cluster',
    'adds a syncopated answer and one chain hop',
    'harder hits reach deeper into the pack',
    'turnaround fill rips through a large cluster',
  ],
  heartbeat: [
    'a pulse that shoves near and gathers far',
    'a wider breathing field',
    'pushes harder, pulls further',
    'a huge breathing field',
  ],
  shaker: [
    'quiet hits leave a short trail as you move',
    'longer trail on every other step',
    'continuous soft trail with stronger accents',
    'widest trail with a phrase-end flourish',
  ],
  acid: [
    'offbeat acid note throws a pulling well',
    'adds one syncopated well',
    'larger wells move across a two-bar phrase',
    'strongest pull with a phrase-end accent',
  ],
  pluck: [
    'a note lobbed that bursts on landing',
    'a bigger burst',
    'a heavier, wider burst',
    'a huge crushing burst',
  ],
  rhodes: [
    'warm offbeat note plants an armed mine',
    'adds a syncopated mine',
    'harder mines spread across two bars',
    'largest blooms with a phrase-end flourish',
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
    'vocal chop tags a foe; it bursts one beat later',
    'adds a second call-and-answer tag',
    'harder delayed bursts extend the phrase',
    'full vocal phrase with the largest bursts',
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

// ---- weapon feel constants ----

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

/** Whistle: how long after the tag lands the enemy pops (a beat, roughly —
 *  flavor, not tempo-locked). */
export const WHISTLE = { popS: 0.5 };
