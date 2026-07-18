import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  TextureStyle,
  TilingSprite,
} from 'pixi.js';

import {
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  ViewportTransform,
} from '../../game/viewport';
import './style.css';

const INDEX_URL = '/art/pixel/candidates/index.json';

const REVIEW_VIEWS = [
  ['truth', 'Truth scene', 'truthScene'],
  ['grayscale', 'Grayscale', 'grayscale'],
  ['hitboxes', 'Hitboxes', 'hitboxOverlay'],
  ['crowded', 'Crowded combat', 'crowdedCombat'],
  ['silhouettes', 'Silhouettes', 'silhouettes'],
] as const;

type ReviewViewId = (typeof REVIEW_VIEWS)[number][0];
type CandidateFileKey = (typeof REVIEW_VIEWS)[number][2];

interface CandidateIndex {
  logicalCanvas: { w: number; h: number };
  truthGeometry: {
    placements: readonly {
      id: string;
      x: number;
      y: number;
      layer: number;
    }[];
  };
  candidates: CandidateDefinition[];
}

interface CandidateDefinition {
  id: string;
  name: string;
  explanation: string;
  tradeoff: {
    readability: string;
    productionCost: string;
    mood: string;
  };
  files: Record<CandidateFileKey | 'truthScene4x' | 'atlas' | 'atlasMetadata', string>;
}

interface ReviewRoute {
  candidateId: string;
  view: ReviewViewId;
  clean: boolean;
  exportPng: boolean;
}

interface AtlasMetadata {
  frames: Record<string, {
    frame: { x: number; y: number; w: number; h: number };
    pivot: { x: number; y: number };
    artLocalPreviewShape: null | {
      shape: 'circle';
      cx: number;
      cy: number;
      radius: number;
    } | {
      shape: 'ellipse';
      cx: number;
      cy: number;
      radiusX: number;
      radiusY: number;
    } | {
      shape: 'sector';
      cx: number;
      cy: number;
      radius: number;
      halfAngleDegrees: number;
    };
  }>;
}

function parseRoute(): ReviewRoute {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const [, candidateId = '', requestedView = 'truth'] = path.split('/');
  const view = REVIEW_VIEWS.some(([id]) => id === requestedView)
    ? requestedView as ReviewViewId
    : 'truth';
  return {
    candidateId,
    view,
    clean: new URLSearchParams(query).get('clean') === '1',
    exportPng: new URLSearchParams(query).get('export') === '1',
  };
}

function routeTo(candidateId: string, view: ReviewViewId, clean: boolean): string {
  return `#art-directions/${candidateId}/${view}${clean ? '?clean=1' : ''}`;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const out = document.createElement('button');
  out.type = 'button';
  out.textContent = label;
  out.onclick = onClick;
  return out;
}

function atlasFrameTexture(atlas: Texture, frame: AtlasMetadata['frames'][string]['frame']): Texture {
  return new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
  });
}

async function buildTruthScene(
  stage: Container,
  index: CandidateIndex,
  candidate: CandidateDefinition,
  showGeometry = false,
): Promise<void> {
  const root = '/art/pixel/candidates/';
  const [atlas, metadataResponse] = await Promise.all([
    Assets.load<Texture>(`${root}${candidate.files.atlas}`),
    fetch(`${root}${candidate.files.atlasMetadata}`),
  ]);
  if (!metadataResponse.ok) {
    throw new Error(`Could not load ${candidate.name} atlas metadata (${metadataResponse.status})`);
  }
  const metadata = await metadataResponse.json() as AtlasMetadata;
  atlas.source.scaleMode = 'nearest';
  const textures = new Map<string, Texture>();
  const textureFor = (id: string): Texture => {
    const cached = textures.get(id);
    if (cached) return cached;
    const definition = metadata.frames[id];
    if (!definition) throw new Error(`${candidate.name} atlas is missing ${id}`);
    const texture = atlasFrameTexture(atlas, definition.frame);
    textures.set(id, texture);
    return texture;
  };

  const floor = new TilingSprite({
    texture: textureFor('environment-floor-tile'),
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
  });
  floor.roundPixels = true;
  stage.addChild(floor);

  const placements = [...index.truthGeometry.placements].sort((a, b) => a.layer - b.layer);
  for (const placement of placements) {
    const definition = metadata.frames[placement.id];
    if (!definition) throw new Error(`${candidate.name} atlas is missing ${placement.id}`);
    const sprite = new Sprite(textureFor(placement.id));
    sprite.pivot.set(definition.pivot.x, definition.pivot.y);
    sprite.position.set(placement.x, placement.y);
    sprite.roundPixels = true;
    stage.addChild(sprite);
  }

  if (showGeometry) {
    const overlay = new Graphics();
    for (const placement of placements) {
      const definition = metadata.frames[placement.id];
      const left = placement.x - definition.pivot.x;
      const top = placement.y - definition.pivot.y;
      overlay
        .rect(left, top, definition.frame.w, definition.frame.h)
        .stroke({ color: 0x3bd8ff, alpha: 0.34, width: 1 });
      overlay
        .moveTo(placement.x - 3, placement.y)
        .lineTo(placement.x + 3, placement.y)
        .moveTo(placement.x, placement.y - 3)
        .lineTo(placement.x, placement.y + 3)
        .stroke({ color: 0x3dff9a, alpha: 1, width: 1 });

      // Draw the atlas-local preview shape after proving its simulation-world
      // counterpart in the generated schema. The review surface itself is in
      // logical pixels, so consuming the explicitly named local projection
      // avoids mixing simulation and presentation units here.
      const collider = definition.artLocalPreviewShape;
      if (!collider) continue;
      const cx = left + collider.cx;
      const cy = top + collider.cy;
      if (collider.shape === 'circle') {
        overlay
          .circle(cx, cy, collider.radius)
          .fill({ color: 0xff315f, alpha: 0.08 })
          .stroke({ color: 0xff315f, alpha: 1, width: 1 });
      } else if (collider.shape === 'ellipse') {
        overlay
          .ellipse(cx, cy, collider.radiusX, collider.radiusY)
          .fill({ color: 0xff315f, alpha: 0.05 })
          .stroke({ color: 0xff315f, alpha: 1, width: 1 });
      } else {
        const halfArc = collider.halfAngleDegrees * Math.PI / 180;
        overlay
          .moveTo(cx, cy)
          .lineTo(cx + Math.cos(-halfArc) * collider.radius, cy + Math.sin(-halfArc) * collider.radius)
          .arc(cx, cy, collider.radius, -halfArc, halfArc)
          .lineTo(cx, cy)
          .closePath()
          .fill({ color: 0xff315f, alpha: 0.08 })
          .stroke({ color: 0xff315f, alpha: 1, width: 1 });
      }
    }
    overlay.roundPixels = true;
    stage.addChild(overlay);
  }
}

/**
 * Development-only controlled comparison surface for User gate 1.
 * The truth scene is a 640 x 360 native-grid PNG shown by Pixi at exactly 1x
 * in logical space. Browser presentation uses the same integer-backing-pixel
 * transform as the real game.
 */
export async function mountArtDirectionReview(root: HTMLElement): Promise<void> {
  const response = await fetch(INDEX_URL);
  if (!response.ok) throw new Error(`Could not load art-direction index (${response.status})`);
  const index = await response.json() as CandidateIndex;
  if (index.logicalCanvas.w !== LOGICAL_WIDTH || index.logicalCanvas.h !== LOGICAL_HEIGHT) {
    throw new Error('Art-direction candidates do not match the 640 x 360 logical canvas');
  }
  if (index.candidates.length !== 3) {
    throw new Error(`Art-direction review requires exactly three candidates; got ${index.candidates.length}`);
  }

  const requested = parseRoute();
  const candidate = index.candidates.find(({ id }) => id === requested.candidateId) ?? index.candidates[0];
  if (requested.candidateId !== candidate.id) {
    history.replaceState(null, '', routeTo(candidate.id, requested.view, requested.clean));
  }

  root.textContent = '';
  root.className = 'art-review-root';
  root.dataset.candidate = candidate.id;
  root.dataset.view = requested.view;
  root.dataset.clean = String(requested.clean);

  const surface = document.createElement('div');
  surface.className = 'art-review-surface';
  const notice = document.createElement('div');
  notice.className = 'art-review-notice';
  notice.innerHTML = '<strong>MAKE ROOM FOR THE COMPARISON</strong>' +
    '<span>Use a landscape window at least 640 × 360.</span>';
  root.append(surface, notice);

  let viewport = new ViewportTransform(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio || 1,
  );
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    resolution: viewport.backingScale,
    autoDensity: true,
    antialias: false,
    background: 0x03050a,
  });
  app.canvas.setAttribute('aria-label', `${candidate.name} ${requested.view} art-direction prototype`);
  surface.appendChild(app.canvas);

  const stage = new Container();
  if (requested.view === 'truth' || requested.view === 'hitboxes') {
    await buildTruthScene(stage, index, candidate, requested.view === 'hitboxes');
  } else {
    const fileKey = REVIEW_VIEWS.find(([id]) => id === requested.view)![2];
    const texture = await Assets.load<Texture>(`/art/pixel/candidates/${candidate.files[fileKey]}`);
    texture.source.scaleMode = 'nearest';
    const preview = new Sprite(texture);
    preview.roundPixels = true;
    if (requested.view === 'silhouettes') {
      preview.anchor.set(0.5);
      preview.position.set(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
    }
    stage.addChild(preview);
  }
  app.stage.addChild(stage);

  // The in-app browser's page screenshot transport is intentionally compact
  // JPEG. For pixel-art QA, expose a lossless copy of the actual Pixi canvas
  // only when the review route explicitly asks for it. Browser automation can
  // read this hidden image's data URL without substituting a pre-rendered
  // candidate board for the runtime-composed scene.
  const losslessExport = requested.exportPng
    ? document.createElement('img')
    : null;
  if (losslessExport) {
    losslessExport.hidden = true;
    losslessExport.alt = `${candidate.name} ${requested.view} lossless runtime export`;
    losslessExport.dataset.losslessRender = 'pending';
    root.appendChild(losslessExport);
  }

  const toolbar = document.createElement('aside');
  toolbar.className = 'art-review-toolbar';
  toolbar.setAttribute('aria-label', 'Art-direction comparison controls');
  const candidateRow = document.createElement('div');
  candidateRow.className = 'art-review-candidates';
  for (const item of index.candidates) {
    const control = button(item.name, () => {
      location.hash = routeTo(item.id, requested.view, false);
    });
    control.classList.toggle('active', item.id === candidate.id);
    control.setAttribute('aria-pressed', String(item.id === candidate.id));
    candidateRow.appendChild(control);
  }
  const viewRow = document.createElement('div');
  viewRow.className = 'art-review-views';
  for (const [id, label] of REVIEW_VIEWS) {
    const control = button(label, () => {
      location.hash = routeTo(candidate.id, id, false);
    });
    control.classList.toggle('active', id === requested.view);
    control.setAttribute('aria-pressed', String(id === requested.view));
    viewRow.appendChild(control);
  }
  const copy = document.createElement('div');
  copy.className = 'art-review-copy';
  const heading = document.createElement('strong');
  heading.textContent = candidate.name;
  const explanation = document.createElement('span');
  explanation.textContent = candidate.explanation;
  const tradeoff = document.createElement('small');
  tradeoff.textContent = `${candidate.tradeoff.readability} ${candidate.tradeoff.productionCost} ${candidate.tradeoff.mood}`;
  copy.append(heading, explanation, tradeoff);
  toolbar.append(candidateRow, viewRow, copy);
  if (!requested.clean) root.appendChild(toolbar);

  function paintViewport(): void {
    const next = new ViewportTransform(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
    );
    if (next.backingScale !== viewport.backingScale) {
      app.renderer.resize(LOGICAL_WIDTH, LOGICAL_HEIGHT, next.backingScale);
    }
    viewport = next;
    surface.style.left = `${viewport.offsetCssX}px`;
    surface.style.top = `${viewport.offsetCssY}px`;
    surface.style.transform = `scale(${viewport.cssScale})`;
    surface.hidden = !viewport.supported;
    notice.hidden = viewport.supported;
  }

  function scheduleLosslessExport(): void {
    if (!losslessExport) return;
    losslessExport.dataset.losslessRender = 'pending';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        app.render();
        losslessExport.src = app.canvas.toDataURL('image/png');
        losslessExport.dataset.losslessRender = 'ready';
      });
    });
  }

  paintViewport();
  scheduleLosslessExport();
  window.addEventListener('resize', paintViewport);
  window.visualViewport?.addEventListener('resize', paintViewport);
}
