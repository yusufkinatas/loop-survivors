/** Walking onto a ground reward: a tiny two-note "got it" chirp. `step`
 *  climbs it up the pentatonic while the player keeps scooping (a chest's
 *  scattered payout reads as one rising run), resetting after a beat —
 *  the shell owns that timer and passes the step in. */
export function playPickupCue(ctx: AudioContext, dest: AudioNode, step = 0): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 6400;
  out.connect(lp).connect(dest);

  const pentatonic = [0, 3, 5, 7, 10];
  const lift = Math.pow(2, (pentatonic[step % 5] + 12 * Math.floor(step / 5)) / 12);
  // E6 up to A6 (then higher with the combo): quick, bright, out of the way.
  const notes = [1318.5 * lift, 1760 * lift];
  for (let i = 0; i < notes.length; i++) {
    const t0 = now + i * 0.055;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = notes[i];
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.1 + i * 0.03, t0 + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.25);
  }
}
