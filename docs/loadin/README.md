# The Load-In, captured

The Load-In's own capture set, taken the same way `docs/baseline/` and
`docs/palette-control/` were: `engine.analyser`, post-limiter, immediately
before the speakers, 16 bars per take starting on a four-bar phrase line, with a
full phrase played in beforehand. A number here and a number there are the same
measurement.

> **Trigger** — one musical-grid event with two outputs: a sound in the mix and
> one attack in the world. Density is triggers per bar; at 122 BPM a bar is
> 1.97 seconds.

**Not yet taken.** The rig and the plan are here and the procedure below is one
sitting; the session that built this branch could not run it (see *Why the takes
are missing* at the bottom). Everything that does **not** need a recording is
measured and in [`../loadin.md`](../loadin.md), produced by
`npx tsx tools/verify-loadin.ts`.

## What this set is for, and how it differs

`docs/baseline/` changes the **build** across its nine points and asks what the
mix does. Its answer was the finding this whole map exists to fix: ×13.5 the
triggers buys 2.8 dB, and the loudness range is 0.4–0.6 LU *at every point*.

This set does that **and then does the opposite**. Points 01–07 walk the same
seven build states as the baseline, on a stage plot that is spread and wired.
Points 08–11 then **hold the build completely still** — five maxed weapons,
every time — and change only where the gear stands.

That block is the measurement the stack exists to produce. If the geometry does
what the code says it does, five identical builds should be several decibels
apart, and the run's loudness range should clear the 0.6 LU hard floor without
the build changing at all.

| capture | build | stage plot | predicted output |
|---|---|---|---|
| `01-opening-one-weapon` | kick 1 | one piece | 1.00 |
| `02-early-two` | kick 2, bass 1 | a wired pair | 1.18 |
| `03-building-three` | kick 3, bass 3, hat 1 | a wired ring of three | ~1.3 |
| `04-mid-four` | kick 4, bass 4, hat 3, chord 2 | a wired ring of four | ~1.36 |
| `05-band-full-five` | kick 5, bass 5, hat 4, chord 4, lead 3 | a wired ring of five | 1.36 |
| `06-late-five` | all five at 6–7 | a wired ring of five | 1.36 |
| `07-maxed-five-wired` | **all five at 8** | a wired ring of five | **1.36** |
| `08-maxed-five-blob` | **all five at 8** | everything inside 40 units | **0.40** |
| `09-maxed-five-scattered` | **all five at 8** | pushed to the walls, nothing wired | **1.00** |
| `10-maxed-five-hauling-three` | **all five at 8** | three on your back | 1.00, **two voices** |
| `11-maxed-five-hauling-all` | **all five at 8** | the whole band on your back | **silence** |

Predicted values come from `tools/verify-loadin.ts`, which drives the real
`RunWorld` and reads the real `rig.output`. What the recording adds is what a
meter makes of them once the limiter has had its say — which is exactly where
the base's ×13.5 went.

## Taking the set

1. `npm run dev -- --port 3203`, open the game, press **ENTER THE SOUNDWOOD**.
   A run, not the Sandbox: the stage plot only exists inside one. The rig makes
   the player untouchable and clears the field before and during every take, so
   what is recorded is still the arrangement alone.
2. Start the sink so takes land here rather than in Downloads:
   ```
   node docs/baseline/receiver.mjs --out docs/loadin
   ```
3. Paste [`capture-rig.js`](capture-rig.js) into the console.
4. `await __captureLoadIn(LOADIN_PLAN)` — progress is readable at `__progress`,
   and the rig prints a table of what each take's stage plot actually was.
5. Measure: `ffmpeg -i audio/<take>.webm -af ebur128 -f null -` for integrated
   loudness (LUFS) and loudness range (LRA), the same two numbers
   `docs/baseline/` reports.

**Do not edit anything under `src/` while it runs.** Vite's hot reload replaces
the page and takes the rig with it.

The set is ~11 takes at 31.5 s each, so budget about ten minutes.

## The Sandbox is untouched

`docs/baseline/capture-rig.js` and its nine-point `PLAN` still work from the
Sandbox on this branch and still produce an **arrangement-only** take with no
gear anywhere — the stage plot is never built there, so every weapon fires from
the player exactly as the base does. That is deliberate: it keeps this branch's
comparison against `docs/baseline/` and `docs/palette-control/` honest, and it
is the check that the `placement` layer is genuinely the only thing separating
this branch from the base.

## Why the takes are missing

The session that built this branch drove the browser through an automation
extension, and the tab it controlled was never the foreground tab. Chrome does
not run `requestAnimationFrame` in a hidden tab. The audio clock is a
`setInterval` scheduler and Chrome exempts audible pages from timer throttling,
so the transport ran correctly — but `MediaRecorder` output could not be listened
to and verified by ear, and shipping a take nobody has heard as if it were a
measurement would be worse than shipping none.

Everything that could be measured without a recording was:
`tools/verify-loadin.ts` drives the real world headlessly and its numbers are in
[`../loadin.md`](../loadin.md).
