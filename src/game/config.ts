// Every tuning number in one place; balance edits land here, not in the
// systems. Weapon numbers are per-trigger: charts decide rate, so a kit's
// DPS = chart density x per-trigger damage (docs/plan.md, tempo and damage).
// One stat block per tier, indexed [tier - 1].

import type { Role } from '../audio/kits';

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

/** Music-note pickup sound: a bell whose pitch climbs one scale step per note
 *  and falls back to the root once you stop collecting. Chosen by ear against
 *  four other candidates; audio/cues/note.ts holds the synthesis and explains
 *  why the ladder differs from the gem cue's XP-bar climb.
 *
 *  Same `minGapS` reasoning as GEM_CUE: notes arrive in bursts and a Stage
 *  Magnet delivers the whole map at once. */
export const NOTE_CUE = {
  /** Deliberately well under GEM_CUE.gain. A note is rarer than a gem and
   *  worth less noise; this sits under the track, not on top of it. */
  gain: 0.7,
  /** Stereo width, matching the gem cue so a mixed vacuum sweeps as one
   *  effect rather than two competing ones. 0 is mono. */
  spread: 0.7,
  /** Minimum seconds between cues; extras are dropped, not queued. */
  minGapS: 0.06,
} as const;

/** How large a build may grow. Two flat counts and nothing else: no typed
 * positions, no rosters, no rule that owning one weapon retires another. Every
 * weapon in the catalog stays offerable until the cap is reached, at which
 * point offers become tier-ups of what is already owned.
 *
 * Weapon slots are numbered by ACQUISITION ORDER — the first weapon hired is
 * slot 1 — which is why RunWorld.tiers is a Map and is only ever appended to.
 * Reordering it would renumber the rack and the number-key toggles underneath
 * the player mid-run.
 *
 * The two counts are deliberately unequal and must stay independent: passives
 * are pure stats, so a sixth one only lengthens the build, while a sixth weapon
 * would be a sixth concurrent voice in the mix. Build-as-track outranks
 * verbatim parity, so the passive cap moved to 6 and the weapon cap did not. */
export const BUILD = {
  weaponCap: 5,
  itemCap: 6,
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

/** The Stage Light: a destructible prop — a toppled follow-spot The Hush has
 * not consumed, glowing warm amber (player-power-spec §6a-6c). The game has no
 * Luck stat, so every number here is the spec's already collapsed at
 * `totalLuck ≡ 1.0`; there is no formula left to feed. */
export const STAGE_LIGHT = {
  /** Seconds between spawn attempts. */
  attemptS: 1,
  /** Flat chance one attempt lands a light. */
  chance: 0.1,
  /** Most that may be alive at once. A successful attempt AT the cap still
   * spawns — closest to the player — and retires the OLDEST light to make
   * room. That retirement is a despawn, not a break: no spark, no drop. */
  maxAlive: 10,
  hp: 10,
  /** Damage footprint. A light collides with nothing, so this is only what a
   * weapon hitbox has to overlap to chip it. */
  radius: 15,
  /** Inner edge of the spawn oval, as a multiple of the view's half extents.
   * √2 is the SMALLEST oval that clears the whole screen — it passes exactly
   * through the four corners — so a hair above it is "barely off-screen" for
   * an oval, the way a plain circle of half the larger dimension is not. */
  spawnFrac: 1.45,
  /** How much further out an ordinary spawn may land, same units, so the ring
   * is a band rather than a line. A spawn at the cap skips this entirely and
   * lands on the inner edge — the closest an off-screen spawn can be. */
  spawnBandFrac: 0.2,
  /** How many points around the oval count as possible spawn locations. Below
   * the cap the angle is simply random and this is unused; AT the cap the
   * source picks "a location closest to the player" out of its candidates, and
   * this is that candidate set. An oval is nearest the player on its SHORT
   * axis, so a finer ring means a tighter, less varied at-cap choice — 24
   * leaves the pick wandering about ±7 degrees. */
  spawnPoints: 24,
  /** The locked color anchor: warm amber against the Hush's cold static
   * palette. Spelled as a literal for the same reason VICTORY.sweepColor is —
   * run.ts is pure simulation and cannot reach the renderer's palette — and it
   * is `SOUNDWOOD.amber` to the digit, which the view relies on. */
  color: 0xffd56a,
  /** The break's ONLY feedback: a spark burst. Breaking a light is silent —
   * pillar 1, only weapons make sounds. */
  sparkCount: 16,
  sparkSpread: 34,
  /** Seconds of hit flash on a chip that does not break it. Matches the
   * enemy flash so a light reads as taking the same hit. */
  flashS: 0.08,
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

/** The Encore: what a maxed build's level-up pays. Only the Tip Jar needs a
 * number of its own — the other card is a First Aid, HEALTH_PICKUP.healFraction
 * and all, because it is deliberately the same heal the floor drop gives. */
export const ENCORE = {
  /** Granted instantly on pick, with no pickup to walk to and no multiplier.
   * Also what one leftover chest hit on a maxed build converts to. */
  tipJarNotes: 25,
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
 * Chests can arrive back to back (21:00 is a double boss, and boss minutes sit
 * one after another late in the table), so ceremonies QUEUE — one full ritual
 * after another, never stacked slow-mos. */
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
  // Mad Forest parity roster.
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
  | 'giantBat'
  | 'silverBat'
  | 'werewolf'
  | 'bigMummy'
  | 'venus'
  | 'ghostSwarm'
  // The four Giants: separate stat blocks, not promotions of the base kinds
  // (mad-forest-spec 2d). They draw the base silhouette at 1.5x.
  | 'giantMantis'
  | 'giantWerewolf'
  | 'giantMummy'
  | 'giantBlueVenus'
  // Sandbox-only measurement prop. Never appears in a stage row.
  | 'dummy';

/** Complete simulation catalog. The sandbox consumes this directly so a change
 * to the wave table cannot hide any kind from its controls. */
export const ALL_ENEMY_KINDS: readonly EnemyKind[] = [
  'bat', 'redBat', 'redBat2', 'zombie', 'skeleton', 'ghost',
  'greenMudman', 'grayMudman', 'flower', 'glowingBat', 'mantis', 'batSwarm',
  'giantBat', 'silverBat', 'werewolf', 'bigMummy', 'venus', 'ghostSwarm',
  'giantMantis', 'giantWerewolf', 'giantMummy', 'giantBlueVenus',
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
  giantBat: [{ width: 50, height: 39 }],
  silverBat: [{ width: 27, height: 25 }],
  werewolf: [{ width: 32, height: 34 }],
  bigMummy: [{ width: 37, height: 50 }],
  venus: [{ width: 51, height: 50 }],
  // The sweep wears the Ghost frame; the source lists no swarm-specific size.
  ghostSwarm: [{ width: 29, height: 32 }],
  // Giants reuse their base kind's frames verbatim: the source has no separate
  // Giant sprites, only an explicit 1.5x scale note. nextEnemyBody applies
  // sizeMul after the source's floor(), so the radius parity holds.
  giantMantis: [{ width: 48, height: 47 }],
  giantWerewolf: [{ width: 32, height: 34 }],
  giantMummy: [{ width: 37, height: 50 }],
  giantBlueVenus: [{ width: 51, height: 50 }],
};

const BAT_SWARM_RADII = MAD_FOREST_FRAMES.batSwarm!.map(
  (frame) => legacyEnemyRadius(frame.width),
) as readonly number[];

// Every entry is a Mad Forest statline plus the sandbox dummy. Stats are final
// at spawn: HP×Level is the only scaling in the game (mad-forest-spec §5), so
// there are no continuous ramp factors here to apply.
export const ENEMIES: Record<EnemyKind, EnemyConf> & {
  spawnMargin: number;
  maxAlive: number;
  recycleFactor: number;
} = {
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
  /** Woofer: the heavy bat. Barely shoves (knockback 0.1) — it wades through
   *  a build instead of being pushed by it. */
  giantBat: {
    radius: legacyEnemyRadius(50),
    speed: 140 * ENEMY_SPEED_UNIT,
    hp: 270,
    power: 10,
    damage: 9,
    xp: 2.5,
    color: 0xa32f4d,
    knockback: 0.1,
  },
  /** Silver Crown: a deliberate stat-copy of Signal Crown (the source's own
   *  design — the silver bat is a recolor), so it carries HP×Level too. */
  silverBat: {
    radius: legacyEnemyRadius(27),
    speed: 140 * ENEMY_SPEED_UNIT,
    hp: 50,
    power: 10,
    damage: 9,
    xp: 30,
    color: 0xc9d6e4,
    hpPerLevel: true,
    knockback: 1,
  },
  werewolf: {
    radius: legacyEnemyRadius(32),
    speed: 130 * ENEMY_SPEED_UNIT,
    hp: 180,
    power: 14,
    damage: 13,
    xp: 2,
    color: 0xff8c2b,
    knockback: 0.8,
  },
  /** Gaffer Husk and Snare Bloom share Shearjaw's 500/20/80/3 statline — the
   *  source authors all three from the same block. */
  bigMummy: {
    radius: legacyEnemyRadius(37),
    speed: 80 * ENEMY_SPEED_UNIT,
    hp: 500,
    power: 20,
    damage: 19,
    xp: 3,
    color: 0x77808a,
    knockback: 0,
  },
  venus: {
    radius: legacyEnemyRadius(51),
    speed: 80 * ENEMY_SPEED_UNIT,
    hp: 500,
    power: 20,
    damage: 19,
    xp: 3,
    color: 0x62c452,
    knockback: 0,
  },
  /** Echo Rush: the Static Rush sweep with ghost bodies. Same fixed-direction
   *  event movement; stats mirror batSwarm (the source lists none of its own). */
  ghostSwarm: {
    radius: legacyEnemyRadius(29),
    speed: 700 * ENEMY_SPEED_UNIT,
    hp: 1,
    power: 1,
    damage: 1,
    xp: 1,
    color: 0x9b7bf0,
    fixedDirection: true,
    knockback: 1,
  },
  /** The four Giants (mad-forest-spec 2d). Distinct stat blocks, not scaled
   *  copies: their numbers do not derive from the base kind by any multiplier.
   *  The low base HP is the point — HP×Level is what makes them durable, and
   *  they are only ever authored as spawnClass 'boss' rows. Freeze resistance
   *  is not mirrored (this game has no freeze). */
  giantMantis: {
    radius: legacyEnemyRadius(48),
    speed: 160 * ENEMY_SPEED_UNIT,
    hp: 150,
    power: 20,
    damage: 19,
    xp: 50,
    color: 0xbf64ff,
    hpPerLevel: true,
    knockback: 0,
    sizeMul: 1.5,
  },
  /** XP 2 is a verbatim source oddity — the other three give 25-50. Giant
   *  Howlback's reward moment is the boss chest, not the gem. */
  giantWerewolf: {
    radius: legacyEnemyRadius(32),
    speed: 130 * ENEMY_SPEED_UNIT,
    hp: 200,
    power: 20,
    damage: 19,
    xp: 2,
    color: 0xff8c2b,
    hpPerLevel: true,
    knockback: 0.1,
    sizeMul: 1.5,
  },
  giantMummy: {
    radius: legacyEnemyRadius(37),
    speed: 80 * ENEMY_SPEED_UNIT,
    hp: 250,
    power: 20,
    damage: 19,
    xp: 25,
    color: 0x77808a,
    hpPerLevel: true,
    knockback: 0,
    sizeMul: 1.5,
  },
  /** The one Giant that does not inherit its base hue: blue instead of Snare
   *  Bloom's plant green. makeEnemyGfx tints from this colour, so the shared
   *  hushBloom geometry needs no variant. */
  giantBlueVenus: {
    radius: legacyEnemyRadius(51),
    speed: 160 * ENEMY_SPEED_UNIT,
    hp: 150,
    power: 30,
    damage: 29,
    xp: 50,
    color: 0x4f8cff,
    hpPerLevel: true,
    knockback: 0,
    sizeMul: 1.5,
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
  giantBat: 'Woofer',
  silverBat: 'Silver Crown',
  werewolf: 'Howlback',
  bigMummy: 'Gaffer Husk',
  venus: 'Snare Bloom',
  ghostSwarm: 'Echo Rush',
  giantMantis: 'Giant Shearjaw',
  giantWerewolf: 'Giant Howlback',
  giantMummy: 'Giant Gaffer Husk',
  giantBlueVenus: 'Giant Snare Bloom',
  dummy: 'Practice Cabinet',
};

/** Spawn-time stats, final. HP×Level is applied here and is the ONLY scaling in
 * the game (mad-forest-spec §5) — nothing multiplies these afterwards, and no
 * value here moves with the clock. Contact `damage` is
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

// NO WEAPON-SPECIFIC BLOCK REMAINS IN THIS FILE (#141). Every weapon's tuning
// lives as named stats in its own module under weapons/. What is left in
// config.ts is global knobs only: enemies, XP, damage feedback and run shape.

/** The demo end (mad-forest-spec §8). Surviving to `atS` wins the run: the
 *  stage script stops spawning, the player becomes untouchable, and a single
 *  wave sweeps outward from the player killing every live enemy — no XP, no
 *  kill credit, no chest, a boss included. Then the stage is quiet for
 *  `quietBeatS` while the win flourish rings out, and the win screen opens.
 *
 *  `sweepSpeed` is deliberately fast — about a screen width every third of a
 *  second, the whole arena inside a second. The clear is punctuation, not a
 *  fight: it should read as one gesture, and it has to be finished well
 *  before the empty-stage beat it is clearing the stage for. */
export const VICTORY = {
  atS: 30 * 60,
  /** Kill-wave radius growth, world px per second. */
  sweepSpeed: 2600,
  /** How far the wave travels before it retires; well past any spawn ring. */
  sweepReach: 2600,
  sweepColor: 0xffe9a8,
  /** Empty-stage beat between the track's last bar and the win screen. */
  quietBeatS: 2.6,
};
