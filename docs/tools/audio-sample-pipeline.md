# Audio sample pipeline (ffmpeg) — what it checks, fixes, and flags

This documents what happens to a raw audio file between "downloaded / dragged in
from a pack" and "played in the game". The guiding rule: **the fix lives in the
asset, not the game.** ffmpeg makes each file correct once, on disk, so the
runtime loader stays dumb (fetch + decode only — no trimming, no leveling, no
pitch correction in game code).

## Where it runs

Two build-time scripts, run by hand, never during `vite build` or at runtime:

- `scripts/build-samples.mjs` — the shipped per-genre drum kits (downloads from
  the TidalCycles Dirt-Samples set, corrects, writes to `public/samples/<genre>/`).
- `scripts/build-house-protos.mjs` — the House prototype kits curated from the
  local Wave Point pack, written to `public/samples/house/A|B|C/`.

Both apply the **same correction chain** and the **same health analyzer**. Re-run
after any manifest / PROC change:

```
node scripts/build-samples.mjs
node scripts/build-house-protos.mjs
```

## The correction chain (the fixes ffmpeg applies)

Applied to every one-shot, in order:

1. **Strip silence, both ends.** `silenceremove` removes leading and trailing
   silence below −50 dB. A file that starts 20 ms late would otherwise play 20 ms
   late every trigger — this pins the transient to t=0 (onset ≈ 0 ms after).
2. **Cap the length.** `atrim=end=<maxSec>` cuts the file to a per-role ceiling
   (e.g. kick 0.70 s, closed hat 0.22 s) so a voice that repeats fast doesn't
   smear its own tail into the next hit.
3. **Fade the tail.** An 8 ms fade on the very end (done with the `areverse →
   afade=in → areverse` trick, which needs no length lookup) so the hard `atrim`
   cut doesn't click.
4. **Peak-normalize to a per-role target.** Measure the trimmed file's peak
   (`volumedetect`), then apply exactly the gain needed to hit the role's target
   dB (kick loudest at −1 dB, hats quiet at −9 dB). This balances the kit **on
   disk**, so the game needs no per-voice volume tuning.
5. **Force the format:** mono, 44.1 kHz, 16-bit PCM. Uniform decode, no surprise
   stereo width or sample-rate mismatch.

### Special case: swells (the riser)

A riser is a long build that *ends* in silence, so the normal "strip + cap from
the start" would keep the quiet head or grab a silent tail. For `swell: true`
roles the script instead reverses the file, strips the (now-leading) trailing
silence, takes the final `maxSec` (the climax), reverses back, and fades head
20 ms / tail 60 ms. Everything else (normalize, format) is the same.

### Pitched voices (bass, and later chord / rhodes / lead)

Drums are unpitched — drop them in as-is. Melodic voices are played by the engine
at many pitches (it repitches one buffer via `playbackRate = 2^((note+tune)/12)`).
So a sampled melodic voice carries a **`tune`** (semitones) that aligns its
recorded root to the engine's A reference. Example: the Wave Point bass hits are
C2 (~64 Hz), which is +3 semitones above the engine's bass octave, so
`SAMPLE_TUNE.house.bass = -3` (in `src/audio/kits/index.ts`) seats them correctly.
`tune` is measured, not guessed — `scratchpad/pitch.mjs`-style autocorrelation
reads the sample's fundamental.

This is also why most melodic voices are still synthesized: repitching a single
sample across a wide note range stretches its attack and reads as a late/wrong
note. The clean fix is multi-sampling (several recorded pitches, play the
nearest), which is more work than a drop-in drum. Narrow-range voices like the
House bass (±5 semitones) are safe to repitch from one sample.

## The health analyzer (what it flags as suspicious)

After correcting each file the script decodes it and measures duration, onset
(first sample above threshold), effective length (onset→last audible sample),
and peak. It flags — it never auto-fixes — the following:

| Flag | Meaning | Likely cause / fix |
|---|---|---|
| `SILENT` | nothing above threshold | wrong source, or silence-strip ate everything (swell) |
| `leading-delay <n>ms` | onset later than ~15 ms | silence strip failed; the hit will feel late |
| `long tail <n>ms>` | effective length over the role ceiling | raise the cap or accept smear; usually cap tighter |
| `clipping (peak=1.0)` | normalized into the ceiling | lower the peak target for that role |
| `very quiet` (peak < 0.05) | almost inaudible after normalize | source too quiet / mostly silence |
| `very short <n>ms` | under ~20 ms of audio (proto script) | a "micro-hit" — e.g. the old 29 ms rimshot |
| `sampleRate <n>` | not 44.1 kHz | format force didn't apply |
| `PARSE-FAIL` | couldn't read the output WAV | ffmpeg produced something unexpected |

The counts land in `public/samples/health-report.md` and
`public/samples/house/protos-health.md`. **A green report means "not broken",
not "sounds good"** — the ear gate (`#soundcheck`) is the real judge. The analyzer
only points at files worth listening to first.

## Raw vs corrected (the A/B)

Both scripts keep the untouched source next to the corrected file as
`<role>.raw.wav`. `#soundcheck` (and the sandbox, for the active House kit) can
play either, so you can hear exactly what the correction did before approving it.
Raw files are audition-only and should be deleted once corrections are signed off
— they are not meant to ship.

## What the runtime does NOT do

`loadSample` in `src/audio/kits.ts` only fetches and decodes. No trimming, no
gain, no pitch fix at play time. If something sounds wrong in game, the fix is a
source swap or a PROC number in the build script (drums / fx) or a synthesis /
`tune` change in code (melodic) — never a runtime correction.
