# Pixel-art sources

The shipped Arcade Reliquary pixel art is original work created for this
repository. No commercial asset, third-party sprite pack, stock image, or
copyrighted game art is included. The production player and enemies were
generated as dedicated raster pose sheets using the selected Arcade Reliquary
concept as the project's own style reference, then chroma-keyed, palette-
reduced, and nearest-neighbour downsampled to native gameplay sizes.

## Canonical production source

`art-src/pixel-production/raster/` is the production master for the player and
20 enemies. It contains the final transparent pose sheets alongside their
untouched chroma-key sources. `arcade-reliquary.mjs` remains the support-art
master for weapons, pickups, effects, UI, environment, floor, and title
composition. Per-frame dimensions, pivots, ground or hover references, opaque
bounds, semantic tags, transparent margins, color budgets, and 1× renderer
scale are emitted with the atlas metadata.

The concept PNG is not cropped or traced into production. It served as a visual
reference for the dedicated actor-sheet generations. The production builder
reads only the committed pose sheets and native-grid support source.

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
fully transparent pixels, reviewed palette and per-frame color budgets,
minimum transparent margins, atlas separation, stable animation identities and
ground references, meaningful animation differences, exact 1× metadata, the
seamless 16 × 16 floor, the 320 × 180 title, and byte-stable output.

The full provenance, transformation policy, and reference-only concept record
are in `public/art/pixel/SOURCE_AND_LICENSE.md`.
