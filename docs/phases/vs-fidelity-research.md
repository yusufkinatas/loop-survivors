# Vampire Survivors "Mad Forest" — Implementation Reference for a Feel-Clone

**Scope:** Everything a developer needs to reproduce the *feel* of VS's first normal stage (Mad Forest, 30:00, the stage the prompt calls "Il Molise" — that name is wrong; Il Molise is a separate bonus stage, see note). Focus is the first ~10 minutes plus the systems that make them feel the way they do.

**Confidence legend:** `[H]` high (official/mirror wiki, cross-verified), `[M]` medium (single source, minor disagreement, or interpretation), `[L]` low (estimate / disputed / not published).

**Global sourcing caveat `[H]`:** The authoritative Fandom wiki (`vampire-survivors.fandom.com`) is unreachable (HTTP 402). Every number here comes from the maintained mirror `vampire.survivors.wiki` (wiki.gg), cross-checked where possible against Hold-To-Reset (patch 0.8.0) and search snippets. No page prints a patch tag; treat all values as "current 1.x live build." Core fodder stats have been stable since Oct 2021.

**Premise fix `[H]`:** "Mad Forest = Il Molise" is incorrect. Il Molise is a *bonus* stage (non-moving tiled enemies, Reaper at 15:00). Mad Forest is the first *normal* stage (30:00). All data below is Mad Forest.

---

## 1. PLAYER BASELINE

Generic base values (every character), then the default starter **Antonio Belpaese**.

| Stat | Base (generic) | Internal | Cap | Confidence |
|---|---|---|---|---|
| Max Health | 100 HP | integer | none | `[H]` |
| Recovery (regen) | 0 HP/s | additive | none | `[H]` |
| Armor | 0 | flat −1/hit | 50 | `[H]` |
| Move Speed | 100% | 1.0 | none | `[H]` |
| Might (damage mult, internal "power") | 100% | 1.0 | 1000% | `[H]` |
| Amount (extra projectiles) | 0 | integer | 10 | `[H]` |
| Cooldown | 100% (lower = faster) | 1.0 | 10% | `[H]` |
| Area | 100% | 1.0 | 1000% | `[H]` |
| Duration | 100% | 1.0 | 500% | `[H]` |
| Speed (projectile, *not* move) | 100% | 1.0 | **500%** | `[H]` (a verifier corrected the extraction, which omitted this cap) |
| Luck / Growth / Greed / Curse | 100% each | 1.0 | none stated | `[H]` |
| Magnet (pickup radius) | 30 | integer | — | `[H]` |
| Revival | 0 | integer | — | `[H]` |

**Antonio Belpaese (default) `[H]`:** Max Health **120** (base 100 + character bonus +20), Armor **+1**, Recovery 0, starting weapon **Whip**. Trait: +10% Might every 10 levels, capped at +50% at level 50 (L1–9 = +0%, L10–19 = +10%, … L50+ = +50%). (An early fetch produced "140 HP"; that was an arithmetic artifact — the correct table value is 120.)

**Percentage-stat display convention `[H]`:** the stat panel shows the *offset from base*. "+30% Might" on the panel = 130% total. Integer stats (HP, Armor, Amount, Magnet, Revival, Recovery) show their actual value.

**Move Speed absolute units — NOT FOUND `[H]`:** neither wiki publishes px/s or a documented player↔enemy conversion. Move Speed exists only as a percentage. **You must pick your own player px/s (call it `V`) and derive everything else from the ratios in §3.** Do not invent a VS pixel value.

**Two "speed" stats — terminology trap `[H]`:** "Move Speed" = character movement (no cap). "Speed" = projectile travel speed (cap 500%). The wiki page titled *Speed* is the projectile one.

---

## 2. CONTACT DAMAGE MODEL

This is the entire threat model — enemies have **no attack other than touching you**.

- **Damage per hit `[H]`:** `damage = enemyPower − Armor`, floored at a **minimum of 1**. (Antonio's 1 Armor turns a Power-10 zombie into 9 dmg/hit; can never drop below 1.)
- **Not once-per-touch `[M]`:** while you overlap an enemy you take damage *repeatedly on an interval*. Important nuance from verification: the official *Enemies* page only confirms contact damage *exists* ("Power = damage dealt upon coming in contact, before Armor") — the explicit "repeated on an interval" wording comes from a third-party guide (rogueranker). The repeated-hit behavior is correctly *inferred* from the invulnerability mechanic below. Treat "ticks repeatedly" as reliable but the exact tick constant as unofficial.
- **Invulnerability window (i-frames) `[H]`:** after taking damage the player is invulnerable for **240 ms** base (≈14–15 frames @60fps). This is the minimum gap between successive contact hits. **Disagreement:** a third-party guide claims ~100 ms `[L]`; prefer the official **240 ms** and discard 100 ms.
  - The i-frame stat "affects all sources of invulnerability" (Floor Chicken pickup, taking damage, certain weapons).
  - Modifiers: **Parm Aegis** +50 ms/level, max +250 ms (5 levels) `[H]`. Enemah arcana M17 −500 ms / M18 +500 ms `[H]`.
- **Observed cluster cadence `[L]`:** a third-party guide reports "~0.3 s between hits" standing in a cluster without Parm Aegis. This is approximate observation, not an official constant.
- **No published contact tick constant `[H]`:** the 240 ms i-frame is what governs the real inter-hit gap. Use it.

**Porting formula:** a single overlapping enemy deals at most `1000/240 = 4.17 hits/s`. Effective player-DPS-taken from one enemy = `4.17 × (Power − Armor)`. Worked: a Power-10 zombie on a 0-armor 100-HP player = ~41.7 dmg/s → **death in ~2.4 s of continuous contact**; on Antonio (120 HP, 1 armor → 9/hit) = ~37.5 dmg/s → ~3.2 s. That 2–3 second "don't get surrounded" budget is the core of the feel.

---

## 3. EARLY ENEMY TABLE (Mad Forest, first ~15 min)

All values are **base bestiary stats** (before the run-time modifiers in §4). **★ = HP × player level at spawn** (bosses/elites only; scales with your level, locked at spawn). All confirmed `[H]` on individual wiki pages; Zombie/Skeleton/Ghost/Werewolf independently matched Hold-To-Reset 0.8.0 (stable since early access).

**Speed conversion `[M]`:** enemy MoveSpeed and player "100%" sit on the same nominal 100-based scale (this ratio is the community reading, *not* a documented constant). **Generic "×player" = enemySpeed / 100.** But in Mad Forest specifically the stage grants **Player MoveSpeed ×1.1, Enemy MoveSpeed ×1** `[H]`, so relative to the *Mad-Forest player* divide by 110. Both columns given.

**Contact-dmg %** is `Power` as a fraction of a 100-HP player (0 armor). For Antonio subtract 1 from Power first, divide by 120 (shown in parentheses).

| Enemy | HP | Power (contact) | %of100HP (Antonio 120/1arm) | Speed (int) | ×player generic | ×player in Mad Forest | XP | Role |
|---|---|---|---|---|---|---|---|---|
| Little Pipeestrello (bat) | 1 | 5 | 5% (3.3%) | 140 | 1.40× | 1.27× | 1 | opener fodder, fast |
| Red-Eyed Pipeestrello | 5 | 5 | 5% (3.3%) | 140 | 1.40× | 1.27× | 1 | fodder, fast |
| Zombie | 10 | 10 | 10% (7.5%) | 100 | 1.00× | 0.91× | 1 | basic fodder, kiteable |
| Skeleton | 15 | 10 | 10% (7.5%) | 100 | 1.00× | 0.91× | 2 | fodder, arrives in walls |
| Ghost | 10 | 5 | 5% (3.3%) | 200 | 2.00× | 1.82× | 1.5 | **fast** flanker (KB 0) |
| Gray Mudman | 70 | 10 | 10% (7.5%) | 100 | 1.00× | 0.91× | 2.5 | mid-tank, slow |
| Green Mudman | 150 | 10 | 10% (7.5%) | 100 | 1.00× | 0.91× | 2.5 | tankier mid (~2× gray) |
| Werewolf | 180 | 14 | 14% (10.8%) | 130 | 1.30× | 1.18× | 2 | fast + hits hard |
| Giant Bat | 270 | 10 | 10% (7.5%) | 140 | 1.40× | 1.27× | 2.5 | fast HP-wall |
| Mantichana (mantis) | 500 | 20 | 20% (15.8%) | 80 | 0.80× | 0.73× | 3 | slow heavy wall |
| Venus (flower) | 500 | 20 | 20% (15.8%) | 80 | 0.80× | 0.73× | 3 | slow heavy wall (Mantichana twin) |
| **Bosses / elites** | | | | | | | | |
| Glowing Bat / Silver Bat | 50 ★ | 10 | 10% (7.5%) | 140 | 1.40× | 1.27× | 30 | minute-boss, drops chest |
| Giant Mantichana (10:00) | 150 ★ | 20 | 20% (15.8%) | 160 | 1.60× | 1.45× | 50 | chest-gate mini-boss |
| Giant Werewolf (15:00) | 200 ★ | 20 | 20% (15.8%) | 130 | 1.30× | 1.18× | 2 | mini-boss (1.5× size) |
| Giant Blue Venus (25:00) | 150 ★ | 30 | 30% (24.2%) | 160 | 1.60× | 1.45× | 50 | de-facto stage boss, unlocks Hyper; freeze-resist |
| **Event-swarm variants** | | | | | | | | |
| Bat Swarm bat | 1 | 1 | 1% (0.8%) | **700** | 7.00× | 6.36× | 1 | line-sweep, defang-resistant |
| Ghost Swarm ghost | 10 | 5 | 5% (3.3%) | **700** | 7.00× | 6.36× | 1.5 | line-sweep |
| Flower Wall (event enemy) | 30 `[L]` | 1 `[L]` | 1% | 20 `[L]` | 0.20× | 0.18× | — | closing-ring enemy; **stats from 0.8.0 legacy source only, unverified on current wiki** |

**Notes:**
- **Knockback:** Zombie 0.8 (reduced-KB), Skeleton 1, Ghost 0 (KB-resistant), Mudmen 0.3 (reduced), Werewolf 0.8, Giant Bat 0.1, Mantichana/Venus 0 (resistant). Matters for whether your knockback-carrying weapons can create space.
- **Mummy is NOT in Mad Forest `[H]`** (it's Inlaid Library / Eudaimonia). The 17:00–24:00 Mad Forest tank is "Giant Mummy / Big Mummy" — a different large sprite that appears only after the 15-minute window.
- **Speed feel that defines Mad Forest:** basic fodder (100 int) is *slightly slower than the Mad-Forest player* (0.91×) → kiteable. Bats/Giant Bat (1.27×), Werewolf (1.18×), and especially Ghost (1.82×) *outrun* you → they are the pressure. Swarm variants (6.36×) cross the screen almost instantly — that's the "wall sweeping through" event feel.

---

## 4. ENEMY SCALING OVER TIME

**The headline for a Mad-Forest clone `[H]`:** normal base-game stages (Mad Forest included) have **NO per-minute HP/power/speed multiplier**. There is no "HP ×N by minute M" curve on this stage. Difficulty escalates purely by (a) spawning **tankier enemy TYPES** on a schedule, (b) rising wave floors and tightening spawn intervals, and (c) scripted spatial events. **Port the schedule in §5, not a scaling formula.** Enemy base stats in §3 are what you fight, unmodified by minute, on Mad Forest.

Run-time modifiers that *do* multiply stats (for completeness / if you add difficulty modes):

- **Curse `[H]`** — the on-demand global enemy buff. Multiplies enemy **max health, move speed, spawn frequency, spawn quantity** by the Curse %. **Does NOT affect enemy damage/power.** Base 100%. Spawn timing: `effectiveInterval = baseInterval / totalCurse`. Health multiplier applies immediately to new spawns; speed/frequency/quantity apply at the start of the next minute.
- **HP × Level `[H]`** — a per-enemy skill (bosses/elites: ★ in §3) that multiplies HP by the player's level *at spawn*, not updated afterward. **Exact per-level multiplier is not published.**
- **On-screen caps `[H]`:** **300** alive halts *periodic* spawning ("only bosses and map-event enemies can then spawn" — Enemies page). Absolute hard cap **500** regardless of Curse/Charm (Curse page). Reconcile as: waves fill up to 300, bosses/events can push to 500.
- **Modes (not Mad-Forest-default):** Inverse: +200% start HP, +5% HP/min, +1% speed per 2 min. Endless: per cycle +100% base HP, +50% frequency, +50% quantity, **+25% damage** (only documented mode where contact damage scales over time). Hyper: +65–75% move speed (player *and* enemies), +15–25% projectile speed, +50% gold.
- **Challenge-stage per-minute curves — DISPUTED, `[L]`, and irrelevant to Mad Forest:** the wiki *contradicts itself* by exactly 2× (Stages summary says Bone Zone +15% HP/min; the dedicated Bone Zone page says +30% (+0.3) — same 2× gap for Bat Country). The extraction also *assumed compounding* (1.1^M); the infobox notation reads **additive/linear** (`1 + rate×minute`), so compounded totals like "×16 by minute 20" are unsupported. Do not use these for a Mad Forest clone.

---

## 5. MAD FOREST MINUTE-BY-MINUTE (first ~10 min)

**Wave mechanics `[H]`:** one wave per minute. Each wave has an **enemy minimum** (floor) and a **spawn interval** (s). Below the minimum the game spawns to fill; above it, it spawns one of each listed type per interval. Actual alive count hovers near the minimum for a competent build and climbs toward the 300 ceiling if you can't clear.

**Event notation:** `offset-into-minute / trigger-chance / ×amount` (the ×amount meaning — sweeps vs enemies-per-sweep — is not defined on the wiki; don't over-read it).

| Time | Spawns | Min | Interval | Boss / chest | Scripted event |
|---|---|---|---|---|---|
| 0:00 | Red-Eyed Pipeestrello (bats) | 15 | 1.0 s | — | — |
| 1:00 | Zombie, Pipeestrello | 30 | 1.0 s | Glowing Bat (chest) | — |
| 2:00 | Pipeestrello, Red-Eyed ×2 | 50 | 0.5 s | — | **Bat Swarm** 0:05 / **100%** / ×3 (guaranteed, teaching) |
| 3:00 | Skeleton | 40 | 0.25 s | Glowing Bat | Bat Swarm 0:05 / 10% / ×2 |
| 4:00 | Skeleton, Ghost | 30 | 1.0 s | — | Bat Swarm 0:05 / 10% / ×2 |
| 5:00 | Green Mudman | 10 | 1.0 s | Mantichana | **Flower Wall** 0:00 / **100%** (closing ring) `[M]` dur ~30 s |
| 6:00 | Zombie, Green Mudman | 20 | 0.5 s | — | Bat Swarm 0:05 / 10% / ×2 |
| 7:00 | Red-Eyed ×2, Gray Mudman | 80 | 0.5 s | Glowing Bat (Lv2) | **Bat Swarm** 0:05 / **80%** / **×6** (big) |
| 8:00 | Zombie | 100 | 1.5 s | Giant Bat | Bat Swarm 0:15 / 80% / ×3 |
| 9:00 | Giant Bat, Zombie | 30 | 0.5 s | Silver Bat | Bat Swarm 0:15 / 70% / ×3 |
| 10:00 | Gray + Green Mudman | 10 | 0.5 s | Giant Mantichana | **Flower Wall** 0:00 / 100% `[M]` dur ~60 s |

**Three scripted event types `[H]`:**
1. **Bat Swarm** — a wall/line of speed-700 bats sweeps across the screen, pushing enemies. First one at 2:00 is guaranteed (the teaching moment). Recurs at low % most minutes, big at 7:00 (80%/×6).
2. **Flower Wall** — an ellipsoid **closing ring** of flowers surrounds the player and contracts. 5:00 (100%), 10:00 (100%), 15:00 (80%), 25:00 (×6). Forces movement/positioning.
3. **Ghost Swarm** — line of speed-700 ghosts sweeps across. 13:00 and 27:00 (both outside the first 10 min).

**Difficulty shape, 0–10 min `[H]`:**
- **0:00–1:00 gentle on-ramp** — bats then zombies, floor 15→30, interval 1.0 s. Whip one-shots everything.
- **2:00 first density bump + teaching event** — floor 50, interval 0.5 s, guaranteed Bat Swarm wall.
- **3:00 dense trickle** — skeletons at 0.25 s interval (tightest early cadence), floor 40.
- **4:00 breather + new type** — floor drops to 30, interval back to 1.0 s, **fast Ghosts** introduced.
- **5:00 FIRST INFLECTION** — floor drops to 10 but the enemies get *tanky* (Green Mudman 150 HP) + **closing Flower Wall** + Mantichana boss (500 HP). Quality over quantity.
- **6:00–7:00 density ramp** — floor 20→80, big 80%/×6 Bat Swarm at 7:00, Gray Mudmen fill in.
- **8:00 HP floor jump** — floor 100 (interval loosens to 1.5 s), first **Giant Bat** (270 HP, fast).
- **9:00–10:00** — Giant Bats + zombies, then floor drops to 10 for the **Giant Mantichana** chest-gate + 2nd Flower Wall.

**(Context beyond 10 min):** 11:00 is the second hard inflection — a **skeleton wall at floor 300 / 0.1 s interval** (first cap-saturation) `[M]` (the schedule research confirmed "300" verbatim; a second verifier could not re-find the "300" figure — flagged). From ~14:00 intervals mostly lock to 0.1 s (with a 17:00–19:00 tank on-ramp exception), late escalation carried by enemy *quality* (werewolf→mummy→venus), Giant Blue Venus stage boss at 25:00, Reaper at 30:00 (clears board, +1/min after).

---

## 6. WHIP — FULL SPEC (Antonio's starting weapon)

**Base (Level 1) `[H]`:** Damage **10** · Cooldown **1.35 s** (fastest of any base starter) · Area **100%** · Amount **1** · Projectile Interval **0.1 s** (gap between slashes once Amount>1) · Speed ignored · Duration ignored · Pierce = **Area of Effect** (hits every enemy in the hitbox, no pierce cap) · Knockback 1 · Pool limit 30 · Crit 20% **only** while the Slash (XVI) Arcana is equipped (base Whip *cannot* crit) · Crit multiplier 2× base, **4× when Slash Arcana is active** `[H]` (a verifier added the 4× figure the extraction omitted).

**Shape `[H]`:** a horizontal rectangular slash originating at the player's torso, extending sideways. First slash fires toward the facing direction. With Amount>1, successive slashes alternate toward/away from facing and step progressively higher (vertical offset). Area% scales the rectangle. **No pixel dimensions are published — NOT FOUND.** Implement as a horizontal band; tune width to taste and scale by Area%.

**Per-level table (1–8) `[H]`** (identical on wiki page, raw wikitext, and rogueranker):

| Level | Upgrade | Running Damage / Area / Amount |
|---|---|---|
| 1 | Base weapon | 10 / 100% / 1 |
| 2 | +1 Amount | 10 / 100% / **2** |
| 3 | +5 Damage | 15 / 100% / 2 |
| 4 | +10% Area, +5 Damage | 20 / 110% / 2 |
| 5 | +5 Damage | 25 / 110% / 2 |
| 6 | +10% Area, +5 Damage | 30 / 120% / 2 |
| 7 | +5 Damage | 35 / 120% / 2 |
| 8 | +5 Damage | **40 / 120% / 2** |

Cumulative at max: +30 Damage, +20% Area, +1 Amount. Cooldown never changes (stays 1.35 s). (Base Amount is **1**, not 2 — one early search summary said 2; that's wrong `[H]`.)

**Evolution → Bloody Tear `[H]`:** Whip (**max level 8**) + **Hollow Heart** (owned, **any level** — max NOT required for this base-game evo; rogueranker's "must be maxed" claim is wrong per the authoritative Evolution page) → open a **Treasure Chest** (drops from elites/mini-bosses, generally from ~10 min).

**Bloody Tear stats `[H]`:** Damage **40** · Area **130%** (+10% vs maxed Whip) · Amount 2 · Cooldown 1.35 s · Interval 0.1 s · Pierce = AoE · Knockback 1 · Pool 30 · **innate 10% crit at 2×** (works with no Arcana, scales with Luck) · **Lifesteal: +8 HP whenever a critical hit lands, 1 s internal cooldown.** Same slash pattern as Whip, red. Evolved weapons don't level normally, but the infobox's "+per level" fields are **Limit Break** progression (not template artifacts, as the extraction guessed) — the endgame post-max mechanic `[H]`.

---

## 7. OTHER WEAPON REFERENCE (Level-1 base) `[H]`

"Area" is a **multiplier** (1 = 100% native hitbox; no absolute px published). Several list Pierce = "AoE" = unlimited hits within the zone. All confirmed against the Overview_Stats table + weapon pages.

| Weapon | Dmg | CD (s) | Area | Amount | Speed | Pierce | Behavior |
|---|---|---|---|---|---|---|---|
| Magic Wand | 10 | 1.2 | 1 | 1 | 1 | 1 | auto-fires bolt at **nearest** enemy |
| Knife | 6.5 | 1.0 | 1 | 1 | 1 | 1 | fires straight in **facing** direction, long range |
| Axe | 20 | 4.0 | 1 | 1 | 1 | 3 | thrown up, **gravity arc** down |
| King Bible | 10 | 3.0 | 1 | 1 | 1 | AoE | books **orbit** player for 3.0 s duration |
| Fire Wand | 20 | 3.0 | 1 | **3** | 0.75 | 1 | spread of fireballs at a **random** enemy (base Amount 3 — verified, surprising) |
| Santa Water | 10 | 4.5 | 1 | 1 | ignored | AoE | falls, leaves ground **puddles** ticking every 0.5 s (2.0 s dur) |
| Cross | 5 | 2.0 | 1 | 1 | 1 | AoE | **boomerang** at nearest, hits out and back |
| Garlic | 5 | 1.3 | 1 | aura (no count) | — | AoE | persistent damaging **aura** around player; CD = per-enemy re-hit gap |
| Runetracer | 10 | 3.0 | 1 | 1 | 1 | AoE | diamond **bounces off walls** for 2.25 s |
| Lightning Ring | 15 | 4.5 | 1 | 2 | ignored | AoE | **instant** strikes on 2 random on-screen enemies |
| Pentagram | =enemy max HP | 90 | — | — | — | AoE | **screen-clear** nuke (1.0 s), not a damage baseline |
| Bone | 5 | 3.0 | **1.2** | 1 | 0.75 | bounces | thrown, **bounces** off terrain/enemies for 2.0 s |

Cadence pattern for calibrating a custom set: fast single-target pokes cluster at CD 1.0–1.3 s / dmg 5–10 (Knife, Garlic, Magic Wand); mid weapons at CD 2–3 s / dmg 10–20 (Cross, King Bible, Fire Wand, Runetracer, Bone); heavy AoE at CD 4–4.5 s / dmg 15–20 (Axe, Santa Water, Lightning Ring). Speed defaults to 1.0 except the "heavy" feel weapons (Fire Wand, Bone at 0.75).

---

## 8. XP ECONOMY

**Gem values `[H]`:** color reflects XP carried, not a fixed type. **Blue** up to 2 XP (basic enemies drop 1). **Green** 3–9 XP. **Red** 10+ (no cap). Gorgeous Moon arcana gems = 1 XP each. **Consolidation:** if >400 gems are on the ground, no new gems drop and further XP accumulates into a single red gem.

**Level-up cost curve `[H]`** (hand-verified against the wiki's cumulative anchors): start at L1. L1→2 = **5 XP**, then **+10 XP per level through L20**, **+13 XP** L21–40, **+16 XP** L41+. Extra lumps: **+600 XP** onto the 20→21 step, **+2400 XP** onto 40→41.

Cumulative XP to *reach* a level (first 20 explicit; all match wiki):

| Reach L | XP | | Reach L | XP |
|---|---|---|---|---|
| 2 | 5 | | 12 | 605 |
| 3 | 20 | | 13 | 720 |
| 4 | 45 | | 14 | 845 |
| 5 | 80 | | 15 | 980 |
| 6 | 125 | | 16 | 1125 |
| 7 | 180 | | 17 | 1280 |
| 8 | 245 | | 18 | 1445 |
| 9 | 320 | | 19 | 1620 |
| 10 | **405** | | 20 | **1805** |

Further anchors `[H]`: L30 = 5466.5, L40 = 9886.5 (fractional values are genuine wiki-calculator output).

**Growth stat `[H]`:** direct multiplier on all gem XP. Base 100%, panel shows offset. `effectiveXP = gemXP × (totalGrowth/100)`. Stacks additively, no cap. Growth PowerUp +3%/rank (max +15%). Built-in curve smoother: **+100% Growth temporarily granted at levels 20 and 40**, reverted −100% at 21/41. (Hurry mode +25% XP most stages; Bat Country −75%.)

**Level-ups in first 8–10 min of Mad Forest — NOT PUBLISHED `[L]`.** No per-enemy XP or leveling-pace metric exists on the wiki. Estimate ~**17–23 level-ups** (roughly L18–24) by the 8–10 min mark for a functional build, derived from: 1805 XP to reach L20, most fodder dropping 1-XP gems, ~100% Growth → ~1805 kills. This swings widely with character/build/Growth/kill-rate (a deliberately weak garlic-only build was reported at only L5–6 by 12 min). Mad Forest is intentionally a *slower*-leveling stage than Inlaid Library/Green Acres. **Treat this as a tuning starting point, not truth.**

---

## 9. KEY RATIOS FOR PORTING

**(a) Starting-weapon single-target DPS vs enemy HP → time-to-kill `[H]` (derived).**
Whip base single-target DPS = 10 dmg ÷ 1.35 s = **7.41 dmg/s** at 100% Might (one slash per cycle). *But the Whip is AoE* — it deals 10 to *every* enemy in the band per cycle, so swarm-clear throughput is far higher than single-target. TTK (single target, base Whip, hits = ⌈HP/10⌉ × 1.35 s):

| Enemy (HP) | Hits | ~TTK | When you meet it |
|---|---|---|---|
| Bat (1–5) | 1 | ≤1.35 s | 0:00 |
| Zombie (10) | 1 | ≤1.35 s | 1:00 |
| Skeleton (15) | 2 | 2.7 s | 3:00 |
| Gray Mudman (70) | 7 | 9.5 s | 7:00 |
| Green Mudman (150) | 15 | 20.3 s | 5:00 |
| Werewolf (180) | 18 | 24.3 s | 12:00 |
| Giant Bat (270) | 27 | 36.5 s | 8:00 |
| Mantichana/Venus (500) | 50 | 67.5 s | 5:00 boss / 21:00 |

**Feel takeaway:** the base Whip **one-shots all minute-1 fodder**, but by 5:00 the Green Mudman/Mantichana wall is uncleanable single-target (20–67 s each). That gap is what *forces* the player to level Might/Amount and stack weapons — reproduce this crossover around your minute 5.

**(b) Contact damage as % of max HP `[H]`.** Per hit (100-HP / 0-armor player): Power 5 = 5%, Power 10 = 10%, Power 14 = 14%, Power 20 = 20%, Power 30 = 30%. With 240 ms i-frames, a single overlapping enemy caps at 4.17 hits/s: a Power-10 zombie = ~41.7 dmg/s → **~2.4 s to die in continuous contact** (Antonio ~3.2 s). The whole game's tension lives in that 2–3 s "don't get pinned" budget.

**(c) Enemy-speed vs player-speed `[M]`.** Generic ×player = internalSpeed/100. In Mad Forest the player is boosted ×1.1, so ÷110 there. Porting rule: pick player px/s `V`; set generic enemy px/s = `V × (internalSpeed/100)`; in the Mad-Forest stage set player = `1.1·V` and keep enemies at `V × (internalSpeed/100)`. Key bands: fodder 100 → 0.91× (kiteable in Mad Forest); Werewolf 130 → 1.18×, bats 140 → 1.27× (they catch you); Ghost 200 → 1.82× (nearly double); swarm variants 700 → 6.36× (instant sweep). **The kiteability of the 100-speed fodder vs the out-running of bats/ghosts is the single most important speed relationship to get right.**

**(d) Enemies on screen by minute `[H]` (wave floors; actual = near floor for a competent build, up to the 300 periodic ceiling / 500 hard cap if overwhelmed).** Minute 0–1: 15–30. Minute 2–4: 30–50. Minute 5–6: dips to 10–20 (but tankier types). Minute 7–8: 80–100. Minute 11+: floor 300 (skeleton wall, first cap-saturation). So by ~8 min expect **on the order of 100 alive**, climbing toward **300** at 11:00. Bosses/events can push totals past 300 up to the 500 absolute cap.

---

### Residual disagreements / gaps to flag in code comments
- iframe base: **240 ms** (official) vs 100 ms (third-party, rejected). `[H→L]`
- Flower Wall durations (~30 s / 60 s): one verifier found them on the current wiki; the schedule extraction omitted them as not-verbatim. Treat durations as `[M]`, existence as `[H]`.
- 11:00 "floor 300": confirmed verbatim by the schedule research, unconfirmed by a second verifier. `[M]`.
- Flower-Wall enemy stats (30 HP / 1 Power / 20 speed): 0.8.0 legacy source only; enemy is current but these numbers are `[L]`.
- Move Speed px/s and player↔enemy unit conversion: **NOT FOUND** — must be chosen/measured. `[H]` that it's undocumented.
- Mad Forest per-minute leveling: **NOT PUBLISHED** — estimate only. `[L]`.
- Challenge-stage per-minute scaling: internally contradictory on the wiki and irrelevant to Mad Forest — do not port. `[L]`.