// Sound kits: the atomic unit of a weapon is a kit plus a chart
// (docs/plan.md, "Weapons as sound"). A kit is a small family of related
// samples. M1 ships with synthesized placeholder samples rendered offline at
// startup so the rehearsal room works out of the box; real CC0 pack samples
// are auditioned in the room by loading files over these slots. Pitched kits
// hold one sample at the root and get note variants by playback-rate shifting.

export type Role = 'kick' | 'snare' | 'hat' | 'bass' | 'chord' | 'lead';

export const ROLES: readonly Role[] = ['kick', 'snare', 'hat', 'bass', 'chord', 'lead'];

export interface Kit {
  role: Role;
  name: string;
  /** Weapon identity color, shared with the game's visuals later. */
  color: string;
  pitched: boolean;
  /** variant id -> rendered sample. Charts reference variants by id. */
  samples: Map<string, AudioBuffer>;
  defaultVariant: string;
}

const RENDER_RATE = 44100;

function offline(seconds: number): OfflineAudioContext {
  return new OfflineAudioContext(1, Math.ceil(seconds * RENDER_RATE), RENDER_RATE);
}

/** White-noise buffer used as an excitation source by several drums. */
function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

async function renderKick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(hard ? 170 : 130, 0);
  osc.frequency.exponentialRampToValueAtTime(44, 0.11);
  gain.gain.setValueAtTime(hard ? 1.0 : 0.8, 0);
  gain.gain.exponentialRampToValueAtTime(0.001, hard ? 0.42 : 0.3);
  osc.connect(gain).connect(ctx.destination);
  // click transient
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.012);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(hard ? 0.35 : 0.15, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.012);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 1200;
  click.connect(clickHp).connect(clickGain).connect(ctx.destination);
  osc.start(0);
  click.start(0);
  return ctx.startRendering();
}

async function renderSnare(): Promise<AudioBuffer> {
  const ctx = offline(0.3);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 0.6;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.7, 0);
  nGain.gain.exponentialRampToValueAtTime(0.001, 0.2);
  noise.connect(bp).connect(nGain).connect(ctx.destination);
  const tone = ctx.createOscillator();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(196, 0);
  tone.frequency.exponentialRampToValueAtTime(150, 0.08);
  const tGain = ctx.createGain();
  tGain.gain.setValueAtTime(0.5, 0);
  tGain.gain.exponentialRampToValueAtTime(0.001, 0.12);
  tone.connect(tGain).connect(ctx.destination);
  noise.start(0);
  tone.start(0);
  return ctx.startRendering();
}

async function renderClap(): Promise<AudioBuffer> {
  const ctx = offline(0.35);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 1.2;
  bp.connect(ctx.destination);
  // three quick bursts then a tail
  for (const [at, level, dur] of [
    [0, 0.6, 0.02],
    [0.018, 0.55, 0.02],
    [0.036, 0.7, 0.22],
  ] as const) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(g).connect(bp);
    src.start(at);
  }
  return ctx.startRendering();
}

async function renderHat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.4 : 0.08;
  const ctx = offline(dur + 0.05);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.4 : 0.5, 0);
  g.gain.exponentialRampToValueAtTime(0.001, dur);
  noise.connect(hp).connect(g).connect(ctx.destination);
  noise.start(0);
  return ctx.startRendering();
}

async function renderBass(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.7);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz / 4; // two octaves under the root reference
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, 0);
  lp.frequency.exponentialRampToValueAtTime(120, 0.5);
  lp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.7, 0.015);
  g.gain.setValueAtTime(0.7, 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, 0.65);
  const subG = ctx.createGain();
  subG.gain.value = 0.5;
  osc.connect(lp).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  osc.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// Chord voicing is quartal (root, +5, +10 semitones). Stacked fourths from a
// minor-pentatonic root stay inside the note set when the chart shifts the
// whole sample to the other allowed chord roots (0, +5, +7), which a triad
// would not.
async function renderChord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const dur = pad ? 1.6 : 0.5;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 1800 : 2600;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.34, pad ? 0.15 : 0.008);
  master.gain.exponentialRampToValueAtTime(0.001, dur);
  lp.connect(master).connect(ctx.destination);
  for (const semis of [0, 5, 10]) {
    for (const detune of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      osc.connect(g).connect(lp);
      osc.start(0);
    }
  }
  return ctx.startRendering();
}

async function renderLead(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = rootHz * 2; // an octave above the root reference
  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = rootHz * 2;
  osc2.detune.value = 8;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4500, 0);
  lp.frequency.exponentialRampToValueAtTime(700, 0.45);
  lp.Q.value = 1.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.4, 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, 0.55);
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  osc.connect(lp);
  osc2.connect(g2).connect(lp);
  lp.connect(g).connect(ctx.destination);
  osc.start(0);
  osc2.start(0);
  return ctx.startRendering();
}

/** Render every builtin kit. Called once at startup. */
export async function buildKits(rootHz: number): Promise<Map<Role, Kit>> {
  const [kickHard, kickSoft, snare, clap, hatClosed, hatOpen, bass, stab, pad, lead] =
    await Promise.all([
      renderKick(true),
      renderKick(false),
      renderSnare(),
      renderClap(),
      renderHat(false),
      renderHat(true),
      renderBass(rootHz),
      renderChord(rootHz, false),
      renderChord(rootHz, true),
      renderLead(rootHz),
    ]);

  const kits = new Map<Role, Kit>();
  const add = (
    role: Role,
    name: string,
    color: string,
    pitched: boolean,
    entries: [string, AudioBuffer][],
  ) => {
    kits.set(role, {
      role,
      name,
      color,
      pitched,
      samples: new Map(entries),
      defaultVariant: entries[0][0],
    });
  };

  add('kick', 'Kick', '#ff5a3c', false, [
    ['hard', kickHard],
    ['soft', kickSoft],
  ]);
  add('snare', 'Snare / Clap', '#ffc93c', false, [
    ['snare', snare],
    ['clap', clap],
  ]);
  add('hat', 'Hi-hat', '#3ce0ff', false, [
    ['closed', hatClosed],
    ['open', hatOpen],
  ]);
  add('bass', 'Bass', '#a06bff', true, [['bass', bass]]);
  add('chord', 'Chord', '#4dff88', true, [
    ['stab', stab],
    ['pad', pad],
  ]);
  add('lead', 'Lead', '#ff6bd6', true, [['lead', lead]]);
  return kits;
}
