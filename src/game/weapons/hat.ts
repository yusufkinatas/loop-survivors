// The Hi-hat weapon module: a dense stream of fast chips that AUTO-AIM the
// nearest enemy, and its evolution, Strobe Lane, where those chips gain a small
// on-hit blast — each one pops where it lands. Base and evolved live in the
// same module; evolving flips an internal mode (ctx.evolved).
//
// THE HAT AUTO-AIMS, base and evolved alike. It resolves its direction through
// the world's auto-aim (ctx.aimFan), which finds the nearest body inside
// AIM_RANGE and jitters the heading by aimSpread, exactly the way the snare's
// base shot used to before the two weapons swapped roles: the snare is now the
// directional one, and the hat is the automatic one. The trade the hat makes
// for that convenience is PIERCE — the base chip has none (pierce 1: it hits
// one body and stops), where the directional snare keeps its whole pierce
// ladder. The hat pays for auto-aim and its fast, frequent chart with a chip
// that only ever touches one enemy.
//
// AUTO-AIM DRAWS FROM THE RNG STREAM, and it is not cosmetic. `aimFan(spread)`
// draws once with a target on screen and TWICE with an empty one (a random
// heading, then the jitter). That draw count is part of a run's rng identity,
// which is why aiming is a world query and not something this module
// reimplements over all(). The snare's directional `fanAround(moveDir())` is
// the mirror image — it draws nothing at all.
//
// The base hat lends the shared projectile loop NOTHING: no steer, no onHit. It
// is in neither of the two role-keyed tables the loop still reads — a chip
// lands damage and nothing else, no knock and no spark — so nothing shrank when
// this weapon left, and adding either while tidying up is a behavior change.

import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type {
  ProjectileBehavior,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

/** The hat's tuning. Every number below was either a rung of config.WEAPONS.hat,
 *  an entry of config.HAT_LANE, or a bare literal in run.ts's spawnProjectile;
 *  values are unchanged. Nothing in the behavior code may be a bare literal. */
interface HatStats extends WeaponStats {
  // ---------------- the base stream ----------------------------------------

  /** Aim jitter, radians, for the auto-aimed chips. Small — a dense stream at
   *  the nearest body wants nearly no scatter, the same value the snare used
   *  for its base volley before the two weapons swapped aiming roles. */
  readonly aimSpread: number;

  // ---------------- Strobe Lane --------------------------------------------
  //
  // The chips stop being a spread and become a fast lane of SMALL BOMBS toward
  // the nearest enemy — the lane auto-aims exactly like the base stream. Each
  // chip still hits just one body (it keeps the base's no-pierce), but now POPS
  // on impact, splashing a small blast into everything around the body it hit.
  // Reach is speed x life; a chip that finds no body rides that reach, bouncing
  // off the arena rails, until it does.

  /** Chip damage relative to the already-built tier damage. Was a bare `1.30`
   *  at the spawn site. */
  readonly laneDamageMul: number;
  /** Chip speed and lifetime relative to the tier block. Together they are the
   *  lane's reach: at level 8 that is 480 x 1.5 x 0.95 x 2.0 = 1368 units, well
   *  past the arena rails, which the chips bounce off exactly like any other
   *  projectile (see the note on `laneStagger` about Mirrorball). */
  readonly laneSpeedMul: number;
  readonly laneLifetimeMul: number;

  /** THE LANE'S SMALL AoE, the evolution's whole payoff and what REPLACES the
   *  old infinite pierce. A lane chip keeps the base's single-hit pierce (1), so
   *  it hits one body and dies — but on that hit it pops, dealing splash damage
   *  to every OTHER body within this radius of the one it struck.
   *
   *  The struck body already took the chip's full damage through the shared
   *  loop; the blast never re-hits it (it is in the shot's hit set), so the
   *  splash is a bonus to its NEIGHBOURS, not a double hit. The evolution trades
   *  the drilling rail for a stream of little bombs. */
  readonly laneBlastRadius: number;
  /** Splash damage as a fraction of the chip's own (already lane-multiplied)
   *  damage. Below 1: a neighbour catching the blast takes less than the body
   *  the chip actually hit. */
  readonly laneBlastDamageMul: number;

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

const HAT_STATS: HatStats = {
  // Dense stream of fast chips that auto-aim the nearest enemy. Damage matches
  // the snare's ladder rung for rung (5/5/7/7/9/9/11/13); the chart carries the
  // rest of the growth, so density (fire rate) is still the hat's real ladder
  // and several tiers move only speed and lifetime. NO PIERCE at any base tier
  // (pierce 1: a chip hits one body and stops) — that, with the fast frequent
  // chart, is the price of auto-aim, where the directional snare keeps its whole
  // pierce ladder. Radius stays 3 at every level: the chip is the chip.
  tiers: [
    { damage: 5, speed: 440, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 5, speed: 440, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 7, speed: 440, radius: 3, lifetimeS: 0.8, pierce: 1 },
    { damage: 7, speed: 450, radius: 3, lifetimeS: 0.85, pierce: 1 },
    { damage: 9, speed: 450, radius: 3, lifetimeS: 0.9, pierce: 1 },
    { damage: 9, speed: 450, radius: 3, lifetimeS: 0.95, pierce: 1 },
    { damage: 11, speed: 460, radius: 3, lifetimeS: 0.95, pierce: 1 },
    { damage: 13, speed: 480, radius: 3, lifetimeS: 0.95, pierce: 1 },
  ],
  tierLines: [
    'auto-aimed chips at the nearest enemy',
    'the stream thickens',
    'damage up',
    'faster, flies longer',
    'damage up, flies longer',
    'flies longer',
    'damage up, faster',
    'maximum damage, fastest',
  ],

  aimSpread: 0.08,
  laneDamageMul: 1.30,
  laneSpeedMul: 1.5,
  laneLifetimeMul: 2.0,
  laneBlastRadius: 44,
  laneBlastDamageMul: 0.6,
  laneStagger: [0, 26, 52, 78],
};

/** What a lane chip lends the SHARED projectile loop: a small on-hit blast, and
 *  nothing else. A BASE hat chip has no blast — onHit reads ctx.evolved (a live
 *  view of the world's mode) and only the lane pops — so the base stream stays
 *  the clean single-hit chip it was, and the same module hook serves both. */
const CHIP_BEHAVIOR: ProjectileBehavior = {
  onHit(ctx: WeaponContext, pr: Projectile, target: WeaponTarget): boolean {
    if (ctx.evolved) {
      // The pop: splash every neighbour of the struck body. The body itself is
      // already in pr.hit (the loop added it before this hook), so it is never
      // caught twice. near() already widens its query by the largest inserted
      // radius, so the exact reach test below is the only gate that matters.
      const splash = pr.damage * HAT_STATS.laneBlastDamageMul;
      for (const e of ctx.near(target.x, target.y, HAT_STATS.laneBlastRadius)) {
        if (e.dead || pr.hit.has(e)) continue;
        const dx = e.x - target.x;
        const dy = e.y - target.y;
        if (Math.hypot(dx, dy) > HAT_STATS.laneBlastRadius + e.radius) continue;
        ctx.damage(e, splash);
      }
      ctx.fx({
        type: 'ring',
        x: target.x,
        y: target.y,
        radius: HAT_STATS.laneBlastRadius,
        color: pr.color,
        dur: 0.18,
        soft: true,
      });
    }
    // Spend pierce like every other chip: a lane chip pops and dies on its one
    // hit, and a base chip stops on its one hit. Returning true is that rule.
    return true;
  },
};

class HatInstance implements WeaponInstance {
  readonly projectile = CHIP_BEHAVIOR;

  /** Auto-aimed chips at the nearest enemy, base and lane alike. aimFan finds
   *  the nearest body inside AIM_RANGE, jitters by aimSpread, and hands back one
   *  direction per shot this trigger owes — Double Take's extra chips fan around
   *  that same aim line.
   *
   *  ONE aimFan PER TRIGGER, so the draw count is per trigger, not per shot: one
   *  draw with a target on screen, two with an empty one. That is the hat's
   *  share of the run's rng stream, and it is the mirror of the snare's
   *  directional fire, which draws nothing.
   *
   *  With no enemy in range aimFan still returns a heading (a random one), so a
   *  hat facing an empty screen still fires — the chips just scatter until a
   *  body comes back into range. */
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const lane = ctx.evolved;
    // One offset for the whole trigger, so a fanned volley stays a volley
    // instead of smearing along the lane.
    const stagger = lane
      ? HAT_STATS.laneStagger[ctx.triggerCount % HAT_STATS.laneStagger.length]
      : 0;
    for (const dir of ctx.aimFan(HAT_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      if (lane) {
        pr.damage *= HAT_STATS.laneDamageMul;
        pr.speed *= HAT_STATS.laneSpeedMul;
        pr.lifeS *= HAT_STATS.laneLifetimeMul;
        // No pierce override: the chip keeps its tier value (1), so it hits one
        // body and pops. The splash, not a drilling rail, is now the spread.
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
}

export const HAT = {
  role: 'hat',
  stats: HAT_STATS,
  // No tickAt: the hat owns no damage pass of its own. Every chip is resolved
  // by the world's shared projectile loop.
  create: () => new HatInstance(),
} satisfies WeaponModule;
