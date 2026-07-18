import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildLiveAssetManifest,
  serializeAssetManifest,
  type AtlasAnimationSnapshot,
  type AtlasSnapshot,
} from './asset-manifest';
import type { AtlasId } from './visual-catalog';

export const ASSET_MANIFEST_PATH = 'public/art/pixel/live-catalog.json';

const MODULE_PATH = fileURLToPath(import.meta.url);
export const DEFAULT_REPO_ROOT = resolve(dirname(MODULE_PATH), '../..');

interface RawAtlasJson {
  frames?: Record<string, unknown>;
  animations?: Record<string, unknown>;
  meta?: { image?: unknown };
}

const ATLAS_INPUTS: readonly {
  id: AtlasId;
  jsonPath: string;
  imagePath: string;
  expectedMetaImage: string;
}[] = [
  {
    id: 'gameplay',
    jsonPath: 'public/art/pixel/gameplay.json',
    imagePath: 'public/art/pixel/gameplay.png',
    expectedMetaImage: 'gameplay.png',
  },
  {
    id: 'ui',
    jsonPath: 'public/art/pixel/ui.json',
    imagePath: 'public/art/pixel/ui.png',
    expectedMetaImage: 'ui.png',
  },
  {
    id: 'environment',
    jsonPath: 'public/art/pixel/environment.json',
    imagePath: 'public/art/pixel/environment.png',
    expectedMetaImage: 'environment.png',
  },
];

function readAtlasSnapshot(repoRoot: string, input: (typeof ATLAS_INPUTS)[number]): AtlasSnapshot {
  const jsonFile = resolve(repoRoot, input.jsonPath);
  const imageFile = resolve(repoRoot, input.imagePath);
  if (!existsSync(jsonFile)) throw new Error(`missing atlas mapping ${input.jsonPath}`);
  if (!existsSync(imageFile)) throw new Error(`missing atlas image ${input.imagePath}`);
  const parsed = JSON.parse(readFileSync(jsonFile, 'utf8')) as RawAtlasJson;
  if (!parsed.frames || typeof parsed.frames !== 'object' || Array.isArray(parsed.frames)) {
    throw new Error(`${input.jsonPath} has no frame mapping object`);
  }
  if (parsed.meta?.image !== input.expectedMetaImage) {
    throw new Error(
      `${input.jsonPath} metadata image must be ${JSON.stringify(input.expectedMetaImage)}, got ${JSON.stringify(parsed.meta?.image)}`,
    );
  }
  const animations: AtlasAnimationSnapshot[] = [];
  for (const [id, value] of Object.entries(parsed.animations ?? {})) {
    if (!Array.isArray(value) || !value.every((frameKey) => typeof frameKey === 'string')) {
      throw new Error(`${input.jsonPath} animation ${JSON.stringify(id)} must be an array of frame-key strings`);
    }
    animations.push({ id, frameKeys: value });
  }
  return {
    id: input.id,
    jsonPath: input.jsonPath,
    imagePath: input.imagePath,
    frameKeys: Object.keys(parsed.frames),
    animations,
  };
}

export function generateAssetManifestText(repoRoot = DEFAULT_REPO_ROOT): string {
  for (const path of ['public/art/pixel/arena-floor.png', 'public/art/pixel/title-banner.png']) {
    if (!existsSync(resolve(repoRoot, path))) throw new Error(`missing standalone pixel-art image ${path}`);
  }
  const snapshots = ATLAS_INPUTS.map((input) => readAtlasSnapshot(repoRoot, input));
  return serializeAssetManifest(buildLiveAssetManifest(snapshots));
}

function firstDifference(left: string, right: string): string {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  if (index === length && left.length === right.length) return 'no byte difference';
  const line = left.slice(0, index).split('\n').length;
  return `first byte difference near line ${line}`;
}

export function checkAssetManifest(repoRoot = DEFAULT_REPO_ROOT): void {
  const expected = generateAssetManifestText(repoRoot);
  const manifestFile = resolve(repoRoot, ASSET_MANIFEST_PATH);
  if (!existsSync(manifestFile)) {
    throw new Error(
      `${ASSET_MANIFEST_PATH} is missing; run node --import tsx scripts/generate-asset-manifest.ts`,
    );
  }
  const actual = readFileSync(manifestFile, 'utf8');
  if (actual !== expected) {
    throw new Error(
      `${ASSET_MANIFEST_PATH} is stale (${firstDifference(actual, expected)}); ` +
      'run node --import tsx scripts/generate-asset-manifest.ts',
    );
  }
}

function isDirectExecution(): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === MODULE_PATH;
}

if (isDirectExecution()) {
  try {
    checkAssetManifest();
    const manifest = JSON.parse(generateAssetManifestText()) as {
      coverage: { physicalFrameCount: number; semanticRequirementCount: number };
    };
    console.log(
      `asset manifest verified: ${manifest.coverage.physicalFrameCount} physical frames, ` +
      `${manifest.coverage.semanticRequirementCount} semantic requirements, exact atlas coverage, no stale bytes`,
    );
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
