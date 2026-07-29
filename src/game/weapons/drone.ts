// The Drone weapon module: a heavy low field left standing where you were — and
// its evolution, Feedback Loop, where the fields hold far longer and wire
// themselves to each other. Base and evolved live in the same module; evolving
// flips an internal mode (ctx.evolved).
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
import { distanceToSegment } from '../spatial';
import type { WeaponContext } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface DroneStats extends WeaponStats {
  /** Seconds a field lasts. Very long — this voice fires as little as once
   *  every four bars, so each field has to still be there when the next lands
   *  or the weapon is silent most of the run. */
  readonly lifeS: number;
  /** Seconds between damage passes inside a field. */
  readonly tickS: number;

  // ---------------- Feedback Loop (evolved) --------------------------------
  //
  // TWO HELD NOTES TOGETHER ARE NOT TWO NOTES. That is the whole of this
  // evolution: the base plants one sustained field at a time and abandons it, so
  // the weapon never gets to be more than one place at once. Evolved, the fields
  // hold long enough to OVERLAP IN TIME, and every pair of neighbours strings a
  // live cable between them — a feedback path between two things that are both
  // still sounding. Three or more close the ring.
  //
  // THE LONGER HOLD IS HALF THE EVOLUTION, not a stat bump attached to it. The
  // drone's chart fires about once every four bars, and a 7.5 s field expires at
  // roughly the moment the next one lands, so at base life there is almost never
  // a second field for a cable to reach. Wiring without the hold would be a
  // feature the player could not see.
  //
  // AND IT MAKES PLACEMENT THE WEAPON. The base already marks a place; now the
  // ORDER you marked them in draws the shape, so the player is laying out a net
  // rather than dropping mines. That is the only graph-shaped weapon in the
  // game, base or evolved.

  /** Field life multiplier once evolved. Long enough that several coexist and
   *  the net has something to be a net between. */
  readonly evolvedLifeMul: number;
  /** How many fields may be live at once, evolved. The oldest is dropped past
   *  this, which keeps the net a readable shape rather than a thicket — and
   *  keeps the cable pass linear in the cap rather than in the run length. */
  readonly evolvedMaxFields: number;
  /** Half-thickness of a cable, in world units. */
  readonly cableHalfWidth: number;
  /** Seconds between damage passes along the cables. Faster than a field's: a
   *  body walks ACROSS a cable rather than standing in it, so a slow cadence
   *  would let most of them through untouched. */
  readonly cableTickS: number;
  /** Cable damage as a multiple of the weaker endpoint's own. */
  readonly cableDamageMul: number;
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

  evolvedLifeMul: 2.2,
  evolvedMaxFields: 5,
  cableHalfWidth: 11,
  cableTickS: 0.2,
  cableDamageMul: 0.7,
};

interface Field {
  /** Identity for the view, so each field keeps its own graphic. Fields do not
   *  move, but they overlap and expire independently — sharing one key would
   *  make them fight over a single graphic. */
  key: string;
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
  private nextKey = 0;
  /** Countdown to the next damage pass along the cables. One timer for all of
   *  them, because the net is one object: cables that each ticked on their own
   *  schedule would fire in a stutter as fields came and went. */
  private cableTickT = 0;

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const p = ctx.player;
    const evolved = ctx.evolved;
    this.fields.push({
      key: `drone:${this.nextKey++}`,
      x: p.x,
      y: p.y,
      radius: conf.radius!,
      damage: conf.damage,
      lifeS: DRONE_STATS.lifeS
        * (evolved ? DRONE_STATS.evolvedLifeMul : 1)
        * ctx.buildMods.durationMul,
      tickT: 0,
    });
    // Oldest out first, so the net keeps its shape and the newest place the
    // player chose is always in it. Only evolved: base fields expire before
    // there are ever this many.
    while (evolved && this.fields.length > DRONE_STATS.evolvedMaxFields) this.fields.shift();
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
      ctx.fx({ type: 'aura', x: field.x, y: field.y, radius: field.radius, color: ctx.color, key: field.key });
      field.tickT -= dt;
      if (field.tickT > 0) continue;
      field.tickT = DRONE_STATS.tickS;
      for (const e of ctx.near(field.x, field.y, field.radius + QUERY_PAD)) {
        if (e.dead) continue;
        if (Math.hypot(e.x - field.x, e.y - field.y) > field.radius + e.radius) continue;
        ctx.damage(e, field.damage);
      }
    }

    this.tickCables(ctx, dt);
  }

  /** Feedback Loop's cables: a live line between each neighbouring pair of
   *  fields, in the order they were planted, closing back to the oldest once
   *  there are three.
   *
   *  A LIVE READ OF ctx.evolved, deliberately unlike the fields themselves and
   *  unlike a chord zone's frozen mode. A cable is a property of the PAIR, not of
   *  either field, so there is no one spawn moment to freeze it at — and a field
   *  planted a moment before the chest sitting unwired inside a net would read as
   *  a bug rather than as a rule.
   *
   *  TWO CLOCKS, as everywhere else in this file: the net is DRAWN every frame,
   *  because it is simply there, and it BITES on its own slower cadence. */
  private tickCables(ctx: WeaponContext, dt: number): void {
    const live = this.fields.length;
    if (!ctx.evolved || live < 2) {
      // Reset rather than let it run down while unwired, so the first cable to
      // appear bites immediately instead of inheriting a stale countdown.
      this.cableTickT = 0;
      return;
    }
    this.cableTickT -= dt;
    const bites = this.cableTickT <= 0;
    if (bites) this.cableTickT = DRONE_STATS.cableTickS;

    // Two fields are one cable; three or more close the ring, which is what
    // makes the shape a loop rather than a chain.
    const cables = live >= 3 ? live : live - 1;
    for (let k = 0; k < cables; k++) {
      const a = this.fields[k];
      const b = this.fields[(k + 1) % live];
      ctx.fx({
        type: 'beam',
        x: a.x,
        y: a.y,
        x2: b.x,
        y2: b.y,
        width: DRONE_STATS.cableHalfWidth,
        color: ctx.color,
        // Steady: a cable that is redrawn additively every frame saturates to
        // solid white within a few frames, exactly as the organ's beam did.
        steady: true,
        dur: 0.06,
      });
      if (!bites) continue;
      // As strong as its WEAKER end. A cable is not a third field with numbers
      // of its own, and picking the minimum means a fresh high-level field
      // cannot quietly upgrade an old low-level one it happens to reach.
      const damage = Math.min(a.damage, b.damage) * DRONE_STATS.cableDamageMul;
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      const half = Math.hypot(b.x - a.x, b.y - a.y) * 0.5;
      const query = half + DRONE_STATS.cableHalfWidth + QUERY_PAD;
      for (const e of ctx.near(midX, midY, query)) {
        if (e.dead) continue;
        if (distanceToSegment(e.x, e.y, a.x, a.y, b.x, b.y)
          > DRONE_STATS.cableHalfWidth + e.radius) continue;
        ctx.damage(e, damage);
      }
    }
  }

  reset(): void {
    this.fields.length = 0;
    this.nextKey = 0;
    this.cableTickT = 0;
  }
}

export const DRONE = {
  role: 'drone',
  stats: DRONE_STATS,
  tickAt: 'zones' satisfies TickPhase,
  create: () => new DroneInstance(),
} satisfies WeaponModule;
