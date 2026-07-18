# Pixel-Art Overhaul: Autonomous Production Workflow

> **Workflow status at handoff:** no phase in this document has been executed.
> The next primary agent must begin at Phase 0, proceed autonomously through
> the three art-direction candidates, and pause for the player only at User
> gate 1. The current atlas is the audited baseline, not the target.

## Purpose

This document is the handoff contract for replacing Loop Survivors' current
visual implementation with coherent, readable, genuine pixel art. The next
primary agent owns the entire workflow: art production, engineering,
integration, playtesting, critique, iteration, verification, documentation,
and pull-request preparation.

The player is not the art director, pixel artist, or QA tester. Involve the
player at exactly two decision gates:

1. **Art-direction selection** — the player picks one of three finished
   direction prototypes from a controlled comparison packet.
2. **Final approval** — the player reviews the finished playable result and
   either approves it or gives final corrective feedback.

Do not ask the player to approve individual sprites, palettes, animations,
hitboxes, effects, enemy families, UI screens, or intermediate builds. Do not
ask the player to perform manual tests. Between the two gates, the agent team
must make and verify every production decision autonomously.

Informational progress updates are acceptable, but they must not contain a
question or require a response. If an implementation choice is ambiguous, use
`docs/plan.md`, the selected direction, the pixel-art bible, instrumented game
evidence, and independent reviewers to resolve it. If final approval is
withheld, treat the player's final feedback as the new acceptance criteria,
make the corrections autonomously, and return only when another complete
final candidate is ready. Corrective feedback and resubmission are iterations
inside the still-open final-approval gate, not new decision gates.

## Product contract

The visual overhaul must preserve the game's existing design pillars and
mechanical variety. It covers every visual surface that belongs to the game:

- player character and animation;
- all enemy identities, including ordinary enemies, special behaviors,
  Amped variants, and Headliners;
- every normal weapon and every evolved weapon;
- projectiles, melee shapes, beams, zones, orbiters, warning shapes, impacts,
  explosions, deaths, collection effects, and particles;
- experience, music-note currency, starting-weapon pedestals, level-up rewards,
  Encore Cases, healing, and rare pickups;
- arena floor, environmental props, existing collision-bearing obstacles,
  landmarks, and title art;
- HUD icons, passive icons, shop icons, menus, panels, meters, labels, and
  Sandbox presentation.

The result must still be understandable when muted, because visual combat
clarity is a game pillar. Enemy behaviors and variety must not be reduced to
make the art task easier. Existing names, stats, movement, attacks, and spawn
roles remain the gameplay contract unless a collision correction is necessary
to make the visual and physical body agree.

Do not invent blocking terrain as part of the visual overhaul. Scenery that is
currently decorative remains non-colliding. Art for obstacles and footprints
applies only to systems that already have collision; adding a new navigation
or blocking mechanic requires separate design authorization.

## Baseline diagnosis

Treat the current generated boards as concept references, not production
masters. The previous independent audit found the current implementation unfit
to ship:

- large AI-generated boards are cropped into approximate subjects, resized to
  arbitrary dimensions, and placed in 96-pixel atlas cells;
- many frames contain almost one unique color per opaque pixel, producing
  raster noise rather than deliberate pixel clusters;
- actors, attacks, and UI icons are displayed with fractional scales such as
  `0.25`, `0.34`, and `0.5`; nearest-neighbor sampling cannot make fractional
  scaling pixel-correct;
- collision radii and foot offsets still inherit legacy frame measurements and
  often disagree with the new visible bodies;
- the renderer does not consistently use the same ground pivot as simulation;
- some multi-creature pictures represent one circular collider, so the image
  makes a false promise about what can be hit;
- weapon art often fails to reveal the true damaging area, especially for
  wide Bass, Chord, Kick, and Clap attacks;
- the player, enemies, projectiles, currency, experience, and effects collapse
  into one noisy value-and-color range under density;
- the second actor frame is often a one-pixel vertical lift rather than a
  meaningful walk, flap, crawl, or hover animation;
- UI icons are large noisy images reduced to 24 pixels and do not share a
  disciplined icon grammar with the game world.

The earlier visual audit scored the implementation at roughly 3/10 for a
coherent pixel-art look, 1/10 for hitbox honesty, and 2/10 for dense-combat
readability. Those scores are the baseline to beat, not acceptable targets.

Keep the parts of the existing pipeline that are useful: deterministic atlas
generation, hard-alpha checks, transparent-pixel normalization, mapping
validation, nearest-neighbor texture configuration, source/license records,
and the Sandbox stress tools. Replace the production art, arbitrary resizing,
fake animation, fractional runtime scales, and legacy visual-to-collision
assumptions.

## Operating model

The primary agent is the producer and final decision-maker between user gates.
Use sub-agents for independent work where practical, with clearly separated
file ownership:

- **Pixel-art director:** develops candidate directions, the chosen visual
  language, silhouettes, palettes, and production sprites.
- **Gameplay-clarity engineer:** owns pivots, visual bounds, hurtboxes, attack
  boundaries, renderer scale, camera behavior, and debug overlays.
- **Independent visual critic:** reviews captures without relying on the
  authors' rationale and scores the result against the rubric below.
- **QA agent:** runs automated checks, browser playtests, motion captures,
  density scenarios, and regression verification.

The critic must not be the only agent that produced the art. A producer may
explain intended behavior only after the critic has recorded an initial blind
read. The primary agent resolves disagreements using in-game evidence, not
personal reassurance.

Before editing, read `docs/plan.md`, inspect the current worktree and preserve
unrelated changes. Record a baseline build, screenshots, short gameplay
capture, current asset inventory, current renderer settings, and current
collision metadata. Never overwrite the sole copy of an existing source
asset. Keep the old presentation available behind a temporary development-only
`artMode` switch until the replacement passes all internal QA gates. Remove
the switch and obsolete runtime art before presenting the clean replacement at
the final-approval gate.

## Non-negotiable pixel-art rules

### Native grid and display

- Author production sprites on their final native pixel grid. A sprite drawn
  for 24 × 28 pixels is stored as 24 × 28 meaningful pixels, not as a reduced
  crop from a 1024-pixel illustration.
- Use a fixed 640 × 360 logical game canvas. At device-pixel ratio 1, familiar
  presentations are 1× at 640 × 360, 2× at 1280 × 720, 3× at 1920 × 1080, and
  4× at 2560 × 1440. Letterbox instead of stretching.
- Implement one shared `ViewportTransform` used by Pixi, the DOM HUD, input,
  debug overlays, and capture tools. It owns logical size, integer backing-pixel
  scale, CSS display size, device-pixel ratio, and letterbox offsets. No system
  may independently calculate canvas scale or origin.
- Choose the largest integer number of physical backing pixels per logical
  pixel that fits the available landscape viewport while keeping at least one
  CSS pixel per logical pixel. Device-pixel ratio affects the backing/CSS
  conversion, not simulation coordinates. Verify DPR 1, 1.25, 1.5, 2, and 3.
- Convert pointer, touch, and virtual-joystick coordinates through the inverse
  shared transform before they reach gameplay. Apply the same transform to DOM
  panel placement and debug/collision overlays so art and input cannot drift.
- A viewport that cannot fit the 640 × 360 logical canvas at the minimum
  readable scale, or is portrait when the game cannot present a usable
  landscape layout, must show a styled rotate/resize notice instead of running
  fractionally scaled combat. This is an application state, not a user design
  checkpoint.
- Keep presentation coordinates separate from simulation-world coordinates.
  Introduce one shared `WorldProjection` between the existing camera/world and
  the 640 × 360 logical canvas. Preserve the current approximately 1280 × 720
  visible world extent by starting with `worldToLogical = 0.5`—two simulation
  world units per logical art pixel—and confirm the exact baseline extent
  during Phase 0 before locking it in the bible.
- Do not initialize simulation `worldW`/`worldH`, spawn distances, movement
  speeds, bounce boundaries, attack radii, or scenery spacing from the new
  logical canvas dimensions. A visual-resolution change must not halve the
  arena or re-time combat. If a comprehensive coordinate migration is ever
  chosen instead, it must preserve all ratios and pass the balance-comparison
  gates; the fixed projection is the preferred path.
- Input conversion is two-stage: invert `ViewportTransform` from client space
  to logical screen space, then invert `WorldProjection` plus the camera to
  obtain simulation-world coordinates. Rendering and debug overlays use those
  same transforms in the forward direction.
- Every metadata field names its coordinate space. Sprite frame bounds,
  opaque bounds, and art pivots use native logical pixels; hurtboxes, movement,
  attack geometry, footprints, and world positions use simulation units;
  client rectangles use CSS pixels. Never compare or add values from different
  spaces without the shared conversion.
- Simulation may retain subpixel precision, but the final camera projection
  and sprite placement must snap to logical pixels. Do not quantize simulation
  state itself.
- Render gameplay sprites at 1× native size or another whole-number scale.
  Remove fractional actor, projectile, effect, and UI scales.
- Force nearest-neighbor sampling for every pixel-art texture and
  `image-rendering: pixelated` for browser-rendered pixel assets. Do not use
  bilinear filtering, antialiasing, arbitrary raster skew, or smooth CSS
  scaling.
- Avoid free rotation of important asymmetrical pixel art. Prefer authored
  direction frames or a small consistent set of angles. If rotation is used
  for a simple projectile, inspect every used angle in motion.

Use these initial on-screen size bands unless the chosen direction proves a
small adjustment is necessary:

| Category | Native on-screen size |
| --- | --- |
| Player | 30–34 pixels tall |
| Small enemy | 16–20 pixels across/tall |
| Normal enemy | 22–30 pixels |
| Elite or large enemy | 36–44 pixels |
| Boss or Headliner | 48–64 pixels |
| XP, notes, and small pickups | 8–14 pixels |

The size hierarchy is semantic. Do not make weak enemies appear boss-sized or
shrink dangerous attacks until their threat is invisible.

### Pixel construction

- Use deliberate clusters of pixels, controlled stair-step diagonals, readable
  negative space, and a limited palette. Do not mistake visible square pixels
  for intentional pixel art.
- Establish one master palette after art-direction selection. A normal actor
  should usually use 6–12 colors; complex bosses may use up to 24; a compact
  UI icon should usually use 3–8. Exceptions require a clear readability
  reason and review.
- Use one outline policy, one light direction, one material vocabulary, and
  one contrast hierarchy across the whole game.
- Production sprites use hard transparent edges. Fully transparent pixels must
  have RGBA `(0, 0, 0, 0)`. Runtime glow layers may use alpha, but the readable
  core underneath must remain a crisp pixel shape.
- Do not mix source pixel densities. A one-pixel highlight, outline, or gap
  should represent the same visual unit across actors of similar scale.
- Design silhouettes before interior detail. Every enemy family must remain
  identifiable as a solid one-color silhouette and at gameplay size.
- Animation must express behavior: planted steps, weight shift, wing beats,
  crawl phases, anticipation, recoil, impact, or death. Do not manufacture an
  animation by shifting most of an idle frame by one pixel.
- Keep planted feet or the intended hover point stable between frames unless
  actual vertical motion is part of the behavior.

### Semantic separation

The chosen palette may vary, but the category grammar may not:

- the player gets a unique focal contrast and outline/rim treatment not reused
  by ordinary enemies or routine effects;
- hostile bodies share a recognizable hostile family while enemy roles retain
  different silhouettes and motion signatures;
- player attacks keep weapon-specific identity colors, but damaging cores are
  brighter and more stable than decorative particles;
- experience, music notes, weapon choices, Encore Cases, healing, and rare
  utility pickups each have unique silhouette-plus-color identities;
- danger cannot be communicated by color alone; pair it with shape, outline,
  animation, or pattern;
- floor detail stays below actors in contrast and spatial frequency;
- decorative VFX may support an attack but never cover its readable boundary,
  the player, or an urgent pickup for a sustained period;
- damage numbers and labels must not become the brightest or most numerous
  layer during horde density.

### UI and typography

- Keep functional text live and localizable; never bake item descriptions,
  prices, controls, or status labels into raster art.
- Use the DOM HUD as one overlay coordinated by `ViewportTransform`. Panels,
  icons, meters, focus outlines, and spacing follow the logical pixel grid even
  though the text remains accessible browser text.
- A licensed pixel font may be used for decorative headings only when it has
  the needed characters and is displayed at an exact approved size. Body text
  uses one crisp, readable live-text family rather than a tiny bitmap font or
  a texture scaled to fit.
- Record the font license and provide a metrics-compatible fallback. Verify
  long item names, one-line descriptions, large numbers, and browser text zoom
  without clipping.
- Standard functional text must meet at least 4.5:1 contrast; large display
  text must meet at least 3:1. Controls keep visible keyboard focus and a
  minimum 44 × 44 CSS-pixel interactive target where the layout permits.
- Nine-slice pixel panels preserve corner pixels. Never stretch raster corners
  or fractionally scale icon sheets.

## Healthy use of AI-generated pixel art

AI image generation is allowed for exploration and reference, not as an
automatic production export. The required pipeline is:

1. Generate mood, costume, creature, palette, and composition concepts.
2. Select one canonical concept for each identity internally.
3. Reconstruct the sprite on its intended native grid, pixel by pixel or with
   native-grid tools, using the locked palette and cluster rules.
4. Remove noisy colors, accidental texture, ambiguous limbs, tangencies,
   inconsistent outlines, false highlights, and background contamination.
5. Test the silhouette, one-color mask, grayscale value grouping, and actual
   gameplay-size read before adding animation.
6. Derive animation frames from the cleaned canonical sprite while preserving
   pivots and volume.
7. Export transparent PNG frames, pack them deterministically, and verify them
   in-engine.

In this document, “manual reconstruction” means deliberate production work by
the agent team or its pixel-editing tools. It does not mean asking the player
to draw, clean, or review sprites.

Never ship an AI board by chroma-keying, approximate cell cropping, and nearest
resizing. Nearest-neighbor reduction preserves interpolation edges; it does not
invent deliberate clusters, a limited palette, coherent anatomy, good
silhouettes, or animation. Retain generated concepts outside the runtime asset
path and label them as reference-only.

For every generated or third-party source, record provenance in
`public/art/pixel/SOURCE_AND_LICENSE.md`: creator or generator, model/tool when
known, date, prompt or source reference, transformations, license, and whether
the file is concept-only or shipped. Prefer original generated-and-rebuilt art.
If third-party assets are used, they must be free and licensed for this use; do
not purchase anything and do not rely on unattributed search results.

## The pixel-art bible

After the player chooses a direction, create or update
`docs/pixel-art-bible.md`. This becomes the binding production reference and
must contain:

- logical resolution, presentation scales, camera snapping, and sprite size
  bands;
- full master palette with named functional roles;
- outline, interior-line, shading, highlight, material, and light-direction
  rules;
- camera perspective, ground plane, actor anchor, and environmental scale;
- player, hostile, neutral, pickup, currency, attack, danger, and UI category
  grammar;
- family-by-family silhouette sheets for the full enemy roster;
- weapon identity colors and rules for normal/evolved differentiation;
- animation timing, planted-pixel, smear, hit-flash, and death-effect rules;
- UI grid, icon sizes, borders, typography, spacing, meter, focus, hover, and
  disabled-state rules;
- atlas padding, frame naming, pivot metadata, and export rules;
- examples of approved treatment and explicit anti-examples from the rejected
  implementation.

Any production asset that violates the bible must be corrected or the bible
must be deliberately amended with a recorded reason. Do not silently accumulate
exceptions.

## Collision and attack honesty

Visual truth is part of the art task. Before mass-producing sprites, make the
Sandbox capable of showing:

- actor hurtboxes and contact-damage bodies;
- actor ground pivots and renderer anchors;
- opaque visual bounds and intended hittable mass;
- projectile collision cores and pierce/bounce state;
- the true Kick and Clap attack shapes;
- the true Bass and Chord damaging boundaries;
- pickup, magnet, and collection radii;
- obstacle collision and reachable starting-weapon pickup positions.

Centralize body dimensions, pivots, visual offsets, and render metadata in the
new asset/actor definitions. New art must not inherit dimensions from legacy
`MAD_FOREST_FRAMES` or another unrelated sheet. The renderer and simulation
must consume the same anchor metadata.

An actor hurtbox should sit inside the visible solid body and agree with its
ground position. A sprite depicting three separate creatures must not behave
as one unexplained circle; either draw one truthful creature, represent the
group with explicit bodies, or give the swarm a clearly continuous hittable
mass. A damaging weapon area must have a stable readable core or border that
matches the actual collision shape. Decorative glow may extend outside it but
must be visibly secondary.

Keep the overlays development-only. They are mandatory QA instruments, not
shipping decoration.

Collision cleanup must not silently rebalance the game. Before changing body
metadata, record deterministic before/after measurements for contact reach,
crowd packing, enemy separation, projectile hit rate, time to first contact,
kills, and damage received. Prefer drawing a truthful silhouette around the
existing effective body. When a misleading legacy collider must change, tune
the surrounding parameters only as necessary to preserve the enemy's intended
role, document the unavoidable difference, and add a regression scenario.
Aggregate results in fixed comparison scenes should remain within 5% of the
baseline where visual honesty does not explicitly require a larger change.

### Quantitative clarity gates

The following are internal acceptance tests, not tasks for the player:

- blind reviewers must locate the player within 500 milliseconds in at least
  95% of sampled maximum-density frames;
- actor hurtboxes remain inside the perceived solid body in every animation
  frame, excluding clearly decorative extremities;
- a projectile collider is no larger than its obvious bright collision core;
- a damaging area boundary matches its simulation boundary within one native
  logical pixel unless a documented forgiving-player exception makes the
  visible warning larger than the damage;
- ordinary idle/walk animation frames vary by less than 10% in visible solid
  area unless deliberate squash/stretch is documented;
- the planted ground pivot drifts no more than one native pixel across an
  ordinary animation;
- review at least 100 deterministic edge-contact cases for apparent false hits
  and false misses;
- pickups remain distinct from particles in at least 95% of sampled stress
  frames, and hostile cores are never fully hidden by friendly VFX;
- damage text is pooled, capped, and aggregated so it never forms a continuous
  wall over live combat.

Make the 500-millisecond requirement executable. Add a local visual-read test
page/tool with the following fixed protocol:

1. Generate a 40-frame player-location packet from at least four recorded
   maximum-density seeds and fixed time offsets. Include the normal palette,
   grayscale, and each supported color-vision simulation. Store the true
   player screen coordinate and visual body radius in a hidden answer key.
2. Randomize the packet order separately for each reviewer. Show a frame for
   exactly 500 milliseconds, replace it with a neutral mask, then ask the
   reviewer to click the remembered player position. Count a hit only when the
   click lies inside the recorded visual body plus a two-logical-pixel
   tolerance.
3. Run a second randomized 40-sample category packet. After the same timed
   reveal, require classification of the highlighted target as enemy,
   friendly projectile, XP, music note, weapon/reward pickup, or decorative
   effect. Use balanced classes and crops taken from real stress frames.
4. Use at least three independent reviewers who did not author the tested art.
   Each reviewer must reach 95% on player location and 95% on category
   classification. The player is never one of these reviewers.
5. Commit machine-readable results containing commit hash, capture command,
   seeds, frame offsets, transform settings, randomized order, per-sample
   click distance or answer, reviewer identity, and aggregate score. Preserve
   failed results alongside the asset revision that fixed them; do not replace
   evidence with a prose claim.

## End-to-end workflow

### Phase 0 — Inventory and baseline

1. Read `docs/plan.md` and the field guide.
2. Inspect the full asset inventory, atlas builder, renderer, UI, collision
   definitions, animation selection, Sandbox, and current worktree changes.
3. Generate and commit an asset-coverage manifest from the live code catalogs,
   rather than maintaining a hand-written wish list. It must enumerate every
   enemy ID and variant/state, all nine normal and evolved weapons and their
   behavior states, every passive/status/action icon, every pickup and VFX
   event, environment pieces, and every UI surface. Verification must compare
   shipped mappings against this manifest and fail on missing or orphaned IDs.
4. Run `npm run verify` and `npm run build` before changing the art when the
   baseline permits it.
5. Capture title, opening choice, early combat, mixed enemy families, a boss,
   all weapon families, all evolutions, pickups, menus, shop, and maximum-density
   Sandbox scenes.
6. Record current frame sizes, runtime scales, pivots, collision bodies,
   palette/noise statistics, and known mismatches.

### Phase 1 — Build visual-truth tooling first

Implement the Sandbox overlays listed above, a deterministic maximum-density
scene, a grayscale capture mode, and fixed capture presets. Fix integer canvas
presentation, final render snapping, and metadata ownership before judging
replacement sprites. This ensures every later art review compares the image to
the real game rules.

### Phase 2 — Prepare three art directions

Create exactly three cohesive candidates. Do not show a loose mood board. Each
candidate must depict the same controlled truth scene so the comparison is
about direction rather than content:

- the player;
- one small flying enemy;
- one normal humanoid enemy;
- one heavy enemy;
- one boss;
- XP, a music note, a rare pickup, and a starting-weapon pedestal;
- one small projectile, one melee strike, one wide area attack, and one impact;
- representative floor tile and prop;
- one HUD meter, one passive icon, and one reward card.

For every candidate provide:

- an in-engine screenshot at actual gameplay size;
- the same scene enlarged exactly 4× with nearest-neighbor scaling;
- a one-color silhouette sheet;
- a grayscale version;
- a hitbox/pivot overlay;
- a crowded-combat mockup using repeated assets;
- a short name and two-sentence explanation in plain language;
- a compact tradeoff note covering readability, production cost, and mood.

The primary agent must eliminate candidates that fail basic gameplay clarity
before presenting them. The three shown choices must all be viable.

### User gate 1 — Art-direction selection

This is the first and only pre-production user decision. Present the three
candidate packets side by side and recommend one. Ask only which direction the
player wants. Do not ask them to choose palettes, sprite sizes, outlines,
lighting, individual designs, or technical options.

Once the player selects a direction, lock it in the pixel-art bible. From this
point through the finished candidate, continue without asking for another user
decision.

### Phase 3 — Vertical slice

Produce a complete in-game slice before making the entire catalog:

- player idle, movement, damage, and death;
- Dusk Moth, Plague Husk, Void Golem, and Crypt Spider or their current
  gameplay-equivalent identities;
- one representative Headliner;
- XP, music note, weapon pedestal, Encore Case, and rare utility pickup;
- normal and evolved examples for Kick, Hi-hat, Bass, and Chord;
- essential hit, death, collection, warning, and explosion effects;
- representative floor, obstacle, and environment props;
- one HUD cluster, level-up reward, and shop offer.

Reconstruct these assets at native resolution, integrate them with shared
pivots, and test them in motion. Bass and other wide attacks require a crisp
truthful boundary without a large opaque or black slab.

### Phase 4 — Internal vertical-slice gate

The player is not involved here. The primary agent and at least one independent
critic review:

- empty arena;
- opening weapon selection;
- early combat;
- mixed flying, humanoid, heavy, and boss combat;
- maximum supported density;
- all debug overlays;
- grayscale and common color-vision-deficiency simulations;
- slow diagonal camera and actor motion;
- 1× native, 2×, and 3× presentation.

Do not expand production until the player, each enemy role, every pickup type,
and every sampled attack boundary can be identified quickly without labels.
Iterate autonomously until this slice passes the release rubric.

### Phase 5 — Full asset production by family

Expand in coherent batches so each batch can be judged in context:

1. flying and swarm enemies;
2. humanoid and undead enemies;
3. golems, plants, fixtures, and special-behavior enemies;
4. bosses, Headliners, and Amped treatments;
5. all normal weapons;
6. all evolved weapons;
7. pickups, currency, rewards, and particles;
8. environment, floor, props, obstacles, and title art;
9. HUD, menus, shop, reward cards, passive icons, and Sandbox UI.

For each batch: author, integrate, run deterministic scenes, capture at actual
size, run an independent critique, fix significant findings, and only then
start the next batch. Reviews are internal; never turn batch approval into a
user checkpoint.

Normal and evolved weapons must differ in silhouette, motion, effect structure,
and readable intensity—not only hue or size. Enemy families may share anatomy
or palette ramps, but every gameplay role needs a distinct outer contour and
movement signature.

### Phase 6 — Pipeline and automated release checks

Refactor `scripts/build-pixel-art.mjs` so it packs native production frames
rather than extracting subjects from large concept boards. Preserve or add
checks for:

- valid PNG format and dimensions;
- alpha values allowed by the bible;
- zero RGB under fully transparent pixels;
- no matte, halo, or chroma-key residue;
- allowed master palette and per-sprite color-budget warnings;
- no empty required frame and no duplicate placeholder frame;
- atlas bounds, non-overlap, and the correct separation/padding policy;
- complete gameplay/UI mappings and stable frame names;
- exact coverage of the generated live-catalog asset manifest;
- declared pivot and visual-bound metadata for every actor;
- consistent planted pixels across animation frames;
- no runtime fractional scale for pixel-art display objects;
- deterministic atlas output;
- deterministic visual stress-scene configuration.

Color count and edge-noise metrics are warning signals, not substitutes for
art review. A frame with thousands of nearly unique colors must fail. A frame
that technically uses twelve colors can still fail if its silhouette or
clusters are poor.

Untrimmed actors, pickups, projectiles, and icons keep at least two fully
transparent pixels between visible art and their logical frame edge, plus at
least two pixels of atlas separation; do not extrude opaque silhouette pixels
into that transparent boundary. Fully opaque tiles and nine-slice panel pieces
may duplicate their edge colors into padding outside the declared logical
frame to prevent seams. The builder must verify the appropriate rule for each
asset class.

### Performance budget

The visual overhaul must remain practical at the endless director's 360-enemy
density. Use a seeded five-minute maximum-density Sandbox run at 1280 × 720 as
the standard performance test, and record the reference machine, browser, DPR,
median frame rate, 1% low frame rate, draw calls, texture memory, and transient
object count.

- Target 60 FPS median and at least 45 FPS for the 1% low on the reference
  machine, with no more than a 10% regression from the pre-overhaul baseline
  under the same seed and settings.
- Keep atlas pages at or below 2048 × 2048 unless a measured platform check
  proves a larger page is necessary and safe. Keep the core world in as few
  atlas pages and blend-mode groups as practical.
- Batch by atlas and visual layer; target no more than 12 Pixi draw calls for
  the core world in the standard stress scene, excluding DOM text. Record and
  justify any exception.
- Never create or upload textures in the combat hot path. Pool transient
  projectiles, impacts, particles, labels, and death effects, and cap purely
  decorative instances before they threaten gameplay timing.
- Inspect the full five-minute run for allocation spikes, texture churn,
  animation update cost, and long-frame clusters. Attractive art that causes
  input lag or sustained frame loss does not pass.

### Phase 7 — Motion QA and final independent critique

Run the real game and inspect, not just static atlas files. Test:

- every opening-weapon pickup and selection effect;
- all enemy types alone and in their intended wave combinations;
- all normal weapons at every tier;
- all evolved weapons;
- XP, notes, shop/reward pickups, Encore Cases, healing, and magnet collection;
- contact damage, projectile hits, pierce, bounce, wide areas, death,
  explosions, and dense particle overlap;
- title, HUD, pause, level-up, shop, death summary, and Sandbox;
- multiple viewport sizes and device pixel ratios;
- sustained maximum-density combat in motion.

Use at least two fresh independent review passes at the final stage. Reviewers
must score each item from 1–10 and explain concrete problems:

1. Does the game look like a coherent, intentional pixel-art game?
2. Is the player immediately distinguishable from enemies?
3. Are enemy roles, projectiles, XP, notes, weapon pickups, and effects
   visually distinct?
4. Is the UI readable and consistent with the pixel-art style?
5. Do sprites, effects, colors, animation, and pixel scale feel like one art
   direction?
6. Is combat readable with many enemies and effects on screen?
7. Do visible bodies and attack boundaries honestly match hitboxes?

Release requires every category to score at least 8/10 from each final
reviewer. Dense-combat readability and hitbox honesty are hard gates, not
averages that can be offset by attractive title art. Fix every high-severity
finding and repeat the affected review. Store the final critique and response
in a concise repository document so later agents can understand why decisions
were made.

### Phase 8 — Final verification and cleanup

Run at minimum:

```sh
npm run verify
npm run build
```

Also run any new pixel-art verification and capture commands added by the
overhaul. Confirm in a repository-wide search that runtime code no longer uses
old source boards, old visual frame dimensions, fractional sprite scales,
placeholder vector/Graphics art for covered assets, or obsolete art-mode
references.

Update `docs/plan.md`, `docs/field-guide.md`, `docs/art-sources.md`,
`public/art/pixel/SOURCE_AND_LICENSE.md`, and the pixel-art bible to describe
the actual shipped implementation. Remove old runtime assets only after the
new mode passes all internal QA gates, and remove the temporary `artMode`
before User gate 2. Preserve useful concepts only in a clearly labeled
reference directory that is unreachable by runtime code. The clean replacement
build—not a fallback comparison mode—is the final-approval candidate.

Prepare a clean commit series and a ready pull request. The PR description
must include the asset inventory, renderer/collision changes, provenance,
verification commands, reviewer scores, improvements made after critique, and
remaining limitations.

### User gate 2 — Final approval

This is the player's second and final involvement. Present one complete
candidate, not a menu of unfinished alternatives. The approval packet must
contain:

- a short gameplay video or equivalent sequence of representative captures;
- before/after views at actual gameplay size;
- opening choice, early combat, mixed combat, boss, and maximum-density views;
- one hitbox-overlay view proving visual/physical agreement;
- representative HUD, shop, level-up, and Sandbox views;
- the final independent-review scores;
- tests and verification performed;
- the ready PR link and a concise list of any honest remaining limitations.

Ask only for final approval. If approved, perform any remaining non-design PR
administration without creating another user gate. If rejected, apply the
player's feedback autonomously, repeat all affected checks and critiques, and
return with a new complete approval packet.

## Definition of done

The overhaul is done only when all of the following are true:

- the player has selected one of three controlled art directions;
- the pixel-art bible describes the selected direction and matches the game;
- all production art is authored or reconstructed at native resolution;
- every enemy, weapon, evolution, pickup, effect, environment surface, and
  relevant UI element has coherent final art;
- no important sprite relies on fractional scaling or smooth filtering;
- the player and gameplay categories remain clear under maximum density;
- visual bodies, ground pivots, hitboxes, and attack boundaries agree;
- transparent PNGs have no halo, matte, broken alpha, or background residue;
- animation remains planted and readable in motion;
- the Sandbox covers the full roster, full build, evolutions, pickups, effects,
  overlays, and deterministic stress scenes;
- generated live-catalog coverage and shipped visual mappings match exactly;
- the shared viewport transform keeps Pixi, DOM UI, input, overlays, and
  captures aligned at every supported size and device-pixel ratio;
- the sustained maximum-density performance budget passes without hot-path
  texture creation or uncontrolled decorative allocations;
- automated verification and production build pass;
- two independent final reviewers score every rubric category at least 8/10;
- obsolete runtime art and the temporary development `artMode` are absent from
  the final candidate;
- documentation, provenance, and licenses are complete;
- the final playable candidate and ready PR are presented for the player's
  single final approval, and the player grants that approval.

## Research foundation

The process above incorporates the prior research and review. Useful primary
references for future agents:

- [Generative AI Game Jam case study, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025W/CV2/papers/Spjut_A_Generative_AI_Game_Jam_Case_Study_from_October_2024_CVPRW_2025_paper.pdf)
- [Pedro Medeiros: Consistency](https://saint11.art/blog/consistency/)
- [Pedro Medeiros: Thoughts on Low Resolution](https://saint11.art/blog/thoughts_on_low_resolution/)
- [Pedro Medeiros: Cluster Sketching](https://saint11.art/pixel_art_articles/article2/)
- [Pedro Medeiros: Scaling](https://saint11.art/blog/scaling/)
- [Riot Games: Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/)
- [Riot Games VFX Style Guide](https://nexus.leagueoflegends.com/en-us/2017/10/dev-leagues-vfx-style-guide/)
- [PixiJS scale modes](https://pixijs.download/dev/docs/rendering.SCALE_MODE.html)
- [Godot integer-scaling guidance](https://docs.godotengine.org/en/latest/tutorials/rendering/multiple_resolutions.html)
- [Aseprite slices and pivots](https://www.aseprite.org/docs/slices/)
- [MDN 2D collision detection](https://developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection)
- [Xbox accessibility guidance for color](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/103)
- [TexturePacker padding and texture settings](https://www.codeandweb.com/texturepacker/documentation/texture-settings)
