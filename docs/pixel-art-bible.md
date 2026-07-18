# Loop Survivors pixel-art bible

Status: **binding production reference**
Selected direction: **Arcade Reliquary**
Applies to: world art, effects, pickups, environment, HUD art, menus, rewards,
shop art, and Sandbox presentation

This document turns the approved Arcade Reliquary prototype into the production
contract. The prototype is a treatment reference, not a set of final runtime
sprites. Production assets must satisfy this bible, `docs/plan.md`, the live
catalog, and the shared collision/viewport metadata. When those sources appear
to disagree, preserve gameplay truth and amend this document deliberately; do
not accumulate a silent exception.

Normative words are intentional: **must** is a release requirement, **should**
is the default that needs a recorded reason to break, and **may** is optional.

## Direction in one paragraph

Arcade Reliquary is a supernatural crypt rendered as a cabinet-era arcade
game: chunky tokens, deep navy gaps, near-black contours, electric signal
colors, and relic shapes. The player is an orange-jacketed focal token. Hostile
shapes are weighty navy, magenta, and violet masses. Pickups are small, clean
symbols. The world should feel like a haunted reliquary first and electronic
machinery second; sarcophagi, crowns, runes, bells, bones, braziers, and carved
stone keep the arcade language from drifting into generic science fiction.

The construction shorthand is:

- upper-left block light;
- bold near-black contour, normally two native pixels on primary masses;
- stepped neon corner accents rather than soft glow-painted edges;
- square cores, triangular wings and attack heads, block limbs, and minimal
  interior marks;
- silhouette and value separation before surface detail.

## 1. Resolution, projection, and presentation

### Coordinate spaces

| Space | Contract |
| --- | --- |
| Native logical pixels | The authoring grid. One source pixel is one logical render pixel. Pivots and frame bounds use integers in this space. |
| Logical screen | Fixed at **640 × 360**. All Pixi world composition, pixel UI art, capture framing, and debug overlays meet here. |
| Simulation world | Fixed at **1280 × 720**. `WORLD_TO_LOGICAL` is **0.5**, so two simulation units equal one logical pixel. Simulation may retain subpixel precision. |
| Backing pixels | The 640 × 360 surface enlarged by a whole-number backing scale. Sampling is nearest-neighbor. |
| Browser CSS | Mapped only through `ViewportTransform`. DOM UI and input must use the same transform as Pixi. |

The standard presentation matrix is exact:

| Scale | Backing output |
| ---: | ---: |
| 1× | 640 × 360 |
| 2× | 1280 × 720 |
| 3× | 1920 × 1080 |
| 4× | 2560 × 1440 |

- Fit the largest whole-number backing scale and letterbox the remainder.
- Anchor the surface on whole physical pixels. Never stretch to fill and never
  use fractional texture, object, canvas, or CSS image scaling.
- Unsupported portrait or too-small layouts show the existing rotate/resize
  notice instead of degrading the pixel grid.
- Use nearest-neighbor sampling for every raster pixel asset and
  `image-rendering: pixelated` for browser-rendered pixel art. Antialiasing,
  bilinear sampling, arbitrary skew, and filtered rotation are forbidden.
- Project the camera container and screen shake to integer logical origins.
  World motion remains smooth in simulation; only the final render origin is
  snapped.
- Important asymmetrical art uses authored directions. Horizontal mirroring is
  allowed only when costume, handedness, lighting, text, and state remain true.
  Simple symmetric projectiles may rotate, but every used angle must survive a
  motion review without broken clusters.

### On-screen size hierarchy

Visible opaque bounds, not padded frame dimensions, determine size.

| Category | Visible native size | Binding note |
| --- | ---: | --- |
| Player | **34 px tall** | The selected prototype locks the player to the top of the approved 30–34 px band. |
| Small enemy | 16–20 px across/tall | Small must still have a readable hostile core. |
| Normal enemy | 22–30 px | The common crowd scale. |
| Elite or large enemy | 36–44 px | Wider or taller according to role, not uniformly enlarged. |
| Boss or authored Headliner | 48–64 px | Use a dedicated native sprite; do not fractionally scale an ordinary sprite. |
| XP, notes, and small pickups | 8–14 px | Rare utility is **13 px tall** in the selected prototype. |
| HUD/status icon | 12 or 16 px | Pick one declared size per slot; do not fit-to-box scale. |
| Weapon/passive icon | 20 px | Matches the approved prototype icon footprint. |
| Floor tile | 16 × 16 px | Seam-safe, low-contrast tile unit. |
| Small/normal environment prop | 12–24 / 24–40 px | Preserve actor priority. |
| Landmark or large prop | 48–80 px | Sparse, low-contrast, and honest about collision. |

Weak enemies must not appear boss-sized, and a large damaging boundary must
not be shrunk until its threat disappears. Size changes outside these bands
require a native-size scene, silhouette sheet, collision overlay, and a recorded
reason.

## 2. Master palette

Production core art uses the following named colors exactly. Do not introduce
near-duplicates to fake extra shading. Ordinary actors should use 6–12 colors,
bosses at most 24 colors including declared effect colors, and compact UI icons
3–8 colors. Since this master palette has 16 colors, a boss exceeding 16 needs
a reviewed, asset-specific extension recorded here before export.

| Name | Hex | Functional role | Restrictions |
| --- | --- | --- | --- |
| `void` | `#03070d` | Arena clear, deep cavities, large negative space | Never use as an opaque substitute for transparency. |
| `floor` | `#07111f` | Main ground and very dark prop planes | Must remain quieter than actors. |
| `floorDetail` | `#10264a` | Runes, cracks, tile variation, recessed panels | Use in sparse clusters; never make a full-screen high-frequency pattern. |
| `outline` | `#020307` | Primary exterior contour and deepest separations | Keep distinct from transparent pixels and `void`. |
| `shadow` | `#202238` | Dark material plane, cast/contact shadow, disabled UI | First common interior value. |
| `mid` | `#4b4e70` | Main neutral material plane and structural UI line | Do not let neutral props dominate by area plus contrast. |
| `light` | `#8d92b6` | Upper-left material plane, secondary text, focus support | Use as a plane, not scattered single-pixel noise. |
| `highlight` | `#f5f3ff` | Tiny specular blocks, readable cores, primary text | Rarest high value; routine particles must not flood the frame with it. |
| `accent` | `#ff31ad` | Hostile charge, supernatural accent, selected arcade chrome | Pair danger use with a shape or motion cue. |
| `focal` | `#20e4ff` | Player rim/corners, friendly core, active focus | A full focal contour is exclusive to the player. Other uses stay compact. |
| `danger` | `#a83aff` | Hostile energy, warning interiors, void magic | Never the only warning signal. |
| `attack` | `#ff8b18` | Player jacket and forceful friendly attacks | Enemies may use tiny reflected accents, never the jacket-plus-rim combination. |
| `xp` | `#2bdeff` | XP pickup bodies and XP meter fill | Close to `focal`; the XP diamond silhouette is mandatory. |
| `currency` | `#ffc33d` | Music-note currency, prices, Amped (powered-up) and Headliner (featured enhanced enemy) marks | Currency and Bell attacks must remain shape- and motion-distinct. |
| `health` | `#f23880` | Health pickup, health meter, damage-status accent | Do not use as a generic enemy recolor. |
| `panel` | `#111425` | Raised UI panel plane and quiet overlay backing | Pair with `outline` and a stepped structural border. |

### Value and signal discipline

- `outline`/`void` are the deepest values; `floor`/`panel` establish the dark
  field; `shadow`/`mid`/`light` describe form; `highlight` is the peak.
- A readable core remains visible without runtime glow. Glow may reinforce a
  core but cannot define it.
- Reserve broad `highlight` plus `focal` adjacency for the player and urgent
  interaction. Enemy peaks should be smaller and usually adjacent to `accent`
  or `danger`.
- In grayscale, player, hostile body, pickup, and damaging boundary must still
  separate by value and silhouette. Color is never the sole category marker.
- Runtime tinting may produce a brief hit flash or accessibility simulation.
  It must not replace authored palette variants or become a permanent asset
  color.

## 3. Pixel construction, light, and materials

### Contours and interior lines

- Primary actor masses use a two-pixel `outline` contour on cardinal runs.
  Stepped diagonals may narrow to one pixel at the step, but must reconnect to
  the two-pixel mass. Tiny 8–14 px pickups may use a one-pixel contour.
- Interior separations use one-pixel `outline` or `shadow` lines. They must
  explain overlap, a cavity, or a material boundary; decorative striping is
  not a reason.
- Use clean clusters: 2 × 2 blocks, short stair steps, purposeful notches, and
  controlled negative space. Remove isolated noise pixels unless they are a
  deliberate spark, eye, or specular point.
- An outside corner may carry one stepped signal-color block. Do not trace
  every edge in neon.
- A silhouette must read as a single-color mask before eyes, runes, cracks, or
  highlights are added.

### Light and shading

The global key light comes from the **upper left**.

- Upper and left-facing planes use `light`; lower and right-facing planes use
  `shadow`; the main plane uses `mid` or a role color.
- Highlights are block-shaped: normally a 1 × 2, 2 × 1, or 2 × 2 cluster.
  Avoid single-pixel glitter distributed across a surface.
- Use two or three readable value planes, not smooth ramps or dithered
  gradients. Dithering is allowed only as a sparse, reviewed material texture
  on large props, never on ordinary actors, attacks, or UI icons.
- Contact shadows sit down-right of the ground point, use `void` or `shadow`,
  and stay smaller/softer in contrast than the body. A shadow is decorative
  and never expands a hurtbox.
- Emissive pieces still retain an opaque, hard-edged core. A signal color may
  face the viewer independent of the key light, but its white peak remains
  upper-left biased.

### Material vocabulary

| Material | Cluster recipe | Typical palette | Avoid |
| --- | --- | --- | --- |
| Reliquary metal | Broad square plane, one hard bevel, two corner rivets at most | `outline`, `shadow`, `mid`, `light`, optional `currency` | Repeated tiny bolts or modern brushed-metal gradients |
| Crypt stone | Uneven stepped outer edge, one large crack or rune | `outline`, `floor`, `floorDetail`, `shadow`, `mid` | Uniform checker noise and bright floor-wide runes |
| Bone | Thin but connected ivory blocks with dark joint gaps | `outline`, `shadow`, `light`, `highlight` | One-pixel spaghetti limbs that vanish at 1× |
| Cloth/leather | One broad folded plane and one shadow notch | `outline`, `shadow`, role color, one light block | Soft gradients or a highlight on every fold |
| Moss/organic growth | Lopsided lobes and 2–3 clustered edge bites | stone ramp plus `accent` or `danger` sparingly | Random green-like noise; the master palette has no generic green |
| Neon glass/energy | Solid colored core, white upper-left chip, dark structural cradle | one signal color plus `highlight` and `outline` | Blur as the only body or a hollow collider core |
| Gold/currency | Rectangular stamped plane with one bright corner | `outline`, `shadow`, `currency`, `highlight` | Using gold alone to mean value, Bell, Headliner, and interaction |
| Void matter | Large dark connected mass cut by one or two signal seams | `outline`, `void`, `shadow`, `danger` | A featureless black slab over a damaging area |

## 4. Perspective, ground plane, and anchors

### Camera and environment

Use a top-down three-quarter view: the floor is seen from above, while actors
and props show a front face plus a small top plane. Feet, bases, and hover
points meet one consistent ground plane. Do not mix side-view characters,
isometric tiles, and front-facing props.

- Floor art uses `floor` with sparse `floorDetail` clusters. Keep local floor
  contrast below `shadow`-to-`mid` actor contrast.
- Large runes and tile seams may organize space but must not resemble attack
  warnings. Static floor triangles cannot use the same inward-pulsing pattern
  as danger telegraphs.
- Props use ground-center pivots and sort by that ground Y. Tall prop tops may
  overlap actors briefly, but must not obscure the player or urgent pickup for
  a sustained interval.
- Decorative scenery remains visibly non-blocking. If an obstacle becomes
  solid, its collision silhouette and debug overlay must agree with its base;
  art may not imply a solid wall while simulation lets actors pass through it.
- Use relic and crypt motifs from the catalog: pillars, braziers, rubble,
  sarcophagi, statues, bones, mushrooms, vines, gravestones, crystals, banners,
  campfire, and rune dais. Their details remain quieter than combat.

### Anchor contract

Every actor, pickup, projectile, prop, and attack frame declares an integer
native pivot measured from the frame's top-left corner.

- Grounded actor pivot: the midpoint between planted feet on the ground plane.
- Hovering actor pivot: the projected ground point directly beneath the stable
  body center, not the lowest wing or trailing particle.
- Environment pivot: center of the contact base on the ground plane.
- Projectile pivot: collision-core center.
- Radial/area attack pivot: simulation origin of the boundary.
- UI piece pivot: top-left for layout pieces; center only for explicitly
  centered icons or cards.

The renderer and simulation consume the same metadata. Hurtbox offsets are
stored relative to the art pivot in simulation units; they are not inferred
from frame dimensions. The visible solid body must contain the hurtbox in every
frame, excluding clearly decorative extremities. A projectile collider cannot
exceed its bright collision core. A damaging boundary must agree with the
simulation boundary within one native logical pixel; a larger visual warning
is permitted only as a documented player-favoring exception.

The selected prototype establishes these starting geometry references:

| Reference | Native frame | Visible bounds | Pivot | Simulation geometry |
| --- | ---: | ---: | ---: | --- |
| Player | 32 × 36 | 28 × **34** | (16, 33) | circle radius 14, offset (0, -14) |
| Dusk-Moth-scale flyer | 20 × 18 | 20 × 17 | (10, 15) | circle radius 10, offset (0, -10) |
| Normal humanoid | 26 × 30 | 26 × 30 | (13, 28) | circle radius 14, offset (0, -14) |
| Heavy | 42 × 42 | 42 × 42 | (21, 39) | circle radius 22, offset (0, -20) |
| Boss | 60 × 54 | 60 × 50 | (30, 50) | circle radius 36, offset (0, -30) |
| Small projectile | 10 × 8 | 10 × 8 | (5, 4) | attack circle radius 6 |
| Melee reference | 40 × 28 | 37 × 25 | (7, 14) | sector radius 62, half-angle 42° |
| Wide boundary | 112 × 76 | 105 × 69 | (56, 38) | ellipse radii 104 × 68 |

Simulation values in the table are twice logical lengths because the
world-to-logical scale is 0.5. These are reference shapes, not permission to
reuse one body for unrelated roles. Production frames add required transparent
edge padding without changing their visible size or ground relationship.

## 5. Category grammar and visual priority

| Category | Required grammar | Reserved/forbidden treatment |
| --- | --- | --- |
| Player | Orange jacket mass, pale face/hand peaks, compact cyan corner/rim treatment, grounded 34 px body | The complete orange-body + white peak + cyan rim combination is player-exclusive. |
| Ordinary hostile | Near-black outer mass, navy/neutral body, magenta or violet supernatural core; silhouette and motion describe role | No full cyan rim and no player jacket arrangement. |
| Amped hostile | Base role remains readable; add a small gold double-chevron and one charged corner pulse | Do not recolor the entire enemy gold. |
| Headliner/boss | Dedicated 48–64 px native silhouette, crown/reliquary framing, stable boss core, stronger but bounded signal contrast | No runtime fractional enlargement of a normal sprite; no effect halo hiding the body. |
| Neutral environment | Navy/stone ramps, broad quiet clusters, sparse light | No urgent inward triangles, pickup bob, or screen-leading highlight area. |
| XP | Cyan faceted diamond, vertical split, short inward collection streak | Must not become a round spark or mimic a homing projectile. |
| Music-note currency | Gold rectangular note/tab with a stem or stamped notch; larger values add connected tabs | Must not use Bell's symmetric crystal silhouette or travel trail. |
| Health | Pink vial/cross capsule with a white cap and cross-shaped negative notch | Color alone is insufficient; routine enemy accents cannot use this silhouette. |
| Rare utility | 13 px-tall capped relic flask with two stepped shoulders and a cyan-white interior | Must differ from XP by outline and from health by cap/notch. |
| Weapon pedestal | 26–32 px reliquary plinth with one centered weapon icon and grounded base | Interaction radius must not extend beyond a visually credible approach area. |
| Encore Case/reward | Chunky handled case with gold latch and cyan opening seam | Never depict as a loose currency note. |
| Friendly attack | Stable bright collision core/border plus weapon identity pair; particles are secondary | Decoration may not be brighter or more continuous than the damaging geometry. |
| Hostile danger | Violet/magenta fill plus inward triangles, teeth, hatch, or pulse rhythm | Never rely on hue alone. Static decoration cannot use the same animated pattern. |
| UI | Near-black/panel planes, stepped border, white live text, one semantic accent | No soft glass panels, fractional radii, or rasterized functional text. |

In dense play the visual priority is: player and immediate danger; truthful
attack boundaries; boss/Headliner cores; urgent rewards and healing; ordinary
enemies; XP/currency; decorative effects; floor detail. Damage numbers and
labels are pooled and capped so they never become a continuous bright wall.

## 6. Player construction

The production player keeps the selected prototype's 34 px visible height,
orange jacket, pale face, compact cyan rim corners, square torso, and grounded
boots. The silhouette must show a readable head/torso/boot stack at 1× and in
solid black.

- The cyan treatment is four or fewer connected corner/rim clusters, not a
  glowing outline around every pixel.
- Boots remain planted across idle and walk loops; arms and jacket tails carry
  most secondary motion.
- Damage keeps the outline and body readable. Death may break the token apart,
  but the ground pivot remains the origin of the effect.
- Direction frames must preserve the orange mass and face peak. Mirroring may
  be used for left/right only while no equipped or costume feature is handed.
- Player attacks cannot wash the jacket into the background. When orange
  attacks overlap the player, a cyan/white player rim remains visible.

## 7. Enemy silhouette families

The following sheets are required production evidence, not optional concept
art. Each sheet contains labeled columns at native size and exact 4×: solid
one-color silhouette, normal palette, two widest animation/state extremes, and
hurtbox/ground-pivot overlay. Labels sit outside sprite frames. Every entry
must remain identifiable without its label in the mixed-role sheet.

### Sheet F1 — flying moths and swarms

| Runtime ID | Name and role | Target envelope | Silhouette contract | Motion/state signature |
| --- | --- | ---: | --- | --- |
| `bat` | Dusk Moth, baseline chaser | 20 × 18 | Wide down-pointing triangle wings around a small square core; two clean wing notches | Even flap, direct nose-first drift |
| `redBat` | Ember Moth, tougher pack flyer | 24 × 20 | Shorter, thicker upper wings and a broad ember-tail block | Heavy two-beat flap with a brief closed-wing hold |
| `redBat2` | Frost Moth, broad opening crowd | 28 × 22 | Long nearly horizontal wings with stepped icy tips and a narrow center | Shallow fast wing ripple; broad lateral read |
| `batSwarm` | Dusk Swarm, fixed-direction sweep | 28 × 24 | One connected arrowhead flock mass with three lobes; satellites may not imply separate hittable bodies | Locked travel direction and streaming rear edge |
| `glowingBat` | Crown Wraith, scaling boss | 56 × 50 | Crown-shaped upper wing line, large square core, split lower cloak | Slow royal wing arc and periodic core flare |

### Sheet F2 — humanoid and undead

| Runtime ID | Name and role | Target envelope | Silhouette contract | Motion/state signature |
| --- | --- | ---: | --- | --- |
| `zombie` | Plague Husk, slow walker | 24 × 29 | Forward-bent head, one long reaching arm, uneven boots | Drag-step with delayed rear shoulder |
| `skeleton` | Bone Warden, tougher walker | 28 × 30 | Upright square shoulders, connected rib block, forked lower gap | Planted march and compact weapon recoil |
| `ghost` | Phase Shade, fast phasing chaser | 26 × 28 | Hooded diamond head flowing into a tapered, footless lower point | Hover compression and short phase gaps; no walking bob |
| `shielded` | Aegis Knight, shield state | 38 × 42 | Large rectangular shield dominates one side; narrow helmet spike on the other | Shield-active leading edge; broken state gains a permanent jagged notch |
| `elite` | Eclipse Guardian, durable objective | 44 × 44 | Temple-wide shoulders, horned eclipse arch, two block legs | Slow weight transfer and deliberate two-step impact |

### Sheet F3 — golems and constructs

| Runtime ID | Name and role | Target envelope | Silhouette contract | Motion/state signature |
| --- | --- | ---: | --- | --- |
| `greenMudman` | Moss Golem, very durable slow wall | 42 × 40 | Low lopsided boulder torso, long hanging fists, moss-bite crown | Alternating planted fist drag; almost no vertical lift |
| `grayMudman` | Slate Golem, lighter dense golem | 36 × 40 | Taller stacked-slab torso, clipped shoulders, short fists | Quicker rigid slab steps |
| `tank` | Void Golem, endless high-health wall | 44 × 44 | Broad rectangular gate body with inset square void and pillar legs | Slow two-frame compression before each shove |
| `darter` | Iron Scarab, pause-and-dash | 30 × 20 | Low horizontal shell, pointed nose, two rear stabilizer blocks | Opens during pause, closes into a spear for the dash |
| `circler` | Rune Eye, orbiting enemy | 28 × 28 | Diamond eye with four unequal cardinal prongs | Clockwise/counterclockwise orbit shown by prong sequence, not free sprite rotation |

### Sheet F4 — maws, growths, and beast

| Runtime ID | Name and role | Target envelope | Silhouette contract | Motion/state signature |
| --- | --- | ---: | --- | --- |
| `flower` | Spore Maw, near-stationary ring enemy | 30 × 28 | Four-petal jaw around an empty square mouth; rooted lower block | Petals close inward; root stays planted |
| `swarmer` | Crypt Wisp, tiny split child | 16 × 16 | One diamond core with two hooked side wisps, kept as a connected mass | Quick alternating hook flick; no generic round bob |
| `splitter` | Thorn Maw, durable carrier | 36 × 38 | Seed-pod torso with four corner thorns and a visibly sealed center seam | Seam pulses before split; death opens four directional gaps |
| `charger` | Ember Boar, windup-and-dash | 40 × 28 | Low horizontal back, square snout, two forward tusk triangles | Scrape-back windup, locked straight dash, heavy recoil |

### Sheet F5 — arachnid boss

| Runtime ID | Name and role | Target envelope | Silhouette contract | Motion/state signature |
| --- | --- | ---: | --- | --- |
| `mantis` | Crypt Spider, 500-health boss | 60 × 54 | Large reliquary abdomen, small head, four readable leg pairs arranged as stepped hooks | Alternating diagonal leg plants; abdomen remains the stable hittable mass |

### Sheet F6 — modifiers and mixed-role proof

This sheet shows every family in one-color silhouettes at actual relative scale,
then repeats a Dusk Moth, Plague Husk, Void Golem, and Crypt Spider as ordinary,
Amped, and authored Headliner treatments. Amped gold chevrons and Headliner
crown framing are additions to a readable base silhouette, never replacements
for it. The sheet must also prove that no family is merely the same square body
scaled up with a different core.

## 8. Weapons: identity and evolution

Plain-language names used below: Kick is a low drum hit; Snare is a sharp drum
hit; Hi-hat is the small metal cymbal pair on a drum kit; Bass is the low-pitch
part; Chord is several notes played together; Arp is those notes played one
after another; Lead is the main melody sound.

Color pairs identify a weapon family, but outer contour, travel, and boundary
do the real work. Every normal tier preserves its family's base silhouette.
Tier upgrades may add count, length, or a second ordered layer using native
frames; they may not become unrelated generic particles.

| Normal → evolved | Identity pair | Normal identity | Required evolved identity |
| --- | --- | --- | --- |
| Kick → Redline Stomp | `attack` + `highlight` | Short horizontal boot/step strip with a saw-tooth leading end | Four crossing arena stomp lanes with stamped boot heads and continuous truthful borders; not merely a larger strip |
| Snare → Railshot | `focal` + `highlight` | Thin needle projectile with one square tail | Near-instant long rail with a one-pixel white collision center and cyan side rails; every fourth twin shot reads as two rails |
| Hi-hat → Prism Rain | `accent` + `focal` | Tiny triangular/diamond chips in a sparse spray | Larger faceted blades that visibly redirect on contact; authored angle frames preserve facets |
| Clap → Standing Ovation | `attack` + `accent` | Close forward fan with a five-step hand crown | Full-arena outward then inward bracket ring; direction reversal is visible in the edge pattern |
| Bass → Subquake | `danger` + `attack` | Slow broad wave with two stepped side notches and a stable bright core | Expanding double-line seismic ring with repeated heavy blocks; no opaque black or purple slab inside the ring |
| Chord → Afterhours | `accent` + `danger` | Rounded-square slow zone with four fixed corner nodes | Huge drifting crowd-seeking cells whose borders visibly link when merged; merge state is a new contour, not a scaled zone |
| Arp → Event Horizon | `focal` + `danger` | Orbiting square/teardrop tokens with a small dark center notch | Counter-rotating paired crowns and a breathing central void; authored direction frames, not filtered free rotation |
| Lead → Neon Serpent | `attack` + `focal` | Bright homing chevron with a clear pointed head | Connected zigzag serpent with a distinct large head every fifth shot and readable piercing segments |
| Bell → Gravity Bell | `currency` + `highlight` | Symmetric faceted crystal that breaks into radial shards | Suspended bell/crystal plus inward pull spokes, followed by ten seeking crystals; never a rectangular currency note |

Normal and evolved forms must differ in **silhouette, motion, effect structure,
and readable intensity**, not just hue or size. Evolved boundaries remain no
brighter than necessary to communicate their actual geometry. Friendly attack
decoration can extend outside the collision core, but is thinner, darker, or
shorter-lived than the truthful part.

## 9. Pickups, rewards, and collection effects

- XP tiers share the faceted diamond; green/red legacy recolors are replaced by
  size plus one/two/three internal split marks using the locked palette. The
  lowest tier remains at least 8 px and the largest at most 14 px.
- Music-note values use one, two, or three **connected** gold note/tabs for
  note, phrase, and anthem value. They never become a loose multi-body group
  with one unexplained collider.
- Collection effects collapse toward the pickup's ground pivot for 100–180 ms,
  then disappear. They cannot imitate a projectile continuing past the player.
- Weapon/passive/evolution/Encore rewards use different frames: plinth,
  stitched badge, crown seam, and handled case respectively. The embedded icon
  follows the 20 px UI icon grammar.
- Healing uses `health`, a cross-notch silhouette, and a short outward pulse.
  Rare utility uses the capped 13 px relic-flask silhouette and cyan-white
  interior. Magnet attraction keeps each pickup's category silhouette visible.

## 10. Animation and effects

Frame timing is metadata, not inferred from frame order. Use these starting
ranges and tune only to express behavior:

| Asset/state | Starting cadence |
| --- | --- |
| Player idle | 4 frames, 150–200 ms each |
| Player move | 6 frames, 90–120 ms each |
| Small flyer | 4 frames, 70–100 ms each |
| Walker | 4–6 frames, 110–150 ms each |
| Heavy/boss locomotion | 4–8 frames, 140–200 ms each |
| Windup/dash/recoil state | 2–5 authored frames with explicit hold durations |
| Projectile loop | 2–4 frames, 60–100 ms each |
| Impact/explosion | 4–8 frames, 45–80 ms each |
| Ordinary death | 4–7 frames over 250–400 ms |
| Boss death | 6–12 frames over 500–800 ms |

- Planted feet or the intended hover-ground point drift at most one native
  pixel across an ordinary loop. Rooted enemies drift zero.
- Ordinary idle/walk frames vary by less than 10% in visible solid area unless
  a documented squash/stretch action needs more. Do not animate by lifting the
  whole sprite one pixel.
- Motion begins with anticipation, reaches a readable action extreme, and
  resolves with recoil or settle. Wing beats, leg plants, shield breaks,
  charges, splits, and phase states must communicate gameplay behavior.
- A smear is one authored action frame, occasionally two for a boss. It uses a
  connected directional cluster, never filtering or transparency blur, and is
  not itself the persistent collision boundary.
- Hit flash lasts 50–80 ms: preserve the `outline`, replace one or two interior
  planes with `highlight`, and retain the hostile/player identity color. Never
  hold a featureless white silhouette through multiple damage ticks.
- Death effects break from the body center into 3–7 chunky fragments for an
  ordinary actor. Fragments darken and vanish; they may not look collectible.
  Collision ends according to simulation, not when the last decorative pixel
  disappears.
- Essential warning, hit, death, collection, and explosion effects have hard
  pixel cores. Runtime alpha is allowed only on a declared secondary glow
  layer. Urgent boundaries never fade below readability while damage is live.
- Screen shake is quantized to logical pixels. Decorative camera effects may
  not create a fractional shimmer.

## 11. UI, typography, and interaction states

The DOM HUD remains one accessible overlay coordinated by `ViewportTransform`.
Functional text stays live and localizable. Raster art supplies icons, meter
pieces, panel corners, dividers, and decorative marks only.

### Grid and components

- Base spacing unit: **4 logical pixels**. Standard gaps/padding are 4, 8, 12,
  16, 24, and 40. One- and two-pixel borders are allowed exceptions.
- Standard icon cells: 12 or 16 px for status/action icons; **20 × 20 px** for
  weapons and passives. Icons are authored for their cell, never downscaled.
- Approved HUD meter art: 104 × 14 frame, 96 × 6 fill, and 8 × 14 cap. Meter
  fill crops on integer pixels; it is not smoothly scaled.
- Approved compact reward-panel art footprint: 96 × 56. DOM content may make a
  card larger using a nine-slice, but its corners remain native.
- Panel border: two-pixel `outline` exterior, one-pixel `mid` structural line,
  and a single upper-left `light` corner step. Default plane is `panel`.
- Nine-slice corners use a declared 4 or 8 px corner cell and are never
  stretched. Opaque tiles may extrude edge color only outside their declared
  logical frame.

### Type

- Body and control text use the current system monospace stack as crisp live
  text. Display headings use the same family with weight and tracking until a
  licensed, fully covered decorative pixel font is deliberately approved.
- Do not bake names, descriptions, prices, controls, scores, or status text
  into PNGs. Avoid tiny bitmap paragraphs.
- Standard functional text meets WCAG 4.5:1 contrast; large display text meets
  3:1. Test long names, one-line descriptions, large numbers, fallback fonts,
  and browser text zoom without clipping.
- Text may scale for accessibility; pixel borders and icons remain aligned
  through the shared logical layout. Record and ship a metrics-compatible
  fallback before introducing any custom font.

### Required icon vocabulary

Each 20 px passive icon uses one centered object silhouette, one interior mark,
and at most one role-color corner. High-Tops uses a side-view boot; Fast Forward
uses joined double chevrons; Needle Tips uses crossed narrow needles;
Mirrorball uses a faceted hanging sphere; Wide Lens uses a broad oval lens;
Heavy Amp uses a square amplifier/speaker cabinet; Extension Cable uses a plug
and one loop; Magnet Lanyard uses a U-magnet under a strap loop; Padded Jacket
uses a sleeveless jacket outline; Recovery Tape uses a rectangular tape reel
with two holes. Do not reuse one generic badge with different letters.

Action/status icons follow the same native-grid grammar: reroll is two stepped
arrows, shop is a handled counter bag, evolution is an up-chevron crown, weapon
pedestal is a grounded plinth, enemy skull is a square-jawed skull, heart is a
stepped heart, XP is the faceted diamond, note is the stamped gold tab, level is
stacked up-chevrons, and pause is two equal vertical blocks. Their silhouettes
remain recognizable in one color and at their declared 12 or 16 px cell.

### States

| State | Treatment |
| --- | --- |
| Rest | `panel` plane, `mid` edge, white or `light` text according to hierarchy |
| Hover/pointer | Add one `focal` upper-left corner bracket and raise text to `highlight`; no layout movement |
| Keyboard focus | Continuous two-pixel stepped `focal` outline outside the control, visible on every panel color |
| Pressed/active | Shift the interior plane one logical pixel down-right while the outer frame stays fixed; use a short `attack` or role-color latch |
| Selected | Persistent role-color left rail plus a white corner chip; not hue alone |
| Disabled | `shadow` plane, `mid` icon/text, one diagonal one-pixel hatch; retain readable label |
| Warning/destructive | `health` or `danger` plus a triangular notch and plain-language label |

Interactive targets are at least 44 × 44 CSS pixels where layout permits.
Focus is never replaced by hover. Touch, mouse, keyboard, and gamepad states
must describe the same selection.

## 12. Atlas, metadata, and export

### Source and packing

- Author at native logical resolution. Do not extract runtime sprites from
  large concept boards and do not use 96 px legacy cells as a production unit.
- Core sprites use hard alpha: pixels are fully opaque or fully transparent.
  Declared secondary glow frames may use intermediate alpha, on a separate
  effect layer, while their readable core remains hard-edged.
- Fully transparent pixels are exactly RGBA `(0, 0, 0, 0)`. No matte, halo,
  chroma-key residue, or hidden RGB is allowed.
- Untrimmed actors, pickups, projectiles, and icons keep at least **two fully
  transparent pixels** between visible art and each logical frame edge, plus
  at least **two pixels of atlas separation**. Do not extrude silhouettes into
  this boundary.
- Fully opaque tiles and nine-slice pieces may extrude edge colors into packer
  padding outside the declared frame to prevent seams. That exception never
  applies to actor silhouettes.
- Do not trim, rotate, or rescale actor frames during packing. Keep every atlas
  page at or below 2048 × 2048. Sort inputs deterministically.
- Group by stable render need: core world, environment/tiles, UI, and declared
  alpha/additive effects. Avoid page or blend-mode churn; the standard stress
  scene targets no more than 12 Pixi draw calls for the core world.

The approved Gate-1 prototype contains edge-touching comparison art. It is not
an exception to production padding. Reframe production sprites with transparent
padding while preserving visible bounds and pivot-to-ground distance.

### Stable names

Use the stable path families consumed by the live renderer and generated
catalog:

- `actors/player/{idle|walk}`;
- `actors/enemies/{runtime-kind}/{idle|walk}`;
- `weapons/{role}/{normal|evolved}`;
- `pickups/{id}` and `fx/{id}`;
- `ui/{items|status|actions}/{id}`;
- `environment/{id}`.

IDs use the canonical gameplay/config identifier. Most are lowercase
kebab-case; existing runtime enemy identifiers such as `greenMudman` and
`batSwarm` retain their established camelCase spelling so art cannot silently
diverge from simulation catalogs. Authored direction is a runtime transform or
animation decision in this production set, not a redundant suffix in the
physical frame key. Renaming an integrated key requires a catalog migration;
aliases do not silently accumulate.

### Required metadata

Each atlas frame declares the integer atlas rectangle, untrimmed `sourceSize`
and `nativeSize`, integer pivot plus normalized compatibility anchor, measured
opaque bounds and opaque-pixel count, semantic class/tags, transparent margins,
renderer scale, color budget, and colors used. Grounded and hovering frames
also declare a planted or projected ground reference. The atlas file itself is
the page identity; animation membership is the stable idle/walk key pair in the
generated live catalog.

Simulation hurtboxes, attack geometry, loop timing, layers, and mirror rules
remain authoritative runtime definitions rather than duplicated frame fields.
Development overlays join those runtime definitions to atlas pivots and opaque
bounds through one shared 0.5 world-to-logical projection. This keeps visual
truth inspectable without introducing a second stale collision specification.

### Export gates

The production builder must fail on invalid PNG/dimensions, illegal alpha,
nonzero RGB beneath transparency, palette violations, empty required frames,
duplicate placeholders, overlap/padding violations, missing catalog mappings,
unstable names, missing pivots, fractional runtime scales, or nondeterministic
output. Color-count and edge-noise checks are warnings that trigger human
inspection; they never certify craft by themselves.

## 13. Approved reference treatments

These references approve specific treatment decisions, not their completeness
as production assets:

| Reference | Approved lesson |
| --- | --- |
| `docs/visual-evidence/pixelart-overhaul/gate1/reference/arcade-reliquary/truth-scene.png` | Orange player hierarchy, deep navy field, chunky role tokens, upper-left highlights, and restrained interiors at 1× |
| `docs/visual-evidence/pixelart-overhaul/gate1/reference/arcade-reliquary/silhouettes.png` | Player, flyer, humanoid, heavy, boss, pickup, and attacks separate without interior color |
| `docs/visual-evidence/pixelart-overhaul/gate1/reference/arcade-reliquary/grayscale.png` | Player and gameplay categories retain a strong value scan |
| `docs/visual-evidence/pixelart-overhaul/gate1/reference/arcade-reliquary/crowded-combat.png` | The player remains the first focal token while enemy and attack masses stay ordered |
| `docs/visual-evidence/pixelart-overhaul/gate1/reference/arcade-reliquary/hitbox-overlay.png` | Hurtboxes sit within solid actor mass; projectile core contains its collision circle; wide boundaries describe geometry |
| `docs/visual-evidence/pixelart-overhaul/gate1/arcade-reliquary-in-engine-1280x720.png` | The atlas treatment survives live Pixi composition at exact 2× backing scale |
| `docs/visual-evidence/pixelart-overhaul/gate1/arcade-reliquary-runtime-hitboxes-1280x720.png` | Renderer pivots and live debug geometry can share the same source metadata |

The prototype's exact 34 px player, 13 px rare pickup, full collider coverage
for core actors/projectile, and clean nearest-neighbor 4× outputs are binding
quality floors.

## 14. Explicit anti-examples

The following are rejected implementation patterns. Do not reproduce them even
if an individual screenshot appears attractive.

- **Concept-board extraction:** cutting runtime subjects from large generated
  boards, then fitting them into arbitrary 96 px cells. Production art is
  rebuilt on the native grid.
- **Fractional miniature art:** drawing a large noisy icon or actor and showing
  it at 0.25, 0.31, 0.5, 0.6, 0.62, or another fractional runtime scale.
- **Fake animation:** copying an idle frame and shifting most of it one pixel
  upward. Motion must express feet, wings, weight, anticipation, or recoil.
- **Palette-swap evolution:** making an evolved weapon only larger or a
  different hue. Evolution changes contour, motion, structure, and intensity.
- **One square family:** reusing a square body and changing only scale/core for
  twenty enemies. Each gameplay role needs its specified outer contour and
  movement signature.
- **Untruthful swarm body:** drawing several detached creatures around one
  unexplained circle. Use one connected readable mass or explicit bodies.
- **Hollow collision core:** placing a hurtbox/projectile circle over transparent
  gaps or faint glow. The solid visual core contains the geometry.
- **Bass slab:** covering a wide damaging area with a large opaque black or
  purple rectangle. Use a crisp border/core matching the actual boundary.
- **Color-only danger:** using magenta/violet without teeth, triangles, hatch,
  pulse, or motion. This fails grayscale and color-vision review.
- **Particle camouflage:** making XP a round cyan spark, Bell a gold note, or
  rare utility a projectile-like orb. Silhouette-plus-color identities remain.
- **Neon tracing:** outlining every prop, actor, and panel in bright color. It
  destroys priority and makes the haunted crypt read as generic circuitry.
- **Soft UI pasted on pixel play:** blurred glass, smooth stretched corners,
  baked functional text, inaccessible focus, or icons scaled to fit.
- **Subpixel camera shimmer:** leaving the final camera, shake, or DOM overlay
  between logical pixels while sprites use nearest-neighbor sampling.
- **Unselected-direction mixing:** Gilded Ossuary's fine bone filigree and
  Moonlit Tapestry's flowing lavender rims are valid prototype ideas but are
  not Arcade Reliquary production rules. Do not combine them ad hoc.

## 15. Assumptions, risks, and change control

### Current assumptions

- `public/art/pixel/live-catalog.json` is the roster/surface inventory until a
  newer generated manifest replaces it; this bible does not invent gameplay.
- Environment props are decorative unless shared collision metadata explicitly
  makes one solid.
- The current system monospace stack remains the live body/display font. No
  custom font or license is assumed.
- Color-vision review covers at least protanopia, deuteranopia, and tritanopia
  simulations, plus grayscale. Simulations are review tools, not runtime art
  recolors unless accessibility work later adopts them.
- Animation frame counts are production starting points; behavior and timing
  can vary within the written rules without another user decision.
- The selected prototype locks direction, palette, category hierarchy, player
  height, and rare-pickup height. It does not lock edge-touching frame sizes or
  prototype-only comparison layouts.

### Known clarity risks

| Risk | Required mitigation | Escalation trigger |
| --- | --- | --- |
| Chunky construction makes enemies repetitive | Enforce F1–F6 silhouette sheets before interiors and compare every role in one mixed sheet | Two roles are confused without labels at native size |
| Cyan player, XP, and some attacks converge | Reserve full cyan rim for player; XP stays diamond and stationary/collecting; attacks keep weapon contour and motion | Player or pickup fails 500 ms/category review |
| Gold Bell attacks, currency, and Headliner marks converge | Bell is symmetric/traveling/faceted; currency is rectangular/stationary; Headliner gold remains attached to hostile silhouette | Reviewers mistake any pair in stress frames |
| Magenta/violet becomes universal noise | Limit signal area, preserve dark bodies, and pair danger with geometry/pulse | Grayscale or color-vision mode hides a boundary/role |
| Orange attacks hide the orange jacket | Keep cyan-white player rim above friendly VFX and cap attack fill opacity/area | Player locate rate falls below 95% |
| Arcade language drifts into generic science fiction | Retain crypt/reliquary anatomy, carved motifs, crowns, bones, bells, and stone | A family or environment batch lacks a supernatural relic cue |
| Boss effects hide honest body mass | Keep stable dark body/core and make halos secondary | Hurtbox or ground point cannot be read during an active effect |

Any exception must record the asset, violated rule, reason, native-size and
stress-scene evidence, collision impact, reviewer, and date in the relevant
visual-evidence packet. If an exception changes the direction rather than one
asset, amend this bible first. The user is not asked to arbitrate intermediate
sprites; internal review owns consistency until the final approval gate.
