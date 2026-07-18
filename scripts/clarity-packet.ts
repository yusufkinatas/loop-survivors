#!/usr/bin/env node

/**
 * Deterministic builder for the two blind visual-read packets.
 *
 * Browser automation remains deliberately outside this script. `plan` emits
 * the exact capture URLs and raw-file destinations; `assemble` validates those
 * browser-produced PNG/metadata pairs before publishing generic frame IDs.
 *
 * Usage:
 *   npm run clarity:plan
 *   npm run clarity:assemble -- --commit <git-hash>
 *   npm run clarity:check
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LIVE_CAPTURE_TARGET_CLASSES,
  LIVE_CAPTURE_VISUAL_PHASES,
  MAX360_CAPTURE_TARGET_IDS,
  type LiveCaptureOffsetId,
  type LiveCaptureTargetClass,
} from '../src/game/live-capture';
import {
  SANDBOX_MAX_360_VARIANTS,
  type SandboxMax360VariantId,
} from '../src/game/visual-debug';
import {
  SANDBOX_VISION_MODE_IDS,
  type SandboxVisionMode,
} from '../src/game/vision-review';
import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  ViewportTransform,
  WORLD_TO_LOGICAL,
} from '../src/game/viewport';
import {
  VISUAL_READ_CATEGORIES,
  VISUAL_READ_SAMPLE_COUNT,
  assertVisualReadPacket,
  type VisualReadAnswers,
  type VisualReadCategory,
  type VisualReadPacket,
  type VisualReadPublicSample,
} from '../src/experiments/visualread/protocol';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAPTURE_ROOT = 'art-src/pixel-production/clarity-captures';
const CAPTURE_PLAN_PATH = `${CAPTURE_ROOT}/capture-plan.json`;
const RAW_CAPTURE_ROOT = `${CAPTURE_ROOT}/raw`;
const PUBLIC_ROOT = 'public/art/pixel/clarity';
const PUBLIC_FRAME_ROOT = `${PUBLIC_ROOT}/frames`;
const PACKET_PATH = `${PUBLIC_ROOT}/packet.json`;
const ANSWERS_PATH = `${PUBLIC_ROOT}/answers.json`;
const DEFAULT_BASE_URL = 'http://127.0.0.1:3201/';
const DEFAULT_SETTLE_FRAMES = 4;
const CAPTURE_VIEWPORT = Object.freeze({ width: 1280, height: 720, dpr: 2 });
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

type CaptureMode = 'player' | 'category';

interface CapturePlanSample {
  readonly id: string;
  readonly mode: CaptureMode;
  readonly variant: SandboxMax360VariantId;
  readonly presetLabel: string;
  readonly seed: number;
  readonly offsetId: LiveCaptureOffsetId;
  readonly offsetS: number;
  readonly vision: SandboxVisionMode;
  readonly targetId: string | null;
  readonly targetClass: LiveCaptureTargetClass | null;
  readonly url: string;
  readonly pngInput: string;
  readonly metadataInput: string;
}

interface CapturePlan {
  readonly schemaVersion: 1;
  readonly protocol: 'loop-survivors-clarity-v1';
  readonly captureCommand: string;
  readonly baseUrl: string;
  readonly settleFrames: number;
  readonly preset: 'max360';
  readonly logicalCanvas: { readonly width: 640; readonly height: 360 };
  readonly transform: {
    readonly viewportCss: { readonly w: number; readonly h: number };
    readonly dpr: number;
    readonly backingScale: number;
    readonly worldToLogical: number;
  };
  readonly rawCaptureRoot: string;
  readonly player: readonly CapturePlanSample[];
  readonly category: readonly CapturePlanSample[];
}

interface CliOptions {
  readonly command: 'plan' | 'assemble' | 'check';
  readonly baseUrl: string;
  readonly settleFrames: number;
  readonly commit: string | null;
}

interface PngInspection {
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
}

interface ValidatedCapture {
  readonly plan: CapturePlanSample;
  readonly png: Buffer;
  readonly pngInspection: PngInspection;
  readonly playerAnswer: { readonly x: number; readonly y: number; readonly radius: number };
  readonly categoryAnswer: VisualReadCategory | null;
}

type JsonRecord = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function codeUnitSort(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parsePositiveInteger(raw: string, label: string): number {
  const value = Number(raw);
  assert(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
  return value;
}

function normalizeBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`--base-url is not a valid absolute URL: ${JSON.stringify(raw)}`);
  }
  assert(parsed.protocol === 'http:' || parsed.protocol === 'https:', '--base-url must use http or https');
  parsed.hash = '';
  parsed.search = '';
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.toString();
}

function optionValue(args: string[], index: number, option: string): { value: string; consumed: number } | null {
  const argument = args[index];
  if (argument === option) {
    const value = args[index + 1];
    assert(value !== undefined && !value.startsWith('--'), `${option} requires a value`);
    return { value, consumed: 2 };
  }
  const prefix = `${option}=`;
  if (argument.startsWith(prefix)) return { value: argument.slice(prefix.length), consumed: 1 };
  return null;
}

function parseCli(args: string[]): CliOptions {
  const [commandValue, ...rest] = args;
  assert(
    commandValue === 'plan' || commandValue === 'assemble' || commandValue === 'check',
    'usage: clarity-packet.ts <plan|assemble|check> [--base-url URL] [--settle-frames N] [--commit HASH]',
  );
  let baseUrl = DEFAULT_BASE_URL;
  let settleFrames = DEFAULT_SETTLE_FRAMES;
  let commit: string | null = null;
  for (let index = 0; index < rest.length;) {
    const baseUrlOption = optionValue(rest, index, '--base-url');
    if (baseUrlOption) {
      baseUrl = baseUrlOption.value;
      index += baseUrlOption.consumed;
      continue;
    }
    const settleOption = optionValue(rest, index, '--settle-frames');
    if (settleOption) {
      settleFrames = parsePositiveInteger(settleOption.value, '--settle-frames');
      index += settleOption.consumed;
      continue;
    }
    const commitOption = optionValue(rest, index, '--commit');
    if (commitOption) {
      commit = commitOption.value;
      index += commitOption.consumed;
      continue;
    }
    throw new Error(`unknown argument ${JSON.stringify(rest[index])}`);
  }
  assert(settleFrames <= 120, '--settle-frames cannot exceed the runtime capture limit of 120');
  if (commandValue !== 'assemble') assert(commit === null, '--commit is only valid with assemble');
  return {
    command: commandValue,
    baseUrl: normalizeBaseUrl(baseUrl),
    settleFrames,
    commit,
  };
}

function captureUrl(
  baseUrl: string,
  settleFrames: number,
  variant: SandboxMax360VariantId,
  offsetId: LiveCaptureOffsetId,
  vision: SandboxVisionMode,
  targetId: string | null,
): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('capture', '1');
  url.searchParams.set('preset', 'max360');
  url.searchParams.set('variant', variant);
  url.searchParams.set('offset', String(offsetId));
  url.searchParams.set('vision', vision);
  url.searchParams.set('frame', String(settleFrames));
  if (targetId !== null) url.searchParams.set('target', targetId);
  return url.toString();
}

function captureCommand(baseUrl: string, settleFrames: number): string {
  return `npm run clarity:plan -- --base-url=${baseUrl} --settle-frames=${settleFrames}`;
}

function matrixSamples(): Array<{
  variant: (typeof SANDBOX_MAX_360_VARIANTS)[number];
  offset: (typeof LIVE_CAPTURE_VISUAL_PHASES)[number];
  vision: SandboxVisionMode;
}> {
  const samples = [];
  for (const variant of SANDBOX_MAX_360_VARIANTS) {
    for (const offset of LIVE_CAPTURE_VISUAL_PHASES) {
      for (const vision of SANDBOX_VISION_MODE_IDS) samples.push({ variant, offset, vision });
    }
  }
  return samples;
}

function planSample(
  mode: CaptureMode,
  index: number,
  baseUrl: string,
  settleFrames: number,
  matrix: ReturnType<typeof matrixSamples>[number],
  targetClass: LiveCaptureTargetClass | null,
): CapturePlanSample {
  const id = `${mode}-${String(index + 1).padStart(3, '0')}`;
  const targetId = targetClass === null ? null : MAX360_CAPTURE_TARGET_IDS[targetClass];
  return Object.freeze({
    id,
    mode,
    variant: matrix.variant.id,
    presetLabel: matrix.variant.id === 'a' ? 'MAX360' : matrix.variant.label,
    seed: matrix.variant.seed >>> 0,
    offsetId: matrix.offset.id,
    offsetS: matrix.offset.offsetS,
    vision: matrix.vision,
    targetId,
    targetClass,
    url: captureUrl(baseUrl, settleFrames, matrix.variant.id, matrix.offset.id, matrix.vision, targetId),
    pngInput: `${RAW_CAPTURE_ROOT}/${id}.png`,
    metadataInput: `${RAW_CAPTURE_ROOT}/${id}.metadata.json`,
  });
}

function buildCapturePlan(baseUrl: string, settleFrames: number): CapturePlan {
  const matrix = matrixSamples();
  const viewport = new ViewportTransform(
    CAPTURE_VIEWPORT.width,
    CAPTURE_VIEWPORT.height,
    CAPTURE_VIEWPORT.dpr,
  );
  assert(viewport.supported, 'standard clarity capture viewport must be supported');
  const player = matrix.map((sample, index) =>
    planSample('player', index, baseUrl, settleFrames, sample, null));
  const category = matrix.map((sample, index) =>
    planSample(
      'category',
      index,
      baseUrl,
      settleFrames,
      sample,
      LIVE_CAPTURE_TARGET_CLASSES[index % LIVE_CAPTURE_TARGET_CLASSES.length],
    ));
  const plan: CapturePlan = {
    schemaVersion: 1,
    protocol: 'loop-survivors-clarity-v1',
    captureCommand: captureCommand(baseUrl, settleFrames),
    baseUrl,
    settleFrames,
    preset: 'max360',
    logicalCanvas: { width: LOGICAL_WIDTH, height: LOGICAL_HEIGHT },
    transform: {
      viewportCss: { w: CAPTURE_VIEWPORT.width, h: CAPTURE_VIEWPORT.height },
      dpr: CAPTURE_VIEWPORT.dpr,
      backingScale: viewport.backingScale,
      worldToLogical: WORLD_TO_LOGICAL,
    },
    rawCaptureRoot: RAW_CAPTURE_ROOT,
    player,
    category,
  };
  validateCapturePlan(plan);
  return plan;
}

function matrixKey(sample: CapturePlanSample): string {
  return `${sample.variant}/${sample.offsetId}/${sample.vision}`;
}

function exactCounts<T extends string | number>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function validateCapturePlan(plan: CapturePlan): void {
  assert(plan.schemaVersion === 1, 'capture plan schema must be version 1');
  assert(plan.protocol === 'loop-survivors-clarity-v1', 'capture plan protocol is invalid');
  assert(plan.logicalCanvas.width === 640 && plan.logicalCanvas.height === 360,
    'capture plan must use the 640 x 360 logical canvas');
  assert(plan.settleFrames >= 1 && plan.settleFrames <= 120, 'capture plan settleFrames is invalid');
  assert(plan.transform.viewportCss.w === 1280 && plan.transform.viewportCss.h === 720,
    'clarity capture viewport must be 1280 x 720 CSS pixels');
  assert(plan.transform.dpr === 2, 'clarity capture DPR must be 2');
  assert(plan.transform.backingScale === 4, 'clarity capture backing scale must be 4');
  assert(plan.transform.worldToLogical === 0.5, 'clarity world projection must be 0.5');
  assert(plan.player.length === VISUAL_READ_SAMPLE_COUNT, 'player capture plan must contain exactly 40 samples');
  assert(plan.category.length === VISUAL_READ_SAMPLE_COUNT, 'category capture plan must contain exactly 40 samples');
  assert(jsonText(VISUAL_READ_CATEGORIES) === jsonText(LIVE_CAPTURE_TARGET_CLASSES),
    'visual-read categories and live capture target classes must stay in the same order');

  const expectedMatrix = new Set(matrixSamples().map((sample) =>
    `${sample.variant.id}/${sample.offset.id}/${sample.vision}`));
  for (const mode of ['player', 'category'] as const) {
    const samples = plan[mode];
    assert(new Set(samples.map(({ id }) => id)).size === 40, `${mode} plan has duplicate IDs`);
    assert(new Set(samples.map(({ url }) => url)).size === 40, `${mode} plan has duplicate URLs`);
    assert(new Set(samples.map(matrixKey)).size === 40, `${mode} plan must contain each matrix cell once`);
    assert(samples.every((sample) => expectedMatrix.has(matrixKey(sample))), `${mode} plan has an unknown matrix cell`);
    const seedCounts = exactCounts(samples.map(({ seed }) => seed));
    assert(seedCounts.size === 4 && [...seedCounts.values()].every((count) => count === 10),
      `${mode} plan must use four seeds exactly 10 times each`);
    const offsetCounts = exactCounts(samples.map(({ offsetId }) => offsetId));
    assert(offsetCounts.size === 2 && [...offsetCounts.values()].every((count) => count === 20),
      `${mode} plan must use each offset exactly 20 times`);
    const visionCounts = exactCounts(samples.map(({ vision }) => vision));
    assert(visionCounts.size === 5 && [...visionCounts.values()].every((count) => count === 8),
      `${mode} plan must use each vision mode exactly eight times`);
  }

  assert(plan.player.every(({ targetId, targetClass }) => targetId === null && targetClass === null),
    'player captures must not contain a classification bracket');
  const classCounts = exactCounts(plan.category.map(({ targetClass }) => {
    assert(targetClass !== null, 'category capture is missing its target class');
    return targetClass;
  }));
  const expectedClassCounts: Readonly<Record<LiveCaptureTargetClass, number>> = {
    enemy: 7,
    'friendly-projectile': 7,
    xp: 7,
    'music-note': 7,
    'weapon-reward': 6,
    'decorative-effect': 6,
  };
  for (const captureClass of LIVE_CAPTURE_TARGET_CLASSES) {
    assert(classCounts.get(captureClass) === expectedClassCounts[captureClass],
      `category plan must contain ${expectedClassCounts[captureClass]} ${captureClass} samples`);
  }
  assert(plan.category.every(({ targetId, targetClass }) =>
    targetClass !== null && targetId === MAX360_CAPTURE_TARGET_IDS[targetClass]),
  'category capture plan must use the registered real MAX360 target IDs');
  assert(new Set([...plan.player, ...plan.category].map(({ id }) => id)).size === 80,
    'public sample IDs must be globally unique');
}

function readCapturePlan(): CapturePlan {
  const path = resolve(REPO_ROOT, CAPTURE_PLAN_PATH);
  assert(existsSync(path), `${CAPTURE_PLAN_PATH} is missing; run npm run clarity:plan`);
  const plan = JSON.parse(readFileSync(path, 'utf8')) as CapturePlan;
  validateCapturePlan(plan);
  const expected = buildCapturePlan(normalizeBaseUrl(plan.baseUrl), plan.settleFrames);
  assert(jsonText(plan) === jsonText(expected), `${CAPTURE_PLAN_PATH} is stale or nondeterministic; regenerate it`);
  return plan;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(encoded: Buffer, label: string): PngInspection {
  assert(encoded.length >= 33 && encoded.subarray(0, 8).equals(PNG_SIGNATURE), `${label}: invalid PNG signature`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let chunkIndex = 0;
  let sawIdat = false;
  let sawIend = false;
  while (offset < encoded.length) {
    assert(offset + 12 <= encoded.length, `${label}: truncated PNG chunk header`);
    const length = encoded.readUInt32BE(offset);
    const typeStart = offset + 4;
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    const crcOffset = payloadEnd;
    assert(crcOffset + 4 <= encoded.length, `${label}: truncated PNG chunk payload`);
    const type = encoded.toString('ascii', typeStart, payloadStart);
    const expectedCrc = encoded.readUInt32BE(crcOffset);
    const actualCrc = crc32(encoded.subarray(typeStart, payloadEnd));
    assert(actualCrc === expectedCrc, `${label}: ${type} chunk CRC mismatch`);
    if (chunkIndex === 0) {
      assert(type === 'IHDR' && length === 13, `${label}: first PNG chunk must be IHDR`);
      width = encoded.readUInt32BE(payloadStart);
      height = encoded.readUInt32BE(payloadStart + 4);
    }
    if (type === 'IDAT') sawIdat = true;
    if (type === 'IEND') {
      assert(length === 0, `${label}: IEND must be empty`);
      sawIend = true;
      offset = crcOffset + 4;
      break;
    }
    offset = crcOffset + 4;
    chunkIndex += 1;
  }
  assert(sawIdat, `${label}: PNG has no IDAT payload`);
  assert(sawIend, `${label}: PNG has no IEND chunk`);
  assert(offset === encoded.length, `${label}: PNG contains trailing bytes after IEND`);
  assert(width === LOGICAL_WIDTH && height === LOGICAL_HEIGHT,
    `${label}: expected exact 640 x 360 PNG, got ${width} x ${height}`);
  return {
    width,
    height,
    sha256: createHash('sha256').update(encoded).digest('hex'),
  };
}

function record(value: unknown, label: string): JsonRecord {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function numberField(source: JsonRecord, key: string, label: string): number {
  const value = source[key];
  assert(typeof value === 'number' && Number.isFinite(value), `${label}.${key} must be a finite number`);
  return value;
}

function stringField(source: JsonRecord, key: string, label: string): string {
  const value = source[key];
  assert(typeof value === 'string', `${label}.${key} must be a string`);
  return value;
}

function validateLogicalCircle(value: unknown, label: string): { x: number; y: number; radius: number } {
  const circle = record(value, label);
  const x = numberField(circle, 'logicalX', label);
  const y = numberField(circle, 'logicalY', label);
  const radius = numberField(circle, 'logicalRadius', label);
  assert(x >= 0 && x < LOGICAL_WIDTH && y >= 0 && y < LOGICAL_HEIGHT, `${label} center is outside the logical canvas`);
  assert(radius > 0 && radius <= Math.max(LOGICAL_WIDTH, LOGICAL_HEIGHT), `${label} radius is invalid`);
  return { x, y, radius };
}

function validateMetadata(sample: CapturePlanSample, raw: unknown): {
  playerAnswer: { x: number; y: number; radius: number };
  categoryAnswer: VisualReadCategory | null;
} {
  const label = sample.metadataInput;
  const metadata = record(raw, label);
  assert(metadata.imageMimeType === 'image/png', `${label}: capture must declare image/png`);
  assert(metadata.visionMatrixBakedIntoPng === true, `${label}: vision matrix must be baked into the PNG`);
  assert(metadata.encodedPixelWidth === LOGICAL_WIDTH && metadata.encodedPixelHeight === LOGICAL_HEIGHT,
    `${label}: encoded dimensions must be 640 x 360`);
  const logicalCanvas = record(metadata.logicalCanvas, `${label}.logicalCanvas`);
  assert(logicalCanvas.width === LOGICAL_WIDTH && logicalCanvas.height === LOGICAL_HEIGHT,
    `${label}: logical canvas metadata must be 640 x 360`);
  assert(numberField(metadata, 'seed', label) === sample.seed, `${label}: seed does not match the capture plan`);
  assert(numberField(metadata, 'offsetId', label) === sample.offsetId, `${label}: offset ID does not match the capture plan`);
  assert(numberField(metadata, 'offsetS', label) === sample.offsetS, `${label}: offset time does not match the capture plan`);
  assert(stringField(metadata, 'visionMode', label) === sample.vision, `${label}: vision mode does not match the capture plan`);
  assert(metadata.preset === sample.presetLabel,
    `${label}: preset label does not match MAX360 variant ${sample.variant}`);
  assert(metadata.timeS === 30 * 60, `${label}: MAX360 capture time must be exactly 1800 seconds`);

  const playerAnswer = validateLogicalCircle(metadata.player, `${label}.player`);
  assert(Array.isArray(metadata.targets), `${label}.targets must be an array`);
  const targets = metadata.targets.map((target, index) => record(target, `${label}.targets[${index}]`));
  const targetIds = new Set<string>();
  const targetClasses = new Set<string>();
  for (const target of targets) {
    const id = stringField(target, 'id', `${label}.target`);
    const captureClass = stringField(target, 'class', `${label}.target`);
    assert((LIVE_CAPTURE_TARGET_CLASSES as readonly string[]).includes(captureClass),
      `${label}: target ${id} has unknown class ${captureClass}`);
    validateLogicalCircle(target, `${label}.target(${id})`);
    assert(!targetIds.has(id), `${label}: duplicate target ID ${id}`);
    assert(!targetClasses.has(captureClass), `${label}: duplicate target class ${captureClass}`);
    targetIds.add(id);
    targetClasses.add(captureClass);
  }
  for (const captureClass of LIVE_CAPTURE_TARGET_CLASSES) {
    assert(targetIds.has(MAX360_CAPTURE_TARGET_IDS[captureClass]),
      `${label}: missing real ${captureClass} fixture ${MAX360_CAPTURE_TARGET_IDS[captureClass]}`);
    assert(targetClasses.has(captureClass), `${label}: missing ${captureClass} target class`);
  }

  if (sample.mode === 'player') {
    assert(metadata.requestedTargetId === null, `${label}: player packet must not request a target`);
    assert(metadata.selectedTarget === null && metadata.targetBracket === null,
      `${label}: player packet must not show a target bracket`);
    return { playerAnswer, categoryAnswer: null };
  }

  assert(sample.targetId !== null && sample.targetClass !== null, `${label}: category plan target is incomplete`);
  assert(metadata.requestedTargetId === sample.targetId, `${label}: requested target ID does not match the plan`);
  const selectedTarget = record(metadata.selectedTarget, `${label}.selectedTarget`);
  assert(selectedTarget.id === sample.targetId, `${label}: selected target ID does not match the plan`);
  assert(selectedTarget.class === sample.targetClass, `${label}: selected target class does not match the plan`);
  validateLogicalCircle(selectedTarget, `${label}.selectedTarget`);
  const targetBracket = record(metadata.targetBracket, `${label}.targetBracket`);
  assert(targetBracket.targetId === sample.targetId, `${label}: bracket does not identify the selected target`);
  assert(numberField(targetBracket, 'gap', `${label}.targetBracket`) >= 2,
    `${label}: target bracket must stay outside the target core`);
  return { playerAnswer, categoryAnswer: sample.targetClass };
}

function validateCapture(sample: CapturePlanSample): ValidatedCapture {
  const pngPath = resolve(REPO_ROOT, sample.pngInput);
  const metadataPath = resolve(REPO_ROOT, sample.metadataInput);
  assert(existsSync(pngPath), `${sample.pngInput} is missing`);
  assert(existsSync(metadataPath), `${sample.metadataInput} is missing`);
  const png = readFileSync(pngPath);
  const pngInspection = inspectPng(png, sample.pngInput);
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as unknown;
  const answers = validateMetadata(sample, metadata);
  return { plan: sample, png, pngInspection, ...answers };
}

function validateCommit(raw: string): string {
  const commit = raw.trim();
  assert(/^[0-9a-f]{7,64}$/i.test(commit), `commit must be a git object hash, got ${JSON.stringify(raw)}`);
  return commit;
}

function currentCommit(): string {
  try {
    return validateCommit(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (error) {
    throw new Error(`could not resolve a git commit for the clarity packet: ${String(error)}`);
  }
}

function publicSample(capture: ValidatedCapture): VisualReadPublicSample {
  const sample = capture.plan;
  return {
    id: sample.id,
    image: `/art/pixel/clarity/frames/${sample.id}.png`,
    seed: String(sample.seed),
    offsetS: sample.offsetS,
    vision: sample.vision,
  };
}

function buildPacketArtifacts(
  plan: CapturePlan,
  captures: readonly ValidatedCapture[],
  commit: string,
): { packet: VisualReadPacket; answers: VisualReadAnswers } {
  const byId = new Map(captures.map((capture) => [capture.plan.id, capture]));
  const ordered = (samples: readonly CapturePlanSample[]): ValidatedCapture[] => samples.map((sample) => {
    const capture = byId.get(sample.id);
    assert(capture, `validated capture ${sample.id} is missing`);
    return capture;
  });
  const playerCaptures = ordered(plan.player);
  const categoryCaptures = ordered(plan.category);
  const packet: VisualReadPacket = {
    schemaVersion: 1,
    commit,
    captureCommand: plan.captureCommand,
    logicalCanvas: { w: 640, h: 360 },
    transform: plan.transform,
    player: playerCaptures.map(publicSample),
    category: categoryCaptures.map(publicSample),
  };
  const answers: VisualReadAnswers = {
    schemaVersion: 1,
    player: Object.fromEntries(playerCaptures.map((capture) => [capture.plan.id, capture.playerAnswer])),
    category: Object.fromEntries(categoryCaptures.map((capture) => {
      assert(capture.categoryAnswer !== null, `${capture.plan.id} has no category answer`);
      return [capture.plan.id, capture.categoryAnswer];
    })),
  };
  assertVisualReadPacket(packet, answers);
  validatePacketCoverage(packet, answers, plan);
  return { packet, answers };
}

function validatePacketCoverage(packet: VisualReadPacket, answers: VisualReadAnswers, plan: CapturePlan): void {
  assert(packet.commit.trim().length > 0, 'packet commit is empty');
  assert(packet.captureCommand === plan.captureCommand, 'packet capture command does not match the plan');
  assert(jsonText(packet.transform) === jsonText(plan.transform), 'packet transform does not match the plan');
  for (const mode of ['player', 'category'] as const) {
    const samples = packet[mode];
    assert(new Set(samples.map(({ image }) => image)).size === 40, `${mode} packet contains duplicate image paths`);
    const seedCounts = exactCounts(samples.map(({ seed }) => seed));
    assert(seedCounts.size === 4 && [...seedCounts.values()].every((count) => count === 10),
      `${mode} packet must contain four seeds exactly ten times each`);
    const offsetCounts = exactCounts(samples.map(({ offsetS }) => offsetS));
    assert(offsetCounts.size === 2 && [...offsetCounts.values()].every((count) => count === 20),
      `${mode} packet must contain both offsets exactly twenty times each`);
    const visionCounts = exactCounts(samples.map(({ vision }) => vision));
    assert(visionCounts.size === 5 && [...visionCounts.values()].every((count) => count === 8),
      `${mode} packet must contain each vision mode exactly eight times`);
  }
  for (const answer of Object.values(answers.player)) {
    assert(Number.isFinite(answer.x) && answer.x >= 0 && answer.x < 640, 'player answer x is outside the canvas');
    assert(Number.isFinite(answer.y) && answer.y >= 0 && answer.y < 360, 'player answer y is outside the canvas');
    assert(Number.isFinite(answer.radius) && answer.radius > 0, 'player answer radius must be positive');
  }
  const classCounts = exactCounts(Object.values(answers.category));
  assert(classCounts.get('enemy') === 7, 'hidden answers must contain seven enemy samples');
  assert(classCounts.get('friendly-projectile') === 7, 'hidden answers must contain seven friendly-projectile samples');
  assert(classCounts.get('xp') === 7, 'hidden answers must contain seven XP samples');
  assert(classCounts.get('music-note') === 7, 'hidden answers must contain seven music-note samples');
  assert(classCounts.get('weapon-reward') === 6, 'hidden answers must contain six weapon-reward samples');
  assert(classCounts.get('decorative-effect') === 6, 'hidden answers must contain six decorative-effect samples');
}

function allValidatedCaptures(plan: CapturePlan): ValidatedCapture[] {
  const captures = [...plan.player, ...plan.category].map(validateCapture);
  const hashes = captures.map(({ pngInspection }) => pngInspection.sha256);
  assert(new Set(hashes).size === hashes.length,
    'clarity packet contains duplicate PNG bytes; all 80 browser captures must be distinct');
  return captures;
}

function writePlan(options: CliOptions): void {
  const plan = buildCapturePlan(options.baseUrl, options.settleFrames);
  mkdirSync(resolve(REPO_ROOT, RAW_CAPTURE_ROOT), { recursive: true });
  writeFileSync(resolve(REPO_ROOT, CAPTURE_PLAN_PATH), jsonText(plan));
  console.log(
    `clarity capture plan: ${CAPTURE_PLAN_PATH} · 40 player + 40 category URLs · ` +
    'classes 7/7/7/7/6/6',
  );
}

function assemble(options: CliOptions): void {
  const plan = readCapturePlan();
  assert(options.baseUrl === DEFAULT_BASE_URL && options.settleFrames === DEFAULT_SETTLE_FRAMES,
    'assemble reads URL/settle settings from capture-plan.json; do not pass plan-generation options');
  const captures = allValidatedCaptures(plan);
  const commit = options.commit === null ? currentCommit() : validateCommit(options.commit);
  const artifacts = buildPacketArtifacts(plan, captures, commit);

  const frameRoot = resolve(REPO_ROOT, PUBLIC_FRAME_ROOT);
  mkdirSync(frameRoot, { recursive: true });
  const expectedFrameNames = new Set(captures.map(({ plan: sample }) => `${sample.id}.png`));
  const staleFrames = readdirSync(frameRoot)
    .filter((name) => name.endsWith('.png') && !expectedFrameNames.has(name))
    .sort(codeUnitSort);
  assert(staleFrames.length === 0,
    `${PUBLIC_FRAME_ROOT} contains stale PNGs: ${staleFrames.join(', ')}`);
  for (const capture of captures) {
    copyFileSync(
      resolve(REPO_ROOT, capture.plan.pngInput),
      resolve(frameRoot, `${capture.plan.id}.png`),
    );
  }
  writeFileSync(resolve(REPO_ROOT, PACKET_PATH), jsonText(artifacts.packet));
  writeFileSync(resolve(REPO_ROOT, ANSWERS_PATH), jsonText(artifacts.answers));
  checkPublished(plan, captures);
  console.log(
    `clarity packet assembled at ${PUBLIC_ROOT}: 80 unique 640 x 360 PNGs · commit ${commit}`,
  );
}

function checkPublished(plan = readCapturePlan(), captures = allValidatedCaptures(plan)): void {
  assert(existsSync(resolve(REPO_ROOT, PACKET_PATH)), `${PACKET_PATH} is missing`);
  assert(existsSync(resolve(REPO_ROOT, ANSWERS_PATH)), `${ANSWERS_PATH} is missing`);
  const packetText = readFileSync(resolve(REPO_ROOT, PACKET_PATH), 'utf8');
  const answersText = readFileSync(resolve(REPO_ROOT, ANSWERS_PATH), 'utf8');
  const packet = JSON.parse(packetText) as VisualReadPacket;
  const answers = JSON.parse(answersText) as VisualReadAnswers;
  assertVisualReadPacket(packet, answers);
  const expected = buildPacketArtifacts(plan, captures, validateCommit(packet.commit));
  assert(packetText === jsonText(expected.packet), `${PACKET_PATH} is stale or nondeterministic`);
  assert(answersText === jsonText(expected.answers), `${ANSWERS_PATH} is stale or nondeterministic`);

  const expectedFrameNames = captures.map(({ plan: sample }) => `${sample.id}.png`).sort(codeUnitSort);
  const actualFrameNames = readdirSync(resolve(REPO_ROOT, PUBLIC_FRAME_ROOT))
    .filter((name) => name.endsWith('.png'))
    .sort(codeUnitSort);
  assert(jsonText(actualFrameNames) === jsonText(expectedFrameNames),
    `${PUBLIC_FRAME_ROOT} must contain exactly the planned 80 PNGs`);
  const publishedHashes = new Set<string>();
  for (const capture of captures) {
    const publicPath = resolve(REPO_ROOT, PUBLIC_FRAME_ROOT, `${capture.plan.id}.png`);
    const inspection = inspectPng(readFileSync(publicPath), relative(REPO_ROOT, publicPath));
    assert(inspection.sha256 === capture.pngInspection.sha256,
      `${capture.plan.id}: published frame differs from its validated browser capture`);
    publishedHashes.add(inspection.sha256);
  }
  assert(publishedHashes.size === 80, 'published clarity frames must be byte-unique');
  console.log(
    'clarity packet check passed: exact 4-seed × 2-offset × 5-vision coverage, ' +
    'balanced classes, valid answers, and 80 unique 640 x 360 PNGs',
  );
}

const options = parseCli(process.argv.slice(2));
if (options.command === 'plan') writePlan(options);
else if (options.command === 'assemble') assemble(options);
else checkPublished();
