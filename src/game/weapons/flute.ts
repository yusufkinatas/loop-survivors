// The Flute weapon module: a slow shot that curves as it goes.
//
// LED BY THE SOUND (#266). The flute is breath — air moving, with a note riding
// on it. Nothing about that is straight or sudden, so its shot is the one thing
// on the field that WANDERS: it leaves slowly and arcs across, sweeping a curve
// through whatever is standing in the way rather than punching a line.
//
// It is the sparsest voice in the bright seat, so each shot lives a long time
// and pierces generously. The curve is what earns the pierce: a straight shot
// with this much life would just leave the screen.

import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext } from './context';
import type { ProjectileBehavior, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface FluteStats extends WeaponStats {
  readonly aimSpread: number;
  /** Radians per second the shot's heading rotates. The curve. */
  readonly curveRate: number;
}

const FLUTE_STATS: FluteStats = {
  tiers: [
    { damage: 16, speed: 260, radius: 12, lifetimeS: 2.6, pierce: 3 },
    { damage: 19, speed: 260, radius: 12, lifetimeS: 2.6, pierce: 3 },
    { damage: 22, speed: 275, radius: 13, lifetimeS: 2.9, pierce: 4 },
    { damage: 25, speed: 275, radius: 13, lifetimeS: 2.9, pierce: 4 },
    { damage: 29, speed: 290, radius: 14, lifetimeS: 3.2, pierce: 5 },
    { damage: 32, speed: 290, radius: 14, lifetimeS: 3.2, pierce: 5 },
    { damage: 36, speed: 305, radius: 15, lifetimeS: 3.5, pierce: 6 },
    { damage: 41, speed: 305, radius: 16, lifetimeS: 3.8, pierce: 8 },
  ],
  tierLines: [
    'a shot that curves across the field',
    'damage up',
    'longer arc, cuts deeper',
    'damage up',
    'longer arc, cuts deeper',
    'damage up',
    'longer arc, cuts deeper',
    'maximum sweep',
  ],
  aimSpread: 0.14,
  curveRate: 1.15,
};

class FluteInstance implements WeaponInstance {
  /** Which way the next shot bends. Alternating keeps a build from carving the
   *  same arc every phrase, and covers both flanks over a bar. */
  private bend: 1 | -1 = 1;

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    for (const dir of ctx.aimFan(FLUTE_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
      // Stored on the shot so each one keeps its own bend for life. `rehitT` is
      // free here: only the arp's orbit re-hit timer uses it, and this weapon
      // has no orbit.
      pr.rehitT = this.bend;
      this.bend = this.bend === 1 ? -1 : 1;
    }
  }

  reset(): void {
    this.bend = 1;
  }

  readonly projectile: ProjectileBehavior = {
    /** Rotates the heading a little each step and lets the shared loop travel
     *  it. Returning false keeps the arena rails, so a curving shot still turns
     *  at the edge of the world instead of sailing out of it. */
    steer(ctx: WeaponContext, pr: Projectile, dt: number): boolean {
      const turn = FLUTE_STATS.curveRate * (pr.rehitT >= 0 ? 1 : -1) * dt;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const vx = pr.vx * cos - pr.vy * sin;
      const vy = pr.vx * sin + pr.vy * cos;
      pr.vx = vx;
      pr.vy = vy;
      void ctx;
      return false;
    },
  };
}

export const FLUTE = {
  role: 'flute',
  stats: FLUTE_STATS,
  create: () => new FluteInstance(),
} satisfies WeaponModule;
