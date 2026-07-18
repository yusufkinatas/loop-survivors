# Arcade Reliquary visual-overhaul evidence

Status: **final approval candidate; User gate 2 pending**

Arcade Reliquary is the selected and integrated pixel-art direction. The frozen
playable candidate is commit `ca42e3a`; later commits in this branch contain
review records only. Runtime art is generated directly on native logical grids
and ships without the temporary candidate picker, legacy fallback, or
`artMode` route.

## Release evidence

| Gate | Result | Primary record |
| --- | --- | --- |
| Direction selection | PASS | [`gate1/README.md`](gate1/README.md) |
| Production vertical slice | PASS | [`phase4/README.md`](phase4/README.md) |
| 500 ms visual-read protocol | PASS | [`clarity/README.md`](clarity/README.md) |
| Matched five-minute MAX360 performance | PASS | [`performance/README.md`](performance/README.md) |
| Two final independent visual critiques | PASS | [`phase7/README.md`](phase7/README.md) |
| Cleanup, verification, and production build | PASS | [`phase8/README.md`](phase8/README.md) |

The failed preliminary and revised Phase 4 critiques remain beside the passing
record so the corrective history is auditable. Superseded clarity runs are
likewise preserved under `clarity/failed-results/` and are explicitly excluded
from the final totals.

## Representative final packet

- Before: [`baseline/max-density-360-1280x720.jpg`](baseline/max-density-360-1280x720.jpg)
- After, MAX360: [`phase4/gameplay/max360-a-1280x720-dpr2.jpg`](phase4/gameplay/max360-a-1280x720-dpr2.jpg)
- Opening choice: [`phase4/gameplay/opening-weapon-choice-1280x720-dpr1.jpg`](phase4/gameplay/opening-weapon-choice-1280x720-dpr1.jpg)
- Early combat: [`phase4/gameplay/early-combat-kick-1280x720-dpr1.jpg`](phase4/gameplay/early-combat-kick-1280x720-dpr1.jpg)
- Mixed combat: [`phase4/gameplay/mixed-1280x720-dpr2.jpg`](phase4/gameplay/mixed-1280x720-dpr2.jpg)
- Headliner: [`phase4/gameplay/headliner-clean-1280x720-dpr2.jpg`](phase4/gameplay/headliner-clean-1280x720-dpr2.jpg)
- Hitbox agreement: [`phase4/gameplay/mixed-hitbox-overlay-1280x720-dpr2.jpg`](phase4/gameplay/mixed-hitbox-overlay-1280x720-dpr2.jpg)
- Shop: [`phase4/gameplay/shop-offers-1280x720-dpr1.jpg`](phase4/gameplay/shop-offers-1280x720-dpr1.jpg)
- Level-up: [`phase4/gameplay/level-up-reward-1280x720-dpr1.jpg`](phase4/gameplay/level-up-reward-1280x720-dpr1.jpg)
- Sandbox: [`phase4/gameplay/sandbox-controls-1280x720-dpr2.jpg`](phase4/gameplay/sandbox-controls-1280x720-dpr2.jpg)

The six numbered motion frames in `phase4/gameplay/` are the short gameplay
sequence used in place of a video. Exact 1×, 2×, and 3× presentation captures,
four MAX360 seeds, grayscale and three color-vision simulations, attack
geometry overlays, and lossless family sheets are indexed by the Phase 4
record.

## Measured outcomes

- Native catalog: 108 physical frames covering 239 semantic requirements —
  72 gameplay, 20 UI, and 16 environment frames.
- Clarity: 120/120 player-location reads and 116/120 category reads across
  three independent reviewers, five vision modes, four seeds, and two motion
  offsets.
- Collision edge audit: 144 deterministic contacts, zero false hits and zero
  false misses.
- Performance at 360 enemies: 120.5 FPS median and 97.8 FPS 1% low, with no
  median regression against the matched legacy run and 60.71% less atlas
  texture memory.
- Atlas pages: 1024 × 512, 512 × 256, and 256 × 256; all remain below the
  2048 × 2048 ceiling.

The only instrumentation limitations are that the Pixi renderer did not expose
a trustworthy draw-call counter and the in-app Chromium automation surface did
not expose its browser version or user agent. Neither limitation hides a failed
functional, clarity, build, or frame-rate check.
