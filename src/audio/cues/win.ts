import { makeNoiseBuffer } from './noise';

/** The set was played to the end: the track lands instead of dying.
 *
 *  This is the deliberate mirror of the game-over cue (gameover.ts) — same
 *  three layers, same instrument palette, every gesture turned the right way
 *  up. Where death sags, this one lifts:
 *
 *  - The same home chord (A minor: A-C-E, the three notes of the skeleton's
 *    home chord, see scale.ts), but voiced UP an octave and resolved to A
 *    MAJOR by raising the middle note a semitone (C to C#) — the oldest "we
 *    made it" move in music, the same chord you have heard all run finally
 *    turning bright. It bends a quarter-tone SHARP rather than a semitone
 *    flat, and the lowpass filter opens from muffled to bright instead of
 *    closing: a machine coming up to speed rather than losing power.
 *  - The sub RISES (55 Hz up to 110, the root arriving an octave lower) where
 *    death's fell away to nothing: the floor coming back under the player.
 *  - The noise wash sweeps UP into air instead of down into an empty room,
 *    and a short arpeggio of the same triad sparkles over the top — the one
 *    layer with no counterpart in the death cue, because winning gets the
 *    last word.
 *
 *  `startAt` is the audio-clock instant the track's final bar ended: the
 *  flourish begins exactly on that bar line, so it reads as the next
 *  downbeat of the music rather than a sound effect over the top of it.
 *  Rides `dest` (master) like every other cue, so mute is respected and it
 *  survives the stopped clock. */
export function playWinCue(ctx: AudioContext, dest: AudioNode, startAt?: number): void {
  const start = Math.max(startAt ?? ctx.currentTime, ctx.currentTime);
  const out = ctx.createGain();
  out.gain.value = 1;
  // Brightness arriving, not draining: the opposite ramp of the game-over cue.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(700, start);
  lp.frequency.exponentialRampToValueAtTime(5200, start + 0.5);
  out.connect(lp).connect(dest);

  // Layer 1: the home chord, resolved major and lifting. A3-C#4-E4.
  const chordS = 2.2;
  for (const hz of [220, 277.18, 329.63]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(hz, start);
    osc.frequency.exponentialRampToValueAtTime(hz * 1.015, start + 1.4);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.085, start + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, start + chordS);
    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(start + chordS + 0.02);
  }

  // Layer 2: the floor arriving under it.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(55, start);
  sub.frequency.exponentialRampToValueAtTime(110, start + 0.35);
  const subEnv = ctx.createGain();
  subEnv.gain.setValueAtTime(0.0001, start);
  subEnv.gain.exponentialRampToValueAtTime(0.45, start + 0.03);
  subEnv.gain.exponentialRampToValueAtTime(0.0001, start + 1.3);
  sub.connect(subEnv).connect(out);
  sub.start(start);
  sub.stop(start + 1.32);

  // Layer 3: the room opening up. Sweeps up into air and clears.
  const washS = 1.6;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, washS, 'flat');
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.7;
  band.frequency.setValueAtTime(400, start);
  band.frequency.exponentialRampToValueAtTime(6000, start + washS * 0.7);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, start);
  noiseEnv.gain.exponentialRampToValueAtTime(0.05, start + 0.12);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, start + washS);
  noise.connect(band).connect(noiseEnv).connect(out);
  noise.start(start);
  noise.stop(start + washS);

  // Layer 4: the triad climbing away over the top. Death has no equivalent.
  const arp = [440, 554.37, 659.25, 880];
  arp.forEach((hz, i) => {
    const at = start + 0.06 + i * 0.09;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(hz, at);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.16, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + (i === arp.length - 1 ? 1.5 : 0.34));
    osc.connect(env).connect(dest); // over the filter: these stay bright
    osc.start(at);
    osc.stop(at + (i === arp.length - 1 ? 1.52 : 0.36));
  });
}
