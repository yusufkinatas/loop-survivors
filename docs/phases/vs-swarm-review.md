# Handoff: review the swarm feel vs Vampire Survivors

**Status:** the VS-fidelity pass (PR #17, branch `vs-attempt-claude`, spec
`docs/phases/vs-fidelity.md`) shipped, and the developer played it. **It does
not feel like Vampire Survivors.** This document briefs a fresh reviewing agent
to diagnose *why the swarm feel is missing* and recommend fixes. Your job is
review + gap analysis + concrete recommendations, not a blind rewrite — the
developer will re-test after your changes.

## The developer's felt problems (verbatim intent)

1. "The bat enemies are super fast and they don't feel like they are swarming
   me."
2. "When a group of bats moves from one side of the screen to the other, they
   are scattered across my screen instead of being a big chunky group of bats."
3. "In general I don't feel like I'm being swarmed enough, similar to Vampire
   Survivors."

The through-line: **VS's core sensation is a dense horde that packs tightly
around you and forces you to carve a moving bubble. Our game never produces that
wall.** Everything below is in service of finding out why and fixing it.

## Where to read

- Tuning + roster + spawn schedule: `src/game/config.ts` (`RUN`, `ENEMIES`,
  `enemyScaling`, `SWEEP`, `SPAWN_DIRECTOR`).
- Movement / spawning / recycle / separation: `src/game/run.ts`
  (`moveEnemies`, `spawnEnemy`, `pushEnemy`, `spawnSweepOf`, `spawnRingOf`,
  `spawnSurgeOf`, `runDirector`, `recycleEnemies`, `contactDamage`).
- VS reference numbers (already researched + adversarially verified):
  `docs/phases/vs-fidelity-research.md`. Trust it; re-research only if you doubt
  a specific figure. Note VS's absolute px/s speeds are **unpublished** — only
  ratios to the player exist.
- The design intent of the current pass (and the tension that caused this):
  `docs/phases/vs-fidelity.md`, especially the "Deviations" section.

## The four review axes (current values vs VS)

Player: **230 px/s**, 100 HP, i-frames **0.24s** (VS-accurate 240ms), magnet 140.

### Axis 1 — how the enemy is (design + stats)

Every enemy is a plain straight chaser (no dash/orbit/charge), differentiated
only by speed/HP/size/contact-damage. Current base stats:

| kind | HP | contact dmg | radius | speed px/s | ×player |
|---|---|---|---|---|---|
| bat | 4 | 6 | 7 | 220 | 0.96 |
| zombie | 10 | 10 | 9 | 195 | 0.85 |
| skeleton | 16 | 10 | 9 | 195 | 0.85 |
| ghost | 12 | 6 | 10 | 300 | 1.30 |
| mudman | 70 | 10 | 15 | 195 | 0.85 |
| werewolf | 180 | 14 | 13 | 225 | 0.98 |
| mantis | 400 | 20 | 22 | 150 | 0.65 |
| elite | 800 | 24 | 34 | 160 | 0.70 |

`enemyScaling` applies only a **mild HP creep** (×1 → ×1.6 by 8:00), flat
damage/speed/XP (VS Mad Forest does not scale base stats).

**Review questions:** Are the enemy *sizes* (radii) big enough to read as a wall
when packed, at our camera zoom? VS enemy sprites are large relative to the
character; a 7px bat vs a 12px player may look like sparse dots, not a horde.
Should fodder be visually chunkier?

### Axis 2 — movement speed vs the player (the prime suspect)

**This is almost certainly the root cause of "not swarming."** In VS the fodder
is ~0.91× the player (kiteable) but the pressure enemies (bats 1.27×, ghosts
1.82×) *catch you*, and hundreds arriving from all sides means you cannot outrun
the horde — it closes and packs. In our game **every fodder kind is SLOWER than
the player** (bat 0.96×, zombie/skeleton/mudman 0.85×), so a moving player simply
outruns them; they string out behind in a thin tail instead of surrounding.

- VS bats: 1.27× → **catch you**. Ours: 0.96× → you leave them behind.
- VS fodder (zombie): 0.91×. Ours (zombie): 0.85× → slower still.

**Why it's like this (the tension you must resolve):** the previous pass made
fodder slower-than-player *on purpose*, because the balance proxy — the `kiter`
bot mover (`src/bot/movers.ts`) — *flees in a line*, and any enemy faster than
the player glues onto its back (the whip points away when fleeing) and kills it
in ~4s. Slower fodder made the fleeing bot survivable. **But that same choice is
what removes the swarm.** VS is not played by fleeing; it is played by *circling*
so the horde stays packed in front of you while your weapons carve it. So the
real fix likely requires BOTH: (a) enemies at/near player speed so they pack, and
(b) a competent-play proxy that circle-strafes rather than flees (or accept the
bot is a poor proxy here and lean on the developer's hands). Do not just re-raise
speeds without addressing the proxy, or you will reproduce the 8-second deaths
that triggered the slowdown (see the git history / earlier bot runs).

**Review questions:** What player:enemy speed ratio actually produces the VS
"can't outrun the wall" feel in *our* arena and camera? Does the fleeing kiter
need replacing with a circle-strafe/"orbit the horde" mover to be a valid proxy
for VS play? Is the off-field recycle (Axis 4) compounding this by deleting the
enemies that fall behind?

### Axis 3 — how they spawn (rate, formations, sweeps)

`SPAWN_DIRECTOR` is a rate (spawns/sec) + a weighted kind mix, with one-shot
formation events. Steady rate: **2.5/s at 0:00**, climbing to **~34–42/s in the
7:00–8:00 finale**. Formations: `ring` (all sides), `surge` (one arc),
`pincer` (two arcs), `sweep`, `elite`.

**The sweep (the "scattered bats" complaint), `spawnSweepOf` in run.ts:**
a line of enemies enters one edge and flies straight across at **`SWEEP.speed`
= 1460 px/s (6.35× player)**, spread across a width of **1.15 × the larger
screen dimension (~1470px)**. For a `count` of 12–44, that is **34–134px between
bats** (bat radius 7) — a *sparse* line — crossing the whole screen in **~1
second**. Result: a thin, blink-and-miss scatter, not a chunky moving clump.

**Review questions:** Should the sweep be much *denser* (tighter spacing, more
rows/count, narrower band) and *slower* (so it reads as a moving wall you must
dodge, not a strobe)? VS's bat-swarm is a dense flock. Is 1460 px/s far too fast?
Compare against the VS bat-swarm behaviour in the research doc (speed-700
internal, sweeps across "pushing enemies").

### Axis 4 — the amount / on-screen density

- `maxAlive` (soft cap) = **420**; `MAX_ALIVE_HARD` = **640**. VS: ~300 periodic
  cap, 500 absolute.
- **Off-screen recycle** (`recycleEnemies`, `recycleFactor = 1.7`): any non-elite
  enemy farther than `spawnDist × 1.7` behind the player (~**1240px**, ≈1.7
  screen-widths) is silently deleted (no kill, no gem). Combined with slower-than-
  player fodder, a moving player *manufactures* this condition constantly — the
  horde you left behind evaporates, so it never accumulates into a wall.
- **Separation steering** (`moveEnemies`, weight `1.5` on the overlap push-apart
  vector): enemies shove off each other so they don't stack. The comment claims
  it is "kept weak so the horde packs into a VS-style wall," but verify: too much
  separation spreads the wall thin; VS enemies overlap heavily when packed.
- Spawn distance = just off the visible edge, from random angles.

**Review questions:** With these rates + recycle + slow fodder, what is the
actual on-screen count around the player over a real run (measure it — see
below)? VS holds ~100 on screen by minute 8 and packs them tight; do we? Is the
recycle too aggressive, the spawn rate too low, the separation too strong, or
(most likely) all three amplified by the speed gap in Axis 2?

## Candidate root causes (hypotheses to verify, not a fix list)

Ranked by suspected impact:

1. **Fodder is slower than the player** → the horde is outrun, never surrounds.
   (Axis 2.) The single most likely cause of "not swarmed enough."
2. **The fleeing `kiter` bot proxy** rewards/necessitates slow fodder and hides
   the swarm problem (a fleeing bot would die to a real swarm). A circle-strafe
   proxy may be needed to tune this honestly. (Axis 2.)
3. **Off-screen recycle (1.7)** deletes the trailing horde a moving player
   creates → no accumulation. (Axis 4.)
4. **Spawn rate too low early/mid** relative to VS density-that-piles-up.
   (Axis 3/4.)
5. **Sweep is too fast + too spread** → thin scatter, not a chunky flock.
   (Axis 3.)
6. **Separation weight and/or small enemy radii** make even a present horde read
   as spaced-out dots rather than a wall. (Axis 1/4.)

Each is a knob; the interesting question is which combination restores the VS
wall without reintroducing the unfair fast-glue deaths.

## How to measure and re-test (so the developer can verify)

**Instrument density, don't eyeball it.** The bot's `RunRecord` already records
`peakAlive`; add/print an "enemies within ~1 screen of the player over time"
probe if useful (`src/bot/sim.ts`, `src/bot/movers.ts` have the world handle).
Compare our per-minute on-screen count to VS's floors (research doc §5/§9:
~15–30 early, ~100 by 8:00, up to 300).

**Bot commands** (from repo root):
- `npm run bot -- --runs 12 --mover afk --policy random` — AFK canary.
- `npm run bot -- --runs 16 --mover kiter --policy random,deep,wide,focus:kick`
  — competent-play spread. Watch `peakAlive` and survival; if you change speeds,
  re-check the kiter doesn't collapse to sub-minute deaths again.
- Reference (pre-review) numbers to beat/compare are in `docs/phases/vs-fidelity.md`.

**Browser** (`npm run dev`, then localhost:5173):
- The dev console exposes `window.loop.game.world` (`enemyCount`, `player`,
  `timeS`, `enemies[]`). Note: a backgrounded tab throttles the render loop;
  drive/inspect via that handle or keep the tab foregrounded.
- What "fixed" looks like: by ~1–2 minutes, a moving player should have a visible
  *ring/wall* of enemies closing from multiple sides that cannot simply be
  outrun; a bat sweep should read as a dense moving flock you must dodge.

**Guardrails while changing speeds/density** (so you don't regress the fair pass):
- AFK must still die fast (difficulty canary).
- The mandatory-start whip (kick) build must remain viable (it always starts;
  `hud.ts` forces `kick`). The `focus:hat`/`focus:riser` bot arms are artifacts
  — players never start those.
- Keep `run.ts` deterministic (seeded RNG, `dcos`/`dsin`, no `Math.random`/
  `Date` in the sim) so the bot and replays stay bit-identical. `view.ts` may use
  `Math.random`.

## Deliverable expected from the review

A short report that, for each of the four axes, states: our current value, the VS
equivalent (with a citation to the research doc), the gap, and a concrete
recommended change with the expected effect on the swarm feel — plus an explicit
recommendation on the speed-vs-proxy tension (Axis 2). Then apply the changes,
re-run the bot guardrails, and hand back to the developer to feel-test. Update
`docs/phases/vs-fidelity.md` (or add a follow-up note) and `docs/STATUS.md` with
what changed and why.

---

# Review findings + changes applied (July 11, 2026)

## The corrected diagnosis: it's PACKING, not quantity

The review ranked "fodder is slower than the player → the horde is outrun" as the
prime suspect and "spawn rate too low" as a contributor. Instrumenting the bot
proved that framing incomplete. A new dual density probe (`src/bot/sim.ts`,
surfaced in the batch report) measures two things per minute:

- **near** — enemies ON SCREEN (the visible rectangle). Quantity.
- **tight** — enemies inside the close bubble (260px). Packing — the wall you carve.

Baseline (config `1e3c0c2`), kiter spread:

```
                      m0   m1   m2   m3   m4   m5
kiter/focus:kick  near 21   51   61   67   90   95     <- quantity is FINE (VS band)
                  tight 5    4    3    3    4    4     <- packing is BROKEN
```

The on-screen count already sits in VS's band (up to ~95). But only **~4 enemies
are ever in the close bubble** — the horde is a thin spread smeared across the
screen, never the dense wall VS packs against you. That is precisely "I don't feel
swarmed." Root cause: a **moving/fleeing player strings the horde into a trailing
tail** (amplified by slower-than-player fodder + the aggressive off-screen recycle
deleting that tail), and the separation steering actively holds the survivors
apart into spaced dots. Raw spawn rate was never the problem; packing was.

## The four axes: current → VS → gap → change → effect

| Axis | Was | VS (research §) | Gap | Change | Expected effect |
|---|---|---|---|---|---|
| **1 · enemy size** | bat r7, zombie/skel r9 | sprites large vs the character (§3 note) | fodder reads as small dots when packed | bat 7→**8**, zombie/skel 9→**10** (modest; an eye dial) | packed wall reads more solid |
| **2 · speed** | fodder 195 = **0.85×**; bat 220 = 0.96× | fodder **0.91×** kiteable; the fast kinds catch you (§3/§9c) | a moving player outran the horde → tail, not a surround | fodder → **209 (0.91×)**, bat → **210 (0.91×)**; ghost stays 300 (1.30×, our sole outrunner) | shed rate 35→**21 px/s**: a circling player keeps the wall packed in front |
| **3 · sweep** | 1460 px/s (6.35×), 1.15×-screen sparse line, 34–134px gaps | dense flock, internal 700 (§3, §5) | thin blink-and-miss strobe | **860 px/s (3.7×)**, **0.36×-screen dense multi-rank block**, counts +~60%. Verified: 22 bats now a 410×27 block, ~15px gaps | a chunky moving wall you must dodge, not a scatter |
| **4 · density/packing** | recycle 1.7 (~1240px); separation **1.5**; rate-only spawns; cap 420/640 | overlap heavily into a wall (§3); wave **floors** (§5, §9d); ~100 by 8:00 | horde outrun/deleted; held apart; a strong build empties the screen | recycle → **2.6**; separation → **0.7**; **NEW density FLOOR per phase** (VS wave-minimum, refills at 14/s); cap 480/700 | the horde persists, stacks into a wall, and **you are always surrounded regardless of your DPS** — the single biggest fix |

## The speed-vs-proxy recommendation (Axis 2)

**The `kiter` is not a valid Vampire-Survivors-play proxy, and the review was right
to suspect it.** It *flees* the horde in a curve; fleeing is the exact anti-pattern
that removes the swarm (it outruns the pack and strings it into a tail). Tuning the
game so a fleeing bot survives had been quietly forcing fodder slower-than-player,
which is *why* the swarm was missing.

Fix applied on both sides:
- **Enemies moved to VS's real fodder ratio (0.91×).** This does NOT reintroduce
  the "fast-glue death": glue only happens with enemies *faster* than the player
  (VS bats 1.27×, ghosts 1.82×). Our fodder stays slower; only the low-HP ghost
  (1.30×) outruns you, and it dies fast to a grown build. So we get VS packing
  without the unfair pin.
- **Added a circle-strafe proxy, the `orbiter` mover** (`src/bot/movers.ts`): it
  circles the local pack at a standoff instead of fleeing — how VS is actually
  played. It is the honest test of whether the tuning produces a carve-able wall.
  Use `--mover orbiter` alongside `kiter` as a guardrail. **The developer's hands
  remain the real gate** (the review anticipated this).

## Bot guardrails (before → after, config `1e3c0c2-dirty`)

- **AFK canary:** 0:26 → **0:20** — still dies fast, healthy (being still is death).
- **Fleeing punished (correct):** kiter/random 3:33 → **2:08**, kiter/deep 4:42 →
  1:56. A fleeing bot can no longer outrun the packed wall — the intended VS
  consequence, not a difficulty bug.
- **Mandatory kick build still viable:** kiter/focus:kick 5:19 → **5:31** (6% wins);
  orbiter/focus:kick **4:03**, reaching lv 14–16.
- **The wall now forms:** orbiter peak tight **44–69** (was steady ~4 while fleeing);
  the dense-block sweep verified in-browser at ~15px gaps. No console errors; `tsc`
  + `vite build` clean; sim path stays deterministic (rng + dcos/dsin only; the
  orbiter is trig-free).

## Open dials for the feel-gate (ranked by leverage)

1. **FLOOR values** in `SPAWN_DIRECTOR` (`config.ts`) — the primary "more/less
   swarmed" knob. Currently VS-faithful-ish (~12–20 early, 44–66 mid, 84–110
   finale). A strong build clears above them, so raising the **mid-late** floors
   adds swarm pressure *only* for the players who currently feel under-swarmed,
   without punishing weak early builds. Raise these first if you want more wall.
2. **`SEPARATION_WEIGHT` 0.7** — lower packs the wall denser (risks a mushy blob at
   0); higher spreads it back toward dots.
3. **Fodder speed 209 (0.91×)** — nudge toward the player (230) for more
   "can't-escape" bite. Safe for a circling player; will kill the *fleeing* kiter
   faster (that's fine — nobody should flee).
4. **`SWEEP`** speed 860 / bandFrac 0.36 / spacingMul 2.4 — the flock's pace and
   tightness.
5. **Enemy radii** — small eye dial for "chunkier."

**Difficulty note:** the game is now meaningfully harder for weak/fleeing play
(intended, given "not swarmed enough"). Confirm the mandatory-kick build feels
*pressured but fair*, not brutal. If it's too hard, dial the mid floors (knob 1)
and/or fodder speed (knob 3) down a notch before touching anything else.
