import type { SandboxMax360VariantId, SandboxVisualPresetId } from './visual-debug';
import {
  SANDBOX_VISION_MODE_IDS,
  type SandboxVisionMode,
} from './vision-review';

export const LIVE_CAPTURE_TARGET_CLASSES = Object.freeze([
  'enemy',
  'friendly-projectile',
  'xp',
  'music-note',
  'weapon-reward',
  'decorative-effect',
] as const);

export type LiveCaptureTargetClass = (typeof LIVE_CAPTURE_TARGET_CLASSES)[number];

export type LiveCaptureOffsetId = 0 | 1;
export const LIVE_CAPTURE_ANIMATION_FPS = 7;

export interface LiveCaptureVisualPhase {
  readonly id: LiveCaptureOffsetId;
  readonly offsetS: number;
}

/** Two frozen renderer phases: idle and the alternate 7 FPS animation frame. */
export const LIVE_CAPTURE_VISUAL_PHASES: readonly LiveCaptureVisualPhase[] = Object.freeze([
  Object.freeze({ id: 0, offsetS: 0 }),
  Object.freeze({ id: 1, offsetS: 0.2 }),
]);

export function liveCaptureVisualPhase(id: LiveCaptureOffsetId): LiveCaptureVisualPhase {
  return LIVE_CAPTURE_VISUAL_PHASES[id];
}

export const MAX360_CAPTURE_TARGET_IDS: Readonly<Record<LiveCaptureTargetClass, string>> =
  Object.freeze({
    // Keep the sampled enemy away from the player focal stack and every
    // capture-only fixture. It remains a real member of every 360-body plan.
    enemy: 'enemy-248',
    'friendly-projectile': 'friendly-projectile-fixture',
    xp: 'xp-fixture',
    'music-note': 'music-note-fixture',
    'weapon-reward': 'weapon-reward-fixture',
    'decorative-effect': 'decorative-effect-fixture',
  });

export interface Max360CaptureFixture {
  readonly id: string;
  readonly class: Exclude<LiveCaptureTargetClass, 'enemy'>;
  readonly worldX: number;
  readonly worldY: number;
}

/** Real frozen entities added around the central MAX360 melee, not fake labels. */
export const MAX360_CAPTURE_FIXTURES: readonly Max360CaptureFixture[] = Object.freeze([
  Object.freeze({
    id: MAX360_CAPTURE_TARGET_IDS['friendly-projectile'],
    class: 'friendly-projectile',
    worldX: -206,
    worldY: -86,
  }),
  Object.freeze({
    id: MAX360_CAPTURE_TARGET_IDS.xp,
    class: 'xp',
    worldX: -112,
    worldY: 112,
  }),
  Object.freeze({
    id: MAX360_CAPTURE_TARGET_IDS['music-note'],
    class: 'music-note',
    worldX: -24,
    worldY: 126,
  }),
  Object.freeze({
    id: MAX360_CAPTURE_TARGET_IDS['weapon-reward'],
    class: 'weapon-reward',
    worldX: 76,
    worldY: 116,
  }),
  Object.freeze({
    id: MAX360_CAPTURE_TARGET_IDS['decorative-effect'],
    class: 'decorative-effect',
    worldX: 188,
    worldY: -92,
  }),
]);

export interface LiveCaptureLocationLike {
  readonly search?: string;
  readonly hash?: string;
}

export interface LiveCaptureRequest {
  readonly enabled: boolean;
  readonly preset: SandboxVisualPresetId;
  readonly max360Variant: SandboxMax360VariantId;
  readonly offsetId: LiveCaptureOffsetId;
  readonly offsetS: number;
  readonly visionMode: SandboxVisionMode;
  readonly settleFrames: number;
  readonly targetId: string | null;
}

export interface LiveCaptureLogicalTargetLike {
  readonly id: string;
  readonly logicalX: number;
  readonly logicalY: number;
  readonly logicalRadius: number;
}

export interface LiveCaptureBracketSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface LiveCaptureBracketGeometry {
  readonly targetId: string;
  readonly gap: number;
  readonly bounds: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly segments: readonly LiveCaptureBracketSegment[];
}

export const LIVE_CAPTURE_BRACKET_GAP = 4;
export const LIVE_CAPTURE_BRACKET_ARM = 6;

export function selectLiveCaptureTarget<T extends { readonly id: string }>(
  targets: readonly T[],
  requestedId: string | null,
): T | null {
  if (requestedId === null) return null;
  return targets.find(({ id }) => id === requestedId) ?? null;
}

/** Four one-pixel corner marks, wholly outside the declared target core. */
export function liveCaptureBracketGeometry(
  target: LiveCaptureLogicalTargetLike,
): LiveCaptureBracketGeometry {
  const extent = Math.ceil(target.logicalRadius) + LIVE_CAPTURE_BRACKET_GAP;
  const left = target.logicalX - extent;
  const top = target.logicalY - extent;
  const right = target.logicalX + extent;
  const bottom = target.logicalY + extent;
  const arm = Math.min(LIVE_CAPTURE_BRACKET_ARM, extent);
  const segment = (x1: number, y1: number, x2: number, y2: number): LiveCaptureBracketSegment =>
    Object.freeze({ x1, y1, x2, y2 });
  return Object.freeze({
    targetId: target.id,
    gap: LIVE_CAPTURE_BRACKET_GAP,
    bounds: Object.freeze({ left, top, right, bottom }),
    segments: Object.freeze([
      segment(left, top, left + arm, top),
      segment(left, top, left, top + arm),
      segment(right, top, right - arm, top),
      segment(right, top, right, top + arm),
      segment(left, bottom, left + arm, bottom),
      segment(left, bottom, left, bottom - arm),
      segment(right, bottom, right - arm, bottom),
      segment(right, bottom, right, bottom - arm),
    ]),
  });
}

function combinedParams(locationLike?: LiveCaptureLocationLike): URLSearchParams {
  const source = locationLike ?? (
    typeof window === 'undefined'
      ? undefined
      : { search: window.location.search, hash: window.location.hash }
  );
  const output = new URLSearchParams((source?.search ?? '').replace(/^\?/, ''));
  const hash = source?.hash ?? '';
  const queryStart = hash.indexOf('?');
  const hashParams = new URLSearchParams(
    queryStart >= 0 ? hash.slice(queryStart + 1) : hash.replace(/^#/, ''),
  );
  for (const [key, value] of hashParams) if (!output.has(key)) output.set(key, value);
  return output;
}

export function liveCaptureRequest(locationLike?: LiveCaptureLocationLike): LiveCaptureRequest {
  const params = combinedParams(locationLike);
  const presetValue = params.get('preset');
  const preset: SandboxVisualPresetId =
    presetValue === 'empty' || presetValue === 'mixed' || presetValue === 'max360'
      ? presetValue
      : 'max360';
  const variantValue = params.get('variant');
  const max360Variant: SandboxMax360VariantId =
    variantValue === 'b' || variantValue === 'c' || variantValue === 'd' ? variantValue : 'a';
  const requestedFrames = Number(params.get('frame') ?? 2);
  const settleFrames = Number.isFinite(requestedFrames)
    ? Math.max(1, Math.min(120, Math.floor(requestedFrames)))
    : 2;
  const offsetId: LiveCaptureOffsetId = params.get('offset') === '1' ? 1 : 0;
  const phase = liveCaptureVisualPhase(offsetId);
  const visionValue = params.get('vision');
  const visionMode: SandboxVisionMode = SANDBOX_VISION_MODE_IDS.includes(
    visionValue as SandboxVisionMode,
  ) ? visionValue as SandboxVisionMode : 'normal';
  return Object.freeze({
    enabled: params.get('capture') === '1',
    preset,
    max360Variant,
    offsetId,
    offsetS: phase.offsetS,
    visionMode,
    settleFrames,
    targetId: params.get('target'),
  });
}
