#!/usr/bin/env node

/**
 * Pack and verify Loop Survivors' native-grid Arcade Reliquary production art.
 *
 * The builder reads no raster concept boards. All 108 physical atlas frames,
 * the seamless floor, and the title composition come from deterministic
 * native-grid source in art-src/pixel-production/arcade-reliquary.mjs.
 *
 * Usage:
 *   node scripts/build-pixel-art.mjs
 *   node scripts/build-pixel-art.mjs build
 *   node scripts/build-pixel-art.mjs verify
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import {
  MASTER_PALETTE,
  WEAPON_ROLES,
  buildArenaFloor,
  buildProductionFrames,
  buildTitleLogical,
  createImage,
  pixelOffset,
} from '../art-src/pixel-production/arcade-reliquary.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = resolve(REPO, 'public/art/pixel');
const LIVE_CATALOG = resolve(OUTPUT_ROOT, 'live-catalog.json');
const OUTPUTS = Object.freeze({
  gameplayPng: resolve(OUTPUT_ROOT, 'gameplay.png'),
  gameplayJson: resolve(OUTPUT_ROOT, 'gameplay.json'),
  uiPng: resolve(OUTPUT_ROOT, 'ui.png'),
  uiJson: resolve(OUTPUT_ROOT, 'ui.json'),
  environmentPng: resolve(OUTPUT_ROOT, 'environment.png'),
  environmentJson: resolve(OUTPUT_ROOT, 'environment.json'),
  floorPng: resolve(OUTPUT_ROOT, 'arena-floor.png'),
  titlePng: resolve(OUTPUT_ROOT, 'title-banner.png'),
});

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ATLAS_PADDING = 2;
const RENDERER_SCALE = 1;
const FLOOR_SIZE = 16;
const TITLE_LOGICAL_WIDTH = 320;
const TITLE_LOGICAL_HEIGHT = 180;
const ATLAS_CONFIG = Object.freeze({
  gameplay: Object.freeze({ width: 1024, height: 512, image: 'gameplay.png' }),
  ui: Object.freeze({ width: 256, height: 256, image: 'ui.png' }),
  environment: Object.freeze({ width: 512, height: 256, image: 'environment.png' }),
});

const ACTOR_IDS = Object.freeze([
  'player', 'swarmer', 'tank', 'darter', 'splitter', 'charger', 'circler', 'shielded', 'elite',
  'bat', 'redBat', 'redBat2', 'zombie', 'skeleton', 'ghost', 'greenMudman', 'grayMudman',
  'flower', 'glowingBat', 'mantis', 'batSwarm',
]);
const ACTOR_ENVELOPES = Object.freeze({
  player: Object.freeze({ w: 28, h: 34, toleranceW: 2, toleranceH: 0 }),
  swarmer: Object.freeze({ w: 16, h: 16, toleranceW: 2, toleranceH: 2 }),
  tank: Object.freeze({ w: 44, h: 44, toleranceW: 2, toleranceH: 2 }),
  darter: Object.freeze({ w: 30, h: 20, toleranceW: 2, toleranceH: 2 }),
  splitter: Object.freeze({ w: 36, h: 38, toleranceW: 2, toleranceH: 2 }),
  charger: Object.freeze({ w: 40, h: 28, toleranceW: 2, toleranceH: 2 }),
  circler: Object.freeze({ w: 28, h: 28, toleranceW: 2, toleranceH: 2 }),
  shielded: Object.freeze({ w: 38, h: 42, toleranceW: 2, toleranceH: 2 }),
  elite: Object.freeze({ w: 44, h: 44, toleranceW: 2, toleranceH: 2 }),
  bat: Object.freeze({ w: 20, h: 18, toleranceW: 2, toleranceH: 2 }),
  redBat: Object.freeze({ w: 24, h: 20, toleranceW: 2, toleranceH: 2 }),
  redBat2: Object.freeze({ w: 28, h: 22, toleranceW: 2, toleranceH: 2 }),
  zombie: Object.freeze({ w: 24, h: 29, toleranceW: 2, toleranceH: 2 }),
  skeleton: Object.freeze({ w: 28, h: 30, toleranceW: 2, toleranceH: 2 }),
  ghost: Object.freeze({ w: 26, h: 28, toleranceW: 2, toleranceH: 2 }),
  greenMudman: Object.freeze({ w: 42, h: 40, toleranceW: 2, toleranceH: 2 }),
  grayMudman: Object.freeze({ w: 36, h: 40, toleranceW: 2, toleranceH: 2 }),
  flower: Object.freeze({ w: 30, h: 28, toleranceW: 2, toleranceH: 2 }),
  glowingBat: Object.freeze({ w: 56, h: 50, toleranceW: 2, toleranceH: 2 }),
  mantis: Object.freeze({ w: 60, h: 54, toleranceW: 2, toleranceH: 2 }),
  batSwarm: Object.freeze({ w: 28, h: 24, toleranceW: 2, toleranceH: 2 }),
});
const PICKUP_IDS = Object.freeze(['xp-blue', 'xp-green', 'xp-red', 'music-note', 'reward-pedestal', 'evolution-chest']);
const EFFECT_IDS = Object.freeze(['impact-cyan', 'impact-gold', 'explosion', 'death', 'xp-collect', 'celebration']);
const UI_KEYS = Object.freeze([
  'ui/items/highTops', 'ui/items/fastForward', 'ui/items/needleTips', 'ui/items/mirrorball', 'ui/items/wideLens',
  'ui/items/heavyAmp', 'ui/items/extensionCable', 'ui/items/magnetLanyard', 'ui/items/paddedJacket', 'ui/items/recoveryTape',
  'ui/status/heart', 'ui/status/xp', 'ui/status/note', 'ui/status/level', 'ui/status/pause',
  'ui/actions/reroll', 'ui/actions/shop', 'ui/actions/evolution', 'ui/actions/weapon-pedestal', 'ui/actions/enemy-skull',
]);
const ENVIRONMENT_IDS = Object.freeze([
  'broken-pillar', 'rune-pillar', 'cyan-brazier', 'gold-brazier', 'rubble', 'sarcophagus',
  'hooded-statue', 'knight-statue', 'bones', 'mushrooms', 'thorn-vines', 'gravestone',
  'cyan-crystals', 'purple-banner', 'campfire', 'rune-dais',
]);

const REVISION_ACTOR_CONTRACTS = Object.freeze({
  bat: Object.freeze({ size: [30, 28], tags: ['notched-wings'] }),
  redBat: Object.freeze({ size: [32, 30], tags: ['thick-wings', 'broad-tail'] }),
  zombie: Object.freeze({ size: [38, 42], tags: ['reach-arm', 'uneven-boots'] }),
  skeleton: Object.freeze({ size: [38, 42], tags: ['rib-gaps', 'fork-gaps'] }),
  ghost: Object.freeze({ size: [38, 42], tags: ['footless-taper'] }),
  greenMudman: Object.freeze({ size: [50, 50], tags: ['lopsided', 'hanging-fist'] }),
  grayMudman: Object.freeze({ size: [50, 50], tags: ['stacked-slabs'] }),
  mantis: Object.freeze({ size: [70, 62], tags: ['spider', 'four-stepped-leg-pairs', 'alternating-diagonal-gait'] }),
});

const REVISION_FRAME_CONTRACTS = Object.freeze({
  'weapons/clap/normal': Object.freeze({ size: [52, 36], tags: ['crown-fan'] }),
  'weapons/snare/normal': Object.freeze({ size: [34, 30], tags: ['needle-tail'] }),
  'weapons/chord/normal': Object.freeze({ size: [100, 68], tags: ['rounded-square-zone'] }),
  'weapons/kick/evolved': Object.freeze({ size: [64, 42], tags: ['four-lane', 'stamped'] }),
  'weapons/clap/evolved': Object.freeze({ size: [66, 44], tags: ['bracket-ring'] }),
  'weapons/snare/evolved': Object.freeze({ size: [44, 38], tags: ['twin-rail'] }),
  'weapons/hat/evolved': Object.freeze({ size: [46, 38], tags: ['linked-orbit', 'rail'] }),
  'weapons/lead/evolved': Object.freeze({ size: [48, 38], tags: ['segmented-serpent', 'head'] }),
  'weapons/arp/evolved': Object.freeze({ size: [56, 56], tags: ['paired-crown', 'central-void'] }),
  'weapons/chord/evolved': Object.freeze({ size: [116, 76], tags: ['linked-merged-cell'] }),
  'pickups/xp-green': Object.freeze({ size: [22, 22], tags: ['faceted-diamond', 'single-split'] }),
  'pickups/xp-red': Object.freeze({ size: [24, 24], tags: ['faceted-diamond', 'double-split'] }),
  'pickups/music-note': Object.freeze({ size: [22, 24], tags: ['stamped-head', 'stem'] }),
  'fx/xp-collect': Object.freeze({ size: [34, 38], tags: ['inward-collapse'] }),
  'fx/celebration': Object.freeze({ size: [52, 50], tags: ['bar-confetti', 'non-pickup'] }),
  'ui/items/extensionCable': Object.freeze({ size: [32, 32], tags: ['plug', 'loop'] }),
  'ui/items/recoveryTape': Object.freeze({ size: [32, 32], tags: ['two-reel-holes'] }),
  'ui/items/mirrorball': Object.freeze({ size: [32, 32], tags: ['facets', 'hanger'] }),
  'ui/status/heart': Object.freeze({ size: [24, 24], tags: ['stepped-heart', 'pink'] }),
  'ui/status/xp': Object.freeze({ size: [24, 24], tags: ['cyan-diamond'] }),
  'ui/actions/evolution': Object.freeze({ size: [24, 24], tags: ['chevron-crown'] }),
  'ui/actions/weapon-pedestal': Object.freeze({ size: [24, 24], tags: ['grounded-plinth'] }),
  'environment/cyan-crystals': Object.freeze({ size: [48, 48], tags: ['muted-role-color', 'separate-shards'] }),
  'environment/purple-banner': Object.freeze({ size: [44, 58], tags: ['muted-role-color', 'folded-cloth'] }),
  'environment/rune-dais': Object.freeze({ size: [62, 38], tags: ['muted-role-color', 'recessed-runes'] }),
});

function actorKey(id, pose) {
  return id === 'player' ? `actors/player/${pose}` : `actors/enemies/${id}/${pose}`;
}

function actorIdForKey(key) {
  if (key.startsWith('actors/player/')) return 'player';
  if (key.startsWith('actors/enemies/')) return key.split('/')[2];
  return null;
}

function uiFootprintForKey(key) {
  if (key.startsWith('ui/items/')) return 20;
  if (key.startsWith('ui/status/') || key.startsWith('ui/actions/')) return 16;
  return null;
}

function expectedGameplayKeys() {
  const keys = [];
  for (const id of ACTOR_IDS) keys.push(actorKey(id, 'idle'), actorKey(id, 'walk'));
  for (const evolved of [false, true]) {
    for (const role of WEAPON_ROLES) keys.push(`weapons/${role}/${evolved ? 'evolved' : 'normal'}`);
  }
  for (const id of PICKUP_IDS) keys.push(`pickups/${id}`);
  for (const id of EFFECT_IDS) keys.push(`fx/${id}`);
  return keys;
}

const EXPECTED_KEYS = Object.freeze({
  gameplay: Object.freeze(expectedGameplayKeys()),
  ui: UI_KEYS,
  environment: Object.freeze(ENVIRONMENT_IDS.map((id) => `environment/${id}`)),
});

function assert(condition, message) {
  if (!condition) throw new Error(`pixel-art builder: ${message}`);
}

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 0);
  return Buffer.concat([length, typeBytes, payload, checksum]);
}

function encodePng(image) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = image.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    const target = y * (stride + 1);
    scanlines[target] = 0;
    scanlines.set(image.data.subarray(y * stride, (y + 1) * stride), target + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('sRGB', Buffer.from([0])),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function decodePng(encoded, label) {
  assert(encoded.subarray(0, 8).equals(PNG_SIGNATURE), `${label} has an invalid PNG signature`);
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
    const payload = encoded.subarray(offset + 8, offset + 8 + length);
    const storedCrc = encoded.readUInt32BE(offset + 8 + length);
    assert(storedCrc === crc32(encoded.subarray(offset + 4, offset + 8 + length)), `${label} has a bad ${type} CRC`);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      bitDepth = payload[8];
      colorType = payload[9];
      interlace = payload[12];
    } else if (type === 'IDAT') idat.push(payload);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  assert(bitDepth === 8 && colorType === 6 && interlace === 0,
    `${label} must be non-interlaced RGBA8888; got depth=${bitDepth}, color=${colorType}, interlace=${interlace}`);
  const stride = width * 4;
  const packed = inflateSync(Buffer.concat(idat));
  assert(packed.length === (stride + 1) * height, `${label} has an unexpected decoded byte count`);
  const image = createImage(width, height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    assert(packed[row] === 0, `${label} uses unsupported PNG filter ${packed[row]}`);
    image.data.set(packed.subarray(row + 1, row + 1 + stride), y * stride);
  }
  return image;
}

function imagesEqual(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function colorHex(image, offset) {
  return `#${image.data[offset].toString(16).padStart(2, '0')}${image.data[offset + 1].toString(16).padStart(2, '0')}${image.data[offset + 2].toString(16).padStart(2, '0')}`;
}

function colorSet(image) {
  const colors = new Set();
  for (let p = 0; p < image.data.length; p += 4) if (image.data[p + 3] === 255) colors.add(colorHex(image, p));
  return colors;
}

function countColor(image, hex) {
  let count = 0;
  for (let p = 0; p < image.data.length; p += 4) {
    if (image.data[p + 3] === 255 && colorHex(image, p) === hex) count++;
  }
  return count;
}

function alphaAt(image, x, y) {
  assert(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < image.width && y < image.height,
    `alpha sample ${x},${y} falls outside ${image.width}x${image.height}`);
  return image.data[pixelOffset(image, x, y) + 3];
}

function alphaRunsInColumn(image, x) {
  let runs = 0;
  let opaque = false;
  for (let y = 0; y < image.height; y++) {
    const next = alphaAt(image, x, y) === 255;
    if (next && !opaque) runs++;
    opaque = next;
  }
  return runs;
}

function opaqueComponentCount(image) {
  const seen = new Uint8Array(image.width * image.height);
  let components = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const start = y * image.width + x;
      if (seen[start] || alphaAt(image, x, y) === 0) continue;
      components++;
      seen[start] = 1;
      const queue = [[x, y]];
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const [qx, qy] = queue[cursor];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx;
          const ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
          const index = ny * image.width + nx;
          if (seen[index] || alphaAt(image, nx, ny) === 0) continue;
          seen[index] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }
  return components;
}

function validateRevisionVocabulary(key, image, entry) {
  const actorId = actorIdForKey(key);
  const contract = actorId ? REVISION_ACTOR_CONTRACTS[actorId] : REVISION_FRAME_CONTRACTS[key];
  if (contract) {
    assert(image.width === contract.size[0] && image.height === contract.size[1],
      `${key} native size ${image.width}x${image.height} drifted from ${contract.size[0]}x${contract.size[1]}`);
    const tags = new Set(entry.semantic.tags);
    for (const tag of contract.tags) assert(tags.has(tag), `${key} is missing revision vocabulary tag ${tag}`);
  }

  if (key === 'pickups/xp-green' || key === 'pickups/xp-red') {
    const colors = colorSet(image);
    const cyanFacetColors = new Set([
      MASTER_PALETTE.outline,
      MASTER_PALETTE.panel,
      MASTER_PALETTE.highlight,
      MASTER_PALETTE.xp,
      MASTER_PALETTE.focal,
    ]);
    assert(colors.has(MASTER_PALETTE.xp) || colors.has(MASTER_PALETTE.focal), `${key} has no cyan facet color`);
    assert([...colors].every((color) => cyanFacetColors.has(color)), `${key} introduced a non-cyan tier body color`);
  }
  if (key === 'ui/status/heart') {
    assert(colorSet(image).has(MASTER_PALETTE.health), `${key} must use the stepped pink health color`);
  }
  if (key === 'ui/status/xp') {
    const colors = colorSet(image);
    assert(colors.has(MASTER_PALETTE.xp) && !colors.has(MASTER_PALETTE.currency), `${key} must remain a cyan, not gold, diamond`);
  }
  if (key === 'fx/celebration') {
    assert(opaqueComponentCount(image) >= 10, `${key} must remain scattered bar confetti, not a connected pickup silhouette`);
  }
  if (key === 'weapons/kick/evolved') {
    assert(alphaRunsInColumn(image, entry.pivot.x - 20) === 4, `${key} must expose exactly four separated stamped lanes`);
  }
  if (key === 'weapons/clap/evolved' || key === 'weapons/arp/evolved' || key === 'weapons/chord/normal') {
    assert(alphaAt(image, entry.pivot.x, entry.pivot.y) === 0, `${key} must preserve its structural center void`);
  }
  if (key === 'weapons/snare/evolved') {
    assert(alphaAt(image, entry.pivot.x - 8, entry.pivot.y - 5) === 255 &&
      alphaAt(image, entry.pivot.x - 8, entry.pivot.y + 5) === 255,
    `${key} must preserve both parallel rails`);
  }
  if (key === 'weapons/chord/evolved') {
    assert(alphaAt(image, entry.pivot.x, entry.pivot.y) === 255, `${key} must preserve the merged-cell bridge`);
  }
  if (key === 'environment/cyan-crystals' || key === 'environment/purple-banner' || key === 'environment/rune-dais') {
    const combatRolePixels = countColor(image, MASTER_PALETTE.focal) + countColor(image, MASTER_PALETTE.accent);
    assert(combatRolePixels <= 2, `${key} uses ${combatRolePixels} bright cyan/magenta combat-role pixels; maximum is 2`);
  }
}

function opaqueBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[pixelOffset(image, x, y) + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      opaquePixels++;
    }
  }
  assert(opaquePixels > 0, 'cannot measure an empty native frame');
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
    opaquePixels,
    origin: 'native-frame-top-left',
    space: 'native-logical-pixels',
  };
}

function transparentMargin(image, bounds, minimumRequired) {
  return {
    top: bounds.y,
    right: image.width - bounds.x - bounds.w,
    bottom: image.height - bounds.y - bounds.h,
    left: bounds.x,
    minimumRequired,
    space: 'native-logical-pixels',
  };
}

function frameDigest(image) {
  const dimensions = Buffer.alloc(8);
  dimensions.writeUInt32BE(image.width, 0);
  dimensions.writeUInt32BE(image.height, 4);
  return createHash('sha256').update(dimensions).update(image.data).digest('hex');
}

function blit(source, target, x0, y0) {
  assert(x0 >= 0 && y0 >= 0 && x0 + source.width <= target.width && y0 + source.height <= target.height,
    `blit ${source.width}x${source.height} at ${x0},${y0} exceeds ${target.width}x${target.height}`);
  for (let y = 0; y < source.height; y++) {
    const sourceStart = y * source.width * 4;
    const targetStart = pixelOffset(target, x0, y0 + y);
    target.data.set(source.data.subarray(sourceStart, sourceStart + source.width * 4), targetStart);
  }
}

function crop(source, x0, y0, width, height) {
  const target = createImage(width, height);
  for (let y = 0; y < height; y++) {
    const sourceStart = pixelOffset(source, x0, y0 + y);
    target.data.set(source.data.subarray(sourceStart, sourceStart + width * 4), y * width * 4);
  }
  return target;
}

function roundAnchor(value) {
  return Number(value.toFixed(6));
}

function packAtlas(atlasId, nativeFrames, animations = undefined) {
  const config = ATLAS_CONFIG[atlasId];
  const atlas = createImage(config.width, config.height);
  const frames = {};
  let x = ATLAS_PADDING;
  let y = ATLAS_PADDING;
  let rowHeight = 0;
  for (const source of nativeFrames) {
    const native = source.image;
    if (x + native.width + ATLAS_PADDING > atlas.width) {
      x = ATLAS_PADDING;
      y += rowHeight + ATLAS_PADDING;
      rowHeight = 0;
    }
    assert(y + native.height + ATLAS_PADDING <= atlas.height, `${atlasId} atlas capacity exceeded at ${source.key}`);
    blit(native, atlas, x, y);
    const bounds = opaqueBounds(native);
    const margin = transparentMargin(native, bounds, source.requiresTransparentMargin ? 2 : 0);
    const colors = colorSet(native);
    const anchor = { x: roundAnchor(source.pivot.x / native.width), y: roundAnchor(source.pivot.y / native.height), space: 'normalized-native-frame' };
    const actorId = actorIdForKey(source.key);
    const targetEnvelope = actorId ? ACTOR_ENVELOPES[actorId] : null;
    const uiFootprint = uiFootprintForKey(source.key);
    frames[source.key] = {
      frame: { x, y, w: native.width, h: native.height, space: 'atlas-pixels' },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: native.width, h: native.height, space: 'native-logical-pixels' },
      sourceSize: { w: native.width, h: native.height, space: 'native-logical-pixels' },
      nativeSize: { w: native.width, h: native.height, space: 'native-logical-pixels' },
      pivot: { ...source.pivot, origin: 'native-frame-top-left', space: 'native-logical-pixels' },
      anchor,
      opaqueBounds: bounds,
      semantic: { class: source.semanticClass, tags: source.tags },
      transparentMargin: margin,
      rendererScale: { value: RENDERER_SCALE, space: 'logical-screen-pixels-per-native-pixel' },
      colorBudget: source.colorBudget,
      colorsUsed: colors.size,
      ...(targetEnvelope ? {
        targetOpaqueEnvelope: {
          w: targetEnvelope.w,
          h: targetEnvelope.h,
          toleranceW: targetEnvelope.toleranceW,
          toleranceH: targetEnvelope.toleranceH,
          space: 'native-logical-pixels',
        },
        groundReference: {
          x: source.pivot.x,
          y: source.pivot.y,
          kind: source.planted ? 'planted-ground' : 'projected-hover-ground',
          origin: 'native-frame-top-left',
          space: 'native-logical-pixels',
        },
      } : {}),
      ...(uiFootprint ? {
        targetVisibleFootprint: {
          value: uiFootprint,
          tolerance: 2,
          measure: 'maximum-opaque-dimension',
          space: 'native-logical-pixels',
        },
      } : {}),
    };
    x += native.width + ATLAS_PADDING;
    rowHeight = Math.max(rowHeight, native.height);
  }
  const json = {
    frames,
    ...(animations ? { animations } : {}),
    meta: {
      app: 'Loop Survivors native-grid production builder',
      version: '2.0',
      direction: 'arcade-reliquary',
      source: 'art-src/pixel-production/arcade-reliquary.mjs',
      image: config.image,
      format: 'RGBA8888-hard-alpha',
      size: { w: atlas.width, h: atlas.height, space: 'atlas-pixels' },
      scale: '1',
      rendererScale: { value: RENDERER_SCALE, space: 'logical-screen-pixels-per-native-pixel' },
      atlasPadding: { value: ATLAS_PADDING, space: 'atlas-pixels' },
      masterPalette: Object.entries(MASTER_PALETTE).map(([name, hex]) => ({ name, hex })),
      frameCount: nativeFrames.length,
    },
  };
  return { id: atlasId, image: atlas, json, nativeFrames };
}

function validateHardAlphaAndPalette(image, label, requireOpaque = false) {
  const allowed = new Set(Object.values(MASTER_PALETTE));
  let opaque = 0;
  let transparent = 0;
  for (let p = 0; p < image.data.length; p += 4) {
    const alpha = image.data[p + 3];
    assert(alpha === 0 || alpha === 255, `${label} contains soft alpha ${alpha}`);
    if (alpha === 0) {
      transparent++;
      assert(image.data[p] === 0 && image.data[p + 1] === 0 && image.data[p + 2] === 0,
        `${label} has non-zero RGB under fully transparent alpha`);
    } else {
      opaque++;
      assert(allowed.has(colorHex(image, p)), `${label} uses color ${colorHex(image, p)} outside the master palette`);
    }
  }
  assert(opaque > 0, `${label} is empty`);
  if (requireOpaque) assert(transparent === 0, `${label} must be fully opaque`);
  return { opaque, transparent };
}

function rectanglesHavePadding(a, b, padding) {
  return a.x + a.w + padding <= b.x || b.x + b.w + padding <= a.x ||
    a.y + a.h + padding <= b.y || b.y + b.h + padding <= a.y;
}

function frameDifference(a, b) {
  assert(a.width === b.width && a.height === b.height, 'animation frames must share native dimensions');
  let changedPixels = 0;
  for (let p = 0; p < a.data.length; p += 4) {
    if (a.data[p] !== b.data[p] || a.data[p + 1] !== b.data[p + 1] ||
      a.data[p + 2] !== b.data[p + 2] || a.data[p + 3] !== b.data[p + 3]) changedPixels++;
  }
  return changedPixels;
}

function validateAtlas(packed, expectedKeys) {
  const { id, image, json, nativeFrames } = packed;
  const config = ATLAS_CONFIG[id];
  assert(image.width === config.width && image.height === config.height, `${id} atlas dimensions drifted`);
  validateHardAlphaAndPalette(image, `${id} atlas`);
  assert(json.meta.image === config.image && json.meta.format === 'RGBA8888-hard-alpha', `${id} atlas metadata drifted`);
  assert(json.meta.rendererScale.value === 1, `${id} atlas renderer scale is not 1`);
  const actualKeys = Object.keys(json.frames);
  assert(actualKeys.length === expectedKeys.length, `${id} expected ${expectedKeys.length} frames, found ${actualKeys.length}`);
  assert(actualKeys.every((key, index) => key === expectedKeys[index]), `${id} frame order or stable mapping drifted`);
  const sourceByKey = new Map(nativeFrames.map((frame) => [frame.key, frame]));
  const digests = new Map();
  const rectangles = [];
  let minMargin = Infinity;
  let maximumColors = 0;
  let minimumAnimationDifference = Infinity;
  let maximumAnimationAreaDelta = 0;
  for (const key of expectedKeys) {
    const entry = json.frames[key];
    const source = sourceByKey.get(key);
    assert(source, `${id}/${key} has no native source frame`);
    const frame = entry.frame;
    assert(Number.isInteger(frame.x) && Number.isInteger(frame.y) && Number.isInteger(frame.w) && Number.isInteger(frame.h), `${id}/${key} frame is not integral`);
    assert(frame.space === 'atlas-pixels', `${id}/${key} frame space is missing`);
    assert(frame.x >= ATLAS_PADDING && frame.y >= ATLAS_PADDING && frame.x + frame.w + ATLAS_PADDING <= image.width && frame.y + frame.h + ATLAS_PADDING <= image.height,
      `${id}/${key} violates outer atlas padding`);
    rectangles.push({ key, ...frame });
    const extracted = crop(image, frame.x, frame.y, frame.w, frame.h);
    assert(imagesEqual(extracted, source.image), `${id}/${key} atlas pixels differ from native source`);
    const alpha = validateHardAlphaAndPalette(extracted, `${id}/${key}`);
    assert(alpha.transparent > 0, `${id}/${key} must contain transparent frame space`);
    const measuredBounds = opaqueBounds(extracted);
    assert(stableJson(measuredBounds) === stableJson(entry.opaqueBounds), `${id}/${key} opaqueBounds metadata is stale`);
    assert(entry.nativeSize.w === extracted.width && entry.nativeSize.h === extracted.height && entry.nativeSize.space === 'native-logical-pixels', `${id}/${key} nativeSize is invalid`);
    assert(entry.pivot.space === 'native-logical-pixels' && entry.pivot.origin === 'native-frame-top-left', `${id}/${key} pivot coordinate space is invalid`);
    assert(entry.pivot.x >= 0 && entry.pivot.y >= 0 && entry.pivot.x < extracted.width && entry.pivot.y < extracted.height, `${id}/${key} pivot is outside native frame`);
    assert(entry.rendererScale.value === 1, `${id}/${key} renderer scale is not 1`);
    assert(entry.semantic?.class && Array.isArray(entry.semantic.tags) && entry.semantic.tags.length > 0, `${id}/${key} semantic metadata is incomplete`);
    validateRevisionVocabulary(key, extracted, entry);
    const actorId = actorIdForKey(key);
    if (actorId) {
      const target = ACTOR_ENVELOPES[actorId];
      assert(target, `${id}/${key} has no binding actor envelope`);
      assert(stableJson(entry.targetOpaqueEnvelope) === stableJson({
        w: target.w,
        h: target.h,
        toleranceW: target.toleranceW,
        toleranceH: target.toleranceH,
        space: 'native-logical-pixels',
      }), `${id}/${key} target envelope metadata is stale`);
      assert(Math.abs(measuredBounds.w - target.w) <= target.toleranceW,
        `${id}/${key} visible width ${measuredBounds.w} is outside ${target.w}±${target.toleranceW}`);
      assert(Math.abs(measuredBounds.h - target.h) <= target.toleranceH,
        `${id}/${key} visible height ${measuredBounds.h} is outside ${target.h}±${target.toleranceH}`);
      assert(entry.groundReference?.space === 'native-logical-pixels' && entry.groundReference.origin === 'native-frame-top-left',
        `${id}/${key} has no universal native ground reference`);
      assert(entry.groundReference.x === entry.pivot.x && entry.groundReference.y === entry.pivot.y,
        `${id}/${key} ground reference must use the art pivot`);
    }
    const uiFootprint = uiFootprintForKey(key);
    if (uiFootprint) {
      assert(stableJson(entry.targetVisibleFootprint) === stableJson({
        value: uiFootprint,
        tolerance: 2,
        measure: 'maximum-opaque-dimension',
        space: 'native-logical-pixels',
      }), `${id}/${key} UI footprint metadata is stale`);
      const maximumDimension = Math.max(measuredBounds.w, measuredBounds.h);
      assert(Math.abs(maximumDimension - uiFootprint) <= 2,
        `${id}/${key} visible footprint ${maximumDimension}px is outside ${uiFootprint}±2`);
    }
    const colors = colorSet(extracted).size;
    assert(colors === entry.colorsUsed, `${id}/${key} colorsUsed metadata is stale`);
    assert(colors <= entry.colorBudget, `${id}/${key} uses ${colors} colors, budget ${entry.colorBudget}`);
    maximumColors = Math.max(maximumColors, colors);
    const margins = entry.transparentMargin;
    const measuredMargin = transparentMargin(extracted, measuredBounds, margins.minimumRequired);
    assert(stableJson(margins) === stableJson(measuredMargin), `${id}/${key} transparentMargin metadata is stale`);
    const smallest = Math.min(margins.top, margins.right, margins.bottom, margins.left);
    assert(smallest >= margins.minimumRequired, `${id}/${key} has only ${smallest}px transparent margin; requires ${margins.minimumRequired}px`);
    minMargin = Math.min(minMargin, smallest);
    const digest = frameDigest(extracted);
    assert(!digests.has(digest), `${id}/${key} duplicates placeholder frame ${digests.get(digest)}`);
    digests.set(digest, key);
  }
  for (let i = 0; i < rectangles.length; i++) {
    for (let j = i + 1; j < rectangles.length; j++) {
      assert(rectanglesHavePadding(rectangles[i], rectangles[j], ATLAS_PADDING),
        `${id}/${rectangles[i].key} and ${rectangles[j].key} violate ${ATLAS_PADDING}px atlas separation`);
    }
  }
  if (id === 'gameplay') {
    const expectedAnimations = new Set(ACTOR_IDS.map((actor) => actor === 'player' ? 'actors/player' : `actors/enemies/${actor}`));
    assert(Object.keys(json.animations).length === expectedAnimations.size, `gameplay animation mapping count drifted`);
    for (const actor of ACTOR_IDS) {
      const animationKey = actor === 'player' ? 'actors/player' : `actors/enemies/${actor}`;
      const idleKey = actorKey(actor, 'idle');
      const walkKey = actorKey(actor, 'walk');
      assert(expectedAnimations.has(animationKey), `${animationKey} is not expected`);
      assert(stableJson(json.animations[animationKey]) === stableJson([idleKey, walkKey]), `${animationKey} must map idle then walk`);
      const idleEntry = json.frames[idleKey];
      const walkEntry = json.frames[walkKey];
      assert(stableJson(idleEntry.nativeSize) === stableJson(walkEntry.nativeSize), `${animationKey} native sizes differ`);
      assert(stableJson(idleEntry.pivot) === stableJson(walkEntry.pivot), `${animationKey} pivots differ`);
      assert(idleEntry.groundReference && walkEntry.groundReference, `${animationKey} is missing universal ground references`);
      assert(Math.abs(idleEntry.groundReference.x - walkEntry.groundReference.x) <= 1 &&
        Math.abs(idleEntry.groundReference.y - walkEntry.groundReference.y) <= 1,
      `${animationKey} projected ground reference drifts by more than 1px`);
      assert(idleEntry.groundReference.kind === walkEntry.groundReference.kind, `${animationKey} ground reference kind changes`);
      if (idleEntry.groundReference.kind === 'planted-ground') {
        const idleBottom = idleEntry.opaqueBounds.y + idleEntry.opaqueBounds.h - 1;
        const walkBottom = walkEntry.opaqueBounds.y + walkEntry.opaqueBounds.h - 1;
        assert(Math.abs(idleBottom - walkBottom) <= 1, `${animationKey} planted visible baseline drifts by more than 1px`);
      }
      const difference = frameDifference(sourceByKey.get(idleKey).image, sourceByKey.get(walkKey).image);
      assert(difference >= 16, `${animationKey} animation changes only ${difference} pixels; requires at least 16`);
      const idleArea = idleEntry.opaqueBounds.opaquePixels;
      const walkArea = walkEntry.opaqueBounds.opaquePixels;
      const areaDelta = Math.abs(walkArea - idleArea) / idleArea;
      assert(areaDelta < 0.10, `${animationKey} visible solid-area delta ${(areaDelta * 100).toFixed(2)}% is not below 10%`);
      maximumAnimationAreaDelta = Math.max(maximumAnimationAreaDelta, areaDelta);
      minimumAnimationDifference = Math.min(minimumAnimationDifference, difference);
    }
  }
  return {
    frameCount: expectedKeys.length,
    uniqueFrameCount: digests.size,
    minTransparentMargin: minMargin,
    maximumColors,
    minimumAnimationDifference: id === 'gameplay' ? minimumAnimationDifference : null,
    maximumAnimationAreaDelta: id === 'gameplay' ? maximumAnimationAreaDelta : null,
  };
}

function validateExactScale(source, scaled, scale, label) {
  assert(scaled.width === source.width * scale && scaled.height === source.height * scale, `${label} dimensions are not exact ${scale}x`);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const sourcePixel = pixelOffset(source, x, y);
      for (let oy = 0; oy < scale; oy++) {
        for (let ox = 0; ox < scale; ox++) {
          const targetPixel = pixelOffset(scaled, x * scale + ox, y * scale + oy);
          for (let channel = 0; channel < 4; channel++) {
            assert(scaled.data[targetPixel + channel] === source.data[sourcePixel + channel], `${label} has a non-nearest block at ${x},${y}`);
          }
        }
      }
    }
  }
}

function validateFloor(floor) {
  assert(floor.width === FLOOR_SIZE && floor.height === FLOOR_SIZE, `arena floor must be ${FLOOR_SIZE}x${FLOOR_SIZE}`);
  validateHardAlphaAndPalette(floor, 'arena floor', true);
  assert(colorSet(floor).size <= 3, `arena floor exceeds its 3-color budget`);
  for (let y = 0; y < floor.height; y++) {
    const left = pixelOffset(floor, 0, y);
    const right = pixelOffset(floor, floor.width - 1, y);
    for (let channel = 0; channel < 4; channel++) assert(floor.data[left + channel] === floor.data[right + channel], `arena floor left/right seam differs at y=${y}`);
  }
  for (let x = 0; x < floor.width; x++) {
    const top = pixelOffset(floor, x, 0);
    const bottom = pixelOffset(floor, x, floor.height - 1);
    for (let channel = 0; channel < 4; channel++) assert(floor.data[top + channel] === floor.data[bottom + channel], `arena floor top/bottom seam differs at x=${x}`);
  }
}

function validateTitle(logical, title) {
  assert(logical.width === TITLE_LOGICAL_WIDTH && logical.height === TITLE_LOGICAL_HEIGHT, 'title logical canvas drifted');
  validateHardAlphaAndPalette(logical, 'title logical composition', true);
  validateHardAlphaAndPalette(title, 'title banner', true);
  assert(imagesEqual(logical, title), 'title banner must remain at its native 320x180 logical source size');
}

function validateStandaloneSurfaceMetadata(gameplayJson) {
  const surfaces = gameplayJson.meta?.standaloneSurfaces;
  assert(surfaces?.arenaFloor?.nativeSize?.w === FLOOR_SIZE && surfaces.arenaFloor.nativeSize.h === FLOOR_SIZE,
    'arena floor native repeat-unit metadata is stale');
  assert(surfaces.arenaFloor.repeat === 'seamless-both-axes' && surfaces.arenaFloor.rendererScale.value === 1,
    'arena floor repeat or scale metadata is invalid');
  assert(surfaces?.titleBanner?.nativeSize?.w === TITLE_LOGICAL_WIDTH && surfaces.titleBanner.nativeSize.h === TITLE_LOGICAL_HEIGHT,
    'title banner native-size metadata is stale');
  assert(surfaces.titleBanner.displayRole === 'start-hero-logical-source' && surfaces.titleBanner.rendererScale.value === 1,
    'title banner display-role or scale metadata is invalid');
}

function validateLiveCatalogCoverage(atlases) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(LIVE_CATALOG, 'utf8'));
  } catch (error) {
    throw new Error(`pixel-art builder: live catalog is required for exact coverage: ${error.message}`);
  }
  const expected = [];
  for (const packed of atlases) for (const key of Object.keys(packed.json.frames)) expected.push(`${packed.id}:${key}`);
  const actual = (manifest.physicalFrames ?? []).map(({ atlas, frameKey }) => `${atlas}:${frameKey}`);
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((key) => !actualSet.has(key));
  const orphaned = actual.filter((key) => !expectedSet.has(key));
  assert(expected.length === 108, `internal physical frame contract is ${expected.length}, expected 108`);
  assert(actual.length === 108, `live catalog physical frame contract is ${actual.length}, expected 108`);
  assert(actualSet.size === 108, `live catalog contains duplicate physical frame entries`);
  assert(missing.length === 0, `live catalog misses production frames: ${missing.join(', ')}`);
  assert(orphaned.length === 0, `live catalog contains orphaned production frames: ${orphaned.join(', ')}`);
  assert(manifest.coverage?.exact === true && manifest.coverage?.physicalFrameCount === 108,
    'live catalog does not declare exact 108-frame coverage');
  return { physicalFrameCount: expected.length, manifestExact: true };
}

function validateEncodedPng(image, encoded, label) {
  const decoded = decodePng(encoded, label);
  assert(imagesEqual(image, decoded), `${label} changed during PNG round-trip`);
}

function addArtifact(artifacts, path, contents) {
  assert(!artifacts.has(path), `duplicate output ${path}`);
  artifacts.set(path, Buffer.isBuffer(contents) ? contents : Buffer.from(contents));
}

function buildAll() {
  const production = buildProductionFrames();
  assert(production.gameplay.length === 72, `native gameplay source has ${production.gameplay.length} frames, expected 72`);
  assert(production.ui.length === 20, `native UI source has ${production.ui.length} frames, expected 20`);
  assert(production.environment.length === 16, `native environment source has ${production.environment.length} frames, expected 16`);
  const gameplay = packAtlas('gameplay', production.gameplay, production.animations);
  const ui = packAtlas('ui', production.ui);
  const environment = packAtlas('environment', production.environment);
  const floor = buildArenaFloor();
  const titleLogical = buildTitleLogical(production, floor);
  const title = titleLogical;
  gameplay.json.meta.standaloneSurfaces = {
    arenaFloor: {
      image: 'arena-floor.png',
      nativeSize: { w: FLOOR_SIZE, h: FLOOR_SIZE, space: 'native-logical-pixels' },
      repeat: 'seamless-both-axes',
      rendererScale: { value: 1, space: 'logical-screen-pixels-per-native-pixel' },
    },
    titleBanner: {
      image: 'title-banner.png',
      nativeSize: { w: TITLE_LOGICAL_WIDTH, h: TITLE_LOGICAL_HEIGHT, space: 'native-logical-pixels' },
      displayRole: 'start-hero-logical-source',
      rendererScale: { value: 1, space: 'logical-screen-pixels-per-native-pixel' },
    },
  };
  const reports = {
    gameplay: validateAtlas(gameplay, EXPECTED_KEYS.gameplay),
    ui: validateAtlas(ui, EXPECTED_KEYS.ui),
    environment: validateAtlas(environment, EXPECTED_KEYS.environment),
  };
  validateFloor(floor);
  validateTitle(titleLogical, title);
  validateStandaloneSurfaceMetadata(gameplay.json);
  const coverage = validateLiveCatalogCoverage([gameplay, ui, environment]);

  const images = [
    [OUTPUTS.gameplayPng, gameplay.image],
    [OUTPUTS.uiPng, ui.image],
    [OUTPUTS.environmentPng, environment.image],
    [OUTPUTS.floorPng, floor],
    [OUTPUTS.titlePng, title],
  ];
  const artifacts = new Map();
  for (const [path, image] of images) {
    const encoded = encodePng(image);
    validateEncodedPng(image, encoded, path);
    addArtifact(artifacts, path, encoded);
  }
  addArtifact(artifacts, OUTPUTS.gameplayJson, stableJson(gameplay.json));
  addArtifact(artifacts, OUTPUTS.uiJson, stableJson(ui.json));
  addArtifact(artifacts, OUTPUTS.environmentJson, stableJson(environment.json));
  return { artifacts, reports, coverage };
}

function compareBuilds(first, second) {
  assert(first.artifacts.size === second.artifacts.size, 'deterministic builds produced different artifact counts');
  for (const [path, expected] of first.artifacts) {
    assert(second.artifacts.has(path), `deterministic rebuild omitted ${path}`);
    assert(expected.equals(second.artifacts.get(path)), `deterministic rebuild changed ${path}`);
  }
}

function writeArtifacts(artifacts) {
  for (const [path, contents] of artifacts) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    assert(readFileSync(path).equals(contents), `${path} changed during disk write`);
  }
}

function verifyArtifacts(artifacts) {
  const failures = [];
  for (const [path, contents] of artifacts) {
    let actual;
    try {
      actual = readFileSync(path);
    } catch (error) {
      failures.push(`${path}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
      continue;
    }
    if (!actual.equals(contents)) failures.push(`${path}: stale bytes`);
  }
  assert(failures.length === 0, `verify found stale production art (${failures.join('; ')})`);
}

function report(result, command) {
  const { gameplay, ui, environment } = result.reports;
  const hashes = [...result.artifacts.entries()]
    .filter(([path]) => path.endsWith('.png'))
    .map(([path, contents]) => `${path.slice(OUTPUT_ROOT.length + 1)}=${createHash('sha256').update(contents).digest('hex').slice(0, 12)}`);
  console.log(`${command === 'build' ? 'built and verified' : 'verified'} Arcade Reliquary native production art`);
  console.log(`coverage: gameplay ${gameplay.frameCount}/72, UI ${ui.frameCount}/20, environment ${environment.frameCount}/16, live catalog ${result.coverage.physicalFrameCount}/108 exact`);
  console.log(`checks: ${gameplay.uniqueFrameCount + ui.uniqueFrameCount + environment.uniqueFrameCount}/108 unique non-empty frames, hard alpha, zero transparent RGB, master palette only, measured colors/frame <= ${Math.max(gameplay.maximumColors, ui.maximumColors, environment.maximumColors)} within declared budgets, minimum frame margin ${Math.min(gameplay.minTransparentMargin, ui.minTransparentMargin, environment.minTransparentMargin)}px, atlas separation ${ATLAS_PADDING}px`);
  console.log(`animations: 21/21 stable mappings, universal ground references aligned, maximum solid-area delta ${(gameplay.maximumAnimationAreaDelta * 100).toFixed(2)}%, minimum changed pixels ${gameplay.minimumAnimationDifference}`);
  console.log(`renderer: native logical frames at exact ${RENDERER_SCALE}x; floor repeat unit ${FLOOR_SIZE}x${FLOOR_SIZE} seamless; title stored at native ${TITLE_LOGICAL_WIDTH}x${TITLE_LOGICAL_HEIGHT}`);
  console.log(`png sha256 prefixes: ${hashes.join(' · ')}`);
}

const args = process.argv.slice(2);
assert(args.length <= 1, 'usage: node scripts/build-pixel-art.mjs [build|verify]');
const command = args[0] ?? 'build';
assert(command === 'build' || command === 'verify' || command === '--verify', `unknown command ${JSON.stringify(command)}; use build or verify`);
const first = buildAll();
const second = buildAll();
compareBuilds(first, second);
if (command === 'build') writeArtifacts(first.artifacts);
else verifyArtifacts(first.artifacts);
report(first, command === '--verify' ? 'verify' : command);
