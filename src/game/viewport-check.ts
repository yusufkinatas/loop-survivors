// Standalone checks for the fixed logical viewport and world projection.
// Run with: node --import tsx src/game/viewport-check.ts

import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  ViewportTransform,
  WorldProjection,
  WORLD_HEIGHT,
  WORLD_TO_LOGICAL,
  WORLD_WIDTH,
} from './viewport';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`viewport check failed: ${message}`);
}

function near(actual: number, expected: number, message: string, epsilon = 1e-9): void {
  check(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} !== ${expected}`);
}

const expectedScaleAtDpr = new Map([
  [1, 2],
  [1.25, 2],
  [1.5, 3],
  [2, 4],
  [3, 6],
]);

for (const [dpr, expectedBackingScale] of expectedScaleAtDpr) {
  const viewport = new ViewportTransform(1280, 720, dpr);
  check(viewport.supported, `1280 x 720 at DPR ${dpr} should be supported`);
  check(
    viewport.backingScale === expectedBackingScale,
    `DPR ${dpr} selected backing scale ${viewport.backingScale}`,
  );
  near(viewport.cssScale, expectedBackingScale / dpr, `DPR ${dpr} CSS scale`);
  check(Number.isInteger(viewport.backingScale), `DPR ${dpr} backing scale is fractional`);
}

const letterboxed = new ViewportTransform(1280, 720, 1.25);
near(letterboxed.displayCssWidth, 1024, 'fractional-DPR display width');
near(letterboxed.displayCssHeight, 576, 'fractional-DPR display height');
near(letterboxed.offsetCssX, 128, 'fractional-DPR horizontal letterbox');
near(letterboxed.offsetCssY, 72, 'fractional-DPR vertical letterbox');
const logical = letterboxed.clientToLogical(640, 360);
near(logical.x, LOGICAL_WIDTH / 2, 'client-to-logical x');
near(logical.y, LOGICAL_HEIGHT / 2, 'client-to-logical y');
const client = letterboxed.logicalToClient(logical.x, logical.y);
near(client.x, 640, 'logical-to-client x round trip');
near(client.y, 360, 'logical-to-client y round trip');
check(letterboxed.containsClient(128, 72), 'logical surface origin should be inside');
check(!letterboxed.containsClient(127.99, 72), 'left letterbox should be outside');

const canonicalDpr2 = new ViewportTransform(1280, 720, 2);
check(Object.isFrozen(canonicalDpr2), 'viewport transform should be immutable');
near(canonicalDpr2.offsetCssX, 0, 'canonical DPR2 surface left');
near(canonicalDpr2.offsetCssY, 0, 'canonical DPR2 surface top');
near(canonicalDpr2.displayCssWidth, 1280, 'canonical DPR2 surface width');
near(canonicalDpr2.displayCssHeight, 720, 'canonical DPR2 surface height');
check(canonicalDpr2.backingPixelWidth === 2560, 'canonical DPR2 backing width drifted');
check(canonicalDpr2.backingPixelHeight === 1440, 'canonical DPR2 backing height drifted');

const oddLetterbox = new ViewportTransform(1201, 700, 1.25);
near(oddLetterbox.offsetCssX * oddLetterbox.devicePixelRatio, 110, 'physical x origin');
near(oddLetterbox.offsetCssY * oddLetterbox.devicePixelRatio, 77, 'physical y origin');

check(
  new ViewportTransform(2560, 1440, 3).backingScale === 12,
  'high-DPR backing scale was capped',
);
check(
  new ViewportTransform(639, 360, 1).unsupportedReason === 'too-small',
  'narrow CSS viewport should be rejected',
);
check(
  new ViewportTransform(640, 359, 1).unsupportedReason === 'too-small',
  'short CSS viewport should be rejected',
);
check(
  new ViewportTransform(720, 1280, 2).unsupportedReason === 'portrait',
  'portrait viewport should be rejected',
);
check(
  new ViewportTransform(640, 360, 1.25).unsupportedReason === 'non-integer-fit',
  'fractional-DPR viewport below one CSS pixel per logical pixel should be rejected',
);

const projection = new WorldProjection();
check(Object.isFrozen(projection), 'world projection should be immutable');
check(projection.logicalWidth === LOGICAL_WIDTH, 'logical width drifted');
check(projection.logicalHeight === LOGICAL_HEIGHT, 'logical height drifted');
check(projection.worldWidth === WORLD_WIDTH, 'world width drifted');
check(projection.worldHeight === WORLD_HEIGHT, 'world height drifted');
near(projection.worldToLogicalScale, WORLD_TO_LOGICAL, 'world projection scale');

const camera = { x: 100, y: -50 };
const center = projection.worldToLogical(camera.x, camera.y, camera.x, camera.y);
near(center.x, 320, 'camera center x');
near(center.y, 180, 'camera center y');
const topLeft = projection.worldToLogical(
  camera.x - WORLD_WIDTH / 2,
  camera.y - WORLD_HEIGHT / 2,
  camera.x,
  camera.y,
);
near(topLeft.x, 0, 'world extent left edge');
near(topLeft.y, 0, 'world extent top edge');
const worldRoundTrip = projection.logicalToWorld(center.x, center.y, camera.x, camera.y);
near(worldRoundTrip.x, camera.x, 'logical-to-world x round trip');
near(worldRoundTrip.y, camera.y, 'logical-to-world y round trip');
near(projection.snapWorldCoordinate(1.1), 2, 'projected positive snap');
near(projection.snapWorldCoordinate(0.9), 0, 'projected lower snap');
near(projection.worldLengthToLogical(2), 1, 'world length projection');
near(projection.logicalLengthToWorld(1), 2, 'logical length inversion');
const origin = projection.cameraStageOrigin(100, -50, 4, -4);
check(origin.x === 272 && origin.y === 203, 'camera origin should land on logical pixels');

console.log('viewport checks passed');
