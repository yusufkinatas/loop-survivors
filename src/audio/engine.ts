// The music engine: fire control and arranger at once (docs/plan.md,
// Coupling Model A). In M1 sub-phase A it only makes sound; sub-phase B
// attaches damage to the same triggers. It is a pure function of build
// (which voices are on) and grid (the clock's steps): no stage input exists.

import { Clock } from './clock';
import { CHARTS, type Chart, type ChartEvent } from './charts';
import { SKELETON, STEPS_PER_BAR, semitonesToRate } from './scale';
import type { Kit, Role } from './kits';

export interface Voice {
  role: Role;
  kit: Kit;
  chart: Chart;
  enabled: boolean;
  gain: GainNode;
  /** Buffers actually triggered: the kit's own, or a sample set's applied
   *  over them. The kit stays pristine as the restore point. */
  activeSamples: Map<string, AudioBuffer>;
  /** Semitones retuning the active samples' pitch to the run's root. */
  tune: number;
  /** Audition slot: a sample loaded in the rehearsal room replaces the kit's
   *  buffers for every trigger until reset. */
  override: AudioBuffer | null;
  /** The most recent trigger's nodes, so choked kits can cut it. */
  lastHit: { src: AudioBufferSourceNode; gain: GainNode } | null;
}

/** A trigger that has been scheduled, for visual sync (voice lights now,
 *  damage events later). Consumed by drainDueTriggers. */
export interface ScheduledTrigger {
  role: Role;
  time: number;
  velocity: number;
}

// Free per-hit engine nudges: the first of the three variation layers.
const HUMANIZE_GAIN = 0.12; // +/- proportional
const HUMANIZE_CENTS = 8; // +/- pitch, applied only to unpitched kits

export class MusicEngine {
  readonly ctx: AudioContext;
  readonly clock: Clock;
  /** Post-limiter tap: output metering for debug tools and, later, visuals. */
  readonly analyser: AnalyserNode;
  readonly voices = new Map<Role, Voice>();
  private master: GainNode;
  private pending: ScheduledTrigger[] = [];
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;

  constructor(ctx: AudioContext, kits: Map<Role, Kit>) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    // Soft-knee limiter on the master so any build stays clean (Pillar 2:
    // the system owns the theory, no combination may sound broken).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(limiter).connect(this.analyser).connect(ctx.destination);

    for (const [role, kit] of kits) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gain.connect(this.master);
      this.voices.set(role, {
        role,
        kit,
        chart: CHARTS[role],
        enabled: false,
        gain,
        activeSamples: kit.samples,
        tune: 0,
        override: null,
        lastHit: null,
      });
    }

    this.clock = new Clock(ctx, SKELETON.bpm, SKELETON.stepsPerBeat, (step, time) =>
      this.onStep(step, time),
    );
  }

  /** RMS of the current output window, 0..~1. Debug metering. */
  outputLevel(): number {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += v * v;
    return Math.sqrt(sum / data.length);
  }

  setMasterGain(value: number): void {
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  setVoiceEnabled(role: Role, on: boolean): void {
    const voice = this.voices.get(role);
    if (voice) voice.enabled = on;
  }

  setVoiceGain(role: Role, value: number): void {
    const voice = this.voices.get(role);
    if (voice) voice.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  /** Swap a voice's samples for a sample set's buffers (null restores the
   *  builtin kit). Takes effect on the next trigger; already-scheduled
   *  sources keep their old buffer, so the swap is click-free mid-play. */
  setVoiceSamples(role: Role, samples: Map<string, AudioBuffer> | null, tune = 0): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.activeSamples = samples ?? voice.kit.samples;
    voice.tune = samples ? tune : 0;
  }

  /** Triggers whose scheduled time has arrived, for frame-synced visuals. */
  drainDueTriggers(): ScheduledTrigger[] {
    const now = this.ctx.currentTime;
    const due: ScheduledTrigger[] = [];
    const rest: ScheduledTrigger[] = [];
    for (const t of this.pending) (t.time <= now ? due : rest).push(t);
    this.pending = rest;
    return due;
  }

  /** The grid step currently sounding, for position readouts. Valid while
   *  the clock runs; tempo-change-safe because it follows scheduled times. */
  currentStep(): number {
    const now = this.ctx.currentTime;
    while (this.stepMarkers.length > 0 && this.stepMarkers[0].time <= now) {
      this.lastDueStep = this.stepMarkers.shift()!.step;
    }
    return this.lastDueStep;
  }

  /** Play one event immediately, outside the grid. Rehearsal-room audition. */
  preview(role: Role, event?: ChartEvent): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    const ev = event ?? { step: 0, velocity: 0.9, note: voice.kit.pitched ? 0 : undefined };
    this.trigger(voice, ev, this.ctx.currentTime);
  }

  private onStep(step: number, time: number): void {
    if (step === 0) this.lastDueStep = 0;
    this.stepMarkers.push({ step, time });
    for (const voice of this.voices.values()) {
      if (!voice.enabled) continue;
      const loopStep = step % (voice.chart.bars * STEPS_PER_BAR);
      for (const ev of voice.chart.events) {
        if (ev.step === loopStep) this.trigger(voice, ev, time);
      }
    }
  }

  private trigger(voice: Voice, ev: ChartEvent, time: number): void {
    const variant = ev.variant ?? voice.kit.defaultVariant;
    const buffer =
      voice.override ??
      voice.activeSamples.get(variant) ??
      voice.activeSamples.values().next().value;
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    let rate = semitonesToRate((ev.note ?? 0) + voice.tune);
    if (!voice.kit.pitched) {
      rate *= semitonesToRate(((Math.random() * 2 - 1) * HUMANIZE_CENTS) / 100);
    }
    src.playbackRate.value = rate;

    const g = this.ctx.createGain();
    const humanized = ev.velocity * (1 + (Math.random() * 2 - 1) * HUMANIZE_GAIN);
    g.gain.value = Math.max(0.01, humanized);
    src.connect(g).connect(voice.gain);
    src.start(time);

    if (voice.kit.choke) {
      const prev = voice.lastHit;
      if (prev) {
        // Fade the ringing hit out right as the new one lands.
        prev.gain.gain.setValueAtTime(prev.gain.gain.value, time);
        prev.gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        prev.src.stop(time + 0.05);
      }
      voice.lastHit = { src, gain: g };
    }

    this.pending.push({ role: voice.role, time, velocity: ev.velocity });
    // If no consumer is draining (hidden tab pauses rAF), drop stale entries
    // so the queue cannot grow unboundedly while audio keeps scheduling.
    if (this.pending.length > 64) {
      const cutoff = this.ctx.currentTime - 1;
      this.pending = this.pending.filter((t) => t.time > cutoff);
    }
  }
}
