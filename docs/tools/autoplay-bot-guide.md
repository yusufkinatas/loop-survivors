# Autoplay Bot: Practical Guide

How to run, read, and extend the automated playtest harness. The locked
decisions and usage doctrine live in `autoplay-bot.md` (floors not peaks,
comparative never absolute, the developer's hands beat the numbers). This
guide is the manual; it changes freely as the tool grows.

## What it is, in one paragraph

Bots play full runs headless: the real `RunWorld`, real weapon/enemy
configs, real charts, driven by a virtual clock instead of the audio clock,
with no rendering and no real time. An 8-minute run computes in ~3–20
seconds (horde size decides); batches fan out across CPU cores. Every run
is seeded and can be replayed in the browser, bit-identical, live and
watchable.

## Running batches

```
npm run bot -- --runs 15 --mover kiter --policy deep,wide,random --label my-batch
npm run bot -- --runs 15 --policy focus:each --label per-instrument
```

| Flag | Default | Meaning |
|---|---|---|
| `--runs N` | 20 | Runs **per arm** (each policy spec is one arm) |
| `--mover` | kiter | `afk` \| `kiter` \| `harvester` |
| `--policy` | random | Comma list of `random`, `deep`, `wide`, `focus:<role>`; `focus:each` expands to the fourteen active weapons (dormant crash/riser are excluded) |
| `--seed-base N` | 1 | First seed; arms get consecutive blocks. **Reuse the same base to pair batches run-for-run** |
| `--workers N` | cores−2 | Parallel worker processes |
| `--label` | batch | Names the output folder |

Movers (who steers): `afk` stands still — the difficulty canary; if it
survives, difficulty is broken. `kiter` is the calibration-gated workhorse:
orbits the horde, drifts to gems when safe. All build comparisons hold the
mover constant. `harvester` is experimental (gem-seeking; measured no
better than the kiter — see the July 4 STATUS entry for why).

Policies (who picks at level-ups, always from the real three-card offers):
`deep` always tiers up something owned, `wide` always takes a new weapon,
`focus:<role>` takes its role when offered else random, `random` is random.
Offer starvation is part of what focus policies measure; there are no
forced build orders by design.

## Reading the output

Each batch writes `bot-results/<stamp>-<label>/` (gitignored):

- **`report.txt`** — the ten-second read: per arm, win %, median death
  time, average level, top-3 damage shares, and an **outliers** section:
  the strangest runs (wins in weak arms, early deaths in strong ones) with
  ready-made replay URLs.
- **`results.jsonl`** — one JSON object per run for deeper analysis:
  `seed`, `mover`, `policy`, `config` (git commit, `-dirty` if uncommitted),
  `victory`, `timeS` (end time), `level`, `kills`, `picks` (the build as it
  unfolded, each with its timestamp), `damageByRole` (**primary metric**,
  effective damage, overkill excluded), `killsByRole` (secondary — kill
  counts flatter AoE and hide single-target work), `minHp`/`minHpAtS` (the
  run's closest call), `peakAlive`.

What healthy numbers look like: AFK always dies early; win rates and death
times **spread across policies** (equal outcomes would mean picks don't
matter — that is the failure signal); no arm collapses to a trap (a floor
violation goes to the developer as "is losing with this still fun?", never
to automatic tuning).

## Watching a run

Any seed replays in the browser:

```
http://localhost:5173/?replay=<seed>&mover=<mover>&policy=<policy>
```

(URL-encode the focus colon: `policy=focus%3Ahat`.) The replay recomputes
the run tick-by-tick, so it is bit-identical to the batch record. Controls:
speed buttons 1x/2x/5x/10x top-right (above 1x the audio auto-mutes — the
sound clock is real time and cannot be sped up); a seek bar bottom-center
in 15-second stops. A background probe re-simulates the run to find its
real end, then the slider clamps so the track's right edge is the moment
of death. Seeking computes (a replay has no stored frames): forward jumps
freeze the picture behind a progress note; backward jumps restart from the
seed invisibly. Fastest workflow: drag to the last quarter and watch the
ending at 1–2x.

## Determinism rules (why replays match, and how not to break it)

1. **All gameplay randomness goes through the injected RNG** (`world.rng`,
   seeded mulberry32). Never `Math.random()` in sim-affecting code — audio
   humanize is exempt (sound only, `velocity` reaches damage un-humanized).
2. **No wall clock in sim code.** `world.timeS` for cadences, never
   `Date.now()`/`performance.now()`.
3. **`dsin`/`dcos` from `dmath.ts` in sim code, never `Math.sin`/`cos`** —
   V8 computes those bitwise-differently across Node and Chrome versions,
   which silently diverges replays. (`sqrt`, `atan2`, `pow`, `exp`, `%`
   measured bit-identical; prefer `sqrt(x*x+y*y)` over `hypot`, which is
   both slower and not exactness-guaranteed.)
4. **Fixed 60 Hz ticks** (`SIM_DT`), one `conductor.tick` + one
   `world.update` per tick, in that order, everywhere.
5. **Any change to sim-affecting code or config re-baselines every seed.**
   Old batches stay valid internally but are not seed-comparable to new
   ones — that is what the `config` fingerprint is for. Never compare
   across fingerprints without re-running.

## Experiment recipes

**Did a change help or hurt?** Run the same batch (same `--seed-base`,
same arms) before and after; compare paired per-seed, not just medians —
run-level variance is huge (±2 min on one seed is normal), so look at
better/worse counts and fixed-time metrics, and treat avg level and damage
share as the stable signals.

**Is any weapon a dead pick?** `--policy focus:each`, look for an arm that
collapses (early median death AND low focused damage share AND starved
levels). Verdict on whether it is a trap belongs to the developer.

**How does a future item/passive/genre interact with weapons?** When items
exist, give the sim a way to force a loadout element (an `items` field on
`SimSpec`, mirroring how tiers work), then run `focus:each` twice — item
on, item off, same seeds — and read the damage-share deltas per weapon.
The infrastructure (paired seeding, arms, reports) already supports this;
only the `SimSpec` hook is new work.

**What does a config knob do?** Mutate `RUN`/`ENEMIES`/`WEAPONS` at the
top of a script before simulating (see the July 4 magnet experiment:
`(RUN as any).magnetRadius = 200` → +30–180 s survival on 5/6 seeds).
Script-only mutation, never a config edit — knobs are the developer's.

**Instrumenting inside a run** (collection rates, per-minute curves):
wrap world internals in a bespoke script — e.g. the gem-drop audit wrapped
`spawnGem` to count dropped vs collected XP. Copy the pattern from the
STATUS-linked investigations rather than adding permanent counters.

## Extending

- **New mover:** a factory in `src/bot/movers.ts` (`MOVERS` maps name →
  `() => Mover`; factories exist so movers can carry per-run state). Add
  the name to `MoverName`. Deterministic state only (world time, not wall
  time). New movers face the calibration gate before their numbers are
  trusted.
- **New policy:** extend `makePolicy` in `src/bot/policies.ts`.
- **New record fields:** `RunRecord` in `src/bot/sim.ts`, plus the report
  aggregation in `scripts/bot.ts`.
- **The virtual clock** (`src/bot/conductor.ts`) mirrors the engine: bar
  queue first, then chart events via the shared `chartEventsAtStep`. If the
  engine's scheduling semantics change, change the conductor the same way —
  they must never disagree about what a build fires. Tempo is read live
  from `SKELETON.bpm` each tick, so BPM experiments need only a way to set
  it (plus recording it for replay).

## Costs

A run costs ~3 s (dies early) to ~20 s (survives late, big horde) of one
core. Rule of thumb at ~10 workers: 36 runs ≈ 2–5 min, 90 runs ≈ 10–20
min, 600 runs ≈ 1–2 h. Batches run fine in the background; the browser and
the game are unaffected.
