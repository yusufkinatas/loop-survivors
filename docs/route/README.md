# The Route — Rooms + Shell + Toll

Round-1 prototype for [#267](https://github.com/yusufkinatas/loop-survivors/issues/267),
built agent-driven off [`prototype-base`](prototype-base.md) @ `3fd6d24`. Branch
`proto-route`, dev server pinned to **:3201**.

It answers one question, and the answer is allowed to be no:

> **Does assembling a build from found patterns, and being forced to give parts up
> at every gate, produce a better decision than levelling numbers?**

Every layer is a switch on the start screen, and **all five off plays the base
game through the base's own code paths** — so the control is the control, not a
neutral configuration of new code. `?route=rooms,shells` pins a configuration in a
link; `?route=off` is the base.

## What a run is

```
ROOM      a fight long enough to hear a section play out (ten phrases, ~79 s)
DOORS     the room is played out, three doors drop as pedestals — and the crowd
          from the room you just played is still on the field
CORRIDOR  the room pays out, the door charges its toll, and you arrange
ROOM      ...
```

Twelve rooms, eleven gates, and a summit whose clear ends the set. **No clock wins
a run any more** — which is where this stack breaks `docs/plan.md`'s pillar 5
outright.

### The three layers, in one line each

| | |
|---|---|
| **The Rooms** | A route of discrete rooms. Doors show the bodies behind them, what an arrangement needs to be, what the room pays, and what it costs. |
| **The Shell** | An instrument is a shell with a sound and no notes. A **pattern** is the notes, patterns are the loot, and a level buys gameplay and loudness but **no notes at all**. |
| **The Toll** | The price on a door, never a bill. Three doors, three different prices — a level, a pattern, or a whole instrument — and what you feed comes back transformed onto something you kept. |

Two more ride as A/B toggles: **One per seat** (role exclusivity, #258's Bandwagon
form) and **The Dial** (a live per-shell lever between many small hits and few huge
ones).

## The two joins that make it work

Both are read off the authored ladders rather than invented, which is why the
palette's arrangement survives the player owning it.

**A shell can play as busy as its own top rung and no busier.** `SHELL_CEILING`
is each role's stage-4 density, rounded up to a whole hit per bar. The Drone holds
one hit a bar and the Arp holds thirteen, because that is what #266 decided those
voices are. It is also the pistol test satisfied by construction: every shell can
play things the others cannot.

**Damage is compensated against the role's own authored density.**
`heft = authored density ÷ pattern density`. A shell playing a quarter of the notes
its ladder would hits four times as hard, so its damage per second at every level
is *exactly* the base game's.

That second one is the whole stack. In the shipped game a level buys chart events,
so more notes **is** more damage and the two can never move apart — which is the
structural cause `docs/baseline/` measured as a density curve that "never once
falls". Here density stops being power, so going thin costs nothing but the notes.

**Power becomes loudness instead.** A level is +0.35 dB and a weight stack (what a
toll pays back) is +1.2 dB and ×1.3 damage, capped at four stacks. So the peaks are
made of decibels rather than of notes — which is the honest currency for power in a
mix, and the only thing in this stack that makes power audible at all.

## What the numbers say

### Density falls, eleven times in twelve rooms

A twelve-room route, driven to the summit (`loop.route.report` after the run; the
driver only ever does what a player's feet and clicks do — see `route.skipRoom` in
`game.ts`):

| | `docs/baseline/` (played run) | this route |
|---|---|---|
| density at the start | 2.00 triggers/bar | 6–9 hits/bar |
| density at the peak | 23.00 | **16.0** |
| **times the density fell** | **0** | **11** |
| deepest single fall | — | **15 → 9 hits/bar**, at a gate |

Per room, as the run walked it:

| room | hits/bar (low–high) | voices playing |
|---|---|---|
| 1 | 0–9 | 0–4 |
| 2 | 9–14 | 3–5 |
| 3 | 11–16 | 4 |
| 4 | 9–16 | 3–4 |
| 5 | 9–13 | 3–5 |
| 6 | 11–13 | 4–5 |
| 7 | 9–11 | 4 |
| 8 | 8.5–10 | 4–5 |
| 9 | 8.5–10.5 | 4–5 |
| 10 | 10.5 | 5 |
| 11 | 10–11 | 4–5 |
| 12 (summit) | 10–11 | 4–5 |

The band it reached the summit with:
`shaker 4+4w · The Walk | bell 5+4w · The Drag | clap 7+4w · The Question | sub 3+4w · The Frame | flute 1 · The Hold`
— where *The Frame* is a pattern the player made at a gate by feeding one
instrument into another.

**The first half of #256's hard floor is met.** A run's density falls, repeatedly,
and every fall is at a moment the player chose: a gate they walked into knowing the
price, or a destructive pattern swap they took off a pedestal.

**And it exposes a second finding the ticket did not ask for.** Look at the table
again: the curve oscillates between 8.5 and 16 for the whole run and **the late
rooms are no denser than room 2**. The monotone is broken, but so is the arc. This
route breathes; it does not build. Whether that reads as *"peaks the player
authors"* or as *"the run never gets bigger"* is a question for ears, and it is the
single most important thing to listen for.

### The takes

Same rig, same tap, same procedure as `docs/baseline/` and
`docs/palette-control/` — sixteen bars, phrase-aligned, a full phrase played in
first, Opus at 128 kbps off the post-limiter tap. Measured with
`ffmpeg -af ebur128`.

| capture | hits/bar | voices | LUFS | **LRA** | true peak |
|---|---|---|---|---|---|
| `10-route-opening` | 6 | 2 | -13.9 | 0.6 | -1.3 |
| `11-route-early-four` | 9 | 4 | -13.3 | 0.6 | -0.8 |
| `12-route-a-peak` | 16 | 4 | -12.4 | 0.5 | -0.6 |
| `13-route-after-a-toll` | 8 | 3 | **-11.3** | 0.4 | -0.6 |
| `14-route-summit` | 9.5 | 5 | -12.2 | **1.3** | +0.5 |
| `15-route-thinnest` | 5 | 5 | -13.4 | **2.3** | +0.4 |
| `16-route-busiest` | 48 | 5 | -10.9 | 0.5 | +0.3 |
| `20-the-toll` *(moving)* | 16 → 8 → 11 → 16 | 4 → 3 → 4 → 4 | -11.1 | **2.3** | 0.0 |

**The second half of the hard floor is met, and not narrowly.** `docs/baseline/`
measured loudness range at 0.4–0.6 LU at every point and concluded "there are no
peaks at any scale"; `docs/palette-control/` measured 0.3–0.7 LU across twelve more
takes and concluded that widening the palette "did not fix the flatness, and was
never going to". Across twenty-one takes neither set ever reached 0.8. **This set
reaches 2.3 LU, three times over.**

Three things in that table matter more than the floor:

**Halving the density made the mix louder.** `13-route-after-a-toll` is the same
band as `12-route-a-peak` with one voice fed to a gate and the weight paid onto the
kick: **half the hits a bar, and 1.1 dB louder.** `docs/baseline/` found ×13.5 the
triggers buying 2.8 dB with the rest going into the limiter. Here a *reduction* buys
1.1 dB. That is #251's "removal beats addition" as a measured number rather than a
principle, and it is the clearest evidence that the density-compensation join works.

**Sparseness is where the loudness range comes from.** `15-route-thinnest` is five
voices each playing one hit a bar — the sparsest legal band — and it has the joint
widest range in the set at **2.3 LU**, off a static arrangement. Nothing is moving;
the range is simply the gap between a huge hit and the air after it. The busiest
take, at nearly ten times the density, is the loudest and the flattest: **-10.9 LUFS
at 0.5 LU.** Mud, exactly as `docs/palette-control/` found at 96 triggers a bar.

**And the moving take is what a run sounds like.** `20-the-toll` is sixteen bars
across four arrangements — the peak, the valley a gate leaves, the climb back as the
case puts notes into a shell, and the peak the weight bought — and it measures 2.3 LU
with a true peak of exactly 0.0. That is a track with a shape in it.

Listen to `audio/`, or open `docs/baseline/player.html` against this directory.

**The nine reference builds are not re-taken here, deliberately.** This branch does
not touch a single authored ladder, so `01`–`09` come back byte-identical to
`docs/palette-control/` by construction rather than by measurement — the same
argument that set made for `docs/baseline/`'s eight voices. Re-running them would
measure the encoder.

## Two things to know before you play it

Both were found by measuring, and both are left in and flagged rather than tuned
away — see the record on [#267](https://github.com/yusufkinatas/loop-survivors/issues/267).

**The toll economy runs dry from about room eight.** Weight caps at four stacks per
shell, and by the summit a driven run had four of its five shells sitting at exactly
the cap — so the late gates had no receiver left and fell back to level tolls or to
free passage. That is the same failure shape as #265's decision stream drying up at
minute fourteen, in a different currency. A constraint that stops constraining two
thirds of the way through a run is not yet a constraint.

**The compensation clamp is reachable.** `HEFT_MIN` engages when a shell plays more
than about five times its own rung — an Arp at level 2 (authored two a bar) holding
The Rush (twelve a bar) wants 0.167 and gets 0.2 — so that shell does roughly 20%
more damage per second than the authored weapon would. It is small, and it happens
to give a very dense arrangement the only *mechanical* reason to exist that this
design otherwise gives it, since everywhere else density is purely a musical choice.
An accident of a guard rail rather than a decision, so it should be decided on
purpose or not at all.

## Judged against [#253](https://github.com/yusufkinatas/loop-survivors/issues/253), item by item

The ticket asks for this explicitly. Where an item needs ears, it says so.

| #253 asks for | this stack |
|---|---|
| **peaks the player authors and pays for in advance** | **Yes, and it is the toll's whole sentence.** You give up a voice at a gate and what you kept comes back heavier and louder. Measured: the density falls at the gate and the weight buys the climb back. |
| **a job to do down in the valley that sizes the drop** | **Partial, and the weakest of the seven.** The valley is the next room played thin, which is a job — but it is the *same* job with less band, not a distinct one. #255 named The Take and The Stage as cleaner answers here and it was right. |
| **the drop hard-gated until there is something worth stripping** | **Yes, by construction.** `payersFor` refuses to silence the last playing voice or eat the last instrument, and a build too small to be charged gets a free door. You cannot drop out of a kick and a snare here because the gate will not let you. |
| **ordinary play erodes late, so the skill is picking the last safe moment** | **No. Not answered at all.** The pressure ramps with route depth; nothing about the player's own play degrades. This stack has no answer and does not pretend to. |
| **an ending that is a summit** | **Structurally yes, musically no.** The Roof is two Giants over a full crowd for sixteen phrases and clearing it is what wins. But the *arrangement* does not peak there — see the density table. The summit is a fight, not a crescendo. |
| **discovery that is musical with a combat payoff, visible on screen** | **Yes, and it is the strongest item.** A door names the pattern it pays: *"PAYS · The Rush"*. Walking into a room to go and get a specific rhythm is a different act from walking in and hoping. |
| **run two must PLAY differently, not merely sound different** | **Yes — the route itself is rolled.** See below. |

### What makes run two different

Rolled per run, not per save: **the opening three instruments**; and at every one of
eleven gates, **which three crowd shapes are behind the doors**, **what each pays**
(often a specific named pattern), and **which three of the prices are payable**. So
two runs walk a different sequence of rooms, in a different order, at different
prices, and reach the summit with a different arrangement — not a different list of
weapons with the same numbers on them.

What is *not* rolled: the route's length, where the second and fourth bars open, and
the summit. Those are the spine.

## Re-capturing

Five worktrees are live and each needs its own sink, so the port is an argument
now (`--port` was added to the shared receiver by this branch — see the ticket).

1. `npm run dev -- --port 3201`, open the game, enter the **Sandbox** and press
   **RESUME SET**.
2. `node docs/baseline/receiver.mjs --out docs/route --port 3301`
3. In the console: `window.__sink = 3301`, then paste `docs/route/capture-rig.js`.
4. `await __captureRoute(ROUTE_PLAN)` then
   `await __captureMoving('20-the-toll', TOLL_MOVE)`. Progress at `__progress`.

For a density curve, play or drive a route and read `loop.route.report` at the end
screen; `copy(loop.route.table)` is the whole curve as markdown and
`loop.route.log` is every decision in plain language.

## Where the code is

```
src/game/route/
  patterns.ts   the catalog, the ceilings, the contour rendering, heft
  build.ts      a shell: level, pattern, weight, dial — and what the band is playing
  rooms.ts      the route, sized in phrases; the crowd shapes and their pressure
  gates.ts      the doors, the three prices, and fusion
  offers.ts     what a level-up offers: an instrument, a pattern, or a level
  run.ts        one run's route state, the log, and the density curve
  sync.ts       one function that re-derives the whole band from the build
  ui.ts         the corridor: the payout, the toll, and the bench
  toggles.ts    the five layer switches
```

Three seams outside that directory, all neutral when the layers are off:

- **`MusicEngine.setVoiceChart` / `setVoiceTrim`** — play an arbitrary chart on a
  voice, and trim it in decibels on top of its calibrated mix position. A shared
  gap; see the ticket.
- **`RunWorld.enterStage` / `declareVictory`** — the wave tables were already an
  argument (#265); a route needs to hand them over again at every door, and needs
  an ending that is a place rather than a timestamp.
- **`RunWorld.perWeaponMods`** — a per-instrument stat channel. `mods` is one
  struct for the whole build, which cannot express "this shell hits four times as
  hard because it plays a quarter of the notes".
