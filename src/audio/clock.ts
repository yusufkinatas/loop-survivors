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

  start(): void {
    if (this.timer !== null) return;
    this.nextStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06; // small run-in
    this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    while (this.nextStepTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.onStep(this.nextStep, this.nextStepTime);
      this.nextStepTime += this.stepDuration;
      this.nextStep += 1;
    }
  }
}
