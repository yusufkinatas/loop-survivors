#!/usr/bin/env node

/**
 * Deterministic production pixel-art metrics generator.
 *
 * Usage:
 *   node --import tsx scripts/measure-pixel-art.mjs
 *   node --import tsx scripts/measure-pixel-art.mjs --check
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRAME_STATS_PATH = 'public/art/pixel/frame-stats.json';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ATLAS_INPUTS = [
  { id: 'gameplay', jsonPath: 'public/art/pixel/gameplay.json', imagePath: 'public/art/pixel/gameplay.png' },
  { id: 'ui', jsonPath: 'public/art/pixel/ui.json', imagePath: 'public/art/pixel/ui.png' },
  { id: 'environment', jsonPath: 'public/art/pixel/environment.json', imagePath: 'public/art/pixel/environment.png' },
];

const STANDALONE_INPUTS = [
  { id: 'arena-floor', imagePath: 'public/art/pixel/arena-floor.png' },
  { id: 'title-banner', imagePath: 'public/art/pixel/title-banner.png' },
];

const codeUnitSort = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(relativePath) {
  const encoded = readFileSync(resolve(REPO, relativePath));
  if (!encoded.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${relativePath}: invalid PNG signature`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const idat = [];
  while (offset < encoded.length) {
    const length = encoded.readUInt32BE(offset);
    const type = encoded.toString('ascii', offset + 4, offset + 8);
    const payloadStart = offset + 8;
    const payloadEnd = payloadStart + length;
    if (payloadEnd + 4 > encoded.length) throw new Error(`${relativePath}: truncated ${type} chunk`);
    const payload = encoded.subarray(payloadStart, payloadEnd);
    const storedCrc = encoded.readUInt32BE(payloadEnd);
    const actualCrc = crc32(encoded.subarray(offset + 4, payloadEnd));
    if (storedCrc !== actualCrc) throw new Error(`${relativePath}: bad ${type} CRC`);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
      interlace = payload[12];
    } else if (type === 'IDAT') {
      idat.push(payload);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }
  if (width <= 0 || height <= 0 || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(
      `${relativePath}: expected non-interlaced 8-bit RGB/RGBA PNG, got ` +
      `${width}x${height}, depth=${bitDepth}, color=${colorType}, interlace=${interlace}`,
    );
  }
  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const packed = inflateSync(Buffer.concat(idat));
  if (packed.length !== (stride + 1) * height) {
    throw new Error(`${relativePath}: unexpected decompressed byte count`);
  }
  const rows = Buffer.alloc(stride * height);
  let input = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[input++];
    const row = y * stride;
    const previous = row - stride;
    for (let x = 0; x < stride; x++) {
      const raw = packed[input++];
      const left = x >= channels ? rows[row + x - channels] : 0;
      const up = y > 0 ? rows[previous + x] : 0;
      const upperLeft = y > 0 && x >= channels ? rows[previous + x - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + Math.floor((left + up) / 2); break;
        case 4: value = raw + paeth(left, up, upperLeft); break;
        default: throw new Error(`${relativePath}: unsupported PNG row filter ${filter}`);
      }
      rows[row + x] = value & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < rows.length; source += channels, target += 4) {
    data[target] = rows[source];
    data[target + 1] = rows[source + 1];
    data[target + 2] = rows[source + 2];
    data[target + 3] = channels === 4 ? rows[source + 3] : 255;
  }
  return {
    width,
    height,
    data,
    png: { bitDepth, colorType: colorType === 2 ? 'RGB' : 'RGBA', interlace },
    encoded,
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function roundRatio(value) {
  return Number(value.toFixed(6));
}

function pixelMetrics(image) {
  const alphaCounts = new Uint32Array(256);
  const colorCounts = new Map();
  let opaquePixels = 0;
  let transparentPixels = 0;
  let softAlphaPixels = 0;
  let transparentRgbNonZeroPixels = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      const a = image.data[offset + 3];
      alphaCounts[a] += 1;
      if (a === 0) {
        transparentPixels += 1;
        if (r !== 0 || g !== 0 || b !== 0) transparentRgbNonZeroPixels += 1;
        continue;
      }
      if (a !== 255) softAlphaPixels += 1;
      if (a === 255) opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const color = (r << 16) | (g << 8) | b;
      colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
    }
  }
  let singletonPixels = 0;
  for (const count of colorCounts.values()) if (count === 1) singletonPixels += 1;
  const visiblePixels = image.width * image.height - transparentPixels;
  const alphaValues = [];
  for (let value = 0; value < alphaCounts.length; value++) {
    if (alphaCounts[value] > 0) alphaValues.push(value);
  }
  return {
    dimensions: { width: image.width, height: image.height },
    pixelSha256: sha256(image.data),
    opaqueBounds: maxX < 0
      ? null
      : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    visiblePixels,
    opaquePixels,
    transparentPixels,
    opaqueColorCount: colorCounts.size,
    colorRatio: visiblePixels === 0 ? 0 : roundRatio(colorCounts.size / visiblePixels),
    singletonPixelCount: singletonPixels,
    singletonRatio: visiblePixels === 0 ? 0 : roundRatio(singletonPixels / visiblePixels),
    alpha: {
      minimum: alphaValues[0] ?? null,
      maximum: alphaValues.at(-1) ?? null,
      distinctValues: alphaValues,
      softPixelCount: softAlphaPixels,
    },
    transparentRgbNonZeroPixels,
  };
}

function crop(image, rect, label) {
  const { x, y, w, h } = rect;
  if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > image.width || y + h > image.height) {
    throw new Error(`${label}: invalid frame rectangle ${JSON.stringify(rect)}`);
  }
  const data = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const sourceStart = ((y + row) * image.width + x) * 4;
    const targetStart = row * w * 4;
    data.set(image.data.subarray(sourceStart, sourceStart + w * 4), targetStart);
  }
  return { width: w, height: h, data };
}

function readAtlas(input) {
  const parsed = JSON.parse(readFileSync(resolve(REPO, input.jsonPath), 'utf8'));
  if (!parsed.frames || typeof parsed.frames !== 'object' || Array.isArray(parsed.frames)) {
    throw new Error(`${input.jsonPath}: missing frame mappings`);
  }
  const image = decodePng(input.imagePath);
  const frames = Object.entries(parsed.frames)
    .sort(([left], [right]) => codeUnitSort(left, right))
    .map(([frameKey, value]) => {
      if (!value || typeof value !== 'object' || !value.frame) {
        throw new Error(`${input.jsonPath}: frame ${frameKey} has no rectangle`);
      }
      const frameImage = crop(image, value.frame, `${input.jsonPath}:${frameKey}`);
      return {
        frameKey,
        atlasRect: value.frame,
        sourceSize: value.sourceSize ?? null,
        anchor: value.anchor ?? null,
        ...pixelMetrics(frameImage),
      };
    });
  return {
    id: input.id,
    imagePath: input.imagePath,
    jsonPath: input.jsonPath,
    image: {
      dimensions: { width: image.width, height: image.height },
      png: image.png,
      fileSha256: sha256(image.encoded),
      ...pixelMetrics(image),
    },
    frameCount: frames.length,
    frames,
  };
}

function seamMismatches(image) {
  let horizontal = 0;
  let vertical = 0;
  for (let y = 0; y < image.height; y++) {
    const left = (y * image.width) * 4;
    const right = (y * image.width + image.width - 1) * 4;
    for (let channel = 0; channel < 4; channel++) {
      if (image.data[left + channel] !== image.data[right + channel]) {
        horizontal += 1;
        break;
      }
    }
  }
  for (let x = 0; x < image.width; x++) {
    const top = x * 4;
    const bottom = ((image.height - 1) * image.width + x) * 4;
    for (let channel = 0; channel < 4; channel++) {
      if (image.data[top + channel] !== image.data[bottom + channel]) {
        vertical += 1;
        break;
      }
    }
  }
  return { horizontalEdgePixels: horizontal, verticalEdgePixels: vertical };
}

function logicalTitleProjection(image, scale) {
  if (image.width % scale !== 0 || image.height % scale !== 0) {
    throw new Error(`title-banner dimensions are not divisible by exact scale ${scale}`);
  }
  const width = image.width / scale;
  const height = image.height / scale;
  const data = new Uint8Array(width * height * 4);
  let blockMismatchPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = ((y * scale) * image.width + x * scale) * 4;
      const target = (y * width + x) * 4;
      data.set(image.data.subarray(source, source + 4), target);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const candidate = (((y * scale) + dy) * image.width + x * scale + dx) * 4;
          if (
            image.data[candidate] !== image.data[source] ||
            image.data[candidate + 1] !== image.data[source + 1] ||
            image.data[candidate + 2] !== image.data[source + 2] ||
            image.data[candidate + 3] !== image.data[source + 3]
          ) {
            blockMismatchPixels += 1;
          }
        }
      }
    }
  }
  return { exactScale: scale, blockMismatchPixels, ...pixelMetrics({ width, height, data }) };
}

function readStandalone(input) {
  const image = decodePng(input.imagePath);
  const result = {
    id: input.id,
    imagePath: input.imagePath,
    png: image.png,
    fileSha256: sha256(image.encoded),
    ...pixelMetrics(image),
  };
  if (input.id === 'arena-floor') result.seamMismatches = seamMismatches(image);
  if (input.id === 'title-banner') result.logicalProjection = logicalTitleProjection(image, 4);
  return result;
}

function buildFrameStats() {
  const atlases = ATLAS_INPUTS.map(readAtlas).sort((left, right) => codeUnitSort(left.id, right.id));
  const standaloneImages = STANDALONE_INPUTS.map(readStandalone).sort((left, right) => codeUnitSort(left.id, right.id));
  const frames = atlases.flatMap((atlas) => atlas.frames);
  return {
    schemaVersion: 1,
    generator: {
      command: 'node --import tsx scripts/measure-pixel-art.mjs',
      checkCommand: 'node --import tsx scripts/measure-pixel-art.mjs --check',
      inputs: [
        ...ATLAS_INPUTS.flatMap((input) => [input.jsonPath, input.imagePath]),
        ...STANDALONE_INPUTS.map((input) => input.imagePath),
      ].sort(codeUnitSort),
    },
    metricDefinitions: {
      pixelSha256: 'SHA-256 of row-major raw RGBA bytes for the measured rectangle.',
      opaqueBounds: 'Smallest local rectangle containing pixels with alpha greater than zero.',
      opaqueColorCount: 'Number of distinct RGB values among pixels with alpha greater than zero.',
      colorRatio: 'opaqueColorCount divided by visiblePixels, rounded to six decimals.',
      singletonRatio: 'Visible pixels whose RGB occurs exactly once divided by visiblePixels, rounded to six decimals.',
      softAlpha: 'Alpha values from 1 through 254.',
      transparentRgbNonZeroPixels: 'Alpha-zero pixels whose RGB channels are not all zero.',
    },
    summary: {
      atlasCount: atlases.length,
      atlasFrameCount: frames.length,
      standaloneImageCount: standaloneImages.length,
      softAlphaPixelCount: frames.reduce((sum, frame) => sum + frame.alpha.softPixelCount, 0),
      transparentRgbNonZeroPixels: frames.reduce((sum, frame) => sum + frame.transparentRgbNonZeroPixels, 0),
      minimumFrameColorRatio: Math.min(...frames.map((frame) => frame.colorRatio)),
      maximumFrameColorRatio: Math.max(...frames.map((frame) => frame.colorRatio)),
      averageFrameColorRatio: roundRatio(frames.reduce((sum, frame) => sum + frame.colorRatio, 0) / frames.length),
      minimumFrameSingletonRatio: Math.min(...frames.map((frame) => frame.singletonRatio)),
      maximumFrameSingletonRatio: Math.max(...frames.map((frame) => frame.singletonRatio)),
      averageFrameSingletonRatio: roundRatio(frames.reduce((sum, frame) => sum + frame.singletonRatio, 0) / frames.length),
    },
    atlases,
    standaloneImages,
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => codeUnitSort(left, right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function serialize(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function generatedFiles() {
  return [
    { path: FRAME_STATS_PATH, contents: serialize(buildFrameStats()) },
  ];
}

function firstDifference(left, right) {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  const line = left.slice(0, index).split('\n').length;
  return `first byte difference near line ${line}`;
}

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check') || args.filter((arg) => arg === '--check').length > 1) {
  throw new Error('usage: node --import tsx scripts/measure-pixel-art.mjs [--check]');
}

const files = generatedFiles();
if (args.includes('--check')) {
  const failures = [];
  for (const file of files) {
    const target = resolve(REPO, file.path);
    if (!existsSync(target)) {
      failures.push(`${file.path} is missing`);
      continue;
    }
    const actual = readFileSync(target, 'utf8');
    if (actual !== file.contents) failures.push(`${file.path} is stale (${firstDifference(actual, file.contents)})`);
  }
  if (failures.length > 0) {
    throw new Error(`${failures.join('\n')}; run node --import tsx scripts/measure-pixel-art.mjs`);
  }
  console.log('pixel-art metrics verified: frame-stats.json is current');
} else {
  for (const file of files) writeFileSync(resolve(REPO, file.path), file.contents);
  const frameStats = JSON.parse(files.find((file) => file.path === FRAME_STATS_PATH).contents);
  console.log(`generated ${FRAME_STATS_PATH} (${frameStats.summary.atlasFrameCount} frames)`);
}
