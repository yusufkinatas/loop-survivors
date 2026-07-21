# Research: Mad Forest wave table, transcribed verbatim (issue #171)

**Question:** Cell-by-cell transcription of the "Mad Forest waves" table from the
Vampire Survivors wiki, minutes 0–30, with every ambiguous cell cross-checked or
flagged.

**Method:** Instead of reading the rendered page (where template output like
"x3" is easy to misread), the raw MediaWiki wikitext of every relevant page was
fetched with `?action=raw` on 2026-07-21. The `{{map event}}` and `{{treasure}}`
template sources were read to decode exactly what each parameter renders as.
Cross-checked against the per-event wiki pages.

**Sources (all fetched 2026-07-21):**

- Primary: [Mad Forest](https://vampire.survivors.wiki/w/Mad_Forest) (raw wikitext)
- [Template:Map event](https://vampire.survivors.wiki/w/Template:Map_event) (raw)
- [Template:Treasure](https://vampire.survivors.wiki/w/Template:Treasure) (raw)
- [Bat Swarm](https://vampire.survivors.wiki/w/Bat_Swarm) (raw)
- [Ghost Swarm](https://vampire.survivors.wiki/w/Ghost_Swarm) (raw)
- [Flower Wall (event)](https://vampire.survivors.wiki/w/Flower_Wall_(event)) (raw)

---

## How to read the wiki's event notation (decoded from template source)

The rendered page shows events as e.g. `Bat Swarm 0:05 / 100% / x3`. From the
`Template:Map event` source, that line is built as:

- **`0:SS` offset** = the `delay` parameter, rounded to whole seconds, shown as
  an offset **within the minute**. `delay=5` renders `0:05`; `delay=15` renders
  `0:15`; `delay=1.2` renders `0:01`. The per-event pages confirm delay is the
  offset from the start of the minute ("Spawns precisely 1.2 seconds after the
  start of the minute" — Bat Swarm page, 20:01 row).
- **`chance` %** defaults to **100%** when the parameter is absent.
- **`xN`** = **`repeat + 1`** (the template literally computes
  `{{{repeat}}} + 1`). So wikitext `repeat=2` renders as `x3`. The safest
  reading: `repeat` = number of *extra* occurrences after the first, `xN` =
  total occurrences. When `repeat` is absent, no `xN` is shown (single
  occurrence).
- **`amount`** = "Amount per" — enemies spawned per occurrence. Almost never set
  in the table; the per-event pages give the defaults (below).
- **`duration`** = seconds the spawned formation lasts (used by Flower Wall).

Per-occurrence enemy counts (from the event pages, since the table omits them):

- **Bat Swarm** summons **50** swarm-variant Pipeestrellos per occurrence
  (Bat Swarm page; the 11:00 table row also sets `amount=50` explicitly,
  matching).
- **Ghost Swarm** summons **20** swarm-variant Ghosts per occurrence
  (Ghost Swarm page).
- **Flower Wall (event)** summons "a ring" of Flower Wall units around the
  player; **the count per ring is not stated anywhere on the wiki** (flagged
  below).

Swarms sweep in a straight line across the map (Fixed Direction) and push other
enemies; the Flower Wall ring slowly closes in and traps player and enemies
until defeated or expired.

## Stage-level spawn setup (infobox + intro)

- Spawn type: **Standard** — enemies appear from all four directions of the player.
- **Starting spawns: 10** (normal) / **15** (hyper) — infobox `starting-spawns`.
  Note this is *not* the same number as the 0:00 row's enemy minimum of 15;
  the wiki treats "starting spawns" (enemies placed at stage start) and "enemy
  minimum" (floor maintained by the spawner) as separate values.
- Enemy minimum multiplier: x1 normal, x1.25 hyper. Destructible (brazier)
  chance 10%, max 50%, cap 10 on screen.
- Naming caveat, quoted from the page itself: *"As official sources name only a
  few of the enemies, unit names are mostly made up based on their internal IDs
  with some creative flair added and may be subject to change."*

## The wave table, minute by minute

Notation: enemy lists preserve the wiki's order and duplicates. "min" = enemy
minimum; "int" = spawn interval in seconds. Events show the raw wikitext
parameters plus the decoded rendering. Treasure = the `{{treasure}}` block
attached to a boss (level / evolution flag / chance of 3-item, 2-item, 1-item
chest / non-default rewards).

| Min | Enemies | min | int |
|---|---|---|---|
| 0:00 | Red-Eyed Pipeestrello 2 | 15 | 1.0 |
| 1:00 | Zombie, Little Pipeestrello | 30 | 1.0 |
| 2:00 | Little Pipeestrello, Red-Eyed Pipeestrello 1, Red-Eyed Pipeestrello 2 | 50 | 0.5 |
| 3:00 | Skeleton | 40 | 0.25 |
| 4:00 | Skeleton, Ghost | 30 | 1.0 |
| 5:00 | Green Mudman | 10 | 1.0 |
| 6:00 | Zombie, Green Mudman | 20 | 0.5 |
| 7:00 | Red-Eyed Pipeestrello 1, Red-Eyed Pipeestrello 2, Gray Mudman | 80 | 0.5 |
| 8:00 | Zombie | 100 | 1.5 |
| 9:00 | Giant Bat, Zombie | 30 | 0.5 |
| 10:00 | Gray Mudman, Green Mudman | 10 | 0.5 |
| 11:00 | Skeleton | 300 | 0.1 |
| 12:00 | Werewolf, Ghost, Skeleton | 20 | 0.25 |
| 13:00 | Werewolf, Ghost (x2) | 150 | 0.5 |
| 14:00 | Giant Bat, Werewolf | 20 | 0.1 |
| 15:00 | Werewolf, Giant Bat, Green Mudman | 100 | 0.1 |
| 16:00 | Mantichana, Gray Mudman, Green Mudman | 100 | 0.1 |
| 17:00 | Big Mummy | 20 | 1.0 |
| 18:00 | Big Mummy, Gray Mudman | 60 | 0.5 |
| 19:00 | Big Mummy, Gray Mudman | 100 | 0.5 |
| 20:00 | Big Mummy, Green Mudman, Giant Bat | 100 | 0.1 |
| 21:00 | Flower Wall | 300 | 0.1 |
| 22:00 | Flower Wall, Big Mummy | 200 | 0.1 |
| 23:00 | Flower Wall, Big Mummy | 300 | 0.1 |
| 24:00 | Flower Wall, Big Mummy | 300 | 0.1 |
| 25:00 | Venus | 100 | 0.1 |
| 26:00 | Venus, Flower Wall | 150 | 0.1 |
| 27:00 | Big Mummy, Gray Mudman, Green Mudman | 300 | 0.1 |
| 28:00 | Giant Bat, Glowing Bat | 300 | 0.1 |
| 29:00 | Glowing Bat, Silver Bat | 300 | 0.1 |
| 30:00+ | — (none) | 1 | 60 |

The only intra-minute duplicate in the whole table is **13:00: "Ghost (x2)"** —
Ghost appears twice in that minute's spawn list.

Sprite-variant detail (may matter for tuning): several minutes reuse a display
name but a different sprite id in the wikitext — Skeleton uses sprite `Skeleton`
(3:00), `Skeleton-2` (4:00), `Skeleton-3` (11:00), `Skeleton-4` (12:00); Zombie
uses `Zombie` (1:00, 9:00), `Zombie-2` (6:00), `Zombie-3` (8:00); Flower Wall
alternates `Flower Wall` and `Flower Wall-1-2`. The wiki gives them one name;
the game internally distinguishes variants.

### Bosses & treasure

| Min | Boss(es) | Treasure (level / evo / 3-item% / 2-item% / 1-item% / reward notes) |
|---|---|---|
| 1:00 | Glowing Bat | 1 / evo yes / 0 / 0 / 30 |
| 3:00 | Glowing Bat | 1 / evo no / 0 / 5 / 40 / reward1=weapon |
| 5:00 | Mantichana | 1 / evo no / 1 / 5 / 100 / reward1=weapon |
| 7:00 | Glowing Bat | 2 / evo no / 3 / 10 / 50 / reward1=weapon |
| 8:00 | **Giant Bat** | **none listed** (no treasure block in the cell) |
| 9:00 | Silver Bat | 1 / evo no / 3 / 10 / 50 / reward1,4,5=weapon |
| 10:00 | Giant Mantichana | 1 / evo yes / 3 / 10 / 100 / reward4,5=weapon |
| 11:00 | Glowing Bat (Arcana holder) | 1 / evo no / 0 / 0 / 100 / reward1=Arcana |
| 12:00 | Glowing Bat | 1 / evo yes / 1 / 5 / 50 |
| 14:00 | Silver Bat | 1 / evo yes / 3 / 10 / 100 |
| 15:00 | Giant Werewolf | 1 / evo yes / 3 / 10 / 100 |
| 16:00 | Glowing Bat | 1 / evo yes / 1 / 5 / 50 |
| 18:00 | Silver Bat | 1 / evo yes / 3 / 10 / 100 |
| 20:00 | Giant Mummy | 1 / evo yes / 3 / 10 / 100 |
| 21:00 | Venus **and** Glowing Bat (Arcana holder) | 1 / evo no / 0 / 0 / 100 / reward1=Arcana |
| 22:00 | Glowing Bat | 1 / evo yes / 3 / 10 / 100 |
| 23:00 | Silver Bat | 1 / evo yes / 3 / 10 / 100 |
| 24:00 | Venus | none listed |
| 25:00 | Giant Blue Venus (first kill unlocks hyper) | 1 / evo yes / 3 / 10 / 100 |
| 27:00 | Glowing Bat | 1 / evo yes / 3 / 10 / 100 |
| 29:00 | Glowing Bat ("one of the Glowing Bats is a boss") | 1 / evo yes / 3 / 10 / 100 |
| 30:00+ | The Reaper — screen cleared of all enemies; one more Reaper spawns each minute past 30 | — |

Minutes 0, 2, 4, 6, 13, 17, 19, 26, 28 have no boss. Arcana-holder bosses
(11:00, 21:00) only spawn if Arcanas are enabled and their chest only awards an
Arcana (table Notes column).

### Map events

Raw wikitext parameters, then the decoded meaning. Offset = `delay` within the
minute; total occurrences = `repeat + 1`; chance defaults to 100%.

| Min | Event | Raw params | Decoded |
|---|---|---|---|
| 2:00 | Bat Swarm | `repeat=2, delay=5` | 2:05, 100%, x3 total, 50 bats each |
| 3:00 | Bat Swarm | `chance=10, repeat=1, delay=5` | 3:05, 10%, x2 total, 50 each |
| 4:00 | Bat Swarm | `chance=10, repeat=1, delay=5` | 4:05, 10%, x2 total, 50 each |
| 5:00 | Flower Wall | `chance=100, duration=30` | 5:00, 100%, one ring, lasts 30 s |
| 6:00 | Bat Swarm | `chance=10, repeat=1, delay=5` | 6:05, 10%, x2 total, 50 each |
| 7:00 | Bat Swarm | `chance=80, repeat=5, delay=5` | 7:05, 80%, x6 total, 50 each |
| 8:00 | Bat Swarm | `chance=80, repeat=2, delay=15` | 8:15, 80%, x3 total, 50 each |
| 9:00 | Bat Swarm | `chance=70, repeat=2, delay=15` | 9:15, 70%, x3 total, 50 each |
| 10:00 | Flower Wall | `chance=100, duration=60` | 10:00, 100%, one ring, lasts 60 s |
| 11:00 | Bat Swarm | `amount=50, chance=10, repeat=1, delay=5` | 11:05, 10%, x2 total, explicitly 50 each |
| 12:00 | Bat Swarm | `chance=10, repeat=1, delay=5` | 12:05, 10%, x2 total, 50 each |
| 13:00 | Ghost Swarm | `chance=70, repeat=20, delay=1.2` | 13:01 (precisely 1.2 s in), 70%, x21 total, 20 ghosts each |
| 13:00 | Ghost Swarm | `chance=70, repeat=20, delay=2.3` | 13:02 (precisely 2.3 s in), 70%, x21 total, 20 each |
| 15:00 | Flower Wall | `chance=80, duration=60` | 15:00, 80%, one ring, lasts 60 s — **contradicted by event page, see flags** |
| 20:00 | Bat Swarm | `chance=70, repeat=20, delay=1.2` | 20:01 (precisely 1.2 s in), 70%, x21 total, 50 each |
| 20:00 | Bat Swarm | `chance=70, repeat=20, delay=2.3` | 20:02 (precisely 2.3 s in), 70%, x21 total, 50 each |
| 25:00 | Flower Wall | `repeat=5, delay=10, duration=10` | 25:10, 100%, x6 total, each ring lasts 10 s |
| 27:00 | Ghost Swarm | *(no params)* | 27:00, 100%, single occurrence, 20 ghosts — "guaranteed to appear immediately at the start of the minute" (table note) |
| 27:00 | Ghost Swarm | `repeat=19, delay=3` | 27:03, 100%, x20 total, 20 each |
| 29:00 | Bat Swarm | *(no params)* | 29:00, 100%, single occurrence, 50 bats — guaranteed at the start of the minute (table note) |
| 29:00 | Bat Swarm | `repeat=19, delay=3` | 29:03, 100%, x20 total, 50 each |

Minutes with no map event: 0, 1, 14, 16, 17, 18, 19, 21, 22, 23, 24, 26, 28, 30+.

## The suspect cells from #171, resolved

- **"x3" / "x2" / "x6" repeat counts** — resolved. The rendered `xN` is
  `repeat + 1` computed by the template. 2:00 `repeat=2` → x3 total;
  3/4/6/11/12:00 `repeat=1` → x2 total; 7:00 `repeat=5` → x6 total. The raw
  `repeat` parameters above are exact wikitext values.
- **"x2, 50 per repeat"** — the 11:00 row. `amount=50, chance=10, repeat=1,
  delay=5`: 10% chance, two occurrences, 50 bats per occurrence. This matches
  the Bat Swarm page's general "summons 50 Pipeestrellos"; 50-per-occurrence
  holds for every Bat Swarm in the stage, not just 11:00.
- **0:05 vs 0:15 offsets** — resolved. `delay=5` (offset 0:05) for the Bat
  Swarms at 2, 3, 4, 6, 7, 11, 12; `delay=15` (offset 0:15) **only at 8:00 and
  9:00**. Independently confirmed by the Bat Swarm page's appearance list
  ("8:15", "9:15").
- **8:00 boss row** — resolved. The cell is exactly: boss **Giant Bat**, with
  **no treasure block** (one of only two boss rows without one; the other is
  24:00 Venus). Giant Bat also appears as a *regular* wave enemy at 9:00,
  14:00, 15:00, 20:00, 28:00, so at 8:00 it is the same species promoted to a
  boss spawn.

## Cells the wiki leaves ambiguous (do not treat as verified)

1. **15:00 Flower Wall duration — direct contradiction.** The Mad Forest table
   says `duration=60`; the Flower Wall (event) page's appearance list says
   "80% chance, lasts **30** seconds." Both agree on 80% chance. One page is
   wrong; the wiki does not say which.
2. **Repeat prose is internally inconsistent on the event pages.** For
   `repeat=20` rows (13:00, 20:00) the event pages say "repeats 20 times"
   (raw param = 21 total by the template's math), but for `repeat=19` rows
   (27:03, 29:03) they *also* say "repeats 20 times" (= 20 total). The raw
   `repeat` values transcribed above are exact; whether the game engine treats
   the value as "extra occurrences" (template math) or "total occurrences"
   (some prose) is not settled by the wiki. The template's explicit `+1`
   arithmetic is the stronger signal.
3. **Spacing between repeats.** The wiki renders `delay` as the offset of the
   first occurrence within the minute and labels it "Delay: N seconds", but
   never states outright that repeats are also spaced `delay` seconds apart.
   (It is the natural reading — e.g. 29:00's `repeat=19, delay=3` filling the
   minute — but the wiki doesn't say it.)
4. **Flower Wall ring size.** No page states how many Flower Wall units one
   ring contains.
5. **Enemy names are wiki inventions.** Per the page's own note, most names
   ("Red-Eyed Pipeestrello 2", "Little Pipeestrello", etc.) are made up from
   internal sprite/unit IDs and "may be subject to change." Also the 0:00 cell
   links its enemy to a standalone "Red-Eyed Pipeestrello" page while 2:00/7:00
   link the same sprite to `Pipeestrello#Pipeestrello 3` — same unit, two link
   styles.
6. **Starting spawns vs 0:00 minimum.** Infobox `starting-spawns = 10` (hyper
   15) while the 0:00 row's minimum is 15. The wiki gives no reconciliation;
   treat them as two different knobs (initial placement count vs maintained
   floor), not a typo.
7. **Treasure semantics.** The tier3/tier2/tier1 percentages are transcribed
   verbatim from the `{{treasure}}` parameters (rendered as chances for 3-item,
   2-item, 1-item chests). Several rows' percentages don't sum to 100
   (e.g. 1:00 is 0/0/30); the wiki does not document what happens in the
   remaining probability mass.
