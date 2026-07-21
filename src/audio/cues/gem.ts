import { PickupCue, PICKUP_DEGREES, type PickupCueOptions } from './pickup';
import { blip } from './timbres';

export interface GemCueOptions extends PickupCueOptions {
  /** 0..1 toward the next level. Drives the cue's pitch. */
  levelProgress: number;
}

/** XP gem pickup: a short two-note blip whose pitch tracks how full the XP bar
 *  is, panned to alternating sides during a flurry.
 *
 *  It obeys the same three rules the other cues do: silent when muted, wired
 *  to master so no duck can swallow it, and short — a gem lands dozens of
 *  times a minute, so anything with a tail becomes mud.
 *
 *  PITCH carries information rather than decoration. The note is chosen from
 *  PICKUP_DEGREES by `levelProgress`, so the cue climbs as the bar fills and
 *  drops back to the root the moment it levels: you hear how close you are
 *  without looking at the bar. Every degree is in the run's key, so a busy
 *  pickup streak harmonises with the track instead of fighting it.
 *
 *  The timbre is pinned to `blip` — chosen by ear against four other
 *  candidates, which the note cue still switches between (timbres.ts). Stereo
 *  behaviour and the throttle are shared with the note cue; see pickup.ts.
 *
 *  `gain`, `minGapS`, `levelProgress` and `spread` are all caller tuning, like
 *  playHitCue's duck: the engine holds no game numbers of its own. */
export class GemCue extends PickupCue<GemCueOptions> {
  protected degreeIndex(_sinceLast: number, opts: GemCueOptions): number {
    const progress = Math.max(0, Math.min(1, opts.levelProgress));
    return Math.round(progress * (PICKUP_DEGREES.length - 1));
  }

  protected voice(
    ctx: AudioContext,
    out: GainNode,
    now: number,
    ratio: number,
  ): void {
    blip(ctx, out, now, ratio);
  }
}
