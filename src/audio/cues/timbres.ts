import { semitonesToRate } from '../scale';
import { makeNoiseBuffer } from './noise';
import { PICKUP_ROOT_HZ } from './pickup';

/** What a pickup cue sounds like, independent of where its pitch goes.
 *
 *  Timbre and motion are separate axes on purpose: any of these can be paired
 *  with any pitch behaviour, which is what made comparing them mid-run
 *  possible. Each is a pure renderer — it draws into `out` at the pitch it is
 *  handed and owns no state, so switching one mid-run cannot leave anything
 *  behind. `ratio` is a frequency multiplier over PICKUP_ROOT_HZ, already
 *  snapped to a degree of the run's scale. */
export type PickupTimbre = 'blip' | 'pluck' | 'bell' | 'tick' | 'ding';

export const PICKUP_TIMBRES: readonly PickupTimbre[] = [
  'blip',
  'pluck',
  'bell',
  'tick',
  'ding',
];

/** Upper bound for `ding`'s inharmonic partials. Above roughly this, a partial
 *  stops adding metallic colour and starts adding fatigue. */
const PARTIAL_CEILING_HZ = 9000;

export function playTimbre(
  timbre: PickupTimbre,
  ctx: AudioContext,
  out: GainNode,
  now: number,
  ratio: number,
): void {
  switch (timbre) {
    case 'blip':
      return blip(ctx, out, now, ratio);
    case 'pluck':
      return pluck(ctx, out, now, ratio);
    case 'bell':
      return bell(ctx, out, now, ratio);
    case 'ding':
      return ding(ctx, out, now, ratio);
    case 'tick':
      return tick(ctx, out, now, ratio);
  }
}

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

/** Sawtooth through a snapping filter. Musical; sits inside the track rather
 *  than on top of it. */
function pluck(ctx: AudioContext, out: GainNode, now: number, ratio: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = PICKUP_ROOT_HZ * 0.5 * ratio; // an octave down: warmer
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 4;
  // The filter tracks the note, so a high step stays as bright as a low one.
  lp.frequency.setValueAtTime(6000 * ratio, now);
  lp.frequency.exponentialRampToValueAtTime(900 * ratio, now + 0.12);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.13, now + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(lp).connect(env).connect(out);
  osc.start(now);
  osc.stop(now + 0.18);
}

/** Two sines at a 2.76x ratio. The prettiest option, and the longest tail —
 *  which is also the risk when the cue repeats quickly. */
function bell(ctx: AudioContext, out: GainNode, now: number, ratio: number): void {
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

/** The survivors-genre convention: a short, bright, faintly metallic "ding!".
 *  Written from scratch — the genre's SHAPE (fast attack, tiny upward
 *  inflection, quick metallic decay) is a common idiom, not anyone's property,
 *  and no other game's recording is used here.
 *
 *  Metallic comes from inharmonic partials: ratios that are not whole numbers,
 *  so the overtones never line up into a single sung note the way they do on
 *  `pluck`. The upward inflection at the onset is the "!" — pitch rising into
 *  the note is what makes it read as a reward. */
function ding(ctx: AudioContext, out: GainNode, now: number, ratio: number): void {
  const base = PICKUP_ROOT_HZ * ratio;
  const partials = [
    { ratio: 1, peak: 0.11, decay: 0.16 },
    { ratio: 2.4, peak: 0.05, decay: 0.11 },
    { ratio: 4.1, peak: 0.02, decay: 0.07 },
  ];
  for (const p of partials) {
    // Inharmonic partials multiply the pitch, so at the top of a climb the
    // highest one ran past 12 kHz — audible only as a thin shriek, and the
    // first thing that would make this cue tiring. Drop partials that leave
    // the musically useful range instead of letting them ring: the cue simply
    // gets purer as it climbs, which is the right trade.
    if (base * p.ratio > PARTIAL_CEILING_HZ) continue;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    // Start a touch flat and snap up into pitch: a 12ms rise, fast enough to
    // hear as attack rather than as a slide.
    osc.frequency.setValueAtTime(base * p.ratio * 0.94, now);
    osc.frequency.exponentialRampToValueAtTime(base * p.ratio, now + 0.012);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(p.peak, now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
    osc.connect(env).connect(out);
    osc.start(now);
    osc.stop(now + p.decay + 0.02);
  }
}

/** Filtered noise burst. Percussive, and deliberately the least pitched option
 *  — there is no note to tune, so the motion moves the bandpass centre
 *  instead, which reads as brighter/darker rather than higher/lower. Never
 *  competes with the music. */
function tick(ctx: AudioContext, out: GainNode, now: number, ratio: number): void {
  const burstS = 0.05;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, burstS, 'quadratic');
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.6;
  // Square root, not the raw ratio: a bandpass on noise has no octave to land
  // on, so following the full two octaves would just thin it out into hiss at
  // the top of a climb. Half the movement reads as the same shape.
  bp.frequency.value = 3200 * Math.sqrt(ratio);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.12, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + burstS);
  noise.connect(bp).connect(env).connect(out);
  noise.start(now);
  noise.stop(now + burstS);
}
