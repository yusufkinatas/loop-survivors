# The Gig — three songs, and you record the patterns

Round-1 prototype for [#268](https://github.com/yusufkinatas/loop-survivors/issues/268),
on branch `proto-gig` off [`prototype-base`](prototype-base.md) at `3fd6d24`.
Built **agent-driven** per the map's round-1 override
([#247](https://github.com/yusufkinatas/loop-survivors/issues/247)): every design
call this session made is recorded here and on the ticket **as a call, with the
alternative named** — never as a fact.

The question this is built to answer, in #268's words:

> **Can a player cut their own patterns under fire and get music that is good —
> and does making it beat finding it?**

The answer is allowed to be no, which is why the second half of that question
ships as a **toggle** rather than as an argument: `autoTakes` hands the same
instruments the same hit budgets and lets the *system* cut the patterns off the
authored ladder. Flip it between runs and the comparison is a thing you play, not
a thing you reason about.

---

## What a run is

| | |
|---|---|
| **SONG 1 · LOAD-IN** | 0:00–5:00 · 95 BPM · heavy shuffle · Mad Forest minutes 0–4 |
| **CHANGEOVER** | 5:00–5:25 · the room empties · already at 124 |
| **SONG 2 · THE FLOOR** | 5:25–10:25 · 124 BPM · house shuffle · Mad Forest minutes 8–12 |
| **CHANGEOVER** | 10:25–10:50 · already at 140 |
| **SONG 3 · LAST CALL** | 10:50–15:50 · 140 BPM · dead straight · Mad Forest minutes 20–24 |
| **ENCORE** | 15:50–17:20 · Mad Forest's minute 29, its hardest authored row |

17:20, and it ends on an encore rather than on a clock — the **summit**
[#253](https://github.com/yusufkinatas/loop-survivors/issues/253) asked for. This
breaks pillar 5 completely and deliberately, which #268 said it would.

## What a level-up buys

**Tape.** A weapon does not arrive with a pattern; it arrives as a bar of empty
tape. You tap out a rhythm under fire, the system quantises it so it cannot land
wrong, and from that moment it loops and attacks forever. A level does not buy a
better pattern — it buys a **longer loop and more room on it**, and then hands
you the microphone again.

The eight-rung tape ladder, its per-bar density, and how many taps each pass
actually asks for are all in [`gig/density.md`](gig/density.md), generated from
the source. Two properties are load-bearing:

- **Per-bar density never falls as you climb** (2.00 → 7.00). A level-up that
  quietly thinned your track would be a trap, and the hard floor
  ([#256](https://github.com/yusufkinatas/loop-survivors/issues/256)) asks for
  density to fall *because the player chose it*.
- **A track's whole eight-rung life costs 14 taps.** When the loop grows, what is
  already on the tape is **copied** into the new bars, so a rung only ever asks
  for the delta — one to three hits. That is what keeps this an overdubbing
  session rather than a button-mashing test; #253 ranked build knowledge above
  judgment above execution, and a ladder that demanded 28 taps in one pass would
  invert that order.

## What constrains a build

**The valley, and it is the whole cost model.** While an instrument is being
recorded it does not attack. Three kinds of pass, and the difference between them
is the economy:

| pass | when | the instrument | budget |
|---|---|---|---|
| **NEW TAKE** | a new track | **silent**, no damage | the whole rung |
| **OVERDUB** | every level-up | **audible**, no damage | the rung's delta (1–3) |
| **RE-CUT** | free, voluntary, any time | **silent**, no damage | the whole rung again |

An overdub being audible while not attacking is legal on purpose: #255 locked
only one direction of the coupling — *"if a weapon is not audible, it is not
attacking. The converse does not hold."* An audible event that produces no attack
is exactly the case the unlocked direction leaves open, and it is what lets a
level-up cost damage without costing the player their reference. You hear the hole
your existing loop leaves and you fill it with your hands — #255's own words for
this package's interlock.

**And the re-cut is what the changeover is built around.** It is free and always
available, so what you cannot afford is not the tape — it is the *time*. A
changeover is 25 seconds; a four-bar re-cut costs one loop of that (7 s at 124,
10 s at 95). You can re-cut two or three tracks, not five. Specialise for the
coming song and arrive at the one after it with tape built for the wrong tempo;
generalise and win none of the three outright.

---

## The design calls this session made

Each is a call, not a fact. The alternative is named for every one.

### 1. Genre is faked as tempo, shuffle, pressure and offer weights — never as a per-instrument multiplier

#268 asked for genre-shaped strength: *"an instrument that rules a slow heavy
song can be dead weight in a fast one."* The obvious build is a damage multiplier
keyed on the palette's seat × attack grid.

**That is not available.** [#266](https://github.com/yusufkinatas/loop-survivors/issues/266)
ruled the grid **a mixing taxonomy, never a gameplay rule** — the designer's own
words were *"to prevent the creativeness"* — and authoring a parallel table that
means the same thing is the same move wearing a hat.

**What replaces it is better, because it is entirely audible: the take itself is
the genre-shaped thing.** A dense take cut at 95 becomes a blur at 140, and on a
choking voice (a new note cuts the ringing one — bass, sub, upright, drone, organ
and flute all choke) it becomes a stutter where every note is killed before it
speaks. A sparse take that sounded lost at 95 is a groove at 140. So the
dead-weight instrument is *your own performance in the wrong song*, with nothing
hidden in a table — and whether the changeover is worth its cost becomes a real
question rather than an arithmetic one.

**The alternative, named:** author a per-song, per-role strength table that is
not derived from the grid. Rejected as a dodge of a ruling, and as the exact
disease this map exists to treat — a silent number deciding what the music does.

### 2. Grouping: left open

#268 made grouping this stack's own call. **Any five voices, ungrouped.**

The reason is the premise: The Gig's constraint is the player's hands and the
clock, not the roster. Role-exclusive slots would have the game make the
arrangement decision that recording exists to hand to the player. The only thumb
on the scale is the per-song **offer weight** — an offer-weight knob exactly like
the base's existing early-drum nudge, and explicitly not a grouping.

**The alternative, named:** Bandwagon's role-exclusive slots (one low end, one
lead, one chord), which #258 carried up as legible constraint without
music-theory words. It would work here, and it would take the interesting half of
the decision away.

### 3. The texture seat cannot be performed, so it is excluded — and that is a finding, not a tidy-up

`pad` and `air` are **beds**: one continuous looping source that starts when the
weapon is owned and never re-articulates. A bed has no firing moment, so there is
no rhythm to perform — and a voice you could own **without ever cutting a take**
would be the only free lunch in a stack whose entire cost model is the recording
pass. Two beds in a five-slot band is a build that never pays a valley.

So **The Gig is a seventeen-voice band**, and "the texture seat cannot be
performed" is a limitation this stack owes upward rather than a bug in it.

**The alternative, named:** keep them and let a take's hits buy the bed's
*presence* instead of its rhythm. That is a second, different power currency
bolted on to rescue two voices, and it hides the free lunch rather than removing
it.

### 4. Evolution buys tape, so max level is finally audible

Evolution is musically silent everywhere in this game — locked as a rule on the
map after [#273](https://github.com/yusufkinatas/loop-survivors/issues/273)
measured it, with #273's own challenge: *"a stack that wants max level to be
audible has to make it audible itself."*

The Gig has a nearly free answer because its whole currency is tape: an
evolution grants **+4 hits**, permanently (a later re-cut keeps them), and you
**overdub into them**. Max level becomes something you can hear *and* something
you authored. Rides the `evoTape` toggle.

**The alternative, named:** leave evolution exactly as #273 shipped it and add
nothing, on the grounds that a new audible-evolution rule confounds *"did
recording work?"* with *"did this new rule work?"*. That is precisely why it is a
toggle.

### 5. A pass that ends with nothing played falls back to the system's take

The strongest form of #255's own mitigation list (*"let the system silently
correct a take"*). A player who never found the key, or bailed instantly, gets
the authored pattern rather than one hit on the downbeat. `normalizeTake` would
give a legal, playable track either way; this gives a musical one.

**It also means the player can decline.** Bail out of a pass and the system cuts
it for you — the `autoTakes` arm, available one take at a time. That is how the
stack answers *"recording under pressure is stressful rather than exciting"*
without removing the pressure.

### 6. The digits are the verb; the base's mute toggle moves to SHIFT

`1`–`5` **re-cut** a track. In a changeover, `SHIFT`+`1`–`5` **drops** it and puts
three replacements on the floor. In a song, `SHIFT`+`1`–`5` is the base's
deactivate toggle.

**The alternative, named:** leave the bare digits as the deactivate toggle and
put re-cut elsewhere. Re-cutting is the stack's whole verb and deactivation is a
dev mechanism; the verb wins the good keys.

### 7. A dropped track leaves half its tape behind

Giving something up is #268's third changeover word. A dropped track's
replacement inherits `floor(level / 2)` rungs, so a swap costs real investment.

**The alternative, named:** a replacement starts from scratch at rung one. Then
swapping is strictly worse than keeping almost any track past the early game, the
move exists and is never taken, and it fails the same test #255's pistol test
applies to instruments.

### 8. The first count-in is fourteen seconds; the later ones are six

The gig's opening move is *walk onto an instrument, wait for it to enter on the
next bar, record its first bar with nothing else playing* — three bar lines
before a single note attacks anything. That is the one place The Gig could
genuinely make a player defenceless, and #255's **floor rule** forbids it. Songs 2
and 3 get six seconds, because #268 wants song three to *"open deliberately thin
because you just rebuilt"* and a generous window there would soften exactly the
beat under test.

### 9. What was deliberately NOT built

- **The L3 arm** (the player chooses notes, not only rhythm). #255 left it on the
  table above the designer's stated L2 ceiling, and #268 kept it as a toggle *"so
  the other side of the line can be seen rather than argued about."* It is not
  built here. **This is the one thing on #268's ticket this session did not
  deliver**, and the reason is that it is not a toggle over this build — it is a
  different input surface (a pitch grid, a way to see and choose a note) with its
  own legibility question, and shipping a half version of it would answer the
  wrong question. Called out as owed rather than quietly dropped.
- **The Soundset toggle** (soundsets contested, one voice per soundset at a time).
  Also on #268's toggle list, also not built: it is a roster-scarcity rule that
  has nothing to do with whether recording works, and it carries an owed problem
  from #255 (cohesion must not be a free dividend for picking same-genre things).
- **role-exclusivity**, per call 2.

---

## The layers, and how to switch them

Every layer rides as an in-branch toggle (#256). URL, or the `gig` row in the
debug tray (⚙), or `loop.gig.setLayer(name, on)`. A change takes effect on the
**next** run — half of them change what a run shape is.

```
?gig=all                 everything on (the default; autoTakes off)
?gig=none                the base game, on this branch's code
?gig=takes               ONLY recording — the base's 30-minute Mad Forest run,
                         at 122 BPM, with player-cut patterns
?gig=all,-takes          the three-song set with the authored ladder
?gig=all,autoTakes       the whole stack with the SYSTEM cutting every take
```

| layer | what it is | default |
|---|---|---|
| `takes` | the recording mechanic — the player performs every pattern | on |
| `autoTakes` | the system performs them instead. **The control arm** | off |
| `songs` | the three-song set: three tempos, three curves, changeovers | on |
| `swap` | the changeover's drop-and-rehire | on |
| `evoTape` | evolution grants +4 hits | on |
| `tempoComp` | per-trigger damage scaled against the song's tempo | on |

With `songs` off the run is handed straight back to Mad Forest's 30 minutes at
122 BPM — verified: `victoryAtS` 1800, swing 0.10, sixteen starting bodies, no
song card.

## Screens

Three, and all three obey #253's rewritten pillar 3 — *the music is the reward,
the screen is the information*. **Nothing is stated in music-theory terms**: no
key, no scale, no note name, and no BPM as a number (the card shows tempo as a
row of pulse marks, the way a tape deck shows a speed).

- **The card**, top right. Which song, how long is left, how fast.
- **The strip**, bottom centre, only while a pass is live. The tape you are
  cutting: sixteen slots a bar, the playhead, what is already down (dim), what you
  just laid (lit), and the budget left as pips.
- **The rack** — the set drawn as one mini strip per track, with each track's
  density. Lives in the changeover, and on the pause screen's `.pause-arrange`
  slot, which is the empty node #265 left mounted for exactly this.

## Capture set

[`docs/gig/`](gig/README.md) — nine points, the same rig, tap and 16-bar takes as
`docs/baseline/` and `docs/palette-control/`, plus a Gig-specific plan because a
build here is a set of performances that no weapon level can name.

## Base changes

Per the round-1 protocol, seams this stack needed that all five branches share
went to `prototype-base` via their own PR rather than into this branch: three
engine methods (`setVoiceChart`, `addStepListener`, `atNextLoopTop`),
`StageScript.victoryAtS`, `RollShaping` on the offer roll, and `--port` on the
capture receiver. See the ticket for why each one is shared rather than local.

## Files

```
src/game/gig/tape.ts        the tape ladder, and the theory the system owns
src/game/gig/recorder.ts    the recording pass: audio time -> a 16th note
src/game/gig/songs.ts       the set list and three pressure curves
src/game/gig/gig.ts         the controller, and every design call in comments
src/game/gig/strip.ts       the card, the strip, the rack
src/game/gig/toggles.ts     the layers
docs/gig/                   the capture set, its rig, and the density table
```
