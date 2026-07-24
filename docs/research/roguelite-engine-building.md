# Roguelite engine building: the mechanisms behind synergy and one-more-run

Research for issue #248 (part of #247). Catalogues the *structural* mechanisms
— not the flavour — that well-regarded roguelikes and roguelites use to make
two picks worth more together than apart, to stop a player taking everything,
to make a run's identity legible before it ends, and to make the next run worth
starting. Reads Slay the Spire, Balatro, Monster Train, Hades, Risk of Rain 2,
Into the Breach and Backpack Battles, plus two real-time controls (Nova Drift,
Vampire Survivors) that already run these mechanisms without turns. Ends with
an explicit turn-dependence audit: which mechanisms need deliberation time and
which do not.

All sources fetched **2026-07-25**. Priority order was: developer talks and
developer blogs first (the GDC 2019 Slay the Spire and Into the Breach decks
were downloaded as PDFs and text-extracted locally; localthunk's and Nova
Drift's blogs are the developers' own writing), then the games' own storefront
copy, then wikis for exact rule text. Where only a community wiki exists
(Hades, Monster Train) that is stated at the citation. Every number below is
quoted from a source; nothing is estimated. §8 lists everything that stayed
ambiguous or that I could not verify — read it before trusting a claim that is
not flagged. §6 and the per-game cards in §7 are **my analysis** built on the
cited rules, and are marked as such.

**Plain-language glossary** (terms used throughout, each explained once here):

- **Engine** — a build that produces more the longer it runs, because its
  parts feed each other, rather than a build that is just a pile of bonuses.
- **Synergy / anti-synergy** — two picks that are worth more together than
  separately / two picks that are worth *less* together than separately.
- **Deck-builder** — a game where your power is a pile of cards you add to as
  you play, and you draw from that pile at random each turn.
- **Dilution** — in a deck-builder, adding a card makes every other card
  slightly less likely to be drawn. Adding is therefore never free.
- **Thinning** — deliberately removing weak cards so the good ones come up
  more often. The opposite of dilution.
- **Slot economy** — a hard cap on how many things can be active at once, so a
  new pick has to *displace* an old one.
- **Proc** — an effect that fires as a side effect of something else ("10%
  chance on hit to launch a missile"). A **proc chain** is one proc triggering
  another.
- **Telegraph** — showing the player exactly what an enemy is about to do,
  before they commit their own move.
- **Meta-progression** — what persists after a run ends.
- **Chips × Mult** (Balatro) — its score for one played hand is a base number
  ("chips") multiplied by a second number ("mult"). Two separate quantities the
  player can grow, and they multiply, so growing both at once is worth far more
  than growing either twice.
- **Ante / blind** (Balatro) — a run is 8 "antes"; each ante is three "blinds"
  (score targets) you must beat, the third being a boss blind with a rule
  attached.
- **Boon** (Hades) — a god's upgrade attached to one of your five abilities.
- **Covenant / Ascension / Stake / Heat** — each game's name for the same
  thing: a difficulty ladder the player climbs across runs.

---

## 1. Constraint systems: what stops a player taking everything

Six distinct families appear across the sample. They are not variants of one
idea — each one bites at a different moment, and several games run three or
four simultaneously.

### 1a. Slot economies — a hard cap on what is active at once

The cleanest constraint. There is a fixed number of places, and a new pick
must displace an old one.

- **Hades** is the strictest in the sample. Zagreus has five ability slots —
  Attack, Special, Cast, Dash, Call — and each holds exactly one boon: "If he
  already has a slot occupied by a Boon and decides to add another one, then
  the second replaces the first"
  ([Hades Wiki (Fextralife, community wiki — Supergiant publishes no official
  wiki)](https://hades.wiki.fextralife.com/Boons), fetched 2026-07-25). Five
  slots, with several gods contesting each, means the interesting decision is
  *which god owns your Attack* — taking Zeus's Attack boon costs you
  Poseidon's unless you overwrite it later.
- **Balatro**: "Every non-challenge run, except those on Black Deck and
  Painted Deck, will begin with 5 empty Joker slots", plus 2 consumable slots
  ([Balatro Wiki](https://balatrowiki.org/w/Jokers) and
  [Consumables](https://balatrowiki.org/w/Consumables), fetched 2026-07-25).
  Slot count is itself a tradeable currency: Black Deck is "+1 Joker slot" but
  "-1 hand every round"; Painted Deck is "+2 hand size" but "-1 Joker slot"
  ([Decks](https://balatrowiki.org/w/Decks)); the Negative edition is
  "+1 Joker or Consumable slot" and is one of only five editions a joker can
  carry.
- **Nova Drift** (real-time) splits its cap by *category*: "GEAR defines your
  fundamental aspect: your WEAPON, BODY and SHIELD, with you able to have no
  more than one of each. MODS modify or improve the capabilities granted by
  your GEAR, and there is no limit to how many MODS you may have" (Nova Drift
  Wiki, Mods Overview — read via search result only, see §8).
- **Vampire Survivors** (real-time): "The player can select up to six
  different weapons from level-ups, but it is possible to carry more by picking
  up weapons that generate with the stage"
  ([Vampire Survivors Wiki](https://vampire.survivors.wiki/w/Weapons), fetched
  2026-07-25).

### 1b. Dilution economies — adding is itself a cost

Only deck-builders get this for free, and it is the constraint they lean on
hardest. In Slay the Spire the Ironclad's starting deck is ten cards — five
Strikes, four Defends, one Bash
([Slay the Spire Wiki](https://slaythespire.wiki.gg/wiki/Ironclad), fetched
2026-07-25) — and every card added makes every card already there rarer to
draw. The counter-move, removal, is deliberately priced on an escalating
curve: the Merchant's card removal service "price starts at 75 Gold and
increases by 25 each time it is bought at a shop"
([Merchant](https://slaythespire.wiki.gg/wiki/Merchant), fetched 2026-07-25).
So *thinning is a build path with its own budget*, competing directly with
buying cards (common 45–55g, rare 135–165g) and relics (common 143–158g, rare
285–315g) from the same gold pile.

Balatro applies the same pressure to a 52-card poker deck: adding cards makes
your intended hand less reliable, and its Spectral cards "manipulate your hand
through destruction and replacement"
([Consumables](https://balatrowiki.org/w/Consumables)). The Abandoned Deck
("Start run with no Face Cards in your deck") and Checkered Deck ("Start with
26 Spades and 26 Hearts") are pre-thinned decks sold as a starting choice
([Decks](https://balatrowiki.org/w/Decks)).

Note what dilution actually *is*, mechanically: a randomised draw from an
inventory. **Without a random draw there is no dilution.** This is the single
most turn-dependent constraint family in the sample.

### 1c. Spatial economies — the constraint is geometry, not count

- **Backpack Battles** is the purest case. A class starts with "12-14 of 63
  total tiles that can be rearranged and rotated which are used to place items
  in"; more tiles are bought as bags; "Each item has its own set tiles
  configuration"; and "Items can be placed in the Storage but their effects
  will be inactive until placed in the Inventory"
  ([Backpack Battles Wiki, Game
  Mechanics](https://backpackbattles.wiki.gg/wiki/Game_Mechanics), fetched
  2026-07-25). The constraint is *packing*: an item's power is real but its
  shape may not fit beside the thing it wants to be beside.
- **Monster Train** stacks a vertical spatial economy on a deck-builder:
  "three vertical play fields to defend" and a "final burning pyre"
  ([Steam store page, developer
  copy](https://store.steampowered.com/app/1102190/Monster_Train/), fetched
  2026-07-25). Units cost floor *capacity*, not just a slot — the sequel's wiki
  maintains a "1-capacity units" category listing per-unit capacity cost
  ([Monster Train 2 Wiki (community,
  Miraheze)](https://monstertrain2.miraheze.org/wiki/Category:1-capacity_units),
  fetched 2026-07-25), so a big unit and three small ones compete for the same
  floor. Exact per-floor capacity numbers: see §8.

### 1d. Throughput budgets — a per-turn allowance

"Every character gains 3 Energy at the start of their turn"
([Slay the Spire Wiki,
Keywords](https://slaythespire.wiki.gg/wiki/Keywords), fetched 2026-07-25) —
so a deck full of expensive cards cannot be played even when drawn perfectly.
Balatro's equivalent is hands and discards per round, which decks trade
against each other (Red Deck "+1 discard every round", Blue Deck "+1 hand every
round", Black Deck "-1 hand every round"; [Decks](https://balatrowiki.org/w/Decks)).
Into the Breach's is a turn limit per battle, adopted explicitly as a design
constraint: "Turn Limit per Battle … 'Micro-battles' were fun"
([Into the Breach Design Postmortem, GDC 2019, Matthew Davis, "Turn Limit per
Battle" slide](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf),
fetched and text-extracted 2026-07-25; slides are cited by title throughout,
because my extraction preserved slide text but not reliable slide numbering).

### 1e. Exclusivity and anti-synergy — some pairs are forbidden or hostile

- **Nova Drift** hard-removes options: "Rapid Reconstruction is mutually
  exclusive with Shielded Constructs and Sanctuary, thus taking one will remove
  the other from the mod pool", and "Void Slice and Strafing Strikes are now
  mutually exclusive, since you can't 'Strafe' with Void Slice" (Nova Drift
  Wiki — read via search result only, see §8). Note the second reason is
  *fictional/mechanical coherence*, not balance.
- **Hades' Mirror of Night** is built entirely from exclusive pairs: "You
  cannot use both a Talent and its alternate version. If you choose to have the
  other side active, the primary version's effects will not be activated until
  you switch back to it"; talents unlock "in batches of two"; each side ranks
  up separately
  ([Hades Wiki (Fextralife,
  community)](https://hades.wiki.fextralife.com/Mirror+of+Night), fetched
  2026-07-25).
- **Slay the Spire** ships *negative* cards: Curses are "unplayable cards"
  added by events that "persist until removed", and Statuses are "cards
  designed to bloat your deck and are unable to be played"
  ([Cards](https://slaythespire.wiki.gg/wiki/Cards), fetched 2026-07-25). Neow's
  third blessing formalises this as a trade: it "Pairs a disadvantage (lose max
  HP, take damage, obtain a curse, or lose all gold) with a stronger
  advantage" ([Neow](https://slaythespire.wiki.gg/wiki/Neow), fetched
  2026-07-25).

### 1f. Time and opportunity cost — the constraint is the clock

Risk of Rain 2 has *no* inventory constraint at all: "There is no limit to how
many different types of passive item, or how many of a passive item a player
can hold at any one time"
([Risk of Rain 2 Wiki](https://riskofrain2.wiki.gg/wiki/Items), fetched
2026-07-25). Its entire constraint is the difficulty coefficient, which climbs
with the clock and jumps per stage:

```
coeff = (playerFactor + timeInMinutes × timeFactor) × stageFactor
playerFactor = 1 + 0.3 × (playerCount − 1)
timeFactor   = 0.0506 × difficultyValue × playerCount^0.2
stageFactor  = 1.15 ^ stagesCompleted
```

([Difficulty](https://riskofrain2.wiki.gg/wiki/Difficulty), fetched
2026-07-25). Every second spent farming a stage for more items also makes the
enemies stronger, so "how long do I stay here" *is* the build decision. Note
the shape: linear in time, exponential in stages.

**Summary table.**

| Family | Bites when | Exemplars | Needs a random draw? | Needs turns? |
|---|---|---|---|---|
| Slot economy | at the moment of picking | Hades 5 ability slots; Balatro 5 jokers; Nova Drift 1 gear each; VS 6 weapons | no | no |
| Dilution | later, invisibly, at draw time | Slay the Spire; Balatro's 52 cards | **yes** | **yes** |
| Spatial | at placement | Backpack Battles tiles; Monster Train floor capacity | no | no (placement can be paused) |
| Throughput budget | every turn | StS 3 energy; Balatro hands/discards; ITB turn limit | no | **yes**, as a *decision*; no, as a *rate* |
| Exclusivity / anti-synergy | at the moment of picking | Nova Drift mod removal; Hades Mirror pairs; StS Curses | no | no |
| Time / opportunity cost | continuously | RoR2 difficulty coefficient | no | no |

---

## 2. Synergy: what makes two picks worth more together than apart

Six mechanisms, again structurally distinct.

### 2a. Two multiplied quantities

Balatro's core: score is chips × mult. A joker that adds chips and a joker that
adds mult multiply each other's value. The hand table is the base — High Card
5 chips × 1 mult, Pair 10 × 2, Flush 35 × 4, Four of a Kind 60 × 7, Straight
Flush 100 × 8 ([Poker Hands](https://balatrowiki.org/w/Poker_Hands), fetched
2026-07-25) — and Planet cards raise both numbers for one hand type only
(Mercury: "+1 Mult, +15 Chips" per level to Pair), so *specialising in one hand
type* and *buying multipliers* compound. localthunk on the origin: "The game
had the CHIP X MULT mechanic already. I really don't know where this idea came
from but it seemed very natural for a scoring system"
([The Balatro Timeline, localthunk](https://localthunk.com/blog/balatro-timeline-3aarh),
fetched 2026-07-25). It predates the Jokers, which he added in February 2022 —
the multiplication came first, the content hung off it.

The editions are a second multiplicative layer over the first: Foil "+50
Chips", Holographic "+10 Mult", Polychrome "×1.5 Mult"
([Jokers](https://balatrowiki.org/w/Jokers)). A ×1.5 on a joker that already
multiplies is a multiplier on a multiplier.

### 2b. Gated combination objects — the pair unlocks a *third thing*

The strongest legibility mechanism in the sample, because the reward is a
named object, not a bigger number.

- **Hades Duo Boons** "require 'a Boon equipped from each of those two
  deities' to be offered"; Legendary boons "require specific prerequisite boons
  already equipped to appear, such as Hermes' 'Bad News' needing an auto-reload
  boon equipped" ([Boons, Fextralife](https://hades.wiki.fextralife.com/Boons)).
  Because slots are scarce (§1a), a Duo Boon is *paid for* in slots you now
  cannot spend elsewhere.
- **Vampire Survivors evolutions**: "When a base weapon is fully leveled and
  its corresponding passive item is obtained, it can be transformed into an
  evolved weapon by collecting a Treasure Chest", and "Evolution actually works
  by removing the base weapon and acquiring the evolved one … all the effects
  of the original weapon will be lost"
  ([Weapons](https://vampire.survivors.wiki/w/Weapons)). Two long-term
  commitments plus a walk-to trigger.
- **Backpack Battles recipes**: "Recipe items placed next to each other in the
  backpack will be combined in the next shop phase"; "In some recipes a
  catalyst item is used, it remains unchanged while the other ingredients are
  lost to generate a new item"; and items "can be locked from combining by
  right clicking on them"
  ([Recipe](https://backpackbattles.wiki.gg/wiki/Recipe), fetched 2026-07-25).
  Also: "Each item will start off as a black silhouette before you have
  unlocked that item by completing its recipe" — discovery is itself the
  reward.
- **Monster Train's clan pair** is a combination object chosen before the run:
  "select your primary and supporting clan to gain access to all cards from
  both" ([Steam store copy](https://store.steampowered.com/app/1102190/Monster_Train/)).
  The primary clan alone determines your champion: "You will always have one
  Champion from your main clan, and do not get one from your allied clan"
  ([Monster Train 2 Wiki
  (community)](https://monstertrain2.miraheze.org/wiki/Champion), fetched
  2026-07-25).

### 2c. Proc chains — one effect firing another

Risk of Rain 2's is explicit and numeric: "Effective Trigger Chance = Item
Chance × Proc Coefficient", so a fast weak weapon with a 0.6 coefficient turns
a 10% missile item into 6% per shot
([Item Stacking](https://riskofrain2.wiki.gg/wiki/Item_Stacking), fetched
2026-07-25). Attack-speed items therefore multiply on-hit items without either
one mentioning the other. Balatro's equivalent is the "Retrigger Jokers"
category ([Jokers](https://balatrowiki.org/w/Jokers)); Backpack Battles' is
adjacency triggers — "Diamond works just like Star … Usually an item can only
fill one star of another item, and one diamond"
([Game Mechanics](https://backpackbattles.wiki.gg/wiki/Game_Mechanics)), which
is a proc chain with a *placement* precondition and a fan-out cap.

### 2d. Conversion engines — turning breadth into depth

A pile of unfocused pickups can be traded for concentration.

- Risk of Rain 2's Scrappers and 3D Printers convert items into other items,
  with Scrap "prioritized when used"
  ([Items](https://riskofrain2.wiki.gg/wiki/Items)) — the standard way a run
  turns twenty different whites into twelve copies of one.
- Slay the Spire's removal service (§1b) is the deck-builder version: paying
  gold to convert *breadth* into *reliability*.
- Monster Train sells the same idea as upgrades: "improve cards by mixing and
  matching upgrades" and "duplicate any card in your deck"
  ([Steam store copy](https://store.steampowered.com/app/1102190/Monster_Train/)).
  Champions bypass the normal path entirely: "Instead of being upgraded like
  other units, Champions each have a set of three upgrade paths, with three
  levels of each"
  ([Champion](https://monstertrain2.miraheze.org/wiki/Champion)) — a
  three-branch commitment that declares the build.

### 2e. Order and geometry — depth that costs no content

Balatro's jokers score left to right, so the *same five jokers in a different
order* score differently; Backpack Battles' items score by where they sit.
Neither costs the designer a single extra item. This is the cheapest depth
multiplier in the sample and the one that most reliably produces "I found
something the designer didn't": a permutation space over an existing set.

### 2f. Stacking curves as a design dial

Risk of Rain 2 documents four distinct stacking maths, applied per item as an
explicit choice ([Item Stacking](https://riskofrain2.wiki.gg/wiki/Item_Stacking)):

| Type | Formula | Effect | Example |
|---|---|---|---|
| Linear | `f(x) = 1 + a·x` | every copy worth the same | Soldier's Syringe, +15% attack speed each |
| Hyperbolic | `f(x) = 1 − 1/(1 + a·x)` | approaches but never reaches 100% | Tougher Times, a = 0.15 → 60% block at 10 stacks |
| Reciprocal | `f(x) = a/x` | strongest at one copy, decays | (cooldown-style effects) |
| Exponential | `f(x) = a^x` | compounds without limit | Shaped Glass: 2 stacks = ×4 damage, not ×3 |
| Special | e.g. `1 − 1/(1+x)^0.33` | bespoke | Bandolier |

The wiki gives the reason hyperbolic exists: it is "used for percentage-based
items to prevent reaching 100% effectiveness, which would create balance
issues", explained to players with a lottery image — green tickets added to a
box of 100 red ones, "there is always a chance that a red ticket is drawn, no
matter how many green tickets are added."

**Observation:** the curve *is* the constraint for a game with no slots. Linear
items reward breadth, exponential items reward tunnelling, hyperbolic items
cap themselves so a defensive stat can never be solved. Choosing a curve per
item is choosing what specialising in it feels like.

---

## 3. Where the depth lives: acquisition, construction, execution

The sample splits cleanly, and the developers say so themselves.

**Acquisition (what gets offered).** Mega Crit's stated balance goal is a
property of the *offer pool*, not of any build: "Every card should have a place
(also avoid anything too warping)"
([Slay the Spire: Metrics Driven Design and Balance, GDC 2019, Anthony
Giovannetti, "Balance: The Goal"
slide](https://media.gdcvault.com/gdc2019/presentations/Giovannetti_Anthony_SlayTheSpire.pdf),
fetched and text-extracted 2026-07-25). Both halves matter: no dead options,
and no option that flattens every other decision around it.

The offer stream is a first-class design surface in every game here, and it is
tuned with weights: Slay the Spire's rare-card chance differs by *source* —
"normal encounters (3% rare), elite encounters (10% rare), and shops (9%
rare)" ([Cards](https://slaythespire.wiki.gg/wiki/Cards)). Balatro's is "70%
chance of generating a Common Joker, a 25% chance of generating an Uncommon
Joker, and a 5% chance of generating a Rare Joker", with Legendary jokers
reachable only through The Soul spectral card, itself a 0.3% appearance
([Jokers](https://balatrowiki.org/w/Jokers)). Backpack Battles flattens its
table as the match progresses — by rounds 12–18 it is "Common 20%, Rare 20%,
Epic 20%, Legendary 20%, Godly 20%"
([Game Mechanics](https://backpackbattles.wiki.gg/wiki/Game_Mechanics)).
Vampire Survivors states the principle plainly: "Rarity determines the weight
of how often that weapon shows up in the pool of possible weapons and passive
items during the level-up screen"
([Weapons](https://vampire.survivors.wiki/w/Weapons)).

And the offer stream is something the player is allowed to *edit*. Vampire
Survivors sells three separate verbs for it, all permanent-progression
purchases rather than in-run resources: Reroll ("get a new set of level up
options or Arcanas"), Skip, and Banish — "Once an item is banished it can no
longer be offered as a level up option … There is no upper limit to how many
Banishes the player may have"
([Banish](https://vampire.survivors.wiki/w/Banish), fetched 2026-07-25).
Balatro lets you skip a Small or Big Blind entirely in exchange for a Tag
([Blind](https://balatrowiki.org/w/Blind), fetched 2026-07-25) — trading score
safety for a targeted reward. Slay the Spire lets you skip a card reward
outright (see §8 on sourcing).

**Construction (what fits together).** §1 and §2. Nova Drift's developer is
unusually direct that acquisition randomness and construction depth trade off
against each other: "Too many mods meant too much info dumped on a player all
at once. It also meant that the player's build would be mostly left to chance."
His fix was mini-trees plus Super Mod combos, described as "a middle-ground
between deterministic building and rogue-like randomness"
([Nova Drift released + dev retrospective, blog.novadrift.io](https://blog.novadrift.io/novadrift-released/),
fetched 2026-07-25). He also names the content-mass trap: "whenever I added an
upgrade to the game, it compounded the challenge of balancing every upgrade
that came before it. When we exceeded about 150 upgrades, things started to get
problematic", and "a complex enough web of interlaced mechanics can mean that
pulling a single thread cascades disastrously."

**Execution (playing it well).** Into the Breach is the sample's extreme: it
deleted acquisition randomness and combat randomness to put *all* the depth
into execution. The stated constraints were "Reduce Random Chance" and
telegraphed attacks — "All enemy attacks shown / No hit / miss chance /
Completely deterministic (during player turn)" (ITB postmortem, "Core Game
Idea" and "Telegraphed Attacks" slides). The consequences the deck traces are
worth reading as a chain: telegraphed attacks changed what "threat" means,
which produced defensive gameplay, which forced a new win state — the turn
limit — and a new fail state, the Power Grid ("Telegraphed Attacks Changes
Threat" through "The Power Grid" slides).

Two findings from that deck bear repeating because they cut against instinct:

1. **"Killing enemies isn't as fun as manipulating them."** ("Rethinking the
   Win-State" slide) The win condition moved off elimination and onto control,
   and non-lethal weapons became the interesting design space ("Turn Limit per
   Battle" slide).
2. **Adding randomness back was punished.** Of the Power Grid: "Inserted
   Randomness into a 'deterministic' design / Attached the new mechanic to
   additional systems / Annoyed players" ("The Power Grid" slide).

And its difficulty note is a warning specific to execution-heavy design: "Too
hard becomes 'unsolvable' / Too hard threshold is a cliff / Difficulty
constrained by design / Easy can be fun!" ("Puzzle-Game Difficulty" slide). A
game whose depth lives in execution has a *cliff*, not a slope.

---

## 4. Run identity: how a run acquires a name, and how early

"This is my poison run" requires three things: an early irreversible commitment
that partitions the option pool, later picks that visibly feed the same
quantity, and — usually — the game putting a word on it.

Timing across the sample, expressed as a fraction of the run:

| Game | Identity anchor | When |
|---|---|---|
| Monster Train | primary + allied clan chosen on the run-select screen; champion follows from the primary | **before turn 1** |
| Balatro | first jokers bought; a scaling joker states the plan; deck chosen up front | ante 1–2 of 8 |
| Hades | first two or three boons occupy Attack/Special/Cast and lock out other gods for those slots | first biome |
| Slay the Spire | Neow's blessing at t=0; then the Act 1 boss relic | 0, then ~⅓ |
| Nova Drift | weapon/body/shield gear picks | early, and re-pickable |
| Vampire Survivors | first two or three weapons; the evolution target implies the passive | first quarter |
| Risk of Rain 2 | no formal anchor; identity emerges from what dropped | often never |

The mechanisms that produce early identity:

- **Pre-run partition.** Monster Train's clan pair and Balatro's deck choose
  the pool before the first decision. Balatro's decks are not cosmetic: Magic
  Deck starts with a voucher and two copies of The Fool; Zodiac Deck starts
  with three shop vouchers; Erratic Deck randomises all ranks and suits
  ([Decks](https://balatrowiki.org/w/Decks)).
- **A t=0 keystone with a drawback.** Slay the Spire's Neow offers a fourth
  blessing that is purely a build declaration: "Replace your starter relic with
  a random Boss Relic" ([Neow](https://slaythespire.wiki.gg/wiki/Neow)) — you
  trade your class's defining relic for a run-warping one before you have seen
  a single card.
- **A mid-run keystone from a scheduled fight.** "Boss Relics are only
  obtainable by killing a Boss, after which you are given a choice of 3 boss
  relics" ([Relics](https://slaythespire.wiki.gg/wiki/Relics), fetched
  2026-07-25). One guaranteed, high-variance, *chosen* pickup at a fixed
  timestamp is what makes Act 2 feel different from Act 1.
- **Scarce slots forcing an early lock.** Hades again: five slots, nine gods,
  and duos that demand you keep two specific gods' boons equipped.
- **A named target the player is now working toward.** Vampire Survivors'
  evolutions and Backpack Battles' silhouetted recipes both convert "I have two
  things" into "I am building a third thing", which is what a player actually
  says out loud.

The counter-example is instructive. Risk of Rain 2 has no slots, no dilution
and no pre-run partition; its identity, when it exists, comes from the
conversion engines in §2d and from which exponential item happened to drop.
Nova Drift's developer independently identified the failure mode this creates
in an endless game: "a build tends to be judged by how far it can push in
waves. The higher the wave, the fewer builds are considered viable for it. This
isn't great for build variety." Version 1.0's answer was structural — add a
final boss and make endless optional
([dev retrospective](https://blog.novadrift.io/novadrift-released/)). **A run
with a fixed end can call more builds "good" than a run scored by distance.**

---

## 5. What carries between runs

Five distinct kinds of carry appear, and they are not interchangeable.

1. **Pool expansion — more things exist, not more power.** Slay the Spire
   unlocks cards and relics in batches per character (the Ironclad's five
   unlock tiers each add three cards or three relics;
   [Ironclad](https://slaythespire.wiki.gg/wiki/Ironclad)). Risk of Rain 2:
   "Some items require completing specific Challenges to appear in-game"
   ([Items](https://riskofrain2.wiki.gg/wiki/Items)). Balatro gates decks on
   *collection discovery* — Blue Deck at 20+ items discovered, Yellow at 50+,
   Black at 100+ ([Decks](https://balatrowiki.org/w/Decks)) — so exploring the
   content is the unlock currency.
2. **A difficulty ladder.** Slay the Spire's Ascension is the canonical form,
   and the GDC deck frames it as a *player-management* device, not a content
   one: "Ascension: Player Skill Stratification … Unlocked Sequentially …
   Additional Modes (Custom, Daily)" (GDC 2019, "Ascension" slide; the level
   count on that slide did not survive text extraction — the 20 comes from the
   wiki). The 20 levels are individually authored rather than a scalar: A1 "~60%
   more Elites will spawn", A10 "Start each run with an Ascender's Bane" curse,
   A11 one fewer potion slot, A12 "Upgraded cards appear half as often in Act 2
   and Act 3", A13 "Bosses drop 25% less Gold", A15 events have "less positive
   outcomes and more severe consequences", A16 "Everything costs 10% more",
   A20 "Fight two Bosses at the end of Act 3"
   ([Ascension](https://slaythespire.wiki.gg/wiki/Ascension), fetched
   2026-07-25). Several of those attack *the economy and the offer stream*
   rather than enemy numbers. Balatro copies the shape — eight Stakes, unlocked
   per deck, adding rules like "Small Blind gives no reward money", "Required
   score scales faster for each Ante", "-1 Discard", and joker stickers
   (Eternal/Perishable/Rental) at 30%
   ([Stakes](https://balatrowiki.org/w/Stakes), fetched 2026-07-25) — and
   localthunk says so outright: "The biggest addition is the inclusion of a
   sort of 'ascension' system. This is from Slay the Spire (see? Told you I'd
   steal from it)"
   ([The Balatro Timeline](https://localthunk.com/blog/balatro-timeline-3aarh)).
   Monster Train ships "25 covenant (difficulty) levels"
   ([Steam](https://store.steampowered.com/app/1102190/Monster_Train/)).
3. **Sidegrade toggles, not stacked power.** Hades' Mirror of Night: fourteen
   rows, two mutually exclusive options each, unlocked "in batches of two", each
   side ranked separately
   ([Mirror of Night](https://hades.wiki.fextralife.com/Mirror+of+Night)). The
   player leaves the meta screen having made *choices*, not having become
   uniformly stronger.
4. **Purchased influence over the offer stream.** Vampire Survivors' Reroll,
   Skip and Banish PowerUps (§3) — permanent purchases that buy *agency over
   randomness* rather than damage. Banish is the sharpest: a permanent ability
   to delete options from your own future level-up screens
   ([Banish](https://vampire.survivors.wiki/w/Banish)).
5. **Knowledge.** Kasavin, on what persists even without a save file: "even in
   the hardest-core roguelike game where it resets you completely to nothing
   from one playthrough to another, there is in fact, something that you carry
   forward, which is your knowledge of the mechanics in the game, right?"
   ([GDC Podcast ep. 16 writeup,
   gdconf.com](https://gdconf.com/article/roguelikes-and-narrative-design-with-hades-creative-director-greg-kasavin-gdc-podcast-ep-16/),
   fetched 2026-07-25).

A sixth thing worth noting is *what the developers did not build*. localthunk
frames Balatro's meta content as anti-grind by intent: achievements, stakes,
unlocks and challenges exist "encouraging players to explore game design
elements they might otherwise miss" and "providing optional structure",
alongside a goal of a game "as low stakes as a crossword or a sudoku puzzle"
([Solitaire, localthunk](https://localthunk.com/blog/solitaire), fetched
2026-07-25).

---

## 6. Turn-dependence: what survives real-time, auto-fire, one-stick

*This section is my analysis, built on the rules cited above.*

The useful test is not "is the game turn-based" but **which of these three
things does the mechanism actually need**:

- **(A) A decision point** — a moment where the game waits for the player.
- **(B) Deliberation time** — the ability to read, compare and plan without
  losing.
- **(C) A per-tick allocation** — the player choosing where each unit of a
  budget goes, repeatedly, during action.

The critical observation: **real-time survivors-likes already have (A) and (B)
— they buy them by pausing.** The level-up screen is a turn. So is a walk-onto
chest ceremony, a between-wave shop, a pedestal. What a real-time one-stick
game genuinely cannot have is (C), and cannot have any mechanism whose
*execution* depth needs reading or precise ordering while enemies move.

### Survives essentially unchanged (needs only A)

- **Slot economies** (§1a). Hades, Nova Drift and Vampire Survivors all run
  them in real time already. Displacement decisions happen on a paused screen.
- **Exclusivity and anti-synergy** (§1e). Nova Drift removes mutually exclusive
  mods from the pool at pick time; this is a pool operation, not a turn one.
- **Gated combination objects** (§2b). Vampire Survivors' evolutions are Hades'
  Duo Boons with a walk-to trigger. Backpack Battles' recipes resolve in a
  shop phase — a pause.
- **Stacking curves** (§2f). Pure maths. Linear/hyperbolic/exponential choices
  are entirely indifferent to turns, and Risk of Rain 2 proves it in real time.
- **Proc chains** (§2c). Risk of Rain 2's proc coefficient exists precisely
  because real-time fire rates vary; it is a *real-time-native* mechanism.
- **Offer-stream control** (§3). Reroll/skip/banish are Vampire Survivors'
  own, on a paused screen.
- **Difficulty ladders and pool expansion** (§5). Between runs; turns are
  irrelevant.
- **Pre-run partition for identity** (§4). Chosen before the clock starts.
- **Time/opportunity-cost constraints** (§1f). Real-time-native by definition.

### Survives only if re-based (needs B, or needs a substitute for randomness)

- **Dilution** (§1b). Requires a randomised draw from an inventory. A
  real-time auto-firing game has no draw — every owned weapon fires. The
  *pressure* dilution creates (adding is a cost) has to come from somewhere
  else: a slot cap, a shared throughput budget, or a cost paid at acquisition.
  This is the mechanism that translates worst.
- **Throughput budgets** (§1d). As a *decision* ("I have 3 energy, what do I
  spend it on this turn?") it needs (C) and does not survive. As a *rate*
  ("total triggers per second is capped and weapons share it") it survives
  fine, but it stops being a decision and becomes a balance parameter — the
  choice moves back to build time.
- **Order and geometry** (§2e). Balatro's left-to-right joker order survives as
  a *build-time* arrangement decision (set it on the pause screen, watch it
  resolve). Backpack Battles' packing likewise. What does not survive is
  re-ordering mid-fight. Note that in a one-stick game, *position* is the one
  live geometric variable the player still controls.
- **Conversion engines** (§2d). Need a place to stand and a menu — a shop, a
  pedestal, a chest. Fine, as long as the game already has walk-to nodes.

### Does not survive

- **Perfect information at Into the Breach's granularity.** Its whole chain
  depends on the player reading every enemy's intent and then committing.
  Real-time gives no commit moment. What *does* carry over is the finding
  underneath it — "Killing enemies isn't as fun as manipulating them"
  ("Rethinking the Win-State" slide) — which in a movement-only game reads as:
  the player's leverage is over
  *where the fight happens*, not over damage.
- **Per-turn resource allocation** (C) in any form.
- **Anything requiring text comprehension during action.** Card text, stacked
  conditional triggers, and multi-clause effects all need the pause. This puts
  a hard ceiling on how many simultaneously-legible conditional effects a
  real-time build can carry, regardless of how many the designer writes.

### Evidence from the real-time exemplars

Nova Drift is the closest structural analogue in the sample — real-time,
upgrade-driven, and deliberately *not* twin-stick: the game "deliberately
avoids twin-stick controls to explore 'a retro-evolution of a 1970s–1980s
arcade mechanic'", where players "learn to set themselves in motion in
anticipation of enemy actions, retaliating while drifting in low friction"
([Nova Drift FAQ](https://blog.novadrift.io/nova-drift-frequently-asked-questions/),
fetched 2026-07-25). Its stated design target is short runs *for the sake of
build experimentation*: "cram those juicy upgrade mechanics into a 15–30 minute
experience. Short games allow you to experiment rapidly with many different
build strategies."

Its Wild Metamorphosis mode is a direct experiment in the acquisition axis:
restricting predictable mod availability "to create incentive to build
reactively, or even pivot entirely, changing your weapon, shield, or body
type", so that "no two runs will be the same, because you won't have had the
same opportunities" — with the important caveat that the developer shipped it
as an *option*: "For people who like to build exactly what they want … the good
old settings are always available"
([Wild Metamorphosis, blog.novadrift.io](https://blog.novadrift.io/wild-metamorphosis/),
fetched 2026-07-25).

---

## 7. Mechanism cards, game by game

Compact per-game summaries. *Constraint / synergy / identity / carry* are
sourced above; *turn-dependence* is my analysis.

**Slay the Spire.** Constraint: dilution + 3 energy/turn + escalating removal
price (75g, +25 each). Synergy: energy-cheap engines and relics that change a
rule rather than a number. Identity: Neow at t=0, boss relic at ~⅓. Carry: card
unlocks + 20 authored Ascension levels. Turn-dependence: dilution and energy
are the two most turn-bound constraints in the sample; the *offer-pool
philosophy* ("every card should have a place, avoid anything too warping") is
fully portable.

**Balatro.** Constraint: 5 joker slots + 2 consumable slots + hands/discards
per round + a 52-card deck that dilutes. Synergy: chips × mult, editions as a
multiplier over a multiplier, retriggers, left-to-right ordering. Identity:
deck up front, first jokers by ante 1–2 of a fixed 8. Carry: 15 decks, 8
stakes, discovery-gated unlocks. Turn-dependence: slots, ordering and the
multiplication all survive; hands/discards do not.

**Monster Train.** Constraint: three floors with per-unit capacity costs, plus
deck rules. Synergy: primary × allied clan (a combination chosen before turn
1), champion three-branch upgrades, card upgrade mixing and duplication.
Identity: at t=0. Carry: 25 covenant ranks, clan levels. Turn-dependence: the
clan-pair partition and the spatial capacity economy both survive; the floor
positioning becomes live positioning rather than placement.

**Hades.** Constraint: 5 ability slots, one boon each, replacement on
collision. Synergy: Duo Boons requiring a specific god's boon in each of two
slots; Legendary boons with named prerequisites; rarity tiers and Poms as
depth-on-a-pick. Identity: first biome. Carry: Mirror of Night's 14 exclusive
pairs. Turn-dependence: none of it needs turns — this is the most directly
portable set in the sample.

**Risk of Rain 2.** Constraint: none on inventory; the clock is the constraint
(`coeff = (playerFactor + minutes × timeFactor) × 1.15^stages`). Synergy: proc
coefficients, and four documented stacking curves used as a per-item dial.
Identity: weak and late; conversion engines are the main way to force one.
Carry: challenge-gated item pool. Turn-dependence: real-time-native throughout.

**Into the Breach.** Constraint: turn limit per battle, three attack types,
orthogonal aiming, static enemy design — constraints adopted deliberately to
force design ("'Following Design' instead of 'Creating Design'", "Designing
with Constraints" slide). Synergy:
positional; weapons that move enemies into each other. Identity: squad chosen
before the run. Carry: pilots and squads. Turn-dependence: the highest in the
sample — perfect information plus commit-then-resolve. Portable findings:
manipulation over elimination; randomness added to a deterministic system
annoys players; execution-led difficulty has a cliff, not a slope.

**Backpack Battles.** Constraint: 12–14 of 63 tiles, item shapes, storage
inactive. Synergy: adjacency (star/diamond, one fill each), recipes with
catalysts, discovery-gated silhouettes. Identity: from the first recipe you
commit tiles toward. Carry: unlocked recipe knowledge. Turn-dependence:
placement happens in a shop phase — a pause — and combat resolves
automatically, which makes it the closest structural cousin to an auto-firing
game in the whole sample.

---

## 8. Ambiguous, unverified, or weakly sourced — read before trusting

Nothing below is guessed at in the body; these are the places where a claim
rests on a weaker source than I wanted, or where I could not get a source at
all.

1. **Claims that came from a search-result summary, not a page I fetched.**
   The web-search budget for this session ran out mid-research, so three claims
   were left resting on quoted snippets rather than a direct fetch:
   (a) Slay the Spire card rewards being "a choice from 3 cards … or skip"
   (quoted from the Fandom *Gameplay* page; the wiki.gg pages I fetched do not
   state it, though the *Neow* page's "choose from 3 random cards" is
   consistent); (b) Nova Drift's gear rule ("no more than one of each") and its
   named mutually-exclusive mods, from the Nova Drift Fandom wiki, which
   returned HTTP 402 to every direct fetch; (c) the count of 28 Duo Boons in
   Hades, from the Fandom *Duo Boons* page. The *rules* in (b) and (c) are each
   corroborated by a second source I did fetch (the Nova Drift dev blog for
   build pivoting across weapon/shield/body; the Fextralife Boons page for the
   duo prerequisite rule), but the exact numbers are not.
2. **Slay the Spire's hand size.** Widely documented as five cards drawn per
   turn. I could not confirm it on any wiki.gg page I fetched, so it is not
   stated as fact in the body. Energy (3/turn) *is* confirmed.
3. **Monster Train floor capacity.** The Steam copy confirms three floors and a
   pyre; the MT2 community wiki confirms units carry an individual capacity
   cost. I could **not** find a primary or official statement of the base
   per-floor capacity, or of the widely repeated "hard cap of 7 units per
   floor" — the only sources for that number were Steam user discussion
   threads, which I do not treat as authoritative. Monster Train's own wiki
   (Fandom) returned HTTP 402/403 to every attempt.
4. **Hades has no official wiki.** Every Hades rule here comes from a community
   wiki (Fextralife), because hades.fandom.com is behind a Cloudflare challenge
   and hades.wiki.gg returns 401. Treat the *rules* as reliable-but-community
   and the *counts* as unverified. Supergiant's Steam news hub did not render
   usable content either.
5. **Hades' Pact of Punishment / Heat system is not covered.** It is likely the
   sample's clearest example of a *player-authored constraint* (the player
   turns on difficulty conditions to unlock rewards), but every URL I tried
   404'd, so it is deliberately absent from §1 and §5 rather than described
   from memory.
6. **The GDC Slay the Spire deck lost its digits in extraction.** The PDF's
   font subsetting encoded letters recoverably but not numerals, so every
   number on those slides is missing: the "Balance: The Challenge" slide lists
   what two developers had to balance as "N characters, N cards, N items, N
   combats, N events", and the "Ascension" slide's level count is likewise
   blank. No counts are quoted from that deck anywhere in this document; all
   quoted *text* from it is verbatim. Both GDC decks are also cited by slide
   title rather than slide number, because my extraction preserved slide text
   but not reliable numbering.
7. **Monster Train's GDC 2021 postmortem is about production, not design.** I
   extracted the full deck; it covers prototyping, pitching, feedback culture,
   art pipeline and beta process. It contains no statement about clan pairing,
   floors or synergy, so it is not cited in §1–§5.
8. **Balatro's baseline hands and discards per round** (commonly 4 and 3) are
   not directly stated on any page I fetched; the deck modifiers ("+1 discard",
   "-1 hand") imply a baseline but do not name it. The body therefore refers to
   hands and discards without asserting the numbers.
9. **Peglin was not covered.** The ticket asked for "one inventory-constraint
   game such as Backpack Battles or Peglin"; I did Backpack Battles thoroughly
   rather than both thinly.
10. **§6 and the turn-dependence lines in §7 are analysis, not sourced claims.**
    They are inferences from the cited rules plus the two real-time exemplars.
    They should be argued with, not cited.

---

## 9. Pointers for the triad

Observations only — which findings above bear on which of the three open
questions. No recommendations, no preferred direction; the divergent design
work belongs to its own ticket.

### (a) The shape of a run

- Every game in the sample except Risk of Rain 2 has a **fixed end**, and Nova
  Drift's developer names the failure mode of not having one: when a build is
  judged by how far it pushes, "the higher the wave, the fewer builds are
  considered viable for it. This isn't great for build variety" (§4). Loop
  Survivors already has a fixed end (`plan.md` pillar 5).
- **Scheduled, guaranteed, high-variance reward moments** are what make one
  segment of a run feel different from the previous one — Slay the Spire's
  boss relic (choice of 3, only from bosses, at a fixed act boundary) and
  Balatro's boss blind (mandatory, rule-attached, every third round) are the
  two clearest instances (§4, §1).
- **Difficulty ladders that attack the economy, not the enemies.** Six of Slay
  the Spire's twenty Ascension levels change gold, shop prices, potion slots,
  upgrade frequency, event outcomes and starting curses rather than enemy
  numbers (§5). Balatro's stakes do the same ("Small Blind gives no reward
  money", "-1 Discard").
- **The clock as the constraint** is a live alternative to slot caps: Risk of
  Rain 2 has no inventory limit at all and gets its tension from a difficulty
  coefficient that is linear in minutes and exponential in stages (§1f).
- **Where the pauses are** determines which mechanisms are available at all
  (§6). A real-time game's decision points are its level-up screen, its
  walk-to nodes, and its between-run screen; every construction mechanism in
  §1–§2 has to attach to one of those three.
- Into the Breach's difficulty finding — for execution-led design, "too hard
  becomes 'unsolvable'" and the threshold "is a cliff" (§3) — bears on any
  segment of a run whose difficulty is meant to be answered by play rather
  than by build.

### (b) What powering up buys

- The sample buys at least six structurally different things with a level-up:
  a **new option** (a slot filled), **more of the same** (a stack, on a curve),
  **a gate cleared** (evolution / duo boon / recipe), **conversion** (breadth
  traded for concentration), **influence over future offers** (reroll, skip,
  banish, tags), and **a rule change** (relics, artifacts, boss blind
  modifiers). Loop Survivors currently uses the first three plus chest payouts
  (§2, §3, §5).
- **The stacking curve is a design dial, not a formula detail** (§2f). Risk of
  Rain 2 picks linear, hyperbolic, reciprocal or exponential *per item*, with
  the stated purpose of hyperbolic being that a percentage effect must never
  reach 100%. Linear rewards breadth; exponential rewards tunnelling;
  hyperbolic self-caps.
- **A named third object is what a player says out loud** (§2b, §4). Vampire
  Survivors' evolutions, Hades' Duo Boons and Backpack Battles' silhouetted
  recipes all convert "I have two things" into "I am building a third thing" —
  and Backpack Battles additionally makes *discovering* the recipe a reward.
- **Rarity weights are the offer-stream's real dial** (§3): 3%/10%/9% rare by
  source in Slay the Spire, 70/25/5 in Balatro, a flattening curve in Backpack
  Battles, "rarity determines the weight" in Vampire Survivors.
- **Metaprogression need not be power.** Four of the five carry-types in §5 —
  pool expansion, difficulty ladders, sidegrade toggles, offer-stream influence
  — add no raw numbers at all. Hades' Mirror is fourteen either/or pairs;
  Vampire Survivors' Banish is a permanent purchase whose entire effect is
  deleting options from your own future menus.
- **Two separately-growable quantities that multiply** is the sample's most
  reused scaling shape (§2a) — and in Balatro's case the multiplication existed
  before any of the content that plugs into it.
- Mega Crit's stated bar for every purchasable thing is a two-sided one:
  "Every card should have a place (also avoid anything too warping)" (§3).

### (c) What constrains a build

- **Six independent constraint families exist** (§1), and most of the sample
  runs three or four at once. They are not substitutes: a slot cap bites at
  pick time, dilution bites later and invisibly, spatial packing bites at
  placement, a throughput budget bites every turn, exclusivity bites at pick
  time by *deleting* options, and a clock bites continuously.
- **Dilution is the one that does not translate** (§6). It needs a randomised
  draw from an inventory; an auto-firing game fires everything it owns. Loop
  Survivors' band cap (`plan.md`) is a slot economy, which is the family that
  translates cleanly — Hades, Nova Drift and Vampire Survivors all run one in
  real time.
- **Exclusivity costs no content to add.** Nova Drift removes mutually
  exclusive mods from the pool outright, sometimes for coherence reasons rather
  than balance ("you can't 'Strafe' with Void Slice"); Hades' Mirror is built
  entirely from either/or pairs (§1e). Noted only as a difference: `plan.md`
  currently takes the opposite position — "Any weapon may sit alongside any
  other: there are no categories, no typed positions" — so this is the axis on
  which the sample's practice and the current design intent diverge most.
- **Slot scarcity is what gives gated combinations their price** (§2b). Hades'
  Duo Boons are expensive *because* five slots must hold two specific gods.
  A gate is only a constraint if the ingredients cost something to keep.
- **Order and geometry are constraints that cost no content** (§2e): the same
  set of picks arranged differently performs differently, in Balatro by list
  order and in Backpack Battles by packing. In a movement-only game, position
  is the one geometric variable that stays live during play (§6).
- **Anti-synergy and drawbacks are used openly**, not avoided: Slay the Spire
  ships unplayable Curses and Statuses and sells drawback-for-power trades at
  Neow; Balatro's decks are explicit trades (+1 joker slot / −1 hand); Risk of
  Rain 2's Shaped Glass doubles damage and halves health per stack (§1e, §2f).
- **There is a documented content-mass ceiling.** Nova Drift's developer: past
  roughly 150 upgrades "things started to get problematic", and "pulling a
  single thread cascades disastrously" (§3). Mega Crit's answer to the same
  problem was near-daily builds, an in-house metrics server and a public beta
  branch (GDC 2019, "Tools: Slack", "Tools: In-House Metrics Server" and
  "Tools: Discord" slides), which is a *process* answer to a *combinatorics*
  problem.
- **Legibility caps carried complexity** (§6): every conditional effect a
  real-time build carries must be understandable without reading during play.
