import { Assets, TextureStyle } from 'pixi.js';
import type { Spritesheet, Texture } from 'pixi.js';

import type { Role } from '../audio/kits';
import type { EnemyKind } from './config';
import type { ItemId } from './items';

export const PIXEL_ART_ATLAS_URL = '/art/pixel/gameplay.json';
export const PIXEL_UI_ATLAS_URL = '/art/pixel/ui.json';
export const PIXEL_ARENA_FLOOR_URL = '/art/pixel/arena-floor.png';
export const PIXEL_ENVIRONMENT_ATLAS_URL = '/art/pixel/environment.json';
export const PIXEL_TITLE_BANNER_URL = '/art/pixel/title-banner.png';
export const PIXEL_FRAME_SIZE = 96;
export const PIXEL_ACTOR_ANCHOR = { x: 0.5, y: 0.92 } as const;

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

export interface PixelArtSheets {
  gameplay: Spritesheet;
  ui: Spritesheet;
  environment: Spritesheet;
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

function requireTexture(sheet: Spritesheet, key: string, atlasName: string): Texture {
  const texture = sheet.textures[key];
  if (!texture) throw new Error(`Pixel-art ${atlasName} atlas is missing texture ${JSON.stringify(key)}`);
  return texture;
}

function validateSheets(loaded: PixelArtSheets): void {
  for (const key of expectedGameplayKeys()) requireTexture(loaded.gameplay, key, 'gameplay');
  for (const key of expectedIconKeys()) requireTexture(loaded.ui, key, 'UI');
  for (const key of expectedEnvironmentKeys()) requireTexture(loaded.environment, key, 'environment');
  const actorAnimations = ['actors/player', ...PIXEL_ENEMY_KINDS.map((kind) => `actors/enemies/${kind}`)];
  for (const key of actorAnimations) {
    if (loaded.gameplay.animations[key]?.length !== 2) {
      throw new Error(`Pixel-art gameplay atlas is missing two-frame animation ${JSON.stringify(key)}`);
    }
  }
}

/** Preload both original pixel-art sheets before constructing arena sprites.
 * The source and every derived texture are forced to nearest-neighbour sampling. */
export function preloadPixelArt(): Promise<PixelArtSheets> {
  if (sheets) return Promise.resolve(sheets);
  if (pendingLoad) return pendingLoad;
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  pendingLoad = Promise.all([
    Assets.load<Spritesheet>(PIXEL_ART_ATLAS_URL),
    Assets.load<Spritesheet>(PIXEL_UI_ATLAS_URL),
    Assets.load<Spritesheet>(PIXEL_ENVIRONMENT_ATLAS_URL),
    Assets.load<Texture>(PIXEL_ARENA_FLOOR_URL),
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
