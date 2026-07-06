// The boss conductor: a boss makes the music, and the music's structure IS
// the fight's rhythm (the boss-fight pivot — see docs/phases/boss-fights.md).
// This wraps the Track Lab's LabEngine (the ear-approved track player) and
// walks a fixed ARRANGEMENT: an ordered list of {section, bars} the song plays
// through, auto-switching sections on the bar. Each beat it hands the boss AI a
// BeatInfo (which bar/beat, which section) so attacks land on the grid. When
// the arrangement finishes, the song is over and the boss dies — the player
// wins by surviving the whole track, not by dealing damage.
//
// Timing model (matches the game's MusicEngine): the audio clock's setInterval
// SCHEDULES steps a hair ahead of the sound, but gameplay must not be driven off
// that timer — a backgrounded tab throttles rAF while the audio clock keeps
// firing, which would dump a burst of catch-up attacks. So step events are
// QUEUED at schedule time and DRAINED in the render loop (update(now)) at audio
// time: attacks land exactly when the beat sounds, and a frame stall simply
// skips the attacks it fell behind on instead of exploding.

import type { LabEngine } from '../tracklab/labengine';

const STEPS_PER_BAR = 16;
const BEATS_PER_BAR = 4;

/** One block of the song's playthrough: a section id and how many bars to hold
 *  it. A section shorter than `bars` simply loops (an 8-bar section held for 16
 *  bars plays twice), exactly like the lab's phrase loop. */
export interface ArrangementEntry {
  sectionId: string;
  bars: number;
}

/** Handed to the boss AI on every beat. Everything it needs to fire in time. */
export interface BeatInfo {
  /** Monotonic step from fight start. */
  absStep: number;
  /** Monotonic bar = floor(absStep / 16). */
  absBar: number;
  /** Step within the bar, 0..15. */
  stepInBar: number;
  /** Beat within the bar, 0..3. */
  beatInBar: number;
  /** stepInBar === 0 (the "1"). */
  isDownbeat: boolean;
  /** On a quarter-note beat. */
  isBeat: boolean;
  /** On beat 1 or 3 (the half-bar pulse). */
  isHalfBar: boolean;
  /** Active section (arrangement entry) id. */
  sectionId: string;
  /** Index of the current arrangement entry. */
  entryIndex: number;
  /** Bars elapsed inside the current arrangement entry. */
  barInEntry: number;
  /** Audio time this step sounds. */
  time: number;
  /** Seconds per step at the track tempo, for timing telegraphs to the beat. */
  stepDur: number;
  /** Seconds per beat, the natural telegraph unit. */
  beatDur: number;
}

export interface ConductorHooks {
  /** Every step, at audio time, unless the frame fell too far behind. */
  onStep(info: BeatInfo): void;
  /** The first step of a new arrangement entry (a new phase of the fight). */
  onSectionEnter?(sectionId: string, entryIndex: number): void;
  /** The arrangement has fully played — the song is over. Fires once. */
  onFinish?(): void;
}

type QueuedStep = { info: BeatInfo } | { finish: true; time: number };

export class BossConductor {
  readonly engine: LabEngine;
  readonly arrangement: ArrangementEntry[];
  readonly totalBars: number;

  /** sectionForBar[b] = the section id that plays during absolute bar b. */
  private readonly sectionForBar: string[] = [];
  private readonly entryForBar: number[] = [];
  private readonly entryStartBar: number[] = [];

  private hooks: ConductorHooks;
  private queue: QueuedStep[] = [];
  private lastFiredEntry = -1;
  private playedStep = 0;
  private scheduledDone = false;
  private finished = false;

  constructor(engine: LabEngine, arrangement: ArrangementEntry[], hooks: ConductorHooks) {
    this.engine = engine;
    this.arrangement = arrangement;
    this.hooks = hooks;
    let bar = 0;
    arrangement.forEach((entry, i) => {
      this.entryStartBar[i] = bar;
      for (let b = 0; b < entry.bars; b++) {
        this.sectionForBar[bar] = entry.sectionId;
        this.entryForBar[bar] = i;
        bar++;
      }
    });
    this.totalBars = bar;
    engine.addStepListener((absStep, _phraseStep, time) => this.schedule(absStep, time));
  }

  /** Total playthrough length in seconds (for the "song" bar and pacing). */
  get durationS(): number {
    return (this.totalBars * BEATS_PER_BAR * 60) / this.engine.track.bpm;
  }

  /** 0..1 through the arrangement AS HEARD — drives the boss "health"/song bar. */
  progress01(): number {
    if (this.finished) return 1;
    return Math.min(1, this.playedStep / (this.totalBars * STEPS_PER_BAR));
  }

  sectionName(id: string): string {
    return this.engine.track.sections.find((s) => s.id === id)?.name ?? id;
  }

  /** Open on the arrangement's first section, then start the transport. */
  start(): void {
    this.engine.setSection(this.sectionForBar[0]);
    this.engine.start();
  }

  stop(): void {
    this.engine.stop();
  }

  /** Called from the audio clock (schedule time). Only bookkeeping + queueing
   *  here; nothing gameplay-visible fires until update() drains it. */
  private schedule(absStep: number, time: number): void {
    if (this.scheduledDone) return;
    const absBar = Math.floor(absStep / STEPS_PER_BAR);
    if (absBar >= this.totalBars) {
      this.scheduledDone = true;
      this.queue.push({ finish: true, time });
      return;
    }

    const stepInBar = absStep % STEPS_PER_BAR;
    const sectionId = this.sectionForBar[absBar];

    // Pre-queue the next bar's section change so it lands on the next "1".
    // LabEngine.setSection is itself audio-scheduled, so this belongs here.
    if (stepInBar === 0) {
      const nextBar = absBar + 1;
      if (nextBar < this.totalBars && this.sectionForBar[nextBar] !== sectionId) {
        this.engine.setSection(this.sectionForBar[nextBar]);
      }
    }

    const entryIndex = this.entryForBar[absBar];
    const stepDur = 60 / this.engine.track.bpm / this.engine.clock.stepsPerBeat;
    this.queue.push({
      info: {
        absStep,
        absBar,
        stepInBar,
        beatInBar: Math.floor(stepInBar / (STEPS_PER_BAR / BEATS_PER_BAR)),
        isDownbeat: stepInBar === 0,
        isBeat: stepInBar % 4 === 0,
        isHalfBar: stepInBar % 8 === 0,
        sectionId,
        entryIndex,
        barInEntry: absBar - this.entryStartBar[entryIndex],
        time,
        stepDur,
        beatDur: stepDur * 4,
      },
    });
    // Cap the backlog: a hidden tab shouldn't bank thousands of steps.
    while (this.queue.length > 64) this.queue.shift();
  }

  /** Drain queued steps whose sound has arrived. Call once per render frame
   *  with the current audio time. Steps we fell behind on (a frame stall) still
   *  advance the arrangement/section/progress but skip spawning their attacks —
   *  so coming back to a backgrounded fight fast-forwards, it doesn't erupt. */
  update(now: number): void {
    while (this.queue.length > 0 && this.headTime(this.queue[0]) <= now) {
      const ev = this.queue.shift()!;
      if ('finish' in ev) {
        if (!this.finished) {
          this.finished = true;
          this.engine.stop();
          this.playedStep = this.totalBars * STEPS_PER_BAR;
          this.hooks.onFinish?.();
        }
        return;
      }
      const info = ev.info;
      this.playedStep = info.absStep;
      if (info.entryIndex !== this.lastFiredEntry) {
        this.lastFiredEntry = info.entryIndex;
        this.hooks.onSectionEnter?.(info.sectionId, info.entryIndex);
      }
      // Skip attacks we're far behind on, so a resume doesn't dump a wall.
      if (now - info.time < 0.4) this.hooks.onStep(info);
    }
  }

  private headTime(ev: QueuedStep): number {
    return 'finish' in ev ? ev.time : ev.info.time;
  }
}
