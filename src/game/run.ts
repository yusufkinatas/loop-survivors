// One run's world: player, enemies, projectiles, zones, gems, and the
// coupling point where an engine trigger becomes damage (Model A: one event,
// two outputs). The stage script here is time-driven only and carries no
// musical meaning (the dividing rule, docs/plan.md).
//
// This file is pure simulation: no rendering, input devices, or real-time
// clock. Rendering lives in view.ts, which reads the world each frame.

import type { Role } from '../audio/kits';
import type { ScheduledTrigger } from '../audio/engine';
import {
  AIM_RANGE,
  ARP_OMEGA,
  BELL,
  CHARGER,
  CIRCLER,
  DARTER,
  ENEMIES,
  FLASH,
  MAD_FOREST_FRAMES,
  MAX_ALIVE_HARD,
  ORBIT_REHIT_S,
  RUN,
  SHAKE,
  SHIELDED,
  SHOVE_S,
  SPLITTER,
  VARIANT_EFFECTS,
  WEAPON_SHOVE,
  WEAPONS,
  ZONE_SLOW_MUL,
  ZONE_THROW_RANGE,
  ZONE_TICK_S,
  madForestEnemyStats,
  xpPickupMultiplier,
  xpForNextLevel,
  type EnemyKind,
  type WeaponConf,
} from './config';
import {
  STAGE_EVENTS,
  STAGE_STARTING_KIND,
  STAGE_STARTING_SPAWNS,
  STAGE_WAVES,
  type StageWave,
} from './madforest';
import type { Rng } from './rng';
import { SpatialHash, circlesOverlap } from './spatial';
import { STEPS_PER_BAR, STEPS_PER_PHRASE } from '../audio/scale';
import {
  EVOLUTION_TUNING,
  GEAR_TUNING,
  type GearId,
} from './evolutions';

/** Roles that emit a per-hit spark on impact. Bounded to low-count roles so
 *  a 500-enemy event frame never floods the fx queue. */
const SPARK_HIT_ROLES = new Set<Role>(['snare', 'lead']);

/** Circle versus axis-aligned rectangle, exported for parity regression tests. */
export function circleIntersectsRect(
  cx: number,
  cy: number,
  radius: number,
  rx: number,
  ry: number,
  halfW: number,
  halfH: number,
): boolean {
  const qx = Math.max(rx - halfW, Math.min(cx, rx + halfW));
  const qy = Math.max(ry - halfH, Math.min(cy, ry + halfH));
  const dx = cx - qx;
  const dy = cy - qy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Circle versus a finite oriented corridor. Returns the projection from the
 * segment start when intersecting, which also supplies stable hit ordering. */
export function circleIntersectsSegment(
  e: Pick<Enemy, 'x' | 'y' | 'radius'>,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  length: number,
  halfWidth: number,
): number | null {
  const dx = e.x - x;
  const dy = e.y - y;
  const projected = dx * dirX + dy * dirY;
  if (projected < -e.radius || projected > length + e.radius) return null;
  const perpendicular = Math.abs(dx * -dirY + dy * dirX);
  return perpendicular <= halfWidth + e.radius ? projected : null;
}

/** Whip-style facing strip geometry. baseWidth is the reach (kept short so it
 * stays a close-range crowd tool, not a screen-wide beam). */
export const KICK_GEOMETRY = {
  scale: 800 / 456,
  baseWidth: 85 * (800 / 456),
  baseHeight: 22 * (800 / 456),
} as const;

/** Source player sprite uses a feet anchor; the stored player position is its
 * circle center. This is the source feet offset normalized to H800. */
export const PLAYER_FOOT_OFFSET = {
  x: 1 * KICK_GEOMETRY.scale,
  y: 7 * KICK_GEOMETRY.scale,
} as const;

export function kickStripCenter(
  playerX: number,
  playerY: number,
  side: 1 | -1,
  halfWidth: number,
): { x: number; y: number } {
  // Vertically centered on the player, inner edge at the player's center,
  // reaching out to the facing side.
  return {
    x: playerX + side * halfWidth,
    y: playerY,
  };
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  radius: number;
  /** Source sprite-feet anchor relative to this stored circle center. */
  footOffsetX: number;
  footOffsetY: number;
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
  slowMul: number;
  /** Evolved status carried by the enemy, never by a module-global map. */
  stunT: number;
  hatCuts: number;
  hatCutExpiryS: number;
  /** Undertow carry wins over pursuit while the enemy remains in the wall. */
  wallCarryX: number;
  wallCarryY: number;
  wallCarryT: number;
  /** Weapon knockback: velocity (px/s) and time left being pushed. While
   *  knockT > 0 the enemy rides this vector instead of chasing. */
  knockX: number;
  knockY: number;
  knockT: number;
  /** Actual velocity used by the latest movement step, for source-style
   * hit response that reverses motion instead of pushing radially. */
  lastMoveX: number;
  lastMoveY: number;
  /** shielded: absorbs damage before hp; 0 for others. */
  shieldHp: number;
  /** circler: +1/-1 orbit direction; 0 for others. */
  spin: number;
  /** charger: telegraph countdown; 0 otherwise. */
  windupT: number;
  /** Spawn origin. All classes count toward the periodic 300 check; scripted
   * bosses/events may themselves spawn beyond it up to the 500 hard cap. */
  spawnClass: 'regular' | 'boss' | 'event';
  /** Scripted sweep motion. Zeroes mean normal direct homing. */
  moveX: number;
  moveY: number;
  /** Scripted event expiry; 0 means normal lifetime/recycling. */
  despawnAt: number;
  knockbackMul: number;
  /** Chance that this boss drops one physical chest on death. */
  chestChance: number;
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
  maxPierce: number;
  lifeS: number;
  homing: boolean;
  speed: number;
  color: number;
  hit: Set<Enemy>;
  /** Total time alive. Behavior otherwise keys off role: lead homes, arp
   *  orbits. */
  age: number;
  /** arp: orbit geometry around the player, and the re-hit cooldown so a slow
   *  sweep keeps chipping the same enemy. */
  orbitAngle: number;
  orbitRadius: number;
  rehitT: number;
  /** bell: shards to spawn on this shot's first hit (0 for a shard itself, so
   *  shards never re-shatter). */
  shatter: number;
  /** True for a bell shard (a fragment shot), so its hit path skips shattering. */
  shard: boolean;
  evolved: boolean;
  variant?: string;
  secondary: boolean;
  shove: number;
  closeBonus: boolean;
  homingTurnRate: number;
  homingRange: number;
  targetId: number | null;
  retargetsLeft: number;
  /** Orrery ring (-1 inner, +1 outer, 0 non-Orrery) and smooth radius move. */
  orbitRing: -1 | 0 | 1;
  orbitOmega: number;
  orbitFromRadius: number;
  orbitTargetRadius: number;
  orbitMoveT: number;
  orbitReachMul: number;
  /** Bell carries its fully snapshotted child configuration to first impact. */
  shardTemplate: ProjectileTemplate | null;
  assignedTargetId: number | null;
  glassShard: boolean;
}

export interface ProjectileTemplate {
  damage: number;
  speed: number;
  radius: number;
  lifeS: number;
  pierce: number;
  turnRate: number;
  closeBonus: boolean;
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
  /** Whether enemies inside are slowed on each tick. */
  slow: boolean;
  closeBonus: boolean;
  groupId: number;
  cathedral: boolean;
}

export interface UndertowWall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeS: number;
  totalLifeS: number;
  span: number;
  thickness: number;
  damage: number;
  shove: number;
  color: number;
  closeBonus: boolean;
  hitAt: Map<number, number>;
}

export interface StandingOvation {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  radius: number;
  width: number;
  age: number;
  damage: number;
  throwDist: number;
  color: number;
  closeBonus: boolean;
  caught: Set<Enemy>;
  throwByEnemy: Map<number, number>;
  closed: boolean;
  released: boolean;
}

export interface HeadlinerSoloist {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  targetId: number | null;
  age: number;
  dashS: number;
  damage: number;
  closeBonus: boolean;
  retargetsLeft: number;
  visited: Set<number>;
  combo: number;
  lastTargetId: number | null;
  dashing: boolean;
  returning: boolean;
  visible: boolean;
  color: number;
}

export interface DancefloorStamp {
  x: number;
  y: number;
  side: 1 | -1;
  damage: number;
  area: number;
  closeBonus: boolean;
}

export interface Gem {
  x: number;
  y: number;
  xp: number;
  tier: 'blue' | 'green' | 'red';
}

/** A persistent boss reward. Chests are simulation-owned, never magnetized,
 *  recycled, blocked, damaged, or despawned. */
export interface Chest {
  x: number;
  y: number;
}

/** Fire-and-forget visuals the world requests and the view renders. */
export type FxEvent =
  | { type: 'ring'; x: number; y: number; radius: number; color: number; dur: number; soft?: boolean }
  | { type: 'death'; x: number; y: number; radius: number; color: number; elite: boolean }
  | { type: 'whip'; x: number; y: number; side: 1 | -1; area: number; color: number }
  | {
      type: 'arc';
      x: number;
      y: number;
      angle: number;
      arc: number;
      radius: number;
      color: number;
    }
  | { type: 'dmg'; x: number; y: number; amount: number; color: number }
  | { type: 'spark'; x: number; y: number; color: number; n: number; spread: number }
  | { type: 'shake'; mag: number; dur: number }
  | { type: 'flash'; color: number; alpha: number; dur: number }
  | { type: 'slam'; x: number; y: number; radius: number; color: number }
  | { type: 'stamp'; x: number; y: number; side: 1 | -1; area: number; color: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; width: number; color: number; dur: number }
  | { type: 'cut'; x: number; y: number; radius: number; color: number; release: boolean };

export interface RunEvents {
  onLevelUp(level: number): void;
  onChestCollected(): void;
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
  arp: 0x33e6c2,
  crash: 0xb9c2dd,
  shaker: 0x7be0d0,
  acid: 0xb6ff5a,
  pluck: 0x8f7bff,
  rhodes: 0x5ad1ff,
  riser: 0xcbb4ff,
  bell: 0xffd76b,
};

export interface RunWorldOpts {
  /** False in the sandbox: no stage script, no waves, no victory timer. */
  scripted?: boolean;
  /** Optional seeded randomness for deterministic development fixtures. */
  rng?: Rng;
  /** Movement axis provider (magnitude 0..1). */
  control?: () => { x: number; y: number };
  /** False for non-visual fixtures that do not consume effects. */
  fx?: boolean;
}

interface AttackScope {
  reach?: 'area' | 'radius' | 'orbitRadius';
  aimed?: boolean;
  projectileSpeed?: boolean;
  finitePierce?: boolean;
  persistent?: boolean;
  orbit?: boolean;
  homing?: boolean;
  secondary?: boolean;
  shove?: number;
}

interface BuiltAttack {
  conf: WeaponConf;
  aimRange: number;
  homingRange: number;
  homingTurnRate: number;
  orbitOmega: number;
  shove: number;
  closeBonus: boolean;
}

export class RunWorld {
  /** Owned weapons and their ladder tier (1-4). */
  readonly tiers = new Map<Role, number>();
  /** Four-socket silent Gear inventory and evolved weapon identities. */
  readonly gear = new Set<GearId>();
  readonly evolved = new Set<Role>();
  private readonly inactiveRoles = new Set<Role>();

  player = {
    x: 0,
    y: 0,
    hp: RUN.playerHp,
    radius: RUN.playerRadius,
    iframesT: 0,
    facingX: 1 as 1 | -1,
  };
  level = 1;
  xp = 0;
  timeS = 0;
  kills = 0;
  killsByRole: Partial<Record<Role, number>> = {};
  /** Effective damage dealt per weapon (overkill not counted). */
  damageByRole: Partial<Record<Role, number>> = {};
  invincible = false;
  /** Tempo damage compensation (docs/plan.md, tempo and damage): more triggers
   *  per second means each hits softer, so per-trigger damage is scaled by this
   *  factor as every weapon fires. Set once from the soundset at run start. */
  powerMul = 1;

  /** Visual-effect requests for the view; null when effects are disabled. */
  readonly fx: FxEvent[] | null;

  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly zones: Zone[] = [];
  readonly undertowWalls: UndertowWall[] = [];
  readonly standingOvations: StandingOvation[] = [];
  headliner: HeadlinerSoloist | null = null;
  readonly gems: Gem[] = [];
  readonly chests: Chest[] = [];

  private rng: Rng;
  private control: () => { x: number; y: number };
  private events: RunEvents;
  private view: { width: number; height: number };

  private hash = new SpatialHash<Enemy>();
  private queryBuf: Enemy[] = [];

  /** Mad Forest table state. */
  private waveIdx = -1;
  private eventIdx = 0;
  private currentWave: StageWave | null = null;
  private nextSpawnT = 0;
  private stageStarted = false;
  private nextEnemyId = 1;
  /** Deterministic clean-room equivalent of the source's uniform frame pick.
   * Cycling each kind's published frame list preserves its exact long-run
   * collider weighting without consuming the separate stage RNG stream. */
  private enemyFrameCounters: Partial<Record<EnemyKind, number>> = {};
  private overflowGem: Gem | null = null;
  private kickRehitUntil = new Map<number, number>();
  readonly dancefloorStamps: DancefloorStamp[] = [];
  private dancefloorBar = -1;
  private nextZoneGroupId = 1;
  private arpNextRing: -1 | 1 = -1;
  private arpInnerRadius: number = EVOLUTION_TUNING.orrery.innerStart;
  private arpOuterRadius: number = EVOLUTION_TUNING.orrery.outerStart;
  private arpPreviousNote: number | null = null;
  private arpLastStep = -1;
  private headlinerLastStep = -1;
  private pendingKick: Array<{
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
    echo: boolean;
    closeBonus: boolean;
    /** Enemies already damaged by THIS strike, so its 200 ms hitbox lands one
     *  hit per enemy across its frames while every new trigger hits fresh. */
    hit: Set<Enemy>;
  }> = [];
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

  /** Height-normalized parity camera: the visible world is always 800 units
   * tall, so movement, colliders, Whip geometry, and spawn/event ellipses keep
   * the researched proportions at every desktop resolution. */
  get zoom(): number {
    return Math.max(0.01, this.view.height / 800);
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
    if (this.inactiveRoles.has(t.role)) return;
    const tier = this.tiers.get(t.role);
    if (!tier) return;
    // WEAPONS is keyed on the supported catalog; a trigger only ever fires for
    // an owned (hence supported) role, so the entry is always present.
    let conf: WeaponConf = WEAPONS[t.role]![tier - 1];
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
        const built = this.buildAttack('kick', conf, { reach: 'area' });
        const side = p.facingX;
        this.spawnKickAttack(p.x, p.y, side, built, (built.conf.amount ?? 1) > 1, false);
        if (t.evolved) this.recordDancefloorStamp(t, p.x, p.y, side, built);
        break;
      }
      case 'chord': {
        const built = this.buildAttack('chord', conf, { persistent: true });
        // Thrown at the nearest enemy, not dropped underfoot: the zone has
        // to land where the horde actually is to be worth a pick.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        // Loud chords stamp a bigger zone (velocity → size).
        const zc = { ...built.conf, radius: built.conf.radius! * (0.85 + 0.3 * v) };
        if (t.evolved) {
          this.spawnCathedral(target?.x ?? p.x, target?.y ?? p.y, zc, color, built.closeBonus);
        } else {
          this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, zc, color, 'chord', {
            closeBonus: built.closeBonus,
          });
        }
        break;
      }
      case 'clap': {
        const clapConf = t.evolved ? { ...conf, radius: EVOLUTION_TUNING.standingOvation.radius } : conf;
        const built = this.buildAttack('clap', clapConf, {
          reach: 'radius',
          shove: t.evolved ? EVOLUTION_TUNING.standingOvation.throwDist : (WEAPON_SHOVE.clap ?? 0),
        });
        const aim = this.aimDir(0, built.aimRange);
        const ang = Math.atan2(aim.y, aim.x);
        if (t.evolved) {
          this.spawnStandingOvation(aim, built, color, v);
        } else {
          const reach = built.conf.radius! * (0.9 + 0.2 * v);
          this.damageCone(
            p.x, p.y, ang, built.conf.arc!, reach,
            built.conf.damage * (0.85 + 0.3 * v), 'clap', built.shove, built.closeBonus,
          );
          this.fx?.push({ type: 'arc', x: p.x, y: p.y, angle: ang, arc: built.conf.arc!, radius: reach, color });
        }
        break;
      }
      case 'bell': {
        const mul = 0.8 + 0.4 * v;
        const built = this.buildAttack('bell', { ...conf, damage: conf.damage * mul }, {
          aimed: true, projectileSpeed: true, finitePierce: true, persistent: true,
        });
        const shardBuilt = this.buildAttack('bell', {
          damage: conf.damage * mul * BELL.shardDamageMul,
          speed: BELL.shardSpeed,
          radius: BELL.shardRadius,
          lifetimeS: BELL.shardLifeS,
          pierce: BELL.shardPierce,
        }, {
          projectileSpeed: true, finitePierce: true, persistent: true,
          homing: t.evolved, secondary: true,
        });
        const dir = t.evolved ? this.glassChoirAim(built.aimRange) : this.aimDir(0.1, built.aimRange);
        this.spawnBell(dir, built, shardBuilt, color, t.evolved);
        break;
      }
      case 'arp': {
        const built = this.buildAttack('arp', { ...conf, damage: conf.damage * (0.8 + 0.4 * v) }, {
          reach: 'orbitRadius', persistent: true, orbit: true,
        });
        if (t.evolved) this.spawnOrrery(t, built, color);
        else this.spawnOrbiter(built, color, false);
        break;
      }
      case 'bass': {
        const finalEvent = t.evolved && t.step >= 0 && t.step % 32 === 31;
        const bassConf = {
          ...conf,
          damage: conf.damage * (0.75 + 0.5 * v),
          lifetimeS: finalEvent ? EVOLUTION_TUNING.undertow.wallLifeS : conf.lifetimeS,
        };
        const built = this.buildAttack('bass', bassConf, {
          aimed: true,
          projectileSpeed: !finalEvent,
          persistent: true,
          shove: t.evolved ? EVOLUTION_TUNING.undertow.shove : (WEAPON_SHOVE.bass ?? 0),
        });
        const dir = this.aimDir(0.08, built.aimRange);
        if (finalEvent) this.spawnUndertow(dir, built, color);
        else this.spawnProjectile('bass', dir, built, color, t);
        if (t.variant === 'sub' || finalEvent) {
          this.fx?.push({ type: 'shake', mag: SHAKE.bassSub.mag, dur: SHAKE.bassSub.dur });
          this.fx?.push({ type: 'flash', color, alpha: FLASH.bassSub.alpha, dur: FLASH.bassSub.dur });
        }
        break;
      }
      case 'lead': {
        const built = this.buildAttack('lead', { ...conf, damage: conf.damage * (0.75 + 0.5 * v) }, {
          aimed: true, projectileSpeed: !t.evolved, finitePierce: !t.evolved,
          persistent: !t.evolved, homing: true,
        });
        if (t.evolved) this.fireHeadliner(t, built, color);
        else this.spawnProjectile('lead', this.aimDir(0.08, built.aimRange), built, color, t);
        break;
      }
      case 'snare': {
        const built = this.buildAttack('snare', { ...conf, damage: conf.damage * (0.75 + 0.5 * v) }, {
          aimed: true, projectileSpeed: !t.evolved, finitePierce: !t.evolved,
          persistent: !t.evolved, shove: WEAPON_SHOVE.snare ?? 0,
        });
        if (t.evolved) this.fireDeadCenter(built, color);
        else this.spawnProjectile('snare', this.aimDir(0.08, built.aimRange), built, color, t);
        break;
      }
      case 'hat': {
        const built = this.buildAttack('hat', { ...conf, damage: conf.damage * (0.75 + 0.5 * v) }, {
          aimed: true, projectileSpeed: true, finitePierce: true, persistent: true,
        });
        this.spawnProjectile('hat', this.aimDir(0.35, built.aimRange), built, color, t);
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
    this.inactiveRoles.delete(role);
    this.setEvolved(role, false);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].role === role) this.projectiles.splice(i, 1);
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i].source === role) this.zones.splice(i, 1);
    }
    if (role === 'kick') this.pendingKick.length = 0;
    if (role === 'bass') this.undertowWalls.length = 0;
    if (role === 'clap') this.standingOvations.length = 0;
    if (role === 'lead') this.headliner = null;
  }

  addGear(gear: GearId): void {
    this.gear.add(gear);
  }

  removeGear(gear: GearId): void {
    this.gear.delete(gear);
  }

  setEvolved(role: Role, on: boolean): void {
    if (on) this.evolved.add(role);
    else this.evolved.delete(role);
    this.clearEvolutionState(role);
    if (role === 'lead' && on) this.headliner = this.makeHeadliner();
  }

  setWeaponActive(role: Role, on: boolean): void {
    if (on) this.inactiveRoles.delete(role);
    else this.inactiveRoles.add(role);
    if (!on) {
      if (role === 'kick') {
        this.dancefloorStamps.length = 0;
        this.dancefloorBar = -1;
      }
      if (role === 'lead') {
        this.headliner = null;
        this.headlinerLastStep = -1;
      }
      return;
    }
    if (role === 'lead' && this.evolved.has('lead')) this.headliner = this.makeHeadliner();
  }

  private clearEvolutionState(role: Role): void {
    switch (role) {
      case 'kick':
        this.dancefloorStamps.length = 0;
        this.dancefloorBar = -1;
        break;
      case 'snare':
        break;
      case 'hat':
        break;
      case 'arp':
        this.resetOrreryState();
        break;
      case 'bass':
        break;
      case 'chord':
        break;
      case 'lead':
        this.headliner = null;
        this.headlinerLastStep = -1;
        break;
      case 'clap':
        break;
      case 'bell':
        break;
    }
  }

  /** Explicit one-pass entity construction pipeline. Gear mutates only the
   * new attack described by `scope`; already-live entities retain snapshots. */
  private buildAttack(role: Role, source: WeaponConf, scope: AttackScope = {}): BuiltAttack {
    void role;
    const conf = { ...source };
    let aimRange = AIM_RANGE;
    let homingRange = AIM_RANGE;
    let homingTurnRate = 10;
    let orbitOmega = ARP_OMEGA;
    let shove = scope.shove ?? 0;

    if (this.gear.has('heavyBoots') && scope.reach) {
      const key = scope.reach;
      if (conf[key] !== undefined) conf[key] = conf[key]! * GEAR_TUNING.heavyBootsReachMul;
    }
    if (this.gear.has('laserSight')) {
      if (scope.aimed) aimRange *= GEAR_TUNING.laserSightRangeMul;
      if (scope.projectileSpeed && conf.speed !== undefined) conf.speed *= GEAR_TUNING.laserSightSpeedMul;
    }
    if (this.gear.has('needleCase') && scope.finitePierce && Number.isFinite(conf.pierce ?? 1)) {
      conf.pierce = (conf.pierce ?? 1) + GEAR_TUNING.needleCasePierceAdd;
    }
    if (this.gear.has('gyroscope')) {
      if (scope.orbit) orbitOmega *= GEAR_TUNING.gyroscopeSpeedMul;
      if (scope.homing) homingTurnRate *= GEAR_TUNING.gyroscopeSpeedMul;
    }
    if (this.gear.has('hourglass') && scope.persistent && conf.lifetimeS !== undefined) {
      conf.lifetimeS *= GEAR_TUNING.hourglassLifetimeMul;
    }
    if (this.gear.has('compass') && scope.homing) {
      homingRange *= GEAR_TUNING.compassRangeMul;
    }
    if (this.gear.has('leadWeight')) {
      conf.damage *= GEAR_TUNING.leadWeightDamageMul;
      shove *= GEAR_TUNING.leadWeightShoveMul;
    }
    if (this.gear.has('prism') && scope.secondary) {
      conf.damage *= GEAR_TUNING.prismDamageMul;
      if (conf.lifetimeS !== undefined) conf.lifetimeS *= GEAR_TUNING.prismLifetimeMul;
    }
    // Antonio's passive adds 10% Might every ten levels, capped at +50%.
    const antonioMight = 1 + Math.min(5, Math.floor(this.level / 10)) * 0.1;
    conf.damage *= this.powerMul * antonioMight;
    return {
      conf,
      aimRange,
      homingRange,
      homingTurnRate,
      orbitOmega,
      shove,
      closeBonus: this.gear.has('boxingGloves'),
    };
  }

  /** Push an enemy away from a point, sharing the weapon knock channel. */
  private shove(e: Enemy, fromX: number, fromY: number, dist: number): void {
    dist *= e.knockbackMul;
    if (dist <= 0) return;
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    e.knockX = (dx / d) * (dist / SHOVE_S);
    e.knockY = (dy / d) * (dist / SHOVE_S);
    e.knockT = Math.max(e.knockT, SHOVE_S);
  }

  /** Level-up breathing room: shove every enemy currently inside `minRadius`
   *  of (fromX, fromY) out to that ring, so the dropped-item triangle opens
   *  into cleared space. Called by the live shell on a level-up. */
  shoveEnemiesOut(fromX: number, fromY: number, minRadius: number): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - fromX;
      const dy = e.y - fromY;
      const d = Math.hypot(dx, dy) || 1;
      if (d >= minRadius) continue;
      // A reward-moment clear, NOT a combat knock: push the full deficit
      // regardless of knockback resistance, so even knockback-immune kinds
      // (ghost, some elites — knockbackMul 0) still vacate the ring. Writes the
      // knock channel directly, deliberately bypassing shove()'s knockbackMul
      // scaling; moveEnemies rides this vector for SHOVE_S with pursuit fully
      // suppressed, so the displacement is ~= push (small overshoot for margin).
      const push = (minRadius - d) * 1.1;
      e.knockX = (dx / d) * (push / SHOVE_S);
      e.knockY = (dy / d) * (push / SHOVE_S);
      e.knockT = Math.max(e.knockT, SHOVE_S);
    }
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

    this.moveEnemies(dt);
    this.recycleEnemies();
    this.hash.clear();
    for (const e of this.enemies) if (!e.dead) this.hash.insert(e);
    this.resolveEnemyCollisions();
    this.hash.clear();
    for (const e of this.enemies) if (!e.dead) this.hash.insert(e);
    this.updateKickStrikes();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateUndertowWalls(dt);
    this.updateStandingOvations(dt);
    this.updateHeadliner(dt);
    this.updateGems(dt);
    this.updateChests();
    this.contactDamage(dt);

    this.reapEnemies();
  }

  // ---- player ----

  private movePlayer(dt: number): void {
    const a = this.control();
    if (a.x > 0.001) this.player.facingX = 1;
    else if (a.x < -0.001) this.player.facingX = -1;
    this.player.x += a.x * RUN.playerSpeed * dt;
    this.player.y += a.y * RUN.playerSpeed * dt;
    if (this.player.iframesT > 0) this.player.iframesT -= dt;
  }

  private contactDamage(dt: number): void {
    void dt;
    const p = this.player;
    const near = this.hash.query(p.x, p.y, p.radius + 48, this.queryBuf);
    let hitter: Enemy | null = null;
    for (const e of near) {
      if (e.dead || !circlesOverlap(p, e)) continue;
      // Solid player/enemy circles. The reference player body is immovable,
      // so resolution pushes the enemy to the nearest legal edge while input
      // retains its immediate, unsmoothed feel.
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      let d = Math.hypot(dx, dy);
      if (d < 0.0001) {
        dx = e.id % 2 ? 1 : -1;
        dy = 0;
        d = 1;
      }
      const overlap = p.radius + e.radius - d;
      if (overlap > 0) {
        e.x -= (dx / d) * overlap;
        e.y -= (dy / d) * overlap;
      }
      hitter ??= e;
    }
    if (!hitter || p.iframesT > 0 || this.invincible) return;
    p.hp = Math.max(0, p.hp - hitter.damage);
    p.iframesT = RUN.iframesS;
    this.events.onHit();
    if (p.hp <= 0) this.events.onDeath();
  }

  // ---- enemies ----

  /** Mad Forest's quota/interval semantics. `minimum` is a live population
   * floor, not a spawn rate: a due attempt fills the deficit immediately;
   * otherwise it emits the row's complete pattern. */
  private runDirector(_dt: number): void {
    if (!this.stageStarted) {
      this.stageStarted = true;
      for (let i = 0; i < STAGE_STARTING_SPAWNS; i++) this.spawnEnemy(STAGE_STARTING_KIND);
    }

    while (this.waveIdx + 1 < STAGE_WAVES.length && this.timeS >= STAGE_WAVES[this.waveIdx + 1].atS) {
      this.currentWave = STAGE_WAVES[++this.waveIdx];
      // Source timers wait one full interval before their first callback. The
      // ten starting bats therefore remain ten until 0:01, and each new
      // minute's regular roster begins after that row's stated interval.
      this.nextSpawnT = this.currentWave.atS + this.currentWave.intervalS;
    }

    while (this.eventIdx < STAGE_EVENTS.length && this.timeS >= STAGE_EVENTS[this.eventIdx].atS) {
      const event = STAGE_EVENTS[this.eventIdx++];
      if (event.type === 'boss') {
        const before = this.enemies.length;
        this.spawnEnemy(event.kind, undefined, 1, true);
        const spawned = this.enemies.length > before ? this.enemies[this.enemies.length - 1] : null;
        if (spawned) spawned.chestChance = event.rewardChance;
      } else if (event.type === 'batSweep') {
        if (this.rng() < event.chance) this.spawnBatSweep(event.kind, event.count);
      } else {
        this.spawnFlowerWall(event.kind, event.count, event.durationS);
      }
    }

    const wave = this.currentWave;
    if (!wave) return;
    // A large frame must drain every scheduled attempt instead of dropping spawns.
    while (this.timeS + 1e-9 >= this.nextSpawnT) {
      this.spawnWaveAttempt(wave);
      this.nextSpawnT += wave.intervalS;
    }
  }

  private aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    return n;
  }

  private spawnWaveAttempt(wave: StageWave): void {
    let alive = this.aliveCount();
    if (alive >= ENEMIES.maxAlive) return;
    // Backfill repeats complete enabled sets and can therefore overshoot the
    // floor by pattern.length-1. Once the floor is met, an attempt emits one
    // complete set. This preserves duplicated roster entries as real spawns.
    do {
      for (const kind of wave.pattern) {
        if (alive >= ENEMIES.maxAlive) return;
        this.spawnEnemy(kind);
        alive++;
      }
    } while (alive < wave.minimum);
  }

  /** A 50-enemy event fan crosses the screen without homing. */
  private spawnBatSweep(kind: EnemyKind, count: number): void {
    // Official-demo geometry: start on an elliptical 0.72W/0.72H arc, advance
    // π/500 radians per bat (~18 degrees across 50), and lock each bat toward
    // the player's position at event time. The result is a converging fan.
    const startAngle = this.rng() * Math.PI * 2;
    const targetX = this.player.x + PLAYER_FOOT_OFFSET.x;
    const targetY = this.player.y + PLAYER_FOOT_OFFSET.y;
    for (let i = 0; i < count && this.enemies.length < MAX_ALIVE_HARD; i++) {
      const a = startAngle + (i * Math.PI) / 500;
      const x = targetX + Math.cos(a) * this.worldW * 0.72;
      const y = targetY + Math.sin(a) * this.worldH * 0.72;
      const dx = targetX - x;
      const dy = targetY - y;
      const d = Math.hypot(dx, dy) || 1;
      this.pushEnemy(
        kind,
        x,
        y,
        'event',
        dx / d,
        dy / d,
        this.timeS + 10,
      );
    }
  }

  /** The minute-five enclosure is a slowly closing 100-unit ellipse which
   * disappears after 30 seconds if the player does not break through it. */
  private spawnFlowerWall(kind: EnemyKind, count: number, durationS: number): void {
    const rx = this.worldW * 0.72;
    const ry = this.worldH * 0.72;
    const start = this.rng() * Math.PI * 2;
    for (let i = 0; i < count && this.enemies.length < MAX_ALIVE_HARD; i++) {
      const a = start + (i / count) * Math.PI * 2;
      this.pushEnemy(
        kind,
        this.player.x + PLAYER_FOOT_OFFSET.x + Math.cos(a) * rx,
        this.player.y + PLAYER_FOOT_OFFSET.y + Math.sin(a) * ry,
        'event',
        0,
        0,
        this.timeS + durationS,
      );
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
    const playerFootX = this.player.x + PLAYER_FOOT_OFFSET.x;
    const playerFootY = this.player.y + PLAYER_FOOT_OFFSET.y;
    let x: number;
    let y: number;
    if (angle !== undefined) {
      const dist = this.spawnDist(ENEMIES[kind].radius) * distMul;
      x = playerFootX + Math.cos(angle) * dist;
      y = playerFootY + Math.sin(angle) * dist;
    } else {
      // Four off-screen rectangles, matching the source stage's all-sides
      // approach while avoiding corner-biased polar spawns.
      const edge = Math.floor(this.rng() * 4);
      const margin = (ENEMIES.spawnMargin + ENEMIES[kind].radius) * distMul;
      if (edge < 2) {
        x = playerFootX + (edge === 0 ? -1 : 1) * (this.worldW / 2 + margin);
        y = playerFootY + (this.rng() - 0.5) * this.worldH * 1.25;
      } else {
        x = playerFootX + (this.rng() - 0.5) * this.worldW * 1.25;
        y = playerFootY + (edge === 2 ? -1 : 1) * (this.worldH / 2 + margin);
      }
    }
    const spawnClass = ENEMIES[kind].boss ? 'boss' : ENEMIES[kind].fixedDirection || kind === 'flower' ? 'event' : 'regular';
    let moveX = 0;
    let moveY = 0;
    let despawnAt = 0;
    if (ENEMIES[kind].fixedDirection) {
      const dx = playerFootX - x;
      const dy = playerFootY - y;
      const d = Math.hypot(dx, dy) || 1;
      moveX = dx / d;
      moveY = dy / d;
      despawnAt = this.timeS + 10;
    }
    this.pushEnemy(kind, x, y, spawnClass, moveX, moveY, despawnAt);
  }

  /** Sandbox/lab helper: construct a real enemy at an explicit world-space
   *  source-feet position, using the same stats/body path as stage spawns. */
  spawnEnemyAt(kind: EnemyKind, x: number, y: number): Enemy | null {
    const spawnClass = ENEMIES[kind].boss
      ? 'boss'
      : ENEMIES[kind].fixedDirection || kind === 'flower'
        ? 'event'
        : 'regular';
    let moveX = 0;
    let moveY = 0;
    let despawnAt = 0;
    if (ENEMIES[kind].fixedDirection) {
      const dx = this.player.x + PLAYER_FOOT_OFFSET.x - x;
      const dy = this.player.y + PLAYER_FOOT_OFFSET.y - y;
      const d = Math.hypot(dx, dy) || 1;
      moveX = dx / d;
      moveY = dy / d;
      despawnAt = this.timeS + 10;
    }
    return this.pushEnemy(kind, x, y, spawnClass, moveX, moveY, despawnAt);
  }

  /** Construct one enemy from a source sprite-feet position. The simulation
   * stores its exact circle center; old project-native kinds have zero offset.
   * Mad Forest has no invented continuous HP/damage/speed ramp. */
  private pushEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    spawnClass: 'regular' | 'boss' | 'event' = 'regular',
    moveX = 0,
    moveY = 0,
    despawnAt = 0,
  ): Enemy | null {
    if (this.enemies.length >= MAX_ALIVE_HARD) return null;
    const conf = ENEMIES[kind];
    const stats = madForestEnemyStats(kind, this.level);
    const body = this.nextEnemyBody(kind, stats.radius);
    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      x: x - body.footOffsetX,
      y: y - body.footOffsetY,
      radius: body.radius,
      footOffsetX: body.footOffsetX,
      footOffsetY: body.footOffsetY,
      hp: stats.hp,
      speed: stats.speed,
      damage: stats.damage,
      xp: stats.xp,
      color: stats.color,
      band: conf.boss ? 3 : 0,
      flashT: 0,
      dead: false,
      dashT: 0,
      dashX: 0,
      dashY: 0,
      dashing: false,
      slowT: 0,
      slowMul: 1,
      stunT: 0,
      hatCuts: 0,
      hatCutExpiryS: 0,
      wallCarryX: 0,
      wallCarryY: 0,
      wallCarryT: 0,
      knockX: 0,
      knockY: 0,
      knockT: 0,
      lastMoveX: 0,
      lastMoveY: 0,
      shieldHp: kind === 'shielded' ? conf.hp * SHIELDED.shieldMul : 0,
      spin: kind === 'circler' ? (this.rng() < 0.5 ? 1 : -1) : 0,
      windupT: 0,
      spawnClass,
      moveX,
      moveY,
      despawnAt,
      knockbackMul: stats.knockback,
      chestChance: 0,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  private nextEnemyBody(
    kind: EnemyKind,
    fallback: number,
  ): { radius: number; footOffsetX: number; footOffsetY: number } {
    const frames = MAD_FOREST_FRAMES[kind];
    if (!frames || frames.length === 0) {
      return { radius: fallback, footOffsetX: 0, footOffsetY: 0 };
    }
    const counter = this.enemyFrameCounters[kind] ?? 0;
    this.enemyFrameCounters[kind] = counter + 1;
    const frame = frames[counter % frames.length];
    const requestedRadius = frame.width * 0.4;
    const effectiveRadius = Math.floor(requestedRadius);
    const scale = KICK_GEOMETRY.scale;
    // Phaser Body.setCircle(r, r/2, r/2), sprite origin (0.5, 1). Circle
    // intersection uses floor(r) as halfWidth; reconstruct feet from center.
    return {
      radius: effectiveRadius * scale,
      footOffsetX: (frame.width / 2 - requestedRadius / 2 - effectiveRadius) * scale,
      footOffsetY: (frame.height - requestedRadius / 2 - effectiveRadius) * scale,
    };
  }

  /** Splitter death: burst into a knot of children around the corpse. */
  private spawnChildren(e: Enemy): void {
    const k = SPLITTER.childKind;
    const cr = ENEMIES[k].radius;
    for (let i = 0; i < SPLITTER.childCount; i++) {
      const a = this.rng() * Math.PI * 2;
      this.pushEnemy(k, e.x + Math.cos(a) * (e.radius + cr), e.y + Math.sin(a) * (e.radius + cr));
    }
  }

  /** Sandbox: remove every enemy without kills, gems, or pops. */
  clearEnemies(): void {
    this.enemies.length = 0;
    this.kickRehitUntil.clear();
  }

  /** Reset every transient sandbox entity without touching the player, loadout,
   *  clock, level, or stage director. No delayed strike/pickup pointer survives. */
  clearSandboxEntities(): void {
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.undertowWalls.length = 0;
    this.standingOvations.length = 0;
    this.headliner = this.evolved.has('lead') ? this.makeHeadliner() : null;
    this.gems.length = 0;
    this.chests.length = 0;
    if (this.fx) this.fx.length = 0;
    this.pendingKick.length = 0;
    this.kickRehitUntil.clear();
    this.dancefloorStamps.length = 0;
    this.dancefloorBar = -1;
    this.resetOrreryState();
    this.overflowGem = null;
    this.hash.clear();
    this.queryBuf.length = 0;
  }

  private moveEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.lastMoveX = 0;
      e.lastMoveY = 0;
      let speed = e.speed;
      if (e.slowT > 0) {
        e.slowT -= dt;
        speed *= e.slowMul;
        if (e.slowT <= 0) e.slowMul = 1;
      }
      if (e.hatCuts > 0 && e.hatCutExpiryS < this.timeS) {
        e.hatCuts = 0;
        e.hatCutExpiryS = 0;
      }
      if (e.stunT > 0) e.stunT -= dt;
      if (e.flashT > 0) e.flashT -= dt;

      // Undertow's wall owns movement while contact persists, even for kinds
      // that normally resist knockback.
      if (e.wallCarryT > 0) {
        const carryDt = Math.min(dt, e.wallCarryT);
        e.wallCarryT -= dt;
        e.lastMoveX = e.wallCarryX;
        e.lastMoveY = e.wallCarryY;
        e.x += e.wallCarryX * carryDt;
        e.y += e.wallCarryY * carryDt;
        continue;
      }

      // Weapon knockback overrides everything: ride the push, don't chase.
      if (e.knockT > 0) {
        const pushDt = Math.min(dt, e.knockT);
        e.knockT -= dt;
        e.lastMoveX = e.knockX;
        e.lastMoveY = e.knockY;
        e.x += e.knockX * pushDt;
        e.y += e.knockY * pushDt;
        continue;
      }

      if (e.stunT > 0) continue;

      if (e.moveX !== 0 || e.moveY !== 0) {
        e.lastMoveX = e.moveX * speed;
        e.lastMoveY = e.moveY * speed;
        e.x += e.moveX * speed * dt;
        e.y += e.moveY * speed * dt;
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
          e.lastMoveX = e.dashX * speed;
          e.lastMoveY = e.dashY * speed;
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
          e.lastMoveX = e.dashX * CHARGER.dashSpeed;
          e.lastMoveY = e.dashY * CHARGER.dashSpeed;
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
        e.lastMoveX = (mx / m) * speed;
        e.lastMoveY = (my / m) * speed;
        e.x += (mx / m) * speed * dt;
        e.y += (my / m) * speed * dt;
        continue;
      }

      let dx = p.x + PLAYER_FOOT_OFFSET.x - (e.x + e.footOffsetX);
      let dy = p.y + PLAYER_FOOT_OFFSET.y - (e.y + e.footOffsetY);
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      // Source enemies home directly. Solid body separation is applied once
      // below; a second invented steering force would over-spread the pack.
      e.lastMoveX = dx * speed;
      e.lastMoveY = dy * speed;
      e.x += dx * speed * dt;
      e.y += dy * speed * dt;
    }
  }

  /** Source-style solid enemy circles. One bounded relaxation pass is enough
   * to keep a dense wall from collapsing into a single damaging point while
   * preserving the characteristic packed horde. Scripted sweep lines retain
   * their authored lanes. */
  private resolveEnemyCollisions(): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const near = this.hash.query(e.x, e.y, e.radius * 2 + 48, this.queryBuf);
      for (const o of near) {
        if (o.dead || o.id <= e.id) continue;
        let dx = e.x - o.x;
        let dy = e.y - o.y;
        let d = Math.hypot(dx, dy);
        const target = e.radius + o.radius;
        if (d >= target) continue;
        if (d < 0.0001) {
          dx = e.id % 2 ? 1 : -1;
          dy = 0;
          d = 1;
        }
        const push = (target - d) * 0.5;
        const nx = dx / d;
        const ny = dy / d;
        e.x += nx * push;
        e.y += ny * push;
        o.x -= nx * push;
        o.y -= ny * push;
      }
    }
  }

  private damageEnemy(e: Enemy, amount: number, source?: Role): void {
    if (e.dead) return;
    // Floating damage number (view-only). Weapon-colored,
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
      this.kickRehitUntil.delete(e.id);
      this.kills++;
      if (source) this.killsByRole[source] = (this.killsByRole[source] ?? 0) + 1;
      this.fx?.push({
        type: 'death',
        x: e.x,
        y: e.y,
        radius: e.radius,
        color: e.color,
        elite: ENEMIES[e.kind].boss === true,
      });
      this.spawnGem(e.x, e.y, e.xp);
      if (e.chestChance > 0 && this.rng() < e.chestChance) {
        this.spawnChest(e.x, e.y);
      }
      if (e.kind === 'splitter') this.spawnChildren(e);
    }
  }

  private reapEnemies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) {
        this.kickRehitUntil.delete(this.enemies[i].id);
        this.enemies.splice(i, 1);
      }
    }
  }

  /** Off-screen recycle (the VS model): silently kill any non-elite enemy that
   *  falls far behind the moving player, so the horde is always a wall ahead
   *  and CPU stays bounded. Setting e.dead directly (not via damageEnemy)
   *  means no gem, no kill, no splitter burst — a true recycle. Elites persist
   *  (they are objectives). Pure geometry, deterministic, fx-free. */
  private recycleEnemies(): void {
    const p = this.player;
    const playerFootX = p.x + PLAYER_FOOT_OFFSET.x;
    const playerFootY = p.y + PLAYER_FOOT_OFFSET.y;
    const far = this.spawnDist(9) * ENEMIES.recycleFactor;
    const far2 = far * far;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.despawnAt > 0 && this.timeS >= e.despawnAt) {
        e.dead = true;
        continue;
      }
      if (e.despawnAt > 0) continue;
      const dx = e.x + e.footOffsetX - playerFootX;
      const dy = e.y + e.footOffsetY - playerFootY;
      if (dx * dx + dy * dy <= far2) continue;
      if (e.spawnClass === 'boss') {
        const a = this.rng() * Math.PI * 2;
        const d = this.spawnDist(e.radius);
        e.x = playerFootX + Math.cos(a) * d - e.footOffsetX;
        e.y = playerFootY + Math.sin(a) * d - e.footOffsetY;
      } else {
        e.dead = true;
      }
    }
  }

  /** Debug helper: grant XP as if picked up. */
  grantXp(amount: number): void {
    this.xp += amount;
    this.checkLevel();
  }

  /** Debug helper: jump straight to the next level-up. */
  levelUp(): void {
    const threshold = xpForNextLevel(this.level);
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
      if (d < bestD || (d === bestD && best !== null && e.id < best.id)) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private aimDir(spread: number, range = AIM_RANGE): { x: number; y: number } {
    const p = this.player;
    const best = this.nearestEnemy(range);
    let ang: number;
    if (best) {
      ang = Math.atan2(best.y - p.y, best.x - p.x);
    } else {
      ang = this.rng() * Math.PI * 2;
    }
    ang += (this.rng() * 2 - 1) * spread;
    return { x: Math.cos(ang), y: Math.sin(ang) };
  }

  private damageForHit(e: Enemy, damage: number, closeBonus: boolean, source: Role): void {
    const dx = e.x - this.player.x;
    const dy = e.y - this.player.y;
    const close = closeBonus && dx * dx + dy * dy <= GEAR_TUNING.boxingCloseRange ** 2;
    this.damageEnemy(e, damage * (close ? GEAR_TUNING.boxingDamageMul : 1), source);
  }

  private shoveForHit(
    e: Enemy,
    fromX: number,
    fromY: number,
    distance: number,
    closeBonus: boolean,
  ): void {
    const dx = e.x - this.player.x;
    const dy = e.y - this.player.y;
    const close = closeBonus && dx * dx + dy * dy <= GEAR_TUNING.boxingCloseRange ** 2;
    this.shove(e, fromX, fromY, distance * (close ? GEAR_TUNING.boxingShoveMul : 1));
  }

  private shoveAlong(
    e: Enemy,
    dirX: number,
    dirY: number,
    distance: number,
    closeBonus: boolean,
  ): void {
    const close = closeBonus && Math.hypot(e.x - this.player.x, e.y - this.player.y) <= GEAR_TUNING.boxingCloseRange;
    const resisted = distance * (close ? GEAR_TUNING.boxingShoveMul : 1) * e.knockbackMul;
    if (resisted <= 0) return;
    const d = Math.hypot(dirX, dirY) || 1;
    e.knockX = (dirX / d) * resisted / SHOVE_S;
    e.knockY = (dirY / d) * resisted / SHOVE_S;
    e.knockT = Math.max(e.knockT, SHOVE_S);
  }

  private spawnKickAttack(
    x: number,
    y: number,
    side: 1 | -1,
    built: BuiltAttack,
    followUp: boolean,
    echo: boolean,
    hit = new Set<Enemy>(),
  ): void {
    this.pendingKick.push({
      atS: this.timeS,
      x,
      y,
      side,
      damage: built.conf.damage,
      area: built.conf.area ?? 1,
      started: false,
      startedAt: 0,
      expiresAt: 0,
      samplePlayer: false,
      spawnFollowUp: followUp,
      echo,
      closeBonus: built.closeBonus,
      hit,
    });
  }

  private recordDancefloorStamp(
    trigger: ScheduledTrigger,
    x: number,
    y: number,
    side: 1 | -1,
    built: BuiltAttack,
  ): void {
    if (trigger.step < 0) return;
    const barStep = trigger.step % STEPS_PER_BAR;
    const bar = Math.floor(trigger.step / STEPS_PER_BAR);
    if (bar !== this.dancefloorBar) this.dancefloorStamps.length = 0;
    this.dancefloorBar = bar;
    this.dancefloorStamps.push({
      x,
      y,
      side,
      damage: built.conf.damage,
      area: built.conf.area ?? 1,
      closeBonus: built.closeBonus,
    });
    if (this.dancefloorStamps.length > 4) this.dancefloorStamps.shift();
    if (barStep !== STEPS_PER_BAR - 4) return;

    const echoHit = new Set<Enemy>();
    for (const stamp of this.dancefloorStamps) {
      const echoBuilt: BuiltAttack = {
        ...built,
        conf: {
          ...built.conf,
          damage: stamp.damage * EVOLUTION_TUNING.dancefloor.echoDamageMul,
          area: stamp.area,
        },
        closeBonus: stamp.closeBonus,
      };
      this.spawnKickAttack(stamp.x, stamp.y, stamp.side, echoBuilt, false, true, echoHit);
    }
    this.dancefloorStamps.length = 0;
  }

  /** Base projectile with all fields defaulted; specialized spawners tweak
   *  the few that matter to them. */
  private baseProjectile(role: Role, built: BuiltAttack, color: number): Projectile {
    const conf = built.conf;
    return {
      role,
      x: this.player.x,
      y: this.player.y,
      vx: 0,
      vy: 0,
      radius: conf.radius ?? 4,
      damage: conf.damage,
      pierce: conf.pierce ?? 1,
      maxPierce: conf.pierce ?? 1,
      lifeS: conf.lifetimeS ?? 0.2,
      homing: role === 'lead',
      speed: conf.speed ?? 0,
      color,
      hit: new Set(),
      age: 0,
      orbitAngle: 0,
      orbitRadius: 0,
      rehitT: 0,
      shatter: 0,
      shard: false,
      evolved: false,
      secondary: false,
      shove: built.shove,
      closeBonus: built.closeBonus,
      homingTurnRate: built.homingTurnRate,
      homingRange: built.homingRange,
      targetId: null,
      retargetsLeft: 0,
      orbitRing: 0,
      orbitOmega: built.orbitOmega,
      orbitFromRadius: 0,
      orbitTargetRadius: 0,
      orbitMoveT: 1,
      orbitReachMul: 1,
      shardTemplate: null,
      assignedTargetId: null,
      glassShard: false,
    };
  }

  private spawnProjectile(
    role: Role,
    dir: { x: number; y: number },
    built: BuiltAttack,
    color: number,
    trigger: ScheduledTrigger,
  ): void {
    const pr = this.baseProjectile(role, built, color);
    pr.vx = dir.x * pr.speed;
    pr.vy = dir.y * pr.speed;
    pr.evolved = trigger.evolved;
    pr.variant = trigger.variant;
    if (role === 'lead') {
      pr.homing = true;
      pr.retargetsLeft = this.gear.has('compass') ? 1 : Infinity;
      pr.targetId = this.findHomingTarget(pr)?.id ?? null;
    }
    this.projectiles.push(pr);
  }

  /** Arp: an orbiter that circles the player, chipping what it sweeps. */
  private spawnOrbiter(
    built: BuiltAttack,
    color: number,
    evolved: boolean,
    ring: -1 | 0 | 1 = 0,
  ): Projectile {
    const angle = this.rng() * Math.PI * 2;
    const pr = this.baseProjectile('arp', built, color);
    pr.pierce = Infinity;
    pr.orbitAngle = angle;
    pr.orbitRing = ring;
    const baseOrbit = WEAPONS.arp?.[(this.tiers.get('arp') ?? 1) - 1]?.orbitRadius ?? built.conf.orbitRadius ?? 1;
    pr.orbitReachMul = (built.conf.orbitRadius ?? baseOrbit) / baseOrbit;
    pr.orbitRadius = ring < 0
      ? this.arpInnerRadius * pr.orbitReachMul
      : ring > 0
        ? this.arpOuterRadius * pr.orbitReachMul
        : (built.conf.orbitRadius ?? EVOLUTION_TUNING.orrery.innerStart);
    pr.orbitFromRadius = pr.orbitRadius;
    pr.orbitTargetRadius = pr.orbitRadius;
    pr.orbitOmega = built.orbitOmega * (ring < 0 ? -1 : 1);
    pr.evolved = evolved;
    pr.x = this.player.x + Math.cos(angle) * pr.orbitRadius;
    pr.y = this.player.y + Math.sin(angle) * pr.orbitRadius;
    this.projectiles.push(pr);
    return pr;
  }

  private resetOrreryState(): void {
    this.arpNextRing = -1;
    this.arpInnerRadius = EVOLUTION_TUNING.orrery.innerStart;
    this.arpOuterRadius = EVOLUTION_TUNING.orrery.outerStart;
    this.arpPreviousNote = null;
    this.arpLastStep = -1;
  }

  private spawnOrrery(trigger: ScheduledTrigger, built: BuiltAttack, color: number): void {
    if (
      trigger.step >= 0 &&
      (trigger.step % STEPS_PER_PHRASE === 0 || (this.arpLastStep >= 0 && trigger.step < this.arpLastStep))
    ) {
      this.arpPreviousNote = null;
    }
    if (trigger.step >= 0) this.arpLastStep = trigger.step;
    if (trigger.note !== undefined && this.arpPreviousNote !== null) {
      const direction = Math.sign(trigger.note - this.arpPreviousNote);
      if (direction !== 0) {
        const step = direction * EVOLUTION_TUNING.orrery.noteRadiusStep;
        this.arpInnerRadius = Math.max(
          EVOLUTION_TUNING.orrery.innerMin,
          Math.min(EVOLUTION_TUNING.orrery.innerMax, this.arpInnerRadius + step),
        );
        this.arpOuterRadius = Math.max(
          EVOLUTION_TUNING.orrery.outerMin,
          Math.min(EVOLUTION_TUNING.orrery.outerMax, this.arpOuterRadius + step),
        );
        if (this.arpOuterRadius - this.arpInnerRadius < EVOLUTION_TUNING.orrery.minGap) {
          this.arpOuterRadius = Math.min(
            EVOLUTION_TUNING.orrery.outerMax,
            this.arpInnerRadius + EVOLUTION_TUNING.orrery.minGap,
          );
        }
        for (const pr of this.projectiles) {
          if (pr.role !== 'arp' || !pr.evolved || pr.orbitRing === 0) continue;
          pr.orbitFromRadius = pr.orbitRadius;
          pr.orbitTargetRadius = (pr.orbitRing < 0 ? this.arpInnerRadius : this.arpOuterRadius) * pr.orbitReachMul;
          pr.orbitMoveT = 0;
        }
      }
    }
    if (trigger.note !== undefined) this.arpPreviousNote = trigger.note;

    const ring = this.arpNextRing;
    this.arpNextRing = ring === -1 ? 1 : -1;
    const members = this.projectiles.filter(
      (pr) => pr.role === 'arp' && pr.evolved && pr.orbitRing === ring,
    );
    if (members.length >= EVOLUTION_TUNING.orrery.capPerRing) {
      let oldest = members[0];
      for (const pr of members) if (pr.age > oldest.age) oldest = pr;
      oldest.lifeS = built.conf.lifetimeS ?? oldest.lifeS;
      oldest.age = 0;
      oldest.damage = built.conf.damage;
      oldest.radius = built.conf.radius ?? oldest.radius;
      oldest.closeBonus = built.closeBonus;
      oldest.orbitOmega = built.orbitOmega * (ring < 0 ? -1 : 1);
      const baseOrbit = WEAPONS.arp?.[(this.tiers.get('arp') ?? 1) - 1]?.orbitRadius ?? built.conf.orbitRadius ?? 1;
      oldest.orbitReachMul = (built.conf.orbitRadius ?? baseOrbit) / baseOrbit;
      oldest.orbitFromRadius = oldest.orbitRadius;
      oldest.orbitTargetRadius = (ring < 0 ? this.arpInnerRadius : this.arpOuterRadius) * oldest.orbitReachMul;
      oldest.orbitMoveT = 0;
      oldest.hit.clear();
      return;
    }
    this.spawnOrbiter(built, color, true, ring);
  }

  /** Bell: a note lobbed straight that shatters into shards on its first hit.
   *  The shatter count (per tier) rides on the shot; the shard spawn happens in
   *  updateProjectiles when it lands its first hit. */
  private spawnBell(
    dir: { x: number; y: number },
    built: BuiltAttack,
    shardBuilt: BuiltAttack,
    color: number,
    evolved: boolean,
  ): void {
    const tier = this.tiers.get('bell') ?? 1;
    const pr = this.baseProjectile('bell', built, color);
    pr.vx = dir.x * pr.speed;
    pr.vy = dir.y * pr.speed;
    pr.evolved = evolved;
    pr.shatter = evolved
      ? EVOLUTION_TUNING.glassChoir.shards
      : (BELL.shards[tier - 1] ?? BELL.shards[0]);
    pr.shardTemplate = {
      damage: shardBuilt.conf.damage,
      speed: shardBuilt.conf.speed ?? BELL.shardSpeed,
      radius: shardBuilt.conf.radius ?? BELL.shardRadius,
      lifeS: shardBuilt.conf.lifetimeS ?? BELL.shardLifeS,
      pierce: shardBuilt.conf.pierce ?? BELL.shardPierce,
      turnRate: shardBuilt.homingTurnRate,
      closeBonus: shardBuilt.closeBonus,
    };
    this.projectiles.push(pr);
  }

  private glassChoirAim(range: number): { x: number; y: number } {
    const p = this.player;
    const inRange = this.enemies.filter(
      (e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) <= range,
    );
    const hasPreferred = inRange.some(
      (e) => Math.hypot(e.x - p.x, e.y - p.y) >= EVOLUTION_TUNING.glassChoir.preferredMinRange,
    );
    let best: Enemy | null = null;
    let bestCount = -1;
    let bestD = -1;
    for (const e of inRange) {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (hasPreferred && d < EVOLUTION_TUNING.glassChoir.preferredMinRange) continue;
      let count = 0;
      for (const other of this.enemies) {
        if (!other.dead && Math.hypot(other.x - e.x, other.y - e.y) <= EVOLUTION_TUNING.glassChoir.clusterRadius) count++;
      }
      if (
        count > bestCount ||
        (count === bestCount && d > bestD) ||
        (count === bestCount && d === bestD && best !== null && e.id < best.id)
      ) {
        best = e;
        bestCount = count;
        bestD = d;
      }
    }
    if (!best) return this.aimDir(0.1, range);
    const d = Math.hypot(best.x - p.x, best.y - p.y) || 1;
    return { x: (best.x - p.x) / d, y: (best.y - p.y) / d };
  }

  /** Bell's shatter. Glass Choir gives every shard a different nearby target;
   * excess shards keep the stable radial fan and never retarget. */
  private spawnShards(parent: Projectile, main: Enemy): void {
    const count = parent.shatter;
    const template = parent.shardTemplate;
    if (!template || count <= 0) return;
    const candidates = parent.evolved
      ? this.enemies
        .filter((e) => !e.dead && e !== main && Math.hypot(e.x - parent.x, e.y - parent.y) <= EVOLUTION_TUNING.glassChoir.assignmentRadius)
        .sort((a, b) => {
          const ad = Math.hypot(a.x - parent.x, a.y - parent.y);
          const bd = Math.hypot(b.x - parent.x, b.y - parent.y);
          return ad - bd || a.id - b.id;
        })
      : [];
    const base = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const shardBuilt: BuiltAttack = {
        conf: {
          damage: template.damage,
          speed: template.speed,
          radius: template.radius,
          lifetimeS: template.lifeS,
          pierce: template.pierce,
        },
        aimRange: AIM_RANGE,
        homingRange: AIM_RANGE,
        homingTurnRate: template.turnRate,
        orbitOmega: ARP_OMEGA,
        shove: 0,
        closeBonus: template.closeBonus,
      };
      const pr = this.baseProjectile('bell', shardBuilt, parent.color);
      pr.x = parent.x;
      pr.y = parent.y;
      const assigned = candidates[i] ?? null;
      const dx = assigned ? assigned.x - pr.x : Math.cos(a);
      const dy = assigned ? assigned.y - pr.y : Math.sin(a);
      const d = Math.hypot(dx, dy) || 1;
      pr.vx = (dx / d) * pr.speed;
      pr.vy = (dy / d) * pr.speed;
      pr.shard = true;
      pr.secondary = true;
      pr.evolved = parent.evolved;
      pr.glassShard = parent.evolved;
      pr.assignedTargetId = assigned?.id ?? null;
      pr.targetId = assigned?.id ?? null;
      pr.homing = assigned !== null;
      this.projectiles.push(pr);
    }
  }

  private findHomingTarget(pr: Projectile): Enemy | null {
    const claimed = new Set<number>();
    if (this.gear.has('compass') && !pr.glassShard) {
      for (const other of this.projectiles) {
        if (other !== pr && other.homing && other.targetId !== null) claimed.add(other.targetId);
      }
    }
    let best: Enemy | null = null;
    let bestD = pr.homingRange * pr.homingRange;
    for (const e of this.enemies) {
      if (e.dead || pr.hit.has(e) || claimed.has(e.id)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && best !== null && e.id < best.id)) {
        bestD = d;
        best = e;
      }
    }
    if (best || claimed.size === 0) return best;
    bestD = pr.homingRange * pr.homingRange;
    for (const e of this.enemies) {
      if (e.dead || pr.hit.has(e)) continue;
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && best !== null && e.id < best.id)) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private updateKickStrikes(): void {
    for (let i = this.pendingKick.length - 1; i >= 0; i--) {
      const strike = this.pendingKick[i];
      if (!strike.started) {
        if (strike.atS > this.timeS + 1e-9) continue;
        strike.started = true;
        strike.startedAt = this.timeS;
        strike.expiresAt = this.timeS + 0.2;
        if (strike.samplePlayer) {
          strike.x = this.player.x;
          strike.y = this.player.y;
          strike.side = this.player.facingX === 1 ? -1 : 1;
        }
        if (strike.spawnFollowUp) {
          // Schedule from the main strip's actual simulation start so fixed
          // 60 Hz stepping preserves the full 100 ms interval.
          this.pendingKick.push({
            atS: this.timeS + 0.1,
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
            echo: false,
            closeBonus: strike.closeBonus,
            hit: new Set(),
          });
        }
        // Anchor at the player; the view bursts the pulse outward from here.
        this.fx?.push({
          type: strike.echo ? 'stamp' : 'whip',
          x: strike.x,
          y: strike.y,
          side: strike.side,
          area: strike.area,
          color: KIT_COLORS.kick,
        });
      } else if (this.timeS + 1e-9 >= strike.expiresAt) {
        this.pendingKick.splice(i, 1);
        continue;
      }

      // Grow linearly from zero to full Area over 100 ms, then hold 100 ms;
      // the inner edge stays pinned to the player as the reach extends.
      const age = Math.max(0, this.timeS - strike.startedAt);
      const bodyScale = Math.min(1, age / 0.1);
      const halfW = (KICK_GEOMETRY.baseWidth * strike.area * bodyScale) / 2;
      const halfH = (KICK_GEOMETRY.baseHeight * strike.area * bodyScale) / 2;
      const center = kickStripCenter(strike.x, strike.y, strike.side, halfW);
      const centerX = center.x;
      const centerY = center.y;
      const reach = Math.hypot(halfW, halfH) + 48;
      const near = this.hash.query(centerX, centerY, reach, this.queryBuf);
      for (const e of near) {
        if (
          e.dead ||
          strike.hit.has(e) ||
          (!strike.echo && (this.kickRehitUntil.get(e.id) ?? 0) > this.timeS) ||
          !circleIntersectsRect(e.x, e.y, e.radius, centerX, centerY, halfW, halfH)
        ) {
          continue;
        }
        this.damageForHit(e, strike.damage, strike.closeBonus, 'kick');
        strike.hit.add(e);
        if (!strike.echo) {
          this.kickRehitUntil.set(e.id, this.timeS + EVOLUTION_TUNING.dancefloor.kickRehitS);
        }
        // Enemy hit response reverses pursuit for the same 120 ms flash,
        // scaled by the source bestiary's knockback multiplier.
        this.reverseForKick(e, strike.x, strike.y);
      }
    }
  }

  private reverseForKick(e: Enemy, fromX: number, fromY: number): void {
    if (e.knockbackMul <= 0) return;
    if (e.lastMoveX !== 0 || e.lastMoveY !== 0) {
      e.knockX = -e.lastMoveX * e.knockbackMul;
      e.knockY = -e.lastMoveY * e.knockbackMul;
      e.knockT = SHOVE_S;
      return;
    }
    this.shove(e, fromX, fromY, e.speed * SHOVE_S);
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
    closeBonus = false,
  ): void {
    const near = this.hash.query(x, y, reach + 24, this.queryBuf);
    for (const e of near) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > reach + e.radius) continue;
      if (d < 34) {
        this.damageForHit(e, damage, closeBonus, source);
        if (shove) this.shoveForHit(e, x, y, shove, closeBonus);
        continue;
      }
      let diff = Math.atan2(dy, dx) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= halfArc) {
        this.damageForHit(e, damage, closeBonus, source);
        if (shove) this.shoveForHit(e, x, y, shove, closeBonus);
      }
    }
  }

  private fireDeadCenter(built: BuiltAttack, color: number): void {
    const p = this.player;
    let target: Enemy | null = null;
    let targetD = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > built.aimRange) continue;
      if (
        target === null || e.hp > target.hp ||
        (e.hp === target.hp && (d < targetD || (d === targetD && e.id < target.id)))
      ) {
        target = e;
        targetD = d;
      }
    }
    if (!target) return;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const dirX = dx / d;
    const dirY = dy / d;
    const length = d + target.radius;
    const before: Array<{ enemy: Enemy; projected: number; hp: number }> = [];
    for (const e of this.enemies) {
      if (e.dead || e === target) continue;
      const projected = circleIntersectsSegment(
        e, p.x, p.y, dirX, dirY, length, EVOLUTION_TUNING.deadCenter.width / 2,
      );
      if (projected !== null && projected < d) before.push({ enemy: e, projected, hp: e.hp });
    }
    before.sort((a, b) => a.projected - b.projected || a.enemy.id - b.enemy.id);
    let lesser = 0;
    const targetHp = target.hp;
    for (const entry of before) {
      if (entry.hp < targetHp) lesser++;
      this.damageForHit(entry.enemy, built.conf.damage, built.closeBonus, 'snare');
      if (built.shove) this.shoveForHit(entry.enemy, p.x, p.y, built.shove, built.closeBonus);
    }
    const bonus = Math.min(
      EVOLUTION_TUNING.deadCenter.bonusCap,
      lesser * EVOLUTION_TUNING.deadCenter.bonusPerLesser,
    );
    this.damageForHit(target, built.conf.damage * (1 + bonus), built.closeBonus, 'snare');
    if (built.shove) this.shoveForHit(target, p.x, p.y, built.shove, built.closeBonus);
    this.fx?.push({
      type: 'line', x1: p.x, y1: p.y,
      x2: p.x + dirX * length, y2: p.y + dirY * length,
      width: EVOLUTION_TUNING.deadCenter.width, color, dur: EVOLUTION_TUNING.deadCenter.tracerS,
    });
    this.fx?.push({ type: 'spark', x: target.x, y: target.y, color, n: 9, spread: 20 });
  }

  private spawnUndertow(dir: { x: number; y: number }, built: BuiltAttack, color: number): void {
    this.undertowWalls.push({
      x: this.player.x,
      y: this.player.y,
      vx: dir.x * EVOLUTION_TUNING.undertow.wallSpeed,
      vy: dir.y * EVOLUTION_TUNING.undertow.wallSpeed,
      lifeS: built.conf.lifetimeS ?? EVOLUTION_TUNING.undertow.wallLifeS,
      totalLifeS: built.conf.lifetimeS ?? EVOLUTION_TUNING.undertow.wallLifeS,
      span: Math.max(this.worldW, this.worldH) * EVOLUTION_TUNING.undertow.wallSpanMul,
      thickness: EVOLUTION_TUNING.undertow.wallThickness,
      damage: built.conf.damage * EVOLUTION_TUNING.undertow.damageMul,
      shove: built.shove,
      color,
      closeBonus: built.closeBonus,
      hitAt: new Map(),
    });
  }

  private updateUndertowWalls(dt: number): void {
    for (let i = this.undertowWalls.length - 1; i >= 0; i--) {
      const wall = this.undertowWalls[i];
      wall.lifeS -= dt;
      wall.x += wall.vx * dt;
      wall.y += wall.vy * dt;
      const speed = Math.hypot(wall.vx, wall.vy) || 1;
      const dirX = wall.vx / speed;
      const dirY = wall.vy / speed;
      const sideX = -dirY;
      const sideY = dirX;
      const startX = wall.x - sideX * wall.span / 2;
      const startY = wall.y - sideY * wall.span / 2;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (circleIntersectsSegment(e, startX, startY, sideX, sideY, wall.span, wall.thickness / 2) === null) continue;
        const last = wall.hitAt.get(e.id) ?? -Infinity;
        const validTick = this.timeS - last + 1e-9 >= EVOLUTION_TUNING.undertow.rehitS;
        if (validTick) {
          wall.hitAt.set(e.id, this.timeS);
          this.damageForHit(e, wall.damage, wall.closeBonus, 'bass');
        }
        if (ENEMIES[e.kind].boss) {
          if (validTick) this.shoveAlong(e, dirX, dirY, wall.shove, wall.closeBonus);
        } else {
          e.wallCarryX = wall.vx * e.knockbackMul;
          e.wallCarryY = wall.vy * e.knockbackMul;
          e.wallCarryT = Math.max(e.wallCarryT, dt * 2);
        }
      }
      if (wall.lifeS <= 0) this.undertowWalls.splice(i, 1);
    }
  }

  private makeHeadliner(): HeadlinerSoloist {
    return {
      x: this.player.x, y: this.player.y,
      fromX: this.player.x, fromY: this.player.y,
      targetId: null, age: 0, dashS: EVOLUTION_TUNING.headliner.dashS,
      damage: 0, closeBonus: false, retargetsLeft: 1,
      visited: new Set(), combo: 0, lastTargetId: null,
      dashing: false, returning: false, visible: true, color: KIT_COLORS.lead,
    };
  }

  private headlinerTarget(soloist: HeadlinerSoloist, unvisitedOnly: boolean): Enemy | null {
    const range = EVOLUTION_TUNING.headliner.range *
      (this.gear.has('compass') ? GEAR_TUNING.compassRangeMul : 1);
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (e.dead || (unvisitedOnly && soloist.visited.has(e.id))) continue;
      const dx = e.x - soloist.x;
      const dy = e.y - soloist.y;
      const d = dx * dx + dy * dy;
      if (d < bestD || (d === bestD && best !== null && e.id < best.id)) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private fireHeadliner(trigger: ScheduledTrigger, built: BuiltAttack, color: number): void {
    const soloist = this.headliner ?? this.makeHeadliner();
    this.headliner = soloist;
    soloist.visible = true;
    soloist.color = color;
    if (
      trigger.step >= 0 &&
      (trigger.step % STEPS_PER_PHRASE === 0 ||
        (this.headlinerLastStep >= 0 && trigger.step < this.headlinerLastStep))
    ) {
      soloist.visited.clear();
      soloist.combo = 0;
      soloist.lastTargetId = null;
    }
    if (trigger.step >= 0) this.headlinerLastStep = trigger.step;
    let target = this.headlinerTarget(soloist, true);
    const fallback = target === null;
    if (!target) target = this.headlinerTarget(soloist, false);
    if (!target) return;
    if (!fallback && soloist.lastTargetId !== null && soloist.lastTargetId !== target.id) {
      soloist.combo = Math.min(
        EVOLUTION_TUNING.headliner.comboCap,
        soloist.combo + EVOLUTION_TUNING.headliner.comboStep,
      );
    }
    soloist.fromX = soloist.x;
    soloist.fromY = soloist.y;
    soloist.targetId = target.id;
    soloist.age = 0;
    soloist.damage = built.conf.damage * EVOLUTION_TUNING.headliner.damageMul * (1 + soloist.combo);
    soloist.closeBonus = built.closeBonus;
    soloist.retargetsLeft = 1;
    soloist.returning = false;
    soloist.dashing = true;
  }

  private updateHeadliner(dt: number): void {
    const soloist = this.headliner;
    if (!soloist?.visible || !soloist.dashing) return;
    let target = soloist.targetId === null
      ? null
      : this.enemies.find((e) => e.id === soloist.targetId && !e.dead) ?? null;
    if (!target && !soloist.returning && soloist.retargetsLeft > 0) {
      soloist.retargetsLeft--;
      target = this.headlinerTarget(soloist, true);
      if (target) {
        soloist.targetId = target.id;
        soloist.fromX = soloist.x;
        soloist.fromY = soloist.y;
        soloist.age = 0;
      }
    }
    if (!target && !soloist.returning) {
      soloist.returning = true;
      soloist.targetId = null;
      soloist.fromX = soloist.x;
      soloist.fromY = soloist.y;
      soloist.age = 0;
    }
    soloist.age += dt;
    const u = Math.min(1, soloist.age / soloist.dashS);
    const toX = soloist.returning ? this.player.x : (target?.x ?? this.player.x);
    const toY = soloist.returning ? this.player.y : (target?.y ?? this.player.y);
    const pathX = toX - soloist.fromX;
    const pathY = toY - soloist.fromY;
    const pathD = Math.hypot(pathX, pathY) || 1;
    const curve = Math.sin(Math.PI * u) * Math.min(18, pathD * 0.12) * ((soloist.targetId ?? 0) % 2 ? 1 : -1);
    soloist.x = soloist.fromX + pathX * u + (-pathY / pathD) * curve;
    soloist.y = soloist.fromY + pathY * u + (pathX / pathD) * curve;
    if (u < 1) return;
    if (target && !soloist.returning) {
      this.damageForHit(target, soloist.damage, soloist.closeBonus, 'lead');
      soloist.visited.add(target.id);
      soloist.lastTargetId = target.id;
      this.fx?.push({ type: 'spark', x: target.x, y: target.y, color: soloist.color, n: 8, spread: 18 });
    }
    soloist.dashing = false;
    soloist.returning = false;
    soloist.targetId = null;
  }

  private spawnStandingOvation(
    dir: { x: number; y: number },
    built: BuiltAttack,
    color: number,
    velocity: number,
  ): void {
    this.standingOvations.push({
      x: this.player.x,
      y: this.player.y,
      dirX: dir.x,
      dirY: dir.y,
      radius: built.conf.radius ?? EVOLUTION_TUNING.standingOvation.radius,
      width: EVOLUTION_TUNING.standingOvation.corridorWidth,
      age: 0,
      damage: built.conf.damage * (0.85 + 0.3 * velocity) * EVOLUTION_TUNING.standingOvation.damageMul,
      throwDist: built.shove,
      color,
      closeBonus: built.closeBonus,
      caught: new Set(),
      throwByEnemy: new Map(),
      closed: false,
      released: false,
    });
  }

  private updateStandingOvations(dt: number): void {
    for (let i = this.standingOvations.length - 1; i >= 0; i--) {
      const clap = this.standingOvations[i];
      clap.age += dt;
      if (!clap.closed && clap.age + 1e-9 >= EVOLUTION_TUNING.standingOvation.closeS) {
        clap.closed = true;
        const startX = clap.x - clap.dirX * clap.radius;
        const startY = clap.y - clap.dirY * clap.radius;
        for (const e of this.enemies) {
          if (e.dead || clap.caught.has(e)) continue;
          const projected = circleIntersectsSegment(
            e, startX, startY, clap.dirX, clap.dirY, clap.radius * 2, clap.width / 2,
          );
          if (projected === null) continue;
          clap.caught.add(e);
          this.damageForHit(e, clap.damage, clap.closeBonus, 'clap');
          if (!ENEMIES[e.kind].boss) e.stunT = Math.max(e.stunT, EVOLUTION_TUNING.standingOvation.stunS);
        }
      }
      if (!clap.released && clap.age + 1e-9 >= EVOLUTION_TUNING.standingOvation.releaseAtS) {
        clap.released = true;
        for (const e of clap.caught) {
          if (e.dead) continue;
          this.shoveForHit(e, this.player.x, this.player.y, clap.throwDist, clap.closeBonus);
        }
        clap.caught.clear();
      }
      if (clap.age >= EVOLUTION_TUNING.standingOvation.endS) this.standingOvations.splice(i, 1);
    }
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
        if (pr.orbitMoveT < 1) {
          pr.orbitMoveT = Math.min(1, pr.orbitMoveT + dt / EVOLUTION_TUNING.orrery.radiusMoveS);
          const u = pr.orbitMoveT;
          const smooth = u * u * (3 - 2 * u);
          pr.orbitRadius = pr.orbitFromRadius + (pr.orbitTargetRadius - pr.orbitFromRadius) * smooth;
        }
        pr.orbitAngle += pr.orbitOmega * dt;
        pr.x = p.x + Math.cos(pr.orbitAngle) * pr.orbitRadius;
        pr.y = p.y + Math.sin(pr.orbitAngle) * pr.orbitRadius;
        pr.rehitT -= dt;
        if (pr.rehitT <= 0) {
          pr.hit.clear();
          pr.rehitT = ORBIT_REHIT_S;
        }
      } else {
        if (pr.homing) {
          let best = pr.targetId === null
            ? null
            : this.enemies.find((e) => e.id === pr.targetId && !e.dead && !pr.hit.has(e)) ?? null;
          if (!best && !pr.glassShard) {
            const initialAcquire = pr.targetId === null && pr.hit.size === 0 && pr.age <= dt + 1e-9;
            if (initialAcquire || pr.retargetsLeft > 0) {
              if (!initialAcquire && Number.isFinite(pr.retargetsLeft)) pr.retargetsLeft--;
              best = this.findHomingTarget(pr);
              pr.targetId = best?.id ?? null;
            }
          }
          if (best) {
            const ang = Math.atan2(best.y - pr.y, best.x - pr.x);
            const cur = Math.atan2(pr.vy, pr.vx);
            let diff = ang - cur;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            // tight turn so seekers snap to targets instead of orbiting them
            const turn = Math.max(-pr.homingTurnRate * dt, Math.min(pr.homingTurnRate * dt, diff));
            const next = cur + turn;
            pr.vx = Math.cos(next) * pr.speed;
            pr.vy = Math.sin(next) * pr.speed;
          }
        }
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
      }

      const near = this.hash.query(pr.x, pr.y, pr.radius + 24, this.queryBuf);
      for (const e of near) {
        if (e.dead || pr.hit.has(e) || !circlesOverlap(pr, e)) continue;
        pr.hit.add(e);
        if (pr.role === 'hat' && pr.evolved) {
          const open = pr.variant === 'open';
          const cuts = e.hatCutExpiryS >= this.timeS ? e.hatCuts : 0;
          this.damageForHit(e, pr.damage, pr.closeBonus, 'hat');
          if (open) {
            if (cuts > 0) {
              this.damageForHit(
                e,
                pr.damage * EVOLUTION_TUNING.needleStorm.consumeMul * cuts,
                pr.closeBonus,
                'hat',
              );
              this.fx?.push({ type: 'cut', x: e.x, y: e.y, radius: e.radius, color: pr.color, release: true });
            }
            e.hatCuts = 0;
            e.hatCutExpiryS = 0;
          } else if (!e.dead) {
            e.hatCuts = Math.min(EVOLUTION_TUNING.needleStorm.maxCuts, cuts + 1);
            e.hatCutExpiryS = this.timeS + EVOLUTION_TUNING.needleStorm.cutExpiryS;
            this.fx?.push({ type: 'cut', x: e.x, y: e.y, radius: e.radius, color: pr.color, release: false });
          }
        } else {
          this.damageForHit(e, pr.damage, pr.closeBonus, pr.role);
        }
        if (pr.shove) {
          if (pr.role === 'bass') this.shoveAlong(e, pr.vx, pr.vy, pr.shove, pr.closeBonus);
          else this.shoveForHit(e, pr.x, pr.y, pr.shove, pr.closeBonus);
        }
        // Bell: the note shatters into a radial burst of shards on its first
        // hit. shatter is 0 on a shard, so shards never re-shatter.
        if (pr.role === 'bell' && pr.shatter > 0) {
          this.spawnShards(pr, e);
          this.fx?.push({ type: 'spark', x: e.x, y: e.y, color: pr.color, n: 6, spread: 14 });
          pr.shatter = 0;
        }
        // Per-hit spark (view-only, bounded to low-count roles).
        if (SPARK_HIT_ROLES.has(pr.role) && !pr.shard)
          this.fx?.push({ type: 'spark', x: e.x, y: e.y, color: pr.color, n: 4, spread: 12 });
        // Orbiters gate re-hits by time, so they never spend pierce on a hit.
        if (pr.role === 'arp') continue;
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
    source: Role,
    opts: { closeBonus?: boolean; groupId?: number; cathedral?: boolean } = {},
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
      slow: true,
      closeBonus: opts.closeBonus ?? false,
      groupId: opts.groupId ?? 0,
      cathedral: opts.cathedral ?? false,
    });
  }

  private spawnCathedral(
    x: number,
    y: number,
    conf: WeaponConf,
    color: number,
    closeBonus: boolean,
  ): void {
    const groupId = this.nextZoneGroupId++;
    const parentRadius = conf.radius ?? 76;
    const offset = parentRadius * EVOLUTION_TUNING.cathedral.offsetMul;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      this.spawnZone(
        x + Math.cos(angle) * offset,
        y + Math.sin(angle) * offset,
        {
          damage: conf.damage * EVOLUTION_TUNING.cathedral.damageMul,
          radius: parentRadius * EVOLUTION_TUNING.cathedral.radiusMul,
          lifetimeS: conf.lifetimeS,
        },
        color,
        'chord',
        { closeBonus, groupId, cathedral: true },
      );
    }
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.lifeS -= dt;

      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = ZONE_TICK_S;
        this.damageArea(z.x, z.y, z.radius, z.damage, z.source, 0, z.closeBonus);
      }
      if (z.lifeS <= 0) {
        this.zones.splice(i, 1);
      }
    }
    this.applyZoneSlows();
  }

  private applyZoneSlows(): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      let slowMul = 1;
      const cathedralByGroup = new Map<number, number>();
      for (const z of this.zones) {
        if (!z.slow || !circlesOverlap(z, e)) continue;
        if (!z.cathedral) slowMul = Math.min(slowMul, ZONE_SLOW_MUL);
        else cathedralByGroup.set(z.groupId, (cathedralByGroup.get(z.groupId) ?? 0) + 1);
      }
      for (const count of cathedralByGroup.values()) {
        slowMul = Math.min(
          slowMul,
          count >= 2 ? EVOLUTION_TUNING.cathedral.overlapSlowMul : ZONE_SLOW_MUL,
        );
      }
      if (slowMul < 1) {
        e.slowMul = slowMul;
        e.slowT = Math.max(e.slowT, 0.08);
      }
    }
  }

  private damageArea(
    x: number,
    y: number,
    radius: number,
    damage: number,
    source?: Role,
    shove = 0,
    closeBonus = false,
  ): void {
    const near = this.hash.query(x, y, radius + 24, this.queryBuf);
    const area = { x, y, radius };
    for (const e of near) {
      if (!e.dead && circlesOverlap(area, e)) {
        if (source) this.damageForHit(e, damage, closeBonus, source);
        else this.damageEnemy(e, damage);
        if (shove) this.shoveForHit(e, x, y, shove, closeBonus);
      }
    }
  }

  // ---- pickups and juice ----

  private spawnGem(x: number, y: number, xp: number): void {
    // The published legacy implementation randomizes the listed XP value.
    // Current Unity internals are unpublished, so this is the version-pinned
    // observable reference used by our parity model.
    const dropped = Math.floor((this.rng() + 0.5) * xp);
    if (dropped <= 0) return;
    const tier: Gem['tier'] = dropped <= 2 ? 'blue' : dropped <= 9 ? 'green' : 'red';
    if (this.gems.length < RUN.maxGems) {
      this.gems.push({ x, y, xp: dropped, tier });
      return;
    }
    if (!this.overflowGem || !this.gems.includes(this.overflowGem)) {
      let farthest = this.gems[0];
      let farthestD = -1;
      for (const gem of this.gems) {
        const dx = gem.x - this.player.x;
        const dy = gem.y - this.player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > farthestD) {
          farthestD = d2;
          farthest = gem;
        }
      }
      this.overflowGem = farthest;
      farthest.tier = 'red';
    }
    this.overflowGem.xp += dropped;
    this.overflowGem.tier = 'red';
  }

  private updateGems(dt: number): void {
    const p = this.player;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < RUN.magnetRadius) {
        const pull = RUN.gemPullSpeed * dt;
        g.x += (dx / (d || 1)) * pull;
        g.y += (dy / (d || 1)) * pull;
      }
      if (d < RUN.pickupRadius) {
        this.xp += g.xp * xpPickupMultiplier(this.level);
        this.gems.splice(i, 1);
        if (g === this.overflowGem) this.overflowGem = null;
        this.checkLevel();
      }
    }
  }

  /** Sandbox fixture and boss-drop seam. A chest stays exactly where it lands
   *  until the player walks within its fixed 36-unit radius. */
  spawnChest(x = this.player.x, y = this.player.y): Chest {
    const chest = { x, y };
    this.chests.push(chest);
    return chest;
  }

  clearChests(): void {
    this.chests.length = 0;
  }

  private updateChests(): void {
    const p = this.player;
    const rr = 36 * 36;
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      const dx = p.x - chest.x;
      const dy = p.y - chest.y;
      if (dx * dx + dy * dy > rr) continue;
      this.chests.splice(i, 1);
      this.events.onChestCollected();
    }
  }

  private checkLevel(): void {
    let threshold = xpForNextLevel(this.level);
    while (this.xp >= threshold) {
      this.xp -= threshold;
      this.level += 1;
      this.events.onLevelUp(this.level);
      threshold = xpForNextLevel(this.level);
    }
  }

  /** XP progress toward the next level, 0..1, for the HUD bar. */
  xpProgress(): number {
    const threshold = xpForNextLevel(this.level);
    return Math.min(1, this.xp / threshold);
  }

  private spawnRing(x: number, y: number, radius: number, color: number, dur: number, soft = false): void {
    this.fx?.push({ type: 'ring', x, y, radius, color, dur, soft });
  }

}
