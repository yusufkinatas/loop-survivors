# The Hype Layer v2 — The Conducted Grid (spec)

Status: **implemented (core, all sub-phases A+B), awaiting the developer's
ear/hands gate.** Supersedes the v1 prototype (`docs/phases/hype-layer.md`),
which the developer rejected. This spec is the output of a two-expert design
session (a game-design lens and a music-production lens) that converged on one
mechanic. The core system is built on branch `worktree-agent-ab937d650700e2226`
(see the "Implementation notes" section at the end). Two design refinements were
made during implementation and are recorded inline below (marked
**[impl]**); the remaining per-genre tuning (spec sub-phase C) is not yet done.

---

## The problem (unchanged from v1)

A run only ever ADDS instruments. Once the 8-slot band fills, every voice plays
on every loop for the rest of the run. The arrangement pins at full density and
never breathes. Real tracks live on dynamics — intros, builds, breakdowns, drops,
quiet passages, big returns. A static full arrangement for 8 minutes stops
sounding like a track and becomes a wall of sound.

**Goal:** make the run sound like a real, evolving track, while the gameplay
stays genuinely fun and Pillar 3 (good muted) holds.

## Why v1 was rejected (diagnosis, so v2 doesn't repeat it)

1. **It was a dominant strategy with a fake cost.** Holding the CROWD meter at
   max gave +50% damage / +60% XP against a "risk" of +damage-taken. But in a
   survivors-like the player is *already* trying not to get touched, so the
   downside was invisible during good play and irrelevant during bad play. The
   optimal line was "always max," so it became a free +50% damage lever. There
   was never a game state where letting it fall was the right move.
2. **The reward was a scalar, so it couldn't express music.** Damage/XP
   multipliers scale a thing; they don't change its *shape*. Musical dynamics are
   structural (which voices, which register, density, tension/release), not a
   volume knob. Bolting a scalar economy onto a structural problem is why "it
   doesn't do anything meaningful to the music."
3. **The input fought the genre and the platform.** Beat-accurate SPACE tapping
   demands a dedicated timing channel while the player's hands and eyes are
   already busy kiting a horde; under pressure they drop the tapping. And on
   mobile (a required platform) the tap channel doesn't exist — one thumb is the
   joystick. v1's core verb was desktop-only.
4. **It changed off the grid.** A drifting meter moved arrangement state at
   random, unpredictable moments that never lined up with a bar. A drop only
   lands if you can *feel it coming* and if there was an empty bar *before* it to
   contrast against. v1 sat pinned at max, so there was no empty bar and no
   anticipation.
5. **It lived in a meta-layer.** The band system already decided the build IS
   the arrangement. v1 added a second controller on top, competing with Model A
   instead of expressing it.

---

## The v2 design: The Conducted Grid

**One rule governs everything: the phrase clock owns WHEN arrangement is allowed
to change; combat intensity and the player's Drop own WHICH state it changes
into. Nothing about the arrangement ever changes except on a clock boundary.**

That single split dissolves the v1 problems: energy is no longer a lever the
player holds (it can't be farmed for a free bonus), it moves at musical time (not
per-frame), it drives *structure* not a scalar, it needs no rhythm input, and
every change lands on a bar so it always sounds timed.

There are two layers on one shared bar clock.

### Layer 1 — the Auto-Arranger (always on, no input, safe)

Runs continuously on an **8-bar phrase clock**. At each phrase boundary it reads
the smoothed combat **Intensity** (see below), maps it through a per-genre table
to one of **three nested arrangement tiers**, and if the target tier differs from
the current one, schedules the transition to complete on the next downbeat.
Between boundaries, nothing changes.

The three tiers are strictly nested (Full ⊃ Groove ⊃ Breakdown), so lower tier =
fewer active voices = less damage, always — this monotonicity is a hard
invariant. Default slot membership:

- **Breakdown (low):** Pulse (Beat) + Bass (Low) + one color voice (Harmony or
  Melody), that color voice filtered dark. Foundation only, spacious.
- **Groove (mid):** add Backbeat (Snap) + Hats (Tick) + Motion (Groove). The
  workhorse body of the track.
- **Full (high):** add Melody (Hook) + FX. Everything, brightest, widest.

**Crucial safety property:** the Auto-Arranger uses only the *safe* palette — it
NEVER fully silences a damage voice. A voice that leaves a tier is expressed by
**filtering it down to a distant whisper and/or halving its density on the
subdivision voices (Tick/Motion), not by hard-cutting it to zero.** So the
automatic "breakdown" is a filtered, thinned groove: a real musical dip at
near-zero damage cost and zero fairness risk. This is the whole track breathing
for 8 minutes with no input and no ambush. (This was originally the music
expert's *fallback*; both experts agreed to promote it to the baseline. The one
move that creates a real damage hole is reserved for the player — Layer 2.)

Which specific voice a tier filters/thins is chosen by a **fixed rotation keyed
to the section index** (the Nth 32-bar block of the run: section 1 thins hats,
section 2 thins harmony, section 3 the low mids, then repeat). Bit-identical on
replay, but a different flavor each cycle, so the same tier never sounds
identical twice running. This is "variety without randomness."

### Layer 2 — the Drop (player-committed, the crux)

The single high-cost move — stripping the band to near-nothing to set up a big
return — happens **only** when the player arms it. This is the good version of
v1's SPACE: a committed, telegraphed, earned choice, not a meter held at max.

- **Charge:** a Drop meter fills from landing hits / surviving pressure (~30–45s
  of active play to fill). It fills **~2× faster while Intensity is low** (the
  player disengaged and went quiet). Charging decays if the player lands no kill
  for ~8s, so *farming* quiet is not a strategy — you must actually dip in and
  out.
- **Input (mobile-safe):** one tap on a HUD button (SPACE on desktop). No timing
  precision — the grid quantizes it for you. The tap **arms** the Drop; it takes
  effect on the next **bar** boundary. Pressing does NOT slam the band in
  immediately (that would be v1's full-with-no-contrast mistake).
  **[impl]** The spec originally said "next phrase boundary," but a strict phrase
  start means up to ~15–20s of dead air between the tap and anything happening,
  which reads as an unresponsive control. Implemented behavior: the Drop quantizes
  to the next **bar** (≤ one bar of latency), and the anticipation the design
  needs comes from the build phase, not from waiting. The slam still lands on a
  bar downbeat. Design rule 1's "changes only on a phrase boundary" is therefore
  scoped to the **auto-arranger's tier changes** (which must not get nervous); the
  player-initiated Drop is a deliberate punctuation and quantizes to the bar.
- **[impl] Arming requires a strippable voice.** The Drop's cost is the exposure
  of the strip. A band that owns only foundation (Beat/Low) and/or utility
  (freeze/dash) voices has nothing to strip, so a Drop there would be a free
  overdrive with no cost — the DROP button stays unavailable until the band owns
  at least one non-foundation, non-utility voice.
- **[impl] Charge decays when disengaged.** If you land no kill for ~8s the meter
  bleeds (not just stops), so flatline-fleeing or parking in an empty corner can
  never earn a Drop — you have to actually fight and dip in and out.
- **The armed phrase (spelled out at an 8-bar phrase, four-on-the-floor genre):**
  - **Bars 1–2 — the strip.** The band drops to foundation-or-below; in a
    full-commit drop even the kick thins or cuts. Suddenly quiet and exposed.
    *This is the exposure window: fewer voices firing = less damage. It is the
    cost, and it is short. The player chose it, so it can never be an ambush.*
  - **Bars 3–6 — the build.** An FX riser climbs, a filter opens across a held
    pad, a roll accelerates. Tension winds up and the player can *hear* the
    release coming (anticipation, now inside a 4-bar window instead of a fixed
    32-bar script).
  - **Bar 7 into bar 8 — the impact + slam.** On the downbeat an impact lands
    and **every voice in the build slams in at once, wider and harder than
    baseline**, riding a **~2-bar overdrive window (+~40% area/damage, all
    stripped voices restored to full)**. This is the payoff: because every
    weapon is now firing (Model A), the whole build unloads together as a real
    damage spike — not an abstract multiplier — and it lands because the empty
    bars 1–2 created the contrast. Bar 8 runs a fill into the next phrase, then
    spends the charge and returns to Layer 1.

The player naturally times the arm so the slam's overdrive downbeat lands on an
incoming threat the stage telegraphs (a ring, an elite, a boss verse). That
"clash of peaks" — you expose yourself, wind the spring, then detonate exactly as
the wave arrives — is the core skill expression and the "have you tried a hip-hop
build, the drop is insane" moment.

### The player's moment-to-moment loop

1. Kiting — the Auto-Arranger breathes the track gently, no combat cost, no
   input.
2. You clear space → Intensity falls → the track thins naturally *and* your Drop
   charges faster.
3. The stage telegraphs an incoming ring/elite/boss.
4. You tap to **arm** → 1–2 exposed strip bars (real risk: your low-end damage is
   a whisper, so you'd better have made room) → a riser winds up → **DROP:** full
   band slams + a ~2-bar overdrive shreds the wave.
5. Spent → back to auto-breathing → recharge.

Ignore the Drop entirely and the track still breathes via Layer 1 and the game is
fully playable — Pillar 3 stays intact and the Drop is a pure accent.

---

## How this maps to combat intensity (the derived spine)

**Intensity** is a 0–1 value derived from game state — never a lever, never a
reward by itself. It only decides which tier the Auto-Arranger targets. Inputs
(all already in the deterministic sim):

- **Threat proximity** — a weighted count of enemies within ~250px, normalized
  against local density.
- **Kill flux** — damage-events-per-bar the build is actually landing (free:
  Model A makes every trigger a countable event).
- **Recent damage taken** — a brief spike on the "oh no" moment.

Smoothed heavily (roughly a 2–4 bar rise, 4–8 bar fall) so it moves at musical
time. Because Intensity is *read* at the boundary, not *pumped*, "always max" is
impossible by construction: you're at Full tier *because you're swarmed* (which is
dangerous), not because you chose a bonus. The energy curve becomes a faithful
readout of the fight — and the fight already rises and falls (the spawn director
has breather beats at ~94s/167s/287s and escalating rings/elites), so the track's
macro-shape already matches an intended 8-minute arc for free.

Intensity selects a **whole pre-composed tier**, and never gates individual
voices directly. (Direct per-voice gating makes voices flicker on and off as the
threat count wobbles across a threshold — that sounds broken, not dynamic. A
producer changes the whole scene to the next designed state, not one instrument.)

---

## The design rules that came out of reconciliation

1. **Clock owns WHEN, fight + player own WHICH.** Arrangement changes only on an
   8-bar phrase boundary. This is non-negotiable and is also the minimum-dwell
   guarantee — a state physically cannot change more than once per 8 bars because
   that is the only moment the machine looks.
2. **The Auto-Arranger never fully silences a damage voice.** It filters/thins.
   The only full strip is the player-armed Drop, which is telegraphed and
   overdrive-rewarded, so a real damage hole is always player-chosen and never an
   ambush.
3. **Intensity picks a pre-composed tier, never gates individual voices.** Three
   nested tiers ship (Breakdown / Groove / Full). Within a tier, the section
   index picks among 2–3 deterministic variants for flavor.
4. **Tiers are strictly nested** (Full ⊃ Groove ⊃ Breakdown): lower tier = fewer
   active voices = less damage, monotonically, in every genre.
5. **The arranger and the spawn director share only the master bar clock for
   quantization — not a schedule.** The Auto-Arranger creates no damage hole, so
   it needs no negotiation with surges. The Drop is self-synced by player intent:
   the player arms it so the overdrive downbeat lands on a telegraphed wave.
6. **Utility effects stay combat-active in every arrangement state.** The
   freeze (Ride) and auto-dash (Riser) carry real defensive gameplay even at
   token damage. The arranger may filter their *timbre* but must NEVER gate them
   out of firing — removing crowd control during an exposed breakdown is exactly
   the unfair hole v2 is built to avoid.
7. **Transitions are the whole game musically.** Up: entering voices land on the
   downbeat, preceded by a short FX riser in the last 1–2 bars, filters opening
   as they enter. Down: leaving voices filter down and tail off across the last
   bar (a fade into darkness), never a hard yank.

## Per-genre parameterization (one machine, a parameter table)

The mechanism is a single engine; the genre is a table. Per-genre knobs:

- **Phrase length in bars.** 8 for four-on-the-floor genres. DnB (174) can use
  8 or 16. Halftime Hip-Hop (140) may feel better at a 4-bar base. The armed
  Drop scales with it: DnB uses a 4-bar drop (1 strip / 2 build / 1 slam), Lo-Fi
  an 8-bar version that breathes.
- **Slot-strip priority** (which voice leaves first per tier): Lo-Fi & Synthwave
  keep the pad/Harmony wash present even in Breakdown and strip percussion first
  (the wash is their identity). Techno & House keep the low-end-and-hats groove
  and strip Harmony/Melody hardest (percussion is their identity). DnB & Hip-Hop
  treat the breakbeat/Backbeat as near-sacred and strip melodic voices first.
- **Drop skin** (same strip→build→slam skeleton, genre-voiced): House/Techno =
  white-noise riser + kick-drop + full slam on the "1". Synthwave = big filter
  sweep + gated-reverb impact. Lo-Fi doesn't "drop," it "blooms" (tape-rewind-ish
  riser, warm swell, no violent slam). DnB = the hardest — full beat-cut then a
  reload. Hip-Hop halftime = a rising 808 glide + a booming downbeat.

## Determinism (hard constraint)

Every input (the Intensity components, the arm press) is already a logged,
sim-derived value. **The one invariant: sample Intensity and resolve arrangement
state ONLY at bar boundaries, from sim state, never from wall-clock or render.**
Fills derive from `hash(bar, seed)` — a pure function of grid position, not
free-running randomness. Nothing needs to be neutralized in headless: the bot
never arms a Drop, and derived Intensity computes identically from sim state, so
seeded replays and bot runs stay bit-identical. This also protects musical timing
as a side effect.

## Pillar compliance

- **Pillar 1 (sounds are the weapons):** honored — arrangement moves are weapon
  moves (Model A). The "never fully silence automatically" rule keeps a damage
  trickle at all times in Layer 1.
- **Pillar 2 (system owns the theory):** all UI is vibe words — "Energy," a
  "DROP" button, "the crowd's with you." Never keys, BPM, bars, or voice names.
- **Pillar 3 (good muted):** none of it is load-bearing. Foundation-weapons-when-
  spread / full-arsenal-when-swarmed is a legitimate combat-management layer even
  silent, and the Drop is a satisfying earned cooldown-nuke. It multiplies a
  working game; it doesn't prop one up.
- **Pillar 4 (combinations over volume):** it reuses the existing 8 voices, the
  bar clock, the M2 next-bar entry, the FX slot, and the spawn director's curve —
  one new system interacting with what's there, no new content mass.

---

## Proposed build sub-phases (each ends at a developer gate)

Ordered so the musical win is judged BEFORE any combat risk is introduced —
Layer 1's safe moves first, the risky player Drop last. This mirrors the
music expert's prioritization.

### Sub-phase A — the phrase clock + Auto-Arranger, filter/density only
Build the 8-bar phrase clock, the Intensity spine (derived, smoothed, sampled at
boundaries), the three nested tiers, and the transitions — using ONLY per-voice
filtering and density-halving on subdivision voices. No voice is ever hard-cut;
no combat numbers change at all yet (Intensity drives only timbre/density). One
genre first (House or Techno — clean four-on-the-floor to judge the machine).

**Gate A (developer's ear):** does the track now breathe and read as produced
across a full run, with the arrangement visibly tracking the fight, and does it
sound *good* — transitions musical, not "instruments cutting out"? No combat
feel to judge yet; this isolates the musical win.

### Sub-phase B — the armed Drop (strip → build → slam + overdrive)
Add the Drop meter (charge, quiet-bonus, decay), the one-tap arm, the coiled-
spring armed phrase, and the ~2-bar overdrive window. This is the first move that
creates a real (player-chosen) damage hole and a real damage spike.

**Gate B (developer's ear + hands):** does arming the Drop feel like a committed,
earned choice; does the strip→build→slam land emotionally; does the overdrive
make the return feel powerful without becoming a spammable free lever; is timing
the slam onto a telegraphed wave a fun skill expression; does it work one-handed
on mobile? Tune the charge time, quiet-bonus, overdrive amount, and strip depth
(including the open taste question below) here.

### Sub-phase C — all six genres + polish
Fill the per-genre parameter table (phrase length, slot-strip priority, Drop
skin) across all six genres, the HUD/telegraph polish, and the spawn-telegraph
cues the Drop times against.

**Gate C (developer's ear + hands):** does every genre's breathing and Drop
sound like itself and good; does the full loop (breathe → disengage → charge →
arm → drop) feel like composing a track through pure play?

---

## Verdict protocol (defined in advance)

Per the project's simplified protocol, the developer's own judgment is the whole
verdict. **Pass** = over full 8-minute runs with sound, the track now has a real
energy curve that reads as an evolving track (not a static wall), the player has a
genuine reason to sometimes be low-energy and sometimes high-energy, the Drop is
an earned punctuation and not a free bonus, and muted the game is unchanged in
quality. **Fail** = the arrangement still feels static or nervous, OR the Drop
degenerates into a dominant/always-on strategy, OR going quiet is never worth it,
OR any of it makes the muted game worse. A fail loops within the sub-phase the
failure points to; it never pushes the problem downstream.

---

## Open taste questions for the grilling session / gates (not resolved on paper)

1. **May the armed Drop's strip cut the kick (Pulse) to zero for its 1–2 strip
   bars, or only filter/thin it?** The music side wants a full cut for the
   hardest contrast (the empty bar that makes the slam land). Pillar 1's "never
   zero" leans toward filter-and-thin even here. Both experts agree this is a
   single ear call at Gate B: try the full cut; if it reads as "the game broke"
   rather than "the track dropped," fall back to a deep filter + thin (a slightly
   weaker spring, same mechanic).
2. **Exact dwell/hysteresis numbers.** Minimum dwell is 1 phrase (8 bars) by
   construction. On top, a ~0.15-wide dead-band on the tier thresholds (e.g. rise
   above 0.55 to climb a tier, fall below 0.40 to drop one) so Intensity hovering
   near a boundary doesn't toggle. Down-shifts want the full 8 bars especially
   (a breakdown needs room to breathe). Ear-tuned at a listening session.
3. **The quiet-charge bonus magnitude and its decay window** (~2× / ~8s no-kill
   decay are starting points), tuned so disengaging is worth it but flatline-
   fleeing is not.
4. **Overdrive amount and duration** (~+40% area/damage over ~2 bars) against
   late-game scaling — the slam should feel like a real payoff, not trivialize a
   wave.
5. **HUD/telegraph:** how the incoming-wave telegraph reads and how the Drop's
   armed/charging state is shown, all in vibe words (Pillar 2).

## What v2 deletes from v1

- The beat-tap SPACE input (fought the genre and doesn't exist on mobile).
- The single master lowpass filter as the only expressive tool (replaced by
  per-voice filtering moving in opposite directions).
- The held-meter-for-a-passive-bonus economy (+damage/+XP/+damage-taken
  scalars). Replaced by a structural arrangement system plus one earned, spent,
  telegraphed Drop.
- The fixed top-down un-gate staircase with kick+bass permanently on (replaced by
  intensity-selected nested tiers + a player-armed strip that can cut even the
  low end for contrast).

---

## Implementation notes (built July 7, 2026)

Built on branch `worktree-agent-ab937d650700e2226`. Files:
- **`src/audio/engine.ts`** — a per-voice lowpass `BiquadFilter` added to each
  Voice (chain `gain → duck → filter → [fx] → master`), `setVoiceCutoff(role,hz,tc)`,
  and `addBarListener`/`clearBarListeners` firing at every bar with the absolute
  bar index (the phrase clock). The kick-ducks-bass sidechain (on `duck`) and
  per-voice effects (`buildVoiceChain`, now rewiring the filter's downstream) are
  preserved.
- **`src/game/hype.ts`** — rewritten as `class ConductedGrid` (replaces the v1
  `HypeController`). Owns the Intensity spine, the 3 nested tiers with hysteresis,
  per-voice filtering, and the Drop state machine.
- **`src/game/run.ts`** — added `hypeAreaMul` (default 1), multiplied into weapon
  `radius`/`orbitRadius` in `applyBuild` for the slam's area overdrive.
  `hypeDamageMul` repurposed as the slam damage overdrive. `hypeXpMul`/
  `hypeDamageTakenMul` retained at 1 (v2 drops the held-meter scalar economy).
- **`src/game/game.ts`** — constructs `ConductedGrid`, registers the bar listener,
  SPACE → `arm()`, slam flash via `onPeak`.
- **`src/style.css`** — the `.hype-*` block replaced (energy label + DROP charge
  meter + DROP button).

**Determinism:** the controller is live-only, exactly like v1 — ticked only in
the live game loop, never in the headless bot / conductor / replay. `hypeAreaMul`
and `hypeDamageMul` default to 1 and only move during a live Drop slam; `x * 1.0`
is an IEEE-754 identity, so the bot and seeded replays are bit-identical. Verified:
`tsc` + `vite build` clean; bot smoke on House healthy (median 4:07, distributed
damage share, no crashes); a headless behavioral harness drives the controller
through 31 assertions (breathing up/down with hysteresis, strip→build→slam,
foundation + utility never gated by a strip, auto-arranger never gates a voice so
Model A holds, overdrive engage/reset, no state leak on run exit, charge decay,
arm-refused-with-no-strippable, mid-drop re-gate); Chrome boot clean (renders, no
console errors, band assembles, per-voice filters wired at correct defaults). The
live *feel* over an 8-minute run is the developer's gate — it could not be
observed under browser automation because the render loop (rAF) pauses when the
automation tab is hidden.

**Adversarial code review** (4 dimensions × adversarial verify) confirmed and
fixed three defects: charge never decayed (anti-farm), a foundation/utility-only
band could arm a free overdrive, and a weapon picked mid-strip fired un-gated. A
fourth finding (Drop started on the next bar not the next phrase) was kept as a
deliberate responsiveness choice and is documented above as **[impl]**.

### Deferred (spec sub-phase C — per-genre tuning, NOT yet built)

The mechanism is genre-agnostic and currently runs one parameter set for all six
genres. Still to author per the per-genre parameterization table above:
- Per-genre **phrase length in bars** and Drop sequence length (fast genres want
  a shorter strip/build/slam than the fixed `STRIP=1 / BUILD=2 / SLAM=2` used now).
- Per-genre **slot-strip priority** (Lo-Fi/Synthwave keep the pad, Techno/House
  strip melody hardest, DnB/Hip-Hop protect the backbeat) — the tier map is a
  single default today.
- Per-genre **Drop skin** (the riser/impact treatment) — currently one master-tone
  sweep for all genres.
- The remaining **open taste questions** (kick-cut depth on the strip, exact
  dwell/hysteresis/charge/overdrive numbers) are left as ear-tuned constants at
  the top of `hype.ts`.
