// The Shaker weapon module: a wide scatter of tiny fast grains.
//
// LED BY THE SOUND (#266). A shaker is not one sound, it is a mass of beads
// arriving at once — and it is the densest voice in the palette, up to twelve a
// bar. So it does not fire a shot: it throws a handful, spread wide, none of
// them aimed at anything in particular.
//
// UNAIMED, AND THAT IS THE TRADE. The hat also fires fast, but every chip it
// throws finds a target; these go where the player is FACING and nowhere else,
// so the weapon rewards pointing yourself at the crowd. Individually the grains
// are the weakest hits in the game. Together, twelve times a bar, they are a
// cone of attrition.

import type { WeaponConf } from '../config';
import type { WeaponContext } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

interface ShakerStats extends WeaponStats {
  /** Grains thrown per trigger. */
  readonly grains: number;
  /** Half-angle of the scatter, radians. Wide: this is a handful, not a burst. */
  readonly spread: number;
  /** Per-grain speed jitter, as a fraction. Uneven grains are what make it
   *  read as a scatter rather than as a formation. */
  readonly speedJitter: number;
}

const SHAKER_STATS: ShakerStats = {
  tiers: [
    { damage: 3, speed: 430, radius: 6, lifetimeS: 0.42, pierce: 1 },
    { damage: 3.5, speed: 430, radius: 6, lifetimeS: 0.42, pierce: 1 },
    { damage: 4, speed: 455, radius: 6, lifetimeS: 0.48, pierce: 1 },
    { damage: 4.5, speed: 455, radius: 7, lifetimeS: 0.48, pierce: 2 },
    { damage: 5, speed: 480, radius: 7, lifetimeS: 0.54, pierce: 2 },
    { damage: 5.5, speed: 480, radius: 7, lifetimeS: 0.54, pierce: 2 },
    { damage: 6.2, speed: 505, radius: 8, lifetimeS: 0.6, pierce: 3 },
    { damage: 7, speed: 505, radius: 8, lifetimeS: 0.66, pierce: 3 },
  ],
  tierLines: [
    'a handful of grains, thrown wide',
    'damage up',
    'faster, further',
    'grains cut through two',
    'damage up, further',
    'damage up',
    'faster, cuts through three',
    'maximum scatter',
  ],
  grains: 4,
  spread: 0.42,
  speedJitter: 0.28,
};

class ShakerInstance implements WeaponInstance {
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    // The walk heading, like the snare: this weapon is aimed by steering, and
    // it draws no rng doing so. All the rng it spends is the scatter itself.
    const base = ctx.moveDir();
    const baseAngle = Math.atan2(base.y, base.x);
    for (let i = 0; i < SHAKER_STATS.grains; i++) {
      const angle = baseAngle + (ctx.rng() * 2 - 1) * SHAKER_STATS.spread;
      const pr = ctx.spawnProjectile(conf, conf.damage);
      const speed = pr.speed * (1 + (ctx.rng() * 2 - 1) * SHAKER_STATS.speedJitter);
      pr.vx = Math.cos(angle) * speed;
      pr.vy = Math.sin(angle) * speed;
    }
  }

  /** Grains are ordinary projectiles on the shared loop: they travel, spend
   *  pierce and expire on their own. Nothing owned, nothing scheduled. */
  reset(): void {}
}

export const SHAKER = {
  role: 'shaker',
  stats: SHAKER_STATS,
  create: () => new ShakerInstance(),
} satisfies WeaponModule;
