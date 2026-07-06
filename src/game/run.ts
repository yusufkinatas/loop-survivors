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
import type { EffectId } from '../audio/voicefx';
import {
  AIM_RANGE,
  ARP_OMEGA,
  BOOMERANG_OUT_FRAC,
  CHAIN_HOP,
  CHAIN_SEEK,
  CHARGER,
  CIRCLER,
  DARTER,
  ECHO_FAN,
  ENEMIES,
  ENEMY_BANDS,
  enemyScaling,
  FLASH,
  KNOCK_S,
  MAX_ALIVE_HARD,
  ORBIT_REHIT_S,
  RUN,
  SHAKE,
  SHIELDED,
  SHOCK_BAND,
  SHOVE_S,
  SPAWN_DIRECTOR,
  SPITTER,
  SPLITTER,
  VARIANT_EFFECTS,
  WEAPON_SHOVE,
  WEAPON_TAGS,
  WEAPONS,
  ZAP_RANGE,
  ZONE_SLOW_MUL,
  ZONE_THROW_RANGE,
  ZONE_TICK_S,
  type EnemyKind,
  type Formation,
  type WeaponConf,
} from './config';
import { dcos, dsin } from './dmath';
import {
  applyEffectConf,
  BLOOM_RESIDUAL_DMG_MUL,
  BLOOM_RESIDUAL_LIFES,
  ECHO_DAMAGE_MUL,
  ECHO_DELAY_S,
  SPLIT_SPREAD,
} from './effects';
import { BASE_MODS, ITEMS, type ItemId, type Mods } from './items';
import type { Rng } from './rng';
import { SpatialHash, circlesOverlap } from './spatial';

/** Weapons whose projectiles pierce: crush grants +pierce on these, +radius
 *  on the rest, and the multishot fan targets them + hat. */
const PIERCE_ROLES = new Set<Role>(['snare', 'hat', 'lead']);

/** Roles that emit a per-hit spark on impact. Bounded to low-count roles so
 *  the 2400-enemy frame never floods the fx queue (Feature 3). */
const SPARK_HIT_ROLES = new Set<Role>(['snare', 'lead', 'tom']);

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
  /** Crash knockback: velocity (px/s) and time left being pushed. While
   *  knockT > 0 the enemy rides this vector instead of chasing. */
  knockX: number;
  knockY: number;
  knockT: number;
  /** shielded: absorbs damage before hp; 0 for others. */
  shieldHp: number;
  /** circler: +1/-1 orbit direction; 0 for others. */
  spin: number;
  /** charger: telegraph countdown; 0 otherwise. */
  windupT: number;
  /** spitter: shot cooldown; 0 otherwise. */
  fireT: number;
}

/** A spitter's projectile: damages the player, ignored by weapons. */
export interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  lifeS: number;
  color: number;
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
  /** Total time alive; drives the boomerang turnaround. Behavior otherwise
   *  keys off role: lead homes, tom boomerangs, cowbell ricochets, arp orbits. */
  age: number;
  /** cowbell: ricochets off the view edges left before it dies. */
  bounces: number;
  /** tom: seconds spent flying outward before it curves home. */
  outS: number;
  /** tom: has the boomerang turned around yet. */
  returned: boolean;
  /** arp: orbit geometry around the player, and the re-hit cooldown so a slow
   *  sweep keeps chipping the same enemy. */
  orbitAngle: number;
  orbitRadius: number;
  rehitT: number;
}

/** Crash shockwave: an expanding ring; its front damages and knocks back
 *  enemies it passes, each hit once. */
export interface Shock {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  damage: number;
  knockback: number;
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
  /** Weapon that spawned this zone: its damage is attributed here (D8). */
  source: Role;
}

export interface Gem {
  x: number;
  y: number;
  xp: number;
}

/** Fire-and-forget visuals the world requests and the view renders. Null in
 *  headless runs: the bot pays nothing for juice nobody sees. */
export type FxEvent =
  | { type: 'ring'; x: number; y: number; radius: number; color: number; dur: number; soft?: boolean }
  | { type: 'pop'; x: number; y: number; radius: number }
  | {
      type: 'arc';
      x: number;
      y: number;
      angle: number;
      arc: number;
      radius: number;
      color: number;
    }
  | { type: 'bolt'; x1: number; y1: number; x2: number; y2: number; color: number }
  | { type: 'spark'; x: number; y: number; color: number; n: number; spread: number }
  | { type: 'shake'; mag: number; dur: number }
  | { type: 'flash'; color: number; alpha: number; dur: number }
  | { type: 'slam'; x: number; y: number; radius: number; color: number }
  | {
      type: 'zigbolt';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: number;
      branches: number;
    };

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
  clap: 0xff4f7d,
  tom: 0xd08a4a,
  cowbell: 0xc7f24a,
  arp: 0x33e6c2,
  zap: 0x66b3ff,
  crash: 0xb9c2dd,
  rimshot: 0xff8f5e,
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
  /** Per-genre damage compensation (docs/plan.md, tempo and damage): faster
   *  genres fire more triggers, so their per-trigger damage is scaled down and
   *  slow genres up, applied to every weapon's damage as it fires. */
  powerMul = 1;

  /** Per-weapon effect slot (Feature 4): the sound + gameplay modifier on a
   *  role. Composes after the global mods, per weapon, in applyBuild. */
  readonly effects = new Map<Role, EffectId>();
  /** Owned items and their level (Feature 5). */
  readonly items = new Map<ItemId, number>();
  /** The global multiplier bag items own; recomputed on every item change. */
  mods: Mods = { ...BASE_MODS };
  /** Echo re-fires queued for a later tick (deterministic, timeS-gated). */
  private echoQueue: { t: ScheduledTrigger; fireAtS: number }[] = [];
  /** Reactive Drop nova cooldown timer (Feature 5). */
  private dropCdT = 0;

  /** Visual-effect requests for the view; null when running headless. */
  readonly fx: FxEvent[] | null;

  readonly enemies: Enemy[] = [];
  readonly enemyShots: EnemyShot[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: Zone[] = [];
  readonly shocks: Shock[] = [];
  readonly gems: Gem[] = [];

  private rng: Rng;
  private control: () => { x: number; y: number };
  private events: RunEvents;
  private view: { width: number; height: number };

  private hash = new SpatialHash<Enemy>();
  private queryBuf: Enemy[] = [];

  /** Spawn Director state: index into SPAWN_DIRECTOR, the current steady rate
   *  and weighted kind mix, and the fractional spawn accumulator. */
  private dirIdx = 0;
  private curRate = 0;
  private curMix: Array<[EnemyKind, number]> = [];
  private curMixTotal = 0;
  private spawnCarry = 0;
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
    this.recomputeMods();
  }

  get enemyCount(): number {
    return this.enemies.length;
  }

  get enemyShotCount(): number {
    return this.enemyShots.length;
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
    this.fireWeapon(t, this.effects.get(t.role) ?? null, 1);
  }

  private fireWeapon(t: ScheduledTrigger, effect: EffectId | null, damageMul: number): void {
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
    // Single build-transform pipeline (D1): genre tempo compensation + global
    // item mods + this weapon's effect, folded in one place.
    conf = this.applyBuild(conf, effect, PIERCE_ROLES.has(t.role));
    // Echo re-fire pass attenuates damage; the base fire leaves this at 1.
    if (damageMul !== 1) conf = { ...conf, damage: conf.damage * damageMul };
    // Echo schedules a weaker second fire; the re-fire itself passes effect=null.
    if (effect === 'echo') this.echoQueue.push({ t, fireAtS: this.timeS + ECHO_DELAY_S });

    switch (t.role) {
      case 'kick': {
        const radius = conf.radius! * (0.85 + 0.3 * v);
        this.damageArea(p.x, p.y, radius, conf.damage * v, 'kick', WEAPON_SHOVE.kick);
        // The kick fires every beat, so its pulse must stay quiet: one thin,
        // faint ring, no slam, no shake — clean ambient feedback, not a punch.
        this.spawnRing(p.x, p.y, radius, color, 0.3, true);
        break;
      }
      case 'chord': {
        // Thrown at the nearest enemy, not dropped underfoot: the zone has
        // to land where the horde actually is to be worth a pick.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, conf, color, 'chord');
        break;
      }
      case 'clap': {
        // Whip: a wide forward slash in the aim direction, hitting a cone.
        const aim = this.aimDir(0);
        const ang = Math.atan2(aim.y, aim.x);
        const reach = conf.radius! * (0.9 + 0.2 * v);
        this.damageCone(p.x, p.y, ang, conf.arc!, reach, conf.damage * (0.85 + 0.3 * v), 'clap', WEAPON_SHOVE.clap);
        this.fx?.push({ type: 'arc', x: p.x, y: p.y, angle: ang, arc: conf.arc!, radius: reach, color });
        break;
      }
      case 'rimshot': {
        // A crack that leaps enemy-to-enemy through a cluster: seed on the
        // nearest foe, then hop to the next-nearest un-hit enemy, chaining.
        this.chainCrack(conf.chains ?? 1, conf.damage * (0.85 + 0.3 * v), conf.radius!, 'rimshot', color);
        break;
      }
      case 'zap': {
        // Lightning Ring: instant strikes on random enemies on screen.
        const hits = this.pickRandomEnemies(conf.strikes ?? 1, ZAP_RANGE);
        for (const e of hits) {
          this.damageArea(e.x, e.y, conf.radius!, conf.damage * (0.85 + 0.3 * v), 'zap');
          this.spawnRing(e.x, e.y, conf.radius!, color, 0.22);
          this.fx?.push({ type: 'zigbolt', x1: p.x, y1: p.y, x2: e.x, y2: e.y, color, branches: 2 });
          this.fx?.push({ type: 'spark', x: e.x, y: e.y, color, n: 6, spread: conf.radius! * 0.5 });
        }
        break;
      }
      case 'crash': {
        // Shockwave: an expanding ring that damages and knocks back. The
        // marquee weapon — ground slam + big shake + a screen flash.
        this.spawnShock(conf, color);
        this.fx?.push({ type: 'slam', x: p.x, y: p.y, radius: conf.radius! * 0.4, color });
        this.spawnRing(p.x, p.y, conf.radius!, color, 0.4);
        this.fx?.push({ type: 'shake', mag: SHAKE.crash.mag, dur: SHAKE.crash.dur });
        this.fx?.push({ type: 'flash', color, alpha: FLASH.crash.alpha, dur: FLASH.crash.dur });
        break;
      }
      case 'arp': {
        // King Bible: an orbiter per note, circling the player.
        this.spawnOrbiter(conf, color, v);
        break;
      }
      case 'tom': {
        // Cross: one or more boomerangs, spread when there are several.
        const count = conf.count ?? 1;
        for (let i = 0; i < count; i++) {
          this.spawnBoomerang(this.aimDir(count > 1 ? 0.5 : 0.08), conf, color, v);
        }
        break;
      }
      case 'cowbell': {
        // Runetracer: a ricocheting bolt.
        this.spawnRicochet(this.aimDir(0.12), conf, color, v);
        break;
      }
      case 'bass': {
        // Bass never multishots (no 'aimedfan' tag): one wide rolling wave.
        this.spawnProjectile('bass', this.aimDir(0.08), conf, color, v);
        // Sub-drop peak: a low boom the screen feels.
        if (t.variant === 'sub') {
          this.fx?.push({ type: 'shake', mag: SHAKE.bassSub.mag, dur: SHAKE.bassSub.dur });
          this.fx?.push({ type: 'flash', color, alpha: FLASH.bassSub.alpha, dur: FLASH.bassSub.dur });
        }
        break;
      }
      case 'snare':
      case 'hat':
      case 'lead': {
        // Multishot (Layer item) fans only weapons tagged 'aimedfan' (D10);
        // these three qualify. With mods.multishot===0 the gate yields n===1
        // and the single-shot path is bit-identical to the base game.
        const aim = this.aimDir(t.role === 'hat' ? 0.35 : 0.08);
        const n = 1 + (WEAPON_TAGS[t.role].has('aimedfan') ? this.mods.multishot : 0);
        if (n === 1) {
          this.spawnProjectile(t.role, aim, conf, color, v);
        } else {
          const base = Math.atan2(aim.y, aim.x);
          for (let i = 0; i < n; i++) {
            const off = (i - (n - 1) / 2) * ECHO_FAN;
            this.spawnProjectile(t.role, { x: dcos(base + off), y: dsin(base + off) }, conf, color, v);
          }
        }
        break;
      }
    }

    // ---- split: one extra emission for spawn-style weapons ----
    if (effect === 'split') {
      if (t.role === 'snare' || t.role === 'hat' || t.role === 'bass' || t.role === 'lead')
        this.spawnProjectile(t.role, this.aimDir(SPLIT_SPREAD), conf, color, v);
      else if (t.role === 'cowbell') this.spawnRicochet(this.aimDir(SPLIT_SPREAD), conf, color, v);
      else if (t.role === 'arp') this.spawnOrbiter(conf, color, v);
      // tom/zap already boosted via conf.count/strikes; other roles ineligible.
    }

    // ---- bloom: instant AoE weapons leave a residual damaging zone ----
    if (effect === 'bloom' && (t.role === 'kick' || t.role === 'clap' || t.role === 'crash')) {
      const cx = t.role === 'clap' ? p.x + this.aimDir(0).x * (conf.radius! * 0.5) : p.x;
      const cy = t.role === 'clap' ? p.y + this.aimDir(0).y * (conf.radius! * 0.5) : p.y;
      this.spawnZone(
        cx,
        cy,
        { damage: conf.damage * BLOOM_RESIDUAL_DMG_MUL, radius: conf.radius, lifetimeS: BLOOM_RESIDUAL_LIFES },
        color,
        t.role,
      );
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

  /** Slot an effect onto a weapon (Feature 4). The audio chain is wired by
   *  the engine on the live path; the gameplay twin reads this map. */
  attachEffect(role: Role, effect: EffectId): void {
    this.effects.set(role, effect);
    this.spawnRing(this.player.x, this.player.y, 200, KIT_COLORS[role], 0.5);
  }

  /** Add or raise an item (Feature 5), recomputing the global mod bag. */
  addItem(id: ItemId, level: number): void {
    this.items.set(id, level);
    this.recomputeMods();
    this.spawnRing(this.player.x, this.player.y, 220, 0xffffff, 0.6);
  }

  /** Sandbox parity: drop an item entirely. */
  removeItem(id: ItemId): void {
    this.items.delete(id);
    this.recomputeMods();
  }

  /** Rebuild the global multiplier bag from owned items — order-independent,
   *  pure, headless-safe (no rng, no fx). */
  private recomputeMods(): void {
    const m: Mods = { ...BASE_MODS };
    for (const [id, lvl] of this.items) ITEMS[id].contribute(m, lvl);
    this.mods = m;
  }

  /** The single build-transform pipeline (D1): genre power, then global item
   *  mods, then this weapon's effect. Nothing else multiplies weapon numbers. */
  private applyBuild(conf: WeaponConf, effect: EffectId | null, usesPierce: boolean): WeaponConf {
    const m = this.mods;
    const out: WeaponConf = { ...conf, damage: conf.damage * this.powerMul * m.damageMul };
    if (out.radius !== undefined) out.radius *= m.areaMul;
    if (out.lifetimeS !== undefined) out.lifetimeS *= m.durMul;
    if (out.speed !== undefined) out.speed *= m.projSpeedMul;
    if (out.orbitRadius !== undefined) out.orbitRadius *= m.areaMul;
    if (effect) return applyEffectConf(out, effect, usesPierce);
    return out;
  }

  /** Push an enemy away from a point (Feature 3), sharing the crash knock
   *  channel. Pure arithmetic, so it runs headless untouched. */
  private shove(e: Enemy, fromX: number, fromY: number, dist: number): void {
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    e.knockX = (dx / d) * (dist / SHOVE_S);
    e.knockY = (dy / d) * (dist / SHOVE_S);
    e.knockT = Math.max(e.knockT, SHOVE_S);
  }

  /** Fire due echo re-fires (Feature 4). Drained in queue order, gated by
   *  timeS (fixed-step in bot/replay), so it stays deterministic. */
  private drainEchoes(): void {
    if (this.echoQueue.length === 0) return;
    const still: typeof this.echoQueue = [];
    for (const e of this.echoQueue) {
      if (this.timeS >= e.fireAtS) this.fireWeapon(e.t, null, ECHO_DAMAGE_MUL);
      else still.push(e);
    }
    this.echoQueue = still;
  }

  update(dt: number): void {
    this.timeS += dt;
    if (this.scripted && this.timeS >= RUN.durationS) {
      this.events.onVictory();
      return;
    }

    this.movePlayer(dt);
    if (this.scripted) {
      this.runDirector(dt);
    }

    // rebuild the hash, then everything queries it
    this.hash.clear();
    for (const e of this.enemies) this.hash.insert(e);

    // Echo re-fires run against the fresh hash, before enemies move.
    this.drainEchoes();

    this.moveEnemies(dt);
    this.updateEnemyShots(dt); // after moveEnemies: uses fresh spitter positions
    this.recycleEnemies();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateShocks(dt);
    this.updateGems(dt);
    this.contactDamage(dt);

    // Item passives: regen and the reactive Drop nova (Feature 5). Inert until
    // items are owned (regenPerS 0, dropEnabled false). No rng — deterministic.
    if (this.mods.regenPerS > 0 && this.player.hp > 0)
      this.player.hp = Math.min(RUN.playerHp, this.player.hp + this.mods.regenPerS * dt);

    this.dropCdT -= dt;
    if (
      this.mods.dropEnabled &&
      this.dropCdT <= 0 &&
      this.player.hp > 0 &&
      this.player.hp <= RUN.playerHp * this.mods.dropThreshold
    ) {
      this.dropCdT = this.mods.dropCooldownS;
      const p = this.player;
      this.shocks.push({
        x: p.x,
        y: p.y,
        radius: 12,
        maxRadius: this.mods.dropRadius,
        speed: 640,
        damage: this.mods.dropDamage,
        knockback: this.mods.dropKnockback,
        color: 0xffffff,
        hit: new Set(),
      });
      this.spawnRing(p.x, p.y, this.mods.dropRadius, 0xffffff, 0.5);
      const near = this.hash.query(p.x, p.y, this.mods.dropRadius, this.queryBuf);
      for (const e of near) if (!e.dead) e.slowT = Math.max(e.slowT, 0.8);
    }

    this.reapEnemies();
  }

  // ---- player ----

  private movePlayer(dt: number): void {
    const a = this.control();
    this.player.x += a.x * RUN.playerSpeed * this.mods.moveMul * dt;
    this.player.y += a.y * RUN.playerSpeed * this.mods.moveMul * dt;
    if (this.player.iframesT > 0) this.player.iframesT -= dt;
  }

  private contactDamage(dt: number): void {
    void dt;
    if (this.player.iframesT > 0 || this.invincible) return;
    const p = this.player;
    const near = this.hash.query(p.x, p.y, p.radius + 40, this.queryBuf);
    for (const e of near) {
      if (e.dead || !circlesOverlap(p, e)) continue;
      // Limiter mitigates but never immunizes: floor 1 keeps the AFK-death
      // pillar. contactTakenMul===1 and integer e.damage>=10 -> identical.
      const dmg = Math.max(1, Math.round(e.damage * this.mods.contactTakenMul));
      p.hp = Math.max(0, p.hp - dmg);
      p.iframesT = RUN.iframesS;
      this.events.onHit();
      if (p.hp <= 0) {
        this.events.onDeath();
      }
      return;
    }
  }

  // ---- enemies ----

  /** The spawn Director (replaces the ramp + WAVES): drain every due beat,
   *  then trickle steady spawns from the current rate + weighted mix. */
  private runDirector(dt: number): void {
    while (this.dirIdx < SPAWN_DIRECTOR.length && this.timeS >= SPAWN_DIRECTOR[this.dirIdx].atS) {
      const b = SPAWN_DIRECTOR[this.dirIdx++];
      if ('set' in b) {
        this.curRate = b.set.rate;
        this.curMix = Object.entries(b.set.mix) as Array<[EnemyKind, number]>;
        this.curMixTotal = this.curMix.reduce((s, [, w]) => s + w, 0);
      } else {
        this.fireFormation(b.event.formation, b.event.kind, b.event.count);
      }
    }
    if (this.curMixTotal > 0 && this.enemies.length < ENEMIES.maxAlive) {
      this.spawnCarry += this.curRate * dt;
      while (this.spawnCarry >= 1) {
        this.spawnCarry -= 1;
        this.spawnEnemy(this.rollMixKind());
      }
    }
  }

  /** One this.rng() call per steady spawn: pick a kind by the current weights.
   *  curMix keeps stable insertion order, so the rng→kind mapping is fixed. */
  private rollMixKind(): EnemyKind {
    let r = this.rng() * this.curMixTotal;
    for (const [kind, w] of this.curMix) {
      r -= w;
      if (r <= 0) return kind;
    }
    return this.curMix[0][0];
  }

  /** Fire a formation once: ring (all sides), surge (one arc), pincer (two
   *  opposite arcs), elite (bounded count from random angles). */
  private fireFormation(f: Formation, kind: EnemyKind, count: number): void {
    if (f === 'ring') this.spawnRingOf(kind, count);
    else if (f === 'surge') this.spawnSurgeOf(kind, count);
    else if (f === 'pincer') {
      const base = this.rng() * Math.PI * 2;
      const half = Math.ceil(count / 2);
      for (let i = 0; i < half; i++)
        this.spawnEnemy(kind, base + (this.rng() * 2 - 1) * 0.45, 1 + this.rng() * 0.5, true);
      for (let i = 0; i < count - half; i++)
        this.spawnEnemy(kind, base + Math.PI + (this.rng() * 2 - 1) * 0.45, 1 + this.rng() * 0.5, true);
    } else {
      // elite
      for (let i = 0; i < count; i++) this.spawnEnemy(kind, this.rng() * Math.PI * 2, 1, true);
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
    const dist = this.spawnDist(ENEMIES[kind].radius) * distMul;
    this.pushEnemy(kind, this.player.x + dcos(a) * dist, this.player.y + dsin(a) * dist);
  }

  /** Construct one enemy at (x,y) with per-kind state, guarded by the hard
   *  cap so splitter cascades never run away. Children reuse this directly. */
  private pushEnemy(kind: EnemyKind, x: number, y: number): void {
    if (this.enemies.length >= MAX_ALIVE_HARD) return;
    const conf = ENEMIES[kind];
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
      x,
      y,
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
      knockX: 0,
      knockY: 0,
      knockT: 0,
      // shield pool scales with hp; circler picks an orbit direction; spitter
      // staggers its first shot so a ring doesn't volley in unison.
      shieldHp: kind === 'shielded' ? conf.hp * s.hpMul * SHIELDED.shieldMul : 0,
      spin: kind === 'circler' ? (this.rng() < 0.5 ? 1 : -1) : 0,
      windupT: 0,
      fireT: kind === 'spitter' ? SPITTER.cooldownS * (0.5 + this.rng() * 0.5) : 0,
    });
  }

  /** Splitter death: burst into a knot of children around the corpse. */
  private spawnChildren(e: Enemy): void {
    const k = SPLITTER.childKind;
    const cr = ENEMIES[k].radius;
    for (let i = 0; i < SPLITTER.childCount; i++) {
      const a = this.rng() * Math.PI * 2;
      this.pushEnemy(k, e.x + dcos(a) * (e.radius + cr), e.y + dsin(a) * (e.radius + cr));
    }
  }

  /** Sandbox: remove every enemy without kills, gems, or pops. */
  clearEnemies(): void {
    this.enemies.length = 0;
    this.enemyShots.length = 0;
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

      // Crash knockback overrides everything: ride the push, don't chase.
      if (e.knockT > 0) {
        e.knockT -= dt;
        e.x += e.knockX * dt;
        e.y += e.knockY * dt;
        continue;
      }

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

      if (e.kind === 'charger') {
        // Telegraphed dash: stand and lock aim during windup, then commit a
        // fast fixed-direction dash. Fairness (muted) is the wind-up pause +
        // the rotating silhouette, not the fx ring.
        if (e.dashing) {
          e.dashT -= dt;
          e.x += e.dashX * CHARGER.dashSpeed * dt;
          e.y += e.dashY * CHARGER.dashSpeed * dt;
          if (e.dashT <= 0) e.dashing = false; // recover -> approach
          continue;
        }
        if (e.windupT > 0) {
          e.windupT -= dt;
          if (e.windupT <= 0) {
            const dd = Math.hypot(p.x - e.x, p.y - e.y) || 1;
            e.dashX = (p.x - e.x) / dd;
            e.dashY = (p.y - e.y) / dd;
            e.dashing = true;
            e.dashT = CHARGER.dashS;
          }
          continue;
        }
        const cd = Math.hypot(p.x - e.x, p.y - e.y);
        if (cd < CHARGER.triggerRange) {
          e.windupT = CHARGER.windupS;
          this.spawnRing(e.x, e.y, e.radius * 2.4, e.color, 0.4); // cosmetic telegraph
          continue;
        }
        // else fall through to default chase at e.speed
      }

      if (e.kind === 'circler') {
        // Orbit-and-harass: blend a radial pull toward the orbit radius with a
        // tangent sweep (spin ±1). Contact damage is handled when it brushes.
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const radial = Math.max(-1, Math.min(1, (d - CIRCLER.orbitR) / CIRCLER.orbitR));
        const tx = -uy * e.spin;
        const ty = ux * e.spin;
        const mx = ux * radial + tx * (1 - Math.abs(radial) * 0.5);
        const my = uy * radial + ty * (1 - Math.abs(radial) * 0.5);
        const m = Math.hypot(mx, my) || 1;
        e.x += (mx / m) * speed * dt;
        e.y += (my / m) * speed * dt;
        continue;
      }

      if (e.kind === 'spitter') {
        // Kite to keepMin..keepMax, strafe in the band, and fire enemy shots.
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        if (d < SPITTER.keepMin) {
          e.x -= ux * speed * dt;
          e.y -= uy * speed * dt;
        } else if (d > SPITTER.keepMax) {
          e.x += ux * speed * dt;
          e.y += uy * speed * dt;
        } else {
          e.x += -uy * speed * 0.5 * dt;
          e.y += ux * speed * 0.5 * dt;
        }
        e.fireT -= dt;
        if (e.fireT <= 0 && d <= SPITTER.range) {
          e.fireT = SPITTER.cooldownS;
          const ang = Math.atan2(dy, dx) + (this.rng() * 2 - 1) * SPITTER.spread;
          this.enemyShots.push({
            x: e.x,
            y: e.y,
            vx: dcos(ang) * SPITTER.shotSpeed,
            vy: dsin(ang) * SPITTER.shotSpeed,
            radius: SPITTER.shotRadius,
            damage: Math.round(
              SPITTER.shotDamage *
                (1 + (ENEMIES.damageScaleEnd - 1) * Math.min(1, this.timeS / RUN.durationS)),
            ),
            lifeS: SPITTER.shotLifeS,
            color: e.color,
          });
        }
        continue;
      }

      let dx = p.x - e.x;
      let dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // separation steering against overlapping neighbors — kept weak so
      // the horde packs into a VS-style wall instead of spreading out.
      // Squared-distance early-out: in the packed wall most candidates
      // don't overlap, and this loop is the frame's hottest code.
      const near = this.hash.query(e.x, e.y, e.radius * 2, this.queryBuf);
      let sx = 0;
      let sy = 0;
      for (const o of near) {
        if (o === e || o.dead) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const r = e.radius + o.radius;
        const d2 = ox * ox + oy * oy;
        if (d2 >= r * r || d2 < 0.000001) continue;
        const od = Math.sqrt(d2);
        const overlap = r - od;
        sx += (ox / od) * overlap;
        sy += (oy / od) * overlap;
      }
      e.x += (dx * speed + sx * 1.5) * dt;
      e.y += (dy * speed + sy * 1.5) * dt;
    }
  }

  private damageEnemy(e: Enemy, amount: number, source?: Role): void {
    if (e.dead) return;
    // Distortion crit (Feature 5). Guarded: with critChance 0 no rng is
    // consumed, so pre-item replays stay bit-identical.
    if (this.mods.critChance > 0 && this.rng() < this.mods.critChance) amount *= this.mods.critMul;
    // Shielded: a shield pool absorbs damage before hp. Attribution stays
    // honest — absorbed damage is counted once here, hp damage once below.
    if (e.shieldHp > 0) {
      const before = e.shieldHp;
      e.shieldHp = Math.max(0, before - amount);
      const absorbed = before - e.shieldHp;
      if (source) this.damageByRole[source] = (this.damageByRole[source] ?? 0) + absorbed;
      e.flashT = 0.08;
      amount -= absorbed;
      if (amount <= 0) return; // shield held
    }
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
      if (e.kind === 'splitter') this.spawnChildren(e);
    }
  }

  private reapEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) this.enemies.splice(i, 1);
    }
  }

  /** Off-screen recycle (the VS model): silently kill any non-elite enemy that
   *  falls far behind the moving player, so the horde is always a wall ahead
   *  and CPU stays bounded. Setting e.dead directly (not via damageEnemy)
   *  means no gem, no kill, no splitter burst — a true recycle. Elites persist
   *  (they are objectives). Pure geometry, deterministic, fx-free. */
  private recycleEnemies(): void {
    const p = this.player;
    const far = this.spawnDist(9) * ENEMIES.recycleFactor;
    const far2 = far * far;
    for (const e of this.enemies) {
      if (e.dead || e.kind === 'elite') continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy > far2) e.dead = true;
    }
  }

  /** Advance spitter shots: move, expire on life/off-screen, and damage the
   *  player on overlap (same iframes/events as contact). Headless-safe. */
  private updateEnemyShots(dt: number): void {
    const p = this.player;
    const far = this.spawnDist(0) * ENEMIES.recycleFactor;
    for (let i = this.enemyShots.length - 1; i >= 0; i--) {
      const s = this.enemyShots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.lifeS -= dt;
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      const rr = s.radius + p.radius;
      let gone = s.lifeS <= 0 || Math.abs(dx) > far || Math.abs(dy) > far;
      if (!gone && dx * dx + dy * dy < rr * rr) {
        gone = true;
        if (p.iframesT <= 0 && !this.invincible) {
          p.hp = Math.max(0, p.hp - s.damage);
          p.iframesT = RUN.iframesS;
          this.events.onHit();
          if (p.hp <= 0) this.events.onDeath();
        }
      }
      if (gone) this.enemyShots.splice(i, 1);
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

  /** Base projectile with all fields defaulted; specialized spawners tweak
   *  the few that matter to them. */
  private baseProjectile(role: Role, conf: WeaponConf, color: number, damage: number): Projectile {
    return {
      role,
      x: this.player.x,
      y: this.player.y,
      vx: 0,
      vy: 0,
      radius: conf.radius!,
      damage,
      pierce: conf.pierce ?? 1,
      lifeS: conf.lifetimeS!,
      homing: role === 'lead',
      speed: conf.speed ?? 0,
      color,
      hit: new Set(),
      age: 0,
      bounces: 0,
      outS: 0,
      returned: false,
      orbitAngle: 0,
      orbitRadius: 0,
      rehitT: 0,
    };
  }

  private spawnProjectile(
    role: Role,
    dir: { x: number; y: number },
    conf: WeaponConf,
    color: number,
    velocity: number,
  ): void {
    const pr = this.baseProjectile(role, conf, color, conf.damage * (0.75 + 0.5 * velocity));
    pr.vx = dir.x * conf.speed!;
    pr.vy = dir.y * conf.speed!;
    this.projectiles.push(pr);
  }

  /** Tom: a boomerang that flies out then curves back to the player. */
  private spawnBoomerang(
    dir: { x: number; y: number },
    conf: WeaponConf,
    color: number,
    velocity: number,
  ): void {
    const pr = this.baseProjectile('tom', conf, color, conf.damage * (0.8 + 0.4 * velocity));
    pr.vx = dir.x * conf.speed!;
    pr.vy = dir.y * conf.speed!;
    pr.outS = conf.lifetimeS! * BOOMERANG_OUT_FRAC;
    this.projectiles.push(pr);
  }

  /** Cowbell: a bolt that ricochets off the view edges, re-hitting per leg. */
  private spawnRicochet(
    dir: { x: number; y: number },
    conf: WeaponConf,
    color: number,
    velocity: number,
  ): void {
    const pr = this.baseProjectile('cowbell', conf, color, conf.damage * (0.75 + 0.5 * velocity));
    pr.vx = dir.x * conf.speed!;
    pr.vy = dir.y * conf.speed!;
    pr.bounces = conf.bounces ?? 3;
    this.projectiles.push(pr);
  }

  /** Arp: an orbiter that circles the player, chipping what it sweeps. */
  private spawnOrbiter(conf: WeaponConf, color: number, velocity: number): void {
    const angle = this.rng() * Math.PI * 2;
    const pr = this.baseProjectile('arp', conf, color, conf.damage * (0.8 + 0.4 * velocity));
    pr.pierce = Infinity;
    pr.orbitAngle = angle;
    pr.orbitRadius = conf.orbitRadius!;
    pr.x = this.player.x + dcos(angle) * pr.orbitRadius;
    pr.y = this.player.y + dsin(angle) * pr.orbitRadius;
    this.projectiles.push(pr);
  }

  /** Crash: an expanding shockwave from the player. */
  private spawnShock(conf: WeaponConf, color: number): void {
    this.shocks.push({
      x: this.player.x,
      y: this.player.y,
      radius: 12,
      maxRadius: conf.radius!,
      speed: conf.speed!,
      damage: conf.damage,
      knockback: conf.knockback ?? 50,
      color,
      hit: new Set(),
    });
  }

  /** Clap: damage every enemy inside a forward cone (also point-blank). */
  private damageCone(
    x: number,
    y: number,
    angle: number,
    halfArc: number,
    reach: number,
    damage: number,
    source: Role,
    shove = 0,
  ): void {
    const near = this.hash.query(x, y, reach + 24, this.queryBuf);
    for (const e of near) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > reach + e.radius) continue;
      if (d < 34) {
        this.damageEnemy(e, damage, source);
        if (shove) this.shove(e, x, y, shove);
        continue;
      }
      let diff = Math.atan2(dy, dx) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= halfArc) {
        this.damageEnemy(e, damage, source);
        if (shove) this.shove(e, x, y, shove);
      }
    }
  }

  /** Zap: up to n distinct random living enemies within range. */
  private pickRandomEnemies(n: number, range: number): Enemy[] {
    const p = this.player;
    const r2 = range * range;
    const cand: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy <= r2) cand.push(e);
    }
    const out: Enemy[] = [];
    for (let i = 0; i < n && cand.length > 0; i++) {
      const idx = Math.floor(this.rng() * cand.length);
      out.push(cand[idx]);
      cand.splice(idx, 1);
    }
    return out;
  }

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.age += dt;
      pr.lifeS -= dt;

      if (pr.role === 'arp') {
        // Orbit the player; clear the hit set on a cooldown so a slow sweep
        // keeps chipping the same enemy instead of touching it once.
        pr.orbitAngle += ARP_OMEGA * dt;
        pr.x = p.x + dcos(pr.orbitAngle) * pr.orbitRadius;
        pr.y = p.y + dsin(pr.orbitAngle) * pr.orbitRadius;
        pr.rehitT -= dt;
        if (pr.rehitT <= 0) {
          pr.hit.clear();
          pr.rehitT = ORBIT_REHIT_S;
        }
      } else if (pr.role === 'tom') {
        // Boomerang: fly out, then curve home; both legs land.
        if (!pr.returned && pr.age >= pr.outS) {
          pr.returned = true;
          pr.hit.clear();
        }
        if (pr.returned) {
          const dx = p.x - pr.x;
          const dy = p.y - pr.y;
          const ang = Math.atan2(dy, dx);
          pr.vx = dcos(ang) * pr.speed;
          pr.vy = dsin(ang) * pr.speed;
          if (dx * dx + dy * dy < 24 * 24) {
            pr.lifeS = 0;
            this.fx?.push({ type: 'spark', x: p.x, y: p.y, color: pr.color, n: 6, spread: 16 });
          }
        }
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
      } else {
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
        if (pr.role === 'cowbell' && pr.bounces > 0) {
          // Ricochet off the camera-locked view edges; re-hit after a bounce.
          const left = p.x - this.worldW / 2;
          const right = p.x + this.worldW / 2;
          const top = p.y - this.worldH / 2;
          const bottom = p.y + this.worldH / 2;
          let bounced = false;
          if (pr.x < left) {
            pr.x = left;
            pr.vx = Math.abs(pr.vx);
            bounced = true;
          } else if (pr.x > right) {
            pr.x = right;
            pr.vx = -Math.abs(pr.vx);
            bounced = true;
          }
          if (pr.y < top) {
            pr.y = top;
            pr.vy = Math.abs(pr.vy);
            bounced = true;
          } else if (pr.y > bottom) {
            pr.y = bottom;
            pr.vy = -Math.abs(pr.vy);
            bounced = true;
          }
          if (bounced) {
            pr.bounces -= 1;
            pr.hit.clear();
            this.fx?.push({ type: 'spark', x: pr.x, y: pr.y, color: pr.color, n: 5, spread: 14 });
            if (pr.bounces < 0) pr.lifeS = 0;
          }
        }
      }

      const near = this.hash.query(pr.x, pr.y, pr.radius + 24, this.queryBuf);
      for (const e of near) {
        if (e.dead || pr.hit.has(e) || !circlesOverlap(pr, e)) continue;
        pr.hit.add(e);
        this.damageEnemy(e, pr.damage, pr.role);
        // Shove (sim, deterministic): snare 20 / bass 10. Writes only the
        // knock channel the bot already simulates.
        const sh = WEAPON_SHOVE[pr.role];
        if (sh) this.shove(e, pr.x, pr.y, sh);
        // Per-hit spark (view-only, bounded to low-count roles).
        if (SPARK_HIT_ROLES.has(pr.role))
          this.fx?.push({ type: 'spark', x: e.x, y: e.y, color: pr.color, n: 4, spread: 12 });
        // Sweep weapons (orbit, ricochet, boomerang) gate re-hits with their
        // own hit set instead of spending pierce.
        if (pr.role === 'arp' || pr.role === 'cowbell' || pr.role === 'tom') continue;
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

  private updateShocks(dt: number): void {
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.radius += s.speed * dt;
      const near = this.hash.query(s.x, s.y, s.radius + 24, this.queryBuf);
      for (const e of near) {
        if (e.dead || s.hit.has(e)) continue;
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const d = Math.hypot(dx, dy);
        // Only the growing front hits, and each enemy only once.
        if (d <= s.radius + e.radius && d >= s.radius - SHOCK_BAND) {
          s.hit.add(e);
          this.damageEnemy(e, s.damage, 'crash');
          const nd = d || 1;
          e.knockX = (dx / nd) * (s.knockback / KNOCK_S);
          e.knockY = (dy / nd) * (s.knockback / KNOCK_S);
          e.knockT = KNOCK_S;
        }
      }
      if (s.radius >= s.maxRadius) this.shocks.splice(i, 1);
    }
  }

  private spawnZone(
    x: number,
    y: number,
    conf: { damage: number; radius?: number; lifetimeS?: number },
    color: number,
    source: Role,
  ): void {
    this.zones.push({
      x,
      y,
      radius: conf.radius!,
      damage: conf.damage,
      lifeS: conf.lifetimeS!,
      tickT: 0,
      color,
      source,
    });
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.lifeS -= dt;
      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = ZONE_TICK_S;
        this.damageArea(z.x, z.y, z.radius, z.damage, z.source);
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

  /** Rimshot's chain (the band): a crack that hops through a cluster. Seeds on
   *  the nearest enemy to the player, then leaps to the next-nearest un-hit
   *  enemy within CHAIN_HOP, up to `chains` links. Each link is single-target
   *  and draws a bolt from the previous point. */
  private chainCrack(
    chains: number,
    damage: number,
    sparkRadius: number,
    source: Role,
    color: number,
  ): void {
    const p = this.player;
    const struck = new Set<Enemy>();
    let px = p.x;
    let py = p.y;
    let cx = p.x;
    let cy = p.y;
    let range = CHAIN_SEEK;
    for (let k = 0; k < chains; k++) {
      const near = this.hash.query(cx, cy, range, this.queryBuf);
      let best: Enemy | null = null;
      let bestD = Infinity;
      for (const e of near) {
        if (e.dead || struck.has(e)) continue;
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) break;
      struck.add(best);
      this.damageEnemy(best, damage, source);
      this.fx?.push({ type: 'zigbolt', x1: px, y1: py, x2: best.x, y2: best.y, color, branches: 1 });
      this.fx?.push({ type: 'spark', x: best.x, y: best.y, color, n: 5, spread: sparkRadius });
      px = best.x;
      py = best.y;
      cx = best.x;
      cy = best.y;
      range = CHAIN_HOP; // after the seed, only chain through the cluster
    }
  }

  private damageArea(
    x: number,
    y: number,
    radius: number,
    damage: number,
    source?: Role,
    shove = 0,
  ): void {
    const near = this.hash.query(x, y, radius + 24, this.queryBuf);
    const area = { x, y, radius };
    for (const e of near) {
      if (!e.dead && circlesOverlap(area, e)) {
        this.damageEnemy(e, damage, source);
        if (shove) this.shove(e, x, y, shove);
      }
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
      if (d < RUN.magnetRadius * this.mods.magnetMul) {
        const pull = 420 * dt;
        g.x += (dx / (d || 1)) * pull;
        g.y += (dy / (d || 1)) * pull;
      }
      if (d < RUN.pickupRadius) {
        this.xp += Math.round(g.xp * this.mods.xpMul);
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

  private spawnRing(x: number, y: number, radius: number, color: number, dur: number, soft = false): void {
    this.fx?.push({ type: 'ring', x, y, radius, color, dur, soft });
  }

  private spawnPop(x: number, y: number, radius: number): void {
    this.fx?.push({ type: 'pop', x, y, radius });
  }
}
