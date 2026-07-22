# Player-Power Mad Forest Parity: The Locked Spec

This is the destination artifact of wayfinder map
[#193](https://github.com/yusufkinatas/loop-survivors/issues/193): the locked,
numbers-verified specification for the **player-power side** of Vampire
Survivors Mad Forest parity — weapon level shapes and damage scale, passive
item levels, the XP/leveling pace, a light-source pickup economy (enemies
drop only XP gems), and healing/notes-only max-level offerings. It is the
sibling of [`mad-forest-spec.md`](mad-forest-spec.md), which locked the
enemy/wave side. Implementation issues are cut from this document; where this
spec and older prose disagree, this spec wins.

**Clean-room rule.** Only mechanics and numeric parameters are mirrored from
the Vampire Survivors wiki — no assets, code, art, names, or UI. All names
(Stage Light, Tip Jar, Encore) are this game's own.

**Provenance.** Every mirrored number traces to one of six verified research
documents (all fetched 2026-07-22 from https://vampire.survivors.wiki raw
wikitext / MediaWiki API, except the audit and the re-check, which measured
this codebase):

- [`research/vs-weapon-progressions.md`](research/vs-weapon-progressions.md) —
  the 8-level norm, per-level shapes, cooldown behavior, derived DPS scale,
  evolution rules.
- [`research/vs-passive-progressions.md`](research/vs-passive-progressions.md) —
  the 5-level norm, per-level values, the real evolution requirement.
- [`research/vs-light-sources.md`](research/vs-light-sources.md) — brazier
  spawn logic, HP, the weight-based drop pool, Luck's reach, exclusivity.
- [`research/vs-max-level-rewards.md`](research/vs-max-level-rewards.md) —
  the maxed-out level-up screen (coins or chicken).
- [`research/leveling-pace-audit.md`](research/leveling-pace-audit.md) — the
  measured leveling pace of this build, the cause, and the sim harness
  ([`leveling-pace-audit-sim.ts`](research/leveling-pace-audit-sim.ts)).
- [`research/leveling-pace-recheck.md`](research/leveling-pace-recheck.md) —
  the same pace re-measured once this spec shipped, on a rebuilt harness that
  reproduces the audit's baseline (section 5a).

Decisions were locked ticket by ticket on the map; each section links its
ticket.

---

## 1. The shape of the change

Six decisions, one direction — stretch the player-power trip to VS length
without touching the endpoints the enemy spec was balanced against:

1. **Weapons go from 4 tiers to 8 levels** ([#199](https://github.com/yusufkinatas/loop-survivors/issues/199)).
   Level 1 = old tier 1, level 8 = old tier 4; the six middle levels are new.
   VS's shape, our numbers — no per-weapon 1:1 pairing with VS weapons.
2. **Sound progression decouples from gameplay levels** ([#199](https://github.com/yusufkinatas/loop-survivors/issues/199)).
   Charts keep their 4 authored stages (`TIER_COUNT = 4`,
   `src/audio/charts.ts`); a uniform banding maps 8 levels onto them. No new
   chart authoring.
3. **Passives stay on the VS 5-level shape they already have**
   ([#200](https://github.com/yusufkinatas/loop-survivors/issues/200)); the
   current tables lock verbatim. The evolution gate changes to VS's classic
   rule: weapon maxed, passive merely owned.
4. **The XP economy is untouched** ([#198](https://github.com/yusufkinatas/loop-survivors/issues/198)).
   The audit proved it VS-exact and leak-free; the too-fast pace was the
   compressed weapon ladder's doing, and decision 1 is the fix.
5. **Enemies drop only XP gems** ([#201](https://github.com/yusufkinatas/loop-survivors/issues/201)).
   Notes, First Aid, and the Stage Magnet move to a destructible prop — the
   **Stage Light** — mirroring VS's brazier economy verbatim. Bosses keep the
   anthem note.
6. **Max-level offerings become healing and notes only**
   ([#202](https://github.com/yusufkinatas/loop-survivors/issues/202)):
   the Encore is a fixed First Aid / Tip Jar pair, mirroring VS's maxed-out
   screen. Chest payouts stand unchanged, and build caps become 5 weapons /
   6 passives ([#214](https://github.com/yusufkinatas/loop-survivors/issues/214)).

## 2. Weapon 8-level progressions ([#199](https://github.com/yusufkinatas/loop-survivors/issues/199))

### 2a. Framework rules

- **Endpoints anchored, middle authored.** Level 1 = current tier 1, level 8
  = current tier 4, for every weapon. The audit showed both ends already
  match VS's DPS ranges (L1 ~2.5–9 single-target, L8 ~50–120 projectile /
  10–15 aura in VS terms); only the trip length was wrong.
- **VS shape rules adopted**: level 2 is the early mechanical spike
  (amount/pierce/area); damage arrives as 2–4 flat chunks, not a smooth
  ramp; one or two bonuses per level, never more — each level readable as
  one line (`tierLines` grows to 8 entries per weapon); level 8 is a
  damage/amount capstone. Old tier 2/3 values served as soft guides: levels
  3 and 5 pass through the old t2/t3 damage exactly wherever guides exist.
- **Payload over trigger density.** VS holds fire rate near-fixed across
  levels and scales the payload per shot — a clean fit for our
  constant-tempo grid. Trigger densities per sound stage are the existing
  chart schedules, unchanged; all new growth is payload.
- **Fractional damage adopted** (2.5, 1.5, 3.5) where a weapon's integer
  damage range is too coarse to chunk over 8 levels (hat, lead, arp, chord).
  Engine-safe — `e.hp -= amount` with no rounding in the damage path — and
  VS-precedented (Knife 6.5/16.5).
- **Evolved forms: no change.** Every evolution's damage is a multiplier on
  the built level-8 damage, and level 8 equals the old tier 4 exactly — the
  existing multipliers already sit on the new scale. Matches VS's norm (six
  of ten classic evolutions keep max base damage; behavior carries the
  power).

**ST DPS** below = single-target damage per second: triggers/bar × damage ÷
1.967 s (one bar at 122 BPM), the audit's model. The per-weapon "density"
figures are triggers per bar at chart stages 1/2/3/4.

### 2b. Kick (density 4/4/4/4)

| L | Change | Dmg | Amount | Area | ST DPS |
|---|---|---|---|---|---|
| 1 | a facing-side strip, on the beat | 3 | 1 | 1.0 | 6.1 |
| 2 | adds an opposite-side follow-up | 3 | 2 | 1.0 | 6.1 |
| 3 | damage up | 5 | 2 | 1.0 | 10.2 |
| 4 | wider, damage up | 7 | 2 | 1.1 | 14.2 |
| 5 | damage up | 9 | 2 | 1.1 | 18.3 |
| 6 | wider | 9 | 2 | 1.2 | 18.3 |
| 7 | damage up | 12 | 2 | 1.2 | 24.4 |
| 8 | maximum damage | 15 | 2 | 1.2 | 30.5 |

### 2c. Snare (density 2/2.5/2.5/3.5)

| L | Change | Dmg | Pierce | Speed | Radius | Life | ST DPS |
|---|---|---|---|---|---|---|---|
| 1 | a piercing shot at the nearest enemy | 5 | 2 | 650 | 7 | 1.4 | 5.1 |
| 2 | pierces 1 more enemy | 5 | 3 | 650 | 7 | 1.4 | 5.1 |
| 3 | damage up | 7 | 3 | 650 | 7 | 1.4 | 8.9 |
| 4 | pierces 1 more, faster shot | 7 | 4 | 680 | 8 | 1.4 | 8.9 |
| 5 | damage up, flies longer | 9 | 4 | 680 | 8 | 1.5 | 11.4 |
| 6 | pierces 1 more enemy | 9 | 5 | 680 | 8 | 1.5 | 11.4 |
| 7 | damage up, fastest shot | 11 | 5 | 720 | 8 | 1.5 | 19.6 |
| 8 | maximum damage, deepest pierce | 13 | 6 | 720 | 8 | 1.5 | 23.1 |

### 2d. Hat (density 4/4/6/12)

| L | Change | Dmg | Pierce | Speed | Life | ST DPS |
|---|---|---|---|---|---|---|
| 1 | chips down the walk heading | 2 | 2 | 440 | 0.80 | 4.1 |
| 2 | pierces 1 more | 2 | 3 | 440 | 0.80 | 4.1 |
| 3 | damage up | 2.5 | 3 | 440 | 0.80 | 5.1 |
| 4 | faster, flies longer | 2.5 | 3 | 450 | 0.85 | 5.1 |
| 5 | flies longer | 2.5 | 3 | 450 | 0.90 | 7.6 |
| 6 | pierces 1 more, flies longer | 2.5 | 4 | 450 | 0.95 | 7.6 |
| 7 | faster | 2.5 | 4 | 460 | 0.95 | 15.3 |
| 8 | maximum damage, fastest | 3 | 4 | 480 | 0.95 | 18.3 |

Radius stays 3 at every level.

### 2e. Clap (density 2/2.5/2.5/3.5)

| L | Change | Dmg | Radius | Arc | ST DPS |
|---|---|---|---|---|---|
| 1 | a crushing cone | 2 | 80 | 0.65 | 2.0 |
| 2 | wider, broader sweep | 2 | 88 | 0.72 | 2.0 |
| 3 | damage up | 3 | 88 | 0.72 | 3.8 |
| 4 | broader sweep | 3 | 88 | 0.80 | 3.8 |
| 5 | damage up, wider | 4 | 98 | 0.80 | 5.1 |
| 6 | damage up | 5 | 98 | 0.80 | 6.4 |
| 7 | widest, broader sweep | 5 | 108 | 0.85 | 8.9 |
| 8 | maximum damage | 6 | 108 | 0.90 | 10.7 |

### 2f. Bass (density 2/4/4/5.5)

| L | Change | Dmg | Speed | Radius | Life | ST DPS |
|---|---|---|---|---|---|---|
| 1 | a slow wave through everything | 3 | 135 | 22 | 2.3 | 3.1 |
| 2 | wider wave | 3 | 135 | 28 | 2.3 | 3.1 |
| 3 | damage up, rolls longer | 5 | 135 | 28 | 2.4 | 10.2 |
| 4 | wider, faster | 5 | 140 | 34 | 2.4 | 10.2 |
| 5 | damage up, rolls longer | 8 | 140 | 34 | 2.5 | 16.3 |
| 6 | damage up, faster | 10 | 145 | 34 | 2.5 | 20.3 |
| 7 | widest, fastest | 10 | 150 | 42 | 2.5 | 28.0 |
| 8 | maximum weight | 13 | 150 | 42 | 2.6 | 36.3 |

Pierce stays Infinity at every level.

### 2g. Lead (density 1.5/2.25/4/5.5)

| L | Change | Dmg | Speed | Radius | Life | Pierce | ST DPS |
|---|---|---|---|---|---|---|---|
| 1 | a seeker that hunts | 2 | 340 | 6 | 2.2 | 1 | 1.5 |
| 2 | damage up | 2.5 | 340 | 6 | 2.2 | 1 | 1.9 |
| 3 | damage up, faster | 3 | 350 | 6 | 2.2 | 1 | 3.4 |
| 4 | faster, flies longer | 3 | 360 | 6 | 2.3 | 1 | 3.4 |
| 5 | bigger bolt | 3 | 360 | 7 | 2.3 | 1 | 6.1 |
| 6 | pierces 1 more | 3 | 360 | 7 | 2.3 | 2 | 6.1 |
| 7 | damage up, fastest | 3.5 | 380 | 7 | 2.3 | 2 | 9.8 |
| 8 | maximum damage | 4 | 380 | 7 | 2.4 | 2 | 11.2 |

### 2h. Arp (density 4/8/8.5/13)

| L | Change | Dmg | Radius | Life | Orbit | ST DPS |
|---|---|---|---|---|---|---|
| 1 | orbiters sweep the ring | 2 | 8 | 2.0 | 80 | 4.1 |
| 2 | orbits last longer | 2 | 8 | 2.4 | 80 | 4.1 |
| 3 | wider ring | 2 | 8 | 2.4 | 92 | 8.1 |
| 4 | damage up | 2.5 | 8 | 2.4 | 92 | 10.2 |
| 5 | bigger orbiters, last longer | 2.5 | 9 | 2.8 | 92 | 10.8 |
| 6 | wider ring | 2.5 | 9 | 2.8 | 106 | 10.8 |
| 7 | widest ring, last longest | 2.5 | 9 | 3.2 | 122 | 16.5 |
| 8 | maximum damage, biggest orbiters | 3 | 10 | 3.2 | 122 | 19.8 |

### 2i. Chord (density 2/4/4/7)

| L | Change | Dmg | Radius | Life | ST DPS |
|---|---|---|---|---|---|
| 1 | a zone thrown onto the pack | 1 | 48 | 2.0 | 1.0 |
| 2 | bigger zone | 1 | 56 | 2.0 | 1.0 |
| 3 | lingers longer | 1 | 56 | 2.2 | 2.0 |
| 4 | damage up | 1.5 | 56 | 2.2 | 3.1 |
| 5 | bigger zone, lingers longer | 1.5 | 64 | 2.5 | 3.1 |
| 6 | bigger zone | 1.5 | 70 | 2.5 | 3.1 |
| 7 | lingers longest | 1.5 | 70 | 2.8 | 5.3 |
| 8 | maximum damage, biggest zone | 2 | 76 | 2.8 | 7.1 |

## 3. Level → sound-stage banding ([#199](https://github.com/yusufkinatas/loop-survivors/issues/199))

Uniform across all eight weapons, 2 levels per stage:

| Weapon level | Chart stage |
|---|---|
| 1–2 | 1 |
| 3–4 | 2 |
| 5–6 | 3 |
| 7–8 | 4 |

Sound — and with it trigger density — steps at levels 3, 5, and 7; even
levels are payload-only. A weapon reaches its full musical pattern at level
7; level 8 is a payload capstone. The 4 authored chart stages are untouched.
Per-weapon bands were held in reserve as a targeted fix in case the
post-rebalance sim showed a broken curve; it did not
([#213](https://github.com/yusufkinatas/loop-survivors/issues/213), section
5a), so the uniform banding stands and the reserve is unspent.

## 4. Passives ([#200](https://github.com/yusufkinatas/loop-survivors/issues/200))

### 4a. Shape and values — locked verbatim

All passives already sit on the VS 5-level shape (level 1 a real bonus,
mostly-flat steps), with **Double Take as the deliberate 2-level Duplicator
mirror**. The per-level tables in `src/game/items.ts` are the spec's numbers,
unchanged:

| Passive | Partner weapon | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|---|
| High-Tops (move) | kick | +4% | +8% | +12% | +16% | +20% |
| Fast Forward (projectile speed) | snare | +20% | +40% | +60% | +80% | +100% |
| Needle Tips (pierce) | lead | +1 | +2 | +3 | +4 | +5 |
| Mirrorball (bounce / power kept) | hat | 1 / 65% | 1 / 75% | 2 / 75% | 2 / 85% | 3 / 85% |
| Wide Lens (area; orbit +3%/L) | chord | +6% | +12% | +18% | +24% | +30% |
| Heavy Amp (damage / shove) | bass | +5% / +4% | +10% / +8% | +15% / +12% | +20% / +16% | +25% / +20% |
| Extension Cable (duration) | arp | +8% | +16% | +24% | +32% | +40% |
| Padded Jacket (max HP; armor) | clap | +8 | +16 | +24, +1 armor | +32 | +40, +2 armor |
| Magnet (gem range / pull) | — | +20% / +8% | +40% / +16% | +60% / +24% | +80% / +32% | +100% / +40% |
| Recovery Tape (HP/s regen) | — | +0.1 | +0.2 | +0.3 | +0.4 | +0.5 |
| Double Take (extra projectiles) | — | +1 | +2 | — | — | — |

These run at roughly half VS magnitude by design (e.g. Heavy Amp +5%/level
vs Spinach +10%/level) — tuned for this game's damage economy, whose weapon
DPS endpoints section 2 deliberately left unchanged. The two irregular
ladders (Mirrorball's bounce steps, Padded Jacket's armor riders at 3 and 5)
stand; VS itself has irregular precedent (Attractorb, Armor's dual stat).
Padded Jacket still heals the HP it grants on each advance.

### 4b. Evolution gate — the one real change

The gate becomes **weapon at level 8 + paired passive owned at any level**,
replacing today's passive-maxed requirement (`eligibleEvolution` in
`src/game/items.ts` currently checks weapon tier ≥ 4 and item level ≥ 5).
This is VS's classic rule: all eleven classic base-game evolutions gate on
weapon max only, passive merely in inventory. Investment stays ~9 picks (8
weapon + 1 passive, vs today's 4 + 5), so evolution pacing survives the
ladder stretch. Consequence, accepted: a passive's levels 2–5 are pure stat
value, no longer evolution currency — you evolve off level 1.

Chest-offer timing is unchanged: evolution eligibility is checked at
chest-open with no minimum-time rule, matching VS. All eleven passives keep
their ladders, roles, and the eight evolution partnerships; Magnet, Recovery
Tape, and Double Take stay partner-less utility passives.

## 5. XP economy — verbatim, and left alone ([#198](https://github.com/yusufkinatas/loop-survivors/issues/198))

The audit (headless runs of the real `RunWorld`: real 122 BPM chart triggers,
real wave table, farming bot, three seeds per condition agreeing within ±2
levels) established:

- **The economy is clean.** `xpForNextLevel`, both XP walls (+600 at level
  20, +2400 at level 40), the ×2 pickup bonus at exactly those walls, and
  exact-value gems all match the Mad Forest spec §7 verbatim. No leak; gems
  never despawn.
- **Measured pace (4-tier build): level 25–27 by 10:00, 80–82 at 30:00** —
  the level-20 wall fires at ~minute 7–8. Pace is kill-throughput-bound:
  the run saturates the wave table's kill ceiling from ~minute 3.
- **The compressed weapon ladder is the cause.** Per-weapon DPS *endpoints*
  already match VS, but the trip took 4 picks instead of VS's 8 levels.
  Emulating the 8-step shape in the sim (same endpoints, nothing else
  changed) drops the run to L7–8 by 10:00 and a final L15–25.

**Therefore no XP change ships with this spec.** The 8-level rescale of
section 2 is the whole fix.

### 5a. Verified after the rebalance shipped ([#213](https://github.com/yusufkinatas/loop-survivors/issues/213))

Measured with a rebuilt harness that reproduces the audit's own baseline on
the pre-rescale tree, so before and after are one measurement taken twice
(`itemCap` 5 before, 6 after — the cap change is part of what shipped, not a
confound held fixed). Full write-up:
[`research/leveling-pace-recheck.md`](research/leveling-pace-recheck.md).

| | m10 | m15 | 30:00 | level-20 wall | level-40 wall |
|---|---|---|---|---|---|
| Before (4 tiers) | 23–27 | 46–50 | 78–81 | 7:00–8:08 | 11:59–12:54 |
| After (8 levels) | 20–24 | 26–34 | 53 / 55 / 78 | 7:16–9:31 | 17:19–24:55 |

- **The 30:00 target passes.** A typical run finishes ~25 levels lower.
- **The level-20-wall expectation is retired, not missed.** It was the
  audit's own VS-expectation proxy, and the re-check showed it is not a
  player-power number at all: reaching level 20 costs 1,805 XP ≈ 1,800 early
  enemies, and at the section 2 endpoints the build is already over the wave
  table's kill-everything ceiling for the whole early game. At minute 7 both
  trees have killed the same number of enemies despite one being a full old
  tier weaker, and **×2 damage moves that wall by two seconds**. Section 11's
  allowed fixes all act on levels 2–8 — after the wall. Moving it would mean
  reopening the Mad Forest early spawn budget or the VS XP curve, neither of
  which is a player-power lever.
- **Judged on what the rescale governs, it delivered**: m15 fell from 46–50 to
  26–34 and the level-40 wall moved five to twelve minutes later.

**Do not re-derive this as a bug.** A run that reaches level ~20 by minute 8
is the locked wave table and the locked XP curve doing arithmetic, not a
weapon that is too strong.

## 6. Stage Lights ([#201](https://github.com/yusufkinatas/loop-survivors/issues/201))

### 6a. Identity

The **Stage Light** is a destructible prop — a toppled follow-spot The Hush
hasn't consumed, **warm amber glow** as the color anchor against the Hush's
cold static palette. Up to ten of them faintly light the field. Breaking one
is **silent** — spark-burst feedback only: pillar 1 stays pure (only weapons
make sounds). Glossary term in `CONTEXT.md`.

### 6b. Spawning (VS verbatim, Luck ≡ 1.0)

The game has no Luck stat, so every VS Luck formula collapses at
`totalLuck ≡ 1.0`; the spec records the collapsed constants, not the dead
formula.

- Spawn attempt every **1 second**, flat **10%** chance.
- Maximum **10** alive. A successful attempt at the cap spawns the new light
  **closest to the player** and despawns the **oldest**.
- Spawns **barely off-screen, in an oval around the player**.
- Stage Lights may spawn on top of each other; no despawn by age or distance
  otherwise.

### 6c. Physics

- **10 HP** (VS verbatim).
- **Incidental damage only**: any weapon hitbox that overlaps a Stage Light
  damages it — projectiles passing through, auras, orbitals — but **no
  weapon ever selects one as a target**. Breaking lights is positioning, not
  targeting; no DPS is diverted from the horde.
- **Fully walk-through**: no collision with player, enemies, or projectiles;
  projectiles damage it and keep flying. The Mad Forest spec's locked enemy
  movement is untouched.

### 6d. Drop table — exactly one guaranteed roll per break

The weight table has no "nothing" entry — every destroyed Stage Light drops
exactly one pickup. **No pity counters anywhere** in the new economy.

| Drop | Weight | Min player level | Maps from (VS) |
|---|---|---|---|
| Note ×1 | 50 | 0 | Gold Coin |
| First Aid | 12 | 0 | Floor Chicken |
| Note bundle ×10 | 10 | 0 | Coin Bag |
| Stage Magnet | 2 | 12 | Vacuum |
| Note bundle ×100 | 1 | 5 | Rich Coin Bag |

- Weights are fixed (Luck ≡ 1.0). At level 0 the split is ~69% note, ~17%
  First Aid, ~14% ×10 bundle.
- Unmapped VS entries are **cut, not remapped**: Orologion, Rosary, Nduja
  (new mechanics, not mappings — pillar 4), Little Clover (Luck out of
  scope), Gilded Clover (gold systems out of scope), Rerollo (no reroll
  system).
- First Aid and Stage Magnet keep their existing identities: First Aid heals
  20% of max HP, walk-onto, magnet-immune; Stage Magnet vacuums map-wide,
  walk-onto.
- Presentation: the ×100 bundle gets a distinct jackpot visual; the ×10
  bundle sharing the anthem-tier look (value ≥ 10) is fine.

**The Stage Magnet's rarity is load-bearing, and the spike it causes is the
design.** The row's weight of 2 and its level-12 gate make magnets rare and
late: [#213](https://github.com/yusufkinatas/loop-survivors/issues/213)
measured 1–5 per run with the first at 17:40–24:50, against 34–39 (first at
2:24) under the deleted enemy-drop path of section 6e. Gems drop faster than
anyone collects them, so a bank of 7–9k uncollected XP now builds up on the
floor untouched — and the first magnet cashes all of it at once, worth **+13
to +14 levels inside one minute, on every seed measured**.

That payoff is wanted: one enormous reward moment per run. Two costs are
accepted with it — the run's biggest power spike turns on a 2.7% roll rather
than on play, and the 30:00 level swings ~25 levels between seeds depending on
when that roll lands. **Do not "fix" the one-minute level spike, and do not
reweight or ungate this row to smooth it out.** Both were considered and
declined while resolving #213.

### 6e. Enemies drop only XP gems

Deleted from `src/game/run.ts` / `src/game/config.ts`:

- `spawnMusicNoteForEnemy` and the 7-kill note pity (`noteDropPity`);
- `spawnStageMagnetForEnemy`, the 700-kill pity (`stageMagnetDropPity`), and
  `STAGE_MAGNET.dropChance` / `STAGE_MAGNET.pityKills`;
- `spawnHealthPickupForEnemy` and `HEALTH_PICKUP.dropChance`.

The `spawnMusicNoteAt` / `spawnStageMagnetAt` / `spawnHealthPickupAt`
construction sites survive — the Sandbox uses them, and the Stage Light drop
path will. This closes the late-game infinite-magnet-while-standing-still
exploit the old kill-fed drops allowed.

### 6f. Bosses (unchanged)

The guaranteed anthem note stays at **value 10**; bosses keep the chest. The
chest ceremony is the boss's real reward; the anthem note is flavor.

## 7. The Encore ([#202](https://github.com/yusufkinatas/loop-survivors/issues/202))

Once every weapon and passive is maxed, level-ups become **Encores**,
mirroring VS's maxed-out reward screen with our items:

- **A fixed two-option screen** — always the same pair, no weighting: a
  **First Aid** or a **Tip Jar**. This replaces the weighted 3-option roll in
  `rollEncoreOffers` (`src/game/picks.ts`).
- **The heal is a standard First Aid** — 20% of max HP, same identity as the
  Stage Light drop, offered even at full HP (a wasted heal is the player's
  call, as in VS). The old flat +15 HP "Emergency Water" dies.
- **The Tip Jar pays a flat 25 notes, granted instantly on pick** — no
  pickup to walk to, no multiplier (no Greed equivalent). 25 mirrors VS's
  maxed-out coin bag and sits between the Stage Light ×10 roll and the ×100
  jackpot.
- **The +damage/+move/+area encores are removed** — `ENCORE_STEPS`,
  `EncoreProgress`, the caps, and the names Hotter Signal / Quick Change /
  Wider Stage all die. (VS keeps stat growth on the separate Limit Break
  toggle, which is not adopted.)
- **Maxed-build chest leftovers**: each leftover chest hit converts to one
  Tip Jar pedestal (25 notes), replacing the cycling stat-encore pedestals in
  `rollChestDrops` (`src/game/game.ts`). The chest ceremony's own heal stays.
- **No "always" auto-pick unlock** (VS's 100-bag persistent auto-collect):
  it's a play-statistic unlock, which the plan's meta rules forbid, and
  heal-vs-notes is the only decision a maxed build has left — keep the pause.

"Encore" survives as the state's name; "Tip Jar" is the note option's name.
Both are in the `CONTEXT.md` glossary.

## 8. Chests and build caps ([#214](https://github.com/yusufkinatas/loop-survivors/issues/214))

**Chest payouts stand, unchanged**: 1/3/5 free level-ups; the scripted
opening sequence 1-1-3-1-1-5 for a save's first six chests (VS's own
script); after that 6% jackpot (×5), 22% big win (×3), 72% single; a ready
evolution overrides the whole payout as the top prize; each hit rolls
uniformly over owned, non-maxed weapons **and** passives (VS-verbatim);
ceremony heals stay 10/20/40 by size. The 8-level stretch already retunes
chests downward automatically — one hit is now 1/7 of a weapon's journey
instead of 1/3 — and ~half the hits landing on passives (pure stats under
the new gate) gently brakes the weapon race. No research pass on VS's exact
chest odds: they are entangled with Luck (out of scope), and our odds are
authored numbers we own.

**Build caps become 5 weapons / 6 passives** (`BUILD.itemCap` 5 → 6 in
`src/game/config.ts`). A step toward VS Mad Forest's 6/6; weapons hold at 5
because a sixth weapon is a sixth concurrent voice in the mix — the
build-as-track pillar outranks verbatim parity there. A full build costs ~5
more picks, so the Encore state arrives later.

## 9. Deviations & inventions ledger

Everything that is *not* a verbatim VS value or rule, in one place:

1. **No per-weapon 1:1 pairing** — VS's 8-level shape and overall damage
   scale are adopted, but every per-level number is ours (the defining
   framework decision).
2. **Sound-stage banding is entirely ours** — VS has no sound dimension;
   the 2-levels-per-stage mapping and the density values are original.
3. **Lead breaks the level-2 early-spike rule**: no amount stat and a pierce
   endpoint of only 2, so level 2 is a half-damage chunk; its real early
   spike is the stage-2 trigger-density jump at level 3 (×1.5, unique in
   the set).
4. **Bass's level-3 jump is the lumpiest** (×3.3: density doubles at stage 2
   plus the first damage chunk) — kept deliberately; bass is the
   weight-ladder kit, and VS tolerates lumpier (Cross ×21 overall).
5. **Hat and arp keep low payload growth** (×4.5 / ×4.8) because trigger
   density carries them — same as VS's aura/orbiter class (×3.4–4).
6. **Passive magnitudes run ~half VS** (Heavy Amp +5%/level vs Spinach
   +10%/level) — deliberate, tuned to this game's damage economy.
7. **Luck ≡ 1.0 everywhere** — no Luck stat; every VS Luck formula is
   recorded collapsed.
8. **Stage Light breaks silently** and is **fully walk-through** (the wiki
   is silent on collision; pillar 1 decides the sound).
9. **Weapons never target Stage Lights** — incidental hitbox damage only.
10. **Unmapped VS brazier drops cut, not remapped** (Orologion, Rosary,
    Nduja, both Clovers, Rerollo).
11. **Tip Jar is granted instantly** — VS's maxed-out coin bag is a floor
    pickup; ours skips the walk.
12. **No "always" auto-pick unlock** — VS's persistent unlock violates the
    plan's meta rules.
13. **Chest odds are authored** (6%/22%), not VS-mirrored — VS's are
    Luck-entangled.
14. **Weapon cap stays 5** vs VS Mad Forest's 6 (passives do go to 6) — the
    build-as-track pillar outranks parity.
15. **Boss anthem note (value 10)** is ours — VS bosses drop no such thing.
16. **Fractional damage** (hat 2.5, lead 2.5/3.5, arp 2.5, chord 1.5) —
    VS-precedented in kind (Knife 6.5), ours in value.

## 10. Removals

The full deletion/change list implementation issues draw from:

- **Weapon tier system** → 8-level tables (section 2); `tierLines` → 8
  entries per weapon; level → stage banding (section 3).
- **Evolution gate**: `eligibleEvolution`'s `itemLevel >= 5` → `>= 1`;
  weapon requirement becomes level 8 (max).
- **Enemy drops**: `spawnMusicNoteForEnemy`, `noteDropPity`,
  `spawnStageMagnetForEnemy`, `stageMagnetDropPity`,
  `STAGE_MAGNET.dropChance` / `pityKills`, `spawnHealthPickupForEnemy`,
  `HEALTH_PICKUP.dropChance` (section 6e).
- **Encore system**: the weighted `rollEncoreOffers` roll, `ENCORE_STEPS`,
  `EncoreProgress`, the stat caps, Hotter Signal / Quick Change / Wider
  Stage, the +15 HP Emergency Water (section 7).
- **Chest leftovers**: cycling stat-encore pedestals in `rollChestDrops` →
  Tip Jar pedestals (section 7).
- **Build caps**: `BUILD.itemCap` 5 → 6 (section 8).

New systems: the Stage Light prop (spawner, HP, incidental damage, drop
roll — section 6) and the Tip Jar grant.

## 11. Left open (deliberately)

- ~~**Pace verification**~~ — **done**, and no longer open: see section 5a.
  The 30:00 target passed and the level-20-wall expectation was retired. The
  per-weapon retune and per-weapon stage bands this section held in reserve
  were **not** needed and were not spent.
- **Prose edits** to `docs/plan.md` and the field guide (Encore paragraph,
  drop sources) are
  [#215](https://github.com/yusufkinatas/loop-survivors/issues/215).
- The Stage Light's exact look (warm amber anchor locked, tuned in-engine)
  and the ×100 jackpot visual.
- Post-implementation balance tuning against real play — a follow-up
  effort, out of this spec's scope.
