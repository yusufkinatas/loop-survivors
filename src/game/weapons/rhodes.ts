// The Rhodes weapon module: slow warm orbs that drift after whatever is
// nearest and bloom when they arrive — and its evolution, Nightbloom, where an
// arrival opens into three smaller orbs that drift on and bloom again. Base and
// evolved live in the same module; evolving flips an internal mode (ctx.evolved).
//
// LED BY THE SOUND (#266). The Rhodes is round, warm and unhurried — a struck
// tine that blooms rather than cracks. So its shot does not snap: it leaves
// slowly, curves toward a body in its own time, and opens into a soft burst on
// contact. It is the lead's opposite in the same seat-neighbourhood: the lead
// is chain lightning, all speed and angles; this is patient and gentle.

import { AIM_RANGE, type WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext } from './context';
import type { ProjectileBehavior, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface RhodesStats extends WeaponStats {
  readonly aimSpread: number;
  /** Radius of the soft burst an orb opens into when it lands. */
  readonly bloomRadius: number;
  /** Bloom damage as a multiple of the orb's own. Under 1: the bloom is reach,
   *  not a second full hit. */
  readonly bloomDamageMul: number;

  // ---------------- Nightbloom (evolved) -----------------------------------
  //
  // ONE NOTE BECOMES A CHORD. A Rhodes note does not stop when it is struck — it
  // blooms, and the base weapon already draws that as a soft burst on arrival.
  // Evolved, the burst OPENS: three smaller orbs come out of it, drift on after
  // whatever is nearest, and bloom again where they land. One trigger, one
  // arrival, then three more somewhere else.
  //
  // ONE GENERATION ONLY. A child cannot split, so the weapon is a fan and never
  // a chain reaction — three orbs from an arrival is legible, and nine from a
  // crowd is a screen the player cannot read. The generation rides on the shot
  // itself, in `pr.rehitT`, which is free on this weapon: only the arp's orbit
  // re-hit timer and the flute's bend use that field.
  //
  // The children are slower, smaller and hit for less. They exist to REACH — to
  // carry the arrival into the bodies standing behind the one it hit — not to
  // multiply the damage of a trigger by three.

  /** Orbs an arrival opens into. */
  readonly childCount: number;
  /** Half-angle the children fan across, in radians, either side of the parent's
   *  heading. Wide: they should visibly leave the arrival rather than continue
   *  through it. */
  readonly childSpread: number;
  /** Child damage, size, speed and life. Every one is a fraction of the parent's
   *  or a small absolute: a child is a smaller version of the same idea. */
  readonly childDamageMul: number;
  readonly childRadiusMul: number;
  readonly childSpeed: number;
  readonly childLifeS: number;
  /** A child's bloom radius as a fraction of the parent's. */
  readonly childBloomRadiusMul: number;
}

const RHODES_STATS: RhodesStats = {
  tiers: [
    { damage: 7, speed: 210, radius: 13, lifetimeS: 2.2, pierce: 1 },
    { damage: 8, speed: 210, radius: 13, lifetimeS: 2.2, pierce: 1 },
    { damage: 10, speed: 225, radius: 14, lifetimeS: 2.4, pierce: 1 },
    { damage: 11, speed: 225, radius: 14, lifetimeS: 2.4, pierce: 2 },
    { damage: 13, speed: 240, radius: 15, lifetimeS: 2.6, pierce: 2 },
    { damage: 14, speed: 240, radius: 15, lifetimeS: 2.6, pierce: 2 },
    { damage: 16, speed: 255, radius: 16, lifetimeS: 2.8, pierce: 3 },
    { damage: 18, speed: 255, radius: 17, lifetimeS: 3.0, pierce: 3 },
  ],
  tierLines: [
    'a warm orb that drifts and blooms',
    'damage up',
    'larger, longer-lived',
    'passes through two',
    'damage up, faster',
    'damage up',
    'passes through three',
    'maximum bloom',
  ],
  aimSpread: 0.1,
  bloomRadius: 62,
  bloomDamageMul: 0.55,

  childCount: 3,
  childSpread: 0.9,
  childDamageMul: 0.45,
  childRadiusMul: 0.7,
  childSpeed: 185,
  childLifeS: 1.7,
  childBloomRadiusMul: 0.6,
};

/** Generation marker, carried in `pr.rehitT`. A parent orb is 0 and may split
 *  once; a child is 1 and never does. */
const CHILD_GENERATION = 1;

class RhodesInstance implements WeaponInstance {
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    for (const dir of ctx.aimFan(RHODES_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
      // Homes, but lazily: the shared loop's turn rate is what makes this drift
      // rather than snap, and it is left slow on purpose.
      pr.homing = true;
      pr.homingRange = AIM_RANGE;
    }
  }

  reset(): void {}

  readonly projectile: ProjectileBehavior = {
    /** The bloom. Spending pierce as usual (returning true) keeps an orb from
     *  blooming on every body in a line — one arrival, one bloom. */
    onHit(ctx: WeaponContext, pr: Projectile, target): boolean {
      const child = pr.rehitT >= CHILD_GENERATION;
      const radius = RHODES_STATS.bloomRadius
        * (child ? RHODES_STATS.childBloomRadiusMul : 1);
      const bloom = pr.damage * RHODES_STATS.bloomDamageMul;
      for (const e of ctx.near(pr.x, pr.y, radius)) {
        if (e.dead || e === target) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) > radius + e.radius) continue;
        ctx.damage(e, bloom);
      }
      ctx.fx({ type: 'flash', x: pr.x, y: pr.y, radius, color: pr.color, dur: 0.22 });
      // Nightbloom. A LIVE read of ctx.evolved rather than pr.evolved, so an orb
      // already drifting when the chest lands still opens — the split happens at
      // the arrival, and the arrival is now.
      if (ctx.evolved && !child) splitOrb(ctx, pr);
      return true;
    },
  };
}

/** Nightbloom's split: three smaller orbs out of the arrival, fanned around the
 *  heading the parent came in on and homing like it did.
 *
 *  SPAWNED FROM INSIDE THE SHARED PROJECTILE LOOP, which is safe by that loop's
 *  own contract: pushProjectile appends, and updateProjectiles walks downward
 *  from the end, so a child lands above the cursor and takes its first step on
 *  the next frame rather than in the middle of its parent's. */
function splitOrb(ctx: WeaponContext, parent: Projectile): void {
  const conf: WeaponConf = {
    damage: parent.damage,
    speed: RHODES_STATS.childSpeed,
    radius: parent.radius * RHODES_STATS.childRadiusMul,
    lifetimeS: RHODES_STATS.childLifeS,
    pierce: 1,
  };
  const damage = parent.damage * RHODES_STATS.childDamageMul;
  // The parent's heading. A shot that died on a body it caught head-on still has
  // its velocity, and a degenerate zero vector can only happen if something else
  // stopped it — in which case any fan is as good as another.
  const heading = Math.atan2(parent.vy, parent.vx);
  for (let i = 0; i < RHODES_STATS.childCount; i++) {
    // Evenly across the fan: -spread, 0, +spread at three.
    const t = RHODES_STATS.childCount > 1 ? (i / (RHODES_STATS.childCount - 1)) * 2 - 1 : 0;
    const angle = heading + t * RHODES_STATS.childSpread;
    const orb = ctx.spawnProjectile(conf, damage);
    // Out of the ARRIVAL, not out of the player — spawnProjectile starts every
    // shot at the player, which is the wrong place for a shot that is a
    // consequence of something landing somewhere else.
    orb.x = parent.x;
    orb.y = parent.y;
    orb.vx = Math.cos(angle) * orb.speed;
    orb.vy = Math.sin(angle) * orb.speed;
    orb.homing = true;
    orb.homingRange = AIM_RANGE;
    orb.rehitT = CHILD_GENERATION;
  }
}

export const RHODES = {
  role: 'rhodes',
  stats: RHODES_STATS,
  create: () => new RhodesInstance(),
} satisfies WeaponModule;
