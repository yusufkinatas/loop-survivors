// The Organ weapon module: a long sustained beam that holds while the note
// rings.
//
// LED BY THE SOUND (#266). The organ is the palette's held harmonic voice — a
// pipe speaks and keeps speaking. A beam is the only shape that says the same
// thing: it does not fire and finish, it is ON for as long as the note is, and
// it damages whatever stands in it the whole time.
//
// THE ONLY BEAM IN THE GAME, and the reason it can exist cheaply is that the
// kick already needs rectangle-versus-circle maths for its strip. Same test,
// very different rectangle: the kick's is short, wide and beside you for a
// twelfth of a second; this is long, narrow, ahead of you, and it holds.

import { type WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface OrganStats extends WeaponStats {
  /** Beam length and half-thickness at area 1, in H800 world units. */
  readonly reach: number;
  readonly halfWidth: number;
  /** Seconds a beam stays lit. Long: this is the held voice, and a beam that
   *  blinks is a muzzle flash. */
  readonly holdS: number;
  /** Seconds between damage passes down a live beam. A body standing in it is
   *  hit repeatedly, which is what "sustained" has to mean for damage. */
  readonly tickS: number;
}

const ORGAN_STATS: OrganStats = {
  // Per-PASS damage, and a beam runs several passes over its life.
  tiers: [
    { damage: 3, area: 1 },
    { damage: 3.6, area: 1 },
    { damage: 4.2, area: 1.12 },
    { damage: 4.8, area: 1.12 },
    { damage: 5.5, area: 1.24 },
    { damage: 6.2, area: 1.24 },
    { damage: 7, area: 1.36 },
    { damage: 8, area: 1.5 },
  ],
  tierLines: [
    'a beam that holds while the note rings',
    'damage up',
    'longer, wider',
    'damage up',
    'longer, wider',
    'damage up',
    'longer, wider',
    'maximum reach',
  ],
  reach: 420,
  halfWidth: 26,
  holdS: 0.9,
  tickS: 0.12,
};

interface LiveBeam {
  x: number;
  y: number;
  dx: number;
  dy: number;
  reach: number;
  halfWidth: number;
  damage: number;
  expiresAt: number;
  nextTickAt: number;
}

class OrganInstance implements WeaponInstance {
  private beams: LiveBeam[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const dir = ctx.aimDir(0);
    const area = conf.area ?? 1;
    this.beams.push({
      x: p.x,
      y: p.y,
      dx: dir.x,
      dy: dir.y,
      reach: ORGAN_STATS.reach * area,
      halfWidth: ORGAN_STATS.halfWidth * area,
      damage: conf.damage,
      expiresAt: ctx.timeS + ORGAN_STATS.holdS * ctx.buildMods.durationMul,
      // First pass immediately, so the beam bites the instant it lights.
      nextTickAt: ctx.timeS,
    });
  }

  /** ANCHORED AT FIRE TIME, like the bass's Subquake and unlike the auras. A
   *  beam that swung around with the player would be a searchlight, and aiming
   *  it would stop being a decision — you would just point at whatever you
   *  happened to be facing this frame. */
  tick(ctx: WeaponContext): void {
    const now = ctx.timeS;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      if (now >= beam.expiresAt) {
        this.beams.splice(i, 1);
        continue;
      }
      // The beam is drawn every frame it is alive; damage runs on its own
      // slower cadence so a body in it takes a readable series of hits rather
      // than sixty a second.
      const midX = beam.x + beam.dx * beam.reach * 0.5;
      const midY = beam.y + beam.dy * beam.reach * 0.5;
      ctx.fx({
        type: 'beam',
        x: beam.x,
        y: beam.y,
        x2: beam.x + beam.dx * beam.reach,
        y2: beam.y + beam.dy * beam.reach,
        width: beam.halfWidth * 2,
        color: ctx.color,
      });
      if (now < beam.nextTickAt) continue;
      beam.nextTickAt = now + ORGAN_STATS.tickS;
      const query = beam.reach * 0.5 + beam.halfWidth + QUERY_PAD;
      for (const e of ctx.near(midX, midY, query)) {
        if (e.dead) continue;
        if (!inBeam(e, beam)) continue;
        ctx.damage(e, beam.damage);
      }
    }
  }

  /** Every live beam is dropped: clearSandboxEntities promises no delayed
   *  strike survives, and a beam is exactly that — a damage pass scheduled to
   *  keep happening. */
  reset(): void {
    this.beams.length = 0;
  }
}

/** Slack around the rectangle before the exact test decides. Not tuning: the
 *  spatial hash already widens by the largest inserted radius and every
 *  candidate is cut again below. */
const QUERY_PAD = 24;

/** Is this body inside the beam?
 *
 *  A CAPSULE TEST, not a rectangle one. The shared `circleIntersectsRect` is
 *  axis-aligned, and a beam points wherever the player was aiming — so the
 *  honest shape is "within halfWidth of the line segment", which is both
 *  rotation-free to compute and a rounder, fairer hitbox at the beam's tip than
 *  a rotated box would be. */
function inBeam(e: WeaponTarget, beam: LiveBeam): boolean {
  const relX = e.x - beam.x;
  const relY = e.y - beam.y;
  // Distance along the beam, clamped to its length.
  const along = Math.max(0, Math.min(beam.reach, relX * beam.dx + relY * beam.dy));
  const offX = relX - beam.dx * along;
  const offY = relY - beam.dy * along;
  return Math.hypot(offX, offY) <= beam.halfWidth + e.radius;
}

export const ORGAN = {
  role: 'organ',
  stats: ORGAN_STATS,
  tickAt: 'strikes' satisfies TickPhase,
  create: () => new OrganInstance(),
} satisfies WeaponModule;
