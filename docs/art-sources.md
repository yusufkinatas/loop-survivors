# Pixel-art sources

Every shipped game image is original art generated specifically for Loop
Survivors with OpenAI image generation on 2026-07-18. No commercial asset,
third-party sprite pack, stock image, or copyrighted game artwork is included.
The generated art therefore has no separate third-party attribution or license;
it is governed by the same project terms as this repository.

## Source boards

The reproducible source boards live in `art-src/pixel/`:

- `actors-source.png`: the player and the full 20-enemy dark-fantasy bestiary.
- `combat-source.png`: nine attacks, nine ultimate forms, three XP crystals,
  music notes, reward objects, impacts, explosions, and collection effects.
- `ui-source.png`: ten passive-item icons, five status icons, and five action
  icons in the same palette and pixel density.
- `environment-source.png`: ruins, statues, braziers, plants, crystals, bones,
  fire, and a rune dais.
- `arena-floor-source.png`: midnight-blue rune-cut crypt cobblestones.

## Shipped assets

`scripts/build-pixel-art.mjs` turns those boards into the files under
`public/art/pixel/`:

- `gameplay.png` / `gameplay.json`: 72 transparent 96×96 sprite frames,
  including two-frame animation for the player and every enemy.
- `ui.png` / `ui.json`: 20 transparent 96×96 icon frames.
- `environment.png` / `environment.json`: 16 transparent 96×96 scenery frames.
- `arena-floor.png`: opaque, seamless 512×512 floor tile.
- `title-banner.png`: text-free 1280×720 composition built from the same
  sprites at 320×180 and nearest-neighbour upscaled exactly 4×.

The builder uses hard 0/255 alpha, clears invisible RGB to `(0, 0, 0, 0)`,
removes the chroma matte, and rejects missing frames, overlap, edge bleed,
residual key color, broken transparency, non-seamless floor edges, or
interpolated title pixels. PixiJS then forces nearest-neighbour sampling and
rounded pixel positions at runtime. Rebuild and verify with:

```sh
node scripts/build-pixel-art.mjs verify
```

The machine-readable frame mappings and full provenance record are in
`public/art/pixel/SOURCE_AND_LICENSE.md`.
