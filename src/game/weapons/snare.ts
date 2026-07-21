import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type {
  ProjectileBehavior,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

/** The snare's tuning. Every number below was either a bare literal in run.ts's
 *  `fireRailshot`, an entry in a role-keyed table (WEAPON_SHOVE.snare,
 *  SPARK_HIT_ROLES), or a rung of config.WEAPONS.snare; values are unchanged.
 *  Nothing in the behavior code may be a bare literal. */
interface SnareStats extends WeaponStats {
  // ---------------- the base shot ------------------------------------------

  /** Aim jitter, radians, for the base volley. The snare is the backbeat
   *  sniper: nearly no scatter, so a shot goes where it is pointed. */
  readonly aimSpread: number;
  /** Knock distance on a base-shot hit, before buildMods.knockbackMul. WAS
   *  `WEAPON_SHOVE.snare` in config.ts, read by role inside the shared
   *  projectile loop; it is this weapon's own tuning and it lives here now. */
  readonly shove: number;
  /** The per-hit spark, view-only. WAS the snare's membership of run.ts's
   *  SPARK_HIT_ROLES plus the `n: 4, spread: 12` literals at the push site. A
   *  migrated weapon pushes its own visuals through ctx.fx. */
  readonly sparkCount: number;
  readonly sparkSpread: number;

  // ---------------- Railshot ------------------------------------------------
  //
  // READ THIS FIRST. Railshot has NO PIERCE BUDGET, and that is deliberate and
  // load-bearing: a rail damages every body in the corridor, however deep the
  // file is. There is no `railPierce` stat below because there is no pierce
  // arithmetic to feed — see the file header.

  /** Aim jitter for the rail. Tighter than the base volley: a beam that misses
   *  is a whole trigger wasted, where a shot at least travels. */
  readonly railAimSpread: number;
  /** Reach of a rail, world units. Instant — the rail is resolved inside the
   *  trigger, not travelled. */
  readonly railRange: number;
  /** Rail damage relative to the already-built tier damage. */
  readonly railDamageMul: number;
  /** Rail half-width relative to the tier's projectile radius, with a floor.
   *  BOTH the floor and the `radius` fallback are UNREACHABLE with the shipped
   *  ladder — every rung sets radius, and 7 * 1.25 = 8.75 already clears the
   *  floor of 7 at the minimum legal areaMul of 1. Ported verbatim rather than
   *  quietly dropped, and pinned as literals rather than as behavior, because
   *  no legal build can observe either one. */
  readonly railWidthMul: number;
  readonly railWidthFloor: number;
  readonly railRadiusFallback: number;
  /** Knock distance on a rail hit, before buildMods.knockbackMul. Double the
   *  base shot's: a rail shoulders a whole file aside. */
  readonly railShove: number;
  /** Drawn beam width as a multiple of the rail's damage HALF-width, so the
   *  drawn rail matches its corridor exactly. */
  readonly railBeamWidthMul: number;

  // ---------------- the twin rails -----------------------------------------

  /** Every Nth trigger fires twin rails either side of the main one.
   *  RunWorld.fireTrigger increments the role's trigger count BEFORE fire(), so
   *  `ctx.triggerCount % twinCadence === 0` is true on the FOURTH trigger. */
  readonly twinCadence: number;
  /** How far each twin sits off the main rail's axis, world units. */
  readonly twinOffset: number;
  /** A twin's damage half-width and damage, relative to the main rail's. */
  readonly twinWidthMul: number;
  readonly twinDamageMul: number;
  /** Knock distance on a twin hit, before buildMods.knockbackMul. */
  readonly twinShove: number;
  /** Drawn beam width for a twin, as a multiple of the MAIN rail's half-width.
   *  DELIBERATELY NOT railBeamWidthMul * twinWidthMul (which would be 1.4): the
   *  twin is drawn NARROWER than the corridor it actually damages. Ported
   *  verbatim — it is a view mismatch, not a simulation one, and it is not this
   *  commit's business to change what the player sees. */
  readonly twinBeamWidthMul: number;
}

const SNARE_STATS: SnareStats = {
  // Backbeat sniper: few, fast, hard-hitting, drills a line. The premium
  // single-target trigger — sparse chart, so each hit is a statement. The
  // ladder is a PIERCE ladder as much as a damage one.
  tiers: [
    { damage: 5, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 2 },
    { damage: 7, speed: 650, radius: 7, lifetimeS: 1.4, pierce: 3 },
    { damage: 9, speed: 680, radius: 8, lifetimeS: 1.5, pierce: 4 },
    { damage: 13, speed: 720, radius: 8, lifetimeS: 1.5, pierce: 6 },
  ],
  tierLines: [
    'piercing shot on the backbeat',
    'fires twice as often, pierces 1 more',
    'adds weak ghost shots, pierces 1 more',
    'burst of shots every 4th bar',
  ],

  aimSpread: 0.08,
  shove: 8,
  sparkCount: 4,
  sparkSpread: 12,

  railAimSpread: 0.02,
  railRange: 900,
  railDamageMul: 1.5,
  railWidthMul: 1.25,
  railWidthFloor: 7,
  railRadiusFallback: 7,
  railShove: 16,
  railBeamWidthMul: 2,

  twinCadence: 4,
  twinOffset: 24,
  twinWidthMul: 0.7,
  twinDamageMul: 0.65,
  twinShove: 8,
  twinBeamWidthMul: 1,
};

/** One instant line sweep: every live body inside the corridor takes `damage`
 *  and, if `shove` is positive, a push away from the rail's origin.
 *
 *  THE ORDER HERE IS BEHAVIOR, not an implementation detail. It walks
 *  `ctx.all()` — the world's enemy array IN ARRAY ORDER, i.e. spawn order — so
 *  the damage order, and therefore every rng draw a kill triggers, is the order
 *  the field was spawned in. `ctx.near()` is hash order and is NOT a
 *  substitute. This is why the snare needs `all()` at all, despite hitting a
 *  bounded corridor that a hash query would cover.
 *
 *  Note what is NOT here: any pierce budget. A rail stops for nothing. */
function damageLine(
  ctx: WeaponContext,
  x: number,
  y: number,
  dir: { x: number; y: number },
  length: number,
  halfWidth: number,
  damage: number,
  shove: number,
): void {
  for (const enemy of ctx.all()) {
    if (enemy.dead) continue;
    const px = enemy.x - x;
    const py = enemy.y - y;
    const along = px * dir.x + py * dir.y;
    const across = Math.abs(px * -dir.y + py * dir.x);
    if (
      along < -enemy.radius ||
      along > length + enemy.radius ||
      across > halfWidth + enemy.radius
    ) {
      continue;
    }
    ctx.damage(enemy, damage);
    if (shove > 0) ctx.shove(enemy, x, y, shove);
  }
}

/** What the base shot lends the SHARED projectile loop. There is no steer():
 *  a snare shot rides shared travel and the arena rails exactly like any other
 *  projectile, which is the half of ProjectileBehavior this weapon must NOT
 *  implement.
 *
 *  onHit is the whole of it, and it is where the snare's share of the two
 *  role-keyed tables landed. It runs after the loop deals pr.damage and before
 *  the shared pierce rule — the same slot the two table lookups occupied,
 *  with nothing observable in between for a snare shot (the shatter branch
 *  between them is bell-only and `pr.shatter` is 0 on every snare shot). */
const SHOT_BEHAVIOR: ProjectileBehavior = {
  onHit(ctx: WeaponContext, pr: Projectile, target: WeaponTarget): boolean {
    // Shove (sim, deterministic). Writes only the shared knock channel.
    const shove = SNARE_STATS.shove * ctx.buildMods.knockbackMul;
    if (shove) ctx.shove(target, pr.x, pr.y, shove);
    // Per-hit spark (view-only). The old push was additionally gated on
    // `!pr.shard`; a snare shot is never a shard — only a bell shatter makes
    // those — so the gate had no snare-side meaning and left with the table.
    ctx.fx({
      type: 'spark',
      x: target.x,
      y: target.y,
      color: pr.color,
      n: SNARE_STATS.sparkCount,
      spread: SNARE_STATS.sparkSpread,
    });
    // A snare shot spends pierce like every other projectile: its ladder IS a
    // pierce ladder. Returning true is today's shared rule, stated out loud.
    return true;
  },
};

class SnareInstance implements WeaponInstance {
  readonly projectile = SHOT_BEHAVIOR;

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    if (ctx.evolved) {
      this.fireRailshot(ctx, conf);
      return;
    }
    // One fast piercing shot per trigger; Double Take fans extra shots around
    // the same aim line, from a single aim.
    for (const dir of ctx.aimFan(SNARE_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      // Derive velocity from pr.speed, not conf.speed, so the `speed` field
      // stays equal to |v| — the bounce path reads that field.
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
    }
  }

  /** Nothing to drop: every shot this module makes lives in the world's
   *  projectile array, which clearSandboxEntities empties itself, and Railshot
   *  resolves inside its own trigger and leaves nothing behind at all. */
  reset(): void {}

  /** Railshot: an instant rail that drills the whole corridor, and every fourth
   *  trigger a pair of twins either side of it.
   *
   *  ORDER IS LOAD-BEARING and easy to lose. `ctx.shove` ASSIGNS the knock
   *  vector rather than max()ing it, so on a twin trigger the LAST rail to
   *  touch a body wins: a body sitting on the main axis ends up carrying the
   *  twin's smaller knock, not the main rail's. The firing order — main, then
   *  twin(-1), then twin(+1), each resolving fully before the next starts — is
   *  what produces that, and batching the damage or reordering the rails would
   *  change it. */
  private fireRailshot(ctx: WeaponContext, conf: WeaponConf): void {
    const dir = ctx.aimDir(SNARE_STATS.railAimSpread);
    const player = ctx.player;
    const damage = conf.damage * SNARE_STATS.railDamageMul;
    const width = Math.max(
      SNARE_STATS.railWidthFloor,
      (conf.radius ?? SNARE_STATS.railRadiusFallback) * SNARE_STATS.railWidthMul,
    );
    const knockbackMul = ctx.buildMods.knockbackMul;
    damageLine(
      ctx,
      player.x,
      player.y,
      dir,
      SNARE_STATS.railRange,
      width,
      damage,
      SNARE_STATS.railShove * knockbackMul,
    );
    ctx.fx({
      type: 'beam',
      x: player.x,
      y: player.y,
      x2: player.x + dir.x * SNARE_STATS.railRange,
      y2: player.y + dir.y * SNARE_STATS.railRange,
      width: width * SNARE_STATS.railBeamWidthMul,
      color: ctx.color,
    });
    if (ctx.triggerCount % SNARE_STATS.twinCadence !== 0) return;
    const nx = -dir.y * SNARE_STATS.twinOffset;
    const ny = dir.x * SNARE_STATS.twinOffset;
    for (const side of [-1, 1] as const) {
      const x = player.x + nx * side;
      const y = player.y + ny * side;
      damageLine(
        ctx,
        x,
        y,
        dir,
        SNARE_STATS.railRange,
        width * SNARE_STATS.twinWidthMul,
        damage * SNARE_STATS.twinDamageMul,
        SNARE_STATS.twinShove * knockbackMul,
      );
      ctx.fx({
        type: 'beam',
        x,
        y,
        x2: x + dir.x * SNARE_STATS.railRange,
        y2: y + dir.y * SNARE_STATS.railRange,
        width: width * SNARE_STATS.twinBeamWidthMul,
        color: ctx.color,
      });
    }
  }
}

export const SNARE = {
  role: 'snare',
  stats: SNARE_STATS,
  // No tickAt: the snare owns no damage pass of its own. Its base shots ride
  // the world's shared projectile loop, and Railshot resolves synchronously
  // inside fire().
  create: () => new SnareInstance(),
} satisfies WeaponModule;
