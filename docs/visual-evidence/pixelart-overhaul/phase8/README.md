# Phase 8 cleanup and final engineering QA

Status: **PASS**

Candidate under test: `ca42e3a` (`feat: finalize Arcade Reliquary production
candidate`). The tracked runtime and source were clean at that commit. This
engineering pass intentionally did not use a browser; the separate final
visual critics own the browser review. No engineering blocker was found.

## Exact command record

The commands below were run from the repository root on 2026-07-18.

### `npm run verify`

Result: **PASS**, exit 0.

The command ran `tsc --noEmit` and every chained production check. Its emitted
summary included:

```text
verified Arcade Reliquary native production art
coverage: gameplay 72/72, UI 20/20, environment 16/16, live catalog 108/108 exact
checks: 108/108 unique non-empty frames, hard alpha, zero transparent RGB, master palette only, measured colors/frame <= 7 within declared budgets, minimum frame margin 2px, atlas separation 2px
animations: 21/21 stable mappings, universal ground references aligned, maximum solid-area delta 8.12%, minimum changed pixels 16
renderer: native logical frames at exact 1x; floor repeat unit 16x16 seamless; title stored at native 320x180
asset manifest: 108 physical frames, 239 semantic requirements, exact atlas coverage, no stale bytes
geometry-edge-audit: 144 deterministic cases · apparent false hits 0 · apparent false misses 0
```

Asset-manifest, measured-art, UI contrast, production-art, visual-read
protocol, viewport, visual-debug, endless, starting-weapon, meta-migration, and
systems checks also reported PASS. The recorded production-art inventory was
9 pages, 20 enemy silhouettes, 21 actor pairs, 9 weapon pairs, 12
pickups/effects, 20 UI icons, and 16 environment props.

### `npm run build`

Result: **PASS**, exit 0. TypeScript passed, Vite 6.4.3 transformed 785 modules,
and the production build completed in 2.22 seconds. The largest emitted asset
was `dist/assets/index-DXh1QJI1.js` at 616.97 kB (194.62 kB gzip). Vite also
emitted its non-blocking warning that a chunk is larger than 500 kB after
minification.

### `npm run clarity:check`

Result: **PASS**, exit 0.

```text
clarity packet check passed: exact 4-seed × 2-offset × 5-vision coverage, balanced classes, valid answers, and 80 unique 640 x 360 PNGs
```

### `npm run visual-read:results`

Result: **PASS**, exit 0.

```text
clarity results passed: 3 independent reviewers reached at least 95% on both 40-sample packets
```

The counted exports total 120/120 correct player-location reads and 116/120
correct category reads.

### `git diff --check`

Result: **PASS**, exit 0 with no output. It was run before this record and
repeated after this record was added, with the same result.

## Cleanup audit

The tracked-source token audit used these exact searches:

```sh
git grep -n -E 'artMode|/art/pixel/legacy|#art-directions|pixel/candidates|build-art-direction-candidates|candidate-builder|art:candidates|quantizeScale|PROJECTILE_SCALE|PICKUP_SCALE|LEGACY_PLAYER_RENDER_SCALE|legacyEnemyRenderScale|LEGACY_ATLAS_FRAME_SIZE|legacyActorFrameBounds|legacyActorOpaqueUnionBounds'
git grep -n -E '\.scale\.(set|x|y)|scale:' -- src
git ls-files public/art/pixel/legacy public/art/pixel/candidates public/art/pixel/collision-baseline.json scripts/build-art-direction-candidates.mjs
```

The final command returned no paths. The search matches were classified rather
than treated as runtime use:

| Audit target | Result |
| --- | --- |
| `artMode` | No source/runtime match. Three matches in `docs/pixelart-overhaul.md` are the historical removal requirement and completion record. |
| `/art/pixel/legacy` | No loadable path. Its two source matches are explicit negative assertions in `visual-debug-check.ts`. |
| `#art-directions` | No route/runtime match. The sole match is the historical Gate 1 evidence record. |
| `pixel/candidates` | No tracked match; the directory is absent. |
| Candidate builder and `art:candidates` | No tracked match; `scripts/build-art-direction-candidates.mjs` is absent. |
| Retired scale/anchor helpers | `quantizeScale`, `PROJECTILE_SCALE`, `PICKUP_SCALE`, `LEGACY_PLAYER_RENDER_SCALE`, `legacyEnemyRenderScale`, `LEGACY_ATLAS_FRAME_SIZE`, `legacyActorFrameBounds`, and `legacyActorOpaqueUnionBounds` appear only inside explicit absence checks. No definition or call remains. |
| Runtime sprite scaling | Production sprites calculate `1 / 0.5 = 2`, reject non-integer results, and apply only `2` or mirrored `-2`; `roundPixels` is enabled. The sole game-view scale write is the shared `0.5` world projection, not a per-sprite resample. |

The responsive boss-development experiment still scales its whole arena
container to fit a window. It lives under `src/experiments/boss/`, is not the
production game view, and places its sprite dimensions and positions on rounded
pixels. This is not a production fractional pixel-sprite scale.

`legacyEnemyRadius` and `MAD_FOREST_FRAMES` remain in gameplay configuration.
They preserve established simulation radii and frame-timing identities; they
do not load, size, anchor, or select retired visual assets, so they are not a
visual-fallback violation.

Filesystem and atlas-metadata inspection returned:

| Item | Final state |
| --- | --- |
| `public/art/pixel/legacy` | Absent |
| `public/art/pixel/candidates` | Absent |
| `public/art/pixel/collision-baseline.json` | Absent |
| `scripts/build-art-direction-candidates.mjs` | Absent |
| Gameplay atlas | 1024 × 512; within 2048 × 2048 |
| UI atlas | 256 × 256; within 2048 × 2048 |
| Environment atlas | 512 × 256; within 2048 × 2048 |

## Post-clean smoke evidence

The pre-record worktree check showed no tracked modification and only the
untracked `phase8/` evidence directory. At that point it contained exactly the
two expected 1280 × 720 JPEG captures:

- [`final-production-title-1280x720-dpr2.jpg`](final-production-title-1280x720-dpr2.jpg)
  (`b5fdd9fe30804428809a37604e8c5635885ee141284c7119f53ae00bc8b8b070`)
  shows the production title composition, readable game title and subtitle,
  primary entry button, control hint, and sandbox/experiment links.
- [`final-production-max360-overlays-1280x720-dpr2.jpg`](final-production-max360-overlays-1280x720-dpr2.jpg)
  (`0540c31fa71cd6fa422abfc996c8481e8f0338d20121594dc65fdf04ff5d7de8`)
  shows the 30:00, level-40 MAX360 sandbox with 360 live enemies, HUD and
  sandbox controls present, and hitbox, pivot, opaque-bounds, attack, pickup,
  and magnet overlays rendered over the production scene.

These stills establish that the cleanup candidate can render its title and
maximum-density debug scene without a missing-art fallback. They do not by
themselves establish interaction or frame rate; those claims remain grounded
in the dedicated protocol and performance records.

The matched five-minute performance record reports 120.5 FPS median and 97.8
FPS 1% low for production at 360 enemies, versus 120.5/95.3 for the legacy
baseline, plus a 60.71% reduction in measured atlas texture memory. Live
objects stayed at 411 and transient counts remained bounded.

## Recorded exceptions

- Pixi 8 exposed no trustworthy draw-call statistic through the read-only
  renderer paths probed by the performance instrumentation. The performance
  record therefore reports `renderer-stats-unavailable`; it does not invent a
  value. This is the sole performance-budget instrumentation exception.
- The in-app Chromium performance capture did not expose a browser version or
  user agent. Its machine, viewport, device-pixel ratio, seed, preset, sample
  duration, and endpoint values are still recorded.
- The production build passes, but Vite reports the 616.97 kB main bundle
  against its advisory 500 kB chunk-warning threshold. No functional or
  frame-budget gate failed because of that warning.
