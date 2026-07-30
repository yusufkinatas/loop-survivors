# The Frontman

The band plays itself and you play along with it. Round-1 prototype
[#271](https://github.com/yusufkinatas/loop-survivors/issues/271), branch
`proto-frontman`, off `prototype-base` @ `3fd6d24`.

> **This branch was built agent-driven** ([#247](https://github.com/yusufkinatas/loop-survivors/issues/247)'s
> round-1 override): the session made its own in-build design calls rather than
> blocking on the designer. Every one of them is written down below **as a call,
> with the alternative named** — that is the price of the mode, and the record is
> the deliverable as much as the code is.

## The verb

One weapon of your build stands at **the mic**. A miked weapon **stops
auto-firing** — its chart goes quiet — and fires only when you press the
placement key. Land on a **tick** of the run's **feel** and the hit is strong;
land between ticks and it is **loose**.

The skill is placement, not mashing, and three rules make it so:

1. **A budget.** Three placements a bar at rank 0, up to eight. The straight feel
   has eight ticks in a bar, so *which* ticks you spend on is a choice from the
   first bar of the run — [#248](https://github.com/yusufkinatas/loop-survivors/issues/248)'s
   per-tick allocation, which real-time normally cannot do, restored by a grid.
2. **One placement per tick.** Hammering on top of one strong tick is refused.
3. **The groove.** Consecutive landed placements climb a small multiplier; one
   loose hit resets it to zero. A hand spraying at a third accuracy never holds a
   rung.

Measured: **placing is ×2.8 the best mash** in the hand's own units and **×2.9**
in damage landed on practice targets. See `tools/verify-frontman.ts` §3.

## The axis, at three timescales

| | |
|---|---|
| **structural** | which of your weapons stands at the mic, and whether one does at all |
| **economic** | whether a level-up buys the band's ladder or your hand's |
| **momentary** | which ticks of this bar you spend your placements on |

## The two synergies

[#271](https://github.com/yusufkinatas/loop-survivors/issues/271) made **one
worked synergy in each direction** a hard requirement, both visible on screen per
[#248](https://github.com/yusufkinatas/loop-survivors/issues/248)'s finding that
synergy's most legible form is a **gated combination object** — a thing you can
point at, not a hidden multiplier.

**hands → band — the Cue.** A landed placement marks the nearest bodies with a
green chevron. The band's next **downbeat** cashes every mark. You point, the
band shoots. The burst scales with **how many voices you left playing**, so it is
worth most to a build with a band and **pays a soloist nothing**.

**band → hands — the Charge.** Every trigger the band lands stacks a gold pip on
the body it hit, up to six. A landed placement **spends every pip in reach**. The
band loads, your hand fires. A band nobody plays over caps its pips and throws
the rest away — the visible cost of never using your hand.

Both die at the ends of the axis and are strongest in the middle, which is the
answer to *the two halves never touch*.

## Solo — the valley

Auto-fire off entirely; only your hits count.

- **Charged by playing well.** Landed placements fill the meter; nothing else does.
- **Gated on there being something worth stripping** — three voices playing,
  minimum. [#253](https://github.com/yusufkinatas/loop-survivors/issues/253): you
  cannot drop out of a kick and a snare.
- **Four bars**, so the return lands on a phrase line.
- **The job in the valley** is to play: every placement landed during the solo
  sizes **the re-entry**, a sweep of everything on screen when the band comes
  back, carried in on a **fill** across the whole band.

This is the peak the player authors and pays for in advance: the payment is four
bars with the band's whole output switched off.

## Run-to-run variance — the feel

One of four **feels** is rolled per run. A feel is the grid your hand plays on,
so it changes what your hand physically *does* for a whole run rather than only
what the run sounds like.

| feel | places a bar | what it is |
|---|---|---|
| **STRAIGHT** | 8 | evenly spread — the most room, the least margin |
| **THE ANCHOR** | 4 | right on the pulse — wide and slow |
| **THE PUSH** | 4 | all of them between the beats — you never land with the drums |
| **THE ROLL** | 5 | they walk across the pulse — it comes round wrong on purpose |

Named by feel, never by theory, per [#255](https://github.com/yusufkinatas/loop-survivors/issues/255)'s
L2 ceiling. Nothing player-facing says *eighth*, *offbeat* or *dotted*.

## The power currency

Five ladders of five ranks — **25 picks of hand** against the band's 40 weapon
levels, sharing one level-up pool.

| | buys |
|---|---|
| **THE WEIGHT** | your hits land harder |
| **THE HAND** | one more place to put a hit, every bar |
| **THE POCKET** | a wider place to land in |
| **THE REACH** | your hits touch further out |
| **THE CASH** | the band pays your cues and your charge better |

`tools/verify-frontman.ts` §7, two seeds: the decision stream **runs to 30:00
with no Encore at all**, against the base's measured dry-out at 13:27 / 14:42
([#265](https://github.com/yusufkinatas/loop-survivors/issues/265)).

## Keys

| key | |
|---|---|
| **Space** | place a hit |
| **Q** | take the mic / pass it on / put it down (lands on the next bar) |
| **Shift** | call the solo (the band drops on the next bar) |

Keyboard only. That is a product decision for
[#257](https://github.com/yusufkinatas/loop-survivors/issues/257), not something
this prototype should be judged on.

## Layer toggles

Every layer is individually switchable from the dev row (⚙), per
[#256](https://github.com/yusufkinatas/loop-survivors/issues/256). The set is
deliberately complete: **turn them all off and the branch is the base exactly.**

`mic` · `cue` · `charge` · `solo` · `feels` · `call` · `mic cards` · `one per seat`

`mic` off puts the mic down and hands every instrument back to the band on the
spot, so an A/B against the control is one click rather than a restart.

## The calls this session made on its own

Each is a call, not a fact. The alternative is named.

### 1. The mic holds exactly one weapon

**Called:** one mic slot. **Alternative:** several, with one key firing them all
as a simultaneous stab.

Multi-mic was designed, priced and dropped. A placement budget is an integer and
a stab is simultaneous, so the two do not compose: firing N weapons per placement
is N× the output for the same budget (wildly too strong), and charging N
placements per stab makes every extra weapon strictly worse (pointless). Neither
version prices cleanly, and both would have made the density verdict a verdict
about **slot count** rather than about the verb.

**The cost is real and measured** — see the weak point below.

### 2. A texture voice cannot hold the mic

**Called:** beds are excluded. **Alternative:** allow it and give the bed a
one-shot variant.

A bed has no triggers at all (`Kit.bed`) — it is one continuous source — so there
is nothing for a hand to place. Miking one would silence a background and hand
the player a key that does nothing.

### 3. Grouping: ungrouped, with the mic as the only typed position

**Called:** the palette stays exactly as [#266](https://github.com/yusufkinatas/loop-survivors/issues/266)
shipped it. **Alternative:** Bandwagon's role-exclusive slots, one voice per seat.

The stack's constraint is allocation between band and hands. A second orthogonal
constraint would muddy that verdict. Role-exclusivity is **built and shipped as
the `one per seat` toggle, default off**, so it can be tried without being
assumed.

### 4. Weapon levels stay in the level-up pool

**Called:** hand ranks and weapon levels share one pool. **Alternative:** ban
weapon levels outright, which is the strictest reading of the ticket's *never more
automatic damage*.

Sharing the pool is what makes allocation a **spend** decision as well as a
toggle — the level-up screen is where the player says how much of their output
they want to be theirs. Banning band levels would have removed a decision rather
than added one, and would have broken the evolution gate (which is the weapon
ladder). Flagged as the call the designer is most likely to overrule.

### 5. The opening hands you the mic

**Called:** the run's first instrument walks straight to the mic. **Alternative:**
start with an empty mic and let the player find Q.

A rank-0 hand at three placements a bar is worth slightly **more** than the
opening chart it silenced, so [#255](https://github.com/yusufkinatas/loop-survivors/issues/255)'s
floor rule holds — a player holding one weapon can always play it, and here they
are better off for holding it. The verb is also the one thing a new player must
discover, and a key nobody presses teaches nothing.

### 6. The Call commands, but enemies do not move on the grid

**Called:** the commanding half only. A landed placement orders bodies in reach —
shove, pull or hold — and **which order** is its own one-off pick. **Alternative:**
also make enemy movement step on the beat, which is the other half of package 20.

Grid-stepping enemies rewrite moment-to-moment combat feel for every stack, which
would confound the mic's verdict with a change that has nothing to do with the
mic. Named as untested rather than quietly folded in.

### 7. An off-grid hit sounds where you played it

**Called:** unquantized. A loose placement makes its sound at the instant you
pressed, quieter and weaker. **Alternative:** quantize every hit to the nearest
tick so the track is always tight.

Quantizing would make the mic feel unresponsive and would hide the player's own
error, which is the feedback the whole skill runs on. A loose hit at 42% velocity
is a human playing slightly behind, which is what live music sounds like. This is
the call closest to pillar 2's *no player choice can make the mix bad*, and it is
the one to revisit first if it sounds sloppy.

### 8. The re-entry fill is the one thing that ADDS triggers

**Called:** the return bar plays a fourteen-hit run across the whole band.
**Alternative:** bring the band back plain.

Everything else in this branch takes triggers away. A peak paid for with four bars
of silence has to be **audible** as well as lethal, and
[#250](https://github.com/yusufkinatas/loop-survivors/issues/250) found nobody
solves musical resolution by generating better music — you author the material. A
fill is authored material.

### 9. Evolutions are kept, untouched

**Called:** kept, as [#271](https://github.com/yusufkinatas/loop-survivors/issues/271)
expected. There is no competing transformation system, and an evolution changes
the **geometry** a weapon makes, which is as interesting in your hand as it is on
a chart — arguably more so, since you choose when it fires.

**Not attempted:** making an evolution audible by hanging a second grace note on
the miked weapon's hand hit. It was designed and dropped as scope: it changes
per-hit damage in a way nothing here has time to balance, and the map only says
such a finding *would* be welcome, never that one is required. Named as the
cheapest available shot at that open question.

### 10. Timing calibration is a slider, not a constant

**Called:** the gap between a press and the sound the player was aiming at starts
at the browser's own `outputLatency` report and is nudged live from the dev row
(`hand ±ms`).

**This is the one place the agent-driven mode shows through the code.** The
landing window is 45 ms and this build was made without an ear or a hand in the
loop, so whether a placement *feels* like it landed where you heard it is not a
thing the session could check. The slider is the honest answer; the alternative
was to pick a number and hope.

## The weak point, measured rather than argued

`tools/verify-frontman.ts` §6, on a maxed five-piece (34.00 triggers a bar):

| position | triggers/bar | of full |
|---|---|---|
| all band — nothing at the mic | 34.00 | 100% |
| one at the mic, 3 places a bar | 31.50 | 93% |
| one at the mic, 8 places a bar | 36.50 | **107%** |
| SOLO, 3 places a bar | 3.00 | 9% |
| SOLO, 8 places a bar | 8.00 | 24% |

**Taking one instrument off a five-piece band is a small change to the
arrangement, and a hand with places to spare puts more triggers back than it took
away.** The arrangement-level fall in this stack comes from **solo**, not from the
mic. That is the direct cost of call 1, and it is stated as a finding rather than
patched around.

What the mic *does* move is **which** hole is in the arrangement, and that is a
real decision:

| take the… | band drops to | your hand owes, to break even |
|---|---|---|
| hat | 22.00 (65%) | 12.00 a bar |
| chord | 27.00 (79%) | 7.00 a bar |
| bass / lead | 28.50 (84%) | 5.50 a bar |
| kick | 30.00 (88%) | 4.00 a bar |

**3× between the busiest voice and the sparsest.** Taking the hat is a different
game from taking the kick, which is this stack's answer to the pistol test: a
weapon earns the mic by the shape it makes *in your hand* and by the size of the
hole it leaves.

## What this session could not judge

- **Whether it feels good.** Nobody played it while it was written.
- **Whether it is tiring** — [#271](https://github.com/yusufkinatas/loop-survivors/issues/271)'s
  third kill criterion. A survivors-like is a long sit and thirty minutes of
  placement may be exhausting by minute six. Only a played run answers this, and
  it is the single most likely way this stack dies.
- **Whether the loose hit sounds like sloppiness or like a human.** See call 7.

## What the capture set found

The full set and its readings are in [`docs/frontman/README.md`](frontman/README.md).
The three that matter:

**The hard floor is cleared.** A single 16-bar take containing band → solo → the
band back on a fill measures **14.4 LU of loudness range** against
[#256](https://github.com/yusufkinatas/loop-survivors/issues/256)'s floor of
**0.6 LU**, and against **0.3–0.7 LU everywhere** in both `docs/baseline/` and
`docs/palette-control/`. It is the first take recorded off this game that has
dynamics in it.

**The mic alone does nothing to loudness.** Nothing at the mic, a rank-0 hand and
a maxed hand all measure **-10.6 LUFS and 0.5 LU**. Every bit of the dynamic range
comes from **solo**, which is a **16.6 dB** drop — and how deep it goes is the
hand's own choice, measurably: a maxed hand spending eight places a bar in the
valley comes back **2.2 dB louder** than a rank-0 hand spending three.

**The valley needs somebody in it, and this is the finding worth carrying to round
two.** The same arc with the hand switched off — the same voices dropping out and
returning, silence in between — measures **4.0 LU**, only 28% of the played
version's 14.4, *despite the quiet part being quieter*. EBU R128 gates out anything
more than 20 LU below the programme, so **a drop to silence is discarded as a gap
rather than measured as range**. A break with nothing in it is a hole; a break with
one voice in it is a dynamic. That is an argument for a player in the valley that
holds however the rest of this stack is judged.

**And the peak is clipping.** Both arc takes true-peak at **0.0 / +0.1 dBFS** — the
return runs straight into the limiter. The fill needs headroom made for it, or the
loudest moment in a run is also the most distorted. Flagged, not fixed.

## Where the numbers come from

```
npx tsx tools/verify-frontman.ts     the mechanic, driven headlessly
npx tsx tools/verify-weapons.ts      no regression in the nineteen weapons
npm run check                        typecheck + dead-code scan
```

The capture set and what it measured live in [`docs/frontman/README.md`](frontman/README.md).
