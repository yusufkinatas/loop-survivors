// Dependency-free contracts for Phase 1 visual-truth tooling. Run with:
// node --import tsx src/game/visual-debug-check.ts

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Role } from '../audio/kits';
import { ALL_ENEMY_KINDS, LEVELUP, RUN, type EnemyKind } from './config';
import { EVOLUTIONS } from './items';
import {
  KICK_GEOMETRY,
  PLAYER_FOOT_OFFSET,
  RunWorld,
  type RunEvents,
} from './run';
import { SIM_DT } from './timing';
import { PHYSICAL_FRAME_MAPPINGS } from './visual-catalog';
import {
  PRODUCTION_VISUAL_DEFINITIONS,
  PRODUCTION_VISUAL_KEYS,
  productionWorldUnitsPerNativePixel,
} from './production-visuals';
import { WORLD_TO_LOGICAL, WorldProjection } from './viewport';
import {
  applySandboxVisionMatrixToRgba,
  SANDBOX_VISION_MODE_IDS,
  SANDBOX_VISION_MODES,
} from './vision-review';
import {
  SandboxPerformanceSampler,
  readPixiDrawCalls,
} from './sandbox-performance';
import {
  pixelArtAssetUrls,
  resolvePixelArtMode,
  validatePixelFrameContract,
  type PixelAtlasId,
  type PixelAtlasFrameData,
  type PixelSpritesheetData,
} from './pixel-art';
import {
  LIVE_CAPTURE_BRACKET_GAP,
  LIVE_CAPTURE_ANIMATION_FPS,
  LIVE_CAPTURE_TARGET_CLASSES,
  LIVE_CAPTURE_VISUAL_PHASES,
  MAX360_CAPTURE_FIXTURES,
  MAX360_CAPTURE_TARGET_IDS,
  liveCaptureBracketGeometry,
  liveCaptureRequest,
  selectLiveCaptureTarget,
  type LiveCaptureTargetClass,
} from './live-capture';
import {
  buildRunCaptureSceneMetadata,
  type CaptureMetadataConfiguration,
  type CaptureTargetCandidate,
} from './capture-metadata';
import {
  SANDBOX_MAX_360_KINDS,
  SANDBOX_MAX_360_KIND_COUNTS,
  SANDBOX_MAX_360_VARIANTS,
  SANDBOX_MAX_360_VARIANT_IDS,
  SANDBOX_VISUAL_PRESET_IDS,
  formatSandboxSeed,
  buildDebugNativeActorVisualMetadata,
  sandboxVisualPresetPlan,
  sandboxMax360VariantPlan,
  type SandboxVisualPresetId,
  type DebugActorVisualResolver,
  type DebugNativeActorSourceFrame,
} from './visual-debug';

const silentEvents: RunEvents = {
  onLevelUp: () => undefined,
  onDeath: () => assert.fail('visual fixture must not kill the player'),
  onVictory: () => undefined,
  onHit: () => undefined,
};

function fixtureWorld(): RunWorld {
  const world = new RunWorld(
    { width: 1280, height: 720 },
    silentEvents,
    { scripted: false, fx: false },
  );
  world.invincible = true;
  return world;
}

const productionGameplayPath = fileURLToPath(
  new URL('../../public/art/pixel/gameplay.json', import.meta.url),
);
const productionGameplayData = JSON.parse(
  readFileSync(productionGameplayPath, 'utf8'),
) as PixelSpritesheetData;

const productionActorResolver: DebugActorVisualResolver = (kind: 'player' | EnemyKind) => {
  const prefix = kind === 'player' ? 'actors/player' : `actors/enemies/${kind}`;
  const toSource = (frame: PixelAtlasFrameData | undefined): DebugNativeActorSourceFrame => {
    assert(frame?.nativeSize && frame.pivot && frame.opaqueBounds && frame.groundReference);
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
  };
  return buildDebugNativeActorVisualMetadata(
    [
      toSource(productionGameplayData.frames[`${prefix}/idle`]),
      toSource(productionGameplayData.frames[`${prefix}/walk`]),
    ],
    productionWorldUnitsPerNativePixel(WORLD_TO_LOGICAL),
  );
};

function enemySignature(world: RunWorld): unknown {
  return world.debugGeometrySnapshot(productionActorResolver).actors
    .filter((actor) => actor.id !== 'player')
    .map((actor) => ({
      id: actor.id,
      kind: actor.kind,
      body: actor.hurtBodyWorld,
      pivot: actor.groundPivotWorld,
      frame: actor.frameBoundsWorld,
      opaque: actor.opaqueVisualBoundsWorld,
      headliner: actor.headliner,
      amped: actor.amped,
    }));
}

// Production opaque/pivot metadata is the checked input. Recompute each
// idle/walk/facing union directly from variable native frames; the archived
// Phase 0 frame statistics remain in docs as immutable before evidence.
const actorKinds: readonly ('player' | EnemyKind)[] = ['player', ...ALL_ENEMY_KINDS];
const actorNativeSizes = new Set<string>();
for (const kind of actorKinds) {
  const prefix = kind === 'player' ? 'actors/player' : `actors/enemies/${kind}`;
  const idle = productionGameplayData.frames[`${prefix}/idle`];
  const walk = productionGameplayData.frames[`${prefix}/walk`];
  assert(idle && walk, `${kind} must have idle and walk production frames`);
  assert(idle.nativeSize && walk.nativeSize, `${kind} frames must declare nativeSize`);
  assert.deepEqual(idle.nativeSize, walk.nativeSize, `${kind} animation nativeSize drift`);
  assert.deepEqual(idle.pivot, walk.pivot, `${kind} animation pivot drift`);
  assert(idle.groundReference && walk.groundReference, `${kind} must declare a ground reference`);
  assert(
    idle.groundReference.kind === walk.groundReference.kind &&
      Math.abs(idle.groundReference.x - walk.groundReference.x) <= 1 &&
      Math.abs(idle.groundReference.y - walk.groundReference.y) <= 1,
    `${kind} groundReference drift exceeds one native pixel`,
  );
  actorNativeSizes.add(`${idle.nativeSize.w}x${idle.nativeSize.h}`);
  const metadata = productionActorResolver(kind);
  assert(metadata);
  assert(metadata.opaqueUnion.width > 0 && metadata.opaqueUnion.height > 0);
  assert(metadata.opaqueUnion.x >= 0 && metadata.opaqueUnion.y >= 0);
  assert(metadata.opaqueUnion.x + metadata.opaqueUnion.width <= metadata.nativeWidth);
  assert(metadata.opaqueUnion.y + metadata.opaqueUnion.height <= metadata.nativeHeight);
}
assert(actorNativeSizes.size > 1, 'production actor checks must not assume one uniform cell size');
const archivedFrameStatsPath = fileURLToPath(
  new URL('../../docs/visual-evidence/pixelart-overhaul/baseline/frame-stats.json', import.meta.url),
);
assert(readFileSync(archivedFrameStatsPath, 'utf8').length > 0, 'before-evidence frame stats must remain archived');

assert.deepEqual(SANDBOX_VISUAL_PRESET_IDS, ['empty', 'mixed', 'max360']);
assert.equal(sandboxVisualPresetPlan('empty').label, 'EMPTY');
assert.equal(sandboxVisualPresetPlan('mixed').label, 'MIXED');
assert.equal(sandboxVisualPresetPlan('max360').label, 'MAX360');
assert.equal(formatSandboxSeed(0x5eed), '0x00005eed');

const expectedCounts: Record<SandboxVisualPresetId, number> = {
  empty: 0,
  mixed: 5,
  max360: 360,
};

for (const id of SANDBOX_VISUAL_PRESET_IDS) {
  const plan = sandboxVisualPresetPlan(id);
  assert(Object.isFrozen(plan));
  assert(Object.isFrozen(plan.enemies));
  assert(Object.isFrozen(plan.pickups));
  assert(Object.isFrozen(plan.choices));
  assert.strictEqual(sandboxVisualPresetPlan(id), plan, `${id} plan must be stable`);

  const world = fixtureWorld();
  // Prove a preset clears every transient class before constructing its exact
  // scene, rather than merely drawing a debug-only facsimile over live state.
  world.spawnEnemyAt('bat', 20, 20);
  world.spawnGemAt(30, 30, 1);
  world.spawnMusicNoteAt(40, 40, 1);
  world.spawnEncoreCaseAt(50, 50);
  world.addWeapon('bass', 1);
  world.fireTrigger({ role: 'bass', time: 0, velocity: 1, step: 0 });
  assert(world.projectiles.length > 0);

  const state = world.applySandboxVisualPreset(id);
  const snapshot = world.debugGeometrySnapshot(productionActorResolver);
  assert(Object.isFrozen(state));
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.actors));
  assert(Object.isFrozen(snapshot.actors[0]));
  assert(Object.isFrozen(snapshot.actors[0].hurtBodyWorld));
  assert(Object.isFrozen(snapshot.actors[0].opaqueVisualBoundsWorld));
  assert.equal(state.id, id);
  assert.equal(state.seed, plan.seed);
  assert.equal(state.frozen, true);
  assert.equal(snapshot.preset, state);
  assert.equal(snapshot.timeS, plan.minute * 60);
  assert.equal(world.timeS, plan.minute * 60);
  assert.equal(world.level, plan.level);
  assert.deepEqual(snapshot.actors[0].simulationGroundReferenceWorld, { x: 0, y: 0 });
  assert.equal(world.enemies.length, expectedCounts[id]);
  assert.equal(snapshot.actors.length, expectedCounts[id] + 1);
  assert.deepEqual(
    snapshot.actors.slice(1).map((actor) => actor.id),
    Array.from({ length: expectedCounts[id] }, (_, index) => index + 1),
    `${id} actor IDs must restart at one and remain contiguous`,
  );
  assert.equal(snapshot.projectiles.length, 0);
  assert.equal(snapshot.kickRects.length, 0);
  assert.equal(snapshot.clapShapes.length, 0);
  assert.equal(snapshot.zones.length, 0);
  assert.deepEqual(snapshot.obstacles, []);
  assert.equal(snapshot.obstacleReport, 'none — scenery is decorative and non-colliding');

  const firstSignature = enemySignature(world);
  const frozenTime = world.timeS;
  world.fireTrigger({ role: 'bass', time: 0, velocity: 1, step: 0 });
  world.killVisible();
  world.update(1);
  assert.equal(world.timeS, frozenTime, `${id} capture clock must remain fixed`);
  assert.equal(world.kills, 0, `${id} capture must not register kills`);
  assert.equal(world.projectiles.length, 0, `${id} capture must not fire attacks`);
  assert.deepEqual(enemySignature(world), firstSignature, `${id} capture bodies must not move`);

  const secondState = world.applySandboxVisualPreset(id);
  assert.deepEqual(secondState, state);
  assert.deepEqual(enemySignature(world), firstSignature, `${id} must be idempotent`);
}

const maxPlan = sandboxVisualPresetPlan('max360');
assert.equal(maxPlan.enemies.length, 360);
const expectedMax360KindCounts = Object.freeze({
  bat: 180,
  zombie: 108,
  greenMudman: 48,
  mantis: 12,
  charger: 12,
});
assert.deepEqual(SANDBOX_MAX_360_KIND_COUNTS, expectedMax360KindCounts);
for (const variant of SANDBOX_MAX_360_VARIANTS) {
  const plan = sandboxMax360VariantPlan(variant.id);
  assert.strictEqual(sandboxMax360VariantPlan(variant.id), plan);
  assert.equal(plan.seed, variant.seed);
  assert.equal(plan.enemies.length, 360);
  assert.equal(
    new Set(plan.enemies.map(({ x, y }) => `${x}:${y}`)).size,
    360,
    `MAX360 ${variant.id} placements must be unique`,
  );
  const kindCounts = new Map<string, number>();
  for (const enemy of plan.enemies) {
    kindCounts.set(enemy.kind, (kindCounts.get(enemy.kind) ?? 0) + 1);
  }
  assert.deepEqual(new Set(kindCounts.keys()), new Set(SANDBOX_MAX_360_KINDS));
  for (const kind of SANDBOX_MAX_360_KINDS) {
    assert.equal(
      kindCounts.get(kind),
      expectedMax360KindCounts[kind as keyof typeof expectedMax360KindCounts],
      `MAX360 ${variant.id} has the wrong ${kind} population`,
    );
  }

  const sparseLargeBodies = plan.enemies.filter(
    ({ kind }) => kind === 'mantis' || kind === 'charger',
  );
  for (let first = 0; first < sparseLargeBodies.length; first++) {
    for (let second = first + 1; second < sparseLargeBodies.length; second++) {
      const a = sparseLargeBodies[first];
      const b = sparseLargeBodies[second];
      assert(
        Math.hypot(a.x - b.x, a.y - b.y) > 100,
        `MAX360 ${variant.id} sparse large silhouettes must not form a wall`,
      );
    }
  }
}

const mixed = fixtureWorld();
mixed.applySandboxVisualPreset('mixed');
const mixedSnapshot = mixed.debugGeometrySnapshot(productionActorResolver);
assert.deepEqual(
  mixedSnapshot.actors.slice(1).map((actor) => actor.kind),
  ['bat', 'zombie', 'greenMudman', 'mantis', 'glowingBat'],
  'MIXED must contain flying, humanoid, heavy, boss, and Headliner examples',
);
assert(mixedSnapshot.actors.some((actor) => actor.kind === 'mantis'));
assert(mixedSnapshot.actors.some((actor) => actor.kind === 'glowingBat' && actor.headliner));
assert.deepEqual(mixedSnapshot.pickups.map(({ id, kind }) => ({ id, kind })), [
  { id: 'xp-0', kind: 'xp' },
  { id: 'note-0', kind: 'note' },
  { id: 'encore-0', kind: 'encore' },
]);
assert.deepEqual(mixedSnapshot.pickups.map(({ collectionRadius }) => collectionRadius), [
  RUN.pickupRadius,
  RUN.pickupRadius + 4,
  42,
]);
assert.deepEqual(mixedSnapshot.choices.map(({ id }) => id), [
  'starting-position',
  'reward-position-a',
  'reward-position-b',
]);
assert(mixedSnapshot.choices.some((choice) => choice.mode === 'starting'));
assert(mixedSnapshot.choices.some((choice) => choice.mode === 'reward'));
assert(mixedSnapshot.choices.every((choice) => choice.reachable));
assert(mixedSnapshot.choices.every((choice) => choice.collectionRadius === LEVELUP.itemPickupRadius));

// A live fixture exercises every exported collision shape through production
// weapon/pickup paths. The debug method only copies these live values.
const geometry = fixtureWorld();
geometry.applySandboxVisualPreset('empty');
geometry.resumeSandboxSimulation();
geometry.player.x = 0;
geometry.player.y = 0;
geometry.player.facingX = 1;
const zombie = geometry.spawnEnemyAt('zombie', 200, 0);
assert(zombie);
// Hold this one actor still and alive while attack systems advance; its body
// was still constructed by the production spawn path above.
zombie.speed = 0;
zombie.hp = Number.MAX_SAFE_INTEGER;
zombie.damage = 0;
geometry.spawnGemAt(350, 180, 3);
geometry.spawnMusicNoteAt(-350, 180, 3);
geometry.spawnEncoreCaseAt(0, 250);
geometry.addWeapon('kick', 1);
geometry.addWeapon('clap', 1);
geometry.addWeapon('snare', 1);
geometry.addWeapon('bass', 1);
geometry.addWeapon('chord', 4);
geometry.setItemLevelForSandbox(EVOLUTIONS.afterhours.item, 5);
assert(geometry.evolve('chord'));

const trigger = (role: Role): void => {
  geometry.fireTrigger({ role, time: 0, velocity: 1, step: 0 });
};
trigger('kick');
trigger('clap');
trigger('snare');
trigger('bass');
trigger('chord');
trigger('chord');
geometry.update(SIM_DT);
geometry.update(SIM_DT);

const debug = geometry.debugGeometrySnapshot(productionActorResolver);
const player = debug.actors[0];
const zombieActor = debug.actors.find((actor) => actor.id === zombie.id);
assert(zombieActor);
assert.deepEqual(player.hurtBodyWorld, player.contactBodyWorld);
assert.equal(player.hurtBodyWorld.radius, RUN.playerRadius);
assert.deepEqual(player.simulationGroundReferenceWorld, PLAYER_FOOT_OFFSET);
const playerVisual = productionActorResolver('player')!;
assert.equal(player.frameBoundsWorld.width, playerVisual.nativeWidth * 2);
assert.equal(player.frameBoundsWorld.height, playerVisual.nativeHeight * 2);
assert.equal(player.opaqueVisualBoundsWorld.width, playerVisual.opaqueUnion.width * 2);
assert.equal(player.opaqueVisualBoundsWorld.height, playerVisual.opaqueUnion.height * 2);
assert.equal(player.opaqueBoundsSource, 'production atlas idle/walk/facing union');
assert.equal(zombieActor.hurtBodyWorld.radius, zombie.radius);
assert.deepEqual(zombieActor.hurtBodyWorld, zombieActor.contactBodyWorld);
assert.deepEqual(zombieActor.simulationGroundReferenceWorld, { x: 200, y: 0 });
const zombieVisual = productionActorResolver('zombie')!;
assert.equal(zombieActor.frameBoundsWorld.width, zombieVisual.nativeWidth * 2);
assert.equal(zombieActor.frameBoundsWorld.height, zombieVisual.nativeHeight * 2);

assert.equal(debug.kickRects.length, 1);
assert(debug.kickRects[0].growth > 0 && debug.kickRects[0].growth < 1);
assert.equal(debug.kickRects[0].side, 1);
assert.equal(debug.kickRects[0].rectWorld.x, 0, 'Kick inner edge must stay at the player');
assert(debug.kickRects[0].rectWorld.width > 0);
assert(debug.kickRects[0].rectWorld.width <= KICK_GEOMETRY.baseWidth);
assert.equal(debug.clapShapes.length, 1);
assert.equal(debug.clapShapes[0].pointBlankRadius, 34);
assert(debug.clapShapes[0].reach > 0 && debug.clapShapes[0].halfArc > 0);
const bass = debug.projectiles.find((projectile) => projectile.role === 'bass');
assert(bass, 'Bass must expose its true projectile core');
assert(bass.collisionCoreWorld.radius > 0);
assert(bass.pierce <= bass.maxPierce);
assert.equal(bass.bounces, 0);
assert.equal(debug.zones.length, 1, 'overlapping evolved Chord zones must merge');
assert.equal(debug.zones[0].source, 'chord');
assert.equal(debug.zones[0].evolved, true);
assert.equal(debug.zones[0].mergedCount, 2);
assert(debug.zones[0].radius <= debug.zones[0].mergedCapRadius);
assert.deepEqual(debug.pickups.map(({ kind }) => kind), ['xp', 'note', 'encore']);
assert.equal(debug.playerGemMagnetWorld.radius, RUN.magnetRadius);
assert.equal(debug.playerNoteMagnetWorld.radius, RUN.magnetRadius * 1.15);
assert(Object.isFrozen(debug.projectiles));
assert(Object.isFrozen(debug.projectiles[0]));
assert(Object.isFrozen(debug.zones[0]));
assert(Object.isFrozen(debug.pickups[0]));

// Edge-contact audit: compare the production simulation predicate with the
// independently evaluated native-art projection of that shape. Each live
// shape is projected through the declared 0.5 world-to-native transform, then
// sampled immediately inside and outside its boundary at twelve fixed angles.
// This catches scale, origin, side, arc, and radius drift without changing
// balance or reconstructing values from sprite dimensions.
type EdgeAuditShape =
  | Readonly<{ kind: 'circle'; x: number; y: number; radius: number }>
  | Readonly<{ kind: 'rect'; x: number; y: number; width: number; height: number }>
  | Readonly<{
    kind: 'cone'; x: number; y: number; angle: number; halfArc: number;
    reach: number; pointBlankRadius: number;
  }>;

interface EdgeAuditCategoryResult {
  readonly category: 'actor-bodies' | 'projectiles' | 'kick' | 'clap' | 'bass' | 'chord';
  readonly cases: number;
  readonly apparentFalseHits: number;
  readonly apparentFalseMisses: number;
}

function wrapAngle(value: number): number {
  let result = value;
  while (result > Math.PI) result -= Math.PI * 2;
  while (result < -Math.PI) result += Math.PI * 2;
  return result;
}

function edgeAuditContains(shape: EdgeAuditShape, x: number, y: number): boolean {
  if (shape.kind === 'rect') {
    return x >= shape.x && x <= shape.x + shape.width &&
      y >= shape.y && y <= shape.y + shape.height;
  }
  const dx = x - shape.x;
  const dy = y - shape.y;
  const distance = Math.hypot(dx, dy);
  if (shape.kind === 'circle') return distance <= shape.radius;
  return distance <= shape.pointBlankRadius ||
    (distance <= shape.reach && Math.abs(wrapAngle(Math.atan2(dy, dx) - shape.angle)) <= shape.halfArc);
}

function edgeAuditBoundaryPoint(
  shape: EdgeAuditShape,
  angle: number,
  signedDistance: number,
): Readonly<{ x: number; y: number }> {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  if (shape.kind === 'circle') {
    const radius = Math.max(0, shape.radius + signedDistance);
    return Object.freeze({ x: shape.x + dx * radius, y: shape.y + dy * radius });
  }
  if (shape.kind === 'cone') {
    const withinArc = Math.abs(wrapAngle(angle - shape.angle)) <= shape.halfArc;
    const radius = Math.max(0, (withinArc ? shape.reach : shape.pointBlankRadius) + signedDistance);
    return Object.freeze({ x: shape.x + dx * radius, y: shape.y + dy * radius });
  }
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  const halfWidth = shape.width / 2;
  const halfHeight = shape.height / 2;
  const tx = Math.abs(dx) < 1e-9 ? Infinity : halfWidth / Math.abs(dx);
  const ty = Math.abs(dy) < 1e-9 ? Infinity : halfHeight / Math.abs(dy);
  const radius = Math.max(0, Math.min(tx, ty) + signedDistance);
  return Object.freeze({ x: centerX + dx * radius, y: centerY + dy * radius });
}

function projectEdgeAuditShape(shape: EdgeAuditShape): EdgeAuditShape {
  if (shape.kind === 'circle') return Object.freeze({
    kind: 'circle',
    x: shape.x * WORLD_TO_LOGICAL,
    y: shape.y * WORLD_TO_LOGICAL,
    radius: shape.radius * WORLD_TO_LOGICAL,
  });
  if (shape.kind === 'rect') return Object.freeze({
    kind: 'rect',
    x: shape.x * WORLD_TO_LOGICAL,
    y: shape.y * WORLD_TO_LOGICAL,
    width: shape.width * WORLD_TO_LOGICAL,
    height: shape.height * WORLD_TO_LOGICAL,
  });
  return Object.freeze({
    kind: 'cone',
    x: shape.x * WORLD_TO_LOGICAL,
    y: shape.y * WORLD_TO_LOGICAL,
    angle: shape.angle,
    halfArc: shape.halfArc,
    reach: shape.reach * WORLD_TO_LOGICAL,
    pointBlankRadius: shape.pointBlankRadius * WORLD_TO_LOGICAL,
  });
}

function auditEdgeCategory(
  category: EdgeAuditCategoryResult['category'],
  shape: EdgeAuditShape,
): EdgeAuditCategoryResult {
  const nativeArtProjection = projectEdgeAuditShape(shape);
  let cases = 0;
  let apparentFalseHits = 0;
  let apparentFalseMisses = 0;
  // A quarter native pixel on either side is close enough to expose edge
  // disagreement while remaining deterministic under floating-point math.
  const edgeOffsetWorld = 0.25 / WORLD_TO_LOGICAL;
  for (let sample = 0; sample < 12; sample++) {
    const angle = (sample / 12) * Math.PI * 2;
    for (const signedDistance of [-edgeOffsetWorld, edgeOffsetWorld] as const) {
      const point = edgeAuditBoundaryPoint(shape, angle, signedDistance);
      const simulationHit = edgeAuditContains(shape, point.x, point.y);
      const apparentHit = edgeAuditContains(
        nativeArtProjection,
        point.x * WORLD_TO_LOGICAL,
        point.y * WORLD_TO_LOGICAL,
      );
      cases += 1;
      if (simulationHit && !apparentHit) apparentFalseHits += 1;
      if (!simulationHit && apparentHit) apparentFalseMisses += 1;
    }
  }
  return Object.freeze({ category, cases, apparentFalseHits, apparentFalseMisses });
}

const genericProjectile = debug.projectiles.find((projectile) => projectile.role === 'snare');
assert(genericProjectile, 'generic projectile audit requires a live Snare core');
const kick = debug.kickRects[0];
const clap = debug.clapShapes[0];
const chord = debug.zones[0];
const edgeAudit = Object.freeze([
  auditEdgeCategory('actor-bodies', { kind: 'circle', ...zombieActor.hurtBodyWorld }),
  auditEdgeCategory('projectiles', { kind: 'circle', ...genericProjectile.collisionCoreWorld }),
  auditEdgeCategory('kick', { kind: 'rect', ...kick.rectWorld }),
  auditEdgeCategory('clap', { kind: 'cone', ...clap }),
  auditEdgeCategory('bass', { kind: 'circle', ...bass.collisionCoreWorld }),
  auditEdgeCategory('chord', { kind: 'circle', x: chord.x, y: chord.y, radius: chord.radius }),
]);
const edgeAuditTotals = Object.freeze(edgeAudit.reduce((totals, result) => ({
  cases: totals.cases + result.cases,
  apparentFalseHits: totals.apparentFalseHits + result.apparentFalseHits,
  apparentFalseMisses: totals.apparentFalseMisses + result.apparentFalseMisses,
}), { cases: 0, apparentFalseHits: 0, apparentFalseMisses: 0 }));
assert.equal(edgeAudit.length, 6);
assert(edgeAudit.every((result) => result.cases === 24));
assert(edgeAuditTotals.cases >= 100, 'geometry audit must cover at least 100 deterministic edge contacts');
assert.equal(edgeAuditTotals.apparentFalseHits, 0, 'native art projection introduced apparent false hits');
assert.equal(edgeAuditTotals.apparentFalseMisses, 0, 'native art projection introduced apparent false misses');

// The snapshot must remain a detached historical read after live state moves.
const copiedPlayerX = player.hurtBodyWorld.x;
geometry.player.x += 25;
assert.equal(player.hurtBodyWorld.x, copiedPlayerX);

// Phase 3 production rendering: one centralized entry per physical live frame,
// exact native 1x logical scale, and no fractional Sprite scales in RunView.
const physicalKeys = PHYSICAL_FRAME_MAPPINGS.map((mapping) => mapping.frameKey).sort();
const productionKeys = [...PRODUCTION_VISUAL_KEYS].sort();
assert.equal(new Set(productionKeys).size, productionKeys.length, 'production visual keys must be unique');
assert.deepEqual(productionKeys, physicalKeys, 'native production metadata must cover the full live frame catalog');
assert.equal(PRODUCTION_VISUAL_DEFINITIONS.length, 108);
for (const definition of PRODUCTION_VISUAL_DEFINITIONS) {
  assert.equal(definition.logicalScale, 1, `${definition.key} must render at native logical 1x`);
  assert.equal(definition.pivotSource, 'atlas-native-pivot');
  assert(Object.isFrozen(definition));
}
assert.equal(productionWorldUnitsPerNativePixel(WORLD_TO_LOGICAL), 2);
assert.throws(() => productionWorldUnitsPerNativePixel(0.6), /whole number/);

for (const atlas of ['gameplay', 'ui', 'environment'] as const satisfies readonly PixelAtlasId[]) {
  const atlasPath = fileURLToPath(new URL(`../../public/art/pixel/${atlas}.json`, import.meta.url));
  const data = JSON.parse(readFileSync(atlasPath, 'utf8')) as PixelSpritesheetData;
  const expected = PHYSICAL_FRAME_MAPPINGS
    .filter((mapping) => mapping.atlas === atlas)
    .map((mapping) => mapping.frameKey)
    .sort();
  assert.deepEqual(Object.keys(data.frames).sort(), expected, `${atlas} atlas keys must stay stable`);
  assert.equal(data.meta.direction, 'arcade-reliquary');
  assert.equal(data.meta.rendererScale?.value, 1);
  for (const key of expected) validatePixelFrameContract(data.frames[key], key, atlas, 'production');
}

const viewPath = fileURLToPath(new URL('./view.ts', import.meta.url));
const viewSource = readFileSync(viewPath, 'utf8');
const layerOrderSource = viewSource.slice(
  viewSource.indexOf('this.stage.addChild('),
  viewSource.indexOf('  private syncZones'),
);
assert(
  layerOrderSource.indexOf('this.enemyLayer') < layerOrderSource.indexOf('this.pickupLayer') &&
  layerOrderSource.indexOf('this.pickupLayer') < layerOrderSource.indexOf('this.projectileLayer'),
  'collectibles must render above enemies and below active projectiles',
);
assert(viewSource.includes("this.captureConfig.requestedTargetId === shockwave.captureId"),
  'the high-priority decorative fixture must appear only in its targeted category capture');
const scaleWrites = viewSource.split('\n').filter((line) => line.includes('.scale.set('));
assert.deepEqual(
  scaleWrites.map((line) => line.trim()),
  ['this.stage.scale.set(projection.worldToLogicalScale);'],
  'RunView may only scale the shared world projection; every Sprite uses the native registry',
);
for (const retiredToken of [
  'quantizeScale',
  'PROJECTILE_SCALE',
  'PICKUP_SCALE',
  'LEGACY_PLAYER_RENDER_SCALE',
  'legacyEnemyRenderScale',
]) {
  assert(!viewSource.includes(retiredToken), `RunView must not retain ${retiredToken}`);
}
const bracketMethodSource = viewSource.slice(
  viewSource.indexOf('private syncCaptureTargetBracket'),
  viewSource.indexOf('private syncVisualDebug'),
);
const noTargetGuardIndex = bracketMethodSource.indexOf('requestedTargetId === null');
const noTargetReturnIndex = bracketMethodSource.indexOf('return;', noTargetGuardIndex);
const metadataScanIndex = bracketMethodSource.indexOf('this.captureSceneMetadata()');
assert(
  noTargetGuardIndex >= 0 &&
  noTargetReturnIndex > noTargetGuardIndex &&
  metadataScanIndex > noTargetReturnIndex,
  'normal play must return before capture bracket metadata assembly');
assert(bracketMethodSource.includes('this.captureBracketCache?.preset === preset'),
  'frozen target captures must reuse cached bracket geometry');
assert(viewSource.includes("this.world.sandboxVisualPreset.id === 'max360'"));
assert(viewSource.includes('(moved || sampleFrozenPlayerPhase)'));

const gamePath = fileURLToPath(new URL('./game.ts', import.meta.url));
const gameSource = readFileSync(gamePath, 'utf8');
assert(gameSource.includes("sandboxVisionPngDataUrl(\n      app.canvas,\n      scene.visionMode,\n      LOGICAL_WIDTH,\n      LOGICAL_HEIGHT,"),
  'capture must encode the logical canvas instead of the high-DPI backing buffer');
assert(gameSource.includes('encodedPixelWidth: LOGICAL_WIDTH'));
assert(gameSource.includes('encodedPixelHeight: LOGICAL_HEIGHT'));
const visionReviewPath = fileURLToPath(new URL('./vision-review.ts', import.meta.url));
const visionReviewSource = readFileSync(visionReviewPath, 'utf8');
assert(visionReviewSource.includes('output.width = logicalWidth'));
assert(visionReviewSource.includes('output.height = logicalHeight'));
assert(visionReviewSource.includes('context.imageSmoothingEnabled = false'));
assert(!visionReviewSource.includes("return source.toDataURL('image/png')"),
  'normal captures must also collapse the high-DPI backing buffer');

const hudPath = fileURLToPath(new URL('./hud.ts', import.meta.url));
const hudSource = readFileSync(hudPath, 'utf8');
assert(!hudSource.includes('HUD_PIXEL_ICON_INDEX'));
assert(!hudSource.includes('512px UI atlas'));
assert(!hudSource.includes('background-size: 128px'));
assert(hudSource.includes('pixelIconCssFrame(HUD_PIXEL_ICON_KEYS[id])'));

// The archived art comparison is explicit and never becomes the default.
assert.equal(resolvePixelArtMode({ search: '', hash: '' }), 'production');
assert.equal(resolvePixelArtMode({ search: '?artMode=legacy', hash: '' }), 'legacy');
assert.equal(resolvePixelArtMode({ search: '', hash: '#sandbox?artMode=legacy' }), 'legacy');
assert.equal(pixelArtAssetUrls('production').gameplay, '/art/pixel/gameplay.json');
assert.equal(pixelArtAssetUrls('legacy').gameplay, '/art/pixel/legacy/gameplay.json');

// Whole-surface visual-review modes are a complete, deterministic matrix set.
assert.deepEqual(
  SANDBOX_VISION_MODE_IDS,
  ['normal', 'grayscale', 'protanopia', 'deuteranopia', 'tritanopia'],
);
assert.equal(new Set(SANDBOX_VISION_MODE_IDS).size, SANDBOX_VISION_MODE_IDS.length);
for (const mode of SANDBOX_VISION_MODES) {
  assert.equal(mode.matrix.length, 20, `${mode.id} matrix must be 4x5`);
  assert(mode.matrix.every(Number.isFinite), `${mode.id} matrix must contain finite values`);
  assert.deepEqual(mode.matrix.slice(15), [0, 0, 0, 1, 0], `${mode.id} must preserve alpha`);
  assert(Object.isFrozen(mode));
  assert(Object.isFrozen(mode.matrix));
}

// MAX360 A remains the standard preset; B-D preserve the 360 body count while
// providing distinct fixed offsets, kind phases, and seeds for capture review.
assert.deepEqual(SANDBOX_MAX_360_VARIANT_IDS, ['a', 'b', 'c', 'd']);
assert.equal(new Set(SANDBOX_MAX_360_VARIANTS.map((variant) => variant.seed)).size, 4);
assert.strictEqual(sandboxMax360VariantPlan('a'), sandboxVisualPresetPlan('max360'));
for (const variant of SANDBOX_MAX_360_VARIANTS) {
  const plan = sandboxMax360VariantPlan(variant.id);
  assert.equal(plan.enemies.length, 360);
  assert.equal(plan.seed, variant.seed);
  assert.equal(plan.id, 'max360');
  assert(Object.isFrozen(plan));
}

// Performance aggregates expose their exact rolling inputs and never hand out
// a mutable array. The 1%-low uses the slowest ceil(1%) frame times.
const sampler = new SandboxPerformanceSampler();
sampler.recordFrame(16);
sampler.recordFrame(20);
sampler.recordFrame(100);
const perfContext = Object.freeze({
  drawCalls: readPixiDrawCalls({ stats: { drawCalls: 7 } }),
  atlasTextureBytes: 4096,
  atlasTextureMebibytes: 4096 / (1024 * 1024),
  counts: Object.freeze({
    live: Object.freeze({ enemies: 3 }),
    transient: Object.freeze({ timedEffects: 2 }),
  }),
});
const perf = sampler.snapshot(perfContext);
assert.equal(perf.sampleCount, 3);
assert.equal(perf.medianFps, 50);
assert.equal(perf.onePercentLowFps, 10);
assert.deepEqual(perf.frameTimeMsSamples, [16, 20, 100]);
assert.deepEqual(perf.onePercentLowFrameTimeMsInputs, [100]);
assert.equal(perf.drawCalls.value, 7);
assert(Object.isFrozen(perf));
assert(Object.isFrozen(perf.frameTimeMsSamples));
assert.equal(readPixiDrawCalls({}).value, null);

// Lossless capture configuration is query/hash deterministic and declares the
// full balanced-classification candidate matrix.
assert.deepEqual(LIVE_CAPTURE_TARGET_CLASSES, [
  'enemy',
  'friendly-projectile',
  'xp',
  'music-note',
  'weapon-reward',
  'decorative-effect',
]);
assert.deepEqual(
  liveCaptureRequest({
    search: '?capture=1&preset=max360&variant=c&offset=1&vision=tritanopia&frame=4&target=enemy-180',
  }),
  {
    enabled: true,
    preset: 'max360',
    max360Variant: 'c',
    offsetId: 1,
    offsetS: 0.2,
    visionMode: 'tritanopia',
    settleFrames: 4,
    targetId: 'enemy-180',
  },
);
assert.deepEqual(LIVE_CAPTURE_VISUAL_PHASES.map(({ id }) => id), [0, 1]);
assert.equal(new Set(LIVE_CAPTURE_VISUAL_PHASES.map(({ offsetS }) => offsetS)).size, 2);
assert.deepEqual(
  LIVE_CAPTURE_VISUAL_PHASES.map(({ offsetS }) =>
    Math.floor(offsetS * LIVE_CAPTURE_ANIMATION_FPS) % 2),
  [0, 1],
  'the two fixed offsets must select distinct idle/walk phases',
);
assert.equal(
  SANDBOX_MAX_360_VARIANTS.length * LIVE_CAPTURE_VISUAL_PHASES.length * SANDBOX_VISION_MODE_IDS.length,
  40,
  'four seeds × two offsets × five vision modes must produce 40 player samples',
);
assert.equal(
  new Set(SANDBOX_MAX_360_VARIANTS.map(({ seed }) => seed)).size,
  SANDBOX_MAX_360_VARIANTS.length,
  'each MAX360 variant must use a distinct deterministic seed',
);
assert.equal(MAX360_CAPTURE_FIXTURES.length, 5);
assert.equal(new Set(MAX360_CAPTURE_FIXTURES.map(({ id }) => id)).size, 5);
assert.deepEqual(
  new Set(MAX360_CAPTURE_FIXTURES.map((fixture) => fixture.class)),
  new Set(LIVE_CAPTURE_TARGET_CLASSES.filter((captureClass) => captureClass !== 'enemy')),
);
assert.equal(new Set(Object.values(MAX360_CAPTURE_TARGET_IDS)).size, LIVE_CAPTURE_TARGET_CLASSES.length);

const defaultCaptureRequest = liveCaptureRequest({ search: '?capture=0&offset=7&vision=unknown' });
assert.equal(defaultCaptureRequest.enabled, false);
assert.equal(defaultCaptureRequest.offsetId, 0);
assert.equal(defaultCaptureRequest.offsetS, 0);
assert.equal(defaultCaptureRequest.visionMode, 'normal');

// The byte path used by the PNG exporter must match the same deterministic
// matrices as the on-screen SVG filter and preserve alpha.
const normalRgba = new Uint8ClampedArray([20, 80, 140, 173]);
applySandboxVisionMatrixToRgba(normalRgba, 'normal');
assert.deepEqual([...normalRgba], [20, 80, 140, 173]);
const grayscaleRgba = new Uint8ClampedArray([20, 80, 140, 173]);
applySandboxVisionMatrixToRgba(grayscaleRgba, 'grayscale');
assert.equal(grayscaleRgba[0], grayscaleRgba[1]);
assert.equal(grayscaleRgba[1], grayscaleRgba[2]);
assert.equal(grayscaleRgba[3], 173);
for (const mode of SANDBOX_VISION_MODE_IDS) {
  const first = new Uint8ClampedArray([31, 97, 211, 149]);
  const second = new Uint8ClampedArray(first);
  applySandboxVisionMatrixToRgba(first, mode);
  applySandboxVisionMatrixToRgba(second, mode);
  assert.deepEqual(first, second, `${mode} PNG matrix must be deterministic`);
  assert.equal(first[3], 149, `${mode} PNG matrix must preserve alpha`);
}

const captureProjection = new WorldProjection();
const playerSamples: unknown[] = [];
for (const variant of SANDBOX_MAX_360_VARIANTS) {
  const captureWorld = fixtureWorld();
  const captureState = captureWorld.applySandboxMax360Variant(variant.id, true);
  assert.equal(captureState.seed, variant.seed);
  assert.equal(captureState.frozen, true);
  assert.equal(captureWorld.enemies.length, 360, `${variant.id} capture must preserve MAX360`);
  assert.equal(captureWorld.projectiles.length, 1);
  assert.equal(captureWorld.gems.length, 1);
  assert.equal(captureWorld.musicNotes.length, 1);
  assert.equal(captureWorld.encoreCases.length, 1);
  assert.equal(captureWorld.shockwaves.length, 1);
  const liveKindCounts = new Map<string, number>();
  for (const enemy of captureWorld.enemies) {
    liveKindCounts.set(enemy.kind, (liveKindCounts.get(enemy.kind) ?? 0) + 1);
  }
  for (const kind of SANDBOX_MAX_360_KINDS) {
    assert.equal(
      liveKindCounts.get(kind),
      expectedMax360KindCounts[kind as keyof typeof expectedMax360KindCounts],
      `${variant.id} live capture has the wrong ${kind} population`,
    );
  }

  const captureFixtureBytes = (): string => JSON.stringify(
    {
      enemies: enemySignature(captureWorld),
      projectile: captureWorld.projectiles,
      xp: captureWorld.gems,
      notes: captureWorld.musicNotes,
      rewards: captureWorld.encoreCases,
      effects: captureWorld.shockwaves.map(({ hit: _hit, ...effect }) => effect),
    },
    (_key, value) => value instanceof Set ? [...value] : value,
  );
  const frozenFixtureSignature = captureFixtureBytes();
  captureWorld.update(5);
  assert.equal(captureWorld.timeS, 30 * 60);
  assert.equal(captureFixtureBytes(), frozenFixtureSignature);
  assert.deepEqual(captureWorld.applySandboxMax360Variant(variant.id, true), captureState);
  assert.equal(
    captureFixtureBytes(),
    frozenFixtureSignature,
    `${variant.id} capture reconstruction must be byte-deterministic`,
  );

  for (const phase of LIVE_CAPTURE_VISUAL_PHASES) {
    for (const visionMode of SANDBOX_VISION_MODE_IDS) {
      const config: CaptureMetadataConfiguration = Object.freeze({
        offsetId: phase.id,
        offsetS: phase.offsetS,
        visionMode,
        requestedTargetId: MAX360_CAPTURE_TARGET_IDS.enemy,
      });
      const metadata = buildRunCaptureSceneMetadata(captureWorld, captureProjection, config);
      assert.deepEqual(
        buildRunCaptureSceneMetadata(captureWorld, captureProjection, config),
        metadata,
        `${variant.id}/${phase.id}/${visionMode} metadata must be deterministic`,
      );
      assert.equal(metadata.seed, variant.seed);
      assert.equal(metadata.offsetS, phase.offsetS);
      assert.equal(metadata.visionMode, visionMode);
      assert.equal(metadata.targets.length, LIVE_CAPTURE_TARGET_CLASSES.length);
      assert.deepEqual(
        new Set(metadata.targets.map((target) => target.class)),
        new Set(LIVE_CAPTURE_TARGET_CLASSES),
        `${variant.id} must expose one target from every balanced class`,
      );
      playerSamples.push(metadata.player);
    }
  }

  const baseMetadata = buildRunCaptureSceneMetadata(captureWorld, captureProjection, {
    offsetId: 0,
    offsetS: 0,
    visionMode: 'normal',
    requestedTargetId: null,
  });
  const visiblePlayerMetadata = buildRunCaptureSceneMetadata(
    captureWorld,
    captureProjection,
    {
      offsetId: 0,
      offsetS: 0,
      visionMode: 'normal',
      requestedTargetId: null,
    },
    [],
    {
      x: captureWorld.player.x - 30,
      y: captureWorld.player.y - 60,
      width: 60,
      height: 80,
    },
  );
  assert.equal(visiblePlayerMetadata.player.logicalRadius, 25);
  assert.equal(
    visiblePlayerMetadata.player.logicalY,
    Math.round(captureProjection.worldToLogical(
      captureWorld.player.x,
      captureWorld.player.y - 20,
      captureWorld.player.x + PLAYER_FOOT_OFFSET.x,
      captureWorld.player.y + PLAYER_FOOT_OFFSET.y,
    ).y),
  );
  for (const captureClass of LIVE_CAPTURE_TARGET_CLASSES as readonly LiveCaptureTargetClass[]) {
    const targetId: string = MAX360_CAPTURE_TARGET_IDS[captureClass];
    const selected: CaptureTargetCandidate | null = selectLiveCaptureTarget(
      baseMetadata.targets,
      targetId,
    );
    assert(selected, `${variant.id} is missing ${captureClass} fixture ${targetId}`);
    assert.equal(selected.class, captureClass);
    const bracket = liveCaptureBracketGeometry(selected);
    assert.equal(bracket.targetId, targetId);
    assert.equal(bracket.gap, LIVE_CAPTURE_BRACKET_GAP);
    assert.equal(bracket.segments.length, 8);
    assert(bracket.bounds.left <= selected.logicalX - selected.logicalRadius - LIVE_CAPTURE_BRACKET_GAP);
    assert(bracket.bounds.right >= selected.logicalX + selected.logicalRadius + LIVE_CAPTURE_BRACKET_GAP);
    assert(bracket.bounds.top <= selected.logicalY - selected.logicalRadius - LIVE_CAPTURE_BRACKET_GAP);
    assert(bracket.bounds.bottom >= selected.logicalY + selected.logicalRadius + LIVE_CAPTURE_BRACKET_GAP);
    for (const other of baseMetadata.targets) {
      if (other.id === selected.id) continue;
      assert(
        Math.hypot(other.logicalX - selected.logicalX, other.logicalY - selected.logicalY) >=
          selected.logicalRadius + other.logicalRadius + LIVE_CAPTURE_BRACKET_GAP * 2,
        `${targetId} highlight must not contain or touch ${other.id}`,
      );
    }
    for (const segment of bracket.segments) {
      for (const point of [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }]) {
        assert(
          Math.hypot(point.x - selected.logicalX, point.y - selected.logicalY) > selected.logicalRadius,
          `${targetId} bracket must remain outside its target core`,
        );
      }
    }
  }
  const selectedMetadata = buildRunCaptureSceneMetadata(captureWorld, captureProjection, {
    offsetId: 1,
    offsetS: 0.2,
    visionMode: 'deuteranopia',
    requestedTargetId: MAX360_CAPTURE_TARGET_IDS['friendly-projectile'],
  });
  assert.equal(selectedMetadata.selectedTarget?.id, MAX360_CAPTURE_TARGET_IDS['friendly-projectile']);
  assert.equal(selectedMetadata.targetBracket?.targetId, MAX360_CAPTURE_TARGET_IDS['friendly-projectile']);
  assert.equal(selectedMetadata.offsetS, 0.2);
  assert.equal(selectedMetadata.visionMode, 'deuteranopia');
}
assert.equal(playerSamples.length, 40);

console.log(
  `geometry-edge-audit: ${edgeAuditTotals.cases} deterministic cases · ` +
  `apparent false hits ${edgeAuditTotals.apparentFalseHits} · ` +
  `apparent false misses ${edgeAuditTotals.apparentFalseMisses}`,
);
console.log('visual-debug-check: native catalog, matrices, capture, performance, and geometry passed');
