// The Drone weapon module: a heavy low field left standing where you were.
//
// LED BY THE SOUND (#266). The drone is one bowed note per phrase that holds
// and does not move. So its weapon does not move either: it drops where the
// player stands and stays there, damaging anything that walks in, long after
// the player has gone. It is the only weapon in the game that marks a PLACE.
//
// NOT AN AURA and not the chord's zone. The texture beds follow the player; the
// chord throws its zone ONTO the pack at range. This one is dropped underfoot
// and abandoned, which makes it a positioning tool — you lay them where you
// intend to come back to, or where you need the crowd not to follow.

import type { WeaponConf } from '../config';
import type { WeaponContext } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface DroneStats extends WeaponStats {
  /** Seconds a field lasts. Very long — this voice fires as little as once
   *  every four bars, so each field has to still be there when the next lands
   *  or the weapon is silent most of the run. */
  readonly lifeS: number;
  /** Seconds between damage passes inside a field. */
  readonly tickS: number;
}

const DRONE_STATS: DroneStats = {
  // Damage is PER TICK for the field's whole life, so the per-number value is
  // small by design; the total is the number times how long a body stays in it.
  tiers: [
    { damage: 2, radius: 86 },
    { damage: 2.4, radius: 86 },
    { damage: 2.8, radius: 98 },
    { damage: 3.2, radius: 98 },
    { damage: 3.6, radius: 110 },
    { damage: 4.1, radius: 110 },
    { damage: 4.6, radius: 122 },
    { damage: 5.2, radius: 134 },
  ],
  tierLines: [
    'a low field that stays where you leave it',
    'heavier',
    'wider ground',
    'heavier',
    'wider ground',
    'heavier',
    'wider ground',
    'maximum hold',
  ],
  lifeS: 7.5,
  tickS: 0.4,
};

interface Field {
  x: number;
  y: number;
  radius: number;
  damage: number;
  lifeS: number;
  tickT: number;
}

const QUERY_PAD = 24;

class DroneInstance implements WeaponInstance {
  private fields: Field[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    this.fields.push({
      x: p.x,
      y: p.y,
      radius: conf.radius!,
      damage: conf.damage,
      lifeS: DRONE_STATS.lifeS * ctx.buildMods.durationMul,
      tickT: 0,
    });
    // A hard ring on the way in, so the moment it is planted is legible.
    ctx.fx({ type: 'ring', x: p.x, y: p.y, radius: conf.radius!, color: ctx.color, dur: 0.4 });
  }

  /** THE FIELD IS THIS MODULE'S OWN, not one of the world's zones.
   *
   *  `ctx.zones()` hands back EVERY zone on the field and the chord module steps
   *  all of them, damaging on CHORD_STATS.tickS and crediting every hit to the
   *  chord. A field spawned through the shared array would tick on another
   *  weapon's cadence, pay its damage to another weapon's total, and freeze
   *  solid for a player who does not own the chord.
   *
   *  It also never drifts. The chord's evolved zones crawl toward bodies; this
   *  one is a PLACE the player chose, and a place that walks away is not one. */
  tick(ctx: WeaponContext, dt: number): void {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const field = this.fields[i];
      field.lifeS -= dt;
      if (field.lifeS <= 0) {
        this.fields.splice(i, 1);
        continue;
      }
      // Steady, at the exact damage radius, redrawn every frame — the same read
      // as the texture auras, because it is the same kind of object. A field
      // that pulsed would look like it was firing; this one is just there, and
      // "just there" is the whole point of a weapon that marks a place.
      ctx.fx({ type: 'aura', x: field.x, y: field.y, radius: field.radius, color: ctx.color, dur: 0.1 });
      field.tickT -= dt;
      if (field.tickT > 0) continue;
      field.tickT = DRONE_STATS.tickS;
      for (const e of ctx.near(field.x, field.y, field.radius + QUERY_PAD)) {
        if (e.dead) continue;
        if (Math.hypot(e.x - field.x, e.y - field.y) > field.radius + e.radius) continue;
        ctx.damage(e, field.damage);
      }
    }
  }

  reset(): void {
    this.fields.length = 0;
  }
}

export const DRONE = {
  role: 'drone',
  stats: DRONE_STATS,
  tickAt: 'zones' satisfies TickPhase,
  create: () => new DroneInstance(),
} satisfies WeaponModule;
