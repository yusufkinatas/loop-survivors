// One run's world: player, enemies, projectiles, zones, gems, and the
// coupling point where an engine trigger becomes damage (Model A: one event,
// two outputs). The stage script here is time-driven only and carries no
// musical meaning (the dividing rule, docs/plan.md).
//
// This file is pure simulation: no rendering, input devices, or real-time
// clock. Rendering lives in view.ts, which reads the world each frame.

import type { Role } from '../audio/kits';
import { EVOLVED_TIER } from '../audio/charts';
import type { ScheduledTrigger } from '../audio/engine';
import {
  AIM_RANGE,
  ARP_CAROUSEL,
  ARP_OMEGA,
  BASS_SUB,
  BELL,
  BELL_CARILLON,
  CHARGER,
  CHORD_SUSTAIN,
  CIRCLER,
  DAMAGE_FEEDBACK,
  DARTER,
  ENEMIES,
  KICK_DROP,
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
import type { Rng } from './rng';
import { SpatialHash, circlesOverlap } from './spatial';

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
  /** Active slow strength (speed multiplier) while slowT > 0; 1 = no slow. Set
   *  by whichever zone last ticked this enemy (last-writer-wins) and reset to 1
   *  when slowT expires, so a strong→weak move corrects on the weak zone's next
   *  tick. Once the chord evolves, every chord zone is a 0.3 Sustain, so the
   *  only mixed-strength window is a brief transient at the evolution instant. */
  slowMul: number;
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
  /** bell: shards to spawn on this shot's first hit (0 = none). */
  shatter: number;
  /** bell: the `shatter` count each spawned shard itself carries. 0 on the base
   *  Bell (shards never re-shatter). The evolved "Carillon" gives its shards a
   *  positive value so they shatter once more (depth 2); their sub-shards get 0,
   *  so the cascade always terminates. */
  shatterChild: number;
  /** True for a bell shard (a fragment shot); used only to suppress the per-hit
   *  spark. Re-shattering is driven by `shatter`, not this flag. */
  shard: boolean;
  /** True for an evolved Arp "Arp Carousel" orbiter: a bigger blade silhouette
   *  (view) and a faster re-hit cooldown (continuous DPS). */
  blade: boolean;
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
  /** Enemy speed multiplier applied while inside (smaller = slower). The base
   *  chord zone uses ZONE_SLOW_MUL; the evolved Sustain field slows harder. */
  slowMul: number;
  /** Damage-tick interval (s). The base zone uses ZONE_TICK_S; the evolved
   *  Sustain field ticks faster (CHORD_SUSTAIN.tickS) for real DPS. */
  tickS: number;
  /** True for the evolved Chord "Sustain" field: a distinct, larger silhouette
   *  in the view. */
  evolved: boolean;
}

export interface Gem {
  x: number;
  y: number;
  xp: number;
  tier: 'blue' | 'green' | 'red';
}

/** Kick "The Drop": an omnidirectional pressure ring spawned on every beat that
 *  expands from its origin, damaging and hard-launching each enemy once as the
 *  ring front reaches it (docs/phases/weapon-evolutions.md). Anchored at the
 *  player's position at trigger time, like a VS shockwave. */
interface KickPulse {
  x: number;
  y: number;
  /** Seconds since spawn; the ring radius is maxRadius * (age / expandS). */
  age: number;
  damage: number;
  /** Enemies already hit by THIS pulse, so each takes one hit as the front
   *  passes and no enemy is chipped every frame it stays inside. */
  hit: Set<Enemy>;
}

/** Bass "The Sub": a traveling wall — a long, thin damage band centered at
 *  (x,y), facing its travel direction (dirX,dirY), extending +/- halfWidth to
 *  each side and +/- thickness deep. It sweeps along its facing and grinds
 *  enemies in the band on a re-hit cooldown. Rendered as a thick bar
 *  perpendicular to travel (view.ts). */
export interface BassWall {
  x: number;
  y: number;
  /** Unit travel direction (also the wall's facing normal). */
  dirX: number;
  dirY: number;
  /** CURRENT lateral half-length; grows from a narrow seed to maxHalfWidth over
   *  BASS_SUB.openS, so the crest unfurls instead of popping in full-size. Both
   *  the hitbox and the view read this. */
  halfWidth: number;
  maxHalfWidth: number;
  thickness: number;
  speed: number;
  damage: number;
  lifeS: number;
  /** Seconds since spawn; drives the width open and the alpha fade-in. */
  age: number;
  /** Re-hit cooldown timer; the hit set clears when it lapses. */
  rehitT: number;
  hit: Set<Enemy>;
}

/** Fire-and-forget visuals the world requests and the view renders. */
export type FxEvent =
  | { type: 'ring'; x: number; y: number; radius: number; color: number; dur: number; soft?: boolean }
  | { type: 'death'; x: number; y: number; radius: number; color: number; elite: boolean }
  | { type: 'whip'; x: number; y: number; side: 1 | -1; area: number; color: number }
  | { type: 'kickpulse'; x: number; y: number; radius: number; color: number }
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
  | { type: 'slam'; x: number; y: number; radius: number; color: number };

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

export class RunWorld {
  /** Owned weapons and their ladder tier (1-4). */
  readonly tiers = new Map<Role, number>();

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
  readonly gems: Gem[] = [];
  /** Live Bass "The Sub" traveling walls (evolved bass only); read by the view. */
  readonly bassWalls: BassWall[] = [];
  /** Live Kick "The Drop" pressure rings (evolved kick only). */
  private pulses: KickPulse[] = [];

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
    conf = this.applyBuild(conf);

    switch (t.role) {
      case 'kick': {
        // Evolved "The Drop": the facing strip becomes an omnidirectional
        // pressure ring from the player's feet on every beat.
        if (tier === EVOLVED_TIER) {
          this.spawnKickPulse(conf.damage);
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
        if (tier === EVOLVED_TIER) {
          // Sustain: a large, long-lived field dropped on the DENSEST pack that
          // slows hard and lingers far longer than any other effect.
          const target =
            this.densestEnemy(ZONE_THROW_RANGE) ?? this.nearestEnemy(ZONE_THROW_RANGE);
          const zc = { ...conf, radius: CHORD_SUSTAIN.radius, lifetimeS: CHORD_SUSTAIN.lifeS };
          this.spawnZone(
            target?.x ?? p.x,
            target?.y ?? p.y,
            zc,
            color,
            'chord',
            CHORD_SUSTAIN.slowMul,
            true,
            CHORD_SUSTAIN.tickS,
          );
          break;
        }
        // Thrown at the nearest enemy, not dropped underfoot: the zone has
        // to land where the horde actually is to be worth a pick.
        const target = this.nearestEnemy(ZONE_THROW_RANGE);
        // Loud chords stamp a bigger zone (velocity → size).
        const zc = { ...conf, radius: conf.radius! * (0.85 + 0.3 * v) };
        this.spawnZone(target?.x ?? p.x, target?.y ?? p.y, zc, color, 'chord');
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
      case 'bell': {
        // A note lobbed straight that shatters into shards on its first hit.
        this.spawnBell(this.aimDir(0.1), conf, color, v);
        break;
      }
      case 'arp': {
        // King Bible: an orbiter per note, circling the player.
        this.spawnOrbiter(conf, color, v);
        break;
      }
      case 'bass': {
        // Evolved "The Sub": every trigger sends a real traveling wall sweeping
        // across the arena (a proper wall, not a stretched wave).
        if (tier === EVOLVED_TIER) {
          this.spawnBassWall(conf.damage);
          break;
        }
        // Bass never multishots (no 'aimedfan' tag): one wide rolling wave.
        this.spawnProjectile('bass', this.aimDir(0.08), conf, color, v);
        break;
      }
      case 'snare':
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
  }

  /** Sandbox loadout editor: drop a weapon entirely. */
  removeWeapon(role: Role): void {
    this.tiers.delete(role);
  }

  /** The single build-transform pipeline: soundset multiplier plus Antonio's
   * documented level-based Might. */
  private applyBuild(conf: WeaponConf): WeaponConf {
    // Antonio's passive adds 10% Might every ten levels, capped at +50%.
    const antonioMight = 1 + Math.min(5, Math.floor(this.level / 10)) * 0.1;
    return { ...conf, damage: conf.damage * this.powerMul * antonioMight };
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
    this.updateKickPulses(dt);
    this.updateBassWalls(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateGems(dt);
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
    p.iframesT = DAMAGE_FEEDBACK.iframesS;
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
        if (spawned) spawned.upgradeChance = event.rewardChance;
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
      upgradeChance: 0,
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
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.gems.length = 0;
    if (this.fx) this.fx.length = 0;
    this.pendingKick.length = 0;
    this.pulses.length = 0;
    this.bassWalls.length = 0;
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
        if (e.slowT <= 0) e.slowMul = 1; // slow lapsed: back to full speed
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
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** The enemy with the most neighbours within CHORD_SUSTAIN.densityR, among
   *  those in `range` of the player — where the evolved Chord "Sustain" field
   *  wants to land. O(k^2) over the in-range set only, and called rarely (the
   *  evolved chord fires ~twice a phrase). */
  private densestEnemy(range: number): Enemy | null {
    const px = this.player.x;
    const py = this.player.y;
    const r2 = range * range;
    const cands: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - px;
      const dy = e.y - py;
      if (dx * dx + dy * dy <= r2) cands.push(e);
    }
    const dr2 = CHORD_SUSTAIN.densityR * CHORD_SUSTAIN.densityR;
    let best: Enemy | null = null;
    let bestN = -1;
    for (const e of cands) {
      let n = 0;
      for (const o of cands) {
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        if (dx * dx + dy * dy <= dr2) n++;
      }
      if (n > bestN) {
        bestN = n;
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
      shatterChild: 0,
      shard: false,
      blade: false,
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

  /** Arp: an orbiter that circles the player, chipping what it sweeps. Evolved
   *  "Arp Carousel" orbiters are blades — a bigger silhouette and a faster
   *  re-hit — packed into a dense fixed-radius ring. */
  private spawnOrbiter(conf: WeaponConf, color: number, velocity: number): void {
    const angle = this.rng() * Math.PI * 2;
    const pr = this.baseProjectile('arp', conf, color, conf.damage * (0.8 + 0.4 * velocity));
    pr.pierce = Infinity;
    pr.orbitAngle = angle;
    pr.orbitRadius = conf.orbitRadius!;
    pr.blade = this.tiers.get('arp') === EVOLVED_TIER;
    pr.x = this.player.x + Math.cos(angle) * pr.orbitRadius;
    pr.y = this.player.y + Math.sin(angle) * pr.orbitRadius;
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
    if (tier === EVOLVED_TIER) {
      // Carillon: shatters into many shards, and each of THOSE shatters once
      // more (depth 2) into secondaryShards. Sub-shards carry shatter 0.
      pr.shatter = BELL_CARILLON.shards;
      pr.shatterChild = BELL_CARILLON.secondaryShards;
    } else {
      pr.shatter = BELL.shards[tier - 1] ?? BELL.shards[0];
    }
    this.projectiles.push(pr);
  }

  /** Bell's shatter: fling a radial burst of small shard shots from (x,y).
   *  `childShatter` is the shatter count each shard itself carries: 0 for the
   *  base Bell (shards never re-shatter) and BELL_CARILLON.secondaryShards for
   *  the evolved cascade (each shard shatters once more). Sub-shards always get
   *  0 (baseProjectile default), so the chain terminates at depth 2.
   *
   *  `source` is the enemy the parent shot just hit: each shard starts with it
   *  in its hit set, so shards never re-hit the body they scattered off (Sivir
   *  W). Without this, a shard spawned inside a tanky enemy is swallowed by that
   *  same enemy on its first frame and can never reach the enemies behind it. */
  private spawnShards(
    x: number,
    y: number,
    count: number,
    damage: number,
    color: number,
    childShatter = 0,
    source?: Enemy,
  ): void {
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
      pr.vx = Math.cos(a) * BELL.shardSpeed;
      pr.vy = Math.sin(a) * BELL.shardSpeed;
      pr.shard = true;
      pr.shatter = childShatter;
      if (source) pr.hit.add(source); // scatter past the body it broke on
      this.projectiles.push(pr);
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

  /** Kick "The Drop": spawn a pressure ring at the player's feet. */
  private spawnKickPulse(damage: number): void {
    const p = this.player;
    this.pulses.push({ x: p.x, y: p.y, age: 0, damage, hit: new Set() });
    this.fx?.push({
      type: 'kickpulse',
      x: p.x,
      y: p.y,
      radius: KICK_DROP.maxRadius,
      color: KIT_COLORS.kick,
    });
  }

  /** Grow each live pressure ring; damage + hard-launch each enemy once as the
   *  expanding front reaches it, so inner enemies are cleared first and the ring
   *  carves an outward bubble. Retired once fully expanded. */
  private updateKickPulses(dt: number): void {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i];
      pulse.age += dt;
      const k = Math.min(1, pulse.age / KICK_DROP.expandS);
      const r = KICK_DROP.maxRadius * k;
      const near = this.hash.query(pulse.x, pulse.y, r + 48, this.queryBuf);
      for (const e of near) {
        if (e.dead || pulse.hit.has(e)) continue;
        const dx = e.x - pulse.x;
        const dy = e.y - pulse.y;
        const reach = r + e.radius;
        if (dx * dx + dy * dy > reach * reach) continue; // ring front not here yet
        this.damageEnemy(e, pulse.damage, 'kick');
        pulse.hit.add(e);
        this.shove(e, pulse.x, pulse.y, KICK_DROP.launch);
      }
      if (pulse.age >= KICK_DROP.expandS) this.pulses.splice(i, 1);
    }
  }

  /** Bass "The Sub": spawn a traveling crest, seated AHEAD of the player and
   *  starting narrow, so it unfurls forward instead of popping in on top of the
   *  player at full width. */
  private spawnBassWall(damage: number): void {
    const p = this.player;
    const aim = this.aimDir(0.04);
    this.bassWalls.push({
      x: p.x + aim.x * BASS_SUB.spawnAhead,
      y: p.y + aim.y * BASS_SUB.spawnAhead,
      dirX: aim.x,
      dirY: aim.y,
      halfWidth: BASS_SUB.startHalfWidth,
      maxHalfWidth: BASS_SUB.halfWidth,
      thickness: BASS_SUB.thickness,
      speed: BASS_SUB.speed,
      damage,
      lifeS: BASS_SUB.lifeS,
      age: 0,
      rehitT: 0,
      hit: new Set(),
    });
  }

  /** Sweep each live crest along its facing, opening its width from the narrow
   *  seed to maxHalfWidth (ease-out), and damage enemies inside the band (within
   *  `thickness` along travel and the CURRENT `halfWidth` across), re-hitting on
   *  a cooldown so an enemy caught in the moving band is ground as it passes.
   *  The growing width means edge enemies are hit only once the crest opens out
   *  to them, matching the unfurling visual. */
  private updateBassWalls(dt: number): void {
    for (let i = this.bassWalls.length - 1; i >= 0; i--) {
      const w = this.bassWalls[i];
      w.age += dt;
      w.lifeS -= dt;
      w.x += w.dirX * w.speed * dt;
      w.y += w.dirY * w.speed * dt;
      const k = Math.min(1, w.age / BASS_SUB.openS);
      w.halfWidth = w.maxHalfWidth - (w.maxHalfWidth - BASS_SUB.startHalfWidth) * (1 - k) * (1 - k);
      w.rehitT -= dt;
      if (w.rehitT <= 0) {
        w.hit.clear();
        w.rehitT = BASS_SUB.rehitS;
      }
      const nx = w.dirX;
      const ny = w.dirY; // along-travel axis (the wall's facing)
      const tx = -w.dirY;
      const ty = w.dirX; // lateral axis (along the wall)
      const near = this.hash.query(w.x, w.y, w.halfWidth + 64, this.queryBuf);
      for (const e of near) {
        if (e.dead || w.hit.has(e)) continue;
        const rx = e.x - w.x;
        const ry = e.y - w.y;
        if (Math.abs(rx * nx + ry * ny) > w.thickness + e.radius) continue; // not in the band's depth
        if (Math.abs(rx * tx + ry * ty) > w.halfWidth + e.radius) continue; // past the wall's ends
        this.damageEnemy(e, w.damage, 'bass');
        w.hit.add(e);
      }
      if (w.lifeS <= 0) this.bassWalls.splice(i, 1);
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

  private updateProjectiles(dt: number): void {
    const p = this.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.age += dt;
      pr.lifeS -= dt;

      if (pr.role === 'arp') {
        // Orbit the player at a FIXED radius (the evolved Carousel is a bigger,
        // denser ring — no breathing) and clear the hit set on a cooldown so
        // the sweep keeps chipping. Evolved blades re-hit faster, so a full ring
        // of them is reliable continuous DPS.
        pr.orbitAngle += ARP_OMEGA * dt;
        pr.x = p.x + Math.cos(pr.orbitAngle) * pr.orbitRadius;
        pr.y = p.y + Math.sin(pr.orbitAngle) * pr.orbitRadius;
        pr.rehitT -= dt;
        if (pr.rehitT <= 0) {
          pr.hit.clear();
          pr.rehitT = pr.blade ? ARP_CAROUSEL.rehitS : ORBIT_REHIT_S;
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
      }

      const near = this.hash.query(pr.x, pr.y, pr.radius + 24, this.queryBuf);
      for (const e of near) {
        if (e.dead || pr.hit.has(e) || !circlesOverlap(pr, e)) continue;
        pr.hit.add(e);
        this.damageEnemy(e, pr.damage, pr.role);
        // Shove (sim, deterministic): snare 20 / bass 10. Writes only the
        // shared knock channel.
        const sh = WEAPON_SHOVE[pr.role];
        if (sh) this.shove(e, pr.x, pr.y, sh);
        // Bell: the note shatters into a radial burst of shards on its first
        // hit. Base shards carry shatter 0 (never re-shatter); the evolved
        // Carillon passes shatterChild so each shard shatters once more (depth
        // 2). The burst spark fires only for the main shot / first generation
        // (shard re-shatters are read through the shard shots themselves), so a
        // full cascade cannot flood the fx queue.
        if (pr.role === 'bell' && pr.shatter > 0) {
          this.spawnShards(pr.x, pr.y, pr.shatter, pr.damage * BELL.shardDamageMul, pr.color, pr.shatterChild, e);
          if (!pr.shard) this.fx?.push({ type: 'spark', x: e.x, y: e.y, color: pr.color, n: 6, spread: 14 });
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
    slowMul = ZONE_SLOW_MUL,
    evolved = false,
    tickS = ZONE_TICK_S,
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
      slowMul,
      tickS,
      evolved,
    });
  }

  private updateZones(dt: number): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.lifeS -= dt;

      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = z.tickS;
        this.damageArea(z.x, z.y, z.radius, z.damage, z.source);
        // The zone's other half: everything inside wades, it doesn't walk. Each
        // tick refreshes the slow window and (re)sets its strength from THIS
        // zone, so an enemy carries the strength of whatever zone last ticked it
        // and recovers once it leaves (slowMul resets in moveEnemies).
        if (z.slow) {
          const inside = this.hash.query(z.x, z.y, z.radius + 24, this.queryBuf);
          for (const e of inside) {
            if (!e.dead && circlesOverlap(z, e)) {
              e.slowT = z.tickS + 0.15;
              e.slowMul = z.slowMul;
            }
          }
        }
      }
      if (z.lifeS <= 0) {
        this.zones.splice(i, 1);
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
