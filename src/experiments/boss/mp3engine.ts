// An alternate boss "track transport": instead of the LabEngine synthesizing
// the cover live from charts, this plays a real audio file (an mp3 of the
// actual record) and emits the SAME beat grid the conductor drives attacks off.
// The point is a straight A/B: the mp3 boss walks the identical arrangement and
// fires the identical attack grammar, but the sound the player hears is the
// finished recording, not the in-engine reconstruction.
//
// Sync model. The recording is assumed to hold a steady tempo (the track bpm).
// One number aligns everything: `offsetS`, the file position that plays at
// fight-step 0. The grid is then anchored so fight-time t always sounds file
// content (offsetS + t) — so a beat-locked attack at fight-time t lands on the
// same musical instant every time. A live nudge changes `offsetS` (re-seeking
// the audio, grid untouched), which is how the developer slides the record until
// its downbeats sit under the attacks — this also skips any silent intro so the
// two variants line up bar-for-bar. Once dialed in, the number is baked as the
// boss's default and no nudging happens in normal play.
//
// It exposes exactly the surface BossConductor + the boss page use (see
// BossTransport in conductor.ts); it renders no charts, so update() is a no-op.

import type { LabTrack } from '../tracklab/tracks/types';
import type { BossTransport } from './conductor';

const STEPS_PER_BAR = 16;
const BEATS_PER_BAR = 4;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;
const RUN_IN_S = 0.14; // small lead so start()/re-seek land cleanly ahead of now

export class Mp3Engine implements BossTransport {
  readonly ctx: AudioContext;
  readonly track: LabTrack;
  readonly clock = { stepsPerBeat: STEPS_PER_BAR / BEATS_PER_BAR };
  sectionId: string;

  private readonly buffer: AudioBuffer;
  private readonly master: GainNode;
  private readonly stepsPerPhrase: number;

  /** File position (seconds) that plays at fight-step 0. Tunable live. */
  private offsetS: number;
  private source: AudioBufferSourceNode | null = null;
  private timer: number | null = null;
  /** ctx time of fight-step 0 (the grid anchor). */
  private anchor = 0;
  private nextStep = 0;
  private done = false;

  private stepListeners: ((absStep: number, phraseStep: number, time: number) => void)[] = [];

  private constructor(ctx: AudioContext, track: LabTrack, buffer: AudioBuffer, offsetS: number) {
    this.ctx = ctx;
    this.track = track;
    this.buffer = buffer;
    this.offsetS = offsetS;
    this.sectionId = track.sections[0].id;
    this.stepsPerPhrase = track.bars * STEPS_PER_BAR;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
  }

  /** Fetch + decode the file. Throws a clear error if it isn't there yet.
   *  Note the dev server answers unknown paths with index.html (200), so a
   *  missing file shows up as an HTML content-type, not a 404 — handle both. */
  static async load(ctx: AudioContext, track: LabTrack, url: string, offsetS = 0): Promise<Mp3Engine> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new Error(`could not fetch the audio file (${url})`);
    }
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || type.includes('text/html')) {
      throw new Error(`no audio file at ${url} — drop the track there`);
    }
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      throw new Error(`couldn't decode ${url} — is it a valid audio file?`);
    }
    return new Mp3Engine(ctx, track, buffer, offsetS);
  }

  get durationS(): number {
    return this.buffer.duration;
  }

  private get stepDuration(): number {
    return 60 / this.track.bpm / this.clock.stepsPerBeat;
  }

  addStepListener(cb: (absStep: number, phraseStep: number, time: number) => void): void {
    this.stepListeners.push(cb);
  }

  /** The conductor pre-queues section changes; for the record there is nothing
   *  to switch (the mp3 is one continuous take), so this only tracks the id. */
  setSection(id: string): void {
    if (this.track.sections.some((s) => s.id === id)) this.sectionId = id;
  }

  setMasterGain(value: number): void {
    this.master.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }

  /** Current file-position offset, seconds (for the tuning readout). */
  get syncOffsetS(): number {
    return this.offsetS;
  }

  /** Live nudge: re-map which part of the record plays under the grid. Keeps
   *  the grid fixed and re-seeks the audio, so attacks stay put and the music
   *  slides under them until the downbeats align. */
  setSyncOffset(seconds: number): void {
    this.offsetS = seconds;
    if (this.source) this.restartSource(this.ctx.currentTime + 0.03);
  }

  start(): void {
    if (this.done) return;
    void this.ctx.resume();
    this.anchor = this.ctx.currentTime + RUN_IN_S;
    this.nextStep = 0;
    this.restartSource(this.anchor);
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), LOOKAHEAD_MS);
    this.tick();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    this.stopSource();
    this.done = true;
  }

  dispose(): void {
    this.stop();
    this.master.disconnect();
  }

  /** No live-synthesized triggers to dispatch — the file carries the sound. */
  update(): void {}

  private stopSource(): void {
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* already stopped */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  /** (Re)start the buffer at `when` so the invariant holds: at fight-time
   *  (when − anchor) the file plays position offsetS + (when − anchor). */
  private restartSource(when: number): void {
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.master);
    const filePos = this.offsetS + (when - this.anchor);
    const clamped = Math.max(0, Math.min(filePos, this.buffer.duration - 0.02));
    src.start(when, clamped);
    this.source = src;
  }

  private tick(): void {
    const stepDur = this.stepDuration;
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_S;
    // Keep feeding the grid to the end of the arrangement even if the record
    // runs out first (the audio just plays out / falls silent) — the conductor
    // owns the length and stops us on finish. Stopping here instead would
    // starve the conductor of its finish step and hang the fight with no win.
    while (this.anchor + this.nextStep * stepDur < horizon) {
      const time = this.anchor + this.nextStep * stepDur;
      const phraseStep = this.nextStep % this.stepsPerPhrase;
      for (const cb of this.stepListeners) cb(this.nextStep, phraseStep, time);
      this.nextStep++;
    }
  }
}
