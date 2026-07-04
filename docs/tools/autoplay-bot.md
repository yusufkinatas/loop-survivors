# Autoplay Bot: Locked Tool Spec

Locked July 4, 2026, after a grilling session. This is a dev tool spec, not a
phase spec: it defines a balance instrument, its architecture, and the limits
of its authority. Changes require the developer's explicit sign-off, same as a
phase spec.

## Purpose and standing

An automated playtest harness: bots play full runs with no human, no audio,
and no real-time clock, in batches of hundreds, and report how builds fared.

**The bot is a balance instrument only.** Its numbers inform tuning between
gates. No gate ever passes or fails on bot output. The developer's ear and
hands remain the only gate (AGENTS.md). When a bot number and the developer's
hands disagree, the hands win.

**Bot results are comparative, never absolute.** "Deep builds win 3x more
often than shallow builds" is a usable finding. "Players will win 60% of
runs" is not, because no mover is a human.

## Usage doctrine: floors, not peaks

This game is a fun survivors-like, not a balanced competitive game. Imbalance
is content: discovering a secretly monstrous build is a reward. Therefore:

**The bot detects broken. It never defines balanced.** No target win rates,
no "weapons within X% of each other", ever. When numbers show a weak build,
the spec's question is "is losing with it still fun?" and only the
developer's hands answer that.

What the bot is for, in order of value:

1. **Catching broken, not strong.** The floor below which imbalance becomes a
   defect: a build that is dead on arrival with no counterplay, AFK being
   viable, one weapon dwarfing all others in damage share so every other pick
   is noise. These are Pillar 3 violations, not balance opinions.
2. **Verifying that picks matter.** Run the same batch under different pick
   policies. If deep, wide, focused, and random all win at the same rate,
   choices are meaningless and the pick economy is broken. A healthy spread
   between build strategies is a success signal; equal win rates are the
   failure signal.
3. **Regression safety.** After any config swing, re-run a reference batch
   and see what moved before the developer rediscovers it with his hands.
4. **Filtering candidates.** During tuning, throw away configurations that
   are obviously dead (nothing completes, or everything does) so every
   version the developer actually plays is plausible. The bot buys better
   playtests; it never replaces one.

## Architecture decisions (locked)

- **One source of truth.** The bot drives the real `RunWorld`, the real
  weapon/enemy configs, the real chart data. No standalone simulator that
  re-implements the rules: a re-implementation drifts silently and its
  numbers become fiction.
- **Virtual clock.** Weapon fire is normally driven by the music engine's
  Web Audio clock, which runs in real time and cannot be accelerated. The
  bot replaces it with a virtual clock that steps the same charts and
  generates the same triggers on a simulated timeline: no audio, no real
  time, as fast as the CPU computes.
- **No-graphics mode.** Simulated entities skip creating visual objects.
  This is the same simulation/rendering decoupling in `RunWorld` that the
  gate-C frame-rate work needs anyway.
- **Fixed tick.** Simulation steps at a fixed 60 Hz dt. No coarser ticks for
  speed; parallelism across CPU cores is the speed lever.
- **Seeded randomness.** All run randomness (spawn angles, aim wobble,
  humanize velocity, pick-offer shuffle) goes through an injected seeded
  generator. Every bot run records its seed and can be replayed identically.
  Normal human play stays unseeded.
- **Deterministic trig.** V8's Math.sin/Math.cos differ bitwise between Node
  and Chrome, which made browser replays drift off their batch runs until a
  flipped kill diverged the RNG stream. Gameplay code uses `dmath.ts`
  (fdlibm-kernel sin/cos built from IEEE-exact ops only), so a replay is
  bit-identical to its batch run across VMs. Verified by full-precision
  player-position probes.
- **Instant picks.** In simulation, level-up picks resolve immediately via
  the pick policy; there is no pause.

## Harness (locked)

- **Command-line batches.** e.g. `npm run bot -- --runs 500 --policy deep`.
  Runs fan out across CPU cores. Results land as files in the repo.
- **Browser replay hook.** Any single run from a batch can be replayed live
  and watchable in the game from its seed. When a statistic surprises us,
  the run gets watched before anything is tuned because of it.
- **Config fingerprint.** Every run records the git commit (and dirty flag)
  it ran under, so a batch can never be silently compared against a
  different balance state.

## Bot behavior (locked)

- **Movers are pluggable; comparisons hold the mover constant.** Shipping
  set: **AFK** (stands still; the difficulty canary — if AFK survives,
  difficulty is broken) and **Kiter** (the competent default: drifts away
  from local enemy density, leans toward gems when safe). A Greedy
  gem-prioritizing mover may be added later.
- **Pick policies choose from the real three-card offers.** The offer system
  stays part of what is measured: if a focused bot gets starved by offers,
  that is a real finding about the pick economy. Shipping set: **random**,
  **deep-first** (always tier up something owned), **wide-first** (always
  take a new weapon), **focus(role)** (take the role when offered, else fall
  back). **No forced build order mode** — if a pure-viability question ever
  demands one, that is a separate future decision.

## Metrics and reporting (locked)

Per run, one JSON line: seed, mover, pick policy, config fingerprint, the
build as it unfolded (each pick with its timestamp), outcome (victory or
death at m:ss), final level, **damage share per weapon (primary)**, kill
share per weapon (secondary), lowest-hp moments, peak enemies alive.

Damage share is primary because kill counts lie: an AoE weapon last-hits
hordes of nearly-dead swarmers and looks dominant while a single-target
weapon quietly does the real work on tanks. The in-game end screen and debug
overlay switch to damage-share attribution as part of this work, kills shown
secondary.

Per batch, a short text report readable in ten seconds: arms, win rate,
median death time, damage-share table, and an **outliers line** — the
strangest runs (wins by weak arms, early deaths by strong ones) surfaced
automatically with their seeds for browser replay. No dashboards, no charts.

## Build order and gates

Timing (locked): **gate B replay first, bot immediately after**, before gate
C tuning begins. The pending third-pass rework gets judged as it stands; the
refactor never sits untested under a run being judged.

1. **Sub-phase 1: decoupling.** Simulation/rendering split in `RunWorld`,
   virtual clock, seeded RNG injection, no-graphics mode, damage-share
   attribution. Verified by the agent: a seeded sim run and the real game
   agree on behavior, and the real game plays unchanged.
2. **Sub-phase 2: harness and bots.** CLI batch runner with parallel
   workers, JSON-lines output, batch report, outlier surfacing, browser
   replay from seed, AFK and Kiter movers, the four pick policies.
3. **Calibration gate (developer, one-time).** Before any batch result
   informs tuning, the developer watches two or three Kiter replays in the
   browser and judges one question: does it play believably, like a
   competent player, neither an idiot nor an exploit? A fail loops the mover.
   This gate also confirms the refactored game still feels unchanged in
   hand. Repeats only if the Kiter is later rewritten.
