// The Sub weapon module: a wall of low pressure that ploughs away from the
// player, shoving everything it passes through — and its evolution, Standing
// Wave, which turns at its limit and sweeps back through the same ground. Base
// and evolved live in the same module; evolving flips an internal mode
// (ctx.evolved), read once at fire time.
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
// A wave is the fix, and it is truer to the sound anyway. A sub is not a pulse
// around a point, it is a pressure front moving THROUGH a room — you feel it
// arrive and pass. So this one leaves the player, travels in the direction they
// are facing, and clears a lane. It is directional where Subquake is
// omnidirectional, which makes aiming it the decision Subquake never asks for.
//
// AND IT IS A CURVED FRONT, NOT A STRAIGHT BAR. The first version drew a rigid
// rectangle sliding across the floor, which read as a girder rather than as
// pressure — "make it look like a wave going, instead of a wall going". A real
// front bows: it expands away from where it started, so it is an ARC whose
// radius grows, drawn as a run of short segments laid tangent to that curve.

import type { WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface SubStats extends WeaponStats {
  /** Units per second the front travels. Slow enough to watch cross the field —
   *  the travel is what makes it read as pressure rather than as a hit. */
  readonly speed: number;
  /** Half the angular width of the wave, in radians. This is what keeps it a
   *  directional front rather than Subquake's full ring, and half of what sets
   *  how much ground one wave sweeps. */
  readonly halfAngle: number;
  /** Segments the curve is drawn with. Enough that it reads as curved. */
  readonly segments: number;
  /** Knock distance on the bodies the front passes through. The heaviest in the
   *  game: a voice this sparse earns a big physical result per trigger, and
   *  being shoved ALONG the wall's travel is what makes the lane clear. */
  readonly shove: number;

  // ---------------- Standing Wave (evolved) --------------------------------
  //
  // THE FRONT COMES BACK. A sub in a real room does not simply leave: it hits
  // the far wall and returns through you, which is why one note can feel like
  // two. So the evolved front reaches its limit, turns, and sweeps back over
  // exactly the ground it just cleared — one trigger, two passes, and the second
  // one is the harder of the two.
  //
  // It is also the only thing on the field that REVERSES, which is how it stays
  // clear of Subquake next door: that ring expands once and is gone.
  //
  // The return DRAGS INWARD rather than shoving out, so the wave gathers what it
  // caught into the middle instead of scattering it. That is a real risk the
  // player takes on — the crowd ends up closer to them than it started — and it
  // is what sets up every close-range weapon in the build.

  /** Return-pass damage as a multiple of the outward pass. Above 1: the wave
   *  comes back heavier, so the second half of the trigger is the payoff rather
   *  than an echo. */
  readonly evolvedReturnDamageMul: number;
}

const SUB_STATS: SubStats = {
  // `radius` IS THE WAVE'S REACH — how far the front travels before it
  // dissipates. It was briefly dead: rebuilding this weapon from a straight
  // wall into an arc left the geometry on a flat 520-unit constant, so the tier
  // table's radius column did nothing and levelling grew the damage but not the
  // ground covered. Reading it here also puts the wave back under the build's
  // area modifier, which every other area weapon already obeys.
  //
  // The whole shape is smaller than the first pass as well. At 520 reach and
  // 0.62 half-angle it swept more ground than anything else in the game at
  // every level, including level one; it now starts at 340 and grows to 460
  // against a narrower 0.5 half-angle, which is roughly a third of the old area
  // at the bottom and two thirds at the top.
  // SEATED WITH THE OTHER AREA WEAPONS. The first pass ran 14 to 36 per hit,
  // reasoning that a voice firing once every two bars has to land hard. That
  // was wrong twice over: it is three and a half times the clap's per-hit
  // damage, and this wave sweeps a far bigger area than any other shape in the
  // game — an arc reaching 520 units against the clap's 120-radius circle — so
  // it was collecting that inflated number off many more bodies per trigger.
  // Against a single body it was doing 108 damage a bar at max where the clap
  // does 35.
  //
  // For reference, per hit: kick 3-15, clap 4-10, chank 5-13, organ 3-8.
  tiers: [
    { damage: 6, radius: 340 },
    { damage: 7, radius: 340 },
    { damage: 9, radius: 370 },
    { damage: 10, radius: 370 },
    { damage: 12, radius: 400 },
    { damage: 14, radius: 400 },
    { damage: 16, radius: 430 },
    { damage: 18, radius: 460 },
  ],
  tierLines: [
    'a wave of pressure that clears a lane',
    'heavier',
    'travels further',
    'heavier',
    'travels further',
    'heavier',
    'travels further',
    'maximum weight',
  ],
  speed: 340,
  halfAngle: 0.5,
  segments: 7,
  shove: 54,

  evolvedReturnDamageMul: 1.3,
};

/** One pressure front in flight. */
interface Front {
  /** Where it started. The wave expands away from this point, so the origin is
   *  the centre of its curve and never moves. */
  x: number;
  y: number;
  /** Heading, as an angle — the middle of the arc. */
  angle: number;
  /** How far the front has travelled from the origin: the arc's radius. */
  radius: number;
  /** Where it stops. */
  reach: number;
  damage: number;
  shove: number;
  /** Bodies the front has already passed through. It hits each once, as it
   *  crosses — it is a wave, not a field. CLEARED at the turn, so Standing
   *  Wave's return pass gets its own fresh set and can catch the same bodies
   *  again. */
  hit: Set<WeaponTarget>;
  /** Whether this front turns at its limit instead of dissipating. FROZEN AT
   *  FIRE TIME, not a live read of ctx.evolved: a front already travelling when
   *  the chest lands keeps the rule it was born under, the same way a chord zone
   *  keeps its own. */
  reflects: boolean;
  /** Which way it is going. Only ever true on a `reflects` front. */
  returning: boolean;
}

/** Half-thickness of the front, in world units. Thin: the wave is wide across
 *  and shallow through, which is what makes it a front rather than a blob. */
const FRONT_DEPTH = 30;
const QUERY_PAD = 24;

/** Radius a front is born at, and the radius a returning one dies at. A wave
 *  born at zero is a point, and its first frames would draw a dot rather than a
 *  curve; a returning wave that collapsed to zero would spend its last frames
 *  the same way. */
const BIRTH_RADIUS = 40;

class SubInstance implements WeaponInstance {
  private fronts: Front[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const dir = ctx.aimDir(0);
    this.fronts.push({
      x: p.x,
      y: p.y,
      angle: Math.atan2(dir.y, dir.x),
      // Starts out from the player rather than at zero: a wave born at radius 0
      // is a point, and its first frames would be a dot rather than a curve.
      radius: BIRTH_RADIUS,
      reach: conf.radius!,
      damage: conf.damage,
      shove: SUB_STATS.shove * ctx.buildMods.knockbackMul,
      hit: new Set(),
      reflects: ctx.evolved,
      returning: false,
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
      if (front.returning) {
        // Back the way it came, at the same speed, so the two passes read as one
        // wave rather than as two weapons.
        front.radius -= SUB_STATS.speed * dt;
        if (front.radius <= BIRTH_RADIUS) {
          this.fronts.splice(i, 1);
          continue;
        }
      } else {
        front.radius += SUB_STATS.speed * dt;
        if (front.radius >= front.reach) {
          if (!front.reflects) {
            this.fronts.splice(i, 1);
            continue;
          }
          // THE TURN. A fresh hit set is what makes the return a second pass
          // rather than a redraw: every body it already crossed is eligible
          // again, and this time for more.
          front.radius = front.reach;
          front.returning = true;
          front.hit.clear();
          front.damage *= SUB_STATS.evolvedReturnDamageMul;
        }
      }

      // Drawn as short segments laid END TO END along the arc, each tangent to
      // it. That is what makes the front read as curved and moving rather than
      // as a rigid bar being pushed.
      const steps = SUB_STATS.segments;
      for (let n = 0; n < steps; n++) {
        const a0 = front.angle - SUB_STATS.halfAngle + (n / steps) * SUB_STATS.halfAngle * 2;
        const a1 = front.angle - SUB_STATS.halfAngle + ((n + 1) / steps) * SUB_STATS.halfAngle * 2;
        ctx.fx({
          type: 'beam',
          x: front.x + Math.cos(a0) * front.radius,
          y: front.y + Math.sin(a0) * front.radius,
          x2: front.x + Math.cos(a1) * front.radius,
          y2: front.y + Math.sin(a1) * front.radius,
          width: FRONT_DEPTH * 0.32,
          color: ctx.color,
          // Steady: the wave moves, so it is redrawn every frame, and an
          // additive redraw would stack into a solid slab within a few frames.
          steady: true,
          dur: 0.06,
        });
      }

      const reach = front.radius + FRONT_DEPTH;
      for (const e of ctx.near(front.x, front.y, reach + QUERY_PAD)) {
        if (e.dead || front.hit.has(e)) continue;
        const relX = e.x - front.x;
        const relY = e.y - front.y;
        const dist = Math.hypot(relX, relY);
        // Inside the front's own thickness, measured from the origin...
        if (Math.abs(dist - front.radius) > FRONT_DEPTH + e.radius) continue;
        // ...and inside its angular span, which is what makes it directional.
        let off = Math.atan2(relY, relX) - front.angle;
        while (off > Math.PI) off -= Math.PI * 2;
        while (off < -Math.PI) off += Math.PI * 2;
        // Widen the span by the body's own size at this distance, so a big
        // enemy clipped by the edge is still caught.
        const slack = dist > 1 ? e.radius / dist : Math.PI;
        if (Math.abs(off) > SUB_STATS.halfAngle + slack) continue;
        front.hit.add(e);
        ctx.damage(e, front.damage);
        if (front.returning) {
          // DRAGGED INWARD, toward where the wave started. ctx.shove only ever
          // pushes AWAY from a point and ignores a negative distance, so the
          // point it is handed is one unit further out than the body along the
          // same ray — pushing away from there is pulling toward the centre.
          const ux = dist > 1 ? relX / dist : 1;
          const uy = dist > 1 ? relY / dist : 0;
          ctx.shove(e, e.x + ux, e.y + uy, front.shove);
        } else {
          // Shoved outward from the origin: the wave pushes what it meets ahead
          // of itself, which is what clears the ground behind it.
          ctx.shove(e, front.x, front.y, front.shove);
        }
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
