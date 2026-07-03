// One run's world: player, enemies, projectiles, zones, gems, and the
// coupling point where an engine trigger becomes damage (Model A: one event,
// two outputs). The stage script here is time-driven only and carries no
// musical meaning (the dividing rule, docs/plan.md).

import { Container, Graphics } from 'pixi.js';
import type { Role } from '../audio/kits';
import type { ScheduledTrigger } from '../audio/engine';
import {
  AIM_RANGE,
  DARTER,
  ENEMIES,
  RUN,
  VARIANT_EFFECTS,
  WAVES,
  WEAPONS,
  ZONE_TICK_S,
  type EnemyKind,
  type WeaponConf,
} from './config';
import { Input } from './input';
import { SpatialHash, circlesOverlap } from './spatial';

export interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  color: number;
  gfx: Graphics;
  flashT: number;
  dead: boolean;
  /** Darter burst state: time left in the current dash/pause, and the
   *  locked dash direction (darters do not steer mid-dash). */
  dashT: number;
  dashX: number;
  dashY: number;
  dashing: boolean;
}

interface Projectile {
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  pierce: number;
  lifeS: number;
  homing: boolean;
  speed: number;
  color: number;
  gfx: Graphics;
  hit: Set<Enemy>;
}

interface Zone {
  x: number;
  y: number;
  radius: number;
  damage: number;
  lifeS: number;
  tickT: number;
  gfx: Graphics;
}

interface Gem {
  x: number;
  y: number;
  xp: number;
  gfx: Graphics;
}

interface Pop {
  gfx: Graphics;
  t: number;
  dur: number;
  grow: number;
}

export interface RunEvents {
  onLevelUp(level: number): void;
  onDeath(): void;
  onVictory(): void;
  onHit(): void;
}

const KIT_COLORS: Record<Role, number> = {
  kick: 0xff5a3c,
  snare: 0xffc93c,
  hat: 0x3ce0ff,
  bass: 0xa06bff,
  chord: 0x4dff88,
  lead: 0xff6bd6,
};

export class RunWorld {
  readonly stage: Container;
  /** Owned weapons and their ladder tier (1-4). */
  readonly tiers = new Map<Role, number>();

  player = { x: 0, y: 0, hp: RUN.playerHp, radius: RUN.playerRadius, iframesT: 0 };
  level = 1;
  xp = 0;
  timeS = 0;
  kills = 0;
  killsByRole: Partial<Record<Role, number>> = {};
  invincible = false;

  private input = new Input();
  private events: RunEvents;
  private view: { width: number; height: number };

  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private zones: Zone[] = [];
  private gems: Gem[] = [];
  private pops: Pop[] = [];
  private hash = new SpatialHash<Enemy>();
  private queryBuf: Enemy[] = [];

  private gridGfx = new Graphics();
  private playerGfx = new Graphics();
  private swarmCarry = 0;
  private darterCarry = 0;
  private nextTankAtS = ENEMIES.tankFromS;
  private waveIdx = 0;
  /** False in the sandbox: no stage script, no waves, no victory timer. */
  private scripted: boolean;

  constructor(
    view: { width: number; height: number },
    events: RunEvents,
    opts: { scripted?: boolean } = {},
  ) {
    this.view = view;
    this.events = events;
    this.scripted = opts.scripted ?? true;
    this.stage = new Container();
    this.stage.addChild(this.gridGfx);
    this.playerGfx.circle(0, 0, RUN.playerRadius).fill(0xffffff);
    this.stage.addChild(this.playerGfx);
  }

  get enemyCount(): number {
    return this.enemies.length;
  }

  /** Camera zoom: phones render fewer pixels, so the stage scales down to
   *  keep the visible slice of world (and the spawn ring, and reaction
   *  time) comparable across screen sizes. 1 on desktop, down to 0.5. */
  private get zoom(): number {
    const z = Math.min(this.view.width / 1280, this.view.height / 800);
    return Math.min(1, Math.max(0.5, z));
  }

  /** Visible world extent (screen pixels divided by zoom). */
  private get worldW(): number {
    return this.view.width / this.zoom;
  }

  private get worldH(): number {
    return this.view.height / this.zoom;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  /** The coupling point: a scheduled trigger fires this kit's weapon at the
   *  owned tier. Variant peaks (bass sub, chord pad) scale the same weapon. */
  fireTrigger(t: ScheduledTrigger): void {
    const tier = this.tiers.get(t.role);
    if (!tier) return;
    let conf: WeaponConf = WEAPONS[t.role][tier - 1];
    const color = KIT_COLORS[t.role];
    const v = t.velocity;
    const p = this.player;

    if (t.role === 'bass' && t.variant === 'sub') {
      const fx = VARIANT_EFFECTS.bassSub;
      conf = { ...conf, radius: conf.radius! * fx.radiusMul, damage: conf.damage * fx.damageMul };
    }
    if (t.role === 'chord' && t.variant === 'pad') {
      const fx = VARIANT_EFFECTS.chordPad;
      conf = {
        ...conf,
        radius: conf.radius! * fx.radiusMul,
        lifetimeS: conf.lifetimeS! * fx.lifetimeMul,
        damage: conf.damage * fx.damageMul,
      };
    }

    switch (t.role) {
      case 'kick': {
        const radius = conf.radius! * (0.85 + 0.3 * v);
        this.damageArea(p.x, p.y, radius, conf.damage * v, 'kick');
        this.spawnRing(p.x, p.y, radius, color, 0.3);
        break;
      }
      case 'chord': {
        this.spawnZone(p.x, p.y, conf, color);
        break;
      }
      case 'snare':
      case 'hat':
      case 'bass':
      case 'lead': {
        const aim = this.aimDir(t.role === 'hat' ? 0.35 : 0.08);
        this.spawnProjectile(t.role, aim, conf, color, v);
        break;
      }
    }
  }

  /** Add a weapon or raise its tier. The pulse fires when the change lands
   *  (next-bar entry), so eye and ear agree on the moment. */
  addWeapon(role: Role, tier = 1): void {
    this.tiers.set(role, tier);
    this.spawnRing(this.player.x, this.player.y, 220, KIT_COLORS[role], 0.6);
  }

  /** Sandbox loadout editor: drop a weapon entirely. */
  removeWeapon(role: Role): void {
    this.tiers.delete(role);
  }

  update(dt: number): void {
    this.timeS += dt;
    if (this.scripted && this.timeS >= RUN.durationS) {
      this.events.onVictory();
      return;
    }

    this.movePlayer(dt);
    if (this.scripted) {
      this.spawnEnemies(dt);
      this.runWaves();
    }

    // rebuild the hash, then everything queries it
    this.hash.clear();
    for (const e of this.enemies) this.hash.insert(e);

    this.moveEnemies(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateGems(dt);
    this.updatePops(dt);
    this.contactDamage(dt);
    this.reapEnemies();
    this.drawGrid();

    // camera locked on player, scaled for the screen
    const zoom = this.zoom;
    this.stage.scale.set(zoom);
    this.stage.position.set(
      this.view.width / 2 - this.player.x * zoom,
      this.view.height / 2 - this.player.y * zoom,
    );
    this.playerGfx.position.set(this.player.x, this.player.y);
    this.playerGfx.alpha = this.player.iframesT > 0 ? 0.5 : 1;
  }

  // ---- player ----

  private movePlayer(dt: number): void {
    const a = this.input.axis();
    this.player.x += a.x * RUN.playerSpeed * dt;
    this.player.y += a.y * RUN.playerSpeed * dt;
    if (this.player.iframesT > 0) this.player.iframesT -= dt;
  }

  private contactDamage(dt: number): void {
    void dt;
    if (this.player.iframesT > 0 || this.invincible) return;
    const p = this.player;
    const near = this.hash.query(p.x, p.y, p.radius + 40, this.queryBuf);
    for (const e of near) {
      if (e.dead || !circlesOverlap(p, e)) continue;
      p.hp = Math.max(0, p.hp - e.damage);
      p.iframesT = RUN.iframesS;
      this.events.onHit();
      if (p.hp <= 0) {
        this.events.onDeath();
      }
      return;
    }
  }

  // ---- enemies ----

  private spawnEnemies(dt: number): void {
    if (this.enemies.length >= ENEMIES.maxAlive) return;
    const t01 = this.timeS / RUN.durationS;
    const rate = ENEMIES.swarmRateStart + (ENEMIES.swarmRateEnd - ENEMIES.swarmRateStart) * t01;
    this.swarmCarry += rate * dt;
    while (this.swarmCarry >= 1) {
      this.swarmCarry -= 1;
      this.spawnEnemy('swarmer');
    }
    if (this.timeS >= ENEMIES.darterFromS) {
      const dRate =
        ENEMIES.darterRateStart + (ENEMIES.darterRateEnd - ENEMIES.darterRateStart) * t01;
      this.darterCarry += dRate * dt;
      while (this.darterCarry >= 1) {
        this.darterCarry -= 1;
        this.spawnEnemy('darter');
      }
    }
    if (this.timeS >= this.nextTankAtS) {
      const interval =
        ENEMIES.tankIntervalStartS +
        (ENEMIES.tankIntervalEndS - ENEMIES.tankIntervalStartS) * t01;
      this.nextTankAtS = this.timeS + interval;
      this.spawnEnemy('tank');
    }
  }

  /** Wave events, pure data: fire every entry whose time has come. */
  private runWaves(): void {
    while (this.waveIdx < WAVES.length && this.timeS >= WAVES[this.waveIdx].atS) {
      const wave = WAVES[this.waveIdx++];
      if (wave.kind === 'ring') this.spawnRingOf(wave.enemy, wave.count);
      else this.spawnSurgeOf(wave.enemy, wave.count);
    }
  }

  private spawnDist(radius: number): number {
    return Math.max(this.worldW, this.worldH) / 2 + ENEMIES.spawnMargin + radius;
  }

  /** A ring closing in from all sides at once. */
  spawnRingOf(kind: EnemyKind, count: number): void {
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(kind, start + (i / count) * Math.PI * 2);
    }
  }

  /** A surge pouring in from one direction in a loose arc. */
  spawnSurgeOf(kind: EnemyKind, count: number): void {
    const center = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(kind, center + (Math.random() * 2 - 1) * 0.5, 1 + Math.random() * 0.6);
    }
  }

  spawnEnemy(kind: EnemyKind, angle = Math.random() * Math.PI * 2, distMul = 1): void {
    if (this.enemies.length >= ENEMIES.maxAlive) return;
    const conf = ENEMIES[kind];
    const dist = this.spawnDist(conf.radius) * distMul;
    const gfx = new Graphics();
    if (kind === 'tank') {
      gfx.rect(-conf.radius, -conf.radius, conf.radius * 2, conf.radius * 2).fill(0xffffff);
    } else if (kind === 'darter') {
      // pointed sliver: reads as "fast" at a glance
      gfx.poly([conf.radius * 1.6, 0, -conf.radius, conf.radius * 0.9, -conf.radius, -conf.radius * 0.9]).fill(0xffffff);
    } else {
      gfx.circle(0, 0, conf.radius).fill(0xffffff);
    }
    gfx.tint = conf.color;
    this.stage.addChild(gfx);
    this.enemies.push({
      kind,
      x: this.player.x + Math.cos(angle) * dist,
      y: this.player.y + Math.sin(angle) * dist,
      radius: conf.radius,
      hp: conf.hp,
      speed: conf.speed,
      damage: conf.damage,
      xp: conf.xp,
      color: conf.color,
      gfx,
      flashT: 0,
      dead: false,
      dashT: 0,
      dashX: 0,
      dashY: 0,
      dashing: false,
    });
  }

  /** Sandbox: remove every enemy without kills, gems, or pops. */
  clearEnemies(): void {
    for (const e of this.enemies) e.gfx.destroy();
    this.enemies.length = 0;
  }

  private moveEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;

      if (e.kind === 'darter') {
        // Straight bursts: lock onto the player's position, dash flat out,
        // stop dead, re-aim, dash again. Threat is the dodge, not the chase.
        e.dashT -= dt;
        if (e.dashT <= 0) {
          e.dashing = !e.dashing;
          if (e.dashing) {
            const dd = Math.hypot(p.x - e.x, p.y - e.y) || 1;
            e.dashX = (p.x - e.x) / dd;
            e.dashY = (p.y - e.y) / dd;
            e.dashT = DARTER.dashS;
          } else {
            e.dashT = DARTER.pauseS;
          }
        }
        if (e.dashing) {
          e.x += e.dashX * e.speed * dt;
          e.y += e.dashY * e.speed * dt;
          e.gfx.rotation = Math.atan2(e.dashY, e.dashX);
        }
        if (e.flashT > 0) {
          e.flashT -= dt;
          if (e.flashT <= 0) e.gfx.tint = e.color;
        }
        e.gfx.position.set(e.x, e.y);
        continue;
      }

      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // separation steering against overlapping neighbors
      const near = this.hash.query(e.x, e.y, e.radius * 2, this.queryBuf);
      let sx = 0;
      let sy = 0;
      for (const o of near) {
        if (o === e || o.dead) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        const overlap = e.radius + o.radius - od;
        if (overlap > 0 && od > 0.001) {
          sx += (ox / od) * overlap;
          sy += (oy / od) * overlap;
        }
      }
      e.x += (dx * e.speed + sx * 4) * dt;
      e.y += (dy * e.speed + sy * 4) * dt;
      if (e.flashT > 0) {
        e.flashT -= dt;
        if (e.flashT <= 0) e.gfx.tint = e.color;
      }
      e.gfx.position.set(e.x, e.y);
    }
  }

  private damageEnemy(e: Enemy, amount: number, source?: Role): void {
    if (e.dead) return;
    e.hp -= amount;
    e.flashT = 0.08;
    e.gfx.tint = 0xffffff;
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      if (source) this.killsByRole[source] = (this.killsByRole[source] ?? 0) + 1;
      this.spawnPop(e.x, e.y, e.radius);
      this.spawnGem(e.x, e.y, e.xp);
    }
  }

  private reapEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.dead) continue;
      e.gfx.destroy();
      this.enemies.splice(i, 1);
    }
  }

  /** Debug helper: grant XP as if picked up. */
  grantXp(amount: number): void {
    this.xp += amount;
    this.checkLevel();
  }

  /** Debug helper: kill everything on screen. */
  killVisible(): void {
    for (const e of this.enemies) {
      if (
        Math.abs(e.x - this.player.x) < this.worldW / 2 &&
        Math.abs(e.y - this.player.y) < this.worldH / 2
      ) {
        this.damageEnemy(e, Infinity);
      }
    }
  }

  // ---- weapons ----

  private aimDir(spread: number): { x: number; y: number } {
    const p = this.player;
    let best: Enemy | null = null;
    let bestD = AIM_RANGE * AIM_RANGE;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    let ang: number;
    if (best) {
      ang = Math.atan2(best.y - p.y, best.x - p.x);
    } else {
      ang = Math.random() * Math.PI * 2;
    }
    ang += (Math.random() * 2 - 1) * spread;
    return { x: Math.cos(ang), y: Math.sin(ang) };
  }

  private spawnProjectile(
    role: Role,
    dir: { x: number; y: number },
    conf: { damage: number; speed?: number; radius?: number; lifetimeS?: number; pierce?: number },
    color: number,
    velocity: number,
  ): void {
    // Distinct silhouette per weapon (gate B: colored circles read the same).
    const gfx = new Graphics();
    switch (role) {
      case 'snare': // hard-hitting bolt
        gfx.roundRect(-10, -3, 20, 6, 3).fill(0xffffff);
        break;
      case 'bass': // wide rolling wave front
        gfx.ellipse(0, 0, 16, conf.radius!).fill({ color: 0xffffff, alpha: 0.5 });
        gfx.ellipse(0, 0, 16, conf.radius!).stroke({ width: 2, color: 0xffffff });
        break;
      case 'lead': // homing seeker arrow
        gfx.poly([12, 0, -6, 6, -2, 0, -6, -6]).fill(0xffffff);
        break;
      default: // hat: tiny chip dot
        gfx.circle(0, 0, conf.radius!).fill(0xffffff);
    }
    gfx.tint = color;
    gfx.rotation = Math.atan2(dir.y, dir.x);
    this.stage.addChild(gfx);
    this.projectiles.push({
      role,
      x: this.player.x,
      y: this.player.y,
      vx: dir.x * conf.speed!,
      vy: dir.y * conf.speed!,
      radius: conf.radius!,
      damage: conf.damage * (0.75 + 0.5 * velocity),
      pierce: conf.pierce ?? 1,
      lifeS: conf.lifetimeS!,
      homing: role === 'lead',
      speed: conf.speed!,
      color,
      gfx,
      hit: new Set(),
    });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.lifeS -= dt;
      if (pr.homing) {
        let best: Enemy | null = null;
        let bestD = Infinity;
        for (const e of this.enemies) {
          if (e.dead || pr.hit.has(e)) continue;
          const dx = e.x - pr.x;
          const dy = e.y - pr.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          const ang = Math.atan2(best.y - pr.y, best.x - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          let diff = ang - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          // tight turn so seekers snap to targets instead of orbiting them
          const turn = Math.max(-10 * dt, Math.min(10 * dt, diff));
          const next = cur + turn;
          pr.vx = Math.cos(next) * pr.speed;
          pr.vy = Math.sin(next) * pr.speed;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.gfx.position.set(pr.x, pr.y);
      if (pr.role !== 'hat') pr.gfx.rotation = Math.atan2(pr.vy, pr.vx);

      const near = this.hash.query(pr.x, pr.y, pr.radius + 24, this.queryBuf);
      for (const e of near) {
        if (e.dead || pr.hit.has(e) || !circlesOverlap(pr, e)) continue;
        pr.hit.add(e);
        this.damageEnemy(e, pr.damage, pr.role);
        pr.pierce -= 1;
        if (pr.pierce <= 0) {
          pr.lifeS = 0;
          break;
        }
      }

      if (pr.lifeS <= 0) {
        pr.gfx.destroy();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private spawnZone(
    x: number,
    y: number,
    conf: { damage: number; radius?: number; lifetimeS?: number },
    color: number,
  ): void {
    const gfx = new Graphics()
      .circle(0, 0, conf.radius!)
      .fill({ color: 0xffffff, alpha: 0.12 })
      .circle(0, 0, conf.radius!)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
    gfx.tint = color;
    gfx.position.set(x, y);
    this.stage.addChild(gfx);
    this.zones.push({
      x,
      y,
      radius: conf.radius!,
      damage: conf.damage,
      lifeS: conf.lifetimeS!,
      tickT: 0,
      gfx,
    });
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.lifeS -= dt;
      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = ZONE_TICK_S;
        this.damageArea(z.x, z.y, z.radius, z.damage, 'chord');
      }
      z.gfx.alpha = Math.min(1, z.lifeS * 2);
      if (z.lifeS <= 0) {
        z.gfx.destroy();
        this.zones.splice(i, 1);
      }
    }
  }

  private damageArea(x: number, y: number, radius: number, damage: number, source?: Role): void {
    const near = this.hash.query(x, y, radius + 24, this.queryBuf);
    const area = { x, y, radius };
    for (const e of near) {
      if (!e.dead && circlesOverlap(area, e)) this.damageEnemy(e, damage, source);
    }
  }

  // ---- pickups and juice ----

  private spawnGem(x: number, y: number, xp: number): void {
    // White with a dark core: reads as "pickup", and can't be confused with
    // the hat's cyan shots (gate B feedback).
    const gfx = new Graphics()
      .rect(-4, -4, 8, 8)
      .fill(0xffffff)
      .rect(-1.5, -1.5, 3, 3)
      .fill(0x101014);
    gfx.rotation = Math.PI / 4;
    gfx.position.set(x, y);
    this.stage.addChild(gfx);
    this.gems.push({ x, y, xp, gfx });
  }

  private updateGems(dt: number): void {
    const p = this.player;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < RUN.magnetRadius) {
        const pull = 420 * dt;
        g.x += (dx / (d || 1)) * pull;
        g.y += (dy / (d || 1)) * pull;
        g.gfx.position.set(g.x, g.y);
      }
      if (d < RUN.pickupRadius) {
        this.xp += g.xp;
        g.gfx.destroy();
        this.gems.splice(i, 1);
        this.checkLevel();
      }
    }
  }

  private checkLevel(): void {
    const threshold = RUN.xpCurve[Math.min(this.level - 1, RUN.xpCurve.length - 1)];
    if (this.xp >= threshold) {
      this.xp -= threshold;
      this.level += 1;
      this.events.onLevelUp(this.level);
    }
  }

  /** XP progress toward the next level, 0..1, for the HUD bar. */
  xpProgress(): number {
    const threshold = RUN.xpCurve[Math.min(this.level - 1, RUN.xpCurve.length - 1)];
    return Math.min(1, this.xp / threshold);
  }

  private spawnRing(x: number, y: number, radius: number, color: number, dur: number): void {
    const gfx = new Graphics().circle(0, 0, radius).stroke({ width: 3, color: 0xffffff });
    gfx.tint = color;
    gfx.position.set(x, y);
    gfx.scale.set(0.2);
    this.stage.addChild(gfx);
    this.pops.push({ gfx, t: 0, dur, grow: 1 });
  }

  private spawnPop(x: number, y: number, radius: number): void {
    const gfx = new Graphics().circle(0, 0, radius).fill(0xffffff);
    gfx.tint = 0xcfd2e0;
    gfx.position.set(x, y);
    this.stage.addChild(gfx);
    this.pops.push({ gfx, t: 0, dur: 0.22, grow: 1.8 });
  }

  private updatePops(dt: number): void {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / p.dur;
      if (k >= 1) {
        p.gfx.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      p.gfx.alpha = 1 - k;
      p.gfx.scale.set(0.2 + (p.grow - 0.2) * k);
    }
  }

  private drawGrid(): void {
    const g = this.gridGfx;
    const cell = 80;
    const w = this.worldW;
    const h = this.worldH;
    const left = this.player.x - w / 2;
    const top = this.player.y - h / 2;
    g.clear();
    for (let x = Math.floor(left / cell) * cell; x < left + w + cell; x += cell) {
      g.moveTo(x, top - cell).lineTo(x, top + h + cell);
    }
    for (let y = Math.floor(top / cell) * cell; y < top + h + cell; y += cell) {
      g.moveTo(left - cell, y).lineTo(left + w + cell, y);
    }
    g.stroke({ width: 1, color: 0x23232c });
  }

  destroy(): void {
    this.stage.destroy({ children: true });
  }
}
