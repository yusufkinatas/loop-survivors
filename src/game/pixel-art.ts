import { Assets, TextureStyle } from 'pixi.js';
import type { Spritesheet, SpritesheetData, SpritesheetFrameData, Texture } from 'pixi.js';

import type { Role } from '../audio/kits';
import type { EnemyKind } from './config';
import type { ItemId } from './items';

export const PIXEL_ART_ATLAS_URL = '/art/pixel/gameplay.json';
export const PIXEL_UI_ATLAS_URL = '/art/pixel/ui.json';
export const PIXEL_ARENA_FLOOR_URL = '/art/pixel/arena-floor.png';
export const PIXEL_ENVIRONMENT_ATLAS_URL = '/art/pixel/environment.json';
export const PIXEL_TITLE_BANNER_URL = '/art/pixel/title-banner.png';

export type PixelAtlasId = 'gameplay' | 'ui' | 'environment';

interface PixelArtAssetUrls {
  readonly gameplay: string;
  readonly ui: string;
  readonly environment: string;
  readonly arenaFloor: string;
  readonly titleBanner: string;
}

const PIXEL_ART_ASSET_URLS: PixelArtAssetUrls = Object.freeze({
  gameplay: PIXEL_ART_ATLAS_URL,
  ui: PIXEL_UI_ATLAS_URL,
  environment: PIXEL_ENVIRONMENT_ATLAS_URL,
  arenaFloor: PIXEL_ARENA_FLOOR_URL,
  titleBanner: PIXEL_TITLE_BANNER_URL,
});

export function pixelTitleBannerUrl(): string {
  return PIXEL_TITLE_BANNER_URL;
}

export interface NativeLogicalSize {
  readonly w: number;
  readonly h: number;
  readonly space?: 'native-logical-pixels';
}

export interface NativeLogicalPoint {
  readonly x: number;
  readonly y: number;
  readonly origin?: 'native-frame-top-left';
  readonly space?: 'native-logical-pixels';
}

export interface PixelAtlasFrameData extends Omit<
  SpritesheetFrameData,
  'frame' | 'sourceSize' | 'spriteSourceSize' | 'anchor'
> {
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly space?: 'atlas-pixels';
  };
  readonly sourceSize?: NativeLogicalSize;
  readonly spriteSourceSize?: NativeLogicalSize & {
    readonly x: number;
    readonly y: number;
  };
  readonly nativeSize?: NativeLogicalSize;
  readonly pivot?: NativeLogicalPoint;
  readonly anchor?: {
    readonly x: number;
    readonly y: number;
    readonly space?: 'normalized-native-frame';
  };
  readonly opaqueBounds?: NativeLogicalSize & NativeLogicalPoint & {
    readonly opaquePixels: number;
  };
  readonly semantic?: {
    readonly class: string;
    readonly tags: readonly string[];
  };
  readonly transparentMargin?: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
    readonly minimumRequired: number;
    readonly space?: 'native-logical-pixels';
  };
  readonly rendererScale?: {
    readonly value: number;
    readonly space?: 'logical-screen-pixels-per-native-pixel';
  };
  readonly colorBudget?: number;
  readonly colorsUsed?: number;
  readonly groundReference?: {
    readonly x: number;
    readonly y: number;
    readonly kind: 'planted-ground' | 'projected-hover-ground';
    readonly origin: 'native-frame-top-left';
    readonly space?: 'native-logical-pixels';
  };
}

export interface PixelSpritesheetData extends SpritesheetData {
  readonly frames: Record<string, PixelAtlasFrameData>;
  readonly meta: SpritesheetData['meta'] & {
    readonly coordinateSpace?: 'atlas-pixels';
    readonly selectedDirection?: string;
    readonly direction?: string;
    readonly palette?: readonly string[];
    readonly masterPalette?: readonly { readonly name: string; readonly hex: string }[];
    readonly rendererScale?: {
      readonly value: number;
      readonly space?: 'logical-screen-pixels-per-native-pixel';
    };
  };
}

export type PixelSpritesheet = Spritesheet<PixelSpritesheetData>;

export interface PixelFrameMetadata {
  readonly atlas: PixelAtlasId;
  readonly key: string;
  readonly frame: PixelAtlasFrameData['frame'];
  readonly nativeSize: NativeLogicalSize;
  readonly pivot: NativeLogicalPoint;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly rendererScale: number;
  readonly opaqueBounds: PixelAtlasFrameData['opaqueBounds'] | null;
  readonly semantic: PixelAtlasFrameData['semantic'] | null;
  readonly groundReference: {
    readonly x: number;
    readonly y: number;
    readonly kind: 'planted-ground' | 'projected-hover-ground';
  } | null;
}

export const PIXEL_ENEMY_KINDS = [
  'swarmer', 'tank', 'darter', 'splitter', 'charger', 'circler', 'shielded', 'elite',
  'bat', 'redBat', 'redBat2', 'zombie', 'skeleton', 'ghost', 'greenMudman',
  'grayMudman', 'flower', 'glowingBat', 'mantis', 'batSwarm',
] as const satisfies readonly EnemyKind[];

export const PIXEL_WEAPON_ROLES = [
  'kick', 'clap', 'snare', 'hat', 'bass', 'lead', 'arp', 'chord', 'bell',
] as const satisfies readonly Role[];

export const PIXEL_PICKUP_IDS = [
  'xp-blue', 'xp-green', 'xp-red', 'music-note', 'reward-pedestal', 'evolution-chest',
] as const;

export const PIXEL_EFFECT_IDS = [
  'impact-cyan', 'impact-gold', 'explosion', 'death', 'xp-collect', 'celebration',
] as const;

export const PIXEL_PASSIVE_ICON_IDS = [
  'highTops', 'fastForward', 'needleTips', 'mirrorball', 'wideLens', 'heavyAmp',
  'extensionCable', 'magnetLanyard', 'paddedJacket', 'recoveryTape',
] as const satisfies readonly ItemId[];

export const PIXEL_STATUS_ICON_IDS = ['heart', 'xp', 'note', 'level', 'pause'] as const;
export const PIXEL_ACTION_ICON_IDS = [
  'reroll', 'shop', 'evolution', 'weapon-pedestal', 'enemy-skull',
] as const;

export const PIXEL_ENVIRONMENT_IDS = [
  'broken-pillar', 'rune-pillar', 'cyan-brazier', 'gold-brazier', 'rubble',
  'sarcophagus', 'hooded-statue', 'knight-statue', 'bones', 'mushrooms',
  'thorn-vines', 'gravestone', 'cyan-crystals', 'purple-banner', 'campfire',
  'rune-dais',
] as const;

export type PixelActorFrame = 'idle' | 'walk';
export type PixelWeaponRole = (typeof PIXEL_WEAPON_ROLES)[number];
export type PixelPickupId = (typeof PIXEL_PICKUP_IDS)[number];
export type PixelEffectId = (typeof PIXEL_EFFECT_IDS)[number];
export type PixelPassiveIconId = (typeof PIXEL_PASSIVE_ICON_IDS)[number];
export type PixelStatusIconId = (typeof PIXEL_STATUS_ICON_IDS)[number];
export type PixelActionIconId = (typeof PIXEL_ACTION_ICON_IDS)[number];
export type PixelEnvironmentId = (typeof PIXEL_ENVIRONMENT_IDS)[number];

export type PlayerTextureKey = `actors/player/${PixelActorFrame}`;
export type EnemyTextureKey = `actors/enemies/${EnemyKind}/${PixelActorFrame}`;
export type WeaponTextureKey = `weapons/${PixelWeaponRole}/${'normal' | 'evolved'}`;
export type PickupTextureKey = `pickups/${PixelPickupId}`;
export type EffectTextureKey = `fx/${PixelEffectId}`;
export type GameplayTextureKey =
  | PlayerTextureKey
  | EnemyTextureKey
  | WeaponTextureKey
  | PickupTextureKey
  | EffectTextureKey;

export type PassiveIconTextureKey = `ui/items/${PixelPassiveIconId}`;
export type StatusIconTextureKey = `ui/status/${PixelStatusIconId}`;
export type ActionIconTextureKey = `ui/actions/${PixelActionIconId}`;
export type PixelIconTextureKey = PassiveIconTextureKey | StatusIconTextureKey | ActionIconTextureKey;
export type EnvironmentTextureKey = `environment/${PixelEnvironmentId}`;
export type PixelProductionTextureKey = GameplayTextureKey | PixelIconTextureKey | EnvironmentTextureKey;

export interface PixelArtSheets {
  gameplay: PixelSpritesheet;
  ui: PixelSpritesheet;
  environment: PixelSpritesheet;
  arenaFloor: Texture;
}

let sheets: PixelArtSheets | undefined;
let pendingLoad: Promise<PixelArtSheets> | undefined;

export function playerTextureKey(frame: PixelActorFrame): PlayerTextureKey {
  return `actors/player/${frame}`;
}

export function enemyTextureKey(kind: EnemyKind, frame: PixelActorFrame): EnemyTextureKey {
  return `actors/enemies/${kind}/${frame}`;
}

export function weaponTextureKey(role: PixelWeaponRole, evolved: boolean): WeaponTextureKey {
  return `weapons/${role}/${evolved ? 'evolved' : 'normal'}`;
}

export function pickupTextureKey(id: PixelPickupId): PickupTextureKey {
  return `pickups/${id}`;
}

export function effectTextureKey(id: PixelEffectId): EffectTextureKey {
  return `fx/${id}`;
}

export function passiveIconTextureKey(id: PixelPassiveIconId): PassiveIconTextureKey {
  return `ui/items/${id}`;
}

export function statusIconTextureKey(id: PixelStatusIconId): StatusIconTextureKey {
  return `ui/status/${id}`;
}

export function actionIconTextureKey(id: PixelActionIconId): ActionIconTextureKey {
  return `ui/actions/${id}`;
}

export function environmentTextureKey(id: PixelEnvironmentId): EnvironmentTextureKey {
  return `environment/${id}`;
}

function expectedGameplayKeys(): GameplayTextureKey[] {
  const keys: GameplayTextureKey[] = [playerTextureKey('idle'), playerTextureKey('walk')];
  for (const kind of PIXEL_ENEMY_KINDS) {
    keys.push(enemyTextureKey(kind, 'idle'), enemyTextureKey(kind, 'walk'));
  }
  for (const role of PIXEL_WEAPON_ROLES) {
    keys.push(weaponTextureKey(role, false), weaponTextureKey(role, true));
  }
  for (const id of PIXEL_PICKUP_IDS) keys.push(pickupTextureKey(id));
  for (const id of PIXEL_EFFECT_IDS) keys.push(effectTextureKey(id));
  return keys;
}

function expectedIconKeys(): PixelIconTextureKey[] {
  return [
    ...PIXEL_PASSIVE_ICON_IDS.map(passiveIconTextureKey),
    ...PIXEL_STATUS_ICON_IDS.map(statusIconTextureKey),
    ...PIXEL_ACTION_ICON_IDS.map(actionIconTextureKey),
  ];
}

function expectedEnvironmentKeys(): EnvironmentTextureKey[] {
  return PIXEL_ENVIRONMENT_IDS.map(environmentTextureKey);
}

function requireTexture(sheet: PixelSpritesheet, key: string, atlasName: string): Texture {
  const texture = sheet.textures[key];
  if (!texture) throw new Error(`Pixel-art ${atlasName} atlas is missing texture ${JSON.stringify(key)}`);
  return texture;
}

function assertFiniteInteger(value: number, description: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Pixel-art metadata ${description} must be a finite integer; received ${value}`);
  }
}

export function validatePixelFrameContract(
  entry: PixelAtlasFrameData,
  key: string,
  atlas: PixelAtlasId,
): void {
  void atlas;
  const nativeSize = entry.nativeSize;
  const pivot = entry.pivot;
  const anchor = entry.anchor;
  const rendererScale = entry.rendererScale;
  const opaque = entry.opaqueBounds;
  const margin = entry.transparentMargin;
  if (entry.frame.space !== 'atlas-pixels') {
    throw new Error(`Pixel-art ${key} frame must declare atlas-pixels space`);
  }
  if (entry.rotated !== false || entry.trimmed !== false) {
    throw new Error(`Pixel-art ${key} must be unrotated and untrimmed`);
  }
  if (!nativeSize || nativeSize.space !== 'native-logical-pixels') {
    throw new Error(`Pixel-art ${key} is missing nativeSize in native-logical-pixels`);
  }
  assertFiniteInteger(nativeSize.w, `${key}.nativeSize.w`);
  assertFiniteInteger(nativeSize.h, `${key}.nativeSize.h`);
  if (nativeSize.w <= 0 || nativeSize.h <= 0 || entry.frame.w !== nativeSize.w || entry.frame.h !== nativeSize.h) {
    throw new Error(`Pixel-art ${key} frame and nativeSize must be equal positive dimensions`);
  }
  if (
    !entry.sourceSize ||
    entry.sourceSize.space !== 'native-logical-pixels' ||
    entry.sourceSize.w !== nativeSize.w ||
    entry.sourceSize.h !== nativeSize.h ||
    !entry.spriteSourceSize ||
    entry.spriteSourceSize.space !== 'native-logical-pixels' ||
    entry.spriteSourceSize.x !== 0 ||
    entry.spriteSourceSize.y !== 0 ||
    entry.spriteSourceSize.w !== nativeSize.w ||
    entry.spriteSourceSize.h !== nativeSize.h
  ) {
    throw new Error(`Pixel-art ${key} sourceSize metadata must match its untrimmed nativeSize`);
  }
  if (!pivot || pivot.space !== 'native-logical-pixels' || pivot.origin !== 'native-frame-top-left') {
    throw new Error(`Pixel-art ${key} is missing a native-frame-top-left pivot`);
  }
  assertFiniteInteger(pivot.x, `${key}.pivot.x`);
  assertFiniteInteger(pivot.y, `${key}.pivot.y`);
  if (!anchor || anchor.space !== 'normalized-native-frame') {
    throw new Error(`Pixel-art ${key} is missing its normalized compatibility anchor`);
  }
  const epsilon = 1e-5;
  if (
    Math.abs(anchor.x - pivot.x / nativeSize.w) > epsilon ||
    Math.abs(anchor.y - pivot.y / nativeSize.h) > epsilon
  ) {
    throw new Error(`Pixel-art ${key} anchor does not match pivot/nativeSize`);
  }
  if (
    !rendererScale ||
    rendererScale.value !== 1 ||
    rendererScale.space !== 'logical-screen-pixels-per-native-pixel'
  ) {
    throw new Error(`Pixel-art ${key} must declare rendererScale 1 in logical screen pixels`);
  }
  if (!opaque) {
    throw new Error(`Pixel-art ${key} is missing measured native opaque bounds`);
  }
  if (
    opaque.space !== 'native-logical-pixels' ||
    opaque.origin !== 'native-frame-top-left' ||
    !Number.isInteger(opaque.opaquePixels) ||
    opaque.opaquePixels <= 0
  ) throw new Error(`Pixel-art ${key} has invalid measured native opaque bounds`);
  if (
    opaque.x < 0 || opaque.y < 0 || opaque.w <= 0 || opaque.h <= 0 ||
    opaque.x + opaque.w > nativeSize.w || opaque.y + opaque.h > nativeSize.h
  ) {
    throw new Error(`Pixel-art ${key} opaque bounds fall outside nativeSize`);
  }
  if (!entry.semantic || !entry.semantic.class || !Array.isArray(entry.semantic.tags)) {
    throw new Error(`Pixel-art ${key} is missing semantic class/tags metadata`);
  }
  if (!margin || margin.space !== 'native-logical-pixels' || margin.minimumRequired < 2) {
    throw new Error(`Pixel-art ${key} must declare at least a two-pixel transparent margin`);
  }
  if (
    margin.top < margin.minimumRequired || margin.right < margin.minimumRequired ||
    margin.bottom < margin.minimumRequired || margin.left < margin.minimumRequired
  ) {
    throw new Error(`Pixel-art ${key} violates its transparent-margin minimum`);
  }
  if (key.startsWith('actors/')) {
    const ground = entry.groundReference;
    if (
      !ground || ground.space !== 'native-logical-pixels' ||
      ground.origin !== 'native-frame-top-left' ||
      (ground.kind !== 'planted-ground' && ground.kind !== 'projected-hover-ground')
    ) {
      throw new Error(`Pixel-art actor ${key} is missing its native groundReference`);
    }
    assertFiniteInteger(ground.x, `${key}.groundReference.x`);
    assertFiniteInteger(ground.y, `${key}.groundReference.y`);
  }
  if (entry.colorsUsed !== undefined && entry.colorBudget !== undefined && entry.colorsUsed > entry.colorBudget) {
    throw new Error(`Pixel-art ${key} exceeds its declared color budget`);
  }
}

function validateNativeFrame(
  sheet: PixelSpritesheet,
  key: string,
  atlas: PixelAtlasId,
): void {
  const entry = sheet.data.frames[key];
  if (!entry) throw new Error(`Pixel-art ${atlas} atlas is missing metadata for ${JSON.stringify(key)}`);
  validatePixelFrameContract(entry, key, atlas);
}

function validateSheets(loaded: PixelArtSheets): void {
  for (const key of expectedGameplayKeys()) requireTexture(loaded.gameplay, key, 'gameplay');
  for (const key of expectedIconKeys()) requireTexture(loaded.ui, key, 'UI');
  for (const key of expectedEnvironmentKeys()) requireTexture(loaded.environment, key, 'environment');
  for (const key of expectedGameplayKeys()) validateNativeFrame(loaded.gameplay, key, 'gameplay');
  for (const key of expectedIconKeys()) validateNativeFrame(loaded.ui, key, 'ui');
  for (const key of expectedEnvironmentKeys()) validateNativeFrame(loaded.environment, key, 'environment');
  for (const [atlas, sheet] of [
    ['gameplay', loaded.gameplay],
    ['ui', loaded.ui],
    ['environment', loaded.environment],
  ] as const) {
    const meta = sheet.data.meta;
    const size = meta.size as (typeof meta.size & { readonly space?: string });
    if (!size || size.space !== 'atlas-pixels') {
      throw new Error(`Pixel-art ${atlas} atlas meta.size must declare atlas-pixels`);
    }
    if (
      meta.direction !== 'arcade-reliquary' ||
      meta.rendererScale?.value !== 1 ||
      meta.rendererScale.space !== 'logical-screen-pixels-per-native-pixel'
    ) {
      throw new Error(`Pixel-art ${atlas} atlas must declare Arcade Reliquary at native logical 1x`);
    }
  }
  const actorAnimations = ['actors/player', ...PIXEL_ENEMY_KINDS.map((kind) => `actors/enemies/${kind}`)];
  for (const key of actorAnimations) {
    if (loaded.gameplay.animations[key]?.length !== 2) {
      throw new Error(`Pixel-art gameplay atlas is missing two-frame animation ${JSON.stringify(key)}`);
    }
    const frameKeys = loaded.gameplay.data.animations?.[key];
    if (!frameKeys || frameKeys.length !== 2) {
      throw new Error(`Pixel-art gameplay atlas JSON is missing animation mapping ${JSON.stringify(key)}`);
    }
    const first = loaded.gameplay.data.frames[frameKeys[0]];
    const second = loaded.gameplay.data.frames[frameKeys[1]];
    if (
      !first || !second ||
      JSON.stringify(first.nativeSize) !== JSON.stringify(second.nativeSize) ||
      JSON.stringify(first.pivot) !== JSON.stringify(second.pivot) ||
      !first.groundReference || !second.groundReference ||
      first.groundReference.kind !== second.groundReference.kind ||
      Math.abs(first.groundReference.x - second.groundReference.x) > 1 ||
      Math.abs(first.groundReference.y - second.groundReference.y) > 1
    ) {
      throw new Error(`Pixel-art animation ${key} must share nativeSize/pivot and keep ground-reference drift within one pixel`);
    }
  }
}

/** Preload every production pixel-art sheet before constructing arena sprites.
 * The source and every derived texture are forced to nearest-neighbour sampling. */
export function preloadPixelArt(): Promise<PixelArtSheets> {
  if (sheets) return Promise.resolve(sheets);
  if (pendingLoad) return pendingLoad;
  const urls = PIXEL_ART_ASSET_URLS;
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  pendingLoad = Promise.all([
    Assets.load<PixelSpritesheet>(urls.gameplay),
    Assets.load<PixelSpritesheet>(urls.ui),
    Assets.load<PixelSpritesheet>(urls.environment),
    Assets.load<Texture>(urls.arenaFloor),
  ]).then(([gameplay, ui, environment, arenaFloor]) => {
    gameplay.textureSource.scaleMode = 'nearest';
    ui.textureSource.scaleMode = 'nearest';
    environment.textureSource.scaleMode = 'nearest';
    arenaFloor.source.scaleMode = 'nearest';
    arenaFloor.source.addressMode = 'repeat';
    const loaded = { gameplay, ui, environment, arenaFloor };
    validateSheets(loaded);
    sheets = loaded;
    pendingLoad = undefined;
    return loaded;
  }).catch((error: unknown) => {
    pendingLoad = undefined;
    throw error;
  });
  return pendingLoad;
}

export function pixelArtReady(): boolean {
  return sheets !== undefined;
}

function loadedSheets(): PixelArtSheets {
  if (!sheets) throw new Error('Pixel art has not loaded; await preloadPixelArt() before creating sprites');
  return sheets;
}

export function pixelTexture(key: GameplayTextureKey): Texture {
  return requireTexture(loadedSheets().gameplay, key, 'gameplay');
}

export function pixelIconTexture(key: PixelIconTextureKey): Texture {
  return requireTexture(loadedSheets().ui, key, 'UI');
}

export function playerPixelFrames(): readonly [Texture, Texture] {
  return [pixelTexture(playerTextureKey('idle')), pixelTexture(playerTextureKey('walk'))];
}

export function enemyPixelFrames(kind: EnemyKind): readonly [Texture, Texture] {
  return [pixelTexture(enemyTextureKey(kind, 'idle')), pixelTexture(enemyTextureKey(kind, 'walk'))];
}

export function weaponPixelTexture(role: PixelWeaponRole, evolved = false): Texture {
  return pixelTexture(weaponTextureKey(role, evolved));
}

export function pickupPixelTexture(id: PixelPickupId): Texture {
  return pixelTexture(pickupTextureKey(id));
}

export function effectPixelTexture(id: PixelEffectId): Texture {
  return pixelTexture(effectTextureKey(id));
}

export function passiveIconTexture(id: PixelPassiveIconId): Texture {
  return pixelIconTexture(passiveIconTextureKey(id));
}

export function statusIconTexture(id: PixelStatusIconId): Texture {
  return pixelIconTexture(statusIconTextureKey(id));
}

export function actionIconTexture(id: PixelActionIconId): Texture {
  return pixelIconTexture(actionIconTextureKey(id));
}

export function arenaFloorTexture(): Texture {
  return loadedSheets().arenaFloor;
}

export function environmentPixelTexture(id: PixelEnvironmentId): Texture {
  return requireTexture(loadedSheets().environment, environmentTextureKey(id), 'environment');
}

function atlasForKey(key: PixelProductionTextureKey): PixelAtlasId {
  if (key.startsWith('ui/')) return 'ui';
  if (key.startsWith('environment/')) return 'environment';
  return 'gameplay';
}

function sheetForAtlas(atlas: PixelAtlasId): PixelSpritesheet {
  const loaded = loadedSheets();
  return atlas === 'gameplay' ? loaded.gameplay : atlas === 'ui' ? loaded.ui : loaded.environment;
}

export function pixelProductionTexture(key: PixelProductionTextureKey): Texture {
  const atlas = atlasForKey(key);
  return requireTexture(sheetForAtlas(atlas), key, atlas);
}

/** Runtime-normalized view of one strict native production frame. */
export function pixelFrameMetadata(key: PixelProductionTextureKey): PixelFrameMetadata {
  const atlas = atlasForKey(key);
  const entry = sheetForAtlas(atlas).data.frames[key];
  if (!entry) throw new Error(`Pixel-art ${atlas} atlas is missing metadata for ${JSON.stringify(key)}`);
  const { nativeSize, pivot, rendererScale } = entry;
  if (!nativeSize || !pivot || !rendererScale) {
    throw new Error(`Pixel-art ${atlas} frame ${JSON.stringify(key)} is missing native production metadata`);
  }
  return Object.freeze({
    atlas,
    key,
    frame: entry.frame,
    nativeSize,
    pivot,
    anchor: Object.freeze({ x: pivot.x / nativeSize.w, y: pivot.y / nativeSize.h }),
    rendererScale: rendererScale.value,
    opaqueBounds: entry.opaqueBounds ?? null,
    semantic: entry.semantic ?? null,
    groundReference: entry.groundReference
      ? Object.freeze({
          x: entry.groundReference.x,
          y: entry.groundReference.y,
          kind: entry.groundReference.kind,
        })
      : null,
  });
}

export interface PixelCssFrame {
  readonly imageUrl: string;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly logicalScale: number;
}

/** Native CSS-sprite crop for the DOM HUD at one logical pixel per source pixel. */
export function pixelIconCssFrame(key: PixelIconTextureKey): PixelCssFrame {
  const sheet = loadedSheets().ui;
  const metadata = pixelFrameMetadata(key);
  const atlasSize = sheet.data.meta.size;
  if (!atlasSize) throw new Error('Pixel-art UI atlas is missing meta.size');
  return Object.freeze({
    imageUrl: PIXEL_UI_ATLAS_URL.replace(/\.json$/, '.png'),
    atlasWidth: atlasSize.w,
    atlasHeight: atlasSize.h,
    x: metadata.frame.x,
    y: metadata.frame.y,
    width: metadata.nativeSize.w,
    height: metadata.nativeSize.h,
    logicalScale: metadata.rendererScale,
  });
}

export interface PixelArtTextureMemoryEstimate {
  readonly bytes: number;
  readonly mebibytes: number;
  readonly rgbaBytesPerPixel: 4;
  readonly sources: Readonly<Record<'gameplay' | 'ui' | 'environment' | 'arenaFloor', number>>;
}

/** Approximate resident RGBA texture memory. Frames share atlas sources, so
 * each source is counted once and no per-frame double counting occurs. */
export function pixelArtTextureMemoryEstimate(): PixelArtTextureMemoryEstimate {
  const loaded = loadedSheets();
  const bytesForSheet = (sheet: PixelSpritesheet, label: string): number => {
    const size = sheet.data.meta.size;
    if (!size) throw new Error(`Pixel-art ${label} atlas is missing meta.size`);
    return size.w * size.h * 4;
  };
  const sources = Object.freeze({
    gameplay: bytesForSheet(loaded.gameplay, 'gameplay'),
    ui: bytesForSheet(loaded.ui, 'UI'),
    environment: bytesForSheet(loaded.environment, 'environment'),
    arenaFloor: loaded.arenaFloor.source.width * loaded.arenaFloor.source.height * 4,
  });
  const bytes = sources.gameplay + sources.ui + sources.environment + sources.arenaFloor;
  return Object.freeze({
    bytes,
    mebibytes: bytes / (1024 * 1024),
    rgbaBytesPerPixel: 4 as const,
    sources,
  });
}
