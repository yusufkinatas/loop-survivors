import { makeNoiseBuffer } from './noise';

/** The run is over: the track sags and dies.
 *
 *  Every other cue in here is an event *inside* a track. This one is the track
 *  itself failing, so it is built out of the track's own material rather than
 *  against it: an A minor triad (A-C-E, the three notes of the skeleton's home
 *  chord — see scale.ts, root A) played as one sustained block, which is the
 *  last thing the build ever plays.
 *
 *  What makes it read as death is that the chord *sags*. All three notes bend
 *  a semitone flat over their life while a lowpass filter closes from bright
 *  to muffled — the sound producers call a tape stop: a machine losing power,
 *  pitch and brightness draining out together. A build that was in tune for
 *  the whole run goes out of tune exactly once, at the end.
 *
 *  Underneath it, a sub drop (110 Hz falling to near-inaudible) supplies the
 *  weight of the floor going out, and a slow noise wash is the empty room left
 *  behind. It starts 0.1s late on purpose: the killing blow's hit cue fires
 *  first (run.ts calls onHit before onDeath), so the thud lands, and then the
 *  collapse begins underneath it rather than on top of it.
 *
 *  Rides `dest` (master) like the other cues, so mute is respected and it
 *  survives `clock.stop()` — the music cuts, this rings out over the silence. */
export function playGameOverCue(ctx: AudioContext, dest: AudioNode): void {
  const start = ctx.currentTime + 0.1; // let the killing blow land first
  const out = ctx.createGain();
  out.gain.value = 1;
  // The brightness draining away: bright at the moment of death, muffled by
  // the time the chord has finished sagging.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400, start);
  lp.frequency.exponentialRampToValueAtTime(360, start + 1.3);
  out.connect(lp).connect(dest);

  // Layer 1: the home chord, sagging. A2-C3-E3, each bent a semitone flat.
  const chordS = 1.7;
  for (const hz of [110, 130.81, 164.81]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(hz, start);
    osc.frequency.exponentialRampToValueAtTime(hz * 0.944, start + 1.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.11, start + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, start + chordS);
    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(start + chordS + 0.02);
  }

  // Layer 2: the floor going out from under it.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(110, start);
  sub.frequency.exponentialRampToValueAtTime(28, start + 0.9);
  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0.0001, start);
  subEnv.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
  subEnv.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
  sub.connect(subEnv).connect(out);
  sub.start(start);
  sub.stop(start + 1.12);

  // Layer 3: the empty room. Swells in behind the chord, outlasts it.
  const washS = 1.9;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, washS, 'flat');
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.7;
  band.frequency.setValueAtTime(900, start);
  band.frequency.exponentialRampToValueAtTime(180, start + washS);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, start);
  noiseEnv.gain.exponentialRampToValueAtTime(0.06, start + 0.3);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + washS);
  noise.connect(band).connect(noiseEnv).connect(out);
  noise.start(start);
  noise.stop(start + washS);
}
