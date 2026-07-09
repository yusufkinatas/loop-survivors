// Sound kits: the atomic unit of a weapon is a kit plus a chart
// (docs/plan.md, "Weapons as sound"). A kit is a small family of related
// samples. M1 ships with synthesized placeholder samples rendered offline at
// startup so the rehearsal room works out of the box; real CC0 pack samples
// are auditioned in the room by loading files over these slots. Pitched kits
// hold one sample at the root and get note variants by playback-rate shifting.

// The catalog of instrument types. Six drums/fx (unpitched) and six pitched
// voices, plus the later hires; the soundset chooses how each is played
// (tempo, swing, patterns).
export type Role =
  | 'kick'
  | 'snare'
  | 'hat'
  | 'bass'
  | 'chord'
  | 'lead'
  | 'clap'
  | 'tom'
  | 'arp'
  | 'crash'
  // The band, sub-phase B — the first damage hires (docs/phases/the-band.md).
  | 'shaker'
  | 'acid'
  | 'pluck'
  | 'rhodes'
  // The band, sub-phase C — the last hires + the auto-dash utility weapon
  // (riser). See docs/phases/the-band.md.
  | 'riser'
  | 'bell';

export const ROLES: readonly Role[] = [
  'kick',
  'snare',
  'hat',
  'clap',
  'tom',
  'crash',
  'bass',
  'chord',
  'arp',
  'lead',
  'shaker',
  'acid',
  'pluck',
  'rhodes',
  'riser',
  'bell',
];

export interface Kit {
  role: Role;
  name: string;
  /** Weapon identity color, shared with the game's visuals later. */
  color: string;
  pitched: boolean;
  /** Monophonic: a new trigger chokes the one still ringing. Keeps long
   *  sample tails from stacking, whatever sample set is active. */
  choke?: boolean;
  /** variant id -> rendered sample. Charts reference variants by id. */
  samples: Map<string, AudioBuffer>;
  defaultVariant: string;
  /** Semitone offset applied to a PITCHED sampled voice so its recorded root
   *  lines up with the engine's A reference (note 0). 0 for synth kits (they
   *  render at the reference already) and for unpitched drums. */
  tune?: number;
}

export const RENDER_RATE = 44100;

/** A mono offline render context of `seconds` length at the render rate.
 *  Exported so the soundset kit builders (src/audio/kits/*) synthesize on the
 *  same clock as the builtin kit. */
export function offline(seconds: number): OfflineAudioContext {
  return new OfflineAudioContext(1, Math.ceil(seconds * RENDER_RATE), RENDER_RATE);
}

/** White-noise buffer used as an excitation source by several drums. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Odd-symmetric soft-clip curve for gentle harmonic saturation. `amount`
 *  sets drive; ~1 is nearly clean, higher values add warmth/grit. */
export function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = Math.max(0.001, amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return curve;
}

async function renderKick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  // Body: a fast pitch-swept sine gives the "thud", landing on a defined
  // fundamental instead of sagging. A two-stage drop keeps the top punchy.
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hard ? 210 : 150, 0);
  body.frequency.exponentialRampToValueAtTime(hard ? 58 : 50, 0.045);
  body.frequency.exponentialRampToValueAtTime(hard ? 46 : 42, 0.16);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(hard ? 1.0 : 0.82, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, hard ? 0.4 : 0.3);
  // Light saturation keeps the kick present on small speakers without
  // muddying the sub.
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(hard ? 2.2 : 1.4);
  body.connect(bodyGain).connect(drive).connect(ctx.destination);
  // Click transient: a short highpassed noise burst plus a fast pitched
  // "beater" tick, so the attack has both a snap and a defined pitch.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.01);
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(hard ? 0.4 : 0.18, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.01);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 1800;
  click.connect(clickHp).connect(clickGain).connect(ctx.destination);
  const tick = ctx.createOscillator();
  tick.type = 'triangle';
  tick.frequency.setValueAtTime(hard ? 640 : 420, 0);
  tick.frequency.exponentialRampToValueAtTime(180, 0.02);
  const tickGain = ctx.createGain();
  tickGain.gain.setValueAtTime(hard ? 0.28 : 0.12, 0);
  tickGain.gain.exponentialRampToValueAtTime(0.001, 0.025);
  tick.connect(tickGain).connect(ctx.destination);
  body.start(0);
  click.start(0);
  tick.start(0);
  tick.stop(0.04);
  return ctx.startRendering();
}

async function renderSnare(): Promise<AudioBuffer> {
  const ctx = offline(0.3);
  // Snap: a bright, fast-decaying noise band that gives the initial crack.
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.12);
  const snapHp = ctx.createBiquadFilter();
  snapHp.type = 'highpass';
  snapHp.frequency.value = 1400;
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.7, 0);
  snapGain.gain.exponentialRampToValueAtTime(0.001, 0.055);
  snap.connect(snapHp).connect(snapGain).connect(ctx.destination);
  // Body/rattle: a wider mid noise band that sustains a touch longer — the
  // "wires" ringing. Bandpass keeps it from turning into white fizz.
  const rattle = ctx.createBufferSource();
  rattle.buffer = noiseBuffer(ctx, 0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 0.5;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.42, 0);
  nGain.gain.exponentialRampToValueAtTime(0.001, 0.17);
  rattle.connect(bp).connect(nGain).connect(ctx.destination);
  // Tonal shell: two triangle partials give the drum a pitched "thwack" body.
  for (const [f, level, dec] of [
    [185, 0.5, 0.11],
    [278, 0.22, 0.08],
  ] as const) {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(f * 1.25, 0);
    tone.frequency.exponentialRampToValueAtTime(f, 0.05);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(level, 0);
    tGain.gain.exponentialRampToValueAtTime(0.001, dec);
    tone.connect(tGain).connect(ctx.destination);
    tone.start(0);
    tone.stop(dec + 0.02);
  }
  snap.start(0);
  rattle.start(0);
  return ctx.startRendering();
}

async function renderClap(): Promise<AudioBuffer> {
  const ctx = offline(0.35);
  // Two-band shaping: a bandpass gives the hand-clap "smack" formant, and a
  // gentle highpass keeps it from booming when it layers over the snare.
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1650;
  bp.Q.value = 1.0;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900;
  bp.connect(hp).connect(ctx.destination);
  // Four tight reflections (hands not perfectly in sync) then a diffuse tail.
  for (const [at, level, dur] of [
    [0, 0.55, 0.011],
    [0.009, 0.6, 0.011],
    [0.02, 0.55, 0.011],
    [0.032, 0.7, 0.2],
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

async function renderShaker(): Promise<AudioBuffer> {
  // Soft "chh" sizzle, the hi-hat's smoother cousin: shaped noise, gentler
  // attack and a softer high band than the hat.
  const ctx = offline(0.16);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.14);
  // A highpass under the bandpass strips any low grit so the "chh" sits high
  // and clean; the bandpass gives it a focused sizzle band instead of flat
  // white noise, so stacked shakers/hats don't turn to fizz.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3500;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 7200;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  // Slight swell into the peak then a quick fall = the grain-rattle envelope of
  // a real shaker, crisper than a flat noise burst.
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.12, 0.004);
  g.gain.linearRampToValueAtTime(0.34, 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, 0.1);
  noise.connect(hp).connect(bp).connect(g).connect(ctx.destination);
  noise.start(0);
  return ctx.startRendering();
}

async function renderAcid(rootHz: number): Promise<AudioBuffer> {
  // Squelchy rubbery 303-style blip: a sawtooth through a resonant lowpass
  // that sweeps down — the slidey, vocal Motion voice.
  const ctx = offline(0.34);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 15; // high resonance = the vocal "wow" squelch
  lp.frequency.setValueAtTime(rootHz * 7, 0);
  lp.frequency.exponentialRampToValueAtTime(rootHz * 1.1, 0.22);
  // Post-filter saturation makes the resonant peak scream and adds the gritty
  // harmonics that make a 303 sound alive rather than clinical.
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(3.0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.45, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.3);
  osc.connect(lp).connect(drive).connect(g).connect(ctx.destination);
  osc.start(0);
  osc.stop(0.32);
  return ctx.startRendering();
}

async function renderPluck(rootHz: number): Promise<AudioBuffer> {
  // Round short "bomp": a picked upright-bass note — triangle body with a fast
  // pluck attack and a quick round decay.
  const ctx = offline(0.4);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(rootHz / 2, 0);
  osc.frequency.exponentialRampToValueAtTime(rootHz / 2.15, 0.1);
  // A brief saw doubling adds string harmonics only at the very start (the
  // "pick" bite), then the triangle body carries the round tone.
  const bite = ctx.createOscillator();
  bite.type = 'sawtooth';
  bite.frequency.value = rootHz / 2;
  const biteG = ctx.createGain();
  biteG.gain.setValueAtTime(0.3, 0);
  biteG.gain.exponentialRampToValueAtTime(0.001, 0.05);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600, 0);
  lp.frequency.exponentialRampToValueAtTime(700, 0.12); // filter closes -> rounds off
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.8, 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, 0.3);
  osc.connect(lp);
  bite.connect(biteG).connect(lp);
  lp.connect(g).connect(ctx.destination);
  // Finger-pluck noise transient so the note has physical contact.
  const pl = ctx.createBufferSource();
  pl.buffer = noiseBuffer(ctx, 0.012);
  const plHp = ctx.createBiquadFilter();
  plHp.type = 'highpass';
  plHp.frequency.value = 1200;
  const plG = ctx.createGain();
  plG.gain.setValueAtTime(0.12, 0);
  plG.gain.exponentialRampToValueAtTime(0.001, 0.012);
  pl.connect(plHp).connect(plG).connect(ctx.destination);
  osc.start(0);
  bite.start(0);
  bite.stop(0.08);
  pl.start(0);
  osc.stop(0.36);
  return ctx.startRendering();
}

async function renderRhodes(rootHz: number): Promise<AudioBuffer> {
  // Warm bell-like electric-piano tone: a fundamental plus a soft bell partial,
  // gentle attack, medium decay — warm keys color.
  const ctx = offline(0.8);
  // Partials: fundamental + octave give the warm body; a bright inharmonic
  // partial adds the metallic "tine" shimmer. Each partial gets its own decay
  // so the bright content fades first (the classic Rhodes mellowing tail).
  const partials: [number, number, number, number][] = [
    [1, 0.6, 0.02, 0.7], // fundamental, warm, long
    [2, 0.24, 0.015, 0.5],
    [4.2, 0.1, 0.006, 0.3], // tine shimmer, quick
    [7.1, 0.05, 0.004, 0.18], // faint high sparkle
  ];
  for (const [mult, level, atk, dec] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rootHz * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(level, atk);
    g.gain.exponentialRampToValueAtTime(0.001, dec);
    osc.connect(g).connect(ctx.destination);
    osc.start(0);
    osc.stop(dec + 0.02);
  }
  // Tine "bark": a short, bright FM-ish blip at the attack — the percussive
  // knock of the hammer on the tine that gives a Rhodes its voice.
  const bark = ctx.createOscillator();
  bark.type = 'triangle';
  bark.frequency.setValueAtTime(rootHz * 6, 0);
  bark.frequency.exponentialRampToValueAtTime(rootHz * 3, 0.04);
  const barkG = ctx.createGain();
  barkG.gain.setValueAtTime(0.18, 0);
  barkG.gain.exponentialRampToValueAtTime(0.001, 0.06);
  bark.connect(barkG).connect(ctx.destination);
  bark.start(0);
  bark.stop(0.08);
  return ctx.startRendering();
}

async function renderRiser(): Promise<AudioBuffer> {
  // Reversed-cymbal swell that builds and lifts: filtered noise whose gain
  // ramps UP into a cut and whose bandpass sweeps up, so it anticipates the
  // downbeat. FX/Transition punctuation — the auto-dash's wind-up.
  const dur = 0.85;
  const ctx = offline(dur + 0.05);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(600, 0);
  bp.frequency.exponentialRampToValueAtTime(9000, dur); // rising sweep
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, dur * 0.92); // swells to the top
  g.gain.exponentialRampToValueAtTime(0.001, dur); // then cut on the hit
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

async function renderBell(rootHz: number): Promise<AudioBuffer> {
  // Twinkly music-box ping: a sine fundamental plus bright inharmonic bell
  // partials (1, 2.76, 5.4, 8.1) with a fast attack and a shimmering decay.
  const ctx = offline(0.9);
  // Inharmonic partials (music-box/tubular-bell ratios) with a strong, fast
  // fundamental and progressively quieter, shorter overtones so it shimmers
  // and clears quickly instead of ringing into mud in fast passages.
  const partials: [number, number, number][] = [
    [1, 0.55, 0.8],
    [2.76, 0.26, 0.5],
    [5.4, 0.13, 0.32],
    [8.1, 0.07, 0.2],
  ];
  for (const [mult, level, dec] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rootHz * 2 * mult; // an octave up: the sparkly top voice
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(level, 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, dec);
    o.connect(g).connect(ctx.destination);
    o.start(0);
    o.stop(dec + 0.02);
  }
  // Soft mallet strike: a tiny highpassed noise tick gives the "chime" its
  // touch of physical contact so it reads as struck, not pure sine.
  const strike = ctx.createBufferSource();
  strike.buffer = noiseBuffer(ctx, 0.008);
  const shp = ctx.createBiquadFilter();
  shp.type = 'highpass';
  shp.frequency.value = 5000;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.12, 0);
  sg.gain.exponentialRampToValueAtTime(0.001, 0.008);
  strike.connect(shp).connect(sg).connect(ctx.destination);
  strike.start(0);
  return ctx.startRendering();
}

async function renderHat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.34 : 0.06;
  const ctx = offline(dur + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.34 : 0.42, 0);
  // Fast initial decay then a shorter tail; closed hats snap shut cleanly so
  // rolling 16ths at high tempo stay articulate instead of smearing.
  g.gain.exponentialRampToValueAtTime(open ? 0.05 : 0.001, open ? 0.06 : dur);
  if (open) g.gain.exponentialRampToValueAtTime(0.001, dur);
  // A steep highpass plus a peaking notch shapes the metallic character and
  // stops several hats from stacking into flat white fizz.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8200;
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 11000;
  peak.Q.value = 1.2;
  peak.gain.value = 6;
  hp.connect(peak).connect(g).connect(ctx.destination);
  // Metallic ring: six inharmonic squares (the classic 808/909 hat recipe)
  // give the closed hi-hat a real "tick" pitch instead of pure noise.
  const base = 320;
  for (const mult of [1, 1.34, 1.79, 2.41, 3.17, 4.09]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.value = 0.05;
    o.connect(og).connect(hp);
    o.start(0);
    o.stop(dur);
  }
  // A little filtered noise for air/sizzle.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const nGain = ctx.createGain();
  nGain.gain.value = 0.5;
  noise.connect(nGain).connect(hp);
  noise.start(0);
  return ctx.startRendering();
}

async function renderBass(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.7);
  // Timbre: a saw for harmonic body (sits in the mids, distinct from the
  // kick's pure-sine sub) plus a clean sine sub for weight. The saw runs
  // through a resonant lowpass that closes over the note so fast lines stay
  // tight, then light saturation adds a rounded, "played" warmth.
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz / 4; // two octaves under the root reference
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1100, 0);
  lp.frequency.exponentialRampToValueAtTime(140, 0.4);
  lp.Q.value = 3;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.6, 0.012);
  g.gain.setValueAtTime(0.6, 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, 0.65);
  const subG = ctx.createGain();
  subG.gain.value = 0.55;
  osc.connect(lp).connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  osc.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// Chord voicing is quartal (root, +5, +10 semitones). Stacked fourths from a
// minor-pentatonic root stay inside the note set when the chart shifts the
// whole sample to the other allowed chord roots (0, +5, +7), which a triad
// would not.
// The bass ladder's weight variants (M2 spec: "fatter variants, and a
// designed top-tier peak"). "Fat" is the same line with more grit and a
// slower filter close; "sub" is the once-per-phrase tier-4 drop, a long
// pitch-falling sine that lands like a weight hitting the floor.
async function renderBassFat(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.8);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz / 4;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = rootHz / 4;
  osc2.detune.value = 9;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1400, 0);
  lp.frequency.exponentialRampToValueAtTime(110, 0.65);
  lp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.85, 0.012);
  g.gain.setValueAtTime(0.85, 0.45);
  g.gain.exponentialRampToValueAtTime(0.001, 0.75);
  const oscG = ctx.createGain();
  oscG.gain.value = 0.6;
  const osc2G = ctx.createGain();
  osc2G.gain.value = 0.35;
  const subG = ctx.createGain();
  subG.gain.value = 0.65;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(2.8); // more grit than the plain bass
  osc.connect(oscG).connect(lp);
  osc2.connect(osc2G).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  osc.start(0);
  osc2.start(0);
  sub.start(0);
  return ctx.startRendering();
}

async function renderBassSub(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.4);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rootHz / 2, 0);
  osc.frequency.exponentialRampToValueAtTime(rootHz / 8, 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.9, 0.01);
  g.gain.setValueAtTime(0.9, 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, 1.3);
  // a short click so the drop has an attack that survives small speakers
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.01);
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.25, 0);
  clickG.gain.exponentialRampToValueAtTime(0.001, 0.01);
  osc.connect(g).connect(ctx.destination);
  click.connect(clickG).connect(ctx.destination);
  osc.start(0);
  click.start(0);
  return ctx.startRendering();
}

async function renderChord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const dur = pad ? 1.6 : 0.5;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 1800 : 2600;
  // Highpass keeps the chord out of the bass/kick's territory so the low end
  // stays clean when the full band plays.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = pad ? 220 : 180;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.32, pad ? 0.18 : 0.006);
  master.gain.exponentialRampToValueAtTime(0.001, dur);
  lp.connect(hp).connect(master).connect(ctx.destination);
  // The pad breathes with a slow shared vibrato; the stab stays static/punchy.
  let vibGain: GainNode | null = null;
  if (pad) {
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 4.5;
    vibGain = ctx.createGain();
    vibGain.gain.value = rootHz * 0.004;
    vib.connect(vibGain);
    vib.start(0);
  }
  // Three detune voices per note widen the chord (super-saw style) for warmth.
  for (const semis of [0, 5, 10]) {
    for (const detune of [-8, 0, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = detune;
      if (vibGain) vibGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.15;
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
  // A quiet octave-down sine fills the body so the lead has weight and cuts
  // through the band instead of sounding thin and buzzy.
  const oscSub = ctx.createOscillator();
  oscSub.type = 'triangle';
  oscSub.frequency.value = rootHz;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4800, 0);
  lp.frequency.exponentialRampToValueAtTime(900, 0.4);
  lp.Q.value = 2;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.5); // a little edge/presence
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.38, 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, 0.55);
  const g2 = ctx.createGain();
  g2.gain.value = 0.45;
  const gSub = ctx.createGain();
  gSub.gain.value = 0.28;
  osc.connect(lp);
  osc2.connect(g2).connect(lp);
  oscSub.connect(gSub).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  osc.start(0);
  osc2.start(0);
  oscSub.start(0);
  return ctx.startRendering();
}

// A pitched mid-drum. Sine+triangle body with a short pitch drop and a noise
// attack, so a tom melody (fills, fast rolls) reads as pitched but hits
// like a drum. note 0 sits at the run root.
async function renderTom(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const base = rootHz;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(base * 1.5, 0);
  osc.frequency.exponentialRampToValueAtTime(base * 0.92, 0.13);
  const tri = ctx.createOscillator();
  tri.type = 'triangle';
  tri.frequency.setValueAtTime(base * 1.5, 0);
  tri.frequency.exponentialRampToValueAtTime(base * 0.92, 0.13);
  const triG = ctx.createGain();
  triG.gain.value = 0.3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.5);
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.02);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.2, 0);
  cg.gain.exponentialRampToValueAtTime(0.001, 0.02);
  osc.connect(g);
  tri.connect(triG).connect(g);
  g.connect(ctx.destination);
  click.connect(cg).connect(ctx.destination);
  osc.start(0);
  tri.start(0);
  click.start(0);
  return ctx.startRendering();
}

// A bright plucky synth stab, an octave up: square+saw through a fast-closing
// lowpass. The arpeggio/pluck voice.
async function renderArp(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.4);
  const base = rootHz * 2;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = base;
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = base;
  o2.detune.value = 6;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(5200, 0);
  lp.frequency.exponentialRampToValueAtTime(900, 0.18);
  lp.Q.value = 2.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.45, 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, 0.33);
  const o2g = ctx.createGain();
  o2g.gain.value = 0.5;
  o.connect(lp);
  o2.connect(o2g).connect(lp);
  lp.connect(g).connect(ctx.destination);
  o.start(0);
  o2.start(0);
  return ctx.startRendering();
}

// A cymbal crash: bright filtered white noise with a long tail. Choked so
// repeated crashes don't stack into a wash.
async function renderCrash(): Promise<AudioBuffer> {
  const ctx = offline(1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.45, 0.005);
  g.gain.exponentialRampToValueAtTime(0.06, 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, 1.35);
  g.connect(ctx.destination);
  // Noise wash: the broadband roar of the cymbal.
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.5);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4500;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 9000;
  bp.Q.value = 0.4;
  const nGain = ctx.createGain();
  nGain.gain.value = 0.85;
  n.connect(hp).connect(bp).connect(nGain).connect(g);
  // Inharmonic metal partials give the crash a shimmering pitched core so it
  // reads as a struck cymbal, not just filtered noise.
  const base = 620;
  for (const mult of [1, 1.41, 1.87, 2.53, 3.34, 4.37]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.value = 0.03;
    o.connect(og).connect(g);
    o.start(0);
    o.stop(1.5);
  }
  n.start(0);
  return ctx.startRendering();
}

/** Canonical identity of each role: its display name, color, pitched/choke
 *  behavior, and the sample-variant ids charts may reference. The soundset kit
 *  re-voices a role by supplying different BUFFERS for these same variant ids
 *  (src/audio/kits/*); the identity stays fixed so charts and visuals keep
 *  working. This is the single source of truth — buildKits and the soundset kit
 *  both stamp their kits from it. */
export interface RoleMeta {
  name: string;
  color: string;
  pitched: boolean;
  choke: boolean;
  /** Chartable variant ids, defaultVariant first. */
  variants: string[];
}

export const ROLE_META: Record<Role, RoleMeta> = {
  kick: { name: 'Kick', color: '#ff5a3c', pitched: false, choke: false, variants: ['hard', 'soft'] },
  snare: { name: 'Snare', color: '#ffc93c', pitched: false, choke: false, variants: ['snare', 'clap'] },
  hat: { name: 'Hi-hat', color: '#3ce0ff', pitched: false, choke: false, variants: ['closed', 'open'] },
  bass: { name: 'Bass', color: '#a06bff', pitched: true, choke: true, variants: ['bass', 'fat', 'sub'] },
  chord: { name: 'Chord', color: '#4dff88', pitched: true, choke: false, variants: ['stab', 'pad'] },
  lead: { name: 'Lead', color: '#ff6bd6', pitched: true, choke: false, variants: ['lead'] },
  clap: { name: 'Clap', color: '#ff4f7d', pitched: false, choke: false, variants: ['clap'] },
  tom: { name: 'Tom', color: '#d08a4a', pitched: true, choke: true, variants: ['tom'] },
  arp: { name: 'Arp', color: '#33e6c2', pitched: true, choke: false, variants: ['arp'] },
  crash: { name: 'Crash', color: '#b9c2dd', pitched: false, choke: true, variants: ['crash'] },
  shaker: { name: 'Shaker', color: '#7be0d0', pitched: false, choke: false, variants: ['shaker'] },
  acid: { name: 'Acid', color: '#b6ff5a', pitched: true, choke: false, variants: ['acid'] },
  pluck: { name: 'Pluck Bass', color: '#8f7bff', pitched: true, choke: true, variants: ['pluck'] },
  rhodes: { name: 'Rhodes', color: '#5ad1ff', pitched: true, choke: false, variants: ['rhodes'] },
  riser: { name: 'Riser', color: '#cbb4ff', pitched: false, choke: true, variants: ['riser'] },
  bell: { name: 'Bell', color: '#ffd76b', pitched: true, choke: false, variants: ['bell'] },
};

/** Load a real sample file and decode it. The files are pre-corrected at build
 *  time (scripts/build-samples.mjs: ffmpeg strips silence, caps length, fades
 *  the tail, and peak-normalizes), so the runtime just plays them — no trimming
 *  or level fixing in code. The fix lives in the asset, not the game. */
export async function loadSample(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sample ${url}: ${res.status}`);
  return offline(0.05).decodeAudioData(await res.arrayBuffer());
}

/** Stamp a role's canonical identity (ROLE_META) onto a set of rendered
 *  buffers. The soundset kit and buildKits both assemble their kits through
 *  this, so a "kick" is always a kick (name/color/choke/defaultVariant)
 *  whatever buffers it was given. `samples` must include the defaultVariant. */
export function makeKit(role: Role, samples: Map<string, AudioBuffer>, tune = 0): Kit {
  const meta = ROLE_META[role];
  const defaultVariant = meta.variants.find((v) => samples.has(v)) ?? samples.keys().next().value!;
  return {
    role,
    name: meta.name,
    color: meta.color,
    pitched: meta.pitched,
    choke: meta.choke,
    samples,
    defaultVariant,
    tune,
  };
}

/** Render every builtin kit. Called once at startup. This is the default kit:
 *  the rehearsal room's palette and the fallback voicing for any role the
 *  soundset kit does not override. */
export async function buildKits(rootHz: number): Promise<Map<Role, Kit>> {
  const [
    kickHard,
    kickSoft,
    snare,
    clap,
    hatClosed,
    hatOpen,
    bass,
    bassFat,
    bassSub,
    stab,
    pad,
    lead,
    tom,
    arp,
    crash,
    shaker,
    acid,
    pluck,
    rhodes,
    riser,
    bell,
  ] = await Promise.all([
    renderKick(true),
    renderKick(false),
    renderSnare(),
    renderClap(),
    renderHat(false),
    renderHat(true),
    renderBass(rootHz),
    renderBassFat(rootHz),
    renderBassSub(rootHz),
    renderChord(rootHz, false),
    renderChord(rootHz, true),
    renderLead(rootHz),
    renderTom(rootHz),
    renderArp(rootHz),
    renderCrash(),
    renderShaker(),
    renderAcid(rootHz),
    renderPluck(rootHz),
    renderRhodes(rootHz),
    renderRiser(),
    renderBell(rootHz),
  ]);

  const kits = new Map<Role, Kit>();
  const add = (role: Role, entries: [string, AudioBuffer][]) => {
    kits.set(role, makeKit(role, new Map(entries)));
  };

  add('kick', [
    ['hard', kickHard],
    ['soft', kickSoft],
  ]);
  add('snare', [
    ['snare', snare],
    ['clap', clap], // auditionable in the room, never charted
  ]);
  add('hat', [
    ['closed', hatClosed],
    ['open', hatOpen],
  ]);
  add('bass', [
    ['bass', bass],
    ['fat', bassFat], // tier 3+ weight
    ['sub', bassSub], // tier 4 once-per-phrase drop
  ]);
  add('chord', [
    ['stab', stab],
    ['pad', pad],
  ]);
  add('lead', [['lead', lead]]);
  add('clap', [['clap', clap]]);
  add('tom', [['tom', tom]]);
  add('arp', [['arp', arp]]);
  add('crash', [['crash', crash]]);
  add('shaker', [['shaker', shaker]]);
  add('acid', [['acid', acid]]);
  add('pluck', [['pluck', pluck]]);
  add('rhodes', [['rhodes', rhodes]]);
  add('riser', [['riser', riser]]);
  add('bell', [['bell', bell]]);
  return kits;
}
