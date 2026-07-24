import type { WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

/** How much wider than the shape the spatial-hash query goes before the exact
 *  distance test decides. NOT TUNING, and deliberately not a stat: it is
 *  arithmetically unobservable — SpatialHash.query already widens by the
 *  largest inserted radius, and every candidate it returns is cut again by the
 *  real reach test below. Nothing about the clap's footprint is decided here. */
const HASH_QUERY_PAD = 24;

/** Which evolved-clap prototype is live. A GLOBAL DEV TOGGLE, not per-run
 *  state: the two evolutions below are being A/B'd in the sandbox, and this
 *  selects between them for every clap in every world at once. The sandbox
 *  panel flips it through setClapEvolutionPrototype; nothing in a real run
 *  reads or writes it, so both prototypes ship until one is chosen. */
export type ClapEvolutionPrototype = 'detonation' | 'crescendo';
let clapEvolutionPrototype: ClapEvolutionPrototype = 'detonation';
export function setClapEvolutionPrototype(mode: ClapEvolutionPrototype): void {
  clapEvolutionPrototype = mode;
}
export function getClapEvolutionPrototype(): ClapEvolutionPrototype {
  return clapEvolutionPrototype;
}

/** The clap's tuning. Nothing in the behavior code below may be a bare
 *  literal. */
interface ClapStats extends WeaponStats {
  // ---------------- the base thunderclap -----------------------------------
  //
  // A clap is a percussive SLAM: an instant burst all around the player, no
  // aim and no blind spot. Everything inside `radius` is hit at once and shoved
  // off, whichever direction it stood — the panic button that clears the ring
  // pressing in on you. There is no cone and no angle test; coverage is the
  // whole circle, which is what fixes the old forward wedge's reach.

  /** Knock distance pushed on every body the BASE clap catches, away from the
   *  player. Strong — shoving the whole ring off you is the base identity.
   *  RAW: no buildMods.knockbackMul, applied through ctx.shove. */
  readonly shove: number;
  /** Seconds a drawn shock ring lives. View-only, shared by base and evolved. */
  readonly ringDurS: number;

  // ---------------- The Drop (evolved) — TWO PROTOTYPES --------------------
  //
  // The base thunderclap shoves the crowd off to keep you alive. The evolution
  // stops babysitting and starts KILLING — and deliberately drops most of the
  // knockback (evolvedShove), because shoving enemies to safety is the opposite
  // of killing them and is what would turn the evolution into an AFK defence.
  // Two variants are live behind clapEvolutionPrototype:
  //   'detonation' — a bigger, harder blast whose KILLS pop again, one level
  //                  deep, chaining through a packed crowd.
  //   'crescendo'  — a blast whose per-hit damage SCALES with how many bodies
  //                  it catches, so a wall takes far more than a stray does.
  // Both reward standing IN the crowd rather than pushing it away.

  /** Evolved blast radius as a multiple of the tier's (already area-built)
   *  radius — the drop reaches further than the base clap. */
  readonly evolvedRadiusMul: number;
  /** Knock distance the evolved blast applies. Small: enemies stay in the
   *  blast to die rather than being flung clear. */
  readonly evolvedShove: number;

  /** detonation: primary-blast damage as a multiple of tier damage. */
  readonly detonateDamageMul: number;
  /** detonation: radius of the secondary pop at each body the primary KILLS.
   *  A standalone constant (not conf-derived), so it takes areaMul by hand. */
  readonly popRadius: number;
  /** detonation: secondary-pop damage as a fraction of the primary damage. */
  readonly popDamageMul: number;

  /** crescendo: per-hit multiplier at ONE body caught — the floor of the ramp. */
  readonly crescendoBaseMul: number;
  /** crescendo: extra multiplier per ADDITIONAL body beyond the first. */
  readonly crescendoStepMul: number;
  /** crescendo: ceiling on the multiplier, however big the crowd. */
  readonly crescendoMaxMul: number;
}

const CLAP_STATS: ClapStats = {
  // Thunderclap: an instant burst all around the player that hits everything
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

  evolvedRadiusMul: 1.6,
  evolvedShove: 6,

  detonateDamageMul: 1.9,
  popRadius: 70,
  popDamageMul: 0.7,

  crescendoBaseMul: 1.3,
  crescendoStepMul: 0.2,
  crescendoMaxMul: 3.5,
};

class ClapInstance implements WeaponInstance {
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    if (ctx.evolved) {
      if (clapEvolutionPrototype === 'crescendo') this.fireCrescendo(ctx, conf);
      else this.fireDetonation(ctx, conf);
      return;
    }
    const p = ctx.player;
    const reach = conf.radius!;
    // DAMAGE FIRST, FX SECOND. Every kill this slam makes — and every rng draw
    // behind the drops those kills roll — lands before the ring is queued. NO
    // aim: aimDir would draw the rng the old cone spent centring itself, and a
    // full-circle burst has nothing to centre.
    this.eachInReach(ctx, p.x, p.y, reach, (e) => {
      ctx.damage(e, conf.damage);
      // RAW shove, away from the SLAM ORIGIN (the player), not from the body.
      if (CLAP_STATS.shove) ctx.shove(e, p.x, p.y, CLAP_STATS.shove);
    });
    ctx.fx({ type: 'ring', x: p.x, y: p.y, radius: reach, color: ctx.color, dur: CLAP_STATS.ringDurS });
  }

  /** The Drop, detonation prototype: a big blast whose KILLS pop again.
   *
   *  The primary sweep damages everything in reach and remembers which bodies
   *  it killed; each of those pops a smaller blast into its neighbours. The
   *  secondary pops do NOT collect their own kills, so the cascade is bounded
   *  to one round — a packed crowd chain-reacts, but a single trigger can never
   *  run away. Little knockback, so bodies stay in the blast to die. */
  private fireDetonation(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const reach = conf.radius! * CLAP_STATS.evolvedRadiusMul;
    const damage = conf.damage * CLAP_STATS.detonateDamageMul;
    const killed: WeaponTarget[] = [];
    this.eachInReach(ctx, p.x, p.y, reach, (e) => {
      ctx.damage(e, damage);
      if (CLAP_STATS.evolvedShove) ctx.shove(e, p.x, p.y, CLAP_STATS.evolvedShove);
      // A body the blast just killed becomes a pop. A Stage Light (prop) never
      // chains — only bodies do.
      if (e.dead && !e.prop) killed.push(e);
    });
    ctx.fx({ type: 'ring', x: p.x, y: p.y, radius: reach, color: ctx.color, dur: CLAP_STATS.ringDurS });

    const popDamage = damage * CLAP_STATS.popDamageMul;
    const popRadius = CLAP_STATS.popRadius * ctx.buildMods.areaMul;
    for (const dead of killed) {
      this.eachInReach(ctx, dead.x, dead.y, popRadius, (e) => ctx.damage(e, popDamage));
      ctx.fx({
        type: 'ring',
        x: dead.x,
        y: dead.y,
        radius: popRadius,
        color: ctx.color,
        dur: CLAP_STATS.ringDurS,
        soft: true,
      });
    }
  }

  /** The Drop, crescendo prototype: one blast whose per-hit damage scales with
   *  how big a crowd it caught.
   *
   *  Two passes over the same reach: the first counts the live BODIES it will
   *  hit (props ride along but do not swell the count), the second deals the
   *  scaled damage. A lone body takes the floor multiplier; a wall takes up to
   *  the ceiling. Rewards diving into the thick of it — the density you stand in
   *  is the damage. */
  private fireCrescendo(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const reach = conf.radius! * CLAP_STATS.evolvedRadiusMul;
    const caught: WeaponTarget[] = [];
    let bodies = 0;
    this.eachInReach(ctx, p.x, p.y, reach, (e) => {
      caught.push(e);
      if (!e.prop) bodies++;
    });
    const mult = Math.min(
      CLAP_STATS.crescendoMaxMul,
      CLAP_STATS.crescendoBaseMul + CLAP_STATS.crescendoStepMul * Math.max(0, bodies - 1),
    );
    const damage = conf.damage * mult;
    for (const e of caught) {
      if (e.dead) continue;
      ctx.damage(e, damage);
      if (CLAP_STATS.evolvedShove) ctx.shove(e, p.x, p.y, CLAP_STATS.evolvedShove);
    }
    ctx.fx({ type: 'ring', x: p.x, y: p.y, radius: reach, color: ctx.color, dur: CLAP_STATS.ringDurS });
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

  /** Nothing to drop: every clap resolves synchronously inside fire(), holding
   *  no scheduled strike, counter or pointer between triggers. */
  reset(): void {}

  // No `projectile` behavior, deliberately: this weapon is a melee burst and
  // nothing it makes ever enters the shared projectile loop.
}

export const CLAP = {
  role: 'clap',
  stats: CLAP_STATS,
  // No tickAt: every clap — base burst and either evolved drop — resolves the
  // whole of its damage inside fire(), so the weapon owns no damage pass of its
  // own the way the scheduled pincers once did.
  create: () => new ClapInstance(),
} satisfies WeaponModule;
