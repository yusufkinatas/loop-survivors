// One run's world: player, enemies, projectiles, zones, gems, and the
// coupling point where an engine trigger becomes damage (Model A: one event,
// two outputs). The stage script here is time-driven only and carries no
// musical meaning (the dividing rule, docs/plan.md).
//
// This file is pure simulation: no rendering, no input devices, no real
// time. Rendering lives in view.ts, which reads this world's state each
// frame. Randomness and movement control are injected so the autoplay bot
// (docs/tools/autoplay-bot.md) can run the same world headless under a
// seeded RNG — one source of truth, the game and the bot share this code.

import type { Role } from '../audio/kits';
import type { ScheduledTrigger } from '../audio/engine';
import {
  AIM_RANGE,
  DARTER,
  ENEMIES,
  ENEMY_BANDS,
  enemyScaling,
  MAX_ALIVE_HARD,
  RUN,
  VARIANT_EFFECTS,
  WAVES,
  WEAPONS,
  ZONE_SLOW_MUL,
  ZONE_THROW_RANGE,
  ZONE_TICK_S,
  type EnemyKind,
  type WeaponConf,
} from './config';
import { dcos, dsin } from './dmath';
import type { Rng } from './rng';
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
  /** Toughness band 0-3 (visual danger read; the view draws it). */
  band: number;
  flashT: number;
  dead: boolean;
  /** Darter burst state: time left in the current dash/pause, and the
   *  locked dash direction (darters do not steer mid-dash). */
  dashT: number;
  dashX: number;
  dashY: number;
  dashing: boolean;
  /** Time left under a chord zone's slow. */
  slowT: number;
}

export interface Projectile {
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
  hit: Set<Enemy>;
}

export interface Zone {
  x: number;
  y: number;
  radius: number;
  damage: number;
  lifeS: number;
  tickT: number;
  color: number;
}

export interface Gem {
  x: number;
  y: number;
  xp: number;
}

/** Fire-and-forget visuals the world requests and the view renders. Null in
 *  headless runs: the bot pays nothing for juice nobody sees. */
export type FxEvent =
  | { type: 'ring'; x: number; y: number; radius: number; color: number; dur: number }
  | { type: 'pop'; x: number; y: number; radius: number };

export interface RunEvents {
  onLevelUp(level: number): void;
  onDeath(): void;
  onVictory(): void;
  onHit(): void;
}

export const KIT_COLORS: Record<Role, number> = {
  kick: 0xff5a3c,
  snare: 0xffc93c,
  hat: 0x3ce0ff,
  bass: 0xa06bff,
  chord: 0x4dff88,
  lead: 0xff6bd6,
};

export interface RunWorldOpts {
  /** False in the sandbox: no stage script, no waves, no victory timer. */
  scripted?: boolean;
  /** Injected randomness; bot runs pass a seeded generator. */
  rng?: Rng;
  /** Movement axis provider (magnitude 0..1). The game wires the keyboard/
   *  joystick here; the bot wires a mover. */
  control?: () => { x: number; y: number };
  /** False for headless runs: skip the fx queue entirely. */
  fx?: boolean;
}

export class RunWorld {
  /** Owned weapons and their ladder tier (1-4). */
  readonly tiers = new Map<Role, number>();

  player = { x: 0, y: 0, hp: RUN.playerHp, radius: RUN.playerRadius, iframesT: 0 };
  level = 1;
  xp = 0;
  timeS = 0;
  kills = 0;
  killsByRole: Partial<Record<Role, number>> = {};
  /** Effective damage dealt per weapon (overkill not counted): the primary
   *  attribution metric — kill counts flatter AoE last hits and hide
   *  single-target work on tanks (docs/tools/autoplay-bot.md). */
  damageByRole: Partial<Record<Role, number>> = {};
  invincible = false;
  /** Sandbox only: spawns scale as if the run were at this many seconds
   *  (the panel's stage-minute preview). Scripted runs use timeS. */
  stageTimeOverride = 0;

  /** Visual-effect requests for the view; null when running headless. */
  readonly fx: FxEvent[] | null;

  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: Zone[] = [];
  readonly gems: Gem[] = [];

  private rng: Rng;
  private control: () => { x: number; y: number };
  private events: RunEvents;
  private view: { width: number; height: number };

  private hash = new SpatialHash<Enemy>();
  private queryBuf: Enemy[] = [];

  private swarmCarry = 0;
  private darterCarry = 0;
  private nextTankAtS = ENEMIES.tankFromS;
  private waveIdx = 0;
  private scripted: boolean;

  constructor(
    view: { width: number; height: number },
    events: RunEvents,
    opts: RunWorldOpts = {},
  ) {
    this.view = view;
    this.events = events;
    this.scripted = opts.scripted ?? true;
    this.rng = opts.rng ?? Math.random;
    this.control = opts.control ?? (() => ({ x: 0, y: 0 }));
    this.fx = (opts.fx ?? true) ? [] : null;
  }

  get enemyCount(): number {
    return this.enemies.length;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  /** Camera zoom: phones render fewer pixels, so the stage scales down to
   *  keep the visible slice of world (and the spawn ring, and reaction
   *  time) comparable across screen sizes. 1 on desktop, down to 0.5. */
  get zoom(): number {
    const z = Math.min(this.view.width / 1280, this.view.height / 800);
    return Math.min(1, Math.max(0.5, z));
  }

  /** Visible world extent (screen pixels divided by zoom). */
  get worldW(): number {
    return this.view.width / this.zoom;
  }

  get worldH(): number {
    return this.view.height / this.zoom;
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
        // Thrown at the nearest enemy, not dropped underfoot: the zone has
        // to land where the horde actually is to be worth a pick.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, conf, color);
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
    this.contactDamage(dt);
    this.reapEnemies();
  }

  // ---- player ----

  private movePlayer(dt: number): void {
    const a = this.control();
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

  /** A ring closing in from all sides at once. Waves get to exceed the
   *  soft cap: a pinned cap must not swallow the designed spikes. */
  spawnRingOf(kind: EnemyKind, count: number): void {
    const start = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(kind, start + (i / count) * Math.PI * 2, 1, true);
    }
  }

  /** A surge pouring in from one direction in a loose arc. */
  spawnSurgeOf(kind: EnemyKind, count: number): void {
    const center = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(kind, center + (this.rng() * 2 - 1) * 0.5, 1 + this.rng() * 0.6, true);
    }
  }

  spawnEnemy(kind: EnemyKind, angle?: number, distMul = 1, wave = false): void {
    if (this.enemies.length >= (wave ? MAX_ALIVE_HARD : ENEMIES.maxAlive)) return;
    const a = angle ?? this.rng() * Math.PI * 2;
    const conf = ENEMIES[kind];
    const dist = this.spawnDist(conf.radius) * distMul;
    // Scaling over the run: HP opposes the build's growth curve, contact
    // damage creeps so late hits stay scary, and the visual band says how
    // dangerous this enemy is. The sandbox spawns at its stage-minute
    // preview (default 0 = the stat-card values).
    const t = this.scripted ? this.timeS : this.stageTimeOverride;
    const s = enemyScaling(t / RUN.durationS, kind);
    const radius = conf.radius * ENEMY_BANDS.sizeMul[s.band];
    const color = ENEMY_BANDS.colors[kind][s.band];
    this.enemies.push({
      kind,
      x: this.player.x + dcos(a) * dist,
      y: this.player.y + dsin(a) * dist,
      radius,
      hp: conf.hp * s.hpMul,
      speed: conf.speed * s.spdMul,
      damage: Math.round(conf.damage * s.dmgMul),
      // Tougher enemies drop more: keeps the pick cadence steady while the
      // horde thickens, instead of starving the back half of level-ups.
      xp: Math.round(conf.xp * s.xpMul),
      color,
      band: s.band,
      flashT: 0,
      dead: false,
      dashT: 0,
      dashX: 0,
      dashY: 0,
      dashing: false,
      slowT: 0,
    });
  }

  /** Sandbox: remove every enemy without kills, gems, or pops. */
  clearEnemies(): void {
    this.enemies.length = 0;
  }

  private moveEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      let speed = e.speed;
      if (e.slowT > 0) {
        e.slowT -= dt;
        speed *= ZONE_SLOW_MUL;
      }
      if (e.flashT > 0) e.flashT -= dt;

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
          e.x += e.dashX * speed * dt;
          e.y += e.dashY * speed * dt;
        }
        continue;
      }

      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // separation steering against overlapping neighbors — kept weak so
      // the horde packs into a VS-style wall instead of spreading out
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
      e.x += (dx * speed + sx * 1.5) * dt;
      e.y += (dy * speed + sy * 1.5) * dt;
    }
  }

  private damageEnemy(e: Enemy, amount: number, source?: Role): void {
    if (e.dead) return;
    // Effective damage only: overkill on a 3hp swarmer must not count as a
    // 34-damage contribution, or AoE sweeps inflate their share.
    const dealt = Math.min(e.hp, amount);
    e.hp -= amount;
    e.flashT = 0.08;
    if (source) this.damageByRole[source] = (this.damageByRole[source] ?? 0) + dealt;
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
      if (this.enemies[i].dead) this.enemies.splice(i, 1);
    }
  }

  /** Debug helper: grant XP as if picked up. */
  grantXp(amount: number): void {
    this.xp += amount;
    this.checkLevel();
  }

  /** Debug helper: jump straight to the next level-up. */
  levelUp(): void {
    const threshold = RUN.xpCurve[Math.min(this.level - 1, RUN.xpCurve.length - 1)];
    this.grantXp(Math.max(0, threshold - this.xp));
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

  private nearestEnemy(range: number): Enemy | null {
    const p = this.player;
    let best: Enemy | null = null;
    let bestD = range * range;
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
    return best;
  }

  private aimDir(spread: number): { x: number; y: number } {
    const p = this.player;
    const best = this.nearestEnemy(AIM_RANGE);
    let ang: number;
    if (best) {
      ang = Math.atan2(best.y - p.y, best.x - p.x);
    } else {
      ang = this.rng() * Math.PI * 2;
    }
    ang += (this.rng() * 2 - 1) * spread;
    return { x: dcos(ang), y: dsin(ang) };
  }

  private spawnProjectile(
    role: Role,
    dir: { x: number; y: number },
    conf: { damage: number; speed?: number; radius?: number; lifetimeS?: number; pierce?: number },
    color: number,
    velocity: number,
  ): void {
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
          pr.vx = dcos(next) * pr.speed;
          pr.vy = dsin(next) * pr.speed;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;

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
    this.zones.push({
      x,
      y,
      radius: conf.radius!,
      damage: conf.damage,
      lifeS: conf.lifetimeS!,
      tickT: 0,
      color,
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
        // The zone's other half: everything inside wades, it doesn't walk.
        const near = this.hash.query(z.x, z.y, z.radius + 24, this.queryBuf);
        for (const e of near) {
          if (!e.dead && circlesOverlap(z, e)) e.slowT = ZONE_TICK_S + 0.15;
        }
      }
      if (z.lifeS <= 0) {
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
    this.gems.push({ x, y, xp });
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
      }
      if (d < RUN.pickupRadius) {
        this.xp += g.xp;
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
    this.fx?.push({ type: 'ring', x, y, radius, color, dur });
  }

  private spawnPop(x: number, y: number, radius: number): void {
    this.fx?.push({ type: 'pop', x, y, radius });
  }
}
