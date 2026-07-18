# Pixel-art sources

The shipped Arcade Reliquary pixel art is original, repository-authored work.
No commercial asset, third-party sprite pack, stock image, or copyrighted game
art is included. AI image generation was used only for the three clearly
labeled art-direction concept references; production PNGs are not crops,
traces, resizes, or chroma-key extractions from those images.

## Canonical production source

`art-src/pixel-production/arcade-reliquary.mjs` is the production master. It
constructs the gameplay, UI, environment, floor, and title pixels directly on
their final native logical grids with the locked 16-color Arcade Reliquary
palette. Per-frame dimensions, pivots, ground or hover references, opaque
bounds, semantic tags, transparent margins, color budgets, and 1× renderer
scale are emitted with the atlas metadata.

The selected concept and Gate 1 prototypes remain reference-only. The
production builder does not read, sample, crop, trace, chroma-key, or resize
them.

## Shipped assets and coverage

`scripts/build-pixel-art.mjs` deterministically produces these files under
`public/art/pixel/`:

- `gameplay.png` / `gameplay.json`: 72 variable-size native gameplay frames,
  including two mapped frames for the player and each of the 20 enemies, all
  normal/evolved weapon families, pickups, and effects;
- `ui.png` / `ui.json`: 20 native UI, passive, status, and action icons;
- `environment.png` / `environment.json`: 16 variable-size native scenery
  frames;
- `arena-floor.png`: one opaque, seamless 16 × 16 native floor tile;
- `title-banner.png`: one text-free 320 × 180 native title composition.

The generated `live-catalog.json` records 108 physical atlas frame keys and
239 semantic requirements. Its coverage report requires the shipped frame and
animation mappings to match the generated live catalog exactly. A physical
frame may serve several semantic requirements only when the manifest records
that mapping explicitly.

## Rebuild and verification

Rebuild the committed outputs with:

```sh
node scripts/build-pixel-art.mjs build
```

Verify deterministic regeneration without writing with:

```sh
node scripts/build-pixel-art.mjs verify
```

Verification checks valid native dimensions, hard 0/255 alpha, zero RGB under
fully transparent pixels, the locked palette and per-frame color budgets,
minimum transparent margins, atlas separation, stable animation identities and
ground references, meaningful animation differences, exact 1× metadata, the
seamless 16 × 16 floor, the 320 × 180 title, and byte-stable output.

The full provenance, transformation policy, and reference-only concept record
are in `public/art/pixel/SOURCE_AND_LICENSE.md`.
