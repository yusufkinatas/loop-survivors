import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext, WeaponTarget } from './context';
import type {
  ProjectileBehavior,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

/** The bell's tuning. Every number below was either a rung of
 *  config.WEAPONS.bell, a field of config.BELL, or a bare literal in run.ts's
 *  `case 'bell'` / spawnBell / spawnShards / updateGravityWells / the shatter
 *  branch of the shared projectile loop; values are unchanged. Nothing in the
 *  behavior code may be a bare literal. */
interface BellStats extends WeaponStats {
  // ---------------- the note ------------------------------------------------

  /** Aim jitter, radians, for the lobbed note. */
  readonly aimSpread: number;

  // ---------------- the shards ----------------------------------------------
  //
  // These describe a shard in BOTH modes: a base shatter and a well's burst
  // build the same projectile from the same five numbers, and differ only in
  // the three fields the `gravity` branch overwrites (homing, turn rate, a
  // bounce floor). The per-tier COUNT is not here — it is `shards` on the
  // ladder rung, because it is a rung's worth of tuning.

  /** Shard travel speed, before buildMods.projectileSpeedMul. */
  readonly shardSpeed: number;
  /** A base shard's damage as a fraction of the NOTE's damage — the note's own
   *  built damage, so a Gravity Bell's 1.35 is already inside it on the evolved
   *  path. Not used by the well's burst, which has its own multiplier. */
  readonly shardDamageMul: number;
  /** Shard lifetime, before buildMods.durationMul. Short: the burst is a ring
   *  that expands once and is gone, not a spray that lingers. */
  readonly shardLifeS: number;
  /** Shard radius, before buildMods.areaMul. */
  readonly shardRadius: number;
  /** Bodies one shard passes through, BEFORE Needle Tips. A shard's budget is
   *  minted here rather than coming off the ladder, which is why it goes
   *  through ctx.withExtraPierce: the build pipeline never sees this number, so
   *  nothing else would ever add the item's bonus to it. */
  readonly shardPierce: number;

  // ---------------- the shard ceiling ---------------------------------------
  //
  // THREE CONSTANTS THAT CANNOT SUBSTITUTE FOR EACH OTHER, which is why they
  // are three stats. Past `maxShards` live shards, a burst stops spawning and
  // instead AMPLIFIES its oldest live shard: damage multiplied by
  // `crowdedDamageMul`, clamped to `crowdedDamageCapMul` times the damage the
  // new burst would have carried, and lifetime extended to at least the new
  // burst's. It is a cap that converts overflow into concentration rather than
  // dropping it.

  /** Live shards past which a burst amplifies instead of spawning. */
  readonly maxShards: number;
  /** What one amplification multiplies the oldest shard's damage by. */
  readonly crowdedDamageMul: number;
  readonly crowdedDamageCapMul: number;

  /** The spark thrown at the BODY the note hit, on the frame it shatters. Once
   *  per note, on both paths — a well's opening looks the same as a burst. */
  readonly shatterSparkCount: number;
  readonly shatterSparkSpread: number;

  // ---------------- Gravity Bell --------------------------------------------

  /** How much harder an evolved note hits than a base one, applied on top of
   *  the whole build pipeline. It reaches the well's burst too, because the
   *  burst damage is a fraction of the NOTE's damage. */
  readonly gravityDamageMul: number;
  readonly gravityShatterGate: number;

  /** Well pull radius, before buildMods.areaMul. Bodies outside are untouched. */
  readonly wellRadius: number;
  /** Seconds a well lives. */
  readonly wellLifeS: number;
  /** Units per second a body inside is dragged toward the centre. Capped per
   *  frame at the remaining distance, so the pull parks bodies on the centre
   *  rather than oscillating them across it. */
  readonly wellPullSpeed: number;
  /** Seconds after opening that the well throws its one burst. Note it fires at
   *  0.35 of a 1.1-second life, so the seekers spend most of the well's life in
   *  the air with the pull still holding their targets in place. */
  readonly wellBurstT: number;
  /** Burst damage per shard, as a fraction of the note's damage. */
  readonly wellBurstDamageMul: number;
  /** How many shards the burst throws. THE LIVE 10 — see gravityShatterGate. */
  readonly wellBurstShards: number;
  /** How fast a burst seeker may turn, radians per second. It is the ONLY thing
   *  that makes a well's shards home; a base shard does not. Read by the shared
   *  projectile loop off the shot, never by role. */
  readonly seekerTurnRate: number;
  /** Floor on a seeker's arena bounces, applied with max() so a build that
   *  already grants more keeps them. Without it a seeker with no Ricochet dies
   *  at the first rail instead of turning back into the pack. */
  readonly seekerMinBounces: number;

  /** The spark thrown at the WELL's centre when it bursts. Bigger and wider
   *  than the shatter spark, and it fires exactly once per well — which is what
   *  makes the once-only `burst` flag visible in the ordered fx stream at all. */
  readonly burstSparkCount: number;
  readonly burstSparkSpread: number;
}

const BELL_STATS: BellStats = {
  // Bell (band, Melody): a note lobbed straight that shatters into shards on
  // its first hit. `radius` is the NOTE's own size; `shards` is how many
  // fragments this rung throws.
  tiers: [
    { damage: 2, speed: 360, radius: 6, lifetimeS: 1.8, pierce: 1, shards: 4 },
    { damage: 3, speed: 370, radius: 6, lifetimeS: 1.9, pierce: 1, shards: 5 },
    { damage: 4, speed: 380, radius: 7, lifetimeS: 2.0, pierce: 1, shards: 6 },
    { damage: 5, speed: 400, radius: 7, lifetimeS: 2.1, pierce: 2, shards: 8 },
  ],
  tierLines: [
    'a note that shatters into shards',
    'more shards on the shatter',
    'sharper shards, further',
    'a burst of shards, pierces',
  ],

  aimSpread: 0.1,

  shardSpeed: 320,
  shardDamageMul: 0.5,
  shardLifeS: 0.45,
  shardRadius: 4,
  shardPierce: 1,

  maxShards: 36,
  crowdedDamageMul: 1.08,
  crowdedDamageCapMul: 3,

  shatterSparkCount: 6,
  shatterSparkSpread: 14,

  gravityDamageMul: 1.35,
  gravityShatterGate: 10,

  wellRadius: 130,
  wellLifeS: 1.1,
  wellPullSpeed: 140,
  wellBurstT: 0.35,
  wellBurstDamageMul: 0.65,
  wellBurstShards: 10,
  seekerTurnRate: 4,
  seekerMinBounces: 1,

  burstSparkCount: 10,
  burstSparkSpread: 24,
};

class BellInstance implements WeaponInstance {
  /** What the note and its shards lend the SHARED projectile loop.
   *
   *  NO steer(). Notes, base shards and well seekers all ride shared travel,
   *  shared homing and the arena rails exactly as written — a seeker homes
   *  because `homing` is true and turns at `turnRate` because its spawner set
   *  one, not because this module steers it. Implementing steer() would silently
   *  exempt every bell shot from reflectProjectileFromArena the way the arp is
   *  exempted, and the seekers' whole bounce floor would stop meaning anything.
   *
   *  onHit is the SHATTER, and it is where the `pr.shatter > 0` branch that used
   *  to sit inline in the shared loop landed — the same slot, between the loop's
   *  damage and the shared pierce rule, so the sequence is unchanged. It stays
   *  keyed on the SHOT's fields (`shatter`, `gravity`), never on ctx.evolved:
   *  those are stamped at spawn, so a base note already in the air when the
   *  world evolves still throws base shards, and an evolved note still in the
   *  air after clearEvolutionForSandbox still opens a well. */
  readonly projectile: ProjectileBehavior = {
    onHit: (ctx: WeaponContext, pr: Projectile, target: WeaponTarget): boolean => {
      // `shatter` is 0 on a shard and 0 on a note that has already shattered, so
      // this fires exactly once per note however deep a file it pierces — that
      // is the whole of the once-only rule, and `pr.shatter = 0` below is it.
      if (pr.shatter > 0) {
        if (pr.gravity) {
          // The evolved path: a well, not a burst. The burst comes 0.35s later
          // out of tick(), and its damage is a fraction of THIS note's damage,
          // which already carries gravityDamageMul.
          ctx.spawnGravityWell({
            x: pr.x,
            y: pr.y,
            radius: BELL_STATS.wellRadius * ctx.buildMods.areaMul,
            lifeS: BELL_STATS.wellLifeS,
            pullSpeed: BELL_STATS.wellPullSpeed,
            burstT: BELL_STATS.wellBurstT,
            burstDamage: pr.damage * BELL_STATS.wellBurstDamageMul,
          });
        } else {
          this.spawnShards(ctx, pr.x, pr.y, pr.shatter, pr.damage * BELL_STATS.shardDamageMul);
        }
        ctx.fx({
          type: 'spark',
          x: target.x,
          y: target.y,
          color: pr.color,
          n: BELL_STATS.shatterSparkCount,
          spread: BELL_STATS.shatterSparkSpread,
        });
        pr.shatter = 0;
      }
      // A bell shot spends pierce like every other projectile. Returning false
      // here would be the arp's chip-on-a-timer exemption, which this weapon
      // does not have — and it is what makes tier 4's pierce 2 a note that
      // shatters on the first body and then passes through the second.
      return true;
    },
  };

  /** One note per aimed direction; Double Take fans extra notes around the same
   *  aim line, from a single aim.
   *
   *  ONE RNG DRAW PER TRIGGER — the aim jitter — however many notes come off it.
   *  Nothing else here draws: the shatter's draw happens later, on the frame the
   *  note lands, and a note that never hits anything costs nothing more. */
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    for (const dir of ctx.aimFan(BELL_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      // Off conf.speed, verbatim. baseProjectile has already copied the same
      // number into pr.speed, so the field the bounce path reads stays equal to
      // |v| either way.
      pr.vx = dir.x * conf.speed!;
      pr.vy = dir.y * conf.speed!;
      // The per-tier shard count, off the rung. It is the count the burst uses
      // on the BASE path only; the evolved branch below overwrites it with the
      // gate, and the well's burst carries its own count.
      pr.shatter = conf.shards!;
      // STAMPED AT SPAWN, not read at tick. `pr.evolved` is the world's flag at
      // the moment the note left, so a note already in the air keeps its mode
      // for its whole life — mid-evolve is a real scenario and this is the line
      // that decides it.
      if (pr.evolved) {
        pr.damage *= BELL_STATS.gravityDamageMul;
        pr.gravity = true;
        pr.shatter = BELL_STATS.gravityShatterGate;
      }
    }
  }

  /** Fling a radial burst of shards from (x, y). Each shard is a bell shot
   *  flagged so it can never itself re-shatter.
   *
   *  THREE THINGS HERE ARE BEHAVIOR, not implementation detail:
   *
   *  1. ONE DRAW, taken BEFORE the loop, for the ring's starting angle; the
   *     shards are then spaced evenly off it. The ring's ORIENTATION is random,
   *     its SHAPE is not.
   *  2. THE CEILING IS RE-READ ON EVERY SHARD, inside the loop, not once before
   *     it. A burst that crosses the ceiling part-way through spawns some shards
   *     and amplifies for the rest, and the shard it amplifies is re-chosen each
   *     time — so one burst can amplify the same oldest shard repeatedly, which
   *     is exactly how the 1.08 compounds.
   *  3. THE ANGLE STEP DIVIDES BY `count`, the burst's FULL count, not by how
   *     many shards actually spawned. A burst that hits the ceiling half way
   *     through leaves a gap in the ring rather than closing it up. */
  private spawnShards(
    ctx: WeaponContext,
    x: number,
    y: number,
    count: number,
    damage: number,
    gravity = false,
  ): void {
    const base = ctx.rng() * Math.PI * 2;
    const mods = ctx.buildMods;
    const shardRadius = BELL_STATS.shardRadius * mods.areaMul;
    const shardLifeS = BELL_STATS.shardLifeS * mods.durationMul;
    const shardPierce = ctx.withExtraPierce(BELL_STATS.shardPierce);
    const shardSpeed = BELL_STATS.shardSpeed * mods.projectileSpeedMul;
    for (let i = 0; i < count; i++) {
      const activeShards = ctx.projectiles().filter((projectile) => projectile.shard);
      if (activeShards.length >= BELL_STATS.maxShards) {
        const oldest = activeShards[0];
        oldest.damage = Math.min(
          oldest.damage * BELL_STATS.crowdedDamageMul,
          damage * BELL_STATS.crowdedDamageCapMul,
        );
        oldest.lifeS = Math.max(oldest.lifeS, shardLifeS);
        continue;
      }
      const a = base + (i / count) * Math.PI * 2;
      const pr = ctx.spawnProjectile(
        { damage, radius: shardRadius, lifetimeS: shardLifeS, pierce: shardPierce },
        damage,
      );
      // Redundant — spawnProjectile's second argument already set it — and
      // ported verbatim from run.ts rather than tidied away, because this file
      // is a behavior-preserving move and a "harmless" deletion is still a
      // deletion nobody checked.
      pr.damage = damage;
      // A shard starts where the burst did, NOT where the player is. Everything
      // else spawns underfoot, so this pair of lines is the difference between a
      // ring around the body the note hit and a ring around the player.
      pr.x = x;
      pr.y = y;
      pr.speed = shardSpeed;
      pr.vx = Math.cos(a) * shardSpeed;
      pr.vy = Math.sin(a) * shardSpeed;
      pr.shard = true;
      if (gravity) {
        // A well's burst throws SEEKERS. The three fields below are read by the
        // SHARED loop off the shot — it homes because `homing` is set, not
        // because anything asks which weapon fired it.
        pr.homing = true;
        pr.turnRate = BELL_STATS.seekerTurnRate;
        pr.bounces = Math.max(BELL_STATS.seekerMinBounces, pr.bounces);
        // Belt and braces: a shard's shatter is already 0, and a seeker's stays
        // 0 so it can never open a second well.
        pr.shatter = 0;
      }
    }
  }

  /** Age, pull, burst and retire every live well. This IS
   *  RunWorld.updateGravityWells, moved verbatim; the world no longer has a
   *  gravity-well loop at all.
   *
   *  THE PULL WALKS ctx.all() — the world's LIVE enemy array, in ARRAY order.
   *  Order barely shows here because a drag commutes, but the array being LIVE
   *  still matters on the burst below: the seekers it spawns are appended to the
   *  projectile array while the world's projectile loop for this frame has
   *  already finished, so they first move on the NEXT frame.
   *
   *  WELLS ARE WALKED NEWEST FIRST (downward index), which is the order the old
   *  world loop used so that its splice could not renumber the entries below the
   *  cursor. Retiring by identity no longer needs that, but with several wells
   *  overlapping it is still the order their bursts land in — and each burst
   *  costs an rng draw, so it is the run's draw order too. */
  tick(ctx: WeaponContext, dt: number): void {
    const wells = ctx.gravityWells();
    for (let i = wells.length - 1; i >= 0; i--) {
      const well = wells[i];
      well.lifeS -= dt;
      well.burstT -= dt;
      for (const enemy of ctx.all()) {
        // See the file header: `dead` is defensive with a discarded effect,
        // `dummy` is observable. Two lines, two different kinds of guard.
        if (enemy.dead) continue;
        if (enemy.dummy) continue;
        const dx = well.x - enemy.x;
        const dy = well.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        // `> 1` parks a body that has arrived instead of jittering it across the
        // centre, and it is also the divide-by-zero guard for the normalisation
        // below.
        if (distance <= well.radius && distance > 1) {
          const pull = Math.min(distance, well.pullSpeed * dt);
          // A DIRECT POSITION WRITE, not a knock: no knockbackMul, no duration,
          // no suppression of the chase. See WeaponContext.displace.
          ctx.displace(enemy, (dx / distance) * pull, (dy / distance) * pull);
        }
      }
      // ONCE PER WELL. `burstT` keeps counting down past zero for the rest of
      // the well's life, so the flag — not the timer — is what makes it
      // once-only, and the spark below is the only record of it in the digest.
      if (!well.burst && well.burstT <= 0) {
        well.burst = true;
        this.spawnShards(
          ctx, well.x, well.y, BELL_STATS.wellBurstShards, well.burstDamage, true,
        );
        ctx.fx({
          type: 'spark',
          x: well.x,
          y: well.y,
          color: well.color,
          n: BELL_STATS.burstSparkCount,
          spread: BELL_STATS.burstSparkSpread,
        });
      }
      if (well.lifeS <= 0) ctx.retireGravityWell(well);
    }
  }

  /** Nothing to drop. Notes and shards live in the world's projectile array and
   *  wells in the world's gravity-well array, and clearSandboxEntities empties
   *  both itself; this module holds no schedule and no pointer of its own. */
  reset(): void {}
}

export const BELL = {
  role: 'bell',
  stats: BELL_STATS,
  // The 'wells' phase: last of all the damage phases, after the shockwaves —
  // exactly where RunWorld.updateGravityWells stood. Being last is what makes a
  // well's drag win over anything that knocked the same body earlier in the
  // frame.
  tickAt: 'wells',
  create: () => new BellInstance(),
} satisfies WeaponModule;
