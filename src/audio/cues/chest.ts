import { makeNoiseBuffer } from './noise';

/** The chest ceremony: a slot-machine spin, its payout stab, and the thud of
 *  each reward landing on the boards. Three cues rather than one because the
 *  ceremony has three beats — anticipation, resolution, delivery — and the
 *  shell schedules them independently against the visual reel. */

/** Chest reel spin: the slot-machine anticipation ramp. One short blip per
 *  reel tick, climbing the run's own A minor pentatonic — each tick a step
 *  higher while the ticks themselves slow down (the wheel decelerating), so
 *  pitch rises as time stretches: the classic "what will it be" shape. A
 *  fixed-pitch clack under every blip keeps it mechanical, and a quiet
 *  bandpass noise riser holds tension under the whole spin.
 *
 *  `tickTimes` comes from chestTickTimes() in game config — the SAME schedule
 *  the visual reel consumes, so every audible click has a visible frame pop.
 *  Rides master like the other cues: mute respected, ducks can't swallow it. */
export function playChestSpinCue(ctx: AudioContext, dest: AudioNode, tickTimes: number[]): void {
  if (tickTimes.length === 0) return;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6200;
  out.connect(lp).connect(dest);

  // Tension bed: a soft noise swell rising with the spin, cut at the stop.
  const spinS = tickTimes[tickTimes.length - 1];
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, spinS, 'flat');
  const sweep = ctx.createBiquadFilter();
  sweep.type = 'bandpass';
  sweep.Q.value = 1.1;
  sweep.frequency.setValueAtTime(340, now);
  sweep.frequency.exponentialRampToValueAtTime(2600, now + spinS);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, now);
  noiseEnv.gain.exponentialRampToValueAtTime(0.05, now + spinS * 0.85);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + spinS);
  noise.connect(sweep).connect(noiseEnv).connect(out);
  noise.start(now);
  noise.stop(now + spinS);

  // The ticks: A minor pentatonic from A4 upward, one degree per tick.
  const pentatonic = [0, 3, 5, 7, 10];
  for (let i = 0; i < tickTimes.length; i++) {
    const t0 = now + tickTimes[i];
    const semis = pentatonic[i % 5] + 12 * Math.floor(i / 5);
    const blip = ctx.createOscillator();
    blip.type = 'triangle';
    blip.frequency.value = 440 * Math.pow(2, semis / 12);
    const blipEnv = ctx.createGain();
    const peak = 0.05 + i * 0.005; // each tick slightly hotter: the ramp
    blipEnv.gain.setValueAtTime(0.0001, t0);
    blipEnv.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    blipEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    blip.connect(blipEnv).connect(out);
    blip.start(t0);
    blip.stop(t0 + 0.12);

    const clack = ctx.createOscillator();
    clack.type = 'square';
    clack.frequency.value = 1397;
    const clackEnv = ctx.createGain();
    clackEnv.gain.setValueAtTime(0.0001, t0);
    clackEnv.gain.exponentialRampToValueAtTime(0.02, t0 + 0.003);
    clackEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    clack.connect(clackEnv).connect(out);
    clack.start(t0);
    clack.stop(t0 + 0.04);
  }
}

/** Chest reel stop: the payout stab, sized to the prize. A chord stab —
 *  several notes hit together as one punchy block — built from the track's
 *  home chord (A minor, like the game-over cue: this is an event inside the
 *  track and should sound like the track winning).
 *
 *  size 1: a tidy three-note stab. A weapon leveled — nice.
 *  size 2: the stab plus an octave and a quick ascending sparkle.
 *  size 3: the jackpot — a five-note wall with a sub thump, a longer sparkle
 *          run, and a bright noise shimmer tail. The release after the ramp. */
export function playChestLandCue(ctx: AudioContext, dest: AudioNode, size: 1 | 2 | 3): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6800;
  out.connect(lp).connect(dest);

  // A minor block chord, growing downward and upward with the prize.
  const chord =
    size === 1 ? [440, 523.25, 659.25]
    : size === 2 ? [440, 523.25, 659.25, 880]
    : [220, 440, 523.25, 659.25, 880];
  const decayS = size === 1 ? 0.5 : size === 2 ? 0.75 : 1.15;
  for (const freq of chord) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + decayS);
    osc.connect(env).connect(out);
    osc.start(now);
    osc.stop(now + decayS + 0.05);
  }

  if (size >= 2) {
    // Ascending pentatonic sparkle riding over the stab.
    const run = size === 2 ? [1046.5, 1318.5, 1760] : [880, 1046.5, 1318.5, 1760, 2093, 2637];
    for (let i = 0; i < run.length; i++) {
      const t0 = now + 0.05 + i * 0.055;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = run[i];
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(0.08, t0 + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32);
      osc.connect(env).connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.36);
    }
  }

  if (size === 3) {
    // The jackpot floor: a sub thump you feel more than hear...
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(55, now + 0.16);
    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0.0001, now);
    subEnv.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
    subEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    sub.connect(subEnv).connect(out);
    sub.start(now);
    sub.stop(now + 0.42);
    // ...and a bright shimmer tail over the top.
    const shimmerS = 0.8;
    const shimmer = ctx.createBufferSource();
    shimmer.buffer = makeNoiseBuffer(ctx, shimmerS, 'quadratic');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5200;
    const shimmerEnv = ctx.createGain();
    shimmerEnv.gain.setValueAtTime(0.06, now);
    shimmerEnv.gain.exponentialRampToValueAtTime(0.0001, now + shimmerS);
    shimmer.connect(hp).connect(shimmerEnv).connect(out);
    shimmer.start(now);
    shimmer.stop(now + shimmerS);
  }
}

/** A chest reward thudding onto the boards: a kick-like punch under a short
 *  knock. Pitched a pentatonic step higher per `index`, so a jackpot's five
 *  drops land as a rising bam-bam-bam-bam-bam run instead of five copies of
 *  the same thud. */
export function playChestDropCue(ctx: AudioContext, dest: AudioNode, index = 0): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(dest);

  const pentatonic = [0, 3, 5, 7, 10];
  const lift = Math.pow(2, pentatonic[index % 5] / 12);

  // The punch: a falling sine body, the part you feel.
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(175 * lift, now);
  body.frequency.exponentialRampToValueAtTime(58 * lift, now + 0.09);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, now);
  bodyEnv.gain.exponentialRampToValueAtTime(0.55, now + 0.005);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  body.connect(bodyEnv).connect(out);
  body.start(now);
  body.stop(now + 0.24);

  // The knock: a very short lowpassed noise tap on top.
  const knockS = 0.06;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, knockS, 'quadratic');
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.16, now);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + knockS);
  noise.connect(lp).connect(noiseEnv).connect(out);
  noise.start(now);
  noise.stop(now + knockS);
}
