/** Shared noise generation for the one-shot cues.
 *
 *  Three of the cues are built on a burst of noise — the hit's contact crack,
 *  the magnet's suction sweep, the game-over wash. They differ only in how the
 *  burst fades across the buffer, so that is the one thing the caller supplies.
 */

/** How the raw noise is shaped across the buffer's length.
 *  - `flat`: no fade; the caller's envelope does all the shaping.
 *  - `linear`: fades out evenly — a sweep that runs out of energy.
 *  - `quadratic`: fades out fast then trails — reads as an impact. */
export type NoiseFade = 'flat' | 'linear' | 'quadratic';

/** A mono buffer of white noise, `seconds` long, shaped by `fade`. */
export function makeNoiseBuffer(
  ctx: AudioContext,
  seconds: number,
  fade: NoiseFade,
): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    const remaining = 1 - i / samples.length;
    const shape =
      fade === 'flat' ? 1 : fade === 'linear' ? remaining : remaining * remaining;
    samples[i] = (Math.random() * 2 - 1) * shape;
  }
  return buffer;
}
