# The Hype Layer v3 — The Tension Cycle (spec / redesign proposal)

Status: **proposed, not yet implemented or gated.** Supersedes v2
(`docs/phases/hype-layer-v2.md`, "The Conducted Grid"), which was implemented and
**rejected on playtest**. This is the output of a second three-expert design
session (a game designer, a music producer, and an interactive/generative
music-systems expert) held after the v2 playtest, over three dialogue rounds
(independent analysis → convergence → a player-timed-release refinement on the
developer's call), fully converged. It is written to be handed to an implementing
agent, but it is a design proposal awaiting the developer's go-ahead.

**Core mechanic in one line:** aggression automatically *winds* a tension bar to a
held READY plateau; the player *times the release* (one tap); the tap commits a
fixed 5-bar build→hold that lands a big half-time DROP you aim by repositioning
during the build — earned, deterministic, mobile-safe.

---

## Why v2 was rejected (the playtest verdict)

The developer played v2 and reported, verbatim in essence:
- The drop doesn't feel satisfying — **it plays similarly to the peak, so there's
  no difference when it drops.**
- Going back to peak after the drop doesn't feel different either.
- The meter **starts at peak** — a fresh run with one kick is immediately at peak,
  which felt wrong.
- **In a survivors-like you're always swarmed, so assuming you go back to "chill"
  feels weird.**
- The underlying idea is interesting (aggressive play heats up the music, you
  build up, hit a peak, then drop) but the gameplay doesn't feel like that — it's
  weird, hard to understand, and dull.

### Root cause (agreed by all three experts)

Two compounding structural errors:

1. **v2 could only make the same performance louder/quieter/brighter — it could
   never make the band PLAY something different.** Every voice has one fixed
   pattern; the only tool was a filter over it. So the "drop" = the same patterns,
   a little louder. You cannot drop from full to full. A real drop is a
   **transformation**, not a volume boost.
2. **v2 tied arrangement fullness AND tension to one fader, driven by "how
   swarmed am I."** In a survivors-like the player is *by design* increasingly
   swarmed, so that signal pins near max and never moves — recreating the exact
   static-wall problem the feature was meant to solve. And because fullness was on
   that fader, one kick at low threat still resolved to "Full" → the cold-start
   bug. "Going back to chill feels weird" because **there is no chill in a horde
   game.**

---

## The v3 design: The Tension Cycle

Two structural moves fix everything above.

### Move 1 — split into TWO independent axes (v2 wrongly merged them)

- **MACRO — fullness (slow, one-way, "I built a track").** How much of the band
  plays and how dense the groove is = a function of **build size and stage
  minute**, NOT of threat. One kick = one sparse voice; each pick adds a voice;
  the groove thickens across the 8 minutes. This is the M2 arc, restored and taken
  off the tension axis. **This fixes the cold start at the root** (you start
  minimal because your build is minimal) and carries the "my track fills out"
  feeling. It never resets.
- **MICRO — the tension cycle (fast, cyclic, the thing that breathes).** A
  **saw-tooth**: cruise in a groove → wind up → drop → settle → cruise again,
  repeating. The contrast comes from the **reset after each drop**, not from ever
  being calm. This is what breathes minute-to-minute even though raw danger only
  ever climbs.

The two multiply: MACRO sets the ceiling/baseline fullness ("a big build sounds
full even when calm"), MICRO rides the saw-tooth within it ("cresting thickens it
further, the drop transforms it").

### Move 2 — the drop is a TRANSFORMATION (emptier, lower, heavier), not "fuller"

The single most important correction: **a drop is usually emptier than the build
before it — fewer things play, but each is enormous and sits lower.** The build is
busy, bright, rising; the drop is spacious, heavy, grounded. The contrast is the
whole payoff. Three universal ingredients + a per-genre feel-shift (below).

---

## What drives it: automatic winding, player-timed RELEASE (the skill)

The control surface is split, and this split is the whole skill layer:

- **WINDING is automatic** — tension is wound only by **how aggressively the player
  fights**, sampled from sim state. The player can NEVER manually pump the bar (that
  was v1's fatal free lever). Inputs:
  - **Kill momentum / combo** — kills in a rolling window build tension; a gap bleeds it.
  - **Diving into packs** — kills scored *inside* dense clusters (proximity-weighted)
    wind faster than picking off edge stragglers. Rewards commitment.
  - **Damage taken bleeds it** — getting hit drains tension (you overreached).
- **RELEASE is player-timed** — the player's ONE input (a single tap: HUD button or
  double-tap, one-handed on mobile) commits the drop. That is the entire control
  surface: aggression fills it, one tap releases it.

> This reverses an earlier "fully automatic" proposal, on the developer's direct
> call. His point: with no release control, a drop that fires itself on an empty
> screen is wasted, and there's no skill in *aiming* it. The skill he wants is
> **"handle your bar"** — keep it hot, position onto the target (e.g. save it for a
> boss amid a swarm), and release at the right moment. His earlier "arming was
> confusing / added no feel" was true of *broken* v2 (the drop sounded like the
> peak); now the drop is a real transformation with an obvious target to aim at, so
> the tap has genuine purpose.

### The ready-and-hold model (the bar the player handles)

- **Winding (below ready):** aggression fills the bar; it bleeds slowly when you
  stop being aggressive. The Pillar-3 ambient trickle (below) still carries a
  passive player to ready over ~90s.
- **READY (held):** the bar reaches the top and **holds** — it does NOT fire itself.
  This is the key change that turns "automatic" into "held at the top, waiting for
  you." But it's **not bankable forever**: go passive and it bleeds back below
  ready after ~8s, so you can't wind it early and sit on it for minutes — you
  re-earn being hot near the moment you want it.
- **Overcharge (past ready):** continued aggression pushes into an overcharge band
  that **scales the drop's SIZE** (bigger area, heavier). Overcharge **decays fast
  (~3–4s)**, so to land the *big* drop you must be aggressively engaged — deep in
  danger — right up to the moment you commit. You strike while hot or lose the
  bonus. That fear-of-decay is what makes overcharge a real decision, not a free
  upgrade. **Overcharge scales size, never flight time (below).**

**Reset floor:** after a drop, tension resets to a groove floor (~0.2–0.3, rising
with the macro axis) so the next climb has momentum and there's no dead air. This
plus the rebuild time is a natural ~20–40s cooldown between drops (faster late).

### The 5-bar flight time (aiming a mortar, not a pistol)

A drop only lands if a BUILD + HOLD precedes it (a drop with no build in front is
just the peak louder — the v2 failure). So **the release tap can never fire an
instant drop.** The tap commits → BUILD (4 bars) → HOLD (1 bar) → DROP lands on the
downbeat **~5 bars later.** This delay is the *product*, not overhead: you commit
early and **reposition during the build** so you're on the boss/pack when the drop
lands. Mis-time it and the fiction punishes you (boss out of range = wasted; too
late = the boss is on you during the vulnerable hold) — no penalty screen needed.

**The flight time is FIXED and constant (music producer's firm steer):** the aiming
skill depends on the arc being learnable ("tap now → hits in 5 bars", like a
mortar). **Overcharge scales the drop's size, not its timing.** You always know
*when* it lands; how *big* is what your aggression earned. (An optional explicit
2+1-bar "express" smaller drop is a possible skill-ceiling addition, flagged as a
second arc to master — not the default.)

### What the player HEARS (so the bar is handled by ear, not just a meter)

- **Winding:** the groove gradually and continuously intensifies as you play hard
  (density up, brighter, register lifts) — the track audibly heats up.
- **READY (held):** the groove reaches a **coiled-but-stable plateau** and *hovers*
  — a held unresolved chord that wants to resolve, a faint high pre-riser shimmer,
  insistent hats. It reads as "loaded, sustainable, hanging." You can sit here.
- **Overcharge held:** the plateau turns **strained** — more dissonance, an unstable
  wavering shimmer, a low rumble building — it audibly *can't be held forever*, which
  is the sound of the gameplay risk (release it or it blows in your hands).
- **Committed (after the tap):** the sound stops hovering and starts **traveling** —
  the riser climbs, an **accelerating roll** speeds up bar by bar (a built-in
  "lands in N bars" countdown you feel), filter opening. Ready = hovering/coiled;
  committed = accelerating/pointed. You can't mistake one for the other.

**"Danger rising speeds the cycle up" (the survivors reconciliation):** two
emergent mechanisms, no separate timer — (a) more enemies late = more kills = faster
winding; (b) the rising reset floor means late-game climbs start higher and crest
sooner. So drops get **more frequent and bigger exactly as the horde escalates**,
matching the spawn director's finale (near-continuous climax at the end).

**Pillar-3 floor (the anti-flatline guarantee).** The player controls the *timing
within a window*, not *whether* a drop ever happens. Two deterministic auto-fire
safeties keep the track breathing no matter how someone plays:
- **Held-timeout auto-fire:** a bar held at READY without release for ~16 bars (one
  section) fires on its own — un-aimed, so slightly wasted, which gently teaches
  the player to release deliberately.
- **Overcharge-ceiling auto-fire:** the bar can't exceed the overcharge cap; pinned
  there, the spring lets go (tension must resolve — musically correct).
A passive/defensive player still gets the ambient trickle to ready (~90s) then the
held-timeout, so the track drops on a slow cadence regardless. Both auto-fires are
pure functions of bar count + tension (deterministic).

**Cold start:** minimal build (one voice) at the tension floor; groove has
headroom; never starts at peak.

---

## The arc: bar-by-bar (what the player hears), and what it costs in combat

At 8-bar phrases, the committed sequence after the **release** is **BUILD 4 → HOLD
1 → DROP 8 → RELEASE 4** (17 bars, ~2 phrases). The **climb (GROOVE→READY) is
variable** and player-driven; the player's release tap commits the fixed sequence
(so the drop is one you *hear coming* — the 4-bar build is the audible countdown).

| Phase | Bars | What you hear | Combat (Model A) |
|---|---|---|---|
| **GROOVE (winding)** | variable | Your current band cruising, with **headroom** (not maxed). As aggression rises it **gradually thickens/brightens** — density, velocity, a creeping hat ratchet. This is the "heats up as you play harder." | Baseline clear power ~1.0×; rises ~1.0→1.2× as it thickens. |
| **READY (held)** | held | The groove hovers at a **coiled, stable plateau** — held unresolved chord, high shimmer. Sits here until you release (or the auto-fire safety). Overcharge held = audibly *strained*. | ~1.2× held; no combat change until committed. |
| **BUILD** | 4 | An accelerating roll (snare/hat subdivision doubling per bar), a rising riser sweep, a held tense chord, filter opening. The audible telegraph. | Ramps ~1.2→1.5× (the roll adds hits). |
| **HOLD** | 1 | Everything cuts but the riser screaming at the top. The floor drops away — the intake of breath. | Kick silenced → **a real ~1-bar vulnerability** (the cost of the payoff). Floored: short (~1–2s), and the utility voices stay active (below). |
| **DROP** | 8 | **The transformation.** Emptier, lower, heavier: sub-bass arrives, kick becomes a few huge thuds, clutter voices drop out, a simple heavy hook. Per-genre feel-shift (below). The payoff you live in for 8 bars. | Trigger rate ~halved BUT per-hit damage ~3–4× **and area ~1.5–2×** → **guaranteed net ~1.5–2× clear power, sustained.** See "the damage dip" below. |
| **RELEASE** | 4 | Deliberately **thinned** (sparser than groove) so the ear feels the drop END — contrast on both edges — then refills back to groove. The overdrive tapers across it (an exhale, not a power-cut). | Decays ~1.5×→1.0×. |

**Self-solving elegance:** the drop's huge area *clears the pack*, so the RELEASE
refills into the space the drop just made — the comedown is safe *because you just
nuked everything*. The tactical loop and the musical arc are the same arc.

### The drop's signature is per-genre (half-time is NOT universal)

Every drop shares three ingredients — **register drop** (sub-bass arrives),
**space** (clutter voices clear out), and a **feel-shift**. The feel-shift differs:

- **Lo-Fi (84):** half-time, gentle — a fat slow boom-bap, warm sub, dusty filter
  bloom (a *bloom*, not a slam; tape-stop into it).
- **House (124):** **NOT half-time** — keep the four-on-the-floor kick pounding,
  strip the hats, a big pumping bassline arrives into cleared space (bass weight +
  air).
- **Synthwave (100):** half-time, cinematic — big gated-reverb snare, fat saw sub,
  slow anthem hook.
- **Hip-Hop (140, already halftime):** the exception — can't half-time what's
  already halftime. Go **lower and heavier**: the 808 sub slams and slides in, hats
  erupt into fast rolling detail *on top* (weight underneath + skitter on top).
- **DnB (174):** half-time, the classic heavy drop — the rolling breakbeat
  collapses to a massive half-time thud (~feels like 87), Reese/sub growls in huge.
- **Techno (130):** **NOT half-time** — relentless kick never breaks; a huge
  rumbling sub + hypnotic stab, filter slams wide, everything else strips to a
  tunnel (a *peak*, not a break).

So half-time is the signature for **Lo-Fi, Synthwave, DnB**; **House/Techno** stay
full-time + massive bass into cleared space; **Hip-Hop** goes 808 + double-time hat
detail. Implemented as a per-genre `dropMove` descriptor (half-time is the default;
these genres override).

### The half-time damage dip — the drop MUST be a guaranteed net power spike

Half-time = fewer triggers/sec, so naïvely the drop would be a DPS *dip* exactly
when the player expects a spike — which would fail worse than v2. The fix (a hard
tuning floor, not a preference):

- **Area carries it, not just per-hit.** Half-time gives few, huge, simple hits; in
  a dense swarm **one enormous-radius slam clears far more than many small hits**.
  The drop's identity is *fewer, bigger, screen-sweeping* — which is both the power
  fantasy and the fix.
- **The overdrive is weighted toward the drop-ACTIVE voices**, not a flat global
  multiplier (the silenced voices deal no damage in the drop, so the active ones
  must cover for them and beat the trigger-count loss). The huge kick you *hear* is
  the big AoE hit you *deal* — sound spike and damage spike are the same event
  (Model A working for us).
- **Bias the drop-active set toward wide-area weapons** where the build has them
  (kick aura, bass wave, crash shockwave) so the audible slam and the visible
  screen-clear coincide. Single-target-only builds still drop (the overdrive gives
  even one voice a burst).
- **Target:** net effective clear power ~1.5–2× groove across the whole 8-bar drop.
  Verified on the bot floor-check, not guessed.

---

## Engine architecture (the systems plan)

The whole redesign hangs off **one existing seam**: `chartEventsAtStep(chart,
phraseStep)` in `src/audio/arranger.ts`, the single function both trigger sources
already read — the live audio `engine.ts` `onStep` (~:290) and the headless/replay
`conductor.ts` `onStep` (~:123). Both already have the `phraseStep % STEPS_PER_BAR
=== 0` bar-boundary hook. Putting the morph here is the only way it stays
bit-identical across sound and sim.

### New primitives to build

1. **`VoiceProgram`** — promote `Chart` to `{ base: Chart, drop?: Chart, hook?:
   Chart, transforms: TransformSpec }`. Today's ~576 charts become `base` with no
   migration (they are the GROOVE baseline; zero new baseline content).
2. **`programEventsAtStep(program, phraseStep, ctx)`** — the two-axis arranger,
   wrapping and preserving `chartEventsAtStep`. `ctx = { macro:{grooveDensity},
   arr:{section,tension,sectionBar}, bar, seed, genre }`. Order of operations per
   voice/step:
   1. **Select section part:** GROOVE/BUILD → `base`; DROP → `drop` if authored else
      derived; HOLD → the voice's hold rule (most emit nothing; Pulse silenced; the
      riser voice fires its sweep).
   2. **Effective density = the two axes multiplied:** `keepProb = grooveDensity *
      tensionCurve(tension)`. Macro sets ceiling/baseline; micro rides within it. A
      small build cresting stays sparse → its drop is proportionally smaller (the
      drop's size is *earned by the build*).
   3. **Apply tension transforms:** gate by keepProb (`hash(bar,step,seed) <
      keepProb`), ratchet (BUILD only, subdivision `2^min(sectionBar,cap)`), velocity
      scale.
   4. **Apply the half-time flip** if `section === DROP`, unless `genre.dropMove`
      overrides.
   5. **Emit.** Model A carries the rest: fired events *are* the damage stream.
3. **`advanceArrangementState(world, bar)`** — the state machine
   `GROOVE(winding) → GROOVE(READY, held) → BUILD → HOLD → DROP → RELEASE → GROOVE`
   in its own module (`src/audio/arrangement.ts`). Pure, seeded, **idempotent per
   bar** (guards on `world.arrangement.lastBar` so the audio clock reaching a bar
   ~0.12s before the sim is harmless). Called from the bar-boundary block in **both**
   `onStep`s. Reads only deterministic sim fields (incl. the queued release
   decision); writes plain data to `world.arrangement = {section, subState, tension,
   sectionBar, readyBars, releaseQueued, lastBar}`.
   - **READY→BUILD** is triggered by `releaseQueued` (set by the player tap live, or
     the bot's `DropPolicy` in headless) committed at the bar boundary — exactly the
     "queue a decision, apply at the next bar" rail the pick system already uses.
   - **Auto-fire safety** (pure bar math, deterministic): `readyBars >=
     MAX_HELD_BARS` forces the transition; overcharge is capped at
     `OVERCHARGE_MAX(readyBars)` and pins→fires at the ceiling. Guarantees the cycle
     never stalls if no release ever comes (Pillar 3).
4. **The tension sampler** — an aggression accumulator on `RunWorld`, updated in
   `world.update` from pure sim events (kill momentum + kills-inside-dense-packs −
   damage-taken bleed), sampled per bar into `world.arrangement.tension`. Eased
   toward its target over K bars (`tension += (target−tension)/K`, bar-quantized) so
   the morph is **gradual**, not a snap.
5. **The riser sweep kit** — a single scheduled pitch/filter-ramped noise event over
   the build's bar count (replaces v2's master-filter sweep, which was v1's mistake).
6. **Half-time transform + `genre.dropMove` hook** — half-time is a *pattern* (fire
   on fewer, bigger steps and let sounds ring: keep events where `step % 8 === 0`,
   snap, boost velocity, `note -= 12` on bass, don't choke), not a grid/tempo change.
7. **The release input + `DropPolicy`** — `world.arrangement.releaseQueued`, set live
   by the player tap (via `atNextBar`) or in headless by a seeded `DropPolicy` in
   `policies.ts`; the READY/held sub-state + `readyBars` + overcharge cap + auto-fire
   in `advanceArrangementState`. This is the round-5 player-timed-release layer.

### The gradual morph (the developer's explicit ask)

Continuous *within* GROOVE/BUILD, snapping only at section edges. Rising aggression
continuously raises keepProb (more of the base chart survives → groove thickens),
velocity (harder hits = more damage), and a mild hat ratchet — so the track audibly
heats up as you play harder, *before* any drop. Section **swaps** (into HOLD, the
DROP downbeat, the RELEASE thinning) snap to the downbeat, because a drop that lands
off-grid feels broken. Continuous where it breathes, quantized where it must land.

### Determinism (cleaner than v2)

The arrangement is now first-class sim state, so it replays like any other sim
state. **The player-timed release rides the exact rail picks already use:** a
decision, quantized to the next bar, that the bot issues via a seeded policy and a
replay reproduces from seed — picks are not logged per-decision, they re-run the
same seeded `PickChooser` over the same deterministic world, and the release works
identically.
- **Live:** a player tap sets `world.arrangement.releaseQueued`; it commits on the
  next audio bar (via `engine.atNextBar`, the pick-landing rail). Judged by ear, not
  required to be bit-identical to anything.
- **Bot batch:** a **`DropPolicy`** (pure fn of world state + seeded rng, in
  `policies.ts` beside the pick policies) is consulted each bar while in READY and
  sets `releaseQueued`. Seeded + pure → batch runs deterministic.
- **Replay:** same `VirtualConductor`, same seed, same `DropPolicy` → the release
  fires on identical bars → bit-identical to its batch run. **No per-decision
  logging needed** (same as picks today).

No wall-clock, no `Math.random()` in the arranger; all per-bar variation is
`hash(bar, seed)`; winding, auto-fire, and overcharge cap are pure bar/sim math.
**One latent risk (dormant, not active):** bit-replaying an *arbitrary human*
session (ghosts / leaderboard verification) would need the human's release bars
recorded into the replay stream, since they aren't reproducible from seed — but the
project today only replays *bot* runs (seed + mover + policy), so this is dormant.
Cheap mitigation when needed: log the committed release bar index and feed it back
through a pass-through policy. Build the `releaseQueued` field now with that seam in
mind; don't build the human-session recorder until a feature needs it.

**Bot `DropPolicy` variants** (A/B like the pick policies): *release-optimal*
(default — release when ready AND enough enemies/a boss sit in the drop's AoE
footprint, else hold for overcharge toward the cap), *release-ASAP* (floor for "no
timing skill"), *never* (floor for "ignores the mechanic, relies on auto-fire"). The
spread between them is the balance signal for how much release timing matters
("floors not peaks").

**Bot re-baseline is mandatory:** arrangement now moves the damage stream, so every
reference batch shifts (same discipline as the M2 frame-rate change). The balance
target must be re-expressed as **per-cycle average DPS + a measured drop-peak**, and
spawn pressure re-checked against the *mean* (not the peak → too easy; not the
trough → unfair). The bot must also assert a **minimum-DPS floor during HOLD+DROP**
so a player is never overrun *by the music* during their reward.

### Content cost (finite)

- GROOVE: reuse all ~576 existing charts as `base`. **Zero new baseline content.**
- BUILD, HOLD, RELEASE: **100% procedural** (ratchet, gate, riser, silence,
  thinning). No per-voice/per-genre authoring beyond a few constants.
- DROP: **derived for rhythm slots** (kick→few big thuds via thinning/half-time,
  hats→drop out or double-time, snare→gated slam). **Authored by exception:** ~6
  melodic **hooks** (one per genre, tier-scaled from one written hook) + **~3 bass
  drop riffs** for the genres where the bass *is* a riff (House pumping bassline,
  DnB Reese, Hip-Hop 808). Harmony derives fine (hold the root chord).
- Plus: one riser sweep kit, a slam accent, a sub-bass tone, six `dropMove`
  descriptors, and the transform constants.
- **Total new authored surface: ~9 musical parts + a small shared kit** — a
  weekend of authoring + tuning, not a re-authoring of the catalog.

---

## What v3 keeps from the v2 implementation

Not everything is thrown away. Reusable from the shipped v2:
- The **per-voice lowpass filter** + `setVoiceCutoff` (now a secondary garnish for
  brightness, not the primary tool).
- The **bar-boundary callback** (`addBarListener`) — the phrase-clock plumbing.
- The **HUD scaffolding** (the panel, the meter) — repurposed to show the tension
  cycle + an incoming-drop telegraph (vibe words, Pillar 2).
- `hypeDamageMul` / `hypeAreaMul` on `RunWorld` — now driven by
  `advanceArrangementState` during the DROP (and they move on BOTH paths now, so
  they are deterministic sim state, not live-only).

What's removed: the intensity→3-tiers-by-threat model, the "filter one fixed
pattern up/down" as the whole mechanic, the player arm tap, and the cold-start-at-
peak.

---

## Proposed build sub-phases (each ends at a developer gate)

Ordered so the musical win is judged before combat coupling, and cheapest-first.

### Sub-phase A — the transformation, on one genre, no combat coupling yet
Build `VoiceProgram`, `programEventsAtStep`, `advanceArrangementState`, the tension
sampler, the riser kit, and half-time — for **one genre** (House or DnB). Drive the
cycle off a **debug/scripted tension** (not yet real aggression) so the developer
judges the *sound* of GROOVE→BUILD→HOLD→DROP→RELEASE in isolation. No overdrive yet.
**Gate A:** does the drop now sound genuinely DIFFERENT from the groove/build — does
it land? Is the build→hold→drop→release arc satisfying by ear?

### Sub-phase B — the aggression cycle + player-timed release + combat coupling
Wire real aggression (kill momentum + dive + damage bleed) as the winding driver,
the READY/held plateau, the **player release tap** (+ overcharge, auto-fire
safeties), the reset floor, and the DROP overdrive (area-weighted, drop-active
voices). Add the bot `DropPolicy` (release-optimal/ASAP/never) and re-baseline the
bot against the new floors. **Gate B:** does playing aggressively audibly and
legibly heat the track toward a READY plateau you can *hear*; does releasing feel
like aiming a mortar (commit, reposition, land it on the boss/pack); does the drop
feel like an earned screen-clear power spike (net stronger, not weaker); is the
HOLD vulnerability tense not lethal; is "handling your bar" (hold hot, overcharge,
pick the moment) a rewarding skill; does it read one-handed on mobile?

### Sub-phase C — all six genres + polish
Author the ~9 drop parts, the six `dropMove` descriptors, per-genre transform
constants; the HUD telegraph; the optional overcharge (cosmetic + damage only, if
wanted). **Gate C:** does every genre's drop sound like itself and land; does the
full run read as an evolving track with a real energy curve.

## Verdict protocol
The developer's ear/hands is the whole gate (project doctrine). **Pass** = the run
now has a legible, satisfying tension→build→drop→release cycle where the drop lands
as a distinct, earned power spike, the track breathes minute-to-minute without ever
needing a "chill" state, and it's understandable while playing. **Fail** loops
within the sub-phase the failure points to.

---

## Open tuning items flagged for the gates (not resolved on paper)

1. **The automatic HOLD gap at high danger.** A fully automatic cycle imposes a
   ~1-bar kick-cut every crest, and danger shortens the cycle, so the most-swarmed
   moments get the most frequent guaranteed defensive gaps — possibly punishing when
   the player can least absorb it. Validate on the bot's Kiter at high stage-minute;
   if unfair, the lever is to **soften the HOLD (thin the kick rather than cut it)**
   at high danger — the transform layer already supports it.
2. **Whether the drop stays honestly empty** (the dip recovered purely by big
   per-hit/area values) or **keeps one fast utility voice alive** to hold a damage
   floor. Bot-tuned call; lean toward honestly empty (the dip is the point;
   overdrive + area reward it).
3. Exact numbers: aggression formula weights, reset floor, crest threshold, the
   K-bar tension easing, overdrive magnitudes and per-genre `dropMove` details —
   ear- and bot-tuned constants.
4. Overcharge is now **core** (it scales the drop's size and is the reason to stay
   hot before releasing), not a parked cosmetic. Tune: the overcharge band range,
   its fast decay (~3–4s), and the READY-bleed (~8s) so "hold it hot" is a live
   tension, not a bank.
5. The held-timeout (~16 bars) and the ambient trickle-to-ready (~90s) — the Pillar-3
   auto-fire cadence for passive play.
6. Optional **express drop** (2+1-bar shorter arc, smaller drop) as a skill-ceiling
   second timing to master — flagged, not default (the music producer steers against
   variable flight time as the norm because it muddies the aiming skill).
