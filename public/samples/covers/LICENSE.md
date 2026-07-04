# Track Lab cover samples

Proof-of-concept assets for the M3 Track Lab (`#tracklab`). The cover
*arrangements* reference real tracks and are demo scaffolding only — they do
not ship. Per `docs/plan.md` ship checklist, anything that ships is replaced
by original compositions and license-verified samples.

Sample sources:

- `808/` — Michael Fischer's 1994 TR-808 recordings, republished by
  TidalCycles at github.com/tidalcycles/sounds-tr808-fischer, **CC0 1.0**.
  Files renamed from the knob-setting scheme (e.g. `BD0025.WAV` → `kick.wav`,
  `CB.WAV` → `cowbell.wav`, `SD0075.WAV` → `snare.wav`, `OH25.WAV` →
  `hat-open.wav`, `CY0050.WAV` → `crash.wav`).
- `909/` — TR-909 "Detroit" kit from github.com/oramics/sampled
  (`DM/TR-909/Detroit/samples/`). Repo describes the set as freely usable;
  provenance is F9 Audio's free 909 giveaway. Fine for this prototype;
  **re-verify before anything commercial ships.**
- `misc/808-bass-dist.wav`, `misc/808-bass-sub.wav` — from
  github.com/Boochi44/free-drum-samples, **CC0 1.0** per its README.
- `voice/` — rendered locally with macOS `say` (voices Fred and Kathy; the
  Satisfaction record's robot voice literally is MacinTalk Fred). Demo-only,
  never ships.

Measured roots (autocorrelation, for `tune` values):

- `808/cowbell.wav` ≈ C#4 −10c (275.6 Hz)
- `misc/808-bass-dist.wav` ≈ G1 (48 Hz, drifts slightly — that's the 808)
- `misc/808-bass-sub.wav` ≈ A1 (55 Hz)
