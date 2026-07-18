export const VISUAL_READ_SAMPLE_COUNT = 40;
export const VISUAL_READ_REVEAL_MS = 500;
export const VISUAL_READ_PLAYER_TOLERANCE = 2;

export const VISUAL_READ_CATEGORIES = [
  'enemy',
  'friendly-projectile',
  'xp',
  'music-note',
  'weapon-reward',
  'decorative-effect',
] as const;

export type VisualReadMode = 'player' | 'category';
export type VisualReadCategory = (typeof VISUAL_READ_CATEGORIES)[number];

export interface VisualReadPublicSample {
  id: string;
  image: string;
  seed: string;
  offsetS: number;
  vision: 'normal' | 'grayscale' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

export interface VisualReadPacket {
  schemaVersion: 1;
  commit: string;
  captureCommand: string;
  logicalCanvas: { w: 640; h: 360 };
  transform: {
    viewportCss: { w: number; h: number };
    dpr: number;
    backingScale: number;
    worldToLogical: number;
  };
  player: readonly VisualReadPublicSample[];
  category: readonly VisualReadPublicSample[];
}

export interface VisualReadPlayerAnswer {
  x: number;
  y: number;
  radius: number;
}

export interface VisualReadAnswers {
  schemaVersion: 1;
  player: Readonly<Record<string, VisualReadPlayerAnswer>>;
  category: Readonly<Record<string, VisualReadCategory>>;
}

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function nextRandom(state: { value: number }): number {
  let x = state.value || 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.value = x >>> 0;
  return state.value / 0x1_0000_0000;
}

export function randomizedSampleOrder<T extends { id: string }>(
  samples: readonly T[],
  reviewer: string,
  mode: VisualReadMode,
): T[] {
  const out = [...samples];
  const state = { value: hashText(`${reviewer}:${mode}`) };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function playerClickResult(
  click: { x: number; y: number },
  answer: VisualReadPlayerAnswer,
): { distance: number; hit: boolean } {
  const distance = Math.hypot(click.x - answer.x, click.y - answer.y);
  return {
    distance,
    hit: distance <= answer.radius + VISUAL_READ_PLAYER_TOLERANCE,
  };
}

export function assertVisualReadPacket(packet: VisualReadPacket, answers: VisualReadAnswers): void {
  if (packet.schemaVersion !== 1 || answers.schemaVersion !== 1) {
    throw new Error('visual-read packet schema must be version 1');
  }
  if (packet.logicalCanvas.w !== 640 || packet.logicalCanvas.h !== 360) {
    throw new Error('visual-read packet must use the 640 x 360 logical canvas');
  }
  for (const mode of ['player', 'category'] as const) {
    const samples = packet[mode];
    if (samples.length !== VISUAL_READ_SAMPLE_COUNT) {
      throw new Error(`${mode} packet must contain exactly ${VISUAL_READ_SAMPLE_COUNT} samples`);
    }
    const ids = samples.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) throw new Error(`${mode} packet contains duplicate sample IDs`);
    for (const sample of samples) {
      if (!sample.image.startsWith('/art/pixel/clarity/frames/')) {
        throw new Error(`${sample.id} is outside the clarity-frame path`);
      }
      if (!(sample.id in answers[mode])) throw new Error(`${sample.id} has no hidden answer`);
    }
  }
  const seeds = new Set(packet.player.map(({ seed }) => seed));
  if (seeds.size < 4) throw new Error('player packet requires at least four maximum-density seeds');
  const vision = new Set(packet.player.map(({ vision }) => vision));
  for (const required of ['normal', 'grayscale', 'protanopia', 'deuteranopia', 'tritanopia']) {
    if (!vision.has(required as VisualReadPublicSample['vision'])) {
      throw new Error(`player packet is missing ${required} samples`);
    }
  }
  const categoryCounts = new Map<VisualReadCategory, number>();
  for (const sample of packet.category) {
    const category = answers.category[sample.id];
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const counts = [...categoryCounts.values()];
  if (categoryCounts.size !== VISUAL_READ_CATEGORIES.length || Math.max(...counts) - Math.min(...counts) > 1) {
    throw new Error('category packet must balance all six target classes');
  }
}
