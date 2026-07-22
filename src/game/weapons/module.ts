// The weapon module interface: the single owner of one weapon's gameplay
// identity — its tuning numbers, base and evolved behavior, its own entity
// behavior, and its effects — behind one small interface.

import type { Role } from '../../audio/kits';
import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type { PerWeaponLevel } from './levels';

/** The world's fixed damage-pass sequence, in frame order. This is the ordering
 *  vocabulary a module pins itself to; the actual sequence lives as explicit
 *  lines in RunWorld.update(), one per phase, diffable by eye against today's.
 *
 *  NOTE the shared, world-owned projectile loop sits BETWEEN 'pinches' and
 *  'zones'. It is not a phase name because no module owns it — weapons whose
 *  behavior lives inside it get ProjectileBehavior instead. */
const TICK_PHASES = ['strikes', 'pinches', 'zones', 'shockwaves'] as const;
export type TickPhase = (typeof TICK_PHASES)[number];

/** The world-independent half of a weapon's identity: numbers only, no state. */
export interface WeaponStats {
  /** Per-trigger gameplay effect, indexed [level - 1]. One entry per weapon
   *  level — a tuple, so a short ladder is a type error. Still shaped as
   *  WeaponConf because the world's single build transform reads it
   *  generically: the module owns the TABLE, the world owns the TRANSFORM. */
  readonly tiers: PerWeaponLevel<WeaponConf>;
  /** Pedestal copy, indexed [level - 1]. Relocated verbatim from config's
   *  TIER_LINES (since deleted, along with the empty fallback it fed). Has NO
   *  reader anywhere in src/ — owning it here must not "helpfully" wire it
   *  into the pedestal. */
  readonly tierLines: PerWeaponLevel<string>;
}

export interface ProjectileBehavior {
  /** Replaces shared motion. Return true = "I positioned it myself", which
   *  skips shared travel AND reflectProjectileFromArena — both ADR-0002
   *  exemptions fall out of one return value. Return false = "I only adjusted
   *  velocity", then shared travel + rails run (lead's homing). Omit for
   *  unchanged shared motion (snare, hat, bass). Default: false. */
  steer?(ctx: WeaponContext, pr: Projectile, dt: number): boolean;
  /** Runs after the shared loop deals pr.damage and BEFORE the shared pierce
   *  rule — that order is what keeps each weapon's on-hit sequence verbatim.
   *  Return false to skip spending pierce (arp chips on a timer).
   *  Omit = spend pierce, i.e. today's shared rule. Default: true. */
  onHit?(ctx: WeaponContext, pr: Projectile, target: WeaponTarget): boolean;
}

/** A weapon module: the single owner of one weapon's gameplay identity.
 *  The module VALUE is static — stats plus a factory. */
export interface WeaponModule {
  readonly role: Role;
  readonly stats: WeaponStats;
  /** Which world damage phase this weapon's own pass runs in. Omit for weapons
   *  with no pass of their own. */
  readonly tickAt?: TickPhase;
  create(): WeaponInstance;
}

/** One weapon's live state and behavior inside one world. */
export interface WeaponInstance {
  /** A Trigger fired this weapon. Called from RunWorld.fireTrigger AFTER the
   *  world's shared preamble, in this exact order: tier lookup, tiers[tier-1],
   *  applyBuild, triggerCounts increment.
   *
   *  `conf` is ALREADY BUILT — damage carries powerMul * antonioMight *
   *  damageMul, and `area` carries areaMul. applyBuild has been role-
   *  independent since Needle Tips went pierce-only (#145), so there is nothing
   *  per-weapon left in the build pipeline for a module to declare. A module
   *  must not re-apply any of it.
   *
   *  The mode is ctx.evolved. fire() may resolve damage synchronously (Redline
   *  Stomp does; the shell calls fireTrigger from the audio trigger listener,
   *  BETWEEN simulation steps) or defer entirely (the base strip does, dealing
   *  no damage and pushing no fx at fire time). Both are legal and the kick
   *  needs both; fire-time vs tick-time is the module's choice, not the
   *  seam's. */
  fire(ctx: WeaponContext, conf: WeaponConf): void;

  /** One simulation step of whatever this module owns, called from the phase
   *  slot named by WeaponModule.tickAt. `dt` is the step; a weapon scheduled on
   *  the absolute clock (the kick reads ctx.timeS for startedAt/expiresAt)
   *  ignores it. Omit when the weapon owns no pass. */
  tick?(ctx: WeaponContext, dt: number): void;

  /** Drop every scheduled/owned effect. Called from clearSandboxEntities, whose
   *  contract promises "No delayed strike/pickup pointer survives". Must draw
   *  no rng and push no fx. Does not touch tuning; evolution is world-owned so
   *  there is nothing to reset. */
  reset(): void;

  /** Motion and hit rules this weapon lends the shared projectile loop. Omit
   *  for a weapon whose shots ride unchanged shared physics, or that spawns no
   *  projectiles at all (the kick). The arp is the first implementor. */
  readonly projectile?: ProjectileBehavior;
}
