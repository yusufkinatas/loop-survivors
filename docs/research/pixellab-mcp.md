# PixelLab MCP: capabilities and generation costs

Research for issue #205 (map #204). Researched 2026-07-22.

Sources, in trust order:

1. **MCP tool schemas** — the live `mcp__pixellab__*` tool parameter descriptions loaded
   in this session. Most trustworthy: this is the contract the tools actually enforce.
2. **MCP docs** — https://api.pixellab.ai/mcp/docs
3. **agent_help** — the PixelLab `agent_help` knowledge agent (answers cited as such;
   lower confidence than 1 and 2).
4. Live read-only calls: `get_balance`, `list_projects` (ground truth for this account).

No generations were spent for this research.

## Account status (live, 2026-07-22)

`get_balance` returned:

```
credits: $0.00
generations_remaining: 40
generations_used: 0
generations_total: 40
subscription: trial
```

Full 40-generation trial budget is intact. `list_projects` returned "0 projects. You
don't belong to any organization."

## 1. What counts as ONE generation

The unit is a **generation** (the trial has 40). Costs per operation:

| Operation | Cost | Source |
|---|---|---|
| `create_character` standard mode | **1 generation total**, including ALL 4 or 8 directional views | tool schema ("Standard mode (default): 1 generation, 4 or 8 directions") |
| `create_character` v3 mode | 2–9 generations depending on size, always 8 directions | tool schema |
| `create_character` pro mode | 20–40 generations | tool schema |
| `animate_character` template mode | 1 generation **per direction**; frame count fixed by template | tool schema |
| `animate_character` v3 mode | `ceil(width × height × frames / 65536)` per direction — **~1 gen/direction for canvases ≤96px** (128px≈2, 160px≈4, 256px≈8) | tool schema (explicit formula) |
| `animate_character` / `animate_object` pro mode | 20–40 generations per direction (160–320 for 8 directions); requires a `confirm_cost` handshake | tool schema |
| `create_topdown_tileset` standard (full 16-tile Wang set) | **1 generation** | agent_help |
| `create_isometric_tile` | 1 generation | agent_help |
| `create_map_object` | 1 generation | agent_help |
| `create_tiles_pro` | 20–40 generations | agent_help (schema is silent; treat as expensive) |
| `create_1_direction_object` | 20–40 generations | tool schema |
| `create_8_direction_object` | 20–40 generations | tool schema |
| `create_ui_asset` | 20–40 generations | tool schema |

**Answers to the ticket's specific questions:**

- **A 4-frame animation is 1 generation, not 4** — for a small sprite (≤96px canvas),
  single direction, v3 mode. The cost formula scales with canvas-area × frames, but
  32×32×4 = 4,096 pixels ≪ the 65,536 threshold, so it rounds up to 1. Confirmed by
  both the tool-schema formula and agent_help.
- **Multi-directional character creation does NOT cost more in standard mode**: 1
  generation buys the whole 4- or 8-direction rotation set. v3 costs 2–9 but is
  higher quality and is the only mode accepting a reference image.
- **Danger list for a 40-gen trial**: `create_1_direction_object`,
  `create_8_direction_object`, `create_tiles_pro`, `create_ui_asset`, and any
  `mode="pro"` anywhere. A single call eats 20–40 generations — half to all of the
  budget. Never use these on the trial.

## 2. Canvas sizes; native tiny output vs generate-large-and-downscale

Per tool schemas:

| Tool | Size range |
|---|---|
| `create_character` | 16–128px (standard/pro), 16–256px (v3); default 48. **Canvas is ~40% larger than the character** to leave room for animation (48px character → ~68px canvas) |
| `create_map_object` | width/height each 32–400px, non-square allowed (inpainting mode max 192×192) |
| `create_1_direction_object` | 32–256px square |
| `create_8_direction_object` | 32–168px square |
| `create_isometric_tile` | 16–64px (">24px often produce better quality") |
| `create_topdown_tileset` | tile size 16 or 32 standard; 64 requires pro mode |
| `create_tiles_pro` | 16–128px |

- **Native tiny output is supported**: `create_character` goes down to 16px, tiles to
  16px. PixelLab is a pixel-art model that generates at target resolution — there is
  no documented "generate large and downscale" workflow, and downscaling pixel art
  destroys its pixel grid. For the VS frame sizes (30×27, 31×33, player ~19px wide),
  generate characters at `size` ≈ 24–32 natively and crop/align in-engine.
- Caveat: character `size` means the character's height-ish extent; the returned
  canvas is square and ~40% bigger. Expect to trim transparent margins.
- Objects can't go below 32px; characters can (min 16). So sub-32 sprites must come
  from `create_character` (or tiles).

## 3. Transparent backgrounds

- `create_map_object`: **explicitly** "pixel art object with transparent background"
  (tool schema).
- MCP docs (https://api.pixellab.ai/mcp/docs) list transparent backgrounds for
  1-direction objects, 8-direction objects, isometric tiles, and sidescroller
  tilesets; `create_ui_asset` has `no_background=true` by default.
- **Characters**: no explicit "transparent background" sentence in schema or docs.
  Every retrieval path returns per-rotation/per-frame PNGs (a format with alpha), and
  the product is built for dropping sprites into engines, so transparency is
  expected — but this is **unverified**; confirm on the first character generation
  before committing the pipeline.

## 4. Seamless top-down ground tile: which tool, what cost

**Recommendation: `create_topdown_tileset`, standard mode, 32×32 — 1 generation.**

- It is the only cheap (1-gen, per agent_help) tool that produces square top-down
  tiles designed to connect seamlessly: it generates a 16-tile Wang autotile set
  where "vertices define terrain, tiles render based on their 4 corner values" (tool
  schema). The pure-terrain corner tile (all 4 corners = lower terrain) must connect
  seamlessly with itself for Wang autotiling to work at all, so it serves as the
  single infinitely-repeating ground tile; the other 15 tiles are free spares.
  **Unverified edge**: no doc sentence literally says "the base tile repeats with
  itself seamlessly" (agent_help found nothing); verify with a wrap-offset check on
  the first generated tile before integrating.
- It requires both `lower_description` and `upper_description` (it's a
  transition-set tool); with `transition_size=0` and two close descriptions (e.g.
  two forest-floor variants) you get pure-terrain tiles for both.
- View options are "high top-down" (default) / "low top-down" — no true straight-down
  "top-down", so mild perspective shading is possible.
- Alternatives rejected: `create_tiles_pro` (20–40 gens per agent_help;
  `tile_feature="tileset"` is also a 16-tile transition set), `create_isometric_tile`
  (wrong projection — diamond isometric), `create_path_tiles` (roads),
  `create_building_kit` (walls/floors kit). `create_map_object` outputs standalone
  objects, not documented as edge-seamless.
- Retrieval: `get_topdown_tileset` "Returns status, download links, base tile IDs for
  chaining, and an example map image" (tool schema). Exact download format (zip vs
  spritesheet) unverified — agent_help had no information beyond "download links".

## 5. Animation flow

Characters (`animate_character`), per tool schema:

- Three modes: **template** (skeleton templates like `walk`, `running-4-frames`;
  1 gen/direction; frame count fixed by template), **v3** (custom
  `action_description`; frame-count control; the default when no template given),
  **pro** (20–40 gens/direction — forbidden here).
- **v3 frame-count control**: `frame_count` 4–16, **must be even**, default 8.
- **Single-direction loops**: v3 defaults to **south only**; pass
  `directions=["south"]` (or any one cardinal) explicitly. Template mode animates all
  character directions by default — pass `directions` to restrict.
- `keep_first_frame` defaults true: the reference frame is stored as frame 0, so
  `frame_count=4` stores **5** frames. Set `keep_first_frame=false` for exactly 4.
- v3 also supports custom start/end keyframes (base64 or URL, single direction) for
  interpolation-style loops.
- Re-rolls: `delete_animation` then retry; the schema recommends escalating
  template → v3 → (pro).
- Async: returns job IDs immediately, ~2–4 min; poll with `get_character`.

Objects (`animate_object`): same v3 engine (even 4–16 frames, default 8,
interpolation mode, `keep_first_frame`), ~30–60s per direction. But objects
themselves cost 20–40 gens to create, so on this trial **all animated sprites should
be characters**, not objects.

**Frame retrieval**: `get_character` returns "rotation URLs, animations, and download
link" (tool schema); animation frames come as URLs per direction. See §6.

## 6. Asset retrieval — how images land on disk

- **Not git**: `list_projects` git clone URLs are for *game source-code* projects
  (the "vibe coding" feature), not generated assets. This account has 0 projects.
- **URL downloads**: `get_character` / `get_object` / `get_topdown_tileset` /
  `get_tiles_pro` etc. return per-rotation and per-animation-frame **storage URLs**
  plus a **download link** (tool schemas). MCP docs name one direct HTTP endpoint:
  `/mcp/characters/{id}/download` — the UUID acts as the access key, downloads need
  no authentication. So the pipeline is: poll `get_*` until `completed`, then `curl`
  the URLs to disk.
- **Base64**: preview images are returned inline (base64) by `get_*` tools for
  eyeballing in-session; the real assets come via URLs.
- Exact download-link payload (zip vs single PNG spritesheet) is **unverified** —
  inspect on first use.
- **Warning**: `create_map_object` results "auto-delete after 8 hours" (tool schema).
  Download immediately if that tool is ever used.

## 7. Style-control levers for a Vampire Survivors-like look

Per `create_character` schema (soft guidance — "the model may not follow exactly";
pro ignores all of these, v3 honors outline/detail but ignores shading/proportions):

- **View**: `"low top-down"` (~20° from above, "classic 3/4 RPG") — the VS camera.
- **Outline**: `"single color black outline"` (default) — the VS sprite look.
  Options: single color black outline / single color outline / selective outline /
  lineless.
- **Detail**: low/medium/high; **Shading**: flat/basic/medium/detailed (standard mode
  only). At 24–32px, low detail + basic or flat shading fits.
- **`text_guidance_scale`** 1–20 (default 8): prompt adherence.
- **Palette**: there is **no hex-palette constraint parameter** on the creation
  tools. Levers that exist: (a) palette words in the description (Midnight Neon
  Soundwood colors spelled out as color names), (b) `create_character` v3
  `reference_image_base64` — "rotates YOUR sprite into 8 directions", "the image
  defines identity and style" — so a hand-tinted reference locks the palette,
  (c) `create_character_state` has `use_color_palette_from_reference` to keep
  variants color-consistent with a source character, (d) `create_tiles_pro`
  `style_images` + `style_options: {"color_palette": true, ...}` (but that tool is
  budget-forbidden). `create_ui_asset` has a `color_palette` text hint (also
  budget-forbidden).
- **Proportions** (humanoid, standard mode): presets default/chibi/cartoon/stylized/
  realistic_male/realistic_female/heroic, or custom numeric ratios.
- **Body types**: humanoid, or quadruped with required template (bear/cat/dog/
  horse/lion). Non-humanoid, non-quadruped creatures (e.g. an amorphous static-noise
  flyer) have no dedicated skeleton — expect the humanoid template to bias toward
  bipeds; the v3 reference-image path (draft the shape, let v3 rotate/animate it) is
  the escape hatch.
- **Seeds**: available on tile/state/font tools but **not** on `create_character` or
  `animate_character` — character re-rolls are not reproducible.

## 8. Budget sketch for the four map assets (informative)

Cheapest viable path, per the costs above: player sprite 1 gen (standard character;
static, no animation needed) + 2 enemies at 1 gen each (standard) or 2–9 each (v3
quality) + 2 single-direction v3 loop animations at 1 gen each + floor tileset 1 gen
= **6–19 generations**, leaving 21–34 for re-rolls. Re-roll granularity is whole-asset
(no seeds for characters), so budget ~2–3 attempts per asset.

## Unverified items (flagged above)

- Character sprites' transparent background (expected, not documented explicitly).
- Wang base tile self-seamlessness (implied by the autotile contract, not stated).
- Download-link file format (zip vs spritesheet) for characters and tilesets.
- `create_tiles_pro` / tileset / map-object gen costs come from agent_help only; the
  1-gen cost of `create_topdown_tileset` should be sanity-checked against
  `get_balance` after the first tileset generation.
