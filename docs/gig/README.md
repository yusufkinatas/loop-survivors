# The Gig, captured — and the first loudness range this project has measured

The Gig ([#268](https://github.com/yusufkinatas/loop-survivors/issues/268)) run
through the same procedure as [`docs/baseline/`](../baseline/README.md) (the
eight-voice game before any redesign) and
[`docs/palette-control/`](../palette-control/README.md) (the nineteen-voice
control). Same tap, same phrase alignment, same 16-bar takes, so the three sets
read side by side.

> **Trigger** — one musical-grid event with two outputs: a sound in the mix and
> one attack in the world. Density is triggers per bar.
> **Loudness range (LRA)** — how much the loudness moves across the take. A flat
> track measures near zero; a track with peaks and valleys measures several LU.
> It is the number [#256](https://github.com/yusufkinatas/loop-survivors/issues/256)'s
> hard floor is about.

## The finding

`docs/baseline/` measured loudness range at **0.4–0.6 LU at every one of nine
points** and concluded there are no peaks at any scale. `docs/palette-control/`
measured **0.3–0.7 LU at every one of twelve** and concluded that widening the
palette did not fix the flatness and was never going to. The hard floor asks a
stack to clear **0.6 LU**.

**Five of these nine points clear it, and one clears it by fourteen times.**

| capture | tempo | triggers/bar | LUFS | **LRA** | true peak |
|---|---|---|---|---|---|
| `g01-first-take-95` | 95 | 2.00 | -14.0 | **2.4** | -2.4 |
| `g02-three-tracks-95` | 95 | 10.00 | -14.0 | **1.6** | -1.9 |
| `g03-band-of-five-124` | 124 | 23.50 | -11.1 | **0.7** | -0.8 |
| `g04-maxed-five-even-124` | 124 | 35.00 | -10.5 | 0.5 | -0.2 |
| `g05-maxed-five-front-loaded-124` | 124 | 18.50 | -10.6 | **8.7** | -0.2 |
| `g06-maxed-five-even-140` | 140 | 35.00 | -10.0 | 0.5 | -0.1 |
| `g07-thin-by-choice-140` | 140 | 5.00 | -14.6 | **2.9** | -1.0 |
| `g08-recording-hole-124` | 124 | 35.00 | -10.5 | 0.5 | -0.5 |
| `g09-auto-takes-124` | 124 | 29.00 | -11.5 | 0.5 | -0.2 |

Loudness measured with `ffmpeg -af ebur128=peak=true`. Densities are read live off
`loop.gig.density()` at capture time.

## What moves the loudness range, and what does not

**Not density.** The evenly-spread points trace a clean curve — 2.00/bar reads
2.4 LU, 10.00 reads 1.6, 23.50 reads 0.7, 35.00 reads 0.5 — so going sparse buys
*some* breath, simply because a sparse bar has gaps in it. At the top that curve
lands at 0.5 LU, which is **exactly where the control has always sat.** A maxed,
evenly-spread Gig build is as flat as the game has ever been.

**Phrase shape.** `g05` puts every hit in the first half of a four-bar loop and
leaves bars three and four empty. It reads **8.7 LU** at 18.50 triggers a bar —
against `g03`'s 0.7 LU at a *higher* 23.50/bar, and against `g07`'s 2.9 LU at a
far lower 5.00/bar spread evenly. Density cannot explain that. Two silent bars in
every phrase can.

> **What `g05` does and does not prove.** It is **not** a same-total comparison
> against `g04`: the rig folds a four-bar priority list into the first half and
> deduplicates, so each track kept fewer hits than its 28-hit budget and the point
> came out at 18.50/bar rather than 35.00. So it is sparser *and* front-loaded.
> The reason it is still decisive is that sparseness on its own is measured right
> here — `g07`, at nearly four times sparser, reads 2.9 — and it accounts for a
> third of `g05`'s figure at most. It also means the effect **does not need an
> extreme build**: a partial front-load at half the maxed density already gets
> 8.7 LU.

**So the shape of the phrase is the lever, and it is free.** It costs no content,
no new soundset, and no rule — only a player deciding where on the tape to put
their hands. That is the one thing neither reference set could do at any point,
because every authored rung either fills one bar identically every bar or fills
its bars evenly.

## The density fall, and who chose it

The other half of the hard floor: **a run's density must fall at least once
because the player chose it.**

`g06` → `g07` is that fall, and nothing was given up to get it. Same five tracks,
same top rung, same four-bar tape still holding twenty-eight hits. The player
re-cut each one to four.

| | triggers/bar | LUFS |
|---|---|---|
| `g06-maxed-five-even-140` | 35.00 | -10.0 |
| `g07-thin-by-choice-140` | 5.00 | -14.6 |

**35.00 → 5.00 triggers a bar, and 4.6 dB of headroom handed back by choice.**
The control's floor is its sparsest maxed build and a player cannot get below it;
the only lever there is refusing level-ups, which costs damage and buys nothing
you can hear. Here the lever is five recording passes, and what it costs is the
valley.

## Two things worth knowing that the set answers incidentally

**The valley is not a loudness event.** `g08` is `g04` with one instrument down
being recorded, and it measures **-10.5 / 0.5 LU — identical to `g04`.** Taking a
fifth of the band out of the arrangement did not make the mix quieter, because the
limiter simply stopped working as hard. Recording costs damage and a **hole in the
arrangement**; it does not read as *quieter*. Anyone reasoning about the valley
from a meter will conclude, wrongly, that nothing happened.

**The system's take is quieter than a filled one, and just as flat.** `g09` is the
`autoTakes` control arm: the same five instruments at the same rung with the
authored ladder trimmed to the same hit budget. **29.00/bar, -11.5 LUFS, 0.5 LU**
against `g04`'s performed **35.00/bar, -10.5, 0.5**. So *finding* the pattern
lands about 1 dB quieter and exactly as flat as *making* it. Whether it sounds
**better** is not a thing a meter can answer, and it is the open half of #268's
question.

## Listen

Open **`player.html`**, or play the `.webm` files in `audio/` directly. Each take
is 16 bars, phrase-aligned, with a full phrase played in beforehand. Opus at
128 kbps off the post-limiter tap.

The comparisons worth doing with your ears, in order:

1. **`g04` against `g05`.** The same instruments, one spread across the phrase and
   one crowded into its front half. This is the 0.5-versus-8.7 pair.
2. **`g04` against `g09`.** Performed against authored, same instruments, same
   budget. **This is #268's question.**
3. **`g06` against `g07`.** What choosing to go thin sounds like.
4. **`g04` against `g08`.** What an instrument being recorded sounds like from the
   inside of the arrangement.

## What was captured, and what was not

**Arrangement captures**: the music the build makes, alone. In the signal — every
track's take, the per-voice mix, the kick-ducks-bass sidechain, the master
limiter, tapped at `engine.analyser` (after the limiter, immediately before the
speakers). Not in the signal — combat, cues, chirps, ceremonies. No enemies were on
the field.

**And a caveat this set owns, which the two reference sets do not need.** A
capture has to be reproducible and a performance is not, so **these takes are
authored step lists, not a recording of anyone's hands.** They are built the way
the tape ladder genuinely accumulates a track — one priority-ordered list per
instrument, sliced to whatever the rung's hit budget is, because that is what an
overdub does — and the five lists are deliberately unlike each other, per #266's
floor that you can always tell which instrument just fired. See
[`capture-rig.js`](capture-rig.js). What they cannot stand in for is **how a real
player's rhythms sit against each other**, and that is exactly the thing #268
needs ears for.

## Density, derived

[`density.md`](density.md) — the tape ladder, what a single recording pass asks
for, the ceiling against the control, and the set list. Generated from `src/`:

```
npx tsx docs/gig/density.ts > docs/gig/density.md
```

## Re-capturing

```
1. npm run dev -- --port 3202
2. open the game, enter the Sandbox, press RESUME SET
   (the transport is gated while paused, and a paused capture records silence)
3. node docs/baseline/receiver.mjs --out docs/gig --port 3302
4. paste docs/gig/capture-rig.js into the console
5. await __capture(PLAN)          # progress is readable at __progress
6. npx tsx docs/gig/density.ts > docs/gig/density.md
```

**Port 3302, not 3300.** Round 1 runs five branches at once and the receiver's
port used to be hardcoded, so whichever stack started one first silently
collected everybody else's captures into its own directory. That happened during
this ticket; `--port` is the fix and it went back to the base.

**Do not touch anything under the project root while a capture runs.** Vite's
watcher replaces the page and takes the rig with it — a `src/` edit and a new
worktree each cost this set a full restart. Nine points is about twenty minutes of
real time.
