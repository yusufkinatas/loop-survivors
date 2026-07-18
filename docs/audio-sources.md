# Audio sample sources

Loop Survivors uses one cohesive Neon Crypt drum kit: kick, snare, clap,
closed and open hi-hats, plus a quiet wooden percussion layer under the kick.
Bass, chords, lead, arpeggio, and bell are synthesized by the Web Audio engine
and remain tuned to the run's allowed notes.

## License and provenance

All six one-shots come from
[Sample Pi](https://github.com/alex-esc/sample-pi) at commit
[`f14596be37abf227bf77d198c9b0b60d9eb4dca9`](https://github.com/alex-esc/sample-pi/tree/f14596be37abf227bf77d198c9b0b60d9eb4dca9).
Sample Pi places these recordings in the public domain under
[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Immutable source URLs and the original Freesound pages are also recorded in
`src/audio/audio-sets.ts`.

| Game file | Role | Sample Pi source | Original recording |
| --- | --- | --- | --- |
| `kick.wav` | Kick | [`bd_haus.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/kick/bd_haus.flac) | [Rodrigo The Mad, 137722](https://freesound.org/people/Rodrigo%20The%20Mad/sounds/137722/) |
| `snare.wav` | Snare | [`sn_dub.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/snare/sn_dub.flac) | [Adriak909, 173142](https://freesound.org/people/Adriak909/sounds/173142/) |
| `clap.wav` | Clap | [`perc_snap.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/percussion/perc_snap.flac) | [SoundCollectah, 109400](https://freesound.org/people/SoundCollectah/sounds/109400/) |
| `hat_closed.wav` | Closed hi-hat | [`drum_cymbal_closed.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/cymbal/drum_cymbal_closed.flac) | [menegass, 100053](https://freesound.org/people/menegass/sounds/100053/) |
| `hat_open.wav` | Open hi-hat | [`drum_cymbal_open.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/cymbal/drum_cymbal_open.flac) | [menegass, 100055](https://freesound.org/people/menegass/sounds/100055/) |
| `percussion.wav` | Kick texture | [`elec_wood.flac`](https://github.com/alex-esc/sample-pi/blob/f14596be37abf227bf77d198c9b0b60d9eb4dca9/drums/one-shots/electric/elec_wood.flac) | [looppool, 13135](https://freesound.org/people/looppool/sounds/13135/) |

## Processing and validation

The source FLACs were decoded with FFmpeg, trimmed, click-safe faded,
resampled, and stored as mono 44.1 kHz signed 16-bit PCM WAV. Loudness and
role-aware peak normalization seat the drums together: kick at −1.5 dBFS,
snare/clap at −3 dBFS, and hats/percussion at −8 dBFS. Runtime voice-bus gain
then keeps the synthesized chord and arpeggio audible while seating the hi-hat.

Validate every retained file from the repository root with:

```sh
for audio_file in public/samples/audio-sets/neon-crypt/*.wav; do
  ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name,sample_fmt,sample_rate,channels,bits_per_sample \
    -of default=noprint_wrappers=1 "$audio_file"
  ffmpeg -v error -i "$audio_file" -f null -
done
```
