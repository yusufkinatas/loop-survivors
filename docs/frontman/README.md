# The Frontman, captured

The [`docs/palette-control/`](../palette-control/README.md)-comparable set for
[#271](https://github.com/yusufkinatas/loop-survivors/issues/271), branch
`proto-frontman`. The mechanic itself is documented in
[`docs/frontman.md`](../frontman.md).

`docs/baseline/` measured the eight-voice game; `docs/palette-control/` measured
the nineteen-voice palette branch and drew the line every prototype is judged
above. Both concluded the same thing about the number that matters most:

> **LOUDNESS RANGE IS STILL 0.3 TO 0.7 LU EVERYWHERE.** … Widening the palette
> did not fix the flatness, and was never going to — the hard floor #256 set is
> that a run's loudness range must clear 0.6 LU, and nothing here approaches it.
> That remains entirely the core loop's job.

This set is that job, attempted.

## The set

Seven takes, each 16 bars (31.4 s), phrase-aligned, a full phrase played in first.
Opus at 128 kbps off the same post-limiter tap. Build is `kick 8, bass 8, hat 8,
chord 8, lead 8` throughout — the same five weapons as `07-maxed-five` in both
earlier sets, so this whole set hangs off a point that has already been measured
twice.

| capture | LUFS | LRA | true peak | what it is |
|---|---|---|---|---|
| `f01-band-five-maxed` | -10.6 | 0.4 | -0.4 | the anchor: nothing at the mic |
| `f02-mic-on-hat-3-places` | -10.6 | 0.5 | -0.3 | the hat at the mic, a rank-0 hand |
| `f03-mic-on-hat-8-places` | -10.6 | 0.5 | -0.2 | the hat at the mic, a maxed hand |
| `f04-solo-3-places` | -27.2 | **3.0** | -10.1 | the band down, a rank-0 hand alone |
| `f05-solo-8-places` | -25.0 | 1.1 | -9.7 | the band down, a maxed hand alone |
| `f06-the-arc` | -10.5 | **14.4** | 0.0 | band → solo → back in, played over |
| `f07-the-arc-no-hand` | -10.6 | **4.0** | +0.1 | the same arc with no hand at all |

**The reference this is measured against:** `docs/palette-control/`'s
`07-maxed-five` is **-10.5 LUFS, LRA 0.5** and its whole set is **0.3 to 0.7 LU**.
`docs/baseline/` is **0.4 to 0.6 LU at every point**.

## What the numbers say

**1. The set is comparable.** `f01` comes back at **-10.6 / 0.4** against the
control's `-10.5 / 0.5` — a tenth of a dB, which is the lossy encode and the
engine's own per-hit jitter. Same rig, same tap, same signal, so everything below
is this stack's doing.

**2. The hard floor is cleared, by a lot.** `f06` measures **14.4 LU** of loudness
range against #256's floor of **0.6 LU** and against 0.3–0.7 LU everywhere in both
earlier sets. **This is the first take anyone has recorded off this game that has
dynamics in it.**

**3. The mic alone does nothing to loudness.** `f02` and `f03` are
indistinguishable from `f01` — **-10.6 LUFS and 0.5 LU in all three.** Taking one
instrument out of a five-piece and playing it by hand does not change how loud the
track is or how much its loudness moves. This corroborates the density table in
[`docs/frontman.md`](../frontman.md): the mic changes *which* hole is in the
arrangement, not *how much* arrangement there is.

**4. Solo is a 16.6 dB drop, and the player chooses how deep.** `f04` at
**-27.2 LUFS** is the valley. And `f05` — the same solo with a maxed hand spending
eight places a bar instead of three — comes back **2.2 dB louder with a third the
loudness range**, because a busier hand fills more of the hole it is standing in.
So the *depth of the drop is the hand's own choice*, which is exactly
[#253](https://github.com/yusufkinatas/loop-survivors/issues/253)'s *the depth of
the payment is theirs to pick* — and it turns out to be measurable rather than
merely intended.

**5. The most interesting number in the set is `f07`, and it is a finding about
loudness meters rather than about the game.**

`f07` is `f06` with the hand switched off: the same voices dropping out for four
bars and coming back, and **nothing playing in the valley at all**. It measures
**4.0 LU** — six times the floor, so a bare drop-and-return already clears it — but
only **28% of `f06`'s 14.4 LU**, despite the quiet part being *quieter* (silence
beats -27 LUFS).

That is not a paradox. **EBU R128's loudness range gates out anything more than
20 LU below the programme**, so a drop to actual silence is not measured as range
— it is discarded as a gap. It only becomes *dynamics* if something is still
playing down there.

> **A break with nothing in it is a hole. A break with one voice in it is a
> dynamic.** The valley needs somebody in it, and that is the strongest argument
> this set makes for the whole stack — not that the player can take the band away,
> but that **the player is what makes taking it away register as music**.

**6. The re-entry is clipping.** `f06` and `f07` both true-peak at **0.0 / +0.1
dBFS**. The peak is real and it is hitting the ceiling — `docs/baseline/` found
"×13.5 the triggers buys 2.8 dB and the rest goes into the limiter", and here the
return runs straight into it. **The fill needs headroom made for it** (duck the
bars before the return, or trim the fill), or the loudest moment in the run is also
the most distorted one. Flagged, not fixed.

**7. The placements in these takes are perfect, so this is the tidy case.** The rig
hits every tick dead centre because a scheduled timer can. A human hand cannot, and
the loose hits a human produces are *quieter* — so a real run's loudness range is
if anything **wider** than what is measured here.

## Why this set performs, when every earlier set only posed

The shared rig ([`docs/baseline/capture-rig.js`](../baseline/capture-rig.js))
records a **build state**: set levels, play in a phrase, take sixteen bars. That
is the right instrument for a game whose arrangement is a pure function of the
build — which is what every branch before this one was.

This branch's whole claim is that the missing peaks come from a **performance**,
so a rig that can only set a build cannot record what it does.
[`capture-plan.js`](capture-plan.js) performs: it switches voices off where the
player would have taken them, plays the hand's placements on the grid, drops the
band for a solo, and brings it back with a fill.

**It still carries no repo code** ([#265](https://github.com/yusufkinatas/loop-survivors/issues/265)'s
rule). It reaches `window.loop.engine` — the developer handle `main.ts` has always
exposed — and `window.loop.frontman`, which `game.ts` adds for exactly this.

## What these takes are NOT

**Arrangement, not gameplay.** The Sandbox has waves off and the world is not
stepping: no combat, no damage, no enemies, exactly like every set before this.
What the hand does to the **arrangement** is faithful — a placement makes the same
sound through the same voice at the same instant — and what it does to the
**world** is measured in [`tools/verify-frontman.ts`](../../tools/verify-frontman.ts)
instead.

So a number here is a claim about the track and never about the game feeling good.

**The placements are perfect.** The rig hits every tick dead centre, because a
scheduled timer can. A human hand cannot, and the loose hits a human produces are
quieter — so a real run's loudness range is if anything **wider** than these
takes, not narrower. The takes are the tidy case.

## Re-capturing

```
npm run dev -- --port 3205
node docs/baseline/receiver.mjs --out docs/frontman
```

Then, in the console, with the **Sandbox** open and **RESUME SET** pressed (the
transport is gated while the game is paused, and a paused capture records
silence):

```js
// paste docs/baseline/capture-rig.js, then docs/frontman/capture-plan.js
await __captureFrontman()          // progress at __progress
```

```
node docs/frontman/measure.mjs     # the table above
```

**Do not touch anything under `src/` while a capture runs.** Vite's hot reload
replaces the page and takes the rig with it — this session did exactly that on its
first attempt and lost three takes.
