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
  LEVELUP,
  MAD_FOREST_FRAMES,
  MAX_ALIVE_HARD,
  ORBIT_REHIT_S,
  RUN,
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
import { endlessScale, waveRecipe } from './endless';
import { MAX360_CAPTURE_FIXTURES } from './live-capture';
import { WORLD_HEIGHT, WORLD_WIDTH } from './viewport';
import {
  nativeActorFrameBounds,
  nativeActorOpaqueBounds,
  sandboxMax360VariantPlan,
  sandboxVisualPresetPlan,
  type DebugActorGeometry,
  type DebugActorVisualResolver,
  type DebugChoiceGeometry,
  type DebugClapGeometry,
  type DebugKickGeometry,
  type DebugPickupGeometry,
  type DebugProjectileGeometry,
  type DebugZoneGeometry,
  type RunDebugGeometrySnapshot,
  type SandboxPresetState,
  type SandboxMax360VariantId,
  type SandboxVisualPresetPlan,
  type SandboxVisualPresetId,
} from './visual-debug';

/** Roles that emit a per-hit spark on impact. Bounded to low-count roles so
 *  a 500-enemy event frame never floods the fx queue. */
const SPARK_HIT_ROLES = new Set<Role>(['snare', 'lead']);
const CLAP_POINT_BLANK_RADIUS = 34;
const CLAP_DEBUG_LIFETIME_S = 0.3;
const NO_DEBUG_OBSTACLES = Object.freeze([]) as readonly [];

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
  prevX: number;
  prevY: number;
}

export interface Projectile {
  /** Stable developer-capture identity; absent in production simulation. */
  captureId?: string;
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
  /** Number of evolved zones folded into this live boundary. Debug-only read;
   * damage/radius merging remains unchanged. */
  mergedCount: number;
}

export interface Shockwave {
  /** Stable developer-capture identity; absent in production simulation. */
  captureId?: string;
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
  /** Stable developer-capture identity; absent in production simulation. */
  captureId?: string;
  x: number;
  y: number;
  minute: number;
  color: number;
}

export interface Gem {
  /** Stable developer-capture identity; absent in production simulation. */
  captureId?: string;
  x: number;
  y: number;
  xp: number;
  tier: 'blue' | 'green' | 'red';
}

export interface MusicNotePickup {
  /** Stable developer-capture identity; absent in production simulation. */
  captureId?: string;
  x: number;
  y: number;
  value: number;
  tier: 'note' | 'phrase' | 'anthem';
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
  | { type: 'slam'; x: number; y: number; radius: number; color: number }
  | { type: 'beam'; x: number; y: number; x2: number; y2: number; width: number; color: number }
  | { type: 'banner'; x: number; y: number; color: number; label: string }
  | { type: 'evolution'; x: number; y: number; color: number; label: string };

export interface RunEvents {
  onLevelUp(level: number): void;
  onDeath(): void;
  onVictory(): void;
  onHit(): void;
  onMinute?(minute: number): void;
  onEncoreCase?(encore: EncoreCase): void;
  onNoteCollected?(value: number, runTotal: number): void;
  onMilestone?(id: 'first5m' | 'fullBand' | 'firstEvolution' | 'hitlessHeadliner'): void;
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
  /** Opt-in production opening gate. While true, only player movement runs;
   *  combat, enemies, time, and progression wait for beginCombat(). */
  awaitingStartingWeapon?: boolean;
  /** Optional seeded randomness for deterministic development fixtures. */
  rng?: Rng;
  /** Movement axis provider (magnitude 0..1). */
  control?: () => { x: number; y: number };
  /** False for non-visual fixtures that do not consume effects. */
  fx?: boolean;
  startingItem?: ItemId;
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
  readonly milestones = new Set<'first5m' | 'fullBand' | 'firstEvolution' | 'hitlessHeadliner'>();
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
  readonly shockwaves: Shockwave[] = [];
  readonly gravityWells: GravityWell[] = [];
  readonly encoreCases: EncoreCase[] = [];
  private readonly pendingPulses: PendingPulse[] = [];

  secondWindReady = false;
  readonly headlinerGold: boolean;

  private rng: Rng;
  private control: () => { x: number; y: number };
  private events: RunEvents;

  private hash = new SpatialHash<Enemy>();
  private queryBuf: Enemy[] = [];

  /** Scripted stage-table state. */
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
  private lastMinute = -1;
  private headlinerHitTaken = false;
  private clapHealMinute = -1;
  private clapHealThisMinute = 0;
  private triggerCounts: Partial<Record<Role, number>> = {};
  private encoreDamageBonus = 0;
  private encoreMoveBonus = 0;
  private encoreAreaBonus = 0;
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
  /** Recent normal Clap collision shapes retained only long enough for the
   *  developer overlay to show the exact cone and point-blank circle. */
  private recentClapShapes: Array<DebugClapGeometry & { expiresAt: number }> = [];
  private sandboxChoiceFixtures: DebugChoiceGeometry[] = [];
  private sandboxPresetState: SandboxPresetState | null = null;
  private sandboxCaptureFrozen = false;
  private scripted: boolean;
  private combatStarted: boolean;

  constructor(
    _view: { width: number; height: number },
    events: RunEvents,
    opts: RunWorldOpts = {},
  ) {
    this.events = events;
    this.scripted = opts.scripted ?? true;
    // Sandbox and existing simulation fixtures remain live by default. The
    // normal-run shell opts into the dedicated opening selection explicitly.
    this.combatStarted = !(opts.awaitingStartingWeapon ?? false);
    this.rng = opts.rng ?? Math.random;
    this.control = opts.control ?? (() => ({ x: 0, y: 0 }));
    this.fx = (opts.fx ?? true) ? [] : null;
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

  get awaitingStartingWeapon(): boolean {
    return !this.combatStarted;
  }

  get sandboxVisualPreset(): SandboxPresetState | null {
    return this.sandboxPresetState;
  }

  /** Release the opening gate only after a real weapon has been installed. */
  beginCombat(): boolean {
    if (this.tiers.size === 0) return false;
    this.combatStarted = true;
    return true;
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

  /** Simulation scale is fixed. Browser presentation lives in viewport.ts. */
  get zoom(): number {
    return 1;
  }

  /** Visible simulation extent stays independent of browser resolution. */
  get worldW(): number {
    return WORLD_WIDTH;
  }

  get worldH(): number {
    return WORLD_HEIGHT;
  }

  /**
   * One copied, read-only geometry seam for development rendering and checks.
   * No debug view reaches private strike queues or reconstructs collision
   * rules independently from the simulation.
   */
  debugGeometrySnapshot(resolveActorVisual: DebugActorVisualResolver = () => null): RunDebugGeometrySnapshot {
    const playerBody = Object.freeze({
      x: this.player.x,
      y: this.player.y,
      radius: this.player.radius,
    });
    const playerVisual = resolveActorVisual('player');
    const missingPlayerBounds = Object.freeze({ x: this.player.x, y: this.player.y, width: 0, height: 0 });
    const actors: DebugActorGeometry[] = [Object.freeze({
      id: 'player',
      kind: 'player',
      hurtBodyWorld: playerBody,
      contactBodyWorld: playerBody,
      rendererAnchorWorld: Object.freeze({ x: this.player.x, y: this.player.y }),
      groundPivotWorld: Object.freeze(playerVisual ? {
        x: this.player.x + (playerVisual.groundX - playerVisual.pivotX) * playerVisual.worldUnitsPerNativePixel,
        y: this.player.y + (playerVisual.groundY - playerVisual.pivotY) * playerVisual.worldUnitsPerNativePixel,
      } : { x: this.player.x, y: this.player.y }),
      simulationGroundReferenceWorld: Object.freeze({
        x: this.player.x + PLAYER_FOOT_OFFSET.x,
        y: this.player.y + PLAYER_FOOT_OFFSET.y,
      }),
      frameBoundsWorld: playerVisual
        ? nativeActorFrameBounds(this.player.x, this.player.y, playerVisual)
        : missingPlayerBounds,
      opaqueVisualBoundsWorld: playerVisual
        ? nativeActorOpaqueBounds(this.player.x, this.player.y, playerVisual)
        : missingPlayerBounds,
      opaqueBoundsSource: playerVisual
        ? 'production atlas idle/walk/facing union'
        : 'visual metadata unavailable',
      headliner: false,
      amped: false,
    })];
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const body = Object.freeze({ x: enemy.x, y: enemy.y, radius: enemy.radius });
      const actorVisual = resolveActorVisual(enemy.kind);
      const missingBounds = Object.freeze({ x: enemy.x, y: enemy.y, width: 0, height: 0 });
      actors.push(Object.freeze({
        id: enemy.id,
        kind: enemy.kind,
        hurtBodyWorld: body,
        contactBodyWorld: body,
        rendererAnchorWorld: Object.freeze({ x: enemy.x, y: enemy.y }),
        groundPivotWorld: Object.freeze(actorVisual ? {
          x: enemy.x + (actorVisual.groundX - actorVisual.pivotX) * actorVisual.worldUnitsPerNativePixel,
          y: enemy.y + (actorVisual.groundY - actorVisual.pivotY) * actorVisual.worldUnitsPerNativePixel,
        } : { x: enemy.x, y: enemy.y }),
        simulationGroundReferenceWorld: Object.freeze({
          x: enemy.x + enemy.footOffsetX,
          y: enemy.y + enemy.footOffsetY,
        }),
        frameBoundsWorld: actorVisual
          ? nativeActorFrameBounds(enemy.x, enemy.y, actorVisual)
          : missingBounds,
        opaqueVisualBoundsWorld: actorVisual
          ? nativeActorOpaqueBounds(enemy.x, enemy.y, actorVisual)
          : missingBounds,
        opaqueBoundsSource: actorVisual
          ? 'production atlas idle/walk/facing union'
          : 'visual metadata unavailable',
        headliner: enemy.headliner,
        amped: enemy.amped,
      }));
    }

    const projectiles: DebugProjectileGeometry[] = this.projectiles.map((projectile) =>
      Object.freeze({
        role: projectile.role,
        collisionCoreWorld: Object.freeze({
          x: projectile.x,
          y: projectile.y,
          radius: projectile.radius,
        }),
        pierce: projectile.pierce,
        maxPierce: projectile.maxPierce,
        bounces: projectile.bounces,
        evolved: projectile.evolved,
      }),
    );

    const kickRects: DebugKickGeometry[] = [];
    for (const strike of this.pendingKick) {
      if (!strike.started || this.timeS + 1e-9 >= strike.expiresAt) continue;
      const age = Math.max(0, this.timeS - strike.startedAt);
      const growth = Math.min(1, age / 0.1);
      const halfW = (KICK_GEOMETRY.baseWidth * strike.area * growth) / 2;
      const halfH = (KICK_GEOMETRY.baseHeight * strike.area * growth) / 2;
      const center = kickStripCenter(strike.x, strike.y, strike.side, halfW);
      kickRects.push(Object.freeze({
        rectWorld: Object.freeze({
          x: center.x - halfW,
          y: center.y - halfH,
          width: halfW * 2,
          height: halfH * 2,
        }),
        side: strike.side,
        growth,
      }));
    }

    const clapShapes: DebugClapGeometry[] = this.recentClapShapes
      .filter((shape) => shape.expiresAt > this.timeS)
      .map((shape) => Object.freeze({
        x: shape.x,
        y: shape.y,
        angle: shape.angle,
        halfArc: shape.halfArc,
        reach: shape.reach,
        pointBlankRadius: shape.pointBlankRadius,
      }));
    const zones: DebugZoneGeometry[] = this.zones.map((zone) => Object.freeze({
      x: zone.x,
      y: zone.y,
      radius: zone.radius,
      source: zone.source,
      evolved: zone.evolved,
      mergedCount: zone.mergedCount,
      mergedCapRadius: 180,
    }));
    const gemMagnet = RUN.magnetRadius * this.buildMods.magnetMul;
    const noteMagnet = gemMagnet * 1.15;
    const pickups: DebugPickupGeometry[] = [
      ...this.gems.map((gem, index) => Object.freeze({
        id: `xp-${index}`,
        kind: 'xp' as const,
        x: gem.x,
        y: gem.y,
        collectionRadius: RUN.pickupRadius,
        magnetRadius: gemMagnet,
      })),
      ...this.musicNotes.map((note, index) => Object.freeze({
        id: `note-${index}`,
        kind: 'note' as const,
        x: note.x,
        y: note.y,
        collectionRadius: RUN.pickupRadius + 4,
        magnetRadius: noteMagnet,
      })),
      ...this.encoreCases.map((encore, index) => Object.freeze({
        id: `encore-${index}`,
        kind: 'encore' as const,
        x: encore.x,
        y: encore.y,
        collectionRadius: 42,
        magnetRadius: 0,
      })),
    ];
    const choices = this.sandboxChoiceFixtures.map((choice) => Object.freeze({ ...choice }));

    return Object.freeze({
      timeS: this.timeS,
      actors: Object.freeze(actors),
      projectiles: Object.freeze(projectiles),
      kickRects: Object.freeze(kickRects),
      clapShapes: Object.freeze(clapShapes),
      zones: Object.freeze(zones),
      pickups: Object.freeze(pickups),
      choices: Object.freeze(choices),
      playerGemMagnetWorld: Object.freeze({
        x: this.player.x,
        y: this.player.y,
        radius: gemMagnet,
      }),
      playerNoteMagnetWorld: Object.freeze({
        x: this.player.x,
        y: this.player.y,
        radius: noteMagnet,
      }),
      obstacles: NO_DEBUG_OBSTACLES,
      obstacleReport: 'none — scenery is decorative and non-colliding',
      preset: this.sandboxPresetState,
    });
  }

  /** The coupling point: a scheduled trigger fires this kit's weapon at the
   *  owned tier. Variant peaks (chord pad) scale the same weapon. */
  fireTrigger(t: ScheduledTrigger): void {
    if (this.sandboxCaptureFrozen) return;
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
        this.recentClapShapes.push({
          x: p.x,
          y: p.y,
          angle: ang,
          halfArc: conf.arc!,
          reach,
          pointBlankRadius: CLAP_POINT_BLANK_RADIUS,
          expiresAt: this.timeS + CLAP_DEBUG_LIFETIME_S,
        });
        if (this.recentClapShapes.length > 8) this.recentClapShapes.shift();
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
    this.leaveSandboxVisualPreset();
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

  private markMilestone(id: 'first5m' | 'fullBand' | 'firstEvolution' | 'hitlessHeadliner'): void {
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
    void dt;
  }

  private damagePlayer(amount: number, armorApplies: boolean): void {
    if (this.invincible || this.player.iframesT > 0) return;
    const landed = armorApplies ? Math.max(1, Math.ceil(amount - this.playerArmor)) : Math.max(1, Math.ceil(amount));
    this.player.hp = Math.max(0, this.player.hp - landed);
    this.player.iframesT = DAMAGE_FEEDBACK.iframesS;
    if (this.enemies.some((enemy) => !enemy.dead && enemy.headliner)) this.headlinerHitTaken = true;
    this.events.onHit();
    if (this.player.hp > 0) return;
    if (this.secondWindReady) {
      this.secondWindReady = false;
      this.player.hp = Math.max(1, Math.ceil(this.playerMaxHp * 0.30));
      this.player.iframesT = 2;
      this.spawnRing(this.player.x, this.player.y, 300, 0xffd875, 1);
      this.fx?.push({ type: 'banner', x: this.player.x, y: this.player.y, color: 0xffd875, label: 'SECOND WIND' });
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
    if (this.sandboxCaptureFrozen) return;
    if (!this.combatStarted) {
      // Picking is physical, so movement stays responsive. Nothing else—not
      // even recovery frames—advances before a starting weapon exists.
      this.movePlayer(dt, false);
      return;
    }
    this.timeS += dt;
    for (let i = this.recentClapShapes.length - 1; i >= 0; i--) {
      if (this.recentClapShapes[i].expiresAt <= this.timeS) this.recentClapShapes.splice(i, 1);
    }
    this.updateMinuteSystems(dt);
    this.updatePassiveRecovery(dt);
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
    this.updatePendingPulses();
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateShockwaves(dt);
    this.updateGravityWells(dt);
    this.updateGems(dt);
    this.updateMusicNotes(dt);
    this.updateEncoreCases();
    this.contactDamage(dt);

    this.reapEnemies();
  }

  // ---- player ----

  private updatePassiveRecovery(dt: number): void {
    const rate = this.buildMods.hpRegenPerSecond;
    if (rate <= 0 || this.player.hp <= 0 || this.player.hp >= this.playerMaxHp) return;
    this.player.hp = Math.min(this.playerMaxHp, this.player.hp + rate * dt);
  }

  private movePlayer(dt: number, tickIframes = true): void {
    const a = this.control();
    if (a.x > 0.001) this.player.facingX = 1;
    else if (a.x < -0.001) this.player.facingX = -1;
    const speed = RUN.playerSpeed * this.buildMods.moveMul;
    this.player.x += a.x * speed * dt;
    this.player.y += a.y * speed * dt;
    if (tickIframes && this.player.iframesT > 0) this.player.iframesT -= dt;
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

    // Preserve the authored opening exactly, then hand off to the generic
    // endless director at 8:00. No victory branch exists.
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
    this.fx?.push({ type: 'banner', x: enemy.x, y: enemy.y, color: 0xffcf5a, label: 'HEADLINER' });
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
    this.leaveSandboxVisualPreset();
    const start = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(kind, start + (i / count) * Math.PI * 2, 1, true);
    }
  }

  /** A surge pouring in from one direction in a loose arc. */
  spawnSurgeOf(kind: EnemyKind, count: number): void {
    this.leaveSandboxVisualPreset();
    const center = this.rng() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(kind, center + (this.rng() * 2 - 1) * 0.5, 1 + this.rng() * 0.6, true);
    }
  }

  spawnEnemy(kind: EnemyKind, angle?: number, distMul = 1, wave = false): void {
    this.leaveSandboxVisualPreset();
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
    this.leaveSandboxVisualPreset();
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
    const amped = spawnClass === 'regular' && minute >= 12 &&
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
      band: conf.boss ? 3 : Math.min(3, Math.floor(minute / 5)),
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
      prevX: x - body.footOffsetX,
      prevY: y - body.footOffsetY,
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
    this.leaveSandboxVisualPreset();
    this.enemies.length = 0;
  }

  /** Reset every transient sandbox entity without touching the player, loadout,
   *  clock, level, or stage director. No delayed strike/pickup pointer survives. */
  clearSandboxEntities(): void {
    this.leaveSandboxVisualPreset();
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.gems.length = 0;
    this.musicNotes.length = 0;
    this.encoreCases.length = 0;
    this.shockwaves.length = 0;
    this.gravityWells.length = 0;
    if (this.fx) this.fx.length = 0;
    this.pendingKick.length = 0;
    this.pendingPulses.length = 0;
    this.recentClapShapes.length = 0;
    this.sandboxChoiceFixtures.length = 0;
    this.overflowGem = null;
    this.overflowMusicNote = null;
    this.noteDropPity = 0;
    this.hash.clear();
    this.queryBuf.length = 0;
  }

  /** Deterministic, idempotent capture setup for visual QA. These presets are
   * frozen developer surfaces: no movement, attacks, pickups, or contact can
   * mutate the named scene until a manual Sandbox action resumes simulation. */
  applySandboxVisualPreset(id: SandboxVisualPresetId): SandboxPresetState {
    return this.applySandboxVisualPlan(sandboxVisualPresetPlan(id));
  }

  applySandboxMax360Variant(
    id: SandboxMax360VariantId,
    includeCaptureFixtures = false,
  ): SandboxPresetState {
    return this.applySandboxVisualPlan(sandboxMax360VariantPlan(id), includeCaptureFixtures);
  }

  private applySandboxVisualPlan(
    plan: SandboxVisualPresetPlan,
    includeCaptureFixtures = false,
  ): SandboxPresetState {
    this.clearSandboxEntities();
    this.rng = mulberry32(plan.seed);
    this.nextEnemyId = 1;
    this.enemyFrameCounters = {};
    this.level = plan.level;
    this.xp = 0;
    this.timeS = plan.minute * 60;
    this.lastMinute = plan.minute - 1;
    this.endlessMinute = -1;
    this.endlessNextSpawnT = this.timeS;
    // The camera follows the declared player ground point, so this places that
    // point exactly at world origin for every fixed capture.
    this.player.x = -PLAYER_FOOT_OFFSET.x;
    this.player.y = -PLAYER_FOOT_OFFSET.y;
    this.player.hp = this.playerMaxHp;
    this.player.iframesT = 0;
    this.player.facingX = 1;

    for (const fixture of plan.enemies) {
      const conf = ENEMIES[fixture.kind];
      const spawnClass = conf.boss
        ? 'boss'
        : conf.fixedDirection || fixture.kind === 'flower'
          ? 'event'
          : 'regular';
      const enemy = this.pushEnemy(fixture.kind, fixture.x, fixture.y, spawnClass);
      if (enemy && fixture.headliner) this.makeHeadliner(enemy);
    }
    for (const fixture of plan.pickups) {
      if (fixture.kind === 'xp') this.spawnGemAt(fixture.x, fixture.y, fixture.value);
      else if (fixture.kind === 'note') this.spawnMusicNoteAt(fixture.x, fixture.y, fixture.value);
      else this.encoreCases.push({
        x: fixture.x,
        y: fixture.y,
        minute: plan.minute,
        color: 0xffd45c,
      });
    }
    if (includeCaptureFixtures && plan.id === 'max360') this.installMax360CaptureFixtures();
    this.sandboxChoiceFixtures = plan.choices.map((choice) => {
      const cameraX = this.player.x + PLAYER_FOOT_OFFSET.x;
      const cameraY = this.player.y + PLAYER_FOOT_OFFSET.y;
      const visible =
        Math.abs(choice.x - cameraX) <= this.worldW / 2 - LEVELUP.itemPickupRadius &&
        Math.abs(choice.y - cameraY) <= this.worldH / 2 - LEVELUP.itemPickupRadius;
      const outsidePlayer = Math.hypot(choice.x - this.player.x, choice.y - this.player.y) >
        LEVELUP.itemPickupRadius;
      return {
        id: choice.id,
        mode: choice.mode,
        x: choice.x,
        y: choice.y,
        collectionRadius: LEVELUP.itemPickupRadius,
        reachable: visible && outsidePlayer,
      };
    });
    // Headliner setup emits a banner request; named captures start without
    // transient attacks/effects so exact body counts remain the only density.
    if (this.fx) this.fx.length = 0;
    this.pendingKick.length = 0;
    this.pendingPulses.length = 0;
    this.recentClapShapes.length = 0;
    this.sandboxPresetState = Object.freeze({
      id: plan.id,
      label: plan.label,
      seed: plan.seed,
      frozen: plan.freeze,
    });
    this.sandboxCaptureFrozen = true;
    return this.sandboxPresetState;
  }

  /** Populate the capture packet with real frozen runtime entities. */
  private installMax360CaptureFixtures(): void {
    for (const fixture of MAX360_CAPTURE_FIXTURES) {
      switch (fixture.class) {
        case 'friendly-projectile': {
          const conf = WEAPONS.snare![0];
          const projectile = this.baseProjectile('snare', conf, KIT_COLORS.snare, conf.damage);
          projectile.captureId = fixture.id;
          projectile.x = fixture.worldX;
          projectile.y = fixture.worldY;
          projectile.vx = conf.speed ?? 0;
          projectile.vy = 0;
          this.projectiles.push(projectile);
          break;
        }
        case 'xp':
          this.gems.push({
            captureId: fixture.id,
            x: fixture.worldX,
            y: fixture.worldY,
            xp: 3,
            tier: 'green',
          });
          break;
        case 'music-note':
          this.musicNotes.push({
            captureId: fixture.id,
            x: fixture.worldX,
            y: fixture.worldY,
            value: 3,
            tier: 'phrase',
          });
          break;
        case 'weapon-reward':
          this.encoreCases.push({
            captureId: fixture.id,
            x: fixture.worldX,
            y: fixture.worldY,
            minute: Math.floor(this.timeS / 60),
            color: 0xffd45c,
          });
          break;
        case 'decorative-effect':
          this.shockwaves.push({
            captureId: fixture.id,
            x: fixture.worldX,
            y: fixture.worldY,
            radius: 28,
            maxRadius: 44,
            age: 0,
            lifeS: 2,
            damage: 0,
            shove: 0,
            color: KIT_COLORS.clap,
            source: 'clap',
            hit: new Set(),
          });
          break;
      }
    }
  }

  /** Leave a fixed capture preset and return the existing Sandbox to live
   * simulation. Loadout and spawned fixtures remain intact. */
  resumeSandboxSimulation(): void {
    this.leaveSandboxVisualPreset();
  }

  private leaveSandboxVisualPreset(): void {
    this.sandboxCaptureFrozen = false;
    this.sandboxPresetState = null;
    this.sandboxChoiceFixtures.length = 0;
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
      this.spawnMusicNoteForEnemy(e);
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
    this.leaveSandboxVisualPreset();
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
    if (this.sandboxCaptureFrozen) return;
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
      maxRadius: (fat ? 480 : 360) * area,
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
      bounces: this.buildMods.bounceCount,
      bounceRetention: this.buildMods.bounceRetention,
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
    this.projectiles.push(pr);
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
  ): void {
    const near = this.hash.query(x, y, reach + 24, this.queryBuf);
    for (const e of near) {
      if (e.dead) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = Math.hypot(dx, dy);
      if (d > reach + e.radius) continue;
      if (d < CLAP_POINT_BLANK_RADIUS) {
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
        pr.x += pr.vx * step;
        pr.y += pr.vy * step;
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
      mergedCount: 1,
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
        a.mergedCount += b.mergedCount;
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
    this.leaveSandboxVisualPreset();
    const dropped = Math.max(1, Math.floor(xp));
    const tier: Gem['tier'] = dropped <= 2 ? 'blue' : dropped <= 9 ? 'green' : 'red';
    if (this.gems.length < RUN.maxGems) {
      this.gems.push({ x, y, xp: dropped, tier });
      return;
    }
    if (!this.overflowGem || !this.gems.includes(this.overflowGem)) {
      let farthest: Gem | null = null;
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
      if (!farthest) return;
      this.overflowGem = farthest;
      farthest.tier = 'red';
    }
    this.overflowGem.xp += dropped;
    this.overflowGem.tier = 'red';
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
    this.leaveSandboxVisualPreset();
    const amount = Math.max(1, Math.floor(value));
    const tier: MusicNotePickup['tier'] = amount >= 10 ? 'anthem' : amount >= 3 ? 'phrase' : 'note';
    if (this.musicNotes.length < RUN.maxMusicNotes) {
      this.musicNotes.push({ x, y, value: amount, tier });
      return;
    }
    if (!this.overflowMusicNote || !this.musicNotes.includes(this.overflowMusicNote)) {
      let farthest: MusicNotePickup | null = null;
      let farthestD = -1;
      for (const note of this.musicNotes) {
        const dx = note.x - this.player.x;
        const dy = note.y - this.player.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > farthestD) {
          farthestD = d2;
          farthest = note;
        }
      }
      if (!farthest) return;
      this.overflowMusicNote = farthest;
    }
    this.overflowMusicNote.value += amount;
    this.overflowMusicNote.tier = 'anthem';
  }

  /** Public visual-QA fixture using the same collection object as a dropped
   * Headliner reward. */
  spawnEncoreCaseAt(x: number, y: number, minute = Math.floor(this.timeS / 60)): void {
    this.leaveSandboxVisualPreset();
    this.encoreCases.push({ x, y, minute, color: 0xffd45c });
  }

  private updateGems(dt: number): void {
    const p = this.player;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < RUN.magnetRadius * this.buildMods.magnetMul) {
        const speed = RUN.gemPullSpeed * this.buildMods.pullMul;
        const pull = Math.min(d, speed * dt);
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

  private updateMusicNotes(dt: number): void {
    const p = this.player;
    for (let i = this.musicNotes.length - 1; i >= 0; i--) {
      const note = this.musicNotes[i];
      const dx = p.x - note.x;
      const dy = p.y - note.y;
      const d = Math.hypot(dx, dy);
      if (d < RUN.magnetRadius * this.buildMods.magnetMul * 1.15) {
        const speed = RUN.gemPullSpeed * this.buildMods.pullMul * 1.15;
        const pull = Math.min(d, speed * dt);
        note.x += (dx / (d || 1)) * pull;
        note.y += (dy / (d || 1)) * pull;
      }
      if (d < RUN.pickupRadius + 4) {
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
