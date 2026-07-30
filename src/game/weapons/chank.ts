// The Chank weapon module: fast alternating slashes, close in — and its
// evolution, Windmill, a double blade through the player that steps around a
// full turn as they play. Base and evolved live in the same module; evolving
// flips an internal mode (ctx.evolved).
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
import { circleIntersectsRect, distanceToSegment } from '../spatial';
import type { WeaponContext } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

interface ChankStats extends WeaponStats {
  /** Slash length and half-thickness at area 1, in H800 world units. Short:
   *  this weapon's whole identity is that it has no reach. */
  readonly reach: number;
  readonly halfWidth: number;
  readonly shove: number;

  // ---------------- Windmill (evolved) -------------------------------------
  //
  // THE ARM COMES ALL THE WAY ROUND. A chank player strums, and the biggest
  // version of a strum is the windmill — the whole arm over the top of the
  // strings. So the base's chop BESIDE the player becomes a blade THROUGH them,
  // out both sides at once, and it steps a fixed angle every trigger. At the
  // weapon's busiest rung that is seven chops a bar, and the step is sized so
  // seven of them complete a full turn: the blade sweeps a circle in a bar.
  //
  // WHAT IT KEEPS is the identity — no reach worth speaking of, so it still only
  // works when the player is standing in the crowd. What it changes is that the
  // player no longer has to be on the right SIDE of them.
  //
  // NOT A KICK, AND NOT AN ARP. Redline Stomp is four fixed arms, axis-aligned,
  // instantaneous, reaching most of the visible arena; this is one short blade at
  // an arbitrary angle, seven times a bar. Event Horizon's crown ORBITS at a
  // radius; this passes through the middle.
  //
  // THE ANGLE RIDES ctx.triggerCount, which does not reset on evolution — the
  // same rule Strobe Lane's stagger follows. A chank that evolves mid-run picks
  // the turn up wherever its count had got to rather than snapping back to zero.

  /** Radians the blade advances per trigger. Two pi over seven: the busiest rung
   *  of this weapon's chart is seven a bar, so at full density the blade turns
   *  exactly once per bar. */
  readonly evolvedStepRad: number;
  /** Blade half-length and half-thickness as multiples of the base chop's. Modest
   *  on both counts: a blade that reached far would stop being this weapon. */
  readonly evolvedReachMul: number;
  readonly evolvedHalfWidthMul: number;
  /** Per-trigger damage as a multiple of the base chop's. Under 1 because the
   *  blade covers both sides of the player at once and therefore catches roughly
   *  twice the bodies a chop did. */
  readonly evolvedDamageMul: number;
  /** Knock the blade applies, away from the player. Small, like the base's: this
   *  weapon wants the crowd to stay in range of the next pass. */
  readonly evolvedShove: number;
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

  evolvedStepRad: (Math.PI * 2) / 7,
  evolvedReachMul: 1.25,
  evolvedHalfWidthMul: 0.7,
  evolvedDamageMul: 0.85,
  evolvedShove: 10,
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
    if (ctx.evolved) {
      this.fireWindmill(ctx, conf);
      return;
    }
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
    // The sweep, turned on its side. This is the same artwork the kick's strip
    // uses — a bar that was briefly swapped for a plain beam and read worse for
    // it. Only the axis differs, which was the whole point of the change.
    ctx.fx({
      type: 'whip',
      x: p.x,
      y: p.y,
      side: dir,
      area: area * (CHANK_STATS.reach / 258),
      color: ctx.color,
      vertical: true,
    });
  }

  /** Windmill: one blade straight through the player, both sides at once, turned
   *  a step further than the last trigger.
   *
   *  A CAPSULE, not a rectangle. The base chop can use the axis-aligned
   *  circleIntersectsRect because it only ever points up or down; a blade at an
   *  arbitrary angle cannot, so this measures distance to the blade's segment
   *  instead — the same shape the organ's beam and the drone's cables use.
   *
   *  RESOLVES SYNCHRONOUSLY, exactly as the base chop does: one pass, one hit per
   *  body, nothing scheduled and nothing owned. */
  private fireWindmill(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const area = conf.area ?? 1;
    const reach = CHANK_STATS.reach * CHANK_STATS.evolvedReachMul * area;
    const halfWidth = CHANK_STATS.halfWidth * CHANK_STATS.evolvedHalfWidthMul * area;
    const angle = ctx.triggerCount * CHANK_STATS.evolvedStepRad;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    // Both tips, so the blade is centred on the player rather than growing off
    // one side of them.
    const ax = p.x - dx * reach;
    const ay = p.y - dy * reach;
    const bx = p.x + dx * reach;
    const by = p.y + dy * reach;
    const damage = conf.damage * CHANK_STATS.evolvedDamageMul;
    for (const e of ctx.near(p.x, p.y, reach + halfWidth + QUERY_PAD)) {
      if (e.dead) continue;
      if (distanceToSegment(e.x, e.y, ax, ay, bx, by) > halfWidth + e.radius) continue;
      ctx.damage(e, damage);
      ctx.shove(e, p.x, p.y, CHANK_STATS.evolvedShove);
    }
    // A beam rather than the base's swept bar: the whole point is that this one
    // is at an angle, and the bar artwork only knows two of them.
    //
    // WITH AN EXPLICIT SHORT LIFE. A one-shot beam defaults to 0.24 s, and at this
    // weapon's seven-a-bar that leaves the last two or three blades hanging around
    // as the next one lands — which reads as an accumulating star rather than as an
    // arm coming round. A flick is the base chop's whole character and the blade
    // has to keep it.
    ctx.fx({
      type: 'beam',
      x: ax,
      y: ay,
      x2: bx,
      y2: by,
      width: halfWidth,
      color: ctx.color,
      dur: 0.12,
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
