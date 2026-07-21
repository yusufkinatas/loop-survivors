// Every tuning number in one place; balance edits land here, not in the
// systems. Weapon numbers are per-trigger: charts decide rate, so a kit's
// DPS = chart density x per-trigger damage (docs/plan.md, tempo and damage).
// One stat block per tier, indexed [tier - 1].

import type { Role } from '../audio/kits';
import type { PickupTimbre } from '../audio/engine';

export const RUN = {
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
  maxGems: 10000,
  /** Currency pickups merge into an overflow note above this visual cap. */
  maxMusicNotes: 10000,
  /** Live projectile ceiling; the oldest shot is evicted past it. Double Take
   * multiplies six weapons' spawn rate at once, so this guards the late tour. */
  maxProjectiles: 5000,
};

/** XP gem pickup sound. Chosen by ear against four other candidates and three
 *  other pitch behaviours; audio/cues/gem.ts holds the synthesis and
 *  explains the pitch and stereo reasoning.
 *
 *  `minGapS` is the reason this is a config block at all: gems arrive in
 *  bursts, and a Stage Magnet delivers the entire map at once. At 60 ms the
 *  cue tops out around 16 a second — dense enough to feel continuous, sparse
 *  enough that the limiter is not the thing shaping it. Same reasoning as
 *  DAMAGE_FEEDBACK.iframesS bounding the hit cue. */
export const GEM_CUE = {
  /** Scales the cue's envelope peaks. 0 silences it. Runs hot on purpose: the
   *  cue is two short square-wave notes with no sustain, so it needs the level
   *  to read over a full band without lengthening and turning into mud. */
  gain: 1.5,
  /** Stereo width. Consecutive pickups alternate ears, so vacuuming a big
   *  floor sweeps across the field rather than chattering in the centre.
   *  Fades toward mono for isolated pickups — a lone gem jumping to one ear
   *  reads as a bug. 0 is mono. */
  spread: 0.7,
  /** Minimum seconds between cues; extras are dropped, not queued. */
  minGapS: 0.06,
} as const;

/** Music-note pickup sound. Still a prototype: `timbre` is switchable live
 *  from the debug row (the five candidates in audio/cues/timbres.ts), which is
 *  why this block is mutable where GEM_CUE is `as const`.
 *
 *  The pitch behaviour is decided and NOT a knob — notes climb a scale ladder,
 *  one step per pickup, resetting after a pause. audio/cues/note.ts explains
 *  why that differs from the gem's XP-bar climb. */
export const NOTE_CUE = {
  /** Which candidate sound to render. Set by ear from the debug dropdown. */
  timbre: 'pluck' as PickupTimbre,
  /** Deliberately well under GEM_CUE.gain. A note is rarer than a gem and
   *  worth less noise; this should sit under the track, not on top of it. */
  gain: 0.7,
  /** Stereo width, matching the gem cue so a mixed vacuum sweeps as one
   *  effect rather than two competing ones. 0 is mono. */
  spread: 0.7,
  /** Minimum seconds between cues; extras are dropped, not queued. */
  minGapS: 0.06,
};

/** How large a build may grow. Two flat counts and nothing else: no typed
 * positions, no rosters, no rule that owning one weapon retires another. Every
 * weapon in the catalog stays offerable until the cap is reached, at which
 * point offers become tier-ups of what is already owned.
 *
 * Weapon slots are numbered by ACQUISITION ORDER — the first weapon hired is
 * slot 1 — which is why RunWorld.tiers is a Map and is only ever appended to.
 * Reordering it would renumber the rack and the number-key toggles underneath
 * the player mid-run. */
export const BUILD = {
  weaponCap: 5,
  itemCap: 5,
} as const;

/** How a gem or note travels once it has committed to flying at the player.
 * It does not go straight there: it first drifts a little the *other* way, then
 * turns and rushes in. The wind-back is what sells the pull as something acting
 * on the pickup rather than the pickup simply sliding, and it is the same read
 * Vampire Survivors uses. Purely presentational — the trip is still short and
 * the reach is still `RUN.magnetRadius`. */
export const PICKUP_PULL = {
  /** Seconds spent easing away from the player before the turnaround. */
  windbackTime: 0.12,
  /** Retreat speed at the instant the pull starts; it eases to a standstill
   * across `windbackTime`, so the pickup backs off roughly 10px. */
  windbackSpeed: 170,
  /** Seconds from the turnaround to full pull speed. Short enough that the
   * gem still lands about as fast as a straight line would have delivered it. */
  rushRampTime: 0.09,
} as const;

/** Rare one-use arena pickup. This is deliberately separate from Magnet
 * Lanyard, the passive item that increases ordinary pickup reach. */
export const STAGE_MAGNET = {
  /** Per eligible enemy kill: rare in a horde, but visible in a healthy run.
   * A flat probability and nothing else — no cooldown, no cap on how many may
   * wait on the floor, no expiry. A lucky streak is allowed to be lucky. */
  dropChance: 0.0012,
  /** Bad-luck protection. The next eligible kill drops one at this count. */
  pityKills: 700,
  pickupRadius: 28,
  /** Marked gems and notes cross a full viewport in well under a second. */
  vacuumSpeed: 1800,
} as const;

/** Rare floor heal. Every other heal in the game is attached to a decision
 * moment (the level-up pick, the chest fallback, Padded Jacket's on-acquire
 * top-up); this one rewards clearing the arena instead, and costs the player
 * no upgrade.
 *
 * A flat probability per eligible kill and nothing else: no cooldown, no cap
 * on how many may sit on the floor, no expiry, and no suppression when the
 * player is already healthy. Getting three in a row is allowed — that is what
 * a fixed drop rate means. The player decides whether a heal is worth walking
 * to, including deciding to leave it for later. */
export const HEALTH_PICKUP = {
  /** Per eligible enemy kill. Matches STAGE_MAGNET's rate. */
  dropChance: 0.0012,
  /** Fraction of the player's MAXIMUM health restored, so the heal keeps pace
   * with Padded Jacket instead of shrinking against a raised ceiling.
   * Overheal is not the caller's problem — RunWorld.healPlayer clamps. */
  healFraction: 0.2,
  pickupRadius: 28,
} as const;

/** Player take-damage feedback, shared by every arena (normal run, sandbox,
 *  and boss) through damage-feedback.ts. One place for the whole feel: the
 *  recovery window, the red edge tint, the hit screenshake, and the audio cue.
 *  The flash timing/color/intensity are pushed onto the `.hit-flash` element as
 *  CSS variables at runtime, so changing them here is enough (no CSS edit
 *  needed). `flashDurS` is meant to track `iframesS`: the tint lasts exactly as
 *  long as the recovery window. */
export const DAMAGE_FEEDBACK = {
  /** Recovery window after a landed hit: no further contact damage until it
   *  elapses. Both the run and the boss read this one value.
   *
   *  Deliberately short. A long window let the player stand inside the horde
   *  and pay almost nothing; at 0.3s contact is a real, per-second cost, which
   *  is what makes repositioning the actual defence. It also bounds the hit cue
   *  below: at most ~3 cues a second, so the duck never machine-guns. */
  iframesS: 0.3,
  /** How long the red edge tint holds, then fades (seconds). */
  flashDurS: 0.3,
  /** CSS color of the edge tint, including its own base alpha. */
  flashColor: 'rgba(255, 77, 94, 0.55)',
  /** Peak opacity of the flash during its hold (0..1). */
  flashIntensity: 0.9,
  /** Screenshake kicked on a landed hit (magnitude in view px, duration s). */
  shakeMag: 7,
  shakeDurS: 0.12,
  /** The hit cue ducks the weapons bus so the damage thud lands in a hole
   *  rather than fighting the track — the mix itself flinches. Depth is a
   *  fraction of unity; the hold is short enough that the music is back before
   *  the next hit can land (see `iframesS`). */
  hitDuckDepth: 0,
  hitDuckS: 2.5,
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
  enemyPushRadius: 375,
  /** Fixed proximity to collect a dropped item (independent of pickup buffs). */
  itemPickupRadius: 40,
  /** Collecting a ground reward shoves nearby enemies out a little too — a
   *  third of the drop-time enemyPushRadius, so the take has a physical kick
   *  without re-clearing the arena. */
  pickupPushRadius: 125,
  /** Triangle points, in degrees (placed with Math.cos/sin in the shell — a
   *  cosmetic, non-simulation position, so the native trig is fine here). */
  angles: [0, 120, 240] as const,
  /** Max duration of the cosmetic slow-mo / duck moment, real seconds. Ends
   *  early the instant the player collects a pick (see collectGroundPick). */
  momentS: 2,
  /** Time scale during the moment (composes with the dev timeScale). */
  slowScale: 0.75,
  /** Weapon (master) volume multiplier during the moment. */
  duckDepth: 0.32,
};

/** The chest slot machine. Walking onto a chest starts a short in-world reel
 * spin — icons cycling above the case, ticks decelerating like a slot wheel —
 * that lands on the payout: a ready weapon evolution when one exists, else
 * 1 / 3 / 5 free level-ups of things the player already owns (plus a health
 * garnish). The spin is pure anticipation: the outcome is rolled at open.
 *
 * Chests can arrive back to back (a five-minute mark drops up to four elites),
 * so ceremonies QUEUE — one full ritual after another, never stacked slow-mos. */
export const CHEST = {
  /** Reel spin duration, real seconds (slow-mo, rattle, ticks). */
  spinS: 2.1,
  /** Landing celebration duration after the reel stops, real seconds. */
  landS: 0.9,
  /** Time scale during the ceremony — deeper than a level-up's; this is the
   *  game's biggest reward beat. */
  slowScale: 0.6,
  /** Weapon-bus volume multiplier while the reel spins. */
  duckDepth: 0.28,
  /** Scripted payout sizes for a save's first chests (Vampire Survivors'
   *  1-1-3-1-1-5): every new player is guaranteed an early jackpot taste.
   *  Indexed by lifetime chests opened; random weights take over after. */
  openingSequence: [1, 1, 3, 1, 1, 5] as readonly (1 | 3 | 5)[],
  /** After the script: chance of a ×5 jackpot, then of a ×3 big win. */
  jackpotChance: 0.06,
  bigWinChance: 0.22,
  /** Health garnish stacked on top of the level-ups, by payout size. */
  healBySize: { 1: 10, 3: 20, 5: 40 } as Record<1 | 3 | 5, number>,
  /** The payout does not apply silently: each level-up drops as a pedestal
   *  around the player — first one this long after the reel stops... */
  dropDelayS: 0.12,
  /** ...then one per gap (bam, bam, bam), each with its own pushback thump. */
  dropGapS: 0.16,
  /** Scatter distance from the player for landed drops (closer than the
   *  choice triangle's itemRadius: these are all yours, just scoop them). */
  dropRadius: 115,
  /** Reel ticks across the spin; intervals grow geometrically (fast flicker
   *  into heavy final clunks — the wheel decelerating). */
  tickCount: 14,
  tickGrowth: 1.15,
};

/** When each reel tick fires, seconds from spin start. The audio cue and the
 * visual reel both consume this one schedule, so eye and ear agree on every
 * click. The last tick lands exactly at CHEST.spinS — the stop. */
export function chestTickTimes(): number[] {
  const { spinS, tickCount, tickGrowth } = CHEST;
  const total = (Math.pow(tickGrowth, tickCount) - 1) / (tickGrowth - 1);
  const first = spinS / total;
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < tickCount; i++) {
    t += first * Math.pow(tickGrowth, i);
    times.push(t);
  }
  return times;
}

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
  | 'circler'
  | 'shielded'
  | 'elite'
  // Mad Forest parity roster. The legacy kinds above remain for development
  // fixtures.
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
  | 'batSwarm'
  // Sandbox-only measurement prop. Never appears in a stage or endless row.
  | 'dummy';

/** Complete simulation catalog. The sandbox consumes this directly so an
 * opening-act change cannot hide endless-tour enemies from its controls. */
export const ALL_ENEMY_KINDS: readonly EnemyKind[] = [
  'bat', 'redBat', 'redBat2', 'zombie', 'skeleton', 'ghost',
  'greenMudman', 'grayMudman', 'flower', 'glowingBat', 'mantis', 'batSwarm',
  'swarmer', 'tank', 'darter', 'splitter', 'circler', 'shielded', 'elite',
  'dummy',
] as const;

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
  /** Uniform body scale, default 1. The one size lever that works for every
   *  kind: frame-backed kinds derive their radius per-spawn from
   *  MAD_FOREST_FRAMES and ignore `radius` entirely, so a single absolute
   *  number cannot express their size. RunWorld multiplies the resolved body
   *  radius and its foot offsets by this. */
  sizeMul?: number;
}

/** Official-demo coordinate conversion, normalized from a 456-high legacy
 * world to the 800-high reference view, with current normal Mad Forest's
 * enemy MoveSpeed x1.1 modifier (official wiki revision 89346). Exported so
 * the enemy lab can print tuned speeds back in this file's own idiom. */
export const ENEMY_SPEED_UNIT = 0.231 * (800 / 456) * 1.1;

/** Phaser 3.55 floors the half-width used by circle intersection after the
 * source requests a radius of 40% of the active atlas-frame width. */
function legacyEnemyRadius(spriteWidth: number): number {
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

const BAT_SWARM_RADII = MAD_FOREST_FRAMES.batSwarm!.map(
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
    color: 0xf29caf,
  },
  /** The late-game wall: slow, fat, soaks a build for 5-10s. */
  tank: {
    radius: 22,
    speed: 45,
    hp: 110,
    damage: 22,
    xp: 10,
    color: 0x98445f,
  },
  /** Fast, fragile, rushes the player in straight bursts. */
  darter: {
    radius: 8,
    speed: 360, // dash speed; it pauses between bursts (see run.ts)
    hp: 6,
    damage: 10,
    xp: 2,
    color: 0xff845f,
  },
  /** Bursts into a knot of swarmers on death. The early-mid wall. */
  splitter: { radius: 14, speed: 70, hp: 40, damage: 14, xp: 5, color: 0xd35f8d },
  /** Fast, fragile, orbits the player at range and harasses. */
  circler: { radius: 10, speed: 170, hp: 10, damage: 12, xp: 2, color: 0xb868db },
  /** A shield pool absorbs damage before its hp; the mid-game wall. */
  shielded: { radius: 16, speed: 55, hp: 40, damage: 16, xp: 7, color: 0xd474c8 },
  /** Slow, huge, tanky objective; drops one large gem (xp=big drop). */
  elite: { radius: 34, speed: 48, hp: 420, damage: 25, xp: 80, color: 0x8e3b68 },
  // Mad Forest normal-mode bestiary values. `damage` is what Antonio actually
  // loses after his +1 Armor; `power` retains the source number for audits/UI.
  bat: { radius: legacyEnemyRadius(19), speed: 140 * ENEMY_SPEED_UNIT, hp: 1, power: 5, damage: 4, xp: 1, color: 0xf07aa6, knockback: 1 },
  redBat: { radius: legacyEnemyRadius(25), speed: 140 * ENEMY_SPEED_UNIT, hp: 5, power: 5, damage: 4, xp: 1, color: 0xff6b63, knockback: 1 },
  redBat2: { radius: legacyEnemyRadius(30), speed: 140 * ENEMY_SPEED_UNIT, hp: 5, power: 5, damage: 4, xp: 1, color: 0xd83b76, knockback: 1 },
  zombie: { radius: legacyEnemyRadius(31), speed: 100 * ENEMY_SPEED_UNIT, hp: 10, power: 10, damage: 9, xp: 1, color: 0xc77a5c, knockback: 0.8 },
  skeleton: { radius: legacyEnemyRadius(28), speed: 100 * ENEMY_SPEED_UNIT, hp: 15, power: 10, damage: 9, xp: 2, color: 0xe7b673, knockback: 1 },
  ghost: { radius: legacyEnemyRadius(29), speed: 200 * ENEMY_SPEED_UNIT, hp: 10, power: 5, damage: 4, xp: 1.5, color: 0xa979e8, knockback: 0 },
  greenMudman: { radius: legacyEnemyRadius(34), speed: 100 * ENEMY_SPEED_UNIT, hp: 150, power: 10, damage: 9, xp: 2.5, color: 0x91ad59, knockback: 0.3 },
  grayMudman: { radius: legacyEnemyRadius(34), speed: 100 * ENEMY_SPEED_UNIT, hp: 70, power: 10, damage: 9, xp: 2.5, color: 0x9c829a, knockback: 0.3 },
  flower: {
    radius: legacyEnemyRadius(26),
    speed: 20 * ENEMY_SPEED_UNIT,
    hp: 30,
    power: 1,
    damage: 1,
    xp: 2,
    color: 0xff4f98,
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
    color: 0xffd45c,
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
    color: 0xbf64ff,
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
    color: 0xffa36b,
    fixedDirection: true,
    knockback: 1,
  },
  /** Sandbox measurement prop: undying, immobile, harmless. RunWorld special-
   *  cases it in every mover and in damageEnemy; the values here only need to
   *  give it a Moss Cabinet body and a colour that reads as scenery. */
  dummy: {
    radius: legacyEnemyRadius(34),
    speed: 0,
    hp: 1,
    power: 0,
    damage: 0,
    xp: 0,
    color: 0x8ba7a2,
    knockback: 0,
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

/** Player-facing names for The Hush. Internal keys remain stable simulation
 * IDs so the proven movement/stat tables do not change with the new fiction. */
export const ENEMY_LABELS: Record<EnemyKind, string> = {
  swarmer: 'Shardling',
  tank: 'Wallstack',
  darter: 'Needlejack',
  splitter: 'Crackbox',
  circler: 'Orbit Leech',
  shielded: 'Phase Guard',
  elite: 'Blackout Idol',
  bat: 'Static Mite',
  redBat: 'Flare Mite',
  redBat2: 'Night Mite',
  zombie: 'Cable Husk',
  skeleton: 'Jackwalker',
  ghost: 'Echo Shard',
  greenMudman: 'Moss Cabinet',
  grayMudman: 'Cracked Cabinet',
  flower: 'Mute Bloom',
  glowingBat: 'Signal Crown',
  mantis: 'The Shear',
  batSwarm: 'Static Rush',
  dummy: 'Practice Cabinet',
};

/** Base spawn-time stats before endless-minute scaling. Contact `damage` is
 * deliberately raw Power: RunWorld subtracts the player's current armor at
 * collision time so Padded Jacket also protects against enemies already alive.
 *
 * Takes a conf rather than a kind so the enemy lab can push the SAME derivation
 * through its edited values — see enemyStats in enemy-tuning.ts. Pass
 * ENEMIES[kind] for the shipped baseline. */
export function madForestEnemyStats(conf: EnemyConf, playerLevel: number) {
  return {
    radius: conf.radius,
    hp: conf.hp * (conf.hpPerLevel ? Math.max(1, playerLevel) : 1),
    speed: conf.speed,
    damage: conf.power ?? conf.damage,
    xp: conf.xp,
    color: conf.color,
    knockback: conf.knockback ?? 1,
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

/** Circler: orbits the player at this radius. */
export const CIRCLER = { orbitR: 150 };

/** Shielded: shield pool = hp*shieldMul, scaled by hpMul. */
export const SHIELDED = { shieldMul: 1.0 };

export interface WeaponConf {
  damage: number;
  speed?: number;
  radius?: number;
  lifetimeS?: number;
  pierce?: number;
  /** clap: half-angle of the forward damage cone (radians). */
  arc?: number;
  /** arp: radius of the orbit around the player. Read by the arp module, and
   *  by applyBuild for Wide Lens' orbitDistanceMul. */
  orbitRadius?: number;
  /** kick: Whip-style hitbox scale (1 = 258 x 39 at the reference view). */
  area?: number;
  /** kick: slashes per trigger; the second lands on the opposite side. */
  amount?: number;
  /** bell: how many shards this tier's note throws on its first hit. WAS
   *  config.BELL.shards, a second per-tier table sitting beside the ladder and
   *  indexed by the same tier; it is a rung's worth of tuning, so it rides the
   *  rung (#141). The build transform does not touch it — `...conf` carries it
   *  through applyBuild unchanged, exactly like `arc` and `amount`. */
  shards?: number;
}

/** Per-trigger gameplay effect of each kit, one block per tier ([tier-1]).
 *  Charts carry most of the growth (density = rate); stats bump where the
 *  ladder's character says so — bass per-trigger damage climbs hard (weight),
 *  hat barely moves (density is its whole story). */
export const WEAPONS: Partial<Record<Role, WeaponConf[]>> = {};

/** How far weapons look for a target. */
export const AIM_RANGE = 750;

/** Angular offset between Double Take's extra shots and the aim line. Wide
 *  enough to read as a spread, tight enough that aimed weapons stay aimed. */
export const MULTISHOT_FAN_RAD = 7 * Math.PI / 180;

// ---- weapon feel constants (Feature 3) ----

/** Height-normalized parity scale: the visible world is always 800 units tall,
 *  so movement, colliders, strip geometry, and spawn/event ellipses keep the
 *  researched proportions at every resolution. Shared world geometry — the
 *  player foot offset and enemy collider sizing derive from it too, so it is
 *  not owned by any one weapon module. */
export const WORLD_SCALE = 800 / 456;

/** How long an enemy rides a weapon shove before resuming its chase. */
export const SHOVE_S = 0.12;

// WEAPON_SHOVE IS GONE (#141). It was a role-keyed table of per-weapon knock
// distances, read inside the world's shared projectile loop, and it shrank one
// weapon at a time: the snare's 8 became SNARE_STATS.shove, the bass's 6 became
// BASS_STATS.shove, and the clap's 12 — the last entry — became CLAP_STATS.shove
// when the clap module landed. A weapon that knocks on a hit applies its own
// number now, from its own module.
//
// TWO_HANDS is gone with it, into the same module: base and evolved behavior
// belong to one weapon module, so the evolution's tuning cannot live in a
// separate table in config.

// BELL IS GONE (#141), and it was the LAST weapon-specific block in this file.
// The per-tier shard count became the `shards` rung field on WEAPONS.bell's
// ladder — now BELL_STATS.tiers — and the five shard constants became named
// stats in weapons/bell.ts. What is left in config.ts is global knobs only:
// enemies, XP, damage feedback and run shape.
