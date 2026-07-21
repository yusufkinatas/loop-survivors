// The Clap weapon module: a wide forward slash that hits everything in a close
// cone, and its evolution, Two Hands, where each trigger picks the closest few
// enemies and snaps a pair of slabs shut on each one. Base and evolved live in
// the same module; evolving flips an internal mode (ctx.evolved).
//
// THE CLAP IS MELEE. It spawns no projectile of any kind — the base mode
// resolves a cone synchronously inside fire(), and the evolution schedules
// pincers that resolve in this module's own tick(). So there is NO
// ProjectileBehavior here at all, deliberately: steer() and onHit() are hooks
// the SHARED PROJECTILE LOOP calls, and nothing this weapon makes ever enters
// that loop. Adding an empty one would advertise a relationship that does not
// exist.
//
// THE PINCH STATE MACHINE IS PER-RUN STATE AND IT LIVES ON THE INSTANCE. A
// pincer spawns open at fire time, shows a halfway visual once, and only lands
// its damage when the hands meet `closeS` later — so between those two moments
// the weapon is carrying live state. `ClapPinch[]` is a private field of
// ClapInstance for the reason module.ts states: systems-check builds many
// RunWorlds in one process, and a queue parked on the module singleton would
// leak pincers from one world into the next, making order-dependent checks that
// pass alone and fail in a suite.
//
// ROLE-KEYED TABLES: WEAPON_SHOVE IS GONE. The clap's 12 was its last entry, so
// the table, its import, BOTH of its read sites in run.ts and its
// INTERIM_EXCEPTIONS entry in systems-check all left with this module. The 12 is
// CLAP_STATS.shove now, applied from this file.
//
// THE CONE'S SHOVE IS RAW, AND THE TUG IS NOT. `WEAPON_SHOVE.clap` reached
// RunWorld.damageCone UNMULTIPLIED — the call site passed the table value
// straight in — while the shared projectile loop's own copy of that lookup
// scaled by buildMods.knockbackMul. Two weapons' worth of that lookup left
// scaled (the snare's, the bass's); the clap's cone left raw, because that is
// what it did. The evolved tug DOES scale. The parity baseline pins each side
// with its own row, so "tidying" the two into agreement fails immediately. It is
// ported verbatim and flagged as a latent oddity, not fixed here.

import { AIM_RANGE, type WeaponConf } from '../config';
import { circlesOverlap } from '../spatial';
import type { WeaponContext, WeaponTarget } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

/** How much wider than the shape the spatial-hash query goes before the exact
 *  distance test decides. NOT TUNING, and deliberately not a stat: it is a copy
 *  of the `+ 24` widening RunWorld.damageCone, damageArea and dragInward each
 *  did on their query, and it is arithmetically unobservable — SpatialHash.query
 *  already widens by the largest inserted radius, and every candidate it returns
 *  is cut again by the real reach test below. Nothing about the clap's footprint
 *  is decided here. */
const HASH_QUERY_PAD = 24;

/** The clap's tuning. Every number below was either a rung of
 *  config.WEAPONS.clap, config.WEAPON_SHOVE.clap, a field of config.TWO_HANDS,
 *  or a bare literal in run.ts's `case 'clap'` / damageCone / fireTwoHands /
 *  spawnPinch / drawPinchHands / updateClapPinches; values are unchanged.
 *  Nothing in the behavior code below may be a bare literal. */
export interface ClapStats extends WeaponStats {
  // ---------------- the base cone ------------------------------------------

  /** Knock distance on a cone hit, in units. WAS config.WEAPON_SHOVE.clap, the
   *  last entry in that table.
   *
   *  APPLIED RAW. The cone's call site passed the table value straight through
   *  without buildMods.knockbackMul, unlike the shared projectile loop's copy of
   *  the same lookup and unlike this weapon's own evolved `tug` below. See the
   *  file header: that asymmetry is behavior, it is pinned on both sides by the
   *  parity baseline, and it is preserved rather than reconciled. */
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
  // is high single-target damage plus an inward tug that bunches the horde up
  // for the rest of the band, NOT another player-centred blast (that is what
  // Subquake is for). Keep `pinchRadius` well under Subquake's 288-unit ring.

  /** How many nearby enemies get their own pincer on a single trigger. WAS
   *  TWO_HANDS.targets. */
  readonly targets: number;
  /** Seconds the two slabs take to travel from open to shut. WAS
   *  TWO_HANDS.closeS.
   *
   *  PINNED AS A LITERAL IN systems-check, and it has to be. Every scheduled
   *  moment this weapon has is observed only on the frame that crosses it, so
   *  0.12 and 0.13 both land on frame 8 and the parity baseline cannot tell them
   *  apart; 0.11 and 0.14 it can. The sub-frame residue is covered by the
   *  literal pin and by nothing else. */
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
  /** Radius over which survivors get dragged toward the pinch point. WAS
   *  TWO_HANDS.tugRadius. A bare CENTRE-DISTANCE compare, not circlesOverlap —
   *  the crush and the tug resolve at different geometric gates and that
   *  difference is real. */
  readonly tugRadius: number;
  /** How far survivors are dragged inward. WAS TWO_HANDS.tug. Scaled by
   *  buildMods.knockbackMul at the call site, and then CLAMPED to the body's own
   *  distance from the pinch centre, so a body sitting on the centre is dragged
   *  by that tiny distance and Heavy Amp does nothing to it at all. */
  readonly tug: number;

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

export const CLAP_STATS: ClapStats = {
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
  tugRadius: 96,
  tug: 30,

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
    // Whip: a wide forward slash in the aim direction, hitting a cone.
    //
    // `aimDir(0)` and NOT `nearestEnemy(...)`: the zero spread means the jitter
    // adds nothing to the angle, but the DRAW still happens — once with a target
    // on screen, twice with an empty one. That draw count is part of the run's
    // identity and the parity harness counts it, so the tidier-looking spelling
    // is a behavior change.
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

  /** Two Hands: each trigger picks the closest few enemies and snaps a slab pair
   *  shut on each of them. Target-picked and tiny on purpose — the base weapon's
   *  cone is short-ranged, and the roster already has three player-centred
   *  blasts (Subquake, Redline Stomp, Afterhours). The inward tug on the crush is
   *  the point: it bunches the horde for the rest of the band.
   *
   *  RNG: ZERO DRAWS with anything in range — `nearestEnemies` looks without
   *  jittering — and TWO on an empty field, where the empty-field branch below
   *  calls aimDir. The base cone always draws. So the evolution does not merely
   *  change what a trigger does, it changes what a trigger COSTS the run stream,
   *  and both shapes are pinned in the parity baseline. */
  private fireTwoHands(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    // `conf.damage` already carries powerMul, antonioMight and damageMul from
    // the world's build transform. This multiplier stacks ON TOP; it is not a
    // re-application of any of that.
    const damage = conf.damage * CLAP_STATS.damageMul;
    const targets = ctx.nearestEnemies(AIM_RANGE, CLAP_STATS.targets);
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

  /** Advance every pincer in flight. This IS RunWorld.updateClapPinches, moved
   *  verbatim; the world no longer has a pinch loop, a pinch array or a pinch
   *  type.
   *
   *  IT IGNORES `dt` AND READS THE ABSOLUTE CLOCK. A pincer is scheduled against
   *  ctx.timeS, like the kick's follow-up strip, so it lands on the first frame
   *  that crosses `closesAt` however the step is sized.
   *
   *  IT WALKS THE ARRAY BACKWARDS, so pincers resolve LAST-SPAWNED-FIRST — the
   *  reverse of the nearest-first order fireTwoHands handed out. The immediate
   *  reason is the splice, but the order is behavior in its own right: three
   *  pincers from one trigger close on the same frame, and where their crushes
   *  overlap a body with little hp left, the walk direction decides which pinch
   *  is credited with the kill, which drop is rolled first, and where in the fx
   *  stream it lands. One parity scenario exists entirely for this. */
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
      // The crush itself: no shove, because the whole move pulls inward. The
      // absence is the tuning — granting the crush a knock would fight the tug
      // that follows it one line later.
      this.crush(ctx, pinch);
      this.dragInward(ctx, pinch.x, pinch.y, CLAP_STATS.tugRadius * ctx.buildMods.areaMul,
        CLAP_STATS.tug * ctx.buildMods.knockbackMul);
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

  /** Drag every enemy within `radius` toward (x, y) by up to `dist`. Runs through
   *  ctx.shove with the origin MIRRORED THROUGH THE ENEMY, so knockback
   *  resistance and the Drop lift apply exactly as they do on a push and a
   *  knock-immune body is immune to the tug too. WAS RunWorld.dragInward.
   *
   *  A SECOND ctx.near() call, after the crush's. Deliberate: near() hands back
   *  a scratch buffer the crush above has already consumed, the two passes were
   *  two separate queries in the original, and the sets genuinely differ — a body
   *  the crush just killed is skipped here.
   *
   *  `Math.min(dist, d)` IS A CLAMP WITH REAL CONSEQUENCES. A body sitting on the
   *  pinch centre is dragged by its own tiny distance, not by `tug`, so Heavy
   *  Amp's knockbackMul — already folded into `dist` by the caller — has no
   *  effect on it at all. The `d < 1` skip is what keeps a body exactly on the
   *  centre from being shoved along an undefined direction. */
  private dragInward(ctx: WeaponContext, x: number, y: number, radius: number, dist: number): void {
    if (dist <= 0) return;
    for (const e of ctx.near(x, y, radius + HASH_QUERY_PAD)) {
      if (e.dead) continue;
      // A bare CENTRE-DISTANCE compare, unlike the crush's circlesOverlap: the
      // tug does not reach a body by its radius.
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius || d < 1) continue;
      ctx.shove(e, 2 * e.x - x, 2 * e.y - y, Math.min(dist, d));
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
