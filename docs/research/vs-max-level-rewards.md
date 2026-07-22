# Vampire Survivors: level-up rewards once every weapon and passive is maxed

Research for issue #197 (part of #193). Answers, against the official wiki
(https://vampire.survivors.wiki, a wiki.gg site): exactly what VS offers on
level-up once the pick pool is exhausted (every weapon and passive slot filled
and at max level), what happens when the pool is thin but not empty, and how
the heal/gold amounts interact with stats (Luck, Greed).

**Method.** All claims come from raw wikitext read via the wiki's MediaWiki
API (`https://vampire.survivors.wiki/api.php?action=parse&page=<Title>&prop=wikitext`),
not from rendered summaries. Pages read: `Level up`, `Floor Chicken`,
`Big Coin Bag`, `Coin Bag`, `Rich Coin Bag`, `Gold Coin (pickup)`,
`Gold Coin (currency)`, `Luck`, `Limit Break`. Every claim below cites its
page; where the wiki is silent or ambiguous, that is flagged in the final
section — nothing is guessed. All fetched 2026-07-22.

## 1. The exhausted-pool reward set: exactly two options

The trigger is a **conjunction**: the player already holds 6 different weapons
and 6 different passive items (so nothing new can be offered) **and** every
held item is at max level (so nothing can be upgraded). From
https://vampire.survivors.wiki/w/Level_up:

> "The player cannot be offered new items if the[y] already have 6 different
> passive items or weapons. Similarly, if an item is at its maximum level, it
> also cannot be offered to the player. When both of these conditions are met
> and player has nothing left to upgrade, level ups will instead grant the
> options to gain extra Gold or restore health with Floor Chicken"

The screen then shows **two options** (assuming Limit Break is off — see §4):

| Option | Effect | Source |
|---|---|---|
| **Big Coin Bag** | Gives **25 Gold Coins**, multiplied by the Greed stat | https://vampire.survivors.wiki/w/Big_Coin_Bag (infobox `effects = Gives 25 Coins`, notes: "Amount of coins gained is multiplied by Greed") |
| **Floor Chicken** | Heals **30 HP** | https://vampire.survivors.wiki/w/Floor_Chicken (infobox `effects = Heals 30 HP`) |

That it is exactly these two, and exactly two, comes from the Big Coin Bag
page: "it is obtained as **one of the two options** in the level up menu if
the player has maxed out the levels of all of the weapons and passives in
their possession, assuming that Limit Break is disabled." The Floor Chicken
page confirms the other slot: "Available as an option for leveling up after
all weapons and passive items are maxed" / "offered as a choice when your
inventory is full and all items are maxed out."

There is **one** gold option, not a menu of tiers. The other coin pickups
(Gold Coin = 1, Coin Bag = 10, Rich Coin Bag = 100) are light-source drops
and never appear on this screen; the Big Coin Bag is the reverse — infobox
`rarity = 0`, `level = 100000`, i.e. it is excluded from the normal drop pool
and exists (outside 3/5-item chests) only as this level-up reward. Sources:
https://vampire.survivors.wiki/w/Gold_Coin_(pickup),
https://vampire.survivors.wiki/w/Coin_Bag,
https://vampire.survivors.wiki/w/Rich_Coin_Bag,
https://vampire.survivors.wiki/w/Big_Coin_Bag.

**Weighting/order rules: none stated.** The wiki's rarity-weighted selection
math (§3 below) is described only for the weapon/passive pool. For the
two-option screen no weighting, ordering, or fourth-option behavior is
documented — it reads as a fixed two-choice menu. (Flagged in §6.)

### The "always" auto-pick unlock

After the player has received **100 Big Coin Bags** from any source, the
screen gains persistent "always receive Floor Chickens" / "always receive
Gold" options that auto-collect on future level-ups without pausing. From
https://vampire.survivors.wiki/w/Level_up:

> "with the option to always receive either Floor Chickens or Gold once the
> player has received 100 Big Coin Bags from any source.
> * The 'Always Floor Chicken' option will only give Floor Chickens if the
>   player has missing health. If the player is fully healed, they will
>   receive Gold instead."

So the auto-chicken path never wastes a level-up: at full HP it falls back to
gold. (The Level up page's update history dates the unlock to Patch 0.8.0,
7 July 2022: "Added option to always pick Coin Bag or Floor Chicken when
leveling up after maxing out all weapons (unlocks automatically after playing
long enough)" — the patch note says "Coin Bag" but the item pages identify
the actual reward as the Big Coin Bag.) The Limit Break page describes the
auto-collect presentation: the reward "is automatically collected and the
text 'Level Up!' appears above the character"
(https://vampire.survivors.wiki/w/Limit_Break, on "RANDOM always", which it
says "acts similarly to collecting Big Coin Bags or Floor Chicken").

## 2. Floor Chicken heal value and stat interactions

- **Heal amount: flat 30 HP**, both as a floor pickup and as the level-up
  reward — the wiki gives a single value for the item
  (https://vampire.survivors.wiki/w/Floor_Chicken, description "Restores 30
  Health points").
- **Luck does not change the heal amount.** The Floor Chicken infobox's
  `luck = Yes` flag refers to its **drop rate** from light sources: "its drop
  rate depends on the Luck stat" (same page). The Luck page's exhaustive
  effects list (https://vampire.survivors.wiki/w/Luck) includes pickup drop
  chances and the fourth-level-up-option chance, but nothing about heal
  amounts or about the exhausted-pool screen.
- The only heal modifier the wiki names: "Healing is doubled with Sarabande
  of Healing active" (an arcana; same Floor Chicken page).
- **Gold side:** the Big Coin Bag's 25 coins are "multiplied by Greed"
  (https://vampire.survivors.wiki/w/Big_Coin_Bag). The currency page adds the
  Greed ceiling context: Greed PowerUp up to +50%, Stone Mask up to +50%,
  Hyper mode x1.5–x2 (https://vampire.survivors.wiki/w/Gold_Coin_(currency)).

## 3. Partial exhaustion: a thin but non-empty pool

What the wiki states (all from https://vampire.survivors.wiki/w/Level_up):

- Ineligible items are simply **removed from the pool**: new items stop being
  offered once the player holds 6 weapons / 6 passives, and any max-level
  item "cannot be offered". There is no chicken/coin filler while anything
  upgradeable remains — Patch 0.5.1 (24 April 2022, update history on the
  same page and on Floor Chicken / Coin Bag) fixed exactly that: "Tentative
  fix to chicken/coinbag choice presenting itself when there are still items
  that can be leveled up."
- Normal selection is **3 or 4 options**, rarity-weighted, drawn without
  repetition: P(item) = itemRarity / itemPoolWeight. The fourth option
  appears with chance `1 − (1/totalLuck)`.
- **Owned-item bias** (relevant late-run, when the pool is mostly your own
  upgradables): before the open-pool draw, the game rolls twice to force an
  already-owned item into the offer, each roll succeeding with
  `ownedChance = 1 + 0.3x − 1/totalLuck` (x = 2 on even player levels, 1 on
  odd). A duplicate second roll is discarded and redrawn from the full pool.
- **Skips and Rerolls are unavailable "when the player has maxed out their
  inventory"** (stated on the Level up page intro).
- The only "fill out" rule stated is an early-game one, from the v1.6.0 patch
  note (17 August 2023): "Updated Level Up to fill out extra items when less
  than 3 are available and you are less than level 3."

**Not stated:** what the screen shows above level 3 when fewer than 3
eligible picks remain (e.g. one upgradeable item left). The mechanics text
never says the list is padded in that case; the natural reading is that
fewer options are shown, but the wiki does not spell it out. Flagged in §6.

## 4. The Limit Break alternative (for completeness)

If the Limit Break toggle is on (unlocked via Great Gospel), the exhausted
pool never yields the coin/chicken screen: "a fully upgraded build will not
be offered Big Coin Bags or Floor Chicken upon level up, and instead will
present options to level their weapons beyond their usual limits" — each
option is a specific stat bump (Might/Area/Speed/etc.) on one of the player's
weapons (https://vampire.survivors.wiki/w/Limit_Break). The Level up page
states the same. Treasure Chests still give Big Coin Bags as normal under
Limit Break (Limit Break page).

## 5. Summary for Loop Survivors' Encore mapping

Under the locked charting decision (coins→notes, chicken→First Aid-style
heal), the VS-parity exhausted-pool offer is: **two options — a fixed note
(currency) payout (VS: 25, scaled by the gold-gain stat) and a flat heal
(VS: 30 HP)** — plus, as an optional later unlock, an "always" auto-pick
that self-resolves (auto-heal falls back to currency at full HP). No damage/
move/area options exist on VS's exhausted screen; those belong to the
separate Limit Break toggle, not the base reward set.

## 6. What the wiki does NOT state (do not treat as known)

1. **Weighting/order of the two options.** No probabilities, screen order,
   or Luck interaction is documented for the Big Coin Bag / Floor Chicken
   pair; it is presented as a plain two-choice menu. Whether a fourth-option
   roll is even attempted there is unstated (no third or fourth option is
   ever mentioned or pictured — the gallery caption on the Level up page
   shows just the pair).
2. **Whether the coin/chicken choice respects missing HP** in the *manual*
   menu (the full-HP fallback is documented only for the "Always Floor
   Chicken" auto-option).
3. **Thin-pool padding above level 3.** Below level 3 the list is "filled
   out" per the v1.6.0 note; for a late-game pool with 1–2 eligible picks
   the wiki never says whether the player sees 1–2 options or padded ones.
4. **Chicken heal vs. overheal/cap.** Nothing is said about what happens if
   the manual chicken choice is taken at full HP (presumably wasted, but
   unstated).
5. The Patch 0.8.0 note's "Coin Bag" vs. the item pages' "Big Coin Bag" is a
   naming inconsistency in the wiki's quoted patch notes, not two different
   rewards — both item pages and the Level up gallery identify the level-up
   gold reward as the Big Coin Bag (25 coins).
