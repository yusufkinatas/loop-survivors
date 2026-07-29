// The Sub weapon module: a wall of low pressure that ploughs away from the
// player, shoving everything it passes through.
//
// LED BY THE SOUND (#266). The sub is the roundest, deepest, slowest voice in
// the palette — one note every two bars at its lowest rung, felt more than
// heard. A voice that fires that rarely has to land hard or it is not there at
// all, so this is the palette's heaviest single hit.
//
// IT WAS A RING FIRST, AND THAT WAS WRONG. An expanding ring centred on the
// player is what Subquake — the bass's evolution — already is, so the first
// pass produced a second copy of an existing weapon with different numbers.
// The listening pass said so plainly: "isn't the sub kind of almost the exact
// same as the evolved version of the base right now ... I don't think sub makes
// a unique gameplay."
//
// A wall is the fix, and it is truer to the sound anyway. A sub is not a pulse
// around a point, it is a pressure front moving THROUGH a room — you feel it
// arrive and pass. So this one leaves the player, travels in the direction they
// are facing, and clears a lane. It is directional where Subquake is
// omnidirectional, which makes aiming it the decision Subquake never asks for.

import type { WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface SubStats extends WeaponStats {
  /** Units per second the front travels. Slow enough to watch cross the field —
   *  the travel is what makes it read as pressure rather than as a hit. */
  readonly speed: number;
  /** How far it goes before dissipating. */
  readonly travel: number;
  /** Knock distance on the bodies the front passes through. The heaviest in the
   *  game: a voice this sparse earns a big physical result per trigger, and
   *  being shoved ALONG the wall's travel is what makes the lane clear. */
  readonly shove: number;
}

const SUB_STATS: SubStats = {
  // `radius` is the wall's half-width — how wide a lane it clears.
  tiers: [
    { damage: 14, radius: 78 },
    { damage: 17, radius: 78 },
    { damage: 20, radius: 88 },
    { damage: 23, radius: 88 },
    { damage: 26, radius: 98 },
    { damage: 29, radius: 98 },
    { damage: 32, radius: 108 },
    { damage: 36, radius: 120 },
  ],
  tierLines: [
    'a wall of pressure that clears a lane',
    'heavier',
    'wider lane',
    'heavier',
    'wider lane',
    'heavier',
    'wider lane',
    'maximum weight',
  ],
  speed: 340,
  travel: 520,
  shove: 54,
};

/** One pressure front in flight. */
interface Front {
  /** Where it started, and the direction it is going. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** How far it has travelled from the origin. */
  distance: number;
  halfWidth: number;
  damage: number;
  shove: number;
  /** Bodies the front has already passed through. It hits each once, as it
   *  crosses — it is a wave, not a field. */
  hit: Set<WeaponTarget>;
}

/** Half-thickness of the moving front, in world units. Thin: the wall is wide
 *  across its travel and shallow along it, which is what makes it a front
 *  rather than a box. */
const FRONT_DEPTH = 26;
const QUERY_PAD = 24;

class SubInstance implements WeaponInstance {
  private fronts: Front[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const dir = ctx.aimDir(0);
    this.fronts.push({
      x: p.x,
      y: p.y,
      dx: dir.x,
      dy: dir.y,
      distance: 0,
      halfWidth: conf.radius!,
      damage: conf.damage,
      shove: SUB_STATS.shove * ctx.buildMods.knockbackMul,
      hit: new Set(),
    });
  }

  /** THE FRONT IS THIS MODULE'S OWN, not one of the world's shockwaves.
   *
   *  `ctx.shockwaves()` hands back every wave on the field and the bass module
   *  steps all of them, overwriting each one's radius from BASS_STATS and
   *  crediting every hit to the bass. Anything spawned through that shared array
   *  would move on Subquake's schedule, pay its damage into another weapon's
   *  total, and freeze solid for a player who does not own the bass. */
  tick(ctx: WeaponContext, dt: number): void {
    for (let i = this.fronts.length - 1; i >= 0; i--) {
      const front = this.fronts[i];
      front.distance += SUB_STATS.speed * dt;
      if (front.distance >= SUB_STATS.travel) {
        this.fronts.splice(i, 1);
        continue;
      }
      const cx = front.x + front.dx * front.distance;
      const cy = front.y + front.dy * front.distance;

      // Drawn as a bar ACROSS the direction of travel — the shape of the thing,
      // redrawn every frame as it moves. The view's beam takes two endpoints,
      // so the wall is a beam laid perpendicular to its own heading.
      const px = -front.dy;
      const py = front.dx;
      ctx.fx({
        type: 'beam',
        x: cx - px * front.halfWidth,
        y: cy - py * front.halfWidth,
        x2: cx + px * front.halfWidth,
        y2: cy + py * front.halfWidth,
        width: FRONT_DEPTH * 0.5,
        color: ctx.color,
        // Steady: the wall moves, so it is redrawn every frame, and an additive
        // redraw would stack into a white slab within a few frames.
        steady: true,
      });

      for (const e of ctx.near(cx, cy, front.halfWidth + FRONT_DEPTH + QUERY_PAD)) {
        if (e.dead || front.hit.has(e)) continue;
        const relX = e.x - cx;
        const relY = e.y - cy;
        // Across the wall, and along its travel: inside the lane and inside the
        // front's own thickness.
        const across = Math.abs(relX * px + relY * py);
        const along = Math.abs(relX * front.dx + relY * front.dy);
        if (across > front.halfWidth + e.radius) continue;
        if (along > FRONT_DEPTH + e.radius) continue;
        front.hit.add(e);
        ctx.damage(e, front.damage);
        // Shoved ALONG the travel, not away from a centre: the wall pushes what
        // it meets ahead of itself, which is what clears the lane.
        ctx.shove(e, cx - front.dx * 40, cy - front.dy * 40, front.shove);
      }
    }
  }

  reset(): void {
    this.fronts.length = 0;
  }
}

export const SUB = {
  role: 'sub',
  stats: SUB_STATS,
  tickAt: 'shockwaves' satisfies TickPhase,
  create: () => new SubInstance(),
} satisfies WeaponModule;
