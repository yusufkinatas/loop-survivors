// The Arp weapon module: orbiters that circle the player and chip whatever they
// sweep, and its evolution, Event Horizon, a counter-rotating crown that
// breathes in and out. Base and evolved live in the same module; evolving flips
// an internal mode (ctx.evolved).
//
// THE ARP IS THE MIGRATION'S STRESS TEST. Every other weapon so far owned its
// own functions; the arp's behavior lived INSIDE the shared projectile loop as
// `pr.role === 'arp'` branches — orbit motion, the arena-rail exemption, and the
// pierce exemption. Those three are now this module's ProjectileBehavior, and
// the shared loop is left with no per-weapon branch at all.

import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type {
  ProjectileBehavior,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

/** The arp's tuning. Every number below was either a bare constant in config.ts
 *  (ARP_OMEGA, ORBIT_REHIT_S) or an inline literal in run.ts; values are
 *  unchanged. Nothing in the behavior code may be a bare literal — an
 *  evolution's damage multiplier is a named stat, not a `* 0.8` buried in a
 *  spawner, and the re-hit interval is a named stat, not a comment on a
 *  collision branch (ADR-0002, #144). */
export interface ArpStats extends WeaponStats {
  // ---------------- the timer re-hit: this weapon chips on a timer ----------
  //
  // READ THESE FIRST. An arp orbiter is the one projectile in the game that
  // does NOT spend pierce per enemy. It re-damages the same enemy every
  // `rehitS`, forever, for as long as it lives. That is the arp's identity, not
  // an accident: an orbiter is a sweeping field that keeps chipping whatever it
  // passes through, and a pierce-limited orbiter dies mid-sweep and stops being
  // an orbit at all (ADR-0002, decided on #138).
  //
  // The three stats below are the whole exemption, stated as properties, and
  // every line of behavior that implements it reads one of them: the re-hit
  // cadence in steer(), the declined pierce rule in onHit(), and the pierce
  // budget both spawners arm through armOrbiterPierce(). A reader never has to
  // open collision code to learn that this weapon chips on a timer.

  /** Seconds between re-hits on the SAME enemy, base. A slow sweep through a
   *  pack keeps chipping it at this cadence. */
  readonly rehitS: number;
  /** Seconds between re-hits on the same enemy for Event Horizon. Slower than
   *  base: the evolved crown is denser, so each orbiter chips less often. */
  readonly evolvedRehitS: number;
  /** FALSE, and deliberately so: an orbiter never spends pierce on a hit
   *  (ADR-0002). Changing it means re-litigating that ADR.
   *
   *  This ONE stat drives BOTH halves of the exemption, so they cannot drift
   *  apart:
   *    - ProjectileBehavior.onHit returns it, and that return value is what the
   *      shared loop actually obeys — it is the MECHANISM.
   *    - armOrbiterPierce() derives the pierce budget an orbiter is armed with
   *      at spawn from it — belt to onHit's braces.
   *  Neither is a bare literal at a spawn site any more; see armOrbiterPierce
   *  for why both exist and which one systems-check measures. */
  readonly spendsPierce: boolean;

  // ---------------- the orbit ----------------------------------------------

  /** Angular speed of the sweep, radians per second. */
  readonly omega: number;

  // ---------------- Event Horizon ------------------------------------------

  /** The evolved orbit ignores the tier's orbitRadius and breathes instead:
   *  this radius, plus/minus `evolvedOrbitBreath`, at `evolvedBreathRate`
   *  radians per second of the orbiter's own age. */
  readonly evolvedOrbitRadius: number;
  readonly evolvedOrbitBreath: number;
  readonly evolvedBreathRate: number;
  /** Orbiter size, lifetime and damage relative to the tier block. Damage is
   *  BELOW 1: the crown trades per-orbiter punch for orbiter count. */
  readonly evolvedRadiusMul: number;
  readonly evolvedLifetimeMul: number;
  readonly evolvedDamageMul: number;
  /** Fallbacks for a tier block with no radius/lifetimeS. Unreachable with the
   *  shipped ladder, where every rung sets both; ported verbatim rather than
   *  quietly dropped. */
  readonly evolvedRadiusFallback: number;
  readonly evolvedLifetimeFallbackS: number;
  /** Live EVOLVED orbiters allowed at once. Each trigger retires the oldest
   *  ones down to this before returning, so a dense chart cannot bury the
   *  screen. Was an inline `> 24` in run.ts; the value is unchanged. */
  readonly evolvedOrbiterCap: number;
}

export const ARP_STATS: ArpStats = {
  // King Bible: notes that orbit the player, a rotating shield of damage.
  // Each trigger adds one orbiter; a melody makes a ring.
  tiers: [
    { damage: 2, radius: 8, lifetimeS: 2.0, orbitRadius: 80 },
    { damage: 2, radius: 8, lifetimeS: 2.4, orbitRadius: 92 },
    { damage: 2, radius: 9, lifetimeS: 2.8, orbitRadius: 106 },
    { damage: 3, radius: 10, lifetimeS: 3.2, orbitRadius: 122 },
  ],
  tierLines: [
    'orbiting notes circle you',
    'the orbit lasts longer',
    'a wider, longer orbit',
    'a dense ring of orbiters',
  ],

  rehitS: 0.35,
  evolvedRehitS: 0.45,
  spendsPierce: false,

  omega: 3.4,

  evolvedOrbitRadius: 125,
  evolvedOrbitBreath: 25,
  evolvedBreathRate: 3.2,
  evolvedRadiusMul: 1.25,
  evolvedLifetimeMul: 1.35,
  evolvedDamageMul: 0.8,
  evolvedRadiusFallback: 8,
  evolvedLifetimeFallbackS: 2,
  evolvedOrbiterCap: 24,
};

/** Arm one freshly spawned orbiter's pierce budget FROM `spendsPierce`, so the
 *  stat and the field can never disagree. Both spawners below call this instead
 *  of writing a bare `pr.pierce = Infinity`, which is what #144 asks for: the
 *  stat is the mechanism a reader learns, not inert copy next to the real one.
 *
 *  WHY A BUDGET AT ALL, when onHit already declines the shared pierce rule: the
 *  two answer different questions. onHit is the MECHANISM — it is what the
 *  shared loop reads, and systems-check measures it by arming a live orbiter
 *  with a FINITE budget and asserting the loop never touches it. Infinity here
 *  is the CONSEQUENCE stated on the shot: an orbiter carries no pierce budget
 *  because it is never supposed to spend one, so not even a mis-wired loop can
 *  kill it mid-sweep — the outcome ADR-0002 rejected.
 *
 *  If `spendsPierce` ever became true, an orbiter would keep the tier's own
 *  budget from baseProjectile and would die mid-sweep like any other shot: the
 *  exemption would be gone in both places at once, from one edit. */
function armOrbiterPierce(pr: Projectile): void {
  if (!ARP_STATS.spendsPierce) pr.pierce = Infinity;
}

/** Motion and hit rules the SHARED projectile loop delegates to this module.
 *  Both hooks are the arp's two ADR-0002 exemptions, and both used to be
 *  `pr.role === 'arp'` branches inside RunWorld.updateProjectiles. */
const ORBIT_BEHAVIOR: ProjectileBehavior = {
  /** Returns TRUE — "I positioned this one myself". That single return value
   *  carries BOTH exemptions the ADR names: the orbiter skips shared travel
   *  (it is bound to the player, not flying through the arena) and it skips
   *  reflectProjectileFromArena with it (nothing bound to the player can hit an
   *  arena rail in the first place). */
  steer(ctx: WeaponContext, pr: Projectile, dt: number): boolean {
    // Orbit the player; clear the hit set on a cooldown so a slow sweep
    // keeps chipping the same enemy instead of touching it once.
    pr.orbitAngle += ARP_STATS.omega * pr.orbitDir * dt;
    const orbitRadius = pr.evolved
      ? ARP_STATS.evolvedOrbitRadius +
        Math.sin(pr.age * ARP_STATS.evolvedBreathRate) * ARP_STATS.evolvedOrbitBreath
      : pr.orbitRadius;
    pr.x = ctx.player.x + Math.cos(pr.orbitAngle) * orbitRadius;
    pr.y = ctx.player.y + Math.sin(pr.orbitAngle) * orbitRadius;
    pr.rehitT -= dt;
    if (pr.rehitT <= 0) {
      pr.hit.clear();
      pr.rehitT = pr.evolved ? ARP_STATS.evolvedRehitS : ARP_STATS.rehitS;
    }
    return true;
  },

  /** THE MECHANISM of the pierce exemption. Returns ARP_STATS.spendsPierce —
   *  false — so the shared loop's `pr.pierce -= 1` is skipped entirely and the
   *  orbiter survives its own sweep. The re-hit gate is steer()'s timer above,
   *  not the hit set emptying.
   *
   *  Flipping this to a hardcoded `true` is a real deletion of ADR-0002, and
   *  systems-check measures it through the real loop rather than by reading
   *  this line: it arms one live orbiter with a finite pierce budget and
   *  asserts the budget comes back untouched after a twelve-enemy sweep. */
  onHit(_ctx: WeaponContext, _pr: Projectile, _target: WeaponTarget): boolean {
    return ARP_STATS.spendsPierce;
  },
};

class ArpInstance implements WeaponInstance {
  readonly projectile = ORBIT_BEHAVIOR;

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    // King Bible: an orbiter per note, circling the player.
    if (ctx.evolved) this.fireEventHorizon(ctx, conf);
    else this.spawnOrbiters(ctx, conf);
  }

  /** Nothing to drop: every orbiter this module makes lives in the world's
   *  projectile array, which clearSandboxEntities empties itself. The module
   *  holds no schedule and no pointer of its own. */
  reset(): void {}

  private spawnOrbiters(ctx: WeaponContext, conf: WeaponConf): void {
    // One random base angle per trigger; Double Take's copies space themselves
    // evenly around the ring from it, so a crown reads as a ring not a clump.
    // Exactly ONE draw per trigger, no matter how many orbiters it produces.
    const baseAngle = ctx.rng() * Math.PI * 2;
    const count = 1 + ctx.buildMods.extraProjectiles;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (Math.PI * 2 * i) / count;
      const pr = ctx.spawnProjectile(conf, conf.damage);
      armOrbiterPierce(pr);
      pr.orbitAngle = angle;
      pr.orbitRadius = conf.orbitRadius!;
      pr.x = ctx.player.x + Math.cos(angle) * pr.orbitRadius;
      pr.y = ctx.player.y + Math.sin(angle) * pr.orbitRadius;
    }
  }

  private fireEventHorizon(ctx: WeaponContext, conf: WeaponConf): void {
    const baseAngle = ctx.rng() * Math.PI * 2;
    // Double Take adds whole counter-rotating pairs, spaced around the orbit.
    const pairs = 1 + ctx.buildMods.extraProjectiles;
    for (let pair = 0; pair < pairs; pair++) {
      for (const dir of [1, -1] as const) {
        const angle = baseAngle + (Math.PI * pair) / pairs + (dir === 1 ? 0 : Math.PI);
        const evolvedConf = {
          ...conf,
          radius: (conf.radius ?? ARP_STATS.evolvedRadiusFallback) * ARP_STATS.evolvedRadiusMul,
          lifetimeS:
            (conf.lifetimeS ?? ARP_STATS.evolvedLifetimeFallbackS) * ARP_STATS.evolvedLifetimeMul,
        };
        const pr = ctx.spawnProjectile(evolvedConf, conf.damage * ARP_STATS.evolvedDamageMul);
        armOrbiterPierce(pr);
        pr.orbitAngle = angle;
        pr.orbitRadius = conf.orbitRadius!;
        pr.orbitDir = dir;
        pr.rehitT = ARP_STATS.evolvedRehitS;
        pr.evolved = true;
        pr.x = ctx.player.x + Math.cos(angle) * pr.orbitRadius;
        pr.y = ctx.player.y + Math.sin(angle) * pr.orbitRadius;
      }
    }
    // Retire the oldest evolved orbiters down to the cap. ctx.projectiles() is
    // this weapon's own shots in world-array order, so "oldest first" is the
    // same ordering the world array had when this lived in run.ts.
    const evolvedOrbiters = ctx.projectiles().filter((projectile) => projectile.evolved);
    while (evolvedOrbiters.length > ARP_STATS.evolvedOrbiterCap) {
      const oldest = evolvedOrbiters.shift()!;
      ctx.retireProjectile(oldest);
    }
  }
}

export const ARP = {
  role: 'arp',
  stats: ARP_STATS,
  // No tickAt: the arp owns no damage pass of its own. Its orbiters ride the
  // world's shared projectile loop, which sits BETWEEN 'pinches' and 'zones'
  // and belongs to no module — that is exactly what ProjectileBehavior is for.
  create: () => new ArpInstance(),
} satisfies WeaponModule;
