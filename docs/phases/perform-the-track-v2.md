# Perform the Track v2: sections that re-arrange, a charged drop

Status: proposed spec; **sub-phase A implemented** on branch
`worktree-agent-a0f197bc39248c1c6` (uncommitted), engineering-verified (tsc +
vite build clean, headless bot smoke clean and still GROOVE-only so replays stay
bit-identical), awaiting the developer's ear/hands. Supersedes the v1 prototype
(`docs/phases/perform-the-track.md`, still on disk for history). Written from a
two-expert design session — a music-production expert (electronic genres) and a
survivors-like game-design expert — who diagnosed v1 independently and then
converged on the single shared solution recorded here. Parent plan:
`docs/plan.md`. Everything from M1, M2, `genres-and-weapons.md`, and
`the-band.md` carries forward unchanged unless amended here.

This document is a hand-off: an implementing agent should be able to build from
it without re-running the design discussion. The developer's ear and hands
remain the gate; the sub-phase gates below are his.

## Why v1 is being replaced

The developer likes having sections and swapping between them, but v1 does not
feel musically meaningful or gameplay-rewarding. The session pinned six causes,
which collapse into two root problems:

1. **Muting is subtractive only.** A v1 section only decides which slots are
   audible; every surviving voice keeps playing the exact same thing. That
   reproduces one arrangement gesture (pulling faders) out of the five a real
   section move makes. It cannot sound like a breakdown or a build because those
   are defined by *what the remaining voices play*, by filtering, and by the
   low-end, none of which muting touches.
2. **The tuned baseline (FULL) is the ceiling.** Every non-FULL section is a
   downgrade, so the only verb is "voluntarily make yourself weaker." In a
   power-fantasy genre that fights the grain: there is no stance that plays
   *above* baseline through skill, swapping is instant and free (no commitment,
   no skill gradient), and the drop is the sole source of fun sitting on a
   passive timer.

The developer's own instincts were correct and are load-bearing here: sections
must change **patterns**, not just mute; and a two-instrument build genuinely
cannot stage a real breakdown or drop, so the mechanic must scale with the band.

## The five arrangement gestures (the musical foundation)

A real section change in these genres is a *bundle* of gestures. v2 owns all
five; v1 owned only the inverse of the first. An implementer should treat these
as the palette every section draws from:

1. **Pattern change within surviving voices.** The kick drops from
   four-on-the-floor to one hit a bar; hats halve their rate; the bass collapses
   to one held root; or the reverse on the way up. Density moves *inside* a
   voice, not just across voices.
2. **Master low-pass filter sweep.** The single highest-value addition. The
   whole mix gets muffled (highs removed, "underwater") in a breakdown and slams
   back open into the drop. Timbral, orthogonal to muting. New global audio node.
3. **Sub / low-end staging.** A build-up thins or removes the sub so the drop can
   *violently fill the hole*. The returning bass on the downbeat is the most
   physical part of a drop.
4. **Risers and impact.** A rising noise/pitch swell over the last bar, then a
   crash landing exactly on beat 1. Dedicated transition sounds, not steady-state
   voices.
5. **The pre-drop gap.** A half-bar of near-silence before the drop. Contrast is
   what makes the slam huge: the held breath before the release.

## The model: four sections in one loop

Not a flat menu of four peers. One home, one defensive valve, one aggressive
build, one payoff. The baseline moves from ceiling to **floor**, so sections
push away from neutral in two directions (safer, or harder-and-charging) instead
of only down.

| Key | Section | Player word | Musical move | Gameplay role | Bot |
|---|---|---|---|---|---|
| 1 | **GROOVE** | "Ride" | Baseline. Identity transform, filter fully open. | Neutral floor. No cost, no bonus. ~90% of playtime. | lives here |
| 2 | **BREAK** | "Ease" | Owned slots drop toward their sparse rung; master low-pass to ~800 Hz; wide/sparse hits. | Defensive stance: +move, knockback/slow aura, damage reduction. Buy space. Sittable. | — |
| 3 | **CLIMB** | "Charge" | Owned slots climb a rung; drum density *ramps while held*; filter opens; riser swells. | Aggressive **and** exposed: +damage, +contact damage taken. This is where the drop charges. | — |
| SPACE | **DROP** | "Slam" | Pre-drop gap → phrase-downbeat slam: all owned slots at peak patterns, sub returns, crash on step 0. | The spend: screen-clear, i-frames, big damage window. | — |

The loop: **GROOVE ⇄ BREAK** is the defensive valve you can sit in;
**GROOVE → CLIMB → DROP → GROOVE** is the aggressive tension-and-release arc.
That is an honest track structure (home, strip-back, build, release) and a power
fantasy (a chargeable above-baseline aggression stance) in the same four inputs.

### The key design decision: CLIMB is the aggression stance AND the build

The session's central reconciliation. The game designer wanted an above-baseline
"press it harder" aggression stance (DRIVE); the music expert warned that a
sit-forever loud plateau is not an arrangement section (it deletes the arc and
reproduces v1's hollowness inverted). The resolution: in electronic music the
"press it harder" gesture and the "build toward the drop" gesture are the *same*
gesture — rising density, subdividing hats, opening filter, accumulating energy.

So **DRIVE and CLIMB are one state.** Pressing the aggression stance *is*
charging the drop. This makes the wind-up a fun aggressive state (you deal the
most damage and take the most risk while charging, you are not standing still
enduring a passive timer), and it stops CLIMB from being a flat plateau: its
density ramps while held to a musical ceiling (~1–2 phrases), and a held,
unresolved peak *wants* release. That musical tension is the pressure to fire the
drop — no artificial "meter decays past full" needed.

## How the drop is earned and fired

- **Reachable only through CLIMB.** No CLIMB, no drop. This is the earned-ness
  the developer found missing.
- **Charge = time in CLIMB weighted by damage dealt.** Fighting during CLIMB
  fills it, not merely surviving it. Rewards skilled aggression; a passive CLIMB
  charges slowly.
- **Armable at a minimum threshold (~1 phrase of CLIMB).** Below that the drop
  cannot fire.
- **Fired manually** (SPACE), then lands on the next phrase downbeat (see
  Anchoring).
- **Payoff scales two ways:** by CLIMB duration (fire early = small drop; ride to
  the peak = big drop, capped at full CLIMB) and by owned band size (2-piece pop
  → 8-piece screen-nuke). The core skill decision is "pop it now for this wave,
  or push CLIMB longer for a bigger clear while staying exposed?"

### The drop delivery sequence (phrase-anchored)

1. **On press (instant):** i-frames and the screen-clear shockwave fire
   immediately. Safety is never quantized — you are protected the frame you
   press. CLIMB's +contact-damage exposure ends here.
2. **The gap:** for the remaining steps until the next downbeat, everything cuts
   to the riser tail (near-silence). The pre-armed i-frames cover this whole gap,
   so the silence reads as *euphoric invulnerability* ("you are untouchable and
   about to detonate"), never as helplessness. Capped at one bar so it is a held
   breath, not dead time.
3. **The slam (next phrase downbeat, via the engine's existing bar queue):** all
   owned slots re-enter at once at peak patterns, the sub slams back in, the
   filter snaps fully open, the impact crash fires on step 0.
4. **The window:** the damage/peak-pattern bonus starts *on the slam*, not on the
   press, so the audible drop and the gameplay reward coincide. Sustain ~2–4 bars
   then settle to GROOVE.

Risk → commit → safety → payoff: risk is front-loaded into the aggressive CLIMB,
the commit hands you invulnerability through the gap, the slam clears the screen.

## Anchoring: instant defense, quantized music

The verb is split into two channels so musical grid and twitch-responsiveness
coexist:

- **Gameplay/defense layer — instant.** The moment you press: BREAK's move-speed
  / knockback / damage-reduction applies; the drop's i-frames and shockwave fire.
  Never quantized. A survivors-like needs sub-100 ms defensive response and gets
  it.
- **Arrangement/timbre layer — quantized.** The pattern and filter changes are
  what the ear judges, so they land on the grid:
  - BREAK ⇄ GROOVE and entering CLIMB: **next bar** (16 steps; responsive,
    ~1–2 s), with a visible telegraph.
  - DROP musical slam: **next phrase downbeat** (4-bar, 64 steps). The big
    structural event must land on a phrase boundary or it sounds cheap and
    un-earned. The wait is capped at one bar so it never feels sluggish; the
    riser swell is the "armed, firing on the downbeat" tell.

4-bar phrases fit all six genres. Do not go finer than a bar (feels unquantized)
or coarser than a phrase for the drop (feels sluggish). Slow genres (Lo-Fi,
Hip-Hop) *feel* the 4-bar wait as more wall-clock time, which makes their drops
weightier — a feature, not a bug.

## The incomplete-band problem: soft unlock + continuous scaling

A 2-instrument build cannot stage a real breakdown or drop by muting subsets;
there is nothing to strip. Both experts converged on the same two-part answer:

1. **Soft unlock by voice count.** Whole sections appear as the band grows:
   - **GROOVE:** ≥1 voice (always).
   - **BREAK:** ≥2 voices.
   - **CLIMB + DROP:** ≥3 voices.
   These unlock moments become *felt progression beats* — early level-ups grant
   new verbs, not just stats. This is a soft gate (a section appears), not a hard
   lock inside an available section.
2. **Continuous richness scaling within the unlocked set.** Once available, each
   section scales with owned slots and (for the drop) CLIMB duration. A 3-piece
   drop slams; an 8-piece drop nukes.

**Engine-owned transition scaffolding guarantees legibility at the floor.** The
system owns the theory (Pillar 2), so the arrangement scaffold that makes a drop
*read* is engine-provided, not dependent on owning the right slot:

- A **generic white-noise riser** (always available) swells through CLIMB's last
  bar and the pre-drop gap.
- A **generic impact** (crash/boom) fires on the drop downbeat.
- The **master low-pass filter** is a global node, present regardless of band.

With this scaffold, a kick+snare (once at 3 voices) drop reads as a real drop:
gap → filter snap → riser peak → generic impact → both drums hit hard on the
downbeat, with a pitched-down kick standing in for the absent sub. Owned band
voices decorate and enlarge that constant gesture as slots fill in. Gesture
constant, richness scales.

## Implementation mechanism (hand-off detail)

A **section layer** that sits between the run and the audio engine and never
edits the authored charts. Three tools, all cheap on the existing clock:

1. **Read-time pattern transform**, applied as a post-filter on the events an
   instrument would fire, keyed by `(section, role, tier, phraseStep,
   barInSection)`, over **owned slots only** — a pure, deterministic function, no
   new authored data:
   - **GROOVE:** identity.
   - **BREAK:** each owned slot reads toward its sparse rung — drums keep events
     on strong steps (e.g. `step % 8 === 0`), bass collapses to a held root,
     harmony to one hit per bar; some slots drop out per a small per-genre
     override table.
   - **CLIMB:** each owned slot climbs a rung (read chart at `min(tier+1, 4)` or a
     synthetic densify), with a **while-held ramp** — density and velocity climb
     bar by bar (the accelerating hat/snare roll); keep the sub/bass thinned to
     dig the hole the drop will fill.
   - **DROP:** during the gap, return no events for all slots except the riser
     tail; on the slam, peak patterns (or a fatter "drop" variant) plus the
     forced impact crash and sub return on step 0.
   Because the transform is a pure function and the bot never leaves GROOVE
   (identity), **every existing seeded replay stays bit-identical.** Section
   state is inert until a human key press.

2. **Two automated global audio nodes on master:**
   - A **BiquadFilter low-pass**: cutoff automated per section (BREAK sweeps to
     ~800 Hz; CLIMB ramps open; DROP snaps fully open). Does not exist yet;
     highest single audible win.
   - A **gain/duck pump** on the drop downbeat (the existing kick sidechain duck
     node can double as the drop "breath").

3. **Two engine-owned generic transition synths** (white-noise riser, generic
   impact), always available, not band slots.

No re-authoring of the 12 × 6 × 4 ladder. The section layer *rearranges the same
track* the way a producer's arrangement automation does, which is exactly what
muting could never do.

## What stays honest (pillars)

- **Pillar 1 (things that make sounds are the weapons).** Model A holds: a muted
  slot's weapon does not fire (no sound, no damage), so BREAK/CLIMB/DROP still
  move damage in the world exactly as they move the mix. The engine-owned riser
  and impact are transition FX, not weapons — they deal no damage and are not
  band members.
- **Pillar 2 (system owns the theory).** On-screen names are the plain words
  GROOVE/BREAK/CLIMB/DROP (or the developer's chosen wording at gate). No
  producer jargon reaches the player. The scaffolding guarantees a legible drop
  regardless of build, so no player choice can make the arrangement fail.
- **Pillar 3 (good muted).** Every section carries a muted visual tell: a
  persistent screen-edge tint/vignette per state (GROOVE neutral, BREAK cool,
  CLIMB hot), a bar/phrase countdown telegraph, visibly denser/faster projectiles
  in CLIMB, a visible aura/slow-field in BREAK, and a full-screen drop event with
  hitstop (~120 ms) and flash. The mechanic reads and plays with sound off.
  **Named limit:** "feels like a great track" is a sound-on win by definition;
  muted, the drop is "a great screen-clear verb," which is the correct muted
  bar and is acceptable.
- **Determinism.** GROOVE is the untouched tuned baseline; the bot lives there
  and never uses the verb. Charge/HEAT is a **downstream read-only display value**
  that never feeds RNG or damage rolls, so it cannot desync seeded replays.

## Build sub-phases, each gated by the developer

- **Sub-phase A — the arc, on the current band.** GROOVE/BREAK/CLIMB/DROP as four
  states with the read-time pattern transforms, the master low-pass node, the
  gain pump, and the two generic transition synths, on today's twelve
  instruments. Bar/phrase anchoring, instant defense split, the pre-drop gap +
  i-frames, manual drop fire, CLIMB-charges-the-drop. Soft unlock by voice count.
  **Gate:** swapping feels like performing a track (not fader-pulling), CLIMB
  feels like an aggressive high (not a chore), the drop feels earned and
  euphoric, and it all reads muted.
- **Sub-phase B — genre flavor and scaling polish.** Per-genre override tables
  for which slots survive BREAK and how CLIMB densifies (Lo-Fi/Hip-Hop shorter
  and dustier; House/Techno/D&B/Synthwave longer explicit builds); tune drop
  payoff scaling by CLIMB duration × band size; tune the charge curve
  (time × damage weighting) and the armable threshold. **Gate:** each genre's
  arc sounds recognizably itself, and the "pop now vs push longer" decision has a
  real skill gradient.

## What to tune (playtest-era knobs)

- **Charge curve** (CLIMB time × damage weighting) and the **armable threshold**
  (~1 phrase). If CLIMB feels like a chore rather than an aggressive high,
  *shorten the minimum window* rather than removing the CLIMB requirement — the
  requirement is what makes the drop feel earned.
- **CLIMB exposure** (+contact-damage taken) and **BREAK defense** (move,
  knockback/slow, damage reduction) magnitudes.
- **Filter targets** per section and per genre; **gap length** (≤ one bar).
- **Drop window** length and damage bonus; **i-frame** coverage of the gap.
- **Unlock thresholds** (2/3 voices) — whether the drop should want a 4th voice
  to feel substantial.

## Verdict protocol

The developer plays full runs across genres and declares pass or fail by his own
judgment on one question: **does swapping sections now feel like performing a
track — musically meaningful and gameplay-rewarding, with real skill in when to
CLIMB and when to fire the DROP?** Pass or fail is recorded in `docs/STATUS.md`.
A pass promotes this from proposed to locked and folds the mechanic into the
roadmap; a fail reworks at the level the failure points to (most likely the
charge curve or CLIMB feel, per the tuning notes above).
