// Shared coordinate contracts for the fixed-resolution game surface. These
// classes deliberately know nothing about the DOM or Pixi: layout, input,
// rendering, capture tools, and checks all consume the same immutable math.

export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 360;
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;
export const WORLD_TO_LOGICAL = 0.5;

export interface Point {
  x: number;
  y: number;
}

export type ViewportUnsupportedReason = 'portrait' | 'too-small' | 'non-integer-fit' | null;

/**
 * Maps the browser's CSS/client coordinate space to the fixed logical canvas.
 * `backingScale` is always a whole number of physical pixels per logical
 * pixel. `cssScale` is derived from it and the device-pixel ratio; it is never
 * chosen independently by CSS.
 */
export class ViewportTransform {
  readonly logicalWidth = LOGICAL_WIDTH;
  readonly logicalHeight = LOGICAL_HEIGHT;
  readonly viewportCssWidth: number;
  readonly viewportCssHeight: number;
  readonly devicePixelRatio: number;
  readonly viewportPixelWidth: number;
  readonly viewportPixelHeight: number;
  readonly backingScale: number;
  readonly backingPixelWidth: number;
  readonly backingPixelHeight: number;
  readonly cssScale: number;
  readonly displayCssWidth: number;
  readonly displayCssHeight: number;
  readonly offsetCssX: number;
  readonly offsetCssY: number;
  readonly supported: boolean;
  readonly unsupportedReason: ViewportUnsupportedReason;

  constructor(viewportCssWidth: number, viewportCssHeight: number, devicePixelRatio = 1) {
    this.viewportCssWidth = finiteNonNegative(viewportCssWidth);
    this.viewportCssHeight = finiteNonNegative(viewportCssHeight);
    this.devicePixelRatio = finitePositive(devicePixelRatio, 1);

    // Browser CSS extents can multiply to a fractional physical pixel during
    // zoom/transitions. Only complete backing pixels are available to Pixi.
    this.viewportPixelWidth = Math.floor(this.viewportCssWidth * this.devicePixelRatio + 1e-6);
    this.viewportPixelHeight = Math.floor(this.viewportCssHeight * this.devicePixelRatio + 1e-6);
    const largestFit = Math.floor(Math.min(
      this.viewportPixelWidth / this.logicalWidth,
      this.viewportPixelHeight / this.logicalHeight,
    ));

    // Pixi still needs a valid resolution while the surface is hidden behind
    // the rotate/resize notice. Supported layouts always use `largestFit`.
    this.backingScale = Math.max(1, largestFit);
    this.backingPixelWidth = this.logicalWidth * this.backingScale;
    this.backingPixelHeight = this.logicalHeight * this.backingScale;
    this.cssScale = this.backingScale / this.devicePixelRatio;
    this.displayCssWidth = this.logicalWidth * this.cssScale;
    this.displayCssHeight = this.logicalHeight * this.cssScale;

    // Anchor the surface on complete physical pixels. If the remaining
    // letterbox is odd, the far edge owns the single extra backing pixel.
    const sparePixelX = this.viewportPixelWidth - this.backingPixelWidth;
    const sparePixelY = this.viewportPixelHeight - this.backingPixelHeight;
    this.offsetCssX = Math.floor(sparePixelX / 2) / this.devicePixelRatio;
    this.offsetCssY = Math.floor(sparePixelY / 2) / this.devicePixelRatio;

    const portrait = this.viewportCssHeight > this.viewportCssWidth;
    const cssTooSmall =
      this.viewportCssWidth < this.logicalWidth || this.viewportCssHeight < this.logicalHeight;
    const integerScaleTooSmall = largestFit < 1 || this.cssScale < 1;
    this.unsupportedReason = portrait
      ? 'portrait'
      : cssTooSmall
        ? 'too-small'
        : integerScaleTooSmall
          ? 'non-integer-fit'
          : null;
    this.supported = this.unsupportedReason === null;
    Object.freeze(this);
  }

  /** Client/CSS coordinates to the 640 x 360 logical surface. */
  clientToLogical(clientX: number, clientY: number): Point {
    return {
      x: (clientX - this.offsetCssX) / this.cssScale,
      y: (clientY - this.offsetCssY) / this.cssScale,
    };
  }

  /** Logical surface coordinates back to browser client/CSS coordinates. */
  logicalToClient(logicalX: number, logicalY: number): Point {
    return {
      x: this.offsetCssX + logicalX * this.cssScale,
      y: this.offsetCssY + logicalY * this.cssScale,
    };
  }

  containsClient(clientX: number, clientY: number): boolean {
    const point = this.clientToLogical(clientX, clientY);
    return point.x >= 0 && point.y >= 0 &&
      point.x < this.logicalWidth && point.y < this.logicalHeight;
  }
}

/**
 * Fixed projection between simulation-world units and logical art pixels.
 * The simulation remains 1280 x 720 while presentation remains 640 x 360.
 */
export class WorldProjection {
  readonly logicalWidth = LOGICAL_WIDTH;
  readonly logicalHeight = LOGICAL_HEIGHT;
  readonly worldWidth = WORLD_WIDTH;
  readonly worldHeight = WORLD_HEIGHT;
  readonly worldToLogicalScale = WORLD_TO_LOGICAL;

  constructor() {
    Object.freeze(this);
  }

  worldToLogical(worldX: number, worldY: number, cameraX: number, cameraY: number): Point {
    return {
      x: this.logicalWidth / 2 + (worldX - cameraX) * this.worldToLogicalScale,
      y: this.logicalHeight / 2 + (worldY - cameraY) * this.worldToLogicalScale,
    };
  }

  logicalToWorld(logicalX: number, logicalY: number, cameraX: number, cameraY: number): Point {
    return {
      x: cameraX + (logicalX - this.logicalWidth / 2) / this.worldToLogicalScale,
      y: cameraY + (logicalY - this.logicalHeight / 2) / this.worldToLogicalScale,
    };
  }

  worldLengthToLogical(worldLength: number): number {
    return worldLength * this.worldToLogicalScale;
  }

  logicalLengthToWorld(logicalLength: number): number {
    return logicalLength / this.worldToLogicalScale;
  }

  /** Quantize a world coordinate only at presentation time. */
  snapWorldCoordinate(worldCoordinate: number): number {
    return Math.round(worldCoordinate * this.worldToLogicalScale) / this.worldToLogicalScale;
  }

  /** Integer logical origin for a projected world container. */
  cameraStageOrigin(cameraX: number, cameraY: number, shakeWorldX = 0, shakeWorldY = 0): Point {
    return {
      x: Math.round(this.logicalWidth / 2 - cameraX * this.worldToLogicalScale) +
        Math.round(shakeWorldX * this.worldToLogicalScale),
      y: Math.round(this.logicalHeight / 2 - cameraY * this.worldToLogicalScale) +
        Math.round(shakeWorldY * this.worldToLogicalScale),
    };
  }
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
