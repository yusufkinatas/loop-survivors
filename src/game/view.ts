// Neon Crypt sprite renderer. Runtime geometry is deliberately absent: every
// actor, pickup, projectile, zone, particle, impact, and arena surface comes
// from a verified pixel-art PNG atlas and is sampled with nearest-neighbour
// filtering. The simulation remains entirely in run.ts.

import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  TilingSprite,
} from 'pixi.js';
import type { Role } from '../audio/kits';
import type { ItemId } from './items';
import {
  KIT_COLORS,
  PLAYER_FOOT_OFFSET,
  type Enemy,
  type FxEvent,
  type Gem,
  type GravityWell,
  type MusicNotePickup,
  type Projectile,
  type RunWorld,
  type Shockwave,
  type Zone,
} from './run';
import {
  PIXEL_ENVIRONMENT_IDS,
  PIXEL_WEAPON_ROLES,
  arenaFloorTexture,
  passiveIconTextureKey,
  pixelFrameMetadata,
  preloadPixelArt,
  effectTextureKey,
  enemyTextureKey,
  environmentTextureKey,
  pickupTextureKey,
  playerTextureKey,
  weaponTextureKey,
  type PixelEnvironmentId,
  type PixelProductionTextureKey,
  type PixelWeaponRole,
  type PlayerTextureKey,
} from './pixel-art';
import {
  applyProductionSprite,
  productionActorDebugMetadata,
  productionSprite,
} from './production-visuals';
import type { SandboxPerformanceCounts } from './sandbox-performance';
import {
  buildRunCaptureSceneMetadata,
  captureTargetCandidate,
  type CaptureMetadataConfiguration,
  type CaptureTargetCandidate,
  type RunCaptureSceneMetadata,
} from './capture-metadata';
import {
  LIVE_CAPTURE_ANIMATION_FPS,
  MAX360_CAPTURE_TARGET_IDS,
  type LiveCaptureBracketGeometry,
} from './live-capture';
import { type WorldProjection } from './viewport';
import {
  EMPTY_VISUAL_DEBUG_FLAGS,
  nativeActorOpaqueBounds,
  type DebugRectWorld,
  type RunDebugGeometrySnapshot,
  type SandboxPresetState,
  type VisualDebugFlags,
} from './visual-debug';

const MAX_EFFECTS = 180;
// Damage is intentionally budgeted and merged below: a dense build should
// read as combat, not as a wall of overlapping numbers.
const MAX_FLOATERS = 36;
const FRAME_RATE = LIVE_CAPTURE_ANIMATION_FPS;
const ENVIRONMENT_CELL = 288;

const LABEL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  fontWeight: '800',
  fill: 0xf8fbff,
  stroke: { color: 0x090b1a, width: 4 },
  align: 'center',
  dropShadow: { color: 0x090b1a, alpha: 0.9, blur: 0, angle: Math.PI / 2, distance: 2 },
});

const SMALL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 9,
  fontWeight: '700',
  fill: 0xc8d7ec,
  stroke: { color: 0x090b1a, width: 3 },
  align: 'center',
});

const DAMAGE_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  fontWeight: '900',
  fill: 0xffffff,
  stroke: { color: 0x090b1a, width: 4 },
  align: 'center',
});

const DEBUG_LABEL_STYLE = new TextStyle({
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 14,
  fontWeight: '800',
  fill: 0xffffff,
  stroke: { color: 0x05070c, width: 3 },
});

function direction8(vx: number, vy: number): number {
  if (Math.abs(vx) + Math.abs(vy) < 0.001) return 0;
  const step = Math.PI / 4;
  return Math.round(Math.atan2(vy, vx) / step) * step;
}

function isPixelWeaponRole(role: Role): role is PixelWeaponRole {
  return (PIXEL_WEAPON_ROLES as readonly Role[]).includes(role);
}

/** Load all gameplay/UI/environment sheets before constructing the view. */
export async function preloadRunArt(): Promise<void> {
  await preloadPixelArt();
}

interface GroundPickBase {
  x: number;
  y: number;
  color: number;
  name: string;
  level: string;
  effect?: string;
}

export type GroundPickView = GroundPickBase & (
  | { role: Role; item?: never; glyph?: never }
  | { role?: never; item: ItemId; glyph?: string }
);

interface EnemyVisual {
  root: Container;
  body: Sprite;
  aura?: Sprite;
  facing: 1 | -1;
}

interface GroundPickVisual {
  root: Container;
  worldX: number;
  worldY: number;
  phase: number;
  captureClass: 'weapon-reward' | null;
}

interface TimedSprite {
  sprite: Sprite;
  key: PixelProductionTextureKey;
  age: number;
  duration: number;
  vx: number;
  vy: number;
  initialAlpha: number;
  fade: boolean;
}

interface FloatingText {
  text: Text;
  age: number;
  duration: number;
  x: number;
  y: number;
  vy: number;
}

interface Shake {
  started: number;
  magnitude: number;
  duration: number;
}

export type { CaptureTargetCandidate, RunCaptureSceneMetadata } from './capture-metadata';

export class RunView {
  readonly stage: Container;

  private readonly world: RunWorld;
  private readonly projection: WorldProjection;
  private readonly floorLayer = new Container();
  private readonly environmentLayer = new Container();
  private readonly zoneLayer = new Container();
  private readonly pickupLayer = new Container();
  private readonly enemyLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly effectLayer = new Container();
  private readonly playerLayer = new Container();
  private readonly rewardLayer = new Container();
  private readonly textLayer = new Container();
  private readonly debugLayer = new Container();
  private readonly debugGraphics = new Graphics({ roundPixels: true });
  private readonly debugLabelLayer = new Container();
  private readonly captureBracketShadow = new Graphics({ roundPixels: true });
  private readonly captureBracketInk = new Graphics({ roundPixels: true });

  private readonly floor: TilingSprite;
  private readonly player: Sprite;
  private readonly playerMarker: Sprite;
  private readonly playerFrames: readonly [PlayerTextureKey, PlayerTextureKey];
  private readonly enemySprites = new Map<Enemy, EnemyVisual>();
  private readonly projectileSprites = new Map<Projectile, Sprite>();
  private readonly zoneSprites = new Map<Zone, Sprite>();
  private readonly gemSprites = new Map<Gem, Sprite>();
  private readonly noteSprites = new Map<MusicNotePickup, Sprite>();
  private readonly shockwaveSprites = new Map<Shockwave, Sprite>();
  private readonly gravitySprites = new Map<GravityWell, Sprite>();
  private readonly encoreSprites = new Map<object, Sprite>();
  private readonly environmentSprites = new Map<string, Sprite>();
  private groundPicks: GroundPickVisual[] = [];
  private timedSprites: TimedSprite[] = [];
  private floaters: FloatingText[] = [];
  private shakes: Shake[] = [];
  private viewTime = 0;
  private previousPlayerX = 0;
  private previousPlayerY = 0;
  private debugFlags: VisualDebugFlags = EMPTY_VISUAL_DEBUG_FLAGS;
  private debugLabels: Text[] = [];
  private debugLabelCount = 0;
  private activeCapturePreset: SandboxPresetState | null = null;
  private captureConfig: CaptureMetadataConfiguration = Object.freeze({
    offsetId: 0,
    offsetS: 0,
    visionMode: 'normal',
    requestedTargetId: null,
  });
  private captureBracketCache: {
    readonly preset: SandboxPresetState;
    readonly targetId: string;
    readonly geometry: LiveCaptureBracketGeometry | null;
  } | null = null;
  private destroyed = false;

  constructor(world: RunWorld, projection: WorldProjection) {
    this.world = world;
    this.projection = projection;
    this.stage = new Container();
    this.stage.sortableChildren = false;
    this.stage.scale.set(projection.worldToLogicalScale);

    this.floor = new TilingSprite({
      texture: arenaFloorTexture(),
      width: Math.ceil(world.worldW + 512),
      height: Math.ceil(world.worldH + 512),
    });
    this.floor.roundPixels = true;
    this.floorLayer.addChild(this.floor);

    this.playerFrames = [playerTextureKey('idle'), playerTextureKey('walk')];
    this.playerMarker = productionSprite(effectTextureKey('impact-cyan'), projection);
    this.playerMarker.alpha = 0.36;
    this.player = productionSprite(this.playerFrames[0], projection);
    // Both live above attack effects. The small cyan foot marker keeps the
    // hero locatable without painting a large halo over nearby enemies.
    this.playerLayer.addChild(this.playerMarker, this.player);

    this.debugLayer.visible = false;
    this.debugLayer.addChild(this.debugGraphics, this.debugLabelLayer);
    this.captureBracketShadow.visible = false;
    this.captureBracketInk.visible = false;

    this.stage.addChild(
      this.floorLayer,
      this.environmentLayer,
      this.zoneLayer,
      this.enemyLayer,
      // Collectibles retain their full silhouette at stress density instead
      // of disappearing beneath an opaque horde.
      this.pickupLayer,
      this.projectileLayer,
      this.effectLayer,
      this.playerLayer,
      this.rewardLayer,
      this.textLayer,
      this.debugLayer,
      this.captureBracketShadow,
      this.captureBracketInk,
    );
  }

  configureCapture(config: CaptureMetadataConfiguration): void {
    this.captureConfig = Object.freeze({ ...config });
    this.captureBracketCache = null;
    if (this.world.sandboxVisualPreset?.frozen) this.viewTime = config.offsetS;
  }

  setVisualDebug(flags: VisualDebugFlags): void {
    this.debugFlags = { ...flags };
    const visible = flags.bodies || flags.pivotsBounds || flags.attacks || flags.pickups;
    this.debugLayer.visible = visible;
    if (!visible) this.clearVisualDebug();
  }

  performanceCounts(): SandboxPerformanceCounts {
    return Object.freeze({
      live: Object.freeze({
        enemies: this.world.enemies.filter((enemy) => !enemy.dead).length,
        projectiles: this.world.projectiles.length,
        zones: this.world.zones.length,
        xp: this.world.gems.length,
        musicNotes: this.world.musicNotes.length,
        shockwaves: this.world.shockwaves.length,
        gravityWells: this.world.gravityWells.length,
        encoreCases: this.world.encoreCases.length,
        environment: this.environmentSprites.size,
        groundRewards: this.groundPicks.length,
      }),
      transient: Object.freeze({
        timedEffects: this.timedSprites.length,
        damageLabels: this.floaters.length,
        shakes: this.shakes.length,
        queuedFx: this.world.fx?.length ?? 0,
      }),
    });
  }

  captureSceneMetadata(): RunCaptureSceneMetadata {
    const cameraX = this.world.player.x + PLAYER_FOOT_OFFSET.x;
    const cameraY = this.world.player.y + PLAYER_FOOT_OFFSET.y;
    const additionalTargets: CaptureTargetCandidate[] = [];
    const push = (candidate: CaptureTargetCandidate | null): void => {
      if (candidate) additionalTargets.push(candidate);
    }
    for (let index = 0; index < this.groundPicks.length; index++) {
      const pick = this.groundPicks[index];
      if (pick.captureClass) {
        push(captureTargetCandidate(
          this.projection,
          cameraX,
          cameraY,
          `weapon-reward-${index}`,
          pick.captureClass,
          pick.worldX,
          pick.worldY,
          32,
        ));
      }
    }
    for (let index = 0; index < this.timedSprites.length; index++) {
      const effect = this.timedSprites[index];
      const native = pixelFrameMetadata(effect.key).nativeSize;
      push(captureTargetCandidate(
        this.projection,
        cameraX,
        cameraY,
        `decorative-effect-${index}`,
        'decorative-effect',
        effect.sprite.position.x,
        effect.sprite.position.y,
        this.projection.logicalLengthToWorld(Math.max(native.w, native.h) / 2),
      ));
    }
    const playerVisualBounds = nativeActorOpaqueBounds(
      this.world.player.x,
      this.world.player.y,
      productionActorDebugMetadata('player', this.projection),
    );
    return buildRunCaptureSceneMetadata(
      this.world,
      this.projection,
      this.captureConfig,
      Object.freeze(additionalTargets),
      playerVisualBounds,
    );
  }

  pushShake(magnitude: number, duration: number): void {
    this.shakes.push({ started: this.viewTime, magnitude, duration });
  }

  flourish(x: number, y: number): void {
    this.addTimedSprite(effectTextureKey('celebration'), x, y, {
      duration: 0.7,
      alpha: 0.95,
    });
  }

  levelBurst(x: number, y: number): void {
    this.addTimedSprite(effectTextureKey('celebration'), x, y, {
      duration: 0.85,
      alpha: 1,
    });
    this.addTimedSprite(effectTextureKey('impact-cyan'), x, y, {
      duration: 0.55,
      alpha: 0.9,
    });
  }

  setGroundPicks(picks: GroundPickView[]): void {
    for (const visual of this.groundPicks) visual.root.destroy({ children: true });
    this.groundPicks = [];

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const root = new Container();
      const pedestal = productionSprite(pickupTextureKey('reward-pedestal'), this.projection);
      pedestal.alpha = 0.96;
      root.addChild(pedestal);

      const icon = pick.role !== undefined && isPixelWeaponRole(pick.role)
        ? productionSprite(weaponTextureKey(pick.role, false), this.projection)
        : productionSprite(passiveIconTextureKey(pick.item as ItemId), this.projection);
      icon.position.y = -10;
      root.addChild(icon);

      const name = new Text({ text: pick.name.toUpperCase(), style: LABEL_STYLE, roundPixels: true });
      name.anchor.set(0.5, 0);
      name.position.set(0, 40);
      const level = new Text({ text: pick.level, style: SMALL_STYLE, roundPixels: true });
      level.anchor.set(0.5, 0);
      level.position.set(0, 56);
      root.addChild(name, level);
      if (pick.effect) {
        const effect = new Text({ text: pick.effect, style: SMALL_STYLE, roundPixels: true });
        effect.anchor.set(0.5, 0);
        effect.position.set(0, 68);
        root.addChild(effect);
      }
      root.position.set(this.snapWorld(pick.x), this.snapWorld(pick.y));
      this.rewardLayer.addChild(root);
      this.groundPicks.push({
        root,
        worldX: pick.x,
        worldY: pick.y,
        phase: i * 1.7,
        captureClass: pick.role !== undefined ? 'weapon-reward' : null,
      });
    }
  }

  update(dt: number): void {
    if (this.destroyed) return;
    const capturePreset = this.world.sandboxVisualPreset;
    if (capturePreset !== this.activeCapturePreset) {
      this.activeCapturePreset = capturePreset;
      this.captureBracketCache = null;
      if (capturePreset?.frozen) {
        this.viewTime = this.captureConfig.offsetS;
        this.clearCaptureTransients();
      }
    }
    if (!capturePreset?.frozen) this.viewTime += Math.max(0, Math.min(dt, 0.1));
    const cameraX = this.world.player.x + PLAYER_FOOT_OFFSET.x;
    const cameraY = this.world.player.y + PLAYER_FOOT_OFFSET.y;
    this.updateCamera(cameraX, cameraY);
    this.updateFloor(cameraX, cameraY);
    this.syncEnvironment(cameraX, cameraY);
    this.syncPlayer();
    this.syncEnemies(cameraX, cameraY);
    this.syncProjectiles(cameraX, cameraY);
    this.syncZones();
    this.syncPickups();
    this.syncWorldEffects();
    this.syncEncoreCases();
    this.drainFx();
    this.updateTimedSprites(dt);
    this.updateFloaters(dt);
    this.updateGroundPicks();
    this.syncVisualDebug();
    this.syncCaptureTargetBracket(cameraX, cameraY);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.enemySprites.clear();
    this.projectileSprites.clear();
    this.zoneSprites.clear();
    this.gemSprites.clear();
    this.noteSprites.clear();
    this.shockwaveSprites.clear();
    this.gravitySprites.clear();
    this.encoreSprites.clear();
    this.environmentSprites.clear();
    this.groundPicks = [];
    this.timedSprites = [];
    this.floaters = [];
    this.stage.removeFromParent();
    this.stage.destroy({ children: true });
  }

  private updateCamera(cameraX: number, cameraY: number): void {
    let shakeX = 0;
    let shakeY = 0;
    for (let i = this.shakes.length - 1; i >= 0; i--) {
      const shake = this.shakes[i];
      const age = this.viewTime - shake.started;
      if (age >= shake.duration) {
        this.shakes.splice(i, 1);
        continue;
      }
      const strength = shake.magnitude * (1 - age / shake.duration);
      shakeX += Math.round(Math.sin(age * 97 + i) * strength);
      shakeY += Math.round(Math.cos(age * 83 + i * 2) * strength);
    }
    const origin = this.projection.cameraStageOrigin(cameraX, cameraY, shakeX, shakeY);
    this.stage.position.set(origin.x, origin.y);
  }

  private updateFloor(cameraX: number, cameraY: number): void {
    const pad = 256;
    const left = this.snapWorld(cameraX - this.world.worldW / 2 - pad);
    const top = this.snapWorld(cameraY - this.world.worldH / 2 - pad);
    this.floor.position.set(left, top);
    this.floor.width = Math.ceil(this.world.worldW + pad * 2);
    this.floor.height = Math.ceil(this.world.worldH + pad * 2);
    this.floor.tilePosition.set(-left, -top);
  }

  /**
   * Populate a deterministic, non-colliding scenery grid around the camera.
   * Props always sit below combat telegraphs and pickups, so the crypt feels
   * inhabited without sacrificing silhouettes or creating invisible walls.
   */
  private syncEnvironment(cameraX: number, cameraY: number): void {
    const halfW = this.world.worldW / 2 + ENVIRONMENT_CELL;
    const halfH = this.world.worldH / 2 + ENVIRONMENT_CELL;
    const minX = Math.floor((cameraX - halfW) / ENVIRONMENT_CELL);
    const maxX = Math.ceil((cameraX + halfW) / ENVIRONMENT_CELL);
    const minY = Math.floor((cameraY - halfH) / ENVIRONMENT_CELL);
    const maxY = Math.ceil((cameraY + halfH) / ENVIRONMENT_CELL);
    const wanted = new Set<string>();

    for (let cellY = minY; cellY <= maxY; cellY++) {
      for (let cellX = minX; cellX <= maxX; cellX++) {
        const hash = this.environmentHash(cellX, cellY);
        // Scenery is frequent but subdued and always behind gameplay. The
        // opening clearing below keeps the initial choice uncluttered.
        if (hash % 5 > 3) continue;
        const worldX = cellX * ENVIRONMENT_CELL + 56 + ((hash >>> 8) % 176);
        const worldY = cellY * ENVIRONMENT_CELL + 62 + ((hash >>> 17) % 164);
        // Every run opens in the same clear circle. The three dedicated
        // weapon pedestals therefore never overlap decorative scenery.
        if (Math.hypot(worldX, worldY) < 270) continue;

        const key = `${cellX}:${cellY}`;
        wanted.add(key);
        let visual = this.environmentSprites.get(key);
        if (!visual) {
          const id = PIXEL_ENVIRONMENT_IDS[(hash >>> 3) % PIXEL_ENVIRONMENT_IDS.length] as PixelEnvironmentId;
          visual = productionSprite(
            environmentTextureKey(id),
            this.projection,
            { mirrorX: (hash & 1) !== 0 },
          );
          visual.alpha = 0.58 + ((hash >>> 24) % 3) * 0.05;
          visual.position.set(this.snapWorld(worldX), this.snapWorld(worldY));
          this.environmentLayer.addChild(visual);
          this.environmentSprites.set(key, visual);
        }
      }
    }

    for (const [key, visual] of this.environmentSprites) {
      if (wanted.has(key)) continue;
      visual.destroy();
      this.environmentSprites.delete(key);
    }
  }

  private environmentHash(x: number, y: number): number {
    let value = Math.imul(x ^ 0x45d9f3b, 0x27d4eb2d) ^ Math.imul(y ^ 0x119de1f3, 0x165667b1);
    value ^= value >>> 15;
    value = Math.imul(value, 0x2c1b3c6d);
    value ^= value >>> 12;
    return value >>> 0;
  }

  private syncPlayer(): void {
    const p = this.world.player;
    const moved = Math.abs(p.x - this.previousPlayerX) + Math.abs(p.y - this.previousPlayerY) > 0.05;
    // MAX360's two fixed renderer offsets deliberately sample both player
    // frames even though deterministic capture keeps simulation stationary.
    const sampleFrozenPlayerPhase =
      this.world.sandboxVisualPreset?.frozen === true &&
      this.world.sandboxVisualPreset.id === 'max360';
    const walkFrame = (moved || sampleFrozenPlayerPhase) &&
      Math.floor(this.viewTime * FRAME_RATE) % 2 === 1;
    applyProductionSprite(
      this.player,
      this.playerFrames[walkFrame ? 1 : 0],
      this.projection,
      { mirrorX: p.facingX < 0 },
    );
    this.player.position.set(this.snapWorld(p.x), this.snapWorld(p.y));
    this.player.alpha = p.iframesT > 0 && Math.floor(this.viewTime * 18) % 2 === 0 ? 0.55 : 1;
    this.playerMarker.position.set(this.snapWorld(p.x), this.snapWorld(p.y + 3));
    const markerPulse = Math.floor(this.viewTime * 6) % 2 === 0;
    this.playerMarker.alpha = p.iframesT > 0 ? 0.56 : markerPulse ? 0.32 : 0.4;
    this.previousPlayerX = p.x;
    this.previousPlayerY = p.y;
  }

  private visible(x: number, y: number, cameraX: number, cameraY: number, margin = 120): boolean {
    return Math.abs(x - cameraX) <= this.world.worldW / 2 + margin &&
      Math.abs(y - cameraY) <= this.world.worldH / 2 + margin;
  }

  private syncEnemies(cameraX: number, cameraY: number): void {
    const live = new Set(this.world.enemies);
    const frame = Math.floor(this.viewTime * FRAME_RATE);
    for (const enemy of this.world.enemies) {
      let visual = this.enemySprites.get(enemy);
      if (!visual) {
        const root = new Container();
        const body = productionSprite(enemyTextureKey(enemy.kind, 'idle'), this.projection);
        root.addChild(body);
        let aura: Sprite | undefined;
        if (enemy.amped || enemy.headliner || enemy.shieldHp > 0) {
          aura = productionSprite(
            effectTextureKey(enemy.headliner ? 'impact-gold' : 'impact-cyan'),
            this.projection,
          );
          aura.alpha = enemy.headliner ? 0.55 : 0.32;
          root.addChildAt(aura, 0);
        }
        // A category capture still uses a real member of the MAX360 horde,
        // but its requested target must not be painted over by later rows of
        // that same horde. The highlight protocol promotes only that one
        // body, just as it promotes only the requested decorative effect.
        const captureTarget = `enemy-${enemy.id}` === this.captureConfig.requestedTargetId;
        (captureTarget ? this.effectLayer : this.enemyLayer).addChild(root);
        visual = { root, body, aura, facing: 1 };
        this.enemySprites.set(enemy, visual);
      }
      visual.facing = enemy.lastMoveX > 0.1
        ? -1
        : enemy.lastMoveX < -0.1
          ? 1
          : visual.facing;
      applyProductionSprite(
        visual.body,
        enemyTextureKey(enemy.kind, (frame + enemy.id) % 2 === 0 ? 'idle' : 'walk'),
        this.projection,
        { mirrorX: visual.facing < 0 },
      );
      visual.root.position.set(this.snapWorld(enemy.x), this.snapWorld(enemy.y));
      visual.root.renderable = this.visible(enemy.x, enemy.y, cameraX, cameraY, 160);
      visual.body.tint = enemy.flashT > 0 ? 0xffdfc2 : enemy.headliner ? 0xffe8a3 : 0xffffff;
      if (visual.aura) {
        visual.aura.alpha = enemy.shieldHp > 0 ? 0.42 : enemy.headliner ? 0.55 : 0.28;
        visual.aura.rotation = direction8(Math.cos(this.viewTime), Math.sin(this.viewTime));
      }
    }
    for (const [enemy, visual] of this.enemySprites) {
      if (live.has(enemy)) continue;
      visual.root.destroy({ children: true });
      this.enemySprites.delete(enemy);
    }
  }

  private syncProjectiles(cameraX: number, cameraY: number): void {
    const live = new Set(this.world.projectiles);
    for (const projectile of this.world.projectiles) {
      if (!isPixelWeaponRole(projectile.role)) continue;
      let visual = this.projectileSprites.get(projectile);
      if (!visual) {
        visual = productionSprite(
          weaponTextureKey(projectile.role, projectile.evolved),
          this.projection,
        );
        this.projectileLayer.addChild(visual);
        this.projectileSprites.set(projectile, visual);
      }
      applyProductionSprite(
        visual,
        weaponTextureKey(projectile.role, projectile.evolved),
        this.projection,
      );
      visual.position.set(this.snapWorld(projectile.x), this.snapWorld(projectile.y));
      visual.rotation = projectile.role === 'arp' || projectile.gravity
        ? direction8(Math.cos(projectile.orbitAngle), Math.sin(projectile.orbitAngle))
        : direction8(projectile.vx, projectile.vy);
      visual.alpha = projectile.shard ? 0.9 : 1;
      visual.renderable = this.visible(projectile.x, projectile.y, cameraX, cameraY, 100);
    }
    for (const [projectile, visual] of this.projectileSprites) {
      if (live.has(projectile)) continue;
      visual.destroy();
      this.projectileSprites.delete(projectile);
    }
  }

  private syncZones(): void {
    const live = new Set(this.world.zones);
    for (const zone of this.world.zones) {
      let visual = this.zoneSprites.get(zone);
      if (!visual) {
        visual = productionSprite(weaponTextureKey('chord', zone.evolved), this.projection);
        this.zoneLayer.addChild(visual);
        this.zoneSprites.set(zone, visual);
      }
      applyProductionSprite(
        visual,
        weaponTextureKey('chord', zone.evolved),
        this.projection,
      );
      visual.position.set(this.snapWorld(zone.x), this.snapWorld(zone.y));
      visual.alpha = zone.evolved ? 0.18 : 0.14;
      visual.rotation = direction8(Math.cos(this.viewTime * 0.7), Math.sin(this.viewTime * 0.7));
    }
    for (const [zone, visual] of this.zoneSprites) {
      if (live.has(zone)) continue;
      visual.destroy();
      this.zoneSprites.delete(zone);
    }
  }

  private syncPickups(): void {
    const gemLive = new Set(this.world.gems);
    for (const gem of this.world.gems) {
      let visual = this.gemSprites.get(gem);
      if (!visual) {
        visual = productionSprite(pickupTextureKey(`xp-${gem.tier}`), this.projection);
        this.pickupLayer.addChild(visual);
        this.gemSprites.set(gem, visual);
      }
      applyProductionSprite(visual, pickupTextureKey(`xp-${gem.tier}`), this.projection);
      visual.position.set(
        this.snapWorld(gem.x),
        this.snapWorld(gem.y + (Math.floor(this.viewTime * 6 + gem.x) % 2)),
      );
    }
    for (const [gem, visual] of this.gemSprites) {
      if (gemLive.has(gem)) continue;
      visual.destroy();
      this.gemSprites.delete(gem);
    }

    const noteLive = new Set(this.world.musicNotes);
    for (const note of this.world.musicNotes) {
      let visual = this.noteSprites.get(note);
      if (!visual) {
        visual = productionSprite(pickupTextureKey('music-note'), this.projection);
        this.pickupLayer.addChild(visual);
        this.noteSprites.set(note, visual);
      }
      applyProductionSprite(visual, pickupTextureKey('music-note'), this.projection);
      visual.alpha = note.tier === 'anthem' ? 1 : note.tier === 'phrase' ? 0.92 : 0.84;
      visual.position.set(
        this.snapWorld(note.x),
        this.snapWorld(note.y + (Math.floor(this.viewTime * 6 + note.y) % 2)),
      );
    }
    for (const [note, visual] of this.noteSprites) {
      if (noteLive.has(note)) continue;
      visual.destroy();
      this.noteSprites.delete(note);
    }
  }

  private syncWorldEffects(): void {
    const shockLive = new Set(this.world.shockwaves);
    for (const shockwave of this.world.shockwaves) {
      let visual = this.shockwaveSprites.get(shockwave);
      if (!visual) {
        visual = productionSprite(effectTextureKey('explosion'), this.projection);
        const captureFixture =
          shockwave.captureId === MAX360_CAPTURE_TARGET_IDS['decorative-effect'] &&
          this.captureConfig.requestedTargetId === shockwave.captureId;
        (captureFixture ? this.effectLayer : this.zoneLayer).addChild(visual);
        this.shockwaveSprites.set(shockwave, visual);
      }
      visual.position.set(this.snapWorld(shockwave.x), this.snapWorld(shockwave.y));
      visual.alpha =
        shockwave.captureId === MAX360_CAPTURE_TARGET_IDS['decorative-effect'] &&
        this.captureConfig.requestedTargetId === shockwave.captureId
        ? 0.9
        : Math.max(0.08, 0.28 * (1 - shockwave.age / shockwave.lifeS));
    }
    for (const [shockwave, visual] of this.shockwaveSprites) {
      if (shockLive.has(shockwave)) continue;
      visual.destroy();
      this.shockwaveSprites.delete(shockwave);
    }

    const gravityLive = new Set(this.world.gravityWells);
    for (const well of this.world.gravityWells) {
      let visual = this.gravitySprites.get(well);
      if (!visual) {
        visual = productionSprite(weaponTextureKey('bell', true), this.projection);
        this.zoneLayer.addChild(visual);
        this.gravitySprites.set(well, visual);
      }
      visual.position.set(this.snapWorld(well.x), this.snapWorld(well.y));
      visual.alpha = well.burst ? 0.38 : 0.2;
      visual.rotation = direction8(Math.cos(this.viewTime * 2), Math.sin(this.viewTime * 2));
    }
    for (const [well, visual] of this.gravitySprites) {
      if (gravityLive.has(well)) continue;
      visual.destroy();
      this.gravitySprites.delete(well);
    }
  }

  private syncEncoreCases(): void {
    const live = new Set<object>(this.world.encoreCases);
    for (const encore of this.world.encoreCases) {
      let visual = this.encoreSprites.get(encore);
      if (!visual) {
        visual = productionSprite(pickupTextureKey('evolution-chest'), this.projection);
        this.rewardLayer.addChild(visual);
        this.encoreSprites.set(encore, visual);
      }
      visual.position.set(this.snapWorld(encore.x), this.snapWorld(encore.y));
      visual.alpha = 0.92 + (Math.floor(this.viewTime * 5) % 2) * 0.08;
    }
    for (const [encore, visual] of this.encoreSprites) {
      if (live.has(encore)) continue;
      visual.destroy();
      this.encoreSprites.delete(encore);
    }
  }

  private drainFx(): void {
    const queue = this.world.fx;
    if (!queue || queue.length === 0) return;
    const events = queue.splice(0, queue.length);
    for (const event of events) this.spawnFx(event);
  }

  private spawnFx(event: FxEvent): void {
    switch (event.type) {
      case 'ring':
        {
          const key = effectTextureKey(event.color === KIT_COLORS.bell ? 'impact-gold' : 'impact-cyan');
          const displayRadius = Math.min(event.radius, Math.min(this.world.worldW, this.world.worldH) * 0.44);
          const count = event.radius < 44 ? 1 : Math.min(18, Math.max(8, Math.round(displayRadius / 38)));
          for (let i = 0; i < count; i++) {
            const angle = count === 1 ? 0 : (i / count) * Math.PI * 2;
            const radius = count === 1 ? 0 : displayRadius;
            this.addTimedSprite(key, event.x + Math.cos(angle) * radius, event.y + Math.sin(angle) * radius, {
              duration: event.dur,
              alpha: event.soft ? 0.38 : 0.66,
            });
          }
        }
        break;
      case 'death':
        this.addTimedSprite(effectTextureKey('death'), event.x, event.y, {
          duration: event.elite ? 0.75 : 0.48,
          alpha: 0.9,
        });
        break;
      case 'whip': {
        this.addTimedSprite(weaponTextureKey('kick', false), event.x, event.y, {
          duration: 0.22,
          alpha: 0.96,
          mirrorX: event.side < 0,
        });
        break;
      }
      case 'arc': {
        const attack = this.addTimedSprite(weaponTextureKey('clap', false), event.x, event.y, {
          duration: 0.25,
          alpha: 0.76,
        });
        attack.sprite.rotation = direction8(Math.cos(event.angle), Math.sin(event.angle));
        break;
      }
      case 'dmg':
        this.addDamageText(event);
        break;
      case 'spark': {
        const count = Math.min(10, Math.max(1, event.n));
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + (event.x + event.y) * 0.01;
          const speed = event.spread * (1.2 + (i % 3) * 0.35);
          this.addTimedSprite(effectTextureKey(event.color === KIT_COLORS.bell ? 'impact-gold' : 'impact-cyan'), event.x, event.y, {
            duration: 0.32,
            alpha: 0.9,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        break;
      }
      case 'slam':
        this.addTimedSprite(effectTextureKey('explosion'), event.x, event.y, {
          duration: 0.48,
          alpha: 0.48,
        });
        break;
      case 'beam': {
        // Never stretch one square sprite across the viewport: that creates a
        // giant opaque slab. A beam is a dotted rail of compact pixel bursts,
        // retaining its full direction/length while leaving enemies visible.
        const dx = event.x2 - event.x;
        const dy = event.y2 - event.y;
        const length = Math.hypot(dx, dy);
        const count = Math.min(24, Math.max(3, Math.ceil(length / 44)));
        for (let i = 0; i <= count; i++) {
          const t = i / count;
          const beam = this.addTimedSprite(
            weaponTextureKey('snare', true),
            event.x + dx * t,
            event.y + dy * t,
            {
              duration: 0.24,
              alpha: i % 2 === 0 ? 0.68 : 0.48,
            },
          );
          beam.sprite.rotation = direction8(dx, dy);
        }
        break;
      }
      case 'banner':
        this.addTimedSprite(effectTextureKey('celebration'), event.x, event.y, {
          duration: 0.75,
          alpha: 0.94,
        });
        this.addBanner(event.label, event.x, event.y - 52, event.color);
        break;
      case 'evolution':
        this.addTimedSprite(effectTextureKey('celebration'), event.x, event.y, {
          duration: 1,
          alpha: 1,
        });
        this.addBanner(event.label, event.x, event.y - 62, event.color);
        break;
    }
  }

  private addTimedSprite(
    key: PixelProductionTextureKey,
    x: number,
    y: number,
    options: {
      duration: number;
      alpha?: number;
      vx?: number;
      vy?: number;
      mirrorX?: boolean;
    },
  ): TimedSprite {
    if (this.timedSprites.length >= MAX_EFFECTS) {
      const oldest = this.timedSprites.shift();
      oldest?.sprite.destroy();
    }
    const visual = productionSprite(key, this.projection, { mirrorX: options.mirrorX });
    visual.position.set(this.snapWorld(x), this.snapWorld(y));
    visual.alpha = options.alpha ?? 1;
    this.effectLayer.addChild(visual);
    const timed: TimedSprite = {
      sprite: visual,
      key,
      age: 0,
      duration: Math.max(0.05, options.duration),
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
      initialAlpha: visual.alpha,
      fade: true,
    };
    this.timedSprites.push(timed);
    return timed;
  }

  private updateTimedSprites(dt: number): void {
    for (let i = this.timedSprites.length - 1; i >= 0; i--) {
      const effect = this.timedSprites[i];
      effect.age += dt;
      if (effect.age >= effect.duration) {
        effect.sprite.destroy();
        this.timedSprites.splice(i, 1);
        continue;
      }
      const t = effect.age / effect.duration;
      effect.sprite.position.x = this.snapWorld(effect.sprite.position.x + effect.vx * dt);
      effect.sprite.position.y = this.snapWorld(effect.sprite.position.y + effect.vy * dt);
      if (effect.fade) effect.sprite.alpha = Math.max(0, effect.initialAlpha * (1 - t));
    }
  }

  private addDamageText(event: Extract<FxEvent, { type: 'dmg' }>): void {
    // Fold simultaneous hits in the same tiny screen-space pocket into one
    // total. This preserves feedback while preventing a rapid-fire weapon
    // from spawning a solid rectangle of digits.
    const nearby = this.floaters.find((floater) =>
      floater.age < 0.14 &&
      Math.abs(floater.x - event.x) <= 20 &&
      Math.abs(floater.y - event.y) <= 20 &&
      /^\d+$/.test(floater.text.text),
    );
    if (nearby) {
      nearby.text.text = String(Number(nearby.text.text) + event.amount);
      nearby.text.tint = event.color;
      nearby.age = 0;
      nearby.duration = 0.46;
      nearby.x = Math.round((nearby.x + event.x) / 2);
      nearby.y = Math.round((nearby.y + event.y) / 2);
      return;
    }
    if (this.floaters.length >= MAX_FLOATERS) {
      const oldest = this.floaters.shift();
      oldest?.text.destroy();
    }
    const text = new Text({ text: String(event.amount), style: DAMAGE_STYLE, roundPixels: true });
    text.anchor.set(0.5);
    text.tint = event.color;
    text.position.set(this.snapWorld(event.x), this.snapWorld(event.y));
    this.textLayer.addChild(text);
    this.floaters.push({ text, age: 0, duration: 0.46, x: event.x, y: event.y, vy: -30 });
  }

  private addBanner(label: string, x: number, y: number, color: number): void {
    const text = new Text({ text: label.toUpperCase(), style: LABEL_STYLE, roundPixels: true });
    text.anchor.set(0.5);
    text.tint = color;
    text.position.set(this.snapWorld(x), this.snapWorld(y));
    this.textLayer.addChild(text);
    this.floaters.push({ text, age: 0, duration: 1.05, x, y, vy: -12 });
  }

  private updateFloaters(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const floater = this.floaters[i];
      floater.age += dt;
      if (floater.age >= floater.duration) {
        floater.text.destroy();
        this.floaters.splice(i, 1);
        continue;
      }
      floater.y += floater.vy * dt;
      floater.text.position.set(this.snapWorld(floater.x), this.snapWorld(floater.y));
      floater.text.alpha = Math.max(0, 1 - Math.pow(floater.age / floater.duration, 2));
    }
  }

  private updateGroundPicks(): void {
    for (const pick of this.groundPicks) {
      const bob = Math.floor((Math.sin(this.viewTime * 5 + pick.phase) + 1) * 0.75);
      pick.root.position.set(this.snapWorld(pick.worldX), this.snapWorld(pick.worldY - bob));
    }
  }

  /** Named capture presets clear renderer-owned residue as well as world
   * entities, then hold one deterministic animation/camera phase. */
  private clearCaptureTransients(): void {
    for (const timed of this.timedSprites) timed.sprite.destroy();
    this.timedSprites = [];
    for (const floater of this.floaters) floater.text.destroy();
    this.floaters = [];
    this.shakes = [];
    for (const pick of this.groundPicks) pick.root.destroy({ children: true });
    this.groundPicks = [];
  }

  private drawCaptureBracketPath(
    graphics: Graphics,
    geometry: LiveCaptureBracketGeometry,
    cameraX: number,
    cameraY: number,
    color: number,
    logicalWidth: number,
    alpha: number,
  ): void {
    graphics.clear();
    for (const segment of geometry.segments) {
      const start = this.projection.logicalToWorld(segment.x1, segment.y1, cameraX, cameraY);
      const end = this.projection.logicalToWorld(segment.x2, segment.y2, cameraX, cameraY);
      graphics
        .moveTo(this.snapWorld(start.x), this.snapWorld(start.y))
        .lineTo(this.snapWorld(end.x), this.snapWorld(end.y));
    }
    graphics.stroke({
      color,
      width: this.projection.logicalLengthToWorld(logicalWidth),
      alpha,
    });
  }

  /** Capture-only corner bracket: no fill and a four-pixel gap around the core. */
  private syncCaptureTargetBracket(cameraX: number, cameraY: number): void {
    const requestedTargetId = this.captureConfig.requestedTargetId;
    if (requestedTargetId === null) {
      if (this.captureBracketShadow.visible || this.captureBracketInk.visible) {
        this.captureBracketShadow.visible = false;
        this.captureBracketInk.visible = false;
        this.captureBracketShadow.clear();
        this.captureBracketInk.clear();
      }
      return;
    }
    const preset = this.world.sandboxVisualPreset;
    let geometry: LiveCaptureBracketGeometry | null;
    if (
      preset?.frozen &&
      this.captureBracketCache?.preset === preset &&
      this.captureBracketCache.targetId === requestedTargetId
    ) {
      geometry = this.captureBracketCache.geometry;
    } else {
      geometry = this.captureSceneMetadata().targetBracket;
      if (preset?.frozen) {
        this.captureBracketCache = Object.freeze({
          preset,
          targetId: requestedTargetId,
          geometry,
        });
      }
    }
    const visible = geometry !== null;
    this.captureBracketShadow.visible = visible;
    this.captureBracketInk.visible = visible;
    if (!geometry) {
      this.captureBracketShadow.clear();
      this.captureBracketInk.clear();
      return;
    }
    this.drawCaptureBracketPath(
      this.captureBracketShadow,
      geometry,
      cameraX,
      cameraY,
      0x03070d,
      3,
      0.84,
    );
    this.drawCaptureBracketPath(
      this.captureBracketInk,
      geometry,
      cameraX,
      cameraY,
      0xffd45c,
      1,
      0.82,
    );
  }

  private syncVisualDebug(): void {
    if (!this.debugLayer.visible) return;
    const snapshot = this.world.debugGeometrySnapshot((kind) =>
      productionActorDebugMetadata(kind, this.projection));
    const line = this.projection.logicalLengthToWorld(1);
    this.clearVisualDebug();

    if (this.debugFlags.bodies) this.drawDebugBodies(snapshot, line);
    if (this.debugFlags.pivotsBounds) this.drawDebugPivotsAndBounds(snapshot, line);
    if (this.debugFlags.attacks) this.drawDebugAttacks(snapshot, line);
    if (this.debugFlags.pickups) this.drawDebugPickups(snapshot, line);

    for (let i = this.debugLabelCount; i < this.debugLabels.length; i++) {
      this.debugLabels[i].visible = false;
    }
  }

  private drawDebugBodies(snapshot: RunDebugGeometrySnapshot, line: number): void {
    for (const actor of snapshot.actors) {
      const body = actor.hurtBodyWorld;
      const color = actor.id === 'player'
        ? 0x59ffd1
        : actor.headliner
          ? 0xffd45c
          : 0xff5a6f;
      // Contact and hurt geometry currently share the same simulation circle.
      // The translucent heavy stroke is contact; the crisp inner stroke is hurt.
      this.debugCircle(body.x, body.y, body.radius, 0xff9b54, line * 3, 0.28);
      this.debugCircle(body.x, body.y, body.radius, color, line, 0.98);
    }
  }

  private drawDebugPivotsAndBounds(snapshot: RunDebugGeometrySnapshot, line: number): void {
    for (const actor of snapshot.actors) {
      this.debugRect(actor.frameBoundsWorld, 0xb38cff, line, 0.9);
      this.debugRect(actor.opaqueVisualBoundsWorld, 0x3ce0ff, line * 2, 0.98, 0.025);
      this.debugCross(
        actor.rendererAnchorWorld.x,
        actor.rendererAnchorWorld.y,
        5,
        0xffd45c,
        line,
      );
      this.debugCross(
        actor.groundPivotWorld.x,
        actor.groundPivotWorld.y,
        7,
        0x59ffd1,
        line,
      );
      this.debugCross(
        actor.simulationGroundReferenceWorld.x,
        actor.simulationGroundReferenceWorld.y,
        4,
        0xff9b54,
        line,
      );
      if (actor.id === 'player') {
        this.debugLabel(
          'NATIVE FRAME',
          actor.frameBoundsWorld.x,
          actor.frameBoundsWorld.y - 3,
          0xb38cff,
        );
        this.debugLabel(
          'NATIVE OPAQUE UNION',
          actor.opaqueVisualBoundsWorld.x,
          actor.opaqueVisualBoundsWorld.y - 3,
          0x3ce0ff,
        );
      }
    }
  }

  private drawDebugAttacks(snapshot: RunDebugGeometrySnapshot, line: number): void {
    for (const projectile of snapshot.projectiles) {
      const core = projectile.collisionCoreWorld;
      const color = projectile.role === 'bass' ? 0xa06bff : KIT_COLORS[projectile.role];
      this.debugCircle(core.x, core.y, core.radius, color, line * 2, 0.95, 0.08);
      this.debugLabel(
        `${projectile.role.toUpperCase()} P ${debugCount(projectile.pierce)}/${debugCount(projectile.maxPierce)} B ${projectile.bounces}`,
        core.x + core.radius + 5,
        core.y - core.radius - 3,
        color,
      );
    }
    for (const kick of snapshot.kickRects) {
      this.debugRect(kick.rectWorld, KIT_COLORS.kick, line * 2, 1, 0.09);
      this.debugLabel('KICK ACTIVE RECT', kick.rectWorld.x, kick.rectWorld.y - 4, KIT_COLORS.kick);
    }
    for (const clap of snapshot.clapShapes) {
      const x = this.snapWorld(clap.x);
      const y = this.snapWorld(clap.y);
      const radius = Math.max(line, this.snapWorld(clap.reach));
      const start = clap.angle - clap.halfArc;
      const end = clap.angle + clap.halfArc;
      this.debugGraphics
        .moveTo(x, y)
        .lineTo(this.snapWorld(clap.x + Math.cos(start) * clap.reach), this.snapWorld(clap.y + Math.sin(start) * clap.reach))
        .arc(x, y, radius, start, end)
        .lineTo(x, y)
        .closePath()
        .fill({ color: KIT_COLORS.clap, alpha: 0.08 })
        .stroke({ color: KIT_COLORS.clap, alpha: 0.95, width: line });
      this.debugCircle(
        clap.x,
        clap.y,
        clap.pointBlankRadius,
        KIT_COLORS.clap,
        line * 2,
        0.95,
        0.06,
      );
      this.debugLabel('CLAP CONE + POINT-BLANK', clap.x, clap.y - clap.reach - 5, KIT_COLORS.clap);
    }
    for (const zone of snapshot.zones) {
      const color = zone.evolved ? 0x8dffb1 : KIT_COLORS.chord;
      this.debugCircle(zone.x, zone.y, zone.radius, color, line * 2, 0.95, 0.05);
      this.debugLabel(
        `CHORD${zone.mergedCount > 1 ? ` MERGED ×${zone.mergedCount}` : zone.evolved ? ' EVOLVED' : ''} R ${Math.round(zone.radius)}`,
        zone.x - zone.radius,
        zone.y - zone.radius - 4,
        color,
      );
    }
  }

  private drawDebugPickups(snapshot: RunDebugGeometrySnapshot, line: number): void {
    const gemMagnet = snapshot.playerGemMagnetWorld;
    const noteMagnet = snapshot.playerNoteMagnetWorld;
    this.debugCircle(gemMagnet.x, gemMagnet.y, gemMagnet.radius, 0x59d9ff, line, 0.72);
    this.debugCircle(noteMagnet.x, noteMagnet.y, noteMagnet.radius, 0xffd45c, line, 0.72);
    this.debugLabel('XP MAGNET', gemMagnet.x + gemMagnet.radius, gemMagnet.y, 0x59d9ff);
    this.debugLabel('NOTE MAGNET', noteMagnet.x + noteMagnet.radius, noteMagnet.y + 12, 0xffd45c);

    for (const pickup of snapshot.pickups) {
      const color = pickup.kind === 'xp' ? 0x59d9ff : pickup.kind === 'note' ? 0xffd45c : 0xff9b54;
      this.debugCircle(
        pickup.x,
        pickup.y,
        pickup.collectionRadius,
        color,
        line * 2,
        0.95,
        0.06,
      );
      this.debugCross(pickup.x, pickup.y, 4, color, line);
      this.debugLabel(
        `${pickup.kind.toUpperCase()} COLLECT R ${pickup.collectionRadius}`,
        pickup.x + pickup.collectionRadius + 4,
        pickup.y,
        color,
      );
    }

    for (const choice of snapshot.choices) {
      const color = choice.reachable ? 0x59ffd1 : 0xff4d5e;
      this.debugGraphics
        .moveTo(this.snapWorld(gemMagnet.x), this.snapWorld(gemMagnet.y))
        .lineTo(this.snapWorld(choice.x), this.snapWorld(choice.y))
        .stroke({ color, alpha: 0.32, width: line });
      this.debugCircle(choice.x, choice.y, choice.collectionRadius, color, line * 2, 0.98, 0.05);
      this.debugCross(choice.x, choice.y, 6, color, line);
      this.debugLabel(
        `${choice.mode.toUpperCase()} PICK · ${choice.reachable ? 'REACHABLE' : 'BLOCKED'}`,
        choice.x - choice.collectionRadius,
        choice.y - choice.collectionRadius - 4,
        color,
      );
    }
  }

  private debugCircle(
    x: number,
    y: number,
    radius: number,
    color: number,
    width: number,
    alpha: number,
    fillAlpha = 0,
  ): void {
    const shape = this.debugGraphics.circle(
      this.snapWorld(x),
      this.snapWorld(y),
      Math.max(width / 2, this.snapWorld(radius)),
    );
    if (fillAlpha > 0) shape.fill({ color, alpha: fillAlpha });
    shape.stroke({ color, alpha, width });
  }

  private debugRect(
    rect: DebugRectWorld,
    color: number,
    width: number,
    alpha: number,
    fillAlpha = 0,
  ): void {
    const left = this.snapWorld(rect.x);
    const top = this.snapWorld(rect.y);
    const right = this.snapWorld(rect.x + rect.width);
    const bottom = this.snapWorld(rect.y + rect.height);
    const shape = this.debugGraphics.rect(left, top, right - left, bottom - top);
    if (fillAlpha > 0) shape.fill({ color, alpha: fillAlpha });
    shape.stroke({ color, alpha, width });
  }

  private debugCross(
    x: number,
    y: number,
    radius: number,
    color: number,
    width: number,
  ): void {
    const cx = this.snapWorld(x);
    const cy = this.snapWorld(y);
    const r = this.snapWorld(radius);
    this.debugGraphics
      .moveTo(cx - r, cy)
      .lineTo(cx + r, cy)
      .moveTo(cx, cy - r)
      .lineTo(cx, cy + r)
      .stroke({ color, alpha: 1, width });
  }

  private debugLabel(label: string, x: number, y: number, color: number): void {
    let text = this.debugLabels[this.debugLabelCount];
    if (!text) {
      text = new Text({ text: label, style: DEBUG_LABEL_STYLE, roundPixels: true });
      text.anchor.set(0, 1);
      this.debugLabelLayer.addChild(text);
      this.debugLabels.push(text);
    }
    this.debugLabelCount += 1;
    text.text = label;
    text.tint = color;
    text.position.set(this.snapWorld(x), this.snapWorld(y));
    text.visible = true;
  }

  private clearVisualDebug(): void {
    this.debugGraphics.clear();
    this.debugLabelCount = 0;
    for (const label of this.debugLabels) label.visible = false;
  }

  private snapWorld(value: number): number {
    return this.projection.snapWorldCoordinate(value);
  }
}

function debugCount(value: number): string {
  return Number.isFinite(value) ? String(Math.max(0, Math.floor(value))) : '∞';
}
