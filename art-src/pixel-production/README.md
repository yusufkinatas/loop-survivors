# Native pixel-art production source

`arcade-reliquary.mjs` is the canonical authored source for the selected
Arcade Reliquary production art. It draws every gameplay, UI, environment,
floor, and title pixel directly on its final native logical grid. The Gate-1
concepts and candidate renders are reference-only; the production builder does
not read, crop, sample, or resize them.

Rebuild the committed root outputs with:

```sh
node scripts/build-pixel-art.mjs build
```

Verify deterministic regeneration without writing with:

```sh
node scripts/build-pixel-art.mjs verify
```

The named 16-color palette lives in `arcade-reliquary.mjs`. Per-frame native
dimensions, art pivots, measured opaque bounds, semantic tags, transparent
margins, target envelopes, and 1× renderer scale are emitted directly into
`public/art/pixel/{gameplay,ui,environment}.json`. The binding visual rules and
schema meaning live in `docs/pixel-art-bible.md`; source history and licensing
live in `public/art/pixel/SOURCE_AND_LICENSE.md`. This module is original
repository-authored procedural pixel construction and has no external raster
dependency.
