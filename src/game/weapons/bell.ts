// The Bell weapon module: a mallet strike that drops onto a distant enemy — and
// its evolution, Peal, where one trigger becomes a run of strikes marching away
// from the player, landing one after another on the sixteenths. Base and evolved
// live in the same module; evolving flips an internal mode (ctx.evolved).
//
// LED BY THE SOUND (#266). The bell is a struck marimba bar — sparse, high, and
// the note happens because something came DOWN on it. So the weapon reaches out
// and strikes: it picks a body at range, a moment passes, and the hit lands on
// that spot whether or not the body is still standing there.
//
// THE DELAY IS THE WEAPON. Every other ranged thing in the game travels — a
// shot you can watch cross the field. This does not travel at all; it simply
// arrives, and the short wind-up is the only warning. That makes it the one
// weapon whose damage depends on where an enemy WILL be, which is a different
// read from anything else in the palette.

import { AIM_RANGE, type WeaponConf } from '../config';
import type { WeaponContext, WeaponTarget } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface BellStats extends WeaponStats {
  /** Seconds between the mark appearing and the strike landing. */
  readonly windUpS: number;
  /** How far out it will look for something to hit. */
  readonly range: number;
  /** How many bodies the pick even considers, nearest first. Past this many the
   *  ones cut are always the farthest. */
  readonly pickCandidates: number;
  /** Bias of the weighted pick. Above 1 favours the near candidates, so the
   *  strike is usually close and occasionally long — the same shape of choice
   *  the chord's throw makes. */
  readonly pickFalloffPower: number;
  readonly shove: number;

  // ---------------- Peal (evolved) ------------------------------------------
  //
  // ONE BELL BECOMES A RUN OF THEM. A peal is bells struck one after another
  // rather than together — a tower playing down a line instead of a single note.
  // So the evolved trigger does not strike once: it marks a row of points
  // marching straight out from the player, starting on the body it picked and
  // stepping past it into whatever is standing behind, and they land IN ORDER.
  //
  // THE SEQUENCE IS THE WEAPON, exactly as the delay is the weapon in base mode.
  // Nothing else in the game turns one trigger into an ordered series of arrivals
  // — every other multi-shape evolution puts its whole footprint down at once —
  // and the strikes fall on the SIXTEENTHS of the soundset's own pulse, so the
  // run is audible as rhythm even though the chart played one note.
  //
  // IT ESCALATES. The first strike is smaller than a base one and the last is
  // half again as big, which is what makes the run read as building rather than
  // as five copies. The heavy one lands furthest out, so the reward for a peal
  // that finds a deep line of bodies is the biggest hit the weapon has.
  //
  // THE PICK IS UNCHANGED, and deliberately so: the same weighted draw chooses
  // where the run starts, so the rng stream costs exactly what it did in base
  // mode — one draw, at the same statement.

  /** Strikes in a run. */
  readonly pealStrikes: number;
  /** World units between one strike and the next, marching outward. */
  readonly pealStepDist: number;
  /** Seconds between arrivals. A sixteenth at the soundset's 122 bpm, so the run
   *  lands on the grid the player is already hearing. */
  readonly pealStepS: number;
  /** Damage of the first and last strike as multiples of the tier's. The first is
   *  under a base strike, the last well over it. */
  readonly pealFirstDamageMul: number;
  readonly pealLastDamageMul: number;
  /** Radius of the last strike as a multiple of the first's. The run gets wider
   *  as it gets heavier. */
  readonly pealRadiusGrowth: number;
}

const BELL_STATS: BellStats = {
  tiers: [
    { damage: 12, radius: 66 },
    { damage: 15, radius: 66 },
    { damage: 18, radius: 74 },
    { damage: 21, radius: 74 },
    { damage: 24, radius: 82 },
    { damage: 27, radius: 82 },
    { damage: 31, radius: 90 },
    { damage: 36, radius: 98 },
  ],
  tierLines: [
    'a strike that falls out of nowhere',
    'harder',
    'wider impact',
    'harder',
    'wider impact',
    'harder',
    'wider impact',
    'maximum force',
  ],
  windUpS: 0.32,
  range: AIM_RANGE,
  pickCandidates: 16,
  pickFalloffPower: 2,
  shove: 26,

  pealStrikes: 5,
  pealStepDist: 110,
  pealStepS: 60 / 122 / 4,
  pealFirstDamageMul: 0.6,
  pealLastDamageMul: 1.5,
  pealRadiusGrowth: 1.35,
};

interface PendingStrike {
  x: number;
  y: number;
  radius: number;
  damage: number;
  landsAt: number;
}

class BellInstance implements WeaponInstance {
  private pending: PendingStrike[] = [];

  /** A WEIGHTED RANDOM PICK, not always the nearest. Always striking the closest
   *  body made this weapon predictable and redundant — everything else in a build
   *  is already hitting whatever is nearest, so a sparse heavy hit spent itself on
   *  a target that was about to die anyway. Picking among the near candidates,
   *  biased toward the close ones, is how the chord chooses where to throw, and it
   *  gives this weapon the same useful property: it reaches past the front rank
   *  often enough to matter.
   *
   *  SHARED BY BOTH MODES, which is what keeps the rng identical across the
   *  evolution: exactly one draw, at this statement, whether the trigger becomes
   *  one strike or a run of five. */
  private pick(ctx: WeaponContext): WeaponTarget | undefined {
    const candidates = ctx.nearestEnemies(BELL_STATS.range, BELL_STATS.pickCandidates);
    if (!candidates.length) return undefined;
    return candidates[Math.min(
      candidates.length - 1,
      Math.floor(Math.pow(ctx.rng(), BELL_STATS.pickFalloffPower) * candidates.length),
    )];
  }

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    const target = this.pick(ctx);
    if (ctx.evolved) {
      this.firePeal(ctx, conf, target);
      return;
    }
    const p = ctx.player;
    const x = target?.x ?? p.x;
    const y = target?.y ?? p.y;
    this.pending.push({
      x,
      y,
      radius: conf.radius!,
      damage: conf.damage,
      landsAt: ctx.timeS + BELL_STATS.windUpS,
    });
    // The mark, at the strike's FULL radius so it tells the truth about what is
    // about to be hit. A soft half-size ring was invisible in a crowded field,
    // which made the whole weapon look like it did nothing until bodies fell
    // over for no reason.
    ctx.fx({ type: 'ring', x, y, radius: conf.radius!, color: ctx.color, dur: BELL_STATS.windUpS });
  }

  /** Peal: a row of strikes marching straight out from the player, beginning on
   *  the body the pick chose and stepping past it, each one landing a sixteenth
   *  after the last and hitting harder than it.
   *
   *  NOTHING NEW IS SCHEDULED HERE — these are ordinary PendingStrikes with later
   *  `landsAt` values, so tick() resolves the whole run with no knowledge that a
   *  peal exists, and reset() drops a half-finished one for free.
   *
   *  WITH AN EMPTY SCREEN it marches along the player's WALK HEADING, which draws
   *  no rng at all (ctx.aimDir would draw one or two more and change what this
   *  weapon costs the stream). Base mode drops its strike on the player in that
   *  case; a run of five on top of the player would be the same shape five times,
   *  so this one walks away instead. */
  private firePeal(ctx: WeaponContext, conf: WeaponConf, target: WeaponTarget | undefined): void {
    const p = ctx.player;
    let ux: number;
    let uy: number;
    let startDist: number;
    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      // A body standing exactly on the player has no direction to offer; the walk
      // heading is the honest fallback there too.
      if (d > 1) {
        ux = dx / d;
        uy = dy / d;
        startDist = d;
      } else {
        const dir = ctx.moveDir();
        ux = dir.x;
        uy = dir.y;
        startDist = BELL_STATS.pealStepDist;
      }
    } else {
      const dir = ctx.moveDir();
      ux = dir.x;
      uy = dir.y;
      startDist = BELL_STATS.pealStepDist;
    }

    const last = BELL_STATS.pealStrikes - 1;
    for (let i = 0; i < BELL_STATS.pealStrikes; i++) {
      // 0 on the first strike, 1 on the last: every escalation below is one lerp
      // along this, so the run's shape is stated once.
      const t = last > 0 ? i / last : 0;
      const dist = startDist + BELL_STATS.pealStepDist * i;
      const x = p.x + ux * dist;
      const y = p.y + uy * dist;
      const radius = conf.radius! * (1 + (BELL_STATS.pealRadiusGrowth - 1) * t);
      const damage = conf.damage
        * (BELL_STATS.pealFirstDamageMul
          + (BELL_STATS.pealLastDamageMul - BELL_STATS.pealFirstDamageMul) * t);
      const delay = BELL_STATS.windUpS + BELL_STATS.pealStepS * i;
      this.pending.push({ x, y, radius, damage, landsAt: ctx.timeS + delay });
      // Every mark goes up AT ONCE, each lasting until its own strike lands — so
      // the player reads the whole run the moment it is called and can see where
      // the heavy one at the end is going to fall.
      ctx.fx({ type: 'ring', x, y, radius, color: ctx.color, dur: delay });
    }
  }

  tick(ctx: WeaponContext): void {
    const now = ctx.timeS;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const strike = this.pending[i];
      if (now < strike.landsAt) continue;
      this.pending.splice(i, 1);
      for (const e of ctx.near(strike.x, strike.y, strike.radius + 24)) {
        if (e.dead) continue;
        if (Math.hypot(e.x - strike.x, e.y - strike.y) > strike.radius + e.radius) continue;
        ctx.damage(e, strike.damage);
        ctx.shove(e, strike.x, strike.y, BELL_STATS.shove);
      }
      ctx.fx({ type: 'slam', x: strike.x, y: strike.y, radius: strike.radius, color: ctx.color });
    }
  }

  /** Drops every scheduled strike — clearSandboxEntities promises no delayed
   *  strike survives, and this module is the palette's only holder of one. */
  reset(): void {
    this.pending.length = 0;
  }
}

export const BELL = {
  role: 'bell',
  stats: BELL_STATS,
  tickAt: 'strikes' satisfies TickPhase,
  create: () => new BellInstance(),
} satisfies WeaponModule;
