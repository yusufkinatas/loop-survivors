# Vampire Survivors: passive item level progressions

Research for issue #195 (part of #193). Answers three questions against the
official wiki (https://vampire.survivors.wiki, a wiki.gg site): the max level
of every base-game passive item, the per-level bonus values (verbatim) for
the passives whose verbs map to ours, and the actual evolution requirement —
does the paired passive need to be max level, or merely owned?

Fetched 2026-07-22. Primary sources are the per-item wiki pages, read as raw
wikitext via the MediaWiki `?action=raw` endpoint (e.g.
`https://vampire.survivors.wiki/w/Spinach?action=raw`), cross-checked against
the list page (/w/Passive_items) and the mechanics page (/w/Evolution). Each
table cites its page. Quoted sentences and cell texts are verbatim from the
wiki. Where the wiki contradicts itself it is flagged in the final section —
nothing there is guessed.

**Naming notes.** The wiki has renamed some items, as it did with enemies:
the item commonly known as "Tiragisú" lives at /w/Tirajisú (both `Tiragisu`
and `Tirajisu` redirect there). "Armor" the passive item lives at
/w/Armor_(item) — plain /w/Armor is a disambiguation page (the *stat* is a
separate page, /w/Armor_(stat)). This document uses the wiki's current
spellings.

**Reading the tables.** "Per-level" and "Max effect" are the wiki infobox's
`per-level` / `max-effect` fields, verbatim. "Stacking" is the infobox's
`stacking` field: *Additive* means each level adds a flat bonus to the stat;
*Multiplicative* means each level multiplies the stat's *current* value, so
the levels compound.

## 1. The 5-level norm, and every base-game exception

The Duplicator page's Trivia states the norm outright: "Duplicator and
Tirajisú are the only passive items with a max level of 2 instead of the
usual 5." (https://vampire.survivors.wiki/w/Duplicator, Trivia.)

So among the **normal** base-game passives, 5 levels is the rule and exactly
two items break it (Duplicator and Tirajisú, both at 2). The base game's
**special** passives — Torrona's Box plus the four Yellow-Sign pickups
(Silver Ring, Gold Ring, Metaglio Left, Metaglio Right) — all have 9 levels.
Notably, **Spellbinder and Armor are NOT exceptions**: both are ordinary
5-level passives (see their rows below).

Full roster, from each item's infobox (`max-level`, `per-level`, `stacking`,
`max-effect` fields, verbatim) cross-checked against /w/Passive_items:

### 1a. Normal passive items

| Item | Stat | Max level | Per-level | Stacking | Max effect |
|---|---|---|---|---|---|
| Spinach | Might | 5 | +10% | Additive | +50% |
| Armor | Armor | 5 | -1 (see note) | Additive | -5 |
| Hollow Heart | Max Health | 5 | +20% | Multiplicative | +149% |
| Pummarola | Recovery | 5 | +0.2 | Additive | +1.0 |
| Empty Tome | Cooldown | 5 | -8% | Additive | -40% |
| Candelabrador | Area | 5 | +10% | Additive | +50% |
| Bracer | Speed (projectile speed) | 5 | +10% | Additive | +50% |
| Spellbinder | Duration | 5 | +10% | Additive | +50% |
| **Duplicator** | Amount | **2** | +1 | Additive | +2 |
| Wings | Move Speed | 5 | +10% | Additive | +50% |
| Attractorb | Magnet (pickup radius) | 5 | *"See table."* | Multiplicative | +300% |
| Clover | Luck | 5 | +10% | Additive | +50% |
| Crown | Growth (XP gain) | 5 | +8% | Additive | +40% |
| Stone Mask | Greed (gold gain) | 5 | +10% | Additive | +50% |
| Skull O'Maniac | Curse | 5 | +10% | Additive | +50% |
| **Tirajisú** | Revival | **2** | +1 | Additive | +2 |
| **Torrona's Box** | Might, Speed, Duration, Area, Curse | **9** | *"See table."* | Additive | +25%, +100% |
| Parm Aegis | invulnerability time | 5 | +50ms | Additive | +250ms |
| Karoma's Mana | Charm (+ Gold Fever/Finger duration) | 5 | +10 / +10% | Additive | +50 / +50% |

Sources: https://vampire.survivors.wiki/w/Spinach, /w/Armor_(item),
/w/Hollow_Heart, /w/Pummarola, /w/Empty_Tome, /w/Candelabrador, /w/Bracer,
/w/Spellbinder, /w/Duplicator, /w/Wings, /w/Attractorb, /w/Clover, /w/Crown,
/w/Stone_Mask, /w/Skull_O'Maniac, /w/Tirajisú, /w/Torrona's_Box; Parm Aegis
and Karoma's Mana rows from the /w/Passive_items list table (their rows sit
in the same "List of Passive Items" table as the other seventeen — but see
ambiguity 1 about whether the wiki counts them as base game).

Armor sign note: the infobox writes Armor's per-level as `-1` / max `-5`
(damage delta); the page prose and the list page state the same thing
positively: "Armor increases Armor by 1 per level, reducing all damage dealt
to the player by 1. It cannot reduce damage to 0." Armor's level bonus also
carries a second stat: +10% Retaliatory Damage per level (max +50%).

### 1b. Special passive items (Yellow Sign pickups)

All four are stage pickups, not level-up choices; their level 1 is the
pickup itself and gives no stats (see section 4).

| Item | Stat | Max level | Per-level | Stacking | Max effect |
|---|---|---|---|---|---|
| Silver Ring | Duration, Area | 9 | +5% | Additive | +40% each |
| Gold Ring | Curse | 9 | +5% | Additive | +40% |
| Metaglio Left | Recovery, Max Health | 9 | +0.1, +5% | Additive, Multiplicative | +0.8, +47.7% |
| Metaglio Right | Curse | 9 | +5% | Additive | +40% |

Sources: https://vampire.survivors.wiki/w/Silver_Ring, /w/Gold_Ring,
/w/Metaglio_Left, /w/Metaglio_Right, and the "Rings and Metaglios" section
of /w/Passive_items.

## 2. Per-level bonuses, verbatim, for the eleven mapped passives

Each item's Levels table from its own page. Level-1 cells are the item's
pickup description (the wiki quotes them); level-2+ cells are the in-game
level-up text. For the uniform items every level gives the same bonus — the
table text is identical in every cell, so it is quoted once with the range
of levels it covers.

### 2a. Uniform 5-level items (same bonus every level)

| Item | Level 1 (verbatim) | Levels 2–5 (verbatim, each) | Max total |
|---|---|---|---|
| Wings | "Character moves 10% faster." | "Movement speed increases by 10%" | +50% Move Speed |
| Bracer | "Increases projectiles speed by 10%." | "Base speed up by 10%" | +50% Projectile Speed |
| Candelabrador | "Augments area of attacks by 10%." | "Base area up by 10%" | +50% Area |
| Spinach | "Raises inflicted damage by 10%." | "Base damage up by 10%" | +50% Might |
| Spellbinder | "Increases duration of weapon effects by 10%." | "Effect lasts 10% longer" | +50% Duration |
| Armor | "Reduces incoming damage by 1. Increases retaliatory damage by 10%." | "Reduces incoming damage by 1." | +5 Armor, +50% Retaliatory Damage |
| Pummarola | "Character recovers 0.2 HP per second." | "Health recovery increases by 0.2 HP per second." | +1 Recovery |
| Empty Tome | "Reduces weapons cooldown by 8%." | "Cooldown reduced by 8.0%" | -40% Cooldown |

Sources: the ==Levels== section of each item's page (URLs in section 1a).
Each page also states the count in prose, e.g. "Wings have 5 levels. At max
level, Wings provide +50% Move Speed."

### 2b. Duplicator (2 levels)

"Duplicator has 2 levels. At max level, Duplicator provides +2 Amount."

| Level | Description (verbatim) |
|---|---|
| 1 | "Weapons fire more projectiles." |
| 2 | "Fires 1 more projectile." |

Level 1 already grants +1 Amount (per-level +1, max +2 in the infobox).
Source: https://vampire.survivors.wiki/w/Duplicator.

### 2c. Hollow Heart (5 levels, multiplicative)

"Hollow Heart has 5 levels. Each of them multiplies the current value of
Max Health by 1.2."

| Level | Description (verbatim) | Effect total (verbatim) |
|---|---|---|
| 1 | "Augment max health by 20%." | 1.2x Max Health |
| 2 | "Max health increases by 20%" | 1.44x Max Health |
| 3 | "Max health increases by 20%" | 1.728x Max Health |
| 4 | "Max health increases by 20%" | 2.0736x Max Health |
| 5 | "Max health increases by 20%" | 2.48832x Max Health |

The Tips section adds: the multiplier applies to the *current* total, not
the original, and "Hollow Heart does not heal to fill up the newly increased
Max Health." Source: https://vampire.survivors.wiki/w/Hollow_Heart.

### 2d. Attractorb (5 levels, multiplicative, non-uniform)

"Attractorb has 5 levels. Unlike other passive items, each level provides a
different sized bonus." This is the only 5-level base-game passive whose
per-level value varies by level.

| Level | Description (verbatim) | Effect total (verbatim) |
|---|---|---|
| 1 | "Character picks up items from further away." | 1.5x Magnet |
| 2 | "Pickup range increased by 33%." | 1.995x Magnet |
| 3 | "Pickup range increased by 25%." | 2.49375x Magnet |
| 4 | "Pickup range increased by 20%." | 2.9925x Magnet |
| 5 | "Pickup range increased by 33%." | 3.980025x Magnet |

Tips: "Each level up approximate to a round multiplier of 1.5x, 2x, 2.5x,
3x, and 4x respectively" — i.e. the odd-looking per-level percentages exist
to land the compounded total on round numbers. Source:
https://vampire.survivors.wiki/w/Attractorb.

### 2e. Torrona's Box (9 levels, for reference)

Included because it is the base game's one 9-level level-up passive — its
shape (front-loaded level 1, flat middle, a penalty capstone) is a design
data point.

| Level | Description (verbatim) |
|---|---|
| 1 | "Cursed item, but increases Might, Projectile Speed, Duration, and Area by 4%." |
| 2–8 | "Increases Might, Projectile Speed, Duration, and Area by 3%." (each) |
| 9 | "Increases enemy speed, health, quantity, and frequency by 100%." |

So: +4% then +3% x7 = +25% to all four stats, and the final level is a pure
downside (+100% Curse). Source: https://vampire.survivors.wiki/w/Torrona's_Box.

## 3. The evolution requirement: weapon max, passive merely owned

From https://vampire.survivors.wiki/w/Evolution, Mechanics, verbatim:

> "To evolve or unite a weapon, or to obtain a gift, the player needs to
> fulfill following conditions:
> - The player must have a fully leveled base weapon and its counterpart
>   (required level varies by case) in their inventory.
>   - In case of union, both base weapons must be fully leveled up. This may
>     also require a passive item counterpart.
>   - In the case of Infinite Corridor, Crimson Shroud, Sole Solution,
>     Ashes of Muspell, most of the weapons after Version 1.0 and from the
>     DLCs, all related passive items must also be fully leveled.
>   - In case of Bracelet, Bi-Bracelet, and Super Candybox II Turbo, and
>     choices from Penshin Fatcha, a passive item is not needed.
> - The player must then collect a Treasure Chest that contains an evolution
>   type reward. [...]"

Unpacked:

- **The weapon must be at max level. The passive does not** — for the
  classic base-game evolutions (Whip→Bloody Tear, Magic Wand→Holy Wand,
  Knife→Thousand Edge, Axe→Death Spiral, King Bible→Unholy Vespers,
  Fire Wand→Hellfire, Garlic→Soul Eater, Santa Water→La Borra,
  Runetracer→NO FUTURE, Lightning Ring→Thunder Loop, etc.), the paired
  passive only needs to be **in the inventory at any level** ("its
  counterpart (required level varies by case)"). The hedge "required level
  varies by case" is the wiki's only wording for the owned-vs-maxed split;
  the per-case resolution lives in the per-item evolution templates (next
  bullet).
- **Later evolutions do gate on passive max level.** The rule names
  Infinite Corridor, Crimson Shroud, Sole Solution, Ashes of Muspell, and
  "most of the weapons after Version 1.0 and from the DLCs". Per-item pages
  mark exactly these cases: each passive's `{{Passive evolutions}}` template
  sets `passive max = yes` on the evolutions that need the passive fully
  leveled, and the page prose spells it out, e.g. Bracer: "It is also
  required for the evolution of Flash Arrow into Millionaire, in which
  Bracer must be fully leveled" — while Knife→Thousand Edge on the same
  page carries no such clause and no `passive max` flag. The same
  owned-vs-maxed split appears on every passive page fetched (e.g.
  Spellbinder: King Bible→Unholy Vespers unflagged, Mille Bolle
  Blu→Boo Roo Boolle "in which Spellbinder must also be fully leveled").
- **A treasure chest triggers it.** Meeting the level conditions does
  nothing by itself; the player must collect a boss-dropped Treasure Chest
  containing an evolution-type reward (in most stages, chests from bosses
  at/after the 10-minute mark — with per-stage exceptions listed on the
  Evolution page, e.g. Mad Forest's first 1:00 Glowing Bat chest can
  already evolve).
- **After evolving:** "On evolution, the base weapon is typically removed
  and the evolved weapon is added. The passive item remains unaffected."

For our eleven mapped passives, the classic (passive-merely-owned)
evolution on each: Wings+Shadow Pinion→Valkyrie Turner,
Bracer+Knife→Thousand Edge, Candelabrador+Axe→Death Spiral,
Spinach+Fire Wand→Hellfire, Spellbinder+King Bible→Unholy Vespers,
Duplicator+Lightning Ring→Thunder Loop, Attractorb+Santa Water→La Borra,
Armor+Runetracer→NO FUTURE, Hollow Heart+Whip→Bloody Tear,
Pummarola+Garlic→Soul Eater, Empty Tome+Magic Wand→Holy Wand. (Each
passive's page, Evolutions template, first entry — none carries
`passive max`.)

## 4. Level-1 semantics worth copying

- For **normal** passives, level 1 is a real bonus: taking the item grants
  the full first step (Spinach level 1 is already +10% Might, Duplicator
  level 1 already +1 Amount). The level-1 table cell is just the item's
  shop/pickup description in quotes.
- For the **special** pickups (Rings, Metaglios, and the DLC Academy
  Badge), the wiki notes on /w/Passive_items, verbatim: "The first level is
  not available through level up, thus does not give any stats" — i.e.
  level 1 is the act of picking the item up off the stage floor, and the
  stat progression runs over levels 2–9 (which is why 8 steps of +5% cap at
  +40%, not +45%).

## 5. Ambiguities and wiki self-contradictions

1. **The base-game passive count doesn't add up.** The /w/Passive_items
   intro says "The base game has 21 passive items, 17 of which are normal
   passive items and 4 of which are special passive items" — but the
   "List of Passive Items" table under it has 19 rows (the 17 plus
   Parm Aegis and Karoma's Mana, which were added in later free updates).
   19 + 4 = 23 ≠ 21. The intro count is likely stale; this doc lists all 19
   table rows in section 1a and flags rather than resolves the arithmetic.
2. **Hollow Heart's max effect is stated three ways.** Infobox: `+149%`.
   Levels table: 2.48832x (= +148.8%, consistent with rounding). List page:
   "+20% Max Health (max 200%)" — inconsistent with both (200% would be
   1.2^5 misread, or a stale pre-compounding figure). The per-level tables
   (1.2x per level, compounding) are self-consistent and are what this doc
   treats as authoritative.
3. **Attractorb's max effect is rounded.** Infobox `+300%` vs the level
   table's compounded 3.980025x (= +298.0%). The Tips section itself calls
   the level multipliers approximations of 1.5x/2x/2.5x/3x/4x.
4. **Armor's infobox sign convention** (`per-level = -1`) disagrees in form
   with the prose ("+1 Armor per level"); same fact, opposite sign, because
   the infobox tracks incoming damage. Noted so nobody reads -1 as a
   downside. The infobox also omits Armor's secondary +10%/level
   Retaliatory Damage bonus, which only appears in prose and the list page.
5. **"Required level varies by case" is never centrally tabulated.** The
   Evolution page states the split rule but the authoritative
   per-evolution answer is distributed across the `passive max = yes`
   flags in each passive's page template. This doc spot-checked all eleven
   mapped passives (section 3); it did not exhaustively audit every
   post-1.0/DLC evolution.
6. **Tirajisú naming.** The wiki page is /w/Tirajisú; the item has commonly
   been spelled "Tiragisú" elsewhere. Both spellings redirect to the same
   page; stats are unaffected.
