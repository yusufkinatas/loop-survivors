// The Chank weapon module: fast alternating slashes, close in.
//
// LED BY THE SOUND (#266). The chank is a muted guitar chop — dry, tight, and
// the busiest voice in the harmonic seat, up to seven a bar with ghosts between
// the accents. Short and sharp wants short and sharp: a small hard cut right
// next to the player, flicking left then right, one per trigger.
//
// It shares the kick's rectangle maths and reads nothing like it. The kick is
// one heavy strip on the beat with a follow-up on the far side; this is a
// rapid-fire scratch you can barely see individual frames of, and it has no
// reach at all — you have to be in the crowd.

import { type WeaponConf } from '../config';
import { circleIntersectsRect } from '../spatial';
import type { WeaponContext } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

interface ChankStats extends WeaponStats {
  /** Slash length and half-thickness at area 1, in H800 world units. Short:
   *  this weapon's whole identity is that it has no reach. */
  readonly reach: number;
  readonly halfWidth: number;
  readonly shove: number;
}

const CHANK_STATS: ChankStats = {
  tiers: [
    { damage: 5, area: 1 },
    { damage: 6, area: 1 },
    { damage: 7, area: 1.12 },
    { damage: 8, area: 1.12 },
    { damage: 9, area: 1.24 },
    { damage: 10, area: 1.24 },
    { damage: 11, area: 1.38 },
    { damage: 13, area: 1.5 },
  ],
  tierLines: [
    'a fast scratch at your side',
    'damage up',
    'wider cut',
    'damage up',
    'wider cut',
    'damage up',
    'wider cut',
    'maximum bite',
  ],
  reach: 150,
  halfWidth: 30,
  shove: 12,
};

const QUERY_PAD = 24;

class ChankInstance implements WeaponInstance {
  /** Which way the next slash goes: up, then down. Alternating turns a stream of
   *  identical hits into a rhythm you can see, and covers both sides of the
   *  player rather than only the one they face. */
  private side: 1 | -1 = 1;

  /** ABOVE AND BELOW, NOT LEFT AND RIGHT. Horizontally this was a kick clone —
   *  same rectangle, same alternating sides, close in — and two weapons that
   *  sweep the same ground are one weapon with two sounds. Turning the axis
   *  ninety degrees is the cheapest way to make them read as different tools
   *  and to make holding both cover more of the field than holding either
   *  twice. */
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const area = conf.area ?? 1;
    const reach = CHANK_STATS.reach * area;
    const halfWidth = CHANK_STATS.halfWidth * area;
    const dir = this.side;
    this.side = dir === 1 ? -1 : 1;

    // Centred half a reach above or below the player. The rectangle is the same
    // shape as before with its axes swapped: long vertically, narrow across.
    const midX = p.x;
    const midY = p.y + dir * reach * 0.5;
    for (const e of ctx.near(midX, midY, reach * 0.5 + halfWidth + QUERY_PAD)) {
      if (e.dead) continue;
      if (!circleIntersectsRect(e.x, e.y, e.radius, midX, midY, halfWidth, reach * 0.5)) continue;
      ctx.damage(e, conf.damage);
      ctx.shove(e, p.x, p.y, CHANK_STATS.shove);
    }
    // Drawn as a short thick bar running the length of the cut. The whip fx is
    // horizontal-only, which is precisely the shape this weapon is moving away
    // from.
    ctx.fx({
      type: 'beam',
      x: p.x,
      y: p.y,
      x2: p.x,
      y2: p.y + dir * reach,
      width: halfWidth * 0.8,
      color: ctx.color,
      steady: true,
      // Longer than the slash needs, deliberately: at seven cuts a bar the
      // individual swings blur together anyway, and a flicker that short reads
      // as noise rather than as an attack.
      dur: 0.2,
    });
  }

  /** Resolves entirely inside fire(); nothing is scheduled. The side flag is
   *  cosmetic ordering, and resetting it keeps a fresh sandbox run starting on
   *  the same side as a fresh real one. */
  reset(): void {
    this.side = 1;
  }
}

export const CHANK = {
  role: 'chank',
  stats: CHANK_STATS,
  create: () => new ChankInstance(),
} satisfies WeaponModule;
