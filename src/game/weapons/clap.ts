import type { WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

/** How much wider than the shape the spatial-hash query goes before the exact
 *  distance test decides. NOT TUNING, and deliberately not a stat: it is
 *  arithmetically unobservable — SpatialHash.query already widens by the
 *  largest inserted radius, and every candidate it returns is cut again by the
 *  real reach test below. Nothing about the clap's footprint is decided here. */
const HASH_QUERY_PAD = 24;

/** The clap's tuning. Nothing in the behavior code below may be a bare
 *  literal. */
interface ClapStats extends WeaponStats {
  // ---------------- the base thunderclap -----------------------------------
  //
  // A clap is a percussive SLAM: an instant flash all around the player, no aim
  // and no blind spot. Everything inside `radius` is hit at once and shoved
  // off, whichever direction it stood — the panic button that clears the ring
  // pressing in on you. There is no cone and no angle test; coverage is the
  // whole circle. The visual is a flash IN PLACE, not a travelling ring (that
  // is the bass's Subquake).

  /** Knock distance pushed on every body the BASE clap catches, away from the
   *  player. Strong — shoving the whole ring off you is the base identity.
   *  RAW: no buildMods.knockbackMul, applied through ctx.shove. */
  readonly shove: number;
  /** Seconds a drawn flash lives. View-only, shared by base and Nova. */
  readonly ringDurS: number;

  // ---------------- Nova (evolved) -----------------------------------------
  //
  // The evolved clap SHATTERS. The base is a close panic-clap; Nova keeps that
  // close burst (a little harder) and then flings a full circle of fast shards
  // outward, so the weapon gains REACH — it clears the ring around you AND
  // streaks shrapnel into whatever is pressing in from range. The evolution is
  // offensive, and legible: you see the shards fly and connect. Little
  // knockback (evolvedShove), so bodies stay in the burst to die rather than
  // being flung to safety.

  /** Nova blast radius as a multiple of the tier's (already area-built) radius:
   *  the close burst reaches a little further than the base clap. */
  readonly evolvedRadiusMul: number;
  /** Knock distance the Nova close burst applies. Small: enemies stay in it. */
  readonly evolvedShove: number;
  /** Nova close-burst damage as a multiple of tier damage. */
  readonly novaDamageMul: number;
  /** How many shards the nova flings, evenly spaced around the full circle. */
  readonly novaShards: number;
  /** Shard damage as a multiple of tier damage. */
  readonly novaShardDamageMul: number;
  /** Shard speed, radius, life and pierce. Life x speed is the shards' reach;
   *  pierce lets one shard cut through a short line of bodies. */
  readonly novaShardSpeed: number;
  readonly novaShardRadius: number;
  readonly novaShardLifeS: number;
  readonly novaShardPierce: number;
}

const CLAP_STATS: ClapStats = {
  // Thunderclap: an instant flash all around the player that hits everything
  // close and shoves it off. Melee crowd control — no travel, no aim, safest
  // when the wall is on top of you because it clears every side at once.
  tiers: [
    { damage: 4, radius: 90 },
    { damage: 5, radius: 96 },
    { damage: 5, radius: 96 },
    { damage: 6, radius: 104 },
    { damage: 7, radius: 104 },
    { damage: 8, radius: 112 },
    { damage: 9, radius: 112 },
    { damage: 10, radius: 120 },
  ],
  tierLines: [
    'a slam that clears every side',
    'wider blast',
    'damage up',
    'wider blast',
    'damage up, wider',
    'damage up',
    'widest blast',
    'maximum damage',
  ],

  shove: 32,
  ringDurS: 0.25,

  evolvedRadiusMul: 1.4,
  evolvedShove: 6,
  novaDamageMul: 1.6,
  novaShards: 12,
  novaShardDamageMul: 0.8,
  novaShardSpeed: 520,
  novaShardRadius: 6,
  novaShardLifeS: 0.55,
  novaShardPierce: 3,
};

class ClapInstance implements WeaponInstance {
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    if (ctx.evolved) {
      this.fireNova(ctx, conf);
      return;
    }
    const p = ctx.player;
    const reach = conf.radius!;
    // DAMAGE FIRST, FX SECOND. Every kill this slam makes — and every rng draw
    // behind the drops those kills roll — lands before the flash is queued. NO
    // aim: aimDir would draw the rng the old cone spent centring itself, and a
    // full-circle burst has nothing to centre.
    this.eachInReach(ctx, p.x, p.y, reach, (e) => {
      ctx.damage(e, conf.damage);
      // RAW shove, away from the SLAM ORIGIN (the player), not from the body.
      if (CLAP_STATS.shove) ctx.shove(e, p.x, p.y, CLAP_STATS.shove);
    });
    // A flash IN PLACE, not an expanding wave — the clap is instant, and a
    // travelling ring reads as the bass's Subquake.
    ctx.fx({ type: 'flash', x: p.x, y: p.y, radius: reach, color: ctx.color, dur: CLAP_STATS.ringDurS });
  }

  /** Nova: the evolved clap SHATTERS. A bigger close burst clears the ring, and
   *  then a full circle of fast shards is flung outward — the close panic-clap
   *  gains reach, streaking shrapnel into the enemies pressing in from range.
   *
   *  The shards are ordinary projectiles on the shared loop (this weapon lends
   *  it no behavior), so they travel, pierce a few bodies and expire on their
   *  own — nothing to schedule and nothing to reset. */
  private fireNova(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const reach = conf.radius! * CLAP_STATS.evolvedRadiusMul;
    const burst = conf.damage * CLAP_STATS.novaDamageMul;
    this.eachInReach(ctx, p.x, p.y, reach, (e) => {
      ctx.damage(e, burst);
      if (CLAP_STATS.evolvedShove) ctx.shove(e, p.x, p.y, CLAP_STATS.evolvedShove);
    });
    ctx.fx({ type: 'flash', x: p.x, y: p.y, radius: reach, color: ctx.color, dur: CLAP_STATS.ringDurS });

    // The shatter: a ring of shards, evenly spaced, flung outward. A hand-built
    // conf carries the shard's own speed/radius/life/pierce; the shard damage
    // rides conf.damage's already-built power.
    const shardConf: WeaponConf = {
      damage: conf.damage,
      speed: CLAP_STATS.novaShardSpeed,
      radius: CLAP_STATS.novaShardRadius,
      lifetimeS: CLAP_STATS.novaShardLifeS,
      pierce: CLAP_STATS.novaShardPierce,
    };
    const shardDamage = conf.damage * CLAP_STATS.novaShardDamageMul;
    for (let i = 0; i < CLAP_STATS.novaShards; i++) {
      const angle = (i / CLAP_STATS.novaShards) * Math.PI * 2;
      const pr = ctx.spawnProjectile(shardConf, shardDamage);
      pr.vx = Math.cos(angle) * pr.speed;
      pr.vy = Math.sin(angle) * pr.speed;
    }
  }

  /** Visit every live body whose EDGE is inside `reach` of (x, y), in the
   *  frame's spatial-hash order — the order kills happen in, and therefore the
   *  order their rng draws happen in. The callback must not call ctx.near()
   *  itself: this is walking this context's one scratch buffer. */
  private eachInReach(
    ctx: WeaponContext,
    x: number,
    y: number,
    reach: number,
    hit: (e: WeaponTarget) => void,
  ): void {
    for (const e of ctx.near(x, y, reach + HASH_QUERY_PAD)) {
      if (e.dead) continue;
      // Reach is measured to the body's EDGE, so a big enemy is caught by its
      // own radius while a small enemy at the same centre distance is not.
      if (Math.hypot(e.x - x, e.y - y) > reach + e.radius) continue;
      hit(e);
    }
  }

  /** Nothing to drop: the base clap resolves synchronously inside fire(), and
   *  Nova's shards live in the world's projectile array, which
   *  clearSandboxEntities empties itself. The module holds no schedule,
   *  counter or pointer of its own. */
  reset(): void {}

  // No `projectile` behavior, deliberately: the base burst is a melee flash and
  // Nova's shards ride the shared projectile loop completely unchanged — travel,
  // arena rails and the shared pierce rule, landing damage and nothing else.
}

export const CLAP = {
  role: 'clap',
  stats: CLAP_STATS,
  // No tickAt: the base clap resolves the whole of its damage inside fire(), and
  // Nova's shards are owned by the shared projectile loop — the weapon owns no
  // damage pass of its own the way the scheduled pincers once did.
  create: () => new ClapInstance(),
} satisfies WeaponModule;
