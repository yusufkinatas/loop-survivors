# Research: VS light source mechanics and drop tables (issue #196)

**Question:** How do Vampire Survivors light sources (braziers etc. — the
destructible stage props) work, mechanically and numerically: spawn logic, the
drop table and how Luck modifies it, how they break, and whether their drops
are exclusive to them or also come from enemies.

**Method:** Raw MediaWiki wikitext fetched with `?action=raw` on 2026-07-22.
The per-stage destructible table and the pickups table are rendered by Lua
modules from stage/pickup infobox data ("buckets"), so those two tables were
additionally fetched rendered via the MediaWiki API
(`/api.php?action=parse&page=...`) and cross-checked against the raw infobox
parameters of the individual pages (Mad Forest, each pickup).

**Sources (all fetched 2026-07-22):**

- Primary: [Light source](https://vampire.survivors.wiki/w/Light_source) (raw
  wikitext; `Brazier` is a redirect to it)
- [Module:DestructibleTable](https://vampire.survivors.wiki/w/Module:DestructibleTable)
  (raw Lua) + rendered `Light source` page via API (per-stage table)
- [Luck](https://vampire.survivors.wiki/w/Luck) (raw)
- [Mad Forest](https://vampire.survivors.wiki/w/Mad_Forest) (raw, infobox)
- [Pickups](https://vampire.survivors.wiki/w/Pickups) (raw) + rendered via API
  (`{{PickupsTable}}` output)
- Pickup pages (raw): [Floor Chicken](https://vampire.survivors.wiki/w/Floor_Chicken),
  [Rosary](https://vampire.survivors.wiki/w/Rosary),
  [Vacuum](https://vampire.survivors.wiki/w/Vacuum),
  [Orologion](https://vampire.survivors.wiki/w/Orologion),
  [Nduja Fritta Tanto](https://vampire.survivors.wiki/w/Nduja_Fritta_Tanto),
  [Gold Coin (pickup)](https://vampire.survivors.wiki/w/Gold_Coin_(pickup)),
  [Experience Gem](https://vampire.survivors.wiki/w/Experience_Gem)
- Exclusivity cross-checks (raw):
  [Sammy the Caterpillar](https://vampire.survivors.wiki/w/Sammy_the_Caterpillar),
  [Dairy Cart](https://vampire.survivors.wiki/w/Dairy_Cart)

---

## What a light source is

Light sources are destructible props that "randomly appear within stages and
drop pickups when destroyed" (Light source page). In Mad Forest they look like
braziers; the sprite varies by stage but the mechanics are shared. The Mad
Forest page states braziers are **the only destructible** in that stage. They
are inspired by Castlevania's candles (Light source, Trivia).

## 1. Spawn logic

All from the Light source page's "Spawn mechanics" section unless noted.

- **Spawn attempts:** the game attempts to spawn destructibles **every
  1 second** in all stages, except The Bone Zone (every 0.5 s) and Holy
  Forbidden (every 100 s). Mad Forest therefore uses the 1-second attempt.
- **Per-attempt chance:**
  `destructibleSpawnChance = mapDestructibleChance × totalLuck`, capped at the
  stage's maximum chance. (Same formula appears on the Luck page under
  "Respawn rate of light sources".) See the TotalLuck-units flag below.
- **Mad Forest values** (Mad Forest infobox, raw parameters `dchance = 10%`,
  `dchance-max = 50%`, `dmax = 10`):
  - base destructible chance **10%** per attempt
  - Luck-boosted chance capped at **50%**
  - maximum **10** light sources existing at once
  - These infobox values are identical across Normal / Hyper / Inverse (the
    infobox defines no `dchance2/3` overrides).
- **Placement:** "All destructibles spawn barely off-screen." Some stages
  ("such as Inlaid Library, Dairy Plant and Gallo Tower") have predetermined
  possible spawn locations; "in other maps they spawn in an oval shape around
  the character." Mad Forest is not named in the predetermined list, so the
  oval-around-the-player rule is the indicated behavior (see flag 2).
- **No collision between them:** "Light sources can spawn on top of each
  other."
- **At the cap:** spawn attempts do not cease at the cap. "If a light source
  is spawned at the limit, a new one will spawn in a location closest to the
  player, while the oldest existing light source will be despawned. As long as
  the maximum count remains capped, the spawn chance is not influenced by
  Luck, consequently severely reducing chances for a new Light Source in this
  scenario." (Quoted verbatim; the wording is odd — see flag 3.)
- **Other spawn paths** (out of scope for a plain Mad Forest run): the Mad
  Groove (VIII) Arcana and the Greatest Jubilee weapon can also produce light
  sources.

### Per-stage table (rendered `{{DestructibleTable}}`, base-game rows)

Values are each stage infobox's `dchance` / `dchance-max` / `dmax`; the module
just collects them. Base-game stages only (the full table also covers DLC
stages):

| Stage | Chance | Chance max | Max existing |
|---|---|---|---|
| **Mad Forest** | **10%** | **50%** | **10** |
| Inlaid Library | 7.5% | 50% | 10 |
| Green Acres | 10% | 50% | 10 |
| Dairy Plant | 20% | 60% | 10 |
| Il Molise | 30% | 60% | 10 |
| Gallo Tower | 7.5% | 50% | 10 |
| The Bone Zone | 40% | 40% | 10 |
| Moongolow | 30% | 60% | 10 |
| Holy Forbidden | 100% | 100% | 100 |
| Cappella Magna | 20% | 80% | 20 |
| Boss Rash | 10% | 50% | 5 |
| Eudaimonia Machine | 7.5% | 50% | 10 |
| Tiny Bridge | 7.5% | 50% | 10 |

## 2. Drop table

From the Light source page "Drops" section (weights) cross-checked against the
rendered Pickups table and each pickup's raw infobox (`rarity`, `level`,
`luck` parameters — all three agree unless flagged).

The pool is **weight-based** ("Rarity is the relative weight of the item in
the light source loot pool" — Pickups page). Items with weight 0 never drop.
"Min player level" is the character level in the current run below which the
item cannot drop ("Unlock level is the level at which the item becomes
available as a light source drop" — Pickups page). Base-game pool as it
applies to Mad Forest (the Light source table's availability columns only
carve out four special stages — Holy Forbidden, Eudaimonia Machine, The Bone
Zone, Bat Country — so Mad Forest gets the full pool):

| Pickup | Weight | Min level | Luck scales weight? | Effect |
|---|---|---|---|---|
| Gold Coin | 50 | 0 | No | +1 gold (× Greed) |
| Coin Bag | 10 | 0 | No | +10 gold (× Greed) |
| Floor Chicken | 12 | 0 | Yes | heals 30 HP |
| Orologion | 2 | 4 | Yes | freezes all enemies 10 s |
| Vacuum | 2 | 12 | Yes | collects all XP gems on the ground |
| Rich Coin Bag | 1 | 5 | Yes | +100 gold (× Greed) |
| Rosary | 1 | 8 | Yes | kills all enemies in sight (some immune) |
| Nduja Fritta Tanto | 1 | 0 | Yes | player breathes fire 10 s |
| Gilded Clover | 1 | 30 | Yes | collects all gold on ground, starts Gold Fever |
| Little Clover | 1 (or 0.5 — flag 5) | 0 | No | +10% Luck permanently this run |
| Rerollo | unknown (or 1 — flag 6) | 0 (per Pickups table) | No | +1 Reroll |

Sum of weights at level 0 with the Light source page's values: 50 + 10 + 12 +
1 + 1 + 1(+1 Rerollo?) — coins and coin bags dominate: roughly 2/3 Gold Coin,
~13% Coin Bag, ~16% Floor Chicken before Luck at level 0. (Derived
arithmetic, not a wiki statement.)

Not in a normal Mad Forest pool but listed with weights, for completeness:
Sorbetto (weight 1, but "only found in special places and generated by Arcana
XII"), Gold Finger (weight 0.02, level 30, DLC-era, Astral Stair-only until
Trisection is obtained), and DLC-stage/character pickups (Rapid Fire, Barrier,
Grenade, Wall Chicken, etc. — gated to their DLC stages/characters).
Experience Gem has a defined light-source payload ("Gives 50 XP (as a light
source drop)") but weight **0**, so it never actually drops (see flag 7).

### How Luck modifies the rolls

Two distinct effects, both with formulas given on the Luck page:

1. **Rarer drops.** "Luck increases the chance to get pickups other than Gold
   Coins and Coin Bags from light sources by increasing their weight
   (='rarity') in the item pool: `itemWeight = rarity × totalLuck`." So Gold
   Coin (50) and Coin Bag (10) keep fixed weights while every other item's
   weight is multiplied — Luck shifts the distribution toward chicken/rares
   but never removes coins from the pool.
2. **More spawns.** `destructibleSpawnChance = mapDestructibleChance ×
   totalLuck`, capped at the stage max (50% in Mad Forest).

`totalLuck` per the Luck page: the player has 100% base Luck; the stat panel
shows the difference from base ("+30%" = 130% total); bonuses stack
additively; no upper limit. "TotalLuck is ... equal to the displayed luck
percentage plus one hundred" (e.g. 130) — the formulas clearly intend the
multiplier reading (×1.3), see flag 1.

Item-specific weight multipliers (from the pickup pages): Seraphic Cry ×3 on
Rosary, Heart of Fire (XIX) Arcana ×4 on Nduja, Out of Bounds (XII) Arcana ×2
on Orologion.

## 3. How they break

- **HP:** "Light sources have 10 health" (Light source page). That is the
  entire wiki statement on durability — damage comes from weapons as normal;
  the wiki does not claim any hit destroys them regardless of damage. (For
  reference, a Sammy the Caterpillar enemy also has 10 HP and dies to typical
  early-weapon hits; the same is implied but not stated for braziers.)
- **Fire Wand unlock:** destroying 20 light sources unlocks the Fire Wand
  (Light source page).
- **Blocking movement:** **not documented.** No wiki page states whether light
  sources block player or enemy movement or projectiles. The only collision
  statement is that they "can spawn on top of each other" (flag 4).

## 4. Exclusivity: light sources vs enemy drops

The Pickups page opener: "Pickups are collectibles in Vampire Survivors
dropped by destroying light sources or by defeating enemies." The split, per
the wiki, in the base game:

- **Light-source-exclusive** (each page says "has a chance to drop from light
  sources" and names no enemy source): **Floor Chicken, Vacuum, Rosary,
  Orologion, Nduja Fritta Tanto, Rich Coin Bag, Gilded Clover, Little Clover,
  Rerollo**. Gold Coin's page calls it "the most common drop from light
  sources"; coins also arrive via Treasure Chests and Gold Fever, but no
  base-game enemy drops coins directly (exception: the "Stake to Your Heart"
  Arcana makes every defeated enemy drop a Gold Coin — an Arcana effect, not
  baseline).
- **Enemy drops:** enemies drop **Experience Gems** (Experience Gem page);
  bosses/strong enemies drop **Treasure Chests** ("Drops from bosses, not
  from light sources" — Pickups table note); certain enemies drop **Golden
  Egg** after the Yellow Sign is obtained. None of these come from light
  sources (gems have weight 0, chests and eggs are enemy-only per their
  notes).
- **DLC edge case worth knowing:** Sammy the Caterpillar (Lake Foscari, Tides
  of the Foscari DLC) drops a **Pie** on death — a 30 HP heal functionally
  equivalent to Floor Chicken. So "chicken-family heals only from props" is
  strictly true only for the base game / Mad Forest. Similarly, Vicious
  Hunger (Arcana) can turn enemies into Gold Coins.

**Answer for the Mad Forest analog:** in a plain base-game Mad Forest run,
braziers are the exclusive source of chicken, Vacuum, Rosary, Orologion,
Nduja, and all direct coin pickups; enemies give only XP gems, and bosses give
Treasure Chests.

## Ambiguities and contradictions (do not treat as verified)

1. **TotalLuck units.** The Luck page defines TotalLuck as "the displayed luck
   percentage plus one hundred" (so +30% → 130), then uses it in
   `spawnChance = mapChance × totalLuck` and `itemWeight = rarity ×
   totalLuck`. Taken literally, 10% × 130 is nonsense; every formula only
   works if TotalLuck is the multiplier form (1.3). The wiki never
   reconciles the two representations. The multiplier reading is the only
   coherent one and matches the worked examples elsewhere on the page (e.g.
   +54% Luck eliminating Pentagram's downside).
2. **Mad Forest placement pattern.** The predetermined-locations list is
   introduced with "In some stages, such as..." — non-exhaustive phrasing.
   Mad Forest is not named, and its open map plus the "oval around the
   character" alternative make oval-spawning the indicated behavior, but the
   wiki never says "Mad Forest spawns in an oval" outright.
3. **Cap behavior wording.** The at-the-cap paragraph both says a new light
   source *will* spawn (despawning the oldest) and that "the spawn chance is
   not influenced by Luck" while capped, "severely reducing chances." These
   two sentences don't obviously compose (does the chance revert to the base
   map chance while capped? is that the intended meaning of "not influenced
   by Luck"?). Transcribed verbatim above; the mechanic's exact numbers while
   capped are not settled by the wiki.
4. **Movement blocking.** Nowhere documented. Do not assume braziers are
   obstacles or that they aren't — the wiki is silent.
5. **Little Clover weight: 1 vs 0.5.** The Light source page's Drops table
   says weight 1; the rendered Pickups table (fed by the pickup infobox) says
   rarity 0.5. Direct contradiction between two wiki pages.
6. **Rerollo.** The Light source Drops table marks every Rerollo cell
   `{{unknown}}`; the Pickups table gives rarity 1, unlock level 0, Luck: No.
   Weaker sourcing than the rest of the pool.
7. **Luck-affected column vs prose.** The Light source page prose says Luck
   boosts "pickups other than Gold Coin and Coin Bag", but the Pickups table's
   "Drop rate affected by Luck" column also marks **Little Clover, Rerollo,
   Gold Finger and Sorbetto as No**. The table's per-item flags (mirrored in
   each pickup infobox's `luck` parameter) are the more specific source; the
   prose overgeneralizes. The table above uses the per-item flags.
8. **One pickup per brazier?** The wiki says light sources "drop pickups when
   destroyed" but never explicitly states that exactly one pickup drops per
   light source, nor whether a drop is guaranteed. The weight-table framing
   (a pool with relative weights, no "nothing" entry) implies one guaranteed
   roll per destruction, but that is inference, not a wiki statement.
9. **Experience Gem's phantom entry.** Weight 0 with a defined 50 XP payload
   "as a light source drop" suggests a disabled/vestigial pool entry. The wiki
   confirms weight-0 items never drop ("items with rarity 0 do not drop from
   light sources even if said level is reached" — Pickups page trivia).
