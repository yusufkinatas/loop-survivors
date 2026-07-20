// The weapon context: the narrow surface the world hands a weapon module.
// Queries about the world in, effects (damage, spawns, fx) out. A weapon module
// never touches the world's entity arrays.
//
// EVERY import here is type-only, so src/game/weapons/* has no runtime edge back
// to run.ts and the graph stays acyclic (run.ts imports weapons/index.ts as a
// value). That is why `color` is a context field instead of a module importing
// KIT_COLORS, which is a value export of run.ts.
//
// Adding a member to this interface taxes every fake context in systems-check.
// Add one when a weapon actually needs it, never speculatively.

import type { Role } from '../../audio/kits';
import type { BuildMods } from '../items';
import type { FxEvent } from '../run';

/** Everything a weapon module may READ off an enemy — eight fields, all
 *  readonly. `Enemy` satisfies this structurally, so the world hands its REAL
 *  objects across the seam and object identity survives: the kick's per-strike
 *  `Set<WeaponTarget>` dedup, and the strong references it holds for 200 ms to
 *  enemies already spliced out by reapEnemies, both work exactly as today.
 *  Handing ids or copied DTOs would silently turn one hit per strike into
 *  twelve.
 *
 *  `readonly` is the enforcement: `t.dead = true` inside a module is a compile
 *  error, so the only route to an enemy is the three named effects below, and
 *  damage attribution cannot be bypassed by accident. It is shallow and
 *  castable — a guardrail, not a sandbox.
 *
 *  This is also the entire cost of a fake target in systems-check. */
export interface WeaponTarget {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly dead: boolean;
  /** Chase speed. The kick's fallback knock distance derives from it. */
  readonly speed: number;
  /** Per-bestiary knockback resistance; 0 means immune. */
  readonly knockbackMul: number;
  /** Velocity the target actually moved by on the last movement step. Zeroed at
   *  the top of every frame and never set for practice dummies, which is why
   *  the kick's two knock branches are not interchangeable and a dummy always
   *  takes the fallback. */
  readonly lastMoveX: number;
  readonly lastMoveY: number;
}

/** Read-only player state. Modules never move the player. */
export interface WeaponPlayer {
  readonly x: number;
  readonly y: number;
  readonly facingX: 1 | -1;
}

export interface WeaponContext {
  // ---------------- identity (bound by the world; a module cannot forge it) ----

  /** The role every damage/kill is attributed to. Bound at construction, NOT a
   *  parameter, so a module physically cannot bill another weapon. */
  readonly role: Role;
  /** KIT_COLORS[role]. One value for base and evolved alike. */
  readonly color: number;
  /** THE mode flip. A LIVE getter over RunWorld.evolved — not stored state — so
   *  there is no second source of truth and no sync hook at evolve() or
   *  clearEvolutionForSandbox(). Readable from fire() and tick() alike. */
  readonly evolved: boolean;

  // ---------------- queries in ----------------

  /** Simulation clock, seconds. The kick's only scheduling reference. */
  readonly timeS: number;
  /** LIVE player state, re-read on every access — not a snapshot. Load-bearing:
   *  the kick's follow-up strip resamples position and facing 100 ms after the
   *  trigger that scheduled it. */
  readonly player: WeaponPlayer;
  /** Visible world extent (screen pixels / zoom). Redline Stomp's reach is a
   *  fraction of these, so the evolved footprint genuinely depends on canvas
   *  size and aspect ratio. */
  readonly worldW: number;
  readonly worldH: number;
  /** Derived passive + encore multipliers, for the numbers applyBuild does not
   *  reach. Redline Stomp reads knockbackMul; the base strip's knock
   *  deliberately does not. ALLOCATES A NEW OBJECT PER ACCESS
   *  (deriveBuildMods) — read it once per fire, never per enemy. */
  readonly buildMods: BuildMods;
  /** The run's main random stream (RunWorld.rng). Draw order is part of a run's
   *  identity: a module must draw exactly as often as the world code it
   *  replaced, at the same statement. The kick draws ZERO times. */
  rng(): number;

  /** Candidates from THIS frame's spatial-hash snapshot, in hash bucket order
   *  (cells minX..maxX outer, minY..maxY inner, insertion order within a
   *  bucket). A SUPERSET including dead enemies; callers still run the exact
   *  shape test. That visit order is the base strip's kill order and therefore
   *  its rng draw order; it is NOT world-array order and the two are not
   *  interchangeable.
   *
   *  Returns a scratch buffer owned by THIS context, valid only until the next
   *  near() call on this context. Per-context buffers mean one weapon can never
   *  corrupt another's iteration; a module that calls near() twice with the
   *  first result still live still corrupts itself. */
  near(x: number, y: number, radius: number): readonly WeaponTarget[];

  /** The world's LIVE enemy array, in array order, by reference — not a copy,
   *  not a snapshot. Includes practice dummies and enemies spawned this frame
   *  that are not yet in the hash, both of which Redline Stomp hits today.
   *
   *  Live is load-bearing: pushEnemy appends, and a JS array iterator re-reads
   *  length, so Redline Stomp's `for..of` visits splitter children that its own
   *  kills push mid-pass. A defensive `[...this.enemies]` would delete those
   *  hits and every rng draw behind them. */
  all(): readonly WeaponTarget[];

  // ---------------- effects out ----------------

  /** Damage with attribution. Routes straight to RunWorld.damageEnemy(target,
   *  amount, role) — one statement, no buffering, no deferral, no batching, no
   *  return value to branch on — so the kill consequences and their rng draws
   *  land at exactly the statement in the module where the old world code
   *  stood. The world sink keeps owning the 'dmg' fx, shield absorption, dummy
   *  absorb-and-refill, Math.min(hp, amount) effective-damage attribution,
   *  damageByRole/killsByRole, the 'death' fx, gem/note/magnet/chest drops and
   *  splitter children. None of that moves. */
  damage(target: WeaponTarget, amount: number): void;

  /** Radial push away from a point (RunWorld.shove). Scales `dist` by the
   *  target's own knockbackMul and EXTENDS any knock in flight
   *  (Math.max(knockT, SHOVE_S)). */
  shove(target: WeaponTarget, fromX: number, fromY: number, dist: number): void;

  /** Raw write of the shared knock channel: velocity assigned, duration
   *  ASSIGNED — not max()'d, so it can SHORTEN a longer knock in flight.
   *  Deliberately distinct from shove(): the kick's reverse-pursuit branch
   *  overwrites where its fallback extends, and it ignores buildMods.knockbackMul
   *  where every other weapon applies it. Two named primitives is how that
   *  asymmetry stays visible instead of being unified away. */
  setKnock(target: WeaponTarget, vx: number, vy: number, durationS: number): void;

  /** Queue a visual. A no-op when the world was built with fx:false, so a
   *  module never branches on whether effects are enabled. */
  fx(event: FxEvent): void;
}

// ---- deliberately ABSENT ----
//
// No spawnProjectile/spawnZone/spawnShockwave/spawnGravityWell: the kick spawns
// nothing, and designing a spawn effect now means designing blind against eight
// unmigrated weapons. Entities the view reads (view.ts iterates world.zones,
// world.shockwaves, world.gravityWells) will keep world-side STORAGE; the module
// gets a spawn effect plus a query over its own records. Decide it with the
// first weapon that needs it.
//
// No nearestEnemy / nearestEnemies / aimDir / aimFan / fanAround / moveDir /
// triggerCount: the kick uses none of them, and every member here is a tax on
// every fake context.
//
// No `world`, no mutable arrays, no `tiers`, no `level`, no `powerMul`, no
// `applyBuild` — `conf` arrives already built.
