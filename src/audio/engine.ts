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
  /** Master-bus low-pass swept during a Hold & Drop build so the surviving
   *  loop muffles then opens up (docs/phases/hold-and-drop-v2.md). Idle at
   *  20 kHz = transparent. */
  private buildFilter: BiquadFilterNode;
  /** Live "charging" tones, one per armed voice: a low filtered hum whose pitch
   *  and brightness climb with that voice's charge, so pulling an instrument
   *  back audibly winds it up (docs/phases/hold-and-drop-v2.md v2.1). Managed by
   *  setChargeHums from the render loop; player-driven, never on the bot path. */
  private chargeHums = new Map<Role, { osc: OscillatorNode; filter: BiquadFilterNode; gain: GainNode }>();
  private pending: ScheduledTrigger[] = [];
  private listeners: TriggerListener[] = [];
  private barQueue: (() => void)[] = [];
  private beatQueue: (() => void)[] = [];
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
    this.buildFilter = ctx.createBiquadFilter();
    this.buildFilter.type = 'lowpass';
    this.buildFilter.frequency.value = 20000; // open = transparent until a drop sweeps it
    this.buildFilter.Q.value = 0.7;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.master.connect(this.buildFilter).connect(limiter).connect(this.analyser).connect(ctx.destination);

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

  /** Run fn at the start of the next beat (a quarter of the bar). Snappier
   *  than atNextBar: used by the Hold & Drop mechanic so a dropped instrument
   *  re-enters on the beat (≤ ~0.5s) rather than waiting for the downbeat. */
  atNextBeat(fn: () => void): void {
    this.beatQueue.push(fn);
  }

  /** Drop queued next-bar / next-beat changes (a run ended before they landed). */
  clearBarQueue(): void {
    this.barQueue = [];
    this.beatQueue = [];
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

  /** Seconds per beat / bar at the current tempo (4 beats = 1 bar). */
  get beatSeconds(): number {
    return 60 / this.clock.bpm;
  }
  get barSeconds(): number {
    return (this.beatSeconds * STEPS_PER_BAR) / this.clock.stepsPerBeat;
  }

  /** Fire a voice at a chosen future audio time, borrowing it even if the
   *  player does not own it (all 24 Voice objects always exist). The Hold &
   *  Drop build uses this for the guaranteed riser/kick/sub and the roll. */
  triggerAt(role: Role, ev: ChartEvent, time: number): void {
    const voice = this.voices.get(role);
    if (voice) this.trigger(voice, ev, time);
  }

  /** Schedule a full Hold & Drop build -> gap -> slam on the audio clock and
   *  return the key times so the render/sim side can lock its juice + slam to
   *  the same downbeat (docs/phases/hold-and-drop-v2.md). The drop is REBUILT
   *  FROM THE PLAYER'S OWN VOICES (v2.1): the roll uses their owned Hats/Backbeat
   *  voices, the gap strips the whole loop, and the one re-fires their owned
   *  Pulse/Bass in key — a generic voice is borrowed ONLY to fill an empty slot,
   *  so nothing foreign clashes with what the player owns. The riser is the one
   *  allowed foreign voice (a whoosh reads as "a hit is coming"). Player-driven. */
  scheduleDrop(
    opts: {
      bars?: number;
      gapBeats?: number;
      /** Owned Hats/Backbeat roles to roll; falls back to a borrowed hat/snare. */
      rollRoles?: readonly Role[];
      /** The whole loop to strip in the gap (all owned/enabled roles). */
      gapRoles?: readonly Role[];
      /** Residual voice level during the gap, 0..1 (1 - gapDuck). 0 = full cut. */
      gapFloor?: number;
      /** Owned Pulse/Bass roles re-fired on the one (in key via their tune). */
      oneRoles?: readonly Role[];
      /** Fill an empty Pulse slot with a borrowed kick on the one. */
      borrowKick?: boolean;
      /** Fill an empty Bass slot with a borrowed sub on the one. */
      borrowSub?: boolean;
      /** How many voices crash back together — the slam grows fuller with more. */
      voiceCount?: number;
    } = {},
  ): {
    buildStart: number;
    gapStart: number;
    slamTime: number;
  } {
    const barS = this.barSeconds;
    const beatS = this.beatSeconds;
    const bars = opts.bars ?? 2;
    const gapBeats = opts.gapBeats ?? 1;
    const slamTime = this.clock.nextBarTime(bars * barS, STEPS_PER_BAR);
    const buildStart = this.ctx.currentTime + 0.02;
    const gapStart = slamTime - gapBeats * beatS;
    const voiceCount = Math.max(1, opts.voiceCount ?? 1);

    const rollRoles = opts.rollRoles && opts.rollRoles.length > 0 ? opts.rollRoles : (['hat', 'snare'] as const);
    const gapRoles = opts.gapRoles && opts.gapRoles.length > 0 ? opts.gapRoles : (['kick', ...SUB_BASS_ROLES] as const);
    const gapFloor = opts.gapFloor ?? 0;

    this.scheduleBuildRiser(buildStart, slamTime, voiceCount);
    this.scheduleBuildFilter(buildStart, slamTime);
    this.scheduleRoll(rollRoles, buildStart, gapStart, beatS);
    this.scheduleGapCut(gapRoles, gapStart, slamTime, gapFloor);

    // The one: re-fire the player's own Pulse/Bass in key (their voice.tune is
    // applied by trigger), scaling up as more voices return together. Borrow a
    // generic kick/sub ONLY for an empty slot, so a 2-voice loadout still lands
    // a minimal riser+low-end drop and an 8-voice one drops in its own timbres.
    const slamVel = Math.min(1, 0.85 + 0.05 * voiceCount);
    for (const role of opts.oneRoles ?? []) {
      this.triggerAt(role, { step: 0, velocity: slamVel }, slamTime);
    }
    if (opts.borrowSub ?? (opts.oneRoles ? false : true)) {
      this.triggerAt('bass', { step: 0, velocity: slamVel, variant: 'sub', note: 0 }, slamTime);
    }
    if (opts.borrowKick ?? (opts.oneRoles ? false : true)) {
      this.triggerAt('kick', { step: 0, velocity: slamVel, variant: 'hard' }, slamTime);
    }
    return { buildStart, gapStart, slamTime };
  }

  /** The build riser: a live noise->bandpass->gain swell that rises across the
   *  whole build and is cut to hard silence exactly on the one (the "silence-
   *  into-slam" trick). Routed through master (so mute silences it) then out
   *  through the build filter; the bandpass keeps it present as the filter
   *  opens. */
  private scheduleBuildRiser(start: number, cut: number, voiceCount = 1): void {
    const dur = Math.max(0.2, cut - start);
    // Keep the peak time strictly after start even for a compressed build
    // (sub-phase C grid-flex), so the gain automation never goes out of order.
    const peak = Math.max(start + 0.01, cut - 0.02);
    // A busier drop rides a louder, brighter riser so it survives a full mix and
    // clearly becomes the last thing standing in the gap.
    const peakGain = Math.min(0.85, 0.5 + 0.05 * (voiceCount - 1));
    const topHz = Math.min(12000, 8000 + 700 * (voiceCount - 1));
    const len = Math.ceil(this.ctx.sampleRate * (dur + 0.1));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(400, start);
    bp.frequency.exponentialRampToValueAtTime(topHz, Math.max(start + 0.01, cut));
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peakGain, peak);
    g.gain.setValueAtTime(peakGain, Math.max(peak, cut));
    g.gain.linearRampToValueAtTime(0.0001, Math.max(peak, cut) + 0.02); // hard cut on the one
    src.connect(bp).connect(g).connect(this.master);
    src.start(start);
    src.stop(cut + 0.06);
  }

  /** Sweep the master build filter from muffled (breakdown) to fully open,
   *  landing open on the one. Left open after the drop. */
  private scheduleBuildFilter(start: number, cut: number): void {
    const f = this.buildFilter.frequency;
    f.cancelScheduledValues(start);
    f.setValueAtTime(500, start);
    f.exponentialRampToValueAtTime(18000, cut);
    f.setValueAtTime(20000, cut + 0.002);
  }

  /** The roll: the player's own primary roll voice (owned Hats, or a borrowed
   *  hat) accelerating from eighths toward sixteenths across the build, plus a
   *  second roll voice (owned Backbeat, or a borrowed snare) doubling just
   *  before the gap — the "here it comes" fill, in the player's own timbres. */
  private scheduleRoll(rollRoles: readonly Role[], start: number, end: number, beatS: number): void {
    const primary = rollRoles[0];
    const accent = rollRoles[1];
    const span = Math.max(0.2, end - start);
    let t = start + 0.05;
    while (t < end - 0.02) {
      const prog = (t - start) / span; // 0..1
      const interval = (beatS / 2) * (1 - 0.5 * prog); // eighth -> sixteenth
      const vel = 0.35 + 0.5 * prog;
      this.triggerAt(primary, { step: 0, velocity: vel }, t);
      if (accent && prog > 0.72) this.triggerAt(accent, { step: 0, velocity: 0.5 + 0.4 * prog }, t);
      t += interval;
    }
  }

  /** The gap: strip the whole loop (every owned/enabled voice) down to `floor`
   *  (0 = full cut; >0 = a duck, e.g. Lo-Fi) for the last beat, leaving only the
   *  riser, then slam it back on the one. The guaranteed one-shots carry the
   *  slam either way. */
  private scheduleGapCut(roles: readonly Role[], gapStart: number, slamTime: number, floor = 0): void {
    const low = Math.max(0.0001, floor);
    for (const role of roles) {
      const v = this.voices.get(role);
      if (!v || !v.enabled) continue;
      const p = v.gain.gain;
      p.cancelScheduledValues(gapStart);
      p.setValueAtTime(1, gapStart);
      p.linearRampToValueAtTime(low, gapStart + 0.02);
      // Reach full gain BY the downbeat so the guaranteed slam one-shots that
      // fire exactly at slamTime hit at full punch (not mid-ramp).
      p.setValueAtTime(low, Math.max(gapStart + 0.02, slamTime - 0.012));
      p.linearRampToValueAtTime(1, slamTime);
    }
  }

  /** Drive the per-armed-voice charge hums from the render loop. `entries` is
   *  the currently-armed voices with their 0..1 charge; a voice not listed fades
   *  out and stops. Each hum is a low sine through a low-pass whose pitch and
   *  cutoff/level climb with charge — you HEAR the bet banking, and multiple
   *  armed voices give converging rising tails into the drop. Routed through
   *  master so mute silences them and the limiter guards the sum. */
  setChargeHums(entries: readonly { role: Role; charge: number }[]): void {
    const now = this.ctx.currentTime;
    const active = new Set(entries.map((e) => e.role));
    for (const [role, h] of this.chargeHums) {
      if (active.has(role)) continue;
      h.gain.gain.cancelScheduledValues(now);
      h.gain.gain.setTargetAtTime(0.0001, now, 0.05);
      h.osc.stop(now + 0.25);
      this.chargeHums.delete(role);
    }
    for (const { role, charge } of entries) {
      let h = this.chargeHums.get(role);
      if (!h) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 4;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(filter).connect(gain).connect(this.master);
        osc.start(now);
        h = { osc, filter, gain };
        this.chargeHums.set(role, h);
      }
      const c = Math.max(0, Math.min(1, charge));
      // Pitch and brightness rise with charge; level stays modest so a stack of
      // hums layers under the loop rather than dominating it.
      h.osc.frequency.setTargetAtTime(55 + 165 * c, now, 0.08);
      h.filter.frequency.setTargetAtTime(280 + 2600 * c, now, 0.08);
      h.gain.gain.setTargetAtTime(0.015 + 0.05 * c, now, 0.08);
    }
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
    // Beat boundary (every stepsPerBeat steps): flush next-beat callbacks.
    if (step % this.clock.stepsPerBeat === 0 && this.beatQueue.length > 0) {
      const queue = this.beatQueue;
      this.beatQueue = [];
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
