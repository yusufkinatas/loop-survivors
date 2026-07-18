#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ASSET_MANIFEST_PATH,
  DEFAULT_REPO_ROOT,
  checkAssetManifest,
  generateAssetManifestText,
} from '../src/game/asset-manifest-check';

const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check') || args.filter((arg) => arg === '--check').length > 1) {
  throw new Error('usage: node --import tsx scripts/generate-asset-manifest.ts [--check]');
}

if (args.includes('--check')) {
  checkAssetManifest(DEFAULT_REPO_ROOT);
  console.log(`${ASSET_MANIFEST_PATH} is current and has exact bidirectional atlas coverage`);
} else {
  const contents = generateAssetManifestText(DEFAULT_REPO_ROOT);
  writeFileSync(resolve(DEFAULT_REPO_ROOT, ASSET_MANIFEST_PATH), contents);
  const manifest = JSON.parse(contents) as {
    coverage: { physicalFrameCount: number; semanticRequirementCount: number };
  };
  console.log(
    `generated ${ASSET_MANIFEST_PATH}: ${manifest.coverage.physicalFrameCount} physical frames, ` +
    `${manifest.coverage.semanticRequirementCount} semantic requirements`,
  );
}
