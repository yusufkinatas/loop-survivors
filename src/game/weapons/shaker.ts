// The Shaker weapon module: a wide scatter of tiny fast grains — and its
// evolution, Rattlebox, where the grains stop expiring and start bouncing off the
// walls of the arena. Base and evolved live in the same module; a grain carries
// its own mode in `pr.evolved`, frozen when it was thrown.
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

  // ---------------- Rattlebox (evolved) ------------------------------------
  //
  // A SHAKER IS BEADS IN A BOX. The base weapon has the beads but not the box:
  // the grains are thrown out into the world and expire wherever they got to. The
  // evolution gives them the walls back — they RICOCHET, off the arena rails,
  // again and again, so the handful the player threw keeps working the field long
  // after they threw it and from angles they never aimed at.
  //
  // WHICH FIXES THE BASE'S OWN COMPLAINT. The base trade is that the grains go
  // where the player is facing and nowhere else; that is honest, and it is also
  // why they are the weakest hits in the game. Bouncing does not make them aimed —
  // they are still unaimed, which is the identity — it makes the whole arena the
  // place they end up, so facing the crowd stops being the only way to be useful.
  //
  // THE ONE THING IN THE GAME THAT BOUNCES BY DESIGN. The shared projectile loop
  // has always had arena rails, and a lane chip crosses them incidentally because
  // its reach happens to be longer than the arena; nothing has ever been built
  // around them. A rattling grain is.
  //
  // NO steer, DELIBERATELY. Steering is what takes a shot off shared travel AND
  // off the rails together (ADR-0002), so a module that steered its grains would
  // be the one module that cannot have this evolution.

  /** Bounces a grain is given, on top of whatever the build supplies. Enough to
   *  cross the arena several times. */
  readonly rattleBounces: number;
  /** How much of its speed a grain keeps through a bounce. High: a bead that came
   *  off the wall limp would fall out of the rattle immediately. */
  readonly rattleRetention: number;
  /** Life multiplier, so a grain lives long enough to reach a wall and come back
   *  rather than expiring in mid-air. This is the change that makes the bounces
   *  reachable at all. */
  readonly rattleLifeMul: number;
  /** Pierce a rattling grain is given, replacing the tier's 3.
   *
   *  WITHOUT THIS THE EVOLUTION WAS A DOWNGRADE, and measurably: a grain spends
   *  three pierce within about a fifth of a second in any real crowd, so it died on
   *  bodies long before it ever reached a wall. The bench read exactly 0.80 —
   *  precisely the damage trim that used to sit here and nothing else, because the
   *  bounces never happened at all. Life alone cannot fix that; a grain has to
   *  survive the crowd to get to the wall, which is the whole point of a bead in a
   *  box. The damage trim went with it: the bounce already costs 8% a wall through
   *  the shared loop's own bounceRetention, which is the honest place for that
   *  cost to live. */
  readonly rattlePierce: number;
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

  rattleBounces: 4,
  rattleRetention: 0.92,
  rattleLifeMul: 3.2,
  rattlePierce: 12,
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
      if (pr.evolved) {
        // Rattlebox. Every one of these is a FIELD ON THE SHOT, which is the whole
        // reason the shared loop needs no knowledge of this evolution: it already
        // bounces anything with bounces left, and now these have some.
        //
        // ADDED to the build's own bounces rather than overwriting them: a stack
        // that raises bounceCount is stating something about every projectile, and
        // a weapon that clobbered it would be quietly opting out.
        pr.bounces += SHAKER_STATS.rattleBounces;
        pr.bounceRetention = SHAKER_STATS.rattleRetention;
        pr.lifeS *= SHAKER_STATS.rattleLifeMul;
        pr.pierce = SHAKER_STATS.rattlePierce;
        pr.maxPierce = pr.pierce;
      }
    }
  }

  /** Grains are ordinary projectiles on the shared loop: they travel, bounce,
   *  spend pierce and expire on their own. Nothing owned, nothing scheduled. */
  reset(): void {}
}

export const SHAKER = {
  role: 'shaker',
  stats: SHAKER_STATS,
  create: () => new ShakerInstance(),
} satisfies WeaponModule;
