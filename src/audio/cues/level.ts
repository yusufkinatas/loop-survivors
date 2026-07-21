/** A short, bright "level up" chime — a quick ascending major sparkle.
 *
 *  `dest` is the engine's master, not the weapons bus, so the level-up dip
 *  never swallows it. Purely cosmetic. */
export function playLevelCue(ctx: AudioContext, dest: AudioNode): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  out.connect(lp).connect(dest);
  // C6 major triad up to C7: a classic pickup sparkle, arpeggiated fast.
  const notes = [1046.5, 1318.5, 1568.0, 2093.0];
  for (let i = 0; i < notes.length; i++) {
    const t0 = now + i * 0.045;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = notes[i];
    const env = ctx.createGain();
    const peak = 0.16 * (1 - i * 0.12);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
    osc.connect(env).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.42);
  }
}
