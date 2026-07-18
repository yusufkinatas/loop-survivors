# Phase 4 internal vertical-slice review

Status: **review checklist/template; not yet a pass record**

This is an internal gate for the Arcade Reliquary vertical slice. The primary
agent and at least one independent critic must review the real running game.
Do not expand into full-catalog production until every hard gate passes. The
player is not asked to review this phase.

## Verified production-pipeline state

The following facts are automated pipeline evidence, not a Phase 4 visual pass:

- Arcade Reliquary is the selected direction, and
  `docs/pixel-art-bible.md` is its binding production contract.
- `art-src/pixel-production/arcade-reliquary.mjs` constructs production art
  directly on native logical grids. It has no raster dependency on the Gate 1
  concepts or candidate atlases.
- The generated live catalog contains 108 physical frame keys and 239 semantic
  requirements. Exact physical coverage is 72 gameplay, 20 UI, and 16
  environment frames, including 21 stable two-frame actor animation mappings.
- Every generated frame declares native size, integer pivot, measured opaque
  bounds, semantic tags, transparent margin, color budget, colors used, and a
  renderer scale of 1 logical screen pixel per native pixel. Grounded or
  hovering frames also declare their ground reference.
- Production verification enforces hard alpha, RGBA zero beneath transparency,
  the locked master palette, per-frame color budgets, at least two transparent
  edge pixels, at least two atlas-separation pixels, stable frame/animation
  identities, meaningful animation differences, and less than 10% ordinary
  animation solid-area change.
- Standalone output is native: the seamless floor is 16 × 16 pixels and the
  text-free title composition is 320 × 180 pixels.

These checks establish source, export, metadata, and catalog preconditions.
They do not establish browser composition, category readability, motion,
collision honesty, UI quality, performance, or independent-review scores; the
status above remains unchanged until the evidence matrix and hard gates below
are completed.

## Entry conditions

- [ ] `docs/pixel-art-bible.md` is current and the slice uses its palette,
  geometry, anchors, and category grammar.
- [ ] Player idle/move/damage/death are integrated.
- [ ] Dusk Moth, Plague Husk, Void Golem, Crypt Spider, and one Headliner are
  integrated with behavior-readable animation.
- [ ] XP, music note, weapon pedestal, Encore Case, and rare utility are live.
- [ ] Normal/evolved Kick, Hi-hat, Bass, and Chord examples are live.
- [ ] Hit, death, collection, warning, and explosion effects are live.
- [ ] Representative floor, solid or explicitly non-solid scenery, HUD cluster,
  reward card, and shop offer are live.
- [ ] Deterministic presets and debug overlays expose pivots, opaque bounds,
  bodies, attack geometry, pickup radii, and collection/magnet radii.
- [ ] Current verification/type/build commands pass before visual sign-off.

## Required evidence matrix

Capture each numbered scene in normal color at 1×, 2×, and 3×. Capture scenes
4–6 again in grayscale and protanopia, deuteranopia, and tritanopia simulation.
Record at least one slow-motion or 60 FPS clip for scenes 4, 6, and 7.

| ID | Scene | Must prove |
| --- | --- | --- |
| 01 | Empty arena | Floor/props stay quiet; perspective, integer pixels, and non-solid/solid reads are honest |
| 02 | Opening weapon selection | Every pedestal is reachable, icons are distinct, focus/hover/selected states agree |
| 03 | Early combat | Player, Dusk Moth, XP, notes, and first attack read immediately |
| 04 | Mixed combat | Flyer, humanoid, heavy, boss, Headliner, pickups, and sampled attacks separate without labels |
| 05 | Maximum supported density | Player and urgent danger remain visible; particles/text do not form a wall |
| 06 | Normal/evolved comparison | Kick, Hi-hat, Bass, and Chord evolutions differ by contour, motion, and structure, not only color/size |
| 07 | Slow diagonal motion | Camera snapping, planted pixels, authored directions, pivots, and animation remain stable in motion |
| 08 | Debug overlays | Bodies sit in solid mass and every damaging boundary agrees with simulation |
| 09 | UI surfaces | HUD, reward, shop, disabled state, keyboard focus, long text, and meter crops remain readable |

Recommended filenames:
`scene-{id}-{mode}-{scale}x.png` and `scene-{id}-motion-{scale}x.webm`, where
`mode` is `normal`, `gray`, `protanopia`, `deuteranopia`, or `tritanopia`.
Keep seed, game time, viewport, DPR, commit, and browser in `review-record.md`
beside the captures.

## Hard-gate checklist

### Native read and category separation

- [ ] At 1×, a reviewer locates the player within 500 ms in at least 95% of the
  maximum-density packet.
- [ ] Without labels, the reviewer identifies player, each sampled enemy role,
  XP, music-note currency, weapon pedestal, Encore Case, rare utility, healing,
  and each sampled attack boundary quickly.
- [ ] Dusk Moth, Plague Husk, Void Golem, Crypt Spider, and Headliner remain
  distinct as one-color silhouettes.
- [ ] Evolved weapons are not mistaken for their normal form or another weapon.
- [ ] Friendly VFX never fully hides a hostile core, the player, or an urgent
  pickup for a sustained interval.
- [ ] Damage text stays capped and never becomes the brightest continuous layer.

### Grayscale

- [ ] Player focal value and rim still separate from hostile bodies and attacks.
- [ ] Enemy roles remain distinguishable by contour and size, not hue.
- [ ] XP, currency, rare utility, healing, rewards, and particles retain unique
  silhouettes and value patterns.
- [ ] Active damage boundaries remain continuous and stronger than decoration.
- [ ] UI text hierarchy, meter fill, focus, selected, warning, and disabled
  states remain legible.

### Color-vision simulations

- [ ] Protanopia, deuteranopia, and tritanopia simulations preserve the player
  locate result and all sampled category reads.
- [ ] No warning depends only on magenta, violet, pink, cyan, orange, or gold;
  teeth, brackets, hatch, notches, or pulse direction carry the second cue.
- [ ] Bell attacks are not confused with currency; cyan attacks are not
  confused with XP; health is not confused with hostile accents.
- [ ] Focus, selected, warning, and disabled UI states remain distinct without
  their semantic color.

### Motion

- [ ] Slow diagonal camera travel shows no subpixel shimmer, uneven pixel width,
  seam, or DOM/Pixi drift.
- [ ] Final camera origin and screen shake land on integer logical pixels while
  simulation motion remains smooth.
- [ ] Planted or hover-ground pivots drift no more than one native pixel; rooted
  actors drift zero.
- [ ] Ordinary animation changes visible solid area by less than 10% unless a
  documented action deliberately exceeds it.
- [ ] Walk, flap, crawl, phase, shield, windup, dash, split, recoil, and death
  states communicate behavior rather than moving the whole idle sprite.
- [ ] Mirrored/authored direction frames keep lighting and anatomy coherent;
  any rotated simple projectile has clean clusters at every used angle.
- [ ] Smears last only their authored action frame and never replace the stable
  damaging boundary.
- [ ] Hit flash preserves outline/identity and death fragments never look like
  pickups.

### Collision and attack honesty

- [ ] Every actor hurtbox stays inside perceived solid mass in every reviewed
  frame, excluding explicitly decorative extremities.
- [ ] Projectile colliders are no larger than their obvious bright cores.
- [ ] Kick/Clap sector or strip, Bass/Chord area, evolved boundaries, and warning
  edges agree with debug geometry within one native logical pixel.
- [ ] Any larger player-favoring warning is documented; no damage extends beyond
  its visible warning.
- [ ] Swarms read as one continuous hittable mass or use explicit bodies.
- [ ] At least 100 deterministic edge-contact cases reveal no systematic false
  hit or false miss.
- [ ] Pickup/collection/magnet radii and opening-pedestal reach agree with the
  perceived interaction area.

### Presentation and UI

- [ ] 1× is crisp at 640 × 360; 2× and 3× are exact nearest-neighbor enlargements
  with correct letterboxing.
- [ ] Test DPR 1, 1.25, 1.5, 2, and 3 where available. Backing pixels remain
  whole and the unsupported-layout notice appears instead of fractional fit.
- [ ] No actor, effect, icon, panel corner, meter, or browser pixel asset uses a
  fractional runtime scale.
- [ ] Pixel-art DOM elements stay aligned with Pixi under resize, zoom, and
  letterbox offsets; input lands on the same logical position.
- [ ] Body text is live, unclipped, and at least 4.5:1 contrast; large display
  text is at least 3:1. Long names, large numbers, fallback fonts, and text zoom
  fit.
- [ ] Keyboard focus is continuously visible; hover, pressed, selected, warning,
  and disabled states do not move layout or rely on color alone.
- [ ] Interactive targets reach 44 × 44 CSS pixels where the layout permits.

## Scored rubric

Each reviewer scores every item 1–10 and cites a concrete frame/clip. **Every
score must be at least 8 from every reviewer.** Dense-combat readability and
hitbox honesty are hard gates and cannot be averaged away.

1. Coherent, intentional Arcade Reliquary pixel art.
2. Player immediately distinguishable from enemies.
3. Enemy roles, projectiles, XP, notes, weapon pickups, and effects distinct.
4. UI readable and consistent with the art direction.
5. Sprites, effects, palette, animation, and pixel scale feel unified.
6. Combat remains readable at maximum density.
7. Visible bodies and attack boundaries honestly match gameplay geometry.

## Decision record

Record for each reviewer: name/agent, independence, date, build/commit, presets,
scores, blocking findings, and evidence filenames. Then record one result:

- **PASS:** every checklist hard gate is checked, every score is 8+, and no
  high-severity finding remains. Phase 5 may begin.
- **REVISE:** list owners and affected assets/scenes, fix them, recapture the
  affected matrix, and repeat independent review. Do not begin Phase 5.

Assumptions for this checklist: the catalog and bible remain authoritative;
the reference density is the game's supported maximum (currently 360 enemies);
the three color-vision modes are review simulations; and this folder contains
review prep until completed evidence and scores are added.
