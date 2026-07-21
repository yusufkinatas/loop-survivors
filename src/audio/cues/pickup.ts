import { SKELETON, semitonesToRate } from '../scale';

/** Shared machinery for the cues that fire when something is picked up off the
 *  floor — gems and music notes.
 *
 *  These two are the only cues in the game heard thousands of times per run,
 *  and that frequency is what they have in common: both need a throttle so a
 *  vacuum does not machine-gun, both need to move around the stereo field so a
 *  streak does not pile up in the centre, and both need to stay in the run's
 *  key so a busy pickup streak harmonises with the track instead of fighting
 *  it. What differs is only WHERE the pitch goes (see each subclass's
 *  `degreeIndex`) and WHAT it sounds like (see timbres.ts). */

/** How far a pickup cue may climb: two octaves of the run's scale. The ceiling
 *  is the constraint that set it — the gem's full XP bar maps to the top
 *  degree, so the top degree is a note the player hears on every single
 *  level-up. At three octaves the cue ran past 6 kHz, and since `blip` stacks a
 *  fifth on top of its root it reached the edge of hearing. Widen this only
 *  after checking where the fifth lands, and where `ding`'s inharmonic
 *  partials land (they climb fastest of anything here). */
const PICKUP_OCTAVES = 2;

/** Pitches a pickup cue is allowed to use: the run's own scale (SKELETON's
 *  note set, A minor pentatonic) stacked over PICKUP_OCTAVES, as semitone
 *  offsets from the cue root.
 *
 *  This is why these cues move by SCALE STEP and not by the few percent of
 *  random detune that is the usual fix for a sound heard thousands of times.
 *  That advice assumes effects and music are separate layers. Here they are
 *  the same layer — a pickup cue sitting a fraction of a semitone off would be
 *  the one element in the game permanently out of key. Snapping to the
 *  skeleton buys the same variety and stays in the track. */
export const PICKUP_DEGREES: readonly number[] = (() => {
  const degrees: number[] = [];
  for (let octave = 0; octave < PICKUP_OCTAVES; octave++) {
    for (const semitone of SKELETON.noteSet) degrees.push(semitone + octave * 12);
  }
  return degrees;
})();

/** The cue root, two octaves above the skeleton's (A5). High enough to read
 *  over a full band, low enough that the top of a climb is still a note rather
 *  than a whistle, and in key by construction rather than by ear. */
export const PICKUP_ROOT_HZ = SKELETON.rootHz * 4;

/** Below this gap between pickups the stereo spread is at full width; by
 *  PICKUP_FLURRY_MAX_S it has closed back to centre. A lone pickup should NOT
 *  jump to one ear — that reads as a bug, not an effect. Width is something a
 *  flurry earns. */
const PICKUP_FLURRY_MIN_S = 0.15;
const PICKUP_FLURRY_MAX_S = 0.6;

export interface PickupCueOptions {
  /** Scales the cue's envelope peaks; 0 silences it. */
  gain: number;
  /** Minimum seconds between cues; extras are dropped, not queued. */
  minGapS: number;
  /** 0..1 stereo width. Consecutive cues alternate sides, so a fast run of
   *  pickups sweeps left/right instead of piling up in the middle. Scaled
   *  down for isolated pickups (see PICKUP_FLURRY_MIN_S); 0 is mono. */
  spread: number;
}

export abstract class PickupCue<O extends PickupCueOptions> {
  /** The throttle's clock. Audio-clock time, so a paused context freezes it. */
  private lastPlayed = -Infinity;
  /** Which side the next cue pans to. Strictly alternating rather than random:
   *  true randomness clumps, and two or three cues landing on the same ear is
   *  exactly the machine-gun texture the spread exists to break up. */
  private panSide = 1;

  play(ctx: AudioContext, dest: AudioNode, opts: O): void {
    if (opts.gain <= 0) return;
    const now = ctx.currentTime;
    // Throttle. Cheap and deliberate: drop the cue rather than queue it, so a
    // vacuum sounds like a handful of pickups, not a machine gun.
    if (now - this.lastPlayed < opts.minGapS) return;
    const sinceLast = now - this.lastPlayed;
    this.lastPlayed = now;

    const degree = this.degreeIndex(sinceLast, opts);
    // Higher notes read as louder at equal amplitude, so trim as the pitch
    // climbs. Keeps a long climb building instead of pinning the limiter.
    const trim = Math.max(0.65, 1 - degree * 0.03);

    const out = ctx.createGain();
    out.gain.value = opts.gain * trim;
    this.connectPanned(ctx, out, dest, opts.spread, sinceLast);

    this.voice(ctx, out, now, semitonesToRate(PICKUP_DEGREES[degree]), opts);
  }

  /** Stereo placement. Width fades out for isolated pickups so a single one
   *  stays where the player is looking; a vacuum earns the full sweep. */
  private connectPanned(
    ctx: AudioContext,
    out: GainNode,
    dest: AudioNode,
    rawSpread: number,
    sinceLast: number,
  ): void {
    const spread = Math.max(0, Math.min(1, rawSpread));
    if (spread <= 0) {
      out.connect(dest);
      return;
    }
    const flurry =
      1 -
      Math.max(
        0,
        Math.min(
          1,
          (sinceLast - PICKUP_FLURRY_MIN_S) / (PICKUP_FLURRY_MAX_S - PICKUP_FLURRY_MIN_S),
        ),
      );
    this.panSide = -this.panSide;
    const panner = ctx.createStereoPanner();
    // 0.55..1 of the available width: keeps every cue audibly off-centre
    // rather than occasionally landing back in the middle by chance.
    panner.pan.value = this.panSide * spread * flurry * (0.55 + Math.random() * 0.45);
    out.connect(panner).connect(dest);
  }

  /** Which step of PICKUP_DEGREES this cue lands on — the cue's "motion".
   *  The only stateful part, kept separate so the timbres stay pure renderers. */
  protected abstract degreeIndex(sinceLast: number, opts: O): number;

  /** What the cue sounds like, rendered into `out` at the chosen pitch. */
  protected abstract voice(
    ctx: AudioContext,
    out: GainNode,
    now: number,
    ratio: number,
    opts: O,
  ): void;
}
