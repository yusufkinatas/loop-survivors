// The music engine: fire control and arranger at once (docs/plan.md,
// Coupling Model A). In M1 sub-phase A it only makes sound; sub-phase B
// attaches damage to the same triggers. It is a pure function of build
// (which voices are on) and grid (the clock's steps): no stage input exists.

import { Clock } from './clock';
import { chartEventsAtStep, stripEventsAtStep, bassThinAtStep } from './arranger';
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

/** How the live performance section rewrites one voice's chart this step
 *  (Perform the Track v2). Player-only; the bot's plan is always empty
 *  (every voice 'identity'), so its firing is unchanged.
 *   - identity : play the tier chart as written (GROOVE, and the drop slam).
 *   - mute     : silent this section (BREAK drops this slot; the drop gap).
 *   - strip    : BREAK's thinned survivor (strong beats / held root).
 *   - build    : CLIMB densifies — reads one tier up once the climb is a bar in.
 *   - buildbass: CLIMB thins the sub to one hit a bar, digging the drop's hole. */
export type ArrangeMode = 'identity' | 'mute' | 'strip' | 'build' | 'buildbass';

// The drop's musical staging (docs/phases/perform-the-track-v2.md, round-3 fix):
// the slam lands on the NEXT BEAT (<=~0.5s), not the phrase — CLIMB already was
// the build-up, so the drop is a snappy release, not a second wait. During the
// sub-beat gap only the low/harmony/melody voices cut (the hole the sub slams
// into); the beat keeps rolling, so weapons/damage never stop and it never
// reads as dead air.
const FILTER_OPEN_HZ = 20000;
const FILTER_CLIMB_START_HZ = 2200;

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
  /** Master bus, post-mix, pre-limiter (Perform the Track v2): a drop pump
   *  gain then a low-pass the sections sweep. master -> pump -> lp -> limiter. */
  private masterPump: GainNode;
  private masterLP: BiquadFilterNode;
  private pending: ScheduledTrigger[] = [];
  private listeners: TriggerListener[] = [];
  private barQueue: ((time: number) => void)[] = [];
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;
  /** Guards the async genre-kit swap: a newer setGenre invalidates an in-flight
   *  kit load so a slow older one can't clobber the current voicing. */
  private genreKitToken = 0;

  // ---- Perform the track v2 (player-only; empty/none for the bot) ----------
  /** Per-voice arrange mode for the live section; empty = GROOVE (all identity). */
  private plan: Map<Role, ArrangeMode> = new Map();
  /** Grid step the current section entered on, for CLIMB's per-bar ramp. */
  private sectionStartStep = 0;
  /** CLIMB opens the low-pass a little more each bar; off in other sections. */
  private climbRamp = false;
  /** The most recent grid step scheduled by the clock (for drop quantization). */
  private lastScheduledStep = 0;
  /** Drop staging: 'gap' digs the sub/harmony/melody hole and swells a riser
   *  until the slam on the next beat (the beat keeps rolling underneath). */
  private dropState: 'none' | 'gap' = 'none';
  private dropSlamStep = -1;
  private dropResolve: ((time: number) => void) | null = null;
  /** Voices that cut during the pre-drop gap (the low/harmony/melody hole). The
   *  rest keep firing, so damage never stops. */
  private gapMuteRoles: Set<Role> = new Set();
  /** The post-slam hype window: the band plays ELEVATED above GROOVE — densified
   *  where possible, brighter, and pumping on every beat — so when it ends and
   *  settles to plain GROOVE the ear hears a real comedown (not "the drop just
   *  keeps going"). Cleared by endDropWindow when the window expires. */
  private dropPeak = false;
  /** One reusable white-noise buffer for the transition synths. */
  private noiseBuf: AudioBuffer | null = null;

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
    // Master-bus performance nodes (v2): a pump gain (drop "breath") then a
    // low-pass the sections sweep (BREAK muffles, CLIMB opens, the drop snaps
    // it wide). Both sit before the limiter so the whole mix is shaped as one.
    // Unity / fully-open by default, so GROOVE is bit-identical to no section.
    this.masterPump = ctx.createGain();
    this.masterPump.gain.value = 1;
    this.masterLP = ctx.createBiquadFilter();
    this.masterLP.type = 'lowpass';
    this.masterLP.frequency.value = FILTER_OPEN_HZ;
    this.masterLP.Q.value = 0.9;
    this.master
      .connect(this.masterPump)
      .connect(this.masterLP)
      .connect(limiter)
      .connect(this.analyser)
      .connect(ctx.destination);

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

  // ---- Perform the track v2: sections, the master sweep, the drop -----------

  /** Install the live section's arrange plan and sweep the master low-pass to
   *  match. The shell builds `plan` from the owned band + section (which slots
   *  strip / mute / build); the engine just applies it per step. GROOVE is an
   *  empty plan (all identity) with the filter fully open — bit-identical to no
   *  section. Called at a bar boundary so patterns swap on the "1". */
  setSection(plan: Map<Role, ArrangeMode>, filterHz: number, climbRamp: boolean): void {
    this.plan = plan;
    this.climbRamp = climbRamp;
    this.sectionStartStep = this.lastScheduledStep;
    this.sweepFilter(filterHz, this.ctx.currentTime, 0.18);
  }

  /** Arm the drop: dig the hole (only `gapMuteRoles` cut — the beat keeps
   *  rolling) and swell a short riser, then fire `onResolve` and the audio slam
   *  on the next PHRASE downbeat (step 0 of the 4-bar phrase — the weight of a
   *  drop comes from landing on the "one"). Returns the gap length in seconds so
   *  the shell can cover it with i-frames. The bot never calls this. */
  armDrop(gapMuteRoles: Set<Role>, onResolve: (time: number) => void): { gapSeconds: number } {
    this.gapMuteRoles = gapMuteRoles;
    const per = STEPS_PER_PHRASE; // 64 steps = one 4-bar phrase
    const from = this.lastScheduledStep + 1;
    const slam = from + ((per - (from % per)) % per);
    this.dropSlamStep = slam;
    this.dropState = 'gap';
    this.dropResolve = onResolve;
    const gapSteps = slam - this.lastScheduledStep;
    const gapSeconds = gapSteps * this.clock.stepDuration;
    // A quick riser whoosh up into the slam (floored so a 1-step gap still reads).
    this.scheduleRiser(this.ctx.currentTime + 0.02, Math.max(gapSeconds, 0.35));
    return { gapSeconds };
  }

  /** End the post-slam hype window: the band settles from its elevated drop
   *  arrangement back to plain GROOVE (density drops, the pump stops, a soft
   *  filter "exhale") — the comedown that makes the drop feel like it landed and
   *  resolved rather than droning on. Called by the shell when dropWindowT ends. */
  endDropWindow(): void {
    if (!this.dropPeak) return;
    this.dropPeak = false;
    const now = this.ctx.currentTime;
    const p = this.masterPump.gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(1, now + 0.3);
    // A quick breath down and back open on the filter reads as the settle.
    const f = this.masterLP.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.linearRampToValueAtTime(6000, now + 0.18);
    f.linearRampToValueAtTime(FILTER_OPEN_HZ, now + 0.6);
  }

  /** The brownout: a held CLIMB overstayed its ceiling, so the build deflates
   *  back to GROOVE — a deliberate anticlimax, NOT dead air. Cancel any climb
   *  ramp and sweep the master low-pass DOWN (the air going out of the room) then
   *  settle back open. The shell also commits the GROOVE plan on the bar; this is
   *  the audible "fizzle". Player-only (the bot never climbs). */
  brownout(): void {
    this.plan = new Map();
    this.climbRamp = false;
    const now = this.ctx.currentTime;
    const f = this.masterLP.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.linearRampToValueAtTime(1500, now + 0.25);
    f.linearRampToValueAtTime(FILTER_OPEN_HZ, now + 0.95);
  }

  /** Run reset / exit: back to GROOVE, filter open, drop disarmed. */
  resetPerformance(): void {
    this.plan = new Map();
    this.climbRamp = false;
    this.dropState = 'none';
    this.dropSlamStep = -1;
    this.dropResolve = null;
    this.gapMuteRoles = new Set();
    this.dropPeak = false;
    this.masterPump.gain.cancelScheduledValues(this.ctx.currentTime);
    this.masterPump.gain.setValueAtTime(1, this.ctx.currentTime);
    this.sweepFilter(FILTER_OPEN_HZ, this.ctx.currentTime, 0.05);
  }

  private sweepFilter(hz: number, time: number, ramp: number): void {
    const f = this.masterLP.frequency;
    f.cancelScheduledValues(time);
    f.setValueAtTime(f.value, time);
    f.linearRampToValueAtTime(hz, time + ramp);
  }

  /** The band re-enters on the slam: full band, filter wide open, a pump breath
   *  and a generic impact. Gameplay (shockwave, window) rides the callback. */
  private resolveDrop(time: number): void {
    this.plan = new Map(); // full band; dropPeak elevates it above GROOVE
    this.climbRamp = false;
    this.dropPeak = true; // the hype window plays densified + pumping (see onStep)
    this.sectionStartStep = this.lastScheduledStep;
    this.sweepFilter(FILTER_OPEN_HZ, time, 0.03);
    // The slam breath, then hold slightly hot for the window so it reads as
    // "we're in the drop" until endDropWindow settles it back to unity.
    const p = this.masterPump.gain;
    p.cancelScheduledValues(time);
    p.setValueAtTime(0.55, time);
    p.linearRampToValueAtTime(1.12, time + 0.35);
    this.scheduleImpact(time);
    this.dropState = 'none';
    this.dropSlamStep = -1;
    this.gapMuteRoles = new Set();
    const cb = this.dropResolve;
    this.dropResolve = null;
    cb?.(time);
  }

  private noise(): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  /** Engine-owned white-noise riser (not a Voice/weapon, deals no damage): a
   *  rising bandpass swell so CLIMB/the drop gap read even with a sparse band. */
  private scheduleRiser(time: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, time);
    bp.frequency.exponentialRampToValueAtTime(6000, time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.26, time + dur);
    g.gain.linearRampToValueAtTime(0.0001, time + dur + 0.05);
    src.connect(bp).connect(g).connect(this.masterPump);
    src.start(time);
    src.stop(time + dur + 0.1);
  }

  /** Engine-owned impact (no damage): a filtered noise crack + a low sine thud
   *  under the slam, so the drop lands even before the band re-enters. */
  private scheduleImpact(time: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    src.connect(hp).connect(g).connect(this.masterPump);
    src.start(time);
    src.stop(time + 0.45);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.25);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.6, time);
    og.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.connect(og).connect(this.masterPump);
    osc.start(time);
    osc.stop(time + 0.55);
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
    this.lastScheduledStep = step;
    // The phrase clock: bars 1-4, then roll over. Charts loop inside the
    // phrase, so a 4-bar chart's bar 4 is always the phrase's bar 4 and
    // once-per-phrase material lands where it was written.
    const phraseStep = step % STEPS_PER_PHRASE;
    // The drop slam is quantized to the next phrase downbeat (v2): resolve it
    // the moment the clock reaches its step, so the band re-enters on the "1".
    if (this.dropState === 'gap' && step >= this.dropSlamStep) {
      this.resolveDrop(time);
    }
    if (phraseStep % STEPS_PER_BAR === 0) {
      if (this.barQueue.length > 0) {
        const queue = this.barQueue;
        this.barQueue = [];
        for (const fn of queue) fn(time);
      }
      // CLIMB opens the low-pass a little more each bar it's held — the build
      // "coming into focus" — until it's wide open ready for the drop.
      if (this.climbRamp && this.dropState === 'none') {
        const barsIn = Math.max(0, Math.floor((step - this.sectionStartStep) / STEPS_PER_BAR));
        const hz = Math.min(15000, FILTER_CLIMB_START_HZ * Math.pow(2, barsIn));
        this.sweepFilter(hz, time, this.clock.stepDuration * STEPS_PER_BAR);
      }
    }
    // Hype-window pump: a sidechain-style breath on every beat — the classic
    // "drop is playing" texture GROOVE never has, so its absence after the
    // window is felt as the settle.
    if (this.dropPeak && step % this.clock.stepsPerBeat === 0) {
      const beat = this.clock.stepDuration * this.clock.stepsPerBeat;
      const p = this.masterPump.gain;
      p.cancelScheduledValues(time);
      p.setValueAtTime(0.8, time);
      p.linearRampToValueAtTime(1.12, time + beat * 0.85);
    }
    // The pre-drop gap digs a hole: only the low/harmony/melody voices cut, so
    // the sub slams back into silence on the one — but the beat keeps rolling
    // (Pulse/Backbeat/Hats fire), so damage never stops and it's never dead air.
    const inGap = this.dropState === 'gap';
    const barInSection = Math.max(0, Math.floor((step - this.sectionStartStep) / STEPS_PER_BAR));
    for (const voice of this.voices.values()) {
      if (!voice.enabled) continue;
      if (inGap && this.gapMuteRoles.has(voice.role)) continue;
      for (const ev of this.sectionEvents(voice, phraseStep, barInSection)) {
        this.trigger(voice, ev, time, phraseStep);
      }
    }
  }

  /** The read-time section transform (v2): given a voice's arrange mode, return
   *  the events it actually fires this step. GROOVE / an empty plan is the plain
   *  identity read, so the bot and every replay are unchanged. Pure w.r.t. the
   *  chart — never mutates the shared working copy. */
  private sectionEvents(voice: Voice, phraseStep: number, barInSection: number): ChartEvent[] {
    // The hype window plays the whole band one tier hotter than GROOVE, so it's
    // audibly bigger — and dropping back to GROOVE at the end is a real comedown.
    if (this.dropPeak) {
      const src = getChart(voice.role, Math.min(TIER_COUNT, voice.tier + 1));
      return chartEventsAtStep(src, phraseStep);
    }
    const mode = this.plan.get(voice.role) ?? 'identity';
    switch (mode) {
      case 'mute':
        return [];
      case 'strip':
        return stripEventsAtStep(voice.chart, phraseStep, voice.kit.pitched);
      case 'buildbass':
        return bassThinAtStep(voice.chart, phraseStep);
      case 'build': {
        // Densify by reading one tier up, but only once the climb is a bar in,
        // so the ramp builds rather than jumping on entry.
        const src =
          barInSection >= 1 ? getChart(voice.role, Math.min(TIER_COUNT, voice.tier + 1)) : voice.chart;
        return chartEventsAtStep(src, phraseStep);
      }
      default:
        return chartEventsAtStep(voice.chart, phraseStep);
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
