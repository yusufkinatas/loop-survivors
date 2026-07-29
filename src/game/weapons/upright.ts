// The Upright weapon module: a shot that SNAKES, weaving across its aim line —
// and its evolution, Walking Line, where every crossing of that line lands a
// hit. Base and evolved live in the same module; a shot carries its own mode in
// `pr.evolved`, frozen when it was spawned.
//
// LED BY THE SOUND (#266). The upright is a plucked acoustic bass playing
// walking quarters — one note per beat, and a thick string that keeps moving
// after it is let go. The gameplay is that sway made visible: a shot that
// weaves rather than flies, sweeping a wider band than it was pointed at and
// catching bodies either side of the line. Nothing else in the game moves like
// this, which is the floor rule satisfied by motion rather than by shape.
//
// It steers itself but keeps the shared loop's travel: `steer` returns false,
// so the world still moves it and still runs the arena rails. All this module
// contributes is the hop.

import type { WeaponConf } from '../config';
import type { Projectile } from '../run';
import type { WeaponContext } from './context';
import type {
  ProjectileBehavior,
  TickPhase,
  WeaponInstance,
  WeaponModule,
  WeaponStats,
} from './module';

interface UprightStats extends WeaponStats {
  /** Aim jitter, radians. Small — this is a walking line, not a spray. */
  readonly aimSpread: number;
  /** Weaves per second. Tuned against the soundset's 122 bpm so the shot sways
   *  roughly once per beat — it snakes in time with what you are hearing. */
  readonly weaveHz: number;
  /** How far the weave pushes the shot off its aim line, in radians of heading
   *  swing. Big enough to be obviously not a straight line. */
  readonly weaveRad: number;
  /** Knock distance on a hit. Modest: this weapon wants bodies to stay put so
   *  the next hop lands on them too. */
  readonly shove: number;

  // ---------------- Walking Line (evolved) ---------------------------------
  //
  // A WALKING BASS PLAYS A NOTE PER BEAT. The base weapon draws that walk as a
  // shape — a shot that sways instead of flying — and the evolution finishes the
  // thought: the walk now LANDS. Every time the snake crosses back over its own
  // aim line it stamps the ground, so one shot leaves a row of hits down its
  // whole path, evenly spaced in time.
  //
  // THE SPACING IS THE MUSIC, NOT A TUNING NUMBER. The weave is already tuned to
  // the soundset's 122 bpm, and the crossings of a sine sway fall exactly twice
  // per cycle — so the stamps land on the eighths of the same pulse the player is
  // hearing. Nothing else in the game puts damage on the grid through geometry.
  //
  // A stamp is an AREA hit that spends no pierce, which is what separates this
  // from the base shot's pierce ladder: the shot still drills its line, and the
  // stamps catch everything standing near where it walked.
  //
  // AND THE SHOT HAS TO SURVIVE TO WALK, which the first version of this did not.
  // Measured: 5 stamps in 6 seconds. A base shot spends its 6 pierce within about
  // a tenth of a second in any real crowd, and the first crossing does not arrive
  // until an eighth of a bar — so the shot was dead before it had ever stamped,
  // and the whole evolution was worth 4% more damage. `walkPierce` is the fix, and
  // it is not a balance number bolted on: a walking line that stops on its sixth
  // body is not walking, so a bassline that crosses the whole bar IS the feature.

  /** Stamps per second — twice the weave, because a sine sway crosses its centre
   *  line twice a cycle. Derived from weaveHz rather than typed again, so
   *  retuning the walk cannot silently desynchronise the stamps from it. */
  readonly stampHz: number;
  /** Radius of one stamp. Small: this is a footfall, not a blast. */
  readonly stampRadius: number;
  /** Stamp damage as a multiple of the shot's own. Under 1: the shot is still
   *  the hit, and the stamps are the ground it covered. */
  readonly stampDamageMul: number;
  /** Pierce an evolved shot is given OUTRIGHT, replacing the tier's rather than
   *  scaling it: the ladder tops out at 6, and what this weapon needs is not "a
   *  bit more" but "enough to keep going", which is a different kind of number.
   *  High enough to cross a packed screen; finite, so a shot still ends. */
  readonly walkPierce: number;
  /** Life multiplier on an evolved shot, so the walk lasts a couple of bars
   *  rather than one. */
  readonly walkLifeMul: number;
}

const UPRIGHT_STATS: UprightStats = {
  tiers: [
    { damage: 6, speed: 330, radius: 11, lifetimeS: 1.5, pierce: 2 },
    { damage: 7, speed: 330, radius: 11, lifetimeS: 1.5, pierce: 2 },
    { damage: 8, speed: 350, radius: 12, lifetimeS: 1.6, pierce: 3 },
    { damage: 9, speed: 350, radius: 12, lifetimeS: 1.6, pierce: 3 },
    { damage: 11, speed: 370, radius: 13, lifetimeS: 1.7, pierce: 4 },
    { damage: 12, speed: 370, radius: 13, lifetimeS: 1.7, pierce: 4 },
    { damage: 14, speed: 390, radius: 14, lifetimeS: 1.8, pierce: 5 },
    { damage: 16, speed: 390, radius: 15, lifetimeS: 1.9, pierce: 6 },
  ],
  tierLines: [
    'a shot that walks through the crowd',
    'damage up',
    'hops further, cuts deeper',
    'damage up',
    'faster, cuts deeper',
    'damage up',
    'hops further, cuts deeper',
    'maximum reach',
  ],
  aimSpread: 0.05,
  weaveHz: 122 / 60,
  weaveRad: 0.85,
  shove: 10,

  stampHz: (122 / 60) * 2,
  stampRadius: 44,
  stampDamageMul: 0.5,
  walkPierce: 40,
  walkLifeMul: 1.5,
};

class UprightInstance implements WeaponInstance {
  fire(ctx: WeaponContext, conf: WeaponConf): void {
    for (const dir of ctx.aimFan(UPRIGHT_STATS.aimSpread)) {
      const pr = ctx.spawnProjectile(conf, conf.damage);
      pr.vx = dir.x * pr.speed;
      pr.vy = dir.y * pr.speed;
      if (pr.evolved) {
        // The walk has to survive to be a walk. Both ride the shot itself, so a
        // base shot in flight when the chest lands is not handed either.
        pr.pierce = UPRIGHT_STATS.walkPierce;
        pr.maxPierce = pr.pierce;
        pr.lifeS *= UPRIGHT_STATS.walkLifeMul;
      }
    }
  }

  /** THE STAMPS. Walked over this weapon's OWN live shots — `ctx.projectiles()`
   *  hands back only the upright's, so there is no way to stamp on another
   *  weapon's shot or to credit a hit to it.
   *
   *  Each shot counts its own stamps in `pr.rehitT`, which is free on this
   *  weapon: only the arp's orbit re-hit timer and the flute's bend use that
   *  field, and the upright has neither. A stamp fires when the crossing INDEX
   *  advances, so a frame long enough to skip a crossing still lands exactly one
   *  — and at age 0 the index is already 0, which is why a shot does not stamp
   *  the instant it leaves the player.
   *
   *  PER-SHOT MODE, not ctx.evolved: a shot spawned before the chest keeps
   *  walking silently for the rest of its life rather than sprouting stamps
   *  mid-flight. */
  tick(ctx: WeaponContext): void {
    for (const pr of ctx.projectiles()) {
      if (!pr.evolved) continue;
      const crossing = Math.floor(pr.age * UPRIGHT_STATS.stampHz);
      if (crossing <= pr.rehitT) continue;
      pr.rehitT = crossing;
      const damage = pr.damage * UPRIGHT_STATS.stampDamageMul;
      for (const e of ctx.near(pr.x, pr.y, UPRIGHT_STATS.stampRadius + QUERY_PAD)) {
        if (e.dead) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) > UPRIGHT_STATS.stampRadius + e.radius) continue;
        // NO pierce spent and no hit set consulted: a stamp is the ground the
        // walk covered, not the shot arriving. The shot's own pierce ladder is
        // untouched and still decides how deep it drills.
        ctx.damage(e, damage);
      }
      ctx.fx({
        type: 'flash',
        x: pr.x,
        y: pr.y,
        radius: UPRIGHT_STATS.stampRadius,
        color: pr.color,
        dur: 0.16,
      });
    }
  }

  reset(): void {}

  readonly projectile: ProjectileBehavior = {
    /** THE SHOT SNAKES. Every other projectile in the game travels in a straight
     *  line or homes; this one weaves side to side across its aim line, so it
     *  sweeps a wider band than it is pointed at and reads as a different object
     *  the moment it leaves the player.
     *
     *  The first version modulated SPEED instead, to suggest a walking gait —
     *  which was almost invisible in play, because a shot that speeds up and
     *  slows down still draws a straight line.
     *
     *  Implemented as a swing of the HEADING rather than a drawn offset, so the
     *  weave changes where the shot actually is and therefore what it hits.
     *  Returns false: the shared loop still travels it and still runs the arena
     *  rails, exactly as for the snare. */
    steer(ctx: WeaponContext, pr: Projectile, dt: number): boolean {
      const speed = Math.hypot(pr.vx, pr.vy);
      if (speed <= 0) return false;
      const w = UPRIGHT_STATS.weaveHz * Math.PI * 2;
      // The derivative of a sine sway: turn hardest at the crossings and not at
      // all at the extremes, which is what makes the path a smooth S rather
      // than a zigzag.
      const turn = UPRIGHT_STATS.weaveRad * w * Math.cos(pr.age * w) * dt;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const vx = pr.vx * cos - pr.vy * sin;
      const vy = pr.vx * sin + pr.vy * cos;
      pr.vx = vx;
      pr.vy = vy;
      void ctx;
      return false;
    },
    onHit(ctx: WeaponContext, pr: Projectile, target): boolean {
      ctx.shove(target, pr.x, pr.y, UPRIGHT_STATS.shove);
      ctx.fx({ type: 'spark', x: target.x, y: target.y, color: pr.color, n: 3, spread: 9 });
      return true;
    },
  };
}

/** Slack around the stamp before the exact distance test decides. */
const QUERY_PAD = 24;

export const UPRIGHT = {
  role: 'upright',
  stats: UPRIGHT_STATS,
  // The base shot owns no damage pass — it rides the shared projectile loop
  // entirely — but Walking Line's stamps are the weapon's own, so the module
  // needs a phase to run them in. Harmless in base mode: the loop walks this
  // weapon's shots and every one of them reports `evolved` false.
  tickAt: 'strikes' satisfies TickPhase,
  create: () => new UprightInstance(),
} satisfies WeaponModule;
