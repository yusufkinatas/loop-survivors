import { makeNoiseBuffer } from './noise';

/** Stage Magnet pickup: one short suction sweep and two confirmation clicks.
 *  Rides `dest` (master) like the level cue, so mute is respected and a
 *  level-up weapons duck cannot swallow the feedback. */
export function playStageMagnetCue(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(dest);

  const duration = 0.46;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, duration, 'linear');
  const sweep = ctx.createBiquadFilter();
  sweep.type = 'bandpass';
  sweep.Q.value = 0.8;
  sweep.frequency.setValueAtTime(420, now);
  sweep.frequency.exponentialRampToValueAtTime(3600, now + duration);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, now);
  noiseEnv.gain.exponentialRampToValueAtTime(0.13, now + 0.035);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(sweep).connect(noiseEnv).connect(out);
  noise.start(now);
  noise.stop(now + duration);

  const lift = ctx.createOscillator();
  lift.type = 'triangle';
  lift.frequency.setValueAtTime(150, now);
  lift.frequency.exponentialRampToValueAtTime(760, now + 0.38);
  const liftEnv = ctx.createGain();
  liftEnv.gain.setValueAtTime(0.0001, now);
  liftEnv.gain.exponentialRampToValueAtTime(0.08, now + 0.025);
  liftEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
  lift.connect(liftEnv).connect(out);
  lift.start(now);
  lift.stop(now + 0.44);

  for (let i = 0; i < 2; i++) {
    const t0 = now + 0.33 + i * 0.065;
    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.value = i === 0 ? 1568 : 2093;
    const clickEnv = ctx.createGain();
    clickEnv.gain.setValueAtTime(0.0001, t0);
    clickEnv.gain.exponentialRampToValueAtTime(0.045, t0 + 0.004);
    clickEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    click.connect(clickEnv).connect(out);
    click.start(t0);
    click.stop(t0 + 0.06);
  }
}
