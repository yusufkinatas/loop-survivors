// The Sub weapon module: a slow, heavy pressure ring that rolls out from the
// player and shoves everything it crosses.
//
// LED BY THE SOUND (#266). The sub is the roundest, deepest, slowest voice in
// the palette — one note every two bars at its lowest rung, felt more than
// heard. A voice that fires that rarely has to land hard or it is not there at
// all, so this is the palette's heaviest single hit: few, slow, and everything
// it touches goes backwards.
//
// NOT THE BASS'S SUBQUAKE, and the difference is deliberate. Subquake is the
// bass's EVOLUTION — a fast, wide ring with no pierce budget. This is a base
// weapon: slower, tighter, and it trades reach for weight and knockback.

import type { WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface SubStats extends WeaponStats {
  /** Radius the ring starts at, before it begins to grow. */
  readonly startRadius: number;
  /** How far past `radius` the ring travels, as a multiple of it. */
  readonly reachMul: number;
  /** Seconds the ring takes to reach full size. Slow: this is a swell, not a
   *  crack, and the travel time is what makes it readable as pressure. */
  readonly lifeS: number;
  /** Knock distance on the bodies the edge crosses. The heaviest in the game —
   *  a voice this sparse earns a big physical result per trigger. */
  readonly shove: number;
}

const SUB_STATS: SubStats = {
  tiers: [
    { damage: 14, radius: 96 },
    { damage: 17, radius: 96 },
    { damage: 20, radius: 108 },
    { damage: 23, radius: 108 },
    { damage: 26, radius: 120 },
    { damage: 29, radius: 120 },
    { damage: 32, radius: 132 },
    { damage: 36, radius: 144 },
  ],
  tierLines: [
    'a slow wave of pressure',
    'heavier',
    'rolls further',
    'heavier',
    'rolls further',
    'heavier',
    'rolls further',
    'maximum weight',
  ],
  startRadius: 18,
  reachMul: 1.9,
  lifeS: 0.62,
  shove: 54,
};

/** One ring in flight. */
interface Ring {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  age: number;
  damage: number;
  shove: number;
  /** Bodies this ring's edge has already crossed. A ring hits each body once,
   *  as it passes — it is a wave, not a field. */
  hit: Set<WeaponTarget>;
}

class SubInstance implements WeaponInstance {
  private rings: Ring[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    this.rings.push({
      x: p.x,
      y: p.y,
      radius: SUB_STATS.startRadius,
      maxRadius: conf.radius! * SUB_STATS.reachMul,
      age: 0,
      damage: conf.damage,
      shove: SUB_STATS.shove * ctx.buildMods.knockbackMul,
      hit: new Set(),
    });
    ctx.fx({ type: 'ring', x: p.x, y: p.y, radius: SUB_STATS.startRadius * 2, color: ctx.color, dur: 0.3, soft: true });
  }

  /** THE RING IS THIS MODULE'S OWN, not one of the world's shockwaves, and that
   *  is a correctness requirement rather than a style choice.
   *
   *  `ctx.shockwaves()` hands back EVERY wave on the field, and the bass module
   *  steps all of them in its tick — overwriting each one's radius from
   *  BASS_STATS.quakeGrowthS and attributing every hit to the bass. A ring
   *  spawned through the shared array would therefore grow on Subquake's
   *  schedule instead of its own, credit its damage to another weapon, and stop
   *  moving entirely for a player who does not own the bass. Owning the state
   *  here is what makes this weapon its own weapon. */
  tick(ctx: WeaponContext, dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.age += dt;
      if (ring.age >= SUB_STATS.lifeS) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = Math.min(1, ring.age / SUB_STATS.lifeS);
      ring.radius = SUB_STATS.startRadius + (ring.maxRadius - SUB_STATS.startRadius) * t;
      ctx.fx({ type: 'ring', x: ring.x, y: ring.y, radius: ring.radius, color: ctx.color, dur: 0.08, soft: true });
      for (const e of ctx.near(ring.x, ring.y, ring.radius + QUERY_PAD)) {
        if (e.dead || ring.hit.has(e)) continue;
        if (Math.hypot(e.x - ring.x, e.y - ring.y) > ring.radius + e.radius) continue;
        ring.hit.add(e);
        ctx.damage(e, ring.damage);
        ctx.shove(e, ring.x, ring.y, ring.shove);
      }
    }
  }

  reset(): void {
    this.rings.length = 0;
  }
}

/** Slack around the ring before the exact distance test decides. */
const QUERY_PAD = 24;

export const SUB = {
  role: 'sub',
  stats: SUB_STATS,
  tickAt: 'shockwaves' satisfies TickPhase,
  create: () => new SubInstance(),
} satisfies WeaponModule;
