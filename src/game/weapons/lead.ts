// The Lead weapon module: homing seekers, one per melody note, and its
// evolution, Neon Serpent, a harder-turning seeker that threads a line of
// bodies and supercharges every fifth trigger. Base and evolved live in the
// same module; evolving flips an internal mode (ctx.evolved).
//
// THE LEAD IS THE WEAPON WHOSE BEHAVIOR WAS MOST SPREAD OUT. Nothing about it
// lived in one function:
//
//   - `homing: role === 'lead'` was a role test inside baseProjectile, the
//     world's shared defaulting for EVERY weapon's shot;
//   - `turnRate` and `homingRange` came off that same defaulting as 10 and
//     Infinity, unnamed, and the evolution overwrote them at the spawn site;
//   - the per-hit spark came from `SPARK_HIT_ROLES.has(pr.role)` inside the
//     shared projectile loop, a role-keyed Set this weapon was the last member
//     of. It is GONE — the Set, its lookup, and its INTERIM_EXCEPTIONS entry
//     left with this commit, exactly as the snare's share left before it.
//
// WHAT THIS MODULE DOES NOT IMPLEMENT IS THE POINT. There is no steer(). The
// homing search, the turn clamp and the travel that follows it are SHARED
// physics, driven entirely by three FIELDS this module sets at spawn — `homing`,
// `turnRate`, `homingRange`. That is route 2 of the #140 rule ("anything else a
// shot needs is a field on the shot, set by its own spawner"), and implementing
// steer() here would silently take a seeker off shared travel AND off
// reflectProjectileFromArena together, deleting Mirrorball's bounces for this
// weapon alone.

import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type {
  ProjectileBehavior,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

/** The lead's tuning. Every number below was either a rung of
 *  config.WEAPONS.lead, the whole of config.LEAD_SERPENT, a default inside
 *  RunWorld.baseProjectile that only a lead shot could observe, or a bare
 *  literal at the spawn site / inside the shared loop's spark push; values are
 *  unchanged. Nothing in the behavior code may be a bare literal. */
export interface LeadStats extends WeaponStats {
  // ---------------- the base seeker ----------------------------------------

  /** Aim jitter, radians. One aim per TRIGGER — Double Take fans the extra
   *  seekers off that single aim, so the draw count is per trigger, not per
   *  shot. */
  readonly aimSpread: number;
  /** TRUE, and it is the whole reason this weapon exists: a lead shot steers
   *  toward what it can see instead of flying straight. WAS
   *  `homing: role === 'lead'` inside RunWorld.baseProjectile — a per-weapon
   *  test in the world's shared defaulting. It is a field on the shot now, set
   *  here, and the shared loop just reads a boolean. */
  readonly homing: boolean;
  /** How fast a base seeker may turn, radians per second, clamped per step by
   *  the shared loop. WAS the unnamed `turnRate: 10` default in
   *  baseProjectile, observable only through this weapon. */
  readonly turnRate: number;
  /** How far a base seeker will look for a target. INFINITY means the whole
   *  screen: the base lead's search is unrestricted, and that is a stated
   *  value, not an absent one — Neon Serpent's whole change of character is
   *  replacing it with a finite gate. */
  readonly homingRange: number;
  /** The per-hit spark, view-only. WAS this weapon's membership of run.ts's
   *  SPARK_HIT_ROLES plus the `n: 4, spread: 12` literals at the push site
   *  inside the shared projectile loop. Lead was the LAST member, so the Set
   *  itself is gone. */
  readonly sparkCount: number;
  readonly sparkSpread: number;

  // ---------------- Neon Serpent -------------------------------------------

  /** Serpent damage relative to the already-built tier damage. */
  readonly serpentDamageMul: number;
  /** ONE TERM OF A CONSTANT SUM, NOT A FLOOR (#146). It goes THROUGH the
   *  build's +pierce rule rather than over the top of it, so evolved pierce is
   *  `serpentBasePierce + extraPierce`.
   *
   *  In practice that sum is INVARIANTLY 11. `eligibleEvolution` (items.ts)
   *  gates every evolution on its partner item being at ITEM_MAX_LEVEL, and
   *  Needle Tips caps at 5, so a Neon Serpent can only ever exist alongside
   *  `extraPierce: 5`. There is no ladder from 6 to 11 for a player to climb
   *  and no build that observes any value in between. Change the 6 and you are
   *  changing 11.
   *
   *  It used to be written straight onto the shot AFTER the pipeline had run,
   *  which made Needle Tips a no-op on the very evolution it unlocks. That is
   *  the shape to never restore: a signature number is an INPUT to the build
   *  pipeline, never a write over its output. */
  readonly serpentBasePierce: number;
  /** How fast a serpent may turn. Harder than base: it snaps onto the next
   *  body in the file instead of arcing around it. */
  readonly serpentTurnRate: number;
  /** The serpent's finite search gate, world units. This is the character
   *  change: it snaps to what is CLOSE instead of crossing the screen. A FIELD
   *  on the shot, never a role test in the shared loop — that is how it left
   *  the loop in #140 and it must stay a field. */
  readonly serpentHomingRange: number;

  // ---------------- the supercharged shot ----------------------------------

  /** Every Nth trigger the serpent fires one oversized, double-damage seeker.
   *  RunWorld.fireTrigger increments the role's trigger count BEFORE fire(),
   *  and the counter is WORLD-OWNED and never resets — it keeps ticking while
   *  the weapon is still unevolved — so `ctx.triggerCount % 5 === 0` is true on
   *  the FIFTH trigger of the RUN, not the fifth after evolving. A module-local
   *  tally would put the doubled shot on a different beat. */
  readonly superchargeCadence: number;
  /** Damage multiplier on a supercharged shot, on top of serpentDamageMul. */
  readonly superchargeDamageMul: number;
  /** Its radius is `max(superchargeRadiusFloor, radius * superchargeRadiusMul)`
   *  and BOTH HALVES ARE LIVE — this is not an unreachable floor like the
   *  snare's. At tier 4 with no area build the floor bites (7 * 1.7 = 11.9, so
   *  12 wins); with Wide Lens it does not (9.1 * 1.7 = 15.47). Drop either half
   *  and one of the two real builds still looks correct. */
  readonly superchargeRadiusFloor: number;
  readonly superchargeRadiusMul: number;
}

export const LEAD_STATS: LeadStats = {
  // Homing seeker per melody note: mid damage, never misses. The ladder is a
  // density ladder first — the chart thickens — with pierce arriving only at
  // the top rung.
  tiers: [
    { damage: 2, speed: 340, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 3, speed: 350, radius: 6, lifetimeS: 2.2, pierce: 1 },
    { damage: 3, speed: 360, radius: 6, lifetimeS: 2.3, pierce: 1 },
    { damage: 4, speed: 380, radius: 7, lifetimeS: 2.4, pierce: 2 },
  ],
  tierLines: [
    'a few homing seekers',
    'more seekers',
    'the full melody of seekers',
    'denser seekers that pierce',
  ],

  aimSpread: 0.08,
  homing: true,
  turnRate: 10,
  homingRange: Infinity,
  sparkCount: 4,
  sparkSpread: 12,

  serpentDamageMul: 1.40,
  serpentBasePierce: 6,
  serpentTurnRate: 14,
  serpentHomingRange: 320,

  superchargeCadence: 5,
  superchargeDamageMul: 2,
  superchargeRadiusFloor: 12,
  superchargeRadiusMul: 1.7,
};

/** What a seeker lends the SHARED projectile loop.
 *
 *  NO steer(). A lead shot rides shared travel and the arena rails: its homing
 *  is the loop's own `pr.homing` path, fed by the three fields armSeeker() sets
 *  below. Implementing steer() — even one that returns false — is not the same
 *  thing as omitting it only in the sense that the return value is what matters;
 *  returning TRUE would skip shared travel AND reflectProjectileFromArena
 *  together, which without Mirrorball is invisible in almost every scenario
 *  because `bounces` is 0 and the rail path returns immediately.
 *
 *  onHit is the whole of it, and it is where this weapon's share of
 *  SPARK_HIT_ROLES landed. It runs after the loop deals pr.damage and before
 *  the shared pierce rule — the exact slot the Set lookup occupied, with
 *  nothing observable in between for a lead shot (the shatter branch above it
 *  is bell-only, and `pr.shatter` is 0 on every seeker). */
const SEEKER_BEHAVIOR: ProjectileBehavior = {
  onHit(ctx: WeaponContext, pr: Projectile, target: WeaponTarget): boolean {
    // Per-hit spark (view-only). The old push was additionally gated on
    // `!pr.shard`; a seeker is never a shard — only a bell shatter makes those
    // — so the gate had no lead-side meaning and left with the Set.
    ctx.fx({
      type: 'spark',
      x: target.x,
      y: target.y,
      color: pr.color,
      n: LEAD_STATS.sparkCount,
      spread: LEAD_STATS.sparkSpread,
    });
    // A seeker spends pierce like every other projectile; only the arp is
    // exempt (ADR-0002). Returning true is today's shared rule, stated aloud.
    return true;
  },
};

/** Arm one freshly spawned shot as a seeker. THREE FIELDS, not a branch: the
 *  shared loop asks the SHOT whether it homes, how hard it may turn and how far
 *  it may look, and never asks which weapon fired it.
 *
 *  All three are set unconditionally in base form first and then overwritten by
 *  the evolved block, rather than being left to RunWorld.baseProjectile's
 *  defaults. The defaults happened to carry two of these numbers (10 and
 *  Infinity) and a role test carried the third; a weapon module's own tuning
 *  must not arrive as somebody else's default. */
function armSeeker(pr: Projectile): void {
  pr.homing = LEAD_STATS.homing;
  pr.turnRate = LEAD_STATS.turnRate;
  pr.homingRange = LEAD_STATS.homingRange;
}

class LeadInstance implements WeaponInstance {
  readonly projectile = SEEKER_BEHAVIOR;

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    // One seeker per trigger; Double Take fans extra seekers around the same
    // aim line, from a SINGLE aim — one rng draw per trigger however many
    // shots come out of it.
    const supercharged =
      ctx.evolved && ctx.triggerCount % LEAD_STATS.superchargeCadence === 0;
    for (const dir of ctx.aimFan(LEAD_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      armSeeker(pr);
      if (ctx.evolved) {
        pr.damage *= LEAD_STATS.serpentDamageMul;
        // The serpent threads a line of bodies: its own base pierce replaces
        // lead's tier value, and the build's +pierce stacks on top of it
        // exactly as it would for any other finite pierce (#146). This is the
        // same arithmetic RunWorld.applyBuild runs on a tier's pierce, applied
        // to the evolution's signature number instead.
        pr.maxPierce = LEAD_STATS.serpentBasePierce + ctx.buildMods.extraPierce;
        pr.pierce = pr.maxPierce;
        pr.turnRate = LEAD_STATS.serpentTurnRate;
        pr.homingRange = LEAD_STATS.serpentHomingRange;
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

  /** Nothing to drop: every seeker this module makes lives in the world's
   *  projectile array, which clearSandboxEntities empties itself. The module
   *  holds no schedule, no counter and no pointer of its own — the
   *  supercharge cadence reads the WORLD's trigger counter through ctx. */
  reset(): void {}
}

export const LEAD = {
  role: 'lead',
  stats: LEAD_STATS,
  // No tickAt: the lead owns no damage pass of its own. Its seekers ride the
  // world's shared projectile loop, including the homing search itself.
  create: () => new LeadInstance(),
} satisfies WeaponModule;
