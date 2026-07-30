// The music engine: fire control and arranger at once (docs/plan.md,
// Coupling Model A). It is a pure function of build (which voices are on) and
// grid (the clock's steps): no stage input exists.

import { Clock } from './clock';
import { chartEventsAtStep } from './arranger';
import { TIER_COUNT, type Chart, type ChartEvent } from './charts';
import { getChart } from './chartstore';
import { SOUNDSET } from './soundset';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE, semitonesToRate } from './scale';
import { nearestZone, softClipCurve, type Kit, type Role } from './kits';
import { buildSoundsetKit } from './kits/index';
import {
  DEFAULT_AUDIO_SET_ID,
  type AudioSetId,
} from './audio-sets';
import {
  GemCue,
  NoteCue,
  playChestDropCue,
  playChestLandCue,
  playChestSpinCue,
  playGameOverCue,
  playHealthPickupCue,
  playHitCue,
  playLevelCue,
  playPickupCue,
  playStageMagnetCue,
  playWinCue,
  type GemCueOptions,
  type NoteCueOptions,
} from './cues/index';

export type { GemCueOptions, NoteCueOptions };

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
  evolved: boolean;
  /** A BED's one continuous looping source, and the gain its level rides on.
   *  Null while the bed is off. Only texture voices ever have these; every
   *  other voice makes sound only through `trigger`. */
  bedSource: AudioBufferSourceNode | null;
  bedGain: GainNode | null;
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

/** Told about every grid step as the scheduler prepares it: the step index and
 *  the audio time it is scheduled to sound at. Fires from the lookahead, so it
 *  arrives BEFORE the step is heard — a listener that needs "what is sounding
 *  now" keeps the pairs and reads them against ctx.currentTime.
 *
 *  ROUND-1 SEAM. Nothing in the base uses it; a prototype whose player has a
 *  timing verb (tapping a rhythm, playing along, calling a change on the beat)
 *  needs to be able to place a real-world instant on the musical grid, and
 *  currentStep() only answers to the nearest whole step. */
export type StepListener = (step: number, audioTime: number) => void;

interface TimedAction {
  time: number;
  fn: () => void;
  seq: number;
}

interface PendingTrigger {
  trigger: ScheduledTrigger;
  source: AudioBufferSourceNode;
  voice: Voice;
  chokedPrevious: VoiceHit | null;
}

/** Find a phrase-zero step that the scheduler has prepared but the listener
 * has not heard yet. `afterAudioTime` reserves a strictly later phrase. */
function nextUnheardPhraseTime(
  markers: readonly { step: number; time: number }[],
  currentTime: number,
  afterAudioTime = currentTime,
): number | null {
  const threshold = Math.max(currentTime, afterAudioTime) + 1e-6;
  return markers.find(
    (marker) => marker.time > threshold && marker.step % STEPS_PER_PHRASE === 0,
  )?.time ?? null;
}

/** Decide whether a queued phrase callback owns this boundary. Starts wait
 * through overdue catch-up steps for the next genuinely unheard phrase;
 * phrase-end callbacks may opt into the first elapsed boundary after start. */
function canDispatchPhraseBoundary(
  boundaryTime: number,
  currentTime: number,
  afterAudioTime: number,
  acceptOverdue = false,
): boolean {
  return boundaryTime > afterAudioTime + 1e-6 &&
    (acceptOverdue || boundaryTime > currentTime + 1e-6);
}

// Free per-hit engine nudges: the first of the three variation layers.
const HUMANIZE_GAIN = 0.12; // +/- proportional
const HUMANIZE_CENTS = 8; // +/- pitch, applied only to unpitched kits

/** Seconds a bed takes to fade in or out. Long enough that switching a
 *  background sound on or off is never an event you notice happening. */
const BED_FADE_S = 0.6;

/** How present a bed is at each ladder rung. A bed buys PRESENCE with levels
 *  where every other voice buys notes — see Kit.bed. The top rung is still only
 *  unity on an already very quiet file (the fetch tool seats the beds around
 *  -38 dB), because a background that competes with the band is not one. */
const BED_LEVEL_BY_TIER = [0.45, 0.62, 0.8, 1] as const;

// Kick-ducks-bass sidechain (the band, design rule 1): on each kick the bass
// voice dips to DUCK_DEPTH (~-6 dB) over DUCK_ATTACK and recovers by
// DUCK_RELEASE — a split-second pump so the two low ends never sum into mud.
const DUCK_DEPTH = 0.5;
const DUCK_ATTACK = 0.008;
const DUCK_RELEASE = 0.14;
// The Bass-slot sub-bass instruments the kick ducks. A build owns at most one
// (they share the Bass slot), so this ducks whichever is present.
const SUB_BASS_ROLES: readonly Role[] = ['bass'];
const EVOLUTION_SATURATION = softClipCurve(2.4);

// ---- What an evolution does to a voice (#273) -------------------------------
//
// An evolved weapon keeps its lane and its chart and receives a newly processed
// TIMBRE — see the filter block in playHit. Which processing depends on where the
// voice sits, and with nineteen weapons able to evolve rather than eight, that
// mapping is a table instead of a chain of role comparisons.
//
// THE ORIGINAL EIGHT ARE UNCHANGED, deliberately and checkably: kick and bass
// take the low shelf and the saturation, the hat takes the air band, clap and
// snare take the presence peak plus saturation, and chord, lead and arp take the
// presence peak alone. Nothing about `docs/palette-control/` moves.

/** Voices lifted with a LOW SHELF rather than a presence peak: the ones whose
 *  whole job is weight, where a 2.4 kHz lift would find nothing to brighten. */
const EVOLUTION_LOW_ROLES: ReadonlySet<Role> = new Set<Role>([
  'kick', 'bass', 'sub', 'upright', 'drone',
]);

/** Voices lifted up in the AIR band instead. These live at the top of the
 *  spectrum, and a mid presence peak on a shaker or a noise bed lands under the
 *  part of the sound anyone is actually hearing. */
const EVOLUTION_BRIGHT_ROLES: ReadonlySet<Role> = new Set<Role>([
  'hat', 'shaker', 'air',
]);

/** Voices that also get controlled saturation — grit, which reads as weight on a
 *  low voice and as bite on a transient one. Not applied to sustained harmonic or
 *  bright voices, where it reads as distortion instead. */
const EVOLUTION_SATURATED_ROLES: ReadonlySet<Role> = new Set<Role>([
  'kick', 'bass', 'clap', 'snare', 'sub', 'upright', 'drone',
]);

/** Per-voice mix calibration, applied after both procedural and downloaded
 * palette samples. The hat's dense chart made its bright transients dominate,
 * while the chord and arpeggio (the fast sequence of separate notes) were
 * masked by the drums. Keeping this at the final voice bus makes the drum
 * palette obey the same musical balance. */
/** These are ABSOLUTE voice levels, not offsets from a previous value. Worth
 *  stating because it is easy to misread a raise here as additive and invent a
 *  limiter-headroom problem that is not there.
 *
 *  This table is for musical balance only — a trim of a few dB either way. It
 *  is NOT the place to rescue a quiet voice: arp sat at +5 dB here for exactly
 *  that reason, and it was masking a bandpass in renderArp that discarded the
 *  note's own fundamental, leaving the rendered buffer ~19 dB under the lead.
 *  No mix gain could reach that far. If a voice needs more than a few dB here,
 *  measure the rendered buffer and fix the render (kits/afterhours.ts) instead.
 *  Every number here wants a listening pass; none of them is derivable on paper. */
const VOICE_MIX_GAIN: Readonly<Partial<Record<Role, number>>> = {
  hat: 0.708, // -3 dB
  chord: 3.981, // +12 dB
  arp: 2.818, // +9 dB, chosen by ear once renderArp stopped discarding the note
  lead: 3.162, // +10 dB
};

function voiceMixGain(role: Role): number {
  return VOICE_MIX_GAIN[role] ?? 1;
}

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
  /** The take-damage dip, its own node between weaponsBus and master. Separate
   *  from weaponsBus.gain (which duckWeapons owns) on purpose: the two dips
   *  multiply instead of cancelling, so a hit taken during a level-up moment
   *  neither restores the level-up dip early nor gets swallowed by it. */
  private hitDuck: GainNode;
  private audioSetId: AudioSetId;
  /** Independent transport gate: intentional game pauses mute immediately
   * while AudioContext.suspend() crosses the browser control boundary. */
  private transport: GainNode;
  private transportHeld = false;
  private suspendPromise: Promise<void> | null = null;
  private transportGeneration = 0;
  private pending: PendingTrigger[] = [];
  private activeSources = new Set<AudioBufferSourceNode>();
  private listeners: TriggerListener[] = [];
  private stepListeners: StepListener[] = [];
  private barQueue: ((audioTime: number) => void)[] = [];
  /** Callbacks waiting for the top of a loop of a given length in bars. */
  private loopTopQueue: { bars: number; fn: (audioTime: number) => void }[] = [];
  /** Armed by stopAtBarEnd(): the track stops on the next bar line. */
  private barEndStop: ((audioTime: number) => void) | null = null;
  private phraseQueue: Array<{
    fn: (audioTime: number) => void;
    afterAudioTime: number;
    acceptOverdue: boolean;
  }> = [];
  private timedActions: TimedAction[] = [];
  private nextTimedActionSeq = 0;
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;
  private readonly gemCue = new GemCue();
  private readonly noteCue = new NoteCue();

  constructor(
    ctx: AudioContext,
    kits: Map<Role, Kit>,
    audioSetId: AudioSetId = DEFAULT_AUDIO_SET_ID,
  ) {
    this.ctx = ctx;
    this.audioSetId = audioSetId;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.weaponsBus = ctx.createGain();
    this.weaponsBus.gain.value = 1;
    this.hitDuck = ctx.createGain();
    this.hitDuck.gain.value = 1;
    this.weaponsBus.connect(this.hitDuck);
    this.hitDuck.connect(this.master);
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
      gain.gain.value = voiceMixGain(role);
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
        enabled: false,
        gain,
        duck,
        activeSamples: kit.samples,
        tune: 0,
        override: null,
        lastHit: null,
        evolved: false,
        bedSource: null,
        bedGain: null,
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
  private async applySoundsetKit(setId: AudioSetId = this.audioSetId): Promise<void> {
    const kit = await buildSoundsetKit(SKELETON.rootHz, setId);
    // A newer async selection wins if two palettes were requested quickly.
    if (setId !== this.audioSetId) return;
    for (const voice of this.voices.values()) {
      const k = kit.get(voice.role);
      voice.activeSamples = k?.samples ?? voice.kit.samples;
      // A sampled pitched voice carries a tune to align its recorded root to
      // the A reference; synth kits and drums are 0.
      voice.tune = k?.tune ?? 0;
      // A bed already running on the builtin buffer must be restarted on the
      // real one; the kit loads after the voices are constructed.
      if (voice.kit.bed && voice.bedSource) {
        const running = voice.bedSource;
        voice.bedSource = null;
        voice.bedGain = null;
        running.stop();
        this.syncBed(voice);
      }
    }
  }

  get selectedAudioSet(): AudioSetId {
    return this.audioSetId;
  }

  /** Evolution voices stay in the same musical lane; a few dense weapons are
   * trimmed in decibels so their extra geometry does not become extra loudness. */
  setEvolutionGain(role: Role, gainDb: number): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.evolved = true;
    voice.gain.gain.setTargetAtTime(
      voiceMixGain(role) * Math.pow(10, gainDb / 20),
      this.ctx.currentTime,
      0.025,
    );
  }

  /** Sandbox before/after switch: restore this voice's calibrated base mix. */
  clearEvolutionGain(role: Role): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.evolved = false;
    voice.gain.gain.setTargetAtTime(voiceMixGain(role), this.ctx.currentTime, 0.02);
  }

  resetEvolutionMixes(): void {
    for (const voice of this.voices.values()) {
      voice.evolved = false;
      voice.gain.gain.setTargetAtTime(voiceMixGain(voice.role), this.ctx.currentTime, 0.02);
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

  /** One-shot cues. Each is synthesised in `cues/`; what stays here is the
   *  policy every cue shares — respect mute, and land on master rather than
   *  the weapons bus so no duck can swallow the feedback. Game tuning arrives
   *  as arguments; the engine holds none of its own. */

  playLevelCue(): void {
    if (this.masterTarget <= 0) return; // muted
    playLevelCue(this.ctx, this.master);
  }

  playHitCue(duckDepth: number, duckHoldS: number): void {
    if (this.masterTarget <= 0) return; // muted
    playHitCue(this.ctx, this.master, this.hitDuck.gain, duckDepth, duckHoldS);
  }

  playStageMagnetCue(): void {
    if (this.masterTarget <= 0) return; // muted
    playStageMagnetCue(this.ctx, this.master);
  }

  playGemCue(opts: GemCueOptions): void {
    if (this.masterTarget <= 0) return; // muted
    this.gemCue.play(this.ctx, this.master, opts);
  }

  playNoteCue(opts: NoteCueOptions): void {
    if (this.masterTarget <= 0) return; // muted
    this.noteCue.play(this.ctx, this.master, opts);
  }

  playChestSpinCue(tickTimes: number[]): void {
    if (this.masterTarget <= 0) return; // muted
    playChestSpinCue(this.ctx, this.master, tickTimes);
  }

  playChestLandCue(size: 1 | 2 | 3): void {
    if (this.masterTarget <= 0) return; // muted
    playChestLandCue(this.ctx, this.master, size);
  }

  playChestDropCue(index = 0): void {
    if (this.masterTarget <= 0) return; // muted
    playChestDropCue(this.ctx, this.master, index);
  }

  playPickupCue(step = 0): void {
    if (this.masterTarget <= 0) return; // muted
    playPickupCue(this.ctx, this.master, step);
  }

  playHealthPickupCue(): void {
    if (this.masterTarget <= 0) return; // muted
    playHealthPickupCue(this.ctx, this.master);
  }

  playGameOverCue(): void {
    if (this.masterTarget <= 0) return; // muted
    playGameOverCue(this.ctx, this.master);
  }

  /** The demo-end flourish. `startAt` is the bar line the track stopped on, so
   *  the win lands on the beat the music left off. */
  playWinCue(startAt?: number): void {
    if (this.masterTarget <= 0) return; // muted
    playWinCue(this.ctx, this.master, startAt);
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
      try {
        pending.source.stop(now);
      } catch {
        // A browser may report an already-finished source at the boundary; its
        // gameplay trigger is still removed with the canceled unheard tail.
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
    if (!voice) return;
    voice.enabled = on;
    this.syncBed(voice);
  }

  /** The audio time of the next phrase boundary, or null if the transport has
   *  not scheduled one yet (nothing is playing, or the clock just started). */
  private nextPhraseTime(): number | null {
    const now = this.ctx.currentTime;
    return this.stepMarkers.find(
      (marker) => marker.time > now && marker.step % STEPS_PER_PHRASE === 0,
    )?.time ?? null;
  }

  /** Start, level or stop a bed to match its voice's state.
   *
   *  Idempotent and safe to call from anywhere that changes `enabled`, `tier` or
   *  the active buffers. Switching a bed OFF fades before stopping: a background
   *  sound that vanishes on a frame boundary clicks, and the first pass had
   *  exactly that bug in a worse form — disabling a texture voice left its
   *  chart-started source looping forever, which is why the drone "keeps looping
   *  weirdly" when it was switched off in the Sandbox. */
  private syncBed(voice: Voice): void {
    if (!voice.kit.bed) return;
    const now = this.ctx.currentTime;
    const wantOn = voice.enabled;

    if (!wantOn) {
      const { bedSource, bedGain } = voice;
      voice.bedSource = null;
      voice.bedGain = null;
      if (!bedSource || !bedGain) return;
      bedGain.gain.cancelScheduledValues(now);
      bedGain.gain.setTargetAtTime(0, now, BED_FADE_S / 3);
      bedSource.stop(now + BED_FADE_S);
      return;
    }

    if (!voice.bedSource) {
      const buffer = voice.activeSamples.get(voice.kit.defaultVariant)
        ?? voice.activeSamples.values().next().value;
      if (!buffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(voice.gain);
      // A COMPOSED bed starts on a bar line, from its own beginning. Its file is
      // a whole number of bars of actual music, so phase matters: begun at an
      // arbitrary instant it would keep the tempo and lose the downbeat, and
      // every chord change would land at some fixed offset into the bar.
      //
      // A bed with no musical length (a noise floor) does the opposite and
      // starts at a RANDOM offset, so two runs never open on the same instant of
      // the same recording.
      if (voice.kit.bedBars) {
        src.start(this.nextPhraseTime() ?? now);
      } else {
        src.start(now, Math.random() * buffer.duration);
      }
      voice.bedSource = src;
      voice.bedGain = g;
    }
    // Level rides the ladder: a bed gets MORE PRESENT as the weapon levels
    // rather than busier, which is the texture seat's whole departure from
    // every other voice in the game.
    const level = BED_LEVEL_BY_TIER[Math.max(1, Math.min(TIER_COUNT, voice.tier)) - 1];
    voice.bedGain!.gain.setTargetAtTime(level, now, BED_FADE_S / 3);
  }

  /** Put a voice on a ladder tier: swaps its chart for the tier's working
   *  copy. Takes effect on the next step the new chart fires. */
  setVoiceTier(role: Role, tier: number): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.tier = Math.max(1, Math.min(TIER_COUNT, tier));
    voice.chart = getChart(role, voice.tier);
    this.syncBed(voice);
  }

  /** Put a voice on a chart the caller built, instead of one of the soundset's
   *  four authored rungs. Takes effect on the next step the new chart fires.
   *
   *  ROUND-1 SEAM. The base only ever plays authored ladder rungs, so
   *  setVoiceTier() — pick a rung, read it out of the chart store — was the whole
   *  API. Any stack where a pattern is a thing the player OWNS rather than a rung
   *  they reach (a pattern found as loot, a rhythm the player performed, a
   *  figure assembled on a strip) has a Chart in hand and nowhere to put it. The
   *  chart store is deliberately not that place: its charts are the soundset's,
   *  shared with the rehearsal playground and persisted to localStorage, and a
   *  run's build has no business writing there.
   *
   *  `tier` still moves with it, because a tier is not only a chart — it also
   *  sets a bed's presence (syncBed) and is what the HUD counts pips with. */
  setVoiceChart(role: Role, chart: Chart, tier = 1): void {
    const voice = this.voices.get(role);
    if (!voice) return;
    voice.chart = chart;
    voice.tier = Math.max(1, Math.min(TIER_COUNT, tier));
    this.syncBed(voice);
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

  /** Register for every scheduled grid step. See StepListener: this fires from
   *  the lookahead, ahead of the sound. Same idempotent-unsubscribe contract as
   *  addTriggerListener. */
  addStepListener(cb: StepListener): () => void {
    let active = true;
    const listener: StepListener = (step, audioTime) => {
      if (active) cb(step, audioTime);
    };
    this.stepListeners.push(listener);
    return () => {
      if (!active) return;
      active = false;
      this.stepListeners = this.stepListeners.filter((candidate) => candidate !== listener);
    };
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

  /** Run fn at the next bar line that a `bars`-long loop is allowed to START
   *  on — the next phrase position that is a whole multiple of the loop.
   *
   *  ROUND-1 SEAM. A chart loops at `phraseStep % (bars * 16)`, so a two-bar
   *  pattern only lines up on phrase bars 1 and 3 and a four-bar pattern only on
   *  bar 1. atNextBar() does not know that, which is fine for the base (it swaps
   *  charts, it never records them) and wrong for anything that lets the player
   *  lay a pattern down live: start a four-bar take on bar 3 and the player hears
   *  their bar 1 material arrive in bar 3 forever after. `bars: 1` is exactly
   *  atNextBar. */
  atNextLoopTop(bars: number, fn: (audioTime: number) => void): void {
    this.loopTopQueue.push({ bars: Math.max(1, Math.floor(bars)), fn });
  }

  /** End the track ON the bar line rather than wherever the run happened to
   *  stop it: play out the bar in progress (a bar is the few-second musical
   *  measure the arrangement is currently inside), then stop the transport at
   *  its last step and hand the boundary's audio time to `fn`.
   *
   *  Nothing of the next bar is scheduled — the stop happens in the step
   *  callback that would have queued the new bar's downbeat, before any voice
   *  sees it — so the music finishes a phrase instead of being cut mid-word.
   *  If the transport is already stopped there is no bar to finish and `fn`
   *  runs immediately, at the current time. */
  stopAtBarEnd(fn: (audioTime: number) => void): void {
    if (!this.clock.running) {
      fn(this.ctx.currentTime);
      return;
    }
    this.barEndStop = fn;
  }

  /** Run fn while scheduling the next unheard four-bar phrase downbeat.
   * Unlike the ordinary bar API, this can claim a phrase-zero step already in
   * the 120 ms lookahead window, so filling Pressure just before the heard
   * downbeat never adds an accidental four-bar wait. `afterAudioTime` reserves
   * a strictly later phrase (used to end a Drop exactly four bars later).
   * `acceptOverdue` is reserved for phrase-end cleanup: it dispatches the
   * intended boundary after a main-thread stall instead of extending a buff. */
  atNextPhrase(
    fn: (audioTime: number) => void,
    afterAudioTime = this.ctx.currentTime,
    acceptOverdue = false,
  ): void {
    const scheduledTime = nextUnheardPhraseTime(
      this.stepMarkers,
      this.ctx.currentTime,
      afterAudioTime,
    );
    if (scheduledTime !== null) {
      fn(scheduledTime);
      return;
    }
    this.phraseQueue.push({ fn, afterAudioTime, acceptOverdue });
  }

  /** Queue non-audio state for an exact audio-clock instant. update() merges
   *  these actions with due triggers chronologically; actions run before a
   *  trigger at the same timestamp, but never before an older trigger. */
  atAudioTime(time: number, fn: () => void): void {
    this.timedActions.push({ time, fn, seq: this.nextTimedActionSeq++ });
  }

  /** Drop queued musical changes (a run ended before they landed) so no
   * lookahead audio leaks to the next screen. */
  clearBarQueue(): void {
    this.barQueue = [];
    this.barEndStop = null;
    this.phraseQueue = [];
    this.loopTopQueue = [];
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
    this.barEndStop = null;
    this.phraseQueue = [];
    this.loopTopQueue = [];
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
      this.barEndStop === null &&
      this.phraseQueue.length === 0 &&
      this.loopTopQueue.length === 0 &&
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
    this.trigger(voice, ev, this.ctx.currentTime);
  }

  private onStep(step: number, time: number): void {
    if (step === 0) this.lastDueStep = 0;
    this.stepMarkers.push({ step, time });
    // The phrase clock: bars 1-4, then roll over. Charts loop inside the
    // phrase, so a 4-bar chart's bar 4 is always the phrase's bar 4 and
    // once-per-phrase material lands where it was written.
    const phraseStep = step % STEPS_PER_PHRASE;
    // The armed bar-line stop wins the boundary outright: this step belongs to
    // the bar that must never be heard, so the transport goes down before any
    // voice or queued change gets to look at it.
    if (this.barEndStop && phraseStep % STEPS_PER_BAR === 0) {
      const stop = this.barEndStop;
      this.barEndStop = null;
      this.clock.stop();
      this.barQueue = [];
      this.phraseQueue = [];
      this.loopTopQueue = [];
      stop(time);
      return;
    }
    if (phraseStep % STEPS_PER_BAR === 0 && this.barQueue.length > 0) {
      const queue = this.barQueue;
      this.barQueue = [];
      for (const fn of queue) fn(time);
    }
    // Loop tops: only the entries whose loop length divides this phrase position
    // fire. Partitioned rather than filtered in place so a callback that queues
    // another wait cannot be dispatched inside its own boundary.
    if (phraseStep % STEPS_PER_BAR === 0 && this.loopTopQueue.length > 0) {
      const waiting: typeof this.loopTopQueue = [];
      const due: typeof this.loopTopQueue = [];
      for (const entry of this.loopTopQueue) {
        (phraseStep % (entry.bars * STEPS_PER_BAR) === 0 ? due : waiting).push(entry);
      }
      this.loopTopQueue = waiting;
      for (const entry of due) entry.fn(time);
    }
    if (phraseStep === 0 && this.phraseQueue.length > 0) {
      const retained: typeof this.phraseQueue = [];
      const due: typeof this.phraseQueue = [];
      for (const entry of this.phraseQueue) {
        if (canDispatchPhraseBoundary(
          time,
          this.ctx.currentTime,
          entry.afterAudioTime,
          entry.acceptOverdue,
        )) due.push(entry);
        else retained.push(entry);
      }
      this.phraseQueue = retained;
      for (const entry of due) entry.fn(time);
    }
    for (const cb of this.stepListeners) cb(step, time);
    for (const voice of this.voices.values()) {
      if (!voice.enabled) continue;
      for (const ev of chartEventsAtStep(voice.chart, phraseStep)) {
        this.trigger(voice, ev, time, phraseStep);
      }
    }
  }

  private trigger(
    voice: Voice,
    ev: ChartEvent,
    time: number,
    phraseStep = -1,
    dispatchGameplay = true,
    gainMul = 1,
  ): void {
    // A BED IS NOT PLAYED BY THE SEQUENCER. It has no notes: `syncBed` runs one
    // continuous looping source for as long as the weapon is owned. Returning
    // here is what stops the ear hearing a background sound BEGIN on a grid
    // step, which was the whole complaint about the first pass.
    if (voice.kit.bed) return;

    // MULTI-SAMPLED voices pick their recording by pitch, not by chart variant:
    // the zone nearest the wanted note plays, and only the small remainder is
    // shifted. Everything else keeps the original path exactly — one buffer per
    // variant, the whole note shifted — so the control's eight voices are
    // untouched by this branch.
    const zones = voice.kit.zones;
    const zone = zones?.length ? nearestZone(zones, ev.note ?? 0) : undefined;
    const variant = zone?.variant ?? ev.variant ?? voice.kit.defaultVariant;
    const buffer =
      voice.override ??
      voice.activeSamples.get(variant) ??
      voice.activeSamples.values().next().value;
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    this.activeSources.add(src);
    src.addEventListener('ended', () => this.activeSources.delete(src), { once: true });

    // A zone has already covered the distance to its own root, so only what is
    // left over gets shifted. Playing the full note here would double-count it
    // and put every multi-sampled voice wildly out of tune.
    const wanted = (ev.note ?? 0) - (zone?.rootSemitone ?? 0);
    let rate = semitonesToRate(wanted + voice.tune);
    if (!voice.kit.pitched) {
      rate *= semitonesToRate(((Math.random() * 2 - 1) * HUMANIZE_CENTS) / 100);
    }
    src.playbackRate.value = rate;

    const g = this.ctx.createGain();
    const humanized = ev.velocity * (1 + (Math.random() * 2 - 1) * HUMANIZE_GAIN);
    g.gain.value = Math.max(0.01, humanized * Math.max(0, gainMul));
    if (voice.evolved) {
      // The same chart trigger receives a newly processed timbre: one source,
      // no doubled instrument. Bright roles get a sharper presence band while
      // low roles gain controlled saturation and weight.
      const filter = this.ctx.createBiquadFilter();
      const lowRole = EVOLUTION_LOW_ROLES.has(voice.role);
      filter.type = lowRole ? 'lowshelf' : 'peaking';
      filter.frequency.value = lowRole ? 120 : EVOLUTION_BRIGHT_ROLES.has(voice.role) ? 8_200 : 2_400;
      filter.gain.value = lowRole ? 4 : 3;
      filter.Q.value = lowRole ? 0.55 : 1.15;
      if (EVOLUTION_SATURATED_ROLES.has(voice.role)) {
        const saturation = this.ctx.createWaveShaper();
        saturation.curve = EVOLUTION_SATURATION;
        saturation.oversample = '2x';
        src.connect(filter).connect(saturation).connect(g).connect(voice.gain);
      } else {
        src.connect(filter).connect(g).connect(voice.gain);
      }
    } else {
      src.connect(g).connect(voice.gain);
    }
    src.start(time);

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

    if (dispatchGameplay) {
      this.pending.push({
        source: src,
        voice,
        chokedPrevious,
        trigger: {
          role: voice.role,
          time,
          velocity: ev.velocity,
          step: phraseStep,
          variant: ev.variant,
          note: ev.note,
        },
      });
    }
    // If no consumer is draining (hidden tab pauses rAF), drop stale entries
    // so the queue cannot grow unboundedly while audio keeps scheduling.
    if (this.pending.length > 64) {
      const cutoff = this.ctx.currentTime - 1;
      this.pending = this.pending.filter((pending) => pending.trigger.time > cutoff);
    }
  }
}
