import {
  EXPERIMENT_SCOPE_DECISIONS,
  LIVE_CATALOG_SNAPSHOT,
  PHYSICAL_FRAME_MAPPINGS,
  SEMANTIC_VISUAL_REQUIREMENTS,
  UI_SURFACES,
  VISUAL_CATALOG_SCHEMA_VERSION,
  type AtlasId,
} from './visual-catalog';

export interface AtlasAnimationSnapshot {
  id: string;
  frameKeys: readonly string[];
}

export interface AtlasSnapshot {
  id: AtlasId;
  jsonPath: string;
  imagePath: string;
  frameKeys: readonly string[];
  animations: readonly AtlasAnimationSnapshot[];
}

export interface AtlasCoverageResult {
  id: AtlasId;
  expectedFrameCount: number;
  actualFrameCount: number;
  missingFrameKeys: readonly string[];
  orphanFrameKeys: readonly string[];
  expectedAnimationCount: number;
  actualAnimationCount: number;
  missingAnimationIds: readonly string[];
  orphanAnimationIds: readonly string[];
  incorrectAnimations: readonly {
    id: string;
    expectedFrameKeys: readonly string[];
    actualFrameKeys: readonly string[];
  }[];
}

export interface LiveAssetManifest {
  schemaVersion: number;
  generator: {
    command: string;
    checkCommand: string;
    inputs: readonly string[];
  };
  catalog: typeof LIVE_CATALOG_SNAPSHOT;
  atlases: readonly AtlasSnapshot[];
  semanticRequirements: typeof SEMANTIC_VISUAL_REQUIREMENTS;
  physicalFrames: typeof PHYSICAL_FRAME_MAPPINGS;
  uiSurfaces: typeof UI_SURFACES;
  experimentScopeDecisions: typeof EXPERIMENT_SCOPE_DECISIONS;
  coverage: {
    exact: true;
    exactnessScope: 'physical-atlas-frame-keys-and-animation-mappings';
    semanticAdequacy: 'documented-not-auto-approved';
    atlases: readonly AtlasCoverageResult[];
    semanticRequirementCount: number;
    physicalFrameCount: number;
    runtimeUsageCounts: Readonly<Record<string, number>>;
    mappedButUnrenderedFrameKeys: readonly string[];
    developmentExperimentFrameKeys: readonly string[];
    knownCatalogDiscrepancies: readonly {
      id: string;
      values: readonly string[];
      note: string;
    }[];
  };
}

const codeUnitSort = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(codeUnitSort);
}

function difference(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return sortedUnique(left.filter((value) => !rightSet.has(value)));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function expectedAtlasFrameKeys(): Readonly<Record<AtlasId, readonly string[]>> {
  return {
    gameplay: sortedUnique(
      PHYSICAL_FRAME_MAPPINGS.filter((mapping) => mapping.atlas === 'gameplay').map((mapping) => mapping.frameKey),
    ),
    ui: sortedUnique(
      PHYSICAL_FRAME_MAPPINGS.filter((mapping) => mapping.atlas === 'ui').map((mapping) => mapping.frameKey),
    ),
    environment: sortedUnique(
      PHYSICAL_FRAME_MAPPINGS.filter((mapping) => mapping.atlas === 'environment').map((mapping) => mapping.frameKey),
    ),
  };
}

export function expectedAtlasAnimations(): Readonly<Record<AtlasId, readonly AtlasAnimationSnapshot[]>> {
  const enemyIds = LIVE_CATALOG_SNAPSHOT.enemies.all;
  const gameplay = [
    {
      id: 'actors/player',
      frameKeys: ['actors/player/idle', 'actors/player/walk'],
    },
    ...enemyIds.map((kind) => ({
      id: `actors/enemies/${kind}`,
      frameKeys: [`actors/enemies/${kind}/idle`, `actors/enemies/${kind}/walk`],
    })),
  ].sort((left, right) => codeUnitSort(left.id, right.id));
  return { gameplay, ui: [], environment: [] };
}

function normalizeAtlas(snapshot: AtlasSnapshot): AtlasSnapshot {
  return {
    id: snapshot.id,
    jsonPath: snapshot.jsonPath,
    imagePath: snapshot.imagePath,
    frameKeys: sortedUnique(snapshot.frameKeys),
    animations: [...snapshot.animations]
      .map((animation) => ({ id: animation.id, frameKeys: [...animation.frameKeys] }))
      .sort((left, right) => codeUnitSort(left.id, right.id)),
  };
}

function validateCatalogStructure(snapshots: readonly AtlasSnapshot[]): void {
  const errors: string[] = [];
  const physicalKeys = PHYSICAL_FRAME_MAPPINGS.map((mapping) => `${mapping.atlas}:${mapping.frameKey}`);
  if (new Set(physicalKeys).size !== physicalKeys.length) {
    errors.push('physical frame mappings contain duplicate atlas/frame keys');
  }

  const semanticIds = SEMANTIC_VISUAL_REQUIREMENTS.map((entry) => entry.id);
  const semanticIdSet = new Set(semanticIds);
  if (semanticIdSet.size !== semanticIds.length) {
    errors.push('semantic visual requirements contain duplicate IDs');
  }

  for (const mapping of PHYSICAL_FRAME_MAPPINGS) {
    for (const semanticId of mapping.semanticIds) {
      if (!semanticIdSet.has(semanticId)) {
        errors.push(`physical frame ${mapping.atlas}:${mapping.frameKey} references unknown semantic ID ${semanticId}`);
        continue;
      }
      const semantic = SEMANTIC_VISUAL_REQUIREMENTS.find((entry) => entry.id === semanticId);
      if (
        semantic?.mapping.atlas !== mapping.atlas ||
        !semantic.mapping.frameKeys.includes(mapping.frameKey)
      ) {
        errors.push(
          `physical frame ${mapping.atlas}:${mapping.frameKey} is not present in its semantic mapping ${semanticId}`,
        );
      }
    }
  }

  const actualByAtlas = new Map(snapshots.map((snapshot) => [snapshot.id, new Set(snapshot.frameKeys)]));
  for (const entry of SEMANTIC_VISUAL_REQUIREMENTS) {
    if (entry.mapping.atlas === null) {
      if (entry.mapping.frameKeys.length > 0) {
        errors.push(`semantic requirement ${entry.id} has frame keys but no atlas`);
      }
      continue;
    }
    const keys = actualByAtlas.get(entry.mapping.atlas);
    if (!keys) {
      errors.push(`semantic requirement ${entry.id} references missing atlas ${entry.mapping.atlas}`);
      continue;
    }
    for (const frameKey of entry.mapping.frameKeys) {
      if (!keys.has(frameKey)) {
        errors.push(`semantic requirement ${entry.id} references missing ${entry.mapping.atlas} frame ${frameKey}`);
      }
    }
    if (entry.mapping.mode === 'shared' || entry.mapping.mode === 'runtime-treatment') {
      if (entry.mapping.sharedWith === null || entry.mapping.reason === null || entry.mapping.treatment === null) {
        errors.push(`semantic requirement ${entry.id} does not explicitly document its shared/treatment mapping`);
      }
    }
  }

  for (const surface of UI_SURFACES) {
    for (const semanticId of surface.requiredVisuals) {
      if (!semanticIdSet.has(semanticId)) {
        errors.push(`UI surface ${surface.id} references unknown semantic ID ${semanticId}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`asset catalog structure failed:\n- ${errors.join('\n- ')}`);
  }
}

export function validateAtlasCoverage(snapshots: readonly AtlasSnapshot[]): AtlasCoverageResult[] {
  const normalized = snapshots.map(normalizeAtlas);
  const snapshotIds = normalized.map((snapshot) => snapshot.id);
  const requiredIds: readonly AtlasId[] = ['gameplay', 'ui', 'environment'];
  const missingAtlases = difference(requiredIds, snapshotIds);
  const orphanAtlases = difference(snapshotIds, requiredIds);
  if (missingAtlases.length > 0 || orphanAtlases.length > 0 || new Set(snapshotIds).size !== snapshotIds.length) {
    throw new Error(
      `atlas inventory mismatch; missing=[${missingAtlases.join(', ')}], orphan=[${orphanAtlases.join(', ')}], ids=[${snapshotIds.join(', ')}]`,
    );
  }

  const expectedKeys = expectedAtlasFrameKeys();
  const expectedAnimations = expectedAtlasAnimations();
  const results: AtlasCoverageResult[] = [];

  for (const id of requiredIds) {
    const actual = normalized.find((snapshot) => snapshot.id === id);
    if (!actual) throw new Error(`missing normalized atlas ${id}`);
    const actualKeys = actual.frameKeys;
    const expected = expectedKeys[id];
    const missingFrameKeys = difference(expected, actualKeys);
    const orphanFrameKeys = difference(actualKeys, expected);
    const expectedAnimationList = expectedAnimations[id];
    const expectedAnimationIds = expectedAnimationList.map((animation) => animation.id);
    const actualAnimationIds = actual.animations.map((animation) => animation.id);
    const missingAnimationIds = difference(expectedAnimationIds, actualAnimationIds);
    const orphanAnimationIds = difference(actualAnimationIds, expectedAnimationIds);
    const incorrectAnimations: AtlasCoverageResult['incorrectAnimations'][number][] = [];
    for (const expectedAnimation of expectedAnimationList) {
      const actualAnimation = actual.animations.find((animation) => animation.id === expectedAnimation.id);
      if (actualAnimation && !sameStrings(expectedAnimation.frameKeys, actualAnimation.frameKeys)) {
        incorrectAnimations.push({
          id: expectedAnimation.id,
          expectedFrameKeys: [...expectedAnimation.frameKeys],
          actualFrameKeys: [...actualAnimation.frameKeys],
        });
      }
    }
    results.push({
      id,
      expectedFrameCount: expected.length,
      actualFrameCount: actualKeys.length,
      missingFrameKeys,
      orphanFrameKeys,
      expectedAnimationCount: expectedAnimationList.length,
      actualAnimationCount: actual.animations.length,
      missingAnimationIds,
      orphanAnimationIds,
      incorrectAnimations,
    });
  }

  const failures = results.filter((result) =>
    result.missingFrameKeys.length > 0 ||
    result.orphanFrameKeys.length > 0 ||
    result.missingAnimationIds.length > 0 ||
    result.orphanAnimationIds.length > 0 ||
    result.incorrectAnimations.length > 0,
  );
  if (failures.length > 0) {
    const messages = failures.map((result) => [
      `${result.id}:`,
      `missing frames=[${result.missingFrameKeys.join(', ')}]`,
      `orphan frames=[${result.orphanFrameKeys.join(', ')}]`,
      `missing animations=[${result.missingAnimationIds.join(', ')}]`,
      `orphan animations=[${result.orphanAnimationIds.join(', ')}]`,
      `incorrect animations=[${result.incorrectAnimations.map((animation) => animation.id).join(', ')}]`,
    ].join(' '));
    throw new Error(`asset atlas coverage failed:\n- ${messages.join('\n- ')}`);
  }
  validateCatalogStructure(normalized);
  return results;
}

function runtimeUsageCounts(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const mapping of PHYSICAL_FRAME_MAPPINGS) {
    result[mapping.runtimeUsage] = (result[mapping.runtimeUsage] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => codeUnitSort(left, right)));
}

export function buildLiveAssetManifest(snapshots: readonly AtlasSnapshot[]): LiveAssetManifest {
  const normalized = snapshots.map(normalizeAtlas).sort((left, right) => codeUnitSort(left.id, right.id));
  const atlasCoverage = validateAtlasCoverage(normalized);
  const physicalFrames = [...PHYSICAL_FRAME_MAPPINGS].sort((left, right) =>
    codeUnitSort(`${left.atlas}:${left.frameKey}`, `${right.atlas}:${right.frameKey}`),
  ) as unknown as typeof PHYSICAL_FRAME_MAPPINGS;
  const semanticRequirements = [...SEMANTIC_VISUAL_REQUIREMENTS].sort((left, right) =>
    codeUnitSort(left.id, right.id),
  ) as unknown as typeof SEMANTIC_VISUAL_REQUIREMENTS;
  const uiSurfaces = [...UI_SURFACES].sort((left, right) => codeUnitSort(left.id, right.id)) as unknown as typeof UI_SURFACES;
  const experimentScopeDecisions = [...EXPERIMENT_SCOPE_DECISIONS].sort((left, right) =>
    codeUnitSort(left.id, right.id),
  ) as unknown as typeof EXPERIMENT_SCOPE_DECISIONS;
  return {
    schemaVersion: VISUAL_CATALOG_SCHEMA_VERSION,
    generator: {
      command: 'node --import tsx scripts/generate-asset-manifest.ts',
      checkCommand: 'node --import tsx src/game/asset-manifest-check.ts',
      inputs: [
        'src/game/config.ts',
        'src/game/endless.ts',
        'src/game/madforest.ts',
        'src/audio/soundset.ts',
        'src/game/items.ts',
        'src/game/meta.ts',
        'src/game/picks.ts',
        'src/game/pixel-art.ts',
        'src/game/visual-catalog.ts',
        'public/art/pixel/gameplay.json',
        'public/art/pixel/ui.json',
        'public/art/pixel/environment.json',
      ],
    },
    catalog: LIVE_CATALOG_SNAPSHOT,
    atlases: normalized,
    semanticRequirements,
    physicalFrames,
    uiSurfaces,
    experimentScopeDecisions,
    coverage: {
      exact: true,
      exactnessScope: 'physical-atlas-frame-keys-and-animation-mappings',
      semanticAdequacy: 'documented-not-auto-approved',
      atlases: atlasCoverage,
      semanticRequirementCount: semanticRequirements.length,
      physicalFrameCount: physicalFrames.length,
      runtimeUsageCounts: runtimeUsageCounts(),
      mappedButUnrenderedFrameKeys: physicalFrames
        .filter((mapping) => mapping.runtimeUsage === 'mapped-unrendered')
        .map((mapping) => `${mapping.atlas}:${mapping.frameKey}`),
      developmentExperimentFrameKeys: physicalFrames
        .filter((mapping) => mapping.runtimeUsage === 'development-experiment')
        .map((mapping) => `${mapping.atlas}:${mapping.frameKey}`),
      knownCatalogDiscrepancies: [
        {
          id: 'endless-declared-but-absent-from-wave-rows',
          values: [...LIVE_CATALOG_SNAPSHOT.enemies.declaredButUnused],
          note: 'ENDLESS_ENEMY_IDS declares these enemies, but no ENDLESS_WAVE_ROWS pattern currently uses them.',
        },
      ],
    },
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => codeUnitSort(left, right));
    return Object.fromEntries(entries.map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
}

export function serializeAssetManifest(manifest: LiveAssetManifest): string {
  return `${JSON.stringify(canonicalize(manifest), null, 2)}\n`;
}
