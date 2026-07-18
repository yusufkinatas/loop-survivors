import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  PRODUCTION_ART_DIRECTION,
  PRODUCTION_ART_HEADER_HEIGHT,
  PRODUCTION_ART_LABEL_HEIGHT,
  PRODUCTION_ART_LOGICAL_HEIGHT,
  PRODUCTION_ART_LOGICAL_WIDTH,
  PRODUCTION_ART_PAGES,
  PRODUCTION_ART_PAIR_GAP,
  PRODUCTION_EFFECTS,
  PRODUCTION_ENEMIES,
  PRODUCTION_ENVIRONMENT,
  PRODUCTION_PICKUPS,
  PRODUCTION_UI_ICONS,
  PRODUCTION_WEAPONS,
  type ProductionArtAtlasId,
  type ProductionArtFamily,
  type ProductionArtPage,
} from './catalog';

interface CheckedFrame {
  readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly pivot: { readonly x: number; readonly y: number };
  readonly opaqueBounds: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly rendererScale: { readonly value: number };
}

interface CheckedAtlas {
  readonly frames: Record<string, CheckedFrame>;
  readonly meta: {
    readonly direction: string;
    readonly image: string;
    readonly frameCount: number;
    readonly rendererScale: { readonly value: number };
    readonly size: { readonly w: number; readonly h: number };
  };
}

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`production-art review check: ${message}`);
}

function atlasPath(id: ProductionArtAtlasId): string {
  return `${REPO_ROOT}public/art/pixel/${id}.json`;
}

function loadAtlas(id: ProductionArtAtlasId): CheckedAtlas {
  const atlas = JSON.parse(readFileSync(atlasPath(id), 'utf8')) as CheckedAtlas;
  assert(atlas.meta.direction === PRODUCTION_ART_DIRECTION, `${id} direction must be ${PRODUCTION_ART_DIRECTION}`);
  assert(atlas.meta.rendererScale?.value === 1, `${id} meta.rendererScale must be 1`);
  assert(atlas.meta.image === `${id}.png`, `${id} meta.image must name the live ${id}.png`);
  assert(Object.keys(atlas.frames).length === atlas.meta.frameCount, `${id} frameCount is stale`);
  for (const [key, frame] of Object.entries(atlas.frames)) {
    assert(frame.rendererScale?.value === 1, `${id}/${key} rendererScale must be 1`);
    assert(frame.frame.w > 0 && frame.frame.h > 0, `${id}/${key} frame must have positive dimensions`);
    assert(
      frame.pivot && Number.isInteger(frame.pivot.x) && Number.isInteger(frame.pivot.y),
      `${id}/${key} must declare an integer pivot`,
    );
    assert(
      frame.opaqueBounds && frame.opaqueBounds.w > 0 && frame.opaqueBounds.h > 0,
      `${id}/${key} must declare non-empty opaque bounds`,
    );
    assert(
      frame.opaqueBounds.x >= 0 && frame.opaqueBounds.y >= 0 &&
      frame.opaqueBounds.x + frame.opaqueBounds.w <= frame.frame.w &&
      frame.opaqueBounds.y + frame.opaqueBounds.h <= frame.frame.h,
      `${id}/${key} opaque bounds leave the native frame`,
    );
  }
  const png = readFileSync(`${REPO_ROOT}public/art/pixel/${atlas.meta.image}`);
  assert(
    png.length >= 24 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    `${id} image is not a lossless PNG`,
  );
  assert(png.readUInt32BE(16) === atlas.meta.size.w, `${id} PNG width disagrees with metadata`);
  assert(png.readUInt32BE(20) === atlas.meta.size.h, `${id} PNG height disagrees with metadata`);
  return atlas;
}

function pageKeys(family: ProductionArtFamily): string[] {
  return PRODUCTION_ART_PAGES
    .filter((page) => page.family === family)
    .flatMap((page) => page.entries.flatMap((entry) => entry.keys));
}

function assertExactCoverage(description: string, actual: readonly string[], expected: readonly string[]): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((key) => !actualSet.has(key));
  const orphaned = actual.filter((key) => !expectedSet.has(key));
  const duplicated = actual.filter((key, index) => actual.indexOf(key) !== index);
  assert(missing.length === 0, `${description} misses ${missing.join(', ')}`);
  assert(orphaned.length === 0, `${description} has orphaned keys ${orphaned.join(', ')}`);
  assert(duplicated.length === 0, `${description} repeats ${[...new Set(duplicated)].join(', ')}`);
  assert(actual.length === expected.length, `${description} has ${actual.length} keys; expected ${expected.length}`);
}

function expectedEnemyIdles(): string[] {
  return PRODUCTION_ENEMIES.map(([id]) => `actors/enemies/${id}/idle`);
}

function expectedActorMotion(): string[] {
  return [
    'actors/player/idle',
    'actors/player/walk',
    ...PRODUCTION_ENEMIES.flatMap(([id]) => [
      `actors/enemies/${id}/idle`,
      `actors/enemies/${id}/walk`,
    ]),
  ];
}

function expectedWeapons(): string[] {
  return PRODUCTION_WEAPONS.flatMap(([id]) => [`weapons/${id}/normal`, `weapons/${id}/evolved`]);
}

function expectedPickupsAndEffects(): string[] {
  return [
    ...PRODUCTION_PICKUPS.map(([id]) => `pickups/${id}`),
    ...PRODUCTION_EFFECTS.map(([id]) => `fx/${id}`),
  ];
}

function expectedUiIcons(): string[] {
  return PRODUCTION_UI_ICONS.map(([id]) => `ui/${id}`);
}

function expectedEnvironment(): string[] {
  return PRODUCTION_ENVIRONMENT.map(([id]) => `environment/${id}`);
}

function assertPageFitsAtNativeSize(page: ProductionArtPage, atlas: CheckedAtlas): void {
  assert(page.entries.length <= page.columns * page.rows, `${page.id} grid cannot hold its entries`);
  assert(page.entries.length > 0, `${page.id} must not be empty`);
  assert(page.title.length > 0 && page.legend.length > 0, `${page.id} must label its content outside the art`);
  const cellWidth = Math.floor(PRODUCTION_ART_LOGICAL_WIDTH / page.columns) - 2;
  const cellHeight = Math.floor(
    (PRODUCTION_ART_LOGICAL_HEIGHT - PRODUCTION_ART_HEADER_HEIGHT) / page.rows,
  ) - PRODUCTION_ART_LABEL_HEIGHT - 2;
  for (const entry of page.entries) {
    assert(entry.label.length > 0, `${page.id}/${entry.id} is missing its external label`);
    const frames = entry.keys.map((key) => {
      const frame = atlas.frames[key];
      assert(frame, `${page.id} references missing ${page.atlas}/${key}`);
      return frame;
    });
    let requiredWidth: number;
    let requiredHeight: number;
    if (page.presentation === 'silhouette-normal') {
      assert(frames.length === 1, `${page.id}/${entry.id} must use one idle source`);
      requiredWidth = frames[0].frame.w * 2 + PRODUCTION_ART_PAIR_GAP;
      requiredHeight = frames[0].frame.h;
    } else if (page.presentation === 'idle-walk') {
      assert(frames.length === 2, `${page.id}/${entry.id} must pair idle and walk`);
      requiredWidth = frames.reduce((sum, frame) => sum + frame.frame.w, 0) + PRODUCTION_ART_PAIR_GAP;
      const above = Math.max(...frames.map((frame) => frame.pivot.y));
      const below = Math.max(...frames.map((frame) => frame.frame.h - frame.pivot.y));
      requiredHeight = above + below;
    } else if (page.presentation === 'normal-evolved') {
      assert(frames.length === 2, `${page.id}/${entry.id} must pair normal and evolved`);
      requiredWidth = Math.max(...frames.map((frame) => frame.frame.w));
      requiredHeight = frames.reduce((sum, frame) => sum + frame.frame.h, 0) + PRODUCTION_ART_PAIR_GAP;
    } else {
      assert(frames.length === 1, `${page.id}/${entry.id} must reference one frame`);
      requiredWidth = frames[0].frame.w;
      requiredHeight = frames[0].frame.h;
    }
    assert(
      requiredWidth <= cellWidth && requiredHeight <= cellHeight,
      `${page.id}/${entry.id} needs ${requiredWidth}x${requiredHeight} native pixels; ` +
      `its art area is ${cellWidth}x${cellHeight}`,
    );
  }
}

export function runProductionArtReviewCheck(): void {
  const atlases: Record<ProductionArtAtlasId, CheckedAtlas> = {
    gameplay: loadAtlas('gameplay'),
    ui: loadAtlas('ui'),
    environment: loadAtlas('environment'),
  };
  assert(PRODUCTION_ART_PAGES.length === 9, `expected 9 controlled pages; got ${PRODUCTION_ART_PAGES.length}`);
  assertExactCoverage('enemy-idle pages', pageKeys('enemy-idles'), expectedEnemyIdles());
  assertExactCoverage('actor-motion pages', pageKeys('actor-motion'), expectedActorMotion());
  assertExactCoverage('weapon pages', pageKeys('weapons'), expectedWeapons());
  assertExactCoverage('pickups/effects page', pageKeys('pickups-effects'), expectedPickupsAndEffects());
  assertExactCoverage('UI-icon page', pageKeys('ui-icons'), expectedUiIcons());
  assertExactCoverage('environment page', pageKeys('environment-props'), expectedEnvironment());

  const ids = PRODUCTION_ART_PAGES.map(({ id }) => id);
  assert(new Set(ids).size === ids.length, 'page IDs must be unique');
  for (const page of PRODUCTION_ART_PAGES) assertPageFitsAtNativeSize(page, atlases[page.atlas]);

  const reviewedGameplay = new Set(
    PRODUCTION_ART_PAGES
      .filter(({ atlas }) => atlas === 'gameplay')
      .flatMap(({ entries }) => entries.flatMap(({ keys }) => keys)),
  );
  const reviewedUi = new Set(pageKeys('ui-icons'));
  const reviewedEnvironment = new Set(pageKeys('environment-props'));
  assertExactCoverage('gameplay atlas review union', [...reviewedGameplay], Object.keys(atlases.gameplay.frames));
  assertExactCoverage('UI atlas review union', [...reviewedUi], Object.keys(atlases.ui.frames));
  assertExactCoverage(
    'environment atlas review union',
    [...reviewedEnvironment],
    Object.keys(atlases.environment.frames),
  );

  console.log(
    'production-art review check passed: ' +
    '9 pages, 20 enemy silhouettes, 21 actor pairs, 9 weapon pairs, ' +
    '12 pickups/effects, 20 UI icons, 16 environment props',
  );
}

runProductionArtReviewCheck();
