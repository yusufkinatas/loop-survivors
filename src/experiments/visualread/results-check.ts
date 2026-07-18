import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  VISUAL_READ_REVEAL_MS,
  VISUAL_READ_SAMPLE_COUNT,
  assertVisualReadPacket,
  playerClickResult,
  randomizedSampleOrder,
  type VisualReadAnswers,
  type VisualReadCategory,
  type VisualReadMode,
  type VisualReadPacket,
} from './protocol';

const root = resolve(import.meta.dirname, '../../..');
const packetPath = resolve(root, 'public/art/pixel/clarity/packet.json');
const answersPath = resolve(root, 'public/art/pixel/clarity/answers.json');
const resultsDir = resolve(root, 'docs/visual-evidence/pixelart-overhaul/clarity/results');

interface StoredSampleResult {
  id: string;
  revealMs: number;
  click?: { x: number; y: number; distance: number };
  category?: VisualReadCategory;
  correct: boolean;
}

interface StoredResult {
  schemaVersion: 1;
  commit: string;
  captureCommand: string;
  reviewer: string;
  mode: VisualReadMode;
  completedAt: string;
  revealProtocolMs: number;
  randomizedOrder: string[];
  samples: StoredSampleResult[];
  aggregate: { correct: number; total: number; score: number };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

if (!existsSync(packetPath) || !existsSync(answersPath)) {
  throw new Error('clarity packet is missing; generate packet.json and answers.json before checking results');
}
if (!existsSync(resultsDir)) throw new Error('clarity results directory is missing');

const packet = JSON.parse(readFileSync(packetPath, 'utf8')) as VisualReadPacket;
const answers = JSON.parse(readFileSync(answersPath, 'utf8')) as VisualReadAnswers;
assertVisualReadPacket(packet, answers);

const files = readdirSync(resultsDir).filter((name) => name.endsWith('.json')).sort();
assert(files.length > 0, 'no machine-readable clarity review results found');
const passing = new Map<string, Set<VisualReadMode>>();

for (const file of files) {
  const result = JSON.parse(readFileSync(resolve(resultsDir, file), 'utf8')) as StoredResult;
  assert(result.schemaVersion === 1, `${file}: schema must be 1`);
  assert(result.commit === packet.commit, `${file}: commit does not match the capture packet`);
  assert(result.captureCommand === packet.captureCommand, `${file}: capture command does not match`);
  assert(result.revealProtocolMs === VISUAL_READ_REVEAL_MS, `${file}: reveal protocol is not 500 ms`);
  assert(result.reviewer.trim().length > 0, `${file}: reviewer identity is missing`);
  assert(!Number.isNaN(Date.parse(result.completedAt)), `${file}: completedAt is not an ISO timestamp`);
  assert(result.mode === 'player' || result.mode === 'category', `${file}: invalid mode`);
  const expectedOrder = randomizedSampleOrder(packet[result.mode], result.reviewer, result.mode).map(({ id }) => id);
  assert(result.randomizedOrder.join('|') === expectedOrder.join('|'), `${file}: randomized order is not reproducible`);
  assert(result.samples.length === VISUAL_READ_SAMPLE_COUNT, `${file}: expected 40 sample results`);

  let correct = 0;
  let revealTotal = 0;
  for (let index = 0; index < result.samples.length; index++) {
    const sample = result.samples[index];
    assert(sample.id === expectedOrder[index], `${file}: sample order diverges at ${index}`);
    assert(sample.revealMs >= 480 && sample.revealMs <= 1000, `${file}: ${sample.id} reveal was ${sample.revealMs} ms`);
    revealTotal += sample.revealMs;
    let rescored = false;
    if (result.mode === 'player') {
      assert(sample.click !== undefined, `${file}: ${sample.id} has no click`);
      const scored = playerClickResult(sample.click, answers.player[sample.id]);
      assert(Math.abs(scored.distance - sample.click.distance) < 0.01, `${file}: ${sample.id} distance is stale`);
      rescored = scored.hit;
    } else {
      assert(sample.category !== undefined, `${file}: ${sample.id} has no category answer`);
      rescored = sample.category === answers.category[sample.id];
    }
    assert(sample.correct === rescored, `${file}: ${sample.id} stored score is incorrect`);
    if (rescored) correct += 1;
  }

  const score = correct / VISUAL_READ_SAMPLE_COUNT;
  assert(result.aggregate.correct === correct, `${file}: aggregate correct count is stale`);
  assert(result.aggregate.total === VISUAL_READ_SAMPLE_COUNT, `${file}: aggregate total is stale`);
  assert(Math.abs(result.aggregate.score - score) < 1e-12, `${file}: aggregate score is stale`);
  assert(revealTotal / VISUAL_READ_SAMPLE_COUNT <= 650, `${file}: average reveal exceeded 650 ms`);
  if (score >= 0.95) {
    const reviewerModes = passing.get(result.reviewer) ?? new Set<VisualReadMode>();
    reviewerModes.add(result.mode);
    passing.set(result.reviewer, reviewerModes);
  }
}

const completeReviewers = [...passing].filter(([, modes]) => modes.has('player') && modes.has('category'));
assert(completeReviewers.length >= 3, `need three reviewers passing both packets; got ${completeReviewers.length}`);

console.log(`clarity results passed: ${completeReviewers.length} independent reviewers reached at least 95% on both 40-sample packets`);
