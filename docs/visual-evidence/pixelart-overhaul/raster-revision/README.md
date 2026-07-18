# Raster actor revision

The first Arcade Reliquary candidate was rejected at User gate 2 because its
procedurally constructed player and enemies read as programmer art rather than
the mature dark-fantasy pixel art established by the selected concept. This
revision replaces those character drawings instead of trying to polish the
same construction pipeline.

## Authored sources

- Concept direction: `art-src/pixel-overhaul/concepts/arcade-reliquary-reference.png`
- Enemy idle sheet: `art-src/pixel-production/raster/enemies-idle.png`
- Enemy motion sheet: `art-src/pixel-production/raster/enemies-walk.png`
- Player two-pose sheet: `art-src/pixel-production/raster/player.png`
- Unprocessed generation outputs are retained beside the production sheets as
  `*-source.png` for provenance.

The sheets were generated with the built-in image generation tool using the
Arcade Reliquary concept as the visual reference. The enemy prompts require a
strict 5 × 4 roster grid with the same 20 named silhouettes in idle and motion
poses. The player prompt requires matching idle and running/attacking poses of
the concept's compact adult hero. All prompts require crisp mature 16/32-bit
dark-fantasy pixel art, clear anatomy and materials, no text, no shadows, no
blur, and a flat chroma background.

## Production pipeline

The generated chroma backgrounds are removed, alpha is hardened, and the
sprites are palette-quantized. `scripts/build-pixel-art.mjs` then extracts each
authored cell, downsamples with nearest-neighbor sampling, fits it into the
existing native frame envelope, and packs the atlas. It does not synthesize the
actors' anatomy or costume from code.

The runtime contracts are unchanged: actor keys, pivots, collision metadata,
animation names, atlas dimensions, and nearest-neighbor rendering remain
compatible with the game. Code-native drawing remains in place for small
functional support art such as effects, pickups, UI, and environment tiles.

## Lean verification

No browser or timed gameplay capture was run for this revision, by explicit
request to avoid spending the remaining work budget on expensive browser
testing. The following local checks passed:

- atlas build and deterministic verification;
- 108/108 required physical frames and 239 semantic manifest mappings;
- hard alpha and zero RGB in transparent pixels;
- frame palette, transparent-margin, atlas-separation, and animation-change
  checks;
- TypeScript check, manifest check, production Vite build, and diff whitespace
  check.

The exact final atlas frames are shown at nearest-neighbor 3× scale in
[`runtime-actor-lineup.png`](runtime-actor-lineup.png). This is a static atlas
inspection, not a simulated browser screenshot. Revised in-game visual approval
remains User gate 2.
