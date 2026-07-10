// The Track Lab engine: plays a reverse-engineered cover of a real track
// through the same scheduling approach as the game's MusicEngine (lookahead
// Clock, one-shot buffers on a 16th grid), but freed from the game's fixed
// six roles, tempo, and 4-bar phrase. This is an M3 proof-of-concept
// instrument: it exists to answer "can our engine render a track the
// developer sincerely wants to listen to?" — no gameplay attaches to it.
//
// Extra powers over MusicEngine, all needed by real tracks:
//   - voices keyed by string id, any number of them
//   - per-track bpm, phrase length (up to 16 bars), swing
//   - sections: named sets of charts, switched on a bar boundary
//   - optional full arrangements: authored section walks with an exact ending
//   - sidechain pump: kick-tagged voices duck the rest (the "produced" glue)

import { Clock } from '../audio/clock';
import { semitonesToRate } from '../audio/scale';
import type { LabChartEvent, LabTrack, LabVoiceDef } from './tracks/types';

const STEPS_PER_BAR = 16;

export interface LabVoice {
  def: LabVoiceDef;
  samples: Map<string, AudioBuffer>;
  defaultVariant: string;
  enabled: boolean;
  /** def.gain × the UI volume slider; recomputed on either change. */
  gain: GainNode;
  userGain: number;
  lastHit: { src: AudioBufferSourceNode; gain: GainNode } | null;
}

export interface LabTrigger {
  voiceId: string;
  time: number;
  step: number;
  velocity: number;
  variant?: string;
  note?: number;
}

export type LabTriggerListener = (t: LabTrigger) => void;

interface ArrangementBlock {
  sectionId: string;
  startBar: number;
  endBar: number;
}

export class LabEngine {
  readonly ctx: AudioContext;
  readonly track: LabTrack;
  readonly clock: Clock;
  readonly voices = new Map<string, LabVoice>();
  readonly stepsPerPhrase: number;
  sectionId: string;
  private master: GainNode;
  private duckBus: GainNode;
  private pending: LabTrigger[] = [];
  private listeners: LabTriggerListener[] = [];
  private sectionListeners: ((id: string) => void)[] = [];
  /** Absolute-step observers. The boss fight (src/boss) drives its arrangement
   *  walk and beat-locked attacks off these; the lab itself registers none, so
   *  this is a no-op for the audition surface. Fired at schedule time (a hair
   *  before the audio), which reads as a natural telegraph lead. */
  private stepListeners: ((absStep: number, phraseStep: number, time: number) => void)[] = [];
  private barQueue: (() => void)[] = [];
  private stepMarkers: { step: number; absStep: number; time: number }[] = [];
  private lastDueStep = 0;
  private lastDueAbsStep = 0;
  private arrangementBlocks: ArrangementBlock[] = [];
  private arrangementTotalBars = 0;
  private arrangementActive = false;
  private arrangementEndTime: number | null = null;
  private arrangementStopTimer: number | null = null;
  private scheduledSources = new Set<AudioBufferSourceNode>();
  private disposed = false;

  private constructor(ctx: AudioContext, track: LabTrack) {
    this.ctx = ctx;
    this.track = track;
    this.stepsPerPhrase = track.bars * STEPS_PER_BAR;
    this.sectionId = track.sections[0].id;

    let arrangementBar = 0;
    for (const entry of track.arrangement ?? []) {
      this.arrangementBlocks.push({
        sectionId: entry.sectionId,
        startBar: arrangementBar,
        endBar: arrangementBar + entry.bars,
      });
      arrangementBar += entry.bars;
    }
    this.arrangementTotalBars = arrangementBar;

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.master.connect(limiter).connect(ctx.destination);

    // Sidechain pump bus: every ducked voice routes through this gain, and
    // every trigger of a ducker voice (the kick) schedules a dip + recovery.
    this.duckBus = ctx.createGain();
    this.duckBus.connect(this.master);

    this.clock = new Clock(ctx, track.bpm, 4, (step, time) => this.onStep(step, time));
  }

  /** Build every voice's samples (offline synthesis / fetches), then wire up. */
  static async load(ctx: AudioContext, track: LabTrack): Promise<LabEngine> {
    const engine = new LabEngine(ctx, track);
    await Promise.all(
      track.voices.map(async (def) => {
        const samples = await def.build(ctx);
        const gain = ctx.createGain();
        gain.gain.value = def.gain ?? 1;
        gain.connect(def.ducked ? engine.duckBus : engine.master);
        engine.voices.set(def.id, {
          def,
          samples,
          defaultVariant: def.defaultVariant ?? samples.keys().next().value!,
          enabled: true,
          gain,
          userGain: 1,
          lastHit: null,
        });
      }),
    );
    return engine;
  }

  dispose(): void {
    this.stop();
    this.master.disconnect();
    this.disposed = true;
  }

  /** Start the currently selected section as a manual loop. */
  start(): void {
    if (this.disposed) return;
    this.cancelArrangement();
    void this.ctx.resume();
    this.clock.bpm = this.track.bpm * this.tempoScale;
    this.clock.start();
  }

  /** Restart at bar 1 and walk the track's authored full arrangement. Returns
   *  false for legacy studies that intentionally expose manual sections only. */
  startArrangement(): boolean {
    if (this.disposed || this.arrangementBlocks.length === 0) return false;
    this.clock.stop();
    this.silenceScheduled();
    this.cancelArrangement();
    this.resetTimeline();
    this.arrangementActive = true;
    this.applySection(this.arrangementBlocks[0].sectionId);
    void this.ctx.resume();
    this.clock.bpm = this.track.bpm * this.tempoScale;
    this.clock.start();
    return true;
  }

  get playingArrangement(): boolean {
    return this.arrangementActive;
  }

  /** The bar currently sounding in the full playthrough (1-based). The grid
   *  itself still follows the active section's local phrase. */
  arrangementPosition(): { bar: number; totalBars: number; sectionId: string } | null {
    if (!this.arrangementActive || this.arrangementTotalBars === 0) return null;
    const barIndex = Math.min(
      this.arrangementTotalBars - 1,
      Math.floor(this.lastDueAbsStep / STEPS_PER_BAR),
    );
    const block = this.arrangementBlocks.find(
      (candidate) => barIndex >= candidate.startBar && barIndex < candidate.endBar,
    );
    return {
      bar: barIndex + 1,
      totalBars: this.arrangementTotalBars,
      sectionId: block?.sectionId ?? this.sectionId,
    };
  }

  stop(): void {
    this.clock.stop();
    this.silenceScheduled();
    this.cancelArrangement();
    this.resetTimeline();
  }

  /** Tempo nudge for taste tests, 1 = the track's real bpm. */
  tempoScale = 1;
  setTempoScale(scale: number): void {
    this.tempoScale = scale;
    this.clock.bpm = this.track.bpm * scale;
  }

  setMasterGain(value: number): void {
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  setVoiceEnabled(id: string, on: boolean): void {
    const v = this.voices.get(id);
    if (v) v.enabled = on;
  }

  setVoiceVolume(id: string, value: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    v.userGain = value;
    v.gain.gain.setTargetAtTime((v.def.gain ?? 1) * value, this.ctx.currentTime, 0.02);
  }

  /** Switch sections cleanly on the next bar (the game's next-bar rule). */
  setSection(id: string): void {
    if (!this.track.sections.some((s) => s.id === id)) return;
    // A manual section choice exits the authored walk but keeps the clock
    // running; the requested loop still enters cleanly on the next bar.
    this.cancelArrangement();
    if (!this.clock.running) this.applySection(id);
    else this.barQueue.push(() => this.applySection(id));
  }

  onSectionChange(cb: (id: string) => void): void {
    this.sectionListeners.push(cb);
  }

  /** Observe every scheduled step: absStep is monotonic from start (so
   *  bars = floor(absStep / stepsPerBar)), phraseStep folds into the loop. */
  addStepListener(cb: (absStep: number, phraseStep: number, time: number) => void): void {
    this.stepListeners.push(cb);
  }

  addTriggerListener(cb: LabTriggerListener): void {
    this.listeners.push(cb);
  }

  /** Dispatch due triggers; call once per rAF frame. */
  update(): void {
    const now = this.ctx.currentTime;
    if (this.arrangementEndTime !== null && now >= this.arrangementEndTime) {
      this.finishArrangement();
    }
    const due: LabTrigger[] = [];
    const rest: LabTrigger[] = [];
    for (const t of this.pending) (t.time <= now ? due : rest).push(t);
    this.pending = rest;
    for (const t of due) for (const cb of this.listeners) cb(t);
  }

  currentStep(): number {
    const now = this.ctx.currentTime;
    while (this.stepMarkers.length > 0 && this.stepMarkers[0].time <= now) {
      const marker = this.stepMarkers.shift()!;
      this.lastDueStep = marker.step;
      this.lastDueAbsStep = marker.absStep;
    }
    return this.lastDueStep;
  }

  preview(id: string): void {
    const v = this.voices.get(id);
    if (!v) return;
    void this.ctx.resume();
    this.trigger(v, { step: 0, velocity: 0.9, note: v.def.pitched ? 0 : undefined }, this.ctx.currentTime);
  }

  private onStep(step: number, time: number): void {
    let phraseStep = step % this.stepsPerPhrase;
    if (this.arrangementActive) {
      if (step >= this.arrangementTotalBars * STEPS_PER_BAR) {
        this.scheduleArrangementEnd(time);
        return;
      }
      const absoluteBar = Math.floor(step / STEPS_PER_BAR);
      const block = this.arrangementBlocks.find(
        (candidate) => absoluteBar >= candidate.startBar && absoluteBar < candidate.endBar,
      )!;
      // Each arrangement entry begins on its own chart bar 1 even when the
      // previous entry held for a non-phrase-multiple number of bars.
      phraseStep = (step - block.startBar * STEPS_PER_BAR) % this.stepsPerPhrase;
      if (step % STEPS_PER_BAR === 0 && this.sectionId !== block.sectionId) {
        this.applySection(block.sectionId);
      }
    } else if (step % STEPS_PER_BAR === 0 && this.barQueue.length > 0) {
      const queue = this.barQueue;
      this.barQueue = [];
      for (const fn of queue) fn();
    }

    if (step === 0) {
      this.lastDueStep = 0;
      this.lastDueAbsStep = 0;
    }
    this.stepMarkers.push({ step: phraseStep, absStep: step, time });

    // Swing: delay every off-16th (odd step) by a fraction of a step, the
    // standard drum-machine shuffle. 0 = robot straight.
    const swung =
      step % 2 === 1 ? time + (this.track.swing ?? 0) * this.clock.stepDuration : time;

    const section = this.track.sections.find((s) => s.id === this.sectionId)!;
    for (const voice of this.voices.values()) {
      if (!voice.enabled) continue;
      const chart = section.charts[voice.def.id];
      if (!chart) continue;
      const loopStep = phraseStep % (chart.bars * STEPS_PER_BAR);
      for (const ev of chart.events) {
        if (ev.step === loopStep) this.trigger(voice, ev, swung, phraseStep);
      }
    }

    // Section for THIS step is settled (the bar flush ran above), so observers
    // see the right section when they walk an arrangement / spawn attacks.
    for (const cb of this.stepListeners) cb(step, phraseStep, time);
  }

  private applySection(id: string): void {
    this.sectionId = id;
    for (const cb of this.sectionListeners) cb(id);
  }

  /** The lookahead clock discovers the end shortly before it is heard. Stop at
   *  the scheduled audio time, while suppressing every later lookahead step. */
  private scheduleArrangementEnd(time: number): void {
    if (this.arrangementEndTime !== null) return;
    this.arrangementEndTime = time;
    const finishWhenDue = () => {
      if (this.arrangementEndTime === null) return;
      const remainingMs = (this.arrangementEndTime - this.ctx.currentTime) * 1000;
      if (remainingMs > 2) {
        this.arrangementStopTimer = window.setTimeout(finishWhenDue, remainingMs);
      } else {
        this.finishArrangement();
      }
    };
    this.arrangementStopTimer = window.setTimeout(
      finishWhenDue,
      Math.max(0, (time - this.ctx.currentTime) * 1000),
    );
  }

  private finishArrangement(): void {
    if (!this.arrangementActive) return;
    this.clock.stop();
    this.arrangementActive = false;
    this.arrangementEndTime = null;
    if (this.arrangementStopTimer !== null) window.clearTimeout(this.arrangementStopTimer);
    this.arrangementStopTimer = null;
    this.barQueue = [];
  }

  private cancelArrangement(): void {
    this.arrangementActive = false;
    this.arrangementEndTime = null;
    if (this.arrangementStopTimer !== null) window.clearTimeout(this.arrangementStopTimer);
    this.arrangementStopTimer = null;
  }

  private resetTimeline(): void {
    this.barQueue = [];
    this.pending = [];
    this.stepMarkers = [];
    this.lastDueStep = 0;
    this.lastDueAbsStep = 0;
  }

  /** Cancel the lookahead tail before a transport restart. Without this, a
   *  source already scheduled by the old manual loop can bleed into bar 1 of
   *  a newly started full arrangement. */
  private silenceScheduled(): void {
    const now = this.ctx.currentTime;
    for (const source of this.scheduledSources) {
      try {
        source.stop(now);
      } catch {
        // Already-ended sources are safe to ignore.
      }
    }
    this.scheduledSources.clear();
    for (const voice of this.voices.values()) voice.lastHit = null;
  }

  private trigger(voice: LabVoice, ev: LabChartEvent, time: number, phraseStep = -1): void {
    const variant = ev.variant ?? voice.defaultVariant;
    const buffer = voice.samples.get(variant) ?? voice.samples.values().next().value;
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    this.scheduledSources.add(src);
    src.addEventListener('ended', () => this.scheduledSources.delete(src), { once: true });
    let rate = semitonesToRate((ev.note ?? 0) + (voice.def.tune ?? 0));
    if (!voice.def.pitched) {
      rate *= semitonesToRate(((Math.random() * 2 - 1) * (this.track.humanizeCents ?? 5)) / 100);
    }
    src.playbackRate.value = rate;

    const g = this.ctx.createGain();
    const wobble = 1 + (Math.random() * 2 - 1) * (this.track.humanizeGain ?? 0.06);
    g.gain.value = Math.max(0.01, ev.velocity * wobble);
    src.connect(g).connect(voice.gain);
    src.start(time);

    if (voice.def.choke) {
      const prev = voice.lastHit;
      if (prev) {
        prev.gain.gain.setValueAtTime(prev.gain.gain.value, time);
        prev.gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        prev.src.stop(time + 0.05);
      }
      voice.lastHit = { src, gain: g };
    }

    // The pump: a ducker's hit dips the duck bus and lets it swell back.
    const pump = this.track.pump;
    if (pump && voice.def.ducker) {
      const p = this.duckBus.gain;
      p.cancelScheduledValues(time);
      p.setValueAtTime(1 - pump.amount, time + 0.002);
      p.linearRampToValueAtTime(1, time + pump.release);
    }

    this.pending.push({
      voiceId: voice.def.id,
      time,
      step: phraseStep,
      velocity: ev.velocity,
      variant: ev.variant,
      note: ev.note,
    });
    if (this.pending.length > 128) {
      const cutoff = this.ctx.currentTime - 1;
      this.pending = this.pending.filter((t) => t.time > cutoff);
    }
  }
}
