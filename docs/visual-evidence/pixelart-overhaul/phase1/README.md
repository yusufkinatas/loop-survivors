# Phase 1 visual-truth evidence

These captures exercise the fixed 640 × 360 logical surface, the preserved
1280 × 720 simulation extent, and `worldToLogical = 0.5`. Landscape captures
use a 1280 × 720 CSS viewport at DPR 1, so each logical pixel is displayed as
an exact 2 × 2 backing-pixel block. Pixi, DOM UI, debug geometry, and capture
framing all consume the same `ViewportTransform`. These full-page browser
captures are JPEGs; the Gate 1 art prototypes use separate lossless PNG canvas
exports for pixel-level comparison.

| File | Evidence |
| --- | --- |
| `title-logical-viewport-1280x720.jpg` | Real title/start UI contained by the logical surface with its primary action visible. |
| `mixed-all-overlays-1280x720.jpg` | Frozen MIXED scene with bodies, 96-pixel source frames, measured opaque bounds, renderer anchors, ground pivots, pickup/magnet radii, and reachable choice positions. |
| `mixed-grayscale-overlays-1280x720.jpg` | The same frozen geometry with the whole Pixi-and-DOM surface in grayscale. |
| `max360-frozen-1280x720.jpg` | Exact 360-enemy frozen scene at minute 30 and level 40. |
| `portrait-rotate-notice-720x1280.jpg` | Portrait application state: combat is hidden and the rotate/resize notice owns the surface. |

The fixed presets are deterministic and idempotent:

- `EMPTY`: seed `0xe11e0001`, minute 0, level 1, zero enemies;
- `MIXED`: seed `0x51ced123`, minute 12, level 20, five representative
  enemies plus XP, music-note currency, an Encore Case, and starting/reward
  choice positions;
- `MAX360`: seed `0x5eed0360`, minute 30, level 40, exactly 72 each of five
  enemy kinds for 360 unique placements.

The Sandbox explicitly reports zero collision-bearing obstacles because the
current scenery is decorative. `src/game/visual-debug-check.ts` re-derives the
opaque actor bounds from the generated frame metrics, proves exact preset
counts and freezing, and exercises live Kick, Clap, projectile, wide-area,
pickup, magnet, and choice geometry.
