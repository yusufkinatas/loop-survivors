// The Upright weapon module: a shot that SNAKES, weaving across its aim line.
//
// LED BY THE SOUND (#266). The upright is a plucked acoustic bass playing
// walking quarters — one note per beat, and a thick string that keeps moving
// after it is let go. The gameplay is that sway made visible: a shot that
// weaves rather than flies, sweeping a wider band than it was pointed at and
// catching bodies either side of the line. Nothing else in the game moves like
// this, which is the floor rule satisfied by motion rather than by shape.
//
// It steers itself but keeps the shared loop's travel: `steer` returns false,
// so the world still moves it and still runs the arena rails. All this module
// contributes is the hop.

import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext } from './context';
import type { ProjectileBehavior, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface UprightStats extends WeaponStats {
  /** Aim jitter, radians. Small — this is a walking line, not a spray. */
  readonly aimSpread: number;
  /** Weaves per second. Tuned against the soundset's 122 bpm so the shot sways
   *  roughly once per beat — it snakes in time with what you are hearing. */
  readonly weaveHz: number;
  /** How far the weave pushes the shot off its aim line, in radians of heading
   *  swing. Big enough to be obviously not a straight line. */
  readonly weaveRad: number;
  /** Knock distance on a hit. Modest: this weapon wants bodies to stay put so
   *  the next hop lands on them too. */
  readonly shove: number;
}

const UPRIGHT_STATS: UprightStats = {
  tiers: [
    { damage: 6, speed: 330, radius: 11, lifetimeS: 1.5, pierce: 2 },
    { damage: 7, speed: 330, radius: 11, lifetimeS: 1.5, pierce: 2 },
    { damage: 8, speed: 350, radius: 12, lifetimeS: 1.6, pierce: 3 },
    { damage: 9, speed: 350, radius: 12, lifetimeS: 1.6, pierce: 3 },
    { damage: 11, speed: 370, radius: 13, lifetimeS: 1.7, pierce: 4 },
    { damage: 12, speed: 370, radius: 13, lifetimeS: 1.7, pierce: 4 },
    { damage: 14, speed: 390, radius: 14, lifetimeS: 1.8, pierce: 5 },
    { damage: 16, speed: 390, radius: 15, lifetimeS: 1.9, pierce: 6 },
  ],
  tierLines: [
    'a shot that walks through the crowd',
    'damage up',
    'hops further, cuts deeper',
    'damage up',
    'faster, cuts deeper',
    'damage up',
    'hops further, cuts deeper',
    'maximum reach',
  ],
  aimSpread: 0.05,
  weaveHz: 122 / 60,
  weaveRad: 0.85,
  shove: 10,
};

class UprightInstance implements WeaponInstance {
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    for (const dir of ctx.aimFan(UPRIGHT_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
    }
  }

  reset(): void {}

  readonly projectile: ProjectileBehavior = {
    /** THE SHOT SNAKES. Every other projectile in the game travels in a straight
     *  line or homes; this one weaves side to side across its aim line, so it
     *  sweeps a wider band than it is pointed at and reads as a different object
     *  the moment it leaves the player.
     *
     *  The first version modulated SPEED instead, to suggest a walking gait —
     *  which was almost invisible in play, because a shot that speeds up and
     *  slows down still draws a straight line.
     *
     *  Implemented as a swing of the HEADING rather than a drawn offset, so the
     *  weave changes where the shot actually is and therefore what it hits.
     *  Returns false: the shared loop still travels it and still runs the arena
     *  rails, exactly as for the snare. */
    steer(ctx: WeaponContext, pr: Projectile, dt: number): boolean {
      const speed = Math.hypot(pr.vx, pr.vy);
      if (speed <= 0) return false;
      const w = UPRIGHT_STATS.weaveHz * Math.PI * 2;
      // The derivative of a sine sway: turn hardest at the crossings and not at
      // all at the extremes, which is what makes the path a smooth S rather
      // than a zigzag.
      const turn = UPRIGHT_STATS.weaveRad * w * Math.cos(pr.age * w) * dt;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const vx = pr.vx * cos - pr.vy * sin;
      const vy = pr.vx * sin + pr.vy * cos;
      pr.vx = vx;
      pr.vy = vy;
      void ctx;
      return false;
    },
    onHit(ctx: WeaponContext, pr: Projectile, target): boolean {
      ctx.shove(target, pr.x, pr.y, UPRIGHT_STATS.shove);
      ctx.fx({ type: 'spark', x: target.x, y: target.y, color: pr.color, n: 3, spread: 9 });
      return true;
    },
  };
}

export const UPRIGHT = {
  role: 'upright',
  stats: UPRIGHT_STATS,
  create: () => new UprightInstance(),
} satisfies WeaponModule;
