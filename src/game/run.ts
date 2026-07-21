// One run's world: player, enemies, projectiles, zones, gems, and the
// coupling point where an engine trigger becomes damage (Model A: one event,
// two outputs). The stage script here is time-driven only and carries no
// musical meaning (the dividing rule, docs/plan.md).
//
// This file is pure simulation: no rendering, input devices, or real-time
// clock. Rendering lives in view.ts, which reads the world each frame.

import { ROLE_COLORS, type Role } from '../audio/kits';
import type { ScheduledTrigger } from '../audio/engine';
import {
  AIM_RANGE,
  MULTISHOT_FAN_RAD,
  CIRCLER,
  DAMAGE_FEEDBACK,
  DARTER,
  ENEMIES,
  BUILD,
  HEALTH_PICKUP,
  MAD_FOREST_FRAMES,
  MAX_ALIVE_HARD,
  PICKUP_PULL,
  RUN,
  STAGE_MAGNET,
  SHIELDED,
  SHOVE_S,
  SPLITTER,
  WORLD_SCALE,
  xpPickupMultiplier,
  xpForNextLevel,
  type EnemyKind,
  type WeaponConf,
} from './config';
import { enemyStats } from './enemy-tuning';
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
  EVOLUTION_BY_ROLE,
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
  type WeaponTarget,
} from './weapons';

/** Source player sprite uses a feet anchor; the stored player position is its
 * circle center. This is the source feet offset normalized to H800. */
export const PLAYER_FOOT_OFFSET = {
  x: 1 * WORLD_SCALE,
  y: 7 * WORLD_SCALE,
} as const;

/** Seconds of no incoming damage that end a burst. The readout hard-resets to
 * zero rather than decaying, so the number on screen is only ever the burst you
 * are doing right now — never a fading ghost of one that already ended. */
const DUMMY_DPS_IDLE_RESET = 5;
/** Seconds of airtime credited to a burst's FIRST hit, so one landed trigger
 * reads as a rate instead of a divide-by-zero spike. Weapons fire on the beat
 * grid, and a beat at 122 BPM is ~0.49s, so a hit is credited the beat it
 * arrived on: land 100 every beat and the readout says 200 from the very first
 * hit and stays there. Slower weapons still start high and settle within a
 * trigger or two. */
const DUMMY_DPS_LEAD_IN = 0.5;

/** What the gold amped roll is worth on top of an ordinary enemy's scaled
 *  stats. Named because two places apply it: the spawn, and the enemy lab's
 *  live retune, which must rebuild the same enemy it would have spawned. */
const AMPED = { hpMul: 2.2, damageMul: 1.25, xpMul: 3 };

/** Per-dummy damage bookkeeping behind the floating readout. */
interface DummyReadout {
  /** Cumulative damage taken since spawn. */
  total: number;
  /** Whether a burst is open — i.e. damage has landed and DUMMY_DPS_IDLE_RESET
   *  has not elapsed since. False on a fresh dummy and after every reset. */
  bursting: boolean;
  /** Damage taken since the current burst's first hit. */
  burstDamage: number;
  /** Seconds since the current burst's first hit. Advances every frame, but is
   *  only ever READ when a hit lands, so it cannot move the displayed number on
   *  its own. */
  burstT: number;
  /** Seconds since the last hit landed. */
  idleT: number;
  /** The displayed damage per second. Recomputed ONLY when damage lands; held
   *  perfectly still between hits, and zeroed outright when a burst times out.
   *  Nothing else may write this. */
  dps: number;
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
  /** HP this enemy spawned with, after every scale that applied to it. Restores
   *  a practice dummy after each hit, and lets the enemy lab retune a live
   *  horde without healing it — the wounded stay proportionally wounded. */
  spawnHp: number;
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
  /** The shared SLOW channel: time left slowed, and the speed multiplier while
   *  it lasts. Written only through WeaponContext.slow — which folds the
   *  multiplier in with min() and assigns the timer — and consumed in
   *  moveEnemies, which resets the multiplier to 1 the frame the timer runs
   *  out. Chord zones are the only writer today; the channel itself is shared
   *  physics and is not any one weapon's. */
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
  /** Took the elite boss health multiplier on top of its minute scale. Part of
   *  the spawn identity so retuneAliveEnemies can rebuild this enemy exactly. */
  eliteScaled: boolean;
  /** The body scale this enemy was built at, so a size edit can rescale its
   *  radius and foot offsets by ratio rather than re-deriving a frame body it
   *  no longer remembers which frame it drew. */
  sizeMul: number;
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
  /** Total time alive. Behavior otherwise keys off FIELDS, never off role: a
   *  seeker homes because `homing` is true, an orbiter orbits because its
   *  module steers it. */
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
  /** A body this homing shot has been locked onto, or null to chase whatever
   *  is nearest each frame (the default). A volley of seekers spawned within a
   *  few degrees of each other would otherwise all compute the SAME nearest
   *  enemy and converge into one overlapping blob, which is what made Double
   *  Take invisible on the lead (#131). Locking is per shot, so the loop still
   *  asks the shot rather than the weapon. Cleared automatically once the
   *  target dies or this shot has already hit it, so a seeker never strands
   *  itself on a body it can no longer damage. */
  homingTarget: Enemy | null;
  bounces: number;
  bounceRetention: number;
  evolved: boolean;
  /** How fast a homing shot may turn, radians per second. Meaningful only when
   *  `homing` is set, so every value that reaches it comes from the spawner
   *  that armed the shot (weapons/lead.ts). */
  turnRate: number;
  orbitDir: 1 | -1;
}

/** A shot as SHARED PHYSICS is allowed to see it: everything except which
 *  weapon fired it.
 *
 *  #140 established that shared projectile physics contains zero per-weapon
 *  branches, and `553c0d9` backed it with a text scan of this file. A text scan
 *  cannot win that argument — `const { role: rr } = pr`, `pr['role']` and, most
 *  ordinarily, moving a branch one call frame away into a new helper all pass a
 *  green scan. The writer always has another spelling.
 *
 *  So the rule stopped being a scan and became a TYPE. The shared step below
 *  takes this, not a Projectile: `pr.role` is not a property that exists, and a
 *  per-weapon branch is a compile error rather than a review finding. Helper
 *  extraction — the bypass a scan is weakest against — inherits the guarantee,
 *  because any helper the step can hand `pr` to has this same role-free type. */
export type ProjectileView = Omit<Projectile, 'role'>;

/** The seam between shared physics and the weapon that owns a shot.
 *
 *  #148's open question was where the GENUINELY generic uses of role go once
 *  the loop cannot see role: the module hooks and damage attribution. They go
 *  here. Each is a closure resolved from the role ONCE, at the top of the
 *  shot's frame, and NONE of them hands the role back — there is deliberately
 *  no `role` field on this interface, because one would re-open every hole the
 *  projection just closed (`if (owner.role === 'lead')` compiles fine).
 *
 *  The widening cast back to Projectile lives inside these three methods and
 *  nowhere else. Modules legitimately see role, so the projection stops at this
 *  seam rather than propagating into ProjectileBehavior. */
interface ProjectileOwner {
  /** ProjectileBehavior.steer, or false when the weapon has no opinion. */
  steer(pr: ProjectileView, dt: number): boolean;
  /** ProjectileBehavior.onHit, or true (spend pierce) when there is no hook. */
  onHit(pr: ProjectileView, target: Enemy): boolean;
  /** damageEnemy with this weapon's attribution already bound. */
  damage(target: Enemy, amount: number): void;
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
  /** Bodies this ring has already crossed, so each takes its damage once.
   *  Typed as the weapon-facing view because the owning weapon module (#141)
   *  is the only code that reads or writes it — the world just carries it. */
  hit: Set<WeaponTarget>;
}

/** A treasure chest dropped by a defeated elite/boss enemy. Walking into it
 *  starts the shell's slot ceremony (game.ts): a ready weapon evolution is the
 *  top prize, otherwise 1/3/5 free level-ups of owned weapons and passives. */
export interface Chest {
  x: number;
  y: number;
  color: number;
  /** Sandbox-only: pin the slot payout size instead of rolling it, so the
   *  panel can put a specific ceremony (e.g. the ×5 jackpot) on demand. */
  forceSize?: 1 | 3 | 5;
}

export interface Gem {
  x: number;
  y: number;
  xp: number;
  tier: 'blue' | 'green' | 'red';
  /** Set only by a collected Stage Magnet; later drops remain unaffected. */
  vacuumed?: boolean;
  /** Seconds since this gem committed to flying at the player; undefined until
   * then. Drives the wind-back curve (`advancePickupPull`). */
  pullT?: number;
}

export interface MusicNotePickup {
  x: number;
  y: number;
  value: number;
  tier: 'note' | 'phrase' | 'anthem';
  /** Set only by a collected Stage Magnet; later drops remain unaffected. */
  vacuumed?: boolean;
  /** Seconds since this note committed to flying at the player; undefined
   * until then. Drives the wind-back curve (`advancePickupPull`). */
  pullT?: number;
}

export interface StageMagnetPickup {
  x: number;
  y: number;
}

/** Rare floor heal. Deliberately NOT vacuumed by a Stage Magnet: crossing a
 * dangerous arena to reach it is the decision this pickup exists to create,
 * the same reason chests are left alone. It carries no lifetime — a heal the
 * player has not needed yet stays on the floor until they want it. */
export interface HealthPickup {
  x: number;
  y: number;
}

export interface VacuumResult {
  gems: number;
  notes: number;
}

/** Anything that flies at the player once pulled: gems and music notes. */
interface PulledPickup {
  x: number;
  y: number;
  pullT?: number;
}

/** Moves one pickup along the wind-back curve (`PICKUP_PULL`) and returns the
 * distance still separating it from the player, which is what the caller's
 * collection test reads.
 *
 * The whole curve is a single SIGNED speed along the direction to the player,
 * recomputed from live positions every frame: negative while winding back,
 * then ramping positive for the rush. Because the direction is re-derived
 * rather than stored, the pickup keeps homing on a moving player and can never
 * orbit or drift past them, and the step is clamped so it never overshoots. */
function advancePickupPull(
  pickup: PulledPickup,
  px: number,
  py: number,
  topSpeed: number,
  dt: number,
): number {
  const dx = px - pickup.x;
  const dy = py - pickup.y;
  const d = Math.hypot(dx, dy) || 1e-6;
  const t = (pickup.pullT ?? 0) + dt;
  pickup.pullT = t;
  const { windbackTime, windbackSpeed, rushRampTime } = PICKUP_PULL;
  // Both phases ease through zero at the turnaround, so there is no visible
  // corner where the pickup stops going out and starts coming in.
  const speed = t < windbackTime
    ? -windbackSpeed * (1 - t / windbackTime)
    : Math.min(topSpeed, (topSpeed / rushRampTime) * (t - windbackTime));
  const step = Math.min(speed * dt, d);
  pickup.x += (dx / d) * step;
  pickup.y += (dy / d) * step;
  return d - step;
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
  /** One XP gem picked up. Fires per gem, including during a Stage Magnet
   *  vacuum — the audio cue does its own throttling (GEM_CUE.minGapS).
   *  `levelProgress` is 0..1 toward the next level, clamped: the gem that
   *  triggers a level-up reports 1, so the cue peaks and the level chime
   *  takes over from there. */
  onGemCollected?(xp: number, levelProgress: number): void;
  onStageMagnet?(result: VacuumResult): void;
  onHealthPickup?(healed: number): void;
  onMilestone?(id: 'first5m' | 'fullBand' | 'firstEvolution'): void;
}

// KIT_COLORS IS GONE (#141). It was a sixteen-entry table of weapon hues living
// here, character for character the same values as ROLE_META in audio/kits.ts —
// two sources of truth for "the weapon's colour" that nothing checked against
// each other. ROLE_META is the single one now, and ROLE_COLORS is its packed
// 0xRRGGBB view, DERIVED from it rather than typed out again.

export interface RunWorldOpts {
  /** False in the sandbox: no stage script, no waves, no victory timer. */
  scripted?: boolean;
  /** Optional seeded randomness for deterministic development fixtures. */
  rng?: Rng;
  /** Independent rare-drop stream; injectable only for deterministic checks. */
  stageMagnetRng?: Rng;
  healthPickupRng?: Rng;
  /** Movement axis provider (magnitude 0..1). */
  control?: () => { x: number; y: number };
  /** False for non-visual fixtures that do not consume effects. */
  fx?: boolean;
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
  readonly healthPickups: HealthPickup[] = [];
  readonly shockwaves: Shockwave[] = [];
  readonly chests: Chest[] = [];

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
  /** Its own stream, so this pickup cannot shift Stage Magnet luck. */
  private readonly healthPickupRng: Rng;
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
    this.healthPickupRng = opts.healthPickupRng ?? mulberry32(magnetSeed ^ 0x48454154);
    this.control = opts.control ?? (() => ({ x: 0, y: 0 }));
    this.fx = (opts.fx ?? true) ? [] : null;
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
   *  to a mutable Enemy — five casts, one file, all inside effects the world
   *  implements. */
  private makeWeaponContext(role: Role): WeaponContext {
    const world = this;
    const color = ROLE_COLORS[role];
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
      moveDir: () => world.moveDir(),
      fanAround: (base) => world.fanAround(base),
      near: (x, y, r) => world.hash.query(x, y, r, buf),
      nearestEnemies: (range, count) => world.nearestEnemies(range, count),
      all: () => world.enemies,
      damage: (t, amount) => world.damageEnemy(t as Enemy, amount, role),
      shove: (t, fx, fy, d) => world.shove(t as Enemy, fx, fy, d),
      setKnock: (t, vx, vy, s) => {
        const e = t as Enemy;
        e.knockX = vx;
        e.knockY = vy;
        e.knockT = s;
      },
      lockSeeker: (pr, target) => { pr.homingTarget = (target as Enemy | null) ?? null; },
      withExtraPierce: (basePierce) => world.withExtraPierce(basePierce),
      slow: (t, mul, durationS) => {
        const e = t as Enemy;
        e.slowT = durationS;
        e.zoneSlowMul = Math.min(e.zoneSlowMul, mul);
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
      // Shockwave storage stays world-side for the same reason projectile
      // storage does: view.ts draws world.shockwaves and clearSandboxEntities
      // empties it. The world owns the ARRAY; the module owns everything that
      // happens to what is in it. There is no world-side shockwave loop.
      spawnShockwave: (spec) => {
        const wave: Shockwave = {
          x: spec.x,
          y: spec.y,
          radius: spec.radius,
          maxRadius: spec.maxRadius,
          age: 0,
          lifeS: spec.lifeS,
          damage: spec.damage,
          shove: spec.shove,
          color,
          source: role,
          hit: new Set(),
        };
        world.shockwaves.push(wave);
        return wave;
      },
      shockwaves: () => world.shockwaves.filter((wave) => wave.source === role),
      retireShockwave: (wave) => {
        const index = world.shockwaves.indexOf(wave);
        if (index >= 0) world.shockwaves.splice(index, 1);
      },
      // Zone storage stays world-side for the third time and the same reason:
      // view.ts draws world.zones and clearSandboxEntities empties it. The
      // world owns the ARRAY; weapons/chord.ts owns everything that happens to
      // what is in it. There is no world-side zone loop.
      spawnZone: (spec) => {
        const zone: Zone = {
          x: spec.x,
          y: spec.y,
          radius: spec.radius,
          damage: spec.damage,
          lifeS: spec.lifeS,
          // The world's own bookkeeping, and behavior: a zone starts its timer
          // at zero, so it lands one tick on the first frame it exists.
          tickT: 0,
          color,
          source: role,
          slow: spec.slow,
          evolved: spec.evolved,
          driftSpeed: spec.driftSpeed,
          slowMul: spec.slowMul,
        };
        world.zones.push(zone);
        return zone;
      },
      zones: () => world.zones.filter((zone) => zone.source === role),
      retireZone: (zone) => {
        const index = world.zones.indexOf(zone);
        if (index >= 0) world.zones.splice(index, 1);
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
      this.healPlayer(paddedJacketHeal(previous, next));
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

  /** The one place player health goes up. Callers pass how much they want to
   *  restore and get back how much actually landed; overheal is this method's
   *  problem, never the caller's. */
  healPlayer(amount: number): number {
    const before = this.player.hp;
    this.player.hp = Math.min(this.playerMaxHp, this.player.hp + Math.max(0, amount));
    return this.player.hp - before;
  }

  applyEncoreChoice(kind: 'heal' | 'damage' | 'move' | 'area'): void {
    if (kind === 'heal') this.healPlayer(15);
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

    // Single build-transform pipeline (D1): tempo compensation, folded in one
    // place — balance code multiplies here.
    conf = this.applyBuild(conf);
    this.triggerCounts[t.role] = (this.triggerCounts[t.role] ?? 0) + 1;

    // A weapon owns its whole identity behind the weapon context. THE SWITCH
    // THAT USED TO STAND HERE IS GONE (#141), and with it the last
    // weapon-specific line in this file. A role with no module simply does
    // nothing, which is the honest answer — there is no half-owned weapon left
    // for the world to finish off.
    this.weapons.get(t.role)?.fire(this.weaponCtx.get(t.role)!, conf);
  }

  /** Add a weapon or raise its tier. The pulse fires when the change lands
   *  (next-bar entry), so eye and ear agree on the moment.
   *
   *  `tiers` doubles as the slot order the rack and the number keys read, so
   *  this must only ever append: `Map.set` on a role already present raises
   *  its tier WITHOUT moving it, which is exactly the wanted behaviour. */
  addWeapon(role: Role, tier = 1): void {
    this.tiers.set(role, tier);
    this.spawnRing(this.player.x, this.player.y, 220, ROLE_COLORS[role], 0.6);
    if (this.tiers.size >= BUILD.weaponCap) this.markMilestone('fullBand');
  }

  /** Sandbox loadout editor: drop a weapon entirely. */
  removeWeapon(role: Role): void {
    this.tiers.delete(role);
  }

  /** Sandbox-only evolve that IGNORES THE RECIPE ENTIRELY — no tier gate, no
   *  maxed partner passive, no eligibility check. `evolve` above is the real
   *  one and keeps every rule; this exists so the panel can put an evolved
   *  weapon on the field to look at it.
   *
   *  The sandbox used to reach the same place through `evolve` by force-setting
   *  the partner item to max first, which satisfied the gate but SILENTLY
   *  CHANGED THE BUILD IT WAS ABOUT TO MEASURE: maxing Heavy Amp to see
   *  Subquake also bought its damage and area, so the ring under test was not
   *  the ring a player would get. Testing an evolution should cost nothing but
   *  the evolution.
   *
   *  Deliberately does NOT count toward evolutionsMade / evolutionsByRole or
   *  mark the firstEvolution milestone. Those feed career progression, and a
   *  dev button must not write to it. */
  evolveForSandbox(role: Role): EvolutionDefinition | null {
    const evolution = EVOLUTION_BY_ROLE[role];
    if (!evolution || this.evolved.has(role)) return null;
    this.evolved.add(role);
    this.fx?.push({ type: 'evolution', x: this.player.x, y: this.player.y, color: evolution.color, label: evolution.name });
    this.spawnRing(this.player.x, this.player.y, 320, 0xffdf74, 1);
    return evolution;
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
    this.tickWeapons('pinches', dt);
    this.updateProjectiles(dt);
    this.tickWeapons('zones', dt);
    this.tickWeapons('shockwaves', dt);
    this.updateStageMagnets();
    this.updateHealthPickups();
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
    this.healPlayer(rate * dt);
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
    enemy.spawnHp *= extraHp;
    enemy.shieldHp *= extraHp;
    enemy.eliteScaled = true;
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
    // Tuned, not shipped: the enemy lab's overrides are the live truth for
    // every spawn (see enemy-tuning.ts).
    const stats = enemyStats(kind, this.level);
    const body = this.nextEnemyBody(kind, stats.radius, stats.sizeMul);
    const minute = Math.floor(this.timeS / 60);
    const scale = endlessScale(minute);
    const dummy = kind === 'dummy';
    // A measurement prop must look identical whenever it is spawned: no gold
    // amped outline, no band danger diamonds, no minute-scaled stats drift.
    const amped = !dummy && spawnClass === 'regular' && minute >= 12 &&
      this.rng() < scale.ampedChance;
    const scaledHp = stats.hp * scale.hpMul * (amped ? AMPED.hpMul : 1);
    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      x: x - body.footOffsetX,
      y: y - body.footOffsetY,
      radius: body.radius,
      footOffsetX: body.footOffsetX,
      footOffsetY: body.footOffsetY,
      hp: scaledHp,
      spawnHp: scaledHp,
      speed: stats.speed * scale.speedMul,
      damage: stats.damage * scale.damageMul * (amped ? AMPED.damageMul : 1),
      xp: stats.xp * scale.xpMul * (amped ? AMPED.xpMul : 1),
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
      eliteScaled: false,
      sizeMul: stats.sizeMul,
      prevX: x - body.footOffsetX,
      prevY: y - body.footOffsetY,
      dummy,
      readout: dummy
        ? {
            total: 0,
            bursting: false,
            burstDamage: 0,
            burstT: 0,
            idleT: 0,
            dps: 0,
          }
        : null,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  /** sizeMul scales the finished body — radius and the foot offsets together —
   *  so a resized enemy keeps standing on its own feet instead of sinking into
   *  or floating above the floor. It is applied AFTER the source's floor(), so
   *  parity with the legacy collider is exact whenever sizeMul is 1. */
  private nextEnemyBody(
    kind: EnemyKind,
    fallback: number,
    sizeMul = 1,
  ): { radius: number; footOffsetX: number; footOffsetY: number } {
    const frames = MAD_FOREST_FRAMES[kind];
    if (!frames || frames.length === 0) {
      return { radius: fallback * sizeMul, footOffsetX: 0, footOffsetY: 0 };
    }
    const counter = this.enemyFrameCounters[kind] ?? 0;
    this.enemyFrameCounters[kind] = counter + 1;
    const frame = frames[counter % frames.length];
    const requestedRadius = frame.width * 0.4;
    const effectiveRadius = Math.floor(requestedRadius);
    const scale = WORLD_SCALE * sizeMul;
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

  /** The enemy lab edited a kind: bring the horde already on screen in line
   *  instead of making the designer clear and respawn to feel a slider.
   *
   *  Each enemy is rebuilt from its own spawn identity — spawn minute, amped
   *  roll, elite scaling — so a tuned number lands on a live enemy exactly as
   *  it would on a fresh one. Health is moved by RATIO, so a nearly-dead enemy
   *  does not heal when you nudge its max HP, and a shielded enemy keeps the
   *  dent already in its shield.
   *
   *  One deliberate inexactness: hpPerLevel kinds re-derive against the
   *  CURRENT player level, not the level they spawned at. "What would this
   *  enemy be if it spawned now" is the question the lab is asking. */
  retuneAliveEnemies(): void {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const stats = enemyStats(e.kind, this.level);
      const scale = endlessScale(e.spawnMinute);
      const fullHp =
        stats.hp * scale.hpMul *
        (e.amped ? AMPED.hpMul : 1) *
        (e.eliteScaled ? scale.bossHpMul : 1);
      const hpRatio = e.spawnHp > 0 ? fullHp / e.spawnHp : 1;
      e.spawnHp = fullHp;
      e.hp *= hpRatio;
      e.shieldHp *= hpRatio;
      e.speed = stats.speed * scale.speedMul;
      e.damage = stats.damage * scale.damageMul * (e.amped ? AMPED.damageMul : 1);
      e.xp = stats.xp * scale.xpMul * (e.amped ? AMPED.xpMul : 1);
      e.knockbackMul = stats.knockback;
      if (stats.sizeMul !== e.sizeMul) {
        const sizeRatio = e.sizeMul > 0 ? stats.sizeMul / e.sizeMul : 1;
        e.radius *= sizeRatio;
        e.footOffsetX *= sizeRatio;
        e.footOffsetY *= sizeRatio;
        e.sizeMul = stats.sizeMul;
      }
    }
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
    this.healthPickups.length = 0;
    this.chests.length = 0;
    this.shockwaves.length = 0;
    if (this.fx) this.fx.length = 0;
    for (const inst of this.weapons.values()) inst.reset();
    this.overflowGem = null;
    this.overflowMusicNote = null;
    this.noteDropPity = 0;
    this.stageMagnetDropPity = 0;
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
          color: source ? ROLE_COLORS[source] : 0xcfd2e0,
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
      const r = e.readout;
      r.total += landed;
      // Open a burst on the first hit after a quiet stretch. updateDummies has
      // already zeroed the carried state, so this only has to raise the flag.
      r.bursting = true;
      r.burstDamage += landed;
      r.idleT = 0;
      // The ONE place the displayed number moves. Every hit of a single trigger
      // lands in the same frame, so a pierce or an AoE sweep folds into one
      // credited beat rather than inflating the rate.
      r.dps = r.burstDamage / (r.burstT + DUMMY_DPS_LEAD_IN);
      if (source) this.damageByRole[source] = (this.damageByRole[source] ?? 0) + landed;
      e.hp = e.spawnHp;
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
      this.spawnGemAt(e.x, e.y, e.xp);
      this.spawnMusicNoteForEnemy(e);
      this.spawnStageMagnetForEnemy(e);
      this.spawnHealthPickupForEnemy(e);
      // Elite and boss enemies (Vampire-Survivors style) drop a chest on the
      // ground. Walk into it to open it: a ready weapon evolution, or health.
      if (elite) {
        this.spawnChestAt(e.x, e.y);
      }
      if (e.kind === 'splitter') this.spawnChildren(e);
    }
  }

  /** Time out any practice target's burst that has gone quiet.
   *
   *  This deliberately does NOT touch `dps` except to zero it at the timeout.
   *  The readout used to be a rolling window whose buckets rotated here, which
   *  meant it slid toward zero the moment you stopped shooting — a number that
   *  moves while nothing is happening cannot be trusted at a glance. Now it
   *  holds its last value until either a hit rewrites it or the burst expires. */
  private updateDummies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.dummy || e.dead || !e.readout) continue;
      const r = e.readout;
      if (!r.bursting) continue;
      r.burstT += dt;
      r.idleT += dt;
      if (r.idleT >= DUMMY_DPS_IDLE_RESET) {
        r.bursting = false;
        r.burstDamage = 0;
        r.burstT = 0;
        r.dps = 0;
      }
    }
  }

  /** The frozen readout: the damage per second of the burst in progress, or 0
   *  if none is. A pure read — the value is written by takeDamage and by the
   *  timeout in updateDummies, never computed here. */
  dummyDps(e: Enemy): number {
    return e.readout?.dps ?? 0;
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

  // The clap left this file with the clap module (#141), and it took more than
  // its own tuning: the pincer type, the pincer array, the queue's reset, and
  // the world's damageCone and damageArea helpers all went with it, since Two
  // Hands and the base cone were their last callers. What remains is the
  // GENERIC query nearestEnemies, below with the world's other aiming queries,
  // which the module reaches through ctx.nearestEnemies.

  // Shockwaves left this file with the bass module (#141). The world still
  // STORES them — view.ts draws world.shockwaves and clearSandboxEntities
  // empties it — but it no longer spawns, grows, resolves or retires one:
  // weapons/bass.ts owns all four through ctx.spawnShockwave / ctx.shockwaves /
  // ctx.retireShockwave, and its tick() runs in the 'shockwaves' phase where
  // updateShockwaves used to stand.

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
   *  consulting nearestEnemy; reached from a module through
   *  WeaponContext.fanAround. */
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

  /** The player's walk heading as a unit vector. No targeting, no jitter, no
   *  rng draw: two triggers while holding one direction produce the exact same
   *  angle. The hat's whole aim, reached through WeaponContext.moveDir. */
  private moveDir(): { x: number; y: number } {
    return { x: this.player.moveDirX, y: this.player.moveDirY };
  }

  /** Base projectile with all fields defaulted; specialized spawners tweak
   *  the few that matter to them.
   *
   *  THE HOMING TRIO BELOW IS INERT HERE. `homing` was `role === 'lead'` until
   *  the lead module took it (#141); it is plain false now, and a shot that
   *  homes says so itself. `turnRate` and `homingRange` are only ever read
   *  while `homing` is set, and every spawner that sets it also sets them
   *  (weapons/lead.ts sets all three). Do not read these two as any weapon's
   *  tuning — a weapon's numbers live in its own stats block. */
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
      homing: false,
      homingTarget: null,
      speed: conf.speed ?? 0,
      color,
      hit: new Set(),
      age: 0,
      orbitAngle: 0,
      orbitRadius: 0,
      rehitT: 0,
      bounces: this.buildMods.bounceCount,
      bounceRetention: this.buildMods.bounceRetention,
      evolved: this.evolved.has(role),
      turnRate: 10,
      orbitDir: 1,
      homingRange: Infinity,
    };
  }

  /** Every projectile enters the world here so the live-shot ceiling holds
   *  regardless of which weapon spawned it. */
  private pushProjectile(projectile: Projectile): void {
    if (this.projectiles.length >= RUN.maxProjectiles) {
      // Retire the oldest live shot rather than splicing it out. A weapon can
      // reach here from inside updateProjectiles' downward loop, so removing an
      // element now would renumber every index below the cursor; the normal
      // lifeS <= 0 sweep collects it instead. Appending is safe either way: new
      // shots land above the cursor and wait a frame.
      for (const live of this.projectiles) {
        if (live.lifeS > 0) {
          live.lifeS = 0;
          break;
        }
      }
    }
    this.projectiles.push(projectile);
  }

  // No weapon-specific method survives in this file (#141): the shared-physics
  // guard's protected set watches only the two loops that are genuinely shared
  // by every weapon.

  /** The SHARED projectile loop. It owns travel, arena rails, the hit pass and
   *  the pierce rule for EVERY weapon, and — since #140 — it contains no
   *  per-weapon branch at all. Weapon-specific motion belongs to the owning
   *  weapon module, which lends it back through ProjectileBehavior; anything
   *  else a shot needs is a FIELD ON THE SHOT, set by whatever spawned it.
   *  Adding a `pr.role === '...'` here is the thing this loop exists not to do. */
  /** The ONE place a shot's role is read on its way into shared physics.
   *
   *  Cached per role: the loops run every frame over every live shot, and the
   *  projection must not cost an allocation per shot per frame (#148 asked).
   *  The closures resolve `weapons` and `weaponCtx` at call time, which is the
   *  same answer the old inline lookups gave — neither map is mutated during an
   *  update, only by addWeapon/evolve between them. */
  private readonly projectileOwners = new Map<Role, ProjectileOwner>();

  private ownerOf(role: Role): ProjectileOwner {
    const cached = this.projectileOwners.get(role);
    if (cached) return cached;
    // The widening cast back to the full Projectile lives here, at the seam,
    // and is the only one: a module is entitled to see the role of the shot it
    // owns. What it must not do is reach shared physics, and it cannot.
    const owner: ProjectileOwner = {
      steer: (pr, dt) =>
        this.projectileBehavior(role)?.steer?.(this.weaponCtx.get(role)!, pr as Projectile, dt)
          ?? false,
      onHit: (pr, target) =>
        this.projectileBehavior(role)?.onHit?.(this.weaponCtx.get(role)!, pr as Projectile, target)
          ?? true,
      damage: (target, amount) => this.damageEnemy(target, amount, role),
    };
    this.projectileOwners.set(role, owner);
    return owner;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const shot = this.projectiles[i];
      // Role is read HERE, once, and does not travel any further.
      if (this.stepProjectile(shot, this.ownerOf(shot.role), dt)) this.projectiles.splice(i, 1);
    }
  }

  /** Shared projectile physics. Returns true when the shot is spent.
   *
   *  THE ZERO-BRANCHES RULE IS THIS SIGNATURE. `pr` has no `role` and `owner`
   *  hands none back, so there is no per-weapon branch to write here — see
   *  ProjectileView. Anything a weapon needs to do differently goes through one
   *  of the two ProjectileBehavior hooks or a field its own spawner set. */
  private stepProjectile(pr: ProjectileView, owner: ProjectileOwner, dt: number): boolean {
    const step = dt;
    const travelStep = step;
    pr.age += step;
    pr.lifeS -= step;

    // A module that steers its own shots positions them itself, which skips
    // shared travel AND the arena rails together (the arp's two ADR-0002
    // exemptions). No module, or a module that only nudged velocity: shared
    // motion runs, exactly as it always has.
    const steered = owner.steer(pr, step);
    if (!steered) {
      if (pr.homing) {
        let best: Enemy | null = null;
        // A locked target outranks the nearest-body search until it dies or
        // this shot has already hit it, at which point the lock clears and the
        // seeker resumes chasing whatever is closest.
        const locked = pr.homingTarget;
        if (locked && !locked.dead && !pr.hit.has(locked)) {
          best = locked;
        } else {
          pr.homingTarget = null;
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
      owner.damage(e, pr.damage);
      const spendsPierce = owner.onHit(pr, e);
      if (!spendsPierce) continue;
      pr.pierce -= 1;
      if (pr.pierce <= 0) {
        pr.lifeS = 0;
        break;
      }
    }

    return pr.lifeS <= 0;
  }

  /** Arena rails. Only ever reached from the shared-travel path, so a shot a
   *  module steered itself never gets here — which is how the arp's rail
   *  exemption survives without naming the arp. */
  private reflectProjectileFromArena(projectile: ProjectileView): void {
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

  // Zones left this file with the chord module (#141). The world still STORES
  // them — view.ts draws world.zones and clearSandboxEntities empties it — but
  // it no longer spawns, ticks, drifts, merges or retires one: weapons/chord.ts
  // owns all of it through ctx.spawnZone / ctx.zones / ctx.retireZone, and its
  // tick() runs in the 'zones' phase where updateZones used to stand. That
  // method was inside the shared-physics guard's protected set, so this is the
  // first extraction that shrank the guard rather than working around it.

  // ---- pickups and juice ----

  /** A kill drops a gem worth exactly the enemy's XP, as VS does (spec §7).
   * There is no random roll and no integer floor, so fractional authored
   * values (ghost 1.5, mudmen 2.5) reach the player intact. */
  spawnGemAt(x: number, y: number, xp = 1): void {
    if (xp <= 0) return;
    const tier: Gem['tier'] = xp <= 2 ? 'blue' : xp <= 9 ? 'green' : 'red';
    if (this.gems.length < RUN.maxGems) {
      this.gems.push({ x, y, xp, tier });
      return;
    }
    if (!this.overflowGem || !this.gems.includes(this.overflowGem) || this.overflowGem.vacuumed) {
      // Prefer the farthest gem the player has not been given yet: a Stage
      // Magnet is a point-in-time snapshot, and merging into an object already
      // travelling in that snapshot hands the reward over almost immediately.
      let farthest: Gem | null = null;
      let farthestD = -1;
      // A map-wide vacuum flags every gem at once, so "all inbound" is the
      // normal case during a magnet, not an edge case. Fall back to the
      // nearest inbound gem rather than growing the array past maxGems.
      let nearestInbound: Gem | null = null;
      let nearestInboundD = Infinity;
      for (const gem of this.gems) {
        const dx = gem.x - this.player.x;
        const dy = gem.y - this.player.y;
        const d2 = dx * dx + dy * dy;
        if (gem.vacuumed) {
          if (d2 < nearestInboundD) {
            nearestInboundD = d2;
            nearestInbound = gem;
          }
          continue;
        }
        if (d2 > farthestD) {
          farthestD = d2;
          farthest = gem;
        }
      }
      const target = farthest ?? nearestInbound;
      // gems.length === maxGems here, and maxGems is >= 1, so one of the two
      // always exists. Bail rather than exceed the cap if that ever changes.
      if (!target) return;
      this.overflowGem = target;
      target.tier = 'red';
    }
    this.overflowGem.xp += xp;
    this.overflowGem.tier = 'red';
  }

  private spawnStageMagnetForEnemy(enemy: Enemy): void {
    this.stageMagnetDropPity += 1;
    const guaranteed = this.stageMagnetDropPity >= STAGE_MAGNET.pityKills;
    if (!guaranteed && this.stageMagnetRng() >= STAGE_MAGNET.dropChance) return;
    this.stageMagnetDropPity = 0;
    this.spawnStageMagnetAt(
      enemy.x - enemy.radius * 0.24,
      enemy.y - enemy.radius * 0.32,
    );
  }

  /** Public Sandbox fixture; normal runs receive Stage Magnets only from
   * enemy deaths. Any number may wait on the floor, for as long as the player
   * leaves them there. */
  spawnStageMagnetAt(x: number, y: number): StageMagnetPickup {
    const magnet = { x, y };
    this.stageMagnets.push(magnet);
    this.fx?.push({ type: 'spark', x, y, color: 0xa06bff, n: 8, spread: 22 });
    return magnet;
  }

  /** One flat probability per eligible kill. No cooldown, no floor cap, no
   *  full-health suppression: a lucky streak may drop three in a row, and a
   *  heal that lands while the player is healthy is theirs to leave and come
   *  back for. */
  private spawnHealthPickupForEnemy(enemy: Enemy): void {
    if (this.healthPickupRng() >= HEALTH_PICKUP.dropChance) return;
    this.spawnHealthPickupAt(
      enemy.x + enemy.radius * 0.22,
      enemy.y - enemy.radius * 0.3,
    );
  }

  /** Public Sandbox fixture; normal runs receive these only from enemy deaths. */
  spawnHealthPickupAt(x: number, y: number): HealthPickup {
    const pickup: HealthPickup = { x, y };
    this.healthPickups.push(pickup);
    this.fx?.push({ type: 'spark', x, y, color: 0xff665a, n: 8, spread: 22 });
    return pickup;
  }

  /** Walk-onto collection only, and no ageing: these sit until collected. */
  private updateHealthPickups(): void {
    for (let i = this.healthPickups.length - 1; i >= 0; i--) {
      const pickup = this.healthPickups[i];
      const dx = this.player.x - pickup.x;
      const dy = this.player.y - pickup.y;
      if (dx * dx + dy * dy > HEALTH_PICKUP.pickupRadius * HEALTH_PICKUP.pickupRadius) continue;
      this.healthPickups.splice(i, 1);
      const healed = this.healPlayer(this.playerMaxHp * HEALTH_PICKUP.healFraction);
      this.fx?.push({ type: 'pressure', x: this.player.x, y: this.player.y, color: 0xff665a, label: `+${Math.round(healed)} HP` });
      this.events.onHealthPickup?.(healed);
    }
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
      // Same shape as spawnGemAt: prefer the farthest note not already
      // travelling, fall back to the nearest inbound one so a map-wide vacuum
      // cannot push the array past maxMusicNotes.
      let farthest: MusicNotePickup | null = null;
      let farthestD = -1;
      let nearestInbound: MusicNotePickup | null = null;
      let nearestInboundD = Infinity;
      for (const note of this.musicNotes) {
        const dx = note.x - this.player.x;
        const dy = note.y - this.player.y;
        const d2 = dx * dx + dy * dy;
        if (note.vacuumed) {
          if (d2 < nearestInboundD) {
            nearestInboundD = d2;
            nearestInbound = note;
          }
          continue;
        }
        if (d2 > farthestD) {
          farthestD = d2;
          farthest = note;
        }
      }
      const target = farthest ?? nearestInbound;
      if (!target) return;
      this.overflowMusicNote = target;
    }
    this.overflowMusicNote.value += amount;
    this.overflowMusicNote.tier = 'anthem';
  }

  /** Attract every freely collectable drop on the map, however far off-screen
   * it was left. Decision-bearing rewards intentionally stay walk-to-choose:
   * level-up pedestals and chests. */
  vacuumAllPickups(): VacuumResult {
    const cameraX = this.player.x + PLAYER_FOOT_OFFSET.x;
    const cameraY = this.player.y + PLAYER_FOOT_OFFSET.y;
    let gems = 0;
    let notes = 0;
    for (const gem of this.gems) {
      if (!gem.vacuumed) {
        gem.vacuumed = true;
        gems += 1;
      }
    }
    for (const note of this.musicNotes) {
      if (!note.vacuumed) {
        note.vacuumed = true;
        notes += 1;
      }
    }
    const result = { gems, notes };
    // Sized to the viewport only as a starting scale — the pulse expands past
    // the screen edge, so it suggests reach beyond the view instead of drawing
    // a boundary the map-wide pull ignores.
    const radius = Math.hypot(this.worldW, this.worldH) * 0.55;
    this.fx?.push({ type: 'vacuum', x: cameraX, y: cameraY, radius });
    this.fx?.push({ type: 'pressure', x: this.player.x, y: this.player.y, color: 0xa06bff, label: 'STAGE MAGNET' });
    this.events.onStageMagnet?.(result);
    return result;
  }

  private updateStageMagnets(): void {
    for (let i = this.stageMagnets.length - 1; i >= 0; i--) {
      const magnet = this.stageMagnets[i];
      const dx = this.player.x - magnet.x;
      const dy = this.player.y - magnet.y;
      if (dx * dx + dy * dy > STAGE_MAGNET.pickupRadius * STAGE_MAGNET.pickupRadius) continue;
      this.stageMagnets.splice(i, 1);
      this.vacuumAllPickups();
    }
  }

  private updateGems(dt: number): void {
    const p = this.player;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      const inRange = g.vacuumed
        || g.pullT !== undefined
        || d < RUN.magnetRadius * this.buildMods.magnetMul;
      const speed = g.vacuumed ? STAGE_MAGNET.vacuumSpeed : RUN.gemPullSpeed * this.buildMods.pullMul;
      const remaining = inRange ? advancePickupPull(g, p.x, p.y, speed, dt) : d;
      if (remaining < RUN.pickupRadius) {
        this.xp += g.xp * xpPickupMultiplier(this.level);
        this.gems.splice(i, 1);
        if (g === this.overflowGem) this.overflowGem = null;
        // Before checkLevel, so the pickup is heard under the level-up chime
        // rather than after it, and so the 'xp-bar' motion reports a full bar
        // on the gem that levels you rather than an already-reset one.
        this.events.onGemCollected?.(g.xp, Math.min(1, this.xp / xpForNextLevel(this.level)));
        this.checkLevel();
      }
    }
  }

  private updateMusicNotes(dt: number): void {
    const p = this.player;
    for (let i = this.musicNotes.length - 1; i >= 0; i--) {
      const note = this.musicNotes[i];
      const d = Math.hypot(p.x - note.x, p.y - note.y);
      const inRange = note.vacuumed
        || note.pullT !== undefined
        || d < RUN.magnetRadius * this.buildMods.magnetMul * 1.15;
      const speed = note.vacuumed
        ? STAGE_MAGNET.vacuumSpeed
        : RUN.gemPullSpeed * this.buildMods.pullMul * 1.15;
      const remaining = inRange ? advancePickupPull(note, p.x, p.y, speed, dt) : d;
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
