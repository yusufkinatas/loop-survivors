# Phase 4 revised-slice independent critique

Date: 2026-07-18

Direction: Arcade Reliquary
Result: **REVISE / FAIL**

This is the preserved second independent review, after the first-pass family
redraws but before the final dense-combat revision. The critic inspected the
lossless production sheets and running-game evidence without relying on asset
labels.

| Release-rubric category | Score |
| --- | ---: |
| Coherent, intentional pixel-art game | 8 |
| Player immediately distinguishable | 9 |
| Gameplay categories visually distinct | 6 |
| UI readable and consistent | 8 |
| Unified sprites, effects, palette, animation, and scale | 8 |
| Dense combat readable | 4 |
| Visible bodies and attack boundaries honest | 7 |

The slice did not pass because every category must score at least 8 and dense
combat is a hard gate.

## Blocking findings

- The old equal-family MAX360 fixture overrepresented large bodies, producing
  a tiled sprite wall rather than a plausible late horde with readable gaps.
- The floor texture competed with small actors and pickups.
- Evolved Kick and Bass were insufficiently distinct structurally: Kick did
  not read as one connected cross-shaped strike and Bass retained an overly
  slab-like center instead of two clear seismic contours.
- The presentation evidence mislabeled a scaled browser capture as exact 3×.
- Proof for active attack boundaries, in-motion behavior, and actual shop
  offer cards was too weak or indirect.

## Response applied before final re-review

- Rebuilt every MAX360 seed as a fixed weighted horde of 180 bats, 108
  zombies, 48 Green Mudmen, 12 Mantises, and 12 Chargers, with deterministic
  unique placements and separation checks.
- Replaced the floor with a seamless, uniform deep-navy 16 × 16 tile so the
  arena remains deliberately subordinate.
- Redrew evolved Kick as a connected orthogonal cross and evolved Bass as two
  separated seismic contours with a transparent center. Builder assertions
  now enforce those structures.
- Recaptured exact full-page 640 × 360, 1280 × 720, and 1920 × 1080 evidence at
  DPR 1.
- Added six timed motion frames, explicit normal/evolved attack-overlay proof,
  and a real shop-offer capture.
- Preserved the superseded captures under `first-pass/` or outside the final
  review index; they are not presented as passing evidence.

The successor independent re-review is recorded separately and must score all
seven categories at least 8 before this gate can be marked PASS.
