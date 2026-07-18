# Pixel-art source boards

These are the original generated boards used by `scripts/build-pixel-art.mjs`.
Do not edit the shipped atlas by hand; update a source board or its mapping and
rebuild it instead.

## Actor board (5 x 5)

The builder maps one player and every current `EnemyKind` to selected cells.
It normalizes their silhouettes into exact 96-pixel transparent cells and
derives a second hard-pixel movement frame while keeping each actor's feet
planted.

## Combat board (6 x 5, row-major)

1. Cells 1-9: kick, clap, snare, hat, bass, lead, arp, chord, bell.
2. Cells 10-18: evolved versions in the same order.
3. Cells 19-24: blue XP, green XP, red XP, music note, reward pedestal,
   evolution chest.
4. Cells 25-30: cyan impact, gold impact, explosion, death, XP collection,
   celebration.

## UI board (5 x 4, row-major)

1. Row 1: high tops, fast forward, needle tips, mirrorball, wide lens.
2. Row 2: heavy amp, extension cable, magnet lanyard, padded jacket, recovery
   tape.
3. Row 3: heart, XP, music note, level, pause.
4. Row 4: reroll, shop, evolution, weapon pedestal, enemy skull.

## Arena floor

`arena-floor-source.png` is an opaque rune-cut cobblestone field. The builder
takes a centered 1024 x 1024 crop, downsamples it to 512 x 512 by an exact
integer factor with nearest-neighbour sampling, and stitches narrow opposite
edge bands for repeatable arena tiling.

## Environment board (4 x 4, row-major)

1. Row 1: broken pillar, rune pillar, cyan brazier, gold brazier.
2. Row 2: rubble, sarcophagus, hooded statue, knight statue.
3. Row 3: bones, mushrooms, thorn vines, gravestone.
4. Row 4: cyan crystals, purple banner, campfire, rune dais.

The same build also composes `public/art/pixel/title-banner.png` at a logical
320 x 180 resolution using the finished floor and atlases, then performs an
exact 4x nearest-neighbour upscale. It contains no baked-in title text.

See `public/art/pixel/SOURCE_AND_LICENSE.md` for provenance and licensing.
