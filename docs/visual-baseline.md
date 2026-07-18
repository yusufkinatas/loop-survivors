# Pixel-art overhaul baseline

This records Phase 0 of [`pixelart-overhaul.md`](pixelart-overhaul.md) before
replacement art or presentation code was introduced. The audited baseline is
commit `32d4092fd0d77dab1ee70001d732a49e27b4e044`.

## Reproducibility

- Runtime: Node 24.11.1, npm 11.6.2.
- Browser capture surface: Codex in-app Chromium browser, 1280 × 720 CSS
  viewport, device-pixel ratio 2, 2560 × 1440 Pixi backing buffer.
- Core Sandbox seed: `0x5eed`.
- Normal opening choices are intentionally random in the baseline and are not
  a deterministic comparison surface.
- `npm run verify`: passed in 2.50 seconds after `npm ci`.
- `npm run build`: passed in 5.44 seconds. Vite reported one existing warning:
  the 557.86 kB minified main chunk is above its 500 kB advisory threshold.

The capture inventory and exact scene setup are in
[`visual-evidence/pixelart-overhaul/baseline/README.md`](visual-evidence/pixelart-overhaul/baseline/README.md).

## Shipped raster inventory

| Asset | Dimensions | Coverage |
| --- | ---: | --- |
| `gameplay.png` | 1024 × 1024 | 72 cells at 96 × 96: player 2, enemies 40, weapons 18, pickups 6, effects 6 |
| `ui.png` | 512 × 512 | 20 cells at 96 × 96: passives 10, status 5, actions 5 |
| `environment.png` | 512 × 512 | 16 decorative prop cells at 96 × 96 |
| `arena-floor.png` | 512 × 512 | one opaque repeating floor |
| `title-banner.png` | 1280 × 720 | one composition authored at 320 × 180 and enlarged exactly 4× |

The current builder verifies RGBA8888 PNGs, hard alpha, transparent-black RGB,
frame borders, mappings, the floor seam, nearest-neighbour title scaling, and
deterministic output. These checks are worth preserving.

## Raster diagnosis

Hard alpha and visible square pixels do not make the current cells deliberate
pixel art. Measurements across every atlas cell show the result of resizing
high-detail generated illustrations:

| Group | Frames | Mean unique-color / opaque-pixel ratio | Mean singleton-color ratio |
| --- | ---: | ---: | ---: |
| Gameplay | 72 | 0.961 | 0.938 |
| UI | 20 | 0.925 | 0.870 |
| Environment | 16 | 0.953 | 0.916 |

Gameplay cells average 2,094 unique opaque colors. Exact-color neighboring
pixels match only about 0.3% of the time. The music note is the clearest small
example: all 415 opaque pixels have different colors. The floor contains
25,233 unique colors and the logical title composition contains 25,519.

The generated actor animation is not a behavioral animation: the builder moves
the upper part of the first image up by one pixel. Enemies animate continuously
at seven frames per second even when their behavior is stationary.

## Presentation and geometry baseline

At baseline, Pixi resizes directly to the browser window, caps render
resolution at DPR 2, and has no shared logical viewport. Camera zoom is
`max(1, floor(viewHeight / 720))`; consequently the simulation view changes
with browser size until large-display zoom happens to reduce it again.

| CSS viewport | Camera zoom | Visible simulation extent |
| --- | ---: | ---: |
| 640 × 360 | 1 | 640 × 360 |
| 1280 × 720 | 1 | 1280 × 720 |
| 1920 × 1080 | 1 | 1920 × 1080 |
| 2560 × 1440 | 2 | 1280 × 720 |
| 390 × 844 portrait | 1 | 390 × 844 |

This establishes 1280 × 720 simulation units as the comparison extent and
`worldToLogical = 0.5` as the correct starting projection into a 640 × 360
logical presentation.

Runtime art scales are mostly fractional. Representative values are player,
ordinary enemies, pickups, and scenery at `0.5`; Headliners at `0.72`;
pedestals and Encore Cases at `0.62`; and projectiles at `0.25`–`0.34`.
Effects are rounded to eighth-step scales, which are still fractional. The UI
uses a separate numeric atlas crop and additional CSS reductions.

The generic actor anchor is `(0.5, 0.92)`, but ownership is duplicated and
opaque bounds are discarded during asset building. Twelve enemies still
derive body dimensions from unrelated Mad Forest frame metadata. The renderer
does not apply their stored foot offsets. Examples in simulation units:

| Body | Radius | Foot offset `(x, y)` |
| --- | ---: | ---: |
| Player | 15.79 | `(1.75, 12.28)` |
| Dusk Moth (`bat`) | 12.28 | `(-2.28, 17.89)` |
| Plague Husk (`zombie`) | 21.05 | `(-4.74, 25.96)` |
| Crypt Spider (`mantis`) | 33.33 | `(-8.07, 32.28)` |

The player camera follows the declared foot point while the sprite is drawn at
the collision-circle center. Enemies use foot offsets in some spawn, targeting,
and recycling paths but not in rendering or contact collision.

Attack geometry is similarly split. Kick damages an offset rectangle while a
centered square sprite represents it. Clap damages a cone plus a point-blank
circle but displays a rotated square texture. Bass projectile radii and sprite
sizes come from separate tables. Merged evolved Chord zones can reach a
360-unit diameter while their art stops growing at a much smaller cap.

There are no collision-bearing arena obstacles. Current scenery is deliberately
decorative, so the overhaul must not imply otherwise.

## Live catalog gaps and reused presentation

- All 20 enemy IDs have generic idle/walk frames, but windup, dash, shield,
  phase, split, fixed-swarm, Amped, and Headliner states lack authored state
  art. They rely on generic tint, aura, or no distinct read.
- The stored Headliner Gold cosmetic flag is not consumed by the renderer.
- Redline Stomp uses the evolved Snare beam frame, Standing Ovation uses a
  generic ring, and Subquake uses generic explosion art. Their evolved weapon
  frames do not represent the main-game mechanics.
- Ground evolution choices preview the normal weapon frame.
- The pause status icon and all five action icons are shipped but unused.
- Reward pedestals are reused for unrelated ordinary, evolution, passive, and
  stat choices; Encore choices borrow unrelated weapon icons.
- The declared endless roster and actual wave recipes disagree: four declared
  enemy kinds are absent from the recipes.
- Sandbox-only enemies are valid development fixtures and remain in overhaul
  coverage. The boss, track-lab, and rehearsal experiments are development
  references rather than separate production-art catalogs.

## Phase 1 acceptance seams

The first implementation slice must therefore provide one 640 × 360
`ViewportTransform`, one 0.5-scale `WorldProjection`, fixed 1280 × 720
simulation extent, final logical-pixel snapping, transformed joystick input,
and a rotate/resize state. The Sandbox needs explicit geometry overlays,
grayscale, deterministic capture presets, and an exact 360-enemy scene before
replacement sprites are judged.

The live-catalog manifest and frame/collision measurements generated alongside
this document are machine-readable under `public/art/pixel/`. They separate
semantic states from physical frame reuse so a deliberately shared treatment
is visible rather than silently disappearing from coverage.
