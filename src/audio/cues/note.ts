import { PickupCue, PICKUP_DEGREES, type PickupCueOptions } from './pickup';
import { bell } from './timbres';

/** A pickup gap longer than this restarts the climb, so a lone note always
 *  plays the root and only a genuine streak climbs. */
const NOTE_LADDER_RESET_S = 0.55;

export type NoteCueOptions = PickupCueOptions;

/** Music-note pickup: a subtle cue whose pitch climbs one scale step per note
 *  and falls back to the root once you stop collecting.
 *
 *  The gem cue's pitch means something — it tracks how full the XP bar is, so
 *  you hear how close a level-up is. A note cannot borrow that, because notes
 *  are currency and do not level anything: there is no bar for the pitch to
 *  report on. So the note cue's pitch reports on the STREAK instead. Walk a
 *  line of notes and you hear a rising run up the scale; stop for half a
 *  second and the next one starts again from the root.
 *
 *  That difference is the whole reason both cues can exist without turning
 *  into mud when a Stage Magnet delivers gems and notes at once. They share a
 *  key and a stereo behaviour (see pickup.ts) but never the same shape: one
 *  climbs with your progress, the other with your greed.
 *
 *  The sound is a bell — two sines at a 2.76x ratio — chosen by ear against
 *  four other candidates. Its long tail is a liability on the gem cue, which
 *  fires dozens of times a minute; on notes it is an asset, because notes are
 *  rare enough that the tail has room to ring and the ladder's steps blur into
 *  a run rather than a stutter.
 *
 *  Deliberately quieter than the gem cue — a note is rarer and worth less
 *  noise, and this needs to sit under the track, not on top of it. */
export class NoteCue extends PickupCue<NoteCueOptions> {
  /** How far the ladder has climbed. Reset by a long enough gap. */
  private step = 0;

  protected degreeIndex(sinceLast: number): number {
    if (sinceLast > NOTE_LADDER_RESET_S) this.step = 0;
    const step = this.step;
    this.step = Math.min(PICKUP_DEGREES.length - 1, step + 1);
    return step;
  }

  protected voice(ctx: AudioContext, out: GainNode, now: number, ratio: number): void {
    bell(ctx, out, now, ratio);
  }
}
