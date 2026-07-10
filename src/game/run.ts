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
import { TIER_COUNT } from '../audio/charts';
import { supportedSlots } from './band';
import {
  AIM_RANGE,
  ARP_OMEGA,
  BELL,
  BOOMERANG_OUT_FRAC,
  CHAIN_HOP,
  CHAIN_SEEK,
  CHARGER,
  DASH,
  DARTER,
  ENEMIES,
  ENEMY_BANDS,
  enemyScaling,
  FLASH,
  KNOCK_S,
  MAX_ALIVE_HARD,
  ORBIT_REHIT_S,
  RIDE,
  RUN,
  SHAKE,
  SHOCK_BAND,
  SHOVE_S,
  SPAWN_DIRECTOR,
  SPLITTER,
  VARIANT_EFFECTS,
  WEAPON_SHOVE,
  WEAPONS,
  WHISTLE,
  ZAP_RANGE,
  ZONE_SLOW_MUL,
  ZONE_THROW_RANGE,
  ZONE_TICK_S,
  type EnemyKind,
  type Formation,
  type WeaponConf,
} from './config';
import { dcos, dsin } from './dmath';
import type { Rng } from './rng';
import { SpatialHash, circlesOverlap } from './spatial';

/** Roles that emit a per-hit spark on impact. Bounded to low-count roles so
 *  a full late horde never floods the fx queue. */
const SPARK_HIT_ROLES = new Set<Role>(['lead']);

/** Bound persistent emitters so chart density cannot multiply into unbounded
 *  overlapping damage. Values are per authored tier. */
const ZONE_CAPS: Partial<Record<Role, readonly number[]>> = {
  shaker: [8, 10, 12, 14],
  acid: [1, 1, 1, 1],
  chord: [1, 1, 1, 1],
  rhodes: [2, 3, 4, 5],
};

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
  /** Dash state shared by darters and chargers. Both visibly aim, lock their
   *  direction, dash without steering, then observe a recovery window. */
  dashT: number;
  dashX: number;
  dashY: number;
  dashing: boolean;
  windupT: number;
  recoveryT: number;
  /** Time left under a chord zone's slow. */
  slowT: number;
  /** Time left frozen solid by ride's sweep (no movement while > 0). */
  frozenT: number;
  /** Crash knockback: velocity (px/s) and time left being pushed. While
   *  knockT > 0 the enemy rides this vector instead of chasing. */
  knockX: number;
  knockY: number;
  knockT: number;
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
  /** pluck: the point it arcs to; on arrival it explodes (damageArea). */
  tx: number;
  ty: number;
  /** bell: shards to spawn on this shot's first hit (0 for a shard itself, so
   *  shards never re-shatter). */
  shatter: number;
  /** True for a bell shard (a fragment shot), so its hit path skips shattering. */
  shard: boolean;
}

/** Whistle's mark: an enemy tagged to pop after a short delay for a heavy
 *  delayed burst. Follows the enemy while it lives; pops at its last position
 *  if it dies first. Pure state (timeS-gated), so the bot runs it too. */
export interface WhistleTag {
  enemy: Enemy;
  x: number;
  y: number;
  popAtS: number;
  damage: number;
  radius: number;
  color: number;
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
  /** chord/shaker slow enemies inside on each tick; acid/rhodes do not. */
  slow: boolean;
  /** acid: inward pull speed (px/s) applied every frame; 0 for other zones. */
  pull: number;
  /** rhodes: an armed mine — no periodic tick; blooms once on enemy contact. */
  mine: boolean;
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
  | { type: 'dmg'; x: number; y: number; amount: number; color: number }
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
  heartbeat: 0xff7a9c,
  shaker: 0x7be0d0,
  acid: 0xb6ff5a,
  pluck: 0x8f7bff,
  rhodes: 0x5ad1ff,
  ride: 0x9fe8ff,
  riser: 0xcbb4ff,
  reese: 0x6a4fd0,
  choir: 0xc7f0d8,
  bell: 0xffd76b,
  whistle: 0xff9ecb,
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
  /** Number of authored weapon states in this run. Track profiles with fewer
   *  than eight lanes stop XP at their own real catalog cap; omitted keeps the
   *  legacy House/bot behavior. */
  maxBuildLevel?: number;
  /** Optional track-specific pacing seam. Values below 1 make level-ups arrive
   *  sooner; omitted is exactly the legacy XP curve. */
  xpThresholdMul?: number;
  /** Fine-grained balance compensation for a profile lane whose authored riff
   *  fires much more or less often than the legacy weapon chart. */
  weaponDamageMul?: Readonly<Partial<Record<Role, number>>>;
}

export class RunWorld {
  /** Owned weapons and their ladder tier (1-4). */
  readonly tiers = new Map<Role, number>();

  // dashT/dashX/dashY: riser's auto-dash surge (a short velocity boost the
  // release grants, on top of normal movement).
  player = { x: 0, y: 0, hp: RUN.playerHp, radius: RUN.playerRadius, iframesT: 0, dashT: 0, dashX: 0, dashY: 0 };
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
  /** Tempo damage compensation (docs/plan.md, tempo and damage): more triggers
   *  per second means each hits softer, so per-trigger damage is scaled by this
   *  factor as every weapon fires. Set once from the soundset at run start. */
  powerMul = 1;

  /** Visual-effect requests for the view; null when running headless. */
  readonly fx: FxEvent[] | null;

  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: Zone[] = [];
  readonly shocks: Shock[] = [];
  readonly gems: Gem[] = [];
  /** Whistle's live tags (sub-phase C). */
  readonly tags: WhistleTag[] = [];
  /** Ride's radar beam angle; advances a fixed step each trigger so successive
   *  sweeps spread around the circle instead of retracing. */
  private rideAngle = 0;

  private rng: Rng;
  private control: () => { x: number; y: number };
  private events: RunEvents;
  private view: { width: number; height: number };

  private hash = new SpatialHash<Enemy>();
  private queryBuf: Enemy[] = [];

  /** Spawn Director state: regular-enemy population target, maximum refill
   *  rate while below it, weighted roster, and fractional spawn accumulator. */
  private dirIdx = 0;
  private curTargetAlive = 0;
  private curRefillRate = 0;
  private curMix: Array<[EnemyKind, number]> = [];
  private curMixTotal = 0;
  private spawnCarry = 0;
  private scripted: boolean;
  private readonly maxBuildLevel: number;
  private readonly xpThresholdMul: number;
  private readonly weaponDamageMul: Readonly<Partial<Record<Role, number>>>;

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
    this.maxBuildLevel = Math.max(
      1,
      Math.floor(opts.maxBuildLevel ?? supportedSlots().length * TIER_COUNT),
    );
    const xpMul = opts.xpThresholdMul;
    this.xpThresholdMul =
      xpMul !== undefined && Number.isFinite(xpMul) && xpMul > 0 ? xpMul : 1;
    this.weaponDamageMul = { ...opts.weaponDamageMul };
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
    this.fireWeapon(t);
  }

  private fireWeapon(t: ScheduledTrigger): void {
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
    conf = this.applyBuild(t.role, conf);

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
      case 'heartbeat': {
        // Breathing field: shove the inner ring out, drag the outer ring in,
        // a soft tick of damage to everything caught.
        const R = conf.radius! * (0.9 + 0.2 * v);
        const inner = R * 0.45;
        const near = this.hash.query(p.x, p.y, R + 24, this.queryBuf);
        for (const e of near) {
          if (e.dead) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > R + e.radius) continue;
          this.damageEnemy(e, conf.damage * v, 'heartbeat');
          if (d < inner) this.shove(e, p.x, p.y, conf.knockback ?? 30);
          else this.drag(e, p.x, p.y, conf.pull ?? 300, 0.15);
        }
        this.spawnRing(p.x, p.y, R, color, 0.3, true);
        this.spawnRing(p.x, p.y, inner, color, 0.22, true);
        break;
      }
      case 'shaker': {
        // Drop a short-lived damaging blob where you stand; moving strings them
        // into a trail. No slow — the hats own speed, not control.
        this.spawnZone(p.x, p.y, conf, color, 'shaker', { slow: false });
        this.spawnRing(p.x, p.y, conf.radius!, color, 0.18, true);
        break;
      }
      case 'acid': {
        // A gravity well thrown at the nearest pack: pulls enemies in and ticks
        // damage while they are caught.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, conf, color, 'acid', {
          slow: false,
          pull: conf.pull ?? 100,
        });
        break;
      }
      case 'pluck': {
        // A note lobbed on an arc to the nearest pack; it bursts on landing.
        this.spawnLob(conf, color, v);
        break;
      }
      case 'rhodes': {
        // Place an armed mine where you stand; it blooms when an enemy steps in.
        this.spawnZone(p.x, p.y, conf, color, 'rhodes', { mine: true });
        this.spawnRing(p.x, p.y, conf.radius!, color, 0.2, true);
        break;
      }
      case 'ride': {
        // The freeze weapon: a radar beam sweeps a wedge of the surrounding
        // circle, freezing (and token-damaging) only what it crosses. The beam
        // rotates a fixed step each trigger, so a fast cadence spreads the freeze
        // around the ring rather than locking the whole screen.
        // Wrap into [0, 2π): rideAngle is a monotonic accumulator, and `ang`
        // below feeds diff-normalization while-loops — an unwrapped angle would
        // make them spin ~rideAngle/2π times, growing unbounded over a run.
        this.rideAngle = (this.rideAngle + RIDE.step) % (Math.PI * 2);
        const ang = this.rideAngle;
        const R = conf.radius! * (0.9 + 0.2 * v);
        const near = this.hash.query(p.x, p.y, R + 24, this.queryBuf);
        for (const e of near) {
          if (e.dead) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > R + e.radius) continue;
          let diff = Math.atan2(dy, dx) - ang;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) > RIDE.wedge) continue;
          this.damageEnemy(e, conf.damage * v, 'ride');
          e.frozenT = Math.max(e.frozenT, RIDE.freezeS);
        }
        // A radar line to the beam tip, plus a faint reach ring.
        this.fx?.push({
          type: 'bolt',
          x1: p.x,
          y1: p.y,
          x2: p.x + dcos(ang) * R,
          y2: p.y + dsin(ang) * R,
          color,
        });
        this.spawnRing(p.x, p.y, R, color, 0.22, true);
        break;
      }
      case 'riser': {
        // The auto-dash: the release grants a short movement surge (direction =
        // current move input, or a fallback) plus a token whoosh of damage.
        const a = this.control();
        let dx = a.x;
        let dy = a.y;
        const mag = Math.hypot(dx, dy);
        if (mag > 0.001) {
          dx /= mag;
          dy /= mag;
        } else {
          // standing still: dash toward the nearest pack, else a random way
          const tgt = this.nearestEnemy(AIM_RANGE);
          const da = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : this.rng() * Math.PI * 2;
          dx = dcos(da);
          dy = dsin(da);
        }
        p.dashT = DASH.surgeS;
        p.dashX = dx;
        p.dashY = dy;
        this.damageArea(p.x, p.y, conf.radius!, conf.damage * v, 'riser');
        this.spawnRing(p.x, p.y, conf.radius!, color, 0.3);
        this.fx?.push({ type: 'spark', x: p.x, y: p.y, color, n: 8, spread: conf.radius! * 0.5 });
        break;
      }
      case 'reese': {
        // A growling bass wall dropped on the nearest pack: grinds (slows) and
        // ticks heavy damage while enemies are held in it.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, conf, color, 'reese', { slow: true });
        break;
      }
      case 'choir': {
        // A singing orb summoned on the nearest pack: it stays and pulses damage
        // (a long-lived ticking zone, no slow).
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, conf, color, 'choir', { slow: false });
        this.spawnRing(target?.x ?? p.x, target?.y ?? p.y, conf.radius!, color, 0.3, true);
        break;
      }
      case 'bell': {
        // A note lobbed straight that shatters into shards on its first hit.
        this.spawnBell(this.aimDir(0.1), conf, color, v);
        break;
      }
      case 'whistle': {
        // Tag the nearest un-tagged enemy; it pops a beat later for a heavy
        // delayed burst.
        this.spawnWhistleTag(conf, color, v);
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

  /** The only global weapon transform: fixed-tempo power compensation. */
  private applyBuild(role: Role, conf: WeaponConf): WeaponConf {
    const authored = this.weaponDamageMul[role];
    const roleMul =
      authored !== undefined && Number.isFinite(authored) && authored > 0 ? authored : 1;
    return { ...conf, damage: conf.damage * this.powerMul * roleMul };
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

    this.moveEnemies(dt);
    this.recycleEnemies();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateTags();
    this.updateShocks(dt);
    this.updateGems(dt);
    this.contactDamage(dt);

    this.reapEnemies();
  }

  // ---- player ----

  private movePlayer(dt: number): void {
    const a = this.control();
    this.player.x += a.x * RUN.playerSpeed * dt;
    this.player.y += a.y * RUN.playerSpeed * dt;
    // Riser's auto-dash surge: a short extra velocity along the locked dash
    // direction, on top of normal input. Deterministic (timeS-stepped), so the
    // bot rides it too.
    if (this.player.dashT > 0) {
      this.player.dashT -= dt;
      this.player.x += this.player.dashX * DASH.speed * dt;
      this.player.y += this.player.dashY * DASH.speed * dt;
    }
    if (this.player.iframesT > 0) this.player.iframesT -= dt;
  }

  private contactDamage(dt: number): void {
    void dt;
    if (this.player.iframesT > 0 || this.invincible) return;
    const p = this.player;
    const near = this.hash.query(p.x, p.y, p.radius + 40, this.queryBuf);
    for (const e of near) {
      if (e.dead || !circlesOverlap(p, e)) continue;
      const dmg = Math.max(1, Math.round(e.damage));
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

  /** Drain every due Director beat, then refill regular enemies only while
   *  their authored target is undersupplied. A lower target is a real
   *  breather: fractional carry is discarded rather than banked for later. */
  private runDirector(dt: number): void {
    while (this.dirIdx < SPAWN_DIRECTOR.length && this.timeS >= SPAWN_DIRECTOR[this.dirIdx].atS) {
      const b = SPAWN_DIRECTOR[this.dirIdx++];
      if ('set' in b) {
        this.curTargetAlive = b.set.targetAlive;
        this.curRefillRate = b.set.refillRate;
        this.curMix = Object.entries(b.set.mix) as Array<[EnemyKind, number]>;
        this.curMixTotal = this.curMix.reduce((s, [, w]) => s + w, 0);
        this.spawnCarry = 0;
      } else {
        this.fireFormation(b.event.formation, b.event.kind, b.event.count);
      }
    }

    let regularAlive = 0;
    for (const e of this.enemies) if (!e.dead && e.kind !== 'elite') regularAlive++;
    if (
      this.curMixTotal > 0 &&
      regularAlive < this.curTargetAlive &&
      this.enemies.length < ENEMIES.maxAlive
    ) {
      this.spawnCarry += this.curRefillRate * dt;
      while (
        this.spawnCarry >= 1 &&
        regularAlive < this.curTargetAlive &&
        this.enemies.length < ENEMIES.maxAlive
      ) {
        this.spawnCarry -= 1;
        this.spawnEnemy(this.rollMixKind());
        regularAlive++;
      }
    } else {
      this.spawnCarry = 0;
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

  /** Fire a formation once: ring (all sides), surge (one distant arc), pincer
   *  (two close, high-stakes telegraphed arcs), elite (bounded random angles).
   *  Pincer Darters hit harder because their authored tell is the dodge test. */
  private fireFormation(f: Formation, kind: EnemyKind, count: number): void {
    if (f === 'ring') this.spawnRingOf(kind, count);
    else if (f === 'surge') this.spawnSurgeOf(kind, count);
    else if (f === 'pincer') {
      const base = this.rng() * Math.PI * 2;
      const half = Math.ceil(count / 2);
      for (let i = 0; i < half; i++) {
        const e = this.spawnEnemy(kind, base + (this.rng() * 2 - 1) * 0.45, 0.2 + this.rng() * 0.02, true);
        if (e?.kind === 'darter') {
          e.recoveryT = 0;
          e.damage = Math.round(e.damage * 1.5);
        }
      }
      for (let i = 0; i < count - half; i++) {
        const e = this.spawnEnemy(kind, base + Math.PI + (this.rng() * 2 - 1) * 0.45, 0.2 + this.rng() * 0.02, true);
        if (e?.kind === 'darter') {
          e.recoveryT = 0;
          e.damage = Math.round(e.damage * 1.5);
        }
      }
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

  spawnEnemy(kind: EnemyKind, angle?: number, distMul = 1, wave = false): Enemy | null {
    if (this.enemies.length >= (wave ? MAX_ALIVE_HARD : ENEMIES.maxAlive)) return null;
    const a = angle ?? this.rng() * Math.PI * 2;
    const dist = this.spawnDist(ENEMIES[kind].radius) * distMul;
    return this.pushEnemy(kind, this.player.x + dcos(a) * dist, this.player.y + dsin(a) * dist);
  }

  /** Construct one enemy at (x,y) with per-kind state, guarded by the hard
   *  cap so splitter cascades never run away. Children reuse this directly. */
  private pushEnemy(kind: EnemyKind, x: number, y: number): Enemy | null {
    if (this.enemies.length >= MAX_ALIVE_HARD) return null;
    const conf = ENEMIES[kind];
    // Scaling over the run: HP opposes the build's growth curve, contact
    // damage creeps so late hits stay scary, and the visual band says how
    // dangerous this enemy is. The sandbox spawns at its stage-minute
    // preview (default 0 = the stat-card values).
    const t = this.scripted ? this.timeS : this.stageTimeOverride;
    const s = enemyScaling(t / RUN.durationS, kind);
    const radius = conf.radius * ENEMY_BANDS.sizeMul[s.band];
    const color = ENEMY_BANDS.colors[kind][s.band];
    const enemy: Enemy = {
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
      windupT: 0,
      recoveryT: kind === 'darter' ? DARTER.pauseS : 0,
      slowT: 0,
      frozenT: 0,
      knockX: 0,
      knockY: 0,
      knockT: 0,
    };
    this.enemies.push(enemy);
    return enemy;
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

      // Ride's freeze holds an enemy solid: no movement of any kind while it
      // lasts (knockback still resolves first, below, so a shove isn't cancelled
      // — but a frozen enemy that isn't being shoved simply stops).
      if (e.frozenT > 0) {
        e.frozenT -= dt;
        if (e.knockT <= 0) continue;
      }

      // Crash knockback overrides everything: ride the push, don't chase.
      if (e.knockT > 0) {
        e.knockT -= dt;
        e.x += e.knockX * dt;
        e.y += e.knockY * dt;
        continue;
      }

      if (e.kind === 'darter') {
        // Rest -> visible locked-direction tell -> straight dash. The tell is
        // gameplay state (the view swells/tints it), so muted play stays fair.
        if (e.dashing) {
          e.dashT -= dt;
          e.x += e.dashX * speed * dt;
          e.y += e.dashY * speed * dt;
          if (e.dashT <= 0) {
            e.dashing = false;
            e.recoveryT = DARTER.pauseS;
          }
          continue;
        }
        if (e.windupT > 0) {
          e.windupT -= dt;
          if (e.windupT <= 0) {
            e.dashing = true;
            e.dashT = DARTER.dashS;
          }
          continue;
        }
        if (e.recoveryT > 0) {
          e.recoveryT -= dt;
          continue;
        }
        const dd = Math.hypot(p.x - e.x, p.y - e.y) || 1;
        e.dashX = (p.x - e.x) / dd;
        e.dashY = (p.y - e.y) / dd;
        e.windupT = DARTER.tellS;
        this.spawnRing(e.x, e.y, e.radius * 2, e.color, DARTER.tellS, true);
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
          if (e.dashT <= 0) {
            e.dashing = false;
            e.recoveryT = CHARGER.recoveryS;
          }
          continue;
        }
        if (e.windupT > 0) {
          e.windupT -= dt;
          if (e.windupT <= 0) {
            e.dashing = true;
            e.dashT = CHARGER.dashS;
          }
          continue;
        }
        if (e.recoveryT > 0) {
          e.recoveryT -= dt;
          continue;
        }
        const cd = Math.hypot(p.x - e.x, p.y - e.y);
        if (cd < CHARGER.triggerRange) {
          // Lock the lane at tell start, so the silhouette points down the
          // exact path the player needs to dodge.
          const dd = cd || 1;
          e.dashX = (p.x - e.x) / dd;
          e.dashY = (p.y - e.y) / dd;
          e.windupT = CHARGER.windupS;
          this.spawnRing(e.x, e.y, e.radius * 2.4, e.color, CHARGER.windupS);
          continue;
        }
        // else fall through to default chase at e.speed
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

  private damageEnemy(e: Enemy, amount: number, source?: Role, bypassBrace = false): void {
    if (e.dead) return;
    // A Darter's warm swell is a real commitment window: once it starts its
    // very short tell it braces through the dash, then becomes vulnerable
    // during the long recovery. This prevents close pincer waves from being
    // erased by passive aura damage before a stationary player has to dodge.
    if (!bypassBrace && e.kind === 'darter' && (e.windupT > 0 || e.dashing)) return;
    // Floating damage number (view-only; fx is null headless). Weapon-colored,
    // rounded; sub-1 ticks and instakills (Infinity) don't get a number.
    if (this.fx && Number.isFinite(amount)) {
      const shown = Math.round(amount);
      if (shown >= 1)
        this.fx.push({
          type: 'dmg',
          x: e.x,
          y: e.y - e.radius,
          amount: shown,
          color: source ? KIT_COLORS[source] : 0xcfd2e0,
        });
    }
    // Effective damage only: overkill on a small swarmer must not count as a
    // full heavy hit, or AoE sweeps inflate their share.
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

  /** Debug helper: grant XP as if picked up. */
  grantXp(amount: number): void {
    this.xp += amount;
    this.checkLevel();
  }

  /** Debug helper: jump straight to the next level-up. */
  levelUp(): void {
    const threshold = this.xpThreshold();
    this.grantXp(Math.max(0, threshold - this.xp));
  }

  /** Debug helper: kill everything on screen. */
  killVisible(): void {
    for (const e of this.enemies) {
      if (
        Math.abs(e.x - this.player.x) < this.worldW / 2 &&
        Math.abs(e.y - this.player.y) < this.worldH / 2
      ) {
        this.damageEnemy(e, Infinity, undefined, true);
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
      tx: 0,
      ty: 0,
      shatter: 0,
      shard: false,
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

  /** Pluck bass: a note lobbed toward the nearest pack that explodes on
   *  landing. lifeS is set to the travel time, so it bursts on arrival. */
  private spawnLob(conf: WeaponConf, color: number, velocity: number): void {
    const p = this.player;
    const target = this.nearestEnemy(AIM_RANGE);
    const tx = target?.x ?? p.x + (this.rng() * 2 - 1) * 220;
    const ty = target?.y ?? p.y + (this.rng() * 2 - 1) * 220;
    const pr = this.baseProjectile('pluck', conf, color, conf.damage * (0.8 + 0.4 * velocity));
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = conf.speed ?? 300;
    pr.vx = (dx / d) * speed;
    pr.vy = (dy / d) * speed;
    pr.tx = tx;
    pr.ty = ty;
    pr.pierce = Infinity; // never consumed en route — it only bursts on landing
    pr.lifeS = Math.min(conf.lifetimeS ?? 0.7, d / speed);
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

  /** Bell: a note lobbed straight that shatters into shards on its first hit.
   *  The shatter count (per tier) rides on the shot; the shard spawn happens in
   *  updateProjectiles when it lands its first hit. */
  private spawnBell(
    dir: { x: number; y: number },
    conf: WeaponConf,
    color: number,
    velocity: number,
  ): void {
    const tier = this.tiers.get('bell') ?? 1;
    const pr = this.baseProjectile('bell', conf, color, conf.damage * (0.8 + 0.4 * velocity));
    pr.vx = dir.x * conf.speed!;
    pr.vy = dir.y * conf.speed!;
    pr.shatter = BELL.shards[tier - 1] ?? BELL.shards[0];
    this.projectiles.push(pr);
  }

  /** Bell's shatter: fling a radial burst of small shard shots from (x,y). Each
   *  shard is a bell projectile flagged so it can never itself re-shatter. */
  private spawnShards(x: number, y: number, count: number, damage: number, color: number): void {
    const base = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const pr = this.baseProjectile(
        'bell',
        { damage, radius: BELL.shardRadius, lifetimeS: BELL.shardLifeS, pierce: BELL.shardPierce },
        color,
        damage,
      );
      pr.damage = damage;
      pr.x = x;
      pr.y = y;
      pr.vx = dcos(a) * BELL.shardSpeed;
      pr.vy = dsin(a) * BELL.shardSpeed;
      pr.shard = true;
      this.projectiles.push(pr);
    }
  }

  /** Whistle: tag the nearest un-tagged living enemy; it pops WHISTLE.popS later
   *  for a heavy delayed burst. Falls back to a token pop at the player if there
   *  is nothing to tag, so the trigger is never a total no-op (Model A). */
  private spawnWhistleTag(conf: WeaponConf, color: number, velocity: number): void {
    const tagged = new Set(this.tags.map((t) => t.enemy));
    const p = this.player;
    let best: Enemy | null = null;
    let bestD = AIM_RANGE * AIM_RANGE;
    for (const e of this.enemies) {
      if (e.dead || tagged.has(e)) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) {
      // Nothing to tag: a token pop at the player so the trigger is never a
      // total no-op (Model A / Pillar 1 — every trigger deals damage + sound).
      this.damageArea(p.x, p.y, conf.radius!, conf.damage * (0.85 + 0.3 * velocity), 'whistle');
      this.spawnRing(p.x, p.y, conf.radius!, color, 0.2, true);
      return;
    }
    this.tags.push({
      enemy: best,
      x: best.x,
      y: best.y,
      popAtS: this.timeS + WHISTLE.popS,
      damage: conf.damage * (0.85 + 0.3 * velocity),
      radius: conf.radius!,
      color,
    });
    this.fx?.push({ type: 'ring', x: best.x, y: best.y, radius: conf.radius! * 0.6, color, dur: 0.3, soft: true });
  }

  /** Advance whistle tags: track the live target, then pop it (a delayed burst)
   *  once its timer elapses. timeS-gated, so bot/replay stay deterministic. */
  private updateTags(): void {
    for (let i = this.tags.length - 1; i >= 0; i--) {
      const tag = this.tags[i];
      if (!tag.enemy.dead) {
        tag.x = tag.enemy.x;
        tag.y = tag.enemy.y;
      }
      if (this.timeS >= tag.popAtS) {
        this.damageArea(tag.x, tag.y, tag.radius, tag.damage, 'whistle', 20);
        this.spawnRing(tag.x, tag.y, tag.radius, tag.color, 0.28);
        this.fx?.push({ type: 'slam', x: tag.x, y: tag.y, radius: tag.radius * 0.5, color: tag.color });
        this.fx?.push({ type: 'spark', x: tag.x, y: tag.y, color: tag.color, n: 7, spread: tag.radius * 0.5 });
        this.tags.splice(i, 1);
      }
    }
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

      if (pr.role === 'pluck') {
        // Lobbed note: arcs toward its landing point and bursts there. No
        // en-route hits — it only explodes where it lands.
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        if (pr.lifeS <= 0) {
          this.damageArea(pr.x, pr.y, pr.radius, pr.damage, 'pluck', 18);
          this.spawnRing(pr.x, pr.y, pr.radius, pr.color, 0.28);
          this.fx?.push({ type: 'slam', x: pr.x, y: pr.y, radius: pr.radius * 0.5, color: pr.color });
          this.projectiles.splice(i, 1);
        }
        continue;
      }

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
        // Bell: the note shatters into a radial burst of shards on its first
        // hit. shatter is 0 on a shard, so shards never re-shatter.
        if (pr.role === 'bell' && pr.shatter > 0) {
          this.spawnShards(pr.x, pr.y, pr.shatter, pr.damage * BELL.shardDamageMul, pr.color);
          this.fx?.push({ type: 'spark', x: e.x, y: e.y, color: pr.color, n: 6, spread: 14 });
          pr.shatter = 0;
        }
        // Per-hit spark (view-only, bounded to low-count roles).
        if (SPARK_HIT_ROLES.has(pr.role) && !pr.shard)
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
    opts: { slow?: boolean; pull?: number; mine?: boolean } = {},
  ): void {
    const capByTier = ZONE_CAPS[source];
    if (capByTier) {
      const tier = this.tiers.get(source) ?? 1;
      const cap = capByTier[Math.max(0, Math.min(capByTier.length - 1, tier - 1))];
      const owned = this.zones.filter((zone) => zone.source === source).length;
      if (owned >= cap) {
        const oldest = this.zones.findIndex((zone) => zone.source === source);
        if (oldest >= 0) this.zones.splice(oldest, 1);
      }
    }
    this.zones.push({
      x,
      y,
      radius: conf.radius!,
      damage: conf.damage,
      lifeS: conf.lifetimeS!,
      tickT: 0,
      color,
      source,
      slow: opts.slow ?? true,
      pull: opts.pull ?? 0,
      mine: opts.mine ?? false,
    });
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.lifeS -= dt;

      // Acid: a gravity well — pull caught enemies toward the center every
      // frame (the chase resumes the instant the knock channel lapses).
      if (z.pull > 0) {
        const inside = this.hash.query(z.x, z.y, z.radius + 24, this.queryBuf);
        for (const e of inside) {
          if (!e.dead && circlesOverlap(z, e)) this.drag(e, z.x, z.y, z.pull, 0.05);
        }
      }

      // Rhodes: an armed mine — it does not tick; it blooms once when an enemy
      // steps in, then expires.
      if (z.mine) {
        const inside = this.hash.query(z.x, z.y, z.radius + 24, this.queryBuf);
        let tripped = false;
        for (const e of inside) {
          if (!e.dead && circlesOverlap(z, e)) {
            tripped = true;
            break;
          }
        }
        if (tripped) {
          this.damageArea(z.x, z.y, z.radius * 1.35, z.damage, z.source, 24);
          this.spawnRing(z.x, z.y, z.radius * 1.35, z.color, 0.3);
          this.fx?.push({ type: 'slam', x: z.x, y: z.y, radius: z.radius, color: z.color });
          z.lifeS = 0;
        }
        if (z.lifeS <= 0) this.zones.splice(i, 1);
        continue;
      }

      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = ZONE_TICK_S;
        this.damageArea(z.x, z.y, z.radius, z.damage, z.source);
        // The zone's other half: everything inside wades, it doesn't walk.
        if (z.slow) {
          const inside = this.hash.query(z.x, z.y, z.radius + 24, this.queryBuf);
          for (const e of inside) {
            if (!e.dead && circlesOverlap(z, e)) e.slowT = ZONE_TICK_S + 0.15;
          }
        }
      }
      if (z.lifeS <= 0) {
        this.zones.splice(i, 1);
      }
    }
  }

  /** Pull an enemy toward a point at `speed` px/s for `holdS` (the band: acid's
   *  well, heartbeat's drag-back). Writes only the knock channel the bot also
   *  simulates, so it stays deterministic; re-apply each frame for a steady
   *  pull, or once for a brief yank. */
  private drag(e: Enemy, toX: number, toY: number, speed: number, holdS: number): void {
    const dx = toX - e.x;
    const dy = toY - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.knockX = (dx / d) * speed;
    e.knockY = (dy / d) * speed;
    e.knockT = Math.max(e.knockT, holdS);
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
      if (d < RUN.magnetRadius) {
        const pull = 420 * dt;
        g.x += (dx / (d || 1)) * pull;
        g.y += (dy / (d || 1)) * pull;
      }
      if (d < RUN.pickupRadius) {
        this.xp += g.xp;
        this.gems.splice(i, 1);
      }
    }
    // Present at most one level-up per simulation frame. A live player must
    // choose before the next frame advances, whereas the headless conductor
    // can queue choices immediately. Checking once after the whole pickup
    // batch prevents several nearby gems from consuming levels behind a
    // single visible pick screen. Calling this every frame also drains any XP
    // surplus into successive choices after play resumes.
    this.checkLevel();
  }

  private checkLevel(): void {
    if (this.level >= this.maxBuildLevel) {
      this.xp = 0;
      return;
    }
    const threshold = this.xpThreshold();
    if (this.xp >= threshold) {
      this.xp -= threshold;
      this.level += 1;
      this.events.onLevelUp(this.level);
    }
  }

  /** XP progress toward the next level, 0..1, for the HUD bar. */
  xpProgress(): number {
    if (this.level >= this.maxBuildLevel) return 0;
    const threshold = this.xpThreshold();
    return Math.min(1, this.xp / threshold);
  }

  private xpThreshold(): number {
    return (
      RUN.xpCurve[Math.min(this.level - 1, RUN.xpCurve.length - 1)] *
      this.xpThresholdMul
    );
  }

  private spawnRing(x: number, y: number, radius: number, color: number, dur: number, soft = false): void {
    this.fx?.push({ type: 'ring', x, y, radius, color, dur, soft });
  }

  private spawnPop(x: number, y: number, radius: number): void {
    this.fx?.push({ type: 'pop', x, y, radius });
  }
}
