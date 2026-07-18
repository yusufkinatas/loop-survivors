// Neon Crypt sprite renderer. Runtime geometry is deliberately absent: every
// actor, pickup, projectile, zone, particle, impact, and arena surface comes
// from a verified pixel-art PNG atlas and is sampled with nearest-neighbour
// filtering. The simulation remains entirely in run.ts.

import {
  Container,
  Sprite,
  Text,
  TextStyle,
  TilingSprite,
  type Texture,
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
  effectPixelTexture,
  enemyPixelFrames,
  environmentPixelTexture,
  passiveIconTexture,
  pickupPixelTexture,
  playerPixelFrames,
  preloadPixelArt,
  weaponPixelTexture,
  type PixelEnvironmentId,
  type PixelWeaponRole,
} from './pixel-art';

const ACTOR_SCALE = 0.5;
const PLAYER_SCALE = 0.5;
const PICKUP_SCALE = 0.5;
const PROJECTILE_SCALE: Readonly<Partial<Record<Role, number>>> = {
  snare: 0.28,
  hat: 0.25,
  bass: 0.34,
  lead: 0.27,
  arp: 0.27,
  bell: 0.32,
};
const MAX_EFFECTS = 180;
// Damage is intentionally budgeted and merged below: a dense build should
// read as combat, not as a wall of overlapping numbers.
const MAX_FLOATERS = 36;
const FRAME_RATE = 7;
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

function snap(value: number): number {
  return Math.round(value);
}

function quantizeScale(value: number): number {
  return Math.max(0.125, Math.round(value * 8) / 8);
}

function direction8(vx: number, vy: number): number {
  if (Math.abs(vx) + Math.abs(vy) < 0.001) return 0;
  const step = Math.PI / 4;
  return Math.round(Math.atan2(vy, vx) / step) * step;
}

function isPixelWeaponRole(role: Role): role is PixelWeaponRole {
  return (PIXEL_WEAPON_ROLES as readonly Role[]).includes(role);
}

function sprite(texture: Texture, anchorX = 0.5, anchorY = 0.5): Sprite {
  const out = new Sprite(texture);
  out.anchor.set(anchorX, anchorY);
  out.roundPixels = true;
  return out;
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
}

interface GroundPickVisual {
  root: Container;
  worldX: number;
  worldY: number;
  phase: number;
}

interface TimedSprite {
  sprite: Sprite;
  age: number;
  duration: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  vx: number;
  vy: number;
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

export class RunView {
  readonly stage: Container;

  private readonly world: RunWorld;
  private readonly view: { width: number; height: number };
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

  private readonly floor: TilingSprite;
  private readonly player: Sprite;
  private readonly playerMarker: Sprite;
  private readonly playerFrames: readonly [Texture, Texture];
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
  private destroyed = false;

  constructor(world: RunWorld, view: { width: number; height: number }) {
    this.world = world;
    this.view = view;
    this.stage = new Container();
    this.stage.sortableChildren = false;

    this.floor = new TilingSprite({
      texture: arenaFloorTexture(),
      width: Math.ceil(world.worldW + 512),
      height: Math.ceil(world.worldH + 512),
    });
    this.floor.roundPixels = true;
    this.floorLayer.addChild(this.floor);

    this.playerFrames = playerPixelFrames();
    this.playerMarker = sprite(effectPixelTexture('impact-cyan'));
    this.playerMarker.scale.set(0.34);
    this.playerMarker.alpha = 0.36;
    this.player = sprite(this.playerFrames[0], 0.5, 0.92);
    this.player.scale.set(PLAYER_SCALE);
    // Both live above attack effects. The small cyan foot marker keeps the
    // hero locatable without painting a large halo over nearby enemies.
    this.playerLayer.addChild(this.playerMarker, this.player);

    this.stage.addChild(
      this.floorLayer,
      this.environmentLayer,
      this.zoneLayer,
      this.pickupLayer,
      this.enemyLayer,
      this.projectileLayer,
      this.effectLayer,
      this.playerLayer,
      this.rewardLayer,
      this.textLayer,
    );
  }

  pushShake(magnitude: number, duration: number): void {
    this.shakes.push({ started: this.viewTime, magnitude, duration });
  }

  flourish(x: number, y: number): void {
    this.addTimedSprite(effectPixelTexture('celebration'), x, y, {
      duration: 0.7,
      from: 0.32,
      to: 1.05,
      alpha: 0.95,
    });
  }

  levelBurst(x: number, y: number): void {
    this.addTimedSprite(effectPixelTexture('celebration'), x, y, {
      duration: 0.85,
      from: 0.45,
      to: 1.55,
      alpha: 1,
    });
    this.addTimedSprite(effectPixelTexture('impact-cyan'), x, y, {
      duration: 0.55,
      from: 0.35,
      to: 1.2,
      alpha: 0.9,
    });
  }

  setGroundPicks(picks: GroundPickView[]): void {
    for (const visual of this.groundPicks) visual.root.destroy({ children: true });
    this.groundPicks = [];

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      const root = new Container();
      const pedestal = sprite(pickupPixelTexture('reward-pedestal'));
      pedestal.scale.set(0.62);
      pedestal.alpha = 0.96;
      root.addChild(pedestal);

      const icon = pick.role !== undefined && isPixelWeaponRole(pick.role)
        ? sprite(weaponPixelTexture(pick.role, false))
        : sprite(passiveIconTexture(pick.item as ItemId));
      icon.scale.set(pick.role !== undefined ? 0.31 : 0.27);
      icon.position.y = -10;
      root.addChild(icon);

      const name = new Text({ text: pick.name.toUpperCase(), style: LABEL_STYLE, roundPixels: true });
      name.anchor.set(0.5, 0);
      name.position.set(0, 40);
      const level = new Text({ text: pick.level, style: SMALL_STYLE, roundPixels: true });
      level.anchor.set(0.5, 0);
      level.position.set(0, 55);
      root.addChild(name, level);
      if (pick.effect) {
        const effect = new Text({ text: pick.effect, style: SMALL_STYLE, roundPixels: true });
        effect.anchor.set(0.5, 0);
        effect.position.set(0, 67);
        root.addChild(effect);
      }
      root.position.set(snap(pick.x), snap(pick.y));
      this.rewardLayer.addChild(root);
      this.groundPicks.push({ root, worldX: pick.x, worldY: pick.y, phase: i * 1.7 });
    }
  }

  update(dt: number): void {
    if (this.destroyed) return;
    this.viewTime += Math.max(0, Math.min(dt, 0.1));
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
    const zoom = this.world.zoom;
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
    this.stage.scale.set(zoom);
    this.stage.position.set(
      snap(this.view.width / 2 - cameraX * zoom + shakeX),
      snap(this.view.height / 2 - cameraY * zoom + shakeY),
    );
  }

  private updateFloor(cameraX: number, cameraY: number): void {
    const pad = 256;
    const left = snap(cameraX - this.world.worldW / 2 - pad);
    const top = snap(cameraY - this.world.worldH / 2 - pad);
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
          visual = sprite(environmentPixelTexture(id), 0.5, 0.92);
          visual.alpha = 0.58 + ((hash >>> 24) % 3) * 0.05;
          const scale = 0.5;
          visual.scale.set((hash & 1) === 0 ? scale : -scale, scale);
          visual.position.set(snap(worldX), snap(worldY));
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
    const walkFrame = moved && Math.floor(this.viewTime * FRAME_RATE) % 2 === 1;
    this.player.texture = this.playerFrames[walkFrame ? 1 : 0];
    this.player.position.set(snap(p.x), snap(p.y));
    this.player.scale.set(p.facingX < 0 ? -PLAYER_SCALE : PLAYER_SCALE, PLAYER_SCALE);
    this.player.alpha = p.iframesT > 0 && Math.floor(this.viewTime * 18) % 2 === 0 ? 0.55 : 1;
    this.playerMarker.position.set(snap(p.x), snap(p.y + 3));
    const markerPulse = Math.floor(this.viewTime * 6) % 2 === 0;
    this.playerMarker.scale.set(markerPulse ? 0.32 : 0.36);
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
        const body = sprite(enemyPixelFrames(enemy.kind)[0], 0.5, 0.92);
        root.addChild(body);
        let aura: Sprite | undefined;
        if (enemy.amped || enemy.headliner || enemy.shieldHp > 0) {
          aura = sprite(effectPixelTexture(enemy.headliner ? 'impact-gold' : 'impact-cyan'));
          aura.alpha = enemy.headliner ? 0.55 : 0.32;
          aura.scale.set(enemy.headliner ? 0.72 : 0.5);
          root.addChildAt(aura, 0);
        }
        this.enemyLayer.addChild(root);
        visual = { root, body, aura };
        this.enemySprites.set(enemy, visual);
      }
      const frames = enemyPixelFrames(enemy.kind);
      visual.body.texture = frames[(frame + enemy.id) % 2];
      visual.root.position.set(snap(enemy.x), snap(enemy.y));
      const scale = enemy.headliner ? 0.72 : enemy.kind === 'elite' || enemy.kind === 'mantis' ? 0.6 : ACTOR_SCALE;
      const facing = enemy.lastMoveX > 0.1 ? -1 : enemy.lastMoveX < -0.1 ? 1 : visual.root.scale.x < 0 ? -1 : 1;
      visual.root.scale.set(scale * facing, scale);
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
        visual = sprite(weaponPixelTexture(projectile.role, projectile.evolved));
        this.projectileLayer.addChild(visual);
        this.projectileSprites.set(projectile, visual);
      }
      visual.texture = weaponPixelTexture(projectile.role, projectile.evolved);
      visual.position.set(snap(projectile.x), snap(projectile.y));
      const base = PROJECTILE_SCALE[projectile.role] ?? 0.28;
      const large = projectile.radius >= 12 ? 1.25 : projectile.shard ? 0.72 : 1;
      visual.scale.set(quantizeScale(base * large));
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
        visual = sprite(weaponPixelTexture('chord', zone.evolved));
        this.zoneLayer.addChild(visual);
        this.zoneSprites.set(zone, visual);
      }
      visual.texture = weaponPixelTexture('chord', zone.evolved);
      visual.position.set(snap(zone.x), snap(zone.y));
      visual.scale.set(quantizeScale(Math.min(2.25, (zone.radius * 2) / 82)));
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
        visual = sprite(pickupPixelTexture(`xp-${gem.tier}`));
        visual.scale.set(PICKUP_SCALE);
        this.pickupLayer.addChild(visual);
        this.gemSprites.set(gem, visual);
      }
      visual.texture = pickupPixelTexture(`xp-${gem.tier}`);
      visual.position.set(snap(gem.x), snap(gem.y + (Math.floor(this.viewTime * 6 + gem.x) % 2)));
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
        visual = sprite(pickupPixelTexture('music-note'));
        this.pickupLayer.addChild(visual);
        this.noteSprites.set(note, visual);
      }
      const scale = note.tier === 'anthem' ? 0.66 : note.tier === 'phrase' ? 0.55 : 0.46;
      visual.scale.set(scale);
      visual.position.set(snap(note.x), snap(note.y + (Math.floor(this.viewTime * 6 + note.y) % 2)));
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
        visual = sprite(effectPixelTexture('explosion'));
        this.zoneLayer.addChild(visual);
        this.shockwaveSprites.set(shockwave, visual);
      }
      visual.position.set(snap(shockwave.x), snap(shockwave.y));
      visual.scale.set(quantizeScale(Math.min(2.5, (shockwave.radius * 2) / 72)));
      visual.alpha = Math.max(0.08, 0.28 * (1 - shockwave.age / shockwave.lifeS));
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
        visual = sprite(weaponPixelTexture('bell', true));
        this.zoneLayer.addChild(visual);
        this.gravitySprites.set(well, visual);
      }
      visual.position.set(snap(well.x), snap(well.y));
      visual.scale.set(quantizeScale(Math.min(2.5, (well.radius * 2) / 84)));
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
        visual = sprite(pickupPixelTexture('evolution-chest'));
        visual.scale.set(0.62);
        this.rewardLayer.addChild(visual);
        this.encoreSprites.set(encore, visual);
      }
      visual.position.set(snap(encore.x), snap(encore.y));
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
          const texture = effectPixelTexture(event.color === KIT_COLORS.bell ? 'impact-gold' : 'impact-cyan');
          const displayRadius = Math.min(event.radius, Math.min(this.world.worldW, this.world.worldH) * 0.44);
          const count = event.radius < 44 ? 1 : Math.min(18, Math.max(8, Math.round(displayRadius / 38)));
          for (let i = 0; i < count; i++) {
            const angle = count === 1 ? 0 : (i / count) * Math.PI * 2;
            const radius = count === 1 ? 0 : displayRadius;
            this.addTimedSprite(texture, event.x + Math.cos(angle) * radius, event.y + Math.sin(angle) * radius, {
              duration: event.dur,
              from: event.soft ? 0.12 : 0.16,
              to: event.soft ? 0.22 : 0.3,
              alpha: event.soft ? 0.38 : 0.66,
            });
          }
        }
        break;
      case 'death':
        this.addTimedSprite(effectPixelTexture('death'), event.x, event.y, {
          duration: event.elite ? 0.75 : 0.48,
          from: event.elite ? 0.65 : 0.38,
          to: event.elite ? 1.15 : 0.72,
          alpha: 0.9,
        });
        break;
      case 'whip': {
        const attack = this.addTimedSprite(weaponPixelTexture('kick', false), event.x, event.y, {
          duration: 0.22,
          from: 0.45,
          to: 0.8 * event.area,
          alpha: 0.96,
        });
        attack.sprite.scale.x *= event.side;
        break;
      }
      case 'arc': {
        const attack = this.addTimedSprite(weaponPixelTexture('clap', false), event.x, event.y, {
          duration: 0.25,
          from: 0.42,
          to: Math.min(2.5, Math.max(0.65, event.radius / 70)),
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
          this.addTimedSprite(effectPixelTexture(event.color === KIT_COLORS.bell ? 'impact-gold' : 'impact-cyan'), event.x, event.y, {
            duration: 0.32,
            from: 0.12,
            to: 0.22,
            alpha: 0.9,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
          });
        }
        break;
      }
      case 'slam':
        this.addTimedSprite(effectPixelTexture('explosion'), event.x, event.y, {
          duration: 0.48,
          from: 0.45,
          to: Math.min(2.5, Math.max(0.75, event.radius / 48)),
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
        const thickness = Math.max(0.18, Math.min(0.58, event.width / 150));
        for (let i = 0; i <= count; i++) {
          const t = i / count;
          const beam = this.addTimedSprite(
            weaponPixelTexture('snare', true),
            event.x + dx * t,
            event.y + dy * t,
            {
              duration: 0.24,
              fromX: 0.16,
              fromY: thickness,
              toX: 0.28,
              toY: thickness,
              alpha: i % 2 === 0 ? 0.68 : 0.48,
            },
          );
          beam.sprite.rotation = direction8(dx, dy);
        }
        break;
      }
      case 'banner':
        this.addTimedSprite(effectPixelTexture('celebration'), event.x, event.y, {
          duration: 0.75,
          from: 0.4,
          to: 1.05,
          alpha: 0.94,
        });
        this.addBanner(event.label, event.x, event.y - 52, event.color);
        break;
      case 'evolution':
        this.addTimedSprite(effectPixelTexture('celebration'), event.x, event.y, {
          duration: 1,
          from: 0.55,
          to: 1.55,
          alpha: 1,
        });
        this.addBanner(event.label, event.x, event.y - 62, event.color);
        break;
    }
  }

  private addTimedSprite(
    texture: Texture,
    x: number,
    y: number,
    options: {
      duration: number;
      from?: number;
      to?: number;
      fromX?: number;
      fromY?: number;
      toX?: number;
      toY?: number;
      alpha?: number;
      vx?: number;
      vy?: number;
    },
  ): TimedSprite {
    if (this.timedSprites.length >= MAX_EFFECTS) {
      const oldest = this.timedSprites.shift();
      oldest?.sprite.destroy();
    }
    const visual = sprite(texture);
    visual.position.set(snap(x), snap(y));
    visual.alpha = options.alpha ?? 1;
    const fromX = options.fromX ?? options.from ?? 0.25;
    const fromY = options.fromY ?? options.from ?? 0.25;
    visual.scale.set(quantizeScale(fromX), quantizeScale(fromY));
    this.effectLayer.addChild(visual);
    const timed: TimedSprite = {
      sprite: visual,
      age: 0,
      duration: Math.max(0.05, options.duration),
      fromX,
      fromY,
      toX: options.toX ?? options.to ?? 1,
      toY: options.toY ?? options.to ?? 1,
      vx: options.vx ?? 0,
      vy: options.vy ?? 0,
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
      const eased = 1 - (1 - t) * (1 - t);
      effect.sprite.position.x = snap(effect.sprite.position.x + effect.vx * dt);
      effect.sprite.position.y = snap(effect.sprite.position.y + effect.vy * dt);
      effect.sprite.scale.set(
        quantizeScale(effect.fromX + (effect.toX - effect.fromX) * eased),
        quantizeScale(effect.fromY + (effect.toY - effect.fromY) * eased),
      );
      if (effect.fade) effect.sprite.alpha = Math.max(0, effect.sprite.alpha * (1 - t * 0.12));
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
    text.position.set(snap(event.x), snap(event.y));
    this.textLayer.addChild(text);
    this.floaters.push({ text, age: 0, duration: 0.46, x: event.x, y: event.y, vy: -30 });
  }

  private addBanner(label: string, x: number, y: number, color: number): void {
    const text = new Text({ text: label.toUpperCase(), style: LABEL_STYLE, roundPixels: true });
    text.anchor.set(0.5);
    text.tint = color;
    text.position.set(snap(x), snap(y));
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
      floater.text.position.set(snap(floater.x), snap(floater.y));
      floater.text.alpha = Math.max(0, 1 - Math.pow(floater.age / floater.duration, 2));
    }
  }

  private updateGroundPicks(): void {
    for (const pick of this.groundPicks) {
      const bob = Math.floor((Math.sin(this.viewTime * 5 + pick.phase) + 1) * 0.75);
      pick.root.position.set(snap(pick.worldX), snap(pick.worldY - bob));
    }
  }
}
