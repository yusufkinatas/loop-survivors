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
  MULTISHOT_FAN_RAD,
  BELL,
  CIRCLER,
  DAMAGE_FEEDBACK,
  DARTER,
  ENEMIES,
  HAT_LANE,
  LEAD_SERPENT,
  MAD_FOREST_FRAMES,
  MAX_ALIVE_HARD,
  RUN,
  STAGE_MAGNET,
  SHIELDED,
  SHOVE_S,
  SPLITTER,
  TWO_HANDS,
  WEAPON_SHOVE,
  WORLD_SCALE,
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
import { mulberry32, type Rng } from './rng';
import { SpatialHash, circlesOverlap } from './spatial';
import {
  deriveBuildMods,
  eligibleEvolutions,
  itemMaxLevel,
  paddedJacketHeal,
  type BuildMods,
  type EvolutionDefinition,
  type ItemId,
} from './items';
import {
  endlessScale,
  waveRecipe,
} from './tour';
import {
  WEAPON_MODULES,
  weaponTiers,
  type ProjectileBehavior,
  type TickPhase,
  type WeaponContext,
  type WeaponInstance,
} from './weapons';

/** Roles that emit a per-hit spark on impact. Bounded to low-count roles so
 *  a 500-enemy event frame never floods the fx queue.
 *
 *  SHRINKING (#141). This is one of the two role-keyed tables the shared
 *  projectile loop still reads, and every entry is the personal tuning of a
 *  weapon that has not been extracted yet. The snare's entry left with the
 *  snare module, which pushes its own spark through ctx.fx; lead is the last
 *  one, and takes this set with it. */
const SPARK_HIT_ROLES = new Set<Role>(['lead']);

/** Source player sprite uses a feet anchor; the stored player position is its
 * circle center. This is the source feet offset normalized to H800. */
export const PLAYER_FOOT_OFFSET = {
  x: 1 * WORLD_SCALE,
  y: 7 * WORLD_SCALE,
} as const;

/** Rolling window for the sandbox dummy's live DPS. Weapons fire on the beat
 * grid, so a one-second average would jitter between "kick landed" and
 * "nothing landed"; four bars at 122 BPM is ~7.9s, so 8s reads steady. */
export const DUMMY_DPS_WINDOW = 8;
const DUMMY_DPS_BUCKET = 0.25;
const DUMMY_DPS_BUCKETS = Math.round(DUMMY_DPS_WINDOW / DUMMY_DPS_BUCKET);

/** Per-dummy damage bookkeeping behind the floating readout. */
export interface DummyReadout {
  /** HP restored after every hit, so the dummy never reaches zero. */
  spawnHp: number;
  /** Cumulative damage taken since spawn. */
  total: number;
  /** Seconds alive since spawn. */
  aliveT: number;
  /** Ring buffer of per-bucket damage covering DUMMY_DPS_WINDOW seconds. */
  buckets: number[];
  head: number;
  bucketT: number;
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
  zoneSlowMul: number;
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
  /** Spawn origin. All classes count toward the periodic 300 check; scripted
   * bosses/events may themselves spawn beyond it up to the 500 hard cap. */
  spawnClass: 'regular' | 'boss' | 'event';
  /** Scripted sweep motion. Zeroes mean normal direct homing. */
  moveX: number;
  moveY: number;
  /** Scripted event expiry; 0 means normal lifetime/recycling. */
  despawnAt: number;
  knockbackMul: number;
  /** Endless-run spawn identity. Stats never change after this minute. */
  spawnMinute: number;
  /** Gold-outline ordinary enemy with extra health/power/XP. */
  amped: boolean;
  prevX: number;
  prevY: number;
  /** Sandbox practice target: undying, immobile, harmless. A flag keeps the
   *  hot movement loops off a string compare. */
  dummy: boolean;
  /** Dummy-only damage bookkeeping; null on every ordinary enemy. */
  readout: DummyReadout | null;
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
  /** Orbit geometry around the player, and the re-hit cooldown so a slow sweep
   *  keeps chipping the same enemy. Written only by the weapon module that
   *  steers this shot (the arp); the shared loop never reads them. */
  orbitAngle: number;
  orbitRadius: number;
  rehitT: number;
  /** How far a homing shot will look for a target. Infinity means "the whole
   *  screen". A FIELD, not a role test: the shared loop asks the shot, never
   *  which weapon fired it. */
  homingRange: number;
  /** bell: shards to spawn on this shot's first hit (0 for a shard itself, so
   *  shards never re-shatter). */
  shatter: number;
  /** True for a bell shard (a fragment shot), so its hit path skips shattering. */
  shard: boolean;
  bounces: number;
  bounceRetention: number;
  evolved: boolean;
  turnRate: number;
  orbitDir: 1 | -1;
  gravity: boolean;
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
  evolved: boolean;
  driftSpeed: number;
  damageCap: number;
  slowMul: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  age: number;
  lifeS: number;
  damage: number;
  shove: number;
  color: number;
  source: Role;
  hit: Set<Enemy>;
}

export interface GravityWell {
  x: number;
  y: number;
  radius: number;
  lifeS: number;
  pullSpeed: number;
  color: number;
  burstT: number;
  burstDamage: number;
  burst: boolean;
}

/** One Two Hands pincer in flight: two slabs standing off along `angle` from
 *  (x, y), travelling inward to meet at `closesAt`. */
interface ClapPinch {
  x: number;
  y: number;
  /** Axis the two slabs travel along, in radians. */
  angle: number;
  /** Simulation time at which the hands meet and the damage lands. */
  closesAt: number;
  /** Total travel time, so the view can be fed a halfway frame. */
  closeS: number;
  gap: number;
  radius: number;
  damage: number;
  color: number;
  /** Set once the halfway visual has been emitted. */
  midShown: boolean;
}

/** A treasure chest dropped by a defeated elite/boss enemy. Walk into it to
 *  open it: it grants a weapon evolution when one is ready, otherwise health. */
export interface Chest {
  x: number;
  y: number;
  color: number;
}

export interface Gem {
  x: number;
  y: number;
  xp: number;
  tier: 'blue' | 'green' | 'red';
  /** Set only by a collected Stage Magnet; later drops remain unaffected. */
  vacuumed?: boolean;
}

export interface MusicNotePickup {
  x: number;
  y: number;
  value: number;
  tier: 'note' | 'phrase' | 'anthem';
  /** Set only by a collected Stage Magnet; later drops remain unaffected. */
  vacuumed?: boolean;
}

export interface StageMagnetPickup {
  x: number;
  y: number;
  /** Seconds remaining before a missed pickup fades away. */
  lifeS: number;
}

export interface VacuumResult {
  gems: number;
  notes: number;
}

/** Fire-and-forget visuals the world requests and the view renders. */
export type FxEvent =
  | { type: 'ring'; x: number; y: number; radius: number; color: number; dur: number; soft?: boolean }
  | { type: 'vacuum'; x: number; y: number; radius: number }
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
  | { type: 'slam'; x: number; y: number; radius: number; color: number }
  | { type: 'beam'; x: number; y: number; x2: number; y2: number; width: number; color: number }
  | { type: 'pressure'; x: number; y: number; color: number; label: string }
  | { type: 'evolution'; x: number; y: number; color: number; label: string };

export interface RunEvents {
  onLevelUp(level: number): void;
  onDeath(): void;
  onVictory(): void;
  onHit(): void;
  onMinute?(minute: number): void;
  onChest?(chest: Chest): void;
  onNoteCollected?(value: number, runTotal: number): void;
  onStageMagnet?(result: VacuumResult): void;
  onMilestone?(id: 'first5m' | 'fullBand' | 'firstEvolution'): void;
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
  /** Independent rare-drop stream; injectable only for deterministic checks. */
  stageMagnetRng?: Rng;
  /** Movement axis provider (magnitude 0..1). */
  control?: () => { x: number; y: number };
  /** False for non-visual fixtures that do not consume effects. */
  fx?: boolean;
  startingItem?: ItemId;
  secondWind?: boolean;
}

export class RunWorld {
  /** Owned weapons and their ladder tier (1-4). */
  readonly tiers = new Map<Role, number>();
  readonly items = new Map<ItemId, number>();
  readonly evolved = new Set<Role>();

  player = {
    x: 0,
    y: 0,
    hp: RUN.playerHp,
    radius: RUN.playerRadius,
    iframesT: 0,
    facingX: 1 as 1 | -1,
    /** Persistent 2D walk heading (unit vector). Holds its last value while
     *  standing still so directional weapons never lose their line. Starts
     *  pointing right, consistent with facingX: 1. */
    moveDirX: 1,
    moveDirY: 0,
  };
  level = 1;
  xp = 0;
  timeS = 0;
  kills = 0;
  killsByRole: Partial<Record<Role, number>> = {};
  /** Effective damage dealt per weapon (overkill not counted). */
  damageByRole: Partial<Record<Role, number>> = {};
  evolutionsByRole: Partial<Record<Role, number>> = {};
  evolutionsMade = 0;
  chestsOpened = 0;
  /** Shop currency physically collected during this run. */
  notesCollected = 0;
  readonly milestones = new Set<'first5m' | 'fullBand' | 'firstEvolution'>();
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
  readonly gems: Gem[] = [];
  readonly musicNotes: MusicNotePickup[] = [];
  readonly stageMagnets: StageMagnetPickup[] = [];
  readonly shockwaves: Shockwave[] = [];
  readonly gravityWells: GravityWell[] = [];
  readonly chests: Chest[] = [];
  private readonly clapPinches: ClapPinch[] = [];

  secondWindReady = false;

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
  private endlessMinute = -1;
  private endlessNextSpawnT = 0;
  private stageStarted = false;
  private nextEnemyId = 1;
  /** Deterministic clean-room equivalent of the source's uniform frame pick.
   * Cycling each kind's published frame list preserves its exact long-run
   * collider weighting without consuming the separate stage RNG stream. */
  private enemyFrameCounters: Partial<Record<EnemyKind, number>> = {};
  private overflowGem: Gem | null = null;
  private overflowMusicNote: MusicNotePickup | null = null;
  private noteDropPity = 0;
  private readonly stageMagnetRng: Rng;
  private stageMagnetDropPity = 0;
  private nextStageMagnetDropAt = 0;
  private lastMinute = -1;
  private triggerCounts: Partial<Record<Role, number>> = {};
  private encoreDamageBonus = 0;
  private encoreMoveBonus = 0;
  private encoreAreaBonus = 0;
  /** Per-run weapon-module state, one instance per migrated role. */
  private readonly weapons = new Map<Role, WeaponInstance>();
  /** The weapon context handed to each module: built once per role per world,
   *  never per frame. Every query is a getter or a thunk, so nothing is
   *  snapshotted. */
  private readonly weaponCtx = new Map<Role, WeaponContext>();
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
    const magnetSeed = Math.floor(this.rng() * 0x7fffffff);
    this.stageMagnetRng = opts.stageMagnetRng ?? mulberry32(magnetSeed ^ 0x4d41474e);
    this.control = opts.control ?? (() => ({ x: 0, y: 0 }));
    this.fx = (opts.fx ?? true) ? [] : null;
    if (opts.startingItem) this.items.set(opts.startingItem, 1);
    this.secondWindReady = opts.secondWind ?? false;
    // Built after the stageMagnetRng seed draw above: the context factory draws
    // no rng, so no draw moves.
    for (const m of WEAPON_MODULES) {
      this.weapons.set(m.role, m.create());
      this.weaponCtx.set(m.role, this.makeWeaponContext(m.role));
    }
  }

  /** The narrow surface the world hands a weapon module: queries about the
   *  world in, effects out. This is the ONLY place a WeaponTarget is cast back
   *  to a mutable Enemy — three casts, one file, all inside effects the world
   *  implements. */
  private makeWeaponContext(role: Role): WeaponContext {
    const world = this;
    const color = KIT_COLORS[role];
    // This context's private scratch buffer, so one weapon can never corrupt
    // another's iteration. SpatialHash.query truncates on entry, so contents
    // and order are unchanged from the shared queryBuf.
    const buf: Enemy[] = [];
    return {
      role,
      color,
      get evolved() { return world.evolved.has(role); },
      get timeS() { return world.timeS; },
      get player() { return world.player; },
      get worldW() { return world.worldW; },
      get worldH() { return world.worldH; },
      get buildMods() { return world.buildMods; },
      rng: () => world.rng(),
      get triggerCount() { return world.triggerCounts[role] ?? 0; },
      aimDir: (spread) => world.aimDir(spread),
      aimFan: (spread) => world.aimFan(spread),
      near: (x, y, r) => world.hash.query(x, y, r, buf),
      all: () => world.enemies,
      damage: (t, amount) => world.damageEnemy(t as Enemy, amount, role),
      shove: (t, fx, fy, d) => world.shove(t as Enemy, fx, fy, d),
      setKnock: (t, vx, vy, s) => {
        const e = t as Enemy;
        e.knockX = vx;
        e.knockY = vy;
        e.knockT = s;
      },
      fx: (event) => { world.fx?.push(event); },
      // Storage stays world-side: view.ts iterates world.projectiles and
      // pushProjectile's live-shot ceiling has to hold across every weapon at
      // once. The module gets a spawn effect and a query over its own shots.
      spawnProjectile: (conf, damage) => {
        const projectile = world.baseProjectile(role, conf, color, damage);
        world.pushProjectile(projectile);
        return projectile;
      },
      projectiles: () => world.projectiles.filter((projectile) => projectile.role === role),
      retireProjectile: (projectile) => {
        const index = world.projectiles.indexOf(projectile);
        if (index >= 0) world.projectiles.splice(index, 1);
      },
    };
  }

  /** The motion and hit rules a migrated weapon lends the SHARED projectile
   *  loop, or undefined when no module owns the role. This lookup is what
   *  replaced `pr.role === 'arp'`: the loop asks the roster, never the role. */
  private projectileBehavior(role: Role): ProjectileBehavior | undefined {
    return this.weapons.get(role)?.projectile;
  }

  /** Tick every migrated weapon pinned to this damage phase. Phase order is
   *  the world's; array order decides only within a phase. */
  private tickWeapons(phase: TickPhase, dt: number): void {
    for (const m of WEAPON_MODULES) {
      if (m.tickAt !== phase) continue;
      this.weapons.get(m.role)!.tick?.(this.weaponCtx.get(m.role)!, dt);
    }
  }

  get enemyCount(): number {
    return this.enemies.length;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  get buildMods(): BuildMods {
    const mods = deriveBuildMods(this.items);
    return {
      ...mods,
      damageMul: mods.damageMul * (1 + this.encoreDamageBonus),
      moveMul: mods.moveMul * (1 + this.encoreMoveBonus),
      areaMul: mods.areaMul * (1 + this.encoreAreaBonus),
    };
  }

  get playerMaxHp(): number {
    return RUN.playerHp + this.buildMods.maxHpBonus;
  }

  get playerArmor(): number {
    return RUN.playerArmor + this.buildMods.armorBonus;
  }

  get encoreProgress(): { damagePct: number; movePct: number; areaPct: number } {
    return {
      damagePct: Math.round(this.encoreDamageBonus * 100),
      movePct: Math.round(this.encoreMoveBonus * 100),
      areaPct: Math.round(this.encoreAreaBonus * 100),
    };
  }

  addItem(id: ItemId, level = (this.items.get(id) ?? 0) + 1): void {
    const previous = this.items.get(id) ?? 0;
    const next = Math.max(previous, Math.min(itemMaxLevel(id), level));
    this.items.set(id, next);
    if (id === 'paddedJacket') {
      this.player.hp = Math.min(this.playerMaxHp, this.player.hp + paddedJacketHeal(previous, next));
    }
    this.spawnRing(this.player.x, this.player.y, 190, 0xffd875, 0.5, true);
  }

  /** Exact passive-level setter for the sandbox. Normal rewards stay
   * monotonic through addItem(); this developer surface supports removal. */
  setItemLevelForSandbox(id: ItemId, level: number): void {
    const previousMax = this.playerMaxHp;
    const next = Math.max(0, Math.min(itemMaxLevel(id), Math.floor(level)));
    if (next === 0) this.items.delete(id);
    else this.items.set(id, next);
    if (id === 'paddedJacket') {
      const hpRatio = previousMax > 0 ? this.player.hp / previousMax : 1;
      this.player.hp = Math.min(this.playerMaxHp, Math.max(1, this.playerMaxHp * hpRatio));
    }
  }

  applyEncoreChoice(kind: 'heal' | 'damage' | 'move' | 'area'): void {
    if (kind === 'heal') this.player.hp = Math.min(this.playerMaxHp, this.player.hp + 15);
    if (kind === 'damage') this.encoreDamageBonus = Math.min(0.20, this.encoreDamageBonus + 0.02);
    if (kind === 'move') this.encoreMoveBonus = Math.min(0.10, this.encoreMoveBonus + 0.02);
    if (kind === 'area') this.encoreAreaBonus = Math.min(0.15, this.encoreAreaBonus + 0.03);
  }

  eligibleEvolutions(): EvolutionDefinition[] {
    return eligibleEvolutions(this.tiers, this.items, this.evolved);
  }

  evolve(role: Role): EvolutionDefinition | null {
    const evolution = this.eligibleEvolutions().find((candidate) => candidate.role === role) ?? null;
    if (!evolution) return null;
    this.evolved.add(role);
    this.evolutionsMade += 1;
    this.evolutionsByRole[role] = (this.evolutionsByRole[role] ?? 0) + 1;
    this.markMilestone('firstEvolution');
    this.fx?.push({ type: 'evolution', x: this.player.x, y: this.player.y, color: evolution.color, label: evolution.name });
    this.spawnRing(this.player.x, this.player.y, 320, 0xffdf74, 1);
    return evolution;
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
   *  owned tier. What the chart says about the sound — its variant and its
   *  velocity — stays in the mix and never reaches the world: every trigger
   *  of a weapon deals the same damage over the same footprint. */
  fireTrigger(t: ScheduledTrigger): void {
    const tier = this.tiers.get(t.role);
    if (!tier) return;
    // The roster is keyed on the supported catalog; a trigger only ever fires
    // for an owned (hence supported) role, so the entry is always present.
    let conf: WeaponConf = weaponTiers(t.role)![tier - 1];
    const color = KIT_COLORS[t.role];
    const p = this.player;

    // Single build-transform pipeline (D1): tempo compensation, folded in one
    // place — balance code multiplies here.
    conf = this.applyBuild(conf);
    this.triggerCounts[t.role] = (this.triggerCounts[t.role] ?? 0) + 1;
    const evolved = this.evolved.has(t.role);

    // A migrated weapon owns its whole identity behind the weapon context; the
    // switch below is the shrinking remainder.
    const weapon = this.weapons.get(t.role);
    if (weapon) {
      weapon.fire(this.weaponCtx.get(t.role)!, conf);
      return;
    }

    switch (t.role) {
      case 'chord': {
        // Thrown at the nearest enemy, not dropped underfoot: the zone has
        // to land where the horde actually is to be worth a pick.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, conf, color, 'chord', evolved);
        break;
      }
      case 'clap': {
        if (evolved) {
          this.fireTwoHands(conf, color);
          break;
        }
        // Whip: a wide forward slash in the aim direction, hitting a cone.
        const aim = this.aimDir(0);
        const ang = Math.atan2(aim.y, aim.x);
        const reach = conf.radius!;
        this.damageCone(p.x, p.y, ang, conf.arc!, reach, conf.damage, 'clap', WEAPON_SHOVE.clap);
        this.fx?.push({ type: 'arc', x: p.x, y: p.y, angle: ang, arc: conf.arc!, radius: reach, color });
        break;
      }
      case 'bell': {
        // A note lobbed straight that shatters into shards on its first hit.
        for (const dir of this.aimFan(0.1)) this.spawnBell(dir, conf, color);
        break;
      }
      case 'bass': {
        if (evolved) {
          this.spawnSubquake(conf, color);
          break;
        }
        // One wide rolling wave per trigger; Double Take fans extra waves.
        for (const dir of this.aimFan(0.08)) this.spawnProjectile('bass', dir, conf, color);
        break;
      }
      case 'hat': {
        // Knife: fires straight along the walk heading with zero scatter, so
        // the player aims by steering. Never consults nearestEnemy — with an
        // empty screen it still rails along the direction of travel.
        // Double Take's extra shots fan around the heading, never off it.
        for (const dir of this.fanAround(this.moveDir())) this.spawnProjectile('hat', dir, conf, color);
        break;
      }
      case 'lead': {
        for (const dir of this.aimFan(0.08)) this.spawnProjectile(t.role, dir, conf, color);
        break;
      }
    }
  }

  /** Add a weapon or raise its tier. The pulse fires when the change lands
   *  (next-bar entry), so eye and ear agree on the moment. */
  addWeapon(role: Role, tier = 1): void {
    this.tiers.set(role, tier);
    this.spawnRing(this.player.x, this.player.y, 220, KIT_COLORS[role], 0.6);
    if (this.tiers.size >= 7) this.markMilestone('fullBand');
  }

  /** Sandbox loadout editor: drop a weapon entirely. */
  removeWeapon(role: Role): void {
    this.tiers.delete(role);
  }

  /** Sandbox-only reversal for testing the before/after evolution contract. */
  clearEvolutionForSandbox(role: Role): void {
    this.evolved.delete(role);
  }

  /** Move the sandbox to a deterministic threat minute without running every
   * preceding frame. Newly spawned enemies use that minute's endless scale. */
  setSandboxThreatMinute(minute: number): void {
    const next = Math.max(0, Math.floor(minute));
    this.timeS = next * 60 + 0.01;
    this.lastMinute = next - 1;
    this.endlessMinute = -1;
    this.endlessNextSpawnT = this.timeS;
  }

  spawnSandboxWave(minute = Math.floor(this.timeS / 60)): void {
    const recipe = waveRecipe(Math.max(8, Math.floor(minute)));
    for (let i = 0; i < recipe.pattern.length; i++) {
      this.spawnRingOf(recipe.pattern[i], Math.max(6, Math.floor(36 / recipe.pattern.length)));
    }
  }

  /** The single build-transform pipeline: soundset multiplier plus Antonio's
   * documented level-based Might. Role-independent since Needle Tips went
   * pierce-only (#145) and took the projectile-damage gate with it. */
  private applyBuild(conf: WeaponConf): WeaponConf {
    // Antonio's passive adds 10% Might every ten levels, capped at +50%.
    const antonioMight = 1 + Math.min(5, Math.floor(this.level / 10)) * 0.1;
    const mods = this.buildMods;
    return {
      ...conf,
      damage: conf.damage * this.powerMul * antonioMight * mods.damageMul,
      speed: conf.speed === undefined ? undefined : conf.speed * mods.projectileSpeedMul,
      radius: conf.radius === undefined ? undefined : conf.radius * mods.areaMul,
      lifetimeS: conf.lifetimeS === undefined ? undefined : conf.lifetimeS * mods.durationMul,
      pierce: conf.pierce === undefined ? undefined : this.withExtraPierce(conf.pierce),
      area: conf.area === undefined ? undefined : conf.area * mods.areaMul,
      orbitRadius: conf.orbitRadius === undefined
        ? undefined
        : conf.orbitRadius * mods.orbitDistanceMul,
    };
  }

  /** The +pierce rule (Needle Tips), in one place. A finite pierce always
   *  carries the build's bonus; an infinite one is already unbounded and stays
   *  untouched. Evolutions that replace a weapon's base pierce outright call
   *  this too, so stating a signature number never means opting out of the item
   *  that granted the evolution (#146). */
  private withExtraPierce(basePierce: number): number {
    return Number.isFinite(basePierce) ? basePierce + this.buildMods.extraPierce : basePierce;
  }

  private markMilestone(id: 'first5m' | 'fullBand' | 'firstEvolution'): void {
    if (this.milestones.has(id)) return;
    this.milestones.add(id);
    this.events.onMilestone?.(id);
  }

  private updateMinuteSystems(_dt: number): void {
    const minute = Math.floor(this.timeS / 60);
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      this.events.onMinute?.(minute);
      if (minute >= 5) this.markMilestone('first5m');
    }
  }

  private damagePlayer(amount: number, armorApplies: boolean): void {
    if (this.invincible || this.player.iframesT > 0) return;
    const landed = armorApplies ? Math.max(1, Math.ceil(amount - this.playerArmor)) : Math.max(1, Math.ceil(amount));
    this.player.hp = Math.max(0, this.player.hp - landed);
    this.player.iframesT = DAMAGE_FEEDBACK.iframesS;
    this.events.onHit();
    if (this.player.hp > 0) return;
    if (this.secondWindReady) {
      this.secondWindReady = false;
      this.player.hp = Math.max(1, Math.ceil(this.playerMaxHp * 0.30));
      this.player.iframesT = 2;
      this.spawnRing(this.player.x, this.player.y, 300, 0xffd875, 1);
      this.fx?.push({ type: 'pressure', x: this.player.x, y: this.player.y, color: 0xffd875, label: 'SECOND WIND' });
    } else {
      this.events.onDeath();
    }
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
    this.updateMinuteSystems(dt);
    this.updatePassiveRecovery(dt);
    this.movePlayer(dt);
    if (this.scripted) {
      this.runDirector(dt);
    }

    this.moveEnemies(dt);
    this.updateDummies(dt);
    this.recycleEnemies();
    this.hash.clear();
    for (const e of this.enemies) if (!e.dead) this.hash.insert(e);
    this.resolveEnemyCollisions();
    this.hash.clear();
    for (const e of this.enemies) if (!e.dead) this.hash.insert(e);
    this.tickWeapons('strikes', dt);
    this.updateClapPinches();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateShockwaves(dt);
    this.updateGravityWells(dt);
    this.updateStageMagnets(dt);
    this.updateGems(dt);
    this.updateMusicNotes(dt);
    this.updateChests();
    this.contactDamage(dt);

    this.reapEnemies();
  }

  // ---- player ----

  private updatePassiveRecovery(dt: number): void {
    const rate = this.buildMods.hpRegenPerSecond;
    if (rate <= 0 || this.player.hp <= 0 || this.player.hp >= this.playerMaxHp) return;
    this.player.hp = Math.min(this.playerMaxHp, this.player.hp + rate * dt);
  }

  private movePlayer(dt: number): void {
    const a = this.control();
    if (a.x > 0.001) this.player.facingX = 1;
    else if (a.x < -0.001) this.player.facingX = -1;
    // Persist the walk heading for directional weapons (hi-hat). Standing
    // still keeps the last heading rather than zeroing it.
    const mag = Math.hypot(a.x, a.y);
    if (mag > 0.001) {
      this.player.moveDirX = a.x / mag;
      this.player.moveDirY = a.y / mag;
    }
    const speed = RUN.playerSpeed * this.buildMods.moveMul;
    this.player.x += a.x * speed * dt;
    this.player.y += a.y * speed * dt;
    if (this.player.iframesT > 0) this.player.iframesT -= dt;
  }

  private contactDamage(dt: number): void {
    void dt;
    const p = this.player;
    const near = this.hash.query(p.x, p.y, p.radius + 48, this.queryBuf);
    let hitter: Enemy | null = null;
    for (const e of near) {
      if (e.dead || !circlesOverlap(p, e)) continue;
      // Dummies are furniture the player walks through: skipping here is what
      // keeps them from being shoved by the body AND from taking the `hitter`
      // slot (damagePlayer floors at 1, so `damage: 0` alone would still cost
      // a point of HP and a set of i-frames, and would mask a real enemy).
      if (e.dummy) continue;
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
    this.damagePlayer(hitter.damage, true);
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

    // Preserve the authored opening exactly, then hand off to the endlessly
    // rotating tour director at 8:00. No victory branch exists.
    if (this.timeS >= 480) {
      this.runEndlessDirector();
      return;
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
        if (spawned && event.atS > 0 && event.atS % 300 === 0) this.scaleEliteBoss(spawned);
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

  private runEndlessDirector(): void {
    const minute = Math.floor(this.timeS / 60);
    const recipe = waveRecipe(minute);
    const pattern = recipe.pattern;
    const minimum = recipe.minimum;
    const interval = recipe.intervalS;
    if (minute !== this.endlessMinute) {
      this.endlessMinute = minute;
      this.endlessNextSpawnT = this.timeS + interval;
      // Every minute arrives as a visible formation instead of a silent stat bump.
      this.spawnRingOf(pattern[0], Math.min(80, 20 + minute * 2));
      if (recipe.bossCount > 0) {
        for (let i = 0; i < recipe.bossCount; i++) {
          const before = this.enemies.length;
          this.spawnEnemy(i % 2 === 0 ? 'mantis' : 'glowingBat', undefined, 1, true);
          const boss = this.enemies.length > before ? this.enemies[this.enemies.length - 1] : null;
          if (boss) this.scaleEliteBoss(boss);
        }
      }
    }
    while (this.timeS + 1e-9 >= this.endlessNextSpawnT) {
      let alive = this.aliveCount();
      do {
        for (const kind of pattern) {
          if (alive >= ENEMIES.maxAlive) break;
          this.spawnEnemy(kind);
          alive += 1;
        }
      } while (alive < minimum && alive < ENEMIES.maxAlive);
      this.endlessNextSpawnT += interval;
    }
  }

  /** Promote an ordinary enemy into a gold-marked elite boss: the endless
   * director's periodic five-minute bosses. Elites persist as objectives and
   * drop a chest on death. */
  private scaleEliteBoss(enemy: Enemy): void {
    enemy.spawnClass = 'boss';
    const extraHp = endlessScale(enemy.spawnMinute).bossHpMul;
    enemy.hp *= extraHp;
    enemy.shieldHp *= extraHp;
    enemy.band = 3;
    enemy.color = 0xffcf5a;
    this.fx?.push({ type: 'pressure', x: enemy.x, y: enemy.y, color: 0xffcf5a, label: 'ELITE' });
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

  /** Sandbox helper: spawn a real scaled elite boss (it drops a chest on death). */
  spawnSandboxBoss(kind: EnemyKind = 'mantis'): Enemy | null {
    const enemy = this.spawnEnemyAt(kind, this.player.x + 320, this.player.y);
    if (enemy) this.scaleEliteBoss(enemy);
    return enemy;
  }

  /** Construct one enemy from a source sprite-feet position. The simulation
   * stores its exact circle center; old project-native kinds have zero offset.
   * Opening rows preserve their authored composition while the endless-run
   * minute scale applies immutable stats at spawn time. */
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
    const minute = Math.floor(this.timeS / 60);
    const scale = endlessScale(minute);
    const dummy = kind === 'dummy';
    // A measurement prop must look identical whenever it is spawned: no gold
    // amped outline, no band danger diamonds, no minute-scaled stats drift.
    const amped = !dummy && spawnClass === 'regular' && minute >= 12 &&
      this.rng() < scale.ampedChance;
    const scaledHp = stats.hp * scale.hpMul * (amped ? 2.2 : 1);
    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      x: x - body.footOffsetX,
      y: y - body.footOffsetY,
      radius: body.radius,
      footOffsetX: body.footOffsetX,
      footOffsetY: body.footOffsetY,
      hp: scaledHp,
      speed: stats.speed * scale.speedMul,
      damage: stats.damage * scale.damageMul * (amped ? 1.25 : 1),
      xp: stats.xp * scale.xpMul * (amped ? 3 : 1),
      color: stats.color,
      band: dummy ? 0 : conf.boss ? 3 : Math.min(3, Math.floor(minute / 5)),
      flashT: 0,
      dead: false,
      dashT: 0,
      dashX: 0,
      dashY: 0,
      dashing: false,
      slowT: 0,
      zoneSlowMul: 1,
      knockX: 0,
      knockY: 0,
      knockT: 0,
      lastMoveX: 0,
      lastMoveY: 0,
      shieldHp: kind === 'shielded' ? scaledHp * SHIELDED.shieldMul : 0,
      spin: kind === 'circler' ? (this.rng() < 0.5 ? 1 : -1) : 0,
      spawnClass,
      moveX,
      moveY,
      despawnAt,
      knockbackMul: stats.knockback,
      spawnMinute: minute,
      amped,
      prevX: x - body.footOffsetX,
      prevY: y - body.footOffsetY,
      dummy,
      readout: dummy
        ? {
            spawnHp: scaledHp,
            total: 0,
            aliveT: 0,
            buckets: new Array<number>(DUMMY_DPS_BUCKETS).fill(0),
            head: 0,
            bucketT: 0,
          }
        : null,
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
    const scale = WORLD_SCALE;
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
  }

  /** Reset every transient sandbox entity without touching the player, loadout,
   *  clock, level, or stage director. No delayed strike/pickup pointer survives. */
  clearSandboxEntities(): void {
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.gems.length = 0;
    this.musicNotes.length = 0;
    this.stageMagnets.length = 0;
    this.chests.length = 0;
    this.shockwaves.length = 0;
    this.gravityWells.length = 0;
    if (this.fx) this.fx.length = 0;
    for (const inst of this.weapons.values()) inst.reset();
    this.clapPinches.length = 0;
    this.overflowGem = null;
    this.overflowMusicNote = null;
    this.noteDropPity = 0;
    this.stageMagnetDropPity = 0;
    this.nextStageMagnetDropAt = 0;
    this.hash.clear();
    this.queryBuf.length = 0;
  }

  private moveEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.prevX = e.x;
      e.prevY = e.y;
      e.lastMoveX = 0;
      e.lastMoveY = 0;
      let speed = e.speed;
      if (e.slowT > 0) {
        e.slowT -= dt;
        speed *= e.zoneSlowMul;
      } else {
        e.zoneSlowMul = 1;
      }
      if (e.flashT > 0) e.flashT -= dt;
      // After the flash decay, never before it: the view tints on flashT, so
      // an early skip would leave a hit dummy permanently solid white.
      if (e.dummy) continue;

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
        // The separation is symmetric, so each side is skipped on its own: a
        // dummy can be either member of the pair.
        if (!e.dummy) {
          e.x += nx * push;
          e.y += ny * push;
        }
        if (!o.dummy) {
          o.x -= nx * push;
          o.y -= ny * push;
        }
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
    // The practice target absorbs everything, including killVisible's
    // Infinity: record the hit, refill, and leave before the death path so it
    // never drops a gem, a note, a magnet, an Encore Case, a death fx, an
    // upgrade roll, or a kill count.
    if (e.dummy && e.readout) {
      const landed = Number.isFinite(amount) ? amount : 0;
      e.readout.total += landed;
      e.readout.buckets[e.readout.head] += landed;
      if (source) this.damageByRole[source] = (this.damageByRole[source] ?? 0) + landed;
      e.hp = e.readout.spawnHp;
      e.flashT = 0.08;
      return;
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
      const elite = ENEMIES[e.kind].boss === true || e.kind === 'elite';
      this.fx?.push({
        type: 'death',
        x: e.x,
        y: e.y,
        radius: e.radius,
        color: e.color,
        elite,
      });
      this.spawnGem(e.x, e.y, e.xp);
      this.spawnMusicNoteForEnemy(e);
      this.spawnStageMagnetForEnemy(e);
      // Elite and boss enemies (Vampire-Survivors style) drop a chest on the
      // ground. Walk into it to open it: a ready weapon evolution, or health.
      if (elite) {
        this.spawnChestAt(e.x, e.y);
      }
      if (e.kind === 'splitter') this.spawnChildren(e);
    }
  }

  /** Advance every practice target's rolling DPS window. Rotating the ring
   *  buffer is what makes the readout fall back toward zero when the guns go
   *  quiet instead of freezing on its last value. */
  private updateDummies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.dummy || e.dead || !e.readout) continue;
      const r = e.readout;
      r.aliveT += dt;
      r.bucketT += dt;
      while (r.bucketT >= DUMMY_DPS_BUCKET) {
        r.bucketT -= DUMMY_DPS_BUCKET;
        r.head = (r.head + 1) % r.buckets.length;
        r.buckets[r.head] = 0;
      }
    }
  }

  /** Live damage per second over the trailing DUMMY_DPS_WINDOW. Divides by the
   *  time actually elapsed while the window is still filling, so a fresh dummy
   *  does not read artificially low. */
  dummyDps(e: Enemy): number {
    if (!e.readout) return 0;
    let sum = 0;
    for (const bucket of e.readout.buckets) sum += bucket;
    return sum / Math.max(DUMMY_DPS_BUCKET, Math.min(e.readout.aliveT, DUMMY_DPS_WINDOW));
  }

  /** Sandbox helper: drop every practice target without the collateral of
   *  CLEAR ALL (projectiles, zones, gems, notes, cases, the conductor). */
  clearDummies(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dummy) this.enemies.splice(i, 1);
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
    const playerFootX = p.x + PLAYER_FOOT_OFFSET.x;
    const playerFootY = p.y + PLAYER_FOOT_OFFSET.y;
    const far = this.spawnDist(9) * ENEMIES.recycleFactor;
    const far2 = far * far;
    for (const e of this.enemies) {
      if (e.dead) continue;
      // Dummies are placed deliberately: neither cull them nor teleport them,
      // or walking away from a measurement would silently delete the target.
      if (e.dummy) continue;
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

  /** Two Hands: a clap is two hands meeting, so each trigger picks the closest
   *  few enemies and snaps a slab pair shut on each of them. Target-picked and
   *  tiny on purpose — the base weapon's cone is short-ranged, and the roster
   *  already has three player-centred blasts (Subquake, Redline Stomp,
   *  Afterhours). The inward tug on the crush is the point: it bunches the
   *  horde for the rest of the band. */
  private fireTwoHands(conf: WeaponConf, color: number): void {
    const p = this.player;
    const damage = conf.damage * TWO_HANDS.damageMul;
    const targets = this.nearestEnemies(AIM_RANGE, TWO_HANDS.targets);
    if (targets.length === 0) {
      // Nothing in reach: still clap, just ahead of the player, so the beat
      // reads on screen and an empty field does not eat the trigger.
      const aim = this.aimDir(0);
      this.spawnPinch(p.x + aim.x * TWO_HANDS.openGap, p.y + aim.y * TWO_HANDS.openGap,
        Math.atan2(aim.y, aim.x), damage, color);
      return;
    }
    for (const target of targets) {
      this.spawnPinch(target.x, target.y, Math.atan2(target.y - p.y, target.x - p.x), damage, color);
    }
  }

  /** Queue one pincer centred on (x, y), its slabs standing off along `angle`. */
  private spawnPinch(x: number, y: number, angle: number, damage: number, color: number): void {
    const area = this.buildMods.areaMul;
    const pinch: ClapPinch = {
      x,
      y,
      angle,
      closesAt: this.timeS + TWO_HANDS.closeS,
      closeS: TWO_HANDS.closeS,
      gap: TWO_HANDS.openGap * area,
      radius: TWO_HANDS.pinchRadius * area,
      damage,
      color,
      midShown: false,
    };
    this.clapPinches.push(pinch);
    this.drawPinchHands(pinch, 1);
  }

  /** The two slabs, drawn as short bars broadside to the pinch axis at
   *  `t` of their standoff (1 = fully open, 0 = met). */
  private drawPinchHands(pinch: ClapPinch, t: number): void {
    if (!this.fx) return;
    const ax = Math.cos(pinch.angle);
    const ay = Math.sin(pinch.angle);
    const half = pinch.radius * 1.15;
    for (const side of [-1, 1] as const) {
      const cx = pinch.x + ax * pinch.gap * t * side;
      const cy = pinch.y + ay * pinch.gap * t * side;
      this.fx.push({
        type: 'beam',
        x: cx + ay * half,
        y: cy - ax * half,
        x2: cx - ay * half,
        y2: cy + ax * half,
        width: 5,
        color: pinch.color,
      });
    }
  }

  private updateClapPinches(): void {
    for (let i = this.clapPinches.length - 1; i >= 0; i--) {
      const pinch = this.clapPinches[i];
      if (pinch.closesAt > this.timeS) {
        if (!pinch.midShown && pinch.closesAt - this.timeS <= pinch.closeS * 0.5) {
          pinch.midShown = true;
          this.drawPinchHands(pinch, 0.45);
        }
        continue;
      }
      // The crush itself: no shove, because the whole move pulls inward.
      this.damageArea(pinch.x, pinch.y, pinch.radius, pinch.damage, 'clap', 0);
      this.dragInward(pinch.x, pinch.y, TWO_HANDS.tugRadius * this.buildMods.areaMul,
        TWO_HANDS.tug * this.buildMods.knockbackMul);
      this.fx?.push({ type: 'slam', x: pinch.x, y: pinch.y, radius: pinch.radius, color: pinch.color });
      this.fx?.push({ type: 'spark', x: pinch.x, y: pinch.y, color: pinch.color, n: 6, spread: pinch.radius * 0.7 });
      this.clapPinches.splice(i, 1);
    }
  }

  /** Drag every enemy within `radius` toward (x, y) by up to `dist`. Runs
   *  through shove() with the origin mirrored through the enemy, so knockback
   *  resistance and the Drop lift apply exactly as they do on a push. */
  private dragInward(x: number, y: number, radius: number, dist: number): void {
    if (dist <= 0) return;
    const near = this.hash.query(x, y, radius + 24, this.queryBuf);
    for (const e of near) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d > radius || d < 1) continue;
      this.shove(e, 2 * e.x - x, 2 * e.y - y, Math.min(dist, d));
    }
  }

  private spawnSubquake(conf: WeaponConf, color: number): void {
    const area = this.buildMods.areaMul;
    this.shockwaves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 40,
      maxRadius: 288 * area,
      age: 0,
      lifeS: 1.2,
      damage: conf.damage * 1.55,
      shove: 14 * this.buildMods.knockbackMul,
      color,
      source: 'bass',
      hit: new Set(),
    });
  }

  private updateShockwaves(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const wave = this.shockwaves[i];
      wave.age += dt;
      wave.lifeS -= dt;
      wave.radius = 40 + (wave.maxRadius - 40) * Math.min(1, wave.age / 1.2);
      for (const enemy of this.enemies) {
        if (enemy.dead || wave.hit.has(enemy)) continue;
        if (Math.hypot(enemy.x - wave.x, enemy.y - wave.y) <= wave.radius + enemy.radius) {
          wave.hit.add(enemy);
          this.damageEnemy(enemy, wave.damage, wave.source);
          this.shove(enemy, wave.x, wave.y, wave.shove);
        }
      }
      if (wave.lifeS <= 0) this.shockwaves.splice(i, 1);
    }
  }

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

  /** The `count` closest live enemies inside `range`, nearest first. For
   *  weapons that work on more than one picked target at a time. */
  private nearestEnemies(range: number, count: number): Enemy[] {
    const p = this.player;
    const maxD = range * range;
    const found: Array<{ e: Enemy; d: number }> = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < maxD) found.push({ e, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, count).map((f) => f.e);
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
    return { x: Math.cos(ang), y: Math.sin(ang) };
  }

  /** Aim once, then hand back one direction per shot this trigger owes. Double
   *  Take's extra shots alternate to either side of the aim line so the volley
   *  stays centred on the target instead of drifting off it. */
  private aimFan(spread: number): Array<{ x: number; y: number }> {
    return this.fanAround(this.aimDir(spread));
  }

  /** Spread this trigger's shots around an already-chosen direction. Split out
   *  of aimFan so the hat can fan around its walk heading without ever
   *  consulting nearestEnemy. */
  private fanAround(base: { x: number; y: number }): Array<{ x: number; y: number }> {
    const count = 1 + this.buildMods.extraProjectiles;
    if (count <= 1) return [base];
    const baseAngle = Math.atan2(base.y, base.x);
    const dirs: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i++) {
      // Offsets run 0, +step, -step, +2 step, -2 step, ...
      const ang = baseAngle + Math.ceil(i / 2) * (i % 2 === 1 ? 1 : -1) * MULTISHOT_FAN_RAD;
      dirs.push({ x: Math.cos(ang), y: Math.sin(ang) });
    }
    return dirs;
  }

  /** The player's walk heading as a unit vector. No targeting, no jitter: two
   *  triggers while holding one direction produce the exact same angle. */
  private moveDir(): { x: number; y: number } {
    return { x: this.player.moveDirX, y: this.player.moveDirY };
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
      maxPierce: conf.pierce ?? 1,
      lifeS: conf.lifetimeS!,
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
      bounces: this.buildMods.bounceCount,
      bounceRetention: this.buildMods.bounceRetention,
      evolved: this.evolved.has(role),
      turnRate: 10,
      orbitDir: 1,
      gravity: false,
      homingRange: Infinity,
    };
  }

  /** Every projectile enters the world here so the live-shot ceiling holds
   *  regardless of which weapon spawned it. */
  private pushProjectile(projectile: Projectile): void {
    if (this.projectiles.length >= RUN.maxProjectiles) {
      // Retire the oldest live shot rather than splicing it out. A Bell shatter
      // reaches here through spawnShards from inside updateProjectiles' downward
      // loop, so removing an element now would renumber every index below the
      // cursor; the normal lifeS <= 0 sweep collects it instead. Appending is
      // safe either way: new shots land above the cursor and wait a frame.
      for (const live of this.projectiles) {
        if (live.lifeS > 0) {
          live.lifeS = 0;
          break;
        }
      }
    }
    this.projectiles.push(projectile);
  }

  private spawnProjectile(
    role: Role,
    dir: { x: number; y: number },
    conf: WeaponConf,
    color: number,
  ): void {
    const pr = this.baseProjectile(role, conf, color, conf.damage);
    // Evolved hi-hat is a lane, not a ricochet: every chip rails straight
    // through the whole line it is fired down. Infinite pierce plus double
    // life is the reach; the stagger below makes the stream read continuous.
    const laneHat = role === 'hat' && pr.evolved;
    if (laneHat) {
      pr.damage *= 1.30;
      pr.speed *= HAT_LANE.speedMul;
      pr.maxPierce = Infinity;
      pr.pierce = Infinity;
      pr.lifeS *= HAT_LANE.lifetimeMul;
    }
    if (role === 'lead' && pr.evolved) {
      pr.damage *= 1.40;
      // The serpent threads a line of bodies: its own base pierce replaces
      // lead's tier value, and the build's +pierce stacks on top of that floor
      // exactly as it would for any other finite pierce.
      pr.maxPierce = this.withExtraPierce(LEAD_SERPENT.basePierce);
      pr.pierce = pr.maxPierce;
      pr.turnRate = 14;
      // The evolved seeker snaps to what is close instead of crossing the
      // screen. Was a `pr.role !== 'lead'` test inside the shared loop.
      pr.homingRange = 320;
      if ((this.triggerCounts.lead ?? 0) % 5 === 0) {
        pr.damage *= 2;
        pr.radius = Math.max(12, pr.radius * 1.7);
      }
    }
    // pr.speed above already carries the lane multiplier, so deriving the
    // velocity from it keeps the `speed` field equal to |v| — the bounce path
    // and the hi-hat lane stagger both read that field.
    pr.vx = dir.x * pr.speed;
    pr.vy = dir.y * pr.speed;
    if (laneHat) {
      // Stagger successive chips forward along the lane so a 16th-note wall
      // draws as one continuous rail instead of a clump at the player.
      const step = HAT_LANE.stagger[(this.triggerCounts.hat ?? 0) % HAT_LANE.stagger.length];
      pr.x += dir.x * step;
      pr.y += dir.y * step;
    }
    this.pushProjectile(pr);
  }

  /** Bell: a note lobbed straight that shatters into shards on its first hit.
   *  The shatter count (per tier) rides on the shot; the shard spawn happens in
   *  updateProjectiles when it lands its first hit. */
  private spawnBell(
    dir: { x: number; y: number },
    conf: WeaponConf,
    color: number,
  ): void {
    const tier = this.tiers.get('bell') ?? 1;
    const pr = this.baseProjectile('bell', conf, color, conf.damage);
    pr.vx = dir.x * conf.speed!;
    pr.vy = dir.y * conf.speed!;
    pr.shatter = BELL.shards[tier - 1] ?? BELL.shards[0];
    if (pr.evolved) {
      pr.damage *= 1.35;
      pr.gravity = true;
      pr.shatter = 10;
    }
    this.pushProjectile(pr);
  }


  /** Bell's shatter: fling a radial burst of small shard shots from (x,y). Each
   *  shard is a bell projectile flagged so it can never itself re-shatter. */
  private spawnShards(
    x: number,
    y: number,
    count: number,
    damage: number,
    color: number,
    gravity = false,
  ): void {
    const base = this.rng() * Math.PI * 2;
    const mods = this.buildMods;
    const shardRadius = BELL.shardRadius * mods.areaMul;
    const shardLifeS = BELL.shardLifeS * mods.durationMul;
    const shardPierce = BELL.shardPierce + mods.extraPierce;
    const shardSpeed = BELL.shardSpeed * mods.projectileSpeedMul;
    for (let i = 0; i < count; i++) {
      const activeShards = this.projectiles.filter((projectile) => projectile.role === 'bell' && projectile.shard);
      if (activeShards.length >= 36) {
        const oldest = activeShards[0];
        oldest.damage = Math.min(oldest.damage * 1.08, damage * 3);
        oldest.lifeS = Math.max(oldest.lifeS, shardLifeS);
        continue;
      }
      const a = base + (i / count) * Math.PI * 2;
      const pr = this.baseProjectile(
        'bell',
        { damage, radius: shardRadius, lifetimeS: shardLifeS, pierce: shardPierce },
        color,
        damage,
      );
      pr.damage = damage;
      pr.x = x;
      pr.y = y;
      pr.speed = shardSpeed;
      pr.vx = Math.cos(a) * shardSpeed;
      pr.vy = Math.sin(a) * shardSpeed;
      pr.shard = true;
      if (gravity) {
        pr.homing = true;
        pr.turnRate = 4;
        pr.bounces = Math.max(1, pr.bounces);
        pr.shatter = 0;
      }
      this.pushProjectile(pr);
    }
  }

  private updateGravityWells(dt: number): void {
    for (let i = this.gravityWells.length - 1; i >= 0; i--) {
      const well = this.gravityWells[i];
      well.lifeS -= dt;
      well.burstT -= dt;
      for (const enemy of this.enemies) {
        if (enemy.dead) continue;
        if (enemy.dummy) continue;
        const dx = well.x - enemy.x;
        const dy = well.y - enemy.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= well.radius && distance > 1) {
          const pull = Math.min(distance, well.pullSpeed * dt);
          enemy.x += (dx / distance) * pull;
          enemy.y += (dy / distance) * pull;
        }
      }
      if (!well.burst && well.burstT <= 0) {
        well.burst = true;
        this.spawnShards(well.x, well.y, 10, well.burstDamage, well.color, true);
        this.fx?.push({ type: 'spark', x: well.x, y: well.y, color: well.color, n: 10, spread: 24 });
      }
      if (well.lifeS <= 0) this.gravityWells.splice(i, 1);
    }
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

  /** The SHARED projectile loop. It owns travel, arena rails, the hit pass and
   *  the pierce rule for EVERY weapon, and — since #140 — it contains no
   *  per-weapon branch at all. Weapon-specific motion belongs to the owning
   *  weapon module, which lends it back through ProjectileBehavior; anything
   *  else a shot needs is a FIELD ON THE SHOT, set by whatever spawned it.
   *  Adding a `pr.role === '...'` here is the thing this loop exists not to do. */
  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const step = dt;
      const travelStep = step;
      pr.age += step;
      pr.lifeS -= step;

      // A module that steers its own shots positions them itself, which skips
      // shared travel AND the arena rails together (the arp's two ADR-0002
      // exemptions). No module, or a module that only nudged velocity: shared
      // motion runs, exactly as it always has.
      const behavior = this.projectileBehavior(pr.role);
      const steered = behavior?.steer?.(this.weaponCtx.get(pr.role)!, pr, step) ?? false;
      if (!steered) {
        if (pr.homing) {
          let best: Enemy | null = null;
          let bestD = Infinity;
          for (const e of this.enemies) {
            if (e.dead || pr.hit.has(e)) continue;
            const dx = e.x - pr.x;
            const dy = e.y - pr.y;
            const d = dx * dx + dy * dy;
            if (d < bestD && d <= pr.homingRange * pr.homingRange) {
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
            const turn = Math.max(-pr.turnRate * step, Math.min(pr.turnRate * step, diff));
            const next = cur + turn;
            pr.vx = Math.cos(next) * pr.speed;
            pr.vy = Math.sin(next) * pr.speed;
          }
        }
        pr.x += pr.vx * travelStep;
        pr.y += pr.vy * travelStep;
        this.reflectProjectileFromArena(pr);
      }

      const near = this.hash.query(pr.x, pr.y, pr.radius + 24, this.queryBuf);
      for (const e of near) {
        if (e.dead || pr.hit.has(e) || !circlesOverlap(pr, e)) continue;
        pr.hit.add(e);
        this.damageEnemy(e, pr.damage, pr.role);
        // Shove (sim, deterministic) for the projectile weapons that have not
        // migrated yet. Writes only the shared knock channel. A migrated weapon
        // does this from its own ProjectileBehavior.onHit instead.
        const sh = (WEAPON_SHOVE[pr.role] ?? 0) * this.buildMods.knockbackMul;
        if (sh) this.shove(e, pr.x, pr.y, sh);
        // The note shatters into a radial burst of shards on its first hit.
        // shatter is 0 on every shot but a bell note, and 0 on a shard, so
        // shards never re-shatter and no role compare is needed to say so.
        if (pr.shatter > 0) {
          if (pr.gravity) {
            this.gravityWells.push({
              x: pr.x, y: pr.y, radius: 130 * this.buildMods.areaMul, lifeS: 1.1, pullSpeed: 140,
              color: pr.color, burstT: 0.35, burstDamage: pr.damage * 0.65, burst: false,
            });
          } else {
            this.spawnShards(pr.x, pr.y, pr.shatter, pr.damage * BELL.shardDamageMul, pr.color);
          }
          this.fx?.push({ type: 'spark', x: e.x, y: e.y, color: pr.color, n: 6, spread: 14 });
          pr.shatter = 0;
        }
        // Per-hit spark (view-only, bounded to low-count roles).
        if (SPARK_HIT_ROLES.has(pr.role) && !pr.shard)
          this.fx?.push({ type: 'spark', x: e.x, y: e.y, color: pr.color, n: 4, spread: 12 });
        // The shared pierce rule, and the one hook that can decline it. A
        // module returning false chips on a timer instead (ADR-0002); no hook
        // means spend, which is what every unmigrated role does today.
        const spendsPierce = behavior?.onHit?.(this.weaponCtx.get(pr.role)!, pr, e) ?? true;
        if (!spendsPierce) continue;
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

  /** Arena rails. Only ever reached from the shared-travel path, so a shot a
   *  module steered itself never gets here — which is how the arp's rail
   *  exemption survives without naming the arp. */
  private reflectProjectileFromArena(projectile: Projectile): void {
    if (projectile.bounces <= 0) return;
    const minX = this.player.x - this.worldW * 0.52;
    const maxX = this.player.x + this.worldW * 0.52;
    const minY = this.player.y - this.worldH * 0.52;
    const maxY = this.player.y + this.worldH * 0.52;
    let bounced = false;
    if (projectile.x < minX || projectile.x > maxX) {
      projectile.vx *= -1;
      projectile.x = Math.max(minX, Math.min(maxX, projectile.x));
      bounced = true;
    }
    if (projectile.y < minY || projectile.y > maxY) {
      projectile.vy *= -1;
      projectile.y = Math.max(minY, Math.min(maxY, projectile.y));
      bounced = true;
    }
    if (!bounced) return;
    projectile.bounces -= 1;
    projectile.damage *= projectile.bounceRetention;
  }

  private spawnZone(
    x: number,
    y: number,
    conf: { damage: number; radius?: number; lifetimeS?: number },
    color: number,
    source: Role,
    evolved = false,
  ): void {
    const radius = conf.radius! * (evolved ? 1.55 : 1);
    const life = conf.lifetimeS! * (evolved ? 1.35 : 1);
    const damage = conf.damage * (evolved ? 1.25 : 1);
    this.zones.push({
      x,
      y,
      radius,
      damage,
      lifeS: life,
      tickT: 0,
      color,
      source,
      slow: true,
      evolved,
      driftSpeed: evolved ? 65 : 0,
      damageCap: damage * 3,
      slowMul: evolved ? 0.42 : ZONE_SLOW_MUL,
    });
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.lifeS -= dt;

      if (z.evolved) {
        let target: Enemy | null = null;
        let bestNeighbors = -1;
        for (let sample = 0; sample < this.enemies.length; sample += Math.max(1, Math.floor(this.enemies.length / 30))) {
          const enemy = this.enemies[sample];
          if (enemy.dead) continue;
          let neighbors = 0;
          for (const other of this.enemies) {
            if (!other.dead && Math.hypot(other.x - enemy.x, other.y - enemy.y) < 120) neighbors += 1;
          }
          if (neighbors > bestNeighbors) {
            bestNeighbors = neighbors;
            target = enemy;
          }
        }
        if (target) {
          const dx = target.x - z.x;
          const dy = target.y - z.y;
          const distance = Math.hypot(dx, dy) || 1;
          const travel = Math.min(distance, z.driftSpeed * dt);
          z.x += (dx / distance) * travel;
          z.y += (dy / distance) * travel;
        }
      }

      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = ZONE_TICK_S;
        this.damageArea(z.x, z.y, z.radius, z.damage, z.source);
        // The zone's other half: everything inside wades, it doesn't walk.
        if (z.slow) {
          const inside = this.hash.query(z.x, z.y, z.radius + 24, this.queryBuf);
          for (const e of inside) {
            if (!e.dead && circlesOverlap(z, e)) {
              e.slowT = ZONE_TICK_S + 0.15;
              e.zoneSlowMul = Math.min(e.zoneSlowMul, z.slowMul);
            }
          }
        }
      }
      if (z.lifeS <= 0) {
        this.zones.splice(i, 1);
      }
    }
    // Afterhours zones merge pairwise with strict caps; this runs after ticks
    // so each original zone can land its current scheduled tick at most once.
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const a = this.zones[i];
      if (!a.evolved) continue;
      for (let j = i - 1; j >= 0; j--) {
        const b = this.zones[j];
        if (!b.evolved || !circlesOverlap(a, b)) continue;
        const totalArea = a.radius * a.radius + b.radius * b.radius;
        const weight = Math.max(1, totalArea);
        a.x = (a.x * a.radius * a.radius + b.x * b.radius * b.radius) / weight;
        a.y = (a.y * a.radius * a.radius + b.y * b.radius * b.radius) / weight;
        a.radius = Math.min(180, Math.sqrt(totalArea));
        a.lifeS = Math.min(4.5, Math.max(a.lifeS, b.lifeS) + Math.min(a.lifeS, b.lifeS) * 0.25);
        a.damage = Math.min(a.damageCap, a.damage + b.damage * 0.5);
        this.zones.splice(j, 1);
        i -= 1;
        break;
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
  ): number {
    const near = this.hash.query(x, y, radius + 24, this.queryBuf);
    const area = { x, y, radius };
    let hits = 0;
    for (const e of near) {
      if (!e.dead && circlesOverlap(area, e)) {
        this.damageEnemy(e, damage, source);
        if (shove) this.shove(e, x, y, shove);
        hits += 1;
      }
    }
    return hits;
  }

  // ---- pickups and juice ----

  private spawnGem(x: number, y: number, xp: number): void {
    // The published legacy implementation randomizes the listed XP value.
    // Current Unity internals are unpublished, so this is the version-pinned
    // observable reference used by our parity model.
    const dropped = Math.floor((this.rng() + 0.5) * xp);
    if (dropped <= 0) return;
    this.spawnGemAt(x, y, dropped);
  }

  /** Public for the Sandbox pickup field. Enemy rewards still pass through
   * spawnGem(), which preserves their authored random XP roll. */
  spawnGemAt(x: number, y: number, xp = 1): void {
    const dropped = Math.max(1, Math.floor(xp));
    const tier: Gem['tier'] = dropped <= 2 ? 'blue' : dropped <= 9 ? 'green' : 'red';
    if (this.gems.length < RUN.maxGems) {
      this.gems.push({ x, y, xp: dropped, tier });
      return;
    }
    if (!this.overflowGem || !this.gems.includes(this.overflowGem) || this.overflowGem.vacuumed) {
      let farthest: Gem | null = null;
      let farthestD = -1;
      for (const gem of this.gems) {
        // A Stage Magnet is a point-in-time snapshot. Never merge a later
        // reward into an object already travelling in that snapshot.
        if (gem.vacuumed) continue;
        const dx = gem.x - this.player.x;
        const dy = gem.y - this.player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > farthestD) {
          farthestD = d2;
          farthest = gem;
        }
      }
      if (!farthest) {
        // All capped gems are already inbound. One temporary overflow object
        // keeps later rewards independent; subsequent drops merge into it.
        farthest = { x, y, xp: 0, tier: 'red' };
        this.gems.push(farthest);
      }
      this.overflowGem = farthest;
      farthest.tier = 'red';
    }
    this.overflowGem.xp += dropped;
    this.overflowGem.tier = 'red';
  }

  private spawnStageMagnetForEnemy(enemy: Enemy): void {
    if (this.stageMagnets.length > 0 || this.timeS < this.nextStageMagnetDropAt) return;
    this.stageMagnetDropPity += 1;
    const guaranteed = this.stageMagnetDropPity >= STAGE_MAGNET.pityKills;
    if (!guaranteed && this.stageMagnetRng() >= STAGE_MAGNET.dropChance) return;
    this.stageMagnetDropPity = 0;
    this.nextStageMagnetDropAt = this.timeS + STAGE_MAGNET.dropCooldownS;
    this.spawnStageMagnetAt(
      enemy.x - enemy.radius * 0.24,
      enemy.y - enemy.radius * 0.32,
    );
  }

  /** Public Sandbox fixture; normal runs receive Stage Magnets only from
   * enemy deaths. Only one may wait on the floor at a time. */
  spawnStageMagnetAt(x: number, y: number): StageMagnetPickup {
    const existing = this.stageMagnets[0];
    if (existing) return existing;
    const magnet = { x, y, lifeS: STAGE_MAGNET.lifetimeS };
    this.stageMagnets.push(magnet);
    this.fx?.push({ type: 'spark', x, y, color: 0xa06bff, n: 8, spread: 22 });
    return magnet;
  }

  /** The single construction site for a chest: elite and boss deaths route
   * here, and the Sandbox drops one on demand. A chest carries no reward of
   * its own — contents are decided when the player walks into it. */
  spawnChestAt(x: number, y: number): Chest {
    const chest: Chest = { x, y, color: 0xffd45c };
    this.chests.push(chest);
    this.fx?.push({ type: 'evolution', x, y, color: chest.color, label: 'CHEST' });
    return chest;
  }

  private spawnMusicNoteForEnemy(enemy: Enemy): void {
    this.noteDropPity += 1;
    const boss = ENEMIES[enemy.kind].boss === true || enemy.spawnClass === 'boss';
    const chance = Math.min(0.3, 0.08 + Math.sqrt(Math.max(1, enemy.xp)) * 0.035);
    const guaranteed = boss || enemy.amped || this.noteDropPity >= 7;
    if (!guaranteed && this.rng() >= chance) return;
    this.noteDropPity = 0;
    const value = boss
      ? 10
      : enemy.amped || enemy.xp >= 10
        ? 3
        : enemy.xp >= 3
          ? 2
          : 1;
    this.spawnMusicNoteAt(enemy.x + enemy.radius * 0.28, enemy.y - enemy.radius * 0.18, value);
  }

  /** Public for the sandbox's currency shower; normal runs use enemy drops. */
  spawnMusicNoteAt(x: number, y: number, value = 1): void {
    const amount = Math.max(1, Math.floor(value));
    const tier: MusicNotePickup['tier'] = amount >= 10 ? 'anthem' : amount >= 3 ? 'phrase' : 'note';
    if (this.musicNotes.length < RUN.maxMusicNotes) {
      this.musicNotes.push({ x, y, value: amount, tier });
      return;
    }
    if (!this.overflowMusicNote || !this.musicNotes.includes(this.overflowMusicNote) || this.overflowMusicNote.vacuumed) {
      let farthest: MusicNotePickup | null = null;
      let farthestD = -1;
      for (const note of this.musicNotes) {
        if (note.vacuumed) continue;
        const dx = note.x - this.player.x;
        const dy = note.y - this.player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > farthestD) {
          farthestD = d2;
          farthest = note;
        }
      }
      if (!farthest) {
        farthest = { x, y, value: 0, tier: 'anthem' };
        this.musicNotes.push(farthest);
      }
      this.overflowMusicNote = farthest;
    }
    this.overflowMusicNote.value += amount;
    this.overflowMusicNote.tier = 'anthem';
  }

  /** Snapshot the current camera rectangle and attract every freely
   * collectable drop inside it. Decision-bearing rewards intentionally stay
   * walk-to-choose: level-up pedestals and chests. */
  vacuumVisiblePickups(): VacuumResult {
    const cameraX = this.player.x + PLAYER_FOOT_OFFSET.x;
    const cameraY = this.player.y + PLAYER_FOOT_OFFSET.y;
    const halfW = this.worldW / 2;
    const halfH = this.worldH / 2;
    const visible = (x: number, y: number): boolean =>
      Math.abs(x - cameraX) <= halfW && Math.abs(y - cameraY) <= halfH;
    let gems = 0;
    let notes = 0;
    for (const gem of this.gems) {
      if (!gem.vacuumed && visible(gem.x, gem.y)) {
        gem.vacuumed = true;
        gems += 1;
      }
    }
    for (const note of this.musicNotes) {
      if (!note.vacuumed && visible(note.x, note.y)) {
        note.vacuumed = true;
        notes += 1;
      }
    }
    const result = { gems, notes };
    const radius = Math.hypot(this.worldW, this.worldH) * 0.55;
    this.fx?.push({ type: 'vacuum', x: cameraX, y: cameraY, radius });
    this.fx?.push({ type: 'pressure', x: this.player.x, y: this.player.y, color: 0xa06bff, label: 'STAGE MAGNET' });
    this.events.onStageMagnet?.(result);
    return result;
  }

  private updateStageMagnets(dt: number): void {
    for (let i = this.stageMagnets.length - 1; i >= 0; i--) {
      const magnet = this.stageMagnets[i];
      magnet.lifeS -= dt;
      if (magnet.lifeS <= 0) {
        this.stageMagnets.splice(i, 1);
        this.fx?.push({ type: 'spark', x: magnet.x, y: magnet.y, color: 0xa06bff, n: 4, spread: 14 });
        continue;
      }
      const dx = this.player.x - magnet.x;
      const dy = this.player.y - magnet.y;
      if (dx * dx + dy * dy > STAGE_MAGNET.pickupRadius * STAGE_MAGNET.pickupRadius) continue;
      this.stageMagnets.splice(i, 1);
      this.vacuumVisiblePickups();
    }
  }

  private updateGems(dt: number): void {
    const p = this.player;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (g.vacuumed || d < RUN.magnetRadius * this.buildMods.magnetMul) {
        const speed = g.vacuumed ? STAGE_MAGNET.vacuumSpeed : RUN.gemPullSpeed * this.buildMods.pullMul;
        const pull = Math.min(d, speed * dt);
        g.x += (dx / (d || 1)) * pull;
        g.y += (dy / (d || 1)) * pull;
      }
      const remaining = g.vacuumed ? Math.max(0, d - STAGE_MAGNET.vacuumSpeed * dt) : d;
      if (remaining < RUN.pickupRadius) {
        this.xp += g.xp * xpPickupMultiplier(this.level);
        this.gems.splice(i, 1);
        if (g === this.overflowGem) this.overflowGem = null;
        this.checkLevel();
      }
    }
  }

  private updateMusicNotes(dt: number): void {
    const p = this.player;
    for (let i = this.musicNotes.length - 1; i >= 0; i--) {
      const note = this.musicNotes[i];
      const dx = p.x - note.x;
      const dy = p.y - note.y;
      const d = Math.hypot(dx, dy);
      if (note.vacuumed || d < RUN.magnetRadius * this.buildMods.magnetMul * 1.15) {
        const speed = note.vacuumed
          ? STAGE_MAGNET.vacuumSpeed
          : RUN.gemPullSpeed * this.buildMods.pullMul * 1.15;
        const pull = Math.min(d, speed * dt);
        note.x += (dx / (d || 1)) * pull;
        note.y += (dy / (d || 1)) * pull;
      }
      const remaining = note.vacuumed ? Math.max(0, d - STAGE_MAGNET.vacuumSpeed * dt) : d;
      if (remaining < RUN.pickupRadius + 4) {
        this.notesCollected += note.value;
        this.events.onNoteCollected?.(note.value, this.notesCollected);
        this.fx?.push({ type: 'spark', x: note.x, y: note.y, color: 0xffd45c, n: 4, spread: 12 });
        this.musicNotes.splice(i, 1);
        if (note === this.overflowMusicNote) this.overflowMusicNote = null;
      }
    }
  }

  private updateChests(): void {
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const chest = this.chests[i];
      if (Math.hypot(chest.x - this.player.x, chest.y - this.player.y) > 42) continue;
      this.chests.splice(i, 1);
      this.chestsOpened += 1;
      this.events.onChest?.(chest);
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
