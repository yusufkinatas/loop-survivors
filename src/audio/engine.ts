// The music engine: fire control and arranger at once (docs/plan.md,
// Coupling Model A). It is a pure function of build (which voices are on) and
// grid (the clock's steps): no stage input exists.

import { Clock } from './clock';
import { chartEventsAtStep } from './arranger';
import { TIER_COUNT, type Chart, type ChartEvent } from './charts';
import { getChart } from './chartstore';
import { SOUNDSET } from './soundset';
import { SKELETON, STEPS_PER_BAR, STEPS_PER_PHRASE, semitonesToRate } from './scale';
import { softClipCurve, type Kit, type Role } from './kits';
import { buildSoundsetKit } from './kits/index';
import {
  DEFAULT_AUDIO_SET_ID,
  type AudioSetId,
} from './audio-sets';

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

/** Candidate XP-gem pickup sounds (prototype). See MusicEngine.playGemCue for
 *  what each one is; GEM_CUE_VARIANTS below drives the debug-row picker. */
export type GemCueVariant = 'blip' | 'pluck' | 'bell' | 'tick' | 'ladder';

export const GEM_CUE_VARIANTS: readonly GemCueVariant[] = [
  'blip',
  'pluck',
  'bell',
  'tick',
  'ladder',
];

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
  private barQueue: ((audioTime: number) => void)[] = [];
  private phraseQueue: Array<{
    fn: (audioTime: number) => void;
    afterAudioTime: number;
    acceptOverdue: boolean;
  }> = [];
  private timedActions: TimedAction[] = [];
  private nextTimedActionSeq = 0;
  private stepMarkers: { step: number; time: number }[] = [];
  private lastDueStep = 0;
  /** Gem cue state (prototype): the throttle's clock, and how far the 'ladder'
   *  variant has climbed. Audio-clock time, so a paused context freezes both. */
  private lastGemCueTime = -Infinity;
  private gemLadderStep = 0;

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

  /** Player took damage: one short, dark impact, and a dip of the whole
   *  weapons bus underneath it so the thud lands in a hole it made itself.
   *
   *  Two layers, both deliberately un-musical — this is the one moment the game
   *  is NOT making a track, and it should not sound like a voice joining the
   *  build. A noise crack (the contact) over a body tone that falls off a
   *  cliff, roughly 180 Hz down to 50 Hz in a tenth of a second. The fall is
   *  what reads as "bad": pitch dropping fast is the shape of something going
   *  wrong. It rides master like the other cues, so mute is respected and
   *  neither its own duck nor a level-up duck can swallow it.
   *
   *  `duckDepth`/`duckHoldS` come from DAMAGE_FEEDBACK — the engine holds no
   *  game tuning of its own. The two envelope peaks below (body, then noise)
   *  are the loudness knobs, and they are deliberately hot: the body sits near
   *  unity, well into the master limiter. That is the ceiling — pushing them
   *  much further buys compression, not volume, and the limiter's 0.12s release
   *  means an over-hot cue pumps the whole track down after every hit. If it
   *  still needs to feel bigger, lower `hitDuckDepth` in config.ts so there is
   *  more room underneath, or lengthen the body's fall; do not just raise these. */
  playHitCue(duckDepth: number, duckHoldS: number): void {
    if (this.masterTarget <= 0) return; // muted
    const now = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 1;
    out.connect(this.master);

    // The dip. Fast in (the flinch), slower out (the recovery), and always
    // ramping back to unity so repeated hits cannot stack the bus toward
    // silence.
    const g = this.hitDuck.gain;
    const depth = Math.max(0, Math.min(1, duckDepth));
    const hold = Math.max(0.05, duckHoldS);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(depth, now + 0.02);
    g.linearRampToValueAtTime(1, now + hold);

    // Layer 1: the contact crack — a very short lowpassed noise burst.
    const burstS = 0.09;
    const noiseBuffer = this.ctx.createBuffer(
      1,
      Math.ceil(this.ctx.sampleRate * burstS),
      this.ctx.sampleRate,
    );
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const fade = 1 - i / samples.length;
      samples[i] = (Math.random() * 2 - 1) * fade * fade;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, now);
    lp.frequency.exponentialRampToValueAtTime(320, now + burstS);
    const noiseEnv = this.ctx.createGain();
    noiseEnv.gain.setValueAtTime(0.45, now);
    noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + burstS);
    noise.connect(lp).connect(noiseEnv).connect(out);
    noise.start(now);
    noise.stop(now + burstS);

    // Layer 2: the body — a falling low tone, the part you feel.
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(180, now);
    body.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    const bodyEnv = this.ctx.createGain();
    bodyEnv.gain.setValueAtTime(0.0001, now);
    bodyEnv.gain.exponentialRampToValueAtTime(0.85, now + 0.006);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    body.connect(bodyEnv).connect(out);
    body.start(now);
    body.stop(now + 0.26);
  }

  /** Stage Magnet pickup: one short suction sweep and two confirmation clicks.
   * It rides the master like the level cue, so mute is respected and a
   * level-up weapons duck cannot swallow the feedback. */
  playStageMagnetCue(): void {
    if (this.masterTarget <= 0) return;
    const now = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.value = 1;
    out.connect(this.master);

    const duration = 0.46;
    const noiseBuffer = this.ctx.createBuffer(
      1,
      Math.ceil(this.ctx.sampleRate * duration),
      this.ctx.sampleRate,
    );
    const samples = noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const fade = 1 - i / samples.length;
      samples[i] = (Math.random() * 2 - 1) * fade;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const sweep = this.ctx.createBiquadFilter();
    sweep.type = 'bandpass';
    sweep.Q.value = 0.8;
    sweep.frequency.setValueAtTime(420, now);
    sweep.frequency.exponentialRampToValueAtTime(3600, now + duration);
    const noiseEnv = this.ctx.createGain();
    noiseEnv.gain.setValueAtTime(0.0001, now);
    noiseEnv.gain.exponentialRampToValueAtTime(0.13, now + 0.035);
    noiseEnv.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(sweep).connect(noiseEnv).connect(out);
    noise.start(now);
    noise.stop(now + duration);

    const lift = this.ctx.createOscillator();
    lift.type = 'triangle';
    lift.frequency.setValueAtTime(150, now);
    lift.frequency.exponentialRampToValueAtTime(760, now + 0.38);
    const liftEnv = this.ctx.createGain();
    liftEnv.gain.setValueAtTime(0.0001, now);
    liftEnv.gain.exponentialRampToValueAtTime(0.08, now + 0.025);
    liftEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    lift.connect(liftEnv).connect(out);
    lift.start(now);
    lift.stop(now + 0.44);

    for (let i = 0; i < 2; i++) {
      const t0 = now + 0.33 + i * 0.065;
      const click = this.ctx.createOscillator();
      click.type = 'square';
      click.frequency.value = i === 0 ? 1568 : 2093;
      const clickEnv = this.ctx.createGain();
      clickEnv.gain.setValueAtTime(0.0001, t0);
      clickEnv.gain.exponentialRampToValueAtTime(0.045, t0 + 0.004);
      clickEnv.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      click.connect(clickEnv).connect(out);
      click.start(t0);
      click.stop(t0 + 0.06);
    }
  }

  /** XP gem pickup, PROTOTYPE (see GEM_CUE in config.ts). Five candidate
   *  sounds, switchable live from the debug row, so the feel can be chosen by
   *  ear in a real run rather than argued about on paper.
   *
   *  All five obey the same three rules the other cues do: silent when muted,
   *  wired to master so no duck can swallow them, and short — a gem lands
   *  dozens of times a minute, so anything with a tail becomes mud.
   *
   *  `gain` scales every envelope peak (the debug slider drives it) and
   *  `minGapS` is the throttle: a Stage Magnet vacuums the whole map at once
   *  and would otherwise fire hundreds of cues in one frame. Both are caller
   *  tuning, like playHitCue's duck — the engine holds no game numbers.
   *
   *  The variants, in plain terms:
   *   - `blip`   two quick square-wave notes a fifth apart (the interval in a
   *              power chord), rising. Arcade coin. Reads as "got it" loudest.
   *   - `pluck`  one sawtooth note through a filter that snaps shut, which is
   *              roughly how a plucked string behaves. Musical; sits IN the
   *              track instead of on top of it.
   *   - `bell`   two sine tones at a non-whole-number ratio (2.76x, the ratio
   *              real bells ring at), so it shimmers rather than sings.
   *              Prettiest, and the longest — watch it pile up.
   *   - `tick`   a filtered noise burst plus a hint of pitch. Nearly a
   *              percussion hit. The one that never competes with the music.
   *   - `ladder` a pentatonic scale (the five-note scale where nothing can
   *              clash) climbing one step per gem, resetting after a pause.
   *              Grabbing a cluster plays a rising run, which makes a big
   *              pickup streak feel like a fill. The most expressive; also the
   *              only one with memory, so bulk vacuums sound like an event. */
  playGemCue(variant: GemCueVariant, gain: number, minGapS: number): void {
    if (this.masterTarget <= 0) return; // muted
    if (gain <= 0) return;
    const now = this.ctx.currentTime;
    // Throttle. Cheap and deliberate: drop the cue rather than queue it, so a
    // vacuum sounds like a handful of pickups, not a machine gun.
    if (now - this.lastGemCueTime < minGapS) return;
    const sinceLast = now - this.lastGemCueTime;
    this.lastGemCueTime = now;

    const out = this.ctx.createGain();
    out.gain.value = gain;
    out.connect(this.master);

    if (variant === 'blip') {
      const notes = [1568.0, 2349.3]; // G6 -> D7, a fifth up
      for (let i = 0; i < notes.length; i++) {
        const t0 = now + i * 0.055;
        const osc = this.ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = notes[i];
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, t0);
        env.gain.exponentialRampToValueAtTime(0.05, t0 + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
        osc.connect(env).connect(out);
        osc.start(t0);
        osc.stop(t0 + 0.1);
      }
      return;
    }

    if (variant === 'pluck') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 1046.5; // C6
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 4;
      lp.frequency.setValueAtTime(6000, now);
      lp.frequency.exponentialRampToValueAtTime(900, now + 0.12);
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(0.13, now + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(lp).connect(env).connect(out);
      osc.start(now);
      osc.stop(now + 0.18);
      return;
    }

    if (variant === 'bell') {
      const base = 1318.5; // E6
      const partials = [
        { ratio: 1, peak: 0.09, decay: 0.34 },
        { ratio: 2.76, peak: 0.035, decay: 0.2 },
      ];
      for (const p of partials) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = base * p.ratio;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, now);
        env.gain.exponentialRampToValueAtTime(p.peak, now + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
        osc.connect(env).connect(out);
        osc.start(now);
        osc.stop(now + p.decay + 0.02);
      }
      return;
    }

    if (variant === 'tick') {
      const burstS = 0.05;
      const buffer = this.ctx.createBuffer(
        1,
        Math.ceil(this.ctx.sampleRate * burstS),
        this.ctx.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const fade = 1 - i / samples.length;
        samples[i] = (Math.random() * 2 - 1) * fade * fade;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.value = 3200;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.12, now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + burstS);
      noise.connect(bp).connect(env).connect(out);
      noise.start(now);
      noise.stop(now + burstS);
      return;
    }

    // 'ladder'. C major pentatonic across two octaves; one step per gem while
    // pickups keep coming, back to the bottom once they stop. The reset window
    // is the throttle's own scale (a few gaps' worth), so a cluster climbs and
    // a lone gem always plays the root.
    const PENTATONIC = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0, 2349.3, 2637.0];
    if (sinceLast > 0.55) this.gemLadderStep = 0;
    const step = this.gemLadderStep;
    this.gemLadderStep = Math.min(PENTATONIC.length - 1, step + 1);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = PENTATONIC[step];
    const env = this.ctx.createGain();
    // Quieter as it climbs: a long run should build, not pin the limiter.
    const peak = 0.14 * (1 - step * 0.055);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(peak, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(env).connect(out);
    osc.start(now);
    osc.stop(now + 0.17);
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
    this.phraseQueue = [];
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
    this.phraseQueue = [];
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
      this.phraseQueue.length === 0 &&
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
    if (phraseStep % STEPS_PER_BAR === 0 && this.barQueue.length > 0) {
      const queue = this.barQueue;
      this.barQueue = [];
      for (const fn of queue) fn(time);
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
    const variant = ev.variant ?? voice.kit.defaultVariant;
    const buffer =
      voice.override ??
      voice.activeSamples.get(variant) ??
      voice.activeSamples.values().next().value;
    if (!buffer) return;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    this.activeSources.add(src);
    src.addEventListener('ended', () => this.activeSources.delete(src), { once: true });

    let rate = semitonesToRate((ev.note ?? 0) + voice.tune);
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
      const lowRole = voice.role === 'kick' || voice.role === 'bass';
      filter.type = lowRole ? 'lowshelf' : 'peaking';
      filter.frequency.value = lowRole ? 120 : voice.role === 'hat' ? 8_200 : 2_400;
      filter.gain.value = lowRole ? 4 : 3;
      filter.Q.value = lowRole ? 0.55 : 1.15;
      if (voice.role === 'kick' || voice.role === 'bass' || voice.role === 'clap' || voice.role === 'snare') {
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
