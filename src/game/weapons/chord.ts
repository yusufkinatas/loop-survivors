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
interface ChordStats extends WeaponStats {
  // ---------------- both modes ---------------------------------------------

  /** How far from the player the zone may be thrown, in units. WAS
   *  config.ZONE_THROW_RANGE. A zone is thrown ONTO the pack rather than
   *  dropped underfoot — that is what makes it worth a pick — and with nothing
   *  inside this radius it lands on the player instead. */
  readonly throwRange: number;
  /** HOW MANY BODIES THE THROW EVEN CONSIDERS: the `count` handed to
   *  nearestEnemies, which comes back NEAREST FIRST. Past this many enemies
   *  inside `throwRange`, the ones cut are always the FARTHEST — the exact
   *  candidates the weighting below already makes least likely — so the cap
   *  costs almost no probability mass while bounding the per-trigger work.
   *  It is still a truncation, and a real one: with 40 bodies in range the
   *  outermost 8 cannot be picked AT ALL, not merely rarely. */
  readonly pickCandidates: number;
  /** Softening distance, in units, added to a candidate's distance before the
   *  weight is taken. WITHOUT IT the weight diverges as distance goes to zero
   *  and a body standing inside the player would swallow the entire roll; with
   *  it, everything closer than this reads as roughly equally likely, which is
   *  what stops the throw from re-picking whichever enemy happens to be
   *  touching you. Also sets where the pick is most likely to land: candidate
   *  COUNT grows with distance (more ring at bigger radius) while weight falls,
   *  and the product peaks right around this value. */
  readonly pickFalloffUnits: number;
  /** The power the softened distance is raised to. THIS IS THE WHOLE FEEL OF
   *  THE RANDOMNESS and it is not a free parameter.
   *
   *  Enemies are spread over a disc, so the number of candidates at distance r
   *  grows roughly WITH r. At power 1 the weight falls as 1/r, the two cancel,
   *  and the throw comes out near-uniform over distance — which reads as
   *  "lands anywhere", not "lands nearby". Power 2 makes the mass fall off past
   *  `pickFalloffUnits`, so the throw is usually close and occasionally long.
   *  Dropping this to 1 does not make the weapon slightly less biased; it
   *  removes the bias altogether. */
  readonly pickFalloffPower: number;
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

  // ---------------- Afterhours ---------------------------------------------
  //
  // Big slow zones of ONE FIXED SIZE that each hunt the nearest body they do
  // not already cover. They never merge and never change size once thrown, so
  // what you see is exactly what damages. The evolution reads as two things at
  // once: they got bigger, and they started moving.

  /** An evolved zone's radius in units, FLAT — not a multiplier on the tier
   *  block. Every Afterhours zone is this size whatever tier the chord reached,
   *  which is the point: the evolution is a step to one big fixed footprint,
   *  not a continuation of the tier ladder. Tier still drives damage and
   *  lifetime; it just no longer drives size.
   *
   *  STILL SCALED BY buildMods.areaMul, and deliberately. Wide Lens is the item
   *  that GATES this evolution, so a flat radius that ignored it would make the
   *  thing you spent to get here stop paying the moment you got here. Maxed,
   *  that is 120 x 1.30 = 156. */
  readonly afterhoursRadius: number;
  readonly afterhoursLifetimeMul: number;
  readonly afterhoursDamageMul: number;
  /** Enemy speed multiplier under an Afterhours zone: harsher than the base
   *  `slowMul`, and the only place two different slows can meet, because the
   *  two modes' zones coexist across an evolution. */
  readonly afterhoursSlowMul: number;

  /** Units per second an Afterhours zone crawls toward the nearest body it does
   *  not already cover. A base zone's drift speed is ZERO — a base zone never
   *  moves at all — and that is a spawn-time fact frozen onto the zone, not a
   *  live read of the evolution flag.
   *
   *  This is the only tuning the hunt has. Turn it up and zones sweep the field
   *  harder; turn it to 0 and the evolution is just "bigger". */
  readonly driftSpeed: number;
}

const CHORD_STATS: ChordStats = {
  // Zone thrown onto a random nearby enemy: ticks damage and slows enemies
  // inside.
  // Chip damage plus control; the slow is the identity. `damage` here is PER
  // TICK, so the ladder is deceptively flat — real output is damage x ticks,
  // and lifetimes are set so zones overlap into a carpet rather than reading as
  // one area teleporting around.
  tiers: [
    { damage: 1, radius: 48, lifetimeS: 2.0 },
    { damage: 1, radius: 56, lifetimeS: 2.0 },
    { damage: 1, radius: 56, lifetimeS: 2.2 },
    { damage: 1.5, radius: 56, lifetimeS: 2.2 },
    { damage: 1.5, radius: 64, lifetimeS: 2.5 },
    { damage: 1.5, radius: 70, lifetimeS: 2.5 },
    { damage: 1.5, radius: 70, lifetimeS: 2.8 },
    { damage: 2, radius: 76, lifetimeS: 2.8 },
  ],
  tierLines: [
    'a zone thrown onto the pack',
    'bigger zone',
    'lingers longer',
    'damage up',
    'bigger zone, lingers longer',
    'bigger zone',
    'lingers longest',
    'maximum damage, biggest zone',
  ],

  throwRange: 420,
  pickCandidates: 32,
  pickFalloffUnits: 60,
  pickFalloffPower: 2,
  tickS: 0.9,
  slowGraceS: 0.15,
  slowMul: 0.55,

  afterhoursRadius: 120,
  afterhoursLifetimeMul: 1.35,
  afterhoursDamageMul: 1.25,
  afterhoursSlowMul: 0.42,

  driftSpeed: 65,
};

class ChordInstance implements WeaponInstance {
  /** One zone per trigger, thrown at a RANDOM body inside `throwRange` —
   *  weighted so nearby ones are far likelier — and dropped underfoot when
   *  there is nothing there.
   *
   *  ONE RNG DRAW PER TRIGGER WITH A TARGET, ZERO WITHOUT. That asymmetry is
   *  the same one aimDir has and it is deliberate: the draw belongs to the
   *  PICK, and an empty screen has nothing to pick between. It is per TRIGGER,
   *  not per shot — the chord does not fan, so Double Take changes neither the
   *  draw count nor anything else about it.
   *
   *  NO DAMAGE AND NO FX AT FIRE TIME. Everything this weapon does to the world
   *  happens in tick(), starting on the very next frame — the first tick lands
   *  because the world spawns every zone with `tickT` at zero. */
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const evolved = ctx.evolved;
    const target = this.pickTarget(ctx);
    // Damage and lifetime stack ON TOP of the build pipeline: `conf` already
    // carries powerMul/damageMul in `damage` and Encore's lifetime bonus in
    // `lifetimeS`. A module must not re-apply any of that.
    const damage = conf.damage * (evolved ? CHORD_STATS.afterhoursDamageMul : 1);
    // RADIUS IS THE ONE EXCEPTION, and the only place a module ignores what the
    // pipeline built. `conf.radius` is the tier block already scaled by areaMul;
    // an evolved zone throws that away for a FLAT size and re-applies areaMul by
    // hand, so tier stops driving size while Wide Lens keeps driving it. Reading
    // areaMul off buildMods costs an object allocation, so it is read once here
    // rather than inside the spec.
    const radius = evolved
      ? CHORD_STATS.afterhoursRadius * ctx.buildMods.areaMul
      : conf.radius!;
    ctx.spawnZone({
      x: target?.x ?? ctx.player.x,
      y: target?.y ?? ctx.player.y,
      radius,
      damage,
      lifeS: conf.lifetimeS! * (evolved ? CHORD_STATS.afterhoursLifetimeMul : 1),
      slow: true,
      // FROZEN AT SPAWN, not re-read in tick(). A base zone thrown just before
      // the evolution lands keeps zero drift and the base slow until it
      // expires, while Afterhours zones drift over the top of it.
      evolved,
      driftSpeed: evolved ? CHORD_STATS.driftSpeed : 0,
      slowMul: evolved ? CHORD_STATS.afterhoursSlowMul : CHORD_STATS.slowMul,
    });
  }

  /** Which body this trigger's zone lands on: a distance-weighted random pick
   *  over everything inside `throwRange`, or null when that is empty.
   *
   *  WHY NOT THE NEAREST ENEMY (which is what this was). With a strict nearest
   *  pick, a player walking into a pack gets zone after zone stacked on the
   *  same body — correct targeting that READS as a bug, because the one thing
   *  a survivors-like player watches is where the areas land. Randomising it
   *  spreads the carpet across the crowd, which is both what the weapon is for
   *  and what makes it look alive.
   *
   *  WHY NOT A UNIFORM PICK. Uniform over everything in range throws to the
   *  edge of `throwRange` most of the time, because that is where most of the
   *  bodies are — the zone spends the fight out at arm's length instead of on
   *  the pack that is actually on you. The weight is what keeps it close; see
   *  `pickFalloffPower` for why it has to fall off faster than 1/distance to
   *  keep it close at all.
   *
   *  NO ANTI-REPEAT. Back-to-back throws onto the same enemy are allowed and
   *  will happen — that is what an honest roll looks like, and this weapon
   *  holds no memory of its last target by design.
   *
   *  EXACTLY ONE ctx.rng() CALL, and only on the path that has something to
   *  pick. The early return above it is the zero-draw case fire() documents. */
  private pickTarget(ctx: WeaponContext): WeaponTarget | null {
    const candidates = ctx.nearestEnemies(CHORD_STATS.throwRange, CHORD_STATS.pickCandidates);
    if (candidates.length === 0) return null;

    const weights: number[] = [];
    let total = 0;
    for (const enemy of candidates) {
      const distance = Math.hypot(enemy.x - ctx.player.x, enemy.y - ctx.player.y);
      const weight =
        1 / (distance + CHORD_STATS.pickFalloffUnits) ** CHORD_STATS.pickFalloffPower;
      weights.push(weight);
      total += weight;
    }

    let roll = ctx.rng() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll < 0) return candidates[i];
    }
    // Float rounding only: the subtractions can leave `roll` a hair above zero
    // after the last weight. The final candidate is the one that slice owns.
    return candidates[candidates.length - 1];
  }

  /** Age, drift and tick every live zone.
   *
   *  ZONES ARE FULLY INDEPENDENT. There is no cross-zone pass any more — the
   *  merge that used to fuse overlapping Afterhours zones into supercells is
   *  gone, and with it every rule about which zone survived, what a merged
   *  radius/life/damage came to, and the damage ceiling that capped it. Two
   *  evolved zones sitting on the same body now simply both tick it, which is a
   *  straight damage increase over the merged behaviour that replaced it.
   *
   *  Removing it also fixed a rendering mismatch, and that is worth knowing
   *  before anything reintroduces a radius change: view.ts bakes a zone's
   *  radius into a cached sprite the first frame it appears and never rebuilds
   *  it for a size change. Merging grew `radius` after that point, so a
   *  supercell damaged and slowed over more than twice the area it drew.
   *  NOTHING MUTATES A ZONE'S RADIUS NOW, which is the only reason what you see
   *  is what hits.
   *
   *  TWO THINGS HERE ARE STILL BEHAVIOR, not implementation detail:
   *
   *  1. THE LOOP WALKS NEWEST FIRST (downward index). That is the order two
   *     overlapping zones' damage lands in, and therefore the order their kills
   *     and the rng draws behind them happen in.
   *  2. THE DAMAGE PASS WALKS THE FRAME'S SPATIAL-HASH SNAPSHOT, in hash bucket
   *     order, not the enemy array. That is the visit order every kill and every
   *     rng draw behind it happens in. The DRIFT scan below walks ctx.all()
   *     instead — array order — and the two are not interchangeable. */
  tick(ctx: WeaponContext, dt: number): void {
    const zones = ctx.zones();
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
      if (z.lifeS <= 0) ctx.retireZone(z);
    }
  }

  /** Afterhours' hunt: crawl toward the nearest body THIS ZONE DOES NOT ALREADY
   *  COVER.
   *
   *  MEASURED FROM THE ZONE, NOT THE PLAYER — that is why zones spread out
   *  instead of piling up. Every live zone used to score the densest CROWD on
   *  screen, a calculation they all performed identically, so they all walked
   *  into the same pack and the random throw was undone a second later. A
   *  per-zone target is local by construction: two zones thrown to opposite
   *  sides of the player chase what is beside each of them and stay apart.
   *
   *  THE `> z.radius` TEST IS WHAT MAKES IT MOVE AT ALL, and it is not an
   *  optimisation. Plain nearest-body picks something the zone is already
   *  sitting on — it is 120 units across and thrown into a crowd — so the zone
   *  re-centres a few pixels onto a body it is already damaging and then rides
   *  it. That looks like clinging, not hunting. Skipping what is already inside
   *  points it at the closest body it is NOT yet hitting, so it always advances
   *  into fresh crowd and the "they move now" read of the evolution survives.
   *
   *  The fallback matters just as much: with EVERYTHING inside the zone there
   *  is no uncovered body to walk to, and the zone holds still rather than
   *  jittering. That is the correct answer — it is already on everything.
   *
   *  A FULL SCAN, deliberately. Nearest-to-a-point is a single pass, so no pack
   *  can hide from it. Ties go to the EARLIEST enemy in array order, because
   *  the comparison is a strict `<`. Practice dummies are valid targets. */
  private drift(ctx: WeaponContext, z: Zone, dt: number): void {
    let target: WeaponTarget | null = null;
    let bestDistance = Infinity;
    for (const enemy of ctx.all()) {
      if (enemy.dead) continue;
      const distance = Math.hypot(enemy.x - z.x, enemy.y - z.y);
      if (distance > z.radius && distance < bestDistance) {
        bestDistance = distance;
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
