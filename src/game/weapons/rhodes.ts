// The Rhodes weapon module: slow warm orbs that drift after whatever is
// nearest and bloom when they arrive.
//
// LED BY THE SOUND (#266). The Rhodes is round, warm and unhurried — a struck
// tine that blooms rather than cracks. So its shot does not snap: it leaves
// slowly, curves toward a body in its own time, and opens into a soft burst on
// contact. It is the lead's opposite in the same seat-neighbourhood: the lead
// is chain lightning, all speed and angles; this is patient and gentle.

import { AIM_RANGE, type WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext } from './context';
import type { ProjectileBehavior, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface RhodesStats extends WeaponStats {
  readonly aimSpread: number;
  /** Radius of the soft burst an orb opens into when it lands. */
  readonly bloomRadius: number;
  /** Bloom damage as a multiple of the orb's own. Under 1: the bloom is reach,
   *  not a second full hit. */
  readonly bloomDamageMul: number;
}

const RHODES_STATS: RhodesStats = {
  tiers: [
    { damage: 7, speed: 210, radius: 13, lifetimeS: 2.2, pierce: 1 },
    { damage: 8, speed: 210, radius: 13, lifetimeS: 2.2, pierce: 1 },
    { damage: 10, speed: 225, radius: 14, lifetimeS: 2.4, pierce: 1 },
    { damage: 11, speed: 225, radius: 14, lifetimeS: 2.4, pierce: 2 },
    { damage: 13, speed: 240, radius: 15, lifetimeS: 2.6, pierce: 2 },
    { damage: 14, speed: 240, radius: 15, lifetimeS: 2.6, pierce: 2 },
    { damage: 16, speed: 255, radius: 16, lifetimeS: 2.8, pierce: 3 },
    { damage: 18, speed: 255, radius: 17, lifetimeS: 3.0, pierce: 3 },
  ],
  tierLines: [
    'a warm orb that drifts and blooms',
    'damage up',
    'larger, longer-lived',
    'passes through two',
    'damage up, faster',
    'damage up',
    'passes through three',
    'maximum bloom',
  ],
  aimSpread: 0.1,
  bloomRadius: 62,
  bloomDamageMul: 0.55,
};

class RhodesInstance implements WeaponInstance {
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    for (const dir of ctx.aimFan(RHODES_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
      // Homes, but lazily: the shared loop's turn rate is what makes this drift
      // rather than snap, and it is left slow on purpose.
      pr.homing = true;
      pr.homingRange = AIM_RANGE;
    }
  }

  reset(): void {}

  readonly projectile: ProjectileBehavior = {
    /** The bloom. Spending pierce as usual (returning true) keeps an orb from
     *  blooming on every body in a line — one arrival, one bloom. */
    onHit(ctx: WeaponContext, pr: Projectile, target): boolean {
      const bloom = pr.damage * RHODES_STATS.bloomDamageMul;
      for (const e of ctx.near(pr.x, pr.y, RHODES_STATS.bloomRadius)) {
        if (e.dead || e === target) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) > RHODES_STATS.bloomRadius + e.radius) continue;
        ctx.damage(e, bloom);
      }
      ctx.fx({ type: 'flash', x: pr.x, y: pr.y, radius: RHODES_STATS.bloomRadius, color: pr.color, dur: 0.22 });
      return true;
    },
  };
}

export const RHODES = {
  role: 'rhodes',
  stats: RHODES_STATS,
  create: () => new RhodesInstance(),
} satisfies WeaponModule;
