// The texture seat's two weapons: fields that hurt whatever stands in them.
//
// LED BY THE SOUND (#266). `pad` and `air` are BEDS — they have no firing
// moment at all, they are simply on. So their weapons have no firing moment
// either: no shot, no swing, no trigger. A field surrounds the player and
// damages continuously for as long as the weapon is owned.
//
// THIS IS THE ONE PLACE THE CONTROL IS INVENTED RATHER THAN REPRODUCED, and
// #266 flagged it rather than hiding it. Every other weapon in the game is
// driven by a chart trigger; these are driven by a clock, because a held sound
// has no trigger to be driven by. #255's audibility rule permits it — silence
// means not attacking, but an audible event need not produce exactly one
// attack.
//
// DAMAGE ONLY. No slow, no pull, no push. The designer's worry was a base that
// plays itself — "I don't wanna create a super safe feeling for players where
// they can easily break the game by just getting this area weapon" — and it is
// the right worry: a defensive aura that is always on removes positioning,
// which is the whole skill of the genre. A field that only damages does the
// opposite. It has no reach, so it only does anything when you walk INTO the
// crowd, which is what makes Garlic the most aggressive weapon in Vampire
// Survivors rather than the safest.
//
// The two sit at opposite ends of one axis, which is what makes holding both a
// real decision rather than a doubled-up one:
//
//     pad   small, strong    you have to be in it, and it kills
//     air   wide, weak       covers the ground, finishes the wounded

import type { Role } from '../../audio/kits';
import type { WeaponContext } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface AuraStats extends WeaponStats {
  /** Seconds between damage passes. The field is continuous; its DAMAGE is not,
   *  because sixty hits a second would be unreadable and would make every
   *  number in the game meaningless. */
  readonly tickS: number;
}

const QUERY_PAD = 24;

/** One aura, driven by the clock rather than by a chart trigger. */
class AuraInstance implements WeaponInstance {
  private nextTickAt = 0;

  constructor(private readonly stats: AuraStats) {}

  /** Never called in practice: a bed is never sequenced, so no trigger for this
   *  weapon ever arrives. Implemented anyway because the interface requires it
   *  and because a stack may yet drive a texture voice from a chart — in which
   *  case the field is already running and the trigger is simply redundant. */
  fire(): void {}

  tick(ctx: WeaponContext): void {
    // Asked for, not handed in. This is the whole reason WeaponContext.conf
    // exists: a clock-driven weapon has no fire() call to receive its tuning
    // through.
    const conf = ctx.conf();
    if (!conf) return;
    if (ctx.timeS < this.nextTickAt) return;
    this.nextTickAt = ctx.timeS + this.stats.tickS;

    const p = ctx.player;
    const reach = conf.radius!;
    for (const e of ctx.near(p.x, p.y, reach + QUERY_PAD)) {
      if (e.dead) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) > reach + e.radius) continue;
      ctx.damage(e, conf.damage);
    }
    ctx.fx({ type: 'ring', x: p.x, y: p.y, radius: reach, color: ctx.color, dur: this.stats.tickS, soft: true });
  }

  reset(): void {
    this.nextTickAt = 0;
  }
}

function aura(role: Role, stats: AuraStats): WeaponModule {
  return {
    role,
    stats,
    tickAt: 'zones' satisfies TickPhase,
    create: () => new AuraInstance(stats),
  };
}

// Small and strong: you have to be standing in the crowd for this to do
// anything, and when you are, it is the highest damage-per-second in the seat.
const PAD_STATS: AuraStats = {
  tiers: [
    { damage: 3, radius: 78 },
    { damage: 3.6, radius: 78 },
    { damage: 4.3, radius: 86 },
    { damage: 5, radius: 86 },
    { damage: 5.8, radius: 94 },
    { damage: 6.6, radius: 94 },
    { damage: 7.5, radius: 102 },
    { damage: 8.6, radius: 110 },
  ],
  tierLines: [
    'a close field that hurts to stand in',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'maximum bite',
  ],
  tickS: 0.35,
};

// Wide and weak: covers ground rather than killing outright, and finishes
// what everything else left standing.
const AIR_STATS: AuraStats = {
  tiers: [
    { damage: 1, radius: 155 },
    { damage: 1.2, radius: 155 },
    { damage: 1.4, radius: 175 },
    { damage: 1.6, radius: 175 },
    { damage: 1.9, radius: 195 },
    { damage: 2.2, radius: 195 },
    { damage: 2.5, radius: 215 },
    { damage: 2.9, radius: 235 },
  ],
  tierLines: [
    'a wide, faint field',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'stronger',
    'wider',
    'maximum spread',
  ],
  tickS: 0.5,
};

export const PAD = aura('pad', PAD_STATS);
export const AIR = aura('air', AIR_STATS);
