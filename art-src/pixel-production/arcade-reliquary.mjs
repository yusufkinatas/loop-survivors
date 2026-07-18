/**
 * Native-grid production art for the selected Arcade Reliquary direction.
 *
 * This module deliberately contains no file I/O and reads no concept board.
 * Every returned pixel is authored directly on its final logical grid.
 */

export const MASTER_PALETTE = Object.freeze({
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
});

const P = MASTER_PALETTE;
const RGB_CACHE = new Map();

function rgb(hex) {
  let value = RGB_CACHE.get(hex);
  if (!value) {
    value = [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
    RGB_CACHE.set(hex, value);
  }
  return value;
}

export function createImage(width, height, fill = null) {
  const image = { width, height, data: new Uint8Array(width * height * 4) };
  if (fill) rect(image, 0, 0, width, height, fill);
  return image;
}

export function pixelOffset(image, x, y) {
  return (y * image.width + x) * 4;
}

function put(image, x, y, color) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const [r, g, b] = rgb(color);
  const p = pixelOffset(image, x, y);
  image.data[p] = r;
  image.data[p + 1] = g;
  image.data[p + 2] = b;
  image.data[p + 3] = 255;
}

function clear(image, x, y) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const p = pixelOffset(image, x, y);
  image.data[p] = 0;
  image.data[p + 1] = 0;
  image.data[p + 2] = 0;
  image.data[p + 3] = 0;
}

function rect(image, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy++) {
    for (let xx = x; xx < x + width; xx++) put(image, xx, yy, color);
  }
}

function line(image, x0, y0, x1, y1, color, thickness = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    const low = -Math.floor((thickness - 1) / 2);
    const high = Math.ceil((thickness - 1) / 2);
    for (let oy = low; oy <= high; oy++) for (let ox = low; ox <= high; ox++) put(image, x0 + ox, y0 + oy, color);
    if (x0 === x1 && y0 === y1) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x0 += sx; }
    if (twice <= dx) { error += dx; y0 += sy; }
  }
}

function mask(width, height) {
  return { width, height, data: new Uint8Array(width * height) };
}

function maskPut(shape, x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x >= 0 && y >= 0 && x < shape.width && y < shape.height) shape.data[y * shape.width + x] = 1;
}

function maskRect(shape, x, y, width, height) {
  for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) maskPut(shape, xx, yy);
}

function maskEllipse(shape, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) maskPut(shape, x, y);
    }
  }
}

function maskPolygon(shape, points) {
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))));
  const maxY = Math.min(shape.height - 1, Math.ceil(Math.max(...points.map((point) => point[1]))));
  for (let y = minY; y <= maxY; y++) {
    for (let x = 0; x < shape.width; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) maskPut(shape, x, y);
    }
  }
}

function maskLine(shape, x0, y0, x1, y1, thickness = 1) {
  const temp = createImage(shape.width, shape.height);
  line(temp, x0, y0, x1, y1, P.highlight, thickness);
  for (let p = 3, i = 0; p < temp.data.length; p += 4, i++) if (temp.data[p]) shape.data[i] = 1;
}

function paintShape(image, shape, fill, outlineThickness = 2, outline = P.outline) {
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) {
      if (shape.data[y * shape.width + x]) continue;
      let neighbor = false;
      for (let oy = -outlineThickness; oy <= outlineThickness && !neighbor; oy++) {
        for (let ox = -outlineThickness; ox <= outlineThickness; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < shape.width && ny < shape.height && shape.data[ny * shape.width + nx]) {
            neighbor = true;
            break;
          }
        }
      }
      if (neighbor) put(image, x, y, outline);
    }
  }
  for (let y = 0; y < shape.height; y++) {
    for (let x = 0; x < shape.width; x++) if (shape.data[y * shape.width + x]) put(image, x, y, fill);
  }
}

function makeFrame(definition, image, variant = null) {
  // Transparent frame space is part of the native asset contract, not an
  // atlas-side extrusion. Add the required two-pixel guard without resampling.
  const guard = 2;
  const guarded = createImage(image.width + guard * 2, image.height + guard * 2);
  for (let y = 0; y < image.height; y++) {
    const source = y * image.width * 4;
    const target = pixelOffset(guarded, guard, y + guard);
    guarded.data.set(image.data.subarray(source, source + image.width * 4), target);
  }
  return {
    key: definition.key,
    image: guarded,
    pivot: { x: definition.pivot.x + guard, y: definition.pivot.y + guard },
    semanticClass: definition.semanticClass,
    tags: [...definition.tags, ...(variant ? [variant] : [])],
    colorBudget: definition.colorBudget,
    requiresTransparentMargin: definition.requiresTransparentMargin !== false,
    planted: Boolean(definition.planted),
  };
}

const ACTORS = Object.freeze([
  { id: 'player', size: [36, 40], pivot: [18, 36], kind: 'player', fill: P.attack, accent: P.focal, budget: 8, tags: ['player', 'focal'] },
  { id: 'swarmer', size: [24, 22], pivot: [12, 18], kind: 'wisp', fill: P.danger, accent: P.accent, budget: 7, tags: ['enemy', 'small', 'split-child', 'hovering'] },
  { id: 'tank', size: [48, 48], pivot: [24, 44], kind: 'golem', fill: P.mid, accent: P.danger, budget: 8, tags: ['enemy', 'large', 'heavy'] },
  { id: 'darter', size: [30, 26], pivot: [15, 22], kind: 'scarab', fill: P.mid, accent: P.accent, budget: 7, tags: ['enemy', 'normal', 'dash'] },
  { id: 'splitter', size: [42, 44], pivot: [21, 40], kind: 'maw', fill: P.danger, accent: P.accent, budget: 8, tags: ['enemy', 'large', 'split'] },
  { id: 'charger', size: [48, 40], pivot: [24, 36], kind: 'boar', fill: P.mid, accent: P.attack, budget: 8, tags: ['enemy', 'large', 'charge'] },
  { id: 'circler', size: [34, 34], pivot: [17, 30], kind: 'eye', fill: P.danger, accent: P.focal, budget: 8, tags: ['enemy', 'normal', 'orbit', 'hovering'] },
  { id: 'shielded', size: [44, 46], pivot: [22, 42], kind: 'knight', fill: P.mid, accent: P.focal, budget: 9, tags: ['enemy', 'large', 'shield'] },
  { id: 'elite', size: [50, 50], pivot: [25, 46], kind: 'guardian', fill: P.shadow, accent: P.accent, budget: 11, tags: ['enemy', 'large', 'objective'] },
  { id: 'bat', size: [26, 24], pivot: [13, 20], kind: 'moth', fill: P.mid, accent: P.accent, budget: 7, tags: ['enemy', 'small', 'flying', 'notched-wings'] },
  { id: 'redBat', size: [28, 26], pivot: [14, 22], kind: 'ember-moth', fill: P.health, accent: P.attack, budget: 7, tags: ['enemy', 'small', 'flying', 'thick-wings', 'broad-tail'] },
  { id: 'redBat2', size: [30, 28], pivot: [15, 24], kind: 'frost-moth', fill: P.light, accent: P.focal, budget: 8, tags: ['enemy', 'small', 'flying'] },
  { id: 'zombie', size: [34, 38], pivot: [17, 34], kind: 'husk', fill: P.mid, accent: P.health, budget: 8, tags: ['enemy', 'normal', 'undead', 'reach-arm', 'uneven-boots'] },
  { id: 'skeleton', size: [34, 38], pivot: [17, 34], kind: 'warden', fill: P.light, accent: P.currency, budget: 8, tags: ['enemy', 'normal', 'undead', 'rib-gaps', 'fork-gaps'] },
  { id: 'ghost', size: [34, 38], pivot: [17, 34], kind: 'shade', fill: P.danger, accent: P.focal, budget: 8, tags: ['enemy', 'normal', 'hovering', 'footless-taper'] },
  { id: 'greenMudman', size: [46, 46], pivot: [23, 42], kind: 'moss-golem', fill: P.mid, accent: P.xp, budget: 9, tags: ['enemy', 'large', 'golem', 'lopsided', 'hanging-fist'] },
  { id: 'grayMudman', size: [46, 46], pivot: [23, 42], kind: 'slate-golem', fill: P.shadow, accent: P.light, budget: 9, tags: ['enemy', 'large', 'golem', 'stacked-slabs'] },
  { id: 'flower', size: [38, 38], pivot: [19, 34], kind: 'spore', fill: P.danger, accent: P.health, budget: 8, tags: ['enemy', 'normal', 'fixture'] },
  { id: 'glowingBat', size: [62, 56], pivot: [31, 52], kind: 'wraith', fill: P.danger, accent: P.currency, budget: 12, tags: ['enemy', 'boss', 'flying'] },
  { id: 'mantis', size: [66, 58], pivot: [33, 54], kind: 'spider', fill: P.shadow, accent: P.health, budget: 11, tags: ['enemy', 'boss', 'crawler', 'spider', 'four-stepped-leg-pairs', 'alternating-diagonal-gait'] },
  { id: 'batSwarm', size: [34, 30], pivot: [17, 26], kind: 'swarm-beast', fill: P.mid, accent: P.accent, budget: 9, tags: ['enemy', 'normal', 'fixed-sweep', 'flying'] },
]);

function actorKey(id, pose) {
  return id === 'player' ? `actors/player/${pose}` : `actors/enemies/${id}/${pose}`;
}

function actorDefinition(actor, pose) {
  return {
    key: actorKey(actor.id, pose),
    pivot: { x: actor.pivot[0], y: actor.pivot[1] },
    semanticClass: actor.id === 'player' ? 'player-actor' : 'enemy-actor',
    tags: [...actor.tags, 'actor', 'animated'],
    colorBudget: actor.budget,
    planted: !actor.tags.includes('hovering') && !actor.tags.includes('flying'),
  };
}

function drawActor(actor, pose) {
  const [w, h] = actor.size;
  const out = createImage(w, h);
  const shape = mask(w, h);
  const active = pose === 'walk';
  const cx = Math.floor(w / 2);
  const ground = actor.pivot[1] - 3;

  switch (actor.kind) {
    case 'player': {
      maskRect(shape, cx - 6, 4, 12, 10);
      maskRect(shape, cx - 8, 15, 16, 10);
      maskRect(shape, cx - 13, active ? 17 : 16, 5, 8);
      maskRect(shape, cx + 8, active ? 15 : 17, 5, 8);
      maskPolygon(shape, active
        ? [[cx - 8, 24], [cx + 8, 24], [cx + 5, ground], [cx + 1, ground], [cx, 28], [cx - 3, ground], [cx - 7, ground]]
        : [[cx - 8, 24], [cx + 8, 24], [cx + 7, ground], [cx + 3, ground], [cx, 28], [cx - 2, ground], [cx - 6, ground]]);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 4, 7, 8, 5, P.mid);
      rect(out, cx - 3, 9, 6, 3, P.highlight);
      rect(out, cx - 7, 16, 14, 4, P.currency);
      rect(out, cx - 6, 21, 12, 4, P.attack);
      line(out, cx - 8, 15, cx - 8, 26, actor.accent, 2);
      line(out, cx + 7, 15, cx + 7, 25, actor.accent, 2);
      rect(out, cx - 1, 9, 2, 2, actor.accent);
      rect(out, active ? cx - 6 : cx - 5, ground + 2, 4, 1, P.outline);
      rect(out, active ? cx + 2 : cx + 3, ground + 2, 4, 1, P.outline);
      break;
    }
    case 'wisp': {
      maskPolygon(shape, active
        ? [[cx, 4], [w - 6, 10], [cx + 4, 13], [cx + 7, ground], [cx, ground - 4], [cx - 7, ground], [cx - 4, 13], [5, 10]]
        : [[cx, 4], [w - 6, 12], [cx + 4, 14], [cx + 4, ground], [cx, ground - 3], [cx - 4, ground], [cx - 4, 14], [5, 12]]);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 2, 9, 5, 5, actor.accent);
      put(out, cx, 10, P.highlight);
      rect(out, cx - 2, ground + 1, 5, 1, P.outline);
      break;
    }
    case 'golem': {
      const bodyWidth = 22;
      maskRect(shape, cx - bodyWidth / 2, 11, bodyWidth, 22);
      maskRect(shape, cx - 7, 5, 14, 9);
      maskRect(shape, 4, active ? 17 : 15, 9, 14);
      maskRect(shape, w - 13, active ? 15 : 17, 9, 14);
      maskRect(shape, active ? cx - 10 : cx - 9, 30, 8, ground - 29);
      maskRect(shape, active ? cx + 3 : cx + 2, 30, 8, ground - 29);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 4, 8, 8, 4, P.panel);
      rect(out, cx - 2, 9, 4, 2, actor.accent);
      rect(out, cx - 7, 17, 14, 8, P.shadow);
      rect(out, cx - 3, 19, 6, 5, actor.accent);
      rect(out, cx - 5, ground + 3, 11, 1, P.outline);
      break;
    }
    case 'moss-golem': {
      // A low, lopsided mud mass: the left fist hangs almost to the floor while
      // the opposite arm stays tucked against a broad, squat body.
      maskEllipse(shape, cx + 1, 27, 13, 11);
      maskRect(shape, cx - 7, 10, 14, 12);
      maskRect(shape, 4, active ? 20 : 18, 11, 20);
      maskRect(shape, 3, active ? 31 : 30, 13, 8);
      maskRect(shape, w - 12, active ? 17 : 19, 8, 13);
      maskRect(shape, active ? cx - 8 : cx - 10, 34, 8, ground - 33);
      maskRect(shape, active ? cx + 3 : cx + 2, 33, 9, ground - 32);
      maskLine(shape, cx - 5, 10, cx - 8, 4, 2);
      maskLine(shape, cx + 3, 10, cx + 7, 5, 2);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 5, 13, 8, 4, P.panel);
      rect(out, cx - 2, 14, 4, 2, P.highlight);
      rect(out, cx - 8, 23, 16, 8, P.shadow);
      rect(out, cx - 3, 25, 7, 4, actor.accent);
      rect(out, 5, active ? 33 : 32, 8, 4, P.xp);
      rect(out, cx + 8, 19, 4, 3, P.xp);
      break;
    }
    case 'slate-golem': {
      // Tall clipped slabs, deliberately narrower and more architectural than
      // the moss golem. Offset courses make the stacked-stone read immediate.
      maskRect(shape, cx - 7, 3, 14, 8);
      maskRect(shape, cx - 11, 11, 22, 8);
      maskRect(shape, cx - 15, 19, 30, 8);
      maskRect(shape, cx - 12, 27, 24, 8);
      maskRect(shape, cx - 10, 35, 8, ground - 34);
      maskRect(shape, cx + 3, 35, 8, ground - 34);
      maskRect(shape, active ? 7 : 9, 18, 8, 15);
      maskRect(shape, active ? w - 15 : w - 17, 18, 8, 15);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 5, 6, 10, 3, P.panel);
      rect(out, cx - 2, 6, 4, 2, actor.accent);
      line(out, cx - 9, 18, cx + 9, 18, P.light, 1);
      line(out, cx - 11, 26, cx + 11, 26, P.mid, 2);
      line(out, cx - 8, 34, cx + 8, 34, P.light, 1);
      rect(out, active ? cx - 8 : cx + 4, 21, 5, 4, P.mid);
      break;
    }
    case 'scarab': {
      maskRect(shape, cx - 7, 8, 14, 10);
      maskPolygon(shape, active
        ? [[cx - 6, 10], [2, 5], [5, 17], [cx - 5, 16]]
        : [[cx - 6, 10], [2, 6], [5, 19], [cx - 5, 16]]);
      maskPolygon(shape, active
        ? [[cx + 6, 10], [w - 3, 5], [w - 6, 17], [cx + 5, 16]]
        : [[cx + 6, 10], [w - 3, 6], [w - 6, 19], [cx + 5, 16]]);
      maskLine(shape, 6, 18, 4, ground, 2);
      maskLine(shape, w - 7, 18, w - 5, ground, 2);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 3, 10, 6, 6, actor.accent);
      rect(out, cx - 1, 11, 2, 2, P.highlight);
      break;
    }
    case 'maw': {
      maskRect(shape, cx - 9, 10, 18, 18);
      const reach = 5;
      maskPolygon(shape, [[cx - 7, 12], [reach, 5], [cx - 10, 18]]);
      maskPolygon(shape, [[cx + 7, 12], [w - 1 - reach, 5], [cx + 10, 18]]);
      maskPolygon(shape, [[cx - 7, 25], [reach, ground], [cx - 10, 20]]);
      maskPolygon(shape, [[cx + 7, 25], [w - 1 - reach, ground], [cx + 10, 20]]);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 6, 15, 12, 8, P.panel);
      rect(out, cx - 4, active ? 17 : 18, 8, 3, P.highlight);
      put(out, cx, 12, actor.accent);
      rect(out, cx - 2, ground + 2, 5, 1, P.outline);
      break;
    }
    case 'boar': {
      maskRect(shape, 10, 12, 27, 17);
      maskRect(shape, 30, 16, 12, 10);
      maskPolygon(shape, [[37, 17], [44, 10], [42, 20]]);
      maskPolygon(shape, [[37, 25], [44, 30], [41, 23]]);
      const front = active ? 32 : 29;
      maskRect(shape, 13, 27, 7, ground - 26);
      maskRect(shape, front, 27, 7, ground - 26);
      maskPolygon(shape, [[12, 13], [7, 7], [18, 12]]);
      paintShape(out, shape, actor.fill);
      rect(out, 18, 15, 13, 8, P.shadow);
      rect(out, 22, 17, 6, 4, actor.accent);
      put(out, 37, 18, P.highlight);
      break;
    }
    case 'eye': {
      maskEllipse(shape, cx, 16, 9, 9);
      if (active) {
        maskRect(shape, cx - 2, 4, 5, 5); maskRect(shape, cx - 2, 24, 5, 5);
        maskRect(shape, 5, 14, 5, 5); maskRect(shape, 24, 14, 5, 5);
      } else {
        maskPolygon(shape, [[cx, 3], [cx + 5, 8], [cx - 5, 8]]);
        maskPolygon(shape, [[cx, 29], [cx + 5, 24], [cx - 5, 24]]);
        maskPolygon(shape, [[5, 16], [10, 11], [10, 21]]);
        maskPolygon(shape, [[28, 16], [23, 11], [23, 21]]);
      }
      paintShape(out, shape, actor.fill);
      rect(out, cx - 6, 13, 12, 7, P.panel);
      rect(out, cx - 2, 14, 5, 5, actor.accent);
      put(out, cx, 15, P.highlight);
      break;
    }
    case 'knight': {
      maskRect(shape, cx - 7, 5, 14, 11);
      maskRect(shape, cx - 9, 16, 18, 17);
      maskRect(shape, active ? cx - 10 : cx - 8, 31, 7, ground - 30);
      maskRect(shape, active ? cx + 4 : cx + 2, 31, 7, ground - 30);
      maskPolygon(shape, active
        ? [[6, 13], [15, 16], [13, 34], [6, 29]]
        : [[5, 16], [14, 13], [14, 33], [5, 30]]);
      maskLine(shape, cx + 10, 15, w - 7, active ? 8 : 12, 3);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 4, 8, 8, 5, P.panel);
      rect(out, cx - 2, 9, 5, 2, P.highlight);
      rect(out, 6, 18, 6, 8, P.shadow);
      rect(out, 8, 20, 3, 4, actor.accent);
      rect(out, cx - 3, 20, 6, 6, P.danger);
      rect(out, cx - 7, ground + 3, 6, 1, P.outline);
      rect(out, cx + 2, ground + 3, 6, 1, P.outline);
      break;
    }
    case 'guardian': {
      maskRect(shape, cx - 12, 8, 24, 28);
      maskRect(shape, cx - 7, 4, 14, 9);
      const armY = active ? 16 : 20;
      maskRect(shape, 7, armY, 14, 10);
      maskRect(shape, w - 21, active ? 20 : 16, 14, 10);
      maskRect(shape, active ? cx - 13 : cx - 11, 34, 10, ground - 33);
      maskRect(shape, active ? cx + 4 : cx + 2, 34, 10, ground - 33);
      for (const [x, y] of [[7, 9], [w - 8, 9], [5, 33], [w - 6, 33]]) maskPolygon(shape, [[cx, 23], [x, y], [x + (x < cx ? 7 : -7), y + 4]]);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 5, 8, 10, 5, P.mid);
      rect(out, cx - 2, 9, 5, 3, P.highlight);
      rect(out, cx - 8, 17, 16, 12, P.panel);
      rect(out, cx - 4, 20, 8, 7, actor.accent);
      put(out, cx, 22, P.highlight);
      break;
    }
    case 'moth': {
      // Dusk bat: thin cut-paper wings with unmistakable bite notches.
      const top = active ? 5 : 3;
      maskPolygon(shape, [[cx - 2, 10], [5, top], [6, 10], [9, 11], [6, 14], [7, 17], [cx - 3, 14]]);
      maskPolygon(shape, [[cx + 2, 10], [w - 6, top], [w - 7, 10], [w - 10, 11], [w - 7, 14], [w - 8, 17], [cx + 3, 14]]);
      maskRect(shape, 5, top, 2, 2);
      maskRect(shape, w - 7, top, 2, 2);
      maskRect(shape, cx - 2, 8, 5, 9);
      maskPolygon(shape, [[cx - 2, 16], [cx, ground], [cx + 2, 16]]);
      paintShape(out, shape, actor.fill);
      line(out, 7, top + 2, cx - 2, 12, actor.accent, 1);
      line(out, w - 8, top + 2, cx + 2, 12, actor.accent, 1);
      rect(out, cx - 1, 10, 3, 3, P.highlight);
      break;
    }
    case 'ember-moth': {
      // Ember bat: solid heavy wings and a broad tail, never the Dusk notch.
      const top = active ? 5 : 3;
      const low = active ? 19 : 17;
      maskPolygon(shape, [[cx - 2, 9], [3, top], [4, 14], [8, low], [cx - 3, 15]]);
      maskPolygon(shape, [[cx + 2, 9], [w - 4, top], [w - 5, 14], [w - 9, low], [cx + 3, 15]]);
      maskRect(shape, 3, top, 3, 3);
      maskRect(shape, w - 6, top, 3, 3);
      maskRect(shape, cx - 3, 8, 7, 10);
      maskPolygon(shape, [[cx - 5, 16], [cx - 4, ground], [cx, ground - 2], [cx + 4, ground], [cx + 5, 16]]);
      maskRect(shape, cx - 2, ground - 1, 5, 2);
      paintShape(out, shape, actor.fill);
      rect(out, 6, top + 4, 6, 4, actor.accent);
      rect(out, w - 12, top + 4, 6, 4, actor.accent);
      rect(out, cx - 1, 10, 3, 3, P.highlight);
      rect(out, cx - 3, 16, 7, 2, P.attack);
      break;
    }
    case 'frost-moth': {
      const wingHalf = 12;
      const top = 4;
      const bottom = active ? 19 : 18;
      maskPolygon(shape, [[cx - 2, 10], [cx - wingHalf, top], [cx - wingHalf + 1, bottom], [cx - 3, 15]]);
      maskPolygon(shape, [[cx + 2, 10], [cx + wingHalf, top], [cx + wingHalf - 1, bottom], [cx + 3, 15]]);
      maskRect(shape, cx - 3, 9, 7, 9);
      maskPolygon(shape, [[cx - 2, 17], [cx, ground], [cx + 2, 17]]);
      paintShape(out, shape, actor.fill);
      line(out, cx - wingHalf + 1, top + 2, cx - 2, 13, actor.accent, 2);
      line(out, cx + wingHalf - 1, top + 2, cx + 2, 13, actor.accent, 2);
      rect(out, cx - 1, 11, 3, 3, P.highlight);
      rect(out, cx - 2, 16, 5, 2, P.focal);
      if (!active) rect(out, cx - 5, 16, 11, 2, actor.fill);
      break;
    }
    case 'husk': {
      // Reach on one side, a collapsed arm on the other, and mismatched boots.
      maskRect(shape, cx - 5, 6, 10, 8);
      maskPolygon(shape, [[cx - 6, 14], [cx + 6, 14], [cx + 7, 27], [cx + 4, 29], [cx - 7, 28]]);
      maskLine(shape, cx - 5, 17, 6, active ? 19 : 21, 4);
      maskLine(shape, cx + 6, 17, active ? w - 10 : w - 11, active ? 25 : 22, 3);
      maskRect(shape, active ? cx - 7 : cx - 6, 27, active ? 7 : 6, ground - 26);
      maskRect(shape, active ? cx + 2 : cx + 1, 28, active ? 6 : 8, ground - 27);
      maskRect(shape, active ? cx - 9 : cx - 8, ground - 2, active ? 9 : 8, 3);
      maskRect(shape, active ? cx + 2 : cx + 1, ground - 1, active ? 7 : 9, 2);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 3, 8, 6, 3, P.panel);
      put(out, cx - 2, 9, actor.accent); put(out, cx + 2, 9, actor.accent);
      line(out, cx - 4, 17, cx + 4, 25, P.shadow, 2);
      break;
    }
    case 'warden': {
      // Separated bones and forked gaps keep this readable as a skeleton even
      // when reduced to a small silhouette.
      maskRect(shape, cx - 5, 6, 10, 8);
      maskLine(shape, cx, 14, cx, 28, 3);
      for (const y of [16, 20, 24]) maskLine(shape, cx - 6, y, cx + 6, y, 2);
      maskLine(shape, cx - 6, 16, active ? 5 : 7, active ? 24 : 27, 3);
      maskLine(shape, cx + 6, 16, active ? w - 8 : w - 6, active ? 27 : 23, 3);
      maskLine(shape, cx - 1, 27, active ? cx - 8 : cx - 6, ground, 3);
      maskLine(shape, cx + 1, 27, active ? cx + 7 : cx + 5, ground, 3);
      maskLine(shape, cx, 27, active ? cx - 5 : cx + 5, 31, 2);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 3, 7, 3, 3, P.panel); rect(out, cx + 2, 7, 3, 3, P.panel);
      put(out, cx, 11, P.panel);
      for (const y of [17, 21, 25]) {
        rect(out, cx - 4, y, 3, 2, P.shadow);
        rect(out, cx + 2, y, 3, 2, P.shadow);
      }
      rect(out, cx - 1, 17, 3, 8, actor.accent);
      break;
    }
    case 'shade': {
      maskRect(shape, cx - 6, 5, 12, 10);
      maskPolygon(shape, active
        ? [[cx - 8, 14], [cx + 8, 14], [cx + 10, 23], [cx + 5, 27], [cx + 2, ground], [cx - 1, ground - 4], [cx - 7, 27], [cx - 10, 24]]
        : [[cx - 8, 14], [cx + 8, 14], [cx + 9, 24], [cx + 4, 28], [cx, ground], [cx - 4, 28], [cx - 9, 24]]);
      maskRect(shape, 6, active ? 22 : 23, 2, 3);
      maskRect(shape, w - 8, active ? 23 : 22, 2, 3);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 4, 8, 8, 4, P.panel);
      rect(out, cx - 2, 9, 5, 2, P.highlight);
      line(out, active ? cx - 5 : cx - 6, 17, active ? cx + 4 : cx + 5, 23, actor.accent, 2);
      put(out, cx, ground - 1, P.focal);
      break;
    }
    case 'spore': {
      maskRect(shape, cx - 5, 19, 10, 12);
      const spread = active ? 5 : 6;
      maskPolygon(shape, [[cx, 20], [spread, 12], [cx - 5, 9]]);
      maskPolygon(shape, [[cx, 20], [w - 1 - spread, 12], [cx + 5, 9]]);
      maskPolygon(shape, [[cx, 19], [cx - 8, 6], [cx, 10], [cx + 8, 6]]);
      maskRect(shape, cx - 9, 27, 18, ground - 26);
      paintShape(out, shape, actor.fill);
      rect(out, cx - 6, 14, 12, 8, P.panel);
      rect(out, cx - 4, 17, 8, 3, P.highlight);
      put(out, cx, 11, actor.accent);
      break;
    }
    case 'wraith': {
      const wingY = active ? 15 : 8;
      maskPolygon(shape, [[cx - 5, 18], [5, wingY], [10, 36], [cx - 6, 31]]);
      maskPolygon(shape, [[cx + 5, 18], [w - 6, wingY], [w - 11, 36], [cx + 6, 31]]);
      maskRect(shape, cx - 10, 14, 20, 25);
      maskPolygon(shape, [[cx - 7, 14], [cx - 4, 5], [cx, 11], [cx + 4, 4], [cx + 7, 14]]);
      maskPolygon(shape, [[cx - 8, 37], [cx + 8, 37], [cx + 5, ground], [cx, ground - 5], [cx - 6, ground]]);
      paintShape(out, shape, actor.fill);
      line(out, 9, wingY + 3, cx - 6, 25, P.accent, 3);
      line(out, w - 10, wingY + 3, cx + 6, 25, P.accent, 3);
      rect(out, cx - 6, 19, 12, 8, P.panel);
      rect(out, cx - 2, 21, 5, 4, P.highlight);
      rect(out, cx - 5, 8, 10, 3, actor.accent);
      break;
    }
    case 'spider': {
      // Low/wide abdomen plus four visibly jointed leg pairs. Each pose swaps
      // which diagonals reach, producing an alternating crawler gait.
      maskEllipse(shape, cx, 28, 13, 10);
      maskEllipse(shape, cx, 17, 7, 7);
      maskRect(shape, cx - 7, 20, 15, 9);
      for (let i = 0; i < 4; i++) {
        const anchorY = 19 + i * 4;
        const kneeY = 8 + i * 11 + (active && i % 2 === 0 ? 3 : 0);
        const baseFootX = 5 + i * 2;
        const stride = active ? (i % 2 === 0 ? 2 : -1) : 0;
        const leftFootX = baseFootX + stride;
        const rightFootX = w - 1 - baseFootX + (active ? -stride : 0);
        const footY = [5, 25, 43, ground][i];
        maskLine(shape, cx - 10, anchorY, 15 + i, kneeY, 3);
        maskLine(shape, 15 + i, kneeY, leftFootX, footY, 3);
        maskLine(shape, cx + 10, anchorY, w - 16 - i, kneeY, 3);
        maskLine(shape, w - 16 - i, kneeY, rightFootX, footY, 3);
        maskRect(shape, 14 + i, kneeY - 1, 3, 3);
        maskRect(shape, w - 17 - i, kneeY - 1, 3, 3);
      }
      paintShape(out, shape, actor.fill);
      rect(out, cx - 5, 15, 10, 5, P.mid);
      for (const x of [cx - 3, cx + 2]) put(out, x, 16, P.highlight);
      rect(out, cx - 9, 25, 18, 8, actor.accent);
      rect(out, cx - 5, 27, 10, 4, P.panel);
      rect(out, cx - 2, 34, 5, 2, P.health);
      break;
    }
    case 'swarm-beast': {
      maskRect(shape, cx - 6, 10, 12, 11);
      const wingTop = active ? 9 : 5;
      maskPolygon(shape, [[cx - 5, 13], [4, wingTop], [7, ground - 2], [cx - 6, 20]]);
      maskPolygon(shape, [[cx + 5, 13], [w - 5, wingTop], [w - 8, ground - 2], [cx + 6, 20]]);
      maskPolygon(shape, [[cx - 4, 20], [cx, ground], [cx + 4, 20]]);
      for (const x of [9, 14, w - 15, w - 10]) maskPolygon(shape, [[x, 9], [x - 3, 5], [x + 3, 7]]);
      paintShape(out, shape, actor.fill);
      line(out, 7, wingTop + 2, cx - 7, 19, actor.accent, 2);
      line(out, w - 8, wingTop + 2, cx + 7, 19, actor.accent, 2);
      rect(out, cx - 4, 13, 8, 6, P.panel);
      rect(out, cx - 1, 14, 3, 3, P.highlight);
      rect(out, cx - 2, ground + 2, 5, 1, P.outline);
      break;
    }
    default:
      throw new Error(`unknown actor kind ${actor.kind}`);
  }
  return out;
}

const WEAPON_SIZES = Object.freeze({
  kick: [[48, 30], [60, 38]],
  clap: [[48, 32], [62, 40]],
  snare: [[30, 26], [40, 34]],
  hat: [[30, 26], [42, 34]],
  bass: [[112, 64], [120, 72]],
  lead: [[32, 26], [44, 34]],
  arp: [[42, 42], [52, 52]],
  chord: [[96, 64], [112, 72]],
  bell: [[32, 32], [44, 44]],
});

export const WEAPON_ROLES = Object.freeze(['kick', 'clap', 'snare', 'hat', 'bass', 'lead', 'arp', 'chord', 'bell']);

const WEAPON_STRUCTURE_TAGS = Object.freeze({
  'clap/normal': ['crown-fan'],
  'snare/normal': ['needle-tail'],
  'chord/normal': ['rounded-square-zone'],
  'kick/evolved': ['four-lane', 'stamped'],
  'clap/evolved': ['bracket-ring'],
  'snare/evolved': ['twin-rail'],
  'hat/evolved': ['linked-orbit', 'rail'],
  'lead/evolved': ['segmented-serpent', 'head'],
  'arp/evolved': ['paired-crown', 'central-void'],
  'chord/evolved': ['linked-merged-cell'],
});

function weaponDefinition(role, evolved, image) {
  const variant = evolved ? 'evolved' : 'normal';
  return {
    key: `weapons/${role}/${variant}`,
    pivot: { x: Math.floor(image.width / 2), y: Math.floor(image.height / 2) },
    semanticClass: 'weapon-attack',
    tags: ['attack', role, variant, ...(WEAPON_STRUCTURE_TAGS[`${role}/${variant}`] ?? [])],
    colorBudget: evolved ? 8 : 6,
  };
}

function drawWeapon(role, evolved) {
  const [w, h] = WEAPON_SIZES[role][evolved ? 1 : 0];
  const out = createImage(w, h);
  const shape = mask(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  const edge = evolved ? 5 : 4;
  switch (role) {
    case 'kick': {
      if (evolved) {
        // Four separately stamped lanes communicate the evolved multi-strip
        // footprint; this is a different structure, not a larger arrow.
        for (let lane = 0; lane < 4; lane++) {
          const y = 6 + lane * 8;
          maskPolygon(shape, [[5, y - 1], [w - 13, y - 1], [w - 13, y - 4], [w - 5, y], [w - 13, y + 4], [w - 13, y + 1], [5, y + 1]]);
        }
      } else {
        maskPolygon(shape, [[edge, cy - 5], [w - 14, cy - 5], [w - 14, cy - 10], [w - edge, cy], [w - 14, cy + 10], [w - 14, cy + 5], [edge, cy + 5]]);
      }
      paintShape(out, shape, P.attack);
      if (evolved) {
        for (let lane = 0; lane < 4; lane++) {
          const y = 6 + lane * 8;
          rect(out, 9 + (lane % 2) * 5, y - 1, 6, 2, lane % 2 ? P.currency : P.highlight);
          rect(out, 25 + (lane % 2) * 4, y - 1, 4, 2, P.panel);
        }
      } else line(out, 8, cy - 2, w - 13, cy - 2, P.highlight, 2);
      break;
    }
    case 'clap': {
      if (evolved) {
        // A bracketed ring leaves the impact center open.
        maskLine(shape, 8, 7, 8, h - 8, 4);
        maskLine(shape, w - 9, 7, w - 9, h - 8, 4);
        maskLine(shape, 8, 7, 20, 7, 4);
        maskLine(shape, 8, h - 8, 20, h - 8, 4);
        maskLine(shape, w - 21, 7, w - 9, 7, 4);
        maskLine(shape, w - 21, h - 8, w - 9, h - 8, 4);
        maskLine(shape, 20, 10, cx - 6, cy - 5, 3);
        maskLine(shape, w - 21, 10, cx + 6, cy - 5, 3);
        maskLine(shape, 20, h - 11, cx - 6, cy + 5, 3);
        maskLine(shape, w - 21, h - 11, cx + 6, cy + 5, 3);
      } else {
        // Five short wedges rise into a crown-shaped fan.
        const originY = h - 6;
        for (let i = 0; i < 5; i++) {
          const tipX = 6 + i * 9;
          const tipY = i % 2 === 0 ? 5 : 9;
          maskPolygon(shape, [[cx - 3, originY], [tipX - 3, tipY + 4], [tipX, tipY], [tipX + 3, tipY + 4], [cx + 3, originY]]);
        }
        maskLine(shape, 8, 11, w - 9, 11, 2);
      }
      paintShape(out, shape, P.accent);
      if (evolved) {
        rect(out, 8, cy - 2, 4, 5, P.highlight);
        rect(out, w - 12, cy - 2, 4, 5, P.attack);
      } else {
        rect(out, cx - 4, h - 9, 9, 3, P.highlight);
        for (const x of [6, 24, 42]) put(out, x, 6, P.attack);
      }
      break;
    }
    case 'snare': {
      if (evolved) {
        // Twin rails and stamped ties read as a sustained straight-line shot.
        maskLine(shape, 5, cy - 5, w - 9, cy - 5, 3);
        maskLine(shape, 5, cy + 5, w - 9, cy + 5, 3);
        for (let x = 8; x < w - 10; x += 7) maskLine(shape, x, cy - 6, x, cy + 6, 2);
        maskPolygon(shape, [[w - 11, cy - 9], [w - 4, cy], [w - 11, cy + 9]]);
      } else {
        // Compact needle head with a kinked trailing tail.
        maskPolygon(shape, [[cx - 3, cy - 3], [w - 4, cy], [cx - 3, cy + 3]]);
        maskLine(shape, 5, cy + 7, 10, cy + 2, 2);
        maskLine(shape, 10, cy + 2, cx - 2, cy, 2);
        maskRect(shape, cx - 5, cy - 2, 5, 5);
      }
      paintShape(out, shape, P.focal);
      if (evolved) {
        line(out, 7, cy - 5, w - 12, cy - 5, P.highlight, 1);
        rect(out, w - 10, cy - 2, 4, 5, P.accent);
      } else {
        line(out, cx - 2, cy, w - 8, cy, P.highlight, 1);
        rect(out, 6, cy + 5, 3, 2, P.accent);
      }
      break;
    }
    case 'hat': {
      if (evolved) {
        // Linked orbit: four nodes ride a continuous angular rail.
        const nodes = [[6, cy], [cx, 6], [w - 7, cy], [cx, h - 7]];
        for (let i = 0; i < nodes.length; i++) {
          const [x0, y0] = nodes[i];
          const [x1, y1] = nodes[(i + 1) % nodes.length];
          maskLine(shape, x0, y0, x1, y1, 2);
          maskPolygon(shape, [[x0, y0 - 4], [x0 + 4, y0], [x0, y0 + 4], [x0 - 4, y0]]);
        }
      } else {
        for (let i = 0; i < 3; i++) {
          const x = 5 + i * Math.floor((w - 10) / 2);
          maskPolygon(shape, [[x, cy - (i % 2 ? 2 : 6)], [x + 5, cy], [x, cy + (i % 2 ? 6 : 3)], [x - 3, cy]]);
        }
      }
      paintShape(out, shape, P.xp);
      if (evolved) {
        for (const [x, y] of [[6, cy], [cx, 6], [w - 7, cy], [cx, h - 7]]) put(out, x, y, P.highlight);
        line(out, 11, cy, w - 12, cy, P.focal, 1);
      } else for (let x = 7; x < w - 5; x += 9) put(out, x, cy - 1, P.highlight);
      break;
    }
    case 'bass': {
      const color = evolved ? P.danger : P.accent;
      const thickness = evolved ? 3 : 2;
      const amplitude = evolved ? 23 : 18;
      for (let x = 5; x < w - 5; x++) {
        const phase = x % 24;
        const triangle = phase <= 12 ? phase : 24 - phase;
        const y = cy - Math.floor((triangle - 6) * amplitude / 12);
        put(out, x, y, color);
        for (let t = 1; t < thickness; t++) put(out, x, y + t, color);
        if (evolved) put(out, x, h - 1 - y, P.focal);
      }
      line(out, 6, cy, w - 7, cy, evolved ? P.highlight : P.attack, 2);
      break;
    }
    case 'lead': {
      if (evolved) {
        // Segmented serpent with an explicit head and eye.
        const segments = [[5, cy + 7], [11, cy], [17, cy + 4], [23, cy - 5], [30, cy - 1], [36, cy - 8]];
        for (let i = 0; i < segments.length - 1; i++) {
          const [x0, y0] = segments[i];
          const [x1, y1] = segments[i + 1];
          maskLine(shape, x0, y0, x1, y1, 4);
          maskRect(shape, x0 - 2, y0 - 2, 5, 5);
        }
        maskPolygon(shape, [[34, cy - 12], [w - 4, cy - 8], [36, cy - 3]]);
      } else {
        maskPolygon(shape, [[4, cy + 3], [cx - 2, 5], [w - 5, cy], [cx - 2, h - 6]]);
      }
      paintShape(out, shape, P.focal);
      if (evolved) {
        for (const [x, y] of [[6, cy + 7], [17, cy + 4], [30, cy - 1]]) put(out, x, y, P.highlight);
        rect(out, w - 9, cy - 8, 3, 3, P.accent);
        put(out, w - 7, cy - 8, P.highlight);
      } else line(out, 8, cy, w - 9, cy, P.highlight, 2);
      break;
    }
    case 'arp': {
      if (evolved) {
        // Paired crowns deliberately stop short of center, leaving a clear void.
        maskLine(shape, 6, 34, 10, 14, 3);
        maskLine(shape, 10, 14, 15, 23, 3);
        maskLine(shape, 15, 23, 20, 8, 3);
        maskLine(shape, 20, 8, 24, 34, 3);
        maskLine(shape, 6, 34, 24, 34, 3);
        maskLine(shape, w - 7, 34, w - 11, 14, 3);
        maskLine(shape, w - 11, 14, w - 16, 23, 3);
        maskLine(shape, w - 16, 23, w - 21, 8, 3);
        maskLine(shape, w - 21, 8, w - 25, 34, 3);
        maskLine(shape, w - 25, 34, w - 7, 34, 3);
      } else {
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI * 2 / 4;
          const x = Math.round(cx + Math.cos(angle) * 13);
          const y = Math.round(cy + Math.sin(angle) * 13);
          maskPolygon(shape, [[x, y - 4], [x + 4, y], [x, y + 4], [x - 4, y]]);
        }
        maskRect(shape, cx - 3, cy - 3, 7, 7);
      }
      paintShape(out, shape, P.accent);
      if (evolved) {
        rect(out, 18, 9, 4, 4, P.focal);
        rect(out, w - 22, 9, 4, 4, P.focal);
        put(out, 10, 15, P.highlight);
        put(out, w - 11, 15, P.highlight);
        for (let y = 5; y < h - 5; y++) {
          for (let x = cx - 2; x <= cx + 2; x++) clear(out, x, y);
        }
      } else rect(out, cx - 1, cy - 1, 3, 3, P.highlight);
      break;
    }
    case 'chord': {
      if (evolved) {
        // Two rounded cells share a stamped bridge, matching merged zone cells.
        const cells = [[5, 58], [w - 59, w - 6]];
        for (const [left, right] of cells) {
          maskRect(shape, left + 7, 7, right - left - 13, 4);
          maskRect(shape, left + 7, h - 11, right - left - 13, 4);
          maskRect(shape, left, 14, 4, h - 28);
          maskRect(shape, right - 3, 14, 4, h - 28);
          maskRect(shape, left + 3, 10, 7, 5);
          maskRect(shape, right - 9, 10, 7, 5);
          maskRect(shape, left + 3, h - 15, 7, 5);
          maskRect(shape, right - 9, h - 15, 7, 5);
        }
        maskRect(shape, cx - 9, cy - 4, 19, 9);
      } else {
        // One large rounded-square zone contour.
        maskRect(shape, 12, 5, w - 24, 4);
        maskRect(shape, 12, h - 9, w - 24, 4);
        maskRect(shape, 5, 12, 4, h - 24);
        maskRect(shape, w - 9, 12, 4, h - 24);
        for (const [x, y] of [[8, 8], [w - 15, 8], [8, h - 13], [w - 15, h - 13]]) maskRect(shape, x, y, 7, 5);
      }
      paintShape(out, shape, evolved ? P.attack : P.currency);
      if (evolved) {
        rect(out, cx - 6, cy - 2, 13, 5, P.panel);
        rect(out, cx - 2, cy - 1, 5, 3, P.focal);
        for (const x of [12, w - 15]) rect(out, x, 8, 4, 2, P.highlight);
      } else {
        for (const [x, y] of [[13, 6], [w - 16, 6], [13, h - 8], [w - 16, h - 8]]) rect(out, x, y, 4, 2, P.highlight);
        rect(out, cx - 3, 5, 7, 3, P.panel);
      }
      break;
    }
    case 'bell':
      maskPolygon(shape, [[cx - 8, cy - 7], [cx - 4, 5], [cx + 4, 5], [cx + 8, cy - 7], [cx + 10, cy + 7], [cx - 10, cy + 7]]);
      maskRect(shape, cx - 12, cy + 6, 25, 5);
      maskEllipse(shape, cx, cy + 11, evolved ? 6 : 4, evolved ? 5 : 3);
      if (evolved) { maskLine(shape, 5, 7, cx - 8, cy, 3); maskLine(shape, w - 6, 7, cx + 8, cy, 3); }
      paintShape(out, shape, P.currency);
      line(out, cx - 5, 8, cx + 4, 8, P.highlight, 2);
      if (evolved) rect(out, cx - 2, cy, 5, 5, P.focal);
      break;
    default:
      throw new Error(`unknown weapon role ${role}`);
  }
  return out;
}

const PICKUPS = Object.freeze([
  { id: 'xp-blue', size: [16, 16], budget: 5, tags: ['xp', 'small'] },
  { id: 'xp-green', size: [18, 18], budget: 5, tags: ['xp', 'medium', 'faceted-diamond', 'single-split'] },
  { id: 'xp-red', size: [20, 20], budget: 6, tags: ['xp', 'large', 'faceted-diamond', 'double-split'] },
  { id: 'music-note', size: [18, 20], budget: 6, tags: ['currency', 'small', 'stamped-head', 'stem'] },
  { id: 'reward-pedestal', size: [38, 40], budget: 8, tags: ['weapon-choice', 'pedestal'] },
  { id: 'evolution-chest', size: [42, 40], budget: 9, tags: ['encore-case', 'reward'] },
]);

function drawPickup(pickup) {
  const [w, h] = pickup.size;
  const out = createImage(w, h);
  const shape = mask(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  if (pickup.id.startsWith('xp-')) {
    // All XP tiers share one cyan faceted-diamond silhouette. Tier information
    // lives in non-crossing internal split marks, never plus/hourglass bodies.
    const radius = pickup.id === 'xp-blue' ? 4 : pickup.id === 'xp-green' ? 5 : 6;
    maskPolygon(shape, [[cx, cy - radius], [cx + radius, cy], [cx, cy + radius], [cx - radius, cy]]);
    paintShape(out, shape, pickup.id === 'xp-blue' ? P.xp : P.focal, 1);
    put(out, cx - 1, cy - radius + 2, P.highlight);
    put(out, cx - 2, cy - radius + 3, P.xp);
    if (pickup.id === 'xp-green') {
      line(out, cx, cy - 3, cx, cy + 3, P.panel, 1);
    } else if (pickup.id === 'xp-red') {
      line(out, cx - 3, cy - 2, cx + 2, cy + 3, P.panel, 1);
      line(out, cx - 1, cy - 4, cx + 4, cy + 1, P.xp, 1);
    }
  } else if (pickup.id === 'music-note') {
    // Stamped block head and a single rigid stem remain readable at pickup size.
    maskRect(shape, 3, 12, 7, 5);
    maskRect(shape, 8, 5, 3, 11);
    maskRect(shape, 10, 5, 5, 4);
    maskRect(shape, 13, 8, 3, 3);
    paintShape(out, shape, P.currency, 1);
    rect(out, 4, 13, 4, 2, P.panel);
    rect(out, 9, 6, 2, 4, P.highlight);
  } else if (pickup.id === 'reward-pedestal') {
    maskRect(shape, 7, 26, 24, 9);
    maskRect(shape, 10, 20, 18, 8);
    maskRect(shape, 17, 10, 5, 11);
    maskPolygon(shape, [[8, 20], [13, 11], [16, 20]]);
    maskPolygon(shape, [[23, 20], [28, 11], [31, 20]]);
    maskPolygon(shape, [[16, 10], [19, 4], [22, 10]]);
    paintShape(out, shape, P.mid);
    rect(out, 11, 28, 16, 4, P.panel);
    rect(out, 16, 29, 7, 3, P.accent);
    line(out, 19, 10, 19, 20, P.highlight, 2);
    put(out, 19, 24, P.focal);
  } else {
    maskRect(shape, 5, 14, 32, 20);
    maskRect(shape, 8, 9, 26, 8);
    maskRect(shape, 18, 5, 7, 7);
    paintShape(out, shape, P.danger);
    rect(out, 8, 18, 26, 12, P.panel);
    rect(out, 11, 20, 20, 3, P.accent);
    rect(out, 18, 23, 7, 6, P.currency);
    put(out, 21, 25, P.highlight);
  }
  return out;
}

const EFFECTS = Object.freeze([
  { id: 'impact-cyan', size: [26, 26], budget: 6, color: P.focal, tags: ['impact'] },
  { id: 'impact-gold', size: [32, 32], budget: 6, color: P.currency, tags: ['impact'] },
  { id: 'explosion', size: [44, 44], budget: 8, color: P.attack, tags: ['explosion'] },
  { id: 'death', size: [42, 42], budget: 8, color: P.health, tags: ['death'] },
  { id: 'xp-collect', size: [30, 34], budget: 6, color: P.xp, tags: ['collection', 'inward-collapse'] },
  { id: 'celebration', size: [48, 46], budget: 8, color: P.currency, tags: ['celebration', 'bar-confetti', 'non-pickup'] },
]);

function drawEffect(effect) {
  const [w, h] = effect.size;
  const out = createImage(w, h);
  const shape = mask(w, h);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  if (effect.id.startsWith('impact')) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      maskLine(shape, cx + Math.cos(angle) * 4, cy + Math.sin(angle) * 4,
        cx + Math.cos(angle) * (cx - 4), cy + Math.sin(angle) * (cy - 4), i % 2 ? 2 : 3);
    }
    maskRect(shape, cx - 3, cy - 3, 7, 7);
    paintShape(out, shape, effect.color, 1);
    rect(out, cx - 1, cy - 1, 3, 3, P.highlight);
  } else if (effect.id === 'explosion') {
    maskPolygon(shape, [[cx, 3], [cx + 5, 13], [w - 5, 8], [w - 12, cy], [w - 5, h - 8], [cx + 5, h - 14], [cx, h - 4], [cx - 5, h - 14], [5, h - 8], [12, cy], [5, 8], [cx - 5, 13]]);
    paintShape(out, shape, effect.color);
    maskEllipse(shape, cx, cy, 8, 8);
    rect(out, cx - 7, cy - 7, 15, 15, P.currency);
    rect(out, cx - 3, cy - 3, 7, 7, P.highlight);
  } else if (effect.id === 'death') {
    for (let i = 0; i < 6; i++) {
      const x = 6 + i * 6;
      maskPolygon(shape, [[cx, cy], [x, 5 + (i % 2) * 4], [x + 4, 12], [cx + (i - 3), cy + 2]]);
      maskPolygon(shape, [[cx, cy], [x, h - 6 - (i % 2) * 3], [x + 4, h - 12], [cx + (i - 3), cy - 2]]);
    }
    paintShape(out, shape, effect.color, 1);
    rect(out, cx - 4, cy - 4, 9, 9, P.panel);
    rect(out, cx - 1, cy - 1, 3, 3, P.accent);
  } else if (effect.id === 'xp-collect') {
    // Four directional chevrons collapse toward a tiny central XP core.
    maskPolygon(shape, [[cx, cy - 3], [cx - 5, cy - 9], [cx - 2, cy - 9], [cx, 5], [cx + 2, cy - 9], [cx + 5, cy - 9]]);
    maskPolygon(shape, [[cx, cy + 3], [cx - 5, cy + 9], [cx - 2, cy + 9], [cx, h - 6], [cx + 2, cy + 9], [cx + 5, cy + 9]]);
    maskPolygon(shape, [[cx - 3, cy], [cx - 9, cy - 5], [cx - 9, cy - 2], [5, cy], [cx - 9, cy + 2], [cx - 9, cy + 5]]);
    maskPolygon(shape, [[cx + 3, cy], [cx + 9, cy - 5], [cx + 9, cy - 2], [w - 6, cy], [cx + 9, cy + 2], [cx + 9, cy + 5]]);
    maskPolygon(shape, [[cx, cy - 3], [cx + 3, cy], [cx, cy + 3], [cx - 3, cy]]);
    paintShape(out, shape, effect.color, 1);
    put(out, cx, cy, P.highlight);
    for (const [x, y] of [[cx, 7], [cx, h - 8], [7, cy], [w - 8, cy]]) put(out, x, y, P.focal);
  } else {
    // Celebration uses bars, streamers, and L-chips only; none can be mistaken
    // for the game's diamond XP or stamped-note pickups.
    const bars = [
      [6, 6, 2, 6], [16, 5, 6, 2], [31, 7, 2, 7], [40, 5, 3, 5],
      [9, 21, 6, 2], [22, 17, 2, 7], [35, 21, 7, 2],
      [5, 35, 3, 5], [16, 36, 7, 2], [31, 34, 2, 7], [40, 36, 4, 3],
    ];
    for (const [x, y, width, height] of bars) maskRect(shape, x, y, width, height);
    maskLine(shape, 12, 11, 15, 15, 2);
    maskLine(shape, 35, 12, 39, 15, 2);
    maskLine(shape, 13, 28, 9, 31, 2);
    maskLine(shape, 36, 28, 40, 31, 2);
    paintShape(out, shape, effect.color, 1);
    rect(out, 16, 5, 6, 2, P.accent);
    rect(out, 35, 21, 7, 2, P.focal);
    rect(out, 16, 36, 7, 2, P.health);
    rect(out, 40, 6, 2, 3, P.highlight);
  }
  return out;
}

const UI_ICONS = Object.freeze([
  ['highTops', 'items'], ['fastForward', 'items'], ['needleTips', 'items'], ['mirrorball', 'items'], ['wideLens', 'items'],
  ['heavyAmp', 'items'], ['extensionCable', 'items'], ['magnetLanyard', 'items'], ['paddedJacket', 'items'], ['recoveryTape', 'items'],
  ['heart', 'status'], ['xp', 'status'], ['note', 'status'], ['level', 'status'], ['pause', 'status'],
  ['reroll', 'actions'], ['shop', 'actions'], ['evolution', 'actions'], ['weapon-pedestal', 'actions'], ['enemy-skull', 'actions'],
]);

const UI_STRUCTURE_TAGS = Object.freeze({
  'items/extensionCable': ['plug', 'loop'],
  'items/recoveryTape': ['two-reel-holes'],
  'items/mirrorball': ['facets', 'hanger'],
  'status/heart': ['stepped-heart', 'pink'],
  'status/xp': ['cyan-diamond'],
  'actions/evolution': ['chevron-crown'],
  'actions/weapon-pedestal': ['grounded-plinth'],
});

const ENVIRONMENT_STRUCTURE_TAGS = Object.freeze({
  'cyan-crystals': ['muted-role-color', 'separate-shards'],
  'purple-banner': ['muted-role-color', 'folded-cloth'],
  'rune-dais': ['muted-role-color', 'recessed-runes'],
});

function drawCompactUiIcon(id, category) {
  const out = createImage(20, 20);
  const shape = mask(20, 20);
  const fill = id === 'heart' ? P.health : id === 'xp' ? P.xp : category === 'status' ? P.currency : P.accent;
  switch (id) {
    case 'heart':
      maskRect(shape, 4, 5, 5, 4); maskRect(shape, 11, 5, 5, 4);
      maskRect(shape, 3, 8, 14, 4); maskRect(shape, 5, 12, 10, 3);
      maskRect(shape, 7, 15, 6, 2); maskRect(shape, 9, 17, 2, 1);
      break;
    case 'xp': maskPolygon(shape, [[10, 2], [18, 10], [10, 18], [2, 10]]); break;
    case 'note': maskEllipse(shape, 6, 15, 3, 3); maskRect(shape, 8, 4, 3, 12); maskPolygon(shape, [[10, 4], [17, 6], [10, 9]]); break;
    case 'level': maskPolygon(shape, [[10, 2], [18, 11], [14, 11], [14, 18], [6, 18], [6, 11], [2, 11]]); break;
    case 'pause': maskRect(shape, 4, 3, 5, 15); maskRect(shape, 12, 3, 5, 15); break;
    case 'reroll': maskLine(shape, 4, 11, 6, 5, 3); maskLine(shape, 6, 5, 14, 4, 3); maskPolygon(shape, [[14, 2], [18, 5], [13, 8]]); maskLine(shape, 16, 10, 14, 16, 3); maskLine(shape, 14, 16, 6, 17, 3); maskPolygon(shape, [[6, 19], [2, 16], [7, 13]]); break;
    case 'shop': maskRect(shape, 3, 8, 14, 10); maskPolygon(shape, [[2, 8], [5, 3], [15, 3], [18, 8]]); break;
    case 'evolution':
      maskPolygon(shape, [[3, 14], [5, 6], [9, 10], [10, 3], [12, 10], [16, 6], [18, 14]]);
      maskRect(shape, 4, 13, 13, 4);
      break;
    case 'weapon-pedestal':
      maskRect(shape, 2, 15, 16, 3); maskRect(shape, 5, 12, 10, 3);
      maskRect(shape, 8, 7, 4, 6); maskPolygon(shape, [[10, 3], [14, 7], [6, 7]]);
      break;
    case 'enemy-skull': maskEllipse(shape, 10, 8, 7, 7); maskRect(shape, 6, 13, 9, 4); break;
    default: throw new Error(`unknown compact UI icon ${id}`);
  }
  paintShape(out, shape, fill, 1);
  if (id === 'heart') {
    rect(out, 5, 7, 3, 2, P.highlight);
    rect(out, 12, 7, 2, 2, P.accent);
  } else if (id === 'xp') {
    line(out, 10, 5, 10, 14, P.panel, 1);
    rect(out, 7, 6, 2, 2, P.highlight);
  } else if (id === 'evolution') {
    line(out, 6, 13, 10, 9, P.panel, 1);
    line(out, 10, 9, 14, 13, P.panel, 1);
    put(out, 10, 5, P.highlight);
  } else if (id === 'weapon-pedestal') {
    rect(out, 3, 16, 14, 2, P.panel);
    rect(out, 7, 13, 7, 2, P.highlight);
    put(out, 10, 5, P.currency);
  } else if (id === 'enemy-skull') {
    rect(out, 6, 7, 3, 3, P.panel); rect(out, 12, 7, 3, 3, P.panel); rect(out, 9, 12, 3, 2, P.highlight);
  } else if (id === 'shop') {
    rect(out, 6, 12, 3, 6, P.panel); rect(out, 12, 11, 3, 3, P.highlight);
  } else put(out, 5 + (id.length % 9), 5 + (id.charCodeAt(0) % 8), P.highlight);
  return out;
}

function drawUiIcon(id, category) {
  if (category !== 'items') return drawCompactUiIcon(id, category);
  const out = createImage(28, 28);
  const shape = mask(28, 28);
  const fill = category === 'items' ? P.focal : category === 'status' ? P.currency : P.accent;
  switch (id) {
    case 'highTops': maskPolygon(shape, [[5, 15], [11, 15], [14, 9], [18, 11], [17, 17], [23, 20], [22, 23], [7, 23], [4, 20]]); break;
    case 'fastForward': maskPolygon(shape, [[4, 7], [13, 14], [4, 21]]); maskPolygon(shape, [[12, 7], [23, 14], [12, 21]]); break;
    case 'needleTips': for (const x of [7, 14, 21]) maskPolygon(shape, [[x, 4], [x + 2, 19], [x, 24], [x - 2, 19]]); break;
    case 'mirrorball':
      maskLine(shape, 14, 4, 14, 8, 2);
      maskRect(shape, 11, 4, 7, 2);
      maskEllipse(shape, 14, 15, 8, 7);
      break;
    case 'wideLens': maskEllipse(shape, 12, 12, 7, 7); maskLine(shape, 17, 17, 21, 21, 3); break;
    case 'heavyAmp': maskRect(shape, 5, 4, 18, 20); maskEllipse(shape, 14, 16, 6, 6); maskEllipse(shape, 14, 8, 2, 2); break;
    case 'extensionCable':
      maskLine(shape, 6, 7, 5, 17, 3); maskLine(shape, 5, 17, 10, 22, 3);
      maskLine(shape, 10, 22, 16, 20, 3); maskLine(shape, 16, 20, 17, 16, 3);
      maskRect(shape, 16, 12, 7, 7); maskRect(shape, 19, 9, 2, 4); maskRect(shape, 22, 10, 2, 3);
      break;
    case 'magnetLanyard': maskPolygon(shape, [[5, 5], [11, 5], [11, 17], [14, 20], [17, 17], [17, 5], [23, 5], [23, 18], [14, 24], [5, 18]]); break;
    case 'paddedJacket': maskPolygon(shape, [[9, 5], [13, 8], [15, 8], [19, 5], [24, 11], [21, 15], [20, 24], [8, 24], [7, 15], [4, 11]]); break;
    case 'recoveryTape': maskRect(shape, 5, 7, 18, 15); maskRect(shape, 7, 5, 14, 3); break;
    case 'heart': maskEllipse(shape, 9, 10, 5, 5); maskEllipse(shape, 19, 10, 5, 5); maskPolygon(shape, [[4, 11], [24, 11], [14, 24]]); break;
    case 'xp': maskPolygon(shape, [[14, 3], [24, 14], [14, 25], [4, 14]]); break;
    case 'note': maskEllipse(shape, 8, 21, 4, 4); maskRect(shape, 11, 5, 4, 17); maskPolygon(shape, [[14, 5], [23, 8], [14, 12]]); break;
    case 'level': maskPolygon(shape, [[14, 4], [24, 15], [18, 15], [18, 24], [10, 24], [10, 15], [4, 15]]); break;
    case 'pause': maskRect(shape, 6, 5, 6, 18); maskRect(shape, 17, 5, 6, 18); break;
    case 'reroll': maskLine(shape, 6, 16, 9, 8, 4); maskLine(shape, 9, 8, 20, 7, 4); maskPolygon(shape, [[20, 4], [25, 8], [19, 12]]); maskLine(shape, 22, 14, 19, 21, 4); maskLine(shape, 19, 21, 8, 22, 4); maskPolygon(shape, [[8, 25], [3, 21], [9, 17]]); break;
    case 'shop': maskRect(shape, 5, 10, 18, 14); maskPolygon(shape, [[4, 10], [8, 4], [20, 4], [24, 10]]); break;
    case 'evolution': maskPolygon(shape, [[14, 3], [17, 10], [25, 10], [19, 15], [22, 24], [14, 19], [6, 24], [9, 15], [3, 10], [11, 10]]); break;
    case 'weapon-pedestal': maskRect(shape, 5, 18, 18, 6); maskRect(shape, 9, 14, 10, 5); maskLine(shape, 14, 15, 14, 5, 4); maskPolygon(shape, [[14, 3], [19, 8], [9, 8]]); break;
    case 'enemy-skull': maskEllipse(shape, 14, 12, 9, 9); maskRect(shape, 9, 18, 11, 6); break;
    default: throw new Error(`unknown UI icon ${id}`);
  }
  paintShape(out, shape, fill, 1);
  if (id === 'mirrorball') {
    rect(out, 10, 10, 3, 3, P.highlight); rect(out, 15, 10, 3, 3, P.light);
    rect(out, 8, 14, 4, 3, P.panel); rect(out, 13, 14, 3, 3, P.highlight); rect(out, 17, 14, 3, 3, P.panel);
    rect(out, 11, 18, 3, 3, P.light); rect(out, 15, 18, 3, 2, P.panel);
  } else if (id === 'extensionCable') {
    line(out, 7, 9, 7, 16, P.highlight, 1);
    rect(out, 18, 14, 4, 3, P.panel);
    rect(out, 19, 9, 2, 3, P.highlight);
  } else if (id === 'recoveryTape') {
    rect(out, 8, 10, 12, 8, P.panel);
    rect(out, 9, 12, 4, 4, P.outline); rect(out, 16, 12, 4, 4, P.outline);
    put(out, 11, 14, P.highlight); put(out, 18, 14, P.highlight);
    rect(out, 9, 19, 10, 2, P.light);
  } else if (id === 'heart') put(out, 9, 8, P.highlight);
  else if (id === 'enemy-skull') { rect(out, 9, 11, 4, 4, P.panel); rect(out, 16, 11, 4, 4, P.panel); rect(out, 13, 17, 3, 3, P.highlight); }
  else if (id === 'heavyAmp') { rect(out, 11, 13, 7, 7, P.panel); put(out, 14, 15, P.highlight); }
  else if (id === 'shop') { rect(out, 9, 15, 4, 9, P.panel); rect(out, 16, 14, 4, 4, P.highlight); }
  else put(out, 8 + (id.length % 12), 8 + (id.charCodeAt(0) % 10), P.highlight);
  return out;
}

const ENVIRONMENT = Object.freeze([
  { id: 'broken-pillar', size: [40, 52], pivot: [20, 48] },
  { id: 'rune-pillar', size: [42, 54], pivot: [21, 50] },
  { id: 'cyan-brazier', size: [36, 44], pivot: [18, 40] },
  { id: 'gold-brazier', size: [36, 44], pivot: [18, 40] },
  { id: 'rubble', size: [48, 28], pivot: [24, 24] },
  { id: 'sarcophagus', size: [44, 52], pivot: [22, 48] },
  { id: 'hooded-statue', size: [44, 56], pivot: [22, 52] },
  { id: 'knight-statue', size: [48, 58], pivot: [24, 54] },
  { id: 'bones', size: [40, 26], pivot: [20, 22] },
  { id: 'mushrooms', size: [38, 30], pivot: [19, 26] },
  { id: 'thorn-vines', size: [54, 34], pivot: [27, 30] },
  { id: 'gravestone', size: [36, 42], pivot: [18, 38] },
  { id: 'cyan-crystals', size: [44, 44], pivot: [22, 40] },
  { id: 'purple-banner', size: [40, 54], pivot: [20, 50] },
  { id: 'campfire', size: [42, 34], pivot: [21, 30] },
  { id: 'rune-dais', size: [58, 34], pivot: [29, 30] },
]);

function drawEnvironment(definition) {
  const [w, h] = definition.size;
  const out = createImage(w, h);
  const shape = mask(w, h);
  const cx = Math.floor(w / 2);
  const ground = definition.pivot[1] - 2;
  switch (definition.id) {
    case 'broken-pillar': maskRect(shape, 10, 12, 20, ground - 11); maskPolygon(shape, [[8, 12], [13, 5], [20, 9], [25, 4], [32, 12]]); maskRect(shape, 6, ground - 5, 28, 6); break;
    case 'rune-pillar': maskRect(shape, 10, 7, 22, ground - 6); maskRect(shape, 6, 5, 30, 6); maskRect(shape, 6, ground - 5, 30, 6); break;
    case 'cyan-brazier':
    case 'gold-brazier': maskRect(shape, 13, 18, 10, ground - 17); maskPolygon(shape, [[7, 16], [29, 16], [24, 23], [12, 23]]); maskPolygon(shape, [[18, 5], [25, 13], [20, 18], [12, 14]]); break;
    case 'rubble': maskPolygon(shape, [[4, ground], [8, 14], [15, 12], [20, 17], [27, 9], [36, 13], [43, ground]]); break;
    case 'sarcophagus': maskPolygon(shape, [[12, 4], [32, 4], [38, 12], [35, ground], [9, ground], [6, 12]]); break;
    case 'hooded-statue': maskEllipse(shape, cx, 12, 7, 8); maskPolygon(shape, [[13, 17], [31, 17], [35, ground], [9, ground]]); maskRect(shape, 7, ground - 4, 30, 5); break;
    case 'knight-statue': maskRect(shape, cx - 7, 5, 14, 12); maskRect(shape, cx - 10, 17, 20, 24); maskLine(shape, 9, 18, 7, 39, 5); maskLine(shape, 39, 18, 41, 39, 5); maskRect(shape, 8, 39, 32, ground - 38); break;
    case 'bones': maskLine(shape, 5, 17, 34, 8, 4); maskLine(shape, 6, 8, 33, 18, 4); maskEllipse(shape, 6, 17, 3, 3); maskEllipse(shape, 34, 8, 3, 3); break;
    case 'mushrooms': for (const [x, y, r] of [[8, 14, 5], [18, 9, 7], [29, 15, 5]]) { maskEllipse(shape, x, y, r, 4); maskRect(shape, x - 2, y + 3, 5, ground - y - 2); } break;
    case 'thorn-vines': maskLine(shape, 5, ground, 49, 8, 4); maskLine(shape, 7, 11, 47, ground, 4); for (const [x, y] of [[11, 12], [20, 18], [31, 11], [42, 19]]) maskPolygon(shape, [[x, y], [x - 5, y - 6], [x + 2, y - 3]]); break;
    case 'gravestone': maskPolygon(shape, [[9, ground], [9, 14], [13, 7], [23, 7], [27, 14], [27, ground]]); maskRect(shape, 5, ground - 4, 26, 5); break;
    case 'cyan-crystals':
      maskPolygon(shape, [[5, ground], [9, 19], [15, ground]]);
      maskPolygon(shape, [[12, ground], [21, 5], [26, ground]]);
      maskPolygon(shape, [[23, ground], [29, 20], [34, ground]]);
      maskPolygon(shape, [[30, ground], [35, 12], [40, ground]]);
      maskRect(shape, 5, ground - 4, 35, 5);
      break;
    case 'purple-banner':
      maskLine(shape, 8, 5, 8, ground, 4);
      maskLine(shape, 6, 6, 35, 6, 3);
      maskPolygon(shape, [[11, 9], [34, 9], [32, 32], [28, 29], [24, 35], [19, 31], [12, 35]]);
      maskPolygon(shape, [[8, 2], [11, 5], [8, 8], [5, 5]]);
      break;
    case 'campfire': maskLine(shape, 7, ground, 34, 19, 4); maskLine(shape, 8, 19, 35, ground, 4); maskPolygon(shape, [[21, 5], [29, 17], [23, 24], [14, 19]]); break;
    case 'rune-dais': maskEllipse(shape, cx, ground - 5, 24, 8); maskRect(shape, 8, ground - 7, 42, 8); break;
    default: throw new Error(`unknown environment prop ${definition.id}`);
  }
  paintShape(out, shape, P.mid);
  const accent = definition.id.includes('cyan') ? P.light
    : definition.id.includes('gold') || definition.id === 'campfire' ? P.currency
      : definition.id.includes('purple') ? P.shadow : P.light;
  if (definition.id === 'rune-pillar') { rect(out, cx - 3, 15, 7, 7, P.panel); rect(out, cx - 1, 17, 3, 3, P.focal); }
  else if (definition.id === 'sarcophagus') { rect(out, 13, 13, 18, 24, P.shadow); rect(out, 19, 19, 6, 10, P.accent); }
  else if (definition.id === 'hooded-statue') { rect(out, cx - 4, 10, 8, 5, P.panel); rect(out, cx - 1, 11, 3, 2, P.focal); }
  else if (definition.id === 'knight-statue') { rect(out, cx - 4, 8, 8, 5, P.panel); rect(out, cx - 2, 9, 5, 2, P.highlight); rect(out, cx - 4, 22, 8, 8, P.danger); }
  else if (definition.id === 'rune-dais') {
    line(out, 10, ground - 3, 48, ground - 3, P.shadow, 2);
    line(out, 15, ground - 9, 43, ground - 9, P.light, 2);
    rect(out, cx - 8, ground - 8, 17, 5, P.panel);
    for (const x of [cx - 6, cx - 2, cx + 3, cx + 7]) put(out, x, ground - 7, P.light);
    put(out, cx, ground - 6, P.focal);
  }
  else if (definition.id === 'cyan-crystals') {
    line(out, 9, 22, 9, ground - 3, P.shadow, 1);
    line(out, 21, 8, 17, ground - 5, P.light, 2);
    line(out, 35, 15, 32, ground - 5, P.light, 1);
    put(out, 21, 9, P.highlight);
    put(out, 35, 16, P.focal);
  }
  else if (definition.id === 'purple-banner') {
    line(out, 15, 12, 14, 31, P.shadow, 2);
    line(out, 28, 11, 26, 29, P.light, 1);
    rect(out, 18, 16, 9, 7, P.panel);
    rect(out, 21, 18, 3, 3, P.light);
  }
  else if (definition.id === 'gravestone') { rect(out, cx - 2, 14, 5, 13, P.shadow); rect(out, cx - 6, 18, 13, 4, P.shadow); }
  else line(out, 8, Math.max(5, ground - 8), w - 9, Math.max(5, ground - 8), accent, 2);
  if (definition.id === 'broken-pillar') line(out, 15, 15, 26, 28, P.shadow, 2);
  return out;
}

export function buildProductionFrames() {
  const gameplay = [];
  const animations = {};
  for (const actor of ACTORS) {
    const keys = [];
    for (const pose of ['idle', 'walk']) {
      const image = drawActor(actor, pose);
      const frame = makeFrame(actorDefinition(actor, pose), image, pose);
      gameplay.push(frame);
      keys.push(frame.key);
    }
    animations[actor.id === 'player' ? 'actors/player' : `actors/enemies/${actor.id}`] = keys;
  }
  for (const evolved of [false, true]) {
    for (const role of WEAPON_ROLES) {
      const image = drawWeapon(role, evolved);
      gameplay.push(makeFrame(weaponDefinition(role, evolved, image), image));
    }
  }
  for (const pickup of PICKUPS) {
    const image = drawPickup(pickup);
    gameplay.push(makeFrame({
      key: `pickups/${pickup.id}`,
      pivot: { x: Math.floor(image.width / 2), y: Math.floor(image.height / 2) },
      semanticClass: 'pickup', tags: ['pickup', ...pickup.tags], colorBudget: pickup.budget,
    }, image));
  }
  for (const effect of EFFECTS) {
    const image = drawEffect(effect);
    gameplay.push(makeFrame({
      key: `fx/${effect.id}`,
      pivot: { x: Math.floor(image.width / 2), y: Math.floor(image.height / 2) },
      semanticClass: 'effect', tags: ['effect', ...effect.tags], colorBudget: effect.budget,
    }, image));
  }

  const ui = UI_ICONS.map(([id, category]) => {
    const image = drawUiIcon(id, category);
    return makeFrame({
      key: `ui/${category}/${id}`,
      pivot: { x: Math.floor(image.width / 2), y: Math.floor(image.height / 2) },
      semanticClass: 'ui-icon', tags: ['ui', category, id, ...(UI_STRUCTURE_TAGS[`${category}/${id}`] ?? [])], colorBudget: 8,
    }, image);
  });

  const environment = ENVIRONMENT.map((definition) => {
    const image = drawEnvironment(definition);
    return makeFrame({
      key: `environment/${definition.id}`,
      pivot: { x: definition.pivot[0], y: definition.pivot[1] },
      semanticClass: 'environment-prop', tags: ['environment', 'prop', definition.id, ...(ENVIRONMENT_STRUCTURE_TAGS[definition.id] ?? [])], colorBudget: 8,
      planted: true,
    }, image);
  });

  return { gameplay, animations, ui, environment };
}

export function buildArenaFloor() {
  const size = 16;
  const floor = createImage(size, size, P.floor);
  // Draw one native repeat cell, reserving the last row and column as exact
  // copies of the first so texture wrapping cannot expose a seam.
  for (let y = 0; y < size; y++) {
    const yy = y === size - 1 ? 0 : y;
    for (let x = 0; x < size; x++) {
      const xx = x === size - 1 ? 0 : x;
      const cellX = Math.floor(xx / 16);
      const cellY = Math.floor(yy / 12);
      const localX = xx % 16;
      const localY = yy % 12;
      const offset = (cellY % 2) * 7;
      if (localY === 0 && (localX + offset) % 4 !== 0) put(floor, x, y, P.floorDetail);
      if ((localX + offset) % 16 === 0 && localY >= 2 && localY <= 9) put(floor, x, y, P.floorDetail);
      if ((cellX * 7 + cellY * 11) % 13 === 0 && localX >= 6 && localX <= 8 && localY === 5) put(floor, x, y, P.shadow);
    }
  }
  // Re-assert exact seamless edges after drawing the direct native-grid motif.
  for (let y = 0; y < size; y++) {
    const source = pixelOffset(floor, 0, y);
    floor.data.set(floor.data.subarray(source, source + 4), pixelOffset(floor, size - 1, y));
  }
  for (let x = 0; x < size; x++) {
    const source = pixelOffset(floor, x, 0);
    floor.data.set(floor.data.subarray(source, source + 4), pixelOffset(floor, x, size - 1));
  }
  return floor;
}

export function alphaBlit(source, target, x0, y0) {
  for (let y = 0; y < source.height; y++) {
    const ty = y0 + y;
    if (ty < 0 || ty >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const tx = x0 + x;
      if (tx < 0 || tx >= target.width) continue;
      const sourcePixel = pixelOffset(source, x, y);
      if (source.data[sourcePixel + 3] === 0) continue;
      const targetPixel = pixelOffset(target, tx, ty);
      target.data[targetPixel] = source.data[sourcePixel];
      target.data[targetPixel + 1] = source.data[sourcePixel + 1];
      target.data[targetPixel + 2] = source.data[sourcePixel + 2];
      target.data[targetPixel + 3] = 255;
    }
  }
}

export function buildTitleLogical(production, floor) {
  const title = createImage(320, 180);
  for (let y = 0; y < title.height; y++) {
    for (let x = 0; x < title.width; x++) {
      const source = pixelOffset(floor, (x + 71) % (floor.width - 1), (y + 133) % (floor.height - 1));
      const target = pixelOffset(title, x, y);
      title.data[target] = floor.data[source];
      title.data[target + 1] = floor.data[source + 1];
      title.data[target + 2] = floor.data[source + 2];
      title.data[target + 3] = 255;
    }
  }
  const frames = new Map([...production.gameplay, ...production.environment].map((frame) => [frame.key, frame.image]));
  const draw = (key, x, y) => alphaBlit(frames.get(key), title, x, y);
  draw('environment/thorn-vines', 4, 139);
  draw('environment/gravestone', 42, 109);
  draw('environment/rune-pillar', 104, 92);
  draw('environment/rune-dais', 184, 135);
  draw('environment/cyan-crystals', 270, 127);
  draw('environment/cyan-brazier', 118, 133);
  draw('environment/gold-brazier', 255, 135);
  draw('actors/enemies/batSwarm/idle', 40, 35);
  draw('actors/enemies/ghost/idle', 271, 38);
  draw('actors/enemies/skeleton/idle', 278, 98);
  draw('actors/enemies/greenMudman/idle', 72, 116);
  draw('actors/enemies/glowingBat/idle', 137, 28);
  draw('actors/player/idle', 207, 104);
  draw('fx/impact-cyan', 225, 79);
  draw('fx/impact-gold', 250, 101);
  for (let x = 0; x < title.width; x++) { put(title, x, 0, P.void); put(title, x, title.height - 1, P.void); }
  for (let y = 0; y < title.height; y++) { put(title, 0, y, P.void); put(title, title.width - 1, y, P.void); }
  return title;
}
