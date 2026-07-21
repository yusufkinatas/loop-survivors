import { makeNoiseBuffer } from './noise';

/** Player took damage: one short, dark impact, and a dip of the whole weapons
 *  bus underneath it so the thud lands in a hole it made itself.
 *
 *  Two layers, both deliberately un-musical — this is the one moment the game
 *  is NOT making a track, and it should not sound like a voice joining the
 *  build. A noise crack (the contact) over a body tone that falls off a cliff,
 *  roughly 180 Hz down to 50 Hz in a tenth of a second. The fall is what reads
 *  as "bad": pitch dropping fast is the shape of something going wrong.
 *
 *  `dest` is master, so neither this cue's own duck nor a level-up duck can
 *  swallow it; `duck` is the weapons-bus gain it dips.
 *
 *  `duckDepth`/`duckHoldS` come from DAMAGE_FEEDBACK — the engine holds no
 *  game tuning of its own. The two envelope peaks below (body, then noise) are
 *  the loudness knobs, and they are deliberately hot: the body sits near unity,
 *  well into the master limiter. That is the ceiling — pushing them much
 *  further buys compression, not volume, and the limiter's 0.12s release means
 *  an over-hot cue pumps the whole track down after every hit. If it still
 *  needs to feel bigger, lower `hitDuckDepth` in config.ts so there is more
 *  room underneath, or lengthen the body's fall; do not just raise these. */
export function playHitCue(
  ctx: AudioContext,
  dest: AudioNode,
  duck: AudioParam,
  duckDepth: number,
  duckHoldS: number,
): void {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(dest);

  // The dip. Fast in (the flinch), slower out (the recovery), and always
  // ramping back to unity so repeated hits cannot stack the bus toward silence.
  const depth = Math.max(0, Math.min(1, duckDepth));
  const hold = Math.max(0.05, duckHoldS);
  duck.cancelScheduledValues(now);
  duck.setValueAtTime(duck.value, now);
  duck.linearRampToValueAtTime(depth, now + 0.02);
  duck.linearRampToValueAtTime(1, now + hold);

  // Layer 1: the contact crack — a very short lowpassed noise burst.
  const burstS = 0.09;
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, burstS, 'quadratic');
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, now);
  lp.frequency.exponentialRampToValueAtTime(320, now + burstS);
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.setValueAtTime(0.45, now);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + burstS);
  noise.connect(lp).connect(noiseEnv).connect(out);
  noise.start(now);
  noise.stop(now + burstS);

  // Layer 2: the body — a falling low tone, the part you feel.
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(180, now);
  body.frequency.exponentialRampToValueAtTime(50, now + 0.1);
  const bodyEnv = ctx.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, now);
  bodyEnv.gain.exponentialRampToValueAtTime(0.85, now + 0.006);
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  body.connect(bodyEnv).connect(out);
  body.start(now);
  body.stop(now + 0.26);
}
