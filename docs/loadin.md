# The Load-In — The Stage

Round-1 prototype for [#269](https://github.com/yusufkinatas/loop-survivors/issues/269),
branched from [`prototype-base`](prototype-base.md) at the nineteen-voice palette.

> **The question.** Does a survivors-like still work when you are not the thing
> carrying the weapons — and does picking your band up and running feel like a
> valley you authored?
>
> The answer is allowed to be no.

**Built agent-driven**, per the map's round-1 override ([#247](https://github.com/yusufkinatas/loop-survivors/issues/247)):
every design call in this document was made by the session rather than by the
designer, and each one names the alternative it beat. This build is explicitly
disposable and a steered redo is the known fallback.

---

## What a run is

You are a **roadie**. You carry no weapon and you never will.

The band is **five pieces of gear standing on the floor of a venue**. Each piece
plays one voice, and it hits whatever comes near *it* — not near you. So the
build stops being a list and becomes a **stage plot**: where the band stands.

Your job is four verbs, all physical:

| | |
|---|---|
| **move** | WASD / arrows / touch |
| **pick up** | `E` — lift the nearest piece. What you carry is **silent**, and silent is not attacking |
| **set down** | `SPACE` — everything on your back goes down at once, in a ring |
| **right** | walk onto a knocked-over piece to stand it up |

**You are the bait.** Enemies chase you and always have; gear only hits what
walks past it. So the loop is dragging the crowd across your own stage — and
every second you leave them standing in your amps costs the gear.

That is the answer to the ticket's first kill criterion. *"Being unarmed is
passive"* would be true if the band defended you. It doesn't; you feed it.

---

## The constraint: geometry, on the real map

Three distances, one rule, readable off the floor without a single word of music
theory:

```
0 .. presence sum        MASKED    they are stepping on each other      output down to 0.40
presence sum .. + band   CABLED    a wire runs between them             output up by 0.18 each
beyond that              ALONE     they cover separate ground           output 1.00
```

The cable band **starts exactly where masking ends**. That is deliberate: the
sweet spot is not a third number to learn, it is *"just far enough apart not to
muddy each other"*.

On top of that the venue has **power sockets**. A piece standing on one is
louder still (+0.25) and **cannot be knocked over** — safety bought by standing
where the socket is rather than where the geometry wants you.

Everything lands in **one number per piece, `rig.output`**, and that number
scales the voice's gain *and* the weapon's damage. Sound and damage move
together or the stack has quietly broken the thing the map exists to fix.

**Measured** (`npx tsx tools/verify-loadin.ts`, five maxed weapons, identical
build every row):

| stage plot | output | masked | wired | plugged |
|---|---|---|---|---|
| the blob — everything in one clump | 0.40 | 5 | 0 | 0 |
| scattered to the walls | 1.00 | 0 | 0 | 0 |
| a drop — the ring the set-down makes | **1.36** | 0 | 5 | 0 |
| every piece on a socket (Festival Field) | 1.01 | 2 | 0 | 5 |

**Worst to best is 10.6 dB and ×3.4 damage at the same build and the same
levels.** `docs/baseline/` measured the shipped game at a loudness range of
0.4–0.6 LU *at every point on the curve* and ×13.5 the triggers buying 2.8 dB.

## The valley

Hauling. Carried gear is silent, so it deals nothing, so the run's density falls
— **because the player chose it**, which is the hard floor #256 set.

| | triggers/bar | move speed |
|---|---|---|
| band standing | 13.75 | ×1.00 |
| carrying 1 | 12.50 | ×0.87 |
| carrying 2 | 8.50 | ×0.74 |
| carrying 3 | 6.00 | ×0.61 |
| carrying 4 | 3.00 | ×0.48 |
| carrying 5 | **0.00** | ×0.35 |
| set down | 13.75 | ×1.00 |

The baseline's own curve went 2.00 → 23.00 triggers/bar and **never once fell**.

**Depth is how much you picked up.** One piece is a small dip you can take
mid-fight; the whole band is total silence, no damage at all, and 35% move
speed. That is the deepest valley the game can offer and it is entirely
voluntary.

**The drop is a payoff, not a penalty.** The set-down ring is sized from what is
on your back so adjacent pieces land in the *cable* band: put the band down and
it comes back **wired**, at 1.36. Where you choose to stand still decides
everything — which sockets you land on, how close the walls are, and whether the
ring lands on top of whatever you left standing.

---

## Every design call this session made

Agent-driven mode obliges a record. Each of these is **a call, not a fact**, and
each names the alternative it beat.

### 1. Masking is flat, not seat-weighted

Any two pieces mask each other by the same rule regardless of which seat they
sit in. **Alternative:** weight it by #266's seat grid, so two low-anchor voices
smear worse than a bass and a bell. Rejected because it only makes sense with
seat exclusivity *off* — with it on, no two pieces ever share a seat, so the
weighting would never fire. Flat is also the version a player can read off the
floor without learning a taxonomy.

### 2. Grouping is **one slot per seat** (the `exclusivity` layer, on by default)

`docs/plan.md`'s "no categories, no typed positions" is unlocked for round 1
(#256), and this stack spends the unlock. A build is one voice from each of
lowAnchor / harmonicBody / brightLine / percussion / texture.

**Why:** the build *is* five objects on a floor, so the thing that has to be
true is that the five sound like five different things. Bandwagon's
role-exclusive slots, carried over from [#258](https://github.com/yusufkinatas/loop-survivors/issues/258),
and legible without a music-theory word.

**Alternative:** the base's flat cap of five. It is the toggle, and it is the
case where the merged-kit layer starts doing real work.

### 3. The merged kit is a toggle, on by default, and mostly invisible

#258's unclaimed finding — one member covering a whole percussion kit under a
single visual — ships as the `mergedKit` layer: several percussion hires fold
into one riser. With seat slots on you only ever own one percussion voice, so it
is a no-op; it earns its keep when exclusivity is switched off, which is
precisely the configuration where five separate drums would otherwise be five
separate boxes to place, protect and haul.

### 4. Run-to-run variance is **the venue**, not the roster

Five rooms — The Basement, The Club, The Theatre, The Warehouse, The Festival
Field — differing in size, shape and where the power is. A run rolls one and
mirrors it.

**Why:** #253 asked that run two *plays* differently, not merely sounds
different, and this stack's play is entirely about where things stand. A
cramped room with three outlets on one wall is a different puzzle from a field
with two stages and a long walk between them, and you can see which one you are
in before making a single decision.

**Alternative:** roll the offer pool — a run draws a subset of the nineteen
voices. That is the conventional answer and it makes run two *sound* different.
It does not make run two *play* differently.

### 5. Crew is the second currency — and it only half works

A level-up may offer **Crew** instead of a weapon: eight rungs, each one making
carried gear lighter, the carry floor higher, and the gear tougher.

**Why:** #265 measured the base's build completing at **13:27** with passives
cut, after which every level-up is an Encore. Each stack's own currency is what
has room to fill that, and the ticket says this stack's power buys "how fast
gear can be moved".

**Alternative:** let the back half be Encores, as the base does. Rejected — that
is the measured hole, not a feature.

**Measured, and it does not close the hole.** Same harness, same mover, same
seed, thirty minutes each — the `BASE` row is `placement` off, which is
`prototype-base` in-branch:

| | last level-up that added anything | Encores after it |
|---|---|---|
| **BASE** (`placement` off) | 12:17 | 40 |
| The Load-In, `crew` off | 12:53 | 33 |
| The Load-In, `crew` on | **15:08** | **18** |
| The Load-In, `crew` on, second seed | **14:12** | **18** |

Two things come out of that. **The control reproduces #265's finding** — the base
runs dry at twelve minutes and pays forty dead level-ups — which is what makes
the other rows worth reading. And **crew buys about two and a quarter minutes and
halves the dead level-ups, and that is all**: eight rungs is not enough to fill
a seventeen-minute back half. Closing it needs more rungs, or a currency with no
cap, or something that is not a ladder at all. Taking crew also visibly costs
weapon levels (kills fall 9851 → 8174), which is the trade working as intended.

### 6. The arena is **bounded**

"Run shape: a place" is the premise, and a place with no edges is a plane.
Spreading out is free on a plane, so the geometry constraint would evaporate.
The camera stops at the walls rather than following you through them.

**Alternative:** the endless plane with sockets anchored to the origin. It is
the `venue` layer, off.

### 7. Enemies damage gear but never target it

A body standing in a piece of gear wears it down; nothing ever *walks toward*
one. **Why:** targeting would delete kiting — the genre's whole defensive verb —
and would turn the roadie into a tower-defence goalkeeper. Not targeting is what
makes the roadie a *lure* instead.

**Alternative:** enemies aggro on the nearest object. That is a different game
and it is what the `hauling` layer switched **off** approximates.

### 8. Righting a downed piece is instant on touch

**Alternative:** a hold-still repair timer. Rejected: a timer spent standing
still in the crowd is a punishment with no decision in it. The cost of a
knockdown is the *trip*, which is already paid in silence and distance.

### 9. Hauling silences and un-silences **immediately**, not on a bar line

Lift the amp, it stops. Set it down, it plays. **Why:** the physical read is the
whole mechanic, and because charts are indexed by position-in-phrase, a voice
re-entering mid-bar still lands on the grid.

**Alternative:** quantize the set-down so the whole stage returns on a downbeat.
It is a layer (`quantizeDrop`, off) precisely because it is a real trade —
immediacy against a cleaner musical entry — and worth an A/B.

### 10. Two keys, not one held key

`E` gathers one piece at a time; `SPACE` returns all of it. **Why:** *how much
did you pick up* is the depth of the valley you are choosing, so gathering has
to be a repeated decision. A hold-to-grip binding would collapse both verbs into
"how long did you hold the button".

### 11. Evolutions are kept

No competing transformation system, they are already built, and evolved geometry
is *more* reason to care where gear stands — a bigger footprint is more masking.
They remain musically silent (#273), and this stack does not fix that.

### 12. The Crowd is a toggle, off by default

Package 19 as a win condition, hosted here per #256. Converted bodies become
fans who soak, amplify nearby gear, and hold a **room meter** that drains faster
the more one-sided the last few seconds of the mix were. The one thing that makes
a mix one-sided in this stack is *hauling most of the band at once* — so The
Crowd puts a price on the valley, which is why it belongs on this stack
specifically.

Off by default because it is a second answer to what a run *is*, and running both
at once would make every verdict unreadable.

---

## The layers

Every layer is switchable on its own, from the **layers** panel on the start
screen (#256's rule, generalised from #255's constraint on The Call). Read at run
start; the panel writes to `localStorage` and mirrors into `#layers=` so a
configuration can be sent to someone.

| layer | default | off gives you |
|---|---|---|
| `placement` | on | weapons fire from the player — **the base game, in-branch** |
| `panning` | on | the band stays centred wherever it stands |
| `hauling` | on | gear is bolted down — the tower-defence half of the designer's open question |
| `quantizeDrop` | off | (on) the whole stage re-enters on the next bar line |
| `masking` | on | gear standing on top of itself costs nothing |
| `cables` | on | no adjacency bonus; spreading out buys only coverage |
| `knockdown` | on | gear is indestructible |
| `venue` | on | the endless plane the base runs on |
| `sockets` | on | the floor is featureless; every spot is the same spot |
| `exclusivity` | on | the base's flat cap of five, any five weapons |
| `mergedKit` | on | every drum is its own box (visible only with seat slots off) |
| `crew` | on | weapons only, and the decision stream dies at minute fourteen |
| `crowd` | **off** | The Hush dies as usual; the only loss is your own health |

`placement` off is the cheapest A/B in the build: one checkbox turns the whole
stack into `prototype-base` without a checkout.

The end screen prints every layer that was not at its default, because a verdict
read off a modified configuration is a verdict about a different game.

---

## Where the code is

| | |
|---|---|
| `src/game/loadin/stage.ts` | the stage plot: rigs, hauling, masking, cables, sockets, output |
| `src/game/loadin/venue.ts` | the five rooms and the roll |
| `src/game/loadin/crowd.ts` | The Crowd toggle: fans, soaking, the room meter |
| `src/game/loadin/layers.ts` | the switchboard |
| `src/game/loadin/panel.ts` | its UI, on the start screen |
| `src/game/loadin/plot-panel.ts` | the stage plot on the pause screen (`.pause-arrange`) |
| `src/game/loadin/config.ts` | every tuning number this stack adds |
| `tools/verify-loadin.ts` | the headless harness behind every number above |

**The one seam that made this cheap.** Every weapon in the game asks the world
*"where am I"* through `ctx.player`, and every one of them means *"where does my
shot start, what do I aim from, where is my field centred"*. `RunWorld.originFor`
changes the answer and nothing else — nineteen weapon modules fire from where
they stand without one line of change in any of them.

### What the harness can and cannot measure

`tools/verify-loadin.ts` drives a real `RunWorld`, so what it reports about
geometry, silence, knockdown and the ladder is the game's own arithmetic.

Two things it is **not**:

- **It is not a player.** The mover hires from a slow circuit, then stands in
  the middle of whatever stage plot that produced and walks to the nearest gem.
  It never hauls, never repositions a piece, never uses a socket on purpose and
  never leads a wave across the far side of the plot. Every number in section 5
  is a **floor**.
- **It is not the mix.** There is no audio engine outside a browser, so the
  harness synthesises triggers at each voice's real ladder rate. That is faithful
  for *damage*; it says nothing about loudness, which is what the capture set in
  `docs/loadin/` is for.

### Base gaps found

**The texture auras can attack while silent.** `pad` and `air` are beds, so they
are driven by the clock rather than by a chart trigger, and the base's number-key
deactivation (`toggleRoleActive`) disables the *voice* while the aura keeps
ticking — an inaudible weapon that is still attacking, which is the audibility
rule (#255) broken. This branch closes it for its own silence by gating
`RunWorld.builtConf` on audibility, but the deactivation case is a
`prototype-base` bug all five branches inherit and **owes a PR to the base**.

---

## Running it

```
npm run dev -- --port 3203     # pinned, so the origin and its save stay put
npx tsx tools/verify-loadin.ts # every number in this document
```

Port **3200** is `prototype-base` itself, for A/B without a checkout.

Captures: `docs/loadin/README.md`.
