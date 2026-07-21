import { AIM_RANGE, type WeaponConf } from '../config';
import { circlesOverlap } from '../spatial';
import type { WeaponContext, WeaponTarget } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

/** How much wider than the shape the spatial-hash query goes before the exact
 *  distance test decides. NOT TUNING, and deliberately not a stat: it is a copy
 *  of the `+ 24` widening RunWorld.damageCone and damageArea each did on their
 *  query, and it is arithmetically unobservable — SpatialHash.query
 *  already widens by the largest inserted radius, and every candidate it returns
 *  is cut again by the real reach test below. Nothing about the clap's footprint
 *  is decided here. */
const HASH_QUERY_PAD = 24;

/** The clap's tuning. Every number below was either a rung of
 *  config.WEAPONS.clap, config.WEAPON_SHOVE.clap, a field of config.TWO_HANDS,
 *  or a bare literal in run.ts's `case 'clap'` / damageCone / fireTwoHands /
 *  spawnPinch / drawPinchHands / updateClapPinches; values are unchanged.
 *  Nothing in the behavior code below may be a bare literal. */
interface ClapStats extends WeaponStats {
  // ---------------- the base cone ------------------------------------------

  readonly shove: number;
  /** Radius inside which a body is hit REGARDLESS OF THE CONE'S ANGLE, in
   *  units. WAS the bare `d < 34` in RunWorld.damageCone.
   *
   *  This is the whole reason a Whip does not have a blind spot: something
   *  standing on the player is inside the swing whichever way the swing points,
   *  so the angular test is skipped entirely rather than being widened. A
   *  STRICT `<`, so a body at exactly this distance takes the angular test. */
  readonly pointBlankRadius: number;

  // ---------------- Two Hands ----------------------------------------------
  //
  // A clap is two hands meeting, so each trigger picks the closest few enemies
  // and snaps a pair of slabs shut on each one. Deliberately tiny — the identity
  // is high single-target damage that MOVES NOTHING, leaving the horde's shape
  // to the rest of the band, NOT another player-centred blast (that is what
  // Subquake is for). Keep `pinchRadius` well under Subquake's 144-unit ring.

  /** How many nearby enemies get their own pincer on a single trigger. WAS
   *  TWO_HANDS.targets. */
  readonly targets: number;
  readonly closeS: number;
  /** How far out along the pinch axis each slab starts, in world units. WAS
   *  TWO_HANDS.openGap. Also the distance AHEAD OF THE PLAYER an empty-field
   *  clap places its pincer. */
  readonly openGap: number;
  /** Radius crushed at the pinch point once the hands meet. WAS
   *  TWO_HANDS.pinchRadius. Resolved with circlesOverlap, so the real contact
   *  distance is this plus the body's own radius. */
  readonly pinchRadius: number;
  /** Per-hit damage multiplier on the weapon's base damage — sits between
   *  Railshot's 1.50 and Subquake's 1.55, because the footprint is a fraction of
   *  either. WAS TWO_HANDS.damageMul. */
  readonly damageMul: number;
  // ---------------- the slabs, which are view only -------------------------

  /** Half-length of a drawn slab, as a multiple of the pinch radius. WAS the
   *  bare `pinch.radius * 1.15` in drawPinchHands. */
  readonly handHalfLengthMul: number;
  /** Drawn thickness of a slab. WAS the bare `width: 5`. */
  readonly handWidth: number;
  /** Fraction of `closeS` REMAINING at which the one halfway visual is emitted.
   *  WAS the bare `pinch.closeS * 0.5`. */
  readonly handMidFraction: number;
  /** Standoff the slabs are DRAWN at on that halfway frame, as a fraction of
   *  the full gap. WAS the bare `drawPinchHands(pinch, 0.45)`.
   *
   *  NOT the same number as `handMidFraction` and not derivable from it: the
   *  hands are drawn slightly PAST halfway (0.45 of the gap at 0.5 of the time)
   *  so the closing reads as an accelerating snap rather than a linear slide. */
  readonly handMidT: number;

  /** Particle count on the crush spark. WAS the bare `n: 6`. */
  readonly sparkCount: number;
  /** Spark spread, as a multiple of the pinch radius. WAS the bare
   *  `spread: pinch.radius * 0.7`. */
  readonly sparkSpreadMul: number;
}

const CLAP_STATS: ClapStats = {
  // Whip: a wide forward slash that hits everything in a close cone. Melee crowd
  // control — no travel, instant, safest when the wall is on top of you.
  tiers: [
    { damage: 2, radius: 80, arc: 0.65 },
    { damage: 3, radius: 88, arc: 0.72 },
    { damage: 4, radius: 98, arc: 0.8 },
    { damage: 6, radius: 108, arc: 0.9 },
  ],
  tierLines: [
    'a wide slash close to you',
    'wider, harder slash',
    'sweeps a bigger arc',
    'the widest, hardest slash',
  ],

  shove: 12,
  pointBlankRadius: 34,

  targets: 3,
  closeS: 0.12,
  openGap: 74,
  pinchRadius: 42,
  damageMul: 1.52,

  handHalfLengthMul: 1.15,
  handWidth: 5,
  handMidFraction: 0.5,
  handMidT: 0.45,

  sparkCount: 6,
  sparkSpreadMul: 0.7,
};

/** One Two Hands pincer in flight: two slabs standing off along `angle` from
 *  (x, y), travelling inward to meet at `closesAt`. Moved verbatim from run.ts,
 *  where it was a private interface and a private array on RunWorld — the view
 *  never read either, so the whole shape is this module's. */
interface ClapPinch {
  x: number;
  y: number;
  /** Axis the two slabs travel along, in radians. */
  angle: number;
  /** Simulation time at which the hands meet and the damage lands. */
  closesAt: number;
  /** Total travel time, so the view can be fed a halfway frame. FROZEN AT SPAWN
   *  from CLAP_STATS.closeS rather than re-read in tick(), exactly as it was. */
  closeS: number;
  /** Standoff of each slab, already scaled by the build's areaMul. */
  gap: number;
  /** Crush radius, already scaled by the build's areaMul. */
  radius: number;
  damage: number;
  color: number;
  /** Set once the halfway visual has been emitted. */
  midShown: boolean;
}

class ClapInstance implements WeaponInstance {
  /** Pincers in flight, in SPAWN ORDER. Per-run state, on the instance: see the
   *  file header for why this cannot live on the module singleton. */
  private readonly pinches: ClapPinch[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    if (ctx.evolved) {
      this.fireTwoHands(ctx, conf);
      return;
    }
    const p = ctx.player;
    const aim = ctx.aimDir(0);
    const ang = Math.atan2(aim.y, aim.x);
    const reach = conf.radius!;
    // DAMAGE FIRST, FX SECOND. Every kill this cone makes — and every rng draw
    // behind the drops those kills roll — lands before the arc is queued.
    this.damageCone(ctx, p.x, p.y, ang, conf.arc!, reach, conf.damage);
    ctx.fx({ type: 'arc', x: p.x, y: p.y, angle: ang, arc: conf.arc!, radius: reach, color: ctx.color });
  }

  /** Damage every enemy inside a forward cone (also point-blank). WAS
   *  RunWorld.damageCone, whose only caller was ever this weapon.
   *
   *  THE VISIT ORDER IS THE FRAME'S SPATIAL-HASH SNAPSHOT, in hash bucket order,
   *  not the enemy array. That is the order kills happen in and therefore the
   *  order their rng draws happen in; swapping it for ctx.all() would reproduce
   *  every hit and desynchronise every drop.
   *
   *  THE SHOVE IS RAW — no buildMods.knockbackMul. See the file header. */
  private damageCone(
    ctx: WeaponContext,
    x: number,
    y: number,
    angle: number,
    halfArc: number,
    reach: number,
    damage: number,
  ): void {
    for (const e of ctx.near(x, y, reach + HASH_QUERY_PAD)) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      // Reach is measured to the body's EDGE, so a big enemy is caught by its
      // own radius while a swarmer at the same centre distance is not.
      if (d > reach + e.radius) continue;
      if (d < CLAP_STATS.pointBlankRadius) {
        this.hitCone(ctx, e, x, y, damage);
        continue;
      }
      let diff = Math.atan2(dy, dx) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= halfArc) this.hitCone(ctx, e, x, y, damage);
    }
  }

  /** One cone hit: damage, then the knock, pushed away from the SWING ORIGIN
   *  (the player) rather than from the body. Both branches above resolve
   *  identically once they have decided to connect, and they always did — this
   *  is the two-line tail they shared, named rather than duplicated. */
  private hitCone(ctx: WeaponContext, e: WeaponTarget, x: number, y: number, damage: number): void {
    ctx.damage(e, damage);
    // The `if (shove)` guard is verbatim: 12 is truthy today, so this always
    // fires, and a shove of 0 would be no knock at all rather than a zero-length
    // one that still refreshes the shared knock timer.
    if (CLAP_STATS.shove) ctx.shove(e, x, y, CLAP_STATS.shove);
  }

  private fireTwoHands(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    // `conf.damage` already carries powerMul, antonioMight and damageMul from
    // the world's build transform. This multiplier stacks ON TOP; it is not a
    // re-application of any of that.
    const damage = conf.damage * CLAP_STATS.damageMul;
    // Two Hands emits a countable thing, so Double Take adds pincers: one more
    // hand per level, each on its own target. nearestEnemies makes no rng draw,
    // so the per-trigger draw count is unchanged at every Double Take level.
    const targets = ctx.nearestEnemies(
      AIM_RANGE,
      CLAP_STATS.targets + ctx.buildMods.extraProjectiles,
    );
    if (targets.length === 0) {
      // Nothing in reach: still clap, just ahead of the player, so the beat
      // reads on screen and an empty field does not eat the trigger.
      const aim = ctx.aimDir(0);
      this.spawnPinch(ctx, p.x + aim.x * CLAP_STATS.openGap, p.y + aim.y * CLAP_STATS.openGap,
        Math.atan2(aim.y, aim.x), damage);
      return;
    }
    // NEAREST FIRST, which is the order nearestEnemies returns and therefore the
    // order these pincers enter the array. tick() then walks that array
    // BACKWARDS — see its note; the two orders are opposite and that is
    // behavioral the moment anything dies.
    for (const target of targets) {
      this.spawnPinch(ctx, target.x, target.y, Math.atan2(target.y - p.y, target.x - p.x), damage);
    }
  }

  /** Queue one pincer centred on (x, y), its slabs standing off along `angle`.
   *
   *  THE CENTRE IS A POINT, NOT A BODY. A pincer aimed at an enemy freezes that
   *  enemy's position at fire time and crushes THERE eight frames later,
   *  wherever the enemy has walked to since. It does not track. */
  private spawnPinch(ctx: WeaponContext, x: number, y: number, angle: number, damage: number): void {
    const area = ctx.buildMods.areaMul;
    const pinch: ClapPinch = {
      x,
      y,
      angle,
      closesAt: ctx.timeS + CLAP_STATS.closeS,
      closeS: CLAP_STATS.closeS,
      gap: CLAP_STATS.openGap * area,
      radius: CLAP_STATS.pinchRadius * area,
      damage,
      color: ctx.color,
      midShown: false,
    };
    this.pinches.push(pinch);
    // Fully open, on the frame it is created.
    this.drawPinchHands(ctx, pinch, 1);
  }

  /** The two slabs, drawn as short bars broadside to the pinch axis at `t` of
   *  their standoff (1 = fully open, 0 = met). View only: this pushes fx and
   *  touches no body. */
  private drawPinchHands(ctx: WeaponContext, pinch: ClapPinch, t: number): void {
    const ax = Math.cos(pinch.angle);
    const ay = Math.sin(pinch.angle);
    const half = pinch.radius * CLAP_STATS.handHalfLengthMul;
    for (const side of [-1, 1] as const) {
      const cx = pinch.x + ax * pinch.gap * t * side;
      const cy = pinch.y + ay * pinch.gap * t * side;
      // Broadside: the bar runs along the axis' perpendicular (ay, -ax).
      ctx.fx({
        type: 'beam',
        x: cx + ay * half,
        y: cy - ax * half,
        x2: cx - ay * half,
        y2: cy + ax * half,
        width: CLAP_STATS.handWidth,
        color: pinch.color,
      });
    }
  }

  tick(ctx: WeaponContext, _dt: number): void {
    for (let i = this.pinches.length - 1; i >= 0; i--) {
      const pinch = this.pinches[i];
      if (pinch.closesAt > ctx.timeS) {
        if (!pinch.midShown &&
          pinch.closesAt - ctx.timeS <= pinch.closeS * CLAP_STATS.handMidFraction) {
          pinch.midShown = true;
          this.drawPinchHands(ctx, pinch, CLAP_STATS.handMidT);
        }
        continue;
      }
      // The crush itself: NO SHOVE AND NO TUG. Two Hands moves nothing — it is
      // pure damage at a fixed point, and bodies caught in it stand exactly where
      // they were. The absence is the tuning, not an oversight.
      this.crush(ctx, pinch);
      ctx.fx({ type: 'slam', x: pinch.x, y: pinch.y, radius: pinch.radius, color: pinch.color });
      ctx.fx({
        type: 'spark',
        x: pinch.x,
        y: pinch.y,
        color: pinch.color,
        n: CLAP_STATS.sparkCount,
        spread: pinch.radius * CLAP_STATS.sparkSpreadMul,
      });
      this.pinches.splice(i, 1);
    }
  }

  /** Damage everything the closed hands overlap. WAS
   *  `this.damageArea(pinch.x, pinch.y, pinch.radius, pinch.damage, 'clap', 0)`,
   *  whose only remaining caller this was — the world's generic area helper went
   *  with it. Resolved with circlesOverlap, so the real contact distance is the
   *  pinch radius PLUS the body's own. */
  private crush(ctx: WeaponContext, pinch: ClapPinch): void {
    const area = { x: pinch.x, y: pinch.y, radius: pinch.radius };
    for (const e of ctx.near(pinch.x, pinch.y, pinch.radius + HASH_QUERY_PAD)) {
      if (!e.dead && circlesOverlap(area, e)) ctx.damage(e, pinch.damage);
    }
  }

  /** Drop every pincer in flight. WAS `this.clapPinches.length = 0` in
   *  RunWorld.clearSandboxEntities, whose contract promises "No delayed
   *  strike/pickup pointer survives" — a scheduled crush is exactly such a
   *  pointer. Draws no rng and pushes no fx, so a pincer dropped this way lands
   *  neither its damage nor its slam. */
  reset(): void {
    this.pinches.length = 0;
  }

  // No `projectile` behavior, deliberately. See the file header: this weapon is
  // melee and nothing it makes ever enters the shared projectile loop.
}

export const CLAP = {
  role: 'clap',
  stats: CLAP_STATS,
  // The 'pinches' phase: immediately after the strikes and before the shared
  // projectile loop — exactly where RunWorld.updateClapPinches stood. The name
  // was reserved for this weapon when TICK_PHASES was written (#139).
  tickAt: 'pinches',
  create: () => new ClapInstance(),
} satisfies WeaponModule;
