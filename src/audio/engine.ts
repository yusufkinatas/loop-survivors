// The music engine: fire control and arranger at once (docs/plan.md,
// Coupling Model A). In M1 sub-phase A it only makes sound; sub-phase B
// attaches damage to the same triggers. It is a pure function of build
// (which voices are on) and grid (the clock's steps): no stage input exists.

import { Clock } from './clock';
import { chartEventsAtStep } from './arranger';
import { TIER_COUNT, type Chart, type ChartEvent } from './charts';
import { getChart, setActiveGenre } from './chartstore';
import { genreSupports, type Genre, type GenreId } from './genres';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE, semitonesToRate } from './scale';
import type { Kit, Role } from './kits';
import { kitForGenre } from './kits/index';
import { makeEffectNodes, type EffectId } from './voicefx';

export interface Voice {
  role: Role;
  kit: Kit;
  chart: Chart;
  /** Ladder tier 1-4 the voice is playing. */
  tier: number;
  enabled: boolean;
  gain: GainNode;
  /** Sidechain node between gain and the output chain: the kick dips it on the
   *  bass voice so the two subs never stack (design rule 1). Unity otherwise. */
  duck: GainNode;
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
  /** Per-voice sound effect (Feature 4), inserted between gain and master. */
  effect: EffectId | null;
  /** Current inserted effect nodes, kept for teardown. */
  fxNodes: AudioNode[];
}

/** A trigger that has been scheduled. Dispatched to listeners by update()
 *  once its audio time arrives: one trigger is one event with two outputs,
 *  a sound in the mix and (in the game) damage in the world. */
export interface ScheduledTrigger {
  role: Role;
  time: number;
  velocity: number;
  /** Grid step within the phrase that fired this trigger; -1 for previews. */
  step: number;
  variant?: string;
  note?: number;
}

export type TriggerListener = (t: ScheduledTrigger) => void;

// Free per-hit engine nudges: the first of the three variation layers.
const HUMANIZE_GAIN = 0.12; // +/- proportional
const HUMANIZE_CENTS = 8; // +/- pitch, applied only to unpitched kits

// Kick-ducks-bass sidechain (the band, design rule 1): on each kick the bass
// voice dips to DUCK_DEPTH (~-6 dB) over DUCK_ATTACK and recovers by
// DUCK_RELEASE — a split-second pump so the two low ends never sum into mud.
const DUCK_DEPTH = 0.5;
const DUCK_ATTACK = 0.008;
const DUCK_RELEASE = 0.14;
// The Bass-slot sub-bass instruments the kick ducks. A build owns at most one
// (they share the Bass slot), so this ducks whichever is present.
const SUB_BASS_ROLES: readonly Role[] = ['bass', 'reese', 'pluck'];

export class MusicEngine {
  readonly ctx: AudioContext;
  readonly clock: Clock;
  /** Post-limiter tap: output metering for debug tools and, later, visuals. */
  readonly analyser: AnalyserNode;
  readonly voices = new Map<Role, Voice>();
  private master: GainNode;
  private pending: ScheduledTrigger[] = [];
  private listeners: TriggerListener[] = [];
  private barQueue: (() => void)[] = [];
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;
  /** Guards the async genre-kit swap: a newer setGenre invalidates an in-flight
   *  kit load so a slow older one can't clobber the current voicing. */
  private genreKitToken = 0;

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
      // gain -> duck -> master: the persistent duck node is unity except when
      // the kick sidechains the bass (design rule 1). buildVoiceChain rewires
      // duck's downstream when an effect is inserted; gain -> duck stays fixed.
      const duck = ctx.createGain();
      duck.gain.value = 1;
      gain.connect(duck);
      duck.connect(this.master);
      // Voices start disabled at tier 1; the run enables and tiers them as the
      // player picks. The active genre (set at run start) decides what they play.
      this.voices.set(role, {
        role,
        kit,
        chart: getChart(role, 1),
        tier: 1,
        enabled: false,
        gain,
        duck,
        activeSamples: kit.samples,
        tune: 0,
        override: null,
        lastHit: null,
        effect: null,
        fxNodes: [],
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

  /** Switch the run's genre (its playable character): tempo, swing, the genre's
   *  own voicing of the soundset, AND its supported instrument set all change at
   *  once. Supported voices re-point to the genre's chart at their current tier;
   *  a voice for a role this genre does not support is disabled (never offered,
   *  never voiced). The genre's own buffers are swapped in asynchronously. */
  setGenre(genre: Genre): void {
    setActiveGenre(genre.id);
    this.clock.bpm = genre.bpm;
    this.clock.swing = genre.swing;
    for (const voice of this.voices.values()) {
      if (genreSupports(genre.id, voice.role)) {
        voice.chart = getChart(voice.role, voice.tier);
      } else {
        voice.enabled = false;
      }
    }
    void this.applyGenreKit(genre.id);
  }

  /** Swap every voice's active buffers to the genre's own kit (kits/<genre>.ts),
   *  cached per genre. Async: the kit renders on first use and the swap takes
   *  effect on each voice's next trigger, so it is click-free mid-play. A role
   *  the genre kit does not cover keeps the default builtin buffers. */
  private async applyGenreKit(id: GenreId): Promise<void> {
    const token = ++this.genreKitToken;
    const kit = await kitForGenre(id, SKELETON.rootHz);
    if (token !== this.genreKitToken) return; // superseded by a newer setGenre
    for (const voice of this.voices.values()) {
      const k = kit.get(voice.role);
      voice.activeSamples = k?.samples ?? voice.kit.samples;
      // A sampled pitched voice carries a tune to align its recorded root to
      // the A reference; synth kits and drums are 0.
      voice.tune = k?.tune ?? 0;
    }
  }

  /** Put a voice on a ladder tier: swaps its chart for the tier's working
   *  copy. Takes effect on the next step the new chart fires. */
  setVoiceTier(role: Role, tier: number): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.tier = Math.max(1, Math.min(TIER_COUNT, tier));
    voice.chart = getChart(role, voice.tier);
  }

  setVoiceGain(role: Role, value: number): void {
    const voice = this.voices.get(role);
    if (voice) voice.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  /** Rewire a voice's output chain for its current effect: tear the old
   *  effect nodes down and re-insert (or bypass) between gain and master.
   *  The insertion point is strictly gain -> [effect] -> master; global
   *  processing belongs on the master bus, not here. */
  private buildVoiceChain(voice: Voice): void {
    // The chain source is the duck node (gain -> duck is fixed); only duck's
    // downstream is rewired here so the sidechain survives an effect swap.
    voice.duck.disconnect();
    for (const n of voice.fxNodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* not an oscillator */
      }
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    voice.fxNodes = [];
    if (!voice.effect) {
      voice.duck.connect(this.master);
      return;
    }
    const fx = makeEffectNodes(this.ctx, voice.effect);
    voice.duck.connect(fx.input);
    fx.output.connect(this.master);
    voice.fxNodes = fx.nodes;
  }

  /** Assign/clear a voice's effect, click-free: dip the voice gain to ~0 over
   *  12ms, swap the chain, ramp back. Rare (per level-up, at a bar boundary). */
  setVoiceEffect(role: Role, effect: EffectId | null): void {
    const voice = this.voices.get(role);
    if (!voice || voice.effect === effect) return;
    const now = this.ctx.currentTime;
    const cur = voice.gain.gain.value;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(cur, now);
    voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.012);
    setTimeout(() => {
      voice.effect = effect;
      this.buildVoiceChain(voice);
      const t = this.ctx.currentTime;
      voice.gain.gain.setValueAtTime(0.0001, t);
      voice.gain.gain.linearRampToValueAtTime(cur, t + 0.012);
    }, 20);
  }

  /** Run reset: strip every voice back to the dry path (no effect leak). */
  clearVoiceEffects(): void {
    for (const r of this.voices.keys()) this.setVoiceEffect(r, null);
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

  /** Register for due triggers. Fired from update(), i.e. frame-synced. */
  addTriggerListener(cb: TriggerListener): void {
    this.listeners.push(cb);
  }

  /** Musical entry rule (M2): run fn at the start of the next bar, so the
   *  old chart finishes its bar and the change enters on the following "1".
   *  Executes at schedule time (~0.1s before it is heard) — close enough
   *  for the visuals that ride on it. */
  atNextBar(fn: () => void): void {
    this.barQueue.push(fn);
  }

  /** Drop queued next-bar changes (a run ended before they landed). */
  clearBarQueue(): void {
    this.barQueue = [];
  }

  /** Dispatch every trigger whose scheduled time has arrived. Call once per
   *  frame from whatever loop is driving visuals (room rAF or game ticker). */
  update(): void {
    const now = this.ctx.currentTime;
    const due: ScheduledTrigger[] = [];
    const rest: ScheduledTrigger[] = [];
    for (const t of this.pending) (t.time <= now ? due : rest).push(t);
    this.pending = rest;
    for (const t of due) for (const cb of this.listeners) cb(t);
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
    // The phrase clock: bars 1-4, then roll over. Charts loop inside the
    // phrase, so a 4-bar chart's bar 4 is always the phrase's bar 4 and
    // once-per-phrase material lands where it was written.
    const phraseStep = step % STEPS_PER_PHRASE;
    if (phraseStep % STEPS_PER_BAR === 0 && this.barQueue.length > 0) {
      const queue = this.barQueue;
      this.barQueue = [];
      for (const fn of queue) fn();
    }
    for (const voice of this.voices.values()) {
      if (!voice.enabled) continue;
      for (const ev of chartEventsAtStep(voice.chart, phraseStep)) {
        this.trigger(voice, ev, time, phraseStep);
      }
    }
  }

  private trigger(voice: Voice, ev: ChartEvent, time: number, phraseStep = -1): void {
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

    // Kick ducks bass (design rule 1): schedule the dip at the kick's future
    // audio time (the clock runs ~0.12s ahead), for whichever sub-bass fills
    // the Bass slot — bass, Reese, or pluck bass all sum with the kick's sub
    // and must dip (a build only ever owns one of them, so at most one ducks).
    // cancelScheduledValues from `time` keeps rapid kicks from stacking ramps.
    if (voice.role === 'kick') {
      for (const role of SUB_BASS_ROLES) {
        const low = this.voices.get(role);
        if (!low || !low.enabled) continue;
        const p = low.duck.gain;
        p.cancelScheduledValues(time);
        p.setValueAtTime(1, time);
        p.linearRampToValueAtTime(DUCK_DEPTH, time + DUCK_ATTACK);
        p.linearRampToValueAtTime(1, time + DUCK_RELEASE);
      }
    }

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

    this.pending.push({
      role: voice.role,
      time,
      velocity: ev.velocity,
      step: phraseStep,
      variant: ev.variant,
      note: ev.note,
    });
    // If no consumer is draining (hidden tab pauses rAF), drop stale entries
    // so the queue cannot grow unboundedly while audio keeps scheduling.
    if (this.pending.length > 64) {
      const cutoff = this.ctx.currentTime - 1;
      this.pending = this.pending.filter((t) => t.time > cutoff);
    }
  }
}
