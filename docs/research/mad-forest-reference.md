# Mad Forest mechanical reference — first eight minutes

Research freeze: **July 11, 2026**  
Implementation target: **Mad Forest, normal mode, Antonio, 0:00 <= time <
8:00, no permanent PowerUps, Golden Eggs, Arcana, or passive-item bonuses**.

This is the calibration record for the July 11 parity rework. It is not a
claim that a public, current Vampire Survivors source tree exists. The target
is deliberately hybrid and version-pinned:

- The current roster, wave table, bestiary values, character stats, Whip
  progression, level curve, and gem rules are the live Vampire Survivors Wiki
  snapshot retrieved on July 11, 2026. The Mad Forest table is pinned to
  revision **89346** (June 30, 2026); the other source revision IDs are listed
  below.
- Coordinate ratios, collision behavior, spawn semantics, Whip's physical
  body, and short damage locks come from poncle's official hosted HTML5 demo,
  bundle version **v0.2.4**. Those are primary-source values for that old demo,
  not proof of the current commercial engine.
- Project decisions and derived conversions are labeled rather than presented
  as Vampire Survivors facts.

## Evidence labels

| Label | Meaning | Confidence |
|---|---|---|
| **CURRENT** | Transcribed from the July 11, 2026 live-wiki revisions listed below | Medium: current-looking and detailed, but community-maintained |
| **LEGACY** | Directly observed as a numeric constant or behavior in poncle's official v0.2.4 demo | High for v0.2.4; low-to-medium for the current commercial build |
| **CURRENT-RE** | Community IL2CPP analysis of the current Unity build | Medium; current-code evidence, but unofficial reverse-engineering |
| **DERIVED** | Arithmetic from labeled source values | Same confidence as its inputs |
| **ADOPTED** | Intentional Loop Survivors implementation choice | Exact for this project, not a claim about Vampire Survivors |
| **INFERENCE** | A test target or interpretation not directly published | Low until a hands-on comparison confirms it |

When this document says “exact,” it means exact to the named source snapshot,
not exact to every Vampire Survivors release or platform.

## Stage and movement contract

`H` is the visible world height. Height-normalization is preferred over width
because it preserves the vertical amount of arena the player can react to
across aspect ratios.

| Property | Source value | Normalized/project value | Label |
|---|---:|---:|---|
| Mad Forest starting spawns | 10 `BAT3` units | 10 dark red-eyed bats | CURRENT |
| Mad Forest player MoveSpeed | x1.1 | Apply to the player only | CURRENT |
| Mad Forest enemy MoveSpeed | x1.1 | Apply the independent enemy x1.1 multiplier | CURRENT |
| Base physical player speed | 82.5 px/s at `H = 456` | `82.5 x 1.1 / 456 = 0.1990H/s`; `159.2105` at `H = 800` | LEGACY + DERIVED |
| Player collision radius | 9 at `H = 456` | `0.0197H`; `15.7895` at `H = 800` | LEGACY + DERIVED |
| Base Magnet | 30 at `H = 456` | `0.0658H`; `52.6`, rounded to `53`, at `H = 800` | CURRENT + DERIVED |
| Enemy physical speed factor | `raw MSpeed x 0.77 x 0.3`, then stage x1.1 | `raw MSpeed x 0.231 x 1.1 x H/456`; at `H = 800`, multiply raw MSpeed by `0.44579` | LEGACY + CURRENT + DERIVED |
| Contact-damage lock | 120 ms | 0.12 s | LEGACY + CURRENT-RE |
| Enemy hit/knockback window | 120 ms | Reverse chase direction for 0.12 s, scaled by enemy KB | LEGACY + DERIVED |

Movement input has immediate start/stop, normalized diagonals, and no inertia.
The last horizontal input sets facing. Regular enemies home directly toward the
player each update; fixed-direction sweep bats are the exception. The legacy
demo uses solid player/enemy and enemy/enemy collision with an immovable player.
That collision is part of the pressure feel: shortening the damage lock to
0.12 s without overlap resolution would be substantially harsher than the
reference. **LEGACY**

Loop resolves each solid circle pair once per fixed step with positional
separation; Phaser Arcade can order and adjust dense piles differently. This
low-material engine approximation remains reserved for the hands gate.
**ADOPTED**

Regular spawns originate just offscreen. A practical legacy-derived band is
about `0.16H` to `0.33H` beyond an edge, with far-offscreen enemies recycled
rather than allowed to trail forever. **LEGACY + DERIVED**

Scripted event geometry is separate. Sweep bats begin along an ellipse at
`0.72 x visible width/height`; their angles advance by `pi/500` per unit, so a
50-bat group spans about 18 degrees and each bat locks a straight vector toward
the player's event-time position. The flower wall uses the same `0.72W/0.72H`
ellipse with `pi/50` spacing for 100 units. Sweep and flower bodies are not
distance-culled; their explicit 10 s / 30 s event timers own removal. **LEGACY**

**ADOPTED camera rule:** runtime world height is fixed to 800 units by camera
zoom at every resolution, so every H800 conversion in this note stays a visible
height ratio rather than becoming smaller on high-resolution screens.

### Antonio baseline

| Property | Value | Label |
|---|---:|---|
| Base character HP | 100 | CURRENT |
| Antonio Max Health bonus | +20, for 120 total | CURRENT |
| Antonio Armor | +1 | CURRENT |
| Armor calculation | subtract 1 from each contact hit, minimum damage 1 | CURRENT |
| Antonio MoveSpeed bonus | none; Mad Forest supplies the x1.1 | CURRENT |
| Antonio Might | +10% at levels 10, 20, 30, 40, and 50 | CURRENT |

Whip and Kick damage tables below are raw pre-Might values. At player levels
10–19, multiply them by 1.10; at levels 20–29, by 1.20, and so on. If the
parity pass does not implement this character progression, that must remain a
named deviation rather than being hidden in weapon numbers.

## First-eight-minute wave table

Waves approach from all four sides. “Minimum” is a live global-enemy population
floor, not a per-minute quota or maximum: regular units, bosses, sweep bats,
and flowers all count while alive. Existing enemies persist across minute
changes. The legacy spawn director waits one full stated interval before its
first attempt, then replenishes the enabled roster. Below the floor it repeats
complete pattern sets, which can overshoot the floor by `pattern length - 1`;
at or above the floor it emits one complete set per attempt, until the common
300 check blocks it. Scripted events may exceed that check up to the global 500
body ceiling. The current wiki publishes the roster/floor/interval; these exact
director semantics are **LEGACY**, so the combination remains a cross-version
calibration target.

The boss/reward column preserves the wiki's displayed high/mid/ordinary chest
columns. Legacy evaluates those tiers sequentially, only trying the next when
the prior roll fails. Their union gives any-chest probabilities of 30% at
1:00, 43% at 3:00, 100% at 5:00, and 56.35% at 7:00. Because this phase has no
chest/evolution vocabulary, a successful union roll becomes one direct
project-native build pick. That translation is **ADOPTED**, not a Vampire
Survivors fact.

| Time | Enabled regular roster | Minimum | Interval | Boss / reward row | Map event | Label |
|---|---|---:|---:|---|---|---|
| 0:00 | Red-Eyed Pipeestrello (`BAT3`) | 15 | 1.0 s | — | — | CURRENT |
| 1:00 | Zombie + Pipeestrello (`BAT1`) | 30 | 1.0 s | Glowing Bat; chest odds `0% / 0% / 30%` | — | CURRENT |
| 2:00 | Pipeestrello `BAT1` + both red-eyed variants `BAT2/BAT3` | 50 | 0.5 s | — | 50 fixed-direction sweep bats at +5 s, repeated at +10 s and +15 s; 100% | CURRENT |
| 3:00 | Skeleton | 40 | 0.25 s | Glowing Bat; chest odds `0% / 5% / 40%` | 50-bat sweep attempts at +5 s and +10 s; 10% each | CURRENT |
| 4:00 | Skeleton + Ghost | 30 | 1.0 s | — | 50-bat sweep attempts at +5 s and +10 s; 10% each | CURRENT |
| 5:00 | Green Mudman | 10 | 1.0 s | Mantichana; chest odds `1% / 5% / 100%` | 100 flowers form a closing ellipse immediately; 100% chance, 30 s duration | CURRENT |
| 6:00 | Zombie + Green Mudman | 20 | 0.5 s | — | 50-bat sweep attempts at +5 s and +10 s; 10% each | CURRENT |
| 7:00 | Red-Eyed Pipeestrello `BAT2/BAT3` + Gray Mudman | 80 | 0.5 s | Glowing Bat; chest odds `3% / 10% / 50%` | 50-bat sweep attempts every 5 s through +30 s; six attempts, 80% each | CURRENT |
| 8:00 boundary | Zombie | 100 | 1.5 s | Giant Bat | 50-bat sweep attempts at +15/+30/+45 s; three attempts, 80% each | CURRENT, not played in the adopted run |

### Eight-minute choice

**ADOPTED:** the run resolves at exactly 8:00 after playing the `0:00` through
`7:00` waves. The `8:00` Zombie wave, Giant Bat, and its sweep attempts do not
start early and are not compressed into minute 7. Moving the Giant Bat to
7:30 would make a stronger bespoke finale, but would be less faithful to the
requested first-eight-minute slice. The 8:00 row stays above as a boundary
reference.

Treasure-chest presentation, multi-item chest quality, weapon evolution,
stage items, destructibles, and metagame PowerUps are not introduced by this
addendum. Their omission means reward economy is not exact even when the combat
schedule is. **ADOPTED:** a successful any-chest roll becomes one direct
weapon-tier choice, including the guaranteed 5:00 roll. The implementation
keeps the derived 30%/43%/100%/56.35% any-chest probabilities but does not pretend
that a project pick is identical to a Vampire Survivors chest.

## Enemy values

`Power` is contact damage before Armor. `Antonio hit` applies his one point of
Armor. The `H800 speed` conversion uses Mad Forest's independent enemy
MoveSpeed x1.1. Fractional XP is the enemy's raw gem input, not necessarily the
final awarded integer in the legacy gem roll.

| Reference unit | HP | Power | Antonio hit | Raw MSpeed | H800 speed | XP | KB | Label |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Pipeestrello `BAT1` | 1 | 5 | 4 | 140 | 62.4 | 1 | 1.0 | CURRENT + DERIVED |
| Red-Eyed Pipeestrello `BAT2/BAT3` | 5 | 5 | 4 | 140 | 62.4 | 1 | 1.0 | CURRENT + DERIVED |
| Zombie | 10 | 10 | 9 | 100 | 44.6 | 1 | 0.8 | CURRENT + DERIVED |
| Skeleton | 15 | 10 | 9 | 100 | 44.6 | 2 | 1.0 | CURRENT + DERIVED |
| Ghost | 10 | 5 | 4 | 200 | 89.2 | 1.5 | 0 | CURRENT + DERIVED |
| Green Mudman `MUDMAN2` | 150 | 10 | 9 | 100 | 44.6 | 2.5 | 0.3 | CURRENT + DERIVED |
| Gray Mudman `MUDMAN1` | 70 | 10 | 9 | 100 | 44.6 | 2.5 | 0.3 | CURRENT + DERIVED |
| Glowing Bat `BAT4` | `50 x player level` | 10 | 9 | 140 | 62.4 | 30 | 1.0 | CURRENT + DERIVED |
| Mantichana `XLMANTIS`, the 5:00 boss | **500 flat** | 20 | 19 | 80 | 35.7 | 3 | 0 | CURRENT + DERIVED |
| Flower Wall `FLOWER` | `30 x player level` | 1 | 1 | 20 | 8.9 | 2 | 1.0 | CURRENT + DERIVED |
| Pipeestrello swarm | 1 | 1 | 1 | 700 | 312.1 | 1 | 1.0 | CURRENT + DERIVED |
| Giant Bat `XLBAT`, 8:00 boundary only | 270 | 10 | 9 | 140 | 62.4 | 2.5 | 0.1 | CURRENT + DERIVED |

Legacy enemy colliders request a circle radius of `0.4 x selected atlas-frame
width`. Phaser 3.55.2 collision uses the floored body half-width, so the exact
effective H800 radius is `floor(0.4 x width) x 800 / 456`. H800 radii are:
BAT1 12.28, BAT2 17.54, BAT3 21.05, BAT4 17.54, Zombie 21.05, Ghost 19.30,
each Mudman 22.81, and Mantichana 33.33. Skeleton uniformly selects widths
`[28, 32, 32, 34, 32, 34]` (radii 19.30–22.81), Flower selects `[26, 32]`
(17.54 or 21.05), and each sweep bat selects BAT1/BAT2/BAT3. The clean-room
runtime cycles each published frame list per kind to preserve the exact
aggregate weighting without consuming the separate stage-event random stream.
That deterministic selection is **ADOPTED**; the body formula and lists are
**LEGACY + DERIVED**.

The legacy sprite coordinate is a bottom-center feet anchor, while collision
uses an offset circle center. Runtime keeps both explicitly: stage/event
positions and homing vectors are authored feet-to-feet, then collision and
weapon tests use the reconstructed circle center. For a source frame `W x H`,
requested radius `r = 0.4W`, and effective radius `R = floor(r)`, the legacy
circle-center offset from the feet is
`(r/2 + R - W/2, r/2 + R - H)`, normalized by `800/456`. The player's feet are
`(+1,+7)` legacy pixels from its circle center. **LEGACY + DERIVED**

BAT1–4 animate through four idle widths, which makes Phaser's live body center
jitter horizontally around its fixed logical feet by a few pixels. Loop keeps
the selected `_0` frame's offset stable because its vector enemies do not use
those sprite frames. This low-materiality omission is **ADOPTED**.

Do not substitute Mantichana Lord (`BOSS_XLMANTIS`: `150 x level`, MSpeed 160,
XP 50) for the 5:00 Mantichana. Mantichana Lord is the separate 10:00 boss.

At `H = 800`, a 0.12 s reverse-chase knockback is roughly 7.5 px for a bat,
4.3 px for a Zombie, and 1.6 px for a Mudman after applying KB. **DERIVED**

There is no invented global `HP x time`, damage, or speed ramp in this
eight-minute reference. Pressure changes through roster, floors, intervals,
events, and the explicit HP-per-level enemies only. **CURRENT + ADOPTED**

## Whip facts and Kick mapping

### Whip source values

| Whip level | Raw damage | Amount | Area | Cooldown | Added-projectile interval | Label |
|---:|---:|---:|---:|---:|---:|---|
| 1 | 10 | 1 | 1.0 | 1.35 s | 0.10 s | CURRENT |
| 2 | 10 | 2 | 1.0 | 1.35 s | 0.10 s | CURRENT |
| 3 | 15 | 2 | 1.0 | 1.35 s | 0.10 s | CURRENT |
| 4 | 20 | 2 | 1.1 | 1.35 s | 0.10 s | CURRENT |
| 5 | 25 | 2 | 1.1 | 1.35 s | 0.10 s | CURRENT |
| 6 | 30 | 2 | 1.2 | 1.35 s | 0.10 s | CURRENT |
| 7 | 35 | 2 | 1.2 | 1.35 s | 0.10 s | CURRENT |
| 8 | 40 | 2 | 1.2 | 1.35 s | 0.10 s | CURRENT |

Whip has knockback 1, passes through all targets, and each slash hits a target
once. Consecutive slashes alternate horizontal sides relative to facing; added
slashes are progressively higher. Displayed damage numbers may visually vary
without changing deterministic damage. **CURRENT**

The legacy Area-1 physical body is `147 x 22` at `H = 456`. Its published
sprite center is `64` pixels to the chosen side and `16` pixels above the
feet-anchored player sprite. Loop's player coordinate is instead its collision
center: about `(spriteX-1, spriteY-7)`. Converting origins puts the first slash
about 114 px right / 111 px left and 16 px above Loop's H800 player center. The
next slash is 16 legacy pixels (28 H800 pixels) higher. **LEGACY + DERIVED**

| Area | H800 body | H800 center | Approx. forward reach | Portion of 1280x800 view | Label |
|---:|---:|---:|---:|---:|---|
| 1.0 | 258 x 39 | right 114 / left 111; 16 up | 240–243 | 0.98% | DERIVED |
| 1.1 | 284 x 43 | same center | 252–256 | 1.19% | DERIVED |
| 1.2 | 310 x 46 | same center | 265–269 | 1.39% | DERIVED |

Each additional strip is about 28 H800 pixels higher. Area grows the body,
not its center offset. These footprints are why a large radial aura is not a
Whip-like approximation. The slash and its collision body scale linearly from
zero to full Area during the first 0.10 s, then remain at full size while the
visual fades through 0.20 s total. **LEGACY**

### Adopted four-tier Kick compression

| Kick tier | Reference checkpoint | Damage | Strips | Area |
|---:|---|---:|---:|---:|
| 1 | Whip L1 | 10 | one front-facing | 1.0 |
| 2 | Whip L3 | 15 | front, then opposite | 1.0 |
| 3 | Whip L5 | 25 | front, then opposite | 1.1 |
| 4 | Whip L8 | 40 | front, then opposite | 1.2 |

### Model A cadence conflict and adopted compromise

The reference Whip attacks once every 1.35 s. Loop Survivors' Kick is the
four-on-the-floor spine of a 122 BPM track, so its trigger interval is:

`60 / 122 = 0.491803 s`

An exact Whip clock would therefore fire 2.745 times less often than the
audible Kick. Eleven sixteenth-note ticks equal 1.35246 s and are an almost
perfect timing match, but moving the Kick to that cadence destroys the locked
four-on-the-floor skeleton. Playing a Kick every beat while spawning gameplay
only every eleventh sixteenth also breaks Model A: one trigger must remain one
event with both sound and gameplay output.

**ADOPTED compromise:**

- Every 122 BPM sequencer trigger still creates both the audible Kick and a
  real gameplay strip. There is no sound-only beat or separately scheduled
  gameplay-only trigger; the 0.10 s follow-up below is an added projectile of
  the same beat event and does not require a second Kick sample.
- Tier 1 creates one strip on the current facing side.
- Tiers 2–4 create the facing-side strip, then an opposite-side strip 0.10 s
  later.
- Either strip starts one **shared per-target Kick re-hit lock of 1.35 s**.
  That enemy cannot take Kick damage again from either side until the lock
  expires; fresh enemies can still be hit by later beats.
- Because damage opportunities remain beat-quantized, a target hit on a main
  beat will normally be eligible again on the third later beat, after 1.4754
  s. This is close to, but not exactly, Whip's global 1.35 s cadence.

This preserves the musical contract and Whip-like per-target damage while
admitting a remaining difference: each beat can catch fresh enemies, so crowd
throughput and visual/knockback cadence are higher than a literal Whip. The
developer's hands gate must judge that compromise; it is not research-proven.

## XP and gems

### Level requirements

The player starts at level 1. Through level 20, the next-level requirement is
5 XP, then rises by 10 each level. Cumulative XP to reach level `L <= 20` is:

`5 x (L - 1)^2`

| Target level | Cumulative XP | Target level | Cumulative XP |
|---:|---:|---:|---:|
| 2 | 5 | 11 | 500 |
| 3 | 20 | 12 | 605 |
| 4 | 45 | 13 | 720 |
| 5 | 80 | 14 | 845 |
| 6 | 125 | 15 | 980 |
| 7 | 180 | 16 | 1,125 |
| 8 | 245 | 17 | 1,280 |
| 9 | 320 | 18 | 1,445 |
| 10 | 405 | 19 | 1,620 |
| — | — | 20 | 1,805 |

At current level 20, the next step includes the documented 600 XP wall, for
795 XP from 20 to 21; Growth is temporarily increased by 100% until level 21.
From levels 21–40 the ordinary step increases by 13 each level, level 40 adds
2,400 XP, and level 41 onward increases by 16 each level. **CURRENT**

### Gem values and storage

- The current base Magnet stat is 30. At the adopted coordinate scale that is
  53 H800 pixels. **CURRENT + DERIVED**
- Blue gems contain up to 2 XP, green up to 9 XP, and red gems contain larger
  values. **CURRENT**
- At more than 400 ground gems, further XP is accumulated into one red gem
  instead of creating unbounded objects. **CURRENT**
- The legacy demo rolled the awarded value as
  `floor((random[0,1) + 0.5) x raw enemy XP)`. Expected awards are 0.5 for raw
  1, 1.0 for raw 1.5, 1.5 for raw 2, 2.0 for raw 2.5, 2.5 for raw 3, and 29.5
  for raw 30. **LEGACY + DERIVED**
- No current, authoritative gem pull-speed value was recovered. Pickup travel
  speed is therefore a project tuning value, not parity evidence. **INFERENCE**

Useful telemetry bands for an attentive no-PowerUp run are level 3–5 at 1:00,
5–7 at 2:00, 8–11 at 3:00, 10–13 at 4:00, 12–15 at 5:00, 13–16 at 6:00,
14–18 at 7:00, and 17–21 at 8:00. These are **INFERENCE**, not published
Vampire Survivors thresholds; use them only to spot gross economy drift.

## What “parity” does and does not authorize

This pass may independently implement mechanical rules and numeric ratios. It
does not authorize copying the official demo bundle, de-minified source, art,
sprites, map art/layout, audio, UI text/layout, enemy names, animation frames,
or VFX timing curves into the shipped game.

The reference names in this document exist only to make the research auditable.
Runtime enemies should retain original project names, silhouettes, colors, and
vector rendering. Elite readability should come from original scale/shape/color
language. The death effect should be a new procedural design—such as bounded
project-color square fragments and a short fade—not reconstructed Vampire
Survivors pixel frames. No new external assets are required.

The U.S. Copyright Office distinguishes game ideas/methods from copyrightable
expression, but a deliberately near-identical overall product can raise other
legal, platform, or trade-dress questions. This document is an engineering
clean-room rule, not legal advice; commercial release should receive counsel.

## Sources

All web sources below were retrieved July 11, 2026.

| ID | Source | Used for | Confidence |
|---|---|---|---|
| DEMO | [Official poncle itch.io demo](https://poncle.itch.io/vampire-survivors), [hosted v0.2.4 bundle](https://html-classic.itch.zone/html/5185382/main.364c22b224c8899d4d20.bundle.js), and [official enemy atlas metadata](https://html-classic.itch.zone/html/5185382/assets/img/enemies.json) | Physical movement/collision, source frame bodies/anchors, spawn semantics, hit locks, Whip body, legacy gem roll | Primary/high for v0.2.4; version-transfer uncertainty |
| UNITY-RE | [Current damage-system analysis](https://github.com/lukeod/vampiresurvivors-modding/blob/main/damage-system.md) and [physics-system analysis](https://github.com/lukeod/vampiresurvivors-modding/blob/main/physics-system.md) | Current 120 ms vulnerability delay and Phaser-style collision-group corroboration | Secondary/medium; community IL2CPP analysis |
| MF | [Mad Forest revision 89346](https://vampire.survivors.wiki/api.php?action=parse&oldid=89346&prop=wikitext&format=json&formatversion=2) | Normal modifiers (`starting-spawns=10`, player speed x1.1, enemy speed 1.1), first-eight-minute waves, bosses, chests, events | Community/medium; exact revision |
| ANTONIO | [Antonio Belpaese](https://vampire.survivors.wiki/w/Antonio_Belpaese) rev 85608, [Armor](https://vampire.survivors.wiki/w/Armor_(stat)) rev 85634, [Player stats](https://vampire.survivors.wiki/w/Player_stats) rev 87190 | HP, Armor, Might progression, base stats | Community/medium; revision-pinned here |
| WHIP | [Whip](https://vampire.survivors.wiki/w/Whip) rev 85591, [Weapons overview stats](https://vampire.survivors.wiki/w/Weapons/Overview_Stats) rev 33881 | Damage, Amount, Area, cooldown, interval, behavior | Community/medium; revision-pinned here |
| ENEMIES | [Pipeestrello](https://vampire.survivors.wiki/w/Pipeestrello) rev 85648, [Zombie](https://vampire.survivors.wiki/w/Zombie) rev 85614, [Skeleton](https://vampire.survivors.wiki/w/Skeleton) rev 85629, [Ghost](https://vampire.survivors.wiki/w/Ghost) rev 85643, [Mudman](https://vampire.survivors.wiki/w/Mudman) rev 85618 | Regular-enemy stats and variants | Community/medium; revision-pinned here |
| SPECIAL | [Glowing Bat](https://vampire.survivors.wiki/w/Glowing_Bat) rev 54012, [Mantichana](https://vampire.survivors.wiki/w/Mantichana) rev 85632, [Flower Wall](https://vampire.survivors.wiki/w/Flower_Wall) rev 85644, [Giant Bat](https://vampire.survivors.wiki/w/Giant_Bat) rev 85638 | Boss/event/boundary-enemy stats | Community/medium; revision-pinned here |
| XP | [Level up](https://vampire.survivors.wiki/w/Level_up) rev 85687, [Experience Gem](https://vampire.survivors.wiki/w/Experience_Gem) rev 85611, [Magnet](https://vampire.survivors.wiki/w/Magnet) rev 89850 | Level formula, gem storage/colors, pickup radius | Community/medium; revision-pinned here |
| COPYRIGHT | [U.S. Copyright Office: Games](https://www.copyright.gov/register/tx-games.html), [Circular 31](https://www.copyright.gov/circs/circ31.pdf) | Clean-room boundary context | Government/primary; not project-specific legal advice |

The live wiki identifies its content license as CC BY-NC-SA 3.0. This document
cites it and records limited factual values; do not paste its prose or tables
into the game.
