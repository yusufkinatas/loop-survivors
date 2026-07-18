# Phase 4 internal vertical-slice gate

Status: **PASS**

Direction: **Arcade Reliquary**. Frozen playable candidate: `ca42e3a`.

This record closes the internal vertical-slice gate and indexes the evidence
used again for final release review. The preliminary and revised independent
critiques remain beside this file as preserved failures. Their blocking
findings were corrected before the final packet was scored.

## Integrated slice

The final slice includes the player; flying, humanoid, heavy, spider, boss,
and Headliner enemies; XP, music-note currency, weapon rewards, an Encore
Case, and utility pickups; normal and evolved Kick, Hi-hat, Bass, and Chord;
hit, death, collection, warning, and explosion effects; environment surfaces
and props; the HUD, level-up rewards, shop offers, and Sandbox controls.

The production builder authors every asset on its native logical grid. The
live catalog contains 108 physical frames covering exactly 239 semantic
requirements: 72 gameplay, 20 UI, and 16 environment frames. All 21 actor
animation mappings have stable identities and planted ground references.

## Running-game evidence matrix

| Scene | Passing evidence | What it establishes |
| --- | --- | --- |
| Empty arena | [`gameplay/empty-1280x720-dpr2.jpg`](gameplay/empty-1280x720-dpr2.jpg) | Quiet deep-navy floor, subordinate props, and whole-pixel composition |
| Opening selection | [`gameplay/opening-weapon-choice-1280x720-dpr1.jpg`](gameplay/opening-weapon-choice-1280x720-dpr1.jpg) | Reachable, distinct weapon pedestals and a clear selected state |
| Early combat | [`gameplay/early-combat-kick-1280x720-dpr1.jpg`](gameplay/early-combat-kick-1280x720-dpr1.jpg) | Immediate player, moth, pickup, and first-attack reads |
| Mixed combat | [`gameplay/mixed-1280x720-dpr2.jpg`](gameplay/mixed-1280x720-dpr2.jpg), [`gameplay/headliner-clean-1280x720-dpr2.jpg`](gameplay/headliner-clean-1280x720-dpr2.jpg) | Enemy-role, pickup, boss, and Headliner separation |
| Maximum density | [`gameplay/max360-a-640x360.png`](gameplay/max360-a-640x360.png), plus B–D and four vision modes | Player and urgent rewards remain findable among 360 enemies |
| Normal/evolved attacks | Kick, Bass, Clap, and Chord files matching `gameplay/*-attack-overlay-*` | Evolutions differ by contour and structure, with visible active boundaries |
| Motion | [`gameplay/motion-sequence-01-1280x720-dpr1.jpg`](gameplay/motion-sequence-01-1280x720-dpr1.jpg) through `06` | Stable planted pixels, pivots, camera projection, and authored motion |
| Debug geometry | [`gameplay/mixed-hitbox-overlay-1280x720-dpr2.jpg`](gameplay/mixed-hitbox-overlay-1280x720-dpr2.jpg) | Bodies, pivots, opaque bounds, attacks, pickups, and collection radii agree |
| UI surfaces | [`gameplay/level-up-reward-1280x720-dpr1.jpg`](gameplay/level-up-reward-1280x720-dpr1.jpg), [`gameplay/shop-offers-1280x720-dpr1.jpg`](gameplay/shop-offers-1280x720-dpr1.jpg), [`gameplay/sandbox-controls-1280x720-dpr2.jpg`](gameplay/sandbox-controls-1280x720-dpr2.jpg) | Consistent hierarchy, readable states, focus, and pixel-art framing |

Exact presentation captures are preserved at
[`gameplay/presentation-1x-640x360-dpr1.jpg`](gameplay/presentation-1x-640x360-dpr1.jpg),
[`gameplay/presentation-2x-1280x720-dpr1.jpg`](gameplay/presentation-2x-1280x720-dpr1.jpg),
and
[`gameplay/presentation-3x-1920x1080-dpr1.jpg`](gameplay/presentation-3x-1920x1080-dpr1.jpg).
The `production-art/` directory contains lossless normal, grayscale,
protanopia, deuteranopia, and tritanopia family sheets, with separate
pivot/opaque-bound sheets where geometry applies.

## Hard-gate results

### Native read and category separation

- Three independent 500 ms reviews scored 120/120 player-location samples and
  116/120 category samples. Every reviewer reached at least 95% in both modes.
- Each counted packet covers four MAX360 seeds, two motion offsets, normal,
  grayscale, and three color-vision simulations. Category samples are balanced
  across enemy, friendly projectile, XP, music note, weapon reward, and
  decorative effect.
- The exact protocol, results, and preserved failed iterations are recorded in
  [`../clarity/README.md`](../clarity/README.md).

### Motion, scale, and presentation

- Six timed running-game frames show stable ground pivots and integer-crisp
  camera travel.
- Automated animation checks pass all 21 mappings; the maximum ordinary
  solid-area change is 8.12%, below the 10% limit.
- Production sprites render at integer scale `2` or mirrored `-2` under the
  shared 0.5 world projection. The viewport check covers supported scale and
  letterbox behavior; the three DPR-1 captures prove exact native 1×, 2×, and
  3× presentation.

### Collision and attack honesty

- The mixed overlay and individual attack overlays place simulation geometry
  inside visible bodies and on visible damaging fronts. Larger decorative
  extremities remain conservative, player-favoring overhangs.
- The deterministic edge audit covers 144 contacts and reports zero apparent
  false hits and zero apparent false misses.
- Pickup, collection, magnet, and opening-pedestal interaction geometry are
  exposed by the same debug layer used for review.

### UI and accessibility

- HUD, focus, selected, warning, disabled, reward, shop, and Sandbox states use
  shape, frame, and value cues in addition to semantic color.
- Automated UI contrast and viewport checks pass. Normal, grayscale, and all
  three color-vision boards retain the player, threat, reward, and active
  boundary hierarchy.

### Performance and pipeline

- The matched five-minute MAX360 run records 120.5 FPS median and 97.8 FPS 1%
  low, no median regression, and a 60.71% atlas-memory reduction. See
  [`../performance/README.md`](../performance/README.md).
- Native-art verification passes hard alpha, transparent RGB, palette, color
  budget, margin, atlas separation, determinism, complete manifest coverage,
  and a maximum page size below 2048 × 2048.

## Final independent decision

| Release-rubric category | Alder | Cedar |
| --- | ---: | ---: |
| Coherent, intentional pixel-art game | 9 | 9 |
| Player immediately distinguishable | 9 | 9 |
| Gameplay categories visually distinct | 9 | 9 |
| UI readable and consistent | 8 | 8 |
| Unified sprites, effects, palette, animation, and scale | 9 | 9 |
| Dense combat readable — hard gate | 8 | 8 |
| Bodies and attack boundaries honest — hard gate | 8 | 9 |

Both fresh critics scored every category at least 8/10 and reported no high-
or medium-severity finding. Their complete evidence citations, independence
statements, low-severity notes, and the unavailable live-browser limitation
are recorded in
[`../phase7/final-critic-alder.md`](../phase7/final-critic-alder.md) and
[`../phase7/final-critic-cedar.md`](../phase7/final-critic-cedar.md).

The primary agent exercised the running candidate throughout integration and
again after fallback removal. The final critics independently reviewed the
complete frozen output of that real build; the in-app Browser backend was
unavailable when they attempted to add a second live interaction run. This is
recorded as review coverage, not hidden or treated as a visual defect.

Decision: **PASS.** Phase 4 and the final visual release rubric are closed for
the Arcade Reliquary candidate. User gate 2 remains pending.
