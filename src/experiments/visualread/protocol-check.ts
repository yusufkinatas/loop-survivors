import {
  VISUAL_READ_CATEGORIES,
  VISUAL_READ_SAMPLE_COUNT,
  assertVisualReadPacket,
  playerClickResult,
  randomizedSampleOrder,
  type VisualReadAnswers,
  type VisualReadPacket,
  type VisualReadPublicSample,
} from './protocol';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const visions: readonly VisualReadPublicSample['vision'][] = [
  'normal',
  'grayscale',
  'protanopia',
  'deuteranopia',
  'tritanopia',
];

const player = Array.from({ length: VISUAL_READ_SAMPLE_COUNT }, (_, index) => ({
  id: `player-${index}`,
  image: `/art/pixel/clarity/frames/player-${index}.png`,
  seed: `seed-${index % 4}`,
  offsetS: index * 0.25,
  vision: visions[index % visions.length],
})) satisfies VisualReadPublicSample[];

const category = Array.from({ length: VISUAL_READ_SAMPLE_COUNT }, (_, index) => ({
  id: `category-${index}`,
  image: `/art/pixel/clarity/frames/category-${index}.png`,
  seed: `seed-${index % 4}`,
  offsetS: index * 0.25,
  vision: visions[index % visions.length],
})) satisfies VisualReadPublicSample[];

const packet: VisualReadPacket = {
  schemaVersion: 1,
  commit: 'fixture',
  captureCommand: 'fixture',
  logicalCanvas: { w: 640, h: 360 },
  transform: {
    viewportCss: { w: 1280, h: 720 },
    dpr: 1,
    backingScale: 2,
    worldToLogical: 0.5,
  },
  player,
  category,
};

const answers: VisualReadAnswers = {
  schemaVersion: 1,
  player: Object.fromEntries(player.map(({ id }) => [id, { x: 320, y: 180, radius: 16 }])),
  category: Object.fromEntries(category.map(({ id }, index) => [id, VISUAL_READ_CATEGORIES[index % 6]])),
};

assertVisualReadPacket(packet, answers);
const first = randomizedSampleOrder(player, 'reviewer-a', 'player').map(({ id }) => id);
const second = randomizedSampleOrder(player, 'reviewer-a', 'player').map(({ id }) => id);
const other = randomizedSampleOrder(player, 'reviewer-b', 'player').map(({ id }) => id);
assert(first.join('|') === second.join('|'), 'sample randomization must be deterministic per reviewer');
assert(first.join('|') !== other.join('|'), 'different reviewers must receive different sample order');
assert(new Set(first).size === VISUAL_READ_SAMPLE_COUNT, 'randomization must preserve every sample exactly once');

assert(playerClickResult({ x: 338, y: 180 }, { x: 320, y: 180, radius: 16 }).hit, 'two-pixel tolerance should count');
assert(!playerClickResult({ x: 339, y: 180 }, { x: 320, y: 180, radius: 16 }).hit, 'outside tolerance should miss');

console.log('visual-read protocol checks passed: 40+40 balanced samples, deterministic reviewer order, exact click tolerance');
