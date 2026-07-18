#!/usr/bin/env node

/**
 * Deterministic native-grid art-direction prototypes for the pixel-art overhaul.
 *
 * The concept images in art-src/pixel-overhaul/concepts are visual references
 * only. This builder never reads, crops, samples, or resizes them. Every shape
 * below is authored directly on its final logical-pixel grid.
 *
 * Usage:
 *   node scripts/build-art-direction-candidates.mjs
 *   node scripts/build-art-direction-candidates.mjs --check
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = resolve(REPO, 'public/art/pixel/candidates');
const LOGICAL_WIDTH = 640;
const LOGICAL_HEIGHT = 360;
const ATLAS_WIDTH = 512;
const ATLAS_HEIGHT = 192;
const SILHOUETTE_WIDTH = 320;
const SILHOUETTE_HEIGHT = 104;
const ATLAS_PADDING = 2;
const WORLD_TO_LOGICAL = 0.5;
const SIMULATION_UNITS_PER_LOGICAL_PIXEL = 1 / WORLD_TO_LOGICAL;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DEBUG_COLLIDER = '#ff315f';
const DEBUG_PIVOT = '#3dff9a';

const DIRECTIONS = Object.freeze([
  Object.freeze({
    id: 'gilded-ossuary',
    name: 'Gilded Ossuary',
    style: 'gilded',
    explanation: 'Carved bone, worn stone, and restrained gold make the crypt feel ancient and severe. Cyan player accents and amber attacks lift the important action above the dark floor.',
    tradeoff: Object.freeze({
      readability: 'Strong silhouettes and bright gameplay accents; the stone detail needs disciplined restraint.',
      productionCost: 'Highest of the three because armor, bone, and trim need careful clusters.',
      mood: 'Somber, weighty, and richly archaeological.',
    }),
    palette: Object.freeze({
      void: '#070a0e',
      floor: '#101820',
      floorDetail: '#1b2730',
      outline: '#040609',
      shadow: '#252a2d',
      mid: '#55595a',
      light: '#a6a29a',
      highlight: '#ecddb5',
      accent: '#d89a30',
      focal: '#4bdcff',
      danger: '#7b4cb4',
      attack: '#ffad42',
      xp: '#31caff',
      currency: '#ffd45a',
      health: '#c63d4d',
      panel: '#15191d',
    }),
  }),
  Object.freeze({
    id: 'moonlit-tapestry',
    name: 'Moonlit Tapestry',
    style: 'moonlit',
    explanation: 'Soft indigo stone, pale masks, and woven lavender marks make the arena feel like a haunted storybook. Coral attacks and icy pickups stay distinct without breaking the quiet nighttime mood.',
    tradeoff: Object.freeze({
      readability: 'Calm value groups are easy on the eye; pale enemies need firm outlines in crowded scenes.',
      productionCost: 'Medium, with repeatable cloth, stone, and moon-mark patterns.',
      mood: 'Dreamlike, haunted, and gently ornate.',
    }),
    palette: Object.freeze({
      void: '#0b0d20',
      floor: '#17213b',
      floorDetail: '#253052',
      outline: '#090a1a',
      shadow: '#292b4a',
      mid: '#505779',
      light: '#9298b6',
      highlight: '#e5dcf4',
      accent: '#c493e4',
      focal: '#70e7ef',
      danger: '#9663c6',
      attack: '#f17d86',
      xp: '#55d9ff',
      currency: '#ffd173',
      health: '#ef6b7c',
      panel: '#202441',
    }),
  }),
  Object.freeze({
    id: 'arcade-reliquary',
    name: 'Arcade Reliquary',
    style: 'arcade',
    explanation: 'Chunky shapes, deep navy gaps, and electric color make every object read like an arcade token. Magenta danger, cyan pickups, and an orange player jacket create the fastest visual scan of the three.',
    tradeoff: Object.freeze({
      readability: 'Highest immediate contrast and the cleanest read at native size.',
      productionCost: 'Lowest, because broad clusters and compact ramps scale cleanly across the catalog.',
      mood: 'Fast, bold, and supernatural with an arcade edge.',
    }),
    palette: Object.freeze({
      void: '#03070d',
      floor: '#07111f',
      floorDetail: '#10264a',
      outline: '#020307',
      shadow: '#202238',
      mid: '#4b4e70',
      light: '#8d92b6',
      highlight: '#f5f3ff',
      accent: '#ff31ad',
      focal: '#20e4ff',
      danger: '#a83aff',
      attack: '#ff8b18',
      xp: '#2bdeff',
      currency: '#ffc33d',
      health: '#f23880',
      panel: '#111425',
    }),
  }),
]);

const CONSTRUCTION_RULES = Object.freeze({
  gilded: Object.freeze({
    lighting: 'upper-left',
    outline: 'narrow 1-pixel near-black contour with gold joint accents',
    shapeGrammar: 'tall plated reliquaries, narrow bone blades, angular gold fittings',
  }),
  moonlit: Object.freeze({
    lighting: 'upper-left selective rim',
    outline: 'soft indigo 1-pixel contour with pale cut-paper rims',
    shapeGrammar: 'asymmetric flowing capes, broad wings, crescents, petals, and tapered legs',
  }),
  arcade: Object.freeze({
    lighting: 'upper-left block highlight',
    outline: 'bold 2-pixel near-black contour and stepped neon corners',
    shapeGrammar: 'square cores, triangular wings and attacks, block limbs, minimal interior marks',
  }),
});

function assert(condition, message) {
  if (!condition) throw new Error(`candidate builder: ${message}`);
}

function image(width, height, fill = null) {
  assert(Number.isInteger(width) && width > 0, `invalid image width ${width}`);
  assert(Number.isInteger(height) && height > 0, `invalid image height ${height}`);
  const out = { width, height, data: new Uint8Array(width * height * 4) };
  if (fill) fillImage(out, fill);
  return out;
}

function cloneImage(source) {
  const out = image(source.width, source.height);
  out.data.set(source.data);
  return out;
}

function normalizeHex(hex) {
  assert(/^#[0-9a-f]{6}$/i.test(hex), `invalid color ${hex}`);
  return hex.toLowerCase();
}

function rgb(hex) {
  const normalized = normalizeHex(hex);
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function pixelIndex(target, x, y) {
  return (y * target.width + x) * 4;
}

function put(target, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const [r, g, b] = rgb(color);
  const p = pixelIndex(target, x, y);
  target.data[p] = r;
  target.data[p + 1] = g;
  target.data[p + 2] = b;
  target.data[p + 3] = 255;
}

function clearPixel(target, x, y) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  const p = pixelIndex(target, x, y);
  target.data[p] = 0;
  target.data[p + 1] = 0;
  target.data[p + 2] = 0;
  target.data[p + 3] = 0;
}

function fillImage(target, color) {
  const [r, g, b] = rgb(color);
  for (let p = 0; p < target.data.length; p += 4) {
    target.data[p] = r;
    target.data[p + 1] = g;
    target.data[p + 2] = b;
    target.data[p + 3] = 255;
  }
}

function rect(target, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy++) {
    for (let xx = x; xx < x + width; xx++) put(target, xx, yy, color);
  }
}

function line(target, x0, y0, x1, y1, color, thickness = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const radius = Math.floor((thickness - 1) / 2);
  while (true) {
    rect(target, x0 - radius, y0 - radius, thickness, thickness, color);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function ellipseOutline(target, cx, cy, rx, ry, color) {
  for (let x = -rx; x <= rx; x++) {
    const y = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))));
    put(target, cx + x, cy - y, color);
    put(target, cx + x, cy + y, color);
  }
  for (let y = -ry; y <= ry; y++) {
    const x = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    put(target, cx - x, cy + y, color);
    put(target, cx + x, cy + y, color);
  }
}

function circleOutline(target, cx, cy, radius, color) {
  ellipseOutline(target, cx, cy, radius, radius, color);
}

function mask(width, height) {
  return { width, height, data: new Uint8Array(width * height) };
}

function maskPut(target, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;
  target.data[y * target.width + x] = 1;
}

function maskRect(target, x, y, width, height) {
  for (let yy = y; yy < y + height; yy++) {
    for (let xx = x; xx < x + width; xx++) maskPut(target, xx, yy);
  }
}

function maskLine(target, x0, y0, x1, y1, thickness = 1) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const radius = Math.floor((thickness - 1) / 2);
  while (true) {
    maskRect(target, x0 - radius, y0 - radius, thickness, thickness);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function maskEllipse(target, cx, cy, rx, ry) {
  const minX = Math.floor(cx - rx);
  const maxX = Math.ceil(cx + rx);
  const minY = Math.floor(cy - ry);
  const maxY = Math.ceil(cy + ry);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) maskPut(target, x, y);
    }
  }
}

function maskPolygon(target, points) {
  const minX = Math.floor(Math.min(...points.map(([x]) => x)));
  const maxX = Math.ceil(Math.max(...points.map(([x]) => x)));
  const minY = Math.floor(Math.min(...points.map(([, y]) => y)));
  const maxY = Math.ceil(Math.max(...points.map(([, y]) => y)));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
        if (crosses) inside = !inside;
      }
      if (inside) maskPut(target, x, y);
    }
  }
}

function mergeMask(into, from) {
  assert(into.width === from.width && into.height === from.height, 'mask size mismatch');
  for (let i = 0; i < into.data.length; i++) if (from.data[i]) into.data[i] = 1;
}

function paintShape(target, shape, outlineColor, fillColor, outlineThickness = 1) {
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) {
      if (shape.data[y * shape.width + x]) continue;
      let neighbor = false;
      for (let dy = -outlineThickness; dy <= outlineThickness && !neighbor; dy++) {
        for (let dx = -outlineThickness; dx <= outlineThickness; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) continue;
          if (shape.data[ny * shape.width + nx]) {
            neighbor = true;
            break;
          }
        }
      }
      if (neighbor) put(target, x, y, outlineColor);
    }
  }
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) {
      if (shape.data[y * shape.width + x]) put(target, x, y, fillColor);
    }
  }
}

function paintDirectionShape(target, shape, direction, fillColor) {
  const outline = direction.style === 'moonlit' ? direction.palette.shadow : direction.palette.outline;
  paintShape(target, shape, outline, fillColor, direction.style === 'arcade' ? 2 : 1);
}

function paintInnerRim(target, shape, color) {
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) {
      if (!shape.data[y * shape.width + x]) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height || !shape.data[ny * shape.width + nx]) {
            edge = true;
            break;
          }
        }
      }
      if (edge) put(target, x, y, color);
    }
  }
}

function drawPlayer(direction) {
  const p = direction.palette;
  const out = image(32, 36);
  const body = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // Tall reliquary armor: narrow hood, weighted shoulder plates, split greaves.
    maskPolygon(body, [[13, 1], [19, 1], [22, 6], [21, 12], [11, 12], [10, 6]]);
    maskPolygon(body, [[9, 12], [23, 12], [27, 17], [24, 22], [22, 29], [21, 34], [17, 34], [16, 27], [14, 34], [9, 34], [10, 27], [7, 21], [5, 18]]);
    maskLine(body, 8, 16, 3, 23, 3);
    maskLine(body, 24, 16, 29, 21, 3);
    maskEllipse(body, 16, 26, 7, 7);
    paintDirectionShape(out, body, direction, p.shadow);
    rect(out, 12, 4, 8, 6, p.mid);
    rect(out, 14, 6, 5, 3, p.highlight);
    put(out, 14, 7, p.focal);
    rect(out, 10, 13, 12, 4, p.mid);
    rect(out, 8, 14, 4, 4, p.accent);
    rect(out, 21, 14, 4, 4, p.accent);
    line(out, 12, 17, 10, 27, p.light);
    line(out, 20, 17, 22, 27, p.accent);
    line(out, 10, 3, 8, 12, p.focal);
    line(out, 10, 25, 21, 25, p.focal);
    put(out, 10, 32, p.focal);
    put(out, 20, 32, p.focal);
  } else if (direction.style === 'moonlit') {
    // A broad cut-paper cloak with a long wind-swept tail and crescent mask.
    maskEllipse(body, 16, 7, 6, 6);
    maskPolygon(body, [[10, 11], [22, 11], [27, 17], [24, 21], [29, 26], [21, 24], [23, 30], [20, 34], [16, 28], [13, 34], [8, 31], [10, 25], [3, 27], [7, 20], [4, 17]]);
    maskLine(body, 9, 15, 3, 20, 3);
    maskLine(body, 22, 15, 27, 18, 3);
    maskEllipse(body, 16, 26, 7, 7);
    paintDirectionShape(out, body, direction, p.mid);
    paintInnerRim(out, body, p.focal);
    maskEllipse(body, 0, 0, 1, 1);
    rect(out, 11, 3, 10, 7, p.highlight);
    rect(out, 14, 5, 6, 5, p.void);
    put(out, 14, 7, p.focal);
    line(out, 10, 3, 7, 13, p.focal);
    line(out, 8, 13, 4, 20, p.focal);
    line(out, 8, 22, 20, 27, p.accent);
    line(out, 12, 29, 15, 33, p.focal);
    put(out, 22, 14, p.attack);
  } else {
    // Arcade construction: square head, orange jacket block, triangular hem.
    maskRect(body, 10, 2, 12, 10);
    maskRect(body, 8, 13, 16, 11);
    maskRect(body, 4, 15, 5, 8);
    maskRect(body, 23, 15, 5, 7);
    maskPolygon(body, [[8, 23], [24, 23], [21, 28], [21, 34], [17, 34], [16, 28], [14, 34], [9, 34], [10, 28]]);
    maskEllipse(body, 16, 26, 7, 7);
    paintDirectionShape(out, body, direction, p.attack);
    rect(out, 12, 4, 8, 5, p.mid);
    rect(out, 13, 6, 6, 3, p.highlight);
    put(out, 13, 7, p.focal);
    rect(out, 9, 14, 14, 4, p.currency);
    rect(out, 10, 19, 12, 4, p.attack);
    rect(out, 8, 23, 16, 3, p.danger);
    rect(out, 11, 29, 3, 4, p.focal);
    rect(out, 18, 29, 3, 4, p.focal);
  }
  // Keep the shared 32x36 frame/pivot contract while holding the visible actor
  // inside the 30–34px production band. The collider's lowest pixel is y=33.
  for (let y = 34; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) clearPixel(out, x, y);
  }
  return out;
}

function drawMoth(direction) {
  const p = direction.palette;
  const out = image(20, 18);
  const body = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // Four narrow bone blades make a heraldic X around a tiny skull.
    maskPolygon(body, [[9, 7], [4, 1], [2, 2], [6, 9]]);
    maskPolygon(body, [[11, 7], [16, 1], [18, 2], [14, 9]]);
    maskPolygon(body, [[8, 10], [2, 14], [3, 16], [9, 13]]);
    maskPolygon(body, [[12, 10], [18, 14], [17, 16], [11, 13]]);
    maskEllipse(body, 10, 9, 3, 4);
    maskEllipse(body, 10, 10, 5, 5);
    paintDirectionShape(out, body, direction, p.mid);
    line(out, 4, 2, 9, 8, p.highlight);
    line(out, 16, 2, 11, 8, p.highlight);
    line(out, 3, 14, 9, 11, p.accent);
    line(out, 17, 14, 11, 11, p.accent);
    rect(out, 8, 7, 5, 4, p.light);
    put(out, 10, 8, p.outline);
  } else if (direction.style === 'moonlit') {
    // Broad scalloped wings read as one flowing paper-cut shape.
    maskEllipse(body, 5, 7, 5, 5);
    maskEllipse(body, 15, 7, 5, 5);
    maskPolygon(body, [[2, 8], [8, 9], [9, 15], [5, 13]]);
    maskPolygon(body, [[18, 8], [12, 9], [11, 15], [15, 13]]);
    maskEllipse(body, 10, 9, 3, 5);
    maskEllipse(body, 10, 10, 5, 5);
    paintDirectionShape(out, body, direction, p.light);
    line(out, 2, 5, 8, 9, p.highlight);
    line(out, 18, 5, 12, 9, p.highlight);
    line(out, 3, 10, 8, 11, p.accent);
    line(out, 17, 10, 12, 11, p.accent);
    rect(out, 8, 7, 5, 4, p.shadow);
    put(out, 10, 8, p.danger);
  } else {
    // Two clean neon triangles and a square core minimize small-scale noise.
    maskPolygon(body, [[8, 7], [1, 2], [3, 11]]);
    maskPolygon(body, [[12, 7], [19, 2], [17, 11]]);
    maskRect(body, 7, 6, 7, 7);
    maskPolygon(body, [[9, 12], [11, 12], [10, 17]]);
    maskEllipse(body, 10, 10, 5, 5);
    paintDirectionShape(out, body, direction, p.mid);
    line(out, 3, 4, 8, 9, p.accent, 2);
    line(out, 17, 4, 12, 9, p.accent, 2);
    rect(out, 9, 8, 3, 3, p.accent);
    put(out, 10, 9, p.highlight);
  }
  return out;
}

function drawHumanoid(direction) {
  const p = direction.palette;
  const out = image(26, 30);
  const body = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // Upright bone sentinel with a narrow rib cage and long planted limbs.
    maskEllipse(body, 13, 5, 4, 4);
    maskPolygon(body, [[10, 9], [16, 9], [18, 17], [15, 20], [16, 28], [13, 28], [12, 20], [10, 28], [6, 28], [9, 18], [8, 11]]);
    maskLine(body, 9, 11, 3, 18, 2);
    maskLine(body, 17, 11, 23, 16, 2);
    maskEllipse(body, 13, 21, 7, 7);
    paintDirectionShape(out, body, direction, p.mid);
    rect(out, 10, 2, 7, 6, p.light);
    put(out, 11, 4, p.outline);
    put(out, 15, 4, p.outline);
    line(out, 10, 10, 16, 10, p.accent);
    line(out, 10, 12, 16, 17, p.light);
    line(out, 16, 12, 10, 17, p.light);
    rect(out, 10, 17, 7, 2, p.accent);
  } else if (direction.style === 'moonlit') {
    // Crooked lantern bearer: small off-axis head, round hunched body, raised arm.
    maskEllipse(body, 7, 6, 4, 4);
    maskPolygon(body, [[6, 10], [12, 9], [18, 15], [19, 24], [16, 28], [10, 28], [7, 24], [8, 17], [3, 14]]);
    maskLine(body, 8, 12, 2, 18, 2);
    maskLine(body, 15, 13, 22, 8, 2);
    maskLine(body, 22, 8, 24, 4, 2);
    maskEllipse(body, 13, 21, 7, 7);
    paintDirectionShape(out, body, direction, p.mid);
    rect(out, 4, 3, 6, 6, p.light);
    rect(out, 6, 5, 3, 3, p.void);
    put(out, 6, 6, p.danger);
    line(out, 5, 10, 3, 17, p.accent);
    line(out, 9, 14, 17, 20, p.light);
    line(out, 9, 22, 17, 25, p.accent);
    put(out, 23, 5, p.highlight);
  } else {
    // Squat square raider with a forward shield and triangular stance.
    maskRect(body, 8, 2, 10, 9);
    maskRect(body, 6, 12, 13, 10);
    maskRect(body, 18, 12, 6, 10);
    maskPolygon(body, [[7, 21], [12, 21], [11, 28], [5, 28]]);
    maskPolygon(body, [[14, 21], [19, 21], [22, 28], [16, 28]]);
    maskRect(body, 2, 14, 5, 6);
    maskEllipse(body, 13, 21, 7, 7);
    paintDirectionShape(out, body, direction, p.mid);
    rect(out, 10, 4, 6, 4, p.light);
    rect(out, 11, 5, 2, 2, p.accent);
    rect(out, 8, 14, 9, 5, p.shadow);
    rect(out, 19, 14, 3, 6, p.danger);
    put(out, 20, 15, p.accent);
  }
  return out;
}

function drawHeavy(direction) {
  const p = direction.palette;
  const out = image(42, 42);
  const body = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // Tall funerary golem: squared sarcophagus shoulders and a small skull niche.
    maskPolygon(body, [[15, 2], [27, 2], [29, 12], [35, 13], [39, 20], [37, 32], [31, 35], [28, 40], [21, 40], [19, 34], [12, 37], [5, 31], [4, 18], [9, 12], [14, 12]]);
    maskRect(body, 4, 16, 8, 16);
    maskRect(body, 31, 16, 7, 16);
    maskEllipse(body, 21, 29, 11, 11);
    paintDirectionShape(out, body, direction, p.mid);
    rect(out, 17, 4, 8, 7, p.shadow);
    rect(out, 18, 5, 6, 4, p.light);
    put(out, 19, 7, p.outline);
    put(out, 23, 7, p.outline);
    rect(out, 10, 13, 22, 5, p.light);
    rect(out, 13, 18, 16, 12, p.shadow);
    rect(out, 18, 18, 6, 6, p.accent);
    rect(out, 20, 19, 2, 3, p.highlight);
    line(out, 7, 17, 7, 29, p.accent);
    line(out, 31, 18, 36, 28, p.accent);
  } else if (direction.style === 'moonlit') {
    // Rounded boulder shoulders flow into a bell-like body and crescent head.
    maskEllipse(body, 21, 10, 8, 7);
    maskEllipse(body, 10, 20, 9, 10);
    maskEllipse(body, 32, 20, 9, 10);
    maskPolygon(body, [[11, 16], [31, 16], [35, 28], [30, 35], [27, 40], [21, 38], [16, 40], [12, 34], [7, 28]]);
    maskEllipse(body, 21, 29, 11, 11);
    paintDirectionShape(out, body, direction, p.mid);
    rect(out, 16, 5, 10, 7, p.light);
    rect(out, 20, 5, 6, 6, p.shadow);
    put(out, 20, 7, p.highlight);
    line(out, 7, 15, 13, 12, p.light);
    line(out, 29, 12, 35, 16, p.light);
    rect(out, 12, 17, 18, 12, p.shadow);
    circleOutline(out, 21, 22, 4, p.accent);
    rect(out, 21, 18, 3, 6, p.shadow);
  } else {
    // Broad rectangular mech with stepped shoulders and a square display head.
    maskRect(body, 14, 2, 14, 11);
    maskRect(body, 8, 13, 26, 18);
    maskRect(body, 2, 12, 9, 20);
    maskRect(body, 31, 12, 9, 20);
    maskPolygon(body, [[10, 30], [20, 30], [18, 40], [8, 40]]);
    maskPolygon(body, [[22, 30], [32, 30], [34, 40], [24, 40]]);
    maskEllipse(body, 21, 29, 11, 11);
    paintDirectionShape(out, body, direction, p.mid);
    rect(out, 17, 5, 8, 5, p.shadow);
    rect(out, 19, 6, 4, 3, p.accent);
    rect(out, 11, 15, 20, 13, p.shadow);
    rect(out, 18, 19, 7, 7, p.danger);
    rect(out, 20, 21, 3, 3, p.accent);
    rect(out, 3, 14, 4, 16, p.light);
    rect(out, 35, 14, 4, 16, p.accent);
  }
  return out;
}

function drawBoss(direction) {
  const p = direction.palette;
  const out = image(60, 54);
  const body = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // A tall oval skull reliquary on eight narrow, jointed golden limbs.
    maskEllipse(body, 36, 15, 13, 13);
    maskEllipse(body, 28, 31, 10, 8);
    const legs = [
      [[22, 28], [12, 20], [4, 13]], [[20, 31], [9, 29], [2, 26]],
      [[21, 35], [10, 40], [4, 49]], [[27, 38], [20, 47], [17, 52]],
      [[36, 28], [47, 19], [56, 12]], [[38, 31], [50, 28], [58, 25]],
      [[37, 35], [49, 41], [56, 50]], [[33, 38], [42, 47], [44, 52]],
    ];
    for (const leg of legs) {
      maskLine(body, leg[0][0], leg[0][1], leg[1][0], leg[1][1], 3);
      maskLine(body, leg[1][0], leg[1][1], leg[2][0], leg[2][1], 2);
    }
    maskEllipse(body, 30, 35, 18, 18);
    paintDirectionShape(out, body, direction, p.shadow);
    rect(out, 24, 25, 10, 9, p.mid);
    rect(out, 26, 27, 6, 4, p.light);
    put(out, 28, 29, p.accent);
    circleOutline(out, 36, 15, 9, p.accent);
    rect(out, 32, 7, 9, 6, p.light);
    rect(out, 34, 9, 5, 3, p.outline);
    put(out, 35, 10, p.accent);
    line(out, 25, 36, 20, 43, p.highlight);
    line(out, 34, 36, 39, 43, p.highlight);
    for (const [x, y] of [[12, 20], [9, 29], [10, 40], [47, 19], [50, 28], [49, 41]]) put(out, x, y, p.accent);
  } else if (direction.style === 'moonlit') {
    // Broad crescent abdomen and long tapered cut-paper legs form a low canopy.
    maskEllipse(body, 35, 18, 17, 11);
    maskEllipse(body, 28, 31, 12, 8);
    const legs = [
      [[21, 28], [11, 21], [2, 18]], [[19, 31], [8, 29], [1, 31]],
      [[20, 35], [9, 40], [3, 49]], [[27, 38], [20, 47], [18, 52]],
      [[37, 27], [49, 20], [58, 18]], [[39, 31], [51, 30], [59, 33]],
      [[38, 35], [50, 41], [57, 50]], [[33, 38], [41, 48], [43, 52]],
    ];
    for (const leg of legs) {
      maskPolygon(body, [leg[0], leg[1], leg[2], [leg[2][0] + (leg[2][0] < 30 ? 2 : -2), leg[2][1] + 1], [leg[1][0] + (leg[1][0] < 30 ? 2 : -2), leg[1][1] + 2]]);
    }
    maskEllipse(body, 30, 35, 18, 18);
    paintDirectionShape(out, body, direction, p.shadow);
    rect(out, 23, 26, 11, 8, p.mid);
    rect(out, 26, 28, 6, 4, p.highlight);
    put(out, 28, 30, p.danger);
    ellipseOutline(out, 35, 18, 10, 7, p.accent);
    circleOutline(out, 35, 18, 3, p.highlight);
    rect(out, 35, 11, 5, 9, p.shadow);
    put(out, 35, 17, p.danger);
    for (const [x, y] of [[25, 13], [44, 12], [48, 19], [31, 24]]) put(out, x, y, p.highlight);
    line(out, 20, 37, 17, 43, p.accent);
    line(out, 37, 37, 43, 45, p.accent);
  } else {
    // Square core, hexagonal abdomen, and thick zig-zag legs use arcade blocks.
    maskPolygon(body, [[25, 6], [45, 6], [51, 16], [45, 26], [25, 26], [19, 16]]);
    maskRect(body, 22, 25, 15, 13);
    const legs = [
      [[23, 28], [12, 21], [2, 16]], [[21, 31], [9, 30], [1, 28]],
      [[22, 35], [10, 40], [2, 49]], [[27, 37], [20, 47], [17, 52]],
      [[37, 28], [48, 20], [58, 16]], [[39, 31], [51, 30], [59, 28]],
      [[38, 35], [50, 41], [58, 49]], [[33, 37], [42, 47], [44, 52]],
    ];
    for (const leg of legs) {
      maskLine(body, leg[0][0], leg[0][1], leg[1][0], leg[1][1], 5);
      maskLine(body, leg[1][0], leg[1][1], leg[2][0], leg[2][1], 4);
    }
    maskEllipse(body, 30, 35, 18, 18);
    paintDirectionShape(out, body, direction, p.shadow);
    rect(out, 26, 8, 18, 16, p.mid);
    rect(out, 30, 11, 10, 10, p.shadow);
    rect(out, 33, 13, 5, 5, p.accent);
    put(out, 35, 15, p.highlight);
    rect(out, 25, 27, 10, 8, p.mid);
    rect(out, 28, 29, 4, 3, p.highlight);
    line(out, 45, 10, 49, 21, p.accent, 2);
  }
  return out;
}

function drawXp(direction) {
  const p = direction.palette;
  const out = image(10, 12);
  const shape = mask(out.width, out.height);
  maskPolygon(shape, [[5, 1], [9, 6], [5, 11], [1, 6]]);
  paintShape(out, shape, p.outline, p.xp);
  line(out, 5, 2, 3, 7, p.highlight);
  put(out, 6, 8, p.focal);
  return out;
}

function drawMusicNote(direction) {
  const p = direction.palette;
  const out = image(10, 12);
  const shape = mask(out.width, out.height);
  maskEllipse(shape, 3, 9, 2, 2);
  maskRect(shape, 5, 2, 2, 8);
  maskPolygon(shape, [[7, 2], [9, 4], [7, 5]]);
  paintShape(out, shape, p.outline, p.currency);
  put(out, 6, 2, p.highlight);
  return out;
}

function drawRarePickup(direction) {
  const p = direction.palette;
  const out = image(14, 16);
  const shape = mask(out.width, out.height);
  maskPolygon(shape, [[7, 2], [11, 6], [11, 11], [7, 13], [3, 11], [3, 6]]);
  maskRect(shape, 5, 2, 5, 2);
  paintShape(out, shape, p.outline, direction.style === 'moonlit' ? p.highlight : p.light);
  rect(out, 5, 5, 5, 7, p.focal);
  line(out, 5, 5, 9, 9, p.highlight);
  put(out, 7, 8, direction.style === 'arcade' ? p.accent : p.currency);
  return out;
}

function drawStartingPedestal(direction) {
  const p = direction.palette;
  const out = image(30, 32);
  const shape = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // Three angular bone lances rise from a stepped gold reliquary.
    maskPolygon(shape, [[5, 22], [25, 22], [28, 29], [2, 29]]);
    maskRect(shape, 7, 17, 16, 7);
    for (const x of [10, 15, 20]) maskLine(shape, x, 17, x, x === 15 ? 2 : 5, 3);
    maskPolygon(shape, [[10, 3], [7, 8], [13, 8]]);
    maskPolygon(shape, [[15, 0], [12, 6], [18, 6]]);
    maskPolygon(shape, [[20, 3], [17, 8], [23, 8]]);
    paintDirectionShape(out, shape, direction, p.mid);
    line(out, 4, 23, 25, 23, p.light);
    line(out, 6, 26, 23, 26, p.accent);
    rect(out, 9, 7, 2, 10, p.highlight);
    rect(out, 14, 4, 2, 13, p.highlight);
    rect(out, 19, 7, 2, 10, p.highlight);
    put(out, 15, 20, p.focal);
  } else if (direction.style === 'moonlit') {
    // A low petal dais supports one asymmetric crescent standard.
    maskEllipse(shape, 15, 24, 12, 6);
    maskPolygon(shape, [[6, 20], [10, 15], [15, 18], [20, 14], [25, 20], [22, 25], [8, 25]]);
    maskLine(shape, 15, 19, 15, 6, 3);
    maskEllipse(shape, 15, 6, 6, 5);
    paintDirectionShape(out, shape, direction, p.mid);
    // Cut away the inner moon to keep the crescent silhouette open.
    for (let y = 2; y <= 9; y++) for (let x = 14; x <= 20; x++) {
      const nx = (x - 17) / 4;
      const ny = (y - 5) / 4;
      if (nx * nx + ny * ny <= 1) clearPixel(out, x, y);
    }
    line(out, 5, 24, 25, 24, p.highlight);
    line(out, 8, 20, 12, 17, p.accent);
    line(out, 18, 18, 23, 20, p.accent);
    put(out, 15, 14, p.focal);
  } else {
    // Neon console: square plinth, central glyph, and three triangular antennae.
    maskRect(shape, 4, 20, 22, 10);
    maskRect(shape, 7, 15, 16, 7);
    maskRect(shape, 13, 6, 5, 10);
    maskPolygon(shape, [[4, 15], [9, 7], [12, 15]]);
    maskPolygon(shape, [[18, 15], [22, 7], [26, 15]]);
    maskPolygon(shape, [[13, 6], [15, 1], [18, 6]]);
    paintDirectionShape(out, shape, direction, p.mid);
    rect(out, 7, 22, 16, 5, p.shadow);
    rect(out, 12, 23, 6, 3, p.danger);
    put(out, 15, 24, p.highlight);
    line(out, 9, 9, 9, 15, p.focal, 2);
    line(out, 22, 9, 21, 15, p.accent, 2);
    rect(out, 14, 7, 3, 8, p.highlight);
  }
  return out;
}

function drawProjectile(direction) {
  const p = direction.palette;
  const out = image(10, 8);
  const shape = mask(out.width, out.height);
  maskPolygon(shape, [[1, 5], [6, 1], [9, 2], [7, 5], [4, 5], [2, 7]]);
  maskEllipse(shape, 5, 4, 3, 3);
  paintDirectionShape(out, shape, direction, p.focal);
  for (let y = 1; y <= 7; y++) for (let x = 2; x <= 8; x++) {
    if ((x - 5) ** 2 + (y - 4) ** 2 <= 9) put(out, x, y, p.focal);
  }
  line(out, 3, 5, 7, 2, p.highlight);
  return out;
}

function drawMelee(direction) {
  const p = direction.palette;
  const out = image(40, 28);
  const shape = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // A narrow polished crescent with stepped gold glints.
    for (let y = 2; y < out.height - 2; y++) {
      for (let x = 3; x < out.width - 2; x++) {
        const outer = ((x - 8) / 29) ** 2 + ((y - 14) / 12) ** 2;
        const inner = ((x - 7) / 24) ** 2 + ((y - 14) / 9) ** 2;
        if (outer <= 1 && inner >= 1 && x >= 7) maskPut(shape, x, y);
      }
    }
    paintDirectionShape(out, shape, direction, p.attack);
    for (const [x, y] of [[14, 5], [20, 4], [26, 7], [31, 12]]) put(out, x, y, p.highlight);
  } else if (direction.style === 'moonlit') {
    // A broad folding fan uses five paper blades instead of a crescent.
    const tips = [[35, 4], [38, 9], [39, 14], [37, 20], [33, 25]];
    for (const tip of tips) maskPolygon(shape, [[7, 14], tip, [30, 14]]);
    maskEllipse(shape, 9, 14, 4, 4);
    paintDirectionShape(out, shape, direction, p.attack);
    for (const [x, y] of tips) line(out, 8, 14, x - 2, y, p.highlight);
    line(out, 12, 6, 12, 22, p.accent);
  } else {
    // One chunky triangular swipe with a squared bite reads in a single glance.
    maskPolygon(shape, [[5, 13], [34, 3], [38, 8], [25, 14], [38, 20], [34, 25]]);
    maskRect(shape, 5, 11, 15, 7);
    paintDirectionShape(out, shape, direction, p.attack);
    maskPolygon(shape, [[13, 12], [28, 7], [22, 13]]);
    for (let y = 0; y < shape.height; y++) for (let x = 0; x < shape.width; x++) {
      if (shape.data[y * shape.width + x] && x > 12 && y < 13) put(out, x, y, p.currency);
    }
    line(out, 7, 13, 32, 6, p.highlight, 2);
  }
  return out;
}

function drawWideBoundary(direction) {
  const p = direction.palette;
  const out = image(112, 76);
  ellipseOutline(out, 56, 38, 52, 34, direction.style === 'arcade' ? p.accent : p.danger);
  for (const [x, y] of [[56, 4], [108, 38], [56, 72], [4, 38]]) put(out, x, y, p.highlight);
  return out;
}

function drawImpact(direction) {
  const p = direction.palette;
  const out = image(18, 18);
  line(out, 9, 1, 9, 16, p.attack);
  line(out, 1, 9, 16, 9, p.attack);
  line(out, 4, 4, 14, 14, p.highlight);
  line(out, 14, 4, 4, 14, p.highlight);
  rect(out, 7, 7, 5, 5, p.currency);
  put(out, 9, 9, p.highlight);
  return out;
}

function drawFloor(direction) {
  const p = direction.palette;
  const out = image(16, 16, p.floor);
  if (direction.style === 'gilded') {
    line(out, 2, 4, 7, 3, p.floorDetail);
    line(out, 7, 3, 10, 6, p.floorDetail);
    line(out, 11, 12, 15, 10, p.shadow);
    put(out, 4, 13, p.floorDetail);
  } else if (direction.style === 'moonlit') {
    line(out, 3, 5, 6, 3, p.floorDetail);
    line(out, 6, 3, 9, 5, p.floorDetail);
    line(out, 7, 11, 10, 9, p.shadow);
    put(out, 12, 12, p.floorDetail);
  } else {
    put(out, 7, 5, p.floorDetail);
    put(out, 6, 6, p.floorDetail);
    put(out, 8, 6, p.floorDetail);
    put(out, 7, 7, p.floorDetail);
    put(out, 13, 12, p.shadow);
  }
  return out;
}

function drawProp(direction) {
  const p = direction.palette;
  const out = image(24, 28);
  const shape = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    // Narrow ossuary pillar with a bone finial and plated base.
    maskPolygon(shape, [[8, 7], [16, 7], [18, 22], [22, 26], [2, 26], [6, 22]]);
    maskRect(shape, 6, 5, 12, 4);
    maskLine(shape, 12, 5, 12, 1, 3);
    maskPolygon(shape, [[12, 0], [9, 3], [12, 5], [15, 3]]);
    paintDirectionShape(out, shape, direction, p.mid);
    line(out, 8, 8, 6, 22, p.light);
    line(out, 10, 10, 10, 21, p.shadow);
    line(out, 15, 9, 16, 22, p.accent);
    rect(out, 5, 22, 14, 3, p.accent);
    put(out, 12, 2, p.highlight);
  } else if (direction.style === 'moonlit') {
    // Asymmetric draped shrine with a crescent lantern and fabric tail.
    maskPolygon(shape, [[6, 8], [17, 5], [20, 9], [18, 18], [22, 24], [15, 22], [12, 27], [7, 23], [2, 25], [5, 17]]);
    maskEllipse(shape, 13, 6, 5, 5);
    paintDirectionShape(out, shape, direction, p.mid);
    rect(out, 10, 3, 7, 6, p.accent);
    rect(out, 13, 3, 5, 5, p.shadow);
    put(out, 11, 5, p.highlight);
    line(out, 7, 10, 17, 17, p.light);
    line(out, 6, 13, 15, 21, p.accent);
    line(out, 3, 24, 11, 22, p.highlight);
  } else {
    // Square neon brazier with a triangular flame glyph.
    maskRect(shape, 3, 18, 18, 9);
    maskRect(shape, 6, 13, 12, 6);
    maskPolygon(shape, [[6, 13], [12, 1], [18, 13]]);
    maskPolygon(shape, [[9, 12], [12, 5], [15, 12]]);
    paintDirectionShape(out, shape, direction, p.mid);
    rect(out, 7, 20, 10, 4, p.shadow);
    rect(out, 9, 21, 6, 2, p.danger);
    maskPolygon(shape, [[9, 12], [12, 4], [16, 12]]);
    for (let y = 3; y <= 12; y++) for (let x = 7; x <= 17; x++) {
      const index = y * shape.width + x;
      if (shape.data[index]) put(out, x, y, p.accent);
    }
    rect(out, 11, 8, 3, 4, p.highlight);
  }
  return out;
}

function drawPassiveIcon(direction) {
  const p = direction.palette;
  const out = image(20, 20);
  const shape = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    maskPolygon(shape, [[6, 1], [11, 1], [12, 9], [17, 11], [18, 15], [14, 18], [4, 18], [1, 15], [5, 11]]);
    maskPolygon(shape, [[4, 4], [7, 2], [8, 7], [5, 9]]);
    paintDirectionShape(out, shape, direction, p.light);
    rect(out, 7, 3, 4, 8, p.shadow);
    line(out, 5, 12, 16, 12, p.accent);
    line(out, 4, 15, 14, 16, p.highlight);
    put(out, 6, 6, p.accent);
  } else if (direction.style === 'moonlit') {
    maskPolygon(shape, [[6, 3], [11, 2], [12, 10], [18, 12], [17, 17], [11, 19], [4, 17], [3, 12], [6, 10]]);
    maskPolygon(shape, [[5, 8], [1, 5], [2, 11], [5, 13]]);
    maskPolygon(shape, [[7, 7], [3, 2], [9, 5]]);
    paintDirectionShape(out, shape, direction, p.light);
    line(out, 6, 5, 10, 11, p.shadow);
    line(out, 5, 13, 16, 14, p.accent);
    line(out, 7, 17, 14, 16, p.highlight);
    put(out, 3, 7, p.focal);
  } else {
    maskRect(shape, 5, 2, 8, 11);
    maskRect(shape, 3, 11, 14, 7);
    maskPolygon(shape, [[13, 9], [18, 12], [17, 17], [12, 17]]);
    paintDirectionShape(out, shape, direction, p.focal);
    rect(out, 7, 4, 4, 7, p.shadow);
    rect(out, 5, 13, 10, 3, p.accent);
    rect(out, 4, 17, 13, 2, p.highlight);
  }
  return out;
}

function drawHudFrame(direction) {
  const p = direction.palette;
  const out = image(104, 14);
  const frame = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    maskPolygon(frame, [[1, 7], [6, 1], [97, 1], [103, 7], [97, 13], [6, 13]]);
    paintDirectionShape(out, frame, direction, p.panel);
    line(out, 7, 3, 96, 3, p.accent);
    line(out, 7, 11, 96, 11, p.accent);
    put(out, 5, 7, p.highlight);
    put(out, 98, 7, p.highlight);
  } else if (direction.style === 'moonlit') {
    maskPolygon(frame, [[1, 4], [7, 1], [96, 2], [103, 5], [99, 9], [95, 13], [8, 12], [2, 10]]);
    paintDirectionShape(out, frame, direction, p.panel);
    line(out, 8, 3, 94, 4, p.accent);
    line(out, 9, 11, 94, 10, p.accent);
    put(out, 4, 6, p.focal);
    put(out, 99, 7, p.focal);
  } else {
    maskRect(frame, 1, 1, 102, 12);
    maskRect(frame, 0, 4, 104, 6);
    paintDirectionShape(out, frame, direction, p.panel);
    rect(out, 4, 3, 8, 2, p.accent);
    rect(out, 92, 3, 8, 2, p.accent);
    rect(out, 4, 10, 8, 2, p.focal);
    rect(out, 92, 10, 8, 2, p.focal);
  }
  return out;
}

function drawHudFill(direction) {
  const p = direction.palette;
  const out = image(96, 6);
  if (direction.style === 'gilded') {
    rect(out, 0, 1, 96, 4, p.health);
    line(out, 1, 1, 94, 1, p.highlight);
    for (let x = 15; x < 96; x += 16) rect(out, x, 1, 2, 4, p.panel);
  } else if (direction.style === 'moonlit') {
    rect(out, 1, 1, 94, 4, p.health);
    for (let x = 2; x < 94; x += 12) {
      put(out, x, 1, p.highlight);
      put(out, x + 1, 2, p.highlight);
    }
    for (let x = 23; x < 92; x += 24) put(out, x, 4, p.accent);
  } else {
    for (let x = 0; x < 96; x += 12) {
      rect(out, x, 0, 10, 6, p.health);
      rect(out, x, 0, 10, 2, x % 24 === 0 ? p.highlight : p.accent);
    }
  }
  return out;
}

function drawHudCap(direction) {
  const p = direction.palette;
  const out = image(8, 14);
  const heart = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    maskEllipse(heart, 2, 5, 2, 2);
    maskEllipse(heart, 5, 5, 2, 2);
    maskPolygon(heart, [[0, 6], [7, 6], [4, 12]]);
    paintDirectionShape(out, heart, direction, p.health);
    put(out, 2, 4, p.highlight);
    put(out, 4, 10, p.accent);
  } else if (direction.style === 'moonlit') {
    maskEllipse(heart, 4, 7, 3, 5);
    paintDirectionShape(out, heart, direction, p.health);
    rect(out, 4, 3, 3, 7, p.panel);
    put(out, 2, 5, p.highlight);
  } else {
    maskPolygon(heart, [[4, 1], [7, 5], [4, 13], [1, 5]]);
    paintDirectionShape(out, heart, direction, p.health);
    rect(out, 3, 4, 3, 5, p.accent);
    put(out, 4, 5, p.highlight);
  }
  return out;
}

function drawRewardPanel(direction) {
  const p = direction.palette;
  const out = image(96, 56);
  const panel = mask(out.width, out.height);
  if (direction.style === 'gilded') {
    maskPolygon(panel, [[8, 1], [88, 1], [95, 8], [92, 17], [95, 28], [92, 39], [95, 48], [88, 55], [8, 55], [1, 48], [4, 39], [1, 28], [4, 17], [1, 8]]);
    paintDirectionShape(out, panel, direction, p.panel);
    line(out, 9, 4, 87, 4, p.accent);
    line(out, 9, 51, 87, 51, p.accent);
    line(out, 5, 9, 5, 46, p.accent);
    line(out, 90, 9, 90, 46, p.accent);
    for (const [x, y] of [[7, 5], [88, 5], [7, 50], [88, 50]]) put(out, x, y, p.highlight);
  } else if (direction.style === 'moonlit') {
    maskPolygon(panel, [[12, 1], [48, 4], [84, 1], [95, 12], [91, 28], [95, 44], [83, 55], [48, 51], [13, 55], [1, 43], [5, 28], [1, 12]]);
    paintDirectionShape(out, panel, direction, p.panel);
    line(out, 13, 4, 48, 7, p.accent);
    line(out, 48, 7, 83, 4, p.accent);
    line(out, 5, 14, 8, 42, p.light);
    line(out, 90, 14, 87, 42, p.light);
    put(out, 48, 4, p.highlight);
    put(out, 48, 51, p.focal);
  } else {
    maskRect(panel, 1, 1, 94, 54);
    maskRect(panel, 0, 6, 96, 44);
    paintDirectionShape(out, panel, direction, p.panel);
    rect(out, 4, 4, 12, 4, p.accent);
    rect(out, 80, 4, 12, 4, p.accent);
    rect(out, 4, 48, 12, 4, p.focal);
    rect(out, 80, 48, 12, 4, p.focal);
  }
  const copyDark = direction.style === 'moonlit' ? p.shadow : p.floorDetail;
  const copyMid = direction.style === 'moonlit' ? p.light : p.mid;
  const buttonColor = direction.style === 'gilded' ? p.danger : p.accent;
  rect(out, 12, 14, 72, 4, copyDark);
  rect(out, 12, 23, 60, 3, copyMid);
  rect(out, 12, 30, 66, 3, copyMid);
  rect(out, 28, 40, 40, 6, buttonColor);
  return out;
}

const ASSET_SPECS = Object.freeze([
  { id: 'player', category: 'actor', build: drawPlayer, pivot: { x: 16, y: 33 }, collider: { shape: 'circle', cx: 16, cy: 26, radius: 7 }, budget: 10 },
  { id: 'enemy-moth', category: 'actor', build: drawMoth, pivot: { x: 10, y: 15 }, collider: { shape: 'circle', cx: 10, cy: 10, radius: 5 }, budget: 9 },
  { id: 'enemy-humanoid', category: 'actor', build: drawHumanoid, pivot: { x: 13, y: 28 }, collider: { shape: 'circle', cx: 13, cy: 21, radius: 7 }, budget: 10 },
  { id: 'enemy-heavy', category: 'actor', build: drawHeavy, pivot: { x: 21, y: 39 }, collider: { shape: 'circle', cx: 21, cy: 29, radius: 11 }, budget: 11 },
  { id: 'enemy-boss', category: 'boss', build: drawBoss, pivot: { x: 30, y: 50 }, collider: { shape: 'circle', cx: 30, cy: 35, radius: 18 }, budget: 14 },
  { id: 'pickup-xp', category: 'pickup', build: drawXp, pivot: { x: 5, y: 10 }, collider: { shape: 'circle', cx: 5, cy: 6, radius: 4 }, budget: 6 },
  { id: 'pickup-music-note', category: 'pickup', build: drawMusicNote, pivot: { x: 4, y: 10 }, collider: { shape: 'circle', cx: 4, cy: 7, radius: 4 }, budget: 5 },
  { id: 'pickup-rare', category: 'pickup', build: drawRarePickup, pivot: { x: 7, y: 14 }, collider: { shape: 'circle', cx: 7, cy: 9, radius: 6 }, budget: 8 },
  { id: 'pickup-starting-pedestal', category: 'pickup', build: drawStartingPedestal, pivot: { x: 15, y: 29 }, collider: { shape: 'circle', cx: 15, cy: 23, radius: 11 }, budget: 8 },
  { id: 'attack-projectile', category: 'attack', build: drawProjectile, pivot: { x: 5, y: 4 }, collider: { shape: 'circle', cx: 5, cy: 4, radius: 3 }, budget: 5 },
  { id: 'attack-melee', category: 'attack', build: drawMelee, pivot: { x: 7, y: 14 }, collider: { shape: 'sector', cx: 7, cy: 14, radius: 31, halfAngleDegrees: 42 }, budget: 5 },
  { id: 'attack-wide-boundary', category: 'attack', build: drawWideBoundary, pivot: { x: 56, y: 38 }, collider: { shape: 'ellipse', cx: 56, cy: 38, radiusX: 52, radiusY: 34 }, budget: 3 },
  { id: 'fx-impact', category: 'effect', build: drawImpact, pivot: { x: 9, y: 9 }, collider: { shape: 'circle', cx: 9, cy: 9, radius: 6 }, budget: 5 },
  { id: 'environment-floor-tile', category: 'tile', build: drawFloor, pivot: { x: 0, y: 0 }, collider: null, budget: 4 },
  { id: 'environment-prop', category: 'prop', build: drawProp, pivot: { x: 12, y: 26 }, collider: null, budget: 8 },
  { id: 'ui-passive-icon', category: 'icon', build: drawPassiveIcon, pivot: { x: 10, y: 18 }, collider: null, budget: 7 },
  { id: 'ui-hud-meter-frame', category: 'ui', build: drawHudFrame, pivot: { x: 0, y: 0 }, collider: null, budget: 5 },
  { id: 'ui-hud-meter-fill', category: 'ui', build: drawHudFill, pivot: { x: 0, y: 0 }, collider: null, budget: 4 },
  { id: 'ui-hud-meter-cap', category: 'ui', build: drawHudCap, pivot: { x: 0, y: 0 }, collider: null, budget: 5 },
  { id: 'ui-reward-card-panel', category: 'ui', build: drawRewardPanel, pivot: { x: 48, y: 28 }, collider: null, budget: 7 },
]);

const TRUTH_PLACEMENTS = Object.freeze([
  { id: 'environment-prop', x: 76, y: 265, layer: 1 },
  { id: 'pickup-starting-pedestal', x: 137, y: 277, layer: 2 },
  { id: 'pickup-xp', x: 201, y: 287, layer: 2 },
  { id: 'pickup-music-note', x: 246, y: 287, layer: 2 },
  { id: 'pickup-rare', x: 293, y: 287, layer: 2 },
  { id: 'attack-wide-boundary', x: 478, y: 234, layer: 3 },
  { id: 'enemy-moth', x: 146, y: 100, layer: 4 },
  { id: 'enemy-humanoid', x: 248, y: 108, layer: 4 },
  { id: 'enemy-heavy', x: 360, y: 116, layer: 4 },
  { id: 'enemy-boss', x: 478, y: 252, layer: 5 },
  { id: 'attack-projectile', x: 304, y: 164, layer: 6 },
  { id: 'attack-melee', x: 258, y: 198, layer: 6 },
  { id: 'fx-impact', x: 540, y: 204, layer: 7 },
  { id: 'player', x: 224, y: 215, layer: 8 },
  { id: 'ui-hud-meter-frame', x: 20, y: 337, layer: 9 },
  { id: 'ui-hud-meter-fill', x: 25, y: 341, layer: 10 },
  { id: 'ui-hud-meter-cap', x: 8, y: 335, layer: 11 },
  { id: 'ui-passive-icon', x: 148, y: 353, layer: 11 },
  { id: 'ui-reward-card-panel', x: 579, y: 327, layer: 11 },
]);

const SILHOUETTE_PLACEMENTS = Object.freeze([
  { id: 'player', x: 34, y: 66 },
  { id: 'enemy-moth', x: 83, y: 51 },
  { id: 'enemy-humanoid', x: 124, y: 66 },
  { id: 'enemy-heavy', x: 177, y: 68 },
  { id: 'enemy-boss', x: 253, y: 72 },
  { id: 'pickup-xp', x: 55, y: 96 },
  { id: 'pickup-music-note', x: 95, y: 96 },
  { id: 'pickup-rare', x: 137, y: 96 },
  { id: 'pickup-starting-pedestal', x: 192, y: 99 },
  { id: 'attack-projectile', x: 230, y: 92 },
  { id: 'fx-impact', x: 287, y: 91 },
]);

function colorSet(target) {
  const colors = new Set();
  for (let p = 0; p < target.data.length; p += 4) {
    if (target.data[p + 3] === 0) continue;
    colors.add(`#${target.data[p].toString(16).padStart(2, '0')}${target.data[p + 1].toString(16).padStart(2, '0')}${target.data[p + 2].toString(16).padStart(2, '0')}`);
  }
  return colors;
}

function opaqueBounds(target) {
  let minX = target.width;
  let minY = target.height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  for (let y = 0; y < target.height; y++) {
    for (let x = 0; x < target.width; x++) {
      if (target.data[pixelIndex(target, x, y) + 3] === 0) continue;
      opaquePixels++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  assert(opaquePixels > 0, 'cannot measure opaque bounds of an empty image');
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

function circleCoverage(target, collider) {
  let totalPixels = 0;
  let opaquePixels = 0;
  const missing = [];
  for (let y = Math.floor(collider.cy - collider.radius); y <= Math.ceil(collider.cy + collider.radius); y++) {
    for (let x = Math.floor(collider.cx - collider.radius); x <= Math.ceil(collider.cx + collider.radius); x++) {
      if ((x - collider.cx) ** 2 + (y - collider.cy) ** 2 > collider.radius ** 2) continue;
      totalPixels++;
      const opaque = x >= 0 && y >= 0 && x < target.width && y < target.height &&
        target.data[pixelIndex(target, x, y) + 3] === 255;
      if (opaque) opaquePixels++;
      else missing.push({ x, y, space: 'native-logical-pixels' });
    }
  }
  return {
    opaquePixels,
    totalPixels,
    ratio: opaquePixels / totalPixels,
    missing,
    space: 'native-logical-pixels',
  };
}

const REQUIRED_SOLID_CIRCLE_IDS = new Set([
  'player', 'enemy-moth', 'enemy-humanoid', 'enemy-heavy', 'enemy-boss', 'attack-projectile',
]);

const OPAQUE_HEIGHT_BANDS = Object.freeze({
  player: Object.freeze({ min: 30, max: 34 }),
  'pickup-rare': Object.freeze({ min: 8, max: 14 }),
});

function validateColliderCore(sprite, spec, direction) {
  if (!REQUIRED_SOLID_CIRCLE_IDS.has(spec.id)) return;
  assert(spec.collider?.shape === 'circle', `${spec.id} solid-core policy requires a circle`);
  const coverage = circleCoverage(sprite, spec.collider);
  assert(coverage.missing.length === 0,
    `${direction.id}/${spec.id} collider has transparent pixels: ${coverage.missing.map(({ x, y }) => `${x},${y}`).join(' ')}`);
  if (spec.id === 'attack-projectile') {
    const bright = new Set([normalizeHex(direction.palette.focal), normalizeHex(direction.palette.highlight)]);
    for (let y = spec.collider.cy - spec.collider.radius; y <= spec.collider.cy + spec.collider.radius; y++) {
      for (let x = spec.collider.cx - spec.collider.radius; x <= spec.collider.cx + spec.collider.radius; x++) {
        if ((x - spec.collider.cx) ** 2 + (y - spec.collider.cy) ** 2 > spec.collider.radius ** 2) continue;
        const p = pixelIndex(sprite, x, y);
        const color = `#${sprite.data[p].toString(16).padStart(2, '0')}${sprite.data[p + 1].toString(16).padStart(2, '0')}${sprite.data[p + 2].toString(16).padStart(2, '0')}`;
        assert(bright.has(color), `${direction.id}/attack-projectile collider core contains non-bright ${color} at ${x},${y}`);
      }
    }
  }
}

function validateHardAlpha(target, label) {
  for (let p = 0; p < target.data.length; p += 4) {
    const alpha = target.data[p + 3];
    assert(alpha === 0 || alpha === 255, `${label} contains soft alpha ${alpha}`);
    if (alpha === 0) {
      assert(target.data[p] === 0 && target.data[p + 1] === 0 && target.data[p + 2] === 0, `${label} has RGB under transparent alpha`);
    }
  }
}

function validatePalette(target, direction, label) {
  const allowed = new Set(Object.values(direction.palette).map(normalizeHex));
  for (const color of colorSet(target)) assert(allowed.has(color), `${label} uses undeclared color ${color}`);
}

function validateSprite(sprite, spec, direction) {
  validateHardAlpha(sprite, `${direction.id}/${spec.id}`);
  validatePalette(sprite, direction, `${direction.id}/${spec.id}`);
  const count = colorSet(sprite).size;
  assert(count > 0, `${direction.id}/${spec.id} is empty`);
  assert(count <= spec.budget, `${direction.id}/${spec.id} uses ${count} colors, budget ${spec.budget}`);
  validateColliderCore(sprite, spec, direction);
  const heightBand = OPAQUE_HEIGHT_BANDS[spec.id];
  if (heightBand) {
    const measured = opaqueBounds(sprite);
    assert(measured.h >= heightBand.min && measured.h <= heightBand.max,
      `${direction.id}/${spec.id} measured opaque height ${measured.h} is outside ${heightBand.min}–${heightBand.max}`);
  }
  if (spec.category !== 'tile' && spec.category !== 'ui') {
    let opaque = 0;
    let transparent = 0;
    for (let p = 0; p < sprite.data.length; p += 4) {
      if (sprite.data[p + 3] === 0) transparent++;
      else opaque++;
    }
    assert(opaque > 0 && transparent > 0, `${direction.id}/${spec.id} must contain art and transparency`);
  }
}

function validateWideBoundary(sprite, direction) {
  const center = pixelIndex(sprite, 56, 38);
  assert(sprite.data[center + 3] === 0, `${direction.id} wide area has a filled center`);
  let opaque = 0;
  let interiorOpaque = 0;
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      const p = pixelIndex(sprite, x, y);
      if (sprite.data[p + 3] === 0) continue;
      opaque++;
      const nx = (x - 56) / 52;
      const ny = (y - 38) / 34;
      if (nx * nx + ny * ny < 0.82) interiorOpaque++;
    }
  }
  assert(opaque >= 220 && opaque <= 420, `${direction.id} wide boundary has implausible coverage ${opaque}`);
  assert(interiorOpaque === 0, `${direction.id} wide boundary leaks ${interiorOpaque} pixels into its interior`);
  for (let y = 0; y < sprite.height - 2; y++) {
    for (let x = 0; x < sprite.width - 2; x++) {
      let block = 0;
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) {
        if (sprite.data[pixelIndex(sprite, x + xx, y + yy) + 3] === 255) block++;
      }
      assert(block < 9, `${direction.id} wide boundary contains a filled 3x3 slab`);
    }
  }
}

function buildAssets(direction) {
  const assets = new Map();
  for (const spec of ASSET_SPECS) {
    const sprite = spec.build(direction);
    validateSprite(sprite, spec, direction);
    assets.set(spec.id, { spec, image: sprite });
  }
  validateWideBoundary(assets.get('attack-wide-boundary').image, direction);
  return assets;
}

function blit(destination, source, dx, dy) {
  dx = Math.round(dx);
  dy = Math.round(dy);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const sp = pixelIndex(source, x, y);
      if (source.data[sp + 3] === 0) continue;
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= destination.width || ty >= destination.height) continue;
      const dp = pixelIndex(destination, tx, ty);
      destination.data[dp] = source.data[sp];
      destination.data[dp + 1] = source.data[sp + 1];
      destination.data[dp + 2] = source.data[sp + 2];
      destination.data[dp + 3] = 255;
    }
  }
}

function blitAtPivot(destination, asset, x, y) {
  blit(destination, asset.image, x - asset.spec.pivot.x, y - asset.spec.pivot.y);
}

function tileFloor(destination, floorAsset) {
  for (let y = 0; y < destination.height; y += floorAsset.image.height) {
    for (let x = 0; x < destination.width; x += floorAsset.image.width) blit(destination, floorAsset.image, x, y);
  }
}

function artLocalPreviewShape(spec) {
  if (!spec.collider) return null;
  return {
    ...spec.collider,
    origin: 'native-frame-top-left',
    purpose: 'candidate-overlay-preview',
    space: 'native-logical-pixels',
  };
}

function deriveSimulationGeometry(spec) {
  if (!spec.collider) return null;
  const scale = SIMULATION_UNITS_PER_LOGICAL_PIXEL;
  const base = {
    shape: spec.collider.shape,
    origin: 'art-pivot',
    offsetX: (spec.collider.cx - spec.pivot.x) * scale,
    offsetY: (spec.collider.cy - spec.pivot.y) * scale,
    space: 'simulation-world-units',
    derivedUsingWorldToLogical: WORLD_TO_LOGICAL,
  };
  if (spec.collider.shape === 'circle') {
    return { ...base, radius: spec.collider.radius * scale };
  }
  if (spec.collider.shape === 'ellipse') {
    return {
      ...base,
      radiusX: spec.collider.radiusX * scale,
      radiusY: spec.collider.radiusY * scale,
    };
  }
  if (spec.collider.shape === 'sector') {
    return {
      ...base,
      radius: spec.collider.radius * scale,
      halfAngleDegrees: spec.collider.halfAngleDegrees,
      angleSpace: 'degrees',
    };
  }
  throw new Error(`candidate builder: unsupported simulation geometry ${spec.collider.shape}`);
}

function packAtlas(direction, assets) {
  const atlas = image(ATLAS_WIDTH, ATLAS_HEIGHT);
  const frames = {};
  let x = ATLAS_PADDING;
  let y = ATLAS_PADDING;
  let rowHeight = 0;
  const occupied = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT);
  for (const spec of ASSET_SPECS) {
    const asset = assets.get(spec.id);
    const sprite = asset.image;
    if (x + sprite.width + ATLAS_PADDING > ATLAS_WIDTH) {
      x = ATLAS_PADDING;
      y += rowHeight + ATLAS_PADDING;
      rowHeight = 0;
    }
    assert(y + sprite.height + ATLAS_PADDING <= ATLAS_HEIGHT, `${direction.id} atlas overflow at ${spec.id}`);
    for (let yy = y; yy < y + sprite.height; yy++) {
      for (let xx = x; xx < x + sprite.width; xx++) {
        const index = yy * ATLAS_WIDTH + xx;
        assert(occupied[index] === 0, `${direction.id} atlas overlap at ${spec.id}`);
        occupied[index] = 1;
      }
    }
    blit(atlas, sprite, x, y);
    const previewShape = artLocalPreviewShape(spec);
    const simulationGeometry = deriveSimulationGeometry(spec);
    const coverage = spec.collider?.shape === 'circle' ? circleCoverage(sprite, spec.collider) : null;
    frames[spec.id] = {
      frame: { x, y, w: sprite.width, h: sprite.height, space: 'atlas-pixels' },
      nativeSize: { w: sprite.width, h: sprite.height, space: 'native-logical-pixels' },
      pivot: { ...spec.pivot, origin: 'native-frame-top-left', space: 'native-logical-pixels' },
      opaqueBounds: opaqueBounds(sprite),
      artLocalPreviewShape: previewShape,
      simulationCollider: simulationGeometry && spec.category !== 'attack' && spec.category !== 'effect'
        ? simulationGeometry
        : null,
      simulationAttack: simulationGeometry && spec.category === 'attack' ? simulationGeometry : null,
      colliderOpaqueCoverage: coverage ? {
        opaquePixels: coverage.opaquePixels,
        totalPixels: coverage.totalPixels,
        ratio: coverage.ratio,
      } : null,
      category: spec.category,
      colorBudget: spec.budget,
      colorsUsed: colorSet(sprite).size,
    };
    x += sprite.width + ATLAS_PADDING;
    rowHeight = Math.max(rowHeight, sprite.height);
  }
  validateHardAlpha(atlas, `${direction.id}/atlas`);
  validatePalette(atlas, direction, `${direction.id}/atlas`);
  return {
    image: atlas,
    json: {
      frames,
      meta: {
        app: 'Loop Survivors deterministic art-direction candidate builder',
        image: 'atlas.png',
        format: 'RGBA8888-hard-alpha',
        size: { w: ATLAS_WIDTH, h: ATLAS_HEIGHT, space: 'atlas-pixels' },
        atlasPadding: { value: ATLAS_PADDING, space: 'atlas-pixels' },
        direction: direction.id,
        coordinateSpace: 'native-logical-pixels',
        worldProjection: {
          worldToLogical: WORLD_TO_LOGICAL,
          simulationUnitsPerLogicalPixel: SIMULATION_UNITS_PER_LOGICAL_PIXEL,
        },
      },
    },
  };
}

function composeTruth(direction, assets) {
  const scene = image(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  tileFloor(scene, assets.get('environment-floor-tile'));
  for (const placement of [...TRUTH_PLACEMENTS].sort((a, b) => a.layer - b.layer)) {
    blitAtPivot(scene, assets.get(placement.id), placement.x, placement.y);
  }
  validateHardAlpha(scene, `${direction.id}/truth-scene`);
  validatePalette(scene, direction, `${direction.id}/truth-scene`);
  return scene;
}

function toGrayscale(source) {
  const out = image(source.width, source.height);
  for (let p = 0; p < source.data.length; p += 4) {
    const alpha = source.data[p + 3];
    if (alpha === 0) continue;
    const value = Math.round(source.data[p] * 0.2126 + source.data[p + 1] * 0.7152 + source.data[p + 2] * 0.0722);
    out.data[p] = value;
    out.data[p + 1] = value;
    out.data[p + 2] = value;
    out.data[p + 3] = 255;
  }
  return out;
}

function silhouetteSprite(source, color = '#ffffff') {
  const out = image(source.width, source.height);
  const [r, g, b] = rgb(color);
  for (let p = 0; p < source.data.length; p += 4) {
    if (source.data[p + 3] === 0) continue;
    out.data[p] = r;
    out.data[p + 1] = g;
    out.data[p + 2] = b;
    out.data[p + 3] = 255;
  }
  return out;
}

function composeSilhouettes(direction, assets) {
  const sheet = image(SILHOUETTE_WIDTH, SILHOUETTE_HEIGHT);
  for (const placement of SILHOUETTE_PLACEMENTS) {
    const asset = assets.get(placement.id);
    blitAtPivot(sheet, { spec: asset.spec, image: silhouetteSprite(asset.image) }, placement.x, placement.y);
  }
  validateHardAlpha(sheet, `${direction.id}/silhouettes`);
  assert(colorSet(sheet).size === 1, `${direction.id} silhouette sheet is not one color`);
  return sheet;
}

function drawColliderOverlay(target, placement, asset) {
  const collider = asset.spec.collider;
  if (!collider) return;
  const offsetX = placement.x - asset.spec.pivot.x;
  const offsetY = placement.y - asset.spec.pivot.y;
  if (collider.shape === 'circle') {
    circleOutline(target, offsetX + collider.cx, offsetY + collider.cy, collider.radius, DEBUG_COLLIDER);
  } else if (collider.shape === 'ellipse') {
    ellipseOutline(target, offsetX + collider.cx, offsetY + collider.cy, collider.radiusX, collider.radiusY, DEBUG_COLLIDER);
  } else if (collider.shape === 'sector') {
    const cx = offsetX + collider.cx;
    const cy = offsetY + collider.cy;
    const angle = (collider.halfAngleDegrees * Math.PI) / 180;
    const topX = Math.round(cx + Math.cos(-angle) * collider.radius);
    const topY = Math.round(cy + Math.sin(-angle) * collider.radius);
    const bottomX = Math.round(cx + Math.cos(angle) * collider.radius);
    const bottomY = Math.round(cy + Math.sin(angle) * collider.radius);
    line(target, cx, cy, topX, topY, DEBUG_COLLIDER);
    line(target, cx, cy, bottomX, bottomY, DEBUG_COLLIDER);
    for (let degrees = -collider.halfAngleDegrees; degrees < collider.halfAngleDegrees; degrees += 4) {
      const a0 = (degrees * Math.PI) / 180;
      const a1 = ((degrees + 4) * Math.PI) / 180;
      line(target,
        cx + Math.cos(a0) * collider.radius,
        cy + Math.sin(a0) * collider.radius,
        cx + Math.cos(a1) * collider.radius,
        cy + Math.sin(a1) * collider.radius,
        DEBUG_COLLIDER);
    }
  }
  line(target, placement.x - 3, placement.y, placement.x + 3, placement.y, DEBUG_PIVOT);
  line(target, placement.x, placement.y - 3, placement.x, placement.y + 3, DEBUG_PIVOT);
}

function composeOverlay(direction, truth, assets) {
  const out = cloneImage(truth);
  for (const placement of TRUTH_PLACEMENTS) {
    if (placement.id.startsWith('ui-') || placement.id.startsWith('environment-')) continue;
    drawColliderOverlay(out, placement, assets.get(placement.id));
  }
  validateHardAlpha(out, `${direction.id}/hitbox-overlay`);
  return out;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sharedCrowdLayout() {
  const random = mulberry32(0xc0ffee);
  const types = ['enemy-moth', 'enemy-humanoid', 'enemy-humanoid', 'enemy-heavy'];
  const placements = [];
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 12; column++) {
      placements.push({
        id: types[(row * 12 + column) % types.length],
        x: 18 + column * 55 + Math.round((random() - 0.5) * 12),
        y: 42 + row * 39 + Math.round((random() - 0.5) * 10),
      });
    }
  }
  return Object.freeze(placements);
}

const CROWD_PLACEMENTS = sharedCrowdLayout();

function composeCrowd(direction, assets) {
  const scene = image(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  tileFloor(scene, assets.get('environment-floor-tile'));
  blitAtPivot(scene, assets.get('attack-wide-boundary'), 350, 186);
  for (const placement of CROWD_PLACEMENTS) blitAtPivot(scene, assets.get(placement.id), placement.x, placement.y);
  blitAtPivot(scene, assets.get('enemy-boss'), 530, 232);
  for (let i = 0; i < 10; i++) {
    blitAtPivot(scene, assets.get('attack-projectile'), 246 + i * 15, 148 + (i % 3) * 13);
  }
  blitAtPivot(scene, assets.get('attack-melee'), 324, 194);
  blitAtPivot(scene, assets.get('fx-impact'), 428, 174);
  blitAtPivot(scene, assets.get('pickup-xp'), 288, 226);
  blitAtPivot(scene, assets.get('pickup-music-note'), 345, 232);
  blitAtPivot(scene, assets.get('pickup-rare'), 386, 225);
  blitAtPivot(scene, assets.get('fx-impact'), 320, 186);
  blitAtPivot(scene, assets.get('player'), 320, 190);
  blitAtPivot(scene, assets.get('ui-hud-meter-frame'), 20, 337);
  blitAtPivot(scene, assets.get('ui-hud-meter-fill'), 25, 341);
  blitAtPivot(scene, assets.get('ui-hud-meter-cap'), 8, 335);
  blitAtPivot(scene, assets.get('ui-passive-icon'), 148, 353);
  validateHardAlpha(scene, `${direction.id}/crowded-combat`);
  validatePalette(scene, direction, `${direction.id}/crowded-combat`);
  return scene;
}

function scaleNearest(source, scale) {
  assert(Number.isInteger(scale) && scale > 0, `invalid nearest scale ${scale}`);
  const out = image(source.width * scale, source.height * scale);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const sp = pixelIndex(source, x, y);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const dp = pixelIndex(out, x * scale + dx, y * scale + dy);
          out.data[dp] = source.data[sp];
          out.data[dp + 1] = source.data[sp + 1];
          out.data[dp + 2] = source.data[sp + 2];
          out.data[dp + 3] = source.data[sp + 3];
        }
      }
    }
  }
  return out;
}

function validateExactScale(source, scaled, scale, label) {
  assert(scaled.width === source.width * scale && scaled.height === source.height * scale, `${label} dimensions are not exact ${scale}x`);
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const sp = pixelIndex(source, x, y);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const dp = pixelIndex(scaled, x * scale + dx, y * scale + dy);
          for (let channel = 0; channel < 4; channel++) {
            assert(scaled.data[dp + channel] === source.data[sp + channel], `${label} has a non-nearest block at ${x},${y}`);
          }
        }
      }
    }
  }
}

function imagesEqual(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

function buildDirection(direction) {
  const assets = buildAssets(direction);
  const atlas = packAtlas(direction, assets);
  const truth = composeTruth(direction, assets);
  const truth4x = scaleNearest(truth, 4);
  validateExactScale(truth, truth4x, 4, `${direction.id}/truth-scene-4x`);
  const grayscale = toGrayscale(truth);
  validateHardAlpha(grayscale, `${direction.id}/grayscale`);
  for (let p = 0; p < grayscale.data.length; p += 4) {
    if (grayscale.data[p + 3] === 0) continue;
    assert(grayscale.data[p] === grayscale.data[p + 1] && grayscale.data[p + 1] === grayscale.data[p + 2], `${direction.id}/grayscale contains chroma`);
  }
  const silhouettes = composeSilhouettes(direction, assets);
  const overlay = composeOverlay(direction, truth, assets);
  const crowd = composeCrowd(direction, assets);
  return {
    assets,
    atlas,
    images: {
      'atlas.png': atlas.image,
      'truth-scene.png': truth,
      'truth-scene-4x.png': truth4x,
      'silhouettes.png': silhouettes,
      'grayscale.png': grayscale,
      'hitbox-overlay.png': overlay,
      'crowded-combat.png': crowd,
    },
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, payload])), 0);
  return Buffer.concat([length, typeBuffer, payload, checksum]);
}

function encodePng(source) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(source.width, 0);
  ihdr.writeUInt32BE(source.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = source.width * 4;
  const raw = Buffer.alloc((stride + 1) * source.height);
  for (let y = 0; y < source.height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(source.data.subarray(y * stride, (y + 1) * stride), row + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodePng(encoded, label) {
  assert(encoded.subarray(0, 8).equals(PNG_SIGNATURE), `${label} is not PNG`);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < encoded.length) {
    const length = encoded.readUInt32BE(offset);
    const type = encoded.toString('ascii', offset + 4, offset + 8);
    const payload = encoded.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = payload.readUInt32BE(0);
      height = payload.readUInt32BE(4);
      assert(payload[8] === 8 && payload[9] === 6 && payload[12] === 0, `${label} is not non-interlaced RGBA8888`);
    } else if (type === 'IDAT') {
      idat.push(payload);
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  assert(raw.length === (stride + 1) * height, `${label} has unexpected decoded size`);
  const out = image(width, height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    assert(raw[row] === 0, `${label} uses an unsupported PNG filter`);
    out.data.set(raw.subarray(row + 1, row + 1 + stride), y * stride);
  }
  return out;
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function frameSummary(atlasJson) {
  return Object.fromEntries(Object.entries(atlasJson.frames).map(([id, frame]) => [id, {
    nativeSize: frame.nativeSize,
    pivot: frame.pivot,
    opaqueBounds: frame.opaqueBounds,
    artLocalPreviewShape: frame.artLocalPreviewShape,
    simulationCollider: frame.simulationCollider,
    simulationAttack: frame.simulationAttack,
    colliderOpaqueCoverage: frame.colliderOpaqueCoverage,
  }]));
}

function frameContractSummary(atlasJson) {
  return Object.fromEntries(Object.entries(atlasJson.frames).map(([id, frame]) => [id, {
    nativeSize: frame.nativeSize,
    pivot: frame.pivot,
    artLocalPreviewShape: frame.artLocalPreviewShape,
    simulationCollider: frame.simulationCollider,
    simulationAttack: frame.simulationAttack,
  }]));
}

function truthGeometry(referenceAtlasJson) {
  const truthFrameIds = [...new Set(TRUTH_PLACEMENTS.map(({ id }) => id))];
  const nativeFrameDimensions = Object.fromEntries(truthFrameIds.map((id) => [id, referenceAtlasJson.frames[id].nativeSize]));
  const wideSpec = ASSET_SPECS.find(({ id }) => id === 'attack-wide-boundary');
  assert(wideSpec, 'wide-area spec is missing');
  return {
    logicalCanvas: { w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT, space: 'logical-screen-pixels' },
    worldProjection: {
      worldToLogical: WORLD_TO_LOGICAL,
      simulationUnitsPerLogicalPixel: SIMULATION_UNITS_PER_LOGICAL_PIXEL,
    },
    placements: TRUTH_PLACEMENTS.map(({ id, x, y, layer }) => ({
      id,
      x,
      y,
      layer,
      origin: 'asset-art-pivot',
      space: 'logical-screen-pixels',
    })),
    wideArea: {
      asset: 'attack-wide-boundary',
      scenePivot: { x: 478, y: 234, space: 'logical-screen-pixels' },
      artLocalPreviewBoundary: {
        ...artLocalPreviewShape(wideSpec),
        tolerance: { value: 1, space: 'native-logical-pixels' },
      },
      simulationAttack: deriveSimulationGeometry(wideSpec),
      interior: 'transparent',
    },
    sizeReporting: {
      nativeFrameDimensions,
      measuredVisibleExtents: {
        source: 'candidates[].nativeFrames[assetId].opaqueBounds',
        description: 'Per-candidate opaque x/y bounds, width, height, and pixel count measured from generated native art.',
        origin: 'native-frame-top-left',
        space: 'native-logical-pixels',
      },
    },
  };
}

const COMPARISON_SPECS = Object.freeze([
  { file: 'truth.png', source: 'truth-scene.png' },
  { file: 'silhouettes.png', source: 'silhouettes.png' },
  { file: 'grayscale.png', source: 'grayscale.png' },
  { file: 'hitboxes.png', source: 'hitbox-overlay.png' },
  { file: 'crowded.png', source: 'crowded-combat.png' },
]);

function buildComparisons(completed) {
  assert(completed.length === 3, 'comparison sheets require exactly three completed directions');
  const files = {};
  const images = {};
  for (const spec of COMPARISON_SPECS) {
    const sources = completed.map(({ built }) => built.images[spec.source]);
    const height = Math.max(...sources.map(({ height: sourceHeight }) => sourceHeight));
    const sheet = image(LOGICAL_WIDTH * 3, height);
    for (let column = 0; column < sources.length; column++) {
      const source = sources[column];
      assert(source.width <= LOGICAL_WIDTH, `${spec.source} is wider than its 640-pixel comparison column`);
      const x = column * LOGICAL_WIDTH + Math.floor((LOGICAL_WIDTH - source.width) / 2);
      blit(sheet, source, x, 0);
    }
    validateHardAlpha(sheet, `comparisons/${spec.file}`);
    images[spec.file] = sheet;
    files[spec.file.replace('.png', '')] = `comparisons/${spec.file}`;
  }
  return { files, images };
}

function encodeAndValidatePng(source, label) {
  const encoded = encodePng(source);
  const decoded = decodePng(encoded, label);
  assert(imagesEqual(source, decoded), `${label} changed during PNG round-trip`);
  validateHardAlpha(decoded, `${label} round-trip`);
  return encoded;
}

function addArtifact(artifacts, relativePath, contents) {
  assert(!artifacts.has(relativePath), `duplicate artifact ${relativePath}`);
  artifacts.set(relativePath, Buffer.isBuffer(contents) ? contents : Buffer.from(contents));
}

function collectArtifacts(completed, comparisons, indexText) {
  const artifacts = new Map();
  for (const { direction, built } of completed) {
    for (const [name, source] of Object.entries(built.images)) {
      const relativePath = `${direction.id}/${name}`;
      addArtifact(artifacts, relativePath, encodeAndValidatePng(source, relativePath));
    }
    addArtifact(artifacts, `${direction.id}/atlas.json`, stableJson(built.atlas.json));
  }
  for (const [name, source] of Object.entries(comparisons.images)) {
    const relativePath = `comparisons/${name}`;
    addArtifact(artifacts, relativePath, encodeAndValidatePng(source, relativePath));
  }
  addArtifact(artifacts, 'index.json', indexText);
  return artifacts;
}

function listArtifactFiles(directory, prefix = '') {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...listArtifactFiles(absolutePath, relativePath));
    else {
      assert(entry.isFile(), `unsupported generated-tree entry ${relativePath}`);
      files.push(relativePath);
    }
  }
  return files;
}

function writeArtifacts(artifacts) {
  for (const [relativePath, expected] of [...artifacts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const absolutePath = resolve(OUTPUT_ROOT, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, expected);
    assert(readFileSync(absolutePath).equals(expected), `${relativePath} changed during disk write`);
  }
}

function checkArtifacts(artifacts) {
  const expectedPaths = [...artifacts.keys()].sort();
  const actualPaths = listArtifactFiles(OUTPUT_ROOT).sort();
  const expectedSet = new Set(expectedPaths);
  const actualSet = new Set(actualPaths);
  const missing = expectedPaths.filter((path) => !actualSet.has(path));
  const orphaned = actualPaths.filter((path) => !expectedSet.has(path));
  const changed = expectedPaths.filter((path) => {
    if (!actualSet.has(path)) return false;
    return !readFileSync(resolve(OUTPUT_ROOT, path)).equals(artifacts.get(path));
  });
  const failures = [];
  if (missing.length) failures.push(`missing: ${missing.join(', ')}`);
  if (orphaned.length) failures.push(`orphaned: ${orphaned.join(', ')}`);
  if (changed.length) failures.push(`changed: ${changed.join(', ')}`);
  assert(failures.length === 0, `--check found stale generated artifacts (${failures.join('; ')})`);
}

function verifyDeterministic(direction, first, second) {
  for (const name of Object.keys(first.images)) {
    assert(imagesEqual(first.images[name], second.images[name]), `${direction.id}/${name} is not deterministic`);
  }
  assert(stableJson(first.atlas.json) === stableJson(second.atlas.json), `${direction.id}/atlas.json is not deterministic`);
}

function alphaMaskDigest(source) {
  const alpha = Buffer.alloc(source.width * source.height);
  for (let pixel = 0, p = 3; p < source.data.length; pixel++, p += 4) alpha[pixel] = source.data[p] === 0 ? 0 : 1;
  return createHash('sha256').update(alpha).digest('hex');
}

function validateDistinctShapeGrammar(completed) {
  const requiredDistinct = [
    'player', 'enemy-moth', 'enemy-humanoid', 'enemy-heavy', 'enemy-boss',
    'pickup-starting-pedestal', 'environment-prop', 'attack-melee',
    'ui-hud-meter-frame', 'ui-passive-icon', 'ui-reward-card-panel',
  ];
  for (const id of requiredDistinct) {
    const masks = completed.map(({ built }) => alphaMaskDigest(built.assets.get(id).image));
    assert(new Set(masks).size === 3, `${id} does not have three materially distinct silhouettes`);
  }
  const contracts = completed.map(({ built }) => stableJson(frameContractSummary(built.atlas.json)));
  assert(new Set(contracts).size === 1, 'native sizes, pivots, or colliders drifted between directions');
}

function main() {
  const args = process.argv.slice(2);
  assert(args.length <= 1 && (args.length === 0 || args[0] === '--check'),
    'usage: node scripts/build-art-direction-candidates.mjs [--check]');
  const checkMode = args[0] === '--check';
  assert(DIRECTIONS.length === 3, 'must build exactly three directions');
  assert(new Set(DIRECTIONS.map(({ id }) => id)).size === 3, 'direction ids must be unique');
  assert(DIRECTIONS.map(({ id }) => id).join(',') === 'gilded-ossuary,moonlit-tapestry,arcade-reliquary', 'direction order or names drifted');
  const indexCandidates = [];
  const completed = [];
  for (const direction of DIRECTIONS) {
    assert(Object.keys(direction.palette).length <= 16, `${direction.id} master palette exceeds 16 colors`);
    assert(new Set(Object.values(direction.palette).map(normalizeHex)).size === Object.keys(direction.palette).length, `${direction.id} palette contains duplicate colors`);
    const built = buildDirection(direction);
    const rebuilt = buildDirection(direction);
    verifyDeterministic(direction, built, rebuilt);
    completed.push({ direction, built });
    indexCandidates.push({
      id: direction.id,
      name: direction.name,
      explanation: direction.explanation,
      tradeoff: direction.tradeoff,
      constructionRules: CONSTRUCTION_RULES[direction.style],
      palette: Object.entries(direction.palette).map(([name, hex]) => ({ name, hex })),
      files: {
        atlas: `${direction.id}/atlas.png`,
        atlasMetadata: `${direction.id}/atlas.json`,
        truthScene: `${direction.id}/truth-scene.png`,
        truthScene4x: `${direction.id}/truth-scene-4x.png`,
        silhouettes: `${direction.id}/silhouettes.png`,
        grayscale: `${direction.id}/grayscale.png`,
        hitboxOverlay: `${direction.id}/hitbox-overlay.png`,
        crowdedCombat: `${direction.id}/crowded-combat.png`,
      },
      nativeFrames: frameSummary(built.atlas.json),
    });
  }
  validateDistinctShapeGrammar(completed);
  const comparisons = buildComparisons(completed);
  const index = {
    schemaVersion: 2,
    generator: 'scripts/build-art-direction-candidates.mjs',
    sourcePolicy: 'Native-grid reconstruction; concept reference PNGs are not read by the builder.',
    logicalCanvas: { w: LOGICAL_WIDTH, h: LOGICAL_HEIGHT, space: 'logical-screen-pixels' },
    comparisonContract: 'All candidates use identical frame dimensions, pivots, art-local preview geometry, derived simulation geometry, truth-scene placements, and crowded-scene repetitions.',
    truthGeometry: truthGeometry(completed[0].built.atlas.json),
    comparisons: {
      columnWidth: { value: LOGICAL_WIDTH, space: 'logical-screen-pixels' },
      columnOrder: DIRECTIONS.map(({ id }) => id),
      sourcePanelsAreUnscaled: true,
      files: comparisons.files,
    },
    candidates: indexCandidates,
  };
  const indexText = stableJson(index);
  const artifacts = collectArtifacts(completed, comparisons, indexText);
  if (checkMode) checkArtifacts(artifacts);
  else writeArtifacts(artifacts);
  const hashes = [];
  for (const direction of DIRECTIONS) {
    const relativePath = `${direction.id}/truth-scene.png`;
    hashes.push(`${direction.id} ${createHash('sha256').update(artifacts.get(relativePath)).digest('hex').slice(0, 12)}`);
  }
  console.log(`${checkMode ? 'checked' : 'built and verified'} exactly ${DIRECTIONS.length} native-grid directions and ${artifacts.size} generated artifacts`);
  console.log(`each direction: ${ASSET_SPECS.length} atlas frames, 640x360 truth/grayscale/overlay/crowd, exact 2560x1440 nearest 4x, one-color silhouettes`);
  console.log(`comparison sheets: ${COMPARISON_SPECS.map(({ file }) => file).join(', ')} in three unscaled 640px columns`);
  console.log(`truth-scene sha256 prefixes: ${hashes.join(' · ')}`);
}

main();
