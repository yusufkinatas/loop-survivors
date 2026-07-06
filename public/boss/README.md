# Boss audio files

Drop the real record here for the "record" boss variants.

- `pursuit.mp3` — the actual Pursuit track. Powers the **Pursuit (record)** boss,
  which runs the identical fight to the synth Pursuit but plays this file instead
  of synthesizing the cover live.

The file is intentionally not committed (it's a copyrighted recording — supply
your own copy). Any format the browser decodes works (mp3/m4a/ogg/wav); keep the
name `pursuit.mp3` or update the boss's `mp3.url` in `src/boss/bosses.ts`.

In the fight, use the **sync** strip (top-right) to slide the record under the
attack grid until the downbeats land on the shockwaves — coarse (¼s) skips any
silent intro, fine (20ms) locks the beat. Once dialed in, bake the shown number
into that boss's `offsetS` so it starts aligned every time.
