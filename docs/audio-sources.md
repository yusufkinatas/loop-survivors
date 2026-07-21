# Audio sample sources

Loop Survivors ships one compact house drum palette. It supplies the kick,
snare, clap, closed and open hi-hats, and one percussion accent. A new
Afterhours Web Audio engine renders all eight playable voices from scratch:
kick, snare, hi-hat, bass, chords, lead, clap, and arpeggio. The pitched
voices stay tuned to the run's allowed notes. The palette's percussion accent
is layered quietly beneath its kick, so all 6 sourced files are heard without
adding a disconnected tenth instrument to the arrangement.

## License and provenance

All 6 one-shots come from
[Sample Pi](https://github.com/alex-esc/sample-pi) at commit
[`f14596be37abf227bf77d198c9b0b60d9eb4dca9`](https://github.com/alex-esc/sample-pi/tree/f14596be37abf227bf77d198c9b0b60d9eb4dca9).
The Sample Pi README places every sample in the public domain under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
and records its original Freesound page. The trimming, fades, resampling, and
normalization used here do not add licensing restrictions.

Runtime metadata and immutable raw-source URLs are also recorded in
`src/audio/audio-sets.ts`.

## Manifest

| Palette | Game file | Role | Sample Pi source | Original recording |
| --- | --- | --- | --- | --- |
| Midnight Warehouse | `kick.wav` | Kick | [`bd_haus.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/kick/bd_haus.flac) | [Rodrigo The Mad, 137722](https://freesound.org/people/Rodrigo%20The%20Mad/sounds/137722/) |
| Midnight Warehouse | `snare.wav` | Snare | [`sn_dub.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/snare/sn_dub.flac) | [Adriak909, 173142](https://freesound.org/people/Adriak909/sounds/173142/) |
| Midnight Warehouse | `clap.wav` | Clap | [`perc_snap.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/percussion/perc_snap.flac) | [SoundCollectah, 109400](https://freesound.org/people/SoundCollectah/sounds/109400/) |
| Midnight Warehouse | `hat_closed.wav` | Closed hi-hat | [`drum_cymbal_closed.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/cymbal/drum_cymbal_closed.flac) | [menegass, 100053](https://freesound.org/people/menegass/sounds/100053/) |
| Midnight Warehouse | `hat_open.wav` | Open hi-hat | [`drum_cymbal_open.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/cymbal/drum_cymbal_open.flac) | [menegass, 100055](https://freesound.org/people/menegass/sounds/100055/) |
| Midnight Warehouse | `percussion.wav` | Kick texture | [`elec_wood.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/electric/elec_wood.flac) | [looppool, 13135](https://freesound.org/people/looppool/sounds/13135/) |

## Processing and validation

The exact source FLACs were decoded with FFmpeg, leading digital silence was
removed below `-60 dB`, and each hit was trimmed to a role-appropriate maximum
length between 0.08 and 0.75 seconds. A short fade-out prevents clicks. FFmpeg's
EBU R128 loudness normalization used a target of `-18 LUFS`, a `-1.5 dB` true
peak ceiling, and a loudness range target of `7 LU`. A final role-aware peak
pass seats the palette in a consistent mix: kicks at `-1.5 dBFS`, snares and
claps at `-3 dBFS`, and hats/percussion at `-8 dBFS`. Each result was resampled
and stored as mono, 44.1 kHz, signed 16-bit PCM WAV.

All 6 committed WAV files were independently probed and fully decoded after
conversion. They report `pcm_s16le`, `s16`, `44100 Hz`, one channel, and 16 bits
per sample, with finite durations from 0.019 to 0.750 seconds. FFmpeg reported
no invalid data, clipping, or decode errors. The post-conversion sample-peak
check confirms each file lands exactly on its role target, from `-8 dBFS` for
hats/percussion to `-1.5 dBFS` for kicks.

At runtime, sample-backed roles activate only after every required variant for
that role decodes successfully. If a file is missing, the complete fresh
procedural voice remains active. The percussion file is delayed by 12 ms and
mixed at 20% under a 90% kick, providing palette character without masking the
downbeat.

Re-run the format and decode checks from the repository root with:

```sh
for audio_file in public/samples/audio-sets/*/*.wav; do
  ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name,sample_fmt,sample_rate,channels,bits_per_sample \
    -of default=noprint_wrappers=1 "$audio_file"
  ffmpeg -v error -i "$audio_file" -f null -
done
```
