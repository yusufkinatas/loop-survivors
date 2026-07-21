import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type {
  ProjectileBehavior,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

/** The bass's tuning. Every number below was either a rung of
 *  config.WEAPONS.bass, the `bass` entry of config.WEAPON_SHOVE, or a bare
 *  literal in run.ts's `case 'bass'` / spawnSubquake / updateShockwaves; values
 *  are unchanged. Nothing in the behavior code may be a bare literal. */
export interface BassStats extends WeaponStats {
  // ---------------- the base wave ------------------------------------------

  /** Aim jitter, radians, for the base volley. */
  readonly aimSpread: number;
  /** Knock distance on a base-wave hit, before buildMods.knockbackMul. WAS
   *  `WEAPON_SHOVE.bass` in config.ts, read by role inside the shared
   *  projectile loop; it is this weapon's own tuning and it lives here now. */
  readonly shove: number;

  // ---------------- Subquake ------------------------------------------------
  //
  // READ THIS FIRST. The ring has NO PIERCE BUDGET and NO HIT CAP, and that is
  // deliberate and load-bearing: it damages every body its edge crosses,
  // however many there are. There is no `quakePierce` or `quakeMaxHits` below
  // because there is no arithmetic to feed — see the file header.

  readonly quakeStartRadius: number;
  /** Radius the ring grows to, before buildMods.areaMul.
   *
   *  THE RING READS areaMul AND NEVER READS conf.radius. The built `42 *
   *  areaMul` the base wave uses for its own body is simply unused by the
   *  evolution: these two are miles apart numerically and easy to confuse now
   *  that both modes sit behind one stats block. */
  readonly quakeMaxRadius: number;
  /** Seconds the ring lives, and the seconds it takes to finish growing. TWO
   *  stats, not one, even though the shipped values are identical: they were
   *  two separate literals in run.ts (the `lifeS: 1.2` written at spawn and the
   *  `age / 1.2` in the growth curve) and they answer different questions. The
   *  fact that a Subquake dies exactly as it finishes expanding is a
   *  COINCIDENCE OF TUNING that these two numbers currently agree on, not a
   *  structural identity, and folding them into one would silently make it one. */
  readonly quakeLifeS: number;
  readonly quakeGrowthS: number;
  /** Ring damage relative to the already-built tier damage. */
  readonly quakeDamageMul: number;
  /** Knock distance on a ring hit, before buildMods.knockbackMul. Pushed away
   *  from the ring's CENTRE — the fire-time player position — not from its
   *  edge. */
  readonly quakeShove: number;
}

export const BASS_STATS: BassStats = {
  // Slow wide low wave that rolls through everything. The weight ladder:
  // per-trigger damage climbs harder than any other kit.
  tiers: [
    { damage: 3, speed: 135, radius: 22, lifetimeS: 2.3, pierce: Infinity },
    { damage: 5, speed: 140, radius: 28, lifetimeS: 2.4, pierce: Infinity },
    { damage: 8, speed: 145, radius: 34, lifetimeS: 2.5, pierce: Infinity },
    { damage: 13, speed: 150, radius: 42, lifetimeS: 2.6, pierce: Infinity },
  ],
  tierLines: [
    'slow piercing wave',
    'waves twice as often',
    'heavier, wider waves',
    'massive wave every 4th bar',
  ],

  aimSpread: 0.08,
  shove: 6,

  quakeStartRadius: 40,
  quakeMaxRadius: 288,
  quakeLifeS: 1.2,
  quakeGrowthS: 1.2,
  quakeDamageMul: 1.55,
  quakeShove: 14,
};

/** What the base wave lends the SHARED projectile loop. There is no steer(): a
 *  bass wave rides shared travel and the arena rails exactly like any other
 *  projectile, and that is the half of ProjectileBehavior this weapon must NOT
 *  implement — a steer() returning true would silently exempt the wave from
 *  reflectProjectileFromArena the way the arp is exempted, and only a bouncing
 *  wave would ever notice.
 *
 *  onHit is the whole of it, and it is where the bass's share of WEAPON_SHOVE
 *  landed. It runs after the loop deals pr.damage and before the shared pierce
 *  rule — the same slot the table lookup occupied, with nothing observable in
 *  between for a bass wave (the shatter branch is bell-only and `pr.shatter` is
 *  0 on every wave; the spark branch never matched bass, which is not in
 *  SPARK_HIT_ROLES). */
const WAVE_BEHAVIOR: ProjectileBehavior = {
  onHit(ctx: WeaponContext, pr: Projectile, target: WeaponTarget): boolean {
    // Shove (sim, deterministic). Writes only the shared knock channel, from
    // the WAVE's position — the old lookup shoved from `pr.x, pr.y` too.
    const shove = BASS_STATS.shove * ctx.buildMods.knockbackMul;
    if (shove) ctx.shove(target, pr.x, pr.y, shove);
    // No spark: bass has never been in SPARK_HIT_ROLES, and a hit lands damage
    // and a knock and nothing else.
    //
    // A bass wave spends pierce like every other projectile — its ladder just
    // happens to carry Infinity, and Infinity minus one is Infinity. Returning
    // true is today's shared rule, stated out loud; returning false here would
    // be the arp's timer exemption, which this weapon does not have.
    return true;
  },
};

class BassInstance implements WeaponInstance {
  readonly projectile = WAVE_BEHAVIOR;

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    if (ctx.evolved) {
      this.spawnSubquake(ctx, conf);
      return;
    }
    // One wide rolling wave per trigger; Double Take fans extra waves around
    // the same aim line, from a single aim.
    for (const dir of ctx.aimFan(BASS_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      // Derive velocity from pr.speed, not conf.speed, so the `speed` field
      // stays equal to |v| — the bounce path reads that field.
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
    }
  }

  private spawnSubquake(ctx: WeaponContext, conf: WeaponConf): void {
    const area = ctx.buildMods.areaMul;
    ctx.spawnShockwave({
      x: ctx.player.x,
      y: ctx.player.y,
      radius: BASS_STATS.quakeStartRadius,
      maxRadius: BASS_STATS.quakeMaxRadius * area,
      lifeS: BASS_STATS.quakeLifeS,
      damage: conf.damage * BASS_STATS.quakeDamageMul,
      shove: BASS_STATS.quakeShove * ctx.buildMods.knockbackMul,
    });
  }

  /** Grow every live ring and resolve it against the field. This IS
   *  RunWorld.updateShockwaves, moved verbatim; the world no longer has a
   *  shockwave loop at all.
   *
   *  THREE THINGS HERE ARE BEHAVIOR, not implementation detail:
   *
   *  1. It walks `ctx.all()` — the world's LIVE enemy array, by reference, in
   *     ARRAY order. Live is load-bearing: a splitter this ring kills pushes
   *     four children onto the end of that array, and a JS array iterator
   *     re-reads length, so the children are visited BY THIS SAME RING IN THIS
   *     SAME PASS, already inside its radius. A defensive copy deletes those
   *     hits and every rng draw behind them.
   *  2. Array order is NOT the hash order the base wave uses inside the shared
   *     projectile loop, and not the distance order an expanding ring looks
   *     like it should have. Kill order is spawn order.
   *  3. Rings are walked NEWEST FIRST (downward index), which is the order the
   *     old world loop used so that its splice could not renumber the entries
   *     below the cursor. Retiring by identity through ctx.retireShockwave no
   *     longer needs that, but with two rings of different ages over one field
   *     it is still the order their damage lands in. */
  tick(ctx: WeaponContext, dt: number): void {
    const waves = ctx.shockwaves();
    for (let i = waves.length - 1; i >= 0; i--) {
      const wave = waves[i];
      wave.age += dt;
      wave.lifeS -= dt;
      wave.radius =
        BASS_STATS.quakeStartRadius +
        (wave.maxRadius - BASS_STATS.quakeStartRadius) *
          Math.min(1, wave.age / BASS_STATS.quakeGrowthS);
      for (const enemy of ctx.all()) {
        if (enemy.dead || wave.hit.has(enemy)) continue;
        if (Math.hypot(enemy.x - wave.x, enemy.y - wave.y) <= wave.radius + enemy.radius) {
          wave.hit.add(enemy);
          ctx.damage(enemy, wave.damage);
          ctx.shove(enemy, wave.x, wave.y, wave.shove);
        }
      }
      if (wave.lifeS <= 0) ctx.retireShockwave(wave);
    }
  }

  /** Nothing to drop. Base waves live in the world's projectile array and rings
   *  in the world's shockwave array, and clearSandboxEntities empties both
   *  itself; this module holds no schedule and no pointer of its own. */
  reset(): void {}
}

export const BASS = {
  role: 'bass',
  stats: BASS_STATS,
  // The 'shockwaves' phase: after the shared projectile loop and the zones,
  // before the gravity wells — exactly where RunWorld.updateShockwaves stood.
  // On a frame where a base wave and a ring both land, the wave's damage is
  // attributed first.
  tickAt: 'shockwaves',
  create: () => new BassInstance(),
} satisfies WeaponModule;
