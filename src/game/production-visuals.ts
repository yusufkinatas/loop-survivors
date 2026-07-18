// Native Arcade Reliquary rendering contract. Simulation sizes remain owned by
// run.ts/config.ts; this registry owns only which stable frame is drawn, which
// layer consumes it, and how a native source pixel reaches the logical screen.

import { Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';
import {
  PIXEL_ACTION_ICON_IDS,
  PIXEL_EFFECT_IDS,
  PIXEL_ENEMY_KINDS,
  PIXEL_ENVIRONMENT_IDS,
  PIXEL_PASSIVE_ICON_IDS,
  PIXEL_PICKUP_IDS,
  PIXEL_STATUS_ICON_IDS,
  PIXEL_WEAPON_ROLES,
  actionIconTextureKey,
  activePixelArtMode,
  effectTextureKey,
  enemyTextureKey,
  environmentTextureKey,
  passiveIconTextureKey,
  pickupTextureKey,
  pixelFrameMetadata,
  pixelProductionTexture,
  playerTextureKey,
  statusIconTextureKey,
  weaponTextureKey,
  type PixelActorFrame,
  type PixelProductionTextureKey,
} from './pixel-art';
import type { WorldProjection } from './viewport';
import type { EnemyKind } from './config';
import {
  buildDebugNativeActorVisualMetadata,
  type DebugNativeActorSourceFrame,
  type DebugNativeActorVisualMetadata,
} from './visual-debug';

export type ProductionVisualClass =
  | 'actor'
  | 'weapon'
  | 'pickup'
  | 'effect'
  | 'ui-icon'
  | 'environment';

export type ProductionVisualLayer =
  | 'player'
  | 'enemy'
  | 'projectile'
  | 'zone'
  | 'pickup'
  | 'effect'
  | 'reward'
  | 'dom-ui'
  | 'environment';

export type SimulationVisualBinding =
  | 'player-body'
  | 'enemy-body'
  | 'projectile-core'
  | 'attack-telegraph'
  | 'collectible-center'
  | 'cosmetic-only'
  | 'dom-only'
  | 'decorative-noncolliding';

export interface ProductionVisualDefinition {
  readonly key: PixelProductionTextureKey;
  readonly visualClass: ProductionVisualClass;
  readonly defaultLayer: ProductionVisualLayer;
  readonly simulationBinding: SimulationVisualBinding;
  /** All production frames render one logical pixel per native source pixel. */
  readonly logicalScale: 1;
  readonly pivotSource: 'atlas-native-pivot';
  readonly animationGroup: string | null;
  readonly animationFrame: number | null;
}

function definition(
  key: PixelProductionTextureKey,
  visualClass: ProductionVisualClass,
  defaultLayer: ProductionVisualLayer,
  simulationBinding: SimulationVisualBinding,
  animationGroup: string | null = null,
  animationFrame: number | null = null,
): ProductionVisualDefinition {
  return Object.freeze({
    key,
    visualClass,
    defaultLayer,
    simulationBinding,
    logicalScale: 1 as const,
    pivotSource: 'atlas-native-pivot' as const,
    animationGroup,
    animationFrame,
  });
}

const ACTOR_FRAMES = ['idle', 'walk'] as const satisfies readonly PixelActorFrame[];

const DEFINITIONS: readonly ProductionVisualDefinition[] = Object.freeze([
  ...ACTOR_FRAMES.map((frame, index) => definition(
    playerTextureKey(frame),
    'actor',
    'player',
    'player-body',
    'actors/player',
    index,
  )),
  ...PIXEL_ENEMY_KINDS.flatMap((kind) => ACTOR_FRAMES.map((frame, index) => definition(
    enemyTextureKey(kind, frame),
    'actor',
    'enemy',
    'enemy-body',
    `actors/enemies/${kind}`,
    index,
  ))),
  ...PIXEL_WEAPON_ROLES.flatMap((role) => [false, true].map((evolved) => definition(
    weaponTextureKey(role, evolved),
    'weapon',
    role === 'chord' ? 'zone' : 'projectile',
    role === 'kick' || role === 'clap' || role === 'chord'
      ? 'attack-telegraph'
      : 'projectile-core',
  ))),
  ...PIXEL_PICKUP_IDS.map((id) => definition(
    pickupTextureKey(id),
    'pickup',
    id === 'reward-pedestal' || id === 'evolution-chest' ? 'reward' : 'pickup',
    'collectible-center',
  )),
  ...PIXEL_EFFECT_IDS.map((id) => definition(
    effectTextureKey(id),
    'effect',
    'effect',
    'cosmetic-only',
  )),
  ...PIXEL_PASSIVE_ICON_IDS.map((id) => definition(
    passiveIconTextureKey(id),
    'ui-icon',
    'dom-ui',
    'dom-only',
  )),
  ...PIXEL_STATUS_ICON_IDS.map((id) => definition(
    statusIconTextureKey(id),
    'ui-icon',
    'dom-ui',
    'dom-only',
  )),
  ...PIXEL_ACTION_ICON_IDS.map((id) => definition(
    actionIconTextureKey(id),
    'ui-icon',
    'dom-ui',
    'dom-only',
  )),
  ...PIXEL_ENVIRONMENT_IDS.map((id) => definition(
    environmentTextureKey(id),
    'environment',
    'environment',
    'decorative-noncolliding',
  )),
]);

const DEFINITION_BY_KEY: Readonly<Record<string, ProductionVisualDefinition>> = Object.freeze(
  Object.fromEntries(DEFINITIONS.map((entry) => [entry.key, entry])),
);

export const PRODUCTION_VISUAL_DEFINITIONS: readonly ProductionVisualDefinition[] = DEFINITIONS;
export const PRODUCTION_VISUAL_KEYS: readonly PixelProductionTextureKey[] = Object.freeze(
  DEFINITIONS.map((entry) => entry.key),
);

export function productionVisualDefinition(key: PixelProductionTextureKey): ProductionVisualDefinition {
  const entry = DEFINITION_BY_KEY[key];
  if (!entry) throw new Error(`No production visual metadata for ${JSON.stringify(key)}`);
  return entry;
}

/** The world container is projected at 0.5. Returning two world units here
 * makes one source pixel land on exactly one logical screen pixel. */
export function productionWorldUnitsPerNativePixel(
  worldToLogicalScale: number,
  logicalScale = 1,
): number {
  if (!(worldToLogicalScale > 0) || !Number.isFinite(worldToLogicalScale)) {
    throw new Error(`Invalid world-to-logical scale ${worldToLogicalScale}`);
  }
  const worldScale = logicalScale / worldToLogicalScale;
  if (!Number.isInteger(worldScale)) {
    throw new Error(
      `Native runtime scale must be a whole number; ${logicalScale}/${worldToLogicalScale} = ${worldScale}`,
    );
  }
  return worldScale;
}

export interface ProductionSpriteOptions {
  readonly mirrorX?: boolean;
  readonly alpha?: number;
}

export function applyProductionSprite(
  target: Sprite,
  key: PixelProductionTextureKey,
  projection: WorldProjection,
  options: ProductionSpriteOptions = {},
): Sprite {
  const policy = productionVisualDefinition(key);
  const frame = pixelFrameMetadata(key);
  if (activePixelArtMode() === 'production' && frame.rendererScale !== policy.logicalScale) {
    throw new Error(
      `Production frame ${key} declares rendererScale ${frame.rendererScale}; expected ${policy.logicalScale}`,
    );
  }
  const logicalScale = activePixelArtMode() === 'production'
    ? policy.logicalScale
    : frame.rendererScale;
  const worldScale = productionWorldUnitsPerNativePixel(
    projection.worldToLogicalScale,
    logicalScale,
  );
  target.texture = pixelProductionTexture(key);
  target.anchor.set(frame.anchor.x, frame.anchor.y);
  target.scale.set(options.mirrorX ? -worldScale : worldScale, worldScale);
  target.alpha = options.alpha ?? target.alpha;
  target.roundPixels = true;
  target.label = `native:${key}`;
  return target;
}

export function productionSprite(
  key: PixelProductionTextureKey,
  projection: WorldProjection,
  options: ProductionSpriteOptions = {},
): Sprite {
  return applyProductionSprite(new Sprite(pixelProductionTexture(key)), key, projection, options);
}

export function productionTexture(key: PixelProductionTextureKey): Texture {
  productionVisualDefinition(key);
  return pixelProductionTexture(key);
}

export function productionActorDebugMetadata(
  kind: 'player' | EnemyKind,
  projection: WorldProjection,
): DebugNativeActorVisualMetadata {
  const idleKey = kind === 'player' ? playerTextureKey('idle') : enemyTextureKey(kind, 'idle');
  const walkKey = kind === 'player' ? playerTextureKey('walk') : enemyTextureKey(kind, 'walk');
  const frames = [pixelFrameMetadata(idleKey), pixelFrameMetadata(walkKey)] as const;
  const sourceFrames = frames.map((frame): DebugNativeActorSourceFrame => {
    if (!frame.groundReference || !frame.opaqueBounds) {
      throw new Error(`Actor animation ${kind} is missing groundReference or opaque bounds`);
    }
    return Object.freeze({
      width: frame.nativeSize.w,
      height: frame.nativeSize.h,
      pivotX: frame.pivot.x,
      pivotY: frame.pivot.y,
      groundX: frame.groundReference.x,
      groundY: frame.groundReference.y,
      groundKind: frame.groundReference.kind,
      opaqueBounds: Object.freeze({
        x: frame.opaqueBounds.x,
        y: frame.opaqueBounds.y,
        width: frame.opaqueBounds.w,
        height: frame.opaqueBounds.h,
      }),
    });
  }) as unknown as readonly [DebugNativeActorSourceFrame, DebugNativeActorSourceFrame];
  return buildDebugNativeActorVisualMetadata(
    sourceFrames,
    productionWorldUnitsPerNativePixel(projection.worldToLogicalScale, frames[0].rendererScale),
  );
}
