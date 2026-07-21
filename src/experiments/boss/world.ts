// The boss arena: a fixed, locked box (no scrolling, the whole fight is on
// screen) where the boss makes the music and the player only survives. The
// player has no weapons here — movement and a short dodge dash are the only
// verbs. Everything that damages the player is a hazard the boss spits out on
// the beat; the boss cannot be hurt, it dies when its song ends (see
// conductor.ts). Pure simulation: rendering lives in view.ts.

import { DAMAGE_FEEDBACK } from '../../game/config';

/** Fixed arena, world units, centered on (0,0). The view letterboxes it into
 *  whatever window it gets, so the whole box is always visible. */
export const ARENA = { w: 1240, h: 760 };

const BOSS_PLAYER = {
  hp: 100,
  speed: 258,
  radius: 11,
  dashSpeed: 760,
  dashDurS: 0.15,
  // Near-minimal so the dash is almost always available against beat-frequent
  // attacks (Pursuit fires roughly every ~0.55s beat); at 0.2s it recovers
  // well within a beat. Barely above the 0.15s dash duration, so back-to-back
  // dashes are near-continuous.
  dashCdS: 0.2,
  // The dash is a real dodge: invulnerable for the whole dash plus a short
  // recovery tail, so dashing THROUGH an attack reliably clears it. Longer
  // than dashDurS on purpose (was only ~0.05s, barely covered the move).
  dashIframesS: 0.3,
};

export interface BossPlayer {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  iframesT: number;
  dashT: number;
  dashCd: number;
  dashVx: number;
  dashVy: number;
  /** Last non-zero facing, so a standing dash still goes somewhere. */
  faceX: number;
  faceY: number;
}

export type BossBehavior = 'anchor' | 'chase';

export interface Boss {
  x: number;
  y: number;
  radius: number;
  color: number;
  behavior: BossBehavior;
  chaseSpeed: number;
  homeX: number;
  homeY: number;
  contactDamage: number;
  /** Beat-reactive visual pulse, 0..1, decays each frame. */
  pulse: number;
  /** Active lunge (a dash impulse that overrides chase). */
  lungeT: number;
  lungeVx: number;
  lungeVy: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  lifeS: number;
  color: number;
  /** Steer toward the player, rad/sec (0 = straight). */
  turn: number;
  /** Speed change per second along heading (drift/accelerate). */
  accel: number;
}

/** Expanding ring shockwave (kick slams). Damages on the ring front only, so
 *  you dodge over/through it. `warnT` is a wind-up where it sits small. */
export interface Shock {
  x: number;
  y: number;
  age: number;
  warnT: number;
  r0: number;
  rMax: number;
  speed: number;
  thickness: number;
  damage: number;
  color: number;
}

export type BeamType = 'ray' | 'vlane' | 'hlane';

/** A laser. `ray` is an infinite line through (ox,oy) at `angle` (a spinning
 *  bar); `vlane`/`hlane` are axis-aligned walls at x=ox / y=oy. Telegraphs thin
 *  for `warnT`, then goes thick and lethal for `liveT`. */
export interface Beam {
  type: BeamType;
  ox: number;
  oy: number;
  angle: number;
  sweepRate: number;
  halfWidth: number;
  age: number;
  warnT: number;
  liveT: number;
  damage: number;
  color: number;
}

/** Telegraphed circular blast: outline for `warnT`, then detonates for `liveT`. */
export interface Zone {
  x: number;
  y: number;
  radius: number;
  age: number;
  warnT: number;
  liveT: number;
  damage: number;
  color: number;
}

/** A melee wedge swung by the brawler: warns, then the arc bites for `liveT`. */
export interface Arc {
  cx: number;
  cy: number;
  angle: number;
  half: number;
  reach: number;
  age: number;
  warnT: number;
  liveT: number;
  damage: number;
  color: number;
}

export type BossFx =
  | { type: 'spark'; x: number; y: number; color: number }
  | { type: 'slam'; x: number; y: number; color: number };

export interface BossWorldEvents {
  onHit(): void;
  onDeath(): void;
}

function clampMag(x: number, y: number): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m <= 1) return { x, y };
  return { x: x / m, y: y / m };
}

export class BossWorld {
  readonly player: BossPlayer;
  boss: Boss;
  readonly bullets: Bullet[] = [];
  readonly shocks: Shock[] = [];
  readonly beams: Beam[] = [];
  readonly zones: Zone[] = [];
  readonly arcs: Arc[] = [];
  readonly fx: BossFx[] = [];

  timeS = 0;
  invincible = false;
  /** Set true once the fight is decided; stops hazards from moving. */
  frozen = false;

  private control: () => { x: number; y: number };
  private events: BossWorldEvents;

  constructor(control: () => { x: number; y: number }, events: BossWorldEvents) {
    this.control = control;
    this.events = events;
    this.player = {
      x: 0,
      y: ARENA.h * 0.28,
      hp: BOSS_PLAYER.hp,
      maxHp: BOSS_PLAYER.hp,
      radius: BOSS_PLAYER.radius,
      iframesT: 0,
      dashT: 0,
      dashCd: 0,
      dashVx: 0,
      dashVy: 0,
      faceX: 0,
      faceY: -1,
    };
    // Placeholder boss; the page replaces it via spawnBoss() from the BossDef.
    this.boss = {
      x: 0,
      y: -ARENA.h * 0.16,
      radius: 40,
      color: 0xffffff,
      behavior: 'anchor',
      chaseSpeed: 0,
      homeX: 0,
      homeY: -ARENA.h * 0.16,
      contactDamage: 14,
      pulse: 0,
      lungeT: 0,
      lungeVx: 0,
      lungeVy: 0,
    };
  }

  spawnBoss(opts: Partial<Boss>): Boss {
    this.boss = { ...this.boss, ...opts };
    return this.boss;
  }

  // ---- boss AI spawn API (called from the beat callback) ----

  /** Angle from a point toward the player right now. */
  aimAt(fromX: number, fromY: number): number {
    return Math.atan2(this.player.y - fromY, this.player.x - fromX);
  }

  bullet(o: {
    x: number;
    y: number;
    angle: number;
    speed: number;
    radius?: number;
    damage?: number;
    color: number;
    turn?: number;
    accel?: number;
    lifeS?: number;
  }): void {
    // Hard ceiling so a stall or a berserk pattern can't run memory away; the
    // oldest bullet (farthest along, least fair to the player anyway) drops.
    if (this.bullets.length > 1400) this.bullets.shift();
    this.bullets.push({
      x: o.x,
      y: o.y,
      vx: Math.cos(o.angle) * o.speed,
      vy: Math.sin(o.angle) * o.speed,
      radius: o.radius ?? 7,
      damage: o.damage ?? 9,
      color: o.color,
      turn: o.turn ?? 0,
      accel: o.accel ?? 0,
      lifeS: o.lifeS ?? 6,
    });
  }

  /** A full ring of bullets from (x,y). */
  radial(
    x: number,
    y: number,
    count: number,
    speed: number,
    o: { color: number; offset?: number; radius?: number; damage?: number; turn?: number },
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (o.offset ?? 0) + (i / count) * Math.PI * 2;
      this.bullet({ x, y, angle, speed, color: o.color, radius: o.radius, damage: o.damage, turn: o.turn });
    }
  }

  /** A fan of bullets aimed at the player. */
  aimedSpread(
    x: number,
    y: number,
    count: number,
    spread: number,
    speed: number,
    o: { color: number; radius?: number; damage?: number },
  ): void {
    const base = this.aimAt(x, y);
    const start = base - spread / 2;
    const denom = count > 1 ? count - 1 : 1;
    for (let i = 0; i < count; i++) {
      const angle = count === 1 ? base : start + (i / denom) * spread;
      this.bullet({ x, y, angle, speed, color: o.color, radius: o.radius, damage: o.damage });
    }
  }

  shock(o: {
    x: number;
    y: number;
    rMax?: number;
    speed?: number;
    thickness?: number;
    damage?: number;
    warnT?: number;
    color: number;
  }): void {
    this.shocks.push({
      x: o.x,
      y: o.y,
      age: 0,
      warnT: o.warnT ?? 0.18,
      r0: this.boss.radius * 0.7,
      rMax: o.rMax ?? Math.max(ARENA.w, ARENA.h),
      speed: o.speed ?? 620,
      thickness: o.thickness ?? 34,
      damage: o.damage ?? 12,
      color: o.color,
    });
    this.fx.push({ type: 'slam', x: o.x, y: o.y, color: o.color });
  }

  beam(o: {
    type: BeamType;
    ox: number;
    oy: number;
    angle?: number;
    sweepRate?: number;
    halfWidth?: number;
    warnT?: number;
    liveT?: number;
    damage?: number;
    color: number;
  }): void {
    this.beams.push({
      type: o.type,
      ox: o.ox,
      oy: o.oy,
      angle: o.angle ?? 0,
      sweepRate: o.sweepRate ?? 0,
      halfWidth: o.halfWidth ?? 26,
      age: 0,
      warnT: o.warnT ?? 0.5,
      liveT: o.liveT ?? 0.5,
      damage: o.damage ?? 14,
      color: o.color,
    });
  }

  zone(o: {
    x: number;
    y: number;
    radius: number;
    warnT?: number;
    liveT?: number;
    damage?: number;
    color: number;
  }): void {
    this.zones.push({
      x: o.x,
      y: o.y,
      radius: o.radius,
      age: 0,
      warnT: o.warnT ?? 0.55,
      liveT: o.liveT ?? 0.3,
      damage: o.damage ?? 14,
      color: o.color,
    });
  }

  arc(o: {
    cx: number;
    cy: number;
    angle: number;
    half?: number;
    reach?: number;
    warnT?: number;
    liveT?: number;
    damage?: number;
    color: number;
  }): void {
    this.arcs.push({
      cx: o.cx,
      cy: o.cy,
      angle: o.angle,
      half: o.half ?? Math.PI / 3,
      reach: o.reach ?? 150,
      age: 0,
      warnT: o.warnT ?? 0.35,
      liveT: o.liveT ?? 0.2,
      damage: o.damage ?? 13,
      color: o.color,
    });
  }

  /** Brawler impulse: dash the boss toward a point for durS. */
  bossLungeAt(px: number, py: number, speed: number, durS: number): void {
    const a = Math.atan2(py - this.boss.y, px - this.boss.x);
    this.boss.lungeVx = Math.cos(a) * speed;
    this.boss.lungeVy = Math.sin(a) * speed;
    this.boss.lungeT = durS;
  }

  pulseBoss(amount = 1): void {
    this.boss.pulse = Math.min(1, this.boss.pulse + amount);
  }

  // ---- simulation ----

  update(dt: number, dashQueued: boolean): void {
    this.timeS += dt;
    this.movePlayer(dt, dashQueued);
    if (!this.frozen) {
      this.moveBoss(dt);
      this.updateBullets(dt);
      this.updateShocks(dt);
      this.updateBeams(dt);
      this.updateZones(dt);
      this.updateArcs(dt);
    }
  }

  private halfW = ARENA.w / 2;
  private halfH = ARENA.h / 2;

  private clampToArena(p: { x: number; y: number }, r: number): void {
    p.x = Math.max(-this.halfW + r, Math.min(this.halfW - r, p.x));
    p.y = Math.max(-this.halfH + r, Math.min(this.halfH - r, p.y));
  }

  private movePlayer(dt: number, dashQueued: boolean): void {
    const p = this.player;
    if (p.iframesT > 0) p.iframesT -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    const a = clampMag(this.control().x, this.control().y);
    if (a.x !== 0 || a.y !== 0) {
      p.faceX = a.x;
      p.faceY = a.y;
    }

    if (dashQueued && p.dashCd <= 0 && p.dashT <= 0) {
      const dir = a.x !== 0 || a.y !== 0 ? a : { x: p.faceX, y: p.faceY };
      const m = Math.hypot(dir.x, dir.y) || 1;
      p.dashVx = (dir.x / m) * BOSS_PLAYER.dashSpeed;
      p.dashVy = (dir.y / m) * BOSS_PLAYER.dashSpeed;
      p.dashT = BOSS_PLAYER.dashDurS;
      p.dashCd = BOSS_PLAYER.dashCdS;
      // Grant the full dodge window up front (outlasts the dash movement).
      p.iframesT = Math.max(p.iframesT, BOSS_PLAYER.dashIframesS);
    }

    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dashVx * dt;
      p.y += p.dashVy * dt;
    } else {
      p.x += a.x * BOSS_PLAYER.speed * dt;
      p.y += a.y * BOSS_PLAYER.speed * dt;
    }
    this.clampToArena(p, p.radius);
  }

  private moveBoss(dt: number): void {
    const b = this.boss;
    if (b.pulse > 0) b.pulse = Math.max(0, b.pulse - dt * 3.2);
    if (b.lungeT > 0) {
      b.lungeT -= dt;
      b.x += b.lungeVx * dt;
      b.y += b.lungeVy * dt;
    } else if (b.behavior === 'chase') {
      const a = Math.atan2(this.player.y - b.y, this.player.x - b.x);
      b.x += Math.cos(a) * b.chaseSpeed * dt;
      b.y += Math.sin(a) * b.chaseSpeed * dt;
    } else {
      // ease back toward the anchor point
      b.x += (b.homeX - b.x) * Math.min(1, dt * 2);
      b.y += (b.homeY - b.y) * Math.min(1, dt * 2);
    }
    this.clampToArena(b, b.radius);

    // contact damage (chasers)
    const dx = this.player.x - b.x;
    const dy = this.player.y - b.y;
    const rr = this.player.radius + b.radius;
    if (dx * dx + dy * dy < rr * rr) this.hitPlayer(b.contactDamage);
  }

  private updateBullets(dt: number): void {
    const b = this.player;
    const outW = this.halfW + 90;
    const outH = this.halfH + 90;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const p = this.bullets[i];
      p.lifeS -= dt;
      if (p.turn !== 0) {
        const want = Math.atan2(b.y - p.y, b.x - p.x);
        let cur = Math.atan2(p.vy, p.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const step = Math.max(-p.turn * dt, Math.min(p.turn * dt, diff));
        cur += step;
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = Math.cos(cur) * sp;
        p.vy = Math.sin(cur) * sp;
      }
      if (p.accel !== 0) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const ns = Math.max(40, sp + p.accel * dt);
        p.vx = (p.vx / sp) * ns;
        p.vy = (p.vy / sp) * ns;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.lifeS <= 0 || p.x < -outW || p.x > outW || p.y < -outH || p.y > outH) {
        this.bullets.splice(i, 1);
        continue;
      }
      const ddx = p.x - b.x;
      const ddy = p.y - b.y;
      const rr = p.radius + b.radius;
      if (ddx * ddx + ddy * ddy < rr * rr) {
        if (this.hitPlayer(p.damage)) this.fx.push({ type: 'spark', x: p.x, y: p.y, color: p.color });
        this.bullets.splice(i, 1);
      }
    }
  }

  private updateShocks(dt: number): void {
    const p = this.player;
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.age += dt;
      const live = s.age >= s.warnT;
      const r = live ? s.r0 + (s.age - s.warnT) * s.speed : s.r0;
      if (r >= s.rMax) {
        this.shocks.splice(i, 1);
        continue;
      }
      if (live) {
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (Math.abs(d - r) < s.thickness / 2 + p.radius) this.hitPlayer(s.damage);
      }
    }
  }

  private updateBeams(dt: number): void {
    const p = this.player;
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const bm = this.beams[i];
      bm.age += dt;
      bm.angle += bm.sweepRate * dt;
      if (bm.age >= bm.warnT + bm.liveT) {
        this.beams.splice(i, 1);
        continue;
      }
      if (bm.age < bm.warnT) continue; // telegraph only
      let dist: number;
      if (bm.type === 'vlane') dist = Math.abs(p.x - bm.ox);
      else if (bm.type === 'hlane') dist = Math.abs(p.y - bm.oy);
      else {
        // perpendicular distance from the player to the infinite line through
        // (ox,oy) with direction `angle`
        const dx = p.x - bm.ox;
        const dy = p.y - bm.oy;
        dist = Math.abs(dx * Math.sin(bm.angle) - dy * Math.cos(bm.angle));
      }
      if (dist < bm.halfWidth + p.radius) this.hitPlayer(bm.damage);
    }
  }

  private updateZones(dt: number): void {
    const p = this.player;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.age += dt;
      if (z.age >= z.warnT + z.liveT) {
        this.zones.splice(i, 1);
        continue;
      }
      if (z.age < z.warnT) continue;
      const d = Math.hypot(p.x - z.x, p.y - z.y);
      if (d < z.radius + p.radius) this.hitPlayer(z.damage);
    }
  }

  private updateArcs(dt: number): void {
    const p = this.player;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.age += dt;
      if (a.age >= a.warnT + a.liveT) {
        this.arcs.splice(i, 1);
        continue;
      }
      if (a.age < a.warnT) continue;
      const dx = p.x - a.cx;
      const dy = p.y - a.cy;
      const d = Math.hypot(dx, dy);
      if (d > a.reach + p.radius) continue;
      let diff = Math.atan2(dy, dx) - a.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < a.half) this.hitPlayer(a.damage);
    }
  }

  /** Apply damage unless invulnerable; returns true if it landed. */
  hitPlayer(dmg: number): boolean {
    const p = this.player;
    if (this.invincible || p.iframesT > 0 || p.hp <= 0 || this.frozen) return false;
    p.hp = Math.max(0, p.hp - dmg);
    p.iframesT = DAMAGE_FEEDBACK.iframesS;
    this.events.onHit();
    if (p.hp <= 0) this.events.onDeath();
    return true;
  }
}
