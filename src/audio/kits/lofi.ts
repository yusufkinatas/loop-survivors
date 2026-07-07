// Lo-Fi kit: the dusty, vinyl-warm voicing of the soundset. Slow swung boom-bap
// (84 BPM, swing 0.34). Every voice is deliberately DARK and SOFT — highs rolled
// off, attacks rounded, gentle tape-style saturation instead of grit, and a slow
// "wow" detune wobble on the sustained pitched voices to sell worn-tape warmth.
//
// Supported set (11 roles): kick, snare, rimshot (Backbeat), hat, shaker (Hats),
// bass, pluck (Bass), rhodes, chord, choir (Harmony — the genre leans here), and
// bell (Melody). Dropped as un-lo-fi: the clinical/aggressive Motion (acid,
// cowbell, arp) and FX (zap, crash, riser) slots, plus buzzy lead/whistle, reese,
// tom, heartbeat, ride, clap.
//
// Mix plan (why the full band stays clean):
//   - Sub (~45-60 Hz): the kick alone. Nothing else lives here.
//   - Low-mid (~100-130 Hz): the upright bass / pluck, rendered at rootHz/2 so
//     its fundamental sits an octave above the kick's sub — no muddy collision.
//   - Mids (~200-2600 Hz, lowpassed): Rhodes, chord, choir. Highpassed off the
//     bass so they never fight the low end.
//   - Highs (rolled off ~5-12 kHz): hats/shaker/bell, all darkened so nothing
//     reads bright-aggressive. Vinyl-warm throughout.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

// ---------------------------------------------------------------------------
// Pulse — kick
// ---------------------------------------------------------------------------

// Soft, round, muffled thud. No bright click at all (the builtin's 1.8 kHz noise
// snap and 640 Hz beater tick are gone) — instead a pillowy low sine body under
// a heavy 220 Hz lowpass, plus a dark lowpassed beater "bump" for a felt attack.
// 'hard' is a touch louder and fuller; 'soft' is a rounder ghost thump.
async function lofiKick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hard ? 118 : 100, 0);
  body.frequency.exponentialRampToValueAtTime(hard ? 50 : 46, 0.08);
  body.frequency.exponentialRampToValueAtTime(hard ? 44 : 41, 0.22);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(hard ? 0.95 : 0.72, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, hard ? 0.42 : 0.32);
  // Gentle round saturation (tape warmth), not grit.
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.3);
  // Dusty muffle: kill everything above the low body so there is zero click edge.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  lp.Q.value = 0.7;
  body.connect(bodyGain).connect(drive).connect(lp).connect(ctx.destination);
  // Felt beater: a very soft, dark triangle bump for physical contact — still
  // lowpassed so it thumps rather than clicks.
  const beat = ctx.createOscillator();
  beat.type = 'triangle';
  beat.frequency.setValueAtTime(hard ? 175 : 150, 0);
  beat.frequency.exponentialRampToValueAtTime(85, 0.03);
  const beatG = ctx.createGain();
  beatG.gain.setValueAtTime(hard ? 0.12 : 0.07, 0);
  beatG.gain.exponentialRampToValueAtTime(0.001, 0.045);
  const beatLp = ctx.createBiquadFilter();
  beatLp.type = 'lowpass';
  beatLp.frequency.value = 520;
  beat.connect(beatG).connect(beatLp).connect(ctx.destination);
  body.start(0);
  beat.start(0);
  beat.stop(0.07);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Backbeat — snare + rimshot
// ---------------------------------------------------------------------------

// Dusty, soft, boxy snare. A boom-bap snare is full and warm with a muted crack:
// low tonal body around 180 Hz, a mid noise "brush" band (centred ~1.9 kHz, far
// darker than the builtin's 3.2 kHz fizz), and a master lowpass at 3.8 kHz that
// rolls the top off so it reads dusty, never crisp.
async function lofiSnare(): Promise<AudioBuffer> {
  const ctx = offline(0.35);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3800;
  lp.Q.value = 0.6;
  lp.connect(ctx.destination);
  // Tonal shell — warm boxy body, quick pitch settle.
  for (const [f, level, dec] of [
    [180, 0.5, 0.13],
    [244, 0.2, 0.09],
  ] as const) {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(f * 1.2, 0);
    tone.frequency.exponentialRampToValueAtTime(f, 0.045);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(level, 0);
    tGain.gain.exponentialRampToValueAtTime(0.001, dec);
    tone.connect(tGain).connect(lp);
    tone.start(0);
    tone.stop(dec + 0.02);
  }
  // Wire rattle: a darker mid noise band, medium decay.
  const rattle = ctx.createBufferSource();
  rattle.buffer = noiseBuffer(ctx, 0.25);
  const rhp = ctx.createBiquadFilter();
  rhp.type = 'highpass';
  rhp.frequency.value = 280;
  const rbp = ctx.createBiquadFilter();
  rbp.type = 'bandpass';
  rbp.frequency.value = 1900;
  rbp.Q.value = 0.7;
  const rGain = ctx.createGain();
  rGain.gain.setValueAtTime(0.4, 0);
  rGain.gain.exponentialRampToValueAtTime(0.001, 0.14);
  rattle.connect(rhp).connect(rbp).connect(rGain).connect(lp);
  rattle.start(0);
  // Soft snap: a short, gently highpassed tick for the initial dusty crack.
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.06);
  const shp = ctx.createBiquadFilter();
  shp.type = 'highpass';
  shp.frequency.value = 1200;
  const sGain = ctx.createGain();
  sGain.gain.setValueAtTime(0.32, 0);
  sGain.gain.exponentialRampToValueAtTime(0.001, 0.05);
  snap.connect(shp).connect(sGain).connect(lp);
  snap.start(0);
  return ctx.startRendering();
}

// Dry woody cross-stick "tock": the lazy answering hit on the off-counts. A
// short low wood tone plus a quiet higher ring and a small dark click — no tail.
async function lofiRimshot(): Promise<AudioBuffer> {
  const ctx = offline(0.2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  lp.connect(ctx.destination);
  // Wood body.
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(400, 0);
  body.frequency.exponentialRampToValueAtTime(360, 0.03);
  const bodyG = ctx.createGain();
  bodyG.gain.setValueAtTime(0.5, 0);
  bodyG.gain.exponentialRampToValueAtTime(0.001, 0.07);
  body.connect(bodyG).connect(lp);
  // Higher woody ring for the "tock" bite.
  const ring = ctx.createOscillator();
  ring.type = 'square';
  ring.frequency.value = 1050;
  const ringG = ctx.createGain();
  ringG.gain.setValueAtTime(0.14, 0);
  ringG.gain.exponentialRampToValueAtTime(0.001, 0.035);
  ring.connect(ringG).connect(lp);
  // Small dark click.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.015);
  const chp = ctx.createBiquadFilter();
  chp.type = 'bandpass';
  chp.frequency.value = 1800;
  chp.Q.value = 1.4;
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.28, 0);
  clickG.gain.exponentialRampToValueAtTime(0.001, 0.015);
  click.connect(chp).connect(clickG).connect(lp);
  body.start(0);
  ring.start(0);
  ring.stop(0.05);
  click.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Hats — hat + shaker
// ---------------------------------------------------------------------------

// Soft, dusty hat. Darker than the builtin: highpass at 6.5 kHz (vs 8.2), a
// 12 kHz lowpass to shave the harsh top, fewer/quieter metallic partials on a
// lower base, and a softer noise bed. Reads warm and closed, never sizzly.
async function lofiHat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.26 : 0.05;
  const ctx = offline(dur + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.24 : 0.3, 0);
  g.gain.exponentialRampToValueAtTime(open ? 0.05 : 0.001, open ? 0.06 : dur);
  if (open) g.gain.exponentialRampToValueAtTime(0.001, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  // Roll off the very top so stacked hats stay warm, not fizzy.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 12000;
  hp.connect(lp).connect(g).connect(ctx.destination);
  const base = 280;
  for (const mult of [1, 1.34, 1.79, 2.41]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.value = 0.035;
    o.connect(og).connect(hp);
    o.start(0);
    o.stop(dur);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const nGain = ctx.createGain();
  nGain.gain.value = 0.4;
  noise.connect(nGain).connect(hp);
  noise.start(0);
  return ctx.startRendering();
}

// Soft warm shaker "chh": a focused mid-high noise band (bandpass ~6 kHz, below
// the hat's sizzle) with a gentle swell-and-fall grain envelope.
async function lofiShaker(): Promise<AudioBuffer> {
  const ctx = offline(0.15);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.13);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2800;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 6000;
  bp.Q.value = 1.1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 9500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.1, 0.004);
  g.gain.linearRampToValueAtTime(0.28, 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, 0.1);
  noise.connect(hp).connect(bp).connect(lp).connect(g).connect(ctx.destination);
  noise.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Bass — upright bass + pluck
// ---------------------------------------------------------------------------

// Warm round upright bass, rendered at rootHz/2 (~110 Hz) so its fundamental
// sits an octave ABOVE the kick's sub — the two never mask. Triangle body (not
// a buzzy saw) plus a sine reinforcement, a lowpass that closes over the note to
// round the top off, and light tape saturation. 'fat' adds a low saw for a
// touch more harmonic body and rings a little longer for the maxed tiers.
async function lofiBass(fat: boolean, rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(fat ? 0.8 : 0.7);
  const base = rootHz / 2;
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.value = base;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = base;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(fat ? 1000 : 820, 0);
  lp.frequency.exponentialRampToValueAtTime(fat ? 300 : 340, fat ? 0.5 : 0.4);
  lp.Q.value = 2;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(fat ? 1.6 : 1.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(fat ? 0.72 : 0.6, 0.014);
  g.gain.setValueAtTime(fat ? 0.72 : 0.6, fat ? 0.42 : 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, fat ? 0.75 : 0.64);
  const bodyG = ctx.createGain();
  bodyG.gain.value = 0.55;
  const subG = ctx.createGain();
  subG.gain.value = 0.5;
  body.connect(bodyG).connect(lp);
  sub.connect(subG).connect(g); // sub bypasses the drive to stay clean
  lp.connect(drive).connect(g).connect(ctx.destination);
  body.start(0);
  sub.start(0);
  if (fat) {
    const growl = ctx.createOscillator();
    growl.type = 'sawtooth';
    growl.frequency.value = base;
    growl.detune.value = 5;
    const growlG = ctx.createGain();
    growlG.gain.value = 0.16;
    growl.connect(growlG).connect(lp);
    growl.start(0);
    growl.stop(0.78);
  }
  // Soft finger contact, lowpassed so it is felt not clicky.
  const finger = ctx.createBufferSource();
  finger.buffer = noiseBuffer(ctx, 0.012);
  const fLp = ctx.createBiquadFilter();
  fLp.type = 'lowpass';
  fLp.frequency.value = 1400;
  const fG = ctx.createGain();
  fG.gain.setValueAtTime(0.08, 0);
  fG.gain.exponentialRampToValueAtTime(0.001, 0.012);
  finger.connect(fLp).connect(fG).connect(ctx.destination);
  finger.start(0);
  return ctx.startRendering();
}

// Round short upright "bomp": a plucked bass note at rootHz/2. Triangle body,
// a soft (lowpassed) pick bite instead of a bright saw scratch, and a lowpass
// that closes fast so it rounds off — warmer/darker than the builtin pluck.
async function lofiPluck(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.45);
  const base = rootHz / 2;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(base, 0);
  osc.frequency.exponentialRampToValueAtTime(base / 1.03, 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1300, 0);
  lp.frequency.exponentialRampToValueAtTime(560, 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.8, 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, 0.32);
  osc.connect(lp).connect(g).connect(ctx.destination);
  // Soft pick bite: a brief lowpassed saw doubling, dark not scratchy.
  const bite = ctx.createOscillator();
  bite.type = 'sawtooth';
  bite.frequency.value = base;
  const biteG = ctx.createGain();
  biteG.gain.setValueAtTime(0.22, 0);
  biteG.gain.exponentialRampToValueAtTime(0.001, 0.05);
  const biteLp = ctx.createBiquadFilter();
  biteLp.type = 'lowpass';
  biteLp.frequency.value = 1100;
  bite.connect(biteLp).connect(biteG).connect(lp);
  // Soft finger noise.
  const finger = ctx.createBufferSource();
  finger.buffer = noiseBuffer(ctx, 0.012);
  const fLp = ctx.createBiquadFilter();
  fLp.type = 'lowpass';
  fLp.frequency.value = 1600;
  const fG = ctx.createGain();
  fG.gain.setValueAtTime(0.1, 0);
  fG.gain.exponentialRampToValueAtTime(0.001, 0.012);
  finger.connect(fLp).connect(fG).connect(ctx.destination);
  osc.start(0);
  bite.start(0);
  bite.stop(0.08);
  finger.start(0);
  osc.stop(0.4);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Harmony — Rhodes (the star), chord, choir
// ---------------------------------------------------------------------------

// Warm, dusty electric piano — the centrepiece. Sine partials with the metallic
// tine content pulled WAY back from the builtin (softer, darker), a slow ~1.6 Hz
// "wow" detune wobble that sells worn tape, a soft attack, and a 2.6 kHz master
// lowpass that rolls the top into felt warmth. note 0 = rootHz.
async function lofiRhodes(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.0);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  lp.Q.value = 0.5;
  lp.connect(ctx.destination);
  // Slow tape "wow": a gentle shared pitch wobble on every partial.
  const wow = ctx.createOscillator();
  wow.type = 'sine';
  wow.frequency.value = 1.6;
  const wowGain = ctx.createGain();
  wowGain.gain.value = 9; // ~9 cents, subtle
  wow.connect(wowGain);
  wow.start(0);
  wow.stop(0.98);
  const partials: [number, number, number, number][] = [
    [1, 0.6, 0.02, 0.85], // warm fundamental, long
    [2, 0.22, 0.015, 0.55],
    [3.9, 0.05, 0.008, 0.28], // faint, dark tine shimmer
  ];
  for (const [mult, level, atk, dec] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rootHz * mult;
    wowGain.connect(osc.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(level, atk);
    g.gain.exponentialRampToValueAtTime(0.001, dec);
    osc.connect(g).connect(lp);
    osc.start(0);
    osc.stop(dec + 0.02);
  }
  // Soft mellow tine "bark" at the attack — quieter and darker than a real EP so
  // it thumps warmly rather than knocks.
  const bark = ctx.createOscillator();
  bark.type = 'triangle';
  bark.frequency.setValueAtTime(rootHz * 5, 0);
  bark.frequency.exponentialRampToValueAtTime(rootHz * 2.5, 0.04);
  const barkG = ctx.createGain();
  barkG.gain.setValueAtTime(0.1, 0);
  barkG.gain.exponentialRampToValueAtTime(0.001, 0.05);
  bark.connect(barkG).connect(lp);
  bark.start(0);
  bark.stop(0.07);
  return ctx.startRendering();
}

// Warm quartal chord (root, +5, +10 semitones baked in) — used as both a held
// pad and a soft stab. Darker than the builtin: heavier lowpass, highpassed off
// the bass, super-saw detuning kept gentle, and a slow wow wobble on the pad so
// held chords breathe like tape. The chart transposes the whole voicing to the
// allowed chord roots (0/5/7).
async function lofiChord(pad: boolean, rootHz: number): Promise<AudioBuffer> {
  const dur = pad ? 1.8 : 0.55;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 1400 : 2000;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 210; // keep out of the bass/kick
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(pad ? 0.3 : 0.34, pad ? 0.22 : 0.008);
  master.gain.exponentialRampToValueAtTime(0.001, dur);
  lp.connect(hp).connect(master).connect(ctx.destination);
  let wowGain: GainNode | null = null;
  if (pad) {
    const wow = ctx.createOscillator();
    wow.type = 'sine';
    wow.frequency.value = 1.4;
    wowGain = ctx.createGain();
    wowGain.gain.value = 8; // cents
    wow.connect(wowGain);
    wow.start(0);
    wow.stop(dur);
  }
  for (const semis of [0, 5, 10]) {
    for (const detune of [-7, 0, 7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = detune;
      if (wowGain) wowGain.connect(osc.detune);
      const g = ctx.createGain();
      g.gain.value = 0.13;
      osc.connect(g).connect(lp);
      osc.start(0);
      osc.stop(dur + 0.05);
    }
  }
  return ctx.startRendering();
}

// Airy warm "aah" vocal pad — the lush lo-fi background. Two low vowel formants
// carry the body and a third, much quieter formant hints at the voice; a slow
// breathy attack, a long tail, a shared vibrato so it sounds like a section, and
// a 2.8 kHz master lowpass to keep it mellow (never bright). note 0 = rootHz.
async function lofiChoir(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.9);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.linearRampToValueAtTime(0.28, 0.32); // slow breathy swell
  master.gain.setValueAtTime(0.28, 1.1);
  master.gain.exponentialRampToValueAtTime(0.001, 1.85);
  lp.connect(master).connect(ctx.destination);
  const formants: [number, number, number][] = [
    [720, 6, 0.7],
    [1080, 8, 0.4],
    [2600, 9, 0.08], // faint upper formant so it reads as a voice, kept dark
  ];
  const vib = ctx.createOscillator();
  vib.type = 'sine';
  vib.frequency.value = 5.0;
  const vibGain = ctx.createGain();
  vibGain.gain.value = rootHz * 0.005; // gentle drift
  vib.connect(vibGain);
  vib.start(0);
  vib.stop(1.88);
  for (const [f, q, amp] of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const fg = ctx.createGain();
    fg.gain.value = amp;
    bp.connect(fg).connect(lp);
    for (const [mult, det] of [
      [1, -7],
      [1, 8],
      [2, 5],
      [3, -4],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = rootHz * mult;
      o.detune.value = det;
      vibGain.connect(o.frequency);
      const og = ctx.createGain();
      og.gain.value = 0.1;
      o.connect(og).connect(bp);
      o.start(0);
      o.stop(1.88);
    }
  }
  // A breath of dark filtered noise for air on the onset.
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.9);
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = 1080;
  nbp.Q.value = 2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, 0);
  ng.gain.linearRampToValueAtTime(0.035, 0.32);
  ng.gain.exponentialRampToValueAtTime(0.001, 1.6);
  n.connect(nbp).connect(ng).connect(lp);
  n.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Melody — bell
// ---------------------------------------------------------------------------

// Mellow music-box twinkle, an octave up (rootHz*2). Inharmonic partials like
// the builtin bell but with the bright top pulled back, a 5 kHz master lowpass
// so it glows rather than glints, and a faint wow wobble. The single high
// sparkle over the warm harmony.
async function lofiBell(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.9);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  lp.connect(ctx.destination);
  const wow = ctx.createOscillator();
  wow.type = 'sine';
  wow.frequency.value = 2.2;
  const wowGain = ctx.createGain();
  wowGain.gain.value = 7; // cents
  wow.connect(wowGain);
  wow.start(0);
  wow.stop(0.88);
  const partials: [number, number, number][] = [
    [1, 0.52, 0.75],
    [2.76, 0.18, 0.45],
    [5.4, 0.05, 0.22], // faint, quick — no glassy ring
  ];
  for (const [mult, level, dec] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rootHz * 2 * mult;
    wowGain.connect(o.detune);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(level, 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, dec);
    o.connect(g).connect(lp);
    o.start(0);
    o.stop(dec + 0.02);
  }
  // Soft dark mallet touch.
  const strike = ctx.createBufferSource();
  strike.buffer = noiseBuffer(ctx, 0.008);
  const shp = ctx.createBiquadFilter();
  shp.type = 'bandpass';
  shp.frequency.value = 3200;
  shp.Q.value = 1.2;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.08, 0);
  sg.gain.exponentialRampToValueAtTime(0.001, 0.008);
  strike.connect(shp).connect(sg).connect(lp);
  strike.start(0);
  return ctx.startRendering();
}

export async function buildLofiKit(rootHz: number): Promise<Map<Role, Kit>> {
  const kits = new Map<Role, Kit>();

  // Pulse
  const [kickHard, kickSoft] = await Promise.all([lofiKick(true), lofiKick(false)]);
  kits.set('kick', makeKit('kick', new Map([['hard', kickHard], ['soft', kickSoft]])));

  // Backbeat
  const [snare, rimshot] = await Promise.all([lofiSnare(), lofiRimshot()]);
  kits.set('snare', makeKit('snare', new Map([['snare', snare]])));
  kits.set('rimshot', makeKit('rimshot', new Map([['rimshot', rimshot]])));

  // Hats
  const [hatClosed, hatOpen, shaker] = await Promise.all([lofiHat(false), lofiHat(true), lofiShaker()]);
  kits.set('hat', makeKit('hat', new Map([['closed', hatClosed], ['open', hatOpen]])));
  kits.set('shaker', makeKit('shaker', new Map([['shaker', shaker]])));

  // Bass
  const [bass, bassFat, pluck] = await Promise.all([lofiBass(false, rootHz), lofiBass(true, rootHz), lofiPluck(rootHz)]);
  kits.set('bass', makeKit('bass', new Map([['bass', bass], ['fat', bassFat]])));
  kits.set('pluck', makeKit('pluck', new Map([['pluck', pluck]])));

  // Harmony
  const [rhodes, chordStab, chordPad, choir] = await Promise.all([
    lofiRhodes(rootHz),
    lofiChord(false, rootHz),
    lofiChord(true, rootHz),
    lofiChoir(rootHz),
  ]);
  kits.set('rhodes', makeKit('rhodes', new Map([['rhodes', rhodes]])));
  kits.set('chord', makeKit('chord', new Map([['stab', chordStab], ['pad', chordPad]])));
  kits.set('choir', makeKit('choir', new Map([['choir', choir]])));

  // Melody
  const bell = await lofiBell(rootHz);
  kits.set('bell', makeKit('bell', new Map([['bell', bell]])));

  return kits;
}
