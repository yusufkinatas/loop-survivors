// Pure capture metadata assembly shared by the Pixi view and Node checks.
// It reads frozen runtime entities but never advances simulation or rendering.

import { PLAYER_FOOT_OFFSET, type RunWorld } from './run';
import {
  MAX360_CAPTURE_TARGET_IDS,
  liveCaptureBracketGeometry,
  selectLiveCaptureTarget,
  type LiveCaptureBracketGeometry,
  type LiveCaptureOffsetId,
  type LiveCaptureTargetClass,
} from './live-capture';
import type { SandboxVisionMode } from './vision-review';
import { type WorldProjection } from './viewport';

export interface CaptureTargetCandidate {
  readonly id: string;
  readonly class: LiveCaptureTargetClass;
  readonly logicalX: number;
  readonly logicalY: number;
  readonly logicalRadius: number;
}

export interface CaptureMetadataConfiguration {
  readonly offsetId: LiveCaptureOffsetId;
  readonly offsetS: number;
  readonly visionMode: SandboxVisionMode;
  readonly requestedTargetId: string | null;
}

/** Opaque player-art union in simulation-world coordinates. Capture scoring
 * uses this visible body rather than the smaller collision circle so a click
 * on the remembered head or torso is still a truthful player-location hit. */
export interface CapturePlayerVisualWorldBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RunCaptureSceneMetadata {
  readonly seed: number | null;
  readonly timeS: number;
  readonly preset: string | null;
  readonly offsetId: LiveCaptureOffsetId;
  readonly offsetS: number;
  readonly visionMode: SandboxVisionMode;
  readonly requestedTargetId: string | null;
  readonly selectedTarget: CaptureTargetCandidate | null;
  readonly targetBracket: LiveCaptureBracketGeometry | null;
  readonly player: {
    readonly logicalX: number;
    readonly logicalY: number;
    readonly logicalRadius: number;
  };
  readonly targets: readonly CaptureTargetCandidate[];
}

export function captureTargetCandidate(
  projection: WorldProjection,
  cameraX: number,
  cameraY: number,
  id: string,
  captureClass: LiveCaptureTargetClass,
  worldX: number,
  worldY: number,
  worldRadius: number,
): CaptureTargetCandidate | null {
  const logical = projection.worldToLogical(worldX, worldY, cameraX, cameraY);
  const logicalRadius = Math.max(1, projection.worldLengthToLogical(worldRadius));
  if (
    logical.x + logicalRadius < 0 || logical.x - logicalRadius > projection.logicalWidth ||
    logical.y + logicalRadius < 0 || logical.y - logicalRadius > projection.logicalHeight
  ) return null;
  return Object.freeze({
    id,
    class: captureClass,
    logicalX: Math.round(logical.x),
    logicalY: Math.round(logical.y),
    logicalRadius: Math.max(1, Math.round(logicalRadius)),
  });
}

export function worldCaptureTargetCandidates(
  world: RunWorld,
  projection: WorldProjection,
): readonly CaptureTargetCandidate[] {
  const cameraX = world.player.x + PLAYER_FOOT_OFFSET.x;
  const cameraY = world.player.y + PLAYER_FOOT_OFFSET.y;
  const targets: CaptureTargetCandidate[] = [];
  const push = (candidate: CaptureTargetCandidate | null): void => {
    if (candidate) targets.push(candidate);
  };
  for (const enemy of world.enemies) {
    const enemyId = `enemy-${enemy.id}`;
    if (world.sandboxVisualPreset?.id === 'max360' && enemyId !== MAX360_CAPTURE_TARGET_IDS.enemy) {
      continue;
    }
    if (!enemy.dead) push(captureTargetCandidate(
      projection, cameraX, cameraY, enemyId, 'enemy', enemy.x, enemy.y, enemy.radius,
    ));
  }
  for (let index = 0; index < world.projectiles.length; index++) {
    const projectile = world.projectiles[index];
    push(captureTargetCandidate(
      projection,
      cameraX,
      cameraY,
      projectile.captureId ?? `projectile-${index}`,
      'friendly-projectile',
      projectile.x,
      projectile.y,
      projectile.radius,
    ));
  }
  for (let index = 0; index < world.gems.length; index++) {
    const gem = world.gems[index];
    push(captureTargetCandidate(
      projection, cameraX, cameraY, gem.captureId ?? `xp-${index}`, 'xp', gem.x, gem.y, 8,
    ));
  }
  for (let index = 0; index < world.musicNotes.length; index++) {
    const note = world.musicNotes[index];
    push(captureTargetCandidate(
      projection,
      cameraX,
      cameraY,
      note.captureId ?? `music-note-${index}`,
      'music-note',
      note.x,
      note.y,
      10,
    ));
  }
  for (let index = 0; index < world.encoreCases.length; index++) {
    const reward = world.encoreCases[index];
    push(captureTargetCandidate(
      projection,
      cameraX,
      cameraY,
      reward.captureId ?? `weapon-reward-encore-${index}`,
      'weapon-reward',
      reward.x,
      reward.y,
      24,
    ));
  }
  for (let index = 0; index < world.shockwaves.length; index++) {
    const effect = world.shockwaves[index];
    push(captureTargetCandidate(
      projection,
      cameraX,
      cameraY,
      effect.captureId ?? `decorative-shockwave-${index}`,
      'decorative-effect',
      effect.x,
      effect.y,
      Math.max(effect.radius, effect.maxRadius),
    ));
  }
  return Object.freeze(targets);
}

export function buildRunCaptureSceneMetadata(
  world: RunWorld,
  projection: WorldProjection,
  config: CaptureMetadataConfiguration,
  additionalTargets: readonly CaptureTargetCandidate[] = [],
  playerVisualBounds: CapturePlayerVisualWorldBounds | null = null,
): RunCaptureSceneMetadata {
  const cameraX = world.player.x + PLAYER_FOOT_OFFSET.x;
  const cameraY = world.player.y + PLAYER_FOOT_OFFSET.y;
  const targets = Object.freeze([
    ...worldCaptureTargetCandidates(world, projection),
    ...additionalTargets,
  ]);
  const selectedTarget = selectLiveCaptureTarget(targets, config.requestedTargetId);
  const playerWorldX = playerVisualBounds === null
    ? world.player.x
    : playerVisualBounds.x + playerVisualBounds.width / 2;
  const playerWorldY = playerVisualBounds === null
    ? world.player.y
    : playerVisualBounds.y + playerVisualBounds.height / 2;
  const playerWorldRadius = playerVisualBounds === null
    ? world.player.radius
    : Math.hypot(playerVisualBounds.width, playerVisualBounds.height) / 2;
  const player = projection.worldToLogical(playerWorldX, playerWorldY, cameraX, cameraY);
  return Object.freeze({
    seed: world.sandboxVisualPreset?.seed ?? null,
    timeS: world.timeS,
    preset: world.sandboxVisualPreset?.label ?? null,
    offsetId: config.offsetId,
    offsetS: config.offsetS,
    visionMode: config.visionMode,
    requestedTargetId: config.requestedTargetId,
    selectedTarget,
    targetBracket: selectedTarget === null ? null : liveCaptureBracketGeometry(selectedTarget),
    player: Object.freeze({
      logicalX: Math.round(player.x),
      logicalY: Math.round(player.y),
      logicalRadius: Math.max(1, Math.ceil(projection.worldLengthToLogical(playerWorldRadius))),
    }),
    targets,
  });
}
