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
import type { GameTrackProfile } from './gameTracks';

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
  /** Development monitor mute. This silences a track without stopping its
   *  scheduled gameplay triggers, so mix auditions do not alter a run. */
  monitor: GainNode;
  monitorMuted: boolean;
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
const SUB_BASS_ROLES: readonly Role[] = ['bass', 'acid'];

export class MusicEngine {
  readonly ctx: AudioContext;
  readonly clock: Clock;
  /** Resolves only after every active House voice has its final explicit kit. */
  readonly ready: Promise<void>;
  /** Post-limiter tap: output metering for debug tools and, later, visuals. */
  readonly analyser: AnalyserNode;
  readonly voices = new Map<Role, Voice>();
  private master: GainNode;
  private pending: ScheduledTrigger[] = [];
  private listeners: TriggerListener[] = [];
  private barQueue: (() => void)[] = [];
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;
  /** Sources scheduled inside the lookahead window. Keeping the small live set
   *  lets a run/profile reset stop old audio before the new world is installed. */
  private scheduledSources = new Set<AudioBufferSourceNode>();
  /** The immutable startup voicing, kept so the rehearsal room can restore the
   *  legacy soundset after a game-profile audition without rebuilding audio. */
  private readonly baseKits: Map<Role, Kit>;
  private gameTrack: GameTrackProfile | null = null;
  /** A slow profile render must never overwrite a newer sandbox selection. */
  private gameTrackToken = 0;

  constructor(ctx: AudioContext, kits: Map<Role, Kit>) {
    this.ctx = ctx;
    this.baseKits = new Map(kits);
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
      // gain -> duck -> monitor -> master. Duck protects the low end; monitor
      // is a dev-only audio mute that never suppresses gameplay triggers.
      const duck = ctx.createGain();
      duck.gain.value = 1;
      const monitor = ctx.createGain();
      monitor.gain.value = 1;
      gain.connect(duck);
      duck.connect(monitor).connect(this.master);
      // Voices start disabled at tier 1; the run enables and tiers them as the
      // player picks. The soundset decides what they play.
      this.voices.set(role, {
        role,
        kit,
        chart: getChart(role, 1),
        tier: 1,
        enabled: false,
        gain,
        duck,
        monitor,
        monitorMuted: false,
        activeSamples: kit.samples,
        tune: 0,
        override: null,
        lastHit: null,
      });
    }

    this.clock = new Clock(ctx, SOUNDSET.bpm, SKELETON.stepsPerBeat, (step, time) =>
      this.onStep(step, time),
    );
    // The soundset sets the tempo and swing, and its own voicing (real drum /
    // bass samples over the synth kit) is swapped in asynchronously — click-free
    // because nothing is playing yet.
    this.clock.bpm = SOUNDSET.bpm;
    this.clock.swing = SOUNDSET.swing;
    this.ready = this.applySoundsetKit();
  }

  /** The profile currently supplying tempo, kits, and tier charts. `null`
   *  means the legacy fixed soundset used by the rehearsal room. */
  get activeGameTrack(): GameTrackProfile | null {
    return this.gameTrack;
  }

  /**
   * Apply one playable track profile. Rendering/fetching its one-shots is lazy
   * and cached by the profile. The token makes rapid sandbox switching safe:
   * if a later selection wins while this one is loading, this resolves `null`
   * and changes no engine state.
   *
   * The returned map is the exact active kit map and is suitable for updating
   * HUD names/colors. Existing enabled flags are preserved for roles supported
   * by both profiles; unsupported roles are always disabled. The game shell
   * remains responsible for clearing its matching RunWorld loadout.
   */
  async setGameTrack(profile: GameTrackProfile): Promise<Map<Role, Kit> | null> {
    const token = ++this.gameTrackToken;
    this.cancelScheduled();
    const [, kits] = await Promise.all([this.ready, profile.buildKits(this.ctx)]);
    if (token !== this.gameTrackToken) return null;

    for (const weapon of profile.weapons) {
      if (!this.voices.has(weapon.role)) {
        throw new Error(
          `[engine] ${profile.id} maps ${weapon.voiceId} to unavailable role ${weapon.role}`,
        );
      }
      if (!kits.has(weapon.role)) {
        throw new Error(`[engine] ${profile.id} did not build a kit for ${weapon.role}`);
      }
    }

    this.gameTrack = profile;
    this.clock.bpm = profile.bpm;
    // Track Lab's authored feel delays odd 16ths itself. Keep Clock straight
    // and reproduce that exact rule in onStep; legacy House still uses the
    // Clock's offbeat-8th shuffle.
    this.clock.swing = 0;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      const weapon = profile.weapons.find((candidate) => candidate.role === voice.role);
      const kit = kits.get(voice.role);
      voice.duck.gain.cancelScheduledValues(now);
      voice.duck.gain.setValueAtTime(1, now);
      if (!weapon || !kit) {
        voice.enabled = false;
        continue;
      }
      voice.kit = kit;
      voice.activeSamples = kit.samples;
      voice.tune = kit.tune ?? 0;
      voice.override = null;
      voice.chart = weapon.ladder[voice.tier - 1];
      voice.gain.gain.setTargetAtTime(weapon.gain, now, 0.012);
    }
    return kits;
  }

  /** Restore the fixed House development soundset. Route changes normally
   *  reload the page, but this explicit inverse keeps the engine seam total and
   *  makes profile switching straightforward to test in isolation. */
  clearGameTrack(): void {
    this.gameTrackToken++;
    this.cancelScheduled();
    this.gameTrack = null;
    this.clock.bpm = SOUNDSET.bpm;
    this.clock.swing = SOUNDSET.swing;
    const now = this.ctx.currentTime;
    for (const voice of this.voices.values()) {
      const kit = this.baseKits.get(voice.role);
      if (!kit) continue;
      voice.enabled = false;
      voice.kit = kit;
      voice.activeSamples = kit.samples;
      voice.tune = kit.tune ?? 0;
      voice.override = null;
      voice.chart = getChart(voice.role, voice.tier);
      voice.gain.gain.setTargetAtTime(1, now, 0.012);
      voice.duck.gain.cancelScheduledValues(now);
      voice.duck.gain.setValueAtTime(1, now);
    }
  }

  /** Confirm every runtime voice against the exact active soundset kit. The
   *  builder is cached, so main's startup render and this defensive check share
   *  one promise and one set of buffers. */
  private async applySoundsetKit(): Promise<void> {
    const kit = await buildSoundsetKit(SKELETON.rootHz);
    for (const voice of this.voices.values()) {
      const k = kit.get(voice.role);
      if (!k) throw new Error(`[engine] runtime voice is outside the active catalog: ${voice.role}`);
      voice.activeSamples = k.samples;
      // A sampled pitched voice carries a tune to align its recorded root to
      // the A reference; synth kits and drums are 0.
      voice.tune = k.tune ?? 0;
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
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
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
    const gameLadder = this.gameTrack?.ladders[role];
    voice.chart = gameLadder?.[voice.tier - 1] ?? getChart(role, voice.tier);
  }

  setVoiceGain(role: Role, value: number): void {
    const voice = this.voices.get(role);
    if (voice) voice.gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  /** Dev-only track monitor. Call at a bar boundary for a musical transition. */
  setVoiceMuted(role: Role, muted: boolean): void {
    const voice = this.voices.get(role);
    if (!voice || voice.monitorMuted === muted) return;
    voice.monitorMuted = muted;
    voice.monitor.gain.setTargetAtTime(muted ? 0.0001 : 1, this.ctx.currentTime, 0.012);
  }

  voiceMuted(role: Role): boolean {
    return this.voices.get(role)?.monitorMuted ?? false;
  }

  clearVoiceMutes(): void {
    for (const role of this.voices.keys()) this.setVoiceMuted(role, false);
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

  /** Stop the tiny lookahead tail and discard its not-yet-dispatched gameplay
   *  triggers. Profile/run switches call this before installing a new world so
   *  the previous track cannot produce a stray opening attack. */
  cancelScheduled(): void {
    const now = this.ctx.currentTime;
    for (const source of this.scheduledSources) {
      try {
        source.stop(now);
      } catch {
        // The node may have ended between iteration and stop(); it is harmless.
      }
    }
    this.scheduledSources.clear();
    this.pending = [];
    this.stepMarkers = [];
    this.lastDueStep = 0;
    for (const voice of this.voices.values()) voice.lastHit = null;
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
    // Featured profiles own an explicit (currently eight-bar) phrase length;
    // legacy charts use the shared phrase constant and repeat inside it.
    const phraseSteps = this.gameTrack
      ? this.gameTrack.phraseBars * STEPS_PER_BAR
      : STEPS_PER_PHRASE;
    const phraseStep = step % phraseSteps;
    if (phraseStep % STEPS_PER_BAR === 0 && this.barQueue.length > 0) {
      const queue = this.barQueue;
      this.barQueue = [];
      for (const fn of queue) fn();
    }
    const triggerTime =
      this.gameTrack && step % 2 === 1
        ? time + this.gameTrack.swing * this.clock.stepDuration
        : time;
    for (const voice of this.voices.values()) {
      if (!voice.enabled) continue;
      for (const ev of chartEventsAtStep(voice.chart, phraseStep)) {
        this.trigger(voice, ev, triggerTime, phraseStep);
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
    this.scheduledSources.add(src);
    src.addEventListener('ended', () => this.scheduledSources.delete(src), { once: true });

    let rate = semitonesToRate((ev.note ?? 0) + voice.tune);
    if (!voice.kit.pitched) {
      const cents = this.gameTrack?.humanizeCents ?? HUMANIZE_CENTS;
      rate *= semitonesToRate(((Math.random() * 2 - 1) * cents) / 100);
    }
    src.playbackRate.value = rate;

    const g = this.ctx.createGain();
    const humanizeGain = this.gameTrack?.humanizeGain ?? HUMANIZE_GAIN;
    const humanized = ev.velocity * (1 + (Math.random() * 2 - 1) * humanizeGain);
    g.gain.value = Math.max(0.01, humanized);
    src.connect(g).connect(voice.gain);
    src.start(time);

    // A featured profile carries the same authored pump routing as its Track
    // Lab source. The legacy soundset keeps its narrower kick -> low-end rule.
    const gameTrack = this.gameTrack;
    const gameWeapon = gameTrack?.weapons.find((weapon) => weapon.role === voice.role);
    if (gameTrack?.pump && gameWeapon?.ducker) {
      const depth = Math.max(0.0001, 1 - gameTrack.pump.amount);
      for (const weapon of gameTrack.weapons) {
        if (!weapon.ducked) continue;
        const ducked = this.voices.get(weapon.role);
        if (!ducked || !ducked.enabled) continue;
        const p = ducked.duck.gain;
        p.cancelScheduledValues(time);
        p.setValueAtTime(1, time);
        p.linearRampToValueAtTime(depth, time + DUCK_ATTACK);
        p.linearRampToValueAtTime(1, time + gameTrack.pump.release);
      }
    } else if (!gameTrack && voice.role === 'kick') {
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
