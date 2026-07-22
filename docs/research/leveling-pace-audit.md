# Leveling-pace audit: why leveling runs faster than Vampire Survivors

> **Read [`leveling-pace-recheck.md`](leveling-pace-recheck.md) next.** It is
> the #213 post-rescale measurement, and it corrects two things here: the sim
> harness had a chart-stage bug and a scripted build order that only held at 4
> tiers (both fixed there, and the §2 baseline below re-derived with the fixed
> harness — it reproduces), and the §6.6 "level-20 wall should land mid-run"
> expectation turns out to be unreachable by any player-power lever. The
> conclusions in §6 otherwise stand.

Audit for issue #198 (part of #193). All measurements taken 2026-07-22 against
commit `5adf261` (Mad Forest 30-minute parity) with the headless simulation
harness in `leveling-pace-audit-sim.ts` (this directory) — the real
`RunWorld`, the real 122 BPM chart trigger schedule, the real Mad Forest wave
table, no rendering or audio. VS comparison numbers come from
`docs/research/vs-weapon-progressions.md` (branch
`research/vs-weapon-progressions`), not from new wiki work.

## 1. The economy implementation is VS-exact — there is no leak

Verified line by line against mad-forest-spec §7:

- `xpForNextLevel` (`src/game/config.ts:260`) is the exact VS curve, with the
  level-20 (+600) and level-40 (+2400) walls baked into those steps.
- The +100% pickup bonus applies at exactly levels 20 and 40
  (`xpPickupMultiplier`, applied per gem at pickup time in
  `RunWorld.updateGems`, `src/game/run.ts:2382`) — same semantics as VS's
  temporary Growth boost.
- A kill drops a gem worth exactly the enemy's XP (`src/game/run.ts:1735`);
  the old randomizing roll is gone as specced.
- Nothing else feeds `this.xp`: the only writers are gem pickup and two
  debug-panel helpers.
- Gems never despawn; past `RUN.maxGems` they merge into an overflow gem with
  value preserved. All spawned XP stays collectable, as in VS.

## 2. Measured pace (current build)

Headless 30-minute runs: fixed deterministic build (kick start; snare, clap,
bass, chord; tier-ups round-robin; then five passives to max), invincible
farming bot, three RNG seeds. Seeds agree within ±2 levels everywhere.

| Minute | 5 | 10 | 15 | 20 | 25 | 30:00 |
|---|---|---|---|---|---|---|
| Level (3 seeds) | 16–17 | 25–27 | 47–48 | 60–61 | 68 | **80–82** |

~18.4–18.7k kills and ~41–43k XP collected per run. The level-20 XP wall is
hit around minute 7–8 and the level-40 wall around minute 13–14 — both fire
in what VS treats as its early-mid game.

Bot caveat: the bot farms with near-perfect efficiency once powered (XP
collected ≈ XP dropped), and it cannot die (pace was measured, not
survival). A skilled human should land close to these numbers; a casual run
somewhat under them. The shape, not the last digit, is the finding.

## 3. Leveling pace is kill-throughput-bound

Same harness, weapon damage globally scaled, everything else untouched:

| Damage scale | Final level (3 seeds) | Kills |
|---|---|---|
| ×2 | 90–93 | ~20.4k |
| ×1 (current) | 80–82 | ~18.5k |
| ×0.5 | ~9–36 | ~2.5–4.9k |
| ×0.25 | 5–8 | ~0.4–2.2k |

Doubling damage buys only ~11 levels; halving it collapses the run. At
current damage the build saturates the wave table's kill-everything ceiling
from roughly minute 3 onward — kills ≈ spawns, so XP income equals the
table's full payout. (The low-scale rows are directionally solid but
understate what a human would reach: an underpowered bot gets encircled and
physically cannot reach gems; a human kites and collects.)

The wave table itself is the VS 1x table verbatim, and its backfill mechanic
(population floor refilled per interval) is shared with VS — so the *supply*
side is identical to VS by construction. The only variable that separates our
pace from VS's pace is how fast the player kills. That is the lever, and the
sweep confirms it is currently wide open.

## 4. Why kill throughput outruns VS: the ladder is compressed, not the numbers

Per-tier single-target DPS of every weapon (chart triggers/bar × damage ÷
1.967 s bar at 122 BPM):

| Weapon | t1 | t2 | t3 | t4 | trig/bar t1→t4 |
|---|---|---|---|---|---|
| kick | 6.1 | 10.2 | 18.3 | 30.5 | 4 → 4 |
| snare | 5.1 | 8.9 | 11.4 | 23.1 | 2 → 3.5 |
| bass | 3.1 | 10.2 | 16.3 | 36.3 | 2 → 5.5 |
| hat | 4.1 | 4.1 | 6.1 | 18.3 | 4 → 12 |
| arp | 4.1 | 8.1 | 8.6 | 19.8 | 4 → 13 |
| clap | 2.0 | 3.8 | 5.1 | 10.7 | 2 → 3.5 |
| lead | 1.5 | 3.4 | 6.1 | 11.2 | 1.5 → 5.5 |
| chord | 1.0 | 2.0 | 2.0 | 7.1 | 2 → 7 |

The **endpoints already match VS**: tier 1 sits at 1.0–6.1 DPS (VS L1 range:
~2.5–9), tier 4 at 7–36 single-target (VS whip L8 is 29.6; VS L8 crowd DPS is
higher only via amount/pierce, which our tier 4 also has). Total growth
(damage × trigger density × amount/pierce) is ×5–×12 — inside VS's ×8–×15.

What differs is the **trip length**: our ladder covers VS's 8-level distance
in 4 picks, and boss chests shortcut it further (~20 chest tier-ups per run
against a 45-pick build; VS's chests feed a 78-pick build). At minute 10 our
build is maxed; a VS build at the same minute is mid-ladder at a fraction of
its final DPS. Higher DPS → more kills → more XP → faster picks: the
compression compounds into the snowball the playtests felt.

A second, smaller deviation: about half of our growth arrives as **extra
triggers per bar** (hat 4→12, arp 4→13, chord 2→7). VS holds fire rate
essentially fixed and grows the payload per shot — which is also what the
locked charting decision for this map says our sound side wants (charts keep
4 authored stages; gameplay growth should live in payload).

## 5. The direct test: VS's 8-step shape restores VS-like pacing

Same harness, same endpoints, but every weapon step costs two picks (a no-op
pick interleaved) — emulating VS's 8-level trip at our numbers:

| Condition | m5 | m10 | m15 | 30:00 final |
|---|---|---|---|---|
| Current 4-pick ladder | 16–17 | 25–27 | 47–48 | 80–82 |
| VS 8-step shape | 4–6 | 7–8 | 9–17 | **15–25** |

Stretching progression alone — no damage retune, no economy change — pulls
the mid-game pace down by an order of magnitude. (Absolute stretched values
carry the encircled-bot caveat from §3 and read as a floor; the honest
statement is "dramatically slower," not the specific final level.)

## 6. Conclusions for the weapon-progression ticket (#199)

1. **Do not touch the XP economy.** Curve, walls, gem values, pickup bonus
   are VS-exact and leak-free. The "too fast" feeling is not an economy bug.
2. **The weapon rescale is the expected lever, and it is sufficient.** Pace
   is kill-throughput-bound; power-per-pick is the input that sets it.
3. **Stretch, don't shrink.** Keep tier-1 and max-level DPS roughly where
   they are (both ends already match VS); spread the trip over 8 levels so
   mid-game power arrives at VS timing.
4. **Prefer payload growth over trigger-density growth** when authoring the
   8-level shapes — consistent with VS's near-fixed cooldowns and with the
   locked chart decision (4 sound stages mapped over 8 levels).
5. **Chest payouts compound the compression** — worth revisiting when the
   chest slot-machine fog item sharpens (1/3/5 payouts against a deeper
   ladder are proportionally gentler, which argues for locking the ladder
   first, exactly as the map already sequences it).
6. **Re-measure after the rebalance** with this same harness; the §2 table is
   the "before" baseline. VS-expectation proxy: the level-20 wall should land
   mid-run (not minute 7), and the 30:00 level should sit far below 80.

## Reproduction

```
npx tsx docs/research/leveling-pace-audit-sim.ts <damageScales> <seeds>
# e.g.  npx tsx docs/research/leveling-pace-audit-sim.ts 1,0.5 1234,42,777
```

The `STRETCH=1` variant of §5 is gone: it emulated the 8-level shape at 4-tier
numbers, and the 8-level shape has since shipped (#226). The harness's build
order is no longer a script either — see the re-check doc's §1.
