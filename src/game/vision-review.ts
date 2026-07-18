// Deterministic whole-surface visual-review filters. Applying the CSS filter
// to game-surface composites the Pixi canvas and every DOM overlay together;
// no simulation value or renderer object is touched.

export type SandboxVisionMode =
  | 'normal'
  | 'grayscale'
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia';

export interface SandboxVisionModeDefinition {
  readonly id: SandboxVisionMode;
  readonly label: string;
  /** SVG feColorMatrix 4x5 row-major values. */
  readonly matrix: readonly number[];
}

const IDENTITY: readonly number[] = Object.freeze([
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
]);

export const SANDBOX_VISION_MODES: readonly SandboxVisionModeDefinition[] = Object.freeze([
  Object.freeze({
    id: 'normal',
    label: 'NORMAL',
    matrix: IDENTITY,
  }),
  Object.freeze({
    id: 'grayscale',
    label: 'GRAYSCALE',
    matrix: Object.freeze([
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0, 0, 0, 1, 0,
    ]),
  }),
  Object.freeze({
    id: 'protanopia',
    label: 'PROTANOPIA',
    matrix: Object.freeze([
      0.152286, 1.052583, -0.204868, 0, 0,
      0.114503, 0.786281, 0.099216, 0, 0,
      -0.003882, -0.048116, 1.051998, 0, 0,
      0, 0, 0, 1, 0,
    ]),
  }),
  Object.freeze({
    id: 'deuteranopia',
    label: 'DEUTERANOPIA',
    matrix: Object.freeze([
      0.367322, 0.860646, -0.227968, 0, 0,
      0.280085, 0.672501, 0.047413, 0, 0,
      -0.01182, 0.04294, 0.968881, 0, 0,
      0, 0, 0, 1, 0,
    ]),
  }),
  Object.freeze({
    id: 'tritanopia',
    label: 'TRITANOPIA',
    matrix: Object.freeze([
      1.255528, -0.076749, -0.178779, 0, 0,
      -0.078411, 0.930809, 0.147602, 0, 0,
      0.004733, 0.691367, 0.3039, 0, 0,
      0, 0, 0, 1, 0,
    ]),
  }),
]);

export const SANDBOX_VISION_MODE_IDS: readonly SandboxVisionMode[] = Object.freeze(
  SANDBOX_VISION_MODES.map((mode) => mode.id),
);

export function sandboxVisionModeDefinition(id: SandboxVisionMode): SandboxVisionModeDefinition {
  const mode = SANDBOX_VISION_MODES.find((candidate) => candidate.id === id);
  if (!mode) throw new Error(`Unknown Sandbox vision-review mode ${JSON.stringify(id)}`);
  return mode;
}

function clampedChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Apply the same sRGB 4x5 matrix used by the SVG review filter to PNG bytes. */
export function applySandboxVisionMatrixToRgba(
  rgba: Uint8ClampedArray,
  mode: SandboxVisionMode,
): void {
  const matrix = sandboxVisionModeDefinition(mode).matrix;
  for (let index = 0; index < rgba.length; index += 4) {
    const red = rgba[index];
    const green = rgba[index + 1];
    const blue = rgba[index + 2];
    const alpha = rgba[index + 3];
    rgba[index] = clampedChannel(
      matrix[0] * red + matrix[1] * green + matrix[2] * blue + matrix[3] * alpha + matrix[4] * 255,
    );
    rgba[index + 1] = clampedChannel(
      matrix[5] * red + matrix[6] * green + matrix[7] * blue + matrix[8] * alpha + matrix[9] * 255,
    );
    rgba[index + 2] = clampedChannel(
      matrix[10] * red + matrix[11] * green + matrix[12] * blue + matrix[13] * alpha + matrix[14] * 255,
    );
    rgba[index + 3] = clampedChannel(
      matrix[15] * red + matrix[16] * green + matrix[17] * blue + matrix[18] * alpha + matrix[19] * 255,
    );
  }
}

/**
 * Lossless logical-resolution export with the selected review matrix baked
 * into pixels. Pixi's backing canvas can be several times larger than the
 * logical viewport; nearest-neighbour collapse removes those repeated pixels
 * before encoding so capture transport stays compact and exact.
 */
export function sandboxVisionPngDataUrl(
  source: HTMLCanvasElement,
  mode: SandboxVisionMode,
  logicalWidth: number,
  logicalHeight: number,
): string {
  const output = document.createElement('canvas');
  output.width = logicalWidth;
  output.height = logicalHeight;
  const context = output.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw new Error('Lossless vision capture requires a 2D canvas context');
  context.imageSmoothingEnabled = false;
  context.drawImage(
    source,
    0,
    0,
    source.width,
    source.height,
    0,
    0,
    logicalWidth,
    logicalHeight,
  );
  if (mode !== 'normal') {
    const image = context.getImageData(0, 0, output.width, output.height);
    applySandboxVisionMatrixToRgba(image.data, mode);
    context.putImageData(image, 0, 0);
  }
  return output.toDataURL('image/png');
}

export interface WholeSurfaceVisionReview {
  readonly mode: SandboxVisionMode;
  apply(mode: SandboxVisionMode): void;
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function installWholeSurfaceVisionReview(
  definitionsHost: HTMLElement,
  surface: HTMLElement,
): WholeSurfaceVisionReview {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  const defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);

  for (const mode of SANDBOX_VISION_MODES) {
    if (mode.id === 'normal') continue;
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = `loop-sandbox-vision-${mode.id}`;
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const matrix = document.createElementNS(SVG_NS, 'feColorMatrix');
    matrix.setAttribute('type', 'matrix');
    matrix.setAttribute('values', mode.matrix.join(' '));
    filter.appendChild(matrix);
    defs.appendChild(filter);
  }
  definitionsHost.appendChild(svg);

  let active: SandboxVisionMode = 'normal';
  const controller: WholeSurfaceVisionReview = {
    get mode(): SandboxVisionMode {
      return active;
    },
    apply(mode: SandboxVisionMode): void {
      sandboxVisionModeDefinition(mode);
      active = mode;
      surface.dataset.visionReviewMode = mode;
      surface.style.filter = mode === 'normal' ? '' : `url(#loop-sandbox-vision-${mode})`;
    },
    destroy(): void {
      active = 'normal';
      delete surface.dataset.visionReviewMode;
      surface.style.filter = '';
      svg.remove();
    },
  };
  controller.apply('normal');
  return controller;
}
