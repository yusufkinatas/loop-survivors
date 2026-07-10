# Reference Sound Lift (RSL)

**Reference Sound Lift** is the project's name for turning one discrete sound
from a supplied reference recording into a playable game one-shot. It uses
source separation, musical-grid timing, and minimal trimming to preserve the
sound's real character instead of approximating it with an unrelated sample or
a generic synthesizer patch.

The first successful RSL was Pursuit's A1 sub pulse: a short low hit centered
around 55 Hz, with clipped metallic higher frequencies that make it audible and
recognizable beyond the deepest bass. Two plausible replacements failed the
developer's ear gate. A reference-derived lift passed immediately.

## When to use it

Use RSL when all of these are true:

- The developer has supplied or explicitly approved a reference recording.
- One short hit or note is clearly identifiable in the recording.
- Recreating the sound has already failed the ear gate, or exact reference
  character matters more than designing a merely similar sound.
- The result can still behave as one causal weapon sound when the game triggers
  it.

Good candidates include drum hits, short bass notes, metallic stabs, plucks,
and isolated sound effects. RSL is usually the wrong tool for vocals, chords
with several notes tangled together, long evolving textures, complete loops,
or sounds that cannot be separated from the surrounding mix. For a pitched
instrument spanning a wide range, lift several recorded notes and play the
nearest one rather than stretching a single sample too far.

## The workflow

### 1. Research the sound before processing it

Look for production notes, credible recreations, interviews, or technical
discussion. The goal is not to copy somebody else's guessed preset. It is to
identify behavior that an extracted waveform alone will not explain: strong
kick ducking, a very short gate, pitch movement, flanging, distortion, or
different loudness on different beats.

Explain musical terms in plain language in the working notes. For example,
**kick ducking** means the bass is briefly turned down whenever the kick drum
hits, making the kick punch through and causing the bass to pump around it.

### 2. Find the exact event on the track's grid

Establish the track tempo and the first reliable beat. Convert beats into exact
timestamps, then identify events whose written note and role match the desired
sound. Prefer an event with the least overlap from drums, vocals, and other
pitched parts.

Do not select only by looking for the loudest waveform peak. Low sounds can
reach their strongest point after their actual start. Confirm the note using a
spectrum: its lowest repeating frequency should match the intended pitch, and
its higher-frequency pattern should look stable enough to be part of the sound
rather than leakage from a neighbor.

### 3. Separate the relevant source

Run a short region around the candidate through a source-separation model. The
Pursuit proof used Demucs `htdemucs` with the `bass` stem. Work on a short
region first; it is faster to inspect and often separates more predictably than
processing an entire track unnecessarily.

Separation is a selection aid, not an automatic truth machine. Listen to and
inspect the separated result. Models can leave drum leakage, watery artifacts,
or pieces of another instrument. If the desired hit is damaged, try a different
event or stop and choose another method.

### 4. Cut one complete hit

Trim from the true audible attack to the natural gate or the next grid event.
Preserve the original channel count when stereo width or left/right movement is
part of the character. Apply only corrections that solve concrete playback
problems:

- remove inaudible rumble below the useful range;
- move the audible attack to the start of the file;
- add a short tail fade, normally 5-10 ms, to prevent a click;
- normalize only when the extracted level is unusable.

Do not smooth away distortion, metallic higher frequencies, noise, or stereo
movement merely because they look untidy. Those may be the parts the ear
recognizes.

### 5. Integrate it as an ordinary game sample

Render WAV at 44.1 kHz and 16-bit PCM. Use the existing fetch-and-decode path;
do not add runtime cleanup. Record the sample's true root note so chart notes
transpose from the correct pitch. Keep the playback range narrow, or create
additional lifted notes for a wider range.

The chart and mix behavior still matter. Reproduce researched behavior such as
kick ducking, note choking, and per-beat loudness in the engine or chart rather
than baking a whole musical phrase into the one-shot.

### 6. Verify in increasing context

Check, in order:

1. The sample format, duration, onset, peak, and DC offset (an unintended
   constant electrical shift that can cause clicks or reduce headroom).
2. The sound alone in the Experimentation room or sandbox.
3. The sound inside the complete maximum-level band.
4. Every gameplay tier and any transposed turnaround notes.
5. A real run, where repeated triggers, kick ducking, and combat noise reveal
   problems a solo audition hides.

Automated checks prove that the asset loads and is technically healthy. Only
the developer's ear can pass the sound.

### 7. Record provenance and clearance

For every RSL asset, record:

- the source file and whether the developer supplied or approved it;
- separation model and requested stem;
- source region and chosen event timestamp;
- final duration and every filter/fade applied;
- root pitch, channel count, sample rate, and bit depth;
- where it is used in code;
- whether it is test-only, cleared, or must be replaced before release.

Licensing status never lives only in conversation. Put it beside the asset in
the relevant `CREDITS.md` and flag non-public assets in the current phase spec
and `docs/STATUS.md`.

## Pursuit example

The successful Pursuit lift used this recipe:

- source: developer-supplied `public/boss/pursuit.mp3`;
- analysis region: first 20 seconds;
- separation: Demucs `htdemucs`, bass component;
- event: clean A1 hit beginning around 0.864 seconds;
- processing: trim to 125 ms, high-pass at 28 Hz, fade the final 10 ms;
- output: stereo 44.1 kHz/16-bit WAV, peak approximately -1.2 dB;
- runtime: direct sample playback for A1; pitch the same hit up three semitones
  for the written C turnaround;
- clearance: test-app-only, not approved for a public build.

The key lesson was diagnostic: the rejected substitutes reproduced “deep bass”
but not the actual sound. The reference hit combined the low note with a clipped
metallic stack above it. RSL preserved both.

## Stop conditions

Stop instead of forcing an RSL when:

- no clean event exists anywhere in the supplied recording;
- separation damages the attack or leaves an obviously different instrument;
- the sound only works as a multi-note phrase or with another inseparable lane;
- transposition needed by gameplay makes the attack noticeably too fast or
  slow;
- provenance or release clearance cannot be stated honestly.

At that point, use a cleared stem, commission or design a replacement, create a
multi-sample set, or keep the reference asset explicitly test-only.
