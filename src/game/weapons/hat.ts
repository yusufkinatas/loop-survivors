// The Hi-hat weapon module: a dense stream of weak fast chips fired straight
// down the walk heading, and its evolution, Strobe Lane, where those chips stop
// being a spread and become a rail. Base and evolved live in the same module;
// evolving flips an internal mode (ctx.evolved).
//
// THE HAT IS THE FIRST WEAPON THAT DOES NOT AIM. Every weapon migrated before
// it resolves its direction through the world's auto-aim (ctx.aimDir /
// ctx.aimFan), which finds the nearest body inside AIM_RANGE and jitters the
// heading. The hat never consults a target at all: it fires down
// `player.moveDirX/Y`, the persisted walk heading, with zero scatter, so the
// player aims by STEERING. That is the whole reason `moveDir()` and
// `fanAround()` are on the weapon context — the two members the context file
// reserved for this weapon.
//
// THE DIFFERENCE IS VISIBLE IN THE RNG STREAM, and it is not cosmetic.
// `fanAround(moveDir())` draws NOTHING: no target pick, no jitter. `aimFan(0)`
// would draw once with a target on screen and TWICE with an empty one. A hat
// trigger costs zero draws whatever the tier, whatever the Double Take count,
// and a run's rng identity depends on that staying true — writing the aim the
// "tidier" way desynchronises every later draw in the run.
//
// The hat lends the shared projectile loop NOTHING: no steer, no onHit. It is
// in neither of the two role-keyed tables the loop still reads — a chip lands
// damage and nothing else, no knock and no spark — so nothing shrank when this
// weapon left, and adding either while tidying up is a behavior change.

import type { WeaponConf } from '../config';
import type { WeaponContext } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

/** The hat's tuning. Every number below was either a rung of config.WEAPONS.hat,
 *  an entry of config.HAT_LANE, or a bare literal in run.ts's spawnProjectile;
 *  values are unchanged. Nothing in the behavior code may be a bare literal. */
export interface HatStats extends WeaponStats {
  // ---------------- Strobe Lane --------------------------------------------
  //
  // The chips stop being a spread and become a rail down the walk heading.
  // Reach is speed x life; the pierce below is what lets one chip spend that
  // reach on the whole file instead of stopping at the second body.

  /** Chip damage relative to the already-built tier damage. Was a bare `1.30`
   *  at the spawn site. */
  readonly laneDamageMul: number;
  /** Chip speed and lifetime relative to the tier block. Together they are the
   *  lane's reach: at tier 4 that is 480 x 1.5 x 0.95 x 2.0 = 1368 units, well
   *  past the arena rails, which the chips bounce off exactly like any other
   *  projectile (see the note on `laneStagger` about Mirrorball). */
  readonly laneSpeedMul: number;
  readonly laneLifetimeMul: number;

  /** THE LANE'S PIERCE, WRITTEN OVER THE PIPELINE'S ANSWER. Read this before
   *  changing it — it is the exact shape of the bug #146 fixed one weapon over,
   *  and here it is correct.
   *
   *  On the BASE hat, pierce is a real ladder (2/2/3/4) and Needle Tips is a
   *  real stacking build on it: a tier-4 chip pierces 9 bodies with the item
   *  maxed. On the LANE it is a total no-op, because the value below REPLACES
   *  whatever `applyBuild` computed rather than being an input the pipeline
   *  builds on. Evolved lead used to do exactly this with a hardcoded 6 and it
   *  WAS a bug (LEAD_STATS.serpentBasePierce, #146) — but an infinity is not a floor
   *  to add to. There is no larger budget for the item to reach, so routing it
   *  through the pipeline the way lead's 6 now is would change nothing except
   *  make the code look like it did something.
   *
   *  Stated as a stat rather than left as a bare `Infinity` at the spawn site
   *  so the no-op is a property of the weapon a reader can find, not a surprise
   *  discovered by testing an item that does nothing. */
  readonly lanePierce: number;

  /** How far each successive chip is pushed forward along the lane at spawn,
   *  cycled on this weapon's trigger count. A 16th-note wall would otherwise
   *  spawn as a clump on top of the player and draw as one blob; staggered, the
   *  stream reads as one continuous streak.
   *
   *  CYCLED ON ctx.triggerCount, WHICH DOES NOT RESET ON EVOLUTION. A hat that
   *  evolves after one base trigger takes `laneStagger[2]` on its next chip,
   *  not the first entry a freshly evolved hat would take. That is the world's
   *  per-role counter, running since the first trigger of the run.
   *
   *  A stagger is a spawn OFFSET, not motion: the chip is placed further along
   *  and then travels normally. Mirrorball is Strobe Lane's partner item, so
   *  every lane chip carries bounces — the arena rails are the lane's permanent
   *  condition, not an edge case, and 1368 units of reach crosses them as a
   *  matter of course. Which is why this module must NOT implement
   *  ProjectileBehavior.steer: steering is what takes a shot off shared travel
   *  AND off the rails together, and a lane that stopped bouncing would be a
   *  different weapon. */
  readonly laneStagger: readonly number[];
}

export const HAT_STATS: HatStats = {
  // Dense stream of weak fast chips fired straight down the walk heading, no
  // scatter — the player aims by steering. Density IS the ladder; per-trigger
  // damage barely moves (the chart carries the growth). The pierce ladder pays
  // for losing auto-aim: a straight line has to be worth walking down.
  tiers: [
    { damage: 2, speed: 440, radius: 3, lifetimeS: 0.8, pierce: 2 },
    { damage: 2, speed: 450, radius: 3, lifetimeS: 0.85, pierce: 2 },
    { damage: 2, speed: 460, radius: 3, lifetimeS: 0.9, pierce: 3 },
    { damage: 3, speed: 480, radius: 3, lifetimeS: 0.95, pierce: 4 },
  ],
  tierLines: [
    'fast chips along your path',
    'twice the chips',
    'denser stream',
    'a wall of chips',
  ],

  laneDamageMul: 1.30,
  laneSpeedMul: 1.5,
  laneLifetimeMul: 2.0,
  lanePierce: Infinity,
  laneStagger: [0, 26, 52, 78],
};

class HatInstance implements WeaponInstance {
  /** Chips down the walk heading. Double Take's extra chips fan around that
   *  heading, never off it — `fanAround` takes the direction it is given, where
   *  `aimFan` would go and find its own.
   *
   *  ZERO RNG DRAWS, at every tier and every Double Take count. See the file
   *  header: this is the one weapon whose direction costs nothing from the run
   *  stream, and it is checked as an executable assertion, not a comment.
   *
   *  Standing still fires down the LAST heading rather than nowhere: the world
   *  only overwrites moveDirX/Y when the stick actually moves, and the player
   *  starts the run pointing at (1, 0). A hat that never walked still fires. */
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const lane = ctx.evolved;
    // One offset for the whole trigger, so a fanned volley stays a volley
    // instead of smearing along the lane.
    const stagger = lane
      ? HAT_STATS.laneStagger[ctx.triggerCount % HAT_STATS.laneStagger.length]
      : 0;
    for (const dir of ctx.fanAround(ctx.moveDir())) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      if (lane) {
        pr.damage *= HAT_STATS.laneDamageMul;
        pr.speed *= HAT_STATS.laneSpeedMul;
        pr.maxPierce = HAT_STATS.lanePierce;
        pr.pierce = HAT_STATS.lanePierce;
        pr.lifeS *= HAT_STATS.laneLifetimeMul;
      }
      // Derive velocity from pr.speed — which already carries the lane
      // multiplier — so the `speed` FIELD stays equal to |v|. The bounce path
      // reads that field, and Mirrorball is the lane's partner item, so every
      // lane chip takes that path.
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
      if (lane) {
        pr.x += dir.x * stagger;
        pr.y += dir.y * stagger;
      }
    }
  }

  /** Nothing to drop: every chip lives in the world's projectile array, which
   *  clearSandboxEntities empties itself. */
  reset(): void {}

  // No `projectile` behavior, deliberately. A hat chip rides shared travel, the
  // arena rails and the shared pierce rule completely unchanged, and lands
  // damage and nothing else on a hit — no shove, no spark. Both halves of
  // ProjectileBehavior are the halves this weapon must NOT have.
}

export const HAT = {
  role: 'hat',
  stats: HAT_STATS,
  // No tickAt: the hat owns no damage pass of its own. Every chip is resolved
  // by the world's shared projectile loop.
  create: () => new HatInstance(),
} satisfies WeaponModule;
