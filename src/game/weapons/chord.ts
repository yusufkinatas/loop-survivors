// The Chord weapon module: a slow field thrown onto the nearest pack that
// chips damage and makes everything inside wade instead of walk, and its
// evolution, Afterhours, where those fields go hunting — drifting toward the
// densest crowd and merging into supercells. Base and evolved live in the same
// module; evolving flips an internal mode (ctx.evolved).
//
// THE CHORD IS THE FIRST WEAPON WHOSE PASS WAS INSIDE THE SHARED-PHYSICS GUARD.
// RunWorld.updateZones was one of the four methods systems-check protects from
// per-weapon branches, which made "leave the loop in run.ts and branch on
// z.source" not an option at all: the whole tick/drift/merge/retire loop had to
// come here. It follows the split the bass made for shockwaves — STORAGE STAYS
// WORLD-SIDE (view.ts draws world.zones, clearSandboxEntities empties it) and
// this module is the array's SOLE MUTATOR, reaching it only through
// ctx.spawnZone / ctx.zones / ctx.retireZone.
//
// THE CHORD DRAWS NO RNG AT FIRE TIME, at any tier and any trigger count. It
// throws at `ctx.nearestEnemy(throwRange)`, which looks without jittering.
// `aimDir(0)` would be the one-line-tidier spelling and it DRAWS — once with a
// target on screen, twice with an empty one — so writing the throw that way
// desynchronises every later draw in the run. Nothing but the parity harness's
// draw counter would notice.
//
// DAMAGE IS PER TICK, NOT PER TRIGGER. A zone spawns with tickT at zero, so it
// lands one tick immediately and then one every `tickS` for its whole life:
// `1 + floor(lifeS / tickS)` ticks in total. The per-tier `damage` numbers look
// tiny next to every other weapon because they are multiplied by that count.
//
// THE SLOW IS THE IDENTITY, and it reaches the world through ctx.slow rather
// than through damage: each tick folds `slowMul` into the body's shared slow
// channel with min() and refreshes the timer to `tickS + slowGraceS`. That sum
// is why the slow is CONTINUOUS rather than strobing — 0.9 + 0.15 = 1.05 is
// longer than the 0.9 until the next tick renews it, and the 0.15 is the whole
// margin. Both halves of it must stay the SAME `tickS` stat: split them and the
// renewal-before-expiry relationship changes silently.
//
// TWO ROLE-KEYED TABLES, NEITHER OF WHICH THE CHORD IS IN. It is absent from
// config.WEAPON_SHOVE (clap only) and from run.ts's SPARK_HIT_ROLES (lead
// only), so nothing shrank when this weapon left and a zone tick lands damage
// and a slow and NOTHING else — no knock, no spark, no fx of any kind. Granting
// one while tidying up is a behavior change; systems-check pins the absence
// from both tables the way the hat's block does.

import type { WeaponConf } from '../config';
import { circlesOverlap } from '../spatial';
import type { Zone } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

/** How much wider than the zone the spatial-hash query goes before the exact
 *  overlap test decides. NOT TUNING, and deliberately not a stat: it is a copy
 *  of the `radius + 24` widening RunWorld.damageArea does on every area query,
 *  and it is arithmetically unobservable — SpatialHash.query already widens by
 *  the largest inserted radius, and every candidate it returns is then cut
 *  against `circlesOverlap`, which is the real reach. Nothing about the zone's
 *  footprint is decided here. */
const HASH_QUERY_PAD = 24;

/** The chord's tuning. Every number below was either a rung of
 *  config.WEAPONS.chord, one of config.ts's three ZONE_* constants, or a bare
 *  literal in run.ts's `case 'chord'` / spawnZone / updateZones; values are
 *  unchanged. Nothing in the behavior code may be a bare literal. */
export interface ChordStats extends WeaponStats {
  // ---------------- both modes ---------------------------------------------

  /** How far from the player the zone may be thrown, in units. WAS
   *  config.ZONE_THROW_RANGE. A zone is thrown ONTO the pack rather than
   *  dropped underfoot — that is what makes it worth a pick — and with nothing
   *  inside this radius it lands on the player instead. */
  readonly throwRange: number;
  /** Seconds between damage ticks. WAS config.ZONE_TICK_S.
   *
   *  READ BEFORE SPLITTING THIS. It is used TWICE — as the interval a tick
   *  resets to, and as the base of the slow's duration below — and both uses
   *  have to be this one stat. The zone's slow lasts `tickS + slowGraceS`
   *  against a renewal every `tickS`, so the fact that the slow outlives the
   *  gap to the next tick is a RELATIONSHIP between two of these numbers. Give
   *  the slow its own copy of 0.9 and that relationship can be broken by
   *  editing one of them, with nothing failing until a player notices enemies
   *  flickering back to full speed between ticks. */
  readonly tickS: number;
  /** Extra seconds the slow outlives the tick that applied it. WAS the bare
   *  `+ 0.15` in `slowT = ZONE_TICK_S + 0.15`. This is the whole margin that
   *  makes a standing zone a continuous slow instead of a strobe. */
  readonly slowGraceS: number;
  /** Enemy speed multiplier under a BASE zone. WAS config.ZONE_SLOW_MUL. */
  readonly slowMul: number;
  /** A zone's damage ceiling, as a multiple of the damage it spawned with.
   *  Frozen at spawn, and only the merge pass can ever approach it — an
   *  unmerged zone deals its spawn damage forever. WAS the bare `damage * 3`
   *  in spawnZone. */
  readonly damageCapMul: number;

  // ---------------- Afterhours ---------------------------------------------
  //
  // Huge drifting slow zones that seek the densest crowd and merge into
  // supercells. Every zone is bigger, longer, harder and slower-making, and
  // then two of them become one.

  /** Radius, lifetime and per-tick damage relative to the built tier block.
   *  These are applied ON TOP of the build pipeline's areaMul — a tier-4
   *  Afterhours zone with Wide Lens maxed is 76 x 1.30 x 1.55 across — so
   *  reading them as the whole story of an evolved zone's size is wrong. */
  readonly afterhoursRadiusMul: number;
  readonly afterhoursLifetimeMul: number;
  readonly afterhoursDamageMul: number;
  /** Enemy speed multiplier under an Afterhours zone: harsher than the base
   *  `slowMul`, and the only place two different slows can meet, because the
   *  two modes' zones coexist across an evolution. */
  readonly afterhoursSlowMul: number;

  /** Units per second an Afterhours zone crawls toward the pack it picked. A
   *  base zone's drift speed is ZERO — a base zone never moves at all — and
   *  that is a spawn-time fact frozen onto the zone, not a live read of the
   *  evolution flag. */
  readonly driftSpeed: number;
  /** HOW MANY BODIES THE DRIFT LOOKS AT, as a divisor of the enemy count: the
   *  scan steps by `max(1, floor(count / driftSamples))`, so it reads about
   *  this many enemies however big the field gets, and reads EVERY enemy while
   *  the field is smaller than this.
   *
   *  A SAMPLING STRIDE IS BEHAVIOR, NOT A PERFORMANCE DETAIL. With 61 bodies
   *  the stride is 2, so the drift only ever considers the even-indexed half of
   *  the array — a dense pack sitting entirely on odd indices is invisible to
   *  it and the zone walks the other way. "Tidying" this into a full scan
   *  changes where every Afterhours zone goes. */
  readonly driftSamples: number;
  /** How close another body has to be to count as a neighbour when scoring a
   *  sampled enemy's crowd, in units. The zone drifts toward the highest score,
   *  ties going to the EARLIEST sample examined. */
  readonly driftNeighborRadius: number;

  /** Ceiling on a merged zone's radius, in units. See the note in the merge
   *  code: this is not reachable in a shipped run, and it is ported verbatim
   *  anyway. */
  readonly mergeMaxRadius: number;
  /** Ceiling on a merged zone's remaining life, in seconds. */
  readonly mergeMaxLifeS: number;
  /** How much of the SHORTER-lived partner's life a merge adds on top of the
   *  longer one's. */
  readonly mergeLifeMul: number;
  /** How much of the absorbed zone's per-tick damage a merge adds, before
   *  `damageCap` clamps the result. */
  readonly mergeDamageMul: number;
}

export const CHORD_STATS: ChordStats = {
  // Zone thrown onto the nearest pack: ticks damage and slows enemies inside.
  // Chip damage plus control; the slow is the identity. `damage` here is PER
  // TICK, so the ladder is deceptively flat — real output is damage x ticks,
  // and lifetimes are set so zones overlap into a carpet rather than reading as
  // one area teleporting around.
  tiers: [
    { damage: 1, radius: 48, lifetimeS: 2.0 },
    { damage: 1, radius: 56, lifetimeS: 2.2 },
    { damage: 1, radius: 64, lifetimeS: 2.5 },
    { damage: 2, radius: 76, lifetimeS: 2.8 },
  ],
  tierLines: [
    'zone on the nearest pack: damage + slow',
    'zones twice as often',
    'bigger, longer zones',
    'the biggest, longest, hardest zones',
  ],

  throwRange: 420,
  tickS: 0.9,
  slowGraceS: 0.15,
  slowMul: 0.55,
  damageCapMul: 3,

  afterhoursRadiusMul: 1.55,
  afterhoursLifetimeMul: 1.35,
  afterhoursDamageMul: 1.25,
  afterhoursSlowMul: 0.42,

  driftSpeed: 65,
  driftSamples: 30,
  driftNeighborRadius: 120,

  mergeMaxRadius: 180,
  mergeMaxLifeS: 4.5,
  mergeLifeMul: 0.25,
  mergeDamageMul: 0.5,
};

class ChordInstance implements WeaponInstance {
  /** One zone per trigger, thrown at the nearest body inside `throwRange` and
   *  dropped underfoot when there is nothing there.
   *
   *  ZERO RNG DRAWS, at every tier and every Double Take count — the chord does
   *  not fan, so extra projectiles do nothing to it either. See the file
   *  header: nearestEnemy looks without jittering, and it is checked as an
   *  executable assertion rather than a comment.
   *
   *  NO DAMAGE AND NO FX AT FIRE TIME. Everything this weapon does to the world
   *  happens in tick(), starting on the very next frame — the first tick lands
   *  because the world spawns every zone with `tickT` at zero. */
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const evolved = ctx.evolved;
    const target = ctx.nearestEnemy(CHORD_STATS.throwRange);
    // The evolved multipliers stack ON TOP of the build pipeline: `conf` already
    // carries areaMul in `radius`, powerMul/damageMul in `damage`, and Encore's
    // lifetime bonus in `lifetimeS`. A module must not re-apply any of that.
    const damage = conf.damage * (evolved ? CHORD_STATS.afterhoursDamageMul : 1);
    ctx.spawnZone({
      x: target?.x ?? ctx.player.x,
      y: target?.y ?? ctx.player.y,
      radius: conf.radius! * (evolved ? CHORD_STATS.afterhoursRadiusMul : 1),
      damage,
      lifeS: conf.lifetimeS! * (evolved ? CHORD_STATS.afterhoursLifetimeMul : 1),
      slow: true,
      // FROZEN AT SPAWN, not re-read in tick(). A base zone thrown just before
      // the evolution lands keeps zero drift, the base slow and immunity from
      // the merge pass until it expires, while Afterhours zones drift over it.
      evolved,
      driftSpeed: evolved ? CHORD_STATS.driftSpeed : 0,
      // The cap is a multiple of THIS zone's damage, frozen now. A merge raises
      // `damage`; it never raises the cap.
      damageCap: damage * CHORD_STATS.damageCapMul,
      slowMul: evolved ? CHORD_STATS.afterhoursSlowMul : CHORD_STATS.slowMul,
    });
  }

  /** Age, drift, tick and merge every live zone. This IS RunWorld.updateZones,
   *  moved verbatim; the world no longer has a zone loop at all.
   *
   *  FOUR THINGS HERE ARE BEHAVIOR, not implementation detail:
   *
   *  1. THE PASS ORDER. Every zone ages and ticks FIRST, and only then does the
   *     merge pass run. That ordering is what lets each original zone land its
   *     currently scheduled tick at most once before being absorbed; merging
   *     first would silently delete a tick's worth of damage from the field
   *     every time two zones met.
   *  2. `zones` IS A SNAPSHOT ARRAY, walked by index and spliced from, exactly
   *     as the world's live array was. The index arithmetic in the merge pass
   *     below depends on removals shifting the entries under the cursor, so it
   *     cannot be rewritten over the read-only view ctx.zones() hands back.
   *  3. BOTH LOOPS WALK NEWEST FIRST (downward index). For the tick loop that
   *     is the order two overlapping zones' damage lands in; for the merge loop
   *     it decides WHICH zone survives, which is a real gameplay difference —
   *     see the note there.
   *  4. THE DAMAGE PASS WALKS THE FRAME'S SPATIAL-HASH SNAPSHOT, in hash bucket
   *     order, not the enemy array. That is the visit order every kill and every
   *     rng draw behind it happens in. The DRIFT scan below walks ctx.all()
   *     instead — array order — and the two are not interchangeable. */
  tick(ctx: WeaponContext, dt: number): void {
    const zones = [...ctx.zones()];
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.lifeS -= dt;

      // Gated on the ZONE's frozen flag, not on ctx.evolved. The two are
      // interchangeable ONLY because a base zone carries driftSpeed 0 and would
      // travel zero units anyway — so this line is verbatim rather than
      // load-bearing, and it is the spelling that stays correct if a base zone
      // ever gains a drift.
      if (z.evolved) this.drift(ctx, z, dt);

      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = CHORD_STATS.tickS;
        // The damage half. WAS `this.damageArea(z.x, z.y, z.radius, z.damage,
        // z.source)` — an approved GENERIC_ROLE_USE entry in the shared-physics
        // guard, which went with this loop. Attribution is now bound to the
        // context and cannot be forged.
        for (const e of ctx.near(z.x, z.y, z.radius + HASH_QUERY_PAD)) {
          if (!e.dead && circlesOverlap(z, e)) ctx.damage(e, z.damage);
        }
        // The zone's other half: everything inside wades, it doesn't walk. A
        // SECOND query rather than a reuse of the first — ctx.near hands back a
        // scratch buffer that the call above already consumed, and the two
        // loops are sequential in the original too. The set can genuinely
        // differ: the damage loop above may have killed bodies, and a dead one
        // is skipped here.
        if (z.slow) {
          for (const e of ctx.near(z.x, z.y, z.radius + HASH_QUERY_PAD)) {
            if (!e.dead && circlesOverlap(z, e)) {
              ctx.slow(e, z.slowMul, CHORD_STATS.tickS + CHORD_STATS.slowGraceS);
            }
          }
        }
      }
      if (z.lifeS <= 0) {
        zones.splice(i, 1);
        ctx.retireZone(z);
      }
    }
    this.merge(ctx, zones);
  }

  /** Afterhours' hunt: crawl toward the densest pack on screen.
   *
   *  THE SAMPLING STRIDE IS THE WHOLE CHARACTER OF THIS. It reads roughly
   *  `driftSamples` enemies out of the array whatever its size, scores each one
   *  by how many live bodies sit within `driftNeighborRadius` of it, and walks
   *  toward the best. It is a coarse, cheap, deliberately imperfect crowd-
   *  finder, and its imperfection is visible: past 60 bodies it only ever looks
   *  at every other one, so it can miss a pack entirely. Replacing the stride
   *  with a full scan sends every Afterhours zone somewhere else.
   *
   *  `ctx.all()` is the LIVE enemy array and `enemies.length` is re-read on
   *  every step of the outer loop, exactly as the world loop read
   *  `this.enemies.length`. Ties on the neighbour count go to the EARLIEST
   *  sample, because the comparison is a strict `>`. */
  private drift(ctx: WeaponContext, z: Zone, dt: number): void {
    const enemies = ctx.all();
    let target: WeaponTarget | null = null;
    let bestNeighbors = -1;
    for (
      let sample = 0;
      sample < enemies.length;
      sample += Math.max(1, Math.floor(enemies.length / CHORD_STATS.driftSamples))
    ) {
      const enemy = enemies[sample];
      if (enemy.dead) continue;
      let neighbors = 0;
      for (const other of enemies) {
        if (!other.dead &&
          Math.hypot(other.x - enemy.x, other.y - enemy.y) < CHORD_STATS.driftNeighborRadius) {
          neighbors += 1;
        }
      }
      if (neighbors > bestNeighbors) {
        bestNeighbors = neighbors;
        target = enemy;
      }
    }
    if (target) {
      const dx = target.x - z.x;
      const dy = target.y - z.y;
      const distance = Math.hypot(dx, dy) || 1;
      // Never overshoot: a zone sitting on its target stops dead rather than
      // oscillating across it.
      const travel = Math.min(distance, z.driftSpeed * dt);
      z.x += (dx / distance) * travel;
      z.y += (dy / distance) * travel;
    }
  }

  /** Afterhours zones merge pairwise into supercells, with strict caps.
   *
   *  `a` IS THE NEWER ZONE AND `a` IS THE SURVIVOR. The loop walks top-down and
   *  the inner scan looks DOWNWARD for a partner, so the higher index — the
   *  more recently thrown zone — absorbs the older one and keeps its own
   *  `damageCap`. That is not interchangeable with the other choice: damage
   *  climbs 3.75 -> 4.375 -> 4.6875 as a carpet converges, and which zone's cap
   *  is in force decides where it stops.
   *
   *  `i -= 1; break;` IS LOAD-BEARING. After splicing the absorbed zone out,
   *  `a` has shifted down one slot, so `i -= 1` re-points the cursor at `a`
   *  before the outer `i--` steps past it — one merge per zone per pass, and
   *  the scan continues from the entry directly below `a` rather than re-
   *  examining it. Ten zones landing on one spot in one frame collapse to five
   *  in a single pass because of it, and that cascade is the only thing that
   *  ever reaches `damageCap`; zones arriving one trigger at a time converge on
   *  a value below it and never bind. */
  private merge(ctx: WeaponContext, zones: Zone[]): void {
    for (let i = zones.length - 1; i >= 0; i--) {
      const a = zones[i];
      if (!a.evolved) continue;
      for (let j = i - 1; j >= 0; j--) {
        const b = zones[j];
        if (!b.evolved || !circlesOverlap(a, b)) continue;
        const totalArea = a.radius * a.radius + b.radius * b.radius;
        // A DIVIDE-BY-ZERO GUARD ON A DIVISOR THAT CANNOT BE SMALL. The
        // smallest rung of the ladder is radius 48, so `totalArea` is never
        // below 4608 and `Math.max(1, ...)` has never chosen the 1 — dropping
        // it moves nothing in the parity baseline and nothing in this file.
        // Ported verbatim regardless: it is free, and "unreachable today" is
        // not "unreachable after the next balance pass".
        const weight = Math.max(1, totalArea);
        // Area-weighted centroid, computed from the OLD radii — `a.radius` is
        // not overwritten until both coordinates are done.
        a.x = (a.x * a.radius * a.radius + b.x * b.radius * b.radius) / weight;
        a.y = (a.y * a.radius * a.radius + b.y * b.radius * b.radius) / weight;
        // UNREACHABLE IN A SHIPPED RUN, PORTED VERBATIM ANYWAY. Afterhours
        // requires Wide Lens at max and tier 4, so every Afterhours zone is
        // exactly 76 x 1.30 x 1.55 = 153.14 units and the very first merge asks
        // for sqrt(2) x 153.14 = 216.57 — already past the 180 cap. The sqrt
        // has never decided a merged radius; the baseline agent replaced it
        // with `a.radius + b.radius` and moved ZERO parity scenarios. It stays
        // exactly as written because this extraction is behavior-preserving and
        // "dead today" is not "dead after the next balance pass"; systems-check
        // pins the cap as a LITERAL, since no behavioral check can.
        a.radius = Math.min(CHORD_STATS.mergeMaxRadius, Math.sqrt(totalArea));
        a.lifeS = Math.min(
          CHORD_STATS.mergeMaxLifeS,
          Math.max(a.lifeS, b.lifeS) + Math.min(a.lifeS, b.lifeS) * CHORD_STATS.mergeLifeMul,
        );
        a.damage = Math.min(a.damageCap, a.damage + b.damage * CHORD_STATS.mergeDamageMul);
        zones.splice(j, 1);
        ctx.retireZone(b);
        i -= 1;
        break;
      }
    }
  }

  /** Nothing to drop. Every zone lives in the world's zone array, which
   *  clearSandboxEntities empties itself; this module holds no schedule and no
   *  pointer of its own. */
  reset(): void {}

  // No `projectile` behavior, deliberately. The chord spawns no projectile at
  // all, so it has nothing to lend the shared projectile loop.
}

export const CHORD = {
  role: 'chord',
  stats: CHORD_STATS,
  // The 'zones' phase: after the shared projectile loop and before the
  // shockwaves — exactly where RunWorld.updateZones stood.
  tickAt: 'zones',
  create: () => new ChordInstance(),
} satisfies WeaponModule;
