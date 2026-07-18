#!/usr/bin/env node

/**
 * Build and verify Loop Survivors' original pixel-art gameplay and UI atlases.
 *
 * This intentionally has no npm image dependency. It decodes the committed RGB
 * PNG source boards, flood-removes their flat #ff00ff chroma background,
 * downsamples each subject with nearest-neighbour sampling, creates a subtle
 * second actor frame with pixel-only motion, and writes one RGBA Pixi atlas.
 *
 * Usage:
 *   node scripts/build-pixel-art.mjs
 *   node scripts/build-pixel-art.mjs build
 *   node scripts/build-pixel-art.mjs verify
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTOR_SOURCE = resolve(REPO, 'art-src/pixel/actors-source.png');
const COMBAT_SOURCE = resolve(REPO, 'art-src/pixel/combat-source.png');
const UI_SOURCE = resolve(REPO, 'art-src/pixel/ui-source.png');
const ARENA_FLOOR_SOURCE = resolve(REPO, 'art-src/pixel/arena-floor-source.png');
const ENVIRONMENT_SOURCE = resolve(REPO, 'art-src/pixel/environment-source.png');
const ATLAS_PNG = resolve(REPO, 'public/art/pixel/gameplay.png');
const ATLAS_JSON = resolve(REPO, 'public/art/pixel/gameplay.json');
const UI_ATLAS_PNG = resolve(REPO, 'public/art/pixel/ui.png');
const UI_ATLAS_JSON = resolve(REPO, 'public/art/pixel/ui.json');
const ARENA_FLOOR_PNG = resolve(REPO, 'public/art/pixel/arena-floor.png');
const ENVIRONMENT_ATLAS_PNG = resolve(REPO, 'public/art/pixel/environment.png');
const ENVIRONMENT_ATLAS_JSON = resolve(REPO, 'public/art/pixel/environment.json');
const TITLE_BANNER_PNG = resolve(REPO, 'public/art/pixel/title-banner.png');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FRAME_SIZE = 96;
const ATLAS_SIZE = 1024;
const ATLAS_COLUMNS = 10;
const ATLAS_ORIGIN = 12;
const ATLAS_STEP = 100;
const UI_ATLAS_SIZE = 512;
const UI_ATLAS_COLUMNS = 5;
const UI_ATLAS_ORIGIN = 8;
const UI_ATLAS_STEP = 100;
const ARENA_FLOOR_SIZE = 512;
const ENVIRONMENT_ATLAS_SIZE = 512;
const ENVIRONMENT_ATLAS_COLUMNS = 4;
const ENVIRONMENT_ATLAS_ORIGIN = 8;
const ENVIRONMENT_ATLAS_STEP = 100;
const TITLE_LOGICAL_WIDTH = 320;
const TITLE_LOGICAL_HEIGHT = 180;
const TITLE_SCALE = 4;
const KEY = Object.freeze([255, 0, 255]);

const ACTORS = Object.freeze([
  { id: 'player', cell: 0, size: 82 },
  { id: 'swarmer', cell: 1, size: 42 },
  { id: 'tank', cell: 8, size: 76 },
  { id: 'darter', cell: 2, size: 46 },
  { id: 'splitter', cell: 17, size: 62 },
  { id: 'charger', cell: 5, size: 68 },
  { id: 'circler', cell: 6, size: 56 },
  { id: 'shielded', cell: 7, size: 68 },
  { id: 'elite', cell: 24, size: 88 },
  { id: 'bat', cell: 9, size: 40 },
  { id: 'redBat', cell: 10, size: 46 },
  { id: 'redBat2', cell: 11, size: 50 },
  { id: 'zombie', cell: 12, size: 58 },
  { id: 'skeleton', cell: 13, size: 60 },
  { id: 'ghost', cell: 14, size: 56 },
  { id: 'greenMudman', cell: 15, size: 66 },
  { id: 'grayMudman', cell: 16, size: 66 },
  { id: 'flower', cell: 4, size: 60 },
  { id: 'glowingBat', cell: 18, size: 62 },
  { id: 'mantis', cell: 23, size: 88 },
  { id: 'batSwarm', cell: 20, size: 68 },
]);

// This order is the exact row-major order used to generate the combat board.
const WEAPON_ROLES = Object.freeze([
  'kick', 'clap', 'snare', 'hat', 'bass', 'lead', 'arp', 'chord', 'bell',
]);

const PICKUPS = Object.freeze([
  { id: 'xp-blue', cell: 18, size: 32 },
  { id: 'xp-green', cell: 19, size: 49 },
  { id: 'xp-red', cell: 20, size: 61 },
  { id: 'music-note', cell: 21, size: 45 },
  { id: 'reward-pedestal', cell: 22, size: 85 },
  { id: 'evolution-chest', cell: 23, size: 85 },
]);

const EFFECTS = Object.freeze([
  { id: 'impact-cyan', cell: 24, size: 40 },
  { id: 'impact-gold', cell: 25, size: 54 },
  { id: 'explosion', cell: 26, size: 72 },
  { id: 'death', cell: 27, size: 70 },
  { id: 'xp-collect', cell: 28, size: 58 },
  { id: 'celebration', cell: 29, size: 78 },
]);

// Exact 5x4 row-major order of the generated UI board. Category is encoded in
// the frame key so game code cannot accidentally substitute a status glyph for
// a passive item or menu action.
const UI_ICONS = Object.freeze([
  { id: 'highTops', category: 'items', size: 82 },
  { id: 'fastForward', category: 'items', size: 82 },
  { id: 'needleTips', category: 'items', size: 82 },
  { id: 'mirrorball', category: 'items', size: 82 },
  { id: 'wideLens', category: 'items', size: 82 },
  { id: 'heavyAmp', category: 'items', size: 82 },
  { id: 'extensionCable', category: 'items', size: 82 },
  { id: 'magnetLanyard', category: 'items', size: 82 },
  { id: 'paddedJacket', category: 'items', size: 82 },
  { id: 'recoveryTape', category: 'items', size: 82 },
  { id: 'heart', category: 'status', size: 68 },
  { id: 'xp', category: 'status', size: 68 },
  { id: 'note', category: 'status', size: 68 },
  { id: 'level', category: 'status', size: 68 },
  { id: 'pause', category: 'status', size: 68 },
  { id: 'reroll', category: 'actions', size: 72 },
  { id: 'shop', category: 'actions', size: 72 },
  { id: 'evolution', category: 'actions', size: 72 },
  { id: 'weapon-pedestal', category: 'actions', size: 72 },
  { id: 'enemy-skull', category: 'actions', size: 72 },
]);

const ENVIRONMENT_PROPS = Object.freeze([
  { id: 'broken-pillar', size: 82 },
  { id: 'rune-pillar', size: 84 },
  { id: 'cyan-brazier', size: 70 },
  { id: 'gold-brazier', size: 70 },
  { id: 'rubble', size: 72 },
  { id: 'sarcophagus', size: 82 },
  { id: 'hooded-statue', size: 86 },
  { id: 'knight-statue', size: 88 },
  { id: 'bones', size: 70 },
  { id: 'mushrooms', size: 66 },
  { id: 'thorn-vines', size: 82 },
  { id: 'gravestone', size: 72 },
  { id: 'cyan-crystals', size: 78 },
  { id: 'purple-banner', size: 82 },
  { id: 'campfire', size: 68 },
  { id: 'rune-dais', size: 88 },
]);

function actorKey(id, frame) {
  return id === 'player'
    ? `actors/player/${frame}`
    : `actors/enemies/${id}/${frame}`;
}

function expectedFrameKeys() {
  const keys = [];
  for (const actor of ACTORS) keys.push(actorKey(actor.id, 'idle'), actorKey(actor.id, 'walk'));
  for (const role of WEAPON_ROLES) keys.push(`weapons/${role}/normal`);
  for (const role of WEAPON_ROLES) keys.push(`weapons/${role}/evolved`);
  for (const pickup of PICKUPS) keys.push(`pickups/${pickup.id}`);
  for (const effect of EFFECTS) keys.push(`fx/${effect.id}`);
  return keys;
}

function uiIconKey(icon) {
  return `ui/${icon.category}/${icon.id}`;
}

function expectedUiFrameKeys() {
  return UI_ICONS.map(uiIconKey);
}

function environmentKey(prop) {
  return `environment/${prop.id}`;
}

function expectedEnvironmentFrameKeys() {
  return ENVIRONMENT_PROPS.map(environmentKey);
}

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

function pngChunk(type, payload = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 0);
  return Buffer.concat([length, typeBytes, payload, checksum]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(path) {
  const encoded = readFileSync(path);
  if (!encoded.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${path}: invalid PNG signature`);
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
    const actualCrc = crc32(encoded.subarray(offset + 4, offset + 8 + length));
    if (storedCrc !== actualCrc) throw new Error(`${path}: bad ${type} CRC`);
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
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(`${path}: expected non-interlaced 8-bit RGB/RGBA PNG, got depth=${bitDepth}, color=${colorType}, interlace=${interlace}`);
  }
  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const packed = inflateSync(Buffer.concat(idat));
  if (packed.length !== (stride + 1) * height) {
    throw new Error(`${path}: unexpected decompressed byte count`);
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
        default: throw new Error(`${path}: unsupported PNG row filter ${filter}`);
      }
      rows[row + x] = value & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < rows.length; i += channels, p += 4) {
    data[p] = rows[i];
    data[p + 1] = rows[i + 1];
    data[p + 2] = rows[i + 2];
    data[p + 3] = channels === 4 ? rows[i + 3] : 255;
  }
  return { width, height, data, bitDepth, colorType, interlace };
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
    const dst = y * (stride + 1);
    scanlines[dst] = 0;
    scanlines.set(image.data.subarray(y * stride, (y + 1) * stride), dst + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('sRGB', Buffer.from([0])),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND'),
  ]);
}

function emptyImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

function pixelOffset(image, x, y) {
  return (y * image.width + x) * 4;
}

function cropGridCell(source, columns, rows, index) {
  const column = index % columns;
  const row = Math.floor(index / columns);
  if (row >= rows) throw new Error(`source cell ${index} is outside ${columns}x${rows}`);
  const x0 = Math.floor(column * source.width / columns);
  const x1 = Math.floor((column + 1) * source.width / columns);
  const y0 = Math.floor(row * source.height / rows);
  const y1 = Math.floor((row + 1) * source.height / rows);
  const result = emptyImage(x1 - x0, y1 - y0);
  for (let y = 0; y < result.height; y++) {
    const sourceStart = pixelOffset(source, x0, y0 + y);
    const sourceEnd = sourceStart + result.width * 4;
    result.data.set(source.data.subarray(sourceStart, sourceEnd), y * result.width * 4);
  }
  return result;
}

function cropImage(source, x0, y0, width, height) {
  if (x0 < 0 || y0 < 0 || x0 + width > source.width || y0 + height > source.height) {
    throw new Error('crop rectangle is outside source image');
  }
  const result = emptyImage(width, height);
  for (let y = 0; y < height; y++) {
    const sourceStart = pixelOffset(source, x0, y0 + y);
    const sourceEnd = sourceStart + width * 4;
    result.data.set(source.data.subarray(sourceStart, sourceEnd), y * width * 4);
  }
  return result;
}

function nearestScale(source, width, height) {
  const result = emptyImage(width, height);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
      const src = pixelOffset(source, sourceX, sourceY);
      const dst = pixelOffset(result, x, y);
      result.data[dst] = source.data[src];
      result.data[dst + 1] = source.data[src + 1];
      result.data[dst + 2] = source.data[src + 2];
      result.data[dst + 3] = source.data[src + 3];
    }
  }
  return result;
}

function keyDistance(r, g, b) {
  return Math.max(Math.abs(r - KEY[0]), Math.abs(g - KEY[1]), Math.abs(b - KEY[2]));
}

function exactKeyLike(r, g, b) {
  return keyDistance(r, g, b) <= 28;
}

function floodKeyLike(r, g, b) {
  if (keyDistance(r, g, b) <= 82) return true;
  const dominance = Math.min(r, b) - g;
  return r >= 185 && b >= 185 && g <= 112 && dominance >= 92 && Math.abs(r - b) <= 96;
}

/** Hard chroma removal for true pixel art: alpha is always 0 or 255. Exact
 * key-colored holes are removed globally; the broader matte is only removed
 * when connected to a cell edge, so intentional internal purple survives. */
function removeChroma(source) {
  const result = emptyImage(source.width, source.height);
  result.data.set(source.data);
  const pixels = source.width * source.height;
  const background = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0;
  let tail = 0;

  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= source.width || y >= source.height) return;
    const index = y * source.width + x;
    if (background[index]) return;
    const p = index * 4;
    if (!floodKeyLike(source.data[p], source.data[p + 1], source.data[p + 2])) return;
    background[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < source.width; x++) {
    enqueue(x, 0);
    enqueue(x, source.height - 1);
  }
  for (let y = 0; y < source.height; y++) {
    enqueue(0, y);
    enqueue(source.width - 1, y);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % source.width;
    const y = Math.floor(index / source.width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }

  // Exact chroma is background even inside closed shapes (rings, arm gaps).
  for (let index = 0; index < pixels; index++) {
    const p = index * 4;
    if (exactKeyLike(source.data[p], source.data[p + 1], source.data[p + 2])) background[index] = 1;
  }

  // Contract only key-biased fringe pixels adjacent to known background.
  for (let pass = 0; pass < 2; pass++) {
    const remove = [];
    for (let y = 1; y < source.height - 1; y++) {
      for (let x = 1; x < source.width - 1; x++) {
        const index = y * source.width + x;
        if (background[index]) continue;
        const p = index * 4;
        const r = source.data[p];
        const g = source.data[p + 1];
        const b = source.data[p + 2];
        const adjacent = background[index - 1] || background[index + 1] ||
          background[index - source.width] || background[index + source.width];
        if (adjacent && keyDistance(r, g, b) <= 132 && Math.min(r, b) - g >= 64) remove.push(index);
      }
    }
    for (const index of remove) background[index] = 1;
  }

  for (let index = 0; index < pixels; index++) {
    const p = index * 4;
    if (background[index]) {
      result.data[p] = 0;
      result.data[p + 1] = 0;
      result.data[p + 2] = 0;
      result.data[p + 3] = 0;
    } else {
      result.data[p + 3] = 255;
    }
  }
  return result;
}

function alphaBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[pixelOffset(image, x, y) + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('source cell became empty after chroma removal');
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function normalizeCell(source, targetMax, alignBottom) {
  const bounds = alphaBounds(source);
  const scale = Math.min(targetMax / bounds.width, targetMax / bounds.height);
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  const result = emptyImage(FRAME_SIZE, FRAME_SIZE);
  const left = Math.floor((FRAME_SIZE - width) / 2);
  const top = alignBottom ? FRAME_SIZE - 4 - height : Math.floor((FRAME_SIZE - height) / 2);
  for (let y = 0; y < height; y++) {
    const sourceY = bounds.minY + Math.min(bounds.height - 1, Math.floor(y * bounds.height / height));
    for (let x = 0; x < width; x++) {
      const sourceX = bounds.minX + Math.min(bounds.width - 1, Math.floor(x * bounds.width / width));
      const src = pixelOffset(source, sourceX, sourceY);
      const dst = pixelOffset(result, left + x, top + y);
      result.data[dst] = source.data[src];
      result.data[dst + 1] = source.data[src + 1];
      result.data[dst + 2] = source.data[src + 2];
      result.data[dst + 3] = source.data[src + 3];
    }
  }
  return result;
}

/** A one-pixel body lift above planted feet. This is a genuine second bitmap
 * frame (not runtime scale/rotation), with no interpolation or soft alpha. */
function actorWalkVariant(idle) {
  const bounds = alphaBounds(idle);
  const result = emptyImage(idle.width, idle.height);
  const plantedFrom = bounds.minY + Math.floor(bounds.height * 0.78);
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const src = pixelOffset(idle, x, y);
      if (idle.data[src + 3] === 0) continue;
      const targetY = y < plantedFrom ? Math.max(0, y - 1) : y;
      const dst = pixelOffset(result, x, targetY);
      result.data[dst] = idle.data[src];
      result.data[dst + 1] = idle.data[src + 1];
      result.data[dst + 2] = idle.data[src + 2];
      result.data[dst + 3] = 255;
    }
  }
  return result;
}

function blit(source, target, x0, y0) {
  for (let y = 0; y < source.height; y++) {
    const src = y * source.width * 4;
    const dst = pixelOffset(target, x0, y0 + y);
    target.data.set(source.data.subarray(src, src + source.width * 4), dst);
  }
}

function buildAtlas() {
  const actorBoard = decodePng(ACTOR_SOURCE);
  const combatBoard = decodePng(COMBAT_SOURCE);
  const atlas = emptyImage(ATLAS_SIZE, ATLAS_SIZE);
  const frames = {};
  const animations = {};
  let frameIndex = 0;

  const addFrame = (key, image, anchor) => {
    const column = frameIndex % ATLAS_COLUMNS;
    const row = Math.floor(frameIndex / ATLAS_COLUMNS);
    const x = ATLAS_ORIGIN + column * ATLAS_STEP;
    const y = ATLAS_ORIGIN + row * ATLAS_STEP;
    if (x + FRAME_SIZE > ATLAS_SIZE || y + FRAME_SIZE > ATLAS_SIZE) {
      throw new Error(`atlas capacity exceeded while placing ${key}`);
    }
    blit(image, atlas, x, y);
    frames[key] = {
      frame: { x, y, w: FRAME_SIZE, h: FRAME_SIZE },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
      anchor,
    };
    frameIndex++;
  };

  for (const actor of ACTORS) {
    const extracted = removeChroma(cropGridCell(actorBoard, 5, 5, actor.cell));
    const idle = normalizeCell(extracted, actor.size, true);
    const walk = actorWalkVariant(idle);
    const idleKey = actorKey(actor.id, 'idle');
    const walkKey = actorKey(actor.id, 'walk');
    addFrame(idleKey, idle, { x: 0.5, y: 0.92 });
    addFrame(walkKey, walk, { x: 0.5, y: 0.92 });
    animations[actor.id === 'player' ? 'actors/player' : `actors/enemies/${actor.id}`] = [idleKey, walkKey];
  }

  for (let i = 0; i < WEAPON_ROLES.length; i++) {
    const role = WEAPON_ROLES[i];
    const extracted = removeChroma(cropGridCell(combatBoard, 6, 5, i));
    addFrame(
      `weapons/${role}/normal`,
      normalizeCell(extracted, role === 'bass' ? 86 : 80, false),
      { x: 0.5, y: 0.5 },
    );
  }
  for (let i = 0; i < WEAPON_ROLES.length; i++) {
    const role = WEAPON_ROLES[i];
    const extracted = removeChroma(cropGridCell(combatBoard, 6, 5, i + WEAPON_ROLES.length));
    addFrame(
      `weapons/${role}/evolved`,
      normalizeCell(extracted, role === 'bass' ? 88 : 84, false),
      { x: 0.5, y: 0.5 },
    );
  }
  for (const pickup of PICKUPS) {
    const extracted = removeChroma(cropGridCell(combatBoard, 6, 5, pickup.cell));
    addFrame(`pickups/${pickup.id}`, normalizeCell(extracted, pickup.size, false), { x: 0.5, y: 0.5 });
  }
  for (const effect of EFFECTS) {
    const extracted = removeChroma(cropGridCell(combatBoard, 6, 5, effect.cell));
    addFrame(`fx/${effect.id}`, normalizeCell(extracted, effect.size, false), { x: 0.5, y: 0.5 });
  }

  const json = {
    frames,
    animations,
    meta: {
      app: 'Loop Survivors deterministic pixel-art builder',
      version: '1.0',
      image: 'gameplay.png',
      format: 'RGBA8888',
      size: { w: ATLAS_SIZE, h: ATLAS_SIZE },
      scale: '1',
    },
  };
  writeFileSync(ATLAS_PNG, encodePng(atlas));
  writeFileSync(ATLAS_JSON, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`built ${frameIndex} transparent pixel-art frames -> public/art/pixel/gameplay.{png,json}`);
}

function buildUiAtlas() {
  const board = decodePng(UI_SOURCE);
  const atlas = emptyImage(UI_ATLAS_SIZE, UI_ATLAS_SIZE);
  const frames = {};

  for (let index = 0; index < UI_ICONS.length; index++) {
    const icon = UI_ICONS[index];
    const column = index % UI_ATLAS_COLUMNS;
    const row = Math.floor(index / UI_ATLAS_COLUMNS);
    const x = UI_ATLAS_ORIGIN + column * UI_ATLAS_STEP;
    const y = UI_ATLAS_ORIGIN + row * UI_ATLAS_STEP;
    if (x + FRAME_SIZE > UI_ATLAS_SIZE || y + FRAME_SIZE > UI_ATLAS_SIZE) {
      throw new Error(`UI atlas capacity exceeded while placing ${icon.id}`);
    }
    const extracted = removeChroma(cropGridCell(board, 5, 4, index));
    const normalized = normalizeCell(extracted, icon.size, false);
    blit(normalized, atlas, x, y);
    frames[uiIconKey(icon)] = {
      frame: { x, y, w: FRAME_SIZE, h: FRAME_SIZE },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
      anchor: { x: 0.5, y: 0.5 },
    };
  }

  const json = {
    frames,
    meta: {
      app: 'Loop Survivors deterministic pixel-art builder',
      version: '1.0',
      image: 'ui.png',
      format: 'RGBA8888',
      size: { w: UI_ATLAS_SIZE, h: UI_ATLAS_SIZE },
      scale: '1',
    },
  };
  writeFileSync(UI_ATLAS_PNG, encodePng(atlas));
  writeFileSync(UI_ATLAS_JSON, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`built ${UI_ICONS.length} transparent pixel-art frames -> public/art/pixel/ui.{png,json}`);
}

function buildEnvironmentAtlas() {
  const board = decodePng(ENVIRONMENT_SOURCE);
  const atlas = emptyImage(ENVIRONMENT_ATLAS_SIZE, ENVIRONMENT_ATLAS_SIZE);
  const frames = {};

  for (let index = 0; index < ENVIRONMENT_PROPS.length; index++) {
    const prop = ENVIRONMENT_PROPS[index];
    const column = index % ENVIRONMENT_ATLAS_COLUMNS;
    const row = Math.floor(index / ENVIRONMENT_ATLAS_COLUMNS);
    const x = ENVIRONMENT_ATLAS_ORIGIN + column * ENVIRONMENT_ATLAS_STEP;
    const y = ENVIRONMENT_ATLAS_ORIGIN + row * ENVIRONMENT_ATLAS_STEP;
    const extracted = removeChroma(cropGridCell(board, 4, 4, index));
    const normalized = normalizeCell(extracted, prop.size, true);
    blit(normalized, atlas, x, y);
    frames[environmentKey(prop)] = {
      frame: { x, y, w: FRAME_SIZE, h: FRAME_SIZE },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: FRAME_SIZE, h: FRAME_SIZE },
      sourceSize: { w: FRAME_SIZE, h: FRAME_SIZE },
      anchor: { x: 0.5, y: 0.92 },
    };
  }

  const json = {
    frames,
    meta: {
      app: 'Loop Survivors deterministic pixel-art builder',
      version: '1.0',
      image: 'environment.png',
      format: 'RGBA8888',
      size: { w: ENVIRONMENT_ATLAS_SIZE, h: ENVIRONMENT_ATLAS_SIZE },
      scale: '1',
    },
  };
  writeFileSync(ENVIRONMENT_ATLAS_PNG, encodePng(atlas));
  writeFileSync(ENVIRONMENT_ATLAS_JSON, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`built ${ENVIRONMENT_PROPS.length} transparent environment frames -> public/art/pixel/environment.{png,json}`);
}

function blendChannel(a, b, bWeight) {
  return Math.round(a * (1 - bWeight) + b * bWeight);
}

/** Build a repeatable floor from a centered 1024px crop reduced by an exact
 * integer factor of two. Narrow edge bands meet at the same color on opposite
 * borders; unlike mirroring the whole tile, this retains the source's organic
 * cobblestone layout and avoids an obvious kaleidoscope in the arena. */
function buildArenaFloor() {
  const source = decodePng(ARENA_FLOOR_SOURCE);
  const cropSize = 1024;
  if (source.width < cropSize || source.height < cropSize) {
    throw new Error(`arena floor source must be at least ${cropSize}x${cropSize}`);
  }
  const x0 = Math.floor((source.width - cropSize) / 2);
  const y0 = Math.floor((source.height - cropSize) / 2);
  const natural = nearestScale(cropImage(source, x0, y0, cropSize, cropSize), ARENA_FLOOR_SIZE, ARENA_FLOOR_SIZE);
  const floor = emptyImage(ARENA_FLOOR_SIZE, ARENA_FLOOR_SIZE);
  floor.data.set(natural.data);
  const margin = 56;

  // Left/right seam. Both outside pixels resolve to the same 50/50 pair;
  // toward the inside of each band, the original source reaches full weight.
  for (let y = 0; y < floor.height; y++) {
    for (let distance = 0; distance < margin; distance++) {
      const leftX = distance;
      const rightX = floor.width - 1 - distance;
      const left = pixelOffset(natural, leftX, y);
      const right = pixelOffset(natural, rightX, y);
      const ownWeight = 0.5 + 0.5 * distance / (margin - 1);
      for (let channel = 0; channel < 3; channel++) {
        floor.data[left + channel] = blendChannel(natural.data[right + channel], natural.data[left + channel], ownWeight);
        floor.data[right + channel] = blendChannel(natural.data[left + channel], natural.data[right + channel], ownWeight);
      }
      floor.data[left + 3] = 255;
      floor.data[right + 3] = 255;
    }
  }

  // Top/bottom seam, based on the already side-stitched tile so all four
  // corners remain repeatable in both axes.
  const sideStitched = emptyImage(floor.width, floor.height);
  sideStitched.data.set(floor.data);
  for (let x = 0; x < floor.width; x++) {
    for (let distance = 0; distance < margin; distance++) {
      const topY = distance;
      const bottomY = floor.height - 1 - distance;
      const top = pixelOffset(sideStitched, x, topY);
      const bottom = pixelOffset(sideStitched, x, bottomY);
      const ownWeight = 0.5 + 0.5 * distance / (margin - 1);
      for (let channel = 0; channel < 3; channel++) {
        floor.data[top + channel] = blendChannel(sideStitched.data[bottom + channel], sideStitched.data[top + channel], ownWeight);
        floor.data[bottom + channel] = blendChannel(sideStitched.data[top + channel], sideStitched.data[bottom + channel], ownWeight);
      }
      floor.data[top + 3] = 255;
      floor.data[bottom + 3] = 255;
    }
  }
  writeFileSync(ARENA_FLOOR_PNG, encodePng(floor));
  console.log(`built seamless opaque ${ARENA_FLOOR_SIZE}x${ARENA_FLOOR_SIZE} floor -> public/art/pixel/arena-floor.png`);
}

function atlasFrame(atlas, json, key) {
  const frame = json.frames?.[key]?.frame;
  if (!frame) throw new Error(`cannot compose missing atlas frame ${JSON.stringify(key)}`);
  return cropImage(atlas, frame.x, frame.y, frame.w, frame.h);
}

function alphaBlit(source, target, x0, y0) {
  for (let y = 0; y < source.height; y++) {
    const targetY = y0 + y;
    if (targetY < 0 || targetY >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const targetX = x0 + x;
      if (targetX < 0 || targetX >= target.width) continue;
      const src = pixelOffset(source, x, y);
      if (source.data[src + 3] === 0) continue;
      const dst = pixelOffset(target, targetX, targetY);
      target.data[dst] = source.data[src];
      target.data[dst + 1] = source.data[src + 1];
      target.data[dst + 2] = source.data[src + 2];
      target.data[dst + 3] = 255;
    }
  }
}

function darkenImage(image, numerator, denominator) {
  const result = emptyImage(image.width, image.height);
  for (let p = 0; p < image.data.length; p += 4) {
    result.data[p] = Math.floor(image.data[p] * numerator / denominator);
    result.data[p + 1] = Math.floor(image.data[p + 1] * numerator / denominator);
    result.data[p + 2] = Math.floor(image.data[p + 2] * numerator / denominator);
    result.data[p + 3] = image.data[p + 3];
  }
  return result;
}

/** Compose a text-free start-screen scene at 320x180, then integer-upscale it
 * four times. Keeping text in HTML preserves localization and readability. */
function buildTitleBanner() {
  const floor = decodePng(ARENA_FLOOR_PNG);
  const gameplay = decodePng(ATLAS_PNG);
  const gameplayJson = JSON.parse(readFileSync(ATLAS_JSON, 'utf8'));
  const environment = decodePng(ENVIRONMENT_ATLAS_PNG);
  const environmentJson = JSON.parse(readFileSync(ENVIRONMENT_ATLAS_JSON, 'utf8'));
  const logical = darkenImage(cropImage(floor, 96, 166, TITLE_LOGICAL_WIDTH, TITLE_LOGICAL_HEIGHT), 3, 4);

  const prop = (id, x, y) => alphaBlit(atlasFrame(environment, environmentJson, `environment/${id}`), logical, x, y);
  const actor = (key, x, y) => alphaBlit(atlasFrame(gameplay, gameplayJson, key), logical, x, y);
  const fx = (id, x, y) => alphaBlit(atlasFrame(gameplay, gameplayJson, `fx/${id}`), logical, x, y);

  // Ruins establish depth first; the lower-right battle tableau remains clear
  // of the live title lockup that sits over the darkened left side in HTML.
  prop('rune-pillar', 112, 20);
  prop('broken-pillar', 275, 48);
  prop('gravestone', 40, 70);
  prop('cyan-crystals', 256, 100);
  prop('thorn-vines', 6, 102);
  prop('rune-dais', 181, 84);
  prop('cyan-brazier', 113, 103);
  prop('gold-brazier', 254, 102);

  actor('actors/enemies/ghost/idle', 250, 4);
  actor('actors/enemies/batSwarm/idle', 36, 7);
  actor('actors/enemies/greenMudman/idle', 76, 75);
  actor('actors/enemies/skeleton/idle', 256, 66);
  actor('actors/enemies/glowingBat/idle', 145, 19);
  actor('actors/player/idle', 184, 53);
  fx('impact-cyan', 189, 30);
  fx('impact-gold', 236, 79);

  // One-pixel logical frame gives the image a deliberate sprite-panel edge;
  // it becomes four physical pixels after the exact upscale.
  for (let x = 0; x < logical.width; x++) {
    for (const y of [0, logical.height - 1]) {
      const p = pixelOffset(logical, x, y);
      logical.data[p] = 4; logical.data[p + 1] = 8; logical.data[p + 2] = 14; logical.data[p + 3] = 255;
    }
  }
  for (let y = 0; y < logical.height; y++) {
    for (const x of [0, logical.width - 1]) {
      const p = pixelOffset(logical, x, y);
      logical.data[p] = 4; logical.data[p + 1] = 8; logical.data[p + 2] = 14; logical.data[p + 3] = 255;
    }
  }

  const upscaled = nearestScale(logical, logical.width * TITLE_SCALE, logical.height * TITLE_SCALE);
  writeFileSync(TITLE_BANNER_PNG, encodePng(upscaled));
  console.log(`built text-free ${upscaled.width}x${upscaled.height} title banner from a ${logical.width}x${logical.height} pixel composition`);
}

function pixelHash(image, frame) {
  let hash = 2166136261;
  for (let y = frame.y; y < frame.y + frame.h; y++) {
    for (let x = frame.x; x < frame.x + frame.w; x++) {
      const p = pixelOffset(image, x, y);
      for (let channel = 0; channel < 4; channel++) {
        hash ^= image.data[p + channel];
        hash = Math.imul(hash, 16777619);
      }
    }
  }
  return hash >>> 0;
}

function verifyAtlas() {
  const atlas = decodePng(ATLAS_PNG);
  const json = JSON.parse(readFileSync(ATLAS_JSON, 'utf8'));
  const fail = (message) => { throw new Error(`pixel-art verification failed: ${message}`); };
  if (atlas.width !== ATLAS_SIZE || atlas.height !== ATLAS_SIZE) fail(`atlas must be ${ATLAS_SIZE}x${ATLAS_SIZE}`);
  if (atlas.colorType !== 6 || atlas.bitDepth !== 8 || atlas.interlace !== 0) fail('atlas must be non-interlaced RGBA8888');
  if (json.meta?.image !== 'gameplay.png') fail('atlas JSON image reference is wrong');
  if (json.meta?.format !== 'RGBA8888') fail('atlas JSON format is wrong');

  const expected = expectedFrameKeys();
  const actual = Object.keys(json.frames ?? {});
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length) fail(`missing frames: ${missing.join(', ')}`);
  if (extra.length) fail(`unexpected frames: ${extra.join(', ')}`);
  if (actual.length !== expected.length) fail(`expected ${expected.length} frames, found ${actual.length}`);

  const occupied = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE);
  for (const key of expected) {
    const entry = json.frames[key];
    const frame = entry?.frame;
    if (!frame || !Number.isInteger(frame.x) || !Number.isInteger(frame.y)) fail(`${key} has a non-integer frame`);
    if (frame.w !== FRAME_SIZE || frame.h !== FRAME_SIZE) fail(`${key} is not an exact ${FRAME_SIZE}x${FRAME_SIZE} cell`);
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.w > atlas.width || frame.y + frame.h > atlas.height) fail(`${key} is outside atlas bounds`);
    let opaque = 0;
    let transparent = 0;
    let borderOpaque = 0;
    let visibleExactKey = 0;
    for (let y = frame.y; y < frame.y + frame.h; y++) {
      for (let x = frame.x; x < frame.x + frame.w; x++) {
        const atlasIndex = y * atlas.width + x;
        if (occupied[atlasIndex]) fail(`${key} overlaps another frame`);
        occupied[atlasIndex] = 1;
        const p = atlasIndex * 4;
        const alpha = atlas.data[p + 3];
        if (alpha !== 0 && alpha !== 255) fail(`${key} contains soft alpha ${alpha}`);
        if (alpha === 0) {
          transparent++;
          if (atlas.data[p] || atlas.data[p + 1] || atlas.data[p + 2]) fail(`${key} has non-zero RGB under alpha=0`);
        } else {
          opaque++;
          if (exactKeyLike(atlas.data[p], atlas.data[p + 1], atlas.data[p + 2])) visibleExactKey++;
          const localX = x - frame.x;
          const localY = y - frame.y;
          if (localX === 0 || localY === 0 || localX === frame.w - 1 || localY === frame.h - 1) borderOpaque++;
        }
      }
    }
    if (opaque === 0 || transparent === 0) fail(`${key} must contain both art and transparency`);
    if (borderOpaque !== 0) fail(`${key} touches its frame border`);
    if (visibleExactKey !== 0) fail(`${key} retains ${visibleExactKey} chroma-key pixels`);
  }

  for (const actor of ACTORS) {
    const animationKey = actor.id === 'player' ? 'actors/player' : `actors/enemies/${actor.id}`;
    const idleKey = actorKey(actor.id, 'idle');
    const walkKey = actorKey(actor.id, 'walk');
    const animation = json.animations?.[animationKey];
    if (!Array.isArray(animation) || animation.length !== 2 || animation[0] !== idleKey || animation[1] !== walkKey) {
      fail(`${animationKey} must expose idle/walk in order`);
    }
    if (pixelHash(atlas, json.frames[idleKey].frame) === pixelHash(atlas, json.frames[walkKey].frame)) {
      fail(`${animationKey} frames are identical`);
    }
  }

  for (let p = 0; p < atlas.data.length; p += 4) {
    if (atlas.data[p + 3] === 0 && (atlas.data[p] || atlas.data[p + 1] || atlas.data[p + 2])) {
      fail('atlas contains hidden matte RGB outside declared frames');
    }
  }
  console.log(`verified ${expected.length} exact frames: RGBA8888, hard alpha, zero transparent RGB, no matte, no overlap`);
}

function verifyUiAtlas() {
  const atlas = decodePng(UI_ATLAS_PNG);
  const json = JSON.parse(readFileSync(UI_ATLAS_JSON, 'utf8'));
  const fail = (message) => { throw new Error(`pixel-art UI verification failed: ${message}`); };
  if (atlas.width !== UI_ATLAS_SIZE || atlas.height !== UI_ATLAS_SIZE) {
    fail(`atlas must be ${UI_ATLAS_SIZE}x${UI_ATLAS_SIZE}`);
  }
  if (atlas.colorType !== 6 || atlas.bitDepth !== 8 || atlas.interlace !== 0) {
    fail('atlas must be non-interlaced RGBA8888');
  }
  if (json.meta?.image !== 'ui.png' || json.meta?.format !== 'RGBA8888') fail('atlas metadata is wrong');

  const expected = expectedUiFrameKeys();
  const actual = Object.keys(json.frames ?? {});
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length) fail(`missing frames: ${missing.join(', ')}`);
  if (extra.length) fail(`unexpected frames: ${extra.join(', ')}`);
  if (actual.length !== expected.length) fail(`expected ${expected.length} frames, found ${actual.length}`);

  const occupied = new Uint8Array(UI_ATLAS_SIZE * UI_ATLAS_SIZE);
  for (const key of expected) {
    const frame = json.frames[key]?.frame;
    if (!frame || !Number.isInteger(frame.x) || !Number.isInteger(frame.y)) fail(`${key} has a non-integer frame`);
    if (frame.w !== FRAME_SIZE || frame.h !== FRAME_SIZE) fail(`${key} is not an exact ${FRAME_SIZE}x${FRAME_SIZE} cell`);
    if (frame.x < 0 || frame.y < 0 || frame.x + frame.w > atlas.width || frame.y + frame.h > atlas.height) {
      fail(`${key} is outside atlas bounds`);
    }
    let opaque = 0;
    let transparent = 0;
    let borderOpaque = 0;
    for (let y = frame.y; y < frame.y + frame.h; y++) {
      for (let x = frame.x; x < frame.x + frame.w; x++) {
        const atlasIndex = y * atlas.width + x;
        if (occupied[atlasIndex]) fail(`${key} overlaps another frame`);
        occupied[atlasIndex] = 1;
        const p = atlasIndex * 4;
        const alpha = atlas.data[p + 3];
        if (alpha !== 0 && alpha !== 255) fail(`${key} contains soft alpha ${alpha}`);
        if (alpha === 0) {
          transparent++;
          if (atlas.data[p] || atlas.data[p + 1] || atlas.data[p + 2]) fail(`${key} has non-zero RGB under alpha=0`);
        } else {
          opaque++;
          if (exactKeyLike(atlas.data[p], atlas.data[p + 1], atlas.data[p + 2])) fail(`${key} retains chroma-key pixels`);
          const localX = x - frame.x;
          const localY = y - frame.y;
          if (localX === 0 || localY === 0 || localX === frame.w - 1 || localY === frame.h - 1) borderOpaque++;
        }
      }
    }
    if (opaque === 0 || transparent === 0) fail(`${key} must contain both art and transparency`);
    if (borderOpaque !== 0) fail(`${key} touches its frame border`);
  }
  for (let p = 0; p < atlas.data.length; p += 4) {
    if (atlas.data[p + 3] === 0 && (atlas.data[p] || atlas.data[p + 1] || atlas.data[p + 2])) {
      fail('atlas contains hidden matte RGB outside declared frames');
    }
  }
  console.log(`verified ${expected.length} UI frames: RGBA8888, hard alpha, zero transparent RGB, no matte, no overlap`);
}

function verifyEnvironmentAtlas() {
  const atlas = decodePng(ENVIRONMENT_ATLAS_PNG);
  const json = JSON.parse(readFileSync(ENVIRONMENT_ATLAS_JSON, 'utf8'));
  const fail = (message) => { throw new Error(`pixel-art environment verification failed: ${message}`); };
  if (atlas.width !== ENVIRONMENT_ATLAS_SIZE || atlas.height !== ENVIRONMENT_ATLAS_SIZE) {
    fail(`atlas must be ${ENVIRONMENT_ATLAS_SIZE}x${ENVIRONMENT_ATLAS_SIZE}`);
  }
  if (atlas.colorType !== 6 || atlas.bitDepth !== 8 || atlas.interlace !== 0) {
    fail('atlas must be non-interlaced RGBA8888');
  }
  if (json.meta?.image !== 'environment.png' || json.meta?.format !== 'RGBA8888') fail('atlas metadata is wrong');

  const expected = expectedEnvironmentFrameKeys();
  const actual = Object.keys(json.frames ?? {});
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length) fail(`missing frames: ${missing.join(', ')}`);
  if (extra.length) fail(`unexpected frames: ${extra.join(', ')}`);
  if (actual.length !== expected.length) fail(`expected ${expected.length} frames, found ${actual.length}`);

  const occupied = new Uint8Array(ENVIRONMENT_ATLAS_SIZE * ENVIRONMENT_ATLAS_SIZE);
  for (const key of expected) {
    const frame = json.frames[key]?.frame;
    if (!frame || !Number.isInteger(frame.x) || !Number.isInteger(frame.y)) fail(`${key} has a non-integer frame`);
    if (frame.w !== FRAME_SIZE || frame.h !== FRAME_SIZE) fail(`${key} is not an exact ${FRAME_SIZE}x${FRAME_SIZE} cell`);
    let opaque = 0;
    let transparent = 0;
    let borderOpaque = 0;
    for (let y = frame.y; y < frame.y + frame.h; y++) {
      for (let x = frame.x; x < frame.x + frame.w; x++) {
        const atlasIndex = y * atlas.width + x;
        if (occupied[atlasIndex]) fail(`${key} overlaps another frame`);
        occupied[atlasIndex] = 1;
        const p = atlasIndex * 4;
        const alpha = atlas.data[p + 3];
        if (alpha !== 0 && alpha !== 255) fail(`${key} contains soft alpha ${alpha}`);
        if (alpha === 0) {
          transparent++;
          if (atlas.data[p] || atlas.data[p + 1] || atlas.data[p + 2]) fail(`${key} has non-zero RGB under alpha=0`);
        } else {
          opaque++;
          if (exactKeyLike(atlas.data[p], atlas.data[p + 1], atlas.data[p + 2])) fail(`${key} retains chroma-key pixels`);
          const localX = x - frame.x;
          const localY = y - frame.y;
          if (localX === 0 || localY === 0 || localX === frame.w - 1 || localY === frame.h - 1) borderOpaque++;
        }
      }
    }
    if (opaque === 0 || transparent === 0) fail(`${key} must contain both art and transparency`);
    if (borderOpaque !== 0) fail(`${key} touches its frame border`);
  }
  for (let p = 0; p < atlas.data.length; p += 4) {
    if (atlas.data[p + 3] === 0 && (atlas.data[p] || atlas.data[p + 1] || atlas.data[p + 2])) {
      fail('atlas contains hidden matte RGB outside declared frames');
    }
  }
  console.log(`verified ${expected.length} environment frames: RGBA8888, hard alpha, zero transparent RGB, no matte, no overlap`);
}

function verifyArenaFloor() {
  const floor = decodePng(ARENA_FLOOR_PNG);
  const fail = (message) => { throw new Error(`pixel-art arena floor verification failed: ${message}`); };
  if (floor.width !== ARENA_FLOOR_SIZE || floor.height !== ARENA_FLOOR_SIZE) {
    fail(`floor must be ${ARENA_FLOOR_SIZE}x${ARENA_FLOOR_SIZE}`);
  }
  if (floor.colorType !== 6 || floor.bitDepth !== 8 || floor.interlace !== 0) {
    fail('floor must be non-interlaced RGBA8888');
  }
  for (let y = 0; y < floor.height; y++) {
    for (let x = 0; x < floor.width; x++) {
      const p = pixelOffset(floor, x, y);
      if (floor.data[p + 3] !== 255) fail(`floor contains non-opaque alpha at ${x},${y}`);
    }
    const left = pixelOffset(floor, 0, y);
    const right = pixelOffset(floor, floor.width - 1, y);
    for (let channel = 0; channel < 4; channel++) {
      if (floor.data[left + channel] !== floor.data[right + channel]) fail(`left/right tile seam differs at y=${y}`);
    }
  }
  for (let x = 0; x < floor.width; x++) {
    const top = pixelOffset(floor, x, 0);
    const bottom = pixelOffset(floor, x, floor.height - 1);
    for (let channel = 0; channel < 4; channel++) {
      if (floor.data[top + channel] !== floor.data[bottom + channel]) fail(`top/bottom tile seam differs at x=${x}`);
    }
  }
  console.log(`verified seamless opaque ${ARENA_FLOOR_SIZE}x${ARENA_FLOOR_SIZE} RGBA8888 arena floor`);
}

function verifyTitleBanner() {
  const banner = decodePng(TITLE_BANNER_PNG);
  const expectedWidth = TITLE_LOGICAL_WIDTH * TITLE_SCALE;
  const expectedHeight = TITLE_LOGICAL_HEIGHT * TITLE_SCALE;
  const fail = (message) => { throw new Error(`pixel-art title banner verification failed: ${message}`); };
  if (banner.width !== expectedWidth || banner.height !== expectedHeight) {
    fail(`banner must be ${expectedWidth}x${expectedHeight}`);
  }
  if (banner.colorType !== 6 || banner.bitDepth !== 8 || banner.interlace !== 0) {
    fail('banner must be non-interlaced RGBA8888');
  }
  for (let y = 0; y < banner.height; y += TITLE_SCALE) {
    for (let x = 0; x < banner.width; x += TITLE_SCALE) {
      const reference = pixelOffset(banner, x, y);
      if (banner.data[reference + 3] !== 255) fail(`banner is not opaque at logical pixel ${x / TITLE_SCALE},${y / TITLE_SCALE}`);
      if (exactKeyLike(banner.data[reference], banner.data[reference + 1], banner.data[reference + 2])) {
        fail(`banner retains chroma key at logical pixel ${x / TITLE_SCALE},${y / TITLE_SCALE}`);
      }
      for (let dy = 0; dy < TITLE_SCALE; dy++) {
        for (let dx = 0; dx < TITLE_SCALE; dx++) {
          const p = pixelOffset(banner, x + dx, y + dy);
          for (let channel = 0; channel < 4; channel++) {
            if (banner.data[p + channel] !== banner.data[reference + channel]) {
              fail(`non-integer upscale block at ${x / TITLE_SCALE},${y / TITLE_SCALE}`);
            }
          }
        }
      }
    }
  }
  console.log(`verified opaque text-free title banner: ${TITLE_LOGICAL_WIDTH}x${TITLE_LOGICAL_HEIGHT} logical pixels at exact ${TITLE_SCALE}x scale`);
}

const command = process.argv[2] ?? 'build';
if (command === 'build') {
  buildAtlas();
  buildUiAtlas();
  buildArenaFloor();
  buildEnvironmentAtlas();
  buildTitleBanner();
  verifyAtlas();
  verifyUiAtlas();
  verifyArenaFloor();
  verifyEnvironmentAtlas();
  verifyTitleBanner();
} else if (command === 'verify' || command === '--verify') {
  verifyAtlas();
  verifyUiAtlas();
  verifyArenaFloor();
  verifyEnvironmentAtlas();
  verifyTitleBanner();
} else {
  throw new Error(`unknown command ${JSON.stringify(command)}; use build or verify`);
}
