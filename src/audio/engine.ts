// The music engine: fire control and arranger at once (docs/plan.md,
// Coupling Model A). In M1 sub-phase A it only makes sound; sub-phase B
// attaches damage to the same triggers. It is a pure function of build
// (which voices are on) and grid (the clock's steps): no stage input exists.

import { Clock } from './clock';
import { chartEventsAtStep } from './arranger';
import { programEvents, type ArrangeCtx } from './program';
import { TIER_COUNT, type Chart, type ChartEvent } from './charts';
import { getChart, setActiveGenre } from './chartstore';
import type { Genre } from './genres';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE, semitonesToRate } from './scale';
import type { Kit, Role } from './kits';
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
  /** Per-voice lowpass (the Conducted Grid, src/game/hype.ts): the auto-arranger
   *  rides this to filter a voice down to a distant whisper when the current
   *  intensity tier doesn't include it, and open it wide when it does. The
   *  trigger still fires either way, so damage is unchanged (Model A holds and a
   *  breakdown costs no firepower) — only the timbre breathes. Open (20 kHz) is
   *  inert. Chain: gain -> duck -> filter -> [fx] -> master. */
  filter: BiquadFilterNode;
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
  /** Hype gate (the live-arrangement layer, see src/game/hype.ts): while true
   *  this voice is silenced at the source — no trigger fires, so it makes no
   *  sound and (Model A) deals no damage. The band's top layers gate in and out
   *  as the player rides the crowd's energy, so the mix breathes instead of only
   *  ever thickening. Owned-but-gated is a live mute, not un-owning the voice. */
  gated: boolean;
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
  private barListeners: ((bar: number) => void)[] = [];
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;
  /** Master tone filter (the hype layer's "filter opens as energy builds").
   *  A lowpass on the summed mix: closed it muffles the whole track into a
   *  breakdown, open it lets the full spectrum through. */
  private toneFilter: BiquadFilterNode;
  /** Beat grid tracking for rhythm-timed input (src/game/hype.ts): the audio
   *  time of the most recent quarter-note and the seconds between beats. */
  private lastBeatTime = 0;
  private beatInterval = 0.5;
  /** The Tension Cycle arrangement context (v3, src/game/hype.ts). When set, the
   *  live engine transforms each voice's events through programEvents (half-time
   *  drops, builds, breakdowns) instead of playing the flat chart. Null = the
   *  plain chart (menus, the headless bot, any run not driving the cycle). */
  private arrangement: ArrangeCtx | null = null;

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
    // master -> tone -> limiter -> analyser -> out. The tone filter starts wide
    // open (inert) so nothing changes until the hype layer drives it.
    this.toneFilter = ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = 20000;
    this.toneFilter.Q.value = 0.7;
    this.master.connect(this.toneFilter).connect(limiter).connect(this.analyser).connect(ctx.destination);

    for (const [role, kit] of kits) {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      // gain -> duck -> master: the persistent duck node is unity except when
      // the kick sidechains the bass (design rule 1). buildVoiceChain rewires
      // duck's downstream when an effect is inserted; gain -> duck stays fixed.
      const duck = ctx.createGain();
      duck.gain.value = 1;
      // Per-voice lowpass, starts wide open (inert). buildVoiceChain rewires
      // filter's downstream when an effect is inserted; gain -> duck -> filter
      // stays fixed so both the sidechain and the arranger's filtering survive.
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      filter.Q.value = 0.7;
      gain.connect(duck);
      duck.connect(filter);
      filter.connect(this.master);
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
        gated: false,
        filter,
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

  /** Switch the run's genre (its playable character): tempo, swing, and the
   *  whole soundset's patterns change at once. Every voice re-points to the new
   *  genre's chart at its current tier — same tools, a different track. */
  setGenre(genre: Genre): void {
    setActiveGenre(genre.id);
    this.clock.bpm = genre.bpm;
    this.clock.swing = genre.swing;
    for (const voice of this.voices.values()) {
      voice.chart = getChart(voice.role, voice.tier);
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
    // The chain source is the filter node (gain -> duck -> filter is fixed);
    // only the filter's downstream is rewired here so the sidechain and the
    // arranger's per-voice filtering both survive an effect swap.
    voice.filter.disconnect();
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
      voice.filter.connect(this.master);
      return;
    }
    const fx = makeEffectNodes(this.ctx, voice.effect);
    voice.filter.connect(fx.input);
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

  /** Silence/unsilence a voice at the source without un-owning it (the hype
   *  layer's live mute). A gated voice fires no trigger, so it makes no sound
   *  and deals no damage. Sustained notes already ringing are left to decay. */
  setVoiceGated(role: Role, gated: boolean): void {
    const voice = this.voices.get(role);
    if (voice) voice.gated = gated;
  }

  /** Ride the master tone filter's cutoff (Hz). Low = the whole mix muffles
   *  into a breakdown; 20 kHz = fully open. Glides so a sweep is smooth. */
  setToneCutoff(hz: number): void {
    this.toneFilter.frequency.setTargetAtTime(
      Math.max(200, Math.min(20000, hz)),
      this.ctx.currentTime,
      0.05,
    );
  }

  /** Ride one voice's own lowpass cutoff (Hz), the Conducted Grid's per-voice
   *  breathing tool. Low = a distant, filtered whisper (still firing, still
   *  dealing damage — Model A); 20 kHz = fully present. Glides smoothly.
   *  `timeConstant` lets a drop's riser open faster than the auto-arranger's
   *  gentle tier moves. */
  setVoiceCutoff(role: Role, hz: number, timeConstant = 0.12): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.filter.frequency.setTargetAtTime(
      Math.max(200, Math.min(20000, hz)),
      this.ctx.currentTime,
      timeConstant,
    );
  }

  /** Register for bar-boundary callbacks: fired at the top of every bar with
   *  the absolute bar index (a monotonic count from run start). The Conducted
   *  Grid rides this as its phrase clock — arrangement changes only ever land on
   *  a bar, so they always sound timed. Live-audio only; headless never runs. */
  addBarListener(cb: (bar: number) => void): void {
    this.barListeners.push(cb);
  }

  /** Drop every bar listener (a run ended). */
  clearBarListeners(): void {
    this.barListeners = [];
  }

  /** Seconds from now to the nearest quarter-note beat (0 = dead on). Feeds
   *  the rhythm-timed hype pump so a tap can be scored against the groove. */
  beatError(): number {
    if (this.beatInterval <= 0) return 0;
    const now = this.ctx.currentTime;
    let phase = (now - this.lastBeatTime) % this.beatInterval;
    if (phase < 0) phase += this.beatInterval;
    return Math.min(phase, this.beatInterval - phase);
  }

  /** Phase through the current beat, 0..1 (0 = on the beat). Drives the HUD
   *  beat blip so the player can time taps by eye as well as by ear. */
  beatPhase(): number {
    if (this.beatInterval <= 0) return 0;
    const now = this.ctx.currentTime;
    let phase = (now - this.lastBeatTime) % this.beatInterval;
    if (phase < 0) phase += this.beatInterval;
    return phase / this.beatInterval;
  }

  private onStep(step: number, time: number): void {
    if (step === 0) this.lastDueStep = 0;
    // Record the audio time of each quarter-note beat (every stepsPerBeat
    // steps) so key presses can be scored against the live grid.
    if (step % this.clock.stepsPerBeat === 0) {
      this.lastBeatTime = time;
      this.beatInterval = this.clock.stepDuration * this.clock.stepsPerBeat;
    }
    this.stepMarkers.push({ step, time });
    // Bar-boundary clock for the Conducted Grid: fire at the top of each bar
    // with the absolute bar index. Its arrangement moves and the Drop's
    // strip/build/slam all quantize to this so they land on the grid.
    if (step % STEPS_PER_BAR === 0 && this.barListeners.length > 0) {
      const bar = Math.floor(step / STEPS_PER_BAR);
      for (const cb of this.barListeners) cb(bar);
    }
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
      if (!voice.enabled || voice.gated) continue;
      const events = this.arrangement
        ? programEvents(voice.role, voice.chart, phraseStep, this.arrangement)
        : chartEventsAtStep(voice.chart, phraseStep);
      for (const ev of events) this.trigger(voice, ev, time, phraseStep);
    }
  }

  /** Set (or clear, with null) the live arrangement context the Tension Cycle
   *  drives each frame. Live audio only; the headless bot never sets it, so its
   *  trigger stream (and damage) is untouched. */
  setArrangement(ctx: ArrangeCtx | null): void {
    this.arrangement = ctx;
  }

  /** A rising noise sweep over `bars` bars — the build's riser. Bandpass climbs
   *  and the gain swells, then cuts, so the drop's downbeat lands into the gap. */
  playRiser(bars: number): void {
    const now = this.ctx.currentTime;
    const dur = Math.max(0.2, bars * this.clock.stepDuration * STEPS_PER_BAR);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(dur + 0.1);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.exponentialRampToValueAtTime(7000, now + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.45, now + dur * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.1);
  }

  /** The drop's impact: a low sine boom + a bright noise crash on the downbeat. */
  playSlam(): void {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.5);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.9, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(og).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.65);
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise(0.4);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.4, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    n.connect(hp).connect(ng).connect(this.master);
    n.start(now);
    n.stop(now + 0.45);
  }

  /** A white-noise buffer (riser/slam excitation). */
  private noise(seconds: number): AudioBuffer {
    const buf = this.ctx.createBuffer(1, Math.ceil(seconds * this.ctx.sampleRate), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
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
