// The music engine: fire control and arranger at once (docs/plan.md,
// Coupling Model A). In M1 sub-phase A it only makes sound; sub-phase B
// attaches damage to the same triggers. It is a pure function of build
// (which voices are on) and grid (the clock's steps): no stage input exists.

import { Clock } from './clock';
import { chartEventsAtStep } from './arranger';
import { TIER_COUNT, type Chart, type ChartEvent } from './charts';
import { getChart } from './chartstore';
import { SOUNDSET } from './soundset';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE, semitonesToRate } from './scale';
import type { Kit, Role } from './kits';
import { buildSoundsetKit } from './kits/index';
import {
  evolvedAudioTreatment,
  type AudioLayerPlan,
  type EvolvedAudioTreatment,
} from './evolved';

interface VoiceHit {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export interface Voice {
  role: Role;
  kit: Kit;
  chart: Chart;
  /** Ladder tier 1-4 the voice is playing. */
  tier: number;
  /** Evolution is orthogonal to tier: evolved voices keep their tier-IV chart.
   *  The state selects an audio-owned treatment and is snapshotted into the
   *  same one-per-chart-event gameplay trigger. */
  evolved: boolean;
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
  lastHit: VoiceHit | null;
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
  /** State captured when lookahead schedules the event, so gameplay cannot see
   *  a newer mutable evolution state than the sound it is paired with. */
  evolved: boolean;
}

export type TriggerListener = (t: ScheduledTrigger) => void;

interface TimedAction {
  time: number;
  fn: () => void;
  seq: number;
}

interface PendingTrigger {
  trigger: ScheduledTrigger;
  /** Main source retained separately for the choke-history identity; sources
   *  includes every quiet evolved layer so lookahead rewind cancels the whole
   *  one-trigger audio event. */
  source: AudioBufferSourceNode;
  sources: AudioBufferSourceNode[];
  voice: Voice;
  chokedPrevious: VoiceHit | null;
}

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
const SUB_BASS_ROLES: readonly Role[] = ['bass'];

export class MusicEngine {
  readonly ctx: AudioContext;
  readonly clock: Clock;
  /** Post-limiter tap: output metering for debug tools and, later, visuals. */
  readonly analyser: AnalyserNode;
  readonly voices = new Map<Role, Voice>();
  private master: GainNode;
  /** The last non-transient master target (set by setMasterGain): the volume
   *  duckWeapons ramps back to, and the mute check the level cue respects. */
  private masterTarget = 0.8;
  /** Weapons sub-bus (every voice sums here before master): lets a level-up
   *  dip the whole soundtrack for its slow-mo moment while the level cue,
   *  which rides master directly, rings out over the dip. */
  private weaponsBus: GainNode;
  /** Independent transport gate: intentional game pauses mute immediately
   * while AudioContext.suspend() crosses the browser control boundary. */
  private transport: GainNode;
  private transportHeld = false;
  private suspendPromise: Promise<void> | null = null;
  private transportGeneration = 0;
  private pending: PendingTrigger[] = [];
  private activeSources = new Set<AudioBufferSourceNode>();
  private listeners: TriggerListener[] = [];
  private barQueue: ((audioTime: number) => void)[] = [];
  private timedActions: TimedAction[] = [];
  private nextTimedActionSeq = 0;
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;

  constructor(ctx: AudioContext, kits: Map<Role, Kit>) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.weaponsBus = ctx.createGain();
    this.weaponsBus.gain.value = 1;
    this.weaponsBus.connect(this.master);
    this.transport = ctx.createGain();
    this.transport.gain.value = 1;
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
    this.master
      .connect(this.transport)
      .connect(limiter)
      .connect(this.analyser)
      .connect(ctx.destination);

    for (const [role, kit] of kits) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      // gain -> duck -> weaponsBus -> master: the persistent duck node is unity
      // except when the kick sidechains the bass (design rule 1); the weapons
      // bus is what a level-up dip acts on.
      const duck = ctx.createGain();
      duck.gain.value = 1;
      gain.connect(duck);
      duck.connect(this.weaponsBus);
      // Voices start disabled at tier 1; the run enables and tiers them as the
      // player picks. The soundset decides what they play.
      this.voices.set(role, {
        role,
        kit,
        chart: getChart(role, 1),
        tier: 1,
        evolved: false,
        enabled: false,
        gain,
        duck,
        activeSamples: kit.samples,
        tune: 0,
        override: null,
        lastHit: null,
      });
    }

    this.clock = new Clock(ctx, SKELETON.bpm, SKELETON.stepsPerBeat, (step, time) =>
      this.onStep(step, time),
    );
    // The soundset sets the tempo and swing, and its own voicing (real drum /
    // bass samples over the synth kit) is swapped in asynchronously — click-free
    // because nothing is playing yet.
    this.clock.bpm = SOUNDSET.bpm;
    this.clock.swing = SOUNDSET.swing;
    void this.applySoundsetKit();
  }

  /** Swap every voice's active buffers to the soundset's own kit
   *  (kits/index.ts), rendered once and cached. Async: the kit renders on first
   *  use and the swap takes effect on each voice's next trigger. A role the
   *  soundset kit does not cover keeps the default builtin buffers. */
  private async applySoundsetKit(): Promise<void> {
    const kit = await buildSoundsetKit(SKELETON.rootHz);
    for (const voice of this.voices.values()) {
      const k = kit.get(voice.role);
      voice.activeSamples = k?.samples ?? voice.kit.samples;
      // A sampled pitched voice carries a tune to align its recorded root to
      // the A reference; synth kits and drums are 0.
      voice.tune = k?.tune ?? 0;
    }
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
    this.masterTarget = value;
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  /** Level-up moment: dip the whole weapons bus to `depth` of unity for
   *  `holdS` seconds, then ramp back. Acts on the weapons sub-bus, so the
   *  level cue (on master) rides over the dip. No-op while muted. */
  duckWeapons(depth: number, holdS: number): void {
    if (this.masterTarget <= 0) return; // muted: nothing to duck
    const g = this.weaponsBus.gain;
    const now = this.ctx.currentTime;
    const target = Math.max(0, Math.min(1, depth));
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + 0.06);
    g.setValueAtTime(target, now + Math.max(0.1, holdS - 0.28));
    g.linearRampToValueAtTime(1, now + holdS);
  }

  /** Cut a level-up duck short: cancel the scheduled hold/ramp and bring the
   *  weapons bus back to unity quickly. Called when the moment ends early
   *  because the player collected a pick before momentS elapsed. No-op muted. */
  restoreWeapons(rampS = 0.12): void {
    if (this.masterTarget <= 0) return; // muted: nothing to restore
    const g = this.weaponsBus.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1, now + Math.max(0.02, rampS));
  }

  /** A short, bright "level up" chime — a quick ascending major sparkle.
   *  Rides master (respects mute) on its own gain, bypassing the weapons bus
   *  so the level-up dip never swallows it. Purely cosmetic. */
  playLevelCue(): void {
    if (this.masterTarget <= 0) return; // muted
    const now = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 1;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    out.connect(lp).connect(this.master);
    // C6 major triad up to C7: a classic pickup sparkle, arpeggiated fast.
    const notes = [1046.5, 1318.5, 1568.0, 2093.0];
    for (let i = 0; i < notes.length; i++) {
      const t0 = now + i * 0.045;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = notes[i];
      const env = this.ctx.createGain();
      const peak = 0.16 * (1 - i * 0.12);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
      osc.connect(env).connect(out);
      osc.start(t0);
      osc.stop(t0 + 0.42);
    }
  }

  /** Freeze already-scheduled lookahead audio at an intentional game pause.
   * Suspending the AudioContext also freezes currentTime, so pending gameplay
   * triggers remain paired with their sounds instead of leaking through a
   * level-up screen. */
  holdTransport(rewindLookahead = false): void {
    if (this.transportHeld) return;
    this.transportHeld = true;
    this.transportGeneration++;
    const now = this.ctx.currentTime;
    this.transport.gain.cancelScheduledValues(now);
    this.transport.gain.setValueAtTime(0, now);
    if (rewindLookahead) this.rewindScheduledTail(now);
    this.suspendPromise = this.ctx.suspend().catch(() => undefined);
  }

  /** A reward choice must still catch the next heard downbeat when that bar
   * was already inside the 120 ms scheduler window. Cancel the unheard tail,
   * rewind its first grid step, then let resume schedule it with the new pick.
   * Ordinary ESC pauses do not use this path and preserve their tail. */
  private rewindScheduledTail(now: number): void {
    // Only a pre-scheduled downbeat can make a choice miss the next heard bar.
    // Preserve every old-chart step before it; downbeats are never swung, so
    // marker.time is also the exact base-grid time Clock must restore.
    const nextBar = this.stepMarkers.find(
      (marker) => marker.time > now + 1e-6 && marker.step % STEPS_PER_BAR === 0,
    );
    if (!nextBar) return;

    const keep: PendingTrigger[] = [];
    const canceled = new Map<AudioBufferSourceNode, PendingTrigger>();
    for (const pending of this.pending) {
      if (pending.trigger.time + 1e-6 < nextBar.time) {
        keep.push(pending);
        continue;
      }
      canceled.set(pending.source, pending);
      for (const source of pending.sources) {
        try {
          source.stop(now);
        } catch {
          // A browser may report an already-finished source at the boundary;
          // its gameplay trigger is still removed with the canceled tail.
        }
      }
    }
    this.pending = keep;
    this.stepMarkers = this.stepMarkers.filter((marker) => marker.time < nextBar.time);
    this.clock.rewindToStep(nextBar.step, nextBar.time);

    // Choked voices point at their most recently scheduled source. Walk back
    // through canceled hits and remove the future fade they authored on the
    // surviving predecessor. (Sources now end naturally; no irreversible
    // future stop is scheduled by trigger().)
    for (const voice of this.voices.values()) {
      let hit = voice.lastHit;
      while (hit && canceled.has(hit.src)) hit = canceled.get(hit.src)!.chokedPrevious;
      if (hit !== voice.lastHit) {
        hit?.gain.gain.cancelScheduledValues(nextBar.time);
        voice.lastHit = hit;
      }
    }
  }

  /** Resume an intentional pause. The scheduler may restart immediately: it
   * reads the frozen audio time until this asynchronous resume completes. */
  releaseTransport(): void {
    if (!this.transportHeld) return;
    this.transportHeld = false;
    const generation = ++this.transportGeneration;
    const suspended = this.suspendPromise;
    void (async () => {
      await suspended;
      if (this.transportHeld || generation !== this.transportGeneration) return;
      const now = this.ctx.currentTime;
      this.transport.gain.cancelScheduledValues(now);
      this.transport.gain.setValueAtTime(1, now);
      if (this.ctx.state !== 'running') await this.ctx.resume();
    })();
  }

  /** Browser gesture recovery, except while the game deliberately owns the
   * pause (a generic document pointer must not unfreeze a pick screen). */
  resumeContextIfAllowed(): void {
    if (!this.transportHeld && this.ctx.state !== 'running') void this.ctx.resume();
  }

  setVoiceEnabled(role: Role, on: boolean): void {
    const voice = this.voices.get(role);
    if (voice) voice.enabled = on;
  }

  /** Put a voice on a ladder tier: swaps its chart for the tier's working
   *  copy. Takes effect on the next step the new chart fires. */
  setVoiceTier(role: Role, tier: number): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.tier = Math.max(1, Math.min(TIER_COUNT, tier));
    voice.chart = getChart(role, voice.tier);
  }

  /** Evolution never changes the chart or tier. Audio layers and gameplay both
   *  read the exact lookahead snapshot authored by this boolean. */
  setVoiceEvolved(role: Role, on: boolean): void {
    const voice = this.voices.get(role);
    if (voice) voice.evolved = on;
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

  /** Register for due triggers. Fired from update(), i.e. frame-synced. Returns
   *  an idempotent unsubscribe so temporary developer surfaces cannot leak. */
  addTriggerListener(cb: TriggerListener): () => void {
    let active = true;
    const listener: TriggerListener = (trigger) => {
      if (active) cb(trigger);
    };
    this.listeners.push(listener);
    return () => {
      if (!active) return;
      active = false;
      // Replace rather than splice: unsubscribing inside a callback cannot make
      // the current dispatch skip the listener that follows it.
      this.listeners = this.listeners.filter((candidate) => candidate !== listener);
    };
  }

  /** Musical entry rule (M2): run fn while scheduling the start of the next
   *  bar, so an audio voice can change before that bar's notes are queued.
   *  Use atAudioTime() inside fn for world/UI state that must not change until
   *  the scheduled bar is actually heard. */
  atNextBar(fn: (audioTime: number) => void): void {
    this.barQueue.push(fn);
  }

  /** Queue non-audio state for an exact audio-clock instant. update() merges
   *  these actions with due triggers chronologically; actions run before a
   *  trigger at the same timestamp, but never before an older trigger. */
  atAudioTime(time: number, fn: () => void): void {
    this.timedActions.push({ time, fn, seq: this.nextTimedActionSeq++ });
  }

  /** Drop queued next-bar changes (a run ended before they landed). */
  clearBarQueue(): void {
    this.barQueue = [];
    this.timedActions = [];
  }

  /** Stop and forget the scheduler's temporary audio state. Top-level
   * developer surfaces use this when changing exhibits so a lookahead note,
   * choke reference, or delayed gameplay trigger cannot cross the boundary.
   * Normal run flow deliberately keeps using the narrower clearBarQueue(). */
  clearTransientSchedule(): void {
    this.clock.stop();
    const now = this.ctx.currentTime;
    for (const source of this.activeSources) {
      try {
        source.stop(now);
      } catch {
        // The source may already have ended between collection and cleanup.
      }
    }
    this.activeSources.clear();
    this.pending = [];
    this.barQueue = [];
    this.timedActions = [];
    this.stepMarkers = [];
    this.lastDueStep = 0;
    this.nextTimedActionSeq = 0;
    for (const voice of this.voices.values()) {
      voice.lastHit = null;
      voice.duck.gain.cancelScheduledValues(now);
      voice.duck.gain.value = 1;
    }
  }

  transientScheduleEmpty(): boolean {
    return (
      this.activeSources.size === 0 &&
      this.pending.length === 0 &&
      this.barQueue.length === 0 &&
      this.timedActions.length === 0 &&
      this.stepMarkers.length === 0
    );
  }

  /** Dispatch every trigger whose scheduled time has arrived. Call once per
   *  frame from whatever loop is driving visuals (room rAF or game ticker). */
  update(): void {
    if (this.transportHeld) return;
    const now = this.ctx.currentTime;
    const dueTriggers: PendingTrigger[] = [];
    const futureTriggers: PendingTrigger[] = [];
    for (const pending of this.pending) {
      (pending.trigger.time <= now ? dueTriggers : futureTriggers).push(pending);
    }
    this.pending = futureTriggers;

    const dueActions: TimedAction[] = [];
    const futureActions: TimedAction[] = [];
    for (const action of this.timedActions) {
      (action.time <= now ? dueActions : futureActions).push(action);
    }
    this.timedActions = futureActions;

    const due: Array<
      | { time: number; kind: 'action'; action: TimedAction }
      | { time: number; kind: 'trigger'; trigger: ScheduledTrigger }
    > = [
      ...dueActions.map((action) => ({ time: action.time, kind: 'action' as const, action })),
      ...dueTriggers.map(({ trigger }) => ({
        time: trigger.time,
        kind: 'trigger' as const,
        trigger,
      })),
    ];
    due.sort((a, b) => {
      const byTime = a.time - b.time;
      if (byTime !== 0) return byTime;
      if (a.kind !== b.kind) return a.kind === 'action' ? -1 : 1;
      if (a.kind === 'action' && b.kind === 'action') return a.action.seq - b.action.seq;
      return 0;
    });
    for (const item of due) {
      if (item.kind === 'action') item.action.fn();
      else for (const cb of this.listeners) cb(item.trigger);
    }
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
    this.trigger(voice, ev, this.ctx.currentTime, ev.step);
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
      for (const fn of queue) fn(time);
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

    let rate = semitonesToRate((ev.note ?? 0) + voice.tune);
    if (!voice.kit.pitched) {
      rate *= semitonesToRate(((Math.random() * 2 - 1) * HUMANIZE_CENTS) / 100);
    }

    // One event bus owns the velocity envelope and choke state for the main
    // buffer plus every evolved layer. Routing it through voice.gain preserves
    // per-voice volume, master mute, transport pause, reward ducking, and the
    // kick→bass duck for every layer without a parallel FX bus.
    const g = this.ctx.createGain();
    const humanized = ev.velocity * (1 + (Math.random() * 2 - 1) * HUMANIZE_GAIN);
    g.gain.value = Math.max(0.01, humanized);
    g.connect(voice.gain);

    const treatment: EvolvedAudioTreatment = voice.evolved
      ? evolvedAudioTreatment(voice.role, phraseStep, ev.variant ?? voice.kit.defaultVariant)
      : { mainGain: 1, mainRateMul: 1, layers: [] };
    const sources: AudioBufferSourceNode[] = [];

    const startSource = (
      plan: AudioLayerPlan,
      rateFromMul = plan.rateMul,
      slideS = 0,
    ): AudioBufferSourceNode => {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const at = time + plan.delayS;
      source.playbackRate.setValueAtTime(rate * rateFromMul, at);
      if (slideS > 0 && rateFromMul !== plan.rateMul) {
        source.playbackRate.exponentialRampToValueAtTime(rate * plan.rateMul, at + slideS);
      }

      const sourceGain = this.ctx.createGain();
      sourceGain.gain.setValueAtTime(Math.max(0.0001, plan.gain), at);
      let tail: AudioNode = sourceGain;
      source.connect(sourceGain);
      if (plan.highpassHz !== undefined) {
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = plan.highpassHz;
        tail.connect(hp);
        tail = hp;
      }
      if (plan.lowpassHz !== undefined) {
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = plan.lowpassHz;
        tail.connect(lp);
        tail = lp;
      }
      if (plan.pan !== undefined) {
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = Math.max(-1, Math.min(1, plan.pan));
        tail.connect(pan);
        tail = pan;
      }
      tail.connect(g);

      this.activeSources.add(source);
      source.addEventListener('ended', () => this.activeSources.delete(source), { once: true });
      source.start(at);
      if (plan.stopAfterS !== undefined) {
        const stopAt = at + plan.stopAfterS;
        const fadeAt = Math.max(at, stopAt - 0.02);
        sourceGain.gain.setValueAtTime(Math.max(0.0001, plan.gain), fadeAt);
        sourceGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
        source.stop(stopAt);
      }
      sources.push(source);
      return source;
    };

    const src = startSource(
      {
        delayS: 0,
        gain: treatment.mainGain,
        rateMul: treatment.mainRateMul,
        highpassHz: treatment.mainHighpassHz,
        lowpassHz: treatment.mainLowpassHz,
        stopAfterS: treatment.mainStopAfterS,
      },
      treatment.mainRateFromMul ?? treatment.mainRateMul,
      treatment.mainRateSlideS ?? 0,
    );
    for (const layer of treatment.layers) startSource(layer);

    // Kick ducks bass (design rule 1): schedule the dip at the kick's future
    // audio time (the clock runs ~0.12s ahead).
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

    let chokedPrevious: VoiceHit | null = null;
    if (voice.kit.choke) {
      const prev = voice.lastHit;
      if (prev) {
        // Fade the ringing hit out right as the new one lands.
        prev.gain.gain.setValueAtTime(prev.gain.gain.value, time);
        prev.gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        chokedPrevious = prev;
      }
      voice.lastHit = { src, gain: g };
    }

    this.pending.push({
      source: src,
      sources,
      voice,
      chokedPrevious,
      trigger: {
        role: voice.role,
        time,
        velocity: ev.velocity,
        step: phraseStep,
        variant: ev.variant,
        note: ev.note,
        evolved: voice.evolved,
      },
    });
    // If no consumer is draining (hidden tab pauses rAF), drop stale entries
    // so the queue cannot grow unboundedly while audio keeps scheduling.
    if (this.pending.length > 64) {
      const cutoff = this.ctx.currentTime - 1;
      this.pending = this.pending.filter((pending) => pending.trigger.time > cutoff);
    }
  }
}
