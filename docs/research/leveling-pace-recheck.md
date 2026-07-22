# Leveling-pace re-check: the 8-level rescale, measured

Verification for issue [#213](https://github.com/yusufkinatas/loop-survivors/issues/213)
(part of [#193](https://github.com/yusufkinatas/loop-survivors/issues/193)),
run 2026-07-22 against commit `09abb69` — the tree with the 8-level weapon
ladder (#226), the classic evolution gate (#227), Stage Lights (#228/#229),
the Encore (#230) and `itemCap` 6 (#231) all landed.

It supersedes the "before" table in
[`leveling-pace-audit.md`](leveling-pace-audit.md) §2 only in the sense that
§2 was measured with a harness that could not measure this tree honestly. The
audit's *conclusions* stand; its numbers are re-derived here with a harness
that runs on both trees.

## 1. The harness was rebuilt first, and re-validated against the old tree

The #198 harness could not be trusted on a post-rescale build for three
reasons, all now fixed in
[`leveling-pace-audit-sim.ts`](leveling-pace-audit-sim.ts):

1. **The chart-stage mapping was wrong.** It indexed the sound ladder with
   `min(3, level - 1)`, which is only correct while levels and authored chart
   stages are the same four rungs. After #226 that handed a level-3 weapon
   stage 3 and a level-5 weapon stage 4 — up to **triple** the real trigger
   density right through the mid-game. The harness now calls the shipped
   `chartStageForLevel`, imported when it exists.
2. **The build order was a script, not a build.** It maxed every weapon and
   only then bought passives. At 4 tiers that reached the first passive by
   pick ~20; at 8 levels it reaches it by pick ~40, so the bot played most of
   a 30-minute run with no Magnet. The harness now deals real cards through
   the shipped `rollOffers` (real weights, real caps, real forced-item rule)
   and a documented pick policy chooses one of the three. `itemCap` 6 needs
   no special handling — it is simply what the roll obeys now.
3. **The bot left free rewards on the floor.** It never walked to a boss
   chest (`RunWorld` only opens one within 42 units) and never fetched a
   dropped Stage Magnet. Both are things every real player fetches; both are
   now the bot's top movement priorities. Chests also pay what the real
   `rollChestDrops` pays — a ready evolution as top prize, otherwise 1/3/5
   hits landing uniformly on owned, non-maxed weapons **and** passives.

**The validation that matters:** the rebuilt harness was run against the
pre-rescale tree (branch `research/leveling-pace-audit`, commit `e0e9920` =
`5adf261` + the audit docs) and reproduces the published baseline it never
saw:

| | m5 | m10 | m15 | m20 | m25 | 30:00 |
|---|---|---|---|---|---|---|
| #198 published baseline (old harness, scripted build) | 16–17 | 25–27 | 47–48 | 60–61 | 68 | **80–82** |
| Same tree, rebuilt harness (real offer roll) | 5–17 | 23–27 | 46–50 | 57–60 | 64–68 | **78–81** |

Three seeds (1234, 42, 777), deterministic, agreeing within ±3 levels of the
old number everywhere past minute 10. So the "before" is not an artifact of
either harness, and before/after below are the same measurement twice.

## 2. Measured pace, before and after

Same harness, same three seeds, same pick policy. "Before" = pre-rescale tree
(4 tiers, `itemCap` 5); "after" = this tree (8 levels, `itemCap` 6). Both
numbers are per-seed ranges.

| | m5 | m10 | m15 | m20 | m25 | 30:00 | L20 wall | L40 wall |
|---|---|---|---|---|---|---|---|---|
| Before | 5–17 | 23–27 | 46–50 | 57–60 | 64–68 | **78–81** | 7:00–8:08 | 11:59–12:54 |
| After | 14–16 | 20–24 | 26–34 | 29–55 | 49–63 | **53 / 55 / 78** | 7:16–9:31 | 17:19–24:55 |

Kills fell from 16.8–18.4k to 10.5–16.5k; XP collected from 38–41k to
17–39k. Full per-minute tables are reproducible with the command at the end.

## 3. Verdict on #213's two criteria

### 3a. "The 30:00 level sits far below 80" — **passes**

53, 55 and 78 against a before of 78, 81, 80. Typical run is ~25 levels
lower; the median seed is a third lower.

The caveat is the spread, and it is new. Before the rescale the three seeds
landed within 3 levels of each other; now they land 25 apart, and the whole
spread is explained by **when the run's one Stage Magnet dropped** (§4).
Seed 777's 78 is not a build that out-paced the others — it is the build that
got its magnet at 17:40 instead of 24:50.

### 3b. "The level-20 wall lands mid-run, not minute 7" — **misses, and no legal lever can fix it**

It is not a harness artifact. It reproduces on the rebuilt harness with real
offer rolls, on every seed, under every pick policy that builds a functioning
band. The reason is arithmetic, not tuning:

- Reaching level 20 costs **1,805 XP** (`xpForNextLevel` summed over levels
  1–19) — about 1,800 early enemies, which are worth 1–2 XP each.
- At current power the build is already **over the wave table's
  kill-everything ceiling** for the whole early game. At minute 7 the two
  trees have killed the same number of enemies (before 826–1,242; after
  1,112–1,209) despite one of them being a full old-tier weaker. Both are
  killing everything that spawns; the table, not the build, is setting the
  rate.
- The damage sweep proves it directly: **×2 damage moves the level-20 wall by
  two seconds** (7:14 vs 7:16). Only halving damage moves it at all (27:09 at
  ×0.5, never at ×0.25) — and that costs the whole run (final level 15–21).

| Damage scale | L20 wall | L40 wall | 30:00 final |
|---|---|---|---|
| ×2 | 7:14 | 13:29 | 78 |
| ×1 | 7:16 | 22:22 | 53 |
| ×0.5 | 27:09 | — | 21 |
| ×0.25 | — | — | 18 |

*(seed 1234; ×0.5 confirmed on seed 42, where L20 never arrives at all.)*

**Why the rescale had no leverage there.** Spec §2a anchors level 1 to the old
tier 1. The first twenty levels are fought at weapon levels 1–4, whose damage
passes through the old tier 1–2 values by construction — and that power is
already above the early table's ceiling. The stretch only bites once the old
build would have been at tier 3–4, which is exactly what the numbers show: at
m15 the level dropped from 46–50 to 26–34, and **the level-40 wall moved from
~12:00 to 17:19–24:55 — 5 to 12 minutes later.** The rescale did what it was
meant to do; it did it from level ~20 onward.

**The recommendation, therefore, is not a retune.** Spec §11 allows a
per-weapon retune or per-weapon stage bands. Both act on levels 2–8 — after
the wall. The only thing that moves the wall is cutting level-1/2 power by
roughly half, which contradicts the anchored endpoint in §2a and, measured,
collapses the run. The "level-20 wall mid-run" target came from #198 §6 as a
*VS-expectation proxy* with no VS timing evidence behind it, and it turns out
to be a statement about the Mad Forest wave table's early spawn budget (locked
in `mad-forest-spec.md`) and the VS XP curve (locked in player-power-spec §5)
— two things this ticket is explicitly not allowed to touch, and neither of
them a player-power number.

Retire it, and check the rescale against what it actually governs: the L40
wall (moved 5–12 minutes) and the 30:00 level (passed).

## 4. The Stage Magnet whiplash is structural, on every seed

The behaviour flagged on seed 777 — a single Stage Magnet cashing a floor bank
into a stack of levels in one minute — happens in **all three** post-rescale
runs:

| Seed | Bank cashed | Levels gained in that minute |
|---|---|---|
| 1234 | 7.0k floor XP at m22→m23 | L34 → L47 |
| 42 | 7.5k at m24→m25 | L35 → L49 |
| 777 | 7.9k at m17→m18 | L39 → L53 |

*(Seed 777 does it a second time at the buzzer: magnets at 29:24 and 29:50
take L68 to a final L78.)*

The mechanism is a supply change, not a bug:

| | Stage Magnets per run | First one at |
|---|---|---|
| Before (kill-drop + 700-kill pity) | 34–39 | 2:24–5:49 |
| After (Stage Light table only) | 1–5 | 17:40–24:50 |

A run breaks **58–108 Stage Lights**, the magnet row is weight 2 of 75 (~2.7%)
and gated at player level 12, so the first magnet is expected somewhere around
the 37th break — i.e. mid-run, by construction. Magnet supply fell about
tenfold and moved entirely into the back half of the run.

Meanwhile the floor bank still forms: gems drop faster than a player collects
them, in both trees (at ×2 damage the bank reaches 21.8k). Before the rescale
a magnet swept it every ~45 seconds so it never showed. Now nothing sweeps it
for seventeen minutes, and the first sweep pays out seventeen minutes of
interest at once.

**This is a design call, not a defect.** Three shapes, with what each costs:

1. **Keep it.** The bank *is* the jackpot, and one enormous payoff per run is
   a legible reward moment. Accept that the 30:00 level is then decided by one
   2.7% roll, and that the run's biggest power spike is unearned by play.
2. **Spread the supply** — drop the magnet row's `minLevel` 12 gate, or raise
   its weight, so magnets arrive throughout and one +14 becomes four +3s.
   Costs: those weights are spec §6d's verbatim-VS numbers (collapsed at
   Luck ≡ 1.0), so this becomes a new entry in the deviations ledger.
3. **Stop the bank forming** — more pickup reach early (Magnet's ladder, or
   `RUN.magnetRadius`). Not an XP-economy change in §5's sense, but it changes
   how much of a run's XP a player banks, which is the same pace lever by
   another name; it would want its own measurement pass.

My read: (2) is the smallest honest change — the whiplash is a *distribution*
problem, and the drop table is where the distribution lives.

## 5. What this does not claim

- **The bot cannot die** (`invincible`), so this is pace, not survival.
- **Its gem-seeking is near-biased on purpose** — it drifts forward and leaves
  a trail, like a human — so the absolute size of the floor bank is a property
  of that bot. The *comparison* is sound (same bot on both trees); the exact
  bank size is not a promise about a human run.
- **Pick policy is a model, not a measurement.** The default `human` policy is
  documented in the harness. Two deliberately lopsided policies bracket it:
  `weapons` (weapon-greedy) reaches L20 at 8:15/20:31 and finals 49/28;
  `passives` (passive-greedy) never reaches level 20 and finals 14/10 — a
  broken build, included as the floor. The §3b verdict holds across all of
  them, because none of them can affect a spawn-limited early game.
- **Seed 42's `weapons` run finals at 28 while its `human` run finals at 55.**
  Post-rescale, magnet luck now moves a run further than pick policy does.
  That is worth remembering before reading any single post-rescale run as a
  balance signal.

## Reproduction

```
npx tsx docs/research/leveling-pace-audit-sim.ts <damageScales> <seeds>
# the #213 run:  npx tsx docs/research/leveling-pace-audit-sim.ts 1 1234,42,777
# damage sweep:  npx tsx docs/research/leveling-pace-audit-sim.ts 2,1,0.5,0.25 1234
# policy check:  POLICY=weapons ... / POLICY=passives ...
# RUN_S=240 shortens a run while iterating on the harness itself.
```

For the "before" column, add a worktree at `research/leveling-pace-audit`,
copy this harness into it, and run it there — it feature-detects the 4-tier
tree (no `weapons/levels.ts`, no Stage Lights, `itemCap` 5) and needs no
edits.
