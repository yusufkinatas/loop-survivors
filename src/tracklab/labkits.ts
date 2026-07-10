// Track Lab instrument synthesis: offline-rendered one-shots for sounds the
// game's six kits don't have (808 cowbell, saturated sub-808, electro saw
// stab, Gesaffelstein-style metal stab, funk lead...). Same approach as
// src/audio/kits.ts — every sound is a buffer rendered once at load — but
// parameterized so each track file can tune its own palette, and with a
// waveshaper drive stage because phonk and techno get their weight from
// distortion baked into the sample, not from the mixer.

const RENDER_RATE = 44100;

function offline(seconds: number): OfflineAudioContext {
  return new OfflineAudioContext(1, Math.ceil(seconds * RENDER_RATE), RENDER_RATE);
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Soft-clip drive: amount 1 = gentle warmth, 4+ = crunchy, 8+ = nasty. */
function driveNode(ctx: BaseAudioContext, amount: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/** "F2", "A#3", "Db4" -> Hz (A4 = 440). */
export function noteHz(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`bad note name: ${name}`);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semi = base[m[1].toUpperCase()];
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  const midi = (Number(m[3]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Fetch + decode a real sample (drops into public/samples/covers/). */
export async function fetchSample(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sample fetch failed: ${url} (${res.status})`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

export const variants = (entries: [string, AudioBuffer][]) => new Map(entries);

// ---------------------------------------------------------------- drums ----

/** 808-family kick: sine pitch-drop. Long and boomy for phonk, short and
 *  tight for house four-on-the-floor. */
export async function kick808(opts: {
  from?: number;
  to?: number;
  decay?: number;
  drive?: number;
  click?: number;
} = {}): Promise<AudioBuffer> {
  const { from = 160, to = 48, decay = 0.4, drive = 1.5, click = 0.25 } = opts;
  const ctx = offline(decay + 0.1);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, 0);
  osc.frequency.exponentialRampToValueAtTime(to, 0.09);
  const g = ctx.createGain();
  g.gain.setValueAtTime(1.0, 0);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  const shaper = driveNode(ctx, drive);
  osc.connect(g).connect(shaper).connect(ctx.destination);
  const c = ctx.createBufferSource();
  c.buffer = noiseBuffer(ctx, 0.01);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(click, 0);
  cg.gain.exponentialRampToValueAtTime(0.001, 0.01);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  c.connect(hp).connect(cg).connect(ctx.destination);
  osc.start(0);
  c.start(0);
  return ctx.startRendering();
}

/** 909-flavored kick: harder mid-punch and a snappier attack, the house
 *  floor. */
export async function kick909(opts: { decay?: number; drive?: number } = {}): Promise<AudioBuffer> {
  const { decay = 0.28, drive = 2.2 } = opts;
  const ctx = offline(decay + 0.1);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(210, 0);
  osc.frequency.exponentialRampToValueAtTime(54, 0.055);
  const g = ctx.createGain();
  g.gain.setValueAtTime(1.0, 0);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  const shaper = driveNode(ctx, drive);
  osc.connect(g).connect(shaper).connect(ctx.destination);
  const c = ctx.createBufferSource();
  c.buffer = noiseBuffer(ctx, 0.008);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.5, 0);
  cg.gain.exponentialRampToValueAtTime(0.001, 0.008);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3400;
  c.connect(bp).connect(cg).connect(ctx.destination);
  osc.start(0);
  c.start(0);
  return ctx.startRendering();
}

/** Snare with tunable body/noise balance; drive it for phonk crack. */
export async function snare(opts: {
  tone?: number;
  noiseHz?: number;
  decay?: number;
  drive?: number;
} = {}): Promise<AudioBuffer> {
  const { tone = 185, noiseHz = 2200, decay = 0.22, drive = 1.8 } = opts;
  const ctx = offline(decay + 0.1);
  const out = driveNode(ctx, drive);
  out.connect(ctx.destination);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, decay);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = noiseHz;
  bp.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.8, 0);
  ng.gain.exponentialRampToValueAtTime(0.001, decay);
  noise.connect(bp).connect(ng).connect(out);
  const t = ctx.createOscillator();
  t.type = 'triangle';
  t.frequency.setValueAtTime(tone, 0);
  t.frequency.exponentialRampToValueAtTime(tone * 0.75, 0.07);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.5, 0);
  tg.gain.exponentialRampToValueAtTime(0.001, 0.1);
  t.connect(tg).connect(out);
  noise.start(0);
  t.start(0);
  return ctx.startRendering();
}

/** 909-style clap: three noise bursts into a bandpass, then the tail. */
export async function clap909(opts: { decay?: number } = {}): Promise<AudioBuffer> {
  const { decay = 0.25 } = opts;
  const ctx = offline(decay + 0.15);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1300;
  bp.Q.value = 1.4;
  bp.connect(ctx.destination);
  for (const [at, level, dur] of [
    [0, 0.7, 0.02],
    [0.02, 0.6, 0.02],
    [0.04, 0.85, decay],
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

/** Metallic hat: six detuned squares (the 808 recipe) through highpass.
 *  Reads as "real drum machine" where filtered noise reads as synth demo. */
export async function hat808(opts: { open?: boolean; hpf?: number } = {}): Promise<AudioBuffer> {
  const { open = false, hpf = 7000 } = opts;
  const dur = open ? 0.5 : 0.07;
  const ctx = offline(dur + 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = hpf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.5 : 0.65, 0);
  g.gain.exponentialRampToValueAtTime(0.001, dur);
  hp.connect(bp).connect(g).connect(ctx.destination);
  for (const f of [263, 400, 421, 474, 587, 845]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f * 4.16;
    const og = ctx.createGain();
    og.gain.value = 1 / 6;
    osc.connect(og).connect(hp);
    osc.start(0);
  }
  return ctx.startRendering();
}

/** White-noise riser: tension sweep into a drop. Trigger it N bars early. */
export async function noiseRiser(opts: { seconds: number; peak?: number } = { seconds: 7.4 }): Promise<AudioBuffer> {
  const { seconds, peak = 0.5 } = opts;
  const ctx = offline(seconds + 0.1);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, seconds);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(300, 0);
  bp.frequency.exponentialRampToValueAtTime(9000, seconds);
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.02, 0);
  g.gain.exponentialRampToValueAtTime(peak, seconds * 0.985);
  g.gain.linearRampToValueAtTime(0.001, seconds + 0.05);
  noise.connect(bp).connect(g).connect(ctx.destination);
  noise.start(0);
  return ctx.startRendering();
}

export async function crash(opts: { decay?: number } = {}): Promise<AudioBuffer> {
  const { decay = 1.4 } = opts;
  const ctx = offline(decay + 0.1);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, decay);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, 0);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  noise.connect(hp).connect(g).connect(ctx.destination);
  noise.start(0);
  return ctx.startRendering();
}

// -------------------------------------------------------------- pitched ----

/** The 808 cowbell: two square waves a wonky fifth-ish apart through a
 *  bandpass. Clean it's the disco cowbell; driven hard with a wet plate
 *  tail it is THE drift phonk lead. Rendered at rootHz; charts pitch it. */
export async function cowbell808(opts: {
  rootHz: number;
  decay?: number;
  drive?: number;
  wet?: number;
  reverbSeconds?: number;
} = { rootHz: 540 }): Promise<AudioBuffer> {
  const { rootHz, decay = 0.32, drive = 5, wet = 0, reverbSeconds = 1.1 } = opts;
  const ctx = offline(decay + (wet > 0 ? reverbSeconds : 0) + 0.1);
  const out = driveNode(ctx, drive);
  out.connect(ctx.destination);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = rootHz * 1.9;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, 0);
  g.gain.exponentialRampToValueAtTime(0.25, 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  bp.connect(g);
  g.connect(out);
  if (wet > 0) {
    const conv = ctx.createConvolver();
    conv.buffer = reverbIR(ctx, reverbSeconds, 4800);
    const wetG = ctx.createGain();
    wetG.gain.value = wet;
    g.connect(conv);
    conv.connect(wetG).connect(out);
  }
  for (const ratio of [1, 1.48]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = rootHz * ratio;
    const og = ctx.createGain();
    og.gain.value = 0.5;
    osc.connect(og).connect(bp);
    osc.start(0);
  }
  return ctx.startRendering();
}

/** Saturated 808 sub bass: sine with a fast pitch settle and baked drive so
 *  it growls on phone speakers, not just subwoofers. Choke it. */
export async function sub808(opts: {
  rootHz: number;
  decay?: number;
  drive?: number;
} = { rootHz: 55 }): Promise<AudioBuffer> {
  const { rootHz, decay = 0.9, drive = 3.5 } = opts;
  const ctx = offline(decay + 0.15);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rootHz * 2.2, 0);
  osc.frequency.exponentialRampToValueAtTime(rootHz, 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(1.0, 0.008);
  g.gain.setValueAtTime(1.0, decay * 0.55);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  const shaper = driveNode(ctx, drive);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  osc.connect(g).connect(shaper).connect(lp).connect(ctx.destination);
  osc.start(0);
  return ctx.startRendering();
}

/** Detuned saw stab with a snappy filter close: the electro-house riff
 *  sound. Drive up + resonance up = Benassi dirt. */
export async function sawStab(opts: {
  rootHz: number;
  decay?: number;
  detune?: number;
  cutoff?: number;
  sweepTo?: number;
  q?: number;
  drive?: number;
  saws?: number;
}): Promise<AudioBuffer> {
  const {
    rootHz,
    decay = 0.28,
    detune = 12,
    cutoff = 3200,
    sweepTo = 500,
    q = 4,
    drive = 3,
    saws = 3,
  } = opts;
  const ctx = offline(decay + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(cutoff, 0);
  lp.frequency.exponentialRampToValueAtTime(sweepTo, decay);
  lp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.7, 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  const shaper = driveNode(ctx, drive);
  lp.connect(g).connect(shaper).connect(ctx.destination);
  for (let i = 0; i < saws; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = rootHz;
    osc.detune.value = (i - (saws - 1) / 2) * detune;
    const og = ctx.createGain();
    og.gain.value = 0.9 / saws;
    osc.connect(og).connect(lp);
    osc.start(0);
  }
  return ctx.startRendering();
}

/** Gesaffelstein-style metal stab: saw + square an octave down, bandpassed
 *  into the mids and driven until it bites. Short, brutal, monophonic. */
export async function metalStab(opts: {
  rootHz: number;
  decay?: number;
  drive?: number;
  bpHz?: number;
}): Promise<AudioBuffer> {
  const { rootHz, decay = 0.19, drive = 7, bpHz = 900 } = opts;
  const ctx = offline(decay + 0.08);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = bpHz;
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.85, 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  const shaper = driveNode(ctx, drive);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 90;
  bp.connect(g).connect(shaper).connect(hp).connect(ctx.destination);
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = rootHz;
  const sq = ctx.createOscillator();
  sq.type = 'square';
  sq.frequency.value = rootHz / 2;
  sq.detune.value = 7;
  const sg = ctx.createGain();
  sg.gain.value = 0.55;
  saw.connect(bp);
  sq.connect(sg).connect(bp);
  saw.start(0);
  sq.start(0);
  return ctx.startRendering();
}

/** Squelchy resonant funk lead (Da Funk): detuned saws through a high-Q
 *  lowpass that sweeps down — the "talking" synth sound. */
export async function funkLead(opts: {
  rootHz: number;
  decay?: number;
  q?: number;
  cutoff?: number;
  sweepTo?: number;
  drive?: number;
}): Promise<AudioBuffer> {
  const { rootHz, decay = 0.4, q = 9, cutoff = 2600, sweepTo = 420, drive = 2.4 } = opts;
  const ctx = offline(decay + 0.12);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(cutoff, 0);
  lp.frequency.exponentialRampToValueAtTime(sweepTo, decay * 0.8);
  lp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.55, 0.012);
  g.gain.setValueAtTime(0.55, decay * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  const shaper = driveNode(ctx, drive);
  lp.connect(g).connect(shaper).connect(ctx.destination);
  for (const det of [-9, 0, 9]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = rootHz;
    osc.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = 0.33;
    osc.connect(og).connect(lp);
    osc.start(0);
  }
  return ctx.startRendering();
}

/** Impulse response for baked reverb: decaying noise with a one-pole
 *  highcut, fed to a ConvolverNode inside offline renders. */
function reverbIR(ctx: BaseAudioContext, seconds: number, highcutHz: number): AudioBuffer {
  const len = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const a = 1 - Math.exp((-2 * Math.PI * highcutHz) / ctx.sampleRate);
  let y = 0;
  for (let i = 0; i < len; i++) {
    const x = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    y += a * (x - y);
    data[i] = y;
  }
  return buf;
}

/** Bright sampled-keyboard-style house piano. Each render is one note; track
 *  charts can stack note events for exact chord shapes without baking one
 *  harmony into every hit. A short hammer click and quickly fading upper
 *  partials keep dense offbeat chords readable, while the quiet baked room
 *  tail stops solo notes from sounding like raw oscillators. */
export async function housePiano(opts: {
  rootHz: number;
  decay?: number;
  brightness?: number;
  wet?: number;
}): Promise<AudioBuffer> {
  const { rootHz, decay = 1.25, brightness = 1, wet = 0.14 } = opts;
  const roomSeconds = 0.7;
  const ctx = offline(decay + roomSeconds + 0.12);

  const dry = ctx.createGain();
  dry.gain.value = 0.9;
  dry.connect(ctx.destination);
  const conv = ctx.createConvolver();
  conv.buffer = reverbIR(ctx, roomSeconds, 6200);
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  conv.connect(wetGain).connect(ctx.destination);

  const body = ctx.createBiquadFilter();
  body.type = 'lowpass';
  body.frequency.value = 2400 + 2600 * Math.max(0, Math.min(1.5, brightness));
  body.Q.value = 0.35;
  body.connect(dry);
  body.connect(conv);

  const partials = [
    [1, 0.62, 1],
    [2, 0.34, 0.72],
    [3, 0.16, 0.46],
    [4, 0.1, 0.32],
    [6, 0.05, 0.2],
  ] as const;
  for (const [ratio, level, length] of partials) {
    const osc = ctx.createOscillator();
    osc.type = ratio === 1 ? 'triangle' : 'sine';
    osc.frequency.value = rootHz * ratio;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, 0);
    gain.gain.exponentialRampToValueAtTime(level, 0.004 + ratio * 0.0007);
    gain.gain.exponentialRampToValueAtTime(0.001, Math.max(0.08, decay * length));
    osc.connect(gain).connect(body);
    osc.start(0);
  }

  const hammer = ctx.createBufferSource();
  hammer.buffer = noiseBuffer(ctx, 0.018);
  const hammerBp = ctx.createBiquadFilter();
  hammerBp.type = 'bandpass';
  hammerBp.frequency.value = Math.min(7200, 1800 + rootHz * 7);
  hammerBp.Q.value = 1.2;
  const hammerGain = ctx.createGain();
  hammerGain.gain.setValueAtTime(0.12 + 0.12 * brightness, 0);
  hammerGain.gain.exponentialRampToValueAtTime(0.001, 0.018);
  hammer.connect(hammerBp).connect(hammerGain).connect(dry);
  hammer.start(0);

  return ctx.startRendering();
}

/** Punchy M1-era organ-style note for classic organ house. Additive drawbar
 *  harmonics provide the hollow, nasal body; a tiny key click gives the riff
 *  an edge without needing any copied keyboard sample. */
export async function houseOrgan(opts: {
  rootHz: number;
  seconds?: number;
  drive?: number;
  brightness?: number;
}): Promise<AudioBuffer> {
  const { rootHz, seconds = 0.52, drive = 1.8, brightness = 1 } = opts;
  const ctx = offline(seconds + 0.12);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600 + 1900 * Math.max(0, Math.min(1.5, brightness));
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 75;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, 0);
  gain.gain.exponentialRampToValueAtTime(0.62, 0.006);
  gain.gain.setValueAtTime(0.62, Math.max(0.04, seconds * 0.56));
  gain.gain.exponentialRampToValueAtTime(0.001, seconds);
  const shaper = driveNode(ctx, drive);
  lp.connect(hp).connect(gain).connect(shaper).connect(ctx.destination);

  for (const [ratio, level, type] of [
    [0.5, 0.16, 'sine'],
    [1, 0.48, 'square'],
    [2, 0.22, 'sine'],
    [3, 0.1, 'sine'],
    [4, 0.06, 'square'],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = rootHz * ratio;
    const oscGain = ctx.createGain();
    oscGain.gain.value = level;
    osc.connect(oscGain).connect(lp);
    osc.start(0);
  }

  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.009);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 2400;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(0.16, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.009);
  click.connect(clickHp).connect(clickGain).connect(shaper);
  click.start(0);

  return ctx.startRendering();
}

/** Dark phonk bell (the Sahara hook sound). Additive partials at ratios
 *  1 / 1.185 / 1.5 / 2 — the 1.185 is the flat minor-third "tierce" that
 *  makes single bell notes sound haunted — drenched in baked dark reverb,
 *  optionally driven into crunch for drop sections. */
export async function phonkBell(opts: {
  rootHz: number;
  decay?: number;
  drive?: number;
  wet?: number;
  reverbSeconds?: number;
  partialGains?: number[];
}): Promise<AudioBuffer> {
  const { rootHz, decay = 1.4, drive = 1, wet = 0.5, reverbSeconds = 2.6, partialGains } = opts;
  const ctx = offline(decay + reverbSeconds + 0.2);
  const out = drive > 1 ? driveNode(ctx, drive) : ctx.createGain();
  out.connect(ctx.destination);
  const dry = ctx.createGain();
  dry.gain.value = 1 - wet * 0.5;
  dry.connect(out);
  const conv = ctx.createConvolver();
  conv.buffer = reverbIR(ctx, reverbSeconds, 5200);
  const wetG = ctx.createGain();
  wetG.gain.value = wet;
  conv.connect(wetG).connect(out);
  const gains = partialGains ?? [1, 0.55, 0.4, 0.3];
  [1, 1.185, 1.5, 2].forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rootHz * ratio;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, 0);
    g.gain.exponentialRampToValueAtTime(0.5 * (gains[i] ?? 0.3), 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, decay * (i === 0 ? 1 : 0.8));
    osc.connect(g);
    g.connect(dry);
    g.connect(conv);
    osc.start(0);
  });
  return ctx.startRendering();
}

/** Phonk clap-snare hybrid: bright noise body + clap transient + tone,
 *  short baked reverb tail, saturated. The half-time backbeat. */
export async function phonkSnare(opts: {
  decay?: number;
  drive?: number;
  wet?: number;
} = {}): Promise<AudioBuffer> {
  const { decay = 0.16, drive = 2.6, wet = 0.4 } = opts;
  const reverbSeconds = 0.55;
  const ctx = offline(decay + reverbSeconds + 0.15);
  const out = driveNode(ctx, drive);
  out.connect(ctx.destination);
  const dry = ctx.createGain();
  dry.gain.value = 0.9;
  dry.connect(out);
  const conv = ctx.createConvolver();
  conv.buffer = reverbIR(ctx, reverbSeconds, 4200);
  const wetG = ctx.createGain();
  wetG.gain.value = wet;
  conv.connect(wetG).connect(out);
  const body = ctx.createBufferSource();
  body.buffer = noiseBuffer(ctx, decay + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 0.55;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.9, 0);
  bg.gain.exponentialRampToValueAtTime(0.001, decay);
  body.connect(bp).connect(bg);
  bg.connect(dry);
  bg.connect(conv);
  for (const at of [0, 0.012]) {
    const burst = ctx.createBufferSource();
    burst.buffer = noiseBuffer(ctx, 0.015);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.015);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    burst.connect(hp).connect(g);
    g.connect(dry);
    g.connect(conv);
    burst.start(at);
  }
  const tone = ctx.createOscillator();
  tone.type = 'triangle';
  tone.frequency.setValueAtTime(210, 0);
  tone.frequency.exponentialRampToValueAtTime(160, 0.06);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.4, 0);
  tg.gain.exponentialRampToValueAtTime(0.001, 0.09);
  tone.connect(tg);
  tg.connect(dry);
  body.start(0);
  tone.start(0);
  return ctx.startRendering();
}

/** Dark string pad holding a full major triad (root + 3rd + 5th baked in),
 *  slow swell, lowpassed — atmosphere, mostly felt not heard. */
export async function padTriad(opts: {
  rootHz: number;
  seconds?: number;
  attack?: number;
}): Promise<AudioBuffer> {
  const { rootHz, seconds = 4.4, attack = 0.5 } = opts;
  const ctx = offline(seconds + 0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.26, attack);
  g.gain.setValueAtTime(0.26, seconds - 0.8);
  g.gain.exponentialRampToValueAtTime(0.001, seconds);
  lp.connect(g).connect(ctx.destination);
  for (const semis of [0, 4, 7]) {
    for (const det of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.16;
      osc.connect(og).connect(lp);
      osc.start(0);
    }
  }
  return ctx.startRendering();
}

/** Sustained detuned drone: two saw layers an octave apart with a slow
 *  swell — the air-raid-siren tension pad. Long buffer, re-attack per use. */
export async function drone(opts: {
  rootHz: number;
  seconds?: number;
  attack?: number;
}): Promise<AudioBuffer> {
  const { rootHz, seconds = 4.5, attack = 0.7 } = opts;
  const ctx = offline(seconds + 0.2);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = rootHz * 1.6;
  bp.Q.value = 0.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.32, attack);
  g.gain.setValueAtTime(0.32, seconds - 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, seconds);
  bp.connect(g).connect(ctx.destination);
  for (const [mult, det] of [
    [1, -7],
    [1, 7],
    [2, -5],
    [2, 5],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = rootHz * mult;
    osc.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = 0.25;
    osc.connect(og).connect(bp);
    osc.start(0);
  }
  return ctx.startRendering();
}

/** Eerie whistle lead: near-sine with vibrato and a touch of detune. */
export async function whistle(opts: {
  rootHz: number;
  decay?: number;
}): Promise<AudioBuffer> {
  const { rootHz, decay = 0.55 } = opts;
  const ctx = offline(decay + 0.1);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = rootHz;
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.5;
  const vibAmt = ctx.createGain();
  vibAmt.gain.value = rootHz * 0.012;
  vib.connect(vibAmt).connect(osc.frequency);
  const shadow = ctx.createOscillator();
  shadow.type = 'sine';
  shadow.frequency.value = rootHz;
  shadow.detune.value = 14; // the out-of-tune unsettle
  const sg = ctx.createGain();
  sg.gain.value = 0.35;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.4, 0.04);
  g.gain.setValueAtTime(0.4, decay * 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  osc.connect(g);
  shadow.connect(sg).connect(g);
  g.connect(ctx.destination);
  osc.start(0);
  vib.start(0);
  shadow.start(0);
  return ctx.startRendering();
}

/** Round fingered funk bass: triangle + sine, quick decay, light warmth. */
export async function funkBass(opts: {
  rootHz: number;
  decay?: number;
  drive?: number;
}): Promise<AudioBuffer> {
  const { rootHz, decay = 0.3, drive = 1.6 } = opts;
  const ctx = offline(decay + 0.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.85, 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, decay);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1300, 0);
  lp.frequency.exponentialRampToValueAtTime(300, decay);
  const shaper = driveNode(ctx, drive);
  lp.connect(g).connect(shaper).connect(ctx.destination);
  const tri = ctx.createOscillator();
  tri.type = 'triangle';
  tri.frequency.value = rootHz;
  const sine = ctx.createOscillator();
  sine.type = 'sine';
  sine.frequency.value = rootHz;
  const sg = ctx.createGain();
  sg.gain.value = 0.6;
  tri.connect(lp);
  sine.connect(sg).connect(lp);
  tri.start(0);
  sine.start(0);
  return ctx.startRendering();
}
