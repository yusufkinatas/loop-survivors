# Vampire Survivors: Mad Forest enemy sprite frame sizes (issue #180)

**Question:** The source frame sizes (width x height in source pixels) for every
enemy in the locked Mad Forest mapping table: verify the 12 existing
`MAD_FOREST_FRAMES` entries in `src/game/config.ts`, capture the missing kinds
(Giant Bat, Silver Bat, Werewolf, Big Mummy, Venus, the four Giant bosses), and
check the swarm-sprite-reuse assumptions.

**Method:** All dimensions were read as pure numeric metadata from the official
wiki (https://vampire.survivors.wiki, a wiki.gg site) via the MediaWiki API's
`imageinfo` endpoint (`iiprop=size` — the server reports each upload's intrinsic
pixel width/height, so no thumbnail scaling can interfere and no image content
needs to be copied). Which file belongs to which enemy variant was taken from
each enemy page's `Statbox Enemy` wikitext (`?action=raw`): the `image =` /
`sprites =` fields name the exact sprite file(s) per variant. Upload histories
were checked where a value disagreed with the repo. Animated GIFs were
additionally inspected frame-by-frame (GIF image-descriptor parsing on temp
downloads; nothing kept or committed) to understand what the GIF canvas
represents. All fetched 2026-07-21.

**What counts as "a frame" here.** The wiki publishes, per visual variant:

- one static `Sprite-<name>.png` — a single animation frame at native 1x scale
  (verified: every one that overlaps `MAD_FOREST_FRAMES` reproduces the repo's
  numbers, e.g. Pipeestrello 19x21, Skeleton's six 28/32/32/34/32/34 x33);
- one `Animated-<name>.gif/.webp` walk loop (4 frames) whose **canvas is the
  union bounding box of all 4 frames**, so for enemies whose walk cycle sways
  (Werewolf, Mantichana, Mudman, Zombie 1, Skeleton 1…) the GIF canvas is a few
  pixels larger than any single frame. The GIF files' internal per-frame
  rectangles are encoder-normalized (full-canvas or diff-rects), so individual
  mid-walk trimmed frame sizes are **not recoverable** from the wiki — flagged
  below.

The repo's convention (one entry per visual variant, sized like the variant's
static sprite, repeats preserved for uniform frame-list weighting) therefore
maps 1:1 onto the wiki's static `Sprite-*.png` set, and that is what is
verified against. Radius formula used throughout:
`floor(width x 0.4) x 800/456` (`legacyEnemyRadius` in `src/game/config.ts`;
800/456 ≈ 1.7544).

---

## 1. Verification of the 12 existing `MAD_FOREST_FRAMES` entries

Source for every row: the named file's `imageinfo` size, mapped to the variant
by the statbox on the cited page. Bat family:
https://vampire.survivors.wiki/w/Pipeestrello — its statboxes bind
BAT1 → `Sprite-Pipeestrello.png`, BAT2 → `-2`, BAT3 → `-3`, BAT4 (Glowing) →
`-4`, BAT5 (Silver) → `-5`, BATSWARM → `sprites = ` all of `-1`, `-2`, `-3`.

| Repo kind | Repo entry | Wiki file(s) | Wiki size | Verdict |
|---|---|---|---|---|
| bat | 19x21 | Sprite-Pipeestrello.png | 19x21 | **VERIFIED** |
| redBat | 25x24 | Sprite-Pipeestrello-2.png | 25x24 | **VERIFIED** |
| redBat2 | 30x27 | Sprite-Pipeestrello-3.png | 30x27 | **VERIFIED** |
| zombie | 31x33, 31x33, 31x33 | Sprite-Zombie.png, -2, -3 ([Zombie](https://vampire.survivors.wiki/w/Zombie), one ZOMBIE statline, `sprites =` all three) | **32x33**, 31x33, 31x33 | **MISMATCH on variant 1**: repo 31x33 vs wiki 32x33 (stable since the 2022-04-10 upload; the 2025-06-06 revert restored the same 32x33). Radius-neutral: floor(31x0.4) = floor(32x0.4) = 12. Variants 2 and 3 VERIFIED. |
| skeleton | 28, 32, 32, 34, 32, 34 (x33) | Sprite-Skeleton.png, -2…-6 ([Skeleton](https://vampire.survivors.wiki/w/Skeleton), one statline, `sprites =` all six) | 28x33, 32x33, 32x33, 34x33, 32x33, 34x33 | **VERIFIED** (all six, in order) |
| ghost | 29x32 | Sprite-Ghost.png ([Ghost](https://vampire.survivors.wiki/w/Ghost), GHOST statbox; `Sprite-Ghost-2.png` is also 29x32) | 29x32 | **VERIFIED** |
| greenMudman | 34x34 | Sprite-Mudman-2.png ([Mudman](https://vampire.survivors.wiki/w/Mudman), MUDMAN2 = Green per #172 doc) | 34x34 | **VERIFIED** |
| grayMudman | 34x34 | Sprite-Mudman.png (MUDMAN1 = Gray) | 34x34 | **VERIFIED** |
| flower | 26x26, 32x32 | Sprite-Flower Wall.png, Sprite-Flower Wall-1-2.png ([Flower_Wall](https://vampire.survivors.wiki/w/Flower_Wall), FLOWER statbox `sprites =` both; Moonspell variants belong to other stages) | 26x26, 32x32 | **VERIFIED** |
| glowingBat | 27x25 | Sprite-Pipeestrello-4.png | 27x25 | **VERIFIED** |
| mantis | 48x47 | Sprite-Mantichana.png ([Mantichana](https://vampire.survivors.wiki/w/Mantichana)) | 48x47 | **VERIFIED** |
| batSwarm | 19x21, 25x24, 30x27 | BATSWARM statbox `sprites = Sprite-Pipeestrello.png, -2.png, -3.png` | 19x21, 25x24, 30x27 | **VERIFIED** (see flag 3: the [Bat_Swarm](https://vampire.survivors.wiki/w/Bat_Swarm) event page's infobox note names only variants 1 and 2; the statbox names all three) |

**Score: 11 VERIFIED, 1 MISMATCH** (zombie variant 1, width off by 1 px,
derived radius unchanged).

## 2. Missing kinds

Derived radius = `floor(w x 0.4) x 800/456`, computed on the static frame
width.

| Kind | Frame (w x h) | floor(w x 0.4) | Derived radius | Source |
|---|---|---|---|---|
| giantBat (Woofer) | 50x39 | 20 | 35.09 | `Sprite-Giant Bat.png` 50x39, [Giant_Bat](https://vampire.survivors.wiki/w/Giant_Bat) statbox. Walk GIF canvas is 51x39 (union box, flag 2). Upload history: 50x39 since 2022-04-10 (2025 revert restored it). |
| silverBat (Silver Crown) | 27x25 | 10 | 17.54 | `Sprite-Pipeestrello-5.png` 27x25, BAT5 statbox on [Pipeestrello](https://vampire.survivors.wiki/w/Pipeestrello). **Matches Glowing Bat (27x25) exactly**, as expected. |
| werewolf (Howlback) | 32x34 | 12 | 21.05 | `Sprite-Werewolf.png` 32x34, [Werewolf](https://vampire.survivors.wiki/w/Werewolf) statbox. Walk GIF canvas 35x34 (union box, flag 2). |
| bigMummy (Gaffer Husk) | 37x50 | 14 | 24.56 | `Sprite-Big Mummy.png` 37x50, [Big_Mummy](https://vampire.survivors.wiki/w/Big_Mummy) statbox. Walk GIF canvas identical (37x50). |
| venus (Snare Bloom) | 51x50 | 20 | 35.09 | `Sprite-Venus.png` 51x50, [Venus](https://vampire.survivors.wiki/w/Venus) statbox. Walk GIF canvas identical (51x50). |

**ghostSwarm (Echo Rush): VERIFIED — reuses the ordinary Ghost frame.** The
`Ghost (swarm)` statbox (id GHOSTSWARM, on
https://vampire.survivors.wiki/w/Ghost) declares `image = Sprite-Ghost.png` —
the same 29x32 file as the normal blue Ghost. So ghostSwarm's frame is
29x32 (radius floor(11.6) = 11 → 19.30), identical to `ghost`.

## 3. The four Giant bosses vs the repo's "base kind x 1.5 sizeMul" lock

The wiki settles this directly. Each Giant's `Statbox Enemy` (an "unlisted
variant" on the base enemy's page) uses **the base enemy's own sprite file**,
and each carries the same explicit note: *"50% larger in size than the primary
variant (1.5x scale)."*

| Boss | Internal ID | Statbox sprite | Base frame | Wiki scale note | 1.5x effective size | Radius = base x 1.5 |
|---|---|---|---|---|---|---|
| Giant Mantichana | BOSS_XLMANTIS | Sprite-Mantichana.png | 48x47 | 1.5x | 72x70.5 | floor(48x0.4)=19 → 33.33 x 1.5 = **50.00** |
| Giant Werewolf | BOSS_WEREWOLF | Sprite-Werewolf.png | 32x34 | 1.5x | 48x51 | 12 → 21.05 x 1.5 = **31.58** |
| Giant Mummy | BOSS_XLMUMMY | Sprite-Big Mummy.png | 37x50 | 1.5x | 55.5x75 | 14 → 24.56 x 1.5 = **36.84** |
| Giant Blue Venus | BOSS_XLFLOWER | Sprite-Venus.png | 51x50 | 1.5x | 76.5x75 | 20 → 35.09 x 1.5 = **52.63** |

Sources: /w/Mantichana, /w/Werewolf, /w/Big_Mummy, /w/Venus (each boss
section's statbox wikitext, fetched raw 2026-07-21).

**Verdict: the repo's Giants-as-base-kind-x-1.5-sizeMul lock is CONFIRMED by
the source.** There is no separate Giant sprite sheet for any of the four; the
game scales the base variant's frames. (Giant Blue Venus is additionally
recolored blue in-game, but the statbox still binds it to `Sprite-Venus.png` —
the tint is a render effect, not a different-sized sprite; see flag 6 for the
name-collision trap.)

For completeness: the wiki's `Sprite-Giant Bat (boss).png` (80x77) belongs to
the *Ode to Castlevania* DLC boss of the same name, and `BOSS_XLBAT` appears
only in Boss Rash — Mad Forest's 8:00 boss-type Giant Bat is the normal
50x39 statline (consistent with the #172 doc).

## 4. Ambiguities / flagged items

1. **Zombie variant 1 mismatch (the only one).** Repo has 31x33; the wiki's
   `Sprite-Zombie.png` is 32x33 and its upload history shows 32x33 at both the
   original 2022-04-10 upload and the 2025-06-06 revert, so this is not a
   recent wiki edit. Derived radius is identical either way
   (floor(12.4) = floor(12.8) = 12), so the in-game hitbox is unaffected;
   only the recorded width is off by 1.
2. **Individual mid-walk frame sizes are unsourceable from the wiki.** The
   static `Sprite-*.png` is one frame at 1x; the animated GIF canvas is the
   union box of the 4-frame walk loop (e.g. Werewolf 35x34 vs static 32x34,
   Giant Bat 51x39 vs 50x39, Mantichana 58x47 vs 48x47, Mudman 1 37x35 /
   Mudman 2 37x37 vs 34x34, Zombie 1 34x35, Skeleton 1 30x36). Parsing the
   GIFs' internal frame rectangles gives encoder artifacts (full-canvas or
   diff-rects), not sprite bounds. So "per-frame" here means per visual
   variant (the repo's existing convention), and if VS's collider tracks the
   *active* atlas frame mid-animation, frames that differ by a few px from
   the static one cannot be confirmed from this source. The exact skeleton
   6-width match suggests the repo's convention and the wiki's static set
   share the same origin, which is reassuring but not proof for mid-walk
   frames.
3. **Bat Swarm sprite list, wiki-internal inconsistency.** The Bat_Swarm
   event page's infobox note says it "uses sprites of Little Pipeestrello
   [1] and Red-eyed Pipeestrello [2]" — omitting variant 3 — while the
   BATSWARM statbox on the Pipeestrello page declares
   `sprites = Sprite-Pipeestrello.png, -2.png, -3.png` (all three). The
   statbox is the structured, per-variant source and is taken as
   authoritative; the repo's three-entry batSwarm list matches it.
4. **Giant Bat partial hitbox.** The Giant_Bat page states the upper portion
   of its wings lacks collision. A 40%-of-width circle is therefore an
   approximation of a deliberately partial collider for this enemy.
5. **Boss mummy collider patch.** The Big_Mummy page's changelog notes
   "Updated collider on the boss mummy enemies" in a later game patch — the
   40%-width rule may not describe the current Giant Mummy collider exactly.
   No numeric collider data is published; unresolvable from this source.
6. **"Blue Venus" name collision.** The wiki file set `Sprite-Blue Venus.png`
   (54x54) / `Animated-Blue Venus.gif` (50x52) belongs to a different enemy:
   the *Ante Chamber* DLC's Blue Venus (id LEM_VENUS, released 2025-10-28,
   own page /w/Blue_Venus). It is **not** the Mad Forest Giant Blue Venus,
   whose statbox uses `Sprite-Venus.png` at 1.5x. Do not source the boss's
   frame from the 54x54 file.
7. **Bat3 recolors.** `Animated-Pipeestrello-3-Green/-Purple/-Yellow` (all
   30x27) are other stages' BAT3 recolors; Mad Forest's redBat2 is the base
   `-3` file. Same dimensions, so no impact.
