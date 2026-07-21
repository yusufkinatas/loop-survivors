# Mad Forest 30-Minute Parity: The Locked Spec

This is the destination artifact of wayfinder map
[#170](https://github.com/yusufkinatas/loop-survivors/issues/170): the locked,
verified specification for replacing the current authored-act + endless
structure with the full 30-minute Vampire Survivors Mad Forest schedule at
exact 1x values, ending at 30:00 with a demo-end win screen. Implementation
issues are cut from this document; where this spec and older prose disagree,
this spec wins.

**Clean-room rule.** Only mechanics and numeric parameters are mirrored from
the Vampire Survivors wiki — no assets, code, art, names, or UI. All art is
original, all enemy names are this game's own Hush identities (the wiki's
names are its editors' inventions anyway, per the wiki itself).

**Provenance.** Every number here traces to one of three verified research
documents (all fetched 2026-07-21 from https://vampire.survivors.wiki raw
wikitext / MediaWiki API):

- [`research/mad-forest-wave-table.md`](research/mad-forest-wave-table.md) —
  the wave table, boss schedule, and map events, cell by cell.
- [`research/vs-enemy-stats-scaling.md`](research/vs-enemy-stats-scaling.md) —
  per-enemy statlines, scaling rules, spawn handling.
- [`research/vs-enemy-frame-sizes.md`](research/vs-enemy-frame-sizes.md) —
  sprite frame sizes and derived collision radii.

Decisions were locked ticket by ticket on the map; each section links its
ticket.

---

## 1. Run shape ([#176](https://github.com/yusufkinatas/loop-survivors/issues/176))

- A run is **30 authored minutes**. The wave table below is the whole stage
  script; there is nothing after it.
- **The endless system is removed entirely**: `src/game/tour.ts` recipes,
  `runEndlessDirector`, `endlessScale`, Amped variants, elite bosses, and the
  endless XP multiplier all go. No Reaper.
- **Density is exact 1x.** The current 3x-density pass (tripled minimums,
  starting spawns, swarm counts, ring counts) is dropped; the table's values
  are used verbatim.
- At **30:00 the run is won** (section 8).

## 2. Enemy roster ([#173](https://github.com/yusufkinatas/loop-survivors/issues/173), [#177](https://github.com/yusufkinatas/loop-survivors/issues/177), [#180](https://github.com/yusufkinatas/loop-survivors/issues/180))

### 2a. Structural rule: boss is a spawn property, not a kind property

`boss` leaves `EnemyConf` entirely. The same kinds spawn both as crowd enemies
and as bosses (Woofer: boss at 8:00, crowd at 9/14/15/20/28; Signal Crown,
Shearjaw, and Snare Bloom likewise). Boss-ness lives on the authored spawn
row: it sets `spawnClass: 'boss'`, which drives no-despawn behavior
(teleport-back, section 6), the chest drop, and the boss ring + glow (section
2e). Kind config holds stats only.

### 2b. Existing kinds, reused verbatim

Stats are already audit-verified against the wiki (see the stats research
doc). Frame sizes verified per the frame-size research doc. Radius formula
throughout: `floor(width × 0.4) × 800/456` (`legacyEnemyRadius`).

| Kind | Wiki enemy | HP | Power | Speed | XP | KB | HP×Level | Frames (w×h) | Note |
|---|---|---|---|---|---|---|---|---|---|
| `bat` | Little Pipeestrello | 1 | 5 | 140 | 1 | 1 | no | 19×21 | |
| `redBat` | Red-Eyed Pipeestrello 1 | 5 | 5 | 140 | 1 | 1 | no | 25×24 | |
| `redBat2` | Red-Eyed Pipeestrello 2 | 5 | 5 | 140 | 1 | 1 | no | 30×27 | |
| `zombie` | Zombie | 10 | 10 | 100 | 1 | 0.8 | no | 32×33, 31×33, 31×33 | variant 1 corrected 31→32 (radius-neutral) |
| `skeleton` | Skeleton | 15 | 10 | 100 | 2 | 1 | no | 28/32/32/34/32/34 ×33 | |
| `ghost` | Ghost | 10 | 5 | 200 | 1.5 | 0 | no | 29×32 | |
| `grayMudman` | Gray Mudman | 70 | 10 | 100 | 2.5 | 0.3 | no | 34×34 | |
| `greenMudman` | Green Mudman | 150 | 10 | 100 | 2.5 | 0.3 | no | 34×34 | |
| `flower` | Flower (Flower Wall) | 30 | 1 | 20 | 2 | 1 | **yes** | 26×26, 32×32 | ring event *and* crowd enemy (min 21–24, 26) |
| `mantis` | Mantichana | 500 | 20 | 80 | 3 | 0 | no | 48×47 | **loses `boss: true`**; renamed "The Shear" → **"Shearjaw"** |
| `glowingBat` | Glowing Bat | 50 | 10 | 140 | 30 | 1 | **yes** | 27×25 | **loses `boss: true`** |
| `batSwarm` | Bat Swarm | 1 | 1 | 700 | 1 | 1 | no | 19×21, 25×24, 30×27 | fixed-direction sweep; KB 1 is ours (wiki lists none) |

`dummy` survives as the sandbox measurement prop.

### 2c. New kinds

| Kind | Label | Wiki enemy | HP | Power | Speed | XP | KB | HP×Level | Frames | Radius |
|---|---|---|---|---|---|---|---|---|---|---|
| `giantBat` | **Woofer** | Giant Bat | 270 | 10 | 140 | 2.5 | 0.1 | no | 50×39 | 35.09 |
| `silverBat` | **Silver Crown** | Silver Bat | 50 | 10 | 140 | 30 | 1 | **yes** | 27×25 | 17.54 |
| `werewolf` | **Howlback** | Werewolf | 180 | 14 | 130 | 2 | 0.8 | no | 32×34 | 21.05 |
| `bigMummy` | **Gaffer Husk** | Big Mummy | 500 | 20 | 80 | 3 | 0 | no | 37×50 | 24.56 |
| `venus` | **Snare Bloom** | Venus | 500 | 20 | 80 | 3 | 0 | no | 51×50 | 35.09 |
| `ghostSwarm` | **Echo Rush** | Ghost Swarm | 1 | 1 | 700 | 1 | 1 | no | 29×32 (ghost) | 19.30 |

`silverBat` is deliberately a stat-copy of `glowingBat` (VS's own design: the
Silver Bat is a recolor). `bigMummy` and `venus` deliberately share
Shearjaw's 500/20/80/3 statline (VS's own design too). `ghostSwarm` is a
`batSwarm` copy with ghost sprites and a 20-per-occurrence count — the wiki
lists no separate statline for it, so these stats are **assumed** (flagged
deviation, section 9).

### 2d. The four Giants — distinct kinds, not promotions

All HP×Level, all `sizeMul: 1.5` on the base kind's frames (the wiki itself
confirms there are no separate Giant sprites — an explicit "1.5x scale" note),
all appearing only as `spawnClass: 'boss'` spawn rows. Promotion via
`scaleEliteBoss` was rejected: these are separate VS stat blocks whose values
don't derive from the base kind by any multiplier, and `scaleEliteBoss` sits
on `endlessScale`, which is deleted.

| Kind | Label | HP | Power | Speed | XP | KB | Radius (base × 1.5) |
|---|---|---|---|---|---|---|---|
| `giantMantis` | **Giant Shearjaw** | 150 | 20 | 160 | 50 | 0 | 50.00 |
| `giantWerewolf` | **Giant Howlback** | 200 | 20 | 130 | 2 | 0.1 | 31.58 |
| `giantMummy` | **Giant Gaffer Husk** | 250 | 20 | 80 | 25 | 0 | 36.84 |
| `giantBlueVenus` | **Giant Snare Bloom** | 150 | 30 | 160 | 50 | 0 | 52.63 |

Giants have *lower* base HP than their crowd kin on purpose: HP×Level is what
makes them durable (Giant Snare Bloom overtakes Snare Bloom's 500 HP from
player level 4). Giant Howlback's XP 2 is a verbatim VS oddity (the other
three give 25–50); its reward moment is the chest, not the gem. VS
freeze-resistance values are not mirrored (no freeze mechanic here).

### 2e. Removed kinds, and identity rules

**Removed:** `tank`, `darter`, `circler`, `splitter`, `shielded`, `swarmer`,
`elite`. Their defining traits are behaviors (dash, orbit, split-on-death,
shield pool) no Mad Forest enemy has; anything the mapping leaves unused is
dead code.

**Sound: enemies stay silent, by design.** The Hush is the silence the track
fights; the player's build owns the mix. Identity = name + silhouette +
color.

**Visuals:** family variants everywhere except **Woofer** (new speaker-cone
bat geometry) and **Howlback** (new lunging wolf geometry). Silver Crown =
Signal Crown's silhouette in silver; Echo Rush = the sweep drawn with
translucent ghost bodies (0.82 alpha); Snare Bloom = Mute Bloom's flower
function with jaws; Gaffer Husk = walker family with tape-wrap bands; Giants =
base silhouette at 1.5×, Giant Snare Bloom tinted blue.

**Color anchors** (exact hexes tuned in-engine): Woofer dark wine-red; Silver
Crown cool silver vs Signal Crown's gold; Howlback hot amber-orange; Gaffer
Husk charcoal; Snare Bloom plant green vs Mute Bloom's pink; Echo Rush ghost
purple; Giants inherit the base hue.

**Boss marking:** the white boss ring moves off kind silhouettes onto
`spawnClass: 'boss'` spawn rows, plus a soft breathing additive glow under the
boss. Crowd Shearjaws wear neither; the 8:00 boss Woofer wears both.

## 3. The wave table (verbatim, 1x)

One row per minute; `atS = minute × 60`. `pattern` uses this game's kind ids
(one spawn attempt creates one of every entry; duplicates are meaningful —
13:00's double `ghost` is the table's only intra-minute duplicate). `min` is
the maintained enemy floor, `int` the spawn interval in seconds.

| Minute | pattern | min | int |
|---|---|---|---|
| 0:00 | `redBat2` | 15 | 1.0 |
| 1:00 | `zombie`, `bat` | 30 | 1.0 |
| 2:00 | `bat`, `redBat`, `redBat2` | 50 | 0.5 |
| 3:00 | `skeleton` | 40 | 0.25 |
| 4:00 | `skeleton`, `ghost` | 30 | 1.0 |
| 5:00 | `greenMudman` | 10 | 1.0 |
| 6:00 | `zombie`, `greenMudman` | 20 | 0.5 |
| 7:00 | `redBat`, `redBat2`, `grayMudman` | 80 | 0.5 |
| 8:00 | `zombie` | 100 | 1.5 |
| 9:00 | `giantBat`, `zombie` | 30 | 0.5 |
| 10:00 | `grayMudman`, `greenMudman` | 10 | 0.5 |
| 11:00 | `skeleton` | 300 | 0.1 |
| 12:00 | `werewolf`, `ghost`, `skeleton` | 20 | 0.25 |
| 13:00 | `werewolf`, `ghost`, `ghost` | 150 | 0.5 |
| 14:00 | `giantBat`, `werewolf` | 20 | 0.1 |
| 15:00 | `werewolf`, `giantBat`, `greenMudman` | 100 | 0.1 |
| 16:00 | `mantis`, `grayMudman`, `greenMudman` | 100 | 0.1 |
| 17:00 | `bigMummy` | 20 | 1.0 |
| 18:00 | `bigMummy`, `grayMudman` | 60 | 0.5 |
| 19:00 | `bigMummy`, `grayMudman` | 100 | 0.5 |
| 20:00 | `bigMummy`, `greenMudman`, `giantBat` | 100 | 0.1 |
| 21:00 | `flower` | 300 | 0.1 |
| 22:00 | `flower`, `bigMummy` | 200 | 0.1 |
| 23:00 | `flower`, `bigMummy` | 300 | 0.1 |
| 24:00 | `flower`, `bigMummy` | 300 | 0.1 |
| 25:00 | `venus` | 100 | 0.1 |
| 26:00 | `venus`, `flower` | 150 | 0.1 |
| 27:00 | `bigMummy`, `grayMudman`, `greenMudman` | 300 | 0.1 |
| 28:00 | `giantBat`, `glowingBat` | 300 | 0.1 |
| 29:00 | `glowingBat`, `silverBat` | 300 | 0.1 |

There is no 30:00+ row: the run ends at 30:00 (section 8). Sprite-variant
rotation within a name (the wiki's Zombie-2 at 6:00, Skeleton-3 at 11:00,
etc.) is not mirrored per-minute; our kinds already draw uniformly from their
variant frame lists.

## 4. Event semantics ([#174](https://github.com/yusufkinatas/loop-survivors/issues/174))

The locked `StageEvent` type (successor to the current three-variant type in
`src/game/madforest.ts`):

```ts
/** Scheduling shared by repeatable events: occurrence i (0-based) fires at
 *  atS + i * spacingS; each occurrence independently rolls `chance`. */

export type StageEvent =
  | { atS: number; type: 'boss'; kind: EnemyKind; chest: boolean }
  | { atS: number; type: 'sweep'; kind: EnemyKind; countPer: number;
      chance: number; occurrences: number; spacingS: number }
  | { atS: number; type: 'flowerWall'; kind: 'flower'; ringCount: number;
      durationS: number; chance: number; occurrences: number; spacingS: number };
```

Encoding rules:

- **One data row per wiki table cell** (~21 event rows + 22 boss rows, not ~85
  unrolled), so the data file verifies line-by-line against the research doc.
  The director unrolls occurrences at runtime.
- **`chance` is rolled per occurrence**, never once per group (the wiki's own
  "Repeats (max)" label corroborates: the repeat count is a maximum).
- **Spacing = the wiki's delay**: the single delay value is both the first
  occurrence's offset from the minute start and the gap between occurrences.
  The row's `atS` already includes the offset. The 13:00/20:00 storm minutes
  (delay 1.2 s / 2.3 s, ×21) intentionally compress into the front half of
  their minute.
- **`sweep`** replaces `batSweep` and covers Bat Swarm and Ghost Swarm — the
  wiki confirms word-for-word identical mechanics (straight line across the
  map, pushes other enemies). `countPer` = 50 (bats) / 20 (ghosts).
- **Flower Wall as a wave enemy** (minutes 21–24, 26) is not an event — it's
  the `flower` kind in those minutes' `pattern`, like any other enemy.

### 4a. Boss schedule (22 rows)

Bosses fire at the exact minute start, always (no chance, no repeats).
`chest: false` on exactly two rows — 8:00 and 24:00 — where the wikitext
genuinely carries no treasure block. The wiki's two Arcana-holder bosses
(11:00, 21:00 Glowing Bat) become plain chest bosses (Arcana is out of
scope). 21:00 is a double boss: two rows at one timestamp.

| At | kind | chest |
|---|---|---|
| 1:00 | `glowingBat` | yes |
| 3:00 | `glowingBat` | yes |
| 5:00 | `mantis` | yes |
| 7:00 | `glowingBat` | yes |
| 8:00 | `giantBat` | **no** |
| 9:00 | `silverBat` | yes |
| 10:00 | `giantMantis` | yes |
| 11:00 | `glowingBat` | yes |
| 12:00 | `glowingBat` | yes |
| 14:00 | `silverBat` | yes |
| 15:00 | `giantWerewolf` | yes |
| 16:00 | `glowingBat` | yes |
| 18:00 | `silverBat` | yes |
| 20:00 | `giantMummy` | yes |
| 21:00 | `venus` | yes |
| 21:00 | `glowingBat` | yes |
| 22:00 | `glowingBat` | yes |
| 23:00 | `silverBat` | yes |
| 24:00 | `venus` | **no** |
| 25:00 | `giantBlueVenus` | yes |
| 27:00 | `glowingBat` | yes |
| 29:00 | `glowingBat` | yes |

Chest contents stay the slot-machine ceremony (#164) — the wiki's per-chest
treasure tiers are recorded in the research doc but deliberately unused.

### 4b. Sweep and Flower Wall rows (21 rows)

`atS` shown as m:ss.s of the first occurrence (= minute start + wiki delay).

| First at | Event | kind | countPer | chance | occurrences | spacingS | durationS |
|---|---|---|---|---|---|---|---|
| 2:05 | sweep | `batSwarm` | 50 | 100% | 3 | 5 | — |
| 3:05 | sweep | `batSwarm` | 50 | 10% | 2 | 5 | — |
| 4:05 | sweep | `batSwarm` | 50 | 10% | 2 | 5 | — |
| 5:00 | flowerWall | `flower` | ring 100 | 100% | 1 | — | 30 |
| 6:05 | sweep | `batSwarm` | 50 | 10% | 2 | 5 | — |
| 7:05 | sweep | `batSwarm` | 50 | 80% | 6 | 5 | — |
| 8:15 | sweep | `batSwarm` | 50 | 80% | 3 | 15 | — |
| 9:15 | sweep | `batSwarm` | 50 | 70% | 3 | 15 | — |
| 10:00 | flowerWall | `flower` | ring 100 | 100% | 1 | — | 60 |
| 11:05 | sweep | `batSwarm` | 50 | 10% | 2 | 5 | — |
| 12:05 | sweep | `batSwarm` | 50 | 10% | 2 | 5 | — |
| 13:01.2 | sweep | `ghostSwarm` | 20 | 70% | 21 | 1.2 | — |
| 13:02.3 | sweep | `ghostSwarm` | 20 | 70% | 21 | 2.3 | — |
| 15:00 | flowerWall | `flower` | ring 100 | 80% | 1 | — | **60** |
| 20:01.2 | sweep | `batSwarm` | 50 | 70% | 21 | 1.2 | — |
| 20:02.3 | sweep | `batSwarm` | 50 | 70% | 21 | 2.3 | — |
| 25:10 | flowerWall | `flower` | ring 100 | 100% | 6 | 10 | 10 |
| 27:00 | sweep | `ghostSwarm` | 20 | 100% | 1 | — | — |
| 27:03 | sweep | `ghostSwarm` | 20 | 100% | 20 | 3 | — |
| 29:00 | sweep | `batSwarm` | 50 | 100% | 1 | — | — |
| 29:03 | sweep | `batSwarm` | 50 | 100% | 20 | 3 | — |

Two wiki ambiguities resolved by decision: the **15:00 wall lasts 60 s** (the
wave table's `duration=60` wins over the event page's contradicting "30
seconds" — table primacy); rendered **×N = wikitext `repeat` + 1** total
occurrences (the template's own arithmetic). **`ringCount: 100`** is invented
— the wiki nowhere states ring size; 100 is the de-tripled current value
(300 at 3x), the only playtested signal. Tunable.

## 5. Scaling ([#172](https://github.com/yusufkinatas/loop-survivors/issues/172))

Exactly one scaling mechanism operates in this game's normal-mode mirror:

- **HP×Level**: max HP = base HP × player level, evaluated once at spawn,
  never re-evaluated. Carriers: `flower`, `glowingBat`, `silverBat`, and the
  four Giants. Nobody else — including the normal-statline boss spawns (5:00
  Shearjaw, 8:00 Woofer, 21:00/24:00 Snare Bloom).
- **No time-based ramp exists.** No per-minute HP/power/speed growth, no
  minute-multiplier layers of our own. Difficulty is carried entirely by the
  wave table: stronger variants, higher minimums, shorter intervals.
- The stage-wide **×1.1 enemy speed** modifier stays baked into
  `ENEMY_SPEED_UNIT` (already matches the wiki infobox).
- VS's Curse mechanic has no equivalent here and is not mirrored.

## 6. Spawn handling ([#172](https://github.com/yusufkinatas/loop-survivors/issues/172), [#179](https://github.com/yusufkinatas/loop-survivors/issues/179))

- **Stage entry**: 10 starting spawns (de-tripled from 30). The wiki doesn't
  say which pool fills the batch; ours stays the minute-0 kind (`redBat2`).
- **Quota semantics**: below the wave minimum, spawns refill until the quota
  is met; at/above it, one of each `pattern` entry spawns per interval tick
  (the existing `StageWave` semantics already match this).
- **Caps**: at **300+ alive**, periodic spawning stops — only boss rows and
  event enemies (sweeps, Flower Wall rings) still spawn. **500 absolute cap**
  on total alive.
- **Despawn**: regular enemies recycle by distance as today (the wiki leaves
  the distance unquantified; current engine behavior stands). Enemies from
  `spawnClass: 'boss'` rows never despawn — they teleport to a random point
  at spawn distance around the player, which is already the live behavior in
  `run.ts`. The random landing spot is a documented micro-deviation (the wiki
  says only "teleported back to the screen").
- A boss alive at 30:00 is swept chestless like everything else — its chest
  is forfeit (no-drops rule, section 8). No special case in code.

## 7. XP economy ([#178](https://github.com/yusufkinatas/loop-survivors/issues/178))

**Verbatim across the board — the deviation list is empty.**

- Per-enemy XP values, the VS-exact level curve (`xpForNextLevel`, including
  the level-20/40 XP walls and their +100% pickup bonus), and the 1x table
  are one economy taken together. The current build's faster leveling was a
  3x-density artifact and dies with it. The endless `xpMul` (+1.5%/min) and
  amped 3x XP vanish with the endless era — no replacement layer.
- The minute 28–29 flood (XP-30 `glowingBat`/`silverBat` as 300-minimum crowd
  enemies) is VS's intentional finale firehose, kept verbatim — here it
  doubles as an audio crescendo (gem-pickup pitch rides the XP bar) straight
  into the win screen.
- **One code change, a parity fix**: the `spawnGem` random roll
  (`floor((rng + 0.5) × xp)`, min 1) systematically underpays mid-value
  enemies (~20–25% hidden XP tax). It is deleted: a kill drops a gem worth
  exactly the enemy's XP, as VS does. Gems carry fractional values as-is
  (ghost 1.5, mudmen 2.5, `giantBat` 2.5) — the integer floor in `spawnGemAt`
  goes with the roll.

## 8. Demo end at 30:00 ([#176](https://github.com/yusufkinatas/loop-survivors/issues/176))

**Trigger & transition.** At exactly 30:00 the run is won: spawning stops,
the player becomes untouchable, and every live enemy dies in a quick outward
sweep wave (a nod to VS's stage-end clear, without the Reaper). Swept enemies
drop no XP and grant no kill credit. A ~2–3 second beat of empty, quiet stage
follows, then the win screen.

**Music.** The track plays to the end of its current bar (the few-second
musical measure in progress) so it stops on the beat, not mid-phrase; then an
authored win flourish — a bright counterpart of the existing game-over cue,
same instrument palette — rings out into the silence. It fills the
empty-stage beat.

**Win screen.** Reuses the death-screen skeleton (the `_victory` flag already
plumbed through `endRun`/`showEnd` finally gets used):

- Eyebrow: **THE HUSH COULDN'T STOP YOU** · Title: **SET COMPLETE**
- Stats line unchanged (time · kills · level · notes)
- New demo-end block above the settlement panel: **THAT'S THE DEMO** —
  "Congratulations, you played the whole set. Thanks for playing, I
  appreciate any feedback! Reach the developer at yusufkinatas.com" — with
  yusufkinatas.com as a real clickable link opening in a new tab.
- Settlement panel stays (notes bank as normal). "ONE MORE SET" button stays.
- Any leftover level-up queue is discarded.

## 9. Deviations & inventions ledger

Everything that is *not* a verbatim wiki value, in one place:

1. **Demo end instead of the Reaper** at 30:00 (the defining scope decision).
2. **`ringCount: 100`** for Flower Wall rings — wiki states no ring size;
   de-tripled playtested value; tunable.
3. **`ghostSwarm` stats assumed** to be a `batSwarm` copy — the wiki lists no
   separate statline (only the 20-count and identical sweep behavior).
4. **`batSwarm`/`ghostSwarm` knockback 1** — the wiki lists none.
5. **Arcana-holder bosses (11:00, 21:00) become plain chest bosses** — no
   Arcana system.
6. **Chest contents** stay the slot-machine ceremony, not VS treasure tiers.
7. **Boss teleport-back lands at a random spawn-ring point** — the wiki
   doesn't specify where on screen.
8. **Starting-spawn pool = minute-0 kind** — the wiki doesn't say which pool
   fills the initial batch.
9. **15:00 wall = 60 s** — resolves a genuine wiki self-contradiction (table
   primacy).
10. **Sprite-variant-per-minute rotation not mirrored** — kinds draw
    uniformly from their variant lists.
11. **Despawn distance** stays the current engine value — the wiki leaves it
    unquantified.
12. **Zombie variant 1 frame corrected to 32×33** (wiki value; repo had
    31×33) — radius-neutral.
13. **No freeze-resistance mirror** — no freeze mechanic in this game.
14. **Names, art, and audio identity are original** (clean-room; enemies stay
    silent by design).

Known approximations inherited from the source: Giant Bat's wings don't
collide in VS and a VS patch altered the boss-mummy collider, so the
40%-of-width circle is an approximation for Woofer and Giant Gaffer Husk.

## 10. Removals ([#181](https://github.com/yusufkinatas/loop-survivors/issues/181) and map decisions)

The full deletion list implementation issues draw from:

- **Endless era**: `tour.ts` recipes, `runEndlessDirector`, `endlessScale`,
  `scaleEliteBoss`, Amped variants, endless `xpMul`.
- **Kinds**: `tank`, `darter`, `circler`, `splitter`, `shielded`, `swarmer`,
  `elite`.
- **`boss` flag on `EnemyConf`** → `spawnClass: 'boss'` on spawn rows; the
  baked-in boss ring moves to spawn rows + breathing glow.
- **Pressure UI**: both PRESSURE toasts (`lastWarningMinute` timer), minute
  ring formations, the `band` field and its danger diamonds
  (`soundwood-shapes.ts`), `updateArenaMinute`.
- **Tempo ramp**: `engine.clock.bpm` no longer rises with the minute — the
  whole 30-minute set plays at a constant tempo. (Tempo stays a reserved
  design lever per `plan.md`; any future tempo drama is a new authored
  decision.)
- **3x density pass**: tripled minimums, starting spawns (30 → 10), swarm
  counts (150 → 50), ring counts (300 → 100).
- **Gem value roll** + integer floor in `spawnGemAt` (section 7).

## 11. `docs/plan.md` edits (done alongside this spec)

- **Pillar 5** replaced with: "**A run is a 30-minute authored set.** The
  Hush's assault follows an authored schedule from the first bar to the last;
  surviving all 30 minutes is victory, and the stage clears when the set
  completes. A run ends early only when The Hush overwhelms the player. There
  is no endless escalation."
- **Run Shape** prose rewritten to match (no 8-minute opening act, no endless
  director, no per-minute scaling, no tempo lift; "elite" language dropped
  from the chest paragraph).

## 12. Left open (deliberately)

- Exact hex colors for the new kinds (anchors locked, tuned in-engine).
- The win-flourish composition (authored during implementation).
- `ringCount` tuning if 100 plays badly at 1x density.
- Post-build balance tuning against this game's player-power curve — a
  follow-up effort, out of this spec's scope.
