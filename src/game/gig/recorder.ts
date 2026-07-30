// THE RECORDING PASS: the only place a real-world instant becomes a place on
// the musical grid.
//
// Everything about how a take SOUNDS lives in tape.ts. This file is the clock
// work — arm a pass on a loop top, map a keypress onto a 16th, close the pass —
// and it is deliberately the only part of The Gig that touches audio time.
//
// THREE KINDS OF PASS, and the difference between them is the whole economy:
//
//   fresh    a new track. Nothing on the tape, nothing to hear, the full rung's
//            hit budget. The instrument is SILENT and does not attack.
//   overdub  what a level-up hands you. The existing take keeps playing so you
//            can hear the hole it leaves — #255's "you hear the hole your
//            existing loop leaves and fill it with your own hands" — but the
//            instrument does NOT attack. Budget is only the rung's delta, one
//            to three hits.
//   recut    voluntary, free, and the expensive one. The tape is wiped, the
//            instrument goes silent, and you have one loop to play the whole
//            thing again against nothing but the rest of the band.
//
// An overdub being audible while not attacking is legal on purpose: #255 locked
// only one direction of the coupling — "if a weapon is not audible, it is not
// attacking. The converse does not hold." An audible event that produces no
// attack is exactly the case the unlocked direction leaves open, and it is what
// lets a level-up cost damage without costing the player their reference.

import type { MusicEngine } from '../../audio/engine';
import { STEPS_PER_BAR } from '../../audio/scale';
import type { Role } from '../../audio/kits';
import { noteForStep, type TapeBars } from './tape';

export type RecordMode = 'fresh' | 'overdub' | 'recut';

export interface RecordRequest {
  role: Role;
  mode: RecordMode;
  bars: TapeBars;
  /** Hits already on the tape, kept through an overdub and wiped otherwise. */
  existing: readonly number[];
  /** How many NEW hits this pass may lay down. */
  budget: number;
}

export type TapResult = 'placed' | 'duplicate' | 'full' | 'closed';

export interface RecordHooks {
  /** The count-in is over; the loop top has arrived and taps now count. */
  onOpen(): void;
  /** A tap was resolved. `step` is the quantised loop step for a placed hit. */
  onTap(result: TapResult, step: number): void;
  /** The pass is over. `steps` is everything on the tape now, normalized by the
   *  caller; `bailed` marks a pass the player ended by hand. */
  onClose(steps: number[], bailed: boolean): void;
}

interface Session extends RecordRequest {
  hooks: RecordHooks;
  /** False until the loop top arrives: the count-in. */
  open: boolean;
  /** Absolute clock step of the loop top the pass starts on. */
  startStep: number;
  startAudioTime: number;
  laid: number[];
  /** Set once the closing boundary is armed, so it is armed exactly once. */
  closing: boolean;
}

/** How many (step, audioTime) pairs to keep. At 140 BPM a 16th is 107 ms, so
 *  400 pairs is about forty seconds of grid — far more than the longest pass. */
const MARKER_HISTORY = 400;

export class Recorder {
  private engine: MusicEngine;
  private unsubscribe: () => void;
  private markers: { step: number; time: number }[] = [];
  private live: Session | null = null;

  constructor(engine: MusicEngine) {
    this.engine = engine;
    this.unsubscribe = engine.addStepListener((step, audioTime) => {
      this.markers.push({ step, time: audioTime });
      if (this.markers.length > MARKER_HISTORY) {
        this.markers.splice(0, this.markers.length - MARKER_HISTORY);
      }
    });
  }

  /** The pass in flight, or null. `open` distinguishes the count-in from the
   *  live loop; both are "recording" as far as the valley is concerned — the
   *  instrument is already down. */
  get session(): {
    role: Role;
    mode: RecordMode;
    bars: TapeBars;
    open: boolean;
    budget: number;
    laid: readonly number[];
    existing: readonly number[];
  } | null {
    const s = this.live;
    if (!s) return null;
    return {
      role: s.role, mode: s.mode, bars: s.bars, open: s.open,
      budget: s.budget, laid: s.laid, existing: s.existing,
    };
  }

  get recording(): boolean {
    return this.live !== null;
  }

  /** Arm a pass. Returns false if one is already in flight — one microphone.
   *
   *  The pass starts at the next grid position a loop of this length may legally
   *  begin on (atNextLoopTop), which is what stops a four-bar take being recorded
   *  starting from phrase bar three and then playing back shifted forever. The
   *  wait reads as a count-in, which is what it is. */
  arm(request: RecordRequest, hooks: RecordHooks): boolean {
    if (this.live) return false;
    const session: Session = {
      ...request,
      existing: [...request.existing],
      hooks,
      open: false,
      startStep: 0,
      startAudioTime: 0,
      laid: [],
      closing: false,
    };
    this.live = session;
    this.engine.atNextLoopTop(request.bars, (audioTime) => {
      if (this.live !== session) return;
      session.open = true;
      session.startAudioTime = audioTime;
      session.startStep = this.stepAtTime(audioTime);
      hooks.onOpen();
      // The pass runs exactly one loop. Queued from inside the boundary's own
      // dispatch, so it lands on the NEXT qualifying loop top rather than this
      // one (the queue is partitioned before callbacks run).
      this.engine.atNextLoopTop(request.bars, () => {
        if (this.live !== session) return;
        this.close(false);
      });
      // A budget of zero is a pass with nothing to do — close it at the next
      // bar rather than holding the instrument down for a whole loop.
      if (session.budget <= 0) this.armEarlyClose(session);
    });
    return true;
  }

  /** The player laid a hit, right now. Quantised to the nearest 16th of the
   *  loop; the note, velocity and variant are the system's (tape.ts). */
  tap(): TapResult {
    const s = this.live;
    if (!s || !s.open) return this.report(s, 'closed', -1);
    const loop = s.bars * STEPS_PER_BAR;
    const step = this.quantise(s, loop);
    if (s.existing.includes(step) || s.laid.includes(step)) {
      // Rule 2 of the silent correction: a step either fires or it does not, so
      // a frantic double-tap is one confident hit and costs nothing.
      return this.report(s, 'duplicate', step);
    }
    if (s.laid.length >= s.budget) return this.report(s, 'full', step);
    s.laid.push(step);
    // Audible feedback at the instant of the tap, not at the quantised time: a
    // drum machine in record mode plays what your finger did, and without it
    // there is no way to tell a hit landed. It carries the note the tape will
    // actually play, so what you hear now is what the loop will say.
    this.engine.preview(s.role, {
      step,
      velocity: 0.9,
      note: noteForStep(s.role, step),
    });
    if (s.laid.length >= s.budget) this.armEarlyClose(s);
    return this.report(s, 'placed', step);
  }

  /** Where the playhead is inside the pass, in fractional loop steps, or null
   *  outside a live pass. Drives the strip. */
  position(): number | null {
    const s = this.live;
    if (!s || !s.open) return null;
    const loop = s.bars * STEPS_PER_BAR;
    const raw = this.stepAtTime(this.heardTime()) - s.startStep;
    return Math.max(0, Math.min(loop - 0.001, raw));
  }

  /** End the pass now, keeping what was played. The bail-out: hand the
   *  instrument back rather than ride out the rest of the loop. */
  finish(): void {
    if (this.live) this.close(true);
  }

  /** Drop the pass without reporting: the run ended under it. */
  cancel(): void {
    this.live = null;
  }

  dispose(): void {
    this.unsubscribe();
    this.live = null;
    this.markers = [];
  }

  // -------------------------------------------------------------------------

  private report(s: Session | null, result: TapResult, step: number): TapResult {
    s?.hooks.onTap(result, step);
    return result;
  }

  /** Give the player the rest of the bar they are in, then stop. Used when the
   *  budget is spent: a one-hit overdub should not hold a four-bar loop down. */
  private armEarlyClose(s: Session): void {
    if (s.closing) return;
    s.closing = true;
    this.engine.atNextBar(() => {
      if (this.live === s) this.close(false);
    });
  }

  private close(bailed: boolean): void {
    const s = this.live;
    if (!s) return;
    this.live = null;
    const kept = s.mode === 'overdub' ? [...s.existing, ...s.laid] : [...s.laid];
    s.hooks.onClose(kept, bailed);
  }

  /** The audio time the player is REACTING to. What the speaker emits now was
   *  processed `outputLatency` ago, so a tap that felt exactly on the beat
   *  arrives here that much after it — subtracting the latency is the difference
   *  between a rig that feels honest and one that is always a step late. */
  private heardTime(): number {
    const ctx = this.engine.ctx;
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    return ctx.currentTime - latency;
  }

  private quantise(s: Session, loop: number): number {
    const raw = this.stepAtTime(this.heardTime()) - s.startStep;
    // A tap during the last half-step belongs to the downbeat the player was
    // aiming at, so it wraps. A tap BEFORE the pass opened is the same
    // intention at the other end and is clamped rather than wrapped — landing
    // an anticipated downbeat on the final 16th of the loop would be a
    // surprise, not a pickup.
    if (raw < 0) return 0;
    const rounded = Math.round(raw);
    return ((rounded % loop) + loop) % loop;
  }

  /** Fractional clock step at an audio time, interpolated between the two grid
   *  markers that bracket it.
   *
   *  Interpolating rather than dividing by stepDuration is what keeps this
   *  correct across a tempo change and across swing: a changeover glides the BPM
   *  while a pass may be in flight, and the marker times are the SWUNG times —
   *  the instants the player actually hears — so the mapping bends exactly the
   *  way their ear does. */
  private stepAtTime(t: number): number {
    const marks = this.markers;
    if (marks.length === 0) return 0;
    if (t <= marks[0].time) {
      return marks[0].step - (marks[0].time - t) / Math.max(1e-6, this.engine.clock.stepDuration);
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      if (marks[i].time > t) continue;
      const next = marks[i + 1];
      if (!next) {
        return marks[i].step + (t - marks[i].time) / Math.max(1e-6, this.engine.clock.stepDuration);
      }
      const span = next.time - marks[i].time;
      const within = span > 1e-9 ? (t - marks[i].time) / span : 0;
      return marks[i].step + (next.step - marks[i].step) * within;
    }
    return marks[0].step;
  }
}
