import { semitonesToRate } from '../scale';
import { PICKUP_ROOT_HZ } from './pickup';

/** What a pickup cue sounds like, independent of where its pitch goes.
 *
 *  Timbre and motion are separate axes on purpose: either sound below can be
 *  paired with either pitch behaviour, which is what made comparing candidates
 *  mid-run possible. Both are pure renderers — each draws into `out` at the
 *  pitch it is handed and owns no state. `ratio` is a frequency multiplier
 *  over PICKUP_ROOT_HZ, already snapped to a degree of the run's scale.
 *
 *  Three further candidates (pluck, tick, ding) were compared here and cut;
 *  see the note-cue shipping commit if one is ever wanted back. */

/** Two square-wave notes a fifth apart (the interval in a power chord),
 *  rising. Square because it cuts through a dense band; a fifth because it is
 *  the one interval that stays consonant against every chord the skeleton can
 *  throw under it. The arcade coin. */
export function blip(ctx: AudioContext, out: GainNode, now: number, ratio: number): void {
  const root = PICKUP_ROOT_HZ * ratio;
  const notes = [root, root * semitonesToRate(7)];
  for (let i = 0; i < notes.length; i++) {
    const t0 = now + i * 0.055;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = notes[i];
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.05, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }
}

/** Two sines at a 2.76x ratio. The prettiest option, and the longest tail —
 *  which is also the risk when the cue repeats quickly. */
export function bell(ctx: AudioContext, out: GainNode, now: number, ratio: number): void {
  const base = PICKUP_ROOT_HZ * 0.5 * ratio;
  const partials = [
    { ratio: 1, peak: 0.09, decay: 0.34 },
    { ratio: 2.76, peak: 0.035, decay: 0.2 },
  ];
  for (const p of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * p.ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(p.peak, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
    osc.connect(env).connect(out);
    osc.start(now);
    osc.stop(now + p.decay + 0.02);
  }
}
