import { SKELETON, semitonesToRate } from '../scale';

/** How far the gem cue may climb: two octaves of the run's scale. The ceiling
 *  is the constraint that set it — a full XP bar maps to the top degree, so
 *  the top degree is a note the player hears on every single level-up. At
 *  three octaves the cue ran past 6 kHz, and since the cue stacks a fifth on
 *  top of its root it reached the edge of hearing. Widen this only after
 *  checking where the fifth lands. */
const GEM_OCTAVES = 2;

/** Pitches the gem cue is allowed to use: the run's own scale (SKELETON's
 *  note set, A minor pentatonic) stacked over GEM_OCTAVES, as semitone
 *  offsets from the cue root.
 *
 *  This is why the cue moves by SCALE STEP and not by the few percent of
 *  random detune that is the usual fix for a sound heard thousands of times.
 *  That advice assumes effects and music are separate layers. Here they are
 *  the same layer — a gem cue sitting a fraction of a semitone off would be
 *  the one element in the game permanently out of key. Snapping to the
 *  skeleton buys the same variety and stays in the track. */
const GEM_DEGREES: readonly number[] = (() => {
  const degrees: number[] = [];
  for (let octave = 0; octave < GEM_OCTAVES; octave++) {
    for (const semitone of SKELETON.noteSet) degrees.push(semitone + octave * 12);
  }
  return degrees;
})();

/** The cue's root, two octaves above the skeleton's (A5). High enough to read
 *  over a full band, low enough that the top of the climb is still a note
 *  rather than a whistle, and in key by construction rather than by ear. */
const GEM_ROOT_HZ = SKELETON.rootHz * 4;

/** Below this gap between pickups the stereo spread is at full width; by
 *  GEM_FLURRY_MAX_S it has closed back to centre. A lone gem should NOT jump
 *  to one ear — that reads as a bug, not an effect. Width is something a
 *  flurry earns. */
const GEM_FLURRY_MIN_S = 0.15;
const GEM_FLURRY_MAX_S = 0.6;

export interface GemCueOptions {
  /** Scales the cue's envelope peaks; 0 silences it. */
  gain: number;
  /** Minimum seconds between cues; extras are dropped, not queued. */
  minGapS: number;
  /** 0..1 toward the next level. Drives the cue's pitch. */
  levelProgress: number;
  /** 0..1 stereo width. Consecutive cues alternate sides, so a fast run of
   *  pickups sweeps left/right instead of piling up in the middle. Scaled
   *  down for isolated pickups (see GEM_FLURRY_MIN_S); 0 is mono. */
  spread: number;
}

/** XP gem pickup: a short two-note blip whose pitch tracks how full the XP bar
 *  is, panned to alternating sides during a flurry.
 *
 *  Unlike the other cues this one remembers things between plays — when it
 *  last fired (the throttle) and which ear it last used — so it is an object
 *  rather than a bare function. The engine owns one and hands it the graph.
 *
 *  It obeys the same three rules the other cues do: silent when muted, wired
 *  to master so no duck can swallow it, and short — a gem lands dozens of
 *  times a minute, so anything with a tail becomes mud.
 *
 *  PITCH carries information rather than decoration. The note is chosen from
 *  GEM_DEGREES by `levelProgress`, so the cue climbs as the bar fills and
 *  drops back to the root the moment it levels: you hear how close you are
 *  without looking at the bar. Every degree is in the run's key, so a busy
 *  pickup streak harmonises with the track instead of fighting it.
 *
 *  STEREO breaks up repetition. Sides strictly alternate — true randomness
 *  clumps, and two or three cues on the same ear is exactly the machine-gun
 *  texture this exists to avoid — while the amount stays random, so the sweep
 *  is irregular without stacking.
 *
 *  `gain`, `minGapS`, `levelProgress` and `spread` are all caller tuning, like
 *  playHitCue's duck: the engine holds no game numbers of its own. */
export class GemCue {
  /** The throttle's clock. Audio-clock time, so a paused context freezes it. */
  private lastPlayed = -Infinity;
  /** Which side the next cue pans to. Strictly alternating rather than random:
   *  true randomness clumps, and two or three cues landing on the same ear is
   *  exactly the machine-gun texture the spread exists to break up. */
  private panSide = 1;

  play(ctx: AudioContext, dest: AudioNode, opts: GemCueOptions): void {
    if (opts.gain <= 0) return;
    const now = ctx.currentTime;
    // Throttle. Cheap and deliberate: drop the cue rather than queue it, so a
    // vacuum sounds like a handful of pickups, not a machine gun.
    if (now - this.lastPlayed < opts.minGapS) return;
    const sinceLast = now - this.lastPlayed;
    this.lastPlayed = now;

    const progress = Math.max(0, Math.min(1, opts.levelProgress));
    const degreeIndex = Math.round(progress * (GEM_DEGREES.length - 1));
    const ratio = semitonesToRate(GEM_DEGREES[degreeIndex]);
    // Higher notes read as louder at equal amplitude, so trim as the pitch
    // climbs. Keeps a filling bar building instead of pinning the limiter.
    const trim = Math.max(0.65, 1 - degreeIndex * 0.03);

    const out = ctx.createGain();
    out.gain.value = opts.gain * trim;

    // Stereo placement. Width fades out for isolated pickups so a single gem
    // stays where the player is looking; a vacuum earns the full sweep.
    const spread = Math.max(0, Math.min(1, opts.spread));
    if (spread > 0) {
      const flurry =
        1 -
        Math.max(
          0,
          Math.min(
            1,
            (sinceLast - GEM_FLURRY_MIN_S) / (GEM_FLURRY_MAX_S - GEM_FLURRY_MIN_S),
          ),
        );
      this.panSide = -this.panSide;
      const panner = ctx.createStereoPanner();
      // 0.55..1 of the available width: keeps every cue audibly off-centre
      // rather than occasionally landing back in the middle by chance.
      panner.pan.value = this.panSide * spread * flurry * (0.55 + Math.random() * 0.45);
      out.connect(panner).connect(dest);
    } else {
      out.connect(dest);
    }

    // Two square-wave notes a fifth apart (the interval in a power chord),
    // rising. Square because it cuts through a dense band; a fifth because it
    // is the one interval that stays consonant against every chord the
    // skeleton can throw under it.
    const root = GEM_ROOT_HZ * ratio;
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
}
