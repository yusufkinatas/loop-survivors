# Electronic dance music: what creates movement, and which of it can be a game rule

Research for issue #251 (part of #247). Covers the devices that produce
movement, tension and release in electronic dance music — arrangement sections
and their conventional lengths, subtractive arrangement, the tension kit
(filter sweeps, risers, drum rolls, silence), sidechain compression, frequency
separation and masking, rhythmic interlock and call-and-response, energy curves
across a whole DJ set, and tempo/key changes — and asks of each one: what it
does to a listener, what it structurally requires, whether it could be a rule a
game *enforces or rewards* rather than an authored audio artifact, and what it
would cost in **this** engine. Every device is scored on a scarcity axis,
because the ticket this feeds asks what constrains a build, and the game's
current failure is that its music only ever gets denser.

**Sources fetched 2026-07-25.** Peer-reviewed musicology
(Solberg 2014 in *Dancecult*; Solberg & Jensenius 2017 in *Empirical
Musicology Review*; Kim et al. 2026 in *TISMIR*), one MSc thesis
(Zurita Turk 2016, Universitat Pompeu Fabra / Music Technology Group), the
Ableton-published production book *Making Music* (DeSantis) and Ableton's
*Learning Music* course, *Sound On Sound* technique articles (trade press,
author and issue date recorded per citation), the W3C Web Audio API
specification, and DJ-practice documentation from Mixed In Key. Two PDFs
(Solberg 2014, Zurita 2016) would not render through the fetch tool and were
downloaded and text-extracted locally; quotations from them are verbatim from
that extraction. Every claim about **our** engine is cited to a file in this
repo, read at commit `58eb931`, not inferred from the design docs. Anything
that could not be verified is in §12, and nothing there is guessed.

---

## 0. Plain-word glossary

Everything in this document is written for a reader who is not a producer.
These are the terms that recur; each is also re-explained where it is used.

| Term | Plain words |
| --- | --- |
| **Beat** | The pulse you tap your foot to. |
| **Bar** (a.k.a. measure) | Four beats. The basic block of dance music. At our 122 BPM one bar is **1.97 seconds** (derived: `4 × 60 / 122`). |
| **Phrase** | A group of bars that feels like one sentence — normally 4, 8, 16 or 32 bars. |
| **Grid / step** | We chop each bar into 16 equal slots ("16th notes"). A step is one slot: **0.123 s** at 122 BPM (derived). Sounds can only start on a step. |
| **Chart** | Our data format for "this instrument plays on these steps, this hard, on these notes". A drum chart is a groove; a pitched chart is a melody. |
| **Voice** | One instrument in the mix (kick, hat, bass…). In our game one voice = one weapon. |
| **Velocity** | How hard a hit is struck, 0–1. Mostly heard as loudness. |
| **Density** | How many hits happen per bar, across all voices at once. |
| **Texture** | How thick the sound is — how many things are audible at once and how much empty space is left. |
| **Section** | A named stretch of a track (intro, breakdown, drop…) with its own set of active parts. |
| **Drop** | The moment the full groove — especially bass and kick drum — slams back in. The energy peak. |
| **Breakdown** | The stripped-back stretch before a drop, where most parts are removed. |
| **Build-up** | The stretch between breakdown and drop where tension is wound up. |
| **Frequency range** | Roughly "how low or high a sound is". Kick and bass live low; hats live high. |
| **Masking** | A louder sound hiding a quieter one that sits in the same frequency range. |
| **Filter** | A tone control that removes everything above (low-pass) or below (high-pass) a moving cutoff point. |
| **Filter sweep** | Moving that cutoff point over time, so the sound opens up or closes down. |
| **Sidechain / ducking** | Automatically turning one part down for a split second every time another part hits — classically, the whole mix dips on every kick. |
| **Riser / uplifter** | A sound that climbs in pitch or brightness across a build-up, signalling that something is coming. |
| **Hocket / interlock** | Two parts sharing one line: each plays in the other's gaps, never at the same instant. |
| **Sub-bass** | The lowest, felt-more-than-heard part of the low end. Kick and bass both want it. |
| **Headroom** | How much loudness is left before the output has to be squashed. |

---

## 1. The engine we are actually writing for

Grounding facts, read from the code. Everything in §2–§9 is priced against
this list.

**Grid and time**

- 16 steps per bar, 4 beats per bar, **4-bar phrase** —
  `STEPS_PER_BAR = 16`, `BARS_PER_PHRASE = 4`, `STEPS_PER_PHRASE = 64`
  (`src/audio/scale.ts`).
- A chart may be **1 to 4 bars** and no longer; `validateChart` throws
  otherwise (`src/audio/charts.ts`). Shorter charts loop inside the phrase.
- The soundset runs at **122 BPM** with **swing 0.1** (`src/audio/soundset.ts`);
  `Clock` re-reads `bpm` and a separate `rate` multiplier **on every scheduled
  step** (`src/audio/clock.ts`), so tempo is a live variable with no
  time-stretching anywhere. Nothing is a baked clip.
- Derived, at 122 BPM: 1 bar = 1.97 s; a 4-bar phrase = 7.87 s; **16 bars =
  31.5 s**; a 30-minute run ≈ **915 bars ≈ 229 phrases ≈ 57 sixteen-bar
  sections**.
- Scheduling is a 25 ms lookahead timer writing 120 ms ahead of the audio
  clock. Changes can be queued to land exactly on a bar (`atNextBar`), on a
  4-bar phrase (`atNextPhrase`), or at an exact audio instant (`atAudioTime`)
  (`src/audio/engine.ts`).

**Signal path**

Per voice: `gain → duck → weaponsBus → hitDuck → master → transport → limiter
→ analyser → destination` (`MusicEngine` constructor). The limiter is a
`DynamicsCompressorNode` at threshold −10 dB, knee 12, ratio 8, attack 2 ms,
release 120 ms.

**What already exists**

- **Sidechain.** The kick already ducks the bass: depth `0.5` (≈ −6 dB),
  attack 8 ms, release 140 ms, scheduled at the kick's future audio time
  (`DUCK_DEPTH`/`DUCK_ATTACK`/`DUCK_RELEASE` in `src/audio/engine.ts`). Only
  the `bass` role is ducked (`SUB_BASS_ROLES`). Track Lab already generalises
  this to a whole **duck bus** any voice can be routed into, driven by any
  voice flagged `ducker`, with per-track `pump: { amount, release }`
  (`src/experiments/tracklab/labengine.ts`).
- **Sections.** Track Lab has named sections — a set of charts per voice,
  switched cleanly **on the next bar line** (`LabEngine.setSection`). The game
  engine has the same primitive in a narrower form: `setVoiceTier` swaps a
  voice's chart for another rung of its 4-tier ladder, and `atNextBar` /
  `atNextPhrase` make the swap land musically.
- **Silence.** `setVoiceEnabled(role, false)` is a boolean check inside the
  step loop. Muting a voice is free and instant, and can be queued to a bar.
- **Live filters.** `BiquadFilterNode` is already used, but only per-trigger
  and only on *evolved* voices (a fresh filter node per hit inside `trigger`).
  There is **no persistent filter node** on any voice, bus or master.
- **Noise.** `makeNoiseBuffer` (white noise with three fade shapes) exists but
  is wired only into one-shot UI cues (`src/audio/cues/noise.ts`), not into the
  music bus. A `riser` role exists in the catalogue (`src/audio/kits.ts`) but
  the house soundset supplies no ladder for it, so it is never offered and
  never voiced (`supportedRoles`).
- **Band cap.** `BUILD.weaponCap = 5`, `itemCap = 6` (`src/game/config.ts`).
- **The arranger has no cross-voice awareness.** `chartEventsAtStep(chart,
  step)` takes one chart and knows nothing about what any other voice is
  doing at that step (`src/audio/arranger.ts`); `MusicEngine.onStep` loops the
  voices independently. Any rule of the form "these two may not both sound
  here" is *new machinery at the arranger*, not a parameter tweak.
- **Masking is already documented in our own mix.** The `VOICE_MIX_GAIN` table
  carries hat −3 dB, chord +12 dB, arp +9 dB, lead +10 dB, with the comment
  that "the hat's dense chart made its bright transients dominate, while the
  chord and arpeggio … were masked by the drums" (`src/audio/engine.ts`).

**The shape of the current ladders.** Counting the events in
`src/audio/ladders/house.ts` and normalising to events *per bar* (derived —
charts differ in length, so raw event counts are not comparable):

| Role | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
| --- | --- | --- | --- | --- |
| kick | 4 | 4 | 4 | 4 |
| clap | 2 | 2.5 | 2.5 | 3.5 |
| snare | 2 | 2.5 | 2.5 | 3.5 |
| hat | 4 | 4 | 6 | 12 |
| bass | 2 | 4 | 4 | 5.5 |
| chord | 2 | 4 | 4 | 7 |
| lead | 1.5 | 2.25 | 4 | 5.5 |
| arp | 2 | 4 | 8 | 13 |

**No ladder ever decreases.** Every rung is greater than or equal to the one
below it, for every role. That table is the mechanical statement of the
complaint in map #247: power and density are the same axis, and the axis only
points one way.

---

## 2. Arrangement sections and their conventional lengths

**What it does to the listener.** Sections are how a track promises and then
pays. A listener who has heard four bars of something expects the fifth to
either continue or change; sections make that expectation regular enough to
play with. The named sections are functional, not decorative: Solberg is
explicit that "the names of the sections breakdown, build-up and drop are
related to their function and intention; first the breakdown section breaks
down the groove and intensity of the track, then the build-up section builds it
up to a peak which is symbolised by dropping down the bass and bass drum"
(Solberg 2014, *Dancecult* 6(1): 67).

**What it structurally requires.** Regular, countable blocks. The sources are
consistent on the unit:

- "EDM tracks follow an anti-teleological formal principle where the basic
  unit, often consisting of 2 or 4 bars, is repeated and developed throughout
  the track. The musical elements are built layer upon layer, and are most
  often introduced, changed and removed after **2, 4, 8, 16 or 32 bars**. The
  groove consequently expands in **textural density rather than length**."
  (Solberg 2014: 66.)
- Ableton's *Learning Music* teaches a song as "a block of time, which can be
  broken down into smaller blocks of time", with sections in "multiples of
  four, eight, or 16 bars".
- The largest annotated corpus available agrees empirically: across 1,423
  expert-annotated EDM tracks drawn from 4,902 DJ mixes, "the most common
  segment length is **30 seconds or 16 measures**", most tracks contain
  "between 8 and 13 segments", and changes tend "to occur at multiples of four
  or eight measures" — treated as "a soft guideline rather than a hard
  constraint" (Kim, Kim, Kim & Nam 2026, *TISMIR* 9(1): 131–143).
- The same corpus gives the canonical order:
  **intro → buildup → drop → breakdown → drop → cooldown → outro**, with
  "energy increases progressively from intro to buildup to drop and conversely
  decreases from drop through cooldown to outro."
- A ten-label taxonomy is in use there: intro, buildup, breakdown, drop,
  cooldown, bridge, outro, ambient-intro, ambient-outro.

Measured on real two-hour DJ mixes rather than on released tracks, section
medians run longer: breakdown 40 s, filtered build-up 30 s, build-up 60 s,
drop 50 s (Zurita Turk 2016, UPF/MTG MSc thesis, Table 1; shortest observed
sections "at least 10 or 15 seconds").

Ableton's *Making Music* offers the same shape under a narrative name — the
**dramatic arc**: exposition, rising action, climax ("often marked by a sudden
increase in textural density (e.g., 'the drop' in dubstep or EDM)"), falling
action, dénouement — and notes it "works at multiple scales — from individual
melodic phrases to entire DJ sets lasting hours", while warning that "genres
like dub or minimal techno … generally have no clear build to a climax".

**Could it be a rule?** Yes, and it is the cheapest structural rule available.
A section is not authored audio; it is *which charts are active right now*. A
game that owns a clock already owns section boundaries. The rule-shaped version
is: **the run advances through named sections on a fixed grid of bars, and what
a build plays is a function of (build, section) rather than (build) alone.**
Note that this is the one place where our architecture currently says no:
`docs/plan.md` reserves the stage only two hooks (global tempo, and injecting
its own voice) and forbids it touching "the build's charts, notes, or
arrangement". A section system that the *stage* drives conflicts with that
rule; a section system that the *build* drives does not. That is a live
conflict to surface, not a decision to make here.

**Cost in our engine.** *Cheap, with one ceiling.* Switching a voice's chart on
a bar boundary is `setVoiceTier` + `atNextBar`, both already in
`MusicEngine`; Track Lab already runs named multi-voice sections through the
same scheduling model. The ceiling is that **a chart may not exceed 4 bars**
(`validateChart`) and the phrase counter is 4 bars — so 8-, 16- and 32-bar
shapes, which is what every source calls conventional, cannot live inside a
chart. They must be built *above* the chart layer as a sequence of 4-bar
phrases. That is a real but modest change (a bar counter and a section table),
not a rewrite.

---

## 3. Subtractive arrangement: a drop lands because the bar before it was emptied

**What it does to the listener.** This is the single most load-bearing finding
in the whole document. The drop is not loud because more was added; it is
enormous because the ground was taken away first, and the listener's body
knows it. Solberg's five identified drop techniques are *four removals and one
addition*: "i) extensive use of uplifters, ii) the 'drum roll effect', iii)
large frequency changes, iv) the **removal and reintroduction** of the bass and
the bass drum, and v) a **contrasting breakdown**" (Solberg 2014: 74).

The breakdown is defined by subtraction: "A breakdown is characterized by the
track's texture becoming considerably thinner or even being entirely changed.
Several instrument layers are removed, most importantly the bass and the bass
drum — the foundation and steady beat upon and after which the dancers rely and
coordinate themselves" (Solberg 2014: 67).

And there is direct behavioural evidence that removal, not addition, is what
moves people. Sixteen dancers were motion-captured in a club-like room while a
DJ mix played. Group movement *fell* during the breakdown and rose sharply at
the drop, and — the important number — "the average QoM [quantity of motion]
after the drop in 'Icarus' is higher than the average QoM **before** the
breakdown and build-up occurred", i.e. the removal-then-return cycle left the
room more energised than it had been when the same material was simply playing
(Solberg & Jensenius 2017, *Empirical Musicology Review*). The authors' summary
is unambiguous: "the removal and reintroduction of the rhythmic framework in
the drop offers one explanation as to why this creates such intense pleasure
and desire to dance."

The same paper explains *why one drop hit harder than another*: the weaker
track "keeps the rhythmic feel throughout the break routine, and the main
groove's bass line is present more or less all the time … The sonic build-up
effect of 'Ladykiller' mostly relies on a long, gradual opening of a low-pass
filter." The stronger one emptied first. **A gradual filter sweep over an
unbroken groove was measurably weaker than actually removing the parts.**

At the finest scale, the emptied bar becomes an emptied *moment*: Solberg
describes a "**micro vacuum moment** where only these two elements are audible
before the return to the core", produced by "withholding the rest of the groove
elements just for a brief moment, thus finally arriving on and accentuating the
second beat" (Solberg 2014: 74). Our own Track Lab cover of Gesaffelstein's
"Pursuit" already encodes the same trick from a sourced transcription: "every
8th bar of a drop, ALL drums cut for exactly one bar while the riff transposes
up a minor third … then slams back in"
(`src/experiments/tracklab/tracks/pursuit.ts`).

Ableton's *Making Music* makes subtraction a working method rather than an
effect: fill the whole timeline with material in about twenty seconds, then
carve, because "it's often easier to hear when something is bad than it is to
imagine something good" — the traditional workflow "resembles painting (adding
to emptiness)", the subtractive one "resembles sculpting. You're beginning with
a solid block of raw material and then gradually chipping away at it".

**What it structurally requires.** Something worth removing must be playing,
and the removal must be *reversible on a boundary the listener can predict*.
Subtraction has no meaning in a mix that was never full, and no payoff if the
return is not on a downbeat.

**Could it be a rule?** Yes — and this is the clearest candidate in the
document for a rule that *takes something away*, which map #247 names as the
thing nothing in the current design can do. Rule-shaped statements it supports
include: removal as an event the game schedules or the player triggers; a
return that is only allowed on a boundary; "you cannot drop what you were not
already playing." It is also the one device whose entire payload is
**scarcity**: the value produced is proportional to how much was taken away and
for how long.

**Cost in our engine.** *Free.* `setVoiceEnabled(role, false)` is a boolean
read in the step loop, and `atNextBar` already exists to make it land on a bar
line. Removing a voice costs *negative* CPU. There is no authoring cost either:
no new samples, no new charts. The only thing missing is a *reason* — the
engine has never had a caller that turns a voice off mid-run.

Note the gameplay consequence, since Model A binds one trigger to one sound and
one instance of damage (`docs/plan.md`): **removing a voice removes its damage
too**. Subtraction is not cosmetic here. That is either the design's biggest
opportunity or its biggest problem, and deciding which is #255's job, not this
document's.

---

## 4. The tension kit: risers, filter sweeps, drum rolls, silence

Four devices that share a job — make the listener certain something is coming —
but differ enormously in cost and in whether they add or subtract.

### 4a. Risers / uplifters

**What it does.** "An uplifter is a sound being gradually pitched further and
further in an upward direction, indicating that the section is headed towards
'something', and the effect is, as the name points out, to lift the intensity
in the section higher" (Solberg 2014: 70). Solberg grounds this in the
orientation metaphor of *gravity*: the listener predicts, from repeated
exposure, that "the uplifters [will] reach their maximum energy potential, and
the uplifters to subsequently end in a drop." *Sound On Sound* describes the
craft version: build from "sustained sounds that also have a long decay",
reverse them, and add "a pitch envelope; raising the pitch slightly as the
sound gets louder can add to the feeling of tension generated" (John Walden,
*Cubase: Creating Risers & Impacts*, SOS February 2021).

**Requires.** A voice that is *not* part of the groove, running for the length
of a build-up, ending exactly on a downbeat.

**Rule or artifact?** Mostly artifact. The riser itself is a sound; what a rule
can own is *when it is allowed to exist* and *what it commits the track to*
(a riser that does not land is a broken promise).

**Cost.** *Medium.* We have white-noise generation (`makeNoiseBuffer`) and a
`riser` role already reserved in the catalogue, but no ladder for it and no
persistent filter or pitch-automation path on the music bus. Web Audio makes
the automation itself trivial — `AudioParam` supports `setValueAtTime`,
`linearRampToValueAtTime`, `exponentialRampToValueAtTime` and `setTargetAtTime`
against the audio clock (W3C Web Audio API 1.1), and `playbackRate`/`detune`
are automatable params. But a riser is a *sustained* sound, and our whole
engine is built on one-shot samples fired on a grid. A riser is the one device
here that does not fit the "single samples on a 16-step grid" model without new
plumbing.

**Scarcity score: NEGATIVE.** A riser is one more layer.

### 4b. Filter sweeps

**What it does.** Opening a low-pass filter gradually restores the high
frequencies, which reads as the sound "arriving" or "coming into focus";
closing it reads as retreat. *Sound On Sound* notes filter sweeps are a founding
gesture of the genre, citing Donna Summer's "I Feel Love" and Madonna's "Future
Lovers" (John Walden, *Dance Music Filter Effects with Cubase 5*, SOS May 2010).

**The caveat is the most useful part of this section.** In the motion-capture
study, the build-up that relied on "a long, gradual opening of a low-pass
filter" over an unbroken groove produced a *measurably weaker* bodily response
than the build-up that emptied the arrangement first (Solberg & Jensenius
2017). A filter sweep is a cheap substitute for subtraction, and it performs
like one.

**Requires.** A persistent filter node in a signal path, and something to sweep
it (time, or a game value).

**Rule or artifact?** Genuinely rule-shaped, and unusually legible: filter
cutoff is a single scalar that can be bound directly to a game quantity
(pressure, health, a meter) with no music-theory vocabulary leaking to the
player. Pillar 2 in `docs/plan.md` is satisfied by construction.

**Cost.** *Cheap.* One `BiquadFilterNode` inserted on the weapons bus or on a
voice's chain, with automated `frequency`. We already construct
`BiquadFilterNode`s in `trigger()` for evolved voices; the change is to make
one *persistent* rather than per-hit. This is the cheapest tension device we
have.

**Scarcity score: POSITIVE (weakly).** A closed filter takes frequency range
away. It removes nothing structurally, but it does make the mix smaller.

### 4c. The "drum roll effect" — and the tempo illusion

**What it does.** Solberg names this as "perhaps the element that expresses the
intensity building the clearest": "the prominent rhythmical pattern, often the
snare drum, becomes increasingly divided until the return of the core, starting
out with quarter notes and culminating in a drum roll right before the bass
drops and the bass drum returns" (Solberg 2014: 70). In her case study it
occupies "the four last bars of the build-up".

And then the sentence that matters most for a game whose tempo is a live
variable:

> "In EDM, tempo changes are seldom made; the dancers need a steady and
> predictable framework on which they can rely and improvise within, but by
> constantly dividing the note value, the DJ or EDM producer gives the illusion
> and the effect of a tempo increase, affording a greater intensity without the
> dancer being uncertain about the beat." (Solberg 2014: 70.)

**Requires.** A voice whose subdivision can be escalated on a bar-by-bar
schedule, resolving at a boundary.

**Rule or artifact?** Very rule-shaped. "Subdivision level" is one integer per
voice: 1 hit per beat → 2 → 4 → 8. That is a knob a game can turn, and it is
exactly the axis our chart ladders already move along (see the per-bar table in
§1 — the hat goes 4 → 4 → 6 → 12 per bar, which *is* a drum-roll ramp spread
across a whole run instead of across four bars).

**Cost.** *Free.* It is one extra chart per voice, or a generated one. No new
samples, no new nodes.

**Scarcity score: NEGATIVE.** More events, by definition. Its value here is not
as a constraint but as the cheap, sourced substitute for a tempo change.

### 4d. Silence

**What it does.** Silence is the strongest tension device in the kit and the
only one that costs nothing. See §3 for the "micro vacuum moment" and the
motion-capture evidence. *Making Music* treats space as compositional
material — "make conscious decisions about how to make musical use of that
space" between notes — and contrasts a sparse aesthetic where "each musical
gesture seems to enter and exit against a backdrop of empty space" with a dub
aesthetic that fills every gap with noise.

**Requires.** Density elsewhere. Silence is meaningful only in contrast, which
means a design that wants to *use* silence must first have something to
withhold — and must protect the space from being filled.

**Rule or artifact?** Rule, entirely. A game can enforce silence (a step no
voice may occupy, a bar nothing may sound in, a cooldown after a drop) far more
easily than it can enforce any positive musical event.

**Cost.** *Free, and negative CPU.*

**Scarcity score: MAXIMUM.** Silence *is* scarcity. It is the device most
directly aligned with the ticket's bias, and the one our engine is best
equipped for.

---

## 5. Sidechain compression as glue

**What it does to the listener.** Sidechaining turns one part down for a split
second every time another part hits. Mechanically: "All compressors are
triggered by a side-chain signal, but by default this is normally the same as
the input signal" — the dance-music version routes a *different* source in, so
you "send the kick drum signal as the side-chain source for a compressor that's
processing the bass part", with attack and release setting how tightly the dip
locks to the groove: "the faster the attack, the quicker the sound will duck …
the slower the release time, the longer it will take for the compressor to 'let
go'" (Matt Houghton, *Side-chaining*, SOS February 2008). Perceptually it does
three jobs at once: it makes the trigger voice bigger without making it louder,
it buys headroom, and it welds unrelated parts into one breathing object.
(Wider claims about the "pump" as a genre staple — the whole mix pulsing on
every kick, Daft Punk's "One More Time" as the canonical case — appeared in a
site-restricted search across soundonsound.com but could **not** be pinned to a
specific article, author and date; see §12.)

It is also the standard fix for the single worst frequency collision in dance
music. "The sense of separation between kick and bass can often be further
improved by rigging a 'ducker' on the bass channel — that is, a compressor
whose side-chain is triggered from the kick-drum track. Whenever the kick hits,
the bass dips in level to make more space for it" (Paul White, *Mix Tips For
Kick & Bass*, SOS September 2011). White notes ~3 dB "still sounds pretty
natural", with harder styles pushing much further for the rhythmic pump.

**What it structurally requires.** A designated trigger voice (almost always
the kick) and a bus everything else routes through. Attack and release have to
be set against the tempo, or the pump fights the groove.

**Could it be a rule?** Partly, and interestingly. As *glue* it is a fixed
production choice, not a rule. But read as a **scarcity mechanism** it is
already one: *the low end can only be occupied by one voice at a time, and the
kick always wins the argument.* That is a resource-contention rule enforced
automatically, continuously, and inaudibly. It is the existing proof that this
game can express "two things cannot both have this" as sound rather than as a
UI message.

**Cost in our engine.** *Already built, and generalisable for near-nothing.*
`MusicEngine` schedules the dip on the bass's `duck` node at the kick's future
audio time on every kick trigger (depth 0.5 ≈ −6 dB, 8 ms attack, 140 ms
release). Track Lab already has the general form: a shared `duckBus`, a
per-voice `ducked` flag, a per-voice `ducker` flag, and a track-level
`pump: { amount, release }`. Porting the general form into `MusicEngine` is a
small, well-understood change.

**Scarcity score: POSITIVE.** It enforces exclusivity in the low end. Note
also the limiter's role: with `threshold −10 dB, ratio 8` on the master, adding
voices past a point does not make the track louder, it makes it *flatter*. The
engine already punishes density — silently, in a way no player can read.

---

## 6. Frequency separation and masking

**What it does to the listener.** Masking is when a louder sound hides a
quieter one that sits in the same frequency range: "when two sounds have
significant energy at the same frequencies the louder one dominates,
subjectively attenuating the other in that region", and it "can cause sounds to
appear uneven, both in tone and level" (Matt Houghton, *How To Achieve Better
Separation In Your Mixes*, SOS September 2022). The listener does not hear "two
instruments fighting"; they hear one instrument that has gone vague. This is
what "mud" means.

**What producers do about it.** In the order the sources give:

1. **Fix the arrangement first.** "The best first step is almost always to
   minimise the problem at source, by fine-tuning the orchestration and
   arrangement of individual parts to avoid masking clashes in the first
   place." (SOS.) That is: don't have two things in the same range at the same
   time.
2. **Decide which one matters and cut the other.** "Decide which of the
   clashing sources is more important, and see if an EQ cut in the problem
   region on the other source restores the desired sense of clarity" —
   attenuate the masker rather than boost the masked (Houghton 2022).
3. **Carve complementary bands.** White's worked example for kick vs bass:
   boost the kick near 80 Hz with a dip at 160–180 Hz, find the bass's defining
   character around "the 220–300 Hz region", and add "a second dip to the kick
   EQ at around 220 Hz" (SOS September 2011).
4. **Duck dynamically** (§5).
5. **Not panning.** Houghton warns it "will have zero effect when the mix is
   heard on a mono playback device."

**Could it be a rule?** This is the strongest untapped scarcity device in the
document, because *frequency range is a genuinely finite resource with no
workaround*. Unlike layers, you cannot have more of it. Any of these are
rule-shaped: a band that only one voice may occupy; a build that is penalised
for stacking two voices in the same range; a voice whose gain is automatically
reduced while a more important voice occupies its band.

Two things make it unusually attractive for this project specifically. First,
it is **already true and already costing us** — the `VOICE_MIX_GAIN` table in
`src/audio/engine.ts` is a hand-tuned masking workaround, with a comment
recording that the arp and chord "were masked by the drums" and that a
rendering bug once left the arp "~19 dB under the lead". The mix already has a
frequency budget; nothing surfaces it. Second, it needs no music-theory
vocabulary to express: "low / mid / high" is plain language, satisfying pillar
2.

The counter-consideration, stated flatly and not resolved here: the current
design explicitly permits collision — "Which voices collide is left to the
player — a build that stacks two similar instruments is allowed to, and is the
player's own doing" (`docs/plan.md`, band cap). Turning masking into an
enforced rule contradicts that sentence.

**Cost in our engine.** *Mixed, and worth splitting into three.*

- **Static band separation by authoring** (each kit occupies a known range;
  charts and mix gains keep them apart): *free* — it is what the
  `VOICE_MIX_GAIN` table is already doing by hand.
- **A persistent EQ node per voice** so a band can be carved live: *cheap* —
  one `BiquadFilterNode` per voice in the existing `gain → duck` chain, types
  `peaking`/`lowshelf`/`highshelf` (W3C Web Audio API 1.1). We already build
  these nodes per-trigger for evolved voices.
- **Automatic detection of masking** (measuring which voices actually collide
  at runtime): *expensive and probably unnecessary* — the roles are fixed and
  their ranges are known at authoring time, so a static band table is a
  better answer than analysis.

**Scarcity score: MAXIMUM.** Frequency range is the one resource in music that
is unambiguously finite and cannot be bought.

---

## 7. Rhythmic interlock and call-and-response

**What it does to the listener.** When two parts share a line — each playing in
the other's gaps — the ear fuses them into one moving thing, and the groove
gets a forward tumble that neither part has alone. When they instead land
together, they merge into one thicker hit and the movement disappears. This is
the rhythmic twin of masking: **the grid is finite, and two voices on the same
step is one voice's worth of information.**

The technique has names in both traditions. **Hocket**: "a rhythmic and linear
technique involving the alternation of notes, pitches, or chords", in which "a
single melody is shared between two (or occasionally more) voices such that one
voice sounds while the other rests, creating a staggered, interlocking
texture" — from Old French *hoquet*, "hiccup". It survives in Javanese *imbal*
and Balinese *kotekan* gamelan, in funk guitar pairs, and in Dirty Projectors.
**Call and response**: "a compositional technique, often a succession of two
distinct phrases that works like a conversation in music", where "one musician
offers a phrase, and a second player answers with a direct commentary or
response."

The most directly usable statement of the rule comes from Ableton's *Making
Music*, in the chapter on **linear drumming** — a drum-programming discipline
in which "no two instruments can play at the same time". Its listed effects are
precisely the ones a build-puzzle would want:

- **It democratises the parts.** With no simultaneity, "each instrument is
  treated as having the same level of importance, rather than subconsciously
  assigning them to functional roles (like 'timekeeping' or 'accenting')."
- **It turns a stack into a line.** The pattern becomes "a single,
  quasi-melodic line of notes", a "composite line".
- **It is tempo-sensitive** — at fast tempos the same pattern "takes on a
  'rolling' character".

The chapter names hocket as the melodic parallel.

**We already do this, by hand, and documented it.** The header of
`src/audio/ladders/house.ts` states the design law of the shipped track: "the
bass answers the kick only in the gaps so the low end stays clean", the open
hats "ride the off-beats (steps 2/6/10/14)", "chords stab syncopated with an
anticipation into the next bar, and the lead sings call-and-response on top in
3-3-2 groupings". The bass chart is annotated "OFF-BEAT bass answering the
kick — staccato hits on 2/6/10/14, never on the kick's 0/4/8/12." Every one of
those is an interlock rule expressed as authored data. **The rules exist; they
are just baked into charts rather than enforced by the engine**, which is why
they cannot survive an arbitrary player build.

**What it structurally requires.** Two or more parts whose step choices are
*aware of each other*.

**Could it be a rule?** Yes, and it is the most obviously game-shaped device in
this document. A grid step is a discrete, countable, contestable resource; a
player can be shown "this slot is taken" without ever hearing the word
"syncopation". Rule-shaped statements it supports: one voice per step; a voice
placed in another's gaps scores higher; two voices that want the same steps
must resolve the conflict.

**Cost in our engine.** *Cheap in nodes, but it is the one device that needs
new architecture.* Nothing about it costs audio CPU — it is pure scheduling
logic. But `chartEventsAtStep` takes a single chart and `MusicEngine.onStep`
walks voices independently (`src/audio/arranger.ts`, `src/audio/engine.ts`);
there is no place in the current code where two voices are considered together.
A collision rule needs a per-step occupancy pass before triggering, or charts
authored in interlocking pairs, or generated charts that route around occupied
steps. That is a real design and implementation job — small in lines, large in
concept — and it lands on the file `docs/plan.md` calls "the main engine of the
game."

There is a further live consequence: Model A binds trigger to damage, so a
voice that is denied a step **loses that damage**. A conflicting build would
not merely sound worse; it would be weaker. That is a coupling worth naming
loudly, and it is #255's to resolve.

**Scarcity score: MAXIMUM.** 16 steps per bar is a hard, countable budget.

---

## 8. Energy curves across a whole DJ set

**What it does to the listener.** A set is a longer version of the same
mechanism, and its central rule is that **you cannot be at peak the whole
time** — the peak is defined by the valley. Mixed In Key's DJ guidance states
it directly: "at the peaks, you're telling your audience when to get excited;
at the valleys, you're giving them a chance to breathe", and "ebb and flow is
crucial".

The DJ-practice prohibitions are all shaped like scarcity rules — they are
about protecting low-energy space from being filled:

- "Don't mix from a high intensity section to an intro" — it loses momentum.
- "Don't mix from breakdown into breakdown" — "might work for a chillout room,
  but not the dance floor."
- "Don't mix from a breakdown into the high intensity section of another song"
  — too abrupt.
- "**Let the breakdown play all the way through**" without layering anything
  over it: "your audience needs a chance to rest."

(Mixed In Key, *Control the Energy Level of Your DJ Sets*; the same rule set is
reproduced and attributed to Vorobyev 2012 in Zurita Turk 2016 §1.4.)

The measured picture agrees. Across 4,902 DJ mixes, drop segments show "the
highest energy" in every frequency band; breakdowns show "low energy" "due to
the absence of many instruments"; ambient sections show the lowest; and energy
moves monotonically up into the drop and down out of it (Kim et al. 2026).
*Making Music* notes the dramatic arc scales all the way up to "entire DJ sets
lasting hours".

**What it structurally requires.** A long timeline with deliberate low points
that are *protected* — the one rule every source states in the negative is
"don't fill the valley."

**Could it be a rule?** Yes, at run scale, and it is the direct analogue of a
30-minute authored set (`docs/plan.md`, pillar 5). The rule-shaped version is a
budget or a refractory period: peak states are rationed, and something must be
spent or endured to reach one. Note the derived arithmetic from §1: a 30-minute
run at 122 BPM is about 57 sixteen-bar sections — a set-length timeline with
plenty of room for a real energy curve, currently spent on a monotone ramp.

**Cost in our engine.** *Free at the audio layer* — an energy curve is a
schedule, and the run already has one (`docs/mad-forest-spec.md`). The cost is
entirely in design: nothing in the current build system can go *down*.

**Scarcity score: MAXIMUM.** A peak that is always available is not a peak.

---

## 9. Tempo and key changes, and what they cost

### Tempo

**What it does to the listener.** Faster reads as more urgent; it also
mechanically increases how many events land per second. Our design already
acknowledges the second half: "raising tempo mathematically raises trigger rate
and therefore damage throughput" (`docs/plan.md`).

**What it costs — in the real world.** Two separate costs, and they are
different:

1. **The dancer's cost.** "In EDM, tempo changes are seldom made; the dancers
   need a steady and predictable framework on which they can rely and improvise
   within" (Solberg 2014: 70). Producers instead *simulate* a tempo increase by
   subdividing note values (§4c), specifically to get intensity "without the
   dancer being uncertain about the beat". This is a perceptual cost, and it is
   the one that matters most for a game where the player's hands are synced to
   the beat.
2. **The DJ's technical cost.** The classic "Four Percent Rule" states "you
   should never attempt to mix songs with a tempo that is more than four
   percent faster or four percent slower than your current song … Any more or
   less than four percent will usually cause a noticeable change in the 'pitch'
   of a song" — with time-stretching software extending that to roughly 16% at
   the price of artifacts: "the time stretching process may introduce
   artificial digital artifacts that may sound distorted" (Zurita Turk 2016
   §1.2.2, attributing the rule to Vorobyev 2012). Hardware players expose this
   as switchable pitch ranges (commonly ±6% / ±10% / ±16% / wide).

**What it costs — in our engine.** *Almost nothing, and this is a genuine
structural advantage.* `Clock` re-reads `bpm` and `rate` on every scheduled
step and computes `stepDuration` fresh; no buffer is ever stretched, so
technical cost #2 **does not exist for us**. The `rate` multiplier is already
wired to the game's global timeScale. What survives is cost #1 — the *player's*
sense of a stable beat — plus the damage-throughput coupling already noted in
`docs/plan.md`. Our engine is unusual in that the cheap thing in the real world
(subdividing) and the expensive thing (changing tempo) are *both* free here.

### Key

**What it does to the listener.** Moving a whole track up in pitch reads as a
lift. DJs use it deliberately: "A DJ technique called Energy Boost Mixing is
used to give some burst of excitement at any point in the set. It happens when
mixing into a key that is one or two semitones higher than the current key"
(Zurita Turk 2016 §1.3.1). Our own Track Lab "Pursuit" cover uses the same
device inside a track: the turnaround bar "transposes up a minor third (A root
→ C root), then slams back in".

**What it costs.** Harmonic compatibility becomes a constraint on what may
follow what. The Camelot wheel is the working tool: keys are numbered 1–12 with
an inner (minor, "A") and outer (major, "B") ring, and "for any key in the
Camelot Wheel, the three immediately adjacent keys are compatible" — from 8A
you may go to 7A, 9A or 8B (Mixed In Key's harmonic mixing guide: "5A can go to
4A, 6A or 5B smooth as a knife through butter"). Zurita records the arithmetic:
+7 on the Camelot number is up one semitone, +2 is up two semitones. Downward
moves de-energise, "a good technique to use towards the end of the set".

**Could it be a rule?** Yes, and it is nearly free of authored content: a key
change is a number added to every note. But this is exactly the territory
pillar 2 fences off — "never keys, scales, or BPM" in player-facing language —
so it can be a rule the *system* obeys and never a choice the player is shown
in those words.

**What it costs in our engine.** *Cheap but not free, and the reason is
specific.* Pitch is implemented as playback rate: `semitonesToRate(semitones) =
2^(semitones/12)` applied to `AudioBufferSourceNode.playbackRate`
(`src/audio/scale.ts`, `src/audio/engine.ts`). That is varispeed — the tape
trick. Transposing a sampled voice up therefore also makes it **shorter and
thinner**, and down makes it **longer and duller**; a large transposition
audibly changes the instrument, not just its pitch. Small moves (a semitone or
two, the DJ energy-boost size) are inaudible as timbre change; a fifth is not.
Two further engine-side constraints: the run's note set is minor pentatonic and
`validateChart` rejects any note outside it, and chord roots are restricted to
0/5/7 semitones (`src/audio/charts.ts`) — so "key change" in our system means
*moving the whole skeleton*, not a chord substitution.

**Scarcity score for both: NEUTRAL.** Neither adds nor removes layers. Key
compatibility is the only scarcity here — a constraint on *what may follow
what*, not on how much may play at once.

---

## 10. Summary table

Cost is against **this** engine as it stands at `58eb931`.

| Device | Effect on listener | Structurally requires | Rule-expressible? | Engine cost | Scarcity |
| --- | --- | --- | --- | --- | --- |
| **Sections & lengths** | Promise and payoff; predictable change points | Regular blocks of 4/8/16/32 bars | **Yes** — section = which charts are live | Cheap; **but charts cap at 4 bars**, so 8/16-bar shape must live above the chart layer | Neutral |
| **Subtractive arrangement** | The drop lands because the ground was removed | Something worth removing; return on a boundary | **Yes, strongest** — removal is an event | **Free** (`setVoiceEnabled` + `atNextBar`); negative CPU | **Max** |
| **Silence** | Tension from nothing at all | Density elsewhere to contrast with, and protection from being filled | **Yes** — a game can forbid a slot | **Free** | **Max** |
| **Risers / uplifters** | "Something is coming" | A non-groove sustained voice landing on a downbeat | Partly — the rule owns *when*, not the sound | **Medium** — sustained sound doesn't fit the one-shot-on-grid model; no ladder for the `riser` role | Negative |
| **Filter sweep** | Sound closes down / opens up | A persistent filter node + something to sweep it | **Yes** — one scalar, bindable to any game value | **Cheap** — one persistent `BiquadFilterNode` | Weakly positive |
| **Drum-roll / subdivision ramp** | Illusion of speeding up without changing tempo | Escalating subdivision resolving on a boundary | **Yes** — subdivision is an integer | **Free** — one extra chart | Negative |
| **Sidechain / pump** | Glue; kick sounds huge; whole mix breathes | A trigger voice and a shared bus | **Yes, as exclusivity** — low end holds one voice at a time | **Built** (kick→bass); Track Lab has the general duck bus | Positive |
| **Frequency separation** | Clarity vs mud | Known bands per voice; a decision about who wins | **Yes** — band as a finite slot | Static: **free**. Live EQ: **cheap**. Runtime detection: expensive & unnecessary | **Max** |
| **Rhythmic interlock / call-and-response** | One composite line instead of a pile; forward motion | Voices aware of each other's steps | **Yes, most game-shaped** — a step is a contestable slot | Cheap in CPU, **new architecture** — the arranger has no cross-voice awareness | **Max** |
| **Set-scale energy curve** | Peaks exist because valleys do | A long timeline with protected low points | **Yes** — ration the peak | **Free** at audio layer; all cost is design | **Max** |
| **Tempo change** | Urgency; mechanically more events/sec | A live clock | Yes | **Near-free** — no time-stretch; `Clock` re-reads bpm per step | Neutral |
| **Key change** | Lift (up) or wind-down (down) | Harmonic compatibility between what precedes and follows | Yes, but never in player-facing key language (pillar 2) | Cheap; **varispeed** means large transpositions change timbre; note set is pentatonic-locked | Neutral |

---

## 11. The scarcity axis, stated plainly

The ticket asked for a bias toward devices that imply scarcity. Sorting the
above:

**Devices whose entire payload is something being unavailable**

1. **Grid steps** (interlock/hocket) — 16 per bar, countable, contestable. The
   most game-shaped resource in music.
2. **Frequency range** (masking) — genuinely finite, no workaround, and already
   silently costing us (see `VOICE_MIX_GAIN`).
3. **Silence and removal** (subtractive arrangement) — the only device where
   *taking away* is the product, and the one with direct behavioural evidence
   behind it.
4. **Peak time** (set energy curve) — a peak that is always available is not a
   peak.
5. **The low end** (sidechain) — already enforced in our code, as proof that
   exclusivity can be expressed as sound rather than as UI.

**Devices that imply more layers** — risers, drum-roll ramps, additive
build-ups. These are how tracks are built, but they are what the game already
does, and they are what the map identifies as the failure.

**The one crossover finding worth stating on its own.** In the motion-capture
study, the build-up that added and swept (a long low-pass opening over an
unbroken groove) produced a *measurably weaker* response than the build-up that
removed and returned. Adding is the weaker of the two devices, empirically, in
the exact genre this game is made of.

**And the finding that most directly indicts the current ladders.** Solberg:
EDM "expands in textural density rather than length", with elements
"introduced, changed **and removed** after 2, 4, 8, 16 or 32 bars". Our ladders
implement the first clause and the first two verbs. Nothing in
`src/audio/ladders/house.ts` ever removes anything: every rung is ≥ the rung
below, for every one of the eight roles (§1).

---

## 12. Not verified / flagged

Stated explicitly so nothing here is mistaken for established fact.

1. **Solberg 2014 page numbers** were pinned by locating each quotation
   between consecutive running heads in the locally text-extracted PDF
   (pp. 61–82), not read off the published layout. A sentence that straddles a
   page break can therefore be attributed to either side of it. Quotations
   themselves are verbatim.
2. **Bar counts for Solberg's case-study sections are not derivable.** She
   gives clock times ("Build-up 1" 03:12–03:44 = 32 s; "Build-up 2"
   03:44–04:00 = 16 s; "Breakdown 2" 02:56–03:12 = 16 s) but not the BPM of
   "Body" by Cinnamon Chasers. She states only that the case studies sit in a
   typical "average dance tempo between 120–130 BPM". At that range 16 s is
   8–8.7 bars and 32 s is 16–17.3 bars, which is *consistent* with the 8/16-bar
   convention but is not evidence of it. **Not treated as a measurement.**
3. **The Raveform figures** (16-measure modal segment length, the
   intro–buildup–drop–breakdown–drop–cooldown–outro order, the sub-band energy
   ordering) come from the article's text and figure descriptions as returned
   by the fetch tool. The underlying figures (Fig. 11, Fig. 12) were **not**
   inspected directly.
4. **The "Four Percent Rule" and Camelot arithmetic** reach us through Zurita
   Turk 2016, which attributes them to Vorobyev (2012), *Beyond Beatmatching*,
   and to mixedinkey.com. The Mixed In Key harmonic-mixing page confirms the
   adjacency rule (±1 number, or the A/B switch) verbatim but **does not**
   state the semitone arithmetic on the page fetched. The +7-Camelot-steps =
   +1-semitone claim is internally consistent (seven perfect fifths ≡ 1
   semitone, mod an octave) but is **secondhand**.
5. **Pioneer CDJ pitch ranges (±6 / ±10 / ±16 / wide)** were seen only in
   search-result summaries and third-party manual mirrors. Pioneer's own
   documentation was **not** fetched. Treat as indicative, not sourced.
6. **Psychoacoustics of masking** — critical bands, the Bark scale, Fletcher
   and Zwicker — were **not** obtained from a primary source; the accessible
   results were paywalled or low-trust. Everything §6 says about masking is
   sourced to *Sound On Sound* trade practice, which is enough for production
   decisions and is **not** enough for any numeric claim about critical
   bandwidths. No numbers are asserted.
7. **Ableton *Making Music* is partial online** — 24 of 74 chapters. Passages
   quoted are verbatim from the fetched chapter pages; chapters not online were
   not consulted. Web fetches return a summarising pass over the page, so short
   quoted fragments are verbatim while surrounding framing is paraphrase.
8. **"Diminishing Returns"** was fetched on the assumption it concerned
   over-layering. It does not — it is about when to stop revising a track. Not
   used.
9. **No source was found that states a bar-count convention specifically for
   the emptied bar before a drop.** The one-bar full-drum cut is documented in
   our own repo from a Songsterr transcription of Gesaffelstein's "Pursuit"
   (`src/experiments/tracklab/tracks/pursuit.ts`), and Solberg documents a
   sub-bar "micro vacuum moment", but the general claim "the bar before a drop
   is emptied" is **not** established as a convention by anything cited here.
   It is well-attested as a *practice*; its conventional *length* is not.
10. **The "pump as genre staple" phrasing is unattributed.** The lines about
    the whole mix pulsing on every kick and Daft Punk's "One More Time" came
    from a site-restricted search summary spanning several soundonsound.com
    articles, not from a single fetched page, so no author or issue date can be
    given. The *mechanism* of side-chaining in §5 is verbatim from the fetched
    Houghton (2008) and White (2011) articles and is properly attributed.
11. **Engine claims are read from code at `58eb931`, not measured.** No
    profiling was run. "Cheap" and "expensive" mean structural fit and
    implementation surface, not measured CPU.

---

## 13. Pointers for the triad

Observations only. Which of these matter, and what should be done about them,
belongs to the divergent design ticket — nothing here proposes, recommends, or
ranks a direction.

### (a) The shape of a run

- Every source converges on the same unit of change: **4, 8, 16 or 32 bars**,
  with 16 bars (≈30 s at club tempo) the modal section length across 1,423
  annotated tracks. Our chart layer caps at **4 bars** and our phrase counter
  is 4 bars, so any 8/16/32-bar shape has to be built *above* charts.
- Derived: a 30-minute run at 122 BPM is **≈915 bars ≈ 57 sixteen-bar
  sections**. The run is already exactly the length of a DJ set, measured in
  the units the genre uses.
- The canonical track order is **intro → buildup → drop → breakdown → drop →
  cooldown → outro**, and the canonical *set* rules are prohibitions on filling
  the valleys ("let the breakdown play all the way through"). Both are shapes
  that go down as well as up. The current run shape has no down.
- Named sections switched on a bar boundary already exist and are already
  proven in this codebase (`src/experiments/tracklab/labengine.ts`).
- **Live conflict to surface, not to settle here:** `docs/plan.md` gives the
  stage exactly two musical hooks and forbids it touching "the build's charts,
  notes, or arrangement". A section system driven by the *stage* violates that;
  one driven by the *build* does not.
- Solberg & Jensenius measured a room *more* energised after a removal-return
  cycle than it had been before — a run shape that dips can end higher than one
  that only climbs.

### (b) What powering up buys

- Right now it buys **events per bar, monotonically**: every ladder rung in
  `src/audio/ladders/house.ts` is ≥ the rung below it, for all eight roles
  (table in §1). That is the complaint in #247 written as data.
- The genre's own vocabulary for "more" is not only "more notes". The sourced
  intensity devices split into: more events (drum-roll subdivision), more
  layers (uplifters), *fewer* layers (breakdown), narrower tone (filter),
  higher pitch (energy-boost key change), and faster clock (tempo). Only two of
  those six are density.
- **Subdivision is the sourced substitute for tempo**, chosen by producers
  precisely to avoid destabilising the dancer. In our engine both are free, so
  the usual reason to prefer one is absent.
- **Evolution already changes character rather than count** — evolved voices
  get a live filter and saturation in `trigger()`, not extra chart events.
  A qualitative-change precedent exists in the code.
- Because of Model A, anything that changes note count changes damage. Any
  power currency that is *not* note count (tone, exclusivity, timing, section
  access) breaks that coupling — which is either the point or a problem.

### (c) What constrains a build

- Four resources in this domain are genuinely finite, and all four are
  countable without music-theory words: **grid steps** (16/bar),
  **frequency range** (low/mid/high), **the low end** (one voice at a time),
  and **peak time** (a peak requires a valley).
- **Two of these are already enforced in our code and invisible to the
  player**: the kick→bass sidechain enforces low-end exclusivity, and the
  master limiter (−10 dB, ratio 8) means past a point extra voices make the
  track flatter rather than louder. The engine already punishes density; it
  just does so silently.
- **The interlock rules already exist as authored data, not as enforced
  rules.** `src/audio/ladders/house.ts` states them in prose ("the bass answers
  the kick only in the gaps", hats on off-beats, lead in call-and-response) and
  bakes them into charts. They cannot survive a build the author did not
  anticipate.
- The single missing capability for step-level or band-level exclusivity is
  **cross-voice awareness at schedule time**. `chartEventsAtStep` sees one chart
  (`src/audio/arranger.ts`); `MusicEngine.onStep` walks voices independently.
  Small in lines, large in concept, and it lands on the file `docs/plan.md`
  calls "the main engine of the game".
- **Direct contradiction to put to the designer:** `docs/plan.md` currently
  says collision is allowed and is "the player's own doing". Every scarcity
  device in §11 works by making collision *cost* something.
- Model A means a denied trigger is denied damage. Any exclusivity rule is
  simultaneously a mix rule and a DPS rule unless something decouples them.
- The devices that are free-to-negative in engine cost are exactly the
  scarcity ones: muting, silence, removal, step budgets, band budgets. The
  devices that need new plumbing (sustained risers) are the additive ones.

---

## Sources

All fetched **2026-07-25** unless noted.

**Peer-reviewed**

- Solberg, R. T. (2014). "'Waiting for the Bass to Drop': Correlations Between
  Intense Emotional Experiences and Production Techniques in Build-up and Drop
  Sections of Electronic Dance Music." *Dancecult* 6(1): 61–82.
  <https://dj.dancecult.net/index.php/dancecult/article/view/451>
  (PDF galley text-extracted locally.)
- Solberg, R. T. & Jensenius, A. R. (2017). "Pleasurable and Intersubjectively
  Embodied Experiences of Electronic Dance Music." *Empirical Musicology
  Review*. PDF fetched from
  <https://pdfs.semanticscholar.org/ea7b/70b1a3b10aad40f9f54aa1b2ad01c2990bc9.pdf>
  and text-extracted locally; the journal's own galley
  (<https://emusicology.org/article/4725/galley/5167/download/>) was **not**
  fetched, so the copy used is a mirror, not the publisher's file.
- Kim, T., Kim, J., Kim, H. & Nam, J. (2026). "Raveform: A Dataset of Metrical
  and Functional Structure Annotations for EDM Tracks in DJ Mixes."
  *Transactions of the International Society for Music Information Retrieval*
  9(1): 131–143. <https://transactions.ismir.net/articles/10.5334/tismir.288>

**Thesis**

- Zurita Turk, V. (2016). *Exploring structural sections in EDM DJ-created
  radio mixes with the help of automatic music descriptors.* MSc thesis, Music
  Technology Group, Universitat Pompeu Fabra.
  <http://mtg.upf.edu/system/files/publications/Vincent-Zurita-Master-thesis-2016.pdf>
  (Text-extracted locally.)

**Production literature**

- DeSantis, D. *Making Music: 74 Creative Strategies for Electronic Music
  Producers* (Ableton). Chapters fetched:
  [Arranging as a Subtractive Process](https://makingmusic.ableton.com/arranging-as-a-subtractive-process),
  [Common Forms 1: Elements of Song Form](https://makingmusic.ableton.com/common-forms-1-elements-of-song-form),
  [Dramatic Arc](https://makingmusic.ableton.com/dramatic-arc),
  [Programming Beats 2: Linear Drumming](https://makingmusic.ableton.com/programming-beats-2-linear-drumming),
  [Silence and Noise](https://makingmusic.ableton.com/silence-and-noise).
- Ableton, *Learning Music* — [Song structure](https://learningmusic.ableton.com/song-structure/song-structure.html).
- Houghton, M. "How To Achieve Better Separation In Your Mixes." *Sound On
  Sound*, September 2022.
  <https://www.soundonsound.com/techniques/how-achieve-better-separation-your-mixes>
- Houghton, M. "Side-chaining." *Sound On Sound*, February 2008.
  <https://www.soundonsound.com/techniques/side-chaining>
- White, P. "Mix Tips For Kick & Bass." *Sound On Sound*, September 2011.
  <https://www.soundonsound.com/techniques/mix-tips-kick-bass>
- Walden, J. "Cubase: Creating Risers & Impacts." *Sound On Sound*, February
  2021. <https://www.soundonsound.com/techniques/cubase-creating-risers-impacts>
- Walden, J. "Dance Music Filter Effects with Cubase 5." *Sound On Sound*, May
  2010. <https://www.soundonsound.com/techniques/dance-music-filter-effects-cubase-5>

**DJ practice**

- Mixed In Key, *Control the Energy Level of Your DJ Sets*.
  <https://mixedinkey.com/book/control-the-energy-level-of-your-dj-sets/>
- Mixed In Key, *Harmonic Mixing Guide* (Camelot wheel).
  <https://mixedinkey.com/harmonic-mixing-guide/>

**Technical**

- W3C, *Web Audio API 1.1* (`BiquadFilterNode`, `DynamicsCompressorNode`,
  `GainNode`, `AudioBufferSourceNode.playbackRate`, `AudioParam` automation).
  <https://www.w3.org/TR/webaudio-1.1/>

**Definitions**

- Hocket. <https://en.wikipedia.org/wiki/Hocket> (tertiary; used only for the
  term's definition and etymology.)
- Call and response (music).
  <https://en.wikipedia.org/wiki/Call_and_response_(music)> (tertiary, same
  caveat.)

**This repo, read at `58eb931`**

`src/audio/scale.ts`, `src/audio/charts.ts`, `src/audio/clock.ts`,
`src/audio/arranger.ts`, `src/audio/engine.ts`, `src/audio/groove.ts`,
`src/audio/kits.ts`, `src/audio/soundset.ts`, `src/audio/ladders/house.ts`,
`src/audio/cues/noise.ts`, `src/experiments/tracklab/labengine.ts`,
`src/experiments/tracklab/tracks/types.ts`,
`src/experiments/tracklab/tracks/pursuit.ts`,
`src/experiments/boss/conductor.ts`, `src/game/config.ts`, `docs/plan.md`.
