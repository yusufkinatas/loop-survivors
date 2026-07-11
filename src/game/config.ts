// Every tuning number in one place. Weapon numbers are per-trigger: charts
// decide rate, so a kit's DPS = chart density x per-trigger damage (docs/plan.md,
// tempo and damage). One stat block per tier, indexed [tier - 1].
//
// VS-FIDELITY PASS (2026-07): the enemy roster, contact model, scaling, spawn
// arc, and every weapon's damage/area were re-derived from a deep dive on
// Vampire Survivors' first stage, Mad Forest (numbers spec in
// docs/phases/vs-fidelity.md). Headline facts that shaped this file:
//   - Player 100 HP; contact damage is applied repeatedly, gated by a 240ms
//     global i-frame (RUN.iframesS). A single Power-10 enemy pinned on you is
//     ~42 dmg/s => ~2.4s to die. That "don't get surrounded" budget IS the game.
//   - Mad Forest has NO per-minute stat scaling. Difficulty is tankier TYPES on
//     a schedule + rising density + scripted events. So enemyScaling is a mild
//     HP creep only; the arc lives in SPAWN_DIRECTOR.
//   - Speed relationships are the soul. VS ratios (fodder 0.91x, bats 1.27x,
//     ghosts 1.82x) were tuned toward playability for a fleeing player: fodder
//     stays kiteable (~0.85-0.96x), the low-HP GHOST is the one enemy that
//     truly outruns you (1.30x), and swarm-sweeps blitz across (6.3x).
//   - The Whip (our kick): 10 dmg / amount 1->2 / +area, one-shots minute-1
//     fodder but can't clear the mid walls single-target — that crossover is
//     what forces build growth.

import type { Role } from '../audio/kits';

export const RUN = {
  /** The 8-minute arc. */
  durationS: 480,
  playerHp: 100,
  playerSpeed: 230,
  playerRadius: 12,
  /** Global invulnerability after taking a hit. VS's Mad-Forest tension comes
   *  from the 240ms i-frame: a single overlapping enemy hits ~4.17x/s, so a
   *  Power-10 enemy is ~42 dmg/s and pins you dead in ~2.4s. (Was 0.5s, which
   *  made being surrounded far too survivable.) */
  iframesS: 0.24,
  magnetRadius: 140,
  pickupRadius: 18,
  /** XP to reach each next level. Modeled on VS's curve (L1->2 = 5, then a
   *  widening gap) but a touch gentler early so a fresh build fills its band
   *  over the 8-minute arc (~14-20 level-ups; bot-tuned). */
  xpCurve: [5, 10, 16, 24, 34, 46, 60, 76, 94, 114, 138, 165, 195, 230, 270, 315],
};

// VS Mad Forest early roster, ported to straight-chaser archetypes. The kinds
// differ by SPEED, HP, SIZE, and contact damage — not by fancy AI — exactly as
// VS's first stage does. Two exceptions to the pure chase: swarm-event enemies
// fly a locked line across the screen (SWEEP), and nothing else.
export type EnemyKind =
  | 'bat' // quick, weak opener fodder (0.96x player) — you plow through it
  | 'zombie' // basic kiteable fodder (0.85x) — the bread-and-butter horde
  | 'skeleton' // wall fodder, a touch tankier (0.85x) — density
  | 'ghost' // very fast flanker (1.30x), knockback-immune — the pressure
  | 'mudman' // slow-ish mid-tank (0.85x) — soaks a few seconds
  | 'werewolf' // near-player-speed (0.98x) and hits hard — kite AND focus it
  | 'mantis' // slow heavy wall (0.65x), knockback-immune — you can't clear it
  | 'elite'; // slow huge objective — big HP, drops a fat gem

export interface EnemyConf {
  radius: number;
  speed: number;
  hp: number;
  damage: number;
  xp: number;
  color: number;
}

// Base bestiary stats (VS-derived), unmodified by minute (see enemyScaling).
// Speeds are px/s: VS internal speeds x (230/1.1)/100, so our 230px/s player is
// the "Mad-Forest player" (VS boosts the player 1.1x on this stage). Contact
// damage = VS "Power" (as a % of the 100 HP player). Colours are ONE distinct
// hue per kind so a type is read by colour + shape, never by a time-band.
export const ENEMIES: Record<EnemyKind, EnemyConf> & {
  spawnMargin: number;
  maxAlive: number;
  hpScaleEnd: number;
  damageScaleEnd: number;
  speedScaleEnd: number;
  rampExp: number;
  recycleFactor: number;
} = {
  // Quick weak fodder. Brought to ~fodder speed (0.91x) so a moving player no
  // longer OUTRUNS the swarm — it stays packed against you, VS's core feel. The
  // developer's "bats are super fast and don't swarm" was the old 0.96x: fast
  // enough to streak in as individuals, not clump into a mass. Now they clump.
  // 4 HP => a tier-1 whip (~11 shown) still one-shots them. (VS bats are 1.27x,
  // which glues onto a fleeing player and kills in ~4s; the low-HP GHOST stays
  // our sole true outrunner.)
  bat: { radius: 8, speed: 210, hp: 4, damage: 6, xp: 1, color: 0xd85a5a },
  // The kiteable horde at VS's exact fodder ratio (0.91x): a straight-line flee
  // sheds them at only ~20px/s, so a CIRCLING player keeps the wall packed in
  // front (was 0.85x = 35px/s shed, which strung them into a thin tail).
  zombie: { radius: 10, speed: 209, hp: 10, damage: 10, xp: 1, color: 0x8fae6a },
  // Slightly tankier wall fodder; arrives in rings/waves.
  skeleton: { radius: 10, speed: 209, hp: 16, damage: 10, xp: 2, color: 0xd8d2c0 },
  // Genuinely faster than you (1.4x) and knockback-immune — the harasser you
  // can't outrun. But only 12 HP, so a grown build deletes it; it's introduced
  // at 2:00 once you have tools. Being caught briefly costs a little, not a run.
  ghost: { radius: 10, speed: 300, hp: 12, damage: 6, xp: 2, color: 0x8fd8ff },
  // Mid-tank: fodder speed but 7x the HP — soaks a few seconds of a lone whip.
  mudman: { radius: 15, speed: 209, hp: 70, damage: 10, xp: 3, color: 0xa9814f },
  // Fast AND tanky AND hits hard (14 = 14%/hit). The first genuine "oh no".
  werewolf: { radius: 13, speed: 225, hp: 180, damage: 14, xp: 3, color: 0xd98a4a },
  // The heavy wall: slow, huge HP, 20 power (a pin against one is ~1.7s dead),
  // knockback-immune. Closing rings of these are the flower-wall events.
  mantis: { radius: 22, speed: 150, hp: 400, damage: 20, xp: 4, color: 0x6abf5a },
  // Slow huge objective; drops one fat gem (xp big). Knockback-immune.
  elite: { radius: 34, speed: 160, hp: 800, damage: 24, xp: 40, color: 0xe24fa0 },
  /** Spawn ring distance beyond the larger screen half-extent. */
  spawnMargin: 80,
  /** Soft cap on the steady-state horde. VS caps periodic spawns at 300; we sit
   *  in that band (events push past it to MAX_ALIVE_HARD). Our arena reads larger
   *  relative to enemy size than VS's camera, so we hold a few more bodies to
   *  fill the same visual density. */
  maxAlive: 480,
  /** Enemy HP multiplier reached at minute 8 (curved by rampExp). Mad Forest
   *  does NOT scale base stats — difficulty is tankier TYPES + density. This is
   *  a MILD creep only, so the compressed 8-minute finale's walls stay a step
   *  ahead of a grown build without a VS-untrue x8 curve. */
  hpScaleEnd: 1.6,
  /** Contact damage multiplier at minute 8. FLAT (1.0), VS-authentic: a bat
   *  hits for the same 6% at 7:00 as at 0:00. Danger scales via which TYPES
   *  spawn, never via inflating a bat's sting. */
  damageScaleEnd: 1.0,
  /** Speed multiplier at minute 8. FLAT (1.0), VS-authentic. */
  speedScaleEnd: 1.0,
  /** Exponent shaping the (mild) HP creep: >1 keeps the early game at base. */
  rampExp: 1.5,
  /** Enemies farther than spawnDist*recycleFactor from the player are silently
   *  recycled (no gem/kill). Raised 1.7 -> 2.6: the old value deleted the
   *  trailing horde barely a screen-and-a-half back, so a moving player kept
   *  MANUFACTURING an empty field — the wall he left behind evaporated before he
   *  could circle back onto it. At 2.6 (~2.6 screen-widths) the mass persists,
   *  so turning or circling puts you right back into it. Still bounded, so a
   *  straight-line runner can't tow an unbounded tail. */
  recycleFactor: 2.6,
};

/** Wave spawns may exceed maxAlive up to this ceiling (VS's 500 absolute cap):
 *  a pinned cap must not swallow the designed event spikes. */
export const MAX_ALIVE_HARD = 700;

/** Density FLOOR refill (VS's wave-minimum mechanic). VS spawns to keep a
 *  minimum alive each wave, so you are ALWAYS surrounded no matter how fast you
 *  clear; a pure spawn-RATE (our old model) lets a strong build suppress the
 *  count and empty the screen. When alive < the phase's `floor`, the director
 *  spawns extra bodies at up to this many per second until the floor is met.
 *  Smooth (not a burst) so the wall closes in rather than popping in. */
export const FLOOR_REFILL_RATE = 14;

/** Enemy-vs-enemy separation weight in moveEnemies. Lowered 1.5 -> 0.7: the old
 *  push was strong enough to hold the horde apart into spaced dots; VS enemies
 *  overlap HEAVILY into a solid wall. Weak separation lets them stack (denser
 *  read) without collapsing to a single point (which 0 would do). */
export const SEPARATION_WEIGHT = 0.7;

/** Swarm-sweep enemies (bat/ghost swarms) fly a LOCKED line across the screen
 *  instead of chasing — VS's bat/ghost swarm event. The developer's complaint
 *  ("a group crossing the screen is scattered, not a big chunky group of bats")
 *  was two things: the old sweep was TOO FAST (1460px/s, 6.4x player — a
 *  blink-and-miss strobe) and TOO SPREAD (one sparse line across 1.15x the
 *  screen). Now it is a dense BLOCK — many ranks deep, packed shoulder to
 *  shoulder in a narrow band — moving at a readable "wall you must dodge" speed.
 *   - speed: px/s of the block (was 1460; ~3.7x player reads as a fast wall).
 *   - bandFrac: block width as a fraction of the larger screen dimension.
 *   - spacingMul: gap between bats as a multiple of their radius (tight = dense).
 *   - jitter: per-bat position noise (px) so it reads organic, not a grid. */
export const SWEEP = { speed: 860, bandFrac: 0.36, spacingMul: 2.4, jitter: 9 };

/** Knockback-immune kinds (VS: ghosts, mantises, bosses resist knockback). Our
 *  shove/shock channels skip these, so no weapon can create space against them
 *  — they just keep coming. */
export const KB_RESIST = new Set<EnemyKind>(['ghost', 'mantis', 'elite']);

/** Visual toughness bands. With near-flat stats these are a light touch: each
 *  kind keeps its own colour (so a type is identified by colour + shape), the
 *  band only nudges size and, at the top band, stamps a dark core. */
export const ENEMY_BANDS = {
  /** Run progress (0..1) at which the next band starts. */
  t01: [0.35, 0.62, 0.85],
  sizeMul: [1, 1.06, 1.12, 1.18],
  colors: {
    bat: [0xd85a5a, 0xdf6a5a, 0xe6604f, 0xef5a4f],
    zombie: [0x8fae6a, 0x9bb46a, 0xa8ba63, 0xb4bd5c],
    skeleton: [0xd8d2c0, 0xdcd6c4, 0xe0dac8, 0xe6e0cf],
    ghost: [0x8fd8ff, 0x9bd6ff, 0xa8d2ff, 0xb4ceff],
    mudman: [0xa9814f, 0xb0844c, 0xb98748, 0xc28a44],
    werewolf: [0xd98a4a, 0xe08847, 0xe88043, 0xf07840],
    mantis: [0x6abf5a, 0x6ec257, 0x74c653, 0x7aca4f],
    elite: [0xe24fa0, 0xe6509a, 0xea5090, 0xef5086],
  } as Record<EnemyKind, number[]>,
};

/** The one scaling formula, shared by the run and the sandbox's stage-minute
 *  preview so both always agree on what "minute N" means. Mad Forest scales
 *  almost nothing — a mild HP creep, flat damage/speed/XP. */
export function enemyScaling(
  t01: number,
  _kind: EnemyKind,
): { hpMul: number; dmgMul: number; spdMul: number; xpMul: number; band: number } {
  const t = Math.min(1, Math.max(0, t01));
  let band = 0;
  for (const th of ENEMY_BANDS.t01) if (t >= th) band++;
  return {
    hpMul: 1 + (ENEMIES.hpScaleEnd - 1) * Math.pow(t, ENEMIES.rampExp),
    dmgMul: 1 + (ENEMIES.damageScaleEnd - 1) * t,
    spdMul: 1 + (ENEMIES.speedScaleEnd - 1) * t,
    xpMul: 1, // flat: VS enemies drop fixed XP per type; density carries cadence
    band,
  };
}

/** Splitter is gone (not a Mad Forest behaviour); SHIELDED/DARTER/CHARGER/
 *  CIRCLER AI removed too. Every enemy is now a straight chaser (VS's model)
 *  except swarm-sweep enemies (SWEEP above). */

/** Data-driven spawn Director. `set` beats change the steady pressure (rate +
 *  weighted kind mix); `event` beats fire a formation once. Breathers = low-rate
 *  `set` beats after event clusters. The steady rate must overrun an AFK player
 *  by the finale. */
export type Formation = 'ring' | 'surge' | 'pincer' | 'sweep' | 'elite';
export type KindWeights = Partial<Record<EnemyKind, number>>;

export type DirectorBeat =
  | { atS: number; set: { rate: number; mix: KindWeights; floor?: number } }
  | { atS: number; event: { formation: Formation; kind: EnemyKind; count: number } };

/** Time-sorted. Beats at equal `atS` fire in array order in the same frame.
 *
 *  Mad Forest, compressed from 30 minutes into a complete 8-minute arc (the
 *  developer's call). Each ~minute introduces a tougher TYPE, pressure climbs
 *  to an event cluster, a short breather resets tension, then the finale (7:00
 *  on) drops the breathers and overruns any build. The three VS event types are
 *  reproduced: SWEEP (a dense block of bats/ghosts sweeping across), RING (a
 *  closing wall — the flower-wall), and the ELITE objective. Introduction order:
 *  bat 0:00, zombie 0:20, skeleton 1:30, ghost 2:00, mudman 2:40, werewolf 3:30,
 *  mantis 4:00; elite recurs from 1:00.
 *
 *  `floor` on each `set` beat is the density MINIMUM (VS's wave floor): the
 *  director tops the field back up to it whenever a strong build clears below
 *  it, so you are always surrounded (the swarm no longer depends on your DPS
 *  being weak). Floors track VS's Mad Forest curve, compressed: ~12-20 early,
 *  ~30-50 mid, ~80-110 finale. `rate` is the ongoing pressure ON TOP of the
 *  floor; the two together shape the horde. */
export const SPAWN_DIRECTOR: DirectorBeat[] = [
  // -- 0:00 the on-ramp: a light trickle of quick bats. The whip one-shots
  //    them, so the opening is gentle (VS minute-0 floor ~15). You build up.
  { atS: 0, set: { rate: 2.5, mix: { bat: 1 }, floor: 12 } },
  { atS: 20, set: { rate: 3.5, mix: { bat: 0.65, zombie: 0.35 }, floor: 16 } },
  // -- 0:40 first teaching sweep (a small dense bat block crossing the screen).
  { atS: 40, event: { formation: 'sweep', kind: 'bat', count: 22 } },
  { atS: 45, set: { rate: 4, mix: { bat: 0.55, zombie: 0.45 }, floor: 20 } },
  // -- 1:00 first elite objective (drops a fat gem).
  { atS: 60, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 62, set: { rate: 5, mix: { bat: 0.5, zombie: 0.42, skeleton: 0.08 }, floor: 24 } },
  { atS: 80, event: { formation: 'sweep', kind: 'bat', count: 26 } },
  // -- 1:30 skeleton intro (wall fodder), first closing ring.
  { atS: 90, set: { rate: 6.5, mix: { bat: 0.42, zombie: 0.38, skeleton: 0.2 }, floor: 30 } },
  { atS: 110, event: { formation: 'ring', kind: 'zombie', count: 26 } },
  // -- 2:00 ghost intro (the fast flankers you cannot outrun) as a surge, then
  //    a breather.
  { atS: 120, event: { formation: 'surge', kind: 'ghost', count: 6 } },
  { atS: 122, set: { rate: 6, mix: { bat: 0.36, zombie: 0.34, skeleton: 0.2, ghost: 0.1 }, floor: 28 } }, // breather
  { atS: 140, set: { rate: 8, mix: { bat: 0.34, zombie: 0.34, skeleton: 0.2, ghost: 0.12 }, floor: 34 } },
  { atS: 150, event: { formation: 'sweep', kind: 'bat', count: 30 } },
  // -- 2:40 mudman intro (the first HP wall you cannot just delete).
  { atS: 160, event: { formation: 'surge', kind: 'mudman', count: 4 } },
  {
    atS: 162,
    set: { rate: 8.5, mix: { bat: 0.3, zombie: 0.3, skeleton: 0.2, ghost: 0.12, mudman: 0.08 }, floor: 38 },
  },
  // -- 3:00 inflection: elite + a closing ring of mudmen, then a breather.
  { atS: 180, event: { formation: 'elite', kind: 'elite', count: 1 } },
  { atS: 182, event: { formation: 'ring', kind: 'mudman', count: 6 } },
  {
    atS: 185,
    set: { rate: 7, mix: { bat: 0.3, zombie: 0.3, skeleton: 0.2, ghost: 0.12, mudman: 0.08 }, floor: 34 },
  }, // breather
  {
    atS: 200,
    set: { rate: 10, mix: { bat: 0.28, zombie: 0.28, skeleton: 0.2, ghost: 0.14, mudman: 0.1 }, floor: 44 },
  },
  // -- 3:30 werewolf intro (fast + strong): a surge from one side.
  { atS: 210, event: { formation: 'surge', kind: 'werewolf', count: 4 } },
  {
    atS: 212,
    set: {
      rate: 11,
      mix: { bat: 0.26, zombie: 0.26, skeleton: 0.18, ghost: 0.14, mudman: 0.1, werewolf: 0.06 },
      floor: 48,
    },
  },
  // -- 3:50 ghost swarm (a dense line-sweep of the fast flankers).
  { atS: 230, event: { formation: 'sweep', kind: 'ghost', count: 26 } },
  // -- 4:00 mantis intro (the heavy wall) + a big closing ring, breather after.
  { atS: 240, event: { formation: 'surge', kind: 'mantis', count: 3 } },
  {
    atS: 244,
    set: {
      rate: 12,
      mix: {
        bat: 0.26, zombie: 0.24, skeleton: 0.16, ghost: 0.14, mudman: 0.1, werewolf: 0.06, mantis: 0.04,
      },
      floor: 52,
    },
  },
  { atS: 260, event: { formation: 'ring', kind: 'zombie', count: 36 } },
  // -- 4:30 double elite, mid-game crunch.
  { atS: 270, event: { formation: 'elite', kind: 'elite', count: 2 } },
  {
    atS: 272,
    set: {
      rate: 10,
      mix: {
        bat: 0.26, zombie: 0.24, skeleton: 0.16, ghost: 0.14, mudman: 0.1, werewolf: 0.06, mantis: 0.04,
      },
      floor: 46,
    },
  }, // breather
  {
    atS: 290,
    set: {
      rate: 14,
      mix: {
        bat: 0.24, zombie: 0.22, skeleton: 0.16, ghost: 0.16, mudman: 0.1, werewolf: 0.07, mantis: 0.05,
      },
      floor: 56,
    },
  },
  // -- 5:00 the flower wall: a closing ring of mantises + a bat sweep at once.
  { atS: 300, event: { formation: 'ring', kind: 'mantis', count: 7 } },
  { atS: 302, event: { formation: 'sweep', kind: 'bat', count: 40 } },
  {
    atS: 305,
    set: {
      rate: 15,
      mix: {
        bat: 0.24, zombie: 0.22, skeleton: 0.16, ghost: 0.16, mudman: 0.1, werewolf: 0.07, mantis: 0.05,
      },
      floor: 60,
    },
  },
  { atS: 330, event: { formation: 'pincer', kind: 'werewolf', count: 8 } },
  {
    atS: 332,
    set: {
      rate: 17,
      mix: {
        bat: 0.24, zombie: 0.2, skeleton: 0.16, ghost: 0.16, mudman: 0.1, werewolf: 0.08, mantis: 0.06,
      },
      floor: 66,
    },
  },
  // -- 6:00 elites + a closing mudman ring, the last real breather.
  { atS: 360, event: { formation: 'elite', kind: 'elite', count: 2 } },
  { atS: 362, event: { formation: 'ring', kind: 'mudman', count: 10 } },
  {
    atS: 366,
    set: {
      rate: 13,
      mix: {
        bat: 0.24, zombie: 0.2, skeleton: 0.16, ghost: 0.16, mudman: 0.1, werewolf: 0.08, mantis: 0.06,
      },
      floor: 54,
    },
  }, // last breather
  { atS: 380, event: { formation: 'sweep', kind: 'bat', count: 48 } },
  {
    atS: 382,
    set: {
      rate: 20,
      mix: {
        bat: 0.24, zombie: 0.18, skeleton: 0.14, ghost: 0.18, mudman: 0.1, werewolf: 0.09, mantis: 0.07,
      },
      floor: 72,
    },
  },
  { atS: 400, event: { formation: 'pincer', kind: 'werewolf', count: 10 } },
  // -- 7:00 FINALE: no more breathers, density + walls climb until overrun.
  {
    atS: 420,
    set: {
      rate: 26,
      mix: {
        bat: 0.26, zombie: 0.16, skeleton: 0.12, ghost: 0.19, mudman: 0.08, werewolf: 0.1, mantis: 0.09,
      },
      floor: 84,
    },
  },
  { atS: 420, event: { formation: 'elite', kind: 'elite', count: 3 } },
  { atS: 428, event: { formation: 'ring', kind: 'mantis', count: 10 } },
  { atS: 438, event: { formation: 'sweep', kind: 'ghost', count: 40 } },
  {
    atS: 448,
    set: {
      rate: 34,
      mix: {
        bat: 0.28, zombie: 0.14, skeleton: 0.1, ghost: 0.2, mudman: 0.08, werewolf: 0.1, mantis: 0.1,
      },
      floor: 100,
    },
  },
  { atS: 450, event: { formation: 'ring', kind: 'zombie', count: 90 } },
  { atS: 460, event: { formation: 'sweep', kind: 'bat', count: 64 } },
  { atS: 470, event: { formation: 'surge', kind: 'werewolf', count: 14 } },
];

export interface WeaponConf {
  damage: number;
  speed?: number;
  radius?: number;
  lifetimeS?: number;
  pierce?: number;
  /** clap: half-angle of the forward damage cone (radians). */
  arc?: number;
  /** kick(whip): half-thickness of the rectangular slash lane (px). */
  halfHeight?: number;
  /** kick(whip): lanes per trigger (1 = forward only; 2 = forward + back).
   *  tom: boomerangs thrown per trigger. */
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
 *  ladder's character says so.
 *
 *  VS-anchored: the kick (the Whip) matches VS whip damage per hit (~10 -> ~35),
 *  and every other weapon's damage/area was pulled DOWN toward VS references
 *  (Magic Wand 10 @1.2s, Knife 6.5 @1.0s, Axe 20 @4s, King Bible 10 @3s, etc.),
 *  scaled by our own trigger rate and the 0.9 powerMul. AoE radii were shrunk
 *  hard — the old auras/waves/shockwaves covered far more of the arena than any
 *  VS weapon. Enemy HP is VS-low (bat 4, zombie 10, mudman 70, mantis 400), so
 *  these smaller numbers still kill fast; the challenge is density + not getting
 *  pinned, exactly as in VS. */
export const WEAPONS: Record<Role, WeaponConf[]> = {
  // THE WHIP (kick). Rectangular slash lanes around the facing axis: tiers 1-3
  // crack FRONT + BACK (count 2) so a fleeing player's back, where the horde
  // chases, is always covered; tier 4 cracks all four directions (count 4).
  // Reach/thickness/damage grow with tier; one hit per enemy per crack (the
  // overlapping lanes are deduped). Fires four-on-the-floor (its music), so it
  // out-rates a VS whip and clears its lanes fast — the per-hit number stays
  // VS-honest (~11/15/24/34 shown after powerMul).
  kick: [
    { damage: 12, radius: 160, halfHeight: 50, count: 2 },
    { damage: 17, radius: 175, halfHeight: 54, count: 2 },
    { damage: 27, radius: 205, halfHeight: 62, count: 2 },
    { damage: 38, radius: 235, halfHeight: 72, count: 4 },
  ],
  // Backbeat sniper: few, fast, hard-hitting, drills a line. Like a Magic Wand
  // that pierces. Sparse chart, so each hit is a statement (but VS-scaled down
  // from the old 16-40).
  snare: [
    { damage: 12, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 2 },
    { damage: 16, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 3 },
    { damage: 22, speed: 680, radius: 8, lifetimeS: 1.5, pierce: 4 },
    { damage: 30, speed: 720, radius: 8, lifetimeS: 1.5, pierce: 6 },
  ],
  // Dense stream of weak fast chips, wide scatter. Density IS the ladder.
  hat: [
    { damage: 3, speed: 440, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 4, speed: 450, radius: 3, lifetimeS: 0.85, pierce: 1 },
    { damage: 5, speed: 460, radius: 3, lifetimeS: 0.9, pierce: 1 },
    { damage: 6, speed: 480, radius: 3, lifetimeS: 0.95, pierce: 2 },
  ],
  // Slow rolling low wave that pierces everything. The weight ladder. Radius
  // shrunk from 42-64: a VS wave is a band, not a screen-wide blanket.
  bass: [
    { damage: 12, speed: 135, radius: 34, lifetimeS: 2.6, pierce: Infinity },
    { damage: 17, speed: 140, radius: 40, lifetimeS: 2.6, pierce: Infinity },
    { damage: 24, speed: 145, radius: 46, lifetimeS: 2.7, pierce: Infinity },
    { damage: 34, speed: 150, radius: 54, lifetimeS: 2.8, pierce: Infinity },
  ],
  // Zone thrown onto the nearest pack: ticks damage and slows enemies inside.
  // Chip + control; the slow is the identity. `damage` is PER TICK (every
  // ZONE_TICK_S). Radius shrunk from 95-140.
  chord: [
    { damage: 2, radius: 70, lifetimeS: 2.0 },
    { damage: 2, radius: 80, lifetimeS: 2.2 },
    { damage: 3, radius: 92, lifetimeS: 2.4 },
    { damage: 3, radius: 105, lifetimeS: 2.6 },
  ],
  // Homing seeker per melody note: mid damage, never misses.
  lead: [
    { damage: 7, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 9, speed: 350, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 11, speed: 360, radius: 6, lifetimeS: 2.3, pierce: 1 },
    { damage: 14, speed: 380, radius: 7, lifetimeS: 2.4, pierce: 2 },
  ],
  // Backbeat melee: a wide forward slash cone (a bigger, slower sibling of the
  // whip on 2 & 4). Reach/arc/damage pulled down from the old 130-200 / 0.9-1.55.
  clap: [
    { damage: 10, radius: 110, arc: 0.8 },
    { damage: 13, radius: 125, arc: 0.9 },
    { damage: 17, radius: 145, arc: 1.05 },
    { damage: 24, radius: 170, arc: 1.3 },
  ],
  // Cross: a boomerang lobbed out that curves back, hitting both legs. Like VS
  // Cross (low damage, AoE pierce, out-and-back). Trimmed from 11-22.
  tom: [
    { damage: 9, speed: 360, radius: 9, lifetimeS: 2.0, pierce: 4, count: 1 },
    { damage: 12, speed: 375, radius: 9, lifetimeS: 2.1, pierce: 5, count: 1 },
    { damage: 16, speed: 390, radius: 10, lifetimeS: 2.2, pierce: 6, count: 2 },
    { damage: 22, speed: 410, radius: 11, lifetimeS: 2.4, pierce: 8, count: 2 },
  ],
  // King Bible: notes orbiting the player, a rotating shield of damage. Orbit
  // radius shrunk from 80-122.
  arp: [
    { damage: 5, radius: 8, lifetimeS: 2.0, orbitRadius: 72 },
    { damage: 6, radius: 8, lifetimeS: 2.4, orbitRadius: 84 },
    { damage: 8, radius: 9, lifetimeS: 2.8, orbitRadius: 96 },
    { damage: 10, radius: 10, lifetimeS: 3.2, orbitRadius: 110 },
  ],
  // Shockwave: an expanding ring that damages + knocks back. The marquee heavy.
  // Radius shrunk HARD (was 260-400 — that covered most of the arena): a VS
  // heavy is powerful, not omnipresent.
  crash: [
    { damage: 16, speed: 520, radius: 180, knockback: 55 },
    { damage: 20, speed: 550, radius: 210, knockback: 65 },
    { damage: 26, speed: 580, radius: 240, knockback: 80 },
    { damage: 36, speed: 620, radius: 280, knockback: 100 },
  ],
  // Shaker (Hats): drops a short-lived damaging blob at your feet each hit, so
  // moving strings a trail. Per-tick zone. Radius shrunk from 38-54.
  shaker: [
    { damage: 3, radius: 30, lifetimeS: 1.2 },
    { damage: 3, radius: 34, lifetimeS: 1.3 },
    { damage: 4, radius: 40, lifetimeS: 1.4 },
    { damage: 5, radius: 46, lifetimeS: 1.5 },
  ],
  // Acid (Motion): a placed gravity well — pulls enemies in and ticks. Control
  // first. Radius shrunk from 100-145; pull kept (it's the identity).
  acid: [
    { damage: 1, radius: 80, lifetimeS: 2.2, pull: 100 },
    { damage: 1, radius: 90, lifetimeS: 2.4, pull: 115 },
    { damage: 2, radius: 102, lifetimeS: 2.6, pull: 135 },
    { damage: 2, radius: 116, lifetimeS: 2.8, pull: 160 },
  ],
  // Pluck bass (Bass): a note lobbed on an arc to the nearest pack, bursts on
  // landing. Heavy, placed. Blast radius shrunk from 70-100.
  pluck: [
    { damage: 12, speed: 300, lifetimeS: 0.7, radius: 50 },
    { damage: 16, speed: 315, lifetimeS: 0.72, radius: 56 },
    { damage: 22, speed: 330, lifetimeS: 0.74, radius: 64 },
    { damage: 30, speed: 350, lifetimeS: 0.78, radius: 74 },
  ],
  // Rhodes (Harmony): chord pools laid as mines that bloom on contact. Radius
  // shrunk from 70-104.
  rhodes: [
    { damage: 9, radius: 48, lifetimeS: 4.0 },
    { damage: 12, radius: 56, lifetimeS: 4.5 },
    { damage: 16, radius: 64, lifetimeS: 5.0 },
    { damage: 22, radius: 74, lifetimeS: 5.5 },
  ],
  // Riser (FX — THE AUTO-DASH): its release grants a movement surge (see DASH)
  // plus a token whoosh of damage. Radius shrunk from 110-155.
  riser: [
    { damage: 8, radius: 80 },
    { damage: 10, radius: 90 },
    { damage: 13, radius: 102 },
    { damage: 17, radius: 116 },
  ],
  // Bell (Melody): a note lobbed straight that shatters into shards on first hit
  // (shard count per tier in BELL). radius = the shot's own size.
  bell: [
    { damage: 7, speed: 360, radius: 6, lifetimeS: 1.8, pierce: 1 },
    { damage: 9, speed: 370, radius: 6, lifetimeS: 1.9, pierce: 1 },
    { damage: 11, speed: 380, radius: 7, lifetimeS: 2.0, pierce: 1 },
    { damage: 14, speed: 400, radius: 7, lifetimeS: 2.1, pierce: 2 },
  ],
};

/** The one honest gameplay-effect line on each pick card ([tier-1]). Terse
 *  VS-style, zero music description: the sound change is discovered by ear. */
export const TIER_LINES: Record<Role, string[]> = {
  kick: [
    'a whip crack to your front and back',
    'a wider, harder crack',
    'a longer, wider crack',
    'cracks in all four directions',
  ],
  snare: [
    'piercing shot on the backbeat',
    'fires twice as often, pierces 1 more',
    'adds weak ghost shots, pierces 1 more',
    'burst of shots every 4th bar',
  ],
  hat: ['thin spray of fast chips', 'twice the chips', 'denser spray', 'a wall of chips'],
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
  clap: ['a wide slash close to you', 'wider, harder slash', 'sweeps a bigger arc', 'a huge slash all around you'],
  tom: [
    'a boomerang that flies out and back',
    'flies further, pierces more',
    'throws two boomerangs',
    'two heavy boomerangs, deep pierce',
  ],
  arp: ['orbiting notes circle you', 'the orbit lasts longer', 'a wider, longer orbit', 'a dense ring of orbiters'],
  crash: ['a shockwave knocks enemies back', 'a bigger, faster wave', 'a wider wave, harder knock', 'a massive wave, huge knockback'],
  shaker: ['leaves a damaging trail as you move', 'a longer-lasting trail', 'a wider, hotter trail', 'a blazing trail'],
  acid: ['a well that pulls enemies in', 'pulls harder, wider', 'a stronger, bigger well', 'a massive crushing well'],
  pluck: ['a note lobbed that bursts on landing', 'a bigger burst', 'a heavier, wider burst', 'a huge crushing burst'],
  rhodes: ['a mine that blooms when stepped in', 'a wider bloom', 'a bigger, harder bloom', 'a huge bloom'],
  riser: ['a surge that dashes you forward', 'a longer dash', 'a faster, harder dash', 'a huge dash surge'],
  bell: ['a note that shatters into shards', 'more shards on the shatter', 'sharper shards, further', 'a burst of shards, pierces'],
};

/** Bass tier 4's once-per-phrase sub drop and chord tier 4's pads get a
 *  matching gameplay peak: the same weapon, scaled up. */
export const VARIANT_EFFECTS = {
  bassSub: { radiusMul: 1.6, damageMul: 1.5 },
  chordPad: { radiusMul: 1.5, lifetimeMul: 2.0, damageMul: 0.6 },
};

/** How far weapons look for a target. */
export const AIM_RANGE = 750;

/** Zone damage tick interval (chord/shaker/acid). */
export const ZONE_TICK_S = 0.45;

/** Chord zones: enemy speed multiplier while inside, and how far a zone can be
 *  thrown toward the nearest pack. */
export const ZONE_SLOW_MUL = 0.55;
export const ZONE_THROW_RANGE = 400;

/** Arp orbiters sweep at this angular speed (rad/s) and can re-hit an enemy
 *  every ORBIT_REHIT_S. */
export const ARP_OMEGA = 3.4;
export const ORBIT_REHIT_S = 0.35;

/** Tom boomerangs fly outward for this fraction of their lifetime, then curve
 *  home; the hit set clears at the turn so both legs land. */
export const BOOMERANG_OUT_FRAC = 0.45;

/** Crash shockwave: thickness of the damaging front, and how long a knocked
 *  enemy is pushed before it resumes chasing. */
export const SHOCK_BAND = 46;
export const KNOCK_S = 0.18;

/** How long an enemy rides a weapon shove before resuming its chase (shares the
 *  crash knock channel). */
export const SHOVE_S = 0.12;

/** Per-weapon knock distance applied on hit. Absent = no shove. Knockback-immune
 *  kinds (KB_RESIST) ignore all of it. */
export const WEAPON_SHOVE: Partial<Record<Role, number>> = { kick: 12, snare: 16, clap: 34, bass: 10 };

/** Screenshake magnitudes/durations (cosmetic). Reserved for the rare heavy
 *  moments only — the crash shockwave and the once-per-phrase bass sub-drop. */
export const SHAKE = {
  crash: { mag: 10, dur: 0.35 },
  bassSub: { mag: 8, dur: 0.3 },
} as const;

/** Full-screen colored flash per source (cosmetic). */
export const FLASH = {
  crash: { alpha: 0.16, dur: 0.18 },
  bassSub: { alpha: 0.12, dur: 0.16 },
} as const;

/** Riser, the auto-dash: the release grants a short movement surge. */
export const DASH = { surgeS: 0.2, speed: 900 };

/** Bell shatter: per-tier shard count, and the shard projectiles' stats. */
export const BELL = {
  shards: [4, 5, 6, 8],
  shardSpeed: 320,
  shardDamageMul: 0.5,
  shardLifeS: 0.45,
  shardRadius: 4,
  shardPierce: 1,
};
