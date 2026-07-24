# How survivors-likes add depth: what the good ones changed, and what it cost

Research for issue #249 (part of #247). Surveys the survivors-like games that
have tried to add depth to Vampire Survivors' formula — Brotato, Halls of
Torment, Deep Rock Galactic: Survivor, 20 Minutes Till Dawn, Death Must Die,
Soulstone Survivors, Yet Another Zombie Survivors, Rogue: Genesia, and Vampire
Survivors' own post-launch expansions — and answers four questions for each:
what shape a run takes, what stops "take everything and stack it", where the
real decisions sit, and what the change cost in accessibility, pace, or flow.

All sources fetched **2026-07-25**. Priority was given to sources that own the
claim: Steam store pages and their feature bullets (developer-authored),
developer press releases and FAQs on the studios' own domains, official
wiki.gg wikis, and developer quotes in interviews. Where a fact could only be
found on a community wiki, a press reprint, or in aggregate player reviews, it
is labelled as such at the point of use. Everything that could not be verified
is listed in the final "Unverified" section — nothing here is guessed.

**Terms used below, in plain words:**

- *Survivors-like* — the genre Vampire Survivors named: you move, your weapons
  fire by themselves, enemies arrive in growing crowds, and you pick upgrades
  from a menu when you level up.
- *Autobattler / autochess* — a genre where you spend a shop phase buying and
  arranging units, then watch a fight resolve without further input. Its
  signature parts are a shop with rerolls, merging duplicate units into
  stronger ones, and set bonuses for owning several units of a type.
- *Run shape* — the sequence of states a single play session passes through
  from start to death or victory.
- *Extraction* — a decision to end the run early and bank what you have,
  instead of pushing on and risking it.

## The comparison, at a glance

| Game | Run shape | Primary constraint | Where the decisions are | What it cost | Steam |
|---|---|---|---|---|---|
| **Vampire Survivors** | 1 flat map, 30 min, authored schedule | None by design; Banish + Arcana XX are the only "give something up" mechanics | Level-up screen only; 3 Arcanas at 0/11/21 min | Nothing — but the formula is "solved" by its own players | Overwhelmingly Positive |
| **Brotato** | 20 waves, 20–90 s each, shop between every wave | Autobattler shop economy: 6 slots, price inflation, escalating rerolls, class-set penalties | Interleaved: ~20 combat phases, ~20 shopping phases | Not pace — *decision quality*. "False choices", unpriceable tradeoffs | Overwhelmingly Positive (112k/117k) |
| **DRG: Survivor** | 5 stages inside 1 biome; elite gate + 30 s extraction window per stage | Five at once: reload duty cycle, 4 slots, overclocks with numbered downsides, 2 currencies, mining opportunity cost | ~25–35 screen-stopping picks + level-up stream | The power spike. "does not let you feel god-like at endgame" | Very Positive (21.6k/24.7k) |
| **20 Minutes Till Dawn** | 1 infinite map, 20 min; bosses wall you in for 60 s | 1 weapon all run; **each upgrade takes only once**; Tomes with real penalties | 1-of-5 per level; 2 Tome picks; 1 evolution at Lv20 | Accessibility — manual aim needed an auto-aim toggle 7 weeks in; no auto-fire ever | Very Positive (12.4k/13.4k) |
| **Yet Another Zombie Survivors** | 1 flat map, 20 min; variety pushed into modes | Squad of 3 = 3 weapon sets; every stat pick is a "who gets it" pick; 8 single-stack item slots | 1-of-3, or **1-of-4 with a full squad**; recruit-or-decline at map SOS points | Not readability (one hitbox). A 3-person squad **exhausts the option pool** | Very Positive (4.7k/5.0k), still EA |
| **Halls of Torment** | 1 flat map, 30 min countdown — then 1.0/DLC **deleted the timer** | Exclusivity everywhere: 1 trait per category per rank, Growth traits disable siblings, Ethereal Shift −100% | Trait per level; 6 ability slots, 2-of-3 upgrades; **the Well extraction choice** | The 30-minute run. Dev responded structurally 4 separate times | Overwhelmingly Positive (30.2k/31.7k) |
| **Soulstone Survivors** | **No timer** — 5 kill-quota→boss cycles; clock counts *up* and gates rewards | Player-bought Curses in 7 tiers; 6 active slots vs unlimited passives | 1-of-3 per level; 10 rerolls/banishes/locks from the meta tree | Visual illegibility at high power — and the FX slider **erased build identity** | Very Positive (24.3k/26.6k) |
| **Death Must Die** | 1 act = 20 min, bosses at 7:00/14:00/20:00 | Pick 3 gods of 10 (locks out 6); hard slot caps by blessing type; Infusions that *cost* slots | 1-of-3 per level; reroll/banish/**alteration** dice; shrine choices | Not the dodge (5.9% of complaints). The god cap, and pre-run build-fishing | Very Positive (19.5k/21.6k), still EA |
| **Rogue: Genesia** | **Branching node map** — choose the path between fights | Not investigated here | Route choice between nodes | Not investigated here | Very Positive (93% of 4.0k) |

## 1. The baseline: what Vampire Survivors itself did next

Worth establishing first, because it is the control case. Vampire Survivors
sells itself as "a time survival game with minimalistic gameplay and roguelite
elements" (https://store.steampowered.com/app/1794680/Vampire_Survivors/).
Everything poncle added after launch was added *inside* that sentence.

**What poncle actually added, and what kind of thing it is:**

| Addition | Version / date | What it is |
|---|---|---|
| Arcanas | 0.8.0, 7 Jul 2022 | Up to three run-wide rule cards, chosen at run start and from boss chests at 11:00 and 21:00 |
| Limit Break | 0.8.0, 7 Jul 2022 | A toggle that removes the level cap so a finished build keeps growing |
| Reroll / Skip / Banish | base game | Level-up screen controls bought with career gold |
| Adventures | 1.8.0, 6 Dec 2023 | "a linear progression of stages", each unlocking the next |
| Unions | base game + DLC | Two weapons merge into one, freeing a weapon slot |
| Darkanas | 1.11 | Twelve more Arcana-shaped cards; "functionally they are exactly the same" |
| Ode to Castlevania stage | 31 Oct 2024 | One stage built as nine connected biomes with named rooms |
| Survarots | Ante Chamber, 28 Oct 2025 | A drafted card layer with skip / reroll / paid-boost-reroll options |
| Glimmer | Emerald Diorama, 10 Apr 2025 | "a spontaneous chance to utilize a powerful Glimmer technique which alters the weapons attack" |

Sources: https://vampire.survivors.wiki/w/Arcanas,
https://vampire.survivors.wiki/w/Limit_Break,
https://vampire.survivors.wiki/w/PowerUp,
https://vampire.survivors.wiki/w/Adventures,
https://vampire.survivors.wiki/w/Evolution,
https://vampire.survivors.wiki/w/Ode_to_Castlevania_(stage),
https://vampire.survivors.wiki/w/Ante_Chamber,
https://poncle.games/emerald-diorama-faq.

**Almost none of it constrains anything.** The wiki's Limit Break page: it
"allows for upgrading weapons and adding to their stats beyond their maximum
level" — the explicit purpose is to remove a ceiling. Arcanas are additive
rule cards. Adventures is a container for the same runs in a fixed order:
"Each adventure features a linear progression of stages and unlocks with a
predetermined roster of characters", and "no progress carries over"
(https://vampire.survivors.wiki/w/Adventures).

Three exceptions are worth naming because they are the only places Vampire
Survivors ever *takes something away*:

- **Banish**: "Twice per rank, allows you to remove an item from level up
  choices, for the rest of the run." The removal is permanent for that run.
  This is the only base-game mechanic where the player deliberately shrinks
  their own option pool (https://vampire.survivors.wiki/w/PowerUp).
- **Arcana XX, Silent Old Sanctuary**: "Gives +3 Reroll, Skip, and Banish.
  Gives +20% Might and -8% Cooldown for each active weapon slot left empty."
  A direct, numbered payment for *not* filling your build
  (https://vampire.survivors.wiki/w/Arcanas).
- **Arcana 0, Game Killer**: "Halts XP gain. Experience Gems turn into
  exploding projectiles. All Treasure Chests contain at least 3 items." It
  deletes the level-up loop for the whole run. The Darkana equivalent, Stake
  to Your Heart, goes further: "Halts XP gain. Enemies drop Gold Coins. Damage
  is dealt to Gold Coins instead of HP" (same source).

**Unions** are the one structural idea here: "a combination of two weapons.
Union weapons share similar characteristics with evolved weapons, except two
weapons are merged into one, hence emptying a weapon slot after the Union
weapon is obtained" (https://vampire.survivors.wiki/w/Evolution). A union is
the only mechanic in the game that gives a slot back — it turns the band cap
from a hard wall into something a build can play against.

**Ode to Castlevania is the only real change to run shape**, and it is a
change of geography rather than of structure. The stage runs the standard
30:00 but is built from nine biomes — Forest, Gallery, Alchemy, Library,
Tower, Aqueduct, Underground, Chapel, Entrance — each with its own spawns,
plus named rooms (a drawbridge, a throne room, a lower castle)
(https://vampire.survivors.wiki/w/Ode_to_Castlevania_(stage)).

**What it cost.** The Castlevania stage's cost was legibility. poncle
published a navigation guide video, titled "got lost in the big ode to
castlevania stage? we gotcha 👊", on 11 Dec 2024 — six weeks after release
(https://vampire.survivors.wiki/w/Got_lost_in_the_big_ode_to_castlevania_stage%3F_we_gotcha_%F0%9F%91%8A).
The developer shipping a "how not to get lost" video is the clearest
statement available that the added geography cost players their bearings.

**Statement of intent.** poncle's own Operation Guns FAQ says the DLC
"follows the hard trodden boot imprints of our previous DLC's" and that weapon
evolution works "the same as classic Vampire Survivors"
(https://poncle.games/operation-guns) — i.e. DLC is content, not mechanics.
And in a 2024 interview Luca Galante put the design posture plainly: "It's
absolutely not balance; balance is completely out of the window. I just want
to make stuff that is fun", adding "I still treat Vampire Survivors as my
little project that is made for me to have fun with. Because I feel like if I
start being a bit more professional about it, it might lose some of what made
it stand out" (https://www.pockettactics.com/vampire-survivors/interview).

**Read this row as the null hypothesis:** the genre's originator, with four
years and nine expansions, chose *not* to add constraint. It added rule cards,
more content, a bigger map, and a cap remover. Everyone else in this document
is diverging from a game that never diverged from itself.

## 2. Brotato — the run is chopped into waves, and the shop is the game

Blobfish (Thomas Gervraud). Early Access 27 Sep 2022, 1.0 on 23 Jun 2023.
Steam: "Overwhelmingly Positive", 112,254 positive of 116,860 reviews (96.1%)
as of fetch, via Steam's own review API
(https://store.steampowered.com/appreviews/1942280?json=1).

### The statement of intent

Gervraud, in Blobfish's 1.0 press release:

> "My goal with Brotato is to appeal to a very specific niche of people by
> combining mechanics from a few different genres, mainly the survivor-likes
> with hordes of enemies to fight off and autochess games with a shop allowing
> the player to create unique builds through weapon synergies and
> combinations."

— from the official Blobfish 1.0 press release (Zurich, 23 Jun 2023), read via
the reprint at https://www.chalgyr.com/2023/06/news-brotato-release.html; the
canonical Games Press copy refused automated fetch. This is the **only**
statement of design intent that exists for the game: there is no post-mortem,
and Blobfish's dev blog carries no design commentary.

It is also the single most useful sentence in the survey. Brotato's depth is
not a survivors-like innovation at all: it is a **graft of the autobattler shop
phase onto a survivors-like combat phase**. Every constraint below maps onto an
autobattler primitive — escalating rerolls, merging duplicates into higher
tiers, set bonuses at N pieces of a type, and locking the shop board between
rounds.

**Source warning for this whole section.** The official wiki
(brotato.wiki.gg) is unreachable to automated fetching — Cloudflare rejects
both the page and the API, with or without a browser user-agent. The mechanics
below marked *[community]* come from a different community MediaWiki
(brotato.wiki.spellsandguns.com) that carries no attribution to the official
one, so they are **community-datamined, not developer-authoritative**. Steam
news posts render client-side and could not be read, so no patch note in the
developer's own words was available either.

### Run shape

Store page, verbatim: "Survive waves lasting 20 to 90 seconds each and kill
off as many aliens as you can during that time", "Collect materials to gain
experience and get items from the shop between waves of enemies", "Fast runs
(under 30 minutes)" (https://store.steampowered.com/app/1942280/Brotato/).

**20 waves per run**, corroborated by the developer's own DLC copy — both
Abyssal Terrors and Primal Dread advertise "New map with 20 waves of new
enemies, elites and bosses!"
(https://store.steampowered.com/app/2868390/Brotato_Abyssal_Terrors/,
https://store.steampowered.com/app/4498220/Brotato_Primal_Dread/). *[community]*
Wave durations ramp in 5-second steps to wave 9, hold at 60 s through wave 19,
then 90 s for the wave-20 boss (https://brotato.wiki.spellsandguns.com/Waves).

The run ends on the wave-20 boss kill (a win) or on death. There is a shop
between every pair of waves.

**No developer explanation exists** for why 20 waves, why those durations, or
why a between-wave shop rather than in-run pickups. Do not read intent into the
numbers beyond the autochess sentence above.

### Constraint

1. **One currency for two things.** *[community]* "When you gain materials, you
   gain both Experience, used to level up, and Gold, the currency used to
   reroll and buy items"
   (https://brotato.wiki.spellsandguns.com/Materials). Every material missed on
   the floor costs both levels and buying power — so *positioning during the
   fight is a build decision.*
2. **Automatic price inflation.** *[community]* Item price =
   `(Base + Wave + Base × 0.1 × Wave) × Shop_Price`
   (https://brotato.wiki.spellsandguns.com/Shop). A base-10 item costs 12 at
   wave 1 and 40 at wave 15 — roughly 3.3× inflation across a run regardless of
   what you own (arithmetic mine). Buying power decays on a schedule.
   Countermeasure: "Locked items are not affected by inflation if you keep them
   locked between shops" — a layaway mechanic.
3. **Escalating rerolls.** *[community]* Reroll cost scales with the wave
   number and again with each reroll inside the same shop. Fishing for a
   specific item is cheap early and expensive late.
4. **Six weapon slots, which are also the crafting bench.** The tagline is the
   constraint, and it is developer-authored: "the only potato capable of
   handling 6 weapons at the same time". *[community]* Weapons have four tiers
   and two identical weapons of the same tier combine into one of the next tier
   (https://brotato.wiki.spellsandguns.com/Weapons) — so merging *frees slots*.
   Characters move the number; One Armed reads in full: "+200% Attack Speed /
   Damage modifications are increased by 100% / **You can only equip one weapon
   at a time**" — the slot limit *is* the whole drawback, paid for with a
   doubled damage-scaling rule.
5. **Set bonuses that bite, and that compete for the same six slots.**
   *[community]* Weapon-class set bonuses scale at 2/3/4/5/6 pieces and several
   carry explicit penalties: Blunt reaches "−10% Speed" at six; the **Legendary
   class is pure penalty — "−20 Max HP" at two, scaling to "−100 Max HP" at
   six** (https://brotato.wiki.spellsandguns.com/Weapon_Classes). Because only
   six slots exist, **a six-piece set consumes the entire loadout** — set
   bonuses and tier-combining are bidding for the same scarce resource. That is
   the sharpest structural idea in the game.

*[community]* Caps and diminishing returns are pervasive and deliberately
asymmetric: Dodge caps at 60%, attack speed at 12 attacks/second with
diminishing returns beneath it, HP regeneration's first point is worth 2.25×
every later point, and the DLC's Curse stat is asymptotic
(`50 × Curse / (50 + Curse)`).

**Curse is the one genuinely structural DLC addition**: *[community]* a stat
that is explicitly a two-way trade — stronger enemies in exchange for more
materials and more powerful items, where a cursed item's bonuses are multiplied
by a 1.1–2.1 ratio **and its downsides are divided by the same ratio**. The
player buys danger to make drawbacks cheaper.

**Nothing is permanent.** *[community]* Items recycle for 25% of current price,
60% with the Recycling Machine, 85% on the Entrepreneur character; weapons also
exit the build through tier-combining. The build is a portfolio you rebalance,
not a set of locked-in picks — the opposite of Vampire Survivors' permanent
weapon slots.

### Where the decisions are

Between every pair of waves: resolve loot crates, spend banked level-ups on
stat upgrade cards, then the shop — buy/skip on each offered item, free locks,
rerolls at rising cost, recycle decisions on owned gear. **No reliable count of
picks per run could be established** — the experience curve is not published in
any reachable source, and the sources conflict on the number of shop visits.
The honest statement is structural, not numeric: a Brotato run interleaves
roughly twenty short combat phases with roughly twenty shopping phases, and the
shopping phases carry the build.

*[community]* Difficulty ("Danger 0–5") changes enemy stats, roster and elite
frequency — but **never run shape**. 20 waves, same durations, same shop
cadence at every Danger. Both DLCs likewise leave run shape untouched.

### What it cost

**Not pace.** No top-voted negative review and no discussion thread found
complains about between-wave downtime or tempo. The sourced criticism is about
**decision quality**, and it is worth reading closely because it is the failure
mode a shop layer actually has (all quotes below are aggregate *player*
opinion, from Steam's review API):

- *Tradeoffs the player cannot price read as non-decisions.* The most-upvoted
  negative review in the set (55 votes): "when you get an upgrade thats +
  damage - attack speed it feels pointless or net neutral."
- *A constraint with one right answer stops being a constraint.* "Majority of
  choices (of level up stats, loot, and shop buys) are false choices… the shop
  punishes you for going off build. For most classes, you should use 6 of the
  same weapon and not even mix weapons of the same category."
- *Rerolls that cannot be aimed are just noise.* Rerolling "doesn't let you
  search for specific items, just toss out the trash."

Blobfish's answer to the false-choice pattern came in the Oct 2025 "New Dawn"
update: a ban system letting players exclude items from the shop pool per run,
unlocked at Danger 3+, items only (not weapons). **Press coverage only** — the
developer's own post was not readable
(https://nichegamer.com/brotato-releases-new-dawn-update/,
https://www.gematsu.com/2025/10/brotato-new-dawn-update-now-available-for-pc-coming-to-consoles-and-mobile-in-one-month).
Note the shape of the fix: **more constraint, chosen by the player**, not less.

## 3. Deep Rock Galactic: Survivor — the deepest constraint stack in the genre

Funday Games / Ghost Ship Publishing. Early Access 14 Feb 2024, 1.0 on
17 Sep 2025. Steam: "Very Positive", 21,577 positive of 24,686
(https://store.steampowered.com/appreviews/2321470?json=1).

Store page, verbatim: "a single player survivor-like auto-shooter… With the
auto-shooter gameplay, you don't worry about aiming and firing – just run and
mine for your life, as you automatically blast away."

### Run shape

**Five stages per dive, inside one biome.** Each stage except the last is
gated by elite enemies you must kill to proceed (1 wave on stage 1, rising to
4 elites plus a Dreadnought boss on stage 5). "Once the Elites have been
eliminated, the Drop Pod will arrive for extraction towards the next stage"
(https://deeprockgalactic.wiki.gg/wiki/Survivor:Objectives,
https://deeprockgalactic.wiki.gg/wiki/Survivor:Elimination).

**A 30-second extraction window.** When the stage boss dies the Drop Pod lands
and you have 30 seconds to board or fail the mission. Corroborated by an
official achievement: "Early access — Enter the drop pod with more than 30
seconds remaining", 7.9% global
(https://steamcommunity.com/stats/2321470/achievements/).

**Escalation is not a clock.** The Alien Threat Level rises "when the player is
dilly dallying", and by one step every 60 s during boss fights
(https://deeprockgalactic.wiki.gg/wiki/Survivor:Difficulty — flagged a stub).
So the pressure curve is driven by *player pace*, not by elapsed time. This is
the single biggest structural difference from Vampire Survivors' authored
minute-by-minute schedule.

Six biomes with flat difficulty modifiers (+5% enemy HP/damage in Magma Core,
+10% Hollow Bough, +15% Salt Pits) and Hazard levels 1–5 chosen at mission
select. Non-standard dive lengths exist: Weapon Mastery is 3 stages, Biome
Mastery is 10.

### Constraint

DRG: Survivor runs **five separate anti-stacking systems** at once, and it is
the only game surveyed that does.

1. **Reload duty cycle instead of ammo.** There is no ammo reserve and no
   resupply; Nitra buys upgrade cards, not bullets
   (https://deeprockgalactic.wiki.gg/wiki/Survivor:Resources). The cost is
   time: "Reload Time — Downtime after a clip is emptied before it can be
   fired again" (https://deeprockgalactic.wiki.gg/wiki/Survivor:Weapons). The
   Deepcore GK2 fires 30 rounds at 4.62/s then reloads for 4 s — roughly 62%
   uptime (arithmetic mine, from
   https://deeprockgalactic.wiki.gg/wiki/Survivor:Deepcore_GK2). **DPS is not
   `damage × fire rate`**; raising fire rate shortens the firing window. Four
   weapons is partly a decision about *overlapping duty cycles*, not just
   damage.
2. **Four weapon slots, filled on a fixed schedule.** You start with one
   determined by your class mod, and choose more at dive levels 5, 15 and 25
   (https://deeprockgalactic.wiki.gg/wiki/Survivor:Equipment). Class mods can
   restrict the eligible pool — Gunner's Juggernaut is "limited to default
   Gunner weapon pool".
3. **Overclocks, which are the real branch points.** "Balanced overclocks can
   be selected for a weapon at Weapon Levels 6 and 12, and a powerful
   'Unstable' overclock can be selected at Weapon Level 18"
   (https://deeprockgalactic.wiki.gg/wiki/Survivor:Overclocks). The Deepcore
   GK2 has 5 Balanced and 2 Unstable in its pool; a dive takes 2 of 5 and 1 of
   2. **Downsides are explicit and numbered**
   (https://deeprockgalactic.wiki.gg/wiki/Survivor:Overclocks/Data):

   | Overclock | Type | Effect |
   |---|---|---|
   | Lead Wrapped Ammo | Unstable | +150% Damage, **−20% Fire Rate, −20% Reload Speed** |
   | The Favourite (Projectile) | Unstable | +100% Damage & Fire Rate on this weapon; **all other weapons −30% Damage, −30% Fire Rate** |
   | High Caliber Rounds | *Balanced* | +100% Piercing, +30% Damage, **−30% Fire Rate** |
   | Bigger Mags | *Balanced* | +100% Clip Size, **−10% Reload Speed** |
   | Nano Waves | *Balanced* | +100% Potency, **−30% Damage** |

   The "Favourite" family is the strongest anti-stacking device found anywhere
   in this survey: it explicitly taxes your other three weapons, converting a
   four-weapon build into a one-weapon build at the moment of pickup. Note also
   that "Balanced" does not mean "no downside".
4. **Two non-fungible currencies, and a late-run economy collapse.** Nitra buys
   weapon cards; Gold buys player-stat cards, healing (30 Gold for 50% HP) and
   rerolls. On the final stage both become nearly worthless — their only
   remaining uses are rerolls and feeding a few artifacts
   (https://deeprockgalactic.wiki.gg/wiki/Survivor:Mid-dive_Upgrades). Some
   artifacts invert the economy entirely: Gold-Tipped Bullets gives "+1%
   damage for every 5 Gold you have. Max 250 stacks" — a reason *not to spend*
   (https://deeprockgalactic.wiki.gg/wiki/Survivor:Artifacts).
5. **Mining as an opportunity cost.** Mining means standing at a wall with
   your back to the swarm while the Alien Threat Level climbs. Funday's own
   1.0 post calls the game "built around the push and pull of mining for power
   while fighting to survive" (Steam news, "1.0 OUT NOW!").

Artifacts add a capped passive layer: one Supply Pod per stage, "a selection
of three artifacts", so **five per standard dive**; Endless Mode caps at 15,
"so every choice matters".

### Where the decisions are

Per five-stage dive: 3 weapon-slot picks; up to 12 overclock picks (achievement
data shows 10-in-a-dive is a recognised milestone at 24.5% global); 5 artifact
picks; 4 shop visits; 4 secondary-objective take-or-skip choices; 5
descend-or-farm decisions (soft: when to pop the elite cocoons; hard: the 30-second
pod window); plus one level-up card screen per dive level, each with a Gold
reroll on an escalating curve (5, 7, 10, 14, 20, 28, 39, 55, 77, 108…).
Roughly **25–35 screen-stopping picks** plus the level-up stream — an order of
magnitude more menu decisions than a Vampire Survivors run.

### What it cost — and the clearest statement of intent in the genre

Funday built a *more* structured version and killed it. Artist John Muller, to
NME (26 Jun 2023):

> "We mocked up going in that direction, spinning even further away from the
> [genre]. What we found during that process was that it took away from the
> autoshooter. **The game started to get too much about the mission, and not
> enough about deleting everything on the screen and mining.** … **It stopped
> being an autoshooter when there was too much other stuff going on. We had to
> pull back because we found the game was more complicated, but not more
> fun.**"

Creative director Anders Leicht Rohde in the same piece, on what mining buys:

> "It's now completely different, moment to moment. It's way more active than
> other autoshooters where you tend to just move slightly while waiting. Our
> game is way more strategic and tactical in what you do."

(https://www.nme.com/features/deep-rock-galactic-survivor-finds-joy-in-breaking-the-rules-of-vampire-survivors-3461649)

That is the depth budget stated out loud: **capped by feel, not by ambition.**
Two more Funday statements sharpen it. From the Apr 2024 roadmap: "the current
highest priority is enemies and overclocks. **This is because we think the best
thing for the game right now is adding more variety across the board instead of
extra layers.**" And in the 1.0 post they describe fixing a constraint that had
inverted its own incentive: "In early EA, the optimal play was often to ignore
the end-of-stage elite to farm mineral and XP, which felt backwards. Now, the
faster you kill the boss, the better chest reward you earn, **making for a
tradeoff between chest reward and farming**." (Steam announcements for appid
2321470.)

**The cost players actually name is not pace — it is the missing power spike.**
Sampling 100 English negative Steam reviews via the review API (aggregate
*player* opinion, not fact), the dominant theme is: "Unlike other bullet
heavens, this one does not let you feel god-like at endgame"; "You never really
feel becoming stronger over a particular enemy type"; "Most upgrades are +%
damage, +% fire rate… (BORING!)"; "Mining forces you to choose between killing
enemies OR getting stronger". Notably, several *positive* reviewers say runs are
too **short**: "the game ends too fast. by the time you beat the final boss you
are lucky to have more than a few overclocks."

That is the trade in one line: **the anti-stacking systems work, and a segment
of the audience experiences them working as the game refusing to pay off.**

Funday treated late-run visual soup as a rendering problem, not a design one.
Patch 1.0.87p: "Explosions look awesome. Too awesome, in some circumstances. To
address this, we've added a **VFX slider** that lets you tone down explosions
(and other effects), **making it easier to see glyphids on the map**." 1.0 also
added "Automatic Bug Bonk" — dwarves shove small bugs aside with the pickaxe —
"so you can squeeze through swarms without annoying chip damage."

## 4. 20 Minutes Till Dawn — one weapon, manual aim, and reload as a build axis

flanne. Early Access 8 Jun 2022, 1.0 exactly one year later on 8 Jun 2023.
Steam: "Very Positive", 12,358 positive of 13,396.

### The divergence, and the developer's reason for it

Store page feature bullet: "**Precise Control:** Directional aim and active
firing delivers a methodical battle system"
(https://store.steampowered.com/app/1966900/20_Minutes_Till_Dawn/).

flanne, to Chris Zukowski (How To Market A Game, 14 Jun 2022):

> "I honestly disliked the Vampire Survivors auto-shoot gameplay, so the
> decision to make it more active was mostly because of my personal
> preference."

and, on pairing depth with short sessions:

> "I think there is an audience that wants a game that has depth in mechanics
> but with short, casual play sessions."

(https://howtomarketagame.com/2022/06/14/20-minutes-till-dawn/)

### Run shape

Still one flat map for a fixed clock — the map is literally unbounded ("This
map is infinite in size, vertically and horizontally",
https://20minutestilldawn.wiki.gg/wiki/Forest). The run shape changes in only
two places:

- **Boss fights wall you in.** "When bosses spawn, a rectangular electric
  barrier traps the player for 1 minute while slowly becoming smaller. Bosses
  drop a Tome when killed" (https://20minutestilldawn.wiki.gg/wiki/Enemies).
  On an infinite kiting map, temporarily boxing the player is the single
  biggest rule change in the run. Forest schedule: elite at 3:00, boss at
  5:00, elite at 11:20, boss at 15:00, elite at 16:00.
- **Difficulty is a 16-step ladder ("Darkness" 0–15), cumulative**, unlocked
  one at a time (https://20minutestilldawn.wiki.gg/wiki/Darkness). Fourteen of
  the sixteen steps are stat multipliers. **Only Darkness 9 touches the
  decision space: "reduce upgrade choices by 1."** Worth noting as the one
  place a survivors-like scales difficulty by *narrowing choice* rather than
  inflating enemies.

### Constraint

- **You get one weapon, for the whole run.** Chosen before the run from 11
  bought with career Souls; there is no second-weapon pickup. The payoff for
  the restriction arrived at 1.0: "All weapon in the game will have 3 unique
  variants that players will get to choose from once they reach level 20 in a
  run!" (https://steamcommunity.com/games/1966900/announcements/detail/5129083846338804693).
  So instead of collecting weapons, **you deepen one**.
- **Each in-run upgrade can be taken exactly once.** 100 upgrades across 25
  trees, each tree a 1→2→3 tier shape
  (https://20minutestilldawn.wiki.gg/wiki/Upgrades). Stacking the same upgrade
  is possible *only* in Endless, where "each upgrade can be taken up to 3
  times" (https://20minutestilldawn.wiki.gg/wiki/Modes). This one rule is the
  main anti-stack device: you cannot take Power Shot five times, so you must
  broaden.
- **Ammo and reload are first-class stats.** Every weapon has a magazine and a
  reload time — Crossbow holds 1 round, Shotgun 2 with a 1.0 s reload, Dual
  SMGs 24 with 2.0 s. **The design then converts reload downtime into a build
  axis** rather than leaving it dead: Magic Bow — "When you reload, arrows
  return to you and deal damage to enemies that they pass through"; Cyclone
  Sword — "During reload, perform a spin attack"; the character Luna — "When
  reloading, a Black Hole is created"; the upgrade Fresh Clip — "+50% Bullet
  Damage for 1 second after reloading"; Siege — "Shooting when standing still
  has a 40% chance of not consuming ammo" (an explicit stand-still-versus-kite
  tradeoff). There is even an upgrade that *shrinks* your magazine: Mini Clip,
  "Max Ammo −4, Reload Rate +75%". All from
  https://20minutestilldawn.wiki.gg/wiki/Upgrades and the weapon pages.
- **Tomes are Faustian bargains.** "Tomes can provide significant advantages
  to the player, but many tomes also have some disadvantages"
  (https://20minutestilldawn.wiki.gg/wiki/Tomes). Tome of Glass doubles damage
  but any damage kills you instantly; Tome of Stillness removes walk speed
  entirely for double damage and double bullet size.
- **Synergies gate 12 upgrades behind specific combinations** — Death Rounds
  needs Reaper Rounds + Light Bullets; Frost Fire needs Intense Burn +
  Frostbite (https://20minutestilldawn.wiki.gg/wiki/Synergies).
- **Meta runes are hard-capped by slots, not by cost.** "You can only equip 2
  runes from each row at a time: one for Sword and one for Shield" — 4 + 4 = 8
  equipped maximum (https://20minutestilldawn.wiki.gg/wiki/Runes).

### Where the decisions are

Pick 1 of 5 per level-up (4 at Darkness ≥ 9); 2 Tome picks (1 of 3 each) at
the two boss kills; 1 weapon-evolution pick (1 of 3) at level 20; 3 elite
chests that grant a random character upgrade with **no choice at all**. Plus
the pre-run loadout (map, character, weapon, Darkness, 8 rune slots).

The structural point: **the moment-to-moment decisions are not in the menu,
they are in the aiming.** Vampire Survivors makes every second automatic and
concentrates decisions in the level-up screen; 20MTD moves a continuous stream
of micro-decisions — where to point, when to burn the last two shells, whether
to reload now or leave the Magic Bow's arrows on the ground — into the time
between level-ups.

### What it cost

**Accessibility, immediately and measurably.** flanne shipped an auto-aim
toggle seven weeks after Early Access launch, and labelled it as an
accommodation: "**Auto Aim!** You can now press 'space' to toggle on a
auto-aim mode for a more casual experience"
(https://steamcommunity.com/games/1966900/announcements/detail/4587497456688804235).
Auto-reload is on by default with an opt-out. **Auto-fire was never added** —
players work around its absence with autoclickers and mods, and hand strain
from twenty minutes of clicking is a recurring request thread
(https://steamcommunity.com/app/1966900/discussions/0/3325366198385187321/;
aggregate player opinion).

The reviews split cleanly in both directions on the same feature (Steam
reviews, aggregate player opinion): one disabled player credits auto-aim with
letting them play at all — "the auto-aim eases some of the workload so I can
focus more on character movement" — while another still cannot, asking for a
control scheme that does not need both sticks and a trigger.

**The readability cost came from the art, not the aiming**, and it is the most
upvoted complaint category: "due to the monochrome colors and the flashing
lights I just cannot focus on the screen"; "enemies are the same colour as the
cluster of explosions". flanne responded structurally — v0.8.2 added enemy
outlines, v0.8.5 changed bullet bounce to ricochet toward the nearest enemy
"to reduce player sprite obscurement".

**The developer's own diagnosis of what the constraints got wrong** is the most
valuable document in this section. From "Blessings & Curses — Coming to Beta
Branch Soon", 28 Oct 2024
(https://steamcommunity.com/games/1966900/announcements/detail/6212245217911959733):

> "The main goal of this update is to offer more variety and replayability
> between different runs."
> **Blessings:** "At certain early levels, players will be given a choice of 3
> blessings to take… Blessings will give you reasons to adapt and try
> different builds according to the blessings you are given on each run."
> **Curses:** "you'll be offered curses, that offer power with heavy
> penalties. There are different rarities of curses, with common curses
> offering simple stat tradeoffs to rare curses that completely alter how your
> character plays."
> **Runes:** "One of the issues with the old rune system, is that the build
> you go for is often somewhat defined by the runes you pick **before** you
> start a run. This makes it very hard [to] adapt your build on the fly during
> a run… **You will also no longer have to pick and choose as all purchased
> runes will be active in a run.**"
> **Character Specializations:** "Instead of getting character upgrades in
> random order from chests, you'll now be able to pick 1 of 3 'specializations'
> unique to each character… **The goal of this is to remove frustrating
> randomness and offer more flexibility to adapt your build each run.**"

Three lessons are stated there by the developer: a constraint chosen *before*
the run kills in-run adaptation; randomness without choice reads as
frustration, not variety; and the fix for build sameness is **run-to-run
variance injected early**, not more content.

**Caveat that matters:** as of this fetch that update has never shipped to the
Steam release branch. The last content patch on the wiki's Versions page is
1.0.1 (15 Jun 2023) and the last developer post of any kind is 28 Oct 2024,
while two mobile SKUs kept updating (last 29 Jun 2026) and now advertise "Over
80 different upgrades" against Steam's "over 50". So the diagnosis above is
**stated intent, not observed outcome.**

## 5. Yet Another Zombie Survivors — the build is a three-person party

Awesome Games Studio. Early Access 13 Jul 2023; **still Early Access at this
fetch**, with 1.0 announced for 20 Aug 2026. Current build 0.9.2a. Steam:
4,731 positive of 5,034; the studio reports "over 600,000 copies and 13,000+
Steam reviews with a 91% Very Positive rating". Everything about 1.0 below is
announced intent, not observed.

### Run shape

The canonical run is **the same 20 minutes on one flat map** as Vampire
Survivors — "Technically this mode lasts for 20 minutes and 10 seconds, though
it becomes impossible to die after the 20 minute mark"
(https://yetanotherzombie.wiki.gg/wiki/Game_modes_(Survivors)). All the
structural variety is pushed into *modes* rather than into stages: Hardcore
(10 min), One Hit (5 min), Boss Rush, **Extermination** (wave-based, "Between
you'll be able to level up, recruit Survivors, and choose military training and
items" between waves), Endurance, Infinite.

Two details worth stealing conceptually:

- **"Fatigue"**, an explicit anti-AFK debuff for uncapped modes, designed to
  cost nothing but the ceiling: "Fatigue only affects one thing: your maximum
  damage buffer… In a game that's all about getting stronger and pushing the
  limits, we obviously don't want to nerf any player's strength and power with
  a debuff like that, so the Fatigue doesn't affect anything else at all"
  (https://steamcommunity.com/games/2163330/announcements/detail/5218041989046481154).
- **Difficulty as a third, orthogonal progression axis** (0.7): "You'll start
  each run on each map at the first difficulty level… This gives you a third,
  vertical way to progress through the game's content… **We want the base
  difficulty level to be a relaxed experience.**"

### Constraint

**The squad is the constraint.** "At the start of a run, players pick a
survivor to be the team leader… Additional survivors can be rescued during the
run, up to a maximum of 3 (including the leader). Survivors rescued in this
way will provide half the value of their leader perk"
(https://yetanotherzombie.wiki.gg/wiki/Survivors). Mechanically the three
characters are **one movement entity with one hitbox** — patch notes refer to
"the party circle", "the player's hitbox" (singular) and "the squad's
location". One stick, one blob, three sets of guns firing independently.

Crucially, **squad size is itself a build decision with an opportunity cost.**
Developer post, 30 May 2023
(https://steamcommunity.com/games/2163330/announcements/detail/5151600576606547429):

> "When you level up, you're choosing to upgrade one of the characters you
> already have on your team — **we no longer include new character recruitment
> options in this screen.** In order to recruit new survivors, you'll need to
> respond to distress calls… When you interact with that person, you can
> either recruit a new character from the pool of survivors you've unlocked,
> **or rescue them for a reward if you want to take on the zombies as a lone
> wolf or as a two-person team**… It also gives you more incentive to explore
> the levels."

Two consequences: a smaller squad concentrates every level-up on fewer
characters, and because distress calls are physical map locations, **recruiting
is a movement decision** in a genre where movement is otherwise pure evasion.

The rest of the constraint stack:

- **Every stat pick is also a "who gets it" pick.** 0.7: "All weapon and
  ability-related stats are now tied to each of your Survivors… you can choose
  which Survivor receives the highest bonus (**others receive 50% of the
  bonus**)."
- **Ability evolutions fork permanently.** "56 Ability Evolutions… each ability
  will have two additional evolutions, which you can choose from as you level
  up your abilities to their maximum ranks." One of two, forever.
- **Eight item slots, single-stack, forcing swaps.** "Items… now serve as
  powerful **single-stack** gameplay modifiers… there's now a limit to how many
  you can have at any one time (up to 8)". The stated intent: "the limit should
  only be a real factor in the endless modes, where you'll have to strategize
  about which powerups to [keep]." Note the escape hatch: **Infinite mode
  exists specifically to remove the cap** — "Play as long as you like without
  the item slot limit but with most achievements disabled." Ship the constraint
  by default, ship an opt-out for players who want to break it.
- **Damage-type tags create a mono-versus-rainbow tension that only exists
  because you have three characters.** "stacking the new Slashing damage type
  tag increases the chance to apply the Bleeding status effect… Stacking more
  than 10 Slashing Tags gives you a chance to proc an Open Wound effect, which
  multiplies the Bleed damage by five!"
- **Cross-Survivor synergies make roster composition a first-class build axis**
  (0.7): "each Survivor receives two synergy nodes, each for a different
  teammate" — e.g. SWAT with Engineer, "Grenade Trail sometimes launches
  additional EMP Grenade".
- **Player-authored constraint:** "You can now **ban up to 20% of your items**
  (from needing to have at least 40 items unbanned)."
- **Caps were deliberately replaced by diminishing returns** (0.7): "Remember
  stat caps? Well, forget them, they're gone… **the idea being that you never
  have to stop accumulating power if you don't want to!**" — the opposite
  philosophy to 20MTD's take-each-upgrade-once.
- **Meta progression is deliberately not a constraint:** permanent upgrades are
  fully refundable — "if you change your mind just reset and try something
  else" (store page).

**Aiming is the mirror image of 20MTD**: automatic by default, manual as an
option, and the developer said so explicitly (31 Jul 2023):

> "While we're sticking to our design philosophy of making YAZS a casual and
> accessible game, we're also listening to the needs of our community… **you
> will be able to choose whether manual aiming works for the team leader only
> or for the entire squad at once.** Keep in mind that this feature affects the
> survivors' weapons, **not their abilities, which will always remain
> automatic**… **By default, the manual settings will be disabled.**"

The eventual landing point is the most interesting hybrid either game reached:
a *momentary* manual override — "an option to temporarily take over Auto-Aim by
holding Left Mouse Button or flicking the Right Stick" (0.9.0b).

### Where the decisions are

Pick 1 of 3 per level-up — **or 1 of 4 with a full three-person squad**. That
number moved deliberately: "If you're playing with a full team, the level-up
interface will now offer a choice of 4 options, **to reduce the overabundance
of options and help you build your team the way you want to play**." More
characters meant *too many* options, so the fix was to raise the offer count so
the choice stayed legible. Plus: up to 2 SOS recruit-or-decline decisions;
item-chest picks that become swap decisions once 8 slots are full; Military
Training picks that are also "who gets it" picks; ability-evolution forks;
weapon-tier replacements; Research Pod events. Declining is a positive play,
not a pass — "'Skip' function restores 10% HP and gives at least 150$".

### What it cost

**Notably, not readability.** No developer statement and no dominant player
complaint about controlling three characters turned up. The mitigation is
architectural: one hitbox in a party circle means positioning is exactly as
hard as controlling one character. The costs players report are adjacent — the
hitbox felt too large (the developers cut it ~15% in 0.7), and audio clutter
from three weapon loops.

**The real cost is that a three-person squad exhausts its own option pool.**
The sharpest player criticism (aggregate player opinion, Steam review):

> "The biggest issue in my opinion is the complete lack of build identity and
> variety. **Your run is determined by which combination of classes you pick
> for your party**… By the end of your normal run or at around the 25min mark
> into an endless run you'll most likely have unlocked every upgrade, both for
> weapons and skills."

With roughly five weapons and four abilities per Survivor, three Survivors and
a 20-minute clock, a full squad takes everything. The developers named the same
thing in Nov 2023 — the upgrade path is "5 upgrades → 5 evolved upgrades → 3
yet another evolved upgrades", and "the upgrade paths can get a bit old after a
while". Their 2026 player survey (2,362 responses) still puts **more synergies
at 54%** as the top request.

**A weak character is not merely weak — it consumes a third of the build.**
That is the specific cost of slot-based party composition, and a player names
it directly: "Her abilities are a waste of a squad spot because you sacrifice
so much damage for healing."

## 6. Halls of Torment — same run shape, but exclusivity everywhere

Chasing Carrots. Early Access 24 May 2023, 1.0 on 24 Sep 2024. Steam:
"Overwhelmingly Positive", 30,205 positive of 31,657
(https://store.steampowered.com/appreviews/2218750?json=1). Note: the official
wiki.gg wiki is unreachable to automated fetching, so mechanics detail below is
*[community]* from hot.fandom.com, cross-checked against developer Steam posts
wherever a claim was checkable.

### Statement of intent

Paul Lawitzki, Dev Journal #1, 24 Jan 2023
(https://store.steampowered.com/news/app/2218750/view/5035621474429844343):

> "And then Vampire Survivors came along and demonstrated how it's done…
> At first we hesitated. We didn't want to jump on the bandwagon… However, we
> wanted to put our own spin on the genre. We are big fans of old school action
> RPGs and CRPGs… **Our goal is to make a game you can play casually while still
> enjoying the rich atmosphere of these grandiose role playing games.**"

Halls of Torment is therefore the **Diablo graft**, exactly as Brotato is the
autobattler graft: gear slots, item rarity, affix variants, a town hub.

### Run shape — barely changed, then changed late

The base game is Vampire Survivors' shape almost exactly: one flat map, a hard
30-minute countdown, an authored spawn timeline, boss at zero. Producer Mara,
Dev Journal #3: "**In the main stages time ticks down from 30 minutes to your
certain doom.**" The six "Halls" are separate selectable maps, not stages
within a run.

**The interesting move came later, and it was to delete the timer.** The Vault
(1.0's final stage) has "no Time Limit. The Lord does not spawn at 30:00, but
instead has to be manually unsealed" — you destroy four 50,000-HP Pylons, and
"**A Vault run lasts for as long as the lord is alive**"
(https://store.steampowered.com/news/app/2218750/view/6341720536520860655). The
Boglands DLC went further: "**Time is not your enemy here – survival is.
Victory lies not in the grains in the hourglass, but in the piles of slain
foes**" — the Lord triggers at 20,000 kills. And the 2026 update generalises
it: "**Kill/Time mode switch. You will be able to play older maps in the same
game mode as the Bogland map**"
(https://store.steampowered.com/news/app/2218750/view/1839041357029299).

### The Well — an extraction decision, but not the one you would guess

There is no "Retreat" mechanic. Leaving early via ESC is a pure loss: the run
is not counted as won and you forfeit the completion bonus. **The extraction
decision happens mid-run, at the Well** *[community]*: "To make a looted item
reusable… Move to and interact with the Well. Select the item, then select
Retrieve." Critically, "**Sending an Equipment up the Well depletes it for that
round**", and only two Extra Buckets can drop per run
(https://hot.fandom.com/wiki/Item).

So the decision is: *of the items I have found this run, which one (or up to
three) do I permanently extract to my career?* Rarity gates it further — Rare
items "**Cannot be retrieved**" at all. This is the sharpest single decision in
any game surveyed, because it is a genuine conflict between *this run's power*
and *every future run's power*, resolved by walking to a physical location.

### Constraint — exclusivity as the primary device

- **Fixed, non-swappable main weapon per character** *[community]*. There is no
  weapon collection at all.
- **Six ability slots, and ability upgrades fork** *[community]*: "Up to 6
  abilities may be selected in a round"; "Each Ability has up to 3 upgrades,
  **but up to 2 may be selected in a round**"
  (https://hot.fandom.com/wiki/Ability).
- **Class Traits are mutually exclusive by category** *[community]*: "There are
  3 categories: Weapon Proficiency, Proficient Stance, Dedication. **Only 1
  Trait per category, Rank & Hero can be selected.**" The developer confirms
  the design intent at Rank V: "**Stances are trade-offs for major play
  styles**… **Only one of the V-Rank traits can be taken from each character
  per run.**"
- **Growth Traits disable their own siblings** *[community]* — each reads
  "Disables all other 'Strength'-Traits. Disables all other 'Growth'-Traits."
- **Ethereal Shift is a pure fork** *[community]*: "Melee: +30% Attack Speed
  (Melee) / **−100% Damage (Projectile)**", or the mirror image, or a weak
  both-ways option.
- **Boss chests offer three items and allow one** *[community]*. Declining all
  three instead grants XP worth 50% of the current bar — refusing is a priced
  option, not a waste.
- **Potions are the reroll/banish layer as an exhaustible in-run resource**
  *[community]*, with per-type capacities (Strong Wine ×10, Potion of Oblivion
  ×8, Reverbant Tinkture ×3) unlocked by finding herbs scattered one per Hall.
- **Blessings are capped**: 25–30 blessings, five ranks each, escalating gold
  cost. 1.0 note: "Blessings focus now on relative increase rather than
  absolute ones."

**Difficulty is player-authored.** The Shrine of Torment: "**Artifacts can be
toggled on/off. Each active Artifact increases the Torment Rank by 1.**"
Thirty of them, "**of which you can use as many as you want**", and they are
rule changes rather than multipliers — "Hastening Sands: −10 Minutes Run Time /
+30% Spawn Rate"; others "**set you on fire, reverse your walking direction, or
hurt you whenever you collect gold**". The developer's framing is unusually
blunt: "**We want to put back the Torment into the Halls and make HoT difficult
again!**… **while increasing the difficulty so much that we are sure you are
going to die, sooner or later.**"

**Secrets** are multi-step environmental puzzles that reward map knowledge with
a boss-fight advantage: in Haunted Caverns, following two blood trails to two
shrines assembles a Protective Pendant that hits the Lord for "**50% of the
Lord's health, regardless of Agony or Torment Rank**" *[community]*. Depth
bought with *knowledge*, costing only run time.

### What it cost

**The 30-minute fixed run is the dominant complaint**, and it is a pacing
complaint, unlike Brotato's or DRG's (aggregate player opinion, Steam review
API, negative filter):

> "…what completely pushes my opinion to negative is the **mandatory 30 minute
> runs, which are likely closer to 40 mins if you count in the pauses whenever
> you level up or get a new item**."

> "The first is the **30 minute time restriction per level. This game and game
> type do not have the requisite depth to ask that from a player.**"

> "**Takes like 10 minutes to clear the map of items, then you just stand there
> for literally 20 minutes.**"

The pre-rendered retro art costs readability, exactly as with 20MTD's
monochrome: "everything having a similar-ish color palette predictably makes
visability a nightmare once things get hectic".

**Chasing Carrots responded structurally, four separate times** — which is the
strongest evidence in this document that a fixed 30-minute run is a real cost
and not a taste issue: an artifact that removes 10 minutes; two stages that
delete the timer; a kill/time mode switch for every map; and a "Manual Trait
Selection" option so level-up screens stop auto-interrupting. Their words on
the last one: "level up screens open automatically so that they need to be
triggered manually."

## 7. Soulstone Survivors — the timer runs upward, and the player buys difficulty

Game Smithing. Early Access 7 Nov 2022, 1.0 on 17 Jun 2025. Steam: "Very
Positive", 24,339 positive of 26,637
(https://store.steampowered.com/appreviews/2066020?json=1). Mechanics detail
below is *[community]* from soulstone-survivors.fandom.com; developer Steam
posts are the primary spine.

### Run shape — the genre convention inverted

There is **no survival timer**. A run is a repeating kill-quota → boss-pack
loop *[community]*: "Eliminate a large number of enemies, typically hundreds…
Eliminate a group of Lords of the Void, which spawn once the kill quota is
met… **This loop continues through five full sequences, after which the match
concludes**" (https://soulstone-survivors.fandom.com/wiki/Void_Fields).

**The clock counts up and gates rewards, so finishing fast is the goal**
*[community]*: the red portal to Overlord mode "Opens **if the player completes
the game in under 13 minutes**"; the yellow portal to Endless "under 15
minutes" (https://soulstone-survivors.fandom.com/wiki/Portals). One
achievement asks you to "Complete a match in less than 8:00 minutes."

This is the cleanest structural inversion in the survey. Vampire Survivors pays
you for *enduring*; Soulstone Survivors pays you for *clearing*, and the survival
fantasy is replaced by a speed fantasy.

### Constraint — the player sets the difficulty and gets paid in materials

**Curses.** *[community]* "Up to 7 tiers of Curses can be activated, with each
tier stacking on top of the previous ones." Each tier is a point-buy menu —
tiers I–III need 4 points, IV–V need 5, VI–VII need 6 — from individual curses
costing 1–3 points each. Each point additionally applies flat global scalars:
enemy health +5%, damage +1%, and **Lords of the Void +20% health per point**.

Individual curses are rule changes: *Void Presence* — "An invincible void
presence slowly follows you, **causing fatal damage if it's able to attack
you**" (3 pts); *Ethereal Lords* — "Defeated Lords of the Void will now be
**reborn in an ethereal invulnerable form** and continue assisting the other
lords until the whole group is eliminated" (3 pts); *Pillars of Protection* —
enemies take 20% less damage per active pillar (3 pts).

**What curses buy is crafting material rarity**, and this is the load-bearing
mechanism *[community]*: Rare materials are "only available **if all curses up
to tier III are enabled**"; Epic needs tier IV; Legendary needs tier V; Void
Essences need tier VI (https://soulstone-survivors.fandom.com/wiki/Materials).
The player is not buying a score multiplier — they are buying access to
content. Game Smithing made this à-la-carte in Mar 2024: "**All curses are now
optional, and you can pick and choose which ones to play with**… Tanky Lords?
Tons of Elites? Rain of fire from the void? You choose!"

**Six active skill slots, unlimited passives.** *[community]* This asymmetry is
the design: actives are the scarce resource, "Powers" (passives) accumulate
without limit. Runes trade slots against power explicitly — *Focused Mind*:
"You have **2 less skill slots** but all damage you cause is increased by 70%";
*Improved Repertory*: "You have **1 extra skill slot** but all damage you cause
is reduced by 15%."

**Character identity is enforced by pool restriction, and it was tightened
deliberately**: "**Every character now has access to 5 skill types naturally,
down from 7. This change makes the playstyle of each character more unique**"
(https://store.steampowered.com/news/app/2066020/view/5749481331437537172).

**The meta tree buys selection control, not power.** *[community]* A fully
maxed global tree yields modest stats (+10% damage, +5% area) alongside **+10
Reroll, +10 Banish, +10 Lock charges**. Banish "permanently removes unwanted
options from appearing again in a run"; Lock preserves a desired Power for the
next level-up. Unholy Cathedral mode goes further: "Once a skill is selected
during a given cycle, **it becomes permanently locked out from future choices
for the rest of the run.**"

**Pre-run runes are Faustian** *[community]*: *All or Nothing* — "+25% damage,
movement speed, critical chance and critical damage, but **your maximum health
is set to 1 and cannot be increased**"; *Gambler* — "+10% damage, but **your
active skills are chosen randomly and cannot be changed**"; *Quality
Standards* — better rarity floor, but "**you will only receive 2 choices when
you level up**".

### What it cost — the developer wrote the list himself

Lead developer Allan, "Dev Talk #1", 27 Oct 2023
(https://store.steampowered.com/news/app/2066020/view/5229301621580813946),
under a heading literally titled GAME PROBLEMS:

> "1. **Game is too hard/dodge fest**: **The most requested change in the
> game**, where the end game has way too many enemy attacks and how it limits
> the way you can play the game;
> 2. **Endless Balance**: How runs can become stale, where **you are either
> immortal or instantly killed without being able to react**;
> 3. **Game Visibility**: **How the game can be very hard to navigate with the
> spam of skills**…
> 4. **Power Up Infos**: How the information displayed on the Level Up screen…
> can be hard to navigate or incomplete, **leading to confusion**;
> …
> 10. **Overall Skill Balance**: How there are **many underpowered skills that
> never get used, while others become mandatory**."

Programmer Lucas, Devlog #2, 19 Jul 2024: "**Damage areas being overlapped by
VFX has always been an issue of the game and it can make the game way more
difficult than it should be.**"

The tell: **the game shipped with a "special effect visibility slider" in Early
Access in 2022** and was still maintaining it in 2026 — and by Aug 2025 was
advertising it to players proactively: "Added new information card that appears
the first time you go into Endless or Overlord mode, that **highlights the
existence of the special effect visibility slider**."

The 2025 retrospective connects the visual noise to the unlimited passive
stack. On why co-op will not happen
(https://store.steampowered.com/news/app/2066020/view/1818118366173253):

> "**The design of the game is such that we would need to basically re-write
> large portions [of the] game to have it perform significantly better…** Even
> people with high-end machines would likely struggle, **since power scales so
> quickly.**"

Players describe the same two problems (aggregate player opinion, Steam review
API, negative filter, upvotes noted):

> "Had an absolute blast playing this game **up until the power scaling
> superseded the visual clarity. You literally cannot see damage fields in
> high-level play.**" (15 upvotes, 3,809 hrs played)

> "**Every build, character, weapon, and run all feel the exact same. The game
> appears to have too much diversity, but after a few runs you learn its only
> surface level.**" (65 upvotes, 2,425 hrs)

> "**It's even worse with visual clutter IMO, it's so high that I have to turn
> the FX down quite a bit which makes every run feel really similar** even if I
> use a different character/abilities." (5 upvotes)

That last one is the most important sentence in this section: **the readability
fix erased the build differentiation.** The visual layer was carrying the
identity that the mechanics were not.

## 8. Death Must Die — one weapon, a dodge button, and three gods out of ten

Realm Archive. Early Access 14 Nov 2023 — **still Early Access**; there is no
1.0, the last content patch was 0.8.5 (22 May 2025) and the latest build is
0.8.7 (Dec 2025). Three of a planned five acts have shipped. Steam: "Very
Positive", 19,523 positive of 21,649. Mechanics below are *[community]* from
dmd.fandom.com, which publishes verbatim dumps of the game's own data files.

### Run shape

**One act, exactly 20 minutes, three bosses on a fixed clock** *[community]*:
"Each Act / Tier contains 3 boss fights: First — on the **7:00** minute. Second
— on the **14:00** minute. Third — on the **20:00** minute"
(https://dmd.fandom.com/wiki/Monster). Killing the 20:00 boss ends the run as a
win. Acts are *selected*, not chained: Act I The Outer Circle, Act II The
Endless Desert, Act III The Darkmoor, each with its own map, enemies and item
tier.

Difficulty is **Darkness 0–100**, a point-buy modifier list plus a global stat
scalar — and **above 30 it gives no extra loot at all**, so the top 70 points
are pure challenge. Modifiers are rule changes aimed squarely at the dodge:
*Frenzy* — "Enemies attack and cast +80% faster"; *Big Brain* — "Enemy aim
improved by +150%"; *Llama Blessed* — "Enemies predict your movement at a 60%
rate"; *Zinger Blessed* — "While Attacking, you move −40% slower". It does not
change run structure.

### The two divergences

**The dodge is the only button in the game**, and the developer says so — Ren,
Roadmap News, 21 Nov 2025:

> "Action — This is a very underserved aspect for ARPG and Action Roguelite
> players. **With autoattack on, the only other 'skill' players have is
> dashing — which is quite limiting.**"

*[community]* Base dash cooldown 2.4 s; invulnerability frames are explicitly
modelled (0.049–0.056 s per dash blessing) and patched as first-class balance
levers — "Dash i-frames no longer prevent lose life effects". Enemy attacks are
telegraphed, and windups are tuned in patch notes: "Fungus plays windup
animation before explosion"; "Frog King Breath attack preparation time 1.3s >
1.65s".

**The Gods system is an exclusivity engine.** *[community]* "Blessings for up to
**4 gods** may be selected per round. The **Moirai** are fixed, while the other
**3** are freely selectable" (https://dmd.fandom.com/wiki/Blessing). Ten gods
grant blessings, so **choosing three locks out six**. Each god has exactly one
Attack blessing and one Dash blessing, so taking Winter's attack means you can
never have Summer's.

Crucially, **you never pick gods from a menu.** Early in the run any unlocked
god can appear at a level-up; a god becomes one of your three by appearing.
The build space therefore collapses in the first few minutes, invisibly.

*[community]* Blessings come in five rarities (Novice → Adept → Expert → Master
→ Legend) and **one rarity is rolled for the whole offer, not per card** — so a
"Master offer" is a whole screen of Master. Legends are Legend-only: all 24
exist at no other rarity. There is **no god level and no favour stat** — higher
rarities are gated purely by the roll. What *does* gate blessings is a
prerequisite tree: "Certain Blessings are **Dependent**, and are only added to
the pool once certain **Prerequisites** are met" — synergy passives only enter
the pool once you own something they can amplify.

### Constraint

*[community]* **Hard slot caps by blessing type**, per hero: Attack 1, Dash 1,
Strike 3, Cast 3, Power 2, Summon 1, **Passive unlimited**. "Except Passives,
each Hero has limited slots for each type, **regardless of Rarity**." Gear can
buy +1 on some types.

**Fated Infusions trade slots for power** outright: "Cyclone Helix — Your
Tornadoes are upgraded… **Lose a Strike slot**"; "Two Become One — Your Clone is
upgraded… **Lose a Summon slot**."

**One weapon per hero, permanently** — Avoron/Sword, Merris/Staff, Nixi/Knife,
Kront/Axe, Skadi/Greatsword, Lorien/Bow, Leaf/Fist. No weapon collection.

Three separate consumable controls, all limited-count "dice" *[community]*:
**Reroll** (new blessings from the same god), **Banish** ("remove a god's
blessing from appearing again in that attempt. **This includes all rarities and
levels of it**"), and **Alteration** ("change the blessings to ones from a
**different** god") — the last being a mechanic no other game here has.

Anti-stacking maths is unusually explicit *[community]*: hidden per-stat
Scaling Factors mean +10%/+25%/+50% on a 0.2-factor stat yields ×1.178, not
×1.85; negative multipliers are *divisive* so stats cannot go negative; and the
in-game tooltip states outright that "**Armor scales linearly, meaning that
gaining more armor does not give you more or less effective life per point.**"
Encounter shrines are pick-one-of-N with real costs: "[Atrophy] −22% Less
Experience, +22% Spell Damage / [Engulf] **All skills offered are Novice**,
+111% More Experience / [Writhe] **Lose All Luck**, +2 Spell Projectiles."

### What it cost — the most candid developer writing in the genre

Ren's Steam devlogs are the best design documents this survey found, because
he grades his own game and fails it in specific places.

**On why the game diverged at all** — Devlog #2, 5 Feb 2026
(https://steamcommunity.com/app/2334730/discussions/2/686364301854787121/):

> "I also think our bullet heaven is a bit of an outlier in that **it has a
> dash, bosses, some amount of action difficulty and ARPG-style items**. We've
> always had more action / other elements and **I think we need to lean in on
> them instead of away**. I don't see the point of offering a very similar,
> less content-heavy experience to other games."

**On the genre's replayability ceiling** — same post, and this is the sentence
most worth carrying forward:

> "I also grow pretty tired of doing a 20 minute 'easy mode' run of *only*
> horde clearing. And I think a lot of people do too, which is why they want 10
> minute runs and such… **our player base is kind of low now — the game is
> solved and it's a bit stale. Bullet heavens often run into this issue because
> while the progression is fun, once you achieve it — the replayability is
> minimal / builds are 'same-y'.**"

**On the cost of his own constraint** — the god system produced pre-run
build-fishing, exactly the failure mode a constraint is supposed to prevent:

> "Currently, a lot of the builds necessitate **fishing for god X or Y. This
> predetermines the run before it is even started** — losing the variety and
> fun of making choices on the fly."

**On slot types making most content dead** — the sharpest self-criticism here:

> "This 'stat-based' difference between strikes, casts, powers, etc. **has to
> go**… most importantly, **by playing into 1 slot-type pre-run all the rest of
> the blessings are de facto nullified completely in-run, they are not just
> 'badly usable', they are useless. And this issue exacerbates with each act
> more and more as the power disparity between slot types grows.**"

**On difficulty, from Devlog #3, 14 Jun 2026**
(https://steamcommunity.com/app/2334730/discussions/2/572665855469568610/),
where he taxonomises six kinds of difficulty check and grades the game:

> "Ultimately, the main element of difficulty is speed… **Given that a lot of
> players have found our difficulty too 'bull#%^#' when we tried to dial it up,
> I think our speed is too high. Because high speed difficulty doesn't play
> well I think. It can feel quite unfair.**"

> "**Our ACTION-memory check is not good due to lack of boss polish in
> animations, warnings and timings.** Being a roguelite this issue is a bit
> worse than for most action games because not knowing a boss' moves usually
> means having to replay a run from scratch."

> "**Our game relies too much on GRIND check**… **Players going into Act 3 with
> Tier 1 items struggle a lot and it's an infuriating experience.**"

> "As an example, **we've had people for whom it took 3 seconds to kill the
> Lady of the Lake and others for whom it took 14 minutes. This is clearly not
> working great.**"

And his verdict on the baseline formula, which is the cleanest statement of the
whole design question anyone in this survey has written:

> "**Bullet heaven stat-checks I find too little second-to-second control in,
> and largely too easy after a given time investment. I don't think it's a form
> of difficulty as much as it is the enjoyment of farming and grinding.**"

**On being caught between audiences:**

> "For some time now we've been trying to walk the line between (largely) two
> audiences that want us to go in opposite directions. **And we failed by
> trying to have both elements coexist.**"

### What players actually objected to

A recency-weighted keyword coding of 598 recent English negative reviews
(aggregate player opinion; recent reviews skew negative because of the content
drought) puts **Early Access / update drought at 29.8%** — far ahead of
everything else. **Dodge/dash/telegraphs is 5.9% and difficulty/unfairness is
3.5%, the two *least*-mentioned themes.**

That is the headline finding for this game: **the divergences are not what
players complain about.** The manual dodge and the 20-minute run are broadly
accepted ("Runs take around 20 minutes each, which is the perfect time in my
opinion"). The sharpest *design* complaint is the god cap — and it matches
Ren's own diagnosis word for word:

> "i hate the gods system they have… **you wont be able to get skills of other
> gods. you gonna get only this 3 gods over and over again.**"

> "Good game but needs to **remove the god cap and let us mix it up more.**"

Where readability is criticised it is about *legibility of telegraphs*, not
about density: "the isometric view causes a little bit of difficulty seeing the
attack telegraphs"; "all difficulty is just number bloat and **unreadable
attacks**".

**The announced pivot** (Roadmap News, 21 Nov 2025) is the clearest signal of
where a designer lands after three years inside this problem: authored
geography instead of an infinite plane ("large open areas, winding pathways,
passages to secret rooms"), **player-chosen route** ("you will be able to
choose your path in the underworld, picking the rewards you want. That includes
gods"), explicit **bad-RNG protection**, and — most striking — **active skills**:
"We are making a new skill system, where players can choose to make builds with
anywhere from **0 to up to 5 buttons**." Note that even while adding buttons he
keeps zero-button builds available.

## 9. Rogue: Genesia — a node map between the fights (short note)

Not on the ticket's reading list, but included because it is the one
well-received survivors-like whose run shape is a *map* rather than a timer,
and that is directly on-question. Early Access 19 Sep 2022, 1.0 on 7 Mar 2025.
Steam: "Very Positive", 93% of 4,036 reviews.

Store page, verbatim: "**choose which path Rog takes. Feel brave enough to take
on a powerful foe, or would you prefer to rest at the shop? The choice is
yours!**" (https://store.steampowered.com/app/2067920/Rogue_Genesia/).

That is the Slay the Spire structure — a branching node map where each node is
a short survivors-like wave, and the branch point is a risk/reward decision
made *between* fights rather than during them. It is the cleanest existing
demonstration that a survivors-like can carry an explicit route decision, and
that the genre audience will accept one. This document did not investigate it
deeply enough to say what it cost; treat it as a lead, not a finding.

## 10. What the survey shows across all nine

These are patterns that only appear when the games are read side by side. Each
is grounded in the sourced material above.

**1. Run shape barely moved. Only one game genuinely restructured it.** Six of
the nine still run one flat map against a fixed clock. Brotato chops the clock
into waves; DRG: Survivor is the only one with true stages and an extraction
gate; Soulstone Survivors is the only one to delete the survival timer outright
and replace it with a clear-speed objective. The two games that *did* change
run shape late — Halls of Torment's timer-free stages, Death Must Die's
announced route map — both moved in the same direction: **from a clock toward a
place**.

**2. The fixed-length run is the pacing complaint, and only where the run is
long.** Nobody complains about 20 minutes. Halls of Torment's 30 is the one
duration that drew sustained criticism, and Chasing Carrots responded four
separate ways. DRG's ~5-stage dive drew the *opposite* complaint — that it ends
too soon. The signal is not "shorter is better"; it is that a fixed clock with
a flat middle is what players notice.

**3. Constraint is not the same as depth, and several developers found this out
in public.** Death Must Die's slot types made most of the game's content
"useless" rather than interesting (Ren's word). Brotato's economy collapsed into
"use 6 of the same weapon". Soulstone Survivors' 350+ skills produce runs that
"all feel the exact same". **A constraint with one right answer is not a
constraint — it is a tutorial.**

**4. The most successful constraints are legible and priced.** The mechanics
that read as genuinely good in their communities are the ones a player can
evaluate at the moment of choosing: DRG's "The Favourite" (+100% to this
weapon, −30% to the other three), Halls of Torment's Ethereal Shift (−100%
projectile damage), 20MTD's Tome of Glass (double damage, any hit kills you),
Arcana XX (+20% Might per empty slot). The ones that fail are those whose maths
the player cannot do — Brotato's "+damage −attack speed" cards.

**5. Every game that added power also had to add a way to see through it.** DRG
shipped a VFX slider and "Automatic Bug Bonk"; Soulstone Survivors shipped an
effect-visibility slider *in Early Access in 2022* and was still maintaining it
in 2026; 20MTD added enemy outlines and changed bullet ricochet; Halls of
Torment's art style is its most-cited readability cost. **The readability tax is
universal and it is paid in options menus.** Soulstone Survivors shows the sting
in the tail: a player who turns the effects down reports every run then "feel[s]
really similar" — the visuals were carrying the build identity.

**6. The two aiming experiments landed in the same place from opposite
directions.** 20MTD started manual and added auto-aim seven weeks later; Yet
Another Zombie Survivors started automatic and added optional manual aim,
"disabled by default". YAZS's endpoint is the most interesting: a *momentary*
override — hold to take over, release to go back. Nobody who diverged on aiming
kept the divergence mandatory.

**7. The genre's own designers describe the same ceiling from both sides.** Ren
(Death Must Die): "**the game is solved and it's a bit stale. Bullet heavens
often run into this issue because while the progression is fun, once you achieve
it — the replayability is minimal / builds are 'same-y'.**" Funday Games found
the opposite limit: "**we found the game was more complicated, but not more
fun.**" Between those two quotes is the whole design space.

**8. Player-authored difficulty is the genre's most reliable depth mechanism.**
Halls of Torment's 30 toggleable artifacts, Soulstone Survivors' 7 curse tiers,
Death Must Die's Darkness 0–100, YAZS's item bans, Brotato's New Dawn bans.
Five of nine games converged on it independently, and in one case the reward for
accepting a constraint is **access to content** (Soulstone's material rarity
tiers), not a score multiplier.

**9. Where a mechanic gives a slot *back*, it is prized.** Vampire Survivors'
Unions merge two weapons and free a slot; Brotato's tier-combining does the
same. Both are among the most-discussed systems in their games. A cap that can
be played against reads differently from a cap that simply stops you.

**10. Extraction exists in only two games, and it is the tensest decision in
either.** DRG's 30-second drop-pod window, and Halls of Torment's Well — where
sending an item up permanently removes it from the current run and adds it to
your career. Both work because they force a choice between *this run* and
*something outside this run*.

## 11. What could not be verified

Nothing above is guessed, but several things are weaker than they look.

1. **Three of the eight surveyed games have no reachable official wiki.**
   wiki.gg serves 401/403 to automated fetching for Halls of Torment and Death
   Must Die, and Cloudflare blocks brotato.wiki.gg entirely. Mechanics for those
   three are marked *[community]* and come from Fandom or an unaffiliated
   MediaWiki. Death Must Die's community wiki republishes the game's own
   data-file dumps, so its numbers are high-confidence; Brotato's is the weakest
   link in this document.
2. **Brotato has no developer commentary at all** beyond the single 1.0
   press-release sentence, and even that was read via a reprint because the
   canonical Games Press copy refused automated fetch. No post-mortem, no design
   blog, and Steam news posts render client-side. **No count of decisions per
   Brotato run could be established** — the experience curve is unpublished and
   sources conflict on shop-visit counts.
3. **No developer has explained why ammo/reload exists in DRG: Survivor.** The
   NME quotes concern mission complexity, not ammo. Any claim that they added or
   cut ammo for stated reasons is unsourced.
4. **DRG: Survivor's total run length has no first-party figure** (~30 min is
   secondary-source consensus). The number of cards per level-up screen is
   undocumented, and whether weapons can be swapped after selection is stated
   nowhere.
5. **Death Must Die's base dash charge count is contradicted across sources.**
   Its base blessing slot counts (1/1/3/3/2/1/∞) come from a community guide
   cross-checked against patch notes, not a first-party statement. The claim
   that the game has *no enemy contact damage* is asserted only by an
   experienced player, never by Realm Archive.
6. **Death Must Die's Steam store "current state" text is stale** — it claims 6
   characters, 8 gods and 2 areas against an actual 7 heroes, 10
   blessing-granting gods and 3 acts. Do not quote it.
7. **Soulstone Survivors' six-active-skill cap is community-sourced only**, and
   the number has been rebalanced at least once (a rune that once read "3 less
   skill slots" now reads "2 less"). No developer statement gives the base.
   Likewise no dev source states a currency multiplier for curses — the
   *verified* reward is material-rarity gating.
8. **20 Minutes Till Dawn's "Blessings & Curses" update has never shipped to
   the Steam release branch.** Its developer post is quoted here as a
   *diagnosis*, which is what it is; it is not evidence of an outcome. The last
   Steam content patch is 1.0.1 (Jun 2023) while the mobile SKUs kept updating,
   and the two versions now advertise different upgrade counts.
9. **Yet Another Zombie Survivors is still Early Access**; everything about its
   1.0 (announced 20 Aug 2026) is stated intent.
10. **Death Must Die is still Early Access** — there is no 1.0, contrary to the
    ticket's premise. Its announced pivot (route map, active skills, removal of
    item tiers) has not shipped.
11. **Aggregate player opinion is labelled as such throughout**, and is evidence
    only about how players talk, not about the games. The Death Must Die review
    coding in particular is recency-weighted and skews negative because of that
    game's content drought.
12. **Rogue: Genesia was not investigated to the same depth** as the other
    eight. Its row in the table is deliberately incomplete.
13. **This session's WebSearch budget was exhausted** partway through, limiting
    the hunt for developer interviews beyond those cited. No GDC talk or formal
    post-mortem was found for any of the nine games. Several publications (PC
    Gamer, TechRadar, TechRaptor, GameSpot) refused automated fetching, so a few
    developer quotes are cited from search-result summaries rather than article
    bodies; these are flagged at the point of use.

## Pointers for the triad

Observations only. These are things the survey found that bear on the three open
questions in map #247. They are deliberately not proposals, and no direction is
recommended — the divergent design work belongs to its own ticket.

### (a) On the shape of a run

- Only one of eight games replaced the flat map with real stages
  (DRG: Survivor). Two more deleted the survival timer rather than restructure
  around it (Soulstone Survivors from the start; Halls of Torment retrofitted,
  and now generalising a "Kill/Time mode switch" to every map).
- The two games that changed run shape *after* launch both moved from a clock
  toward a place: Halls of Torment's boss-activation and kill-count stages,
  Death Must Die's announced "choose your path in the underworld".
- Fixed run length drew complaints at 30 minutes and not at 20. DRG's shorter
  staged dive drew the reverse complaint — that it ends before the build lands.
- Escalation does not have to be time-driven. DRG's Alien Threat Level "rises
  when the player is dilly dallying", so the pressure curve tracks player pace.
  Note this sits directly against an authored schedule.
- Where the clock is inverted so *finishing fast* is the goal (Soulstone
  Survivors' 13- and 15-minute portal gates), the fantasy changes from endurance
  to clear speed.
- Mid-run rule changes that box the player in are cheap and legible: 20MTD's
  boss barriers trap the player in a shrinking rectangle for 60 seconds on an
  otherwise infinite map.
- Extraction decisions exist in only two games and are the tensest moments in
  both — DRG's 30-second pod window, Halls of Torment's Well (which costs the
  item *for the current run*).
- Rogue: Genesia demonstrates a branching node map is commercially viable in
  this genre. What it costs was not established here.

### (b) On what powering up buys

- Vampire Survivors' own post-launch answer was "more, without limit" — Limit
  Break exists to remove a ceiling, and its designer states the posture outright:
  "balance is completely out of the window."
- Every game that let power accumulate without a slot cap paid in legibility,
  and each shipped an effects slider. Soulstone Survivors is the clearest case:
  unlimited passives, a visibility slider since 2022, and a player report that
  turning effects down made every run feel the same.
- 20MTD's rule that **each upgrade can be taken only once** (relaxed to three
  times only in Endless) forces breadth rather than stacking — the simplest
  anti-stack device in the survey.
- Several games make a level-up buy *selection control* rather than power.
  Soulstone Survivors' maxed meta tree grants +10% damage but +10 rerolls, +10
  banishes and +10 locks. Death Must Die adds a third control, *alteration* —
  swap the whole offer to a different god.
- Rarity can be rolled per-offer rather than per-card: in Death Must Die one
  rarity is rolled for the entire screen, so a good roll is a good *moment*.
- Prerequisite trees mean a synergy upgrade only enters the pool once you own
  something it can amplify (Death Must Die's Dependent blessings; Brotato and
  20MTD gate combination upgrades similarly).
- Evolution in Vampire Survivors mostly does not raise damage — six of ten
  evolutions keep the maxed base weapon's damage number exactly and change
  behaviour instead (sibling doc `docs/research/vs-weapon-progressions.md`).
- Where a reward is a *slot back* rather than a stat, it is prized: Unions in
  VS, tier-combining in Brotato.
- Rewards can be declined for value: Halls of Torment pays XP worth 50% of the
  current bar for refusing all three chest items; YAZS's Skip "restores 10% HP
  and gives at least 150$".

### (c) On what constrains a build

- The taxonomy actually in use: **slot caps** (VS band cap, Brotato's 6, DRG's
  4, Soulstone's 6 actives, Death Must Die's per-type caps); **exclusivity**
  (Halls of Torment's one-per-category traits, Death Must Die's 3-of-10 gods,
  branching weapon upgrades); **economy** (Brotato's inflation and rerolls,
  DRG's two currencies); **opportunity cost in the world** (DRG's mining, YAZS's
  map-located recruits, Halls of Torment's secrets); **priced downsides**
  (overclocks, Tomes, curses, class-set penalties); and **player-authored
  difficulty** (five of nine games).
- Constraints fail in a specific, documented way: they collapse to one right
  answer. Brotato — "you should use 6 of the same weapon". Death Must Die — one
  slot type "nullifies completely" all other blessings. Soulstone Survivors —
  "by the time you have 6 abilities, every character is basically the same".
- A constraint chosen *before* the run kills in-run adaptation. Both 20MTD and
  Death Must Die diagnosed this in their own words — 20MTD on pre-run runes
  ("This makes it very hard to adapt your build on the fly"), Death Must Die on
  god-fishing ("This predetermines the run before it is even started").
- A tradeoff the player cannot price reads as no choice at all. Brotato's most
  upvoted negative review is exactly this.
- Downsides that name a *specific other thing* are the ones that work. DRG's
  "The Favourite" taxes your other three weapons by name; Ethereal Shift zeroes
  an entire damage class; Arcana XX pays per empty slot.
- Constraint can be sold as access rather than punishment: Soulstone Survivors
  gates crafting-material rarity behind curse tiers, so accepting difficulty
  unlocks content rather than multiplying a score.
- Vampire Survivors contains exactly three mechanics that remove options —
  Banish, Arcana XX, Game Killer — and all three are optional. The genre's
  originator never made a constraint mandatory.
- The party-slot version of a cap has a distinctive failure: a weak unit does not
  merely underperform, it consumes a third of the build (YAZS).
- Two games explicitly replaced hard caps with diminishing returns at 1.0 (Halls
  of Torment's items, YAZS's stat caps — "Remember stat caps? Well, forget
  them"), while Brotato and Death Must Die keep hard caps and explicit scaling
  factors. The genre has not converged here.
