// Midnight Neon Soundwood run renderer. The simulation stays in run.ts; this
// file diffs its state into explicit visual layers with cached pixel geometry.

import { Container, Graphics, Text, TextStyle, TilingSprite, type Texture } from 'pixi.js';
import type { Role } from '../audio/kits';
import { RUN, STAGE_LIGHT, WORLD_SCALE } from './config';
import type { ItemId } from './items';
import { enemyLoop, loopFrame, playerLoop, preloadPixelArt } from './pixelart';
import { KICK } from './weapons';
import {
  PLAYER_FOOT_OFFSET,
  type Chest,
  type Enemy,
  type FxEvent,
  type Gem,
  type MusicNotePickup,
  type Projectile,
  type RunWorld,
  type StageLight,
  type StageMagnetPickup,
  type HealthPickup,
  type Zone,
} from './run';
import {
  SOUNDWOOD,
  hash2,
  preloadSoundwoodFloor,
  regularPixelPoly,
  snap,
  soundwoodFloorTexture,
} from './soundwood-art';
import {
  animateSceneryCell,
  BOSS_RING_SCALE,
  enemyContext,
  isSpriteEnemyGfx,
  makeEnemyGfx,
  makeSpriteEnemyGfx,
  syncSpriteEnemyGfx,
  makeGemGfx,
  makeMusicNoteGfx,
  makePlayerGfx,
  makeProjectileGfx,
  makeRewardGfx,
  makeChestGfx,
  makeSceneryCell,
  makeStageLightGfx,
  makeStageMagnetGfx,
  makeHealthPickupGfx,
  makeZoneGfx,
  refreshProjectileContext,
  type EnemyGfx,
  type SpriteEnemyGfx,
  type GemGfx,
  type MusicNoteGfx,
  type PlayerGfx,
  type ProjectileGfx,
  type RewardGfx,
  type SceneryCell,
  type StageLightGfx,
  type StageMagnetGfx,
  type HealthPickupGfx,
  type ChestGfx,
} from './soundwood-shapes';

/** One floor pixel is two sprite pixels, so the ground reads coarser than the
 *  bodies standing on it and sits visually behind them (#209). The 32px tile
 *  therefore covers 112.3 world units. */
const FLOOR_SCALE = 2 * WORLD_SCALE;
const FLOOR_TILE_SIZE = 32 * FLOOR_SCALE;
const SCENERY_CELL_SIZE = 256;
const TRAIL_ROLES = new Set<Role>(['snare', 'lead']);
const TRAIL_POINTS = 7;
const DEATH_BURST_CAP = 80;
const REGULAR_DEATH_BURST_CAP = 72;
const DMG_CAP = 100;
const DMG_DUR = 0.62;
const DMG_RISE = 38;
const CHAPTER_TINTS = [0xffffff, 0xe6f5ff, 0xe9fff0, 0xf1e8ff, 0xfff0d7, 0xffdedb];

/** The generated tile came back warm red-brown rather than the blue-black
 *  #209 specified (measured in #211). Multiply only ever darkens, so a cool
 *  tint cannot add blue that was never there -- it pulls the tile's red down
 *  until the blue-black already in it leads. Applied to the floor alone, under
 *  the chapter tint, so chapters still colour the ground the way they did. */
const FLOOR_TONE = 0xa8d4ff;

/** The single arena color palette. */
const ARENA_PALETTE = { tint: 0xf1ffff, accent: SOUNDWOOD.cyan, secondary: SOUNDWOOD.magenta } as const;

/** Optional integration hook: callers may await this before constructing a
 * run, while RunView also starts the preload itself for backward compatibility. */
export async function preloadRunArt(): Promise<void> {
  await Promise.all([preloadSoundwoodFloor(), preloadPixelArt()]);
}

interface GroundPickCopyBase {
  color: number;
  name: string;
  /** What this pedestal IS, not what level it makes: NEW / LEVEL UP / EVOLVE,
   * or an Encore's payout (+N HP, +N ♫). Levels live in the toast the scoop
   * prints and on the pause screen — a pedestal that named one could not stay
   * truthful while its siblings are being scooped around it. */
  badge: string;
  effect?: string;
  /** Item picks only: the weapon this passive evolves, set on the first copy so
   * the pedestal can show the recipe teaser. Passed straight to the pedestal. */
  evoRole?: Role;
  /** The mirror, weapon picks only: the passive this weapon evolves with, set
   * on the hire. Exactly one of evoRole / evoItem is ever present. */
  evoItem?: ItemId;
}

/** Everything a pedestal says about itself, with no position: the shell
 * recomputes this from live state after every scoop and pairs it back with the
 * pedestal's fixed spot on the boards. */
export type GroundPickCopy = GroundPickCopyBase & (
  | { role: Role; glyph?: never }
  | { role?: never; glyph: string }
);

export type GroundPickView = GroundPickCopy & { x: number; y: number };

interface Pop {
  gfx: Graphics;
  t: number;
  dur: number;
  fromScale: number;
  toScale: number;
  death?: DeathBurst;
  holdHalf?: boolean;
  expandHalf?: boolean;
}

interface DeathFragment {
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  shade: number;
}

interface DeathBurst {
  radius: number;
  elite: boolean;
  fragments: DeathFragment[];
}

interface Floater {
  txt: Text;
  x: number;
  y: number;
  t: number;
  dur: number;
  vy: number;
  baseScale?: number;
  staticMotion?: boolean;
}

interface ZoneGfx extends Graphics {
  __evolved: boolean;
}

const DMG_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 14,
  fontWeight: '900',
  fill: 0xffffff,
  stroke: { color: SOUNDWOOD.ink, width: 5, join: 'round' },
});

/** Persistent readout above a sandbox practice target. Same typography as the
 * transient damage numbers, one size up and centered so three stacked lines
 * stay readable over the cabinet silhouette. */
const DUMMY_LABEL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 16,
  fontWeight: '900',
  fill: 0xffffff,
  align: 'center',
  lineHeight: 18,
  stroke: { color: SOUNDWOOD.ink, width: 5, join: 'round' },
});

const BANNER_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 18,
  fontWeight: '900',
  letterSpacing: 2,
  fill: 0xffffff,
  stroke: { color: SOUNDWOOD.ink, width: 7, join: 'round' },
});

/** The chest reel window: one cycling reward name above the rattling case. */
const REEL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 15,
  fontWeight: '900',
  letterSpacing: 1,
  fill: 0xffffff,
  stroke: { color: SOUNDWOOD.ink, width: 5, join: 'round' },
});

/** One face of the chest slot reel: a possible reward's name and color. */
export interface ChestReelEntry {
  label: string;
  color: number;
}

function roleIsEvolved(world: RunWorld, role: Role): boolean {
  return world.evolved.has(role);
}

function evolvedCount(world: RunWorld): number {
  let count = 0;
  for (const role of world.tiers.keys()) if (roleIsEvolved(world, role)) count++;
  return count;
}

/** A slowly advancing cosmetic chapter (every five minutes) that deepens the
 * arena tint and fires a "crowd surge" burst. */
function visualChapter(world: RunWorld): number {
  return Math.max(0, Math.floor(world.timeS / 300));
}

function multiplyTint(a: number, b: number): number {
  const r = Math.round(((a >> 16) & 0xff) * ((b >> 16) & 0xff) / 255);
  const g = Math.round(((a >> 8) & 0xff) * ((b >> 8) & 0xff) / 255);
  const blue = Math.round((a & 0xff) * (b & 0xff) / 255);
  return (r << 16) | (g << 8) | blue;
}

/** Thousands-separated whole numbers: the readout is scanned mid-fight, and
 * `18,340` reads at a glance where `18340.6` does not. */
function formatDummyNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** A slow left-right lean, on top of the two-frame walk cycle, so a crowd never
 *  reads as a field of frozen stamps. The phase is keyed off `enemy.id` so
 *  neighbours lean out of step with each other — a synchronised crowd looks more
 *  mechanical than no tilt at all. Amplitude stays under 4°: enough to feel
 *  alive, not enough to register as its own animation. */
const TILT_RADIANS = 0.065;

/** Radians per second, tuned by eye against a live crowd. Exactly τ, i.e. one
 *  full lean-and-return per second — roughly two footsteps of the walk cycle
 *  per sway, which reads as deliberate walking rather than idle drifting. */
const TILT_SPEED = Math.PI * 2;

/** The boss glow: three stacked discs in the boss's own colour, widest and
 *  faintest first, so the edge falls off instead of ending on a hard rim. All
 *  three are sized against the white ring, so the glow always sits just inside
 *  and under it whatever the body's radius. */
const BOSS_GLOW_LAYERS = [[1, 0.05], [0.78, 0.06], [0.5, 0.08]] as const;

/** Radians per second of the breath, and how far it swings. Slow and shallow:
 *  a boss should look like it is idling, not pulsing an alarm. */
const BOSS_GLOW_SPEED = 1.6;
const BOSS_GLOW_DEPTH = 0.07;

function enemyTilt(enemy: Enemy, phase: number): number {
  return Math.sin(phase + enemy.id * 1.7) * TILT_RADIANS;
}

function enemyFrame(enemy: Enemy, timeS: number): number {
  switch (enemy.kind) {
    case 'bat':
    case 'redBat':
    case 'redBat2':
    case 'glowingBat':
    case 'batSwarm':
    case 'flower':
    case 'mantis':
    case 'giantBat':
    case 'silverBat':
    case 'ghostSwarm':
    case 'venus':
    case 'giantMantis':
    case 'giantBlueVenus':
    // The lunge reads as a run, not a walk: it keeps the faster cycle.
    case 'werewolf':
    case 'giantWerewolf':
      return Math.floor(timeS * 8 + enemy.id * 0.73) & 1;
    case 'zombie':
    case 'skeleton':
    case 'bigMummy':
    case 'giantMummy':
    case 'greenMudman':
    case 'grayMudman':
      return Math.floor(timeS * 4 + enemy.id * 0.41) & 1;
    default:
      return 0;
  }
}

function whipDimensions(area: unknown): { width: number; height: number } {
  if (typeof area === 'number' && Number.isFinite(area)) {
    const scale = Math.max(0.1, area);
    return {
      width: KICK.stats.stripBaseWidth * scale,
      height: KICK.stats.stripBaseHeight * scale,
    };
  }
  const data = area && typeof area === 'object' ? area as Record<string, unknown> : {};
  const finite = (name: string): number | null => {
    const value = data[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  return {
    width: Math.max(24, finite('width') ?? finite('w') ?? finite('reach') ?? 150),
    height: Math.max(12, finite('height') ?? finite('h') ?? finite('thickness') ?? 42),
  };
}

function pixelDiamond(gfx: Graphics, x: number, y: number, radius: number, color: number, alpha = 1): void {
  const r = snap(radius);
  gfx.poly([snap(x), snap(y - r), snap(x + r), snap(y), snap(x), snap(y + r), snap(x - r), snap(y)])
    .fill({ color, alpha });
}

function makeDeathBurst(
  radius: number,
  color: number,
  elite: boolean,
  seedX: number,
  seedY: number,
): { gfx: Graphics; burst: DeathBurst } {
  const fragments: DeathFragment[] = [];
  const count = elite
    ? Math.min(38, Math.max(26, Math.round(radius)))
    : Math.min(20, Math.max(11, Math.round(radius * 0.9)));
  for (let i = 0; i < count; i++) {
    const angle = hash2(snap(seedX), snap(seedY), i * 37 + 11) * Math.PI * 2;
    const startR = radius * (0.12 + hash2(snap(seedY), i, 91) * 0.62);
    const travel = radius * (elite
      ? 2 + hash2(i, snap(seedX), 127) * 1.7
      : 1.5 + hash2(i, snap(seedY), 181) * 1.5);
    fragments.push({
      x: Math.cos(angle) * startR,
      y: Math.sin(angle) * startR,
      dx: Math.cos(angle) * travel,
      dy: Math.sin(angle) * travel,
      size: Math.max(2, Math.min(elite ? 8 : 6, radius * (0.18 + hash2(i, 3, 233) * 0.14))),
      shade: i % 3,
    });
  }
  const burst = { radius, elite, fragments };
  const gfx = new Graphics({ roundPixels: true });
  gfx.tint = color;
  if (elite) gfx.blendMode = 'add';
  redrawDeathBurst(gfx, burst, 0);
  return { gfx, burst };
}

function redrawDeathBurst(gfx: Graphics, burst: DeathBurst, progress: number): void {
  gfx.clear();
  const core = Math.max(0, 1 - progress * 1.65);
  if (core > 0) {
    const r = burst.radius * core;
    const cell = Math.max(2, snap(r * 0.46));
    for (const [x, y] of [[0, 0], [-0.58, 0], [0.58, 0], [0, -0.58], [0, 0.58]] as const) {
      gfx.rect(snap(x * r - cell / 2), snap(y * r - cell / 2), cell, cell).fill(0xffffff);
    }
    gfx.poly(regularPixelPoly(8, r * 1.08, Math.PI / 8))
      .stroke({ width: burst.elite ? 4 : 2, color: 0xffffff, alpha: 0.76 });
  }
  const travel = 1 - (1 - progress) * (1 - progress);
  for (const fragment of burst.fragments) {
    const size = Math.max(1, snap(fragment.size * (1 - progress * 0.72)));
    const x = snap(fragment.x + fragment.dx * travel);
    const y = snap(fragment.y + fragment.dy * travel);
    const alpha = fragment.shade === 0 ? 1 : fragment.shade === 1 ? 0.76 : 0.5;
    gfx.rect(x - Math.floor(size / 2), y - Math.floor(size / 2), size, size)
      .fill({ color: 0xffffff, alpha });
  }
}

export class RunView {
  readonly stage: Container;

  private world: RunWorld;
  private view: { width: number; height: number };
  private destroyed = false;

  // Required visual order. Each dynamic entity is only ever attached to its
  // own layer, so spawn timing cannot accidentally hide the player or rewards.
  private tiledGroundLayer = new Container();
  private environmentLayer = new Container();
  /** Stage Lights. Above the floor scenery so their spill reads, below the
   *  zones and everything that fights, because the prop is furniture: bodies,
   *  shots and the player all pass over it. */
  private propLayer = new Container();
  private zoneLayer = new Container();
  private gemLayer = new Container();
  private enemyLayer = new Container();
  private dummyLabelLayer = new Container();
  private attackLayer = new Container();
  private playerLayer = new Container();
  private rewardLayer = new Container();
  private rarePickupLayer = new Container();
  private foregroundLayer = new Container();
  private flashLayer = new Container();

  private floorFallback = new Graphics({ roundPixels: true });
  private floorTileLayer = new Container();
  private floorShade = new Graphics({ roundPixels: true });
  private environmentFloorGfx = new Graphics({ roundPixels: true });
  private floorTexture: Texture | null = null;
  /** The whole ground in one draw. Viable only because #209 dropped the
   *  alternate-row/column mirror flip: at 112 units the flip printed a 4-way
   *  symmetric butterfly every 224 units, and the eye finds symmetry faster
   *  than it finds a repeat. The wrap check in #211 passed, so plain repeat
   *  stands on its own. */
  private floorTiling: TilingSprite | null = null;

  private telegraphGfx = new Graphics({ roundPixels: true });
  private bossGlowGfx = new Graphics({ roundPixels: true });
  private trailGfx = new Graphics({ roundPixels: true });
  private projectileLayer = new Container();
  private systemAttackGfx = new Graphics({ roundPixels: true });
  private fxLayer = new Container();
  private floaterLayer = new Container();
  private rewardSafeGfx = new Graphics({ roundPixels: true });
  private tourRewardLayer = new Container();
  private foregroundGfx = new Graphics({ roundPixels: true });
  private flashGfx = new Graphics({ roundPixels: true });
  private playerGfx: PlayerGfx;

  private enemyGfx = new Map<Enemy, EnemyGfx | SpriteEnemyGfx>();
  private dummyLabels = new Map<Enemy, Text>();
  private projectileGfx = new Map<Projectile, ProjectileGfx>();
  private zoneGfx = new Map<Zone, ZoneGfx>();
  private gemGfx = new Map<Gem, GemGfx>();
  private musicNoteGfx = new Map<MusicNotePickup, MusicNoteGfx>();
  private stageLightGfx = new Map<StageLight, StageLightGfx>();
  private stageMagnetGfx = new Map<StageMagnetPickup, StageMagnetGfx>();
  private healthPickupGfx = new Map<HealthPickup, HealthPickupGfx>();
  private scenery = new Map<string, SceneryCell>();
  private chestGfx = new Map<Chest, ChestGfx>();
  /** The one live chest slot ceremony: a rattling case with a reel window
   *  cycling above it. Shell-driven (game.ts owns the timing and payout);
   *  the view only animates the spin and throws the landing party. */
  private chestCeremony: {
    root: Container;
    chest: ChestGfx;
    plate: Container;
    reelText: Text;
    x: number;
    y: number;
    tickTimes: number[];
    entries: ChestReelEntry[];
    t: number;
    tick: number;
    pop: number;
  } | null = null;
  private groundPickGfx: RewardGfx[] = [];
  /** Chest payout pedestals. Separate from groundPickGfx because the shell's
   *  semantics differ: these are grants scooped one by one, not a choice that
   *  clears its siblings — and they skip the safe-zone ring. */
  private chestDropGfx: RewardGfx[] = [];
  private pops: Pop[] = [];
  private floaters: Floater[] = [];
  private live = new Set<object>();
  private deathBurstCount = 0;

  private shakes: { start: number; mag: number; dur: number }[] = [];
  private flashes: { start: number; dur: number; color: number; alpha: number }[] = [];
  private trails = new Map<Projectile, number[]>();
  private chapter = -1;
  /** Walk-loop clock and the position it measures movement against. */
  private walkT = 0;
  private walkLastX = 0;
  private walkLastY = 0;
  private walkLastTimeS = 0;
  private readonly reducedMotion: boolean;

  constructor(world: RunWorld, view: { width: number; height: number }) {
    this.world = world;
    this.view = view;
    this.stage = new Container();
    this.reducedMotion = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.playerGfx = makePlayerGfx(RUN.playerRadius);

    this.tiledGroundLayer.addChild(this.floorFallback, this.floorTileLayer, this.floorShade);
    this.environmentLayer.addChild(this.environmentFloorGfx);
    // Additive, and below the enemy layer: the glow reads as light thrown on
    // the floor under the boss rather than a disc painted over it.
    this.bossGlowGfx.blendMode = 'add';
    this.zoneLayer.addChild(this.bossGlowGfx, this.telegraphGfx);
    this.attackLayer.addChild(
      this.trailGfx,
      this.projectileLayer,
      this.systemAttackGfx,
      this.fxLayer,
      this.floaterLayer,
    );
    this.playerLayer.addChild(this.playerGfx);
    this.rewardLayer.addChild(this.rarePickupLayer, this.rewardSafeGfx, this.tourRewardLayer);
    this.foregroundLayer.addChild(this.foregroundGfx);
    this.flashLayer.addChild(this.flashGfx);
    this.stage.addChild(
      this.tiledGroundLayer,
      this.environmentLayer,
      this.propLayer,
      this.zoneLayer,
      this.gemLayer,
      this.enemyLayer,
      this.dummyLabelLayer,
      this.attackLayer,
      this.playerLayer,
      this.rewardLayer,
      this.foregroundLayer,
      this.flashLayer,
    );

    const ready = soundwoodFloorTexture();
    if (ready) this.installFloorTexture(ready);
    else {
      void preloadSoundwoodFloor().then((texture) => {
        if (texture && !this.destroyed) this.installFloorTexture(texture);
      });
    }
  }

  pushShake(mag: number, dur: number): void {
    this.shakes.push({ start: this.world.timeS, mag, dur });
  }

  flourish(x: number, y: number): void {
    const gfx = new Graphics({ roundPixels: true });
    gfx.poly(regularPixelPoly(12, 30, Math.PI / 12)).stroke({ width: 4, color: 0xffffff });
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      pixelDiamond(gfx, Math.cos(angle) * 34, Math.sin(angle) * 34, 3, 0xffffff);
    }
    gfx.tint = SOUNDWOOD.cyan;
    gfx.position.set(snap(x), snap(y));
    gfx.scale.set(0.2);
    gfx.blendMode = 'add';
    this.fxLayer.addChild(gfx);
    this.pops.push({ gfx, t: 0, dur: 0.7, fromScale: 0.2, toScale: 8.5 });
  }

  levelBurst(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const gfx = new Graphics({ roundPixels: true });
      gfx.poly(regularPixelPoly(i === 1 ? 8 : 12, 28 + i * 8, Math.PI / 8))
        .stroke({ width: 5 - i, color: 0xffffff, alpha: 0.9 - i * 0.18 });
      gfx.tint = i === 1 ? SOUNDWOOD.magenta : SOUNDWOOD.cyan;
      gfx.position.set(snap(x), snap(y));
      gfx.scale.set(0.18);
      gfx.blendMode = 'add';
      this.fxLayer.addChild(gfx);
      this.pops.push({
        gfx,
        t: -i * 0.04,
        dur: 0.78,
        fromScale: 0.18,
        toScale: 7 + i * 2.2,
      });
    }
    this.flashes.push({ start: this.world.timeS, dur: 0.48, color: SOUNDWOOD.cyan, alpha: 0.2 });
  }

  /** Start the chest slot spin at the opened chest's spot: a fresh case that
   *  rattles harder as the wheel slows, under a reel window cycling through
   *  the possible rewards on the SAME tick schedule the audio cue plays. */
  startChestCeremony(x: number, y: number, tickTimes: number[], entries: ChestReelEntry[]): void {
    this.clearChestCeremony();
    const root = new Container();
    root.position.set(snap(x), snap(y));
    const chest = makeChestGfx({ x, y, color: 0xffd45c });
    const plate = new Container();
    plate.position.set(0, -108);
    const frame = new Graphics({ roundPixels: true });
    frame.rect(-80, -19, 160, 38).fill({ color: SOUNDWOOD.ink, alpha: 0.85 });
    frame.rect(-80, -19, 160, 38).stroke({ width: 3, color: 0xffd45c, alpha: 0.8 });
    pixelDiamond(frame, -90, 0, 4, 0xffd45c, 0.9);
    pixelDiamond(frame, 90, 0, 4, 0xffd45c, 0.9);
    const reelText = new Text({ text: '· · ·', style: REEL_STYLE, roundPixels: true });
    reelText.anchor.set(0.5);
    plate.addChild(frame, reelText);
    root.addChild(chest, plate);
    this.tourRewardLayer.addChild(root);
    this.chestCeremony = { root, chest, plate, reelText, x, y, tickTimes, entries, t: 0, tick: -1, pop: 0 };
  }

  /** The reel stopped: tear down the spin and land the payout — banner, spark
   *  spray, and for a jackpot the full burst-and-shake treatment. */
  landChestCeremony(label: string, color: number, opts: { big: boolean; jackpot: boolean }): void {
    const ceremony = this.chestCeremony;
    if (!ceremony) return;
    this.clearChestCeremony();
    this.spawnWorldBanner(label, ceremony.x, ceremony.y, color, opts.big);
    this.spawnFx({
      type: 'spark',
      x: ceremony.x,
      y: ceremony.y - 10,
      color,
      n: opts.jackpot ? 34 : 16,
      spread: opts.jackpot ? 180 : 110,
    });
    if (opts.jackpot) {
      this.levelBurst(ceremony.x, ceremony.y);
      this.pushShake(10, 0.6);
    }
  }

  /** Drop the ceremony visuals without landing (run ended, world reset). */
  clearChestCeremony(): void {
    if (!this.chestCeremony) return;
    this.chestCeremony.root.destroy({ children: true });
    this.chestCeremony = null;
  }

  /** Spin animation, on REAL time: the audio cue is scheduled in wall-clock
   *  AudioContext time, so the reel must ignore the ceremony's own slow-mo to
   *  keep every visible frame flip on its audible tick. */
  private updateChestCeremony(realDt: number): void {
    const c = this.chestCeremony;
    if (!c) return;
    c.t += realDt;
    while (c.tick + 1 < c.tickTimes.length && c.t >= c.tickTimes[c.tick + 1]) {
      c.tick++;
      const entry = c.entries[c.tick % c.entries.length];
      c.reelText.text = entry.label.toUpperCase();
      c.reelText.tint = entry.color;
      c.pop = 0.09;
    }
    c.pop = Math.max(0, c.pop - realDt);
    const spinS = c.tickTimes[c.tickTimes.length - 1] || 1;
    const progress = Math.min(1, c.t / spinS);
    // The case can barely hold it in: rattle and glow grow as the wheel slows.
    const rattle = this.reducedMotion ? 0 : 0.8 + 3.4 * progress;
    c.chest.__case.x = Math.sin(c.t * 55) * rattle;
    c.chest.__case.rotation = this.reducedMotion ? 0 : Math.sin(c.t * 43) * 0.05 * progress;
    c.chest.__case.scale.set(1 + 0.06 * progress);
    c.chest.__beam.alpha = 0.5 + 0.42 * progress + Math.sin(c.t * 30) * 0.08;
    c.plate.scale.set(1 + (c.pop / 0.09) * 0.12);
  }

  setGroundPicks(picks: GroundPickView[]): void {
    for (const reward of this.groundPickGfx) reward.destroy({ children: true });
    this.groundPickGfx.length = 0;
    this.rewardSafeGfx.clear();

    if (picks.length > 0) {
      const centerX = picks.reduce((sum, pick) => sum + pick.x, 0) / picks.length;
      const centerY = picks.reduce((sum, pick) => sum + pick.y, 0) / picks.length;
      const safeRadius = 178;
      this.rewardSafeGfx
        .poly(regularPixelPoly(16, safeRadius, Math.PI / 16).map((value, i) => snap(value + (i % 2 === 0 ? centerX : centerY))))
        .fill({ color: SOUNDWOOD.cyan, alpha: 0.035 })
        .stroke({ width: 3, color: SOUNDWOOD.cyan, alpha: 0.42 });
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        pixelDiamond(
          this.rewardSafeGfx,
          centerX + Math.cos(angle) * safeRadius,
          centerY + Math.sin(angle) * safeRadius,
          i % 2 === 0 ? 5 : 3,
          i % 2 === 0 ? SOUNDWOOD.cyanHot : SOUNDWOOD.magenta,
          0.72,
        );
      }
    }

    for (const pick of picks) {
      const reward = makeRewardGfx(pick);
      this.rewardLayer.addChild(reward);
      this.groundPickGfx.push(reward);
    }
  }

  /** Replace the chest payout pedestals (the shell re-sends the survivors
   *  after each scoop). Same pedestal art as ground picks, no safe ring. */
  setChestDrops(picks: GroundPickView[]): void {
    for (const reward of this.chestDropGfx) reward.destroy({ children: true });
    this.chestDropGfx.length = 0;
    for (const pick of picks) {
      const reward = makeRewardGfx(pick);
      this.rewardLayer.addChild(reward);
      this.chestDropGfx.push(reward);
    }
  }

  update(dt: number, realDt = dt): void {
    for (const fx of this.world.fx ?? []) this.spawnFx(fx);
    if (this.world.fx) this.world.fx.length = 0;

    const player = this.world.player;
    const cameraX = player.x + PLAYER_FOOT_OFFSET.x;
    const cameraY = player.y + PLAYER_FOOT_OFFSET.y;
    const nextChapter = visualChapter(this.world);
    if (this.chapter >= 0 && nextChapter !== this.chapter) this.chapterBurst(cameraX, cameraY, nextChapter);
    this.chapter = nextChapter;

    this.updateFloor(cameraX, cameraY);
    this.drawArenaEnvironment(cameraX, cameraY);
    this.updateScenery(cameraX, cameraY);
    this.syncStageLights(cameraX, cameraY);
    this.syncZones();
    this.drawEnemyTelegraphs(cameraX, cameraY);
    this.syncGems(cameraX, cameraY);
    this.syncMusicNotes(cameraX, cameraY);
    this.syncStageMagnets(cameraX, cameraY);
    this.syncHealthPickups(cameraX, cameraY);
    this.syncEnemies(cameraX, cameraY);
    this.syncDummyLabels(cameraX, cameraY);
    this.syncProjectiles(cameraX, cameraY);
    this.drawTrails();
    this.drawTourAttacks(cameraX, cameraY);
    this.updatePops(dt);
    this.updateFloaters(dt);
    this.updatePlayer();
    this.updateGroundPicks();
    this.syncChests();
    this.updateChestCeremony(realDt);
    this.drawForeground(cameraX, cameraY);
    this.drawFlash(cameraX, cameraY);

    let shakeAmp = 0;
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const shake = this.shakes[i];
      const progress = (this.world.timeS - shake.start) / shake.dur;
      if (progress >= 1 || progress < 0) {
        this.shakes.splice(i, 1);
        continue;
      }
      shakeAmp = Math.max(shakeAmp, shake.mag * (1 - progress));
    }
    const sx = shakeAmp ? Math.sin(this.world.timeS * 151.7) * shakeAmp : 0;
    const sy = shakeAmp ? Math.cos(this.world.timeS * 197.3) * shakeAmp : 0;
    const zoom = this.world.zoom;
    this.stage.scale.set(zoom);
    this.stage.position.set(
      snap(this.view.width / 2 - cameraX * zoom + sx),
      snap(this.view.height / 2 - cameraY * zoom + sy),
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.chestCeremony = null; // its root dies with the stage below
    this.stage.destroy({ children: true });
    this.floorTiling = null; // destroyed with the stage above
    this.enemyGfx.clear();
    this.dummyLabels.clear();
    this.projectileGfx.clear();
    this.zoneGfx.clear();
    this.gemGfx.clear();
    this.musicNoteGfx.clear();
    this.stageMagnetGfx.clear();
    this.healthPickupGfx.clear();
    this.scenery.clear();
    this.chestGfx.clear();
    this.groundPickGfx.length = 0;
    this.chestDropGfx.length = 0;
    this.pops.length = 0;
    this.floaters.length = 0;
    this.trails.clear();
    this.shakes.length = 0;
    this.flashes.length = 0;
  }

  private installFloorTexture(texture: Texture): void {
    this.floorTexture = texture;
    texture.source.scaleMode = 'nearest';
    texture.source.addressMode = 'repeat';
    this.floorFallback.alpha = 0;
    this.floorTiling?.destroy();
    const tiling = new TilingSprite({ texture, width: 1, height: 1, roundPixels: true });
    tiling.tileScale.set(FLOOR_SCALE);
    this.floorTileLayer.addChild(tiling);
    this.floorTiling = tiling;
  }

  private updateFloor(cameraX: number, cameraY: number): void {
    const width = this.world.worldW;
    const height = this.world.worldH;
    const left = cameraX - width / 2;
    const top = cameraY - height / 2;
    const texture = this.floorTexture;

    if (!texture) {
      this.floorFallback.clear();
      this.floorFallback.rect(snap(left - 80), snap(top - 80), snap(width + 160), snap(height + 160))
        .fill(SOUNDWOOD.shadow);
      const cell = 64;
      const startX = Math.floor((left - 80) / cell) * cell;
      const startY = Math.floor((top - 80) / cell) * cell;
      for (let x = startX; x < left + width + 80; x += cell) {
        for (let y = startY; y < top + height + 80; y += cell) {
          const value = hash2(Math.floor(x / cell), Math.floor(y / cell), 42);
          if (value > 0.52) {
            this.floorFallback.rect(x + snap(value * 31), y + snap(value * 43), 3, 3)
              .fill({ color: value > 0.82 ? SOUNDWOOD.pineLight : SOUNDWOOD.bark, alpha: 0.42 });
          }
        }
      }
    } else if (this.floorTiling) {
      const tiling = this.floorTiling;
      const x = snap(left - 80);
      const y = snap(top - 80);
      tiling.position.set(x, y);
      tiling.width = snap(width + 160);
      tiling.height = snap(height + 160);
      // The covering rectangle chases the camera, so the texture has to be
      // pushed back by however far it moved or the ground would swim along
      // with it. Modulo one tile keeps the offset small over a long run.
      tiling.tilePosition.set(-x % FLOOR_TILE_SIZE, -y % FLOOR_TILE_SIZE);
      const palette = ARENA_PALETTE;
      tiling.tint = multiplyTint(
        multiplyTint(CHAPTER_TINTS[this.chapter % CHAPTER_TINTS.length], palette.tint),
        FLOOR_TONE,
      );
    }

    // A translucent night wash keeps generated detail rich but below enemies.
    // #209 set the wash to ~0.12 on the assumption the tile would bake its own
    // darkness. It came back brighter and warmer than that, so the dial it left
    // for exactly this gets turned the other way: 0.5, chosen against
    // art/pixellab/tune-floor.py, is where the sprites separate from the ground
    // without the texture going to mud.
    this.floorShade.clear();
    this.floorShade.rect(snap(left - 80), snap(top - 80), snap(width + 160), snap(height + 160))
      .fill({ color: SOUNDWOOD.ink, alpha: texture ? 0.5 : 0.08 });
    const palette = ARENA_PALETTE;
    const chapterColor = this.chapter % 2 === 0 ? palette.accent : palette.secondary;
    this.floorShade.rect(snap(left - 80), snap(top - 80), snap(width + 160), snap(height + 160))
      .fill({ color: chapterColor, alpha: Math.min(0.042, 0.008 + this.chapter * 0.003) });
  }

  /** Arena floor motifs: sparse floor paint and architecture shadows, never
   * colliders. Cable loops and drain grates give the arena a
   * deliberately urban read while staying much dimmer than enemies, pickups,
   * and attack telegraphs. */
  private drawArenaEnvironment(cameraX: number, cameraY: number): void {
    const gfx = this.environmentFloorGfx;
    const palette = ARENA_PALETTE;
    const width = this.world.worldW;
    const height = this.world.worldH;
    const left = cameraX - width / 2 - 100;
    const top = cameraY - height / 2 - 100;
    const right = left + width + 200;
    const bottom = top + height + 200;
    const cell = 224;
    const minX = Math.floor(left / cell);
    const maxX = Math.floor(right / cell);
    const minY = Math.floor(top / cell);
    const maxY = Math.floor(bottom / cell);
    gfx.clear();

    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const h = hash2(ix, iy, 4401);
        if (h < 0.64) continue;
        const x = ix * cell + cell * (0.25 + hash2(ix, iy, 4403) * 0.5);
        const y = iy * cell + cell * (0.25 + hash2(ix, iy, 4409) * 0.5);
        gfx.poly(regularPixelPoly(8, 28 + h * 18, Math.PI / 8)
          .map((value, i) => snap(value + (i % 2 === 0 ? x : y))))
          .stroke({ width: 4, color: SOUNDWOOD.ink, alpha: 0.24 });
        gfx.rect(snap(x - 13), snap(y - 8), 26, 16)
          .stroke({ width: 2, color: palette.accent, alpha: 0.1 });
      }
    }
  }

  private updateScenery(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + SCENERY_CELL_SIZE;
    const halfH = this.world.worldH / 2 + SCENERY_CELL_SIZE;
    const minX = Math.floor((cameraX - halfW) / SCENERY_CELL_SIZE);
    const maxX = Math.floor((cameraX + halfW) / SCENERY_CELL_SIZE);
    const minY = Math.floor((cameraY - halfH) / SCENERY_CELL_SIZE);
    const maxY = Math.floor((cameraY + halfH) / SCENERY_CELL_SIZE);
    const wanted = new Set<string>();
    for (let iy = minY; iy <= maxY; iy++) {
      for (let ix = minX; ix <= maxX; ix++) {
        const key = ix + ',' + iy;
        wanted.add(key);
        let cell = this.scenery.get(key);
        if (!cell) {
          cell = makeSceneryCell(ix, iy);
          cell.position.set(ix * SCENERY_CELL_SIZE + SCENERY_CELL_SIZE / 2, iy * SCENERY_CELL_SIZE + SCENERY_CELL_SIZE / 2);
          this.scenery.set(key, cell);
          this.environmentLayer.addChild(cell);
        }
        animateSceneryCell(cell, this.world.timeS, this.chapter);
      }
    }
    for (const [key, cell] of this.scenery) {
      if (!wanted.has(key)) {
        cell.destroy({ children: true });
        this.scenery.delete(key);
      }
    }
  }

  private syncZones(): void {
    this.live.clear();
    for (const zone of this.world.zones) {
      const evolved = roleIsEvolved(this.world, zone.source);
      let gfx = this.zoneGfx.get(zone);
      if (!gfx || gfx.__evolved !== evolved) {
        gfx?.destroy();
        gfx = makeZoneGfx(zone, evolved) as ZoneGfx;
        gfx.__evolved = evolved;
        this.zoneGfx.set(zone, gfx);
        this.zoneLayer.addChild(gfx);
      }
      gfx.position.set(snap(zone.x), snap(zone.y));
      gfx.alpha = Math.min(1, zone.lifeS * 2) * (0.82 + Math.sin(this.world.timeS * 3) * 0.1);
      this.live.add(zone);
    }
    for (const [zone, gfx] of this.zoneGfx) {
      if (!this.live.has(zone)) {
        gfx.destroy();
        this.zoneGfx.delete(zone);
      }
    }
  }

  private drawEnemyTelegraphs(cameraX: number, cameraY: number): void {
    const gfx = this.telegraphGfx;
    const glow = this.bossGlowGfx;
    gfx.clear();
    glow.clear();
    const halfW = this.world.worldW / 2 + 80;
    const halfH = this.world.worldH / 2 + 80;
    for (const enemy of this.world.enemies) {
      if (Math.abs(enemy.x - cameraX) > halfW || Math.abs(enemy.y - cameraY) > halfH) continue;
      // Boss marking (mad-forest-spec 2e), keyed off the spawn and nothing
      // else: the silhouette carries the white ring, this pass carries the
      // breathing glow under it.
      if (enemy.spawnClass !== 'boss') continue;
      gfx.poly(regularPixelPoly(12, enemy.radius * 1.7, Math.PI / 12)
        .map((value, i) => snap(value + (i % 2 === 0 ? enemy.x : enemy.y))))
        .stroke({ width: 2, color: SOUNDWOOD.amber, alpha: 0.26 });
      const breath = 1 + Math.sin(this.world.timeS * BOSS_GLOW_SPEED + enemy.id) * BOSS_GLOW_DEPTH;
      for (const [scale, alpha] of BOSS_GLOW_LAYERS) {
        glow.poly(regularPixelPoly(12, enemy.radius * BOSS_RING_SCALE * scale * breath, Math.PI / 12)
          .map((value, i) => snap(value + (i % 2 === 0 ? enemy.x : enemy.y))))
          .fill({ color: enemy.color, alpha });
      }
    }
  }

  /** Stage Lights. They spawn barely off-screen, so the cull margin is wide
   *  enough that one is already drawn by the time it crosses the edge rather
   *  than popping in — the amber at the rim is half of what the prop is for.
   *
   *  The flicker is a slow amber breath, deliberately unlike the pickups' tight
   *  pulse: this is scenery burning, not something asking to be collected. A
   *  chip surges the fixture for `flashT`, which is the ONLY feedback a hit
   *  gets — the break itself is a spark burst and silence. */
  private syncStageLights(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 120;
    const halfH = this.world.worldH / 2 + 120;
    this.live.clear();
    for (const light of this.world.stageLights) {
      // A broken light stays in the array until the world's next sweep. It
      // leaves the screen NOW, on the frame its spark burst is queued — the
      // cleanup below destroys anything this pass did not claim.
      if (light.dead) continue;
      let gfx = this.stageLightGfx.get(light);
      if (!gfx) {
        gfx = makeStageLightGfx();
        // Half the fixtures face left, keyed off where the light landed so the
        // same prop never changes its mind mid-run.
        gfx.scale.x = hash2(Math.round(light.x), Math.round(light.y)) < 0.5 ? -1 : 1;
        // Placed once and never again: a Stage Light does not move, and the
        // camera pans the whole stage rather than each object.
        gfx.position.set(snap(light.x), snap(light.y));
        this.stageLightGfx.set(light, gfx);
        this.propLayer.addChild(gfx);
      }
      const visible = Math.abs(light.x - cameraX) < halfW && Math.abs(light.y - cameraY) < halfH;
      gfx.renderable = visible;
      if (visible) {
        const t = this.world.timeS;
        const flicker = 0.72 + Math.sin(t * 2.1 + light.x * 0.05) * 0.14
          + Math.sin(t * 7.3 + light.y * 0.05) * 0.06;
        // A chip surges the fixture instead of tinting it: both bright parts
        // blend additively, so full alpha plus a white lens is the flash.
        const hit = light.flashT > 0;
        gfx.__beam.alpha = hit ? 1 : flicker;
        gfx.__lens.alpha = hit ? 1 : 0.82 + flicker * 0.18;
        gfx.__lens.tint = hit ? 0xffffff : STAGE_LIGHT.color;
      }
      this.live.add(light);
    }
    for (const [light, gfx] of this.stageLightGfx) {
      if (!this.live.has(light)) {
        gfx.destroy({ children: true });
        this.stageLightGfx.delete(light);
      }
    }
  }

  private syncGems(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 50;
    const halfH = this.world.worldH / 2 + 50;
    this.live.clear();
    for (const gem of this.world.gems) {
      let gfx = this.gemGfx.get(gem);
      if (!gfx || gfx.__tier !== gem.tier) {
        gfx?.destroy({ children: true });
        gfx = makeGemGfx(gem);
        this.gemGfx.set(gem, gfx);
        this.gemLayer.addChild(gfx);
      }
      const visible = Math.abs(gem.x - cameraX) < halfW && Math.abs(gem.y - cameraY) < halfH;
      gfx.renderable = visible;
      if (visible) {
        gfx.position.set(snap(gem.x), snap(gem.y));
        const pulse = 1 + 0.05 * Math.sin(this.world.timeS * 5 + gem.x * 0.03);
        gfx.scale.set(pulse);
      }
      this.live.add(gem);
    }
    for (const [gem, gfx] of this.gemGfx) {
      if (!this.live.has(gem)) {
        gfx.destroy({ children: true });
        this.gemGfx.delete(gem);
      }
    }
  }

  private syncMusicNotes(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 50;
    const halfH = this.world.worldH / 2 + 50;
    this.live.clear();
    for (const note of this.world.musicNotes) {
      let gfx = this.musicNoteGfx.get(note);
      if (!gfx || gfx.__tier !== note.tier) {
        gfx?.destroy({ children: true });
        gfx = makeMusicNoteGfx(note);
        this.musicNoteGfx.set(note, gfx);
        this.gemLayer.addChild(gfx);
      }
      const visible = Math.abs(note.x - cameraX) < halfW && Math.abs(note.y - cameraY) < halfH;
      gfx.renderable = visible;
      if (visible) {
        gfx.position.set(snap(note.x), snap(note.y - Math.sin(this.world.timeS * 6 + note.x * 0.02) * 3));
        const pulse = 1 + 0.08 * Math.sin(this.world.timeS * 7 + note.y * 0.03);
        gfx.scale.set(pulse);
      }
      this.live.add(note);
    }
    for (const [note, gfx] of this.musicNoteGfx) {
      if (!this.live.has(note)) {
        gfx.destroy({ children: true });
        this.musicNoteGfx.delete(note);
      }
    }
  }

  private syncStageMagnets(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 70;
    const halfH = this.world.worldH / 2 + 70;
    this.live.clear();
    for (const magnet of this.world.stageMagnets) {
      let gfx = this.stageMagnetGfx.get(magnet);
      if (!gfx) {
        gfx = makeStageMagnetGfx(magnet);
        this.stageMagnetGfx.set(magnet, gfx);
        this.rarePickupLayer.addChild(gfx);
      }
      const visible = Math.abs(magnet.x - cameraX) < halfW && Math.abs(magnet.y - cameraY) < halfH;
      gfx.renderable = visible;
      if (visible) {
        const t = this.world.timeS;
        const bob = Math.sin(t * 4.8 + magnet.x * 0.02) * 2;
        const pulse = 1 + Math.sin(t * 5.6) * 0.045;
        gfx.position.set(snap(magnet.x), snap(magnet.y + bob));
        gfx.scale.set(pulse);
        gfx.__beam.rotation = t * 0.42;
        gfx.__beam.alpha = 0.32 + Math.sin(t * 3.2) * 0.12;
        gfx.__field.position.x = snap(Math.sin(t * 7) * 3);
        gfx.__field.alpha = 0.55 + Math.sin(t * 8) * 0.35;
        gfx.__leftPole.alpha = 0.76 + Math.sin(t * 6) * 0.24;
        gfx.__rightPole.alpha = 0.76 - Math.sin(t * 6) * 0.24;
      }
      this.live.add(magnet);
    }
    for (const [magnet, gfx] of this.stageMagnetGfx) {
      if (!this.live.has(magnet)) {
        gfx.destroy({ children: true });
        this.stageMagnetGfx.delete(magnet);
      }
    }
  }

  private syncHealthPickups(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 70;
    const halfH = this.world.worldH / 2 + 70;
    this.live.clear();
    for (const pickup of this.world.healthPickups) {
      let gfx = this.healthPickupGfx.get(pickup);
      if (!gfx) {
        gfx = makeHealthPickupGfx(pickup);
        this.healthPickupGfx.set(pickup, gfx);
        this.rarePickupLayer.addChild(gfx);
      }
      const visible = Math.abs(pickup.x - cameraX) < halfW && Math.abs(pickup.y - cameraY) < halfH;
      gfx.renderable = visible;
      if (visible) {
        const t = this.world.timeS;
        const bob = Math.sin(t * 4.2 + pickup.x * 0.02) * 2;
        // Steady heartbeat rather than the magnet's shimmer, so it reads as
        // health without a legend.
        const beat = 1 + Math.abs(Math.sin(t * 3.4)) * 0.07;
        gfx.position.set(snap(pickup.x), snap(pickup.y + bob));
        gfx.scale.set(beat);
        gfx.__pulse.rotation = -t * 0.3;
        gfx.__pulse.alpha = 0.3 + Math.abs(Math.sin(t * 3.4)) * 0.32;
        gfx.__cross.alpha = 0.9 + Math.sin(t * 6.4) * 0.1;
      }
      this.live.add(pickup);
    }
    for (const [pickup, gfx] of this.healthPickupGfx) {
      if (!this.live.has(pickup)) {
        gfx.destroy({ children: true });
        this.healthPickupGfx.delete(pickup);
      }
    }
  }

  private syncEnemies(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 100;
    const halfH = this.world.worldH / 2 + 100;
    this.live.clear();
    for (const enemy of this.world.enemies) {
      const loop = enemyLoop(enemy.kind);
      let gfx = this.enemyGfx.get(enemy);
      // The generated kinds run their own four-frame loop at the tempo their
      // concept ticket locked; every other kind keeps the two-frame drawn
      // cycle, so the 2:00+ swarm shows both side by side (#207).
      const frame = loop
        ? loopFrame(loop, this.world.timeS, enemy.id * 0.41)
        : enemyFrame(enemy, this.world.timeS);
      if (!gfx) {
        gfx = loop ? makeSpriteEnemyGfx(enemy, loop, frame) : makeEnemyGfx(enemy, frame);
        this.enemyGfx.set(enemy, gfx);
        this.enemyLayer.addChild(gfx);
      }
      this.live.add(enemy);
      const visible = Math.abs(enemy.x - cameraX) < halfW && Math.abs(enemy.y - cameraY) < halfH;
      gfx.renderable = visible;
      if (!visible) continue;

      gfx.position.set(snap(enemy.x), snap(enemy.y));

      if (isSpriteEnemyGfx(gfx)) {
        syncSpriteEnemyGfx(gfx, enemy, frame);
        // Baked colour, not runtime tint (#207): the sprite ships its own
        // SOUNDWOOD tones, so the hit flash is a white silhouette laid over
        // it rather than a tint the art has nothing to give back.
        gfx.__flash.alpha = enemy.flashT > 0 ? 1 : 0;
        // The generated kinds sway with everything else: the tilt is what makes
        // the crowd feel alive, and a sprite body is no reason to opt out of it.
        // Same mirror rule as the drawn silhouettes -- negating the lean along
        // with the flip keeps it pointing the same way in world space, so an
        // enemy crossing the player never snaps to the opposite lean.
        const flipped = enemy.lastMoveX < -0.01;
        const tilt = enemyTilt(enemy, this.world.timeS * TILT_SPEED);
        // The drawn swarm bodies turn to face their sweep, but a generated
        // sprite is an upright figure and the same rotation lays it on its
        // side at any heading that is not due east (#219). Sprites keep the
        // mirror instead, so the Static Rush runs at you rather than past you.
        gfx.rotation = flipped ? -tilt : tilt;
        gfx.scale.set(flipped ? -gfx.__scale : gfx.__scale, gfx.__scale);
        gfx.alpha = 1;
        continue;
      }

      if (gfx.__frame !== frame || gfx.__radius !== enemy.radius) {
        gfx.context = enemyContext(enemy, frame);
        gfx.__frame = frame;
        gfx.__radius = enemy.radius;
      }
      gfx.tint = enemy.flashT > 0 ? 0xffffff : enemy.color;
      const tilt = enemyTilt(enemy, this.world.timeS * TILT_SPEED);
      gfx.rotation = tilt;
      gfx.scale.set(1);
      if (enemy.kind === 'ghost') gfx.alpha = 0.78 + Math.sin(this.world.timeS * 3 + enemy.id) * 0.08;
      // The sweep is a wall of bodies passing through: it holds the locked
      // 0.82 rather than breathing, so the whole rush reads as one pass.
      else if (enemy.kind === 'ghostSwarm') gfx.alpha = 0.82;
      else gfx.alpha = 1;

      if ((enemy.kind === 'batSwarm' || enemy.kind === 'ghostSwarm') && (enemy.moveX !== 0 || enemy.moveY !== 0)) {
        gfx.rotation = Math.atan2(enemy.moveY, enemy.moveX) + tilt;
      } else if (enemy.lastMoveX < -0.01) {
        // A mirrored sprite mirrors its lean too, so an enemy crossing the
        // player would visibly snap to the opposite tilt at the moment it
        // flips. Negating here keeps the lean pointing the same way in world
        // space, and the flip stays invisible.
        gfx.scale.x = -1;
        gfx.rotation = -tilt;
      }
    }
    for (const [enemy, gfx] of this.enemyGfx) {
      if (!this.live.has(enemy)) {
        gfx.destroy();
        this.enemyGfx.delete(enemy);
      }
    }
  }

  /** One persistent readout per practice target, added and reaped by the same
   *  live-set diff the enemy sprites use — so CLEAR DUMMIES and CLEAR ALL both
   *  take their labels with them and never orphan a Text. */
  private syncDummyLabels(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 100;
    const halfH = this.world.worldH / 2 + 100;
    this.live.clear();
    for (const enemy of this.world.enemies) {
      if (!enemy.dummy || !enemy.readout) continue;
      let label = this.dummyLabels.get(enemy);
      if (!label) {
        label = new Text({ text: '', style: DUMMY_LABEL_STYLE, roundPixels: true });
        label.anchor.set(0.5, 1);
        this.dummyLabels.set(enemy, label);
        this.dummyLabelLayer.addChild(label);
      }
      this.live.add(enemy);
      const visible = Math.abs(enemy.x - cameraX) < halfW && Math.abs(enemy.y - cameraY) < halfH;
      label.renderable = visible;
      if (!visible) continue;
      label.text =
        `DPS ${formatDummyNumber(this.world.dummyDps(enemy))}\n` +
        `TOTAL ${formatDummyNumber(enemy.readout.total)}`;
      label.position.set(snap(enemy.x), snap(enemy.y - enemy.radius - 28));
    }
    for (const [enemy, label] of this.dummyLabels) {
      if (!this.live.has(enemy)) {
        label.destroy({ children: true });
        this.dummyLabels.delete(enemy);
      }
    }
  }

  private syncProjectiles(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + 100;
    const halfH = this.world.worldH / 2 + 100;
    this.live.clear();
    for (const projectile of this.world.projectiles) {
      const evolved = roleIsEvolved(this.world, projectile.role);
      let gfx = this.projectileGfx.get(projectile);
      if (!gfx) {
        gfx = makeProjectileGfx(projectile, evolved);
        this.projectileGfx.set(projectile, gfx);
        this.projectileLayer.addChild(gfx);
      } else if (gfx.__evolved !== evolved) {
        refreshProjectileContext(gfx, projectile, evolved);
      }
      const visible = Math.abs(projectile.x - cameraX) < halfW && Math.abs(projectile.y - cameraY) < halfH;
      gfx.renderable = visible;
      if (visible) {
        gfx.position.set(snap(projectile.x), snap(projectile.y));
        if (projectile.role !== 'arp') gfx.rotation = Math.atan2(projectile.vy, projectile.vx);
        const pulse = evolved ? 1 + Math.sin(this.world.timeS * 9 + projectile.age * 2) * 0.09 : 1;
        gfx.scale.set(pulse);
      }
      this.live.add(projectile);
    }
    for (const [projectile, gfx] of this.projectileGfx) {
      if (!this.live.has(projectile)) {
        gfx.destroy();
        this.projectileGfx.delete(projectile);
      }
    }
  }

  private drawTrails(): void {
    this.trailGfx.clear();
    const liveTrails = new Set<Projectile>();
    let evolvedHatTrails = 0;
    for (const projectile of this.world.projectiles) {
      // Cap held at 64 on purpose: the lane's chips all share one angle, so the
      // nearest 64 already draw the whole rail — more would only overdraw it.
      const evolvedHat = projectile.role === 'hat' && roleIsEvolved(this.world, 'hat') && evolvedHatTrails++ < 64;
      if (!TRAIL_ROLES.has(projectile.role) && !evolvedHat) continue;
      liveTrails.add(projectile);
      let points = this.trails.get(projectile);
      if (!points) {
        points = [];
        this.trails.set(projectile, points);
      }
      points.push(snap(projectile.x), snap(projectile.y));
      if (points.length > TRAIL_POINTS * 2) points.splice(0, points.length - TRAIL_POINTS * 2);
      for (let i = 0; i < points.length; i += 2) {
        const progress = (i + 2) / points.length;
        // The evolved hat is a lane now, so its streak reads brighter than the
        // old ricochet trail — the rail itself is the weapon's tell.
        const size = Math.max(1, snap(1 + progress * 3));
        this.trailGfx.rect(points[i] - Math.floor(size / 2), points[i + 1] - Math.floor(size / 2), size, size)
          .fill({ color: projectile.color, alpha: progress * (evolvedHat ? 0.5 : 0.42) });
      }
    }
    for (const projectile of this.trails.keys()) if (!liveTrails.has(projectile)) this.trails.delete(projectile);
  }

  private drawTourAttacks(cameraX: number, cameraY: number): void {
    const gfx = this.systemAttackGfx;
    const halfW = this.world.worldW / 2 + 120;
    const halfH = this.world.worldH / 2 + 120;
    gfx.clear();
    for (const wave of this.world.shockwaves) {
      if (Math.abs(wave.x - cameraX) > halfW || Math.abs(wave.y - cameraY) > halfH) continue;
      // age counts up while lifeS counts down, so age + lifeS is the invariant total life.
      // Dividing by lifeS alone made the ring vanish at half the sweep while it kept damaging.
      const progress = Math.min(1, wave.age / Math.max(0.001, wave.age + wave.lifeS));
      // Hold the ring legible across the sweep it actually damages on, then fade out only at
      // the very end. Same colors and widths as before, no fill: the edge stays honest.
      const alpha = progress < 0.8 ? 1 - progress * 0.3125 : 0.75 - (progress - 0.8) / 0.2 * 0.45;
      const radius = Math.max(4, wave.radius);
      gfx.poly(regularPixelPoly(20, radius, Math.PI / 20)
        .map((value, i) => snap(value + (i % 2 === 0 ? wave.x : wave.y))))
        .stroke({ width: 7, color: SOUNDWOOD.ink, alpha: alpha * 0.56 });
      gfx.poly(regularPixelPoly(20, radius, Math.PI / 20)
        .map((value, i) => snap(value + (i % 2 === 0 ? wave.x : wave.y))))
        .stroke({ width: 3, color: wave.color, alpha: alpha * 0.95 });
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI / 5;
        pixelDiamond(
          gfx,
          wave.x + Math.cos(angle) * radius,
          wave.y + Math.sin(angle) * radius,
          3 + (i & 1),
          i & 1 ? 0xffffff : wave.color,
          alpha * 0.82,
        );
      }
    }
  }

  private updatePlayer(): void {
    const player = this.world.player;
    this.playerGfx.position.set(snap(player.x), snap(player.y));
    this.updateWalkLoop(player.x, player.y);
    this.playerGfx.__body.scale.x = player.facingX * this.playerGfx.__bodyScale;
    const pulse = 1 + Math.sin(this.world.timeS * 3.8) * 0.035;
    this.playerGfx.__halo.scale.set(pulse);
    this.playerGfx.__halo.alpha = evolvedCount(this.world) > 0 ? 1 : 0.78;
    this.playerGfx.__marker.scale.set(1 + Math.sin(this.world.timeS * 6) * 0.06);
    this.playerGfx.__marker.tint = 0xffffff;
    this.playerGfx.__body.alpha = player.iframesT > 0 && Math.floor(this.world.timeS * 18) % 2 === 0 ? 0.42 : 1;
    // Marker and halo never flicker: even during damage the player stays findable.
    this.playerGfx.__marker.alpha = 1;
  }

  /** The walk plays only while the player is actually moving; standing still
   *  holds frame 0. The generation plan bought one four-frame loop and no idle
   *  animation (#210), and frames 1-3 rotate off south, so frame 0 is the one
   *  clean standing pose the set contains (#212).
   *
   *  Movement is read from the position delta rather than the input axis: the
   *  view has no business reaching into the controls, and a delta also holds
   *  still through pauses and menus, which is what it should do.
   *
   *  Crucially the delta is measured against SIM time, not render time. The sim
   *  steps at a fixed 60Hz while this runs once per rendered frame, so a display
   *  faster than 60Hz (120Hz ProMotion phones, high-refresh monitors) renders
   *  frames in which no step happened and the position has not changed. Such a
   *  frame is NOT the player standing still -- treating it as such would reset
   *  the walk clock every other frame and pin the loop to frame 0, which is why
   *  the walk went dead on mobile. Skip any frame that advanced no sim time so
   *  the clock only ever moves on real steps. */
  private updateWalkLoop(x: number, y: number): void {
    const walk = this.playerGfx.__walk;
    const loop = playerLoop();
    if (!walk || !loop) return;
    const elapsed = this.world.timeS - this.walkLastTimeS;
    // No sim step since the last call (or the clock reset for a new run): hold
    // the frame already showing rather than re-reading a stale position delta.
    if (elapsed <= 0) return;
    const moved = Math.abs(x - this.walkLastX) > 0.01 || Math.abs(y - this.walkLastY) > 0.01;
    this.walkLastX = x;
    this.walkLastY = y;
    this.walkLastTimeS = this.world.timeS;
    // The loop clock only runs while walking, so every departure steps off
    // from frame 0 rather than resuming wherever the last one stopped.
    this.walkT = moved ? this.walkT + elapsed : 0;
    walk.texture = loop.frames[moved ? loopFrame(loop, this.walkT) : 0];
  }

  private updateGroundPicks(): void {
    const time = this.world.timeS;
    for (let i = 0; i < this.groundPickGfx.length; i++) {
      const reward = this.groundPickGfx[i];
      const pulse = 1 + Math.sin(time * 3.2 + i * 2.1) * 0.035;
      reward.__platform.scale.set(pulse);
      reward.__beam.alpha = 0.72 + Math.sin(time * 2.4 + i) * 0.16;
    }
    this.rewardSafeGfx.alpha = this.groundPickGfx.length
      ? 0.72 + Math.sin(time * 2.2) * 0.16
      : 0;
    for (let i = 0; i < this.chestDropGfx.length; i++) {
      const reward = this.chestDropGfx[i];
      const pulse = 1 + Math.sin(time * 3.2 + i * 2.1) * 0.035;
      reward.__platform.scale.set(pulse);
      reward.__beam.alpha = 0.72 + Math.sin(time * 2.4 + i) * 0.16;
    }
  }

  private syncChests(): void {
    const liveChests = new Set<Chest>();
    for (const chest of this.world.chests) {
      let gfx = this.chestGfx.get(chest);
      if (!gfx) {
        gfx = makeChestGfx(chest);
        this.chestGfx.set(chest, gfx);
        this.tourRewardLayer.addChild(gfx);
      }
      gfx.position.set(snap(chest.x), snap(chest.y));
      const pulse = 1 + Math.sin(this.world.timeS * 4.6 + chest.x * 0.05) * 0.05;
      gfx.__case.scale.set(pulse);
      gfx.__beam.alpha = 0.58 + Math.sin(this.world.timeS * 3 + chest.x * 0.05) * 0.18;
      liveChests.add(chest);
    }
    for (const [chest, gfx] of this.chestGfx) {
      if (liveChests.has(chest)) continue;
      gfx.destroy({ children: true });
      this.chestGfx.delete(chest);
    }
  }

  private spawnWorldBanner(label: string, x: number, y: number, color: number, evolution: boolean): void {
    const gfx = new Graphics({ roundPixels: true });
    const sides = evolution ? 16 : 12;
    gfx.poly(regularPixelPoly(sides, evolution ? 86 : 66, Math.PI / sides))
      .stroke({ width: evolution ? 7 : 5, color: 0xffffff, alpha: 0.92 });
    gfx.poly(regularPixelPoly(8, evolution ? 48 : 38, Math.PI / 8))
      .stroke({ width: 3, color: 0xffffff, alpha: 0.56 });
    for (let i = 0; i < sides; i += 2) {
      const angle = i * Math.PI * 2 / sides;
      const radius = evolution ? 96 : 74;
      pixelDiamond(gfx, Math.cos(angle) * radius, Math.sin(angle) * radius, evolution ? 5 : 4, 0xffffff, 0.84);
    }
    gfx.tint = color;
    gfx.position.set(snap(x), snap(y));
    gfx.scale.set(0.25);
    gfx.blendMode = 'add';
    this.fxLayer.addChild(gfx);
    this.pops.push({ gfx, t: 0, dur: evolution ? 1.1 : 0.82, fromScale: 0.25, toScale: evolution ? 2.1 : 1.7 });

    const text = new Text({ text: label.toUpperCase(), style: BANNER_STYLE, roundPixels: true });
    text.anchor.set(0.5);
    text.tint = color;
    const textY = snap(y - (evolution ? 72 : 58));
    text.position.set(snap(x), textY);
    this.floaterLayer.addChild(text);
    this.floaters.push({ txt: text, x: snap(x), y: textY, t: 0, dur: evolution ? 1.25 : 0.95, vy: 16 });
    this.flashes.push({ start: this.world.timeS, dur: evolution ? 0.82 : 0.44, color, alpha: evolution ? 0.28 : 0.16 });
    this.pushShake(evolution ? 8 : 4, evolution ? 0.55 : 0.3);
  }

  private spawnFx(fx: FxEvent): void {
    switch (fx.type) {
      case 'ring': {
        const gfx = new Graphics({ roundPixels: true });
        const sides = fx.soft ? 12 : 16;
        gfx.poly(regularPixelPoly(sides, fx.radius, Math.PI / sides))
          .stroke({ width: fx.soft ? 2 : 4, color: 0xffffff, alpha: fx.soft ? 0.36 : 0.9 });
        if (!fx.soft) {
          gfx.poly(regularPixelPoly(12, fx.radius * 0.62, Math.PI / 12))
            .stroke({ width: 2, color: 0xffffff, alpha: 0.45 });
          for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI / 4;
            pixelDiamond(gfx, Math.cos(angle) * fx.radius, Math.sin(angle) * fx.radius, 3, 0xffffff, 0.8);
          }
        }
        gfx.tint = fx.color;
        gfx.position.set(snap(fx.x), snap(fx.y));
        gfx.scale.set(this.reducedMotion ? 1 : 0.2);
        if (!fx.soft) gfx.blendMode = 'add';
        this.fxLayer.addChild(gfx);
        this.pops.push({
          gfx,
          t: 0,
          dur: fx.dur,
          fromScale: this.reducedMotion ? 1 : 0.2,
          toScale: 1,
        });
        break;
      }
      case 'flash': {
        // A zone that pulses in place: a filled disc at full radius from frame
        // one, fading out. fromScale ~= toScale means NO outward travel, so it
        // reads as a flash around the player, not a wave leaving them.
        const gfx = new Graphics({ roundPixels: true });
        gfx.poly(regularPixelPoly(24, fx.radius, Math.PI / 24)).fill({ color: 0xffffff, alpha: 0.26 });
        gfx.poly(regularPixelPoly(24, fx.radius * 0.66, Math.PI / 24)).fill({ color: 0xffffff, alpha: 0.18 });
        gfx.poly(regularPixelPoly(24, fx.radius, Math.PI / 24)).stroke({ width: 4, color: 0xffffff, alpha: 0.95 });
        gfx.tint = fx.color;
        gfx.position.set(snap(fx.x), snap(fx.y));
        gfx.scale.set(1);
        gfx.blendMode = 'add';
        this.fxLayer.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: fx.dur, fromScale: 1, toScale: 1.08 });
        break;
      }
      case 'vacuum': {
        const colors = [SOUNDWOOD.cyanHot, SOUNDWOOD.magenta];
        for (let i = 0; i < colors.length; i++) {
          const gfx = new Graphics({ roundPixels: true });
          gfx.poly(regularPixelPoly(16, fx.radius, Math.PI / 16 + i * Math.PI / 16))
            .stroke({ width: i === 0 ? 5 : 3, color: 0xffffff, alpha: 0.72 });
          for (let p = 0; p < 12; p++) {
            const angle = p * Math.PI / 6 + i * Math.PI / 12;
            pixelDiamond(gfx, Math.cos(angle) * fx.radius, Math.sin(angle) * fx.radius, 4, 0xffffff, 0.8);
          }
          gfx.tint = colors[i];
          gfx.position.set(snap(fx.x), snap(fx.y));
          gfx.scale.set(1);
          gfx.blendMode = 'add';
          this.fxLayer.addChild(gfx);
          // Expands past the screen edge rather than collapsing to a radius:
          // the pull is map-wide, so the visual must not draw a boundary.
          this.pops.push({ gfx, t: -i * 0.07, dur: 0.62, fromScale: 0.08, toScale: 1.7 });
        }
        this.flashes.push({ start: this.world.timeS, dur: 0.34, color: SOUNDWOOD.violet, alpha: 0.22 });
        this.pushShake(5, 0.36);
        break;
      }
      case 'arc': {
        const gfx = new Graphics({ roundPixels: true });
        const points = [0, 0];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const angle = fx.angle - fx.arc + (i / steps) * fx.arc * 2;
          points.push(snap(Math.cos(angle) * fx.radius), snap(Math.sin(angle) * fx.radius));
        }
        gfx.poly(points).fill({ color: 0xffffff, alpha: 0.22 });
        for (let i = 0; i <= steps; i += 2) {
          const angle = fx.angle - fx.arc + (i / steps) * fx.arc * 2;
          pixelDiamond(gfx, Math.cos(angle) * fx.radius, Math.sin(angle) * fx.radius, 4, 0xffffff, 0.8);
        }
        gfx.tint = fx.color;
        gfx.position.set(snap(fx.x), snap(fx.y));
        gfx.blendMode = 'add';
        this.fxLayer.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.2, fromScale: 1, toScale: 1.05 });
        break;
      }
      case 'whip': {
        const { width, height } = whipDimensions(fx.area);
        const x0 = fx.side === 1 ? 0 : -width;
        const gfx = new Graphics({ roundPixels: true });
        gfx.rect(snap(x0), snap(-height * 0.72), snap(width), snap(height * 1.44))
          .fill({ color: 0xffffff, alpha: 0.09 });
        gfx.rect(snap(x0), snap(-height * 0.46), snap(width), snap(height * 0.92))
          .fill({ color: 0xffffff, alpha: 0.3 });
        for (let i = 1; i < 8; i++) {
          const x = x0 + width * i / 8;
          gfx.rect(snap(x), snap(-height * 0.58), 3, snap(height * 1.16))
            .fill({ color: 0xffffff, alpha: 0.16 + i * 0.035 });
        }
        pixelDiamond(gfx, x0 + (fx.side === 1 ? width : 0), 0, height * 0.52, 0xffffff, 0.72);
        gfx.tint = fx.color;
        gfx.blendMode = 'add';
        gfx.position.set(snap(fx.x), snap(fx.y));
        gfx.scale.set(0);
        this.fxLayer.addChild(gfx);
        this.pops.push({
          gfx,
          t: 0,
          dur: 0.2,
          fromScale: 0,
          toScale: 1,
          holdHalf: true,
          expandHalf: true,
        });
        break;
      }
      case 'spark': {
        const gfx = new Graphics({ roundPixels: true });
        for (let i = 0; i < fx.n; i++) {
          const angle = hash2(snap(fx.x), snap(fx.y), i * 71 + 9) * Math.PI * 2;
          const distance = fx.spread * (0.48 + hash2(i, snap(fx.x), 313) * 0.52);
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          const size = i % 3 === 0 ? 4 : 2;
          pixelDiamond(gfx, x, y, size, 0xffffff, 0.9);
          gfx.moveTo(0, 0).lineTo(snap(x * 0.78), snap(y * 0.78));
        }
        gfx.stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
        gfx.tint = fx.color;
        gfx.position.set(snap(fx.x), snap(fx.y));
        gfx.blendMode = 'add';
        this.fxLayer.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.2, fromScale: 0.35, toScale: 1.25 });
        break;
      }
      case 'slam': {
        const gfx = new Graphics({ roundPixels: true });
        gfx.poly(regularPixelPoly(12, fx.radius, Math.PI / 12)).stroke({ width: 7, color: 0xffffff, alpha: 0.9 });
        gfx.poly(regularPixelPoly(8, fx.radius * 0.48, Math.PI / 8)).fill({ color: 0xffffff, alpha: 0.4 });
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          pixelDiamond(gfx, Math.cos(angle) * fx.radius, Math.sin(angle) * fx.radius, 5, 0xffffff);
        }
        gfx.tint = fx.color;
        gfx.position.set(snap(fx.x), snap(fx.y));
        gfx.blendMode = 'add';
        this.fxLayer.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.3, fromScale: 0.35, toScale: 1.55 });
        break;
      }
      case 'beam': {
        const dx = fx.x2 - fx.x;
        const dy = fx.y2 - fx.y;
        const length = Math.hypot(dx, dy);
        const width = Math.max(3, fx.width);
        const gfx = new Graphics({ roundPixels: true });
        gfx.rect(0, snap(-width * 1.25), snap(length), snap(width * 2.5))
          .fill({ color: SOUNDWOOD.ink, alpha: 0.58 });
        gfx.rect(0, snap(-width * 0.58), snap(length), snap(width * 1.16))
          .fill({ color: 0xffffff, alpha: 0.72 });
        gfx.rect(0, snap(-Math.max(1, width * 0.16)), snap(length), snap(Math.max(2, width * 0.32)))
          .fill(0xffffff);
        pixelDiamond(gfx, 0, 0, width * 0.9, 0xffffff, 0.78);
        pixelDiamond(gfx, length, 0, width * 1.15, 0xffffff, 0.92);
        gfx.tint = fx.color;
        gfx.position.set(snap(fx.x), snap(fx.y));
        gfx.rotation = Math.atan2(dy, dx);
        gfx.blendMode = 'add';
        this.fxLayer.addChild(gfx);
        this.pops.push({ gfx, t: 0, dur: 0.24, fromScale: 1, toScale: 1.04 });
        break;
      }
      case 'pressure': {
        this.spawnWorldBanner(fx.label, fx.x, fx.y, fx.color, false);
        break;
      }
      case 'evolution':
        this.spawnWorldBanner(fx.label, fx.x, fx.y, fx.color, true);
        break;
      case 'dmg': {
        if (this.floaters.length >= DMG_CAP) break;
        const player = this.world.player;
        const cameraX = player.x + PLAYER_FOOT_OFFSET.x;
        const cameraY = player.y + PLAYER_FOOT_OFFSET.y;
        if (Math.abs(fx.x - cameraX) > this.world.worldW / 2 + 40) break;
        if (Math.abs(fx.y - cameraY) > this.world.worldH / 2 + 40) break;
        const txt = new Text({ text: String(fx.amount), style: DMG_STYLE, roundPixels: true });
        txt.anchor.set(0.5);
        txt.tint = fx.color;
        const offset = (hash2(snap(fx.x), snap(fx.y), fx.amount) - 0.5) * 12;
        const x = snap(fx.x + offset);
        const y = snap(fx.y);
        txt.position.set(x, y);
        this.floaterLayer.addChild(txt);
        this.floaters.push({ txt, x, y, t: 0, dur: DMG_DUR, vy: DMG_RISE });
        break;
      }
      case 'death': {
        if (this.deathBurstCount >= DEATH_BURST_CAP) break;
        if (!fx.elite && this.deathBurstCount >= REGULAR_DEATH_BURST_CAP) break;
        const player = this.world.player;
        const cameraX = player.x + PLAYER_FOOT_OFFSET.x;
        const cameraY = player.y + PLAYER_FOOT_OFFSET.y;
        const pad = fx.elite ? fx.radius * 3 : fx.radius * 2;
        if (Math.abs(fx.x - cameraX) > this.world.worldW / 2 + pad) break;
        if (Math.abs(fx.y - cameraY) > this.world.worldH / 2 + pad) break;
        const { gfx, burst } = makeDeathBurst(fx.radius, fx.color, fx.elite, fx.x, fx.y);
        gfx.position.set(snap(fx.x), snap(fx.y));
        this.fxLayer.addChild(gfx);
        this.pops.push({
          gfx,
          t: 0,
          dur: fx.elite ? 0.66 : 0.44,
          fromScale: 1,
          toScale: 1,
          death: burst,
        });
        this.deathBurstCount++;
        break;
      }
    }
  }

  private updatePops(dt: number): void {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.t += dt;
      if (pop.t < 0) {
        pop.gfx.alpha = 0;
        continue;
      }
      const progress = pop.t / pop.dur;
      if (progress >= 1) {
        if (pop.death) this.deathBurstCount--;
        pop.gfx.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      if (pop.death) {
        redrawDeathBurst(pop.gfx, pop.death, progress);
        pop.gfx.alpha = Math.pow(1 - progress, 0.7);
      } else {
        pop.gfx.alpha = pop.holdHalf
          ? progress < 0.5 ? 1 : (1 - progress) * 2
          : 1 - progress;
        if (pop.expandHalf) pop.gfx.scale.set(Math.min(pop.toScale, progress * 2 * pop.toScale));
        else pop.gfx.scale.set(pop.fromScale + (pop.toScale - pop.fromScale) * progress);
      }
    }
  }

  private updateFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i];
      floater.t += dt;
      const progress = floater.t / floater.dur;
      if (progress >= 1) {
        floater.txt.destroy();
        this.floaters.splice(i, 1);
        continue;
      }
      if (!floater.staticMotion) floater.y -= floater.vy * dt;
      floater.txt.position.set(floater.x, snap(floater.y));
      floater.txt.alpha = progress < 0.4 ? 1 : 1 - (progress - 0.4) / 0.6;
      floater.txt.scale.set((floater.baseScale ?? 1) * (floater.staticMotion
        ? 1
        : 1 + Math.sin(progress * Math.PI) * 0.12));
    }
  }

  private chapterBurst(x: number, y: number, chapter: number): void {
    const palette = ARENA_PALETTE;
    const color = chapter % 2 === 0 ? palette.accent : palette.secondary;
    for (const [radius, sides] of [[110, 12], [165, 16], [225, 8]] as const) {
      const gfx = new Graphics({ roundPixels: true });
      gfx.poly(regularPixelPoly(sides, radius, Math.PI / sides))
        .stroke({ width: 5, color: 0xffffff, alpha: 0.8 });
      for (let i = 0; i < sides; i += 2) {
        const angle = (i / sides) * Math.PI * 2;
        pixelDiamond(gfx, Math.cos(angle) * radius, Math.sin(angle) * radius, 5, 0xffffff, 0.82);
      }
      gfx.tint = color;
      gfx.position.set(snap(x), snap(y));
      gfx.scale.set(0.2);
      gfx.blendMode = 'add';
      this.fxLayer.addChild(gfx);
      this.pops.push({ gfx, t: 0, dur: 1.05, fromScale: 0.2, toScale: 1.45 });
    }
    const banner = new Text({
      text: `MINUTE ${chapter} · CROWD SURGE`,
      style: BANNER_STYLE,
      roundPixels: true,
    });
    banner.anchor.set(0.5);
    banner.tint = color;
    const bannerY = snap(y - 92);
    banner.position.set(snap(x), bannerY);
    this.floaterLayer.addChild(banner);
    this.floaters.push({ txt: banner, x: snap(x), y: bannerY, t: 0, dur: 1.35, vy: 13 });
    this.flashes.push({ start: this.world.timeS, dur: 0.72, color, alpha: 0.18 });
    this.pushShake(5, 0.38);
  }

  private drawForeground(cameraX: number, cameraY: number): void {
    const gfx = this.foregroundGfx;
    const width = this.world.worldW;
    const height = this.world.worldH;
    const left = cameraX - width / 2;
    const top = cameraY - height / 2;
    gfx.clear();

    // Deep leaf silhouettes frame the image only at the outer margins.
    for (let side = 0; side < 2; side++) {
      const edgeX = side === 0 ? left - 10 : left + width + 10;
      for (let i = 0; i < 8; i++) {
        const y = top - 20 + i * (height + 40) / 7;
        const reach = 28 + hash2(side, i, 811) * 48;
        const dir = side === 0 ? 1 : -1;
        gfx.poly([
          edgeX, y - 35,
          edgeX + dir * reach, y - 10,
          edgeX + dir * reach * 0.35, y,
          edgeX + dir * reach * 0.9, y + 18,
          edgeX, y + 34,
        ].map(snap)).fill({ color: SOUNDWOOD.ink, alpha: 0.28 });
      }
    }
    gfx.rect(snap(left), snap(top - 15), snap(width), 25).fill({ color: SOUNDWOOD.ink, alpha: 0.1 });
    gfx.rect(snap(left), snap(top + height - 10), snap(width), 25).fill({ color: SOUNDWOOD.ink, alpha: 0.13 });

    // A handful of drifting leaves and embers add life without crossing the
    // central combat read. They stay within the outer 12 percent of the view.
    for (let i = 0; i < 14; i++) {
      const side = i & 1;
      const edgeBand = width * 0.1;
      const x = side === 0
        ? left + hash2(i, 1, 991) * edgeBand
        : left + width - hash2(i, 1, 991) * edgeBand;
      const speed = 7 + hash2(i, 2, 997) * 13;
      const y = top + ((hash2(i, 3, 1009) * height + this.world.timeS * speed) % height);
      const color = i % 5 === 0 ? SOUNDWOOD.cyan : i % 3 === 0 ? SOUNDWOOD.amber : SOUNDWOOD.barkLight;
      gfx.rect(snap(x), snap(y), i % 4 === 0 ? 4 : 3, i % 4 === 0 ? 2 : 4)
        .fill({ color, alpha: i % 5 === 0 ? 0.25 : 0.18 });
    }
  }

  private drawFlash(cameraX: number, cameraY: number): void {
    this.flashGfx.clear();
    let alpha = 0;
    let color = 0xffffff;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const flash = this.flashes[i];
      const progress = (this.world.timeS - flash.start) / flash.dur;
      if (progress >= 1 || progress < 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      const candidate = flash.alpha * (1 - progress);
      if (candidate > alpha) {
        alpha = candidate;
        color = flash.color;
      }
    }
    if (alpha <= 0) {
      this.flashGfx.alpha = 0;
      return;
    }
    this.flashGfx
      .rect(
        snap(cameraX - this.world.worldW / 2),
        snap(cameraY - this.world.worldH / 2),
        snap(this.world.worldW),
        snap(this.world.worldH),
      )
      .fill(color);
    this.flashGfx.alpha = alpha;
  }
}
