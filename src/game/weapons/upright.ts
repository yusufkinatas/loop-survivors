// The Upright weapon module: a shot that BOUNCES along the ground, hopping
// through the crowd.
//
// LED BY THE SOUND (#266). The upright is a plucked acoustic bass playing
// walking quarters — one note per beat, stepping. The gameplay is that walk
// made visible: a shot that hops rather than flies, landing between bodies and
// picking up whatever it touches on the way. Nothing else in the game moves
// like this, which is the floor rule satisfied by motion rather than by shape.
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
  /** Hops per second. Tuned against the soundset's 122 bpm so the bounce reads
   *  as roughly one hop per beat: it looks like it is walking in time. */
  readonly hopHz: number;
  /** Slowest point of the gait, as a fraction of the tier's speed. Never zero:
   *  a shot that fully stops reads as stuck rather than as stepping. */
  readonly hopFloor: number;
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
  hopHz: 122 / 60,
  hopFloor: 0.35,
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
    /** Adds the hop and lets the shared loop do the travelling.
     *
     *  THE HOP IS IN THE SPEED, NOT IN A DRAW OFFSET. A top-down field has no
     *  "up" to bounce into, and faking one would mean the view learning a new
     *  per-weapon offset. Modulating how fast the shot travels does the same job
     *  honestly: it surges, lands, surges again, so it visibly steps through the
     *  crowd instead of sliding. It also changes where the shot IS at any moment,
     *  which means the hop affects what it hits rather than only how it looks.
     *
     *  Returns false: the shared loop still moves it and still runs the arena
     *  rails, exactly as for the snare. Only the velocity was adjusted. */
    steer(ctx: WeaponContext, pr: Projectile): boolean {
      const speed = Math.hypot(pr.vx, pr.vy);
      if (speed <= 0) return false;
      const phase = pr.age * UPRIGHT_STATS.hopHz * Math.PI * 2;
      // Absolute sine: a walk touches down and pushes off again; it never
      // reverses. Scaled around the shot's own base speed so the average pace
      // stays the tier's `speed` and only the gait changes.
      const gait = UPRIGHT_STATS.hopFloor
        + (1 - UPRIGHT_STATS.hopFloor) * Math.abs(Math.sin(phase));
      const scale = (pr.speed * gait) / speed;
      pr.vx *= scale;
      pr.vy *= scale;
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
