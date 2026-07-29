// The Bell weapon module: a mallet strike that drops onto a distant enemy.
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
import type { WeaponContext } from './context';
import type { TickPhase, WeaponInstance, WeaponModule, WeaponStats } from './module';

interface BellStats extends WeaponStats {
  /** Seconds between the mark appearing and the strike landing. */
  readonly windUpS: number;
  /** How far out it will look for something to hit. */
  readonly range: number;
  readonly shove: number;
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
  shove: 26,
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

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    // Nearest body, not a random one: a sparse weapon that misses is a weapon
    // that does nothing for two bars.
    const [target] = ctx.nearestEnemies(BELL_STATS.range, 1);
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
    // The mark. Soft and small — it is a warning, not the hit.
    ctx.fx({ type: 'ring', x, y, radius: conf.radius! * 0.5, color: ctx.color, dur: BELL_STATS.windUpS, soft: true });
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
