// Lookahead scheduler over the Web Audio clock (the standard "tale of two
// clocks" pattern). A setInterval timer wakes up often and schedules every
// grid step that falls inside a short window ahead of AudioContext.currentTime,
// so playback is sample-accurate even when the main thread hiccups.
//
// Tempo is read fresh for every step: it is a live variable by design
// (docs/plan.md, coherence skeleton) even though M1 fixes it for a whole run.

export type StepCallback = (step: number, time: number) => void;

const LOOKAHEAD_MS = 25; // how often the timer wakes up
const SCHEDULE_AHEAD_S = 0.12; // how far ahead each wake-up schedules

export class Clock {
  private ctx: AudioContext;
  private timer: number | null = null;
  private nextStepTime = 0;
  private nextStep = 0;
  private onStep: StepCallback;

  /** Live tempo. Read once per scheduled step, so changes glide in. */
  bpm: number;
  stepsPerBeat: number;
  /** Shuffle: the offbeat 8th of each beat is pushed late by this fraction of
   *  a 16th. 0 is straight; a larger value is a heavier shuffle. The grid backbone
   *  stays even, so downbeats never drift — only the "and" lays back. */
  swing = 0;

  constructor(ctx: AudioContext, bpm: number, stepsPerBeat: number, onStep: StepCallback) {
    this.ctx = ctx;
    this.bpm = bpm;
    this.stepsPerBeat = stepsPerBeat;
    this.onStep = onStep;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Seconds per grid step at the current tempo. */
  get stepDuration(): number {
    return 60 / this.bpm / this.stepsPerBeat;
  }

  /** Start from step 0. */
  start(): void {
    if (this.timer !== null) return;
    this.nextStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06; // small initial run-in
    this.startTimer();
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  /** Pause without losing the grid position; resume() continues the loop
   *  where it left off (level-up picks pause the run, not the arrangement). */
  pause(): void {
    this.stop();
  }

  /** Rewind a not-yet-heard lookahead tail after its WebAudio sources have
   * been canceled, preserving the first canceled step's original grid time. */
  rewindToStep(step: number, baseTime: number): void {
    this.nextStep = step;
    this.nextStepTime = baseTime;
  }

  resume(): void {
    if (this.timer !== null) return;
    // A transport hold freezes AudioContext.currentTime and preserves the
    // already-scheduled lookahead tail. Keep the next unscheduled grid time so
    // resume cannot duplicate, compress, or reorder steps. If the context was
    // not frozen and that time genuinely elapsed, start safely in the future.
    if (this.nextStepTime < this.ctx.currentTime) {
      this.nextStepTime = this.ctx.currentTime + 0.06;
    }
    this.startTimer();
  }

  private startTimer(): void {
    this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  private tick(): void {
    while (this.nextStepTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      // Swing delays the offbeat 8th of each beat (steps 2, 6, 10, 14) while
      // leaving the grid backbone even.
      const swung = this.nextStep % 4 === 2 ? this.swing * this.stepDuration : 0;
      this.onStep(this.nextStep, this.nextStepTime + swung);
      this.nextStepTime += this.stepDuration;
      this.nextStep += 1;
    }
  }
}
