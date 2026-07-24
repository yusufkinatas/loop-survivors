import { AIM_RANGE, type WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type {
  ProjectileBehavior,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

/** The lead's tuning. The lead is CHAIN LIGHTNING: a bolt that zaps one enemy,
 *  then leaps to the nearest one it has not touched, arcing through a whole
 *  cluster before it dies. Nothing here is a bare literal at the spawn site or
 *  in the shared loop's spark push. */
interface LeadStats extends WeaponStats {
  // ---------------- the chaining bolt --------------------------------------

  /** Aim jitter, radians. One aim per TRIGGER — Double Take fans the extra
   *  bolts off that single aim, so the draw count is per trigger, not per
   *  shot. */
  readonly aimSpread: number;
  /** TRUE, and it is what makes the chain a chain: the shared loop's homing
   *  path re-picks the nearest enemy NOT already in the shot's hit set every
   *  frame, so once a bolt hits a body and adds it to that set, it curves
   *  toward the next one on its own. WAS `homing: role === 'lead'` inside
   *  RunWorld.baseProjectile; it is a field on the shot now and the loop just
   *  reads a boolean. */
  readonly homing: boolean;
  /** How fast a bolt may turn, radians per second, clamped per step by the
   *  shared loop. Hard enough that the bolt SNAPS to the next link instead of
   *  arcing lazily around it — the whip-crack of a chain jump. */
  readonly turnRate: number;
  /** THE CHAIN RANGE: how far a bolt will leap to its next link, world units.
   *  Assigned to the shot's `homingRange`, which is both the search radius the
   *  homing loop steers by and the radius onHit hunts the next link in. Finite
   *  and deliberately local — chain lightning arcs through the crowd around it,
   *  it does not snipe a lone body across the arena (that is the snare's job).
   *  The initial bolt still reaches a distant first target because fire() aims
   *  its velocity there; homing/chaining takes over once a body is in range. */
  readonly chainRange: number;
  /** Drawn width of the arc between two links. */
  readonly chainBeamWidth: number;
  /** The per-hit spark, view-only. WAS this weapon's membership of run.ts's
   *  SPARK_HIT_ROLES plus the `n: 4, spread: 12` literals at the push site
   *  inside the shared projectile loop. */
  readonly sparkCount: number;
  readonly sparkSpread: number;

  // ---------------- Neon Serpent -------------------------------------------
  //
  // The evolution is the chain taken to its extreme: a long-lived serpent that
  // threads a deep file of bodies, leaping harder and further and growing a
  // giant head every fifth trigger. Same onHit chain, bigger budget.

  /** Serpent damage relative to the already-built tier damage. */
  readonly serpentDamageMul: number;
  /** ONE TERM OF A CONSTANT SUM, NOT A FLOOR (#146). It goes THROUGH the
   *  build's +pierce rule rather than over the top of it, so the serpent's
   *  chain length is `serpentBasePierce + extraPierce`.
   *
   *  Since #227 the gate is the partner item merely OWNED, so the serpent's
   *  chain is a real 6-to-11 ladder the player climbs with Needle Tips 1
   *  through 5 — which is the point of routing the 6 through the pipeline
   *  rather than over it. Change the 6 and you move that whole range.
   *
   *  It must never be written straight onto the shot AFTER the pipeline has
   *  run: that made Needle Tips a no-op on the very evolution it unlocks. A
   *  signature number is an INPUT to the build pipeline, never a write over its
   *  output. */
  readonly serpentBasePierce: number;
  /** How fast the serpent may turn. Harder than the base bolt: it snaps onto
   *  the next body in the file the instant it lands. */
  readonly serpentTurnRate: number;
  /** The serpent's chain range, world units. Longer than the base bolt's — it
   *  threads a wider file. A FIELD on the shot (homingRange), never a role test
   *  in the shared loop. */
  readonly serpentChainRange: number;

  // ---------------- the giant head -----------------------------------------

  /** Every Nth trigger the serpent fires one oversized, double-damage bolt.
   *  RunWorld.fireTrigger increments the role's trigger count BEFORE fire(),
   *  and the counter is WORLD-OWNED and never resets — it keeps ticking while
   *  the weapon is still unevolved — so `ctx.triggerCount % 5 === 0` is true on
   *  the FIFTH trigger of the RUN, not the fifth after evolving. A module-local
   *  tally would put the giant head on a different beat. */
  readonly superchargeCadence: number;
  /** Damage multiplier on a supercharged bolt, on top of serpentDamageMul. */
  readonly superchargeDamageMul: number;
  /** Its radius is `max(superchargeRadiusFloor, radius * superchargeRadiusMul)`
   *  and BOTH HALVES ARE LIVE. At level 8 with no area build the floor bites
   *  (7 * 1.7 = 11.9, so 12 wins); with Wide Lens it does not (9.1 * 1.7 =
   *  15.47). Drop either half and one of the two real builds still looks
   *  correct. */
  readonly superchargeRadiusFloor: number;
  readonly superchargeRadiusMul: number;
}

const LEAD_STATS: LeadStats = {
  // Chain lightning: a bolt that leaps between enemies, arcing through a cluster
  // one link at a time. Mid damage per link, but the chain LENGTH (pierce) is
  // the ladder — a maxed bolt threads six bodies a trigger, more with Needle
  // Tips. Faster and snappier than the old lazy seeker so each jump reads as a
  // whip-crack.
  tiers: [
    { damage: 4, speed: 420, radius: 6, lifetimeS: 2.2, pierce: 3 },
    { damage: 4, speed: 440, radius: 6, lifetimeS: 2.2, pierce: 3 },
    { damage: 5, speed: 440, radius: 6, lifetimeS: 2.2, pierce: 4 },
    { damage: 5, speed: 460, radius: 6, lifetimeS: 2.3, pierce: 4 },
    { damage: 6, speed: 460, radius: 7, lifetimeS: 2.3, pierce: 5 },
    { damage: 6, speed: 480, radius: 7, lifetimeS: 2.3, pierce: 5 },
    { damage: 7, speed: 480, radius: 7, lifetimeS: 2.3, pierce: 6 },
    { damage: 8, speed: 500, radius: 7, lifetimeS: 2.4, pierce: 6 },
  ],
  tierLines: [
    'a bolt that leaps between enemies',
    'faster bolt',
    'damage up, chains 1 more',
    'faster bolt',
    'damage up, bigger, chains 1 more',
    'faster bolt',
    'damage up, chains 1 more',
    'maximum damage, fastest',
  ],

  aimSpread: 0.08,
  homing: true,
  turnRate: 16,
  chainRange: 260,
  chainBeamWidth: 3,
  sparkCount: 4,
  sparkSpread: 12,

  serpentDamageMul: 1.40,
  serpentBasePierce: 6,
  serpentTurnRate: 18,
  serpentChainRange: 320,

  superchargeCadence: 5,
  superchargeDamageMul: 2,
  superchargeRadiusFloor: 12,
  superchargeRadiusMul: 1.7,
};

/** What a chaining bolt lends the SHARED projectile loop.
 *
 *  NO steer(). A bolt rides shared travel and the shared homing path: its
 *  chasing is the loop's own `pr.homing` branch, fed by the fields armSeeker()
 *  sets below. Returning TRUE from a steer() would skip shared travel AND the
 *  homing search together, which is exactly the search the chain relies on.
 *
 *  onHit is where the leap lives. It runs after the loop deals pr.damage and
 *  BEFORE the shared pierce rule spends a hop, so the search below sees the
 *  just-hit body already in pr.hit and never re-picks it. */
const SEEKER_BEHAVIOR: ProjectileBehavior = {
  onHit(ctx: WeaponContext, pr: Projectile, target: WeaponTarget): boolean {
    // Per-hit spark at the struck body (view-only).
    ctx.fx({
      type: 'spark',
      x: target.x,
      y: target.y,
      color: pr.color,
      n: LEAD_STATS.sparkCount,
      spread: LEAD_STATS.sparkSpread,
    });
    // The leap: find the nearest body this bolt has NOT touched, inside its own
    // chain range, lock onto it so the bolt curves there, and draw the arc so
    // the drawn jump matches where the bolt actually goes. BODIES ONLY — a
    // Stage Light is never a chain link (it has `prop`), so the crowd's shape
    // decides the chain, not the scenery in it. The homing loop finds the same
    // body on its own next frame; the lock only pins the visual to the truth.
    let next: WeaponTarget | null = null;
    let bestD = pr.homingRange * pr.homingRange;
    for (const body of ctx.near(target.x, target.y, pr.homingRange)) {
      if (body.dead || body.prop || pr.hit.has(body)) continue;
      const dx = body.x - target.x;
      const dy = body.y - target.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        next = body;
      }
    }
    if (next) {
      ctx.lockSeeker(pr, next);
      ctx.fx({
        type: 'beam',
        x: target.x,
        y: target.y,
        x2: next.x,
        y2: next.y,
        width: LEAD_STATS.chainBeamWidth,
        color: pr.color,
      });
    }
    // Each link spends one hop of the pierce budget — the chain LENGTH is the
    // pierce ladder. Returning true is today's shared pierce rule, stated aloud.
    return true;
  },
};

/** Arm one freshly spawned shot as a chaining bolt. THREE FIELDS, not a branch:
 *  the shared loop asks the SHOT whether it homes, how hard it may turn and how
 *  far it may leap, and never asks which weapon fired it.
 *
 *  All three are set unconditionally in base form first and then overwritten by
 *  the evolved block, rather than being left to RunWorld.baseProjectile's
 *  defaults — a weapon module's own tuning must not arrive as somebody else's
 *  default. */
function armSeeker(pr: Projectile): void {
  pr.homing = LEAD_STATS.homing;
  pr.turnRate = LEAD_STATS.turnRate;
  pr.homingRange = LEAD_STATS.chainRange;
}

class LeadInstance implements WeaponInstance {
  readonly projectile = SEEKER_BEHAVIOR;

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    // One bolt per trigger; Double Take fans extra bolts around the same aim
    // line, from a SINGLE aim — one rng draw per trigger however many shots
    // come out of it.
    const supercharged =
      ctx.evolved && ctx.triggerCount % LEAD_STATS.superchargeCadence === 0;
    const dirs = ctx.aimFan(LEAD_STATS.aimSpread);
    // A fanned volley spawns from one point a few degrees apart, so every bolt
    // would otherwise pick the same nearest body and converge into one
    // overlapping blob — Double Take became damage you could not see or aim
    // (#131). Give each bolt its own FIRST link instead, so the volley opens
    // across the crowd before each bolt chains from there. nearestEnemies draws
    // no rng, so the per-trigger draw count is still exactly the one aimFan
    // spends.
    //
    // A one-bolt volley is deliberately left unlocked: with nothing to spread
    // it keeps chasing the closest body exactly as before.
    const locks: readonly (WeaponTarget | undefined)[] =
      dirs.length > 1 ? ctx.nearestEnemies(AIM_RANGE, dirs.length) : [];
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i];
      const pr = ctx.spawnProjectile(conf, conf.damage);
      armSeeker(pr);
      // Fewer bodies than bolts: the surplus falls back to nearest-chasing.
      ctx.lockSeeker(pr, locks[i] ?? null);
      if (ctx.evolved) {
        pr.damage *= LEAD_STATS.serpentDamageMul;
        // The serpent threads a deep file: its own base chain length replaces
        // the tier's pierce value, and the build's +pierce stacks on top of it
        // exactly as it would for any other finite pierce (#146). Same
        // arithmetic RunWorld.applyBuild runs on a tier's pierce, applied to
        // the evolution's signature number instead.
        pr.maxPierce = LEAD_STATS.serpentBasePierce + ctx.buildMods.extraPierce;
        pr.pierce = pr.maxPierce;
        pr.turnRate = LEAD_STATS.serpentTurnRate;
        pr.homingRange = LEAD_STATS.serpentChainRange;
        if (supercharged) {
          pr.damage *= LEAD_STATS.superchargeDamageMul;
          pr.radius = Math.max(
            LEAD_STATS.superchargeRadiusFloor,
            pr.radius * LEAD_STATS.superchargeRadiusMul,
          );
        }
      }
      // Deriving the velocity from pr.speed keeps the `speed` field equal to
      // |v|, which the bounce path reads.
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
    }
  }

  /** Nothing to drop: every bolt this module makes lives in the world's
   *  projectile array, which clearSandboxEntities empties itself. The module
   *  holds no schedule, no counter and no pointer of its own — the supercharge
   *  cadence reads the WORLD's trigger counter through ctx. */
  reset(): void {}
}

export const LEAD = {
  role: 'lead',
  stats: LEAD_STATS,
  // No tickAt: the lead owns no damage pass of its own. Its bolts ride the
  // world's shared projectile loop, including the homing search the chain
  // steers by.
  create: () => new LeadInstance(),
} satisfies WeaponModule;
