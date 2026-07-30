// The Flute weapon module: a slow shot that curves as it goes — and its
// evolution, Vortex, where the curve keeps tightening until the shot is winding
// a closing spiral through the crowd. Base and evolved live in the same module; a
// shot carries its own mode in `pr.evolved`, frozen when it was spawned.
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

  // ---------------- Vortex (evolved) ---------------------------------------
  //
  // THE CURVE STOPS BEING CONSTANT. A base shot turns at one rate for its whole
  // life, which draws a long lazy arc across the field — the breath the sound is.
  // Evolved, the rate CLIMBS as the shot ages, and a turn rate that climbs at
  // constant speed is a spiral: the shot flies out wide, then winds in on itself,
  // each loop tighter than the last, until it is scribbling a knot.
  //
  // WHICH INVERTS WHAT THE WEAPON IS FOR. The base arc is thrown out at the crowd
  // and leaves; a spiral closes, so it sweeps the same ground repeatedly on the
  // way in and ends up back where the player is standing. The one long arc becomes
  // an area the shot slowly eats.
  //
  // IT NEEDS THE LIFE AND THE PIERCE TO PAY OFF. A spiral that expires on its
  // first loop is just a tighter arc, and one that stops on its eighth body never
  // reaches the middle — so both are lifted, and they are the whole of the
  // numerical change. Nothing else in the game holds a single shot on the field
  // this long.

  /** How much the turn rate grows per second of the shot's life, as a fraction of
   *  curveRate. The tightening — and therefore the spiral. */
  readonly vortexTightenPerS: number;
  /** Life and pierce multipliers, so a spiral survives long enough to close and
   *  keeps cutting while it does. */
  readonly vortexLifeMul: number;
  readonly vortexPierceMul: number;
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

  vortexTightenPerS: 1.1,
  vortexLifeMul: 1.6,
  vortexPierceMul: 2.5,
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
      if (pr.evolved) {
        // A spiral has to survive to close, and has to keep cutting on the way in.
        // Both ride the shot itself, so a base shot already in flight when the
        // chest lands is not retroactively handed either.
        pr.lifeS *= FLUTE_STATS.vortexLifeMul;
        pr.pierce = Math.round(pr.pierce * FLUTE_STATS.vortexPierceMul);
        pr.maxPierce = pr.pierce;
      }
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
      // THE SPIRAL, in one term. Radius of curvature is speed over turn rate, so
      // a rate that climbs while speed holds is a path that winds inward — no
      // spiral state, no centre point, nothing to track.
      const rate = pr.evolved
        ? FLUTE_STATS.curveRate * (1 + pr.age * FLUTE_STATS.vortexTightenPerS)
        : FLUTE_STATS.curveRate;
      const turn = rate * (pr.rehitT >= 0 ? 1 : -1) * dt;
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
