# Native pixel-art production source

The canonical actor source is the committed raster art under `raster/`:
`player.png`, `enemies-idle.png`, and `enemies-walk.png`. These sheets replace
the rejected programmer-art silhouettes with detailed Arcade Reliquary actors
authored against the selected concept reference. Matching `*-source.png` files
preserve the original flat chroma-key generations for provenance.

`arcade-reliquary.mjs` remains the native-grid support source for weapons,
pickups, effects, UI, environment, floor, and title composition. The production
builder extracts actors from fixed transparent gutters, removes residual
chroma, downsamples once with nearest-neighbour sampling to native gameplay
sizes, and packs them without inventing or redrawing anatomy.

Rebuild the committed root outputs with:

```sh
node scripts/build-pixel-art.mjs build
```

Verify deterministic regeneration without writing with:

```sh
node scripts/build-pixel-art.mjs verify
```

The named 16-color functional palette lives in `arcade-reliquary.mjs` for
support art. Raster actors use reviewed 48/64-color material palettes so stone,
cloth, chitin, and faces retain the concept's depth. Per-frame native
dimensions, art pivots, measured opaque bounds, semantic tags, transparent
margins, target envelopes, and 1× renderer scale are emitted directly into
`public/art/pixel/{gameplay,ui,environment}.json`. The binding visual rules and
schema meaning live in `docs/pixel-art-bible.md`; source history, prompts, and
licensing live in `public/art/pixel/SOURCE_AND_LICENSE.md`.
