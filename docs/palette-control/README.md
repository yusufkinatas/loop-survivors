# The palette branch, captured — the control for round 1

`docs/baseline/` is the reference: the eight-voice game as it stood before any
redesign work. This is the same procedure run on the twenty-voice palette
branch ([#266](https://github.com/yusufkinatas/loop-survivors/issues/266)), and
it exists to answer one question before any prototype is judged.

> **The confound.** Widening the band from eight voices to nineteen entangles
> every prototype's result with that change — a stack could look good purely
> because there are more sounds in it. `docs/baseline/` measured the old game and
> cannot separate the two. This set draws the line: **anything a stack does above
> this is the core loop's doing.**

Same rig, same tap, same nine build states, plus three points that exercise the
palette itself. Captured from `palette-20`.

## The finding: the control did not move

The nine reference builds use only the original eight voices, whose ladders the
palette left byte-for-byte unchanged. They come back the same.

| capture | reference LUFS | this branch | Δ |
|---|---|---|---|
| `01-opening-one-weapon` | -13.1 | -13.3 | 0.2 |
| `02-early-two` | -12.8 | -12.9 | 0.1 |
| `03-building-three` | -12.5 | -12.4 | 0.1 |
| `04-mid-four` | -12.2 | -12.2 | 0.0 |
| `05-band-full-five` | -11.0 | -11.0 | 0.0 |
| `06-late-five` | -10.7 | -10.6 | 0.1 |
| `07-maxed-five` | -10.6 | -10.5 | 0.1 |
| `08-thinnest-maxed-five` | -10.4 | -10.4 | 0.0 |
| `09-all-eight-maxed` | -10.3 | -10.3 | 0.0 |

Largest difference **0.2 dB**, which is the lossy encode and the engine's own
per-hit loudness jitter rather than a change in the game. Trigger densities are
not merely close but **identical** — 4.00, 6.00, 12.00, 14.00, 18.25, 23.50,
34.00, 22.00, 54.00 — because they are read from the same unchanged ladders.

## Every capture

| capture | weapons | triggers/bar | grid steps | LUFS | LRA | true peak |
|---|---|---|---|---|---|---|
| `01-opening-one-weapon` | 1 | 4.00 | 4/16 | -13.3 | 0.7 | -2.5 |
| `02-early-two` | 2 | 6.00 | 6/16 | -12.9 | 0.4 | -2.5 |
| `03-building-three` | 3 | 12.00 | 8/16 | -12.4 | 0.4 | -2.2 |
| `04-mid-four` | 4 | 14.00 | 8/16 | -12.2 | 0.3 | -1.7 |
| `05-band-full-five` | 5 | 18.25 | 11/16 | -11.0 | 0.4 | -0.4 |
| `06-late-five` | 5 | 23.50 | 13/16 | -10.6 | 0.4 | -0.3 |
| `07-maxed-five` | 5 | 34.00 | 16/16 | -10.5 | 0.5 | -0.3 |
| `08-thinnest-maxed-five` | 5 | 22.00 | 13/16 | -10.4 | 0.5 | -0.3 |
| `09-all-eight-maxed` | 8 | 54.00 | 16/16 | -10.3 | 0.4 | +0.4 |
| `10-new-five-maxed` | 5 | 22.50 | 15/16 | -12.4 | 0.5 | -0.8 |
| `11-one-per-seat-maxed` | 5 | 23.50 | 16/16 | -14.6 | 0.4 | -3.1 |
| `12-all-nineteen-maxed` | 19 | 96.00 | 16/16 | -9.4 | 0.3 | +0.5 |

Builds for the three new points:

- **`10-new-five-maxed`** — `sub 8, upright 8, rhodes 8, chank 8, bell 8`. A
  five-weapon cap filled entirely from voices the palette added.
- **`11-one-per-seat-maxed`** — `upright 8, organ 8, flute 8, shaker 8, pad 8`.
  One voice from each of the five seats.
- **`12-all-nineteen-maxed`** — every voice at VIII. Unreachable in a run (the
  cap is 5); the engine's new ceiling.

## What the new points say

**A five-weapon build of new voices is quieter, not louder** — -12.4 against the
old five-weapon maxed's -10.5, at 22.50 triggers a bar against 34.00. The
palette did not inflate the game. One voice per seat is quieter still at -14.6,
because three of those five are sparse by design and one is a bed.

**The ceiling barely moved, and that is the limiter.** Nineteen voices at once
run 96.00 triggers a bar against the old eight's 54.00 — a 78% increase in
events for **1.1 dB** of extra loudness. `docs/baseline/` found the same shape:
×13.5 the triggers bought 2.8 dB and the rest went into the limiter. More voices
does not mean more loudness; it means more mud.

**LOUDNESS RANGE IS STILL 0.3 TO 0.7 LU EVERYWHERE.** This is the number that
matters most and it is unchanged. `docs/baseline/` measured 0.4-0.6 LU at every
point and concluded there are no peaks at any scale; nineteen voices measure the
same. **Widening the palette did not fix the flatness, and was never going to** —
the hard floor #256 set is that a run's loudness range must clear 0.6 LU, and
nothing here approaches it. That remains entirely the core loop's job, which is
what this control was built to prove.

## Listen

Open `player.html`, or play the `.webm` files in `audio/` directly. Each take is
16 bars (31.5 s), phrase-aligned, with a full phrase played in first. Opus at
128 kbps off the post-limiter tap.

## Re-capturing

Same procedure as `docs/baseline/`, with an output directory so a branch never
overwrites the reference:

1. `npm run dev`, open the game, enter the **Sandbox** and press **RESUME SET**
   — the transport is gated while the game is paused, and a paused capture
   records silence.
2. `node docs/baseline/receiver.mjs --out docs/palette-control`
3. Paste `docs/baseline/capture-rig.js` into the console.
4. `await __capture(PLAN)`. Progress is readable at `__progress`.
5. `npx tsx docs/baseline/density.ts > docs/palette-control/density.md`

The rig derives which roles it may play from the soundset's ladders, so it
follows a branch that adds or removes voices without being edited.

Do not touch anything under `src/` while a capture runs: Vite's hot reload
replaces the page and takes the rig with it.
