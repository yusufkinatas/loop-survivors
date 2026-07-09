// House kit — the 120 BPM four-on-the-floor voicing of the soundset.
//
// Identity: a punchy 909-lineage drum machine (tight clicky kick on every beat,
// the wide "clay" 909 clap on 2 & 4, crisp offbeat open hats) locked to a warm
// rolling sub-bass that plays only in the kick gaps, bright stabby detuned-saw
// chords, a mellow deep-house Rhodes comp, a rubbery acid bass alternative,
// and sparse synth/vocal hooks over the top. FX is a bright phrase-top crash.
//
// This builder explicitly covers every active role. Dormant prototype roles are
// not returned, so the engine cannot silently fall back to a generic sound for
// something advertised as part of the House catalog.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

export const HOUSE_KIT_ROLES = [
  'kick',
  'clap',
  'hat',
  'rimshot',
  'shaker',
  'crash',
  'bass',
  'acid',
  'chord',
  'rhodes',
  'lead',
  'whistle',
] as const satisfies readonly Role[];

// --- Pulse: the 909-lineage kick ------------------------------------------
// A tight, punchy four-on-the-floor kick. Short pitch sweep into a defined
// ~50 Hz fundamental, a bright click transient (the 909's signature attack),
// moderate decay so it drives without booming, and gentle drive for analog
// warmth. 'soft' (the ghost variant) is the same kick, quieter and rounder.
async function kick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.45);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hard ? 200 : 168, 0);
  body.frequency.exponentialRampToValueAtTime(hard ? 55 : 52, 0.05);
  body.frequency.exponentialRampToValueAtTime(hard ? 49 : 47, 0.2);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(hard ? 1.0 : 0.8, 0);
  bg.gain.exponentialRampToValueAtTime(0.001, hard ? 0.32 : 0.24);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(hard ? 1.9 : 1.4);
  body.connect(bg).connect(drive).connect(ctx.destination);
  // Click: a highpassed noise snap plus a fast pitched beater tick so the
  // attack cuts on small speakers — the crisp front of a 909 kick.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.008);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 2200;
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(hard ? 0.34 : 0.16, 0);
  clickG.gain.exponentialRampToValueAtTime(0.001, 0.008);
  click.connect(clickHp).connect(clickG).connect(ctx.destination);
  const tick = ctx.createOscillator();
  tick.type = 'triangle';
  tick.frequency.setValueAtTime(hard ? 700 : 500, 0);
  tick.frequency.exponentialRampToValueAtTime(190, 0.018);
  const tickG = ctx.createGain();
  tickG.gain.setValueAtTime(hard ? 0.26 : 0.12, 0);
  tickG.gain.exponentialRampToValueAtTime(0.001, 0.022);
  tick.connect(tickG).connect(ctx.destination);
  body.start(0);
  click.start(0);
  tick.start(0);
  tick.stop(0.04);
  return ctx.startRendering();
}

// --- Backbeat: the 909 "clay" clap ----------------------------------------
// The signature house clap: three tight noise bursts (hands not quite in sync)
// through a mid formant, then a longer diffuse tail that gives the clap its
// wide, slightly reverberant 909 "spread". Highpassed so it layers over the
// kick without booming.
async function clap(): Promise<AudioBuffer> {
  const ctx = offline(0.42);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1350;
  bp.Q.value = 1.1;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1000;
  bp.connect(hp).connect(ctx.destination);
  for (const [at, level, dur] of [
    [0, 0.55, 0.011],
    [0.008, 0.62, 0.011],
    [0.018, 0.55, 0.011],
    [0.028, 0.7, 0.19], // diffuse tail — the 909 spread
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

// --- Backbeat: a dry woody rimshot ----------------------------------------
// A tight, bright "tock" for house syncopation — a short square body with a
// fast pitch drop plus a bandpassed noise click. No tail, so it snaps in the
// gaps between the clap without smearing the groove.
async function rim(): Promise<AudioBuffer> {
  const ctx = offline(0.12);
  const tone = ctx.createOscillator();
  tone.type = 'square';
  tone.frequency.setValueAtTime(470, 0);
  tone.frequency.exponentialRampToValueAtTime(320, 0.025);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.45, 0);
  tg.gain.exponentialRampToValueAtTime(0.001, 0.055);
  tone.connect(tg).connect(ctx.destination);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.04);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2700;
  bp.Q.value = 1.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.5, 0);
  ng.gain.exponentialRampToValueAtTime(0.001, 0.04);
  n.connect(bp).connect(ng).connect(ctx.destination);
  tone.start(0);
  n.start(0);
  return ctx.startRendering();
}

// --- Hats: crisp 909 hats -------------------------------------------------
// Metallic inharmonic squares + a bright noise sizzle through a steep highpass.
// Closed snaps shut cleanly (short) so 16th fills stay articulate; open rings
// out ~0.32s — that ringing offbeat open hat is the core house tick.
async function hat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.32 : 0.055;
  const ctx = offline(dur + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.32 : 0.4, 0);
  g.gain.exponentialRampToValueAtTime(open ? 0.05 : 0.001, open ? 0.05 : dur);
  if (open) g.gain.exponentialRampToValueAtTime(0.001, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8600;
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 11500;
  peak.Q.value = 1.3;
  peak.gain.value = 6;
  hp.connect(peak).connect(g).connect(ctx.destination);
  const base = 340;
  for (const mult of [1, 1.34, 1.79, 2.41, 3.17, 4.09]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.value = 0.045;
    o.connect(og).connect(hp);
    o.start(0);
    o.stop(dur);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const ng = ctx.createGain();
  ng.gain.value = 0.5;
  noise.connect(ng).connect(hp);
  noise.start(0);
  return ctx.startRendering();
}

// --- Hats: shaker ---------------------------------------------------------
// A soft "chh" of shaped high noise with a quick grain-rattle envelope — the
// percussion layer that fills the 16ths under the hats without turning to fizz.
async function shaker(): Promise<AudioBuffer> {
  const ctx = offline(0.15);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.13);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 7600;
  bp.Q.value = 1.0;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.1, 0.004);
  g.gain.linearRampToValueAtTime(0.3, 0.018);
  g.gain.exponentialRampToValueAtTime(0.001, 0.095);
  noise.connect(hp).connect(bp).connect(g).connect(ctx.destination);
  noise.start(0);
  return ctx.startRendering();
}

// --- FX: crash ------------------------------------------------------------
// A bright phrase-top cymbal wash: broadband highpassed noise with a shimmering
// pitched metal core and a ~1.3s tail. Choked so repeats never pile into a wash.
async function crash(): Promise<AudioBuffer> {
  const ctx = offline(1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.42, 0.005);
  g.gain.exponentialRampToValueAtTime(0.06, 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, 1.3);
  g.connect(ctx.destination);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.4);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 9500;
  bp.Q.value = 0.4;
  const ng = ctx.createGain();
  ng.gain.value = 0.85;
  n.connect(hp).connect(bp).connect(ng).connect(g);
  const base = 640;
  for (const mult of [1, 1.41, 1.87, 2.53, 3.34, 4.37]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.value = 0.028;
    o.connect(og).connect(g);
    o.start(0);
    o.stop(1.4);
  }
  n.start(0);
  return ctx.startRendering();
}

// --- Bass: the rolling house sub ------------------------------------------
// Two octaves under the root (~55 Hz), warm and round. A saw for harmonic body
// over a clean sine sub, through a resonant lowpass that closes over the note,
// with a punchy amp envelope so it "rolls" and clears fast in the kick gaps —
// it never sustains onto the four-on-the-floor downbeats. 'fat' adds a detuned
// square and more grit for the upper tiers; 'sub' is a deeper, longer round
// note (supplied for completeness, kept out of the downbeat by the chart).
async function bass(rootHz: number, flavor: 'bass' | 'fat' | 'sub'): Promise<AudioBuffer> {
  if (flavor === 'sub') {
    const ctx = offline(0.6);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rootHz / 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, 0);
    g.gain.exponentialRampToValueAtTime(0.9, 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, 0.5);
    osc.connect(g).connect(ctx.destination);
    osc.start(0);
    osc.stop(0.55);
    return ctx.startRendering();
  }
  const fat = flavor === 'fat';
  const ctx = offline(0.5);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz / 4;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(fat ? 1500 : 1150, 0);
  lp.frequency.exponentialRampToValueAtTime(fat ? 170 : 150, fat ? 0.28 : 0.22);
  lp.Q.value = fat ? 4 : 3;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(fat ? 2.6 : 1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(fat ? 0.72 : 0.62, 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, fat ? 0.34 : 0.28); // punchy roll
  const oscG = ctx.createGain();
  oscG.gain.value = fat ? 0.55 : 0.5;
  const subG = ctx.createGain();
  subG.gain.value = 0.6;
  osc.connect(oscG).connect(lp).connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  if (fat) {
    const sq = ctx.createOscillator();
    sq.type = 'square';
    sq.frequency.value = rootHz / 4;
    sq.detune.value = 9;
    const sqG = ctx.createGain();
    sqG.gain.value = 0.3;
    sq.connect(sqG).connect(lp);
    sq.start(0);
    sq.stop(0.45);
  }
  osc.start(0);
  sub.start(0);
  osc.stop(0.45);
  sub.stop(0.45);
  return ctx.startRendering();
}

// --- Bass: the acid alternative -------------------------------------------
// A compact 303-style note: low saw body, a quiet sub octave, and a resonant
// filter sweep that makes the hit say “wow” without turning into a continuous
// alarm. The chart supplies the sliding conversation; this sample stays short
// enough to clear before the next kick.
async function acid(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.38);
  const base = rootHz / 2;
  const body = ctx.createOscillator();
  body.type = 'sawtooth';
  body.frequency.setValueAtTime(base * 1.025, 0);
  body.frequency.exponentialRampToValueAtTime(base, 0.065);
  const sub = ctx.createOscillator();
  sub.type = 'square';
  sub.frequency.setValueAtTime(base / 2, 0);

  const bodyGain = ctx.createGain();
  bodyGain.gain.value = 0.72;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.16;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 11;
  lp.frequency.setValueAtTime(1550, 0);
  lp.frequency.exponentialRampToValueAtTime(190, 0.24);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(2.4);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, 0);
  env.gain.exponentialRampToValueAtTime(0.62, 0.006);
  env.gain.exponentialRampToValueAtTime(0.001, 0.31);

  body.connect(bodyGain).connect(lp);
  sub.connect(subGain).connect(lp);
  lp.connect(drive).connect(env).connect(ctx.destination);
  body.start(0);
  sub.start(0);
  body.stop(0.34);
  sub.stop(0.34);
  return ctx.startRendering();
}

// --- Harmony: the house chord stab ----------------------------------------
// The signature stabby chord: a quartal voicing (root, +5, +10 — stacked
// fourths that stay in the note set when the chart shifts the whole chord to
// the other allowed roots), three detuned saws per note for a bright super-saw
// width, highpassed clear of the bass and lowpassed to a punchy top. 'stab' is
// short and percussive with a fast attack; 'pad' swells slowly and sustains for
// the top-tier held layer under the stabs.
async function chord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const dur = pad ? 1.5 : 0.42;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 1700 : 2900;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = pad ? 240 : 260; // stay above the rolling bass
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.32, pad ? 0.16 : 0.005);
  if (!pad) master.gain.setValueAtTime(0.32, 0.09);
  master.gain.exponentialRampToValueAtTime(0.001, dur);
  lp.connect(hp).connect(master).connect(ctx.destination);
  let vibGain: GainNode | null = null;
  if (pad) {
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 4.5;
    vibGain = ctx.createGain();
    vibGain.gain.value = rootHz * 0.004;
    vib.connect(vibGain);
    vib.start(0);
    vib.stop(dur);
  }
  for (const semis of [0, 5, 10]) {
    for (const detune of [-9, 0, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = detune;
      if (vibGain) vibGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.14;
      osc.connect(g).connect(lp);
      osc.start(0);
      osc.stop(dur);
    }
  }
  return ctx.startRendering();
}

// --- Harmony: deep-house Rhodes -------------------------------------------
// A warm electric-piano comp: a fundamental plus octave body with a bright
// inharmonic "tine" partial and a short mallet bark at the attack. Mellower and
// jazzier than the stab — the deep-house keys voice.
async function rhodes(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.75);
  const partials: [number, number, number, number][] = [
    [1, 0.6, 0.02, 0.66],
    [2, 0.22, 0.015, 0.46],
    [4.2, 0.09, 0.006, 0.26],
    [7.1, 0.045, 0.004, 0.16],
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
  const bark = ctx.createOscillator();
  bark.type = 'triangle';
  bark.frequency.setValueAtTime(rootHz * 6, 0);
  bark.frequency.exponentialRampToValueAtTime(rootHz * 3, 0.04);
  const barkG = ctx.createGain();
  barkG.gain.setValueAtTime(0.16, 0);
  barkG.gain.exponentialRampToValueAtTime(0.001, 0.055);
  bark.connect(barkG).connect(ctx.destination);
  bark.start(0);
  bark.stop(0.08);
  return ctx.startRendering();
}

// --- Melody: the house lead -----------------------------------------------
// A bright singing topline an octave up: a square + detuned saw for body and
// width, a quiet octave-down triangle for weight, through a lowpass that closes
// over the note, with a little drive for presence so it cuts over the band.
async function lead(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = rootHz * 2;
  const osc2 = ctx.createOscillator();
  osc2.type = 'sawtooth';
  osc2.frequency.value = rootHz * 2;
  osc2.detune.value = 9;
  const oscSub = ctx.createOscillator();
  oscSub.type = 'triangle';
  oscSub.frequency.value = rootHz;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(5000, 0);
  lp.frequency.exponentialRampToValueAtTime(1000, 0.4);
  lp.Q.value = 2;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.38, 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, 0.5);
  const g2 = ctx.createGain();
  g2.gain.value = 0.45;
  const gSub = ctx.createGain();
  gSub.gain.value = 0.26;
  osc.connect(lp);
  osc2.connect(g2).connect(lp);
  oscSub.connect(gSub).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  osc.start(0);
  osc2.start(0);
  oscSub.start(0);
  osc.stop(0.55);
  osc2.stop(0.55);
  oscSub.stop(0.55);
  return ctx.startRendering();
}

// --- Melody: a short human-like vocal chop -------------------------------
// A voiced “ah” syllable synthesized from a buzzy vocal-cord source through
// three vowel formants (focused frequency bands shaped like a mouth). A tiny
// breath transient and late vibrato keep it human-like while the short envelope
// lets sparse repetitions read as a chop, not a held whistle.
async function vocalChop(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.48);
  const base = rootHz * 2;
  const sourceBus = ctx.createGain();
  sourceBus.gain.value = 0.55;

  const vibrato = ctx.createOscillator();
  vibrato.type = 'sine';
  vibrato.frequency.value = 5.2;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.setValueAtTime(0.001, 0);
  vibratoDepth.gain.setValueAtTime(0.001, 0.12);
  vibratoDepth.gain.linearRampToValueAtTime(7, 0.24);
  vibrato.connect(vibratoDepth);

  for (const [type, level, detune] of [
    ['sawtooth', 0.7, -4],
    ['triangle', 0.35, 4],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(base * 1.025, 0);
    osc.frequency.exponentialRampToValueAtTime(base, 0.07);
    osc.detune.value = detune;
    vibratoDepth.connect(osc.detune);
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain).connect(sourceBus);
    osc.start(0);
    osc.stop(0.43);
  }

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, 0);
  envelope.gain.linearRampToValueAtTime(0.58, 0.012);
  envelope.gain.setValueAtTime(0.58, 0.12);
  envelope.gain.exponentialRampToValueAtTime(0.001, 0.4);
  envelope.connect(ctx.destination);

  for (const [frequency, level, q] of [
    [780, 1, 7],
    [1150, 0.55, 9],
    [2700, 0.28, 11],
  ] as const) {
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = frequency;
    formant.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = level;
    sourceBus.connect(formant).connect(gain).connect(envelope);
  }

  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuffer(ctx, 0.09);
  const breathBand = ctx.createBiquadFilter();
  breathBand.type = 'bandpass';
  breathBand.frequency.value = 3600;
  breathBand.Q.value = 1.4;
  const breathGain = ctx.createGain();
  breathGain.gain.setValueAtTime(0.1, 0);
  breathGain.gain.exponentialRampToValueAtTime(0.001, 0.075);
  breath.connect(breathBand).connect(breathGain).connect(envelope);

  vibrato.start(0);
  vibrato.stop(0.43);
  breath.start(0);
  return ctx.startRendering();
}

export async function buildHouseKit(rootHz: number): Promise<Map<Role, Kit>> {
  // The chosen bass samples were recorded at C (+3 semitones above the engine's
  // A reference). Render the synth fallbacks at the same root and stamp the
  // whole bass kit with -3 tuning, so sampled bass/fat and synthesized sub stay
  // in tune even if sample loading fails.
  const bassRootHz = rootHz * Math.pow(2, 3 / 12);
  const [
    kickHard,
    kickSoft,
    clapBuf,
    rimBuf,
    hatClosed,
    hatOpen,
    shakerBuf,
    crashBuf,
    bassBuf,
    bassFat,
    bassSub,
    acidBuf,
    stab,
    pad,
    rhodesBuf,
    leadBuf,
    vocalBuf,
  ] = await Promise.all([
    kick(true),
    kick(false),
    clap(),
    rim(),
    hat(false),
    hat(true),
    shaker(),
    crash(),
    bass(bassRootHz, 'bass'),
    bass(bassRootHz, 'fat'),
    bass(bassRootHz, 'sub'),
    acid(rootHz),
    chord(rootHz, false),
    chord(rootHz, true),
    rhodes(rootHz),
    lead(rootHz),
    vocalChop(rootHz),
  ]);

  const kits = new Map<Role, Kit>();
  kits.set('kick', makeKit('kick', new Map([['hard', kickHard], ['soft', kickSoft]])));
  kits.set('clap', makeKit('clap', new Map([['clap', clapBuf]])));
  kits.set('rimshot', makeKit('rimshot', new Map([['rimshot', rimBuf]])));
  kits.set('hat', makeKit('hat', new Map([['closed', hatClosed], ['open', hatOpen]])));
  kits.set('shaker', makeKit('shaker', new Map([['shaker', shakerBuf]])));
  kits.set('crash', makeKit('crash', new Map([['crash', crashBuf]])));
  kits.set(
    'bass',
    makeKit('bass', new Map([['bass', bassBuf], ['fat', bassFat], ['sub', bassSub]]), -3),
  );
  kits.set('acid', makeKit('acid', new Map([['acid', acidBuf]])));
  kits.set('chord', makeKit('chord', new Map([['stab', stab], ['pad', pad]])));
  kits.set('rhodes', makeKit('rhodes', new Map([['rhodes', rhodesBuf]])));
  kits.set('lead', makeKit('lead', new Map([['lead', leadBuf]])));
  kits.set('whistle', makeKit('whistle', new Map([['whistle', vocalBuf]])));
  return kits;
}
