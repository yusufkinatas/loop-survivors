// Pure contracts and deterministic plans for the visual-truth Sandbox tools.
// Pixi rendering consumes these shapes in view.ts; the simulation owns their
// values in run.ts. Keeping the plan/data layer DOM- and renderer-free makes it
// directly verifiable from Node.

import type { Role } from '../audio/kits';
import type { EnemyKind } from './config';

export const LEGACY_ATLAS_FRAME_SIZE = 96;
export const LEGACY_ACTOR_ANCHOR = Object.freeze({ x: 0.5, y: 0.92 });
export const LEGACY_PLAYER_RENDER_SCALE = 0.5;
export const LEGACY_ENEMY_RENDER_SCALE = 0.5;
export const LEGACY_LARGE_ENEMY_RENDER_SCALE = 0.6;
export const LEGACY_HEADLINER_RENDER_SCALE = 0.72;

export interface DebugPointWorld {
  readonly x: number;
  readonly y: number;
}

export interface DebugCircleWorld extends DebugPointWorld {
  readonly radius: number;
}

export interface DebugRectWorld {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DebugActorGeometry {
  readonly id: 'player' | number;
  readonly kind: 'player' | EnemyKind;
  readonly hurtBodyWorld: DebugCircleWorld;
  readonly contactBodyWorld: DebugCircleWorld;
  readonly rendererAnchorWorld: DebugPointWorld;
  readonly groundPivotWorld: DebugPointWorld;
  readonly simulationGroundReferenceWorld: DebugPointWorld;
  readonly frameBoundsWorld: DebugRectWorld;
  /** Conservative measured union of idle, walk, and either horizontal facing. */
  readonly opaqueVisualBoundsWorld: DebugRectWorld;
  readonly opaqueBoundsSource: 'production atlas idle/walk/facing union' | 'visual metadata unavailable';
  readonly headliner: boolean;
  readonly amped: boolean;
}

export interface DebugNativeActorVisualMetadata {
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly groundX: number;
  readonly groundY: number;
  readonly groundKind: 'planted-ground' | 'projected-hover-ground';
  readonly opaqueUnion: DebugRectWorld;
  readonly worldUnitsPerNativePixel: number;
}

export interface DebugNativeActorSourceFrame {
  readonly width: number;
  readonly height: number;
  readonly pivotX: number;
  readonly pivotY: number;
  readonly groundX: number;
  readonly groundY: number;
  readonly groundKind: 'planted-ground' | 'projected-hover-ground';
  readonly opaqueBounds: DebugRectWorld;
}

export type DebugActorVisualResolver = (
  kind: 'player' | EnemyKind,
) => DebugNativeActorVisualMetadata | null;

export function buildDebugNativeActorVisualMetadata(
  frames: readonly [DebugNativeActorSourceFrame, DebugNativeActorSourceFrame],
  worldUnitsPerNativePixel: number,
): DebugNativeActorVisualMetadata {
  const [first, second] = frames;
  if (
    first.width !== second.width || first.height !== second.height ||
    first.pivotX !== second.pivotX || first.pivotY !== second.pivotY
  ) throw new Error('Actor idle/walk frames must share native dimensions and pivot');
  if (
    first.groundKind !== second.groundKind ||
    Math.abs(first.groundX - second.groundX) > 1 ||
    Math.abs(first.groundY - second.groundY) > 1
  ) {
    throw new Error('Actor idle/walk groundReference drift exceeds one native pixel');
  }
  if (!Number.isInteger(worldUnitsPerNativePixel) || worldUnitsPerNativePixel <= 0) {
    throw new Error('Actor world-units-per-native-pixel scale must be a positive whole number');
  }
  let left = first.width;
  let top = first.height;
  let right = 0;
  let bottom = 0;
  for (const frame of frames) {
    const opaque = frame.opaqueBounds;
    const mirroredX = frame.width - opaque.x - opaque.width;
    left = Math.min(left, opaque.x, mirroredX);
    top = Math.min(top, opaque.y);
    right = Math.max(right, opaque.x + opaque.width, mirroredX + opaque.width);
    bottom = Math.max(bottom, opaque.y + opaque.height);
  }
  return Object.freeze({
    nativeWidth: first.width,
    nativeHeight: first.height,
    pivotX: first.pivotX,
    pivotY: first.pivotY,
    groundX: Math.round((first.groundX + second.groundX) / 2),
    groundY: Math.round((first.groundY + second.groundY) / 2),
    groundKind: first.groundKind,
    opaqueUnion: Object.freeze({ x: left, y: top, width: right - left, height: bottom - top }),
    worldUnitsPerNativePixel,
  });
}

export function nativeActorFrameBounds(
  x: number,
  y: number,
  metadata: DebugNativeActorVisualMetadata,
): DebugRectWorld {
  const scale = metadata.worldUnitsPerNativePixel;
  return Object.freeze({
    x: x - metadata.pivotX * scale,
    y: y - metadata.pivotY * scale,
    width: metadata.nativeWidth * scale,
    height: metadata.nativeHeight * scale,
  });
}

export function nativeActorOpaqueBounds(
  x: number,
  y: number,
  metadata: DebugNativeActorVisualMetadata,
): DebugRectWorld {
  const scale = metadata.worldUnitsPerNativePixel;
  return Object.freeze({
    x: x + (metadata.opaqueUnion.x - metadata.pivotX) * scale,
    y: y + (metadata.opaqueUnion.y - metadata.pivotY) * scale,
    width: metadata.opaqueUnion.width * scale,
    height: metadata.opaqueUnion.height * scale,
  });
}

export interface DebugProjectileGeometry {
  readonly role: Role;
  readonly collisionCoreWorld: DebugCircleWorld;
  readonly pierce: number;
  readonly maxPierce: number;
  readonly bounces: number;
  readonly evolved: boolean;
}

export interface DebugKickGeometry {
  readonly rectWorld: DebugRectWorld;
  readonly side: 1 | -1;
  readonly growth: number;
}

export interface DebugClapGeometry extends DebugPointWorld {
  readonly angle: number;
  readonly halfArc: number;
  readonly reach: number;
  readonly pointBlankRadius: number;
}

export interface DebugZoneGeometry extends DebugCircleWorld {
  readonly source: Role;
  readonly evolved: boolean;
  readonly mergedCount: number;
  readonly mergedCapRadius: number;
}

export interface DebugPickupGeometry extends DebugPointWorld {
  readonly id: string;
  readonly kind: 'xp' | 'note' | 'encore';
  readonly collectionRadius: number;
  readonly magnetRadius: number;
}

export interface DebugChoiceGeometry extends DebugPointWorld {
  readonly id: string;
  readonly mode: 'starting' | 'reward';
  readonly collectionRadius: number;
  readonly reachable: boolean;
}

export type SandboxVisualPresetId = 'empty' | 'mixed' | 'max360';
export type SandboxMax360VariantId = 'a' | 'b' | 'c' | 'd';

export interface SandboxMax360VariantDefinition {
  readonly id: SandboxMax360VariantId;
  readonly label: string;
  readonly seed: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly kindOffset: number;
}

export interface SandboxPresetState {
  readonly id: SandboxVisualPresetId;
  readonly label: string;
  readonly seed: number;
  readonly frozen: boolean;
}

export interface RunDebugGeometrySnapshot {
  readonly timeS: number;
  readonly actors: readonly DebugActorGeometry[];
  readonly projectiles: readonly DebugProjectileGeometry[];
  readonly kickRects: readonly DebugKickGeometry[];
  readonly clapShapes: readonly DebugClapGeometry[];
  readonly zones: readonly DebugZoneGeometry[];
  readonly pickups: readonly DebugPickupGeometry[];
  readonly choices: readonly DebugChoiceGeometry[];
  readonly playerGemMagnetWorld: DebugCircleWorld;
  readonly playerNoteMagnetWorld: DebugCircleWorld;
  readonly obstacles: readonly [];
  readonly obstacleReport: 'none — scenery is decorative and non-colliding';
  readonly preset: SandboxPresetState | null;
}

export interface VisualDebugFlags {
  readonly bodies: boolean;
  readonly pivotsBounds: boolean;
  readonly attacks: boolean;
  readonly pickups: boolean;
}

export const EMPTY_VISUAL_DEBUG_FLAGS: VisualDebugFlags = Object.freeze({
  bodies: false,
  pivotsBounds: false,
  attacks: false,
  pickups: false,
});

export interface SandboxPresetEnemy {
  readonly kind: EnemyKind;
  /** Requested source-feet position in simulation-world units. */
  readonly x: number;
  readonly y: number;
  readonly headliner?: boolean;
}

export interface SandboxPresetPickup {
  readonly kind: 'xp' | 'note' | 'encore';
  readonly x: number;
  readonly y: number;
  readonly value: number;
}

export interface SandboxPresetChoice {
  readonly id: string;
  readonly mode: 'starting' | 'reward';
  readonly x: number;
  readonly y: number;
}

export interface SandboxVisualPresetPlan {
  readonly id: SandboxVisualPresetId;
  readonly label: string;
  readonly seed: number;
  readonly minute: number;
  readonly level: number;
  readonly freeze: true;
  readonly enemies: readonly SandboxPresetEnemy[];
  readonly pickups: readonly SandboxPresetPickup[];
  readonly choices: readonly SandboxPresetChoice[];
}

export const SANDBOX_VISUAL_PRESET_IDS = Object.freeze([
  'empty',
  'mixed',
  'max360',
] as const satisfies readonly SandboxVisualPresetId[]);

const MAX_360_KINDS = Object.freeze([
  'bat',
  'zombie',
  'greenMudman',
  'mantis',
  'charger',
] as const satisfies readonly EnemyKind[]);

export const SANDBOX_MAX_360_KINDS: readonly EnemyKind[] = MAX_360_KINDS;

/**
 * Maximum-density capture should read like a real late horde, not five equal
 * wallpaper bands. Small flyers carry half the population, humanoids form the
 * next clear cohort, heavies are uncommon, and the two largest silhouettes
 * are sparse landmarks.
 */
export const SANDBOX_MAX_360_KIND_COUNTS: Readonly<
  Record<(typeof MAX_360_KINDS)[number], number>
> = Object.freeze({
  bat: 180,
  zombie: 108,
  greenMudman: 48,
  mantis: 12,
  charger: 12,
});

/**
 * One 30-body stratified cycle, repeated twelve times. The mantis and charger
 * slots are fifteen placements apart; because rows are 24 placements wide,
 * the sparse large bodies walk diagonally through the field instead of
 * forming a solid horizontal or vertical band.
 */
const MAX_360_WEIGHTED_CYCLE = Object.freeze([
  'bat', 'bat', 'zombie', 'greenMudman', 'bat', 'zombie',
  'bat', 'mantis', 'bat', 'zombie', 'bat', 'greenMudman',
  'zombie', 'bat', 'bat', 'zombie', 'bat', 'zombie',
  'greenMudman', 'bat', 'bat', 'zombie', 'charger', 'bat',
  'zombie', 'bat', 'greenMudman', 'bat', 'zombie', 'bat',
] as const satisfies readonly (typeof MAX_360_KINDS)[number][]);

export const SANDBOX_MAX_360_VARIANTS: readonly SandboxMax360VariantDefinition[] = Object.freeze([
  Object.freeze({ id: 'a', label: 'MAX360 A', seed: 0x5eed0360, offsetX: 0, offsetY: 0, kindOffset: 0 }),
  Object.freeze({ id: 'b', label: 'MAX360 B', seed: 0x5eed1360, offsetX: 12, offsetY: 7, kindOffset: 1 }),
  Object.freeze({ id: 'c', label: 'MAX360 C', seed: 0x5eed2360, offsetX: -17, offsetY: 11, kindOffset: 2 }),
  Object.freeze({ id: 'd', label: 'MAX360 D', seed: 0x5eed3360, offsetX: 23, offsetY: -13, kindOffset: 3 }),
]);

export const SANDBOX_MAX_360_VARIANT_IDS: readonly SandboxMax360VariantId[] = Object.freeze(
  SANDBOX_MAX_360_VARIANTS.map((variant) => variant.id),
);

function max360Enemies(variant: SandboxMax360VariantDefinition): SandboxPresetEnemy[] {
  return Array.from({ length: 360 }, (_, index): SandboxPresetEnemy => {
    const column = index % 24;
    const row = Math.floor(index / 24);
    return {
      kind: MAX_360_WEIGHTED_CYCLE[
        (index + variant.kindOffset) % MAX_360_WEIGHTED_CYCLE.length
      ] as EnemyKind,
      x: (column - 11.5) * 48 + variant.offsetX,
      y: (row - 7) * 42 + variant.offsetY,
    };
  });
}

const EMPTY_PLAN: SandboxVisualPresetPlan = freezePlan({
  id: 'empty',
  label: 'EMPTY',
  seed: 0xe11e0001,
  minute: 0,
  level: 1,
  freeze: true,
  enemies: [],
  pickups: [],
  choices: [],
});

const MIXED_PLAN: SandboxVisualPresetPlan = freezePlan({
  id: 'mixed',
  label: 'MIXED',
  seed: 0x51ced123,
  minute: 12,
  level: 20,
  freeze: true,
  enemies: [
    { kind: 'bat', x: -250, y: -90 },
    { kind: 'zombie', x: -120, y: 40 },
    { kind: 'greenMudman', x: 30, y: -55 },
    { kind: 'mantis', x: 205, y: 55 },
    { kind: 'glowingBat', x: 160, y: -145, headliner: true },
  ],
  pickups: [
    { kind: 'xp', x: -65, y: 145, value: 3 },
    { kind: 'note', x: 0, y: 145, value: 3 },
    { kind: 'encore', x: 65, y: 145, value: 12 },
  ],
  choices: [
    { id: 'starting-position', mode: 'starting', x: -180, y: -145 },
    { id: 'reward-position-a', mode: 'reward', x: 0, y: -145 },
    { id: 'reward-position-b', mode: 'reward', x: 180, y: -145 },
  ],
});

const MAX_360_PLAN: SandboxVisualPresetPlan = freezePlan({
  id: 'max360',
  label: 'MAX360',
  seed: 0x5eed0360,
  minute: 30,
  level: 40,
  freeze: true,
  enemies: max360Enemies(SANDBOX_MAX_360_VARIANTS[0]),
  pickups: [],
  choices: [],
});

const PRESET_PLANS: Readonly<Record<SandboxVisualPresetId, SandboxVisualPresetPlan>> =
  Object.freeze({
    empty: EMPTY_PLAN,
    mixed: MIXED_PLAN,
    max360: MAX_360_PLAN,
  });

export function sandboxVisualPresetPlan(id: SandboxVisualPresetId): SandboxVisualPresetPlan {
  return PRESET_PLANS[id];
}

const MAX_360_VARIANT_PLANS: Readonly<Record<SandboxMax360VariantId, SandboxVisualPresetPlan>> =
  Object.freeze(Object.fromEntries(SANDBOX_MAX_360_VARIANTS.map((variant) => [
    variant.id,
    variant.id === 'a'
      ? MAX_360_PLAN
      : freezePlan({
          id: 'max360',
          label: variant.label,
          seed: variant.seed,
          minute: 30,
          level: 40,
          freeze: true,
          enemies: max360Enemies(variant),
          pickups: [],
          choices: [],
        }),
  ])) as unknown as Record<SandboxMax360VariantId, SandboxVisualPresetPlan>);

/** Capture-only density variants. Variant A is the standard MAX360 plan by
 * reference; B-D vary only deterministic seed, catalog phase, and fixed visual
 * offsets. Simulation limits and balance remain untouched. */
export function sandboxMax360VariantPlan(id: SandboxMax360VariantId): SandboxVisualPresetPlan {
  return MAX_360_VARIANT_PLANS[id];
}

export function legacyEnemyRenderScale(kind: EnemyKind, headliner: boolean): number {
  if (headliner) return LEGACY_HEADLINER_RENDER_SCALE;
  return kind === 'elite' || kind === 'mantis'
    ? LEGACY_LARGE_ENEMY_RENDER_SCALE
    : LEGACY_ENEMY_RENDER_SCALE;
}

export function legacyActorFrameBounds(
  x: number,
  y: number,
  scale: number,
): DebugRectWorld {
  const width = LEGACY_ATLAS_FRAME_SIZE * scale;
  const height = LEGACY_ATLAS_FRAME_SIZE * scale;
  return Object.freeze({
    x: x - width * LEGACY_ACTOR_ANCHOR.x,
    y: y - height * LEGACY_ACTOR_ANCHOR.y,
    width,
    height,
  });
}

/**
 * Generated from public/art/pixel/frame-stats.json. Each native-pixel box is
 * the union of both actor frames and their horizontal mirrors, so the one
 * simulation snapshot remains truthful even when the renderer changes walk
 * frame or retains its previous facing between fixed steps. The focused check
 * re-derives every entry from the generated JSON and fails if this seam drifts.
 */
export const LEGACY_ACTOR_OPAQUE_UNION_NATIVE: Readonly<
  Record<'player' | EnemyKind, DebugRectWorld>
> = Object.freeze({
  bat: Object.freeze({ x: 31, y: 51, width: 34, height: 41 }),
  batSwarm: Object.freeze({ x: 14, y: 31, width: 68, height: 61 }),
  charger: Object.freeze({ x: 15, y: 23, width: 66, height: 69 }),
  circler: Object.freeze({ x: 21, y: 35, width: 54, height: 57 }),
  darter: Object.freeze({ x: 26, y: 45, width: 44, height: 47 }),
  elite: Object.freeze({ x: 4, y: 9, width: 88, height: 83 }),
  flower: Object.freeze({ x: 18, y: 34, width: 60, height: 58 }),
  ghost: Object.freeze({ x: 30, y: 35, width: 36, height: 57 }),
  glowingBat: Object.freeze({ x: 30, y: 29, width: 36, height: 63 }),
  grayMudman: Object.freeze({ x: 24, y: 25, width: 48, height: 67 }),
  greenMudman: Object.freeze({ x: 23, y: 25, width: 50, height: 67 }),
  mantis: Object.freeze({ x: 4, y: 3, width: 88, height: 89 }),
  redBat: Object.freeze({ x: 28, y: 46, width: 40, height: 46 }),
  redBat2: Object.freeze({ x: 28, y: 41, width: 40, height: 51 }),
  shielded: Object.freeze({ x: 17, y: 23, width: 62, height: 69 }),
  skeleton: Object.freeze({ x: 25, y: 31, width: 46, height: 61 }),
  splitter: Object.freeze({ x: 24, y: 29, width: 48, height: 63 }),
  swarmer: Object.freeze({ x: 35, y: 49, width: 26, height: 43 }),
  tank: Object.freeze({ x: 12, y: 15, width: 72, height: 77 }),
  zombie: Object.freeze({ x: 28, y: 33, width: 40, height: 59 }),
  player: Object.freeze({ x: 13, y: 9, width: 70, height: 83 }),
});

export function legacyActorOpaqueUnionBounds(
  kind: 'player' | EnemyKind,
  x: number,
  y: number,
  scale: number,
): DebugRectWorld {
  const native = LEGACY_ACTOR_OPAQUE_UNION_NATIVE[kind];
  return Object.freeze({
    x: x + (native.x - LEGACY_ATLAS_FRAME_SIZE * LEGACY_ACTOR_ANCHOR.x) * scale,
    y: y + (native.y - LEGACY_ATLAS_FRAME_SIZE * LEGACY_ACTOR_ANCHOR.y) * scale,
    width: native.width * scale,
    height: native.height * scale,
  });
}

export function formatSandboxSeed(seed: number): string {
  return `0x${(seed >>> 0).toString(16).padStart(8, '0')}`;
}

function freezePlan(plan: SandboxVisualPresetPlan): SandboxVisualPresetPlan {
  for (const enemy of plan.enemies) Object.freeze(enemy);
  for (const pickup of plan.pickups) Object.freeze(pickup);
  for (const choice of plan.choices) Object.freeze(choice);
  Object.freeze(plan.enemies);
  Object.freeze(plan.pickups);
  Object.freeze(plan.choices);
  return Object.freeze(plan);
}
