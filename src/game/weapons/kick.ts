// The Kick weapon module: a facing-side strip on the beat, and its evolution,
// Redline Stomp, a four-way cross across the visible arena. Base and evolved
// live in the same module; evolving flips an internal mode (ctx.evolved).

import { SHOVE_S, WORLD_SCALE, type WeaponConf } from '../config';
import { circleIntersectsRect } from '../spatial';
import type { WeaponContext, WeaponTarget } from './context';
import type { WeaponInstance, WeaponModule, WeaponStats } from './module';

/** The kick's tuning. Every number below was an inline literal in run.ts;
 *  values are unchanged. Nothing in the behavior code may be a bare literal —
 *  an evolution's damage multiplier is a named stat, not a `* 1.35` buried in a
 *  branch (ADR-0002: the exemption must be visible as a stat). */
interface KickStats extends WeaponStats {
  /** Reach of the facing-side strip at area 1, in H800 world units. Read by
   *  view.ts's whipDimensions; kept short so the strip stays a close-range
   *  crowd tool, not a screen-wide beam. */
  readonly stripBaseWidth: number;
  /** Thickness of the strip at area 1. Also the basis of Redline Stomp's arm
   *  half-thickness. */
  readonly stripBaseHeight: number;
  /** The strip grows linearly from zero to full Area over this, then holds. */
  readonly growS: number;
  /** Total time a strip stays live and damaging. At SIM_DT 1/60 this is
   *  exactly twelve damage passes. */
  readonly liveS: number;
  /** Gap before the opposite-side follow-up strip (tier 2+). */
  readonly followUpDelayS: number;
  /** Slack added to the hash query radius around the strip's half-diagonal. */
  readonly queryPad: number;
  /** Redline Stomp: damage multiplier applied ON TOP of the already-built
   *  damage. */
  readonly evolvedDamageMul: number;
  /** Redline Stomp: arm length as a fraction of the visible world extent, so
   *  the footprint depends on canvas size and aspect ratio. */
  readonly evolvedReachFrac: number;
  /** Redline Stomp: arm half-thickness as a fraction of stripBaseHeight * area. */
  readonly evolvedHalfFrac: number;
  /** Redline Stomp: push distance before buildMods.knockbackMul. */
  readonly evolvedShove: number;
}

const KICK_STATS: KickStats = {
  // The starting Kick uses Whip's horizontal pass-through strip instead of a
  // radial aura. Damage/area/amount map to Whip levels 1, 3, 5 and 8.
  tiers: [
    { damage: 3, area: 1, amount: 1 },
    { damage: 5, area: 1, amount: 2 },
    { damage: 9, area: 1.1, amount: 2 },
    { damage: 15, area: 1.2, amount: 2 },
  ],
  tierLines: [
    'a facing-side strip, on the beat',
    'adds an opposite-side follow-up',
    'harder, wider double strike',
    'maximum damage and reach',
  ],

  stripBaseWidth: 85 * WORLD_SCALE,
  stripBaseHeight: 22 * WORLD_SCALE,
  growS: 0.1,
  liveS: 0.2,
  followUpDelayS: 0.1,
  queryPad: 48,

  evolvedDamageMul: 1.35,
  evolvedReachFrac: 0.58,
  evolvedHalfFrac: 0.75,
  evolvedShove: 18,
};

/** One scheduled strip. The world used to hold these in RunWorld.pendingKick. */
interface KickStrike {
  atS: number;
  x: number;
  y: number;
  side: 1 | -1;
  damage: number;
  area: number;
  started: boolean;
  startedAt: number;
  expiresAt: number;
  samplePlayer: boolean;
  spawnFollowUp: boolean;
  /** Targets already damaged by THIS strike, so its 200 ms hitbox lands one
   *  hit per target across its frames while every new trigger hits fresh. */
  hit: Set<WeaponTarget>;
}

/** Vertically centered on the player, inner edge at the player's center,
 *  reaching out to the facing side. */
function stripCenter(
  playerX: number,
  playerY: number,
  side: 1 | -1,
  halfWidth: number,
): { x: number; y: number } {
  return {
    x: playerX + side * halfWidth,
    y: playerY,
  };
}

class KickInstance implements WeaponInstance {
  private readonly strikes: KickStrike[] = [];

  fire(ctx: WeaponContext, conf: WeaponConf): void {
    if (ctx.evolved) {
      this.fireRedlineStomp(ctx, conf);
      return;
    }
    // Whip geometry and damage, while retaining Model A's audible Kick on
    // every gameplay trigger. A per-enemy lock below preserves the reference
    // weapon's target cadence despite the 122 BPM beat grid.
    const side = ctx.player.facingX;
    this.strikes.push({
      atS: ctx.timeS,
      x: ctx.player.x,
      y: ctx.player.y,
      side,
      damage: conf.damage,
      area: conf.area ?? 1,
      started: false,
      startedAt: 0,
      expiresAt: 0,
      samplePlayer: false,
      spawnFollowUp: (conf.amount ?? 1) > 1,
      hit: new Set(),
    });
  }

  tick(ctx: WeaponContext, _dt: number): void {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const strike = this.strikes[i];
      if (!strike.started) {
        if (strike.atS > ctx.timeS + 1e-9) continue;
        strike.started = true;
        strike.startedAt = ctx.timeS;
        strike.expiresAt = ctx.timeS + KICK_STATS.liveS;
        if (strike.samplePlayer) {
          strike.x = ctx.player.x;
          strike.y = ctx.player.y;
          strike.side = ctx.player.facingX === 1 ? -1 : 1;
        }
        if (strike.spawnFollowUp) {
          // Schedule from the main strip's actual simulation start so fixed
          // 60 Hz stepping preserves the full 100 ms interval.
          this.strikes.push({
            atS: ctx.timeS + KICK_STATS.followUpDelayS,
            x: 0,
            y: 0,
            side: 1,
            damage: strike.damage,
            area: strike.area,
            started: false,
            startedAt: 0,
            expiresAt: 0,
            samplePlayer: true,
            spawnFollowUp: false,
            hit: new Set(),
          });
        }
        // Anchor at the player; the view bursts the pulse outward from here.
        ctx.fx({
          type: 'whip',
          x: strike.x,
          y: strike.y,
          side: strike.side,
          area: strike.area,
          color: ctx.color,
        });
      } else if (ctx.timeS + 1e-9 >= strike.expiresAt) {
        this.strikes.splice(i, 1);
        continue;
      }

      // Grow linearly from zero to full Area over 100 ms, then hold 100 ms;
      // the inner edge stays pinned to the player as the reach extends.
      const age = Math.max(0, ctx.timeS - strike.startedAt);
      const bodyScale = Math.min(1, age / KICK_STATS.growS);
      const halfW = (KICK_STATS.stripBaseWidth * strike.area * bodyScale) / 2;
      const halfH = (KICK_STATS.stripBaseHeight * strike.area * bodyScale) / 2;
      const center = stripCenter(strike.x, strike.y, strike.side, halfW);
      const centerX = center.x;
      const centerY = center.y;
      const reach = Math.hypot(halfW, halfH) + KICK_STATS.queryPad;
      const near = ctx.near(centerX, centerY, reach);
      for (const e of near) {
        if (
          e.dead ||
          strike.hit.has(e) ||
          !circleIntersectsRect(e.x, e.y, e.radius, centerX, centerY, halfW, halfH)
        ) {
          continue;
        }
        ctx.damage(e, strike.damage);
        strike.hit.add(e);
        // Enemy hit response reverses pursuit for the same 120 ms flash,
        // scaled by the source bestiary's knockback multiplier.
        this.reverseForKick(ctx, e, strike.x, strike.y);
      }
    }
  }

  reset(): void {
    this.strikes.length = 0;
  }

  private reverseForKick(
    ctx: WeaponContext,
    e: WeaponTarget,
    fromX: number,
    fromY: number,
  ): void {
    if (e.knockbackMul <= 0) return;
    if (e.lastMoveX !== 0 || e.lastMoveY !== 0) {
      ctx.setKnock(e, -e.lastMoveX * e.knockbackMul, -e.lastMoveY * e.knockbackMul, SHOVE_S);
      return;
    }
    ctx.shove(e, fromX, fromY, e.speed * SHOVE_S);
  }

  private fireRedlineStomp(ctx: WeaponContext, conf: WeaponConf): void {
    const reachX = ctx.worldW * KICK_STATS.evolvedReachFrac;
    const reachY = ctx.worldH * KICK_STATS.evolvedReachFrac;
    const half = KICK_STATS.stripBaseHeight * (conf.area ?? 1) * KICK_STATS.evolvedHalfFrac;
    const damage = conf.damage * KICK_STATS.evolvedDamageMul;
    const shove = KICK_STATS.evolvedShove * ctx.buildMods.knockbackMul;
    const player = ctx.player;
    for (const enemy of ctx.all()) {
      if (enemy.dead) continue;
      const dx = Math.abs(enemy.x - player.x);
      const dy = Math.abs(enemy.y - player.y);
      if ((dx <= reachX + enemy.radius && dy <= half + enemy.radius) ||
          (dy <= reachY + enemy.radius && dx <= half + enemy.radius)) {
        ctx.damage(enemy, damage);
        ctx.shove(enemy, player.x, player.y, shove);
      }
    }
    // The same cross over the props: a stomp that reaches a Stage Light chips
    // it incidentally. No shove — a light is not going anywhere.
    for (const light of ctx.props()) {
      if (light.dead) continue;
      const dx = Math.abs(light.x - player.x);
      const dy = Math.abs(light.y - player.y);
      if ((dx <= reachX + light.radius && dy <= half + light.radius) ||
          (dy <= reachY + light.radius && dx <= half + light.radius)) {
        ctx.damage(light, damage);
      }
    }
    for (const [x2, y2] of [
      [player.x + reachX, player.y], [player.x - reachX, player.y],
      [player.x, player.y + reachY], [player.x, player.y - reachY],
    ] as const) {
      ctx.fx({ type: 'beam', x: player.x, y: player.y, x2, y2, width: half * 2, color: ctx.color });
    }
  }
}

export const KICK = {
  role: 'kick',
  stats: KICK_STATS,
  tickAt: 'strikes',
  create: () => new KickInstance(),
} satisfies WeaponModule;
