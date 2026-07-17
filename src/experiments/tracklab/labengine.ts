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
//   - sidechain pump: kick-tagged voices duck the rest (the "produced" glue)

import { Clock } from '../../audio/clock';
import { semitonesToRate } from '../../audio/scale';
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
  /** Absolute-step observers. The boss fight (src/experiments/boss) drives its arrangement
   *  walk and beat-locked attacks off these; the lab itself registers none, so
   *  this is a no-op for the audition surface. Fired at schedule time (a hair
   *  before the audio), which reads as a natural telegraph lead. */
  private stepListeners: ((absStep: number, phraseStep: number, time: number) => void)[] = [];
  private barQueue: (() => void)[] = [];
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;
  private disposed = false;

  private constructor(ctx: AudioContext, track: LabTrack) {
    this.ctx = ctx;
    this.track = track;
    this.stepsPerPhrase = track.bars * STEPS_PER_BAR;
    this.sectionId = track.sections[0].id;

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
    this.clock.stop();
    this.master.disconnect();
    this.disposed = true;
  }

  start(): void {
    if (this.disposed) return;
    void this.ctx.resume();
    this.clock.bpm = this.track.bpm * this.tempoScale;
    this.clock.start();
  }

  stop(): void {
    this.clock.stop();
    this.barQueue = [];
    this.stepMarkers = [];
    this.lastDueStep = 0;
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
    const apply = () => {
      this.sectionId = id;
      for (const cb of this.sectionListeners) cb(id);
    };
    if (!this.clock.running) apply();
    else this.barQueue.push(apply);
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
    const due: LabTrigger[] = [];
    const rest: LabTrigger[] = [];
    for (const t of this.pending) (t.time <= now ? due : rest).push(t);
    this.pending = rest;
    for (const t of due) for (const cb of this.listeners) cb(t);
  }

  currentStep(): number {
    const now = this.ctx.currentTime;
    while (this.stepMarkers.length > 0 && this.stepMarkers[0].time <= now) {
      this.lastDueStep = this.stepMarkers.shift()!.step;
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
    const phraseStep = step % this.stepsPerPhrase;
    if (step === 0) this.lastDueStep = 0;
    this.stepMarkers.push({ step: phraseStep, time });

    if (phraseStep % STEPS_PER_BAR === 0 && this.barQueue.length > 0) {
      const queue = this.barQueue;
      this.barQueue = [];
      for (const fn of queue) fn();
    }

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

  private trigger(voice: LabVoice, ev: LabChartEvent, time: number, phraseStep = -1): void {
    const variant = ev.variant ?? voice.defaultVariant;
    const buffer = voice.samples.get(variant) ?? voice.samples.values().next().value;
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
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
