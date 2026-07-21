/** Health pickup: a short warm rise that resolves home.
 *
 *  Deliberately built as the hit cue's mirror image. That one is un-musical
 *  and *falls* — 180 Hz down to 50 in a tenth of a second — because pitch
 *  dropping fast is the shape of something going wrong. So healing rises, and
 *  it rises through the run's own material rather than against it: A4 to E5 to
 *  A5, root up to the fifth and home again (the A minor skeleton in scale.ts).
 *  A perfect fifth resolving back to the root is about the most settled-
 *  sounding move there is — that "closed, nothing left hanging" quality is the
 *  point, because the player just went from hurt to safe.
 *
 *  Sine waves, and each note fades *in* over ~25ms instead of clicking on.
 *  Every other cue here starts with a sharp attack because they are all events
 *  that interrupt; this one is the one moment of relief, so it should arrive
 *  rather than hit. Underneath, a soft A3 pad swells and decays for the whole
 *  cue — the warmth, the part that says the floor is back.
 *
 *  Quiet on purpose (peaks well under the level cue's). A health drop is
 *  common enough that a loud cue would nag, and this needs to sit inside the
 *  track, not on top of it. Rides `dest` (master) like the other cues, so a
 *  level-up or hit duck cannot swallow it. */
export function playHealthPickupCue(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  // Gentle top end: this is the warm cue, it should not sparkle.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  out.connect(lp).connect(dest);

  // Layer 1: the rise. A4 -> E5 -> A5, root to fifth to root.
  const notes = [440.0, 659.25, 880.0];
  for (let i = 0; i < notes.length; i++) {
    const t0 = now + i * 0.075;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i];
    const env = ctx.createGain();
    // Slow-ish attack: it arrives, it does not click on.
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.11, t0 + 0.025);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.36);
  }

  // Layer 2: the warmth underneath — the root an octave down, swelling under
  // the rise and outlasting it slightly so the cue exhales.
  const pad = ctx.createOscillator();
  pad.type = 'triangle';
  pad.frequency.value = 220.0; // A3, the skeleton's root
  const padEnv = ctx.createGain();
  padEnv.gain.setValueAtTime(0.0001, now);
  padEnv.gain.exponentialRampToValueAtTime(0.07, now + 0.09);
  padEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
  pad.connect(padEnv).connect(out);
  pad.start(now);
  pad.stop(now + 0.64);
}
