# Vampire Survivors: base-weapon level progressions and damage scale

Research for issue #194 (part of #193). Documents, cell by cell, what the
eight VS launch-era base weapons (plus Santa Water and Runetracer) do at each
of their 8 levels — base damage, and what every level changes — with their
cooldowns, so a damage-per-second scale can be derived for mapping onto our
constant-tempo musical grid. Ends with the evolution rules and the evolved
weapons' own statlines.

All data fetched **2026-07-22** from the official wiki
(https://vampire.survivors.wiki, a wiki.gg site) via the raw-wikitext
endpoint (`index.php?title=<Page>&action=raw`): each weapon's
`Infobox Weapon` template for the base statline and each page's "Levels"
table for the per-level changes. Level descriptions are verbatim; cumulative
columns and all DPS numbers are derived here and marked as such. Where the
wiki is ambiguous it is flagged in the final section — nothing is guessed.

**Reading the stat columns** (definitions verbatim-condensed from the Stats
table on https://vampire.survivors.wiki/w/Weapons):

- *Base Damage* — damage dealt by a single projectile per hit (modified by
  the player's Might stat; all tables here assume no player-stat modifiers).
- *Amount* — projectiles fired per use.
- *Area* — base area of the weapon (a percentage multiplier).
- *Speed* — base projectile speed (a percentage multiplier).
- *Pierce* — enemies a single projectile can hit before being used up.
  "Area of Effect" means the attack has no per-enemy use-up at all.
- *Cooldown* — "The time required for the weapon to be used again. There is
  a trigger for the cooldown to start after a weapon's duration ends."
- *Interval* — "The time required for an additional projectile to be fired
  between each Cooldown": multi-projectile casts are volleys spread by this
  gap, not simultaneous (Fire Wand's 0.02 s is "near simultaneous").
- *Hitbox Delay* — "The time before the same enemy can be hit by the same
  projectile again. All delays refresh simultaneously as soon as one fully
  counts down." This is the tick rate of zone/orbit weapons.
- The player-side **Cooldown stat** starts at 100% and modifications stack
  additively; total cooldown is hard-floored at 10% (the -90% cap). Source:
  https://vampire.survivors.wiki/w/Cooldown.

## 1. Per-level stat tables

Each table: the wiki's verbatim level description, then a derived running
total of the stats. Level 1 is the weapon as picked up. Source for every
subsection is the named weapon page (infobox + Levels section).

### 1a. Whip — melee arc (AoE slash)

Source: https://vampire.survivors.wiki/w/Whip. Base: damage 10, area 100%,
amount 1, pierce "Area of Effect", cooldown 1.35 s, interval 0.1 s,
knockback 1. Effects: ignores Speed and Duration. Extra slashes from Amount
alternate front/back of the character.

| Level | Verbatim description | Damage | Amount | Area |
|---|---|---|---|---|
| 1 | Attacks horizontally, passes through enemies. | 10 | 1 | 100% |
| 2 | Fires 1 more projectile. | 10 | 2 | 100% |
| 3 | Base Damage up by 5. | 15 | 2 | 100% |
| 4 | Base Area up by 10%. Base Damage up by 5. | 20 | 2 | 110% |
| 5 | Base Damage up by 5. | 25 | 2 | 110% |
| 6 | Base Area up by 10%. Base Damage up by 5. | 30 | 2 | 120% |
| 7 | Base Damage up by 5. | 35 | 2 | 120% |
| 8 | Base Damage up by 5. | 40 | 2 | 120% |

Infobox max-stat check: 40 (+30) damage, 120% (+20%) area, 2 (+1) amount. ✓

### 1b. Knife — directional projectile spray

Source: https://vampire.survivors.wiki/w/Knife. Base: damage 6.5, amount 1,
pierce 1, cooldown 1.0 s, interval 0.1 s, knockback 0.5, blocked by walls.
Effects: ignores Duration. Fires where the player faces, in volleys.

| Level | Verbatim description | Damage | Amount | Pierce | Interval |
|---|---|---|---|---|---|
| 1 | Fires quickly in the faced direction. | 6.5 | 1 | 1 | 0.10 s |
| 2 | Fires 1 more projectile. | 6.5 | 2 | 1 | 0.10 s |
| 3 | Fires 1 more projectile. Base Damage up by 5. | 11.5 | 3 | 1 | 0.10 s |
| 4 | Fires 1 more projectile. [fn: Interval reduced by 0.02 s] | 11.5 | 4 | 1 | 0.08 s |
| 5 | Passes through 1 more enemy. | 11.5 | 4 | 2 | 0.08 s |
| 6 | Fires 1 more projectile. [fn: Interval reduced by 0.02 s] | 11.5 | 5 | 2 | 0.06 s |
| 7 | Fires 1 more projectile. Base Damage up by 5. | 16.5 | 6 | 2 | 0.06 s |
| 8 | Passes through 1 more enemy. [fn: Interval reduced by 0.02 s] | 16.5 | 6 | 3 | 0.04 s |

The interval reductions at levels 4/6/8 are wiki footnotes, not part of the
in-game level text. Infobox max-stat check: 16.5 (+10) damage, 6 (+5)
amount, 3 (+2) pierce, 0.04 s (-0.06) interval. ✓

### 1c. Magic Wand — auto-aimed bolt

Source: https://vampire.survivors.wiki/w/Magic_Wand. Base: damage 10,
amount 1, pierce 1, cooldown 1.2 s, interval 0.1 s, knockback 1, blocked by
walls. Effects: ignores Duration. Fires at the nearest enemy.

| Level | Verbatim description | Damage | Amount | Pierce | Cooldown |
|---|---|---|---|---|---|
| 1 | Fires at the nearest enemy. | 10 | 1 | 1 | 1.2 s |
| 2 | Fires 1 more projectile. | 10 | 2 | 1 | 1.2 s |
| 3 | Cooldown reduced by 0.2 seconds. | 10 | 2 | 1 | 1.0 s |
| 4 | Fires 1 more projectile. | 10 | 3 | 1 | 1.0 s |
| 5 | Base Damage up by 10. | 20 | 3 | 1 | 1.0 s |
| 6 | Fires 1 more projectile. | 20 | 4 | 1 | 1.0 s |
| 7 | Passes through 1 more enemy. | 20 | 4 | 2 | 1.0 s |
| 8 | Base Damage up by 10. | 30 | 4 | 2 | 1.0 s |

Infobox max-stat check: 30 (+20) damage, 4 (+3) amount, 2 (+1) pierce,
1.0 s (-0.2) cooldown. ✓

### 1d. Axe — arcing heavy projectile

Source: https://vampire.survivors.wiki/w/Axe. Base: damage 20, amount 1,
pierce 3, cooldown 4.0 s, interval 0.2 s, knockback 1. Effects: ignores
Duration; scales with the character's Area stat multiplied by 1.3.

| Level | Verbatim description | Damage | Amount | Pierce |
|---|---|---|---|---|
| 1 | High damage, high Area scaling. | 20 | 1 | 3 |
| 2 | Fires 1 more projectile. | 20 | 2 | 3 |
| 3 | Base Damage up by 20. | 40 | 2 | 3 |
| 4 | Passes through 2 more enemies. | 40 | 2 | 5 |
| 5 | Fires 1 more projectile. | 40 | 3 | 5 |
| 6 | Base Damage up by 20. | 60 | 3 | 5 |
| 7 | Passes through 2 more enemies. | 60 | 3 | 7 |
| 8 | Base Damage up by 20. | 80 | 3 | 7 |

Infobox max-stat check: 80 (+60) damage, 3 (+2) amount, 7 (+4) pierce. ✓

### 1e. Cross — boomerang

Source: https://vampire.survivors.wiki/w/Cross. Base: damage 5, area 100%,
speed 100%, amount 1, pierce "Area of Effect", cooldown 2.0 s, interval
0.1 s, knockback 1. Effects: ignores Duration. Aims at the nearest enemy,
returns like a boomerang, pierces everything on both passes.

| Level | Verbatim description | Damage | Amount | Area | Speed |
|---|---|---|---|---|---|
| 1 | Aims at nearest enemy, has boomerang effect. | 5 | 1 | 100% | 100% |
| 2 | Base Damage up by 10. | 15 | 1 | 100% | 100% |
| 3 | Base Area up by 10%. Base Speed up by 25%. | 15 | 1 | 110% | 125% |
| 4 | Fires 1 more projectile. | 15 | 2 | 110% | 125% |
| 5 | Base Damage up by 10. | 25 | 2 | 110% | 125% |
| 6 | Base Area up by 10%. Base Speed up by 25%. | 25 | 2 | 120% | 150% |
| 7 | Fires 1 more projectile. | 25 | 3 | 120% | 150% |
| 8 | Base Damage up by 10. | 35 | 3 | 120% | 150% |

Infobox max-stat check: 35 (+30) damage, 120% (+20%) area, 150% (+50%)
speed, 3 (+2) amount. ✓

### 1f. King Bible — orbiter

Source: https://vampire.survivors.wiki/w/King_Bible. Base: damage 10, area
100%, speed 100%, amount 1, duration 3.0 s, pierce "Area of Effect",
cooldown 3.0 s, hitbox delay 1.7 s, knockback 1. Effects: cooldown starts
when the active duration ends (so the real cycle is cooldown + duration:
3 s + 3 s = 6 s at level 1); scales with all stat bonuses. The extension
grows with level-ups (they change the weapon's base duration) but is not
affected by other Duration bonuses.

| Level | Verbatim description | Damage | Amount | Area | Speed | Duration | Full cycle (derived) |
|---|---|---|---|---|---|---|---|
| 1 | Orbits around the character. | 10 | 1 | 100% | 100% | 3.0 s | 6.0 s |
| 2 | Fires 1 more projectile. | 10 | 2 | 100% | 100% | 3.0 s | 6.0 s |
| 3 | Base Area up by 25%. Base Speed up by 30%. | 10 | 2 | 125% | 130% | 3.0 s | 6.0 s |
| 4 | Effect lasts 0.5 seconds longer. Base Damage up by 10. | 20 | 2 | 125% | 130% | 3.5 s | 6.5 s |
| 5 | Fires 1 more projectile. | 20 | 3 | 125% | 130% | 3.5 s | 6.5 s |
| 6 | Base Area up by 25%. Base Speed up by 30%. | 20 | 3 | 150% | 160% | 3.5 s | 6.5 s |
| 7 | Effect lasts 0.5 seconds longer. Base Damage up by 10. | 30 | 3 | 150% | 160% | 4.0 s | 7.0 s |
| 8 | Fires 1 more projectile. | 30 | 4 | 150% | 160% | 4.0 s | 7.0 s |

Infobox max-stat check: 30 (+20) damage, 150% (+50%) area, 160% (+60%)
speed, 4 (+3) amount, 4.0 s (+1) duration. ✓

### 1g. Garlic — aura / zone

Source: https://vampire.survivors.wiki/w/Garlic. Base: damage 5, cooldown
1.3 s, knockback 0 (but debuffs: each hit applies +0.3 knockback-taken and
-0.1 freeze resistance to non-immune enemies). Effects: ignores Amount,
Duration, and Speed. Cooldown acts as the aura's per-enemy hitbox delay: an
enemy entering the circle is hit instantly, then cannot be hit again until
the cooldown elapses, even if it leaves and re-enters.

| Level | Verbatim description | Damage | Area | Cooldown |
|---|---|---|---|---|
| 1 | Damages nearby enemies. Reduces resistance to knockback and freeze. | 5 | 100% | 1.3 s |
| 2 | Base Area up by 40%. Base Damage up by 2. | 7 | 140% | 1.3 s |
| 3 | Cooldown reduced by 0.1 seconds. Base Damage up by 1. | 8 | 140% | 1.2 s |
| 4 | Base Area up by 20%. Base Damage up by 1. | 9 | 160% | 1.2 s |
| 5 | Cooldown reduced by 0.1 seconds. Base Damage up by 2. | 11 | 160% | 1.1 s |
| 6 | Base Area up by 20%. Base Damage up by 1. | 12 | 180% | 1.1 s |
| 7 | Cooldown reduced by 0.1 seconds. Base Damage up by 1. | 13 | 180% | 1.0 s |
| 8 | Base Area up by 20%. Base Damage up by 2. | 15 | 200% | 1.0 s |

Infobox max-stat check: 15 (+10) damage, 200% area implying +100% over an
unstated 100% base (see ambiguity 1), 1.0 s (-0.3) cooldown. ✓

### 1h. Fire Wand — heavy random-target volley

Source: https://vampire.survivors.wiki/w/Fire_Wand. Base: damage 20,
**amount 3** (the only weapon here with base amount above 1), speed 75%,
pierce 1, cooldown 3.0 s, interval 0.02 s ("near simultaneously"),
knockback 1, blocked by walls. Effects: ignores Duration. Fires an arc of
fireballs at a random enemy. Pure damage/speed progression — the only one
of the ten with no amount, area, pierce, or cooldown change at any level.

| Level | Verbatim description | Damage | Speed |
|---|---|---|---|
| 1 | Fires at a random enemy, deals heavy damage. | 20 | 75% |
| 2 | Base Damage up by 10. | 30 | 75% |
| 3 | Base Damage up by 10. Base Speed up by 20%. | 40 | 95% |
| 4 | Base Damage up by 10. | 50 | 95% |
| 5 | Base Damage up by 10. Base Speed up by 20%. | 60 | 115% |
| 6 | Base Damage up by 10. | 70 | 115% |
| 7 | Base Damage up by 10. Base Speed up by 20%. | 80 | 135% |
| 8 | Base Damage up by 10. | 90 | 135% |

Infobox max-stat check: 90 (+70) damage, 135% (+60%) speed. ✓

### 1i. Santa Water — lingering ground zones

Source: https://vampire.survivors.wiki/w/Santa_Water. Base: damage 10, area
100%, amount 1, duration 2.0 s, pierce "Area of Effect", cooldown 4.5 s,
interval 0.3 s, hitbox delay 0.5 s (same enemy hit at most every 0.5 s per
puddle). Effects: ignores Speed.

| Level | Verbatim description | Damage | Amount | Area | Duration |
|---|---|---|---|---|---|
| 1 | Generates damaging zones. | 10 | 1 | 100% | 2.0 s |
| 2 | Fires 1 more projectile. Base Area up by 20%. | 10 | 2 | 120% | 2.0 s |
| 3 | Effect lasts 0.5 seconds longer. Base Damage up by 10. | 20 | 2 | 120% | 2.5 s |
| 4 | Fires 1 more projectile. Base Area up by 20%. | 20 | 3 | 140% | 2.5 s |
| 5 | Effect lasts 0.3 seconds longer. [fn: actually 0.25 s] Base Damage up by 10. | 30 | 3 | 140% | 2.75 s |
| 6 | Fires 1 more projectile. Base Area up by 20%. | 30 | 4 | 160% | 2.75 s |
| 7 | Effect lasts 0.3 seconds longer. [fn: actually 0.25 s] Base Damage up by 5. | 35 | 4 | 160% | 3.0 s |
| 8 | Base Area up by 20%. Base Damage up by 5. | 40 | 4 | 180% | 3.0 s |

The wiki footnotes that the level 5 and 7 duration bumps are really
+0.25 s, rounded up to 0.3 in the display text. Infobox max-stat check:
40 (+30) damage, 180% (+80%) area, 4 (+3) amount, 3.0 s (+1) duration. ✓

### 1j. Runetracer — bouncing pierce-everything bolt

Source: https://vampire.survivors.wiki/w/Runetracer. Base: damage 10, area
100%, speed 100%, amount 1, duration 2.25 s, pierce "Area of Effect"
(infinite pierce, bounces off screen edges), cooldown 3.0 s, interval
0.2 s, hitbox delay 0.5 s. Effects: scales with all stat bonuses.

| Level | Verbatim description | Damage | Amount | Speed | Duration |
|---|---|---|---|---|---|
| 1 | Passes through enemies, bounces around. | 10 | 1 | 100% | 2.25 s |
| 2 | Base Damage up by 5. Base Speed up by 20%. | 15 | 1 | 120% | 2.25 s |
| 3 | Effect lasts 0.3 seconds longer. [fn: actually 0.25 s] Base Damage up by 5. | 20 | 1 | 120% | 2.5 s |
| 4 | Fires 1 more projectile. | 20 | 2 | 120% | 2.5 s |
| 5 | Base Damage up by 5. Base Speed up by 20%. | 25 | 2 | 140% | 2.5 s |
| 6 | Effect lasts 0.3 seconds longer. [fn: actually 0.25 s] Base Damage up by 5. | 30 | 2 | 140% | 2.75 s |
| 7 | Fires 1 more projectile. | 30 | 3 | 140% | 2.75 s |
| 8 | Effect lasts 0.5 seconds longer. | 30 | 3 | 140% | 3.25 s |

Infobox max-stat check: 30 (+20) damage, 140% (+40%) speed, 3 (+2) amount,
3.25 s (+1) duration. ✓

## 2. Cooldowns and a derived DPS scale

Verbatim base cooldowns (unchanged by levels unless noted): Whip 1.35 s,
Knife 1.0 s, Magic Wand 1.2 s → 1.0 s (level 3), Axe 4.0 s, Cross 2.0 s,
King Bible 3.0 s + duration, Garlic 1.3 s → 1.0 s (levels 3/5/7), Fire
Wand 3.0 s, Santa Water 4.5 s, Runetracer 3.0 s. **Structural takeaway:
VS holds each weapon's tempo essentially fixed across its 8 levels** — the
largest level-driven cooldown change anywhere in this set is -0.3 s — and
scales the payload per shot instead. That matches our constant-tempo grid
directly: level-ups should change what a hit is worth, not when it lands.

**Derived single-target cycle DPS** (our model, not the wiki's): assume
every projectile of one cast hits one target exactly once, no player-stat
modifiers, base cooldown. Formula: damage x amount / cooldown. This
overrates weapons whose projectiles spread (Whip's slashes alternate
front/back — a target on one side takes half; Fire Wand aims at a *random*
enemy; Axe arcs overhead) and underrates AoE re-hits (Cross's return pass).

| Weapon | L1 DPS | L8 DPS | Growth | Caveat |
|---|---|---|---|---|
| Whip | 7.4 | 59.3 | x8.0 | Halve for a target on one side only (29.6) |
| Knife | 6.5 | 99.0 | x15.2 | All 6 knives must land; pierce 3 each adds multi-target |
| Magic Wand | 8.3 | 120.0 | x14.4 | Auto-aims nearest; most reliable of the set |
| Axe | 5.0 | 60.0 | x12.0 | Overhead arc; multi-target ceiling is dmg x amount x pierce = 1680/cycle |
| Cross | 2.5 | 52.5 | x21.0 | Boomerang return can double-hit; biggest relative growth |
| Fire Wand | 20.0 | 90.0 | x4.5 | Random target — high paper DPS, unreliable delivery |
| Garlic | 3.8 | 15.0 | x3.9 | Per enemy standing in the aura (dmg / cooldown-tick) |
| King Bible | 2.9 | 10.1 | x3.4 | Per enemy: (dmg / 1.7 s hitbox delay) x duty cycle (3/6 s → 4/7 s) |
| Santa Water | 8.9 | 53.3 | x6.0 | Per enemy parked in a zone: in-zone tick DPS (dmg / 0.5 s) x single-zone uptime (duration / cooldown); 4 separate zones at L8 |
| Runetracer | 3.3 | 30.0 | x10.0 | Burst per cast (dmg x amount / cooldown) per enemy touched; infinite pierce makes multi-target output far higher |

Scale summary for our mapping:

- **Level 1 single-target DPS clusters at roughly 2.5–9** for aimable
  weapons; Fire Wand's 20 is the random-targeting outlier (paper DPS is
  deliberately high because delivery is unreliable).
- **Level 8 single-target DPS clusters at roughly 50–120** for the
  projectile weapons; per-enemy zone/aura weapons sit lower (10–15 for
  always-on contact damage, since they hit continuously and multi-target).
- **Total growth over 8 levels is typically x8–x15** (projectiles), with
  auras/orbiters growing only x3.5–4 (they compensate with uptime and
  area), and one x21 outlier (Cross starts very weak).
- The growth decomposes as: flat damage x3–4.5 (added in 2–3 chunks of
  25–100% of base damage each), amount x2–6, cooldown ~flat. Damage and
  amount multiply — no single stat carries the curve.

## 3. Evolution rules and evolved statlines

From https://vampire.survivors.wiki/w/Evolution (Mechanics) and
https://vampire.survivors.wiki/w/Weapons (Evolution section):

- **Requirement:** "The player must have a fully leveled base weapon and
  its counterpart (required level varies by case) in their inventory." For
  the ten classic pairs the Weapons page says the passive item need only be
  "obtained"; only post-1.0 and DLC weapons explicitly require "all related
  passive items ... also be fully leveled" (see ambiguity 4).
- **Trigger:** collect a Treasure Chest containing an evolution-type
  reward. In most stages that means chests from bosses at or after the
  10:00 mark — but Mad Forest's first chest (Glowing Bat at 1:00) can
  already evolve, and several stages allow all chests.
- **Effect:** the evolved weapon replaces the base weapon (the passive
  stays); the evolved weapon's cooldown starts from zero. Generally only
  one weapon evolves per chest (listed exceptions allow 3–5).
- **Evolved weapons have their own fixed statlines and exactly one level:**
  none of the ten classic evolutions has a level table — their pages'
  Levels sections contain only the optional endless "Limit Break" upgrades.
  The wiki's framing: "Evolved weapons usually inherit most of the base
  weapon stats with extra effects."

Evolved statlines, verbatim from each evolution page's infobox (the
parenthesized deltas are the wiki's own, relative to the maxed base weapon):

| Base (L8 dmg) | Evolution | Damage | Other verbatim changes |
|---|---|---|---|
| Whip (40) | Bloody Tear | 40 | Area 130% (+10%); crit 10% chance at 2x; restores 8 HP/attack on crit hits |
| Knife (16.5) | Thousand Edge | 16.5 | Cooldown 0.35 s (-0.65) — near-continuous stream; interval 0.05 s (+0.01) |
| Magic Wand (30) | Holy Wand | 30 | Cooldown 0.5 s (-0.5); speed 2 (+100%) — "Fires with no delay" |
| Axe (80) | Death Spiral | 60 (-20) | Amount 9 (+6); pierce 1000 (+993); interval 0.05 s (-0.15); spins outward instead of arcing |
| Cross (35) | Heaven Sword | 77 (+42) | Amount 1 (-2); cooldown 3.3 s (+1.3); crit 10% at 2.5x; knockback 6 (+5) |
| King Bible (30) | Unholy Vespers | 30 | "Never Ends": cooldown no longer depends on duration; knockback 4 (+3); area 1.75 (+25%) |
| Garlic (15) | Soul Eater | 20 (+5) | Area 300% (+100%); cooldown 1.0 s; damage grows with HP healed, up to +60 (not affected by Might) |
| Fire Wand (90) | Hellfire | 100 (+10) | Amount 2 (-1); pierce Area of Effect (infinite); interval 0.2 s (+0.18) |
| Santa Water (40) | La Borra | 40 | Area 200% (+20%); duration 4.0 s (+1); cooldown 4.0 s (-0.5); zones follow the player and grow |
| Runetracer (30) | NO FUTURE | 30 | Cooldown 1.0 s (-2); interval 0 s (-0.2); amount 1 (-2); explodes on bounce and in retaliation |

Sources: /w/Bloody_Tear, /w/Thousand_Edge, /w/Holy_Wand, /w/Death_Spiral,
/w/Heaven_Sword, /w/Unholy_Vespers, /w/Soul_Eater, /w/Hellfire,
/w/La_Borra, /w/NO_FUTURE.

**Key finding:** six of the ten evolutions keep the maxed base weapon's
damage number *exactly* (40, 16.5, 30, 30, 40, 30) — evolution power comes
from behavior changes (continuous fire, infinite pierce, permanence,
lifesteal), not a damage bump. The four that do change damage trade it
against something: Heaven Sword +42 damage but -2 amount and +1.3 s
cooldown; Hellfire +10 but -1 amount; Death Spiral *-20* but +6 amount and
effectively infinite pierce; Soul Eater +5 with a conditional +60 ramp.

## 4. Structural notes on the 8-level norm

From the base-weapon table on https://vampire.survivors.wiki/w/Weapons
(Max Level column) plus the individual pages:

- **Every launch base weapon has exactly 8 levels** — all ten documented
  here, plus Lightning Ring, Pentagram, Peachone, Ebony Wings, Phiera Der
  Tuphello, Eight The Sparrow, Gatti Amari, Song of Mana, Shadow Pinion,
  Vento Sacro, Bone, Cherry Bomb, Carréllo, Celestial Dusting, La Robba.
- **Base-game exceptions:** Clock Lancet and Laurel max at **7** (the two
  no-damage utility weapons; certain Arcanas extend them), Bracelet at
  **6**, Greatest Jubilee at **9**, Victory Sword at **12**, Candybox at
  **1** (it is a weapon-picker, not a weapon). DLC weapons drift further
  (many 6s and 5s). So 8 is the norm for damage-dealing base weapons, not
  an engine rule.
- **Level-shape conventions** visible across section 1: level 1 is the
  weapon's identity statement; **level 2 is almost always "+1 projectile"
  or the biggest area jump** (8 of 10 here — the early power spike);
  damage arrives as 2–7 flat chunks totalling +100% to +600% of base;
  each level grants one or two bonuses, never more (in the displayed text;
  Knife/Santa Water hide small extras in footnotes); the final level is a
  damage or amount capstone.
- **Upgrading resets the weapon's cooldown and fires it instantly**
  (Weapons page, Upgrading section) — a free attack on level-up.
- Fully-leveled weapons stop appearing in level-up choices. Growth past
  level 8 exists only through the Limit Break toggle (endless minor
  boosts) and evolution.

## 5. Ambiguities the wiki leaves open

1. **Garlic's base Area is never stated.** Its infobox has no `area` field;
   100% is inferred from "max-area = 200% (+100%)" and the level table
   summing to +100%.
2. **Rounded duration text.** Santa Water levels 5/7 and Runetracer levels
   3/6 display "0.3 seconds" but actually grant 0.25 s (wiki footnotes).
   Any mirror should use the real values.
3. **Hidden interval changes.** Knife's -0.02 s interval steps at levels
   4/6/8 exist only as footnotes; the wiki does not say whether other
   weapons have similar undisplayed micro-changes.
4. **Whether classic evolutions need the passive at max level.** The
   Evolution page says the counterpart's "required level varies by case"
   without enumerating the classic ten; the Weapons page says the passive
   need only be "obtained". Max-passive is explicitly required only for
   post-1.0/DLC weapons. "Any level for the classic ten" is implication,
   not verbatim statement.
5. **Unholy Vespers' "Never Ends"** is asserted in its caption while the
   infobox still lists duration 3.0 s (-1) and cooldown 3.0 s; the wiki
   never spells out the arithmetic that makes it permanent (presumably
   cooldown running concurrently with duration and matching it).
6. **The DPS models in section 2 are ours.** The wiki publishes no DPS
   numbers; every derived figure depends on the stated all-projectiles-hit
   assumptions, and the zone/orbit models additionally on the hitbox-delay
   reset quirk ("all delays refresh simultaneously as soon as one fully
   counts down"), which makes real hit rates slightly higher than modeled.
7. **Displayed damage numbers are randomized.** The Weapons page footnotes
   that on-screen damage popups show a value within ±5 of the real scaled
   damage, visual only — in-game observation cannot verify these tables.
8. **King Bible's cooldown-extension rule** ("extension will increase with
   level-ups ... not affected by other Duration bonuses") is stated in
   prose only for King Bible; whether the same duration-then-cooldown
   trigger applies to Santa Water or Runetracer is not stated either way
   (the generic Stats table says only "there is a trigger for the cooldown
   to start after a weapon's duration ends", for Runetracer a 2021 patch
   note says its firing "is not affected by its duration anymore").
