# Pixel-art source and license record

## Shipped Arcade Reliquary production art

- **Creator:** original work created specifically for the Loop Survivors
  repository on 2026-07-18 and revised on 2026-07-19.
- **Production tools:** OpenAI built-in image generation for the dedicated
  player/enemy raster pose sheets; repository-authored chroma cleanup, palette
  reduction, nearest-neighbour extraction, and atlas packing; native-grid
  JavaScript support art in `arcade-reliquary.mjs`.
- **Design source:** the player-selected Arcade Reliquary direction and the
  binding rules in `docs/pixel-art-bible.md`.
- **Transformations:** the selected concept was supplied only as a style and
  quality reference for new actor-sheet generations. The generated sheets were
  placed on a flat chroma background, converted to hard transparency, reduced
  to reviewed 48/64-color palettes, nearest-neighbour downsampled once to native
  gameplay sizes, deterministically packed, and PNG encoded. No production
  sprite is a crop or trace of the concept image.
- **Runtime status:** shipped production source for gameplay, UI, environment,
  floor, and title art.
- **License:** governed by the same project terms as this repository. There is
  no third-party asset license or attribution requirement.

No commercial asset, third-party sprite pack, stock image, purchased asset, or
copyrighted game art was copied into the production files.

## Derived production files

- `gameplay.png` / `gameplay.json` — 72 variable-size native frames: two mapped
  frames for the player and all 20 enemy kinds, normal/evolved weapon families,
  pickups, and effects.
- `ui.png` / `ui.json` — 20 native UI, passive, status, and action-icon frames.
- `environment.png` / `environment.json` — 16 variable-size native prop frames.
- `arena-floor.png` — one opaque, seamless 16 × 16 native floor tile.
- `title-banner.png` — one text-free 320 × 180 native title composition. Live
  HTML owns functional title copy so it remains sharp and localizable.
- `live-catalog.json` — generated inventory and mapping record enumerating 108
  physical atlas frame keys and 239 semantic requirements.

Gameplay, UI, and environment metadata declare the native frame rectangle,
integer pivot, normalized anchor, measured opaque bounds, semantic class and
tags, transparent margin, renderer scale of 1 logical screen pixel per native
pixel, color budget, colors used, and ground/hover reference where applicable.
Support frames use the locked 16-color functional palette. Raster-authored
actors use the reviewed 48/64-color material extension recorded in the pixel-
art bible; the shipped frame metadata records the measured count per frame.

Run `node scripts/build-pixel-art.mjs build` from the repository root to rebuild
the committed outputs. Run `node scripts/build-pixel-art.mjs verify` to compare
a fresh in-memory generation with those outputs. Verification covers exact live
catalog mappings, valid dimensions, hard 0/255 alpha, zero hidden RGB, reviewed
palette and color budgets, transparent frame margins, atlas separation, stable frame
and animation identities, ground references, animation differences and area
stability, renderer scale 1, floor seams, title dimensions, and deterministic
bytes.

PixiJS loading is centralized in `src/game/pixel-art.ts`, which forces
nearest-neighbor texture sampling at runtime.

## Art-direction concept references (not shipped)

`art-src/pixel-overhaul/concepts/` contains three art-direction explorations
generated with the built-in OpenAI image-generation tool on 2026-07-18:
`gilded-ossuary-reference.png`, `moonlit-tapestry-reference.png`, and
`arcade-reliquary-reference.png`.

- **Creator/tool:** OpenAI image generation through the built-in image tool;
  the underlying model identifier was not separately reported.
- **Inputs:** project-authored controlled-scene prompts with no third-party
  input images. Prompt summaries are recorded in the directory's `README.md`.
- **Transformations/runtime status:** retained unchanged as concept-only
  references. Runtime code and the production builder do not consume, crop,
  chroma-key, trace, or resize them.
- **License:** governed by the same project terms as this repository; no
  third-party asset attribution is required.

## Archived Gate 1 native-grid references (development only)

`docs/visual-evidence/pixelart-overhaul/gate1/reference/` retains the selected
Arcade Reliquary truth scene, grayscale view, silhouette view, hitbox overlay,
and crowded-combat board, plus the five side-by-side comparison boards used at
the first player decision gate. The comparison boards are ordered Gilded
Ossuary, Moonlit Tapestry, and Arcade Reliquary from left to right.

These files are unchanged outputs from the deterministic, code-authored Gate 1
prototype process completed on 2026-07-18. That process constructed every
sprite directly on its declared native logical grid and did not read, sample,
crop, trace, or resize the concept-reference PNGs. The temporary builder,
runtime review route, atlases, metadata, and rejected-direction working files
were removed after Arcade Reliquary was selected and independently rebuilt in
the canonical production module. The archived PNGs are evidence only and are
not production inputs.
