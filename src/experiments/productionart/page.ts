import { ViewportTransform } from '../../game/viewport';
import {
  PRODUCTION_ART_ATLAS_URLS,
  PRODUCTION_ART_DIRECTION,
  PRODUCTION_ART_HEADER_HEIGHT,
  PRODUCTION_ART_LABEL_HEIGHT,
  PRODUCTION_ART_LOGICAL_HEIGHT,
  PRODUCTION_ART_LOGICAL_WIDTH,
  PRODUCTION_ART_PAGES,
  PRODUCTION_ART_PAIR_GAP,
  PRODUCTION_ART_VISION_MODES,
  isProductionArtPageId,
  isProductionArtVisionMode,
  productionArtPage,
  type ProductionArtAtlasId,
  type ProductionArtPage,
  type ProductionArtPageId,
  type ProductionArtVisionMode,
} from './catalog';
import './style.css';

interface NativePoint {
  readonly x: number;
  readonly y: number;
}

interface NativeBounds extends NativePoint {
  readonly w: number;
  readonly h: number;
}

interface AtlasFrame {
  readonly frame: NativeBounds;
  readonly pivot: NativePoint;
  readonly opaqueBounds: NativeBounds;
  readonly rendererScale: { readonly value: number };
}

interface AtlasData {
  readonly frames: Record<string, AtlasFrame>;
  readonly meta: {
    readonly direction: string;
    readonly image: string;
    readonly rendererScale: { readonly value: number };
    readonly size: { readonly w: number; readonly h: number };
  };
}

interface LoadedAtlas {
  readonly id: ProductionArtAtlasId;
  readonly data: AtlasData;
  readonly image: HTMLImageElement;
}

type LoadedAtlases = Record<ProductionArtAtlasId, LoadedAtlas>;

export interface ProductionArtReviewState {
  readonly pageId: ProductionArtPageId;
  readonly mode: ProductionArtVisionMode;
  readonly pivots: boolean;
  readonly opaqueBounds: boolean;
  readonly clean: boolean;
}

export interface ProductionArtReviewHandle {
  readonly version: 1;
  readonly canvas: HTMLCanvasElement;
  readonly pageIds: readonly ProductionArtPageId[];
  getState(): ProductionArtReviewState;
  selectPage(pageId: ProductionArtPageId): void;
  setMode(mode: ProductionArtVisionMode): void;
  setOverlays(overlays: { readonly pivots?: boolean; readonly opaqueBounds?: boolean }): void;
  exportPngDataUrl(): string;
  exportPngBlob(): Promise<Blob>;
  destroy(): void;
}

declare global {
  interface Window {
    __productionArtReview?: ProductionArtReviewHandle;
  }
}

const PAGE_IDS = PRODUCTION_ART_PAGES.map(({ id }) => id);
const CHECKER_COLORS = ['#07111f', '#091628'] as const;
const SILHOUETTE_COLOR = '#f5f3ff';

const COLOR_VISION_MATRICES: Record<Exclude<ProductionArtVisionMode, 'normal' | 'grayscale'>, readonly number[]> = {
  protanopia: [
    0.56667, 0.43333, 0,
    0.55833, 0.44167, 0,
    0, 0.24167, 0.75833,
  ],
  deuteranopia: [
    0.625, 0.375, 0,
    0.7, 0.3, 0,
    0, 0.3, 0.7,
  ],
  tritanopia: [
    0.95, 0.05, 0,
    0, 0.43333, 0.56667,
    0, 0.475, 0.525,
  ],
};

function assertAtlasData(value: unknown, id: ProductionArtAtlasId): asserts value is AtlasData {
  if (!value || typeof value !== 'object') throw new Error(`${id} atlas metadata is not an object`);
  const data = value as Partial<AtlasData>;
  if (!data.frames || !data.meta) throw new Error(`${id} atlas metadata is incomplete`);
  if (data.meta.direction !== PRODUCTION_ART_DIRECTION) {
    throw new Error(
      `${id} atlas direction is ${JSON.stringify(data.meta.direction)}; expected ${PRODUCTION_ART_DIRECTION}`,
    );
  }
  if (data.meta.rendererScale?.value !== 1) {
    throw new Error(`${id} atlas rendererScale must be 1`);
  }
  for (const [key, frame] of Object.entries(data.frames)) {
    if (frame.rendererScale?.value !== 1) {
      throw new Error(`${id}/${key} rendererScale must be 1`);
    }
    if (!frame.pivot || !frame.opaqueBounds) {
      throw new Error(`${id}/${key} is missing its pivot or opaque bounds`);
    }
  }
}

async function loadAtlas(id: ProductionArtAtlasId): Promise<LoadedAtlas> {
  const response = await fetch(PRODUCTION_ART_ATLAS_URLS[id]);
  if (!response.ok) throw new Error(`Could not load ${id} production atlas (${response.status})`);
  const value: unknown = await response.json();
  assertAtlasData(value, id);
  const image = new Image();
  image.decoding = 'sync';
  image.src = `/art/pixel/${value.meta.image}`;
  await image.decode();
  if (image.naturalWidth !== value.meta.size.w || image.naturalHeight !== value.meta.size.h) {
    throw new Error(
      `${id} atlas image is ${image.naturalWidth}x${image.naturalHeight}; ` +
      `metadata declares ${value.meta.size.w}x${value.meta.size.h}`,
    );
  }
  return { id, data: value, image };
}

async function loadAtlases(): Promise<LoadedAtlases> {
  const [gameplay, ui, environment] = await Promise.all([
    loadAtlas('gameplay'),
    loadAtlas('ui'),
    loadAtlas('environment'),
  ]);
  return { gameplay, ui, environment };
}

function parseRoute(): ProductionArtReviewState {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const [, requestedPage = ''] = path.split('/');
  const params = new URLSearchParams(query);
  const requestedMode = params.get('mode') ?? 'normal';
  return {
    pageId: isProductionArtPageId(requestedPage) ? requestedPage : PRODUCTION_ART_PAGES[0].id,
    mode: isProductionArtVisionMode(requestedMode) ? requestedMode : 'normal',
    pivots: params.get('pivots') === '1',
    opaqueBounds: params.get('bounds') === '1',
    clean: params.get('clean') === '1',
  };
}

export function productionArtReviewHash(state: ProductionArtReviewState): string {
  const params = new URLSearchParams();
  if (state.mode !== 'normal') params.set('mode', state.mode);
  if (state.pivots) params.set('pivots', '1');
  if (state.opaqueBounds) params.set('bounds', '1');
  if (state.clean) params.set('clean', '1');
  const query = params.toString();
  return `#production-art/${state.pageId}${query ? `?${query}` : ''}`;
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  // Frame canvases must preserve the atlas' hard transparency. The final
  // 640x360 page is still opaque because drawPage explicitly fills it first.
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Production-art review requires a 2D canvas context');
  context.imageSmoothingEnabled = false;
  return context;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyVisionMode(canvas: HTMLCanvasElement, mode: ProductionArtVisionMode): void {
  if (mode === 'normal') return;
  const context = requireContext(canvas);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    if (mode === 'grayscale') {
      const luminance = clampByte(red * 0.2126 + green * 0.7152 + blue * 0.0722);
      pixels[index] = luminance;
      pixels[index + 1] = luminance;
      pixels[index + 2] = luminance;
      continue;
    }
    const matrix = COLOR_VISION_MATRICES[mode];
    pixels[index] = clampByte(red * matrix[0] + green * matrix[1] + blue * matrix[2]);
    pixels[index + 1] = clampByte(red * matrix[3] + green * matrix[4] + blue * matrix[5]);
    pixels[index + 2] = clampByte(red * matrix[6] + green * matrix[7] + blue * matrix[8]);
  }
  context.putImageData(image, 0, 0);
}

function createFrameCanvas(
  atlas: LoadedAtlas,
  key: string,
  mode: ProductionArtVisionMode,
  silhouette: boolean,
): HTMLCanvasElement {
  const definition = atlas.data.frames[key];
  if (!definition) throw new Error(`${atlas.id} production atlas is missing ${JSON.stringify(key)}`);
  const canvas = document.createElement('canvas');
  canvas.width = definition.frame.w;
  canvas.height = definition.frame.h;
  const context = requireContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    atlas.image,
    definition.frame.x,
    definition.frame.y,
    definition.frame.w,
    definition.frame.h,
    0,
    0,
    definition.frame.w,
    definition.frame.h,
  );
  if (silhouette) {
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = SILHOUETTE_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
  }
  applyVisionMode(canvas, mode);
  return canvas;
}

function drawChecker(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const tile = 8;
  for (let offsetY = 0; offsetY < height; offsetY += tile) {
    for (let offsetX = 0; offsetX < width; offsetX += tile) {
      const index = (Math.floor(offsetX / tile) + Math.floor(offsetY / tile)) % 2;
      context.fillStyle = CHECKER_COLORS[index];
      context.fillRect(x + offsetX, y + offsetY, Math.min(tile, width - offsetX), Math.min(tile, height - offsetY));
    }
  }
}

function drawBounds(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  context.fillStyle = '#20e4ff';
  context.fillRect(x, y, width, 1);
  context.fillRect(x, y + height - 1, width, 1);
  context.fillRect(x, y, 1, height);
  context.fillRect(x + width - 1, y, 1, height);
}

function drawPivot(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.fillStyle = '#ffc33d';
  context.fillRect(x - 3, y, 7, 1);
  context.fillRect(x, y - 3, 1, 7);
  context.fillStyle = '#03070d';
  context.fillRect(x, y, 1, 1);
}

function drawFrameOverlay(
  context: CanvasRenderingContext2D,
  definition: AtlasFrame,
  x: number,
  y: number,
  state: ProductionArtReviewState,
): void {
  if (state.opaqueBounds) {
    const bounds = definition.opaqueBounds;
    drawBounds(context, x + bounds.x, y + bounds.y, bounds.w, bounds.h);
  }
  if (state.pivots) drawPivot(context, x + definition.pivot.x, y + definition.pivot.y);
}

interface FrameRender {
  readonly key: string;
  readonly silhouette: boolean;
}

function horizontalFrames(page: ProductionArtPage, keys: readonly string[]): readonly FrameRender[] {
  if (page.presentation === 'silhouette-normal') {
    return [
      { key: keys[0], silhouette: true },
      { key: keys[0], silhouette: false },
    ];
  }
  return keys.map((key) => ({ key, silhouette: false }));
}

function drawHorizontalGroup(
  context: CanvasRenderingContext2D,
  atlas: LoadedAtlas,
  frames: readonly FrameRender[],
  mode: ProductionArtVisionMode,
  art: NativeBounds,
  state: ProductionArtReviewState,
  frameCache: Map<string, HTMLCanvasElement>,
): void {
  const definitions = frames.map(({ key }) => atlas.data.frames[key]);
  if (definitions.some((definition) => !definition)) {
    throw new Error(`${atlas.id} atlas is missing a horizontal review frame`);
  }
  const totalWidth = definitions.reduce((sum, definition) => sum + definition.frame.w, 0) +
    PRODUCTION_ART_PAIR_GAP * (definitions.length - 1);
  const abovePivot = Math.max(...definitions.map((definition) => definition.pivot.y));
  const belowPivot = Math.max(...definitions.map((definition) => definition.frame.h - definition.pivot.y));
  const groupHeight = abovePivot + belowPivot;
  let cursorX = art.x + Math.floor((art.w - totalWidth) / 2);
  const pivotY = art.y + Math.floor((art.h - groupHeight) / 2) + abovePivot;

  frames.forEach((render, index) => {
    const definition = definitions[index];
    const y = pivotY - definition.pivot.y;
    const cacheKey = `${atlas.id}:${render.key}:${mode}:${render.silhouette ? 'silhouette' : 'color'}`;
    let frameCanvas = frameCache.get(cacheKey);
    if (!frameCanvas) {
      frameCanvas = createFrameCanvas(atlas, render.key, mode, render.silhouette);
      frameCache.set(cacheKey, frameCanvas);
    }
    context.drawImage(frameCanvas, cursorX, y);
    drawFrameOverlay(context, definition, cursorX, y, state);
    cursorX += definition.frame.w + PRODUCTION_ART_PAIR_GAP;
  });
}

function drawVerticalGroup(
  context: CanvasRenderingContext2D,
  atlas: LoadedAtlas,
  keys: readonly string[],
  mode: ProductionArtVisionMode,
  art: NativeBounds,
  state: ProductionArtReviewState,
  frameCache: Map<string, HTMLCanvasElement>,
): void {
  const definitions = keys.map((key) => atlas.data.frames[key]);
  if (definitions.some((definition) => !definition)) {
    throw new Error(`${atlas.id} atlas is missing a vertical review frame`);
  }
  const totalHeight = definitions.reduce((sum, definition) => sum + definition.frame.h, 0) +
    PRODUCTION_ART_PAIR_GAP * (definitions.length - 1);
  let cursorY = art.y + Math.floor((art.h - totalHeight) / 2);
  keys.forEach((key, index) => {
    const definition = definitions[index];
    const x = art.x + Math.floor((art.w - definition.frame.w) / 2);
    const cacheKey = `${atlas.id}:${key}:${mode}:color`;
    let frameCanvas = frameCache.get(cacheKey);
    if (!frameCanvas) {
      frameCanvas = createFrameCanvas(atlas, key, mode, false);
      frameCache.set(cacheKey, frameCanvas);
    }
    context.drawImage(frameCanvas, x, cursorY);
    drawFrameOverlay(context, definition, x, cursorY, state);
    cursorY += definition.frame.h + PRODUCTION_ART_PAIR_GAP;
  });
}

function drawSingle(
  context: CanvasRenderingContext2D,
  atlas: LoadedAtlas,
  key: string,
  mode: ProductionArtVisionMode,
  art: NativeBounds,
  state: ProductionArtReviewState,
  frameCache: Map<string, HTMLCanvasElement>,
): void {
  const definition = atlas.data.frames[key];
  if (!definition) throw new Error(`${atlas.id} atlas is missing ${JSON.stringify(key)}`);
  const x = art.x + Math.floor((art.w - definition.frame.w) / 2);
  const y = art.y + Math.floor((art.h - definition.frame.h) / 2);
  const cacheKey = `${atlas.id}:${key}:${mode}:color`;
  let frameCanvas = frameCache.get(cacheKey);
  if (!frameCanvas) {
    frameCanvas = createFrameCanvas(atlas, key, mode, false);
    frameCache.set(cacheKey, frameCanvas);
  }
  context.drawImage(frameCanvas, x, y);
  drawFrameOverlay(context, definition, x, y, state);
}

function drawPage(
  canvas: HTMLCanvasElement,
  atlases: LoadedAtlases,
  state: ProductionArtReviewState,
  frameCache: Map<string, HTMLCanvasElement>,
): void {
  const page = productionArtPage(state.pageId);
  const atlas = atlases[page.atlas];
  const context = requireContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#03070d';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#111425';
  context.fillRect(0, 0, PRODUCTION_ART_LOGICAL_WIDTH, PRODUCTION_ART_HEADER_HEIGHT);
  context.textBaseline = 'middle';
  context.font = '700 8px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillStyle = '#f5f3ff';
  context.textAlign = 'left';
  context.fillText(page.title, 6, PRODUCTION_ART_HEADER_HEIGHT / 2);
  context.font = '700 7px ui-monospace, SFMono-Regular, Menlo, monospace';
  context.fillStyle = '#8d92b6';
  context.textAlign = 'right';
  context.fillText(`${page.legend} · ${state.mode.toUpperCase()}`, PRODUCTION_ART_LOGICAL_WIDTH - 6, PRODUCTION_ART_HEADER_HEIGHT / 2);

  const gridHeight = PRODUCTION_ART_LOGICAL_HEIGHT - PRODUCTION_ART_HEADER_HEIGHT;
  const cellWidth = PRODUCTION_ART_LOGICAL_WIDTH / page.columns;
  const cellHeight = gridHeight / page.rows;
  page.entries.forEach((entry, index) => {
    const column = index % page.columns;
    const row = Math.floor(index / page.columns);
    const left = Math.floor(column * cellWidth);
    const right = Math.floor((column + 1) * cellWidth);
    const top = PRODUCTION_ART_HEADER_HEIGHT + Math.floor(row * cellHeight);
    const bottom = PRODUCTION_ART_HEADER_HEIGHT + Math.floor((row + 1) * cellHeight);
    const art = {
      x: left + 1,
      y: top + 1,
      w: right - left - 2,
      h: bottom - top - PRODUCTION_ART_LABEL_HEIGHT - 2,
    };
    drawChecker(context, art.x, art.y, art.w, art.h);

    if (page.presentation === 'normal-evolved') {
      drawVerticalGroup(context, atlas, entry.keys, state.mode, art, state, frameCache);
    } else if (page.presentation === 'single') {
      drawSingle(context, atlas, entry.keys[0], state.mode, art, state, frameCache);
    } else {
      drawHorizontalGroup(
        context,
        atlas,
        horizontalFrames(page, entry.keys),
        state.mode,
        art,
        state,
        frameCache,
      );
    }

    context.fillStyle = '#111425';
    context.fillRect(left, bottom - PRODUCTION_ART_LABEL_HEIGHT, right - left, PRODUCTION_ART_LABEL_HEIGHT);
    context.fillStyle = '#d8e3ff';
    context.font = '700 7px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(entry.label.toUpperCase(), left + Math.floor((right - left) / 2), bottom - 6);
    context.fillStyle = '#202238';
    context.fillRect(right - 1, top, 1, bottom - top);
    context.fillRect(left, bottom - 1, right - left, 1);
  });

  canvas.setAttribute('aria-label', `${page.title}, ${state.mode}, Arcade Reliquary production art`);
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.onclick = onClick;
  return button;
}

function makeCheckbox(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'production-art-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  wrapper.append(input, document.createTextNode(label));
  return wrapper;
}

/**
 * Mount the development-only Arcade Reliquary catalog review. The returned
 * handle and `window.__productionArtReview` expose deterministic controls and
 * a lossless 640 x 360 PNG export for browser QA.
 */
export async function mountProductionArtReview(root: HTMLElement): Promise<ProductionArtReviewHandle> {
  const atlases = await loadAtlases();
  let state = parseRoute();
  const frameCache = new Map<string, HTMLCanvasElement>();

  root.textContent = '';
  root.className = 'production-art-root';
  root.dataset.direction = PRODUCTION_ART_DIRECTION;

  const surface = document.createElement('main');
  surface.className = 'production-art-surface';
  const canvas = document.createElement('canvas');
  canvas.width = PRODUCTION_ART_LOGICAL_WIDTH;
  canvas.height = PRODUCTION_ART_LOGICAL_HEIGHT;
  surface.appendChild(canvas);

  const notice = document.createElement('section');
  notice.className = 'production-art-notice';
  notice.innerHTML = '<strong>MAKE ROOM FOR NATIVE ART</strong><span>Use a landscape window at least 640 × 360.</span>';

  const losslessExport = document.createElement('img');
  losslessExport.id = 'production-art-lossless-export';
  losslessExport.hidden = true;
  losslessExport.alt = 'Lossless Arcade Reliquary production-art review export';
  losslessExport.dataset.losslessRender = 'pending';

  const toolbar = document.createElement('aside');
  toolbar.className = 'production-art-toolbar';
  toolbar.setAttribute('aria-label', 'Production-art review controls');
  root.append(surface, notice, losslessExport);
  if (!state.clean) root.appendChild(toolbar);

  function syncExport(): void {
    losslessExport.dataset.losslessRender = 'pending';
    losslessExport.src = canvas.toDataURL('image/png');
    losslessExport.dataset.page = state.pageId;
    losslessExport.dataset.mode = state.mode;
    losslessExport.dataset.losslessRender = 'ready';
  }

  function setRoute(): void {
    history.replaceState(null, '', productionArtReviewHash(state));
  }

  function updateState(patch: Partial<ProductionArtReviewState>): void {
    state = { ...state, ...patch };
    root.dataset.page = state.pageId;
    root.dataset.mode = state.mode;
    root.dataset.pivots = String(state.pivots);
    root.dataset.opaqueBounds = String(state.opaqueBounds);
    drawPage(canvas, atlases, state, frameCache);
    syncExport();
    setRoute();
    renderToolbar();
  }

  function renderToolbar(): void {
    if (state.clean) return;
    toolbar.textContent = '';
    const pageRow = document.createElement('div');
    pageRow.className = 'production-art-page-row';
    const pageIndex = PAGE_IDS.indexOf(state.pageId);
    pageRow.appendChild(makeButton('‹ PREV', () => {
      const previous = (pageIndex - 1 + PAGE_IDS.length) % PAGE_IDS.length;
      updateState({ pageId: PAGE_IDS[previous] });
    }));
    const pageSelect = document.createElement('select');
    pageSelect.setAttribute('aria-label', 'Review page');
    for (const page of PRODUCTION_ART_PAGES) {
      const option = document.createElement('option');
      option.value = page.id;
      option.textContent = `${page.title} · ${page.entries.length}`;
      option.selected = page.id === state.pageId;
      pageSelect.appendChild(option);
    }
    pageSelect.onchange = () => {
      if (isProductionArtPageId(pageSelect.value)) updateState({ pageId: pageSelect.value });
    };
    pageRow.append(pageSelect, makeButton('NEXT ›', () => {
      updateState({ pageId: PAGE_IDS[(pageIndex + 1) % PAGE_IDS.length] });
    }));

    const modeRow = document.createElement('div');
    modeRow.className = 'production-art-mode-row';
    for (const mode of PRODUCTION_ART_VISION_MODES) {
      const control = makeButton(mode.toUpperCase(), () => updateState({ mode }));
      control.classList.toggle('active', mode === state.mode);
      control.setAttribute('aria-pressed', String(mode === state.mode));
      modeRow.appendChild(control);
    }

    const overlayRow = document.createElement('div');
    overlayRow.className = 'production-art-overlay-row';
    overlayRow.append(
      makeCheckbox('PIVOTS', state.pivots, (pivots) => updateState({ pivots })),
      makeCheckbox('OPAQUE BOUNDS', state.opaqueBounds, (opaqueBounds) => updateState({ opaqueBounds })),
    );
    const status = document.createElement('span');
    status.textContent = '640×360 · SOURCE 1× · PNG EXPORT READY · 3 ATLASES VALID';
    overlayRow.appendChild(status);
    toolbar.append(pageRow, modeRow, overlayRow);
  }

  function paintViewport(): void {
    const toolbarAllowance = state.clean ? 0 : 132;
    const viewport = new ViewportTransform(
      window.innerWidth,
      Math.max(0, window.innerHeight - toolbarAllowance),
      window.devicePixelRatio || 1,
    );
    surface.style.left = `${viewport.offsetCssX}px`;
    surface.style.top = `${viewport.offsetCssY}px`;
    surface.style.transform = `scale(${viewport.cssScale})`;
    surface.hidden = !viewport.supported;
    notice.hidden = viewport.supported;
  }

  let handle: ProductionArtReviewHandle;
  handle = {
    version: 1,
    canvas,
    pageIds: PAGE_IDS,
    getState: () => ({ ...state }),
    selectPage: (pageId) => updateState({ pageId }),
    setMode: (mode) => updateState({ mode }),
    setOverlays: (overlays) => updateState(overlays),
    exportPngDataUrl: () => canvas.toDataURL('image/png'),
    exportPngBlob: () => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Browser could not encode the production-art PNG'));
      }, 'image/png');
    }),
    destroy: () => {
      window.removeEventListener('resize', paintViewport);
      window.visualViewport?.removeEventListener('resize', paintViewport);
      if (window.__productionArtReview === handle) delete window.__productionArtReview;
    },
  };

  drawPage(canvas, atlases, state, frameCache);
  syncExport();
  renderToolbar();
  paintViewport();
  root.dataset.page = state.pageId;
  root.dataset.mode = state.mode;
  root.dataset.pivots = String(state.pivots);
  root.dataset.opaqueBounds = String(state.opaqueBounds);
  root.dataset.ready = 'true';
  window.addEventListener('resize', paintViewport);
  window.visualViewport?.addEventListener('resize', paintViewport);
  window.__productionArtReview = handle;
  return handle;
}
