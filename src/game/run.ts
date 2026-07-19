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
  DAMAGE_FEEDBACK,
  DARTER,
  ENEMIES,
  MAD_FOREST_FRAMES,
  MAX_ALIVE_HARD,
  ORBIT_REHIT_S,
  RUN,
  STAGE_MAGNET,
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
import { mulberry32, type Rng } from './rng';
import { SpatialHash, circlesOverlap } from './spatial';
import {
  deriveBuildMods,
  eligibleEvolutions,
  paddedJacketHeal,
  type BuildMods,
  type EvolutionDefinition,
  type ItemId,
} from './items';
import {
  PRESSURE_BREAK_CONFIG,
  endlessScale,
  gateOptions,
  isVenueId,
  waveRecipe,
  type VenueId,
} from './tour';

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

interface Point { x: number; y: number }

function pointLineDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function simplifyPath(points: Point[], tolerance: number, maxSegments: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let furthest = -1;
    let distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = pointLineDistance(points[i], points[first], points[last]);
      if (d > distance) {
        distance = d;
        furthest = i;
      }
    }
    if (furthest >= 0) {
      keep[furthest] = 1;
      stack.push([first, furthest], [furthest, last]);
    }
  }
  let out = points.filter((_, i) => keep[i] === 1);
  while (out.length - 1 > maxSegments) {
    const reduced: Point[] = [out[0]];
    for (let i = 2; i < out.length - 1; i += 2) reduced.push(out[i]);
    reduced.push(out[out.length - 1]);
    out = reduced;
  }
  return out;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0));
}

function pathCrossesItself(points: Point[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (let j = i + 2; j < points.length - 1; j++) {
      if (i === 0 && j === points.length - 2) continue;
      if (segmentsCross(points[i], points[i + 1], points[j], points[j + 1])) return true;
    }
  }
  return false;
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

function reflectAcrossSegment(vx: number, vy: number, a: Point, b: Point): { x: number; y: number } {
  const sx = b.x - a.x;
  const sy = b.y - a.y;
  const length = Math.hypot(sx, sy) || 1;
  const nx = -sy / length;
  const ny = sx / length;
  const dot = vx * nx + vy * ny;
  return { x: vx - 2 * dot * nx, y: vy - 2 * dot * ny };
}

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
  railSlowT: number;
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
  /** Project-native chest substitute chance assigned by the stage row. */
  upgradeChance: number;
  /** Endless-run spawn identity. Stats never change after this minute. */
  spawnMinute: number;
  /** Gold-outline ordinary enemy with extra health/power/XP. */
  amped: boolean;
  /** Five-minute boss that drops an Encore Case. */
  headliner: boolean;
  /** Neon Loop crossing cooldown. */
  railCooldownT: number;
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
  bounces: number;
  bounceRetention: number;
  railReflections: number;
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

interface PendingPulse {
  atS: number;
  x: number;
  y: number;
  radius: number;
  damage: number;
  shove: number;
  color: number;
  source: Role;
}

export interface EncoreCase {
  x: number;
  y: number;
  minute: number;
  color: number;
}

export interface NeonRail {
  points: Array<{ x: number; y: number }>;
  phase: 'recording' | 'preview' | 'solid';
  lifeS: number;
  crossedItself: boolean;
}

export interface VenueGate {
  venue: VenueId;
  x: number;
  y: number;
  side: -1 | 1;
  selected: boolean;
  benefit: string;
  danger: string;
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
  onEncoreCase?(encore: EncoreCase): void;
  onPressureArmed?(): void;
  onPressureBreak?(active: boolean): void;
  onNoteCollected?(value: number, runTotal: number): void;
  onStageMagnet?(result: VacuumResult): void;
  onVenueChanged?(venue: string): void;
  onMilestone?(id: 'first5m' | 'fullBand' | 'firstEvolution' | 'hitlessHeadliner' | 'loopCross' | 'pressureBreak'): void;
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
  unlockedVenues?: readonly string[];
  secondWind?: boolean;
  /** Headliner Gold shop reward. Cosmetic only; it never changes combat stats. */
  headlinerGold?: boolean;
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
  headlinersKilled = 0;
  /** Shop currency physically collected during this run. */
  notesCollected = 0;
  readonly milestones = new Set<'first5m' | 'fullBand' | 'firstEvolution' | 'hitlessHeadliner' | 'loopCross' | 'pressureBreak'>();
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
  readonly encoreCases: EncoreCase[] = [];
  private readonly pendingPulses: PendingPulse[] = [];

  /** Surprise-system state is public and renderer-readable. */
  venue: VenueId = 'alley';
  venueChapter = 0;
  venueGates: VenueGate[] = [];
  venueTransitionT = 0;
  neonRail: NeonRail | null = null;
  pressureHeat = 0;
  pressureState: 'charging' | 'armed' | 'drop' | 'cooldown' = 'charging';
  /** One-based bar inside the active four-bar Drop; zero outside it. */
  pressureDropBar = 0;
  pressureCooldownT = 0;
  trainLane: { y: number; warningT: number; activeT: number } | null = null;
  secondWindReady = false;
  readonly headlinerGold: boolean;
  readonly venuesVisited = new Set<VenueId>(['alley']);

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
  private lastRecordedRailMinute = -1;
  private railSamples: Array<{ x: number; y: number }> = [];
  private railSampleT = 0;
  private headlinerHitTaken = false;
  private clapHealMinute = -1;
  private clapHealThisMinute = 0;
  private triggerCounts: Partial<Record<Role, number>> = {};
  private encoreDamageBonus = 0;
  private encoreMoveBonus = 0;
  private encoreAreaBonus = 0;
  private unlockedVenues: readonly VenueId[];
  private tourSeed = 0;
  private lastGateChapter = -1;
  private pendingVenue: VenueId | null = null;
  /** Invalidates one queued phrase conductor without touching other musical
   * actions. Primarily used by the Sandbox's manual Drop controls. */
  private pressureConductorToken = 0;
  private lastVenueTransitionChapter = 0;
  private dawnHealT = 0;
  private lastTrainCycle = -1;
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
    this.tourSeed = Math.floor(this.rng() * 0x7fffffff);
    this.stageMagnetRng = opts.stageMagnetRng ?? mulberry32(this.tourSeed ^ 0x4d41474e);
    this.control = opts.control ?? (() => ({ x: 0, y: 0 }));
    this.fx = (opts.fx ?? true) ? [] : null;
    const validVenues = (opts.unlockedVenues ?? []).filter(isVenueId);
    this.unlockedVenues = validVenues.length ? validVenues : ['alley', 'warehouse', 'rooftop'];
    if (opts.startingItem) this.items.set(opts.startingItem, 1);
    this.secondWindReady = opts.secondWind ?? false;
    this.headlinerGold = opts.headlinerGold ?? false;
  }

  get enemyCount(): number {
    return this.enemies.length;
  }

  get projectileCount(): number {
    return this.projectiles.length;
  }

  get buildMods(): BuildMods {
    const mods = deriveBuildMods(this.items);
    const drop = this.pressureState === 'drop';
    return {
      ...mods,
      damageMul: mods.damageMul * (1 + this.encoreDamageBonus),
      moveMul: mods.moveMul * (1 + this.encoreMoveBonus) *
        (drop ? PRESSURE_BREAK_CONFIG.dropMoveMul : 1),
      areaMul: mods.areaMul * (1 + this.encoreAreaBonus) *
        (drop ? PRESSURE_BREAK_CONFIG.dropAreaMul : 1),
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
    const next = Math.max(previous, Math.min(5, level));
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
    const next = Math.max(0, Math.min(5, Math.floor(level)));
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
   *  owned tier. Variant peaks (chord pad) scale the same weapon. */
  fireTrigger(t: ScheduledTrigger): void {
    const tier = this.tiers.get(t.role);
    if (!tier) return;
    // WEAPONS is keyed on the supported catalog; a trigger only ever fires for
    // an owned (hence supported) role, so the entry is always present.
    let conf: WeaponConf = WEAPONS[t.role]![tier - 1];
    const color = KIT_COLORS[t.role];
    const v = t.velocity;
    const p = this.player;

    if (t.role === 'chord' && t.variant === 'pad') {
      const fx = VARIANT_EFFECTS.chordPad;
      conf = {
        ...conf,
        radius: conf.radius! * fx.radiusMul,
        lifetimeS: conf.lifetimeS! * fx.lifetimeMul,
        damage: conf.damage * fx.damageMul,
      };
    }
    // Single build-transform pipeline (D1): tempo compensation, folded in one
    // place — balance code multiplies here.
    conf = this.applyBuild(t.role, conf);
    this.triggerCounts[t.role] = (this.triggerCounts[t.role] ?? 0) + 1;
    const evolved = this.evolved.has(t.role);

    switch (t.role) {
      case 'kick': {
        if (evolved) {
          this.fireRedlineStomp(conf, color);
          break;
        }
        // Whip geometry and damage, while retaining Model A's audible Kick on
        // every gameplay trigger. A per-enemy 1.35 s lock below preserves the
        // reference weapon's target cadence despite the 122 BPM beat grid.
        const side = p.facingX;
        this.pendingKick.push({
          atS: this.timeS,
          x: p.x,
          y: p.y,
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
        break;
      }
      case 'chord': {
        // Thrown at the nearest enemy, not dropped underfoot: the zone has
        // to land where the horde actually is to be worth a pick.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        // Loud chords stamp a bigger zone (velocity → size).
        const zc = { ...conf, radius: conf.radius! * (0.85 + 0.3 * v) };
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, zc, color, 'chord', evolved);
        break;
      }
      case 'clap': {
        if (evolved) {
          this.fireStandingOvation(conf, color, v);
          break;
        }
        // Whip: a wide forward slash in the aim direction, hitting a cone.
        const aim = this.aimDir(0);
        const ang = Math.atan2(aim.y, aim.x);
        const reach = conf.radius! * (0.9 + 0.2 * v);
        this.damageCone(p.x, p.y, ang, conf.arc!, reach, conf.damage * (0.85 + 0.3 * v), 'clap', WEAPON_SHOVE.clap);
        this.fx?.push({ type: 'arc', x: p.x, y: p.y, angle: ang, arc: conf.arc!, radius: reach, color });
        break;
      }
      case 'bell': {
        // A note lobbed straight that shatters into shards on its first hit.
        this.spawnBell(this.aimDir(0.1), conf, color, v);
        break;
      }
      case 'arp': {
        // King Bible: an orbiter per note, circling the player.
        if (evolved) this.spawnEventHorizon(conf, color, v);
        else this.spawnOrbiter(conf, color, v);
        break;
      }
      case 'bass': {
        if (evolved) {
          this.spawnSubquake(conf, color, v, t.variant === 'fat');
          break;
        }
        // Bass never multishots (no 'aimedfan' tag): one wide rolling wave.
        this.spawnProjectile('bass', this.aimDir(0.08), conf, color, v);
        break;
      }
      case 'snare':
        if (evolved) {
          this.fireRailshot(conf, color, v);
          break;
        }
        this.spawnProjectile(t.role, this.aimDir(0.08), conf, color, v);
        break;
      case 'hat':
      case 'lead': {
        this.spawnProjectile(t.role, this.aimDir(t.role === 'hat' ? 0.35 : 0.08), conf, color, v);
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
    this.lastRecordedRailMinute = -1;
    this.railSamples = [];
    this.neonRail = null;
    this.venueGates = [];
    this.pendingVenue = null;
    this.lastGateChapter = Math.floor(this.timeS / 300);
    this.lastVenueTransitionChapter = Math.floor(this.timeS / 300);
  }

  setSandboxVenue(venue: VenueId): void {
    this.venue = venue;
    this.venuesVisited.add(venue);
    this.venueGates = [];
    this.pendingVenue = null;
    this.trainLane = null;
    this.venueTransitionT = 0.5;
    this.events.onVenueChanged?.(venue);
  }

  /** Put the sandbox twenty seconds before the next tour change and open the
   * real pair of walk-through route gates. Selection and transition continue
   * through the normal updateVenue path, so this exercises production logic. */
  installSandboxVenueGate(): void {
    const chapter = Math.floor(this.timeS / 300);
    this.timeS = chapter * 300 + 280.01;
    this.lastGateChapter = chapter - 1;
    this.lastVenueTransitionChapter = chapter;
    this.venueGates = [];
    this.pendingVenue = null;
    this.updateVenue(0);
  }

  installSandboxNeonLoop(): void {
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      points.push({
        x: this.player.x + Math.sin(t) * 190,
        y: this.player.y + Math.sin(t * 2) * 105,
      });
    }
    this.neonRail = { points, phase: 'solid', lifeS: 12, crossedItself: true };
  }

  spawnSandboxWave(minute = Math.floor(this.timeS / 60)): void {
    const recipe = waveRecipe(Math.max(8, Math.floor(minute)));
    for (let i = 0; i < recipe.pattern.length; i++) {
      this.spawnRingOf(recipe.pattern[i], Math.max(6, Math.floor(36 / recipe.pattern.length)));
    }
  }

  /** The single build-transform pipeline: soundset multiplier plus Antonio's
   * documented level-based Might. */
  private applyBuild(role: Role, conf: WeaponConf): WeaponConf {
    // Antonio's passive adds 10% Might every ten levels, capped at +50%.
    const antonioMight = 1 + Math.min(5, Math.floor(this.level / 10)) * 0.1;
    const mods = this.buildMods;
    const projectile = role === 'snare' || role === 'hat' || role === 'bass' ||
      role === 'lead' || role === 'bell' || role === 'arp';
    return {
      ...conf,
      damage: conf.damage * this.powerMul * antonioMight * mods.damageMul *
        (projectile ? mods.projectileDamageMul : 1),
      speed: conf.speed === undefined ? undefined : conf.speed * mods.projectileSpeedMul,
      radius: conf.radius === undefined ? undefined : conf.radius * mods.areaMul,
      lifetimeS: conf.lifetimeS === undefined ? undefined : conf.lifetimeS * mods.durationMul,
      pierce: conf.pierce === undefined || !Number.isFinite(conf.pierce)
        ? conf.pierce
        : conf.pierce + mods.extraPierce,
      area: conf.area === undefined ? undefined : conf.area * mods.areaMul,
      orbitRadius: conf.orbitRadius === undefined
        ? undefined
        : conf.orbitRadius * mods.orbitDistanceMul,
    };
  }

  /** Open a scoped phrase conductor; later manual controls can invalidate its
   * queued callbacks without clearing unrelated musical actions. */
  newPressureConductor(): number {
    this.pressureConductorToken += 1;
    return this.pressureConductorToken;
  }

  pressureConductorIsCurrent(token: number): boolean {
    return token === this.pressureConductorToken;
  }

  cancelPressureConductor(): void {
    this.pressureConductorToken += 1;
  }

  /** Start the earned four-bar power phrase. No attack is withheld or slowed. */
  beginPressureDrop(): void {
    if (this.pressureState !== 'armed') return;
    this.pressureState = 'drop';
    this.pressureDropBar = 0;
    this.markMilestone('pressureBreak');
    this.events.onPressureBreak?.(true);
    this.shoveEnemiesOut(
      this.player.x,
      this.player.y,
      PRESSURE_BREAK_CONFIG.openingShoveRadius,
    );
  }

  /** Mark one of the four Drop downbeats for HUD and bounded visual feedback. */
  pulsePressureDropBar(bar: number): void {
    if (this.pressureState !== 'drop') return;
    const next = Math.max(1, Math.min(PRESSURE_BREAK_CONFIG.dropBars, Math.floor(bar)));
    if (next < this.pressureDropBar) return;
    this.pressureDropBar = next;
    const colors = [0xffffff, 0x5ff7ff, 0xff70dc, 0xffe36e] as const;
    const labels = ['DROP 1/4 · IMPACT', 'DROP 2/4 · LIFT', 'DROP 3/4 · PEAK', 'DROP 4/4 · FINALE'] as const;
    const radii = [420, 320, 360, 460] as const;
    const index = next - 1;
    this.fx?.push({
      type: 'pressure',
      x: this.player.x,
      y: this.player.y,
      color: colors[index],
      label: labels[index],
    });
    this.spawnRing(this.player.x, this.player.y, radii[index], colors[index], next === 4 ? 0.8 : 0.55, true);
  }

  /** Finish after bar four; the 45-second recharge begins only now. */
  finishPressureDrop(): void {
    if (this.pressureState !== 'drop') return;
    this.pressureState = 'cooldown';
    this.pressureDropBar = 0;
    this.pressureCooldownT = PRESSURE_BREAK_CONFIG.cooldownS;
    this.pressureHeat = 0;
    this.events.onPressureBreak?.(false);
  }

  private markMilestone(id: 'first5m' | 'fullBand' | 'firstEvolution' | 'hitlessHeadliner' | 'loopCross' | 'pressureBreak'): void {
    if (this.milestones.has(id)) return;
    this.milestones.add(id);
    this.events.onMilestone?.(id);
  }

  private updateMinuteSystems(dt: number): void {
    const minute = Math.floor(this.timeS / 60);
    if (minute !== this.lastMinute) {
      this.lastMinute = minute;
      this.events.onMinute?.(minute);
      if (minute >= 5) this.markMilestone('first5m');
    }
    if (this.venueTransitionT > 0) this.venueTransitionT = Math.max(0, this.venueTransitionT - dt);
    if (this.neonRail?.phase === 'solid') {
      this.neonRail.lifeS -= dt;
      if (this.neonRail.lifeS <= 0) this.neonRail = null;
    }
  }

  /** Moving venue lights are world-space and deterministic, so renderer and
   * simulation can ask the same question without storing hundreds of props. */
  venueLightPools(): Array<{ x: number; y: number; radius: number }> {
    const baseX = Math.round(this.player.x / 420) * 420;
    const baseY = Math.round(this.player.y / 320) * 320;
    return [
      { x: baseX + Math.sin(this.timeS * 0.34) * 170, y: baseY - 95, radius: 125 },
      { x: baseX + Math.cos(this.timeS * 0.27) * 185, y: baseY + 150, radius: 105 },
    ];
  }

  private inVenueLight(x: number, y: number): boolean {
    return this.venueLightPools().some((light) => Math.hypot(x - light.x, y - light.y) <= light.radius);
  }

  basementPuddles(): Array<{ x: number; y: number; radius: number }> {
    const cellX = Math.floor(this.player.x / 480);
    const cellY = Math.floor(this.player.y / 360);
    const out: Array<{ x: number; y: number; radius: number }> = [];
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cellX + ox;
        const gy = cellY + oy;
        const hash = Math.abs((gx * 73856093) ^ (gy * 19349663));
        out.push({
          x: gx * 480 + 90 + (hash % 270),
          y: gy * 360 + 70 + ((hash >> 5) % 190),
          radius: 58 + (hash % 38),
        });
      }
    }
    return out;
  }

  private inBasementPuddle(x: number, y: number): boolean {
    return this.basementPuddles().some((puddle) => Math.hypot(x - puddle.x, y - puddle.y) <= puddle.radius);
  }

  private venueCopy(id: VenueId): { benefit: string; danger: string } {
    const copy: Record<string, { benefit: string; danger: string }> = {
      alley: { benefit: 'free reflector bounce', danger: '+12% enemy speed' },
      warehouse: { benefit: 'spotlit enemies take +20%', danger: '-8% move outside light' },
      rooftop: { benefit: 'wind bends projectiles', danger: '+8% enemy speed' },
      metro: { benefit: 'trains erase the horde', danger: 'train lanes deal 30 HP' },
      basement: { benefit: '+20% zone duration', danger: 'puddles slow everyone' },
      dawn: { benefit: 'light restores health', danger: '+25% contact damage' },
    };
    return copy[id] ?? copy.alley;
  }

  private updateVenue(dt: number): void {
    const chapter = Math.floor(this.timeS / 300);
    const chapterTime = this.timeS - chapter * 300;
    if (chapterTime >= 280 && this.lastGateChapter !== chapter) {
      this.lastGateChapter = chapter;
      const options = gateOptions(
        this.tourSeed,
        chapter + 1,
        this.venue,
        [...this.venuesVisited],
        2,
        this.unlockedVenues,
      );
      this.venueGates = options.map((option, index) => {
        const side: -1 | 1 = index === 0 ? -1 : 1;
        return {
          venue: option.venueId,
          x: this.player.x + side * 220,
          y: this.player.y,
          side,
          selected: false,
          ...this.venueCopy(option.venueId),
        };
      });
      this.pendingVenue = null;
    }
    if (this.venueGates.length > 0 && !this.pendingVenue) {
      const touched = this.venueGates.find((gate) => Math.hypot(this.player.x - gate.x, this.player.y - gate.y) <= 58);
      if (touched || chapterTime >= 298) {
        const chosen = touched ?? [...this.venueGates].sort((a, b) =>
          Math.hypot(this.player.x - a.x, this.player.y - a.y) - Math.hypot(this.player.x - b.x, this.player.y - b.y),
        )[0];
        chosen.selected = true;
        this.pendingVenue = chosen.venue;
      }
    }
    if (chapter > this.lastVenueTransitionChapter) {
      this.lastVenueTransitionChapter = chapter;
      this.venueChapter = chapter;
      this.venue = this.pendingVenue ?? this.venue;
      this.venuesVisited.add(this.venue);
      this.pendingVenue = null;
      this.venueGates = [];
      this.venueTransitionT = 0.8;
      this.events.onVenueChanged?.(this.venue);
    }

    if (this.venue === 'dawn' && this.inVenueLight(this.player.x, this.player.y)) {
      this.dawnHealT += dt;
      if (this.dawnHealT >= 2) {
        this.dawnHealT -= 2;
        this.player.hp = Math.min(this.playerMaxHp, this.player.hp + 1);
      }
    } else {
      this.dawnHealT = 0;
    }

    if (this.venue === 'metro' && this.timeS > 5) {
      const cycle = Math.floor(this.timeS / 40);
      const phase = this.timeS - cycle * 40;
      const laneY = Math.round(this.player.y / 160) * 160 + ((cycle % 3) - 1) * 120;
      this.trainLane = phase >= 36 || phase < 0.8
        ? { y: laneY, warningT: phase >= 36 ? 40 - phase : 0, activeT: phase < 0.8 ? 0.8 - phase : 0 }
        : null;
      if (phase < 0.8 && cycle !== this.lastTrainCycle) {
        this.lastTrainCycle = cycle;
        for (const enemy of this.enemies) {
          if (!enemy.dead && enemy.spawnClass === 'regular' && Math.abs(enemy.y - laneY) < 65) enemy.dead = true;
        }
        if (Math.abs(this.player.y - laneY) < 65) this.damagePlayer(30, false);
      }
    } else {
      this.trainLane = null;
    }
  }

  private updateNeonLoopRecording(dt: number): void {
    const minute = Math.floor(this.timeS / 60);
    const second = this.timeS - minute * 60;
    if (second >= 50 && second < 56) {
      if (this.lastRecordedRailMinute !== minute) {
        this.lastRecordedRailMinute = minute;
        this.railSamples = [{ x: this.player.x, y: this.player.y }];
        this.railSampleT = 0;
        this.neonRail = { points: this.railSamples.slice(), phase: 'recording', lifeS: 0, crossedItself: false };
      }
      this.railSampleT += dt;
      if (this.railSampleT >= 0.1) {
        this.railSampleT -= 0.1;
        const last = this.railSamples[this.railSamples.length - 1];
        if (Math.hypot(this.player.x - last.x, this.player.y - last.y) >= 10) {
          this.railSamples.push({ x: this.player.x, y: this.player.y });
          this.neonRail!.points = this.railSamples.slice();
        }
      }
    } else if (second >= 56 && this.neonRail?.phase === 'recording') {
      let points = simplifyPath(this.railSamples, 6, 48);
      if (pathLength(points) < 80) {
        points = [
          { x: this.player.x, y: this.player.y - 60 },
          { x: this.player.x, y: this.player.y + 60 },
        ];
      }
      const crossedItself = pathCrossesItself(points);
      this.neonRail = { points, phase: 'preview', lifeS: 0, crossedItself };
      if (crossedItself) this.markMilestone('loopCross');
    } else if (second < 0.25 && this.lastRecordedRailMinute === minute - 1 && this.neonRail?.phase === 'preview') {
      this.neonRail.phase = 'solid';
      this.neonRail.lifeS = 24;
      this.spawnRing(this.player.x, this.player.y, 260, 0xffffff, 0.6, true);
    }
  }

  private applyNeonRailToEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      enemy.railCooldownT = Math.max(0, enemy.railCooldownT - dt);
      if (enemy.railSlowT > 0) enemy.railSlowT = Math.max(0, enemy.railSlowT - dt);
    }
    const rail = this.neonRail;
    if (!rail || rail.phase !== 'solid') return;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.railCooldownT > 0) continue;
      for (let i = 1; i < rail.points.length; i++) {
        if (segmentsCross(
          { x: enemy.prevX, y: enemy.prevY },
          { x: enemy.x, y: enemy.y },
          rail.points[i - 1],
          rail.points[i],
        )) {
          enemy.railSlowT = 0.65;
          enemy.railCooldownT = 0.8;
          break;
        }
      }
    }
  }

  private updatePressure(dt: number): void {
    if (this.pressureState === 'cooldown') {
      this.pressureCooldownT = Math.max(0, this.pressureCooldownT - dt);
      if (this.pressureCooldownT <= 0) this.pressureState = 'charging';
      return;
    }
    if (this.pressureState !== 'charging') return;
    let nearby = 0;
    const radius = this.player.radius + 130;
    const radius2 = radius * radius;
    for (const enemy of this.enemies) {
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      if (!enemy.dead && dx * dx + dy * dy <= radius2) nearby += 1;
    }
    if (nearby > 0) this.pressureHeat = Math.min(100, this.pressureHeat + Math.min(6, nearby * 0.45) * dt);
    else this.pressureHeat = Math.max(0, this.pressureHeat - 3 * dt);
    if (this.pressureHeat >= 100) {
      this.pressureState = 'armed';
      this.events.onPressureArmed?.();
    }
  }

  private damagePlayer(amount: number, armorApplies: boolean): void {
    if (this.invincible || this.player.iframesT > 0) return;
    const landed = armorApplies ? Math.max(1, Math.ceil(amount - this.playerArmor)) : Math.max(1, Math.ceil(amount));
    this.player.hp = Math.max(0, this.player.hp - landed);
    this.player.iframesT = DAMAGE_FEEDBACK.iframesS;
    if (this.pressureState === 'charging') {
      this.pressureHeat = Math.max(0, this.pressureHeat - PRESSURE_BREAK_CONFIG.hitHeatLoss);
    }
    if (this.enemies.some((enemy) => !enemy.dead && enemy.headliner)) this.headlinerHitTaken = true;
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
    // Resolve the phrase lift here so even a shockwave created before the Drop
    // receives the stronger shove when it reaches an enemy during the Drop.
    if (this.pressureState === 'drop') dist *= PRESSURE_BREAK_CONFIG.dropKnockbackMul;
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
    this.updateVenue(dt);
    this.updatePassiveRecovery(dt);
    this.movePlayer(dt);
    this.updateNeonLoopRecording(dt);
    if (this.scripted) {
      this.runDirector(dt);
    }

    this.moveEnemies(dt);
    this.updateDummies(dt);
    this.applyNeonRailToEnemies(dt);
    this.recycleEnemies();
    this.hash.clear();
    for (const e of this.enemies) if (!e.dead) this.hash.insert(e);
    this.resolveEnemyCollisions();
    this.hash.clear();
    for (const e of this.enemies) if (!e.dead) this.hash.insert(e);
    this.updateKickStrikes();
    this.updatePendingPulses();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateShockwaves(dt);
    this.updateGravityWells(dt);
    this.updateStageMagnets(dt);
    this.updateGems(dt);
    this.updateMusicNotes(dt);
    this.updateEncoreCases();
    this.updatePressure(dt);
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
    let venueMul = 1;
    if (this.venue === 'warehouse' && !this.inVenueLight(this.player.x, this.player.y)) venueMul *= 0.92;
    if (this.venue === 'basement' && this.inBasementPuddle(this.player.x, this.player.y)) venueMul *= 0.90;
    const speed = RUN.playerSpeed * this.buildMods.moveMul * venueMul;
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
    const venueDamageMul = this.venue === 'dawn' ? 1.25 : 1;
    this.damagePlayer(hitter.damage * venueDamageMul, true);
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
        if (spawned) {
          spawned.upgradeChance = event.rewardChance;
          if (event.atS > 0 && event.atS % 300 === 0) this.makeHeadliner(spawned);
        }
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
      if (recipe.headlinerCount > 0) {
        for (let i = 0; i < recipe.headlinerCount; i++) {
          const before = this.enemies.length;
          this.spawnEnemy(i % 2 === 0 ? 'mantis' : 'glowingBat', undefined, 1, true);
          const headliner = this.enemies.length > before ? this.enemies[this.enemies.length - 1] : null;
          if (headliner) this.makeHeadliner(headliner);
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

  private makeHeadliner(enemy: Enemy): void {
    if (enemy.headliner) return;
    enemy.headliner = true;
    enemy.spawnClass = 'boss';
    const extraHp = endlessScale(enemy.spawnMinute).bossHpMul;
    enemy.hp *= extraHp;
    enemy.shieldHp *= extraHp;
    enemy.band = 3;
    enemy.color = 0xffcf5a;
    this.headlinerHitTaken = false;
    this.fx?.push({ type: 'pressure', x: enemy.x, y: enemy.y, color: 0xffcf5a, label: 'HEADLINER' });
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

  /** Sandbox helper: spawn a real scaled boss and apply all Headliner rules. */
  spawnSandboxHeadliner(kind: EnemyKind = 'mantis'): Enemy | null {
    const enemy = this.spawnEnemyAt(kind, this.player.x + 320, this.player.y);
    if (enemy) this.makeHeadliner(enemy);
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
      railSlowT: 0,
      zoneSlowMul: 1,
      knockX: 0,
      knockY: 0,
      knockT: 0,
      lastMoveX: 0,
      lastMoveY: 0,
      shieldHp: kind === 'shielded' ? scaledHp * SHIELDED.shieldMul : 0,
      spin: kind === 'circler' ? (this.rng() < 0.5 ? 1 : -1) : 0,
      windupT: 0,
      spawnClass,
      moveX,
      moveY,
      despawnAt,
      knockbackMul: stats.knockback,
      upgradeChance: 0,
      spawnMinute: minute,
      amped,
      headliner: false,
      railCooldownT: 0,
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
  }

  /** Reset every transient sandbox entity without touching the player, loadout,
   *  clock, level, or stage director. No delayed strike/pickup pointer survives. */
  clearSandboxEntities(): void {
    this.cancelPressureConductor();
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.gems.length = 0;
    this.musicNotes.length = 0;
    this.stageMagnets.length = 0;
    this.encoreCases.length = 0;
    this.shockwaves.length = 0;
    this.gravityWells.length = 0;
    if (this.fx) this.fx.length = 0;
    this.pendingKick.length = 0;
    this.pendingPulses.length = 0;
    this.overflowGem = null;
    this.overflowMusicNote = null;
    this.noteDropPity = 0;
    this.stageMagnetDropPity = 0;
    this.nextStageMagnetDropAt = 0;
    this.neonRail = null;
    this.venueGates = [];
    this.trainLane = null;
    this.pressureHeat = 0;
    this.pressureState = 'charging';
    this.pressureDropBar = 0;
    this.pressureCooldownT = 0;
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
      const venueSpeed = this.venue === 'alley' ? 1.12 : this.venue === 'rooftop' ? 1.08 : 1;
      let speed = e.speed * venueSpeed;
      if (e.slowT > 0) {
        e.slowT -= dt;
        speed *= e.zoneSlowMul;
      } else {
        e.zoneSlowMul = 1;
      }
      if (e.railSlowT > 0) speed *= 0.70;
      if (this.venue === 'basement' && this.inBasementPuddle(e.x, e.y)) speed *= 0.70;
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
    // The Drop multiplier is resolved at impact, so projectiles, zones, and
    // orbiters already in flight when the phrase begins all receive the lift.
    // Environment and venue hazards omit a weapon source and stay unchanged.
    if (source && this.pressureState === 'drop') {
      amount *= PRESSURE_BREAK_CONFIG.dropDamageMul;
    }
    if (this.venue === 'warehouse' && this.inVenueLight(e.x, e.y)) amount *= 1.20;
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
      if (
        this.pressureState === 'charging' &&
        Math.hypot(e.x - this.player.x, e.y - this.player.y) <= this.player.radius + 130
      ) {
        this.pressureHeat = Math.min(100, this.pressureHeat + 2);
      }
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
      this.spawnMusicNoteForEnemy(e);
      this.spawnStageMagnetForEnemy(e);
      if (e.headliner) {
        this.headlinersKilled += 1;
        const encore: EncoreCase = { x: e.x, y: e.y, minute: e.spawnMinute, color: 0xffd45c };
        this.encoreCases.push(encore);
        if (!this.headlinerHitTaken) this.markMilestone('hitlessHeadliner');
        this.fx?.push({ type: 'evolution', x: e.x, y: e.y, color: encore.color, label: 'ENCORE CASE' });
      }
      // Chests are outside this game's item vocabulary. Preserve each stage
      // row's any-chest chance, but translate a successful roll directly into
      // one project-native weapon upgrade pick.
      if (e.upgradeChance > 0 && this.rng() < e.upgradeChance) {
        this.events.onLevelUp(this.level);
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

  private fireRedlineStomp(conf: WeaponConf, color: number): void {
    const reachX = this.worldW * 0.58;
    const reachY = this.worldH * 0.58;
    const half = KICK_GEOMETRY.baseHeight * (conf.area ?? 1) * 0.75;
    const damage = conf.damage * 1.35;
    const shove = 18 * this.buildMods.knockbackMul;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const dx = Math.abs(enemy.x - this.player.x);
      const dy = Math.abs(enemy.y - this.player.y);
      if ((dx <= reachX + enemy.radius && dy <= half + enemy.radius) ||
          (dy <= reachY + enemy.radius && dx <= half + enemy.radius)) {
        this.damageEnemy(enemy, damage, 'kick');
        this.shove(enemy, this.player.x, this.player.y, shove);
      }
    }
    for (const [x2, y2] of [
      [this.player.x + reachX, this.player.y], [this.player.x - reachX, this.player.y],
      [this.player.x, this.player.y + reachY], [this.player.x, this.player.y - reachY],
    ] as const) {
      this.fx?.push({ type: 'beam', x: this.player.x, y: this.player.y, x2, y2, width: half * 2, color });
    }
  }

  private damageLine(
    x: number,
    y: number,
    dir: Point,
    length: number,
    halfWidth: number,
    damage: number,
    source: Role,
    shove: number,
  ): number {
    let hits = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const px = enemy.x - x;
      const py = enemy.y - y;
      const along = px * dir.x + py * dir.y;
      const across = Math.abs(px * -dir.y + py * dir.x);
      if (along < -enemy.radius || along > length + enemy.radius || across > halfWidth + enemy.radius) continue;
      this.damageEnemy(enemy, damage, source);
      if (shove > 0) this.shove(enemy, x, y, shove);
      hits += 1;
    }
    return hits;
  }

  private fireRailshot(conf: WeaponConf, color: number, velocity: number): void {
    const dir = this.aimDir(0.02);
    const damage = conf.damage * 1.50 * (0.8 + 0.4 * velocity);
    const width = Math.max(7, (conf.radius ?? 7) * 1.25);
    this.damageLine(this.player.x, this.player.y, dir, 900, width, damage, 'snare', 16 * this.buildMods.knockbackMul);
    this.fx?.push({ type: 'beam', x: this.player.x, y: this.player.y, x2: this.player.x + dir.x * 900, y2: this.player.y + dir.y * 900, width: width * 2, color });
    if ((this.triggerCounts.snare ?? 0) % 4 === 0) {
      const nx = -dir.y * 24;
      const ny = dir.x * 24;
      for (const side of [-1, 1] as const) {
        const x = this.player.x + nx * side;
        const y = this.player.y + ny * side;
        this.damageLine(x, y, dir, 900, width * 0.7, damage * 0.65, 'snare', 8 * this.buildMods.knockbackMul);
        this.fx?.push({ type: 'beam', x, y, x2: x + dir.x * 900, y2: y + dir.y * 900, width, color });
      }
    }
  }

  private fireStandingOvation(conf: WeaponConf, color: number, velocity: number): void {
    const radius = Math.hypot(this.worldW, this.worldH) * 0.58 * this.buildMods.areaMul;
    const damage = conf.damage * 1.20 * (0.85 + 0.3 * velocity);
    const hitCount = this.damageArea(
      this.player.x,
      this.player.y,
      radius,
      damage,
      'clap',
      28 * this.buildMods.knockbackMul,
    );
    const minute = Math.floor(this.timeS / 60);
    if (minute !== this.clapHealMinute) {
      this.clapHealMinute = minute;
      this.clapHealThisMinute = 0;
    }
    if (hitCount >= 8 && this.clapHealThisMinute < 6) {
      this.clapHealThisMinute += 1;
      this.player.hp = Math.min(this.playerMaxHp, this.player.hp + 1);
    }
    this.pendingPulses.push({
      atS: this.timeS + 0.18,
      x: this.player.x,
      y: this.player.y,
      radius,
      damage: damage * 0.55,
      shove: 0,
      color,
      source: 'clap',
    });
    this.spawnRing(this.player.x, this.player.y, radius, color, 0.35);
  }

  private updatePendingPulses(): void {
    for (let i = this.pendingPulses.length - 1; i >= 0; i--) {
      const pulse = this.pendingPulses[i];
      if (pulse.atS > this.timeS) continue;
      this.damageArea(pulse.x, pulse.y, pulse.radius, pulse.damage, pulse.source, pulse.shove);
      this.fx?.push({ type: 'ring', x: pulse.x, y: pulse.y, radius: pulse.radius, color: pulse.color, dur: 0.3 });
      this.pendingPulses.splice(i, 1);
    }
  }

  private spawnSubquake(conf: WeaponConf, color: number, velocity: number, fat: boolean): void {
    const area = this.buildMods.areaMul;
    this.shockwaves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 40,
      maxRadius: (fat ? 300 : 230) * area,
      age: 0,
      lifeS: 1.2,
      damage: conf.damage * 1.55 * (fat ? 1.2 : 1) * (0.8 + 0.4 * velocity),
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
      bounces: this.buildMods.bounceCount + (this.venue === 'alley' ? 1 : 0),
      bounceRetention: this.venue === 'alley'
        ? Math.max(0.85, this.buildMods.bounceRetention)
        : this.buildMods.bounceRetention,
      railReflections: 0,
      evolved: this.evolved.has(role),
      turnRate: 10,
      orbitDir: 1,
      gravity: false,
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
    if (role === 'hat' && pr.evolved) {
      pr.damage *= 1.30;
      pr.speed *= 1.50;
      pr.maxPierce = 4;
      pr.pierce = 4;
    }
    if (role === 'lead' && pr.evolved) {
      pr.damage *= 1.40;
      pr.maxPierce = 6;
      pr.pierce = 6;
      pr.turnRate = 14;
      if ((this.triggerCounts.lead ?? 0) % 5 === 0) {
        pr.damage *= 2;
        pr.radius = Math.max(12, pr.radius * 1.7);
      }
    }
    pr.vx = dir.x * conf.speed!;
    pr.vy = dir.y * conf.speed!;
    if (role === 'hat' && pr.evolved) {
      pr.vx *= 1.50;
      pr.vy *= 1.50;
    }
    this.applyRooftopWind(pr);
    this.projectiles.push(pr);
  }

  /** Arp: an orbiter that circles the player, chipping what it sweeps. */
  private spawnOrbiter(conf: WeaponConf, color: number, velocity: number): void {
    const angle = this.rng() * Math.PI * 2;
    const pr = this.baseProjectile('arp', conf, color, conf.damage * (0.8 + 0.4 * velocity));
    pr.pierce = Infinity;
    pr.orbitAngle = angle;
    pr.orbitRadius = conf.orbitRadius!;
    pr.x = this.player.x + Math.cos(angle) * pr.orbitRadius;
    pr.y = this.player.y + Math.sin(angle) * pr.orbitRadius;
    this.projectiles.push(pr);
  }

  private spawnEventHorizon(conf: WeaponConf, color: number, velocity: number): void {
    const baseAngle = this.rng() * Math.PI * 2;
    for (const dir of [1, -1] as const) {
      const angle = baseAngle + (dir === 1 ? 0 : Math.PI);
      const evolvedConf = {
        ...conf,
        radius: (conf.radius ?? 8) * 1.25,
        lifetimeS: (conf.lifetimeS ?? 2) * 1.35,
      };
      const pr = this.baseProjectile('arp', evolvedConf, color, conf.damage * 0.8 * (0.8 + 0.4 * velocity));
      pr.pierce = Infinity;
      pr.orbitAngle = angle;
      pr.orbitRadius = conf.orbitRadius!;
      pr.orbitDir = dir;
      pr.rehitT = 0.45;
      pr.evolved = true;
      pr.x = this.player.x + Math.cos(angle) * pr.orbitRadius;
      pr.y = this.player.y + Math.sin(angle) * pr.orbitRadius;
      this.projectiles.push(pr);
    }
    const evolvedOrbiters = this.projectiles.filter((projectile) => projectile.role === 'arp' && projectile.evolved);
    while (evolvedOrbiters.length > 24) {
      const oldest = evolvedOrbiters.shift()!;
      const index = this.projectiles.indexOf(oldest);
      if (index >= 0) this.projectiles.splice(index, 1);
    }
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
    if (pr.evolved) {
      pr.damage *= 1.35;
      pr.gravity = true;
      pr.shatter = 10;
    }
    this.applyRooftopWind(pr);
    this.projectiles.push(pr);
  }

  private applyRooftopWind(projectile: Projectile): void {
    if (this.venue !== 'rooftop' || projectile.role === 'arp') return;
    const angle = (this.venueChapter * 1.7 + Math.floor(this.timeS / 20) * 0.37) % (Math.PI * 2);
    const push = projectile.speed * 0.18;
    projectile.vx += Math.cos(angle) * push;
    projectile.vy += Math.sin(angle) * push;
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
      this.applyRooftopWind(pr);
      this.projectiles.push(pr);
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
            hit: new Set(),
          });
        }
        // Anchor at the player; the view bursts the pulse outward from here.
        this.fx?.push({
          type: 'whip',
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
          !circleIntersectsRect(e.x, e.y, e.radius, centerX, centerY, halfW, halfH)
        ) {
          continue;
        }
        this.damageEnemy(e, strike.damage, 'kick');
        strike.hit.add(e);
        // Enemy hit response reverses pursuit for the same 120 ms flash,
        // scaled by the source bestiary's knockback multiplier.
        this.reverseForKick(e, strike.x, strike.y);
      }
    }
  }

  private reverseForKick(e: Enemy, fromX: number, fromY: number): void {
    if (e.knockbackMul <= 0) return;
    if (e.lastMoveX !== 0 || e.lastMoveY !== 0) {
      const dropMul = this.pressureState === 'drop' ? PRESSURE_BREAK_CONFIG.dropKnockbackMul : 1;
      e.knockX = -e.lastMoveX * e.knockbackMul * dropMul;
      e.knockY = -e.lastMoveY * e.knockbackMul * dropMul;
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

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const step = dt;
      const travelStep = step * (this.pressureState === 'drop'
        ? PRESSURE_BREAK_CONFIG.dropProjectileSpeedMul
        : 1);
      pr.age += step;
      pr.lifeS -= step;

      if (pr.role === 'arp') {
        // Orbit the player; clear the hit set on a cooldown so a slow sweep
        // keeps chipping the same enemy instead of touching it once.
        pr.orbitAngle += ARP_OMEGA * pr.orbitDir * step;
        const orbitRadius = pr.evolved ? 125 + Math.sin(pr.age * 3.2) * 25 : pr.orbitRadius;
        pr.x = p.x + Math.cos(pr.orbitAngle) * orbitRadius;
        pr.y = p.y + Math.sin(pr.orbitAngle) * orbitRadius;
        pr.rehitT -= step;
        if (pr.rehitT <= 0) {
          pr.hit.clear();
          pr.rehitT = pr.evolved ? 0.45 : ORBIT_REHIT_S;
        }
      } else {
        const old = { x: pr.x, y: pr.y };
        if (pr.homing) {
          let best: Enemy | null = null;
          let bestD = Infinity;
          for (const e of this.enemies) {
            if (e.dead || pr.hit.has(e)) continue;
            const dx = e.x - pr.x;
            const dy = e.y - pr.y;
            const d = dx * dx + dy * dy;
            if (d < bestD && (!pr.evolved || pr.role !== 'lead' || d <= 320 * 320)) {
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
        this.reflectProjectileFromRail(pr, old);
        this.reflectProjectileFromArena(pr);
      }

      const near = this.hash.query(pr.x, pr.y, pr.radius + 24, this.queryBuf);
      for (const e of near) {
        if (e.dead || pr.hit.has(e) || !circlesOverlap(pr, e)) continue;
        pr.hit.add(e);
        this.damageEnemy(e, pr.damage, pr.role);
        // Shove (sim, deterministic): snare 20 / bass 10. Writes only the
        // shared knock channel.
        const sh = (WEAPON_SHOVE[pr.role] ?? 0) * this.buildMods.knockbackMul;
        if (sh) this.shove(e, pr.x, pr.y, sh);
        // Bell: the note shatters into a radial burst of shards on its first
        // hit. shatter is 0 on a shard, so shards never re-shatter.
        if (pr.role === 'bell' && pr.shatter > 0) {
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
        // Orbiters gate re-hits by time, so they never spend pierce on a hit.
        if (pr.role === 'arp') continue;
        if (pr.role === 'hat' && pr.evolved && pr.hit.size < 4) {
          this.retargetPrism(pr);
        }
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

  private retargetPrism(projectile: Projectile): void {
    let best: Enemy | null = null;
    let bestD = 260 * 260;
    for (const enemy of this.enemies) {
      if (enemy.dead || projectile.hit.has(enemy)) continue;
      const dx = enemy.x - projectile.x;
      const dy = enemy.y - projectile.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = enemy;
      }
    }
    if (!best) return;
    const dx = best.x - projectile.x;
    const dy = best.y - projectile.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = Math.hypot(projectile.vx, projectile.vy) || projectile.speed;
    projectile.vx = (dx / d) * speed;
    projectile.vy = (dy / d) * speed;
  }

  private reflectProjectileFromRail(projectile: Projectile, old: Point): void {
    const rail = this.neonRail;
    if (!rail || rail.phase !== 'solid' || projectile.role === 'arp') return;
    for (let i = 1; i < rail.points.length; i++) {
      const a = rail.points[i - 1];
      const b = rail.points[i];
      if (!segmentsCross(old, projectile, a, b)) continue;
      const hasFreeRailReflection = projectile.railReflections < 1;
      if (!hasFreeRailReflection && projectile.bounces <= 0) return;
      const reflected = reflectAcrossSegment(projectile.vx, projectile.vy, a, b);
      projectile.vx = reflected.x;
      projectile.vy = reflected.y;
      projectile.x = old.x + projectile.vx * 0.01;
      projectile.y = old.y + projectile.vy * 0.01;
      if (hasFreeRailReflection) {
        projectile.railReflections += 1;
        projectile.damage *= 0.85;
        projectile.lifeS += 0.25;
      } else {
        projectile.bounces -= 1;
        projectile.damage *= projectile.bounceRetention;
      }
      if (projectile.role === 'hat' && projectile.evolved) this.retargetPrism(projectile);
      return;
    }
  }

  private reflectProjectileFromArena(projectile: Projectile): void {
    if (projectile.bounces <= 0 || projectile.role === 'arp') return;
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
    if (projectile.role === 'hat' && projectile.evolved) this.retargetPrism(projectile);
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
    const life = conf.lifetimeS! * (evolved ? 1.35 : 1) * (this.venue === 'basement' ? 1.20 : 1);
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

  private spawnMusicNoteForEnemy(enemy: Enemy): void {
    this.noteDropPity += 1;
    const boss = ENEMIES[enemy.kind].boss === true || enemy.spawnClass === 'boss';
    const chance = Math.min(0.3, 0.08 + Math.sqrt(Math.max(1, enemy.xp)) * 0.035);
    const guaranteed = enemy.headliner || boss || enemy.amped || this.noteDropPity >= 7;
    if (!guaranteed && this.rng() >= chance) return;
    this.noteDropPity = 0;
    const value = enemy.headliner
      ? 25
      : boss
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
   * walk-to-choose: level-up pedestals, Encore Cases, and venue gates. */
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

  private updateEncoreCases(): void {
    for (let i = this.encoreCases.length - 1; i >= 0; i--) {
      const encore = this.encoreCases[i];
      if (Math.hypot(encore.x - this.player.x, encore.y - this.player.y) > 42) continue;
      this.encoreCases.splice(i, 1);
      this.events.onEncoreCase?.(encore);
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
