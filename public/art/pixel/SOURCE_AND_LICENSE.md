# Pixel-art source and license record

## Provenance

All images in this directory are original assets generated specifically for
Loop Survivors with OpenAI image generation on 2026-07-18. No third-party
sprite pack, stock image, purchased asset, or copyrighted game art was copied
into these atlases. Consequently there is no third-party asset license or
attribution requirement to carry with them. Their use is governed by the same
project terms as the rest of this repository.

The committed source boards are:

- `art-src/pixel/actors-source.png` — one player plus a broad dark-fantasy
  bestiary, presented on a flat chroma background.
- `art-src/pixel/combat-source.png` — normal and evolved weapon attacks,
  experience gems, reward objects, impacts, explosions, and collection effects.
- `art-src/pixel/ui-source.png` — passive-item icons, status icons, and action
  icons in the same dark-fantasy palette and pixel density.
- `art-src/pixel/arena-floor-source.png` — opaque midnight-blue rune-cut
  cobblestones for the arena environment.
- `art-src/pixel/environment-source.png` — transparent-source board for ruins,
  braziers, statues, natural clutter, crystals, fire, and the rune dais.

These source images were generated from project-authored descriptions asking
for cohesive, high-contrast, low-resolution pixel-art subjects on a uniform
magenta key background. The raw boards are retained so the shipped atlases can
be reproduced without an online service.

## Derived files

- `gameplay.png` / `gameplay.json` — 72 exact 96 x 96 cells: two frames for the
  player and all 20 enemy kinds, normal and evolved attacks for nine live
  weapons, six pickups, and six effects.
- `ui.png` / `ui.json` — 20 exact 96 x 96 UI/icon cells.
- `arena-floor.png` — opaque 512 x 512 repeatable arena floor. It is produced
  from a centered 1024-pixel crop with exact 2:1 nearest-neighbour reduction;
  narrow opposing edge bands are stitched so tiled copies have no hard seam.
- `environment.png` / `environment.json` — 16 exact 96 x 96 transparent prop
  cells, all sharing the actor atlas's bottom-weighted anchor convention.
- `title-banner.png` — text-free 1280 x 720 start-screen scene composed only
  from the shipped floor, actor, enemy, effect, and environment sprites. Its
  logical 320 x 180 composition is integer-upscaled exactly 4x; live HTML owns
  the title copy so it stays sharp and localizable.

Run `node scripts/build-pixel-art.mjs` from the repository root to rebuild and
verify both atlases. The dependency-free builder removes the magenta
background, forces fully transparent pixels to RGBA `(0, 0, 0, 0)`, uses only
hard 0/255 alpha, scales with nearest-neighbour sampling, and checks for frame
overlap, border bleeding, residual matte color, and missing mappings.
The floor verifier additionally requires full opacity and byte-identical
opposing edge pixels. The title verifier requires an opaque image and proves
that every logical pixel became an exact 4 x 4 block without interpolation.

PixiJS loading is centralized in `src/game/pixel-art.ts`, which also forces
nearest-neighbour texture sampling at runtime.
