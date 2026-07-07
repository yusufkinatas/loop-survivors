// Hip-Hop kit — trap-flavored boom at a 140 BPM halftime feel. Its identity is
// a booming, gliding 808 low end, a tight punchy kick that stays OUT of the
// 808's sub so the two never mud up, cracking tuned-up snare/claps on the
// halftime backbeat, and crisp bright hi-hats short enough to survive fast
// rolls. The melodic top is dark and sparse: trap bells, a plucky lead, and the
// signature breathy trap flute (whistle), over dark filtered chords and a dim
// choir wash. Grimy Reese sits alongside the clean 808 as the darker low-end
// alternative.
//
// Supported roles (the set this genre is optimized for; must equal the ladder
// set in ladders/hiphop.ts): kick, snare, clap, rimshot, hat, shaker, bass,
// reese, chord, choir, bell, lead, whistle, crash, riser. Dropped: tom,
// heartbeat, ride, arp, cowbell, acid, zap, pluck, rhodes.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

// ── Pulse ────────────────────────────────────────────────────────────────
// Trap kick: a tight, punchy transient with a short low thump. Deliberately
// SHORT (fast decay) and focused a little higher than a house/techno kick so it
// punches through the mix and leaves the sustained 808 the whole sub floor —
// the "kick and bass must not collide muddily" rule. The soft variant is the
// rounded ghost/pickup hit.
async function kick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.4);
  const body = ctx.createOscillator();
  body.type = 'sine';
  // Body sits in the "knock" band (~80 Hz), deliberately ABOVE the 808's ~55 Hz
  // fundamental (rootHz/4) so the two never share the sub. The kick owns the
  // punch/attack; the 808 owns the deep boom. This is the "leave the sub room"
  // rule made literal — 56 Hz would have masked the 808 outright.
  body.frequency.setValueAtTime(hard ? 230 : 180, 0);
  body.frequency.exponentialRampToValueAtTime(hard ? 92 : 82, 0.045);
  body.frequency.exponentialRampToValueAtTime(hard ? 82 : 72, 0.12);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(hard ? 1.0 : 0.72, 0);
  // Short tail keeps the low end punchy, not boomy — the 808 does the booming.
  bodyGain.gain.exponentialRampToValueAtTime(0.001, hard ? 0.22 : 0.16);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(hard ? 2.6 : 1.6); // punch/beef for small speakers
  body.connect(bodyGain).connect(drive).connect(ctx.destination);
  // Sharp click transient: a trap kick reads by its attack.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.008);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 2200;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(hard ? 0.35 : 0.15, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.01);
  click.connect(clickHp).connect(clickGain).connect(ctx.destination);
  body.start(0);
  click.start(0);
  return ctx.startRendering();
}

// ── Backbeat ───────────────────────────────────────────────────────────────
// Trap snare: bright and cracking, tuned UP relative to a boom-bap snare, with
// a fast snap and a short tuned shell. Sits on beat 3 in the halftime groove and
// stays articulate under fast roll fills.
async function snare(): Promise<AudioBuffer> {
  const ctx = offline(0.26);
  // Bright snap: the initial crack, high and fast.
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.1);
  const snapHp = ctx.createBiquadFilter();
  snapHp.type = 'highpass';
  snapHp.frequency.value = 1900;
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.85, 0);
  snapGain.gain.exponentialRampToValueAtTime(0.001, 0.08);
  snap.connect(snapHp).connect(snapGain).connect(ctx.destination);
  // Tuned shell: two triangle partials, pitched up for the trap "tak".
  for (const [f, level, dec] of [
    [250, 0.5, 0.08],
    [340, 0.24, 0.055],
  ] as const) {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(f * 1.3, 0);
    tone.frequency.exponentialRampToValueAtTime(f, 0.035);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, 0);
    g.gain.exponentialRampToValueAtTime(0.001, dec);
    tone.connect(g).connect(ctx.destination);
    tone.start(0);
    tone.stop(dec + 0.02);
  }
  // A thin bandpassed rattle so it reads as a snare, not a click.
  const rattle = ctx.createBufferSource();
  rattle.buffer = noiseBuffer(ctx, 0.18);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 4400;
  bp.Q.value = 0.6;
  const rGain = ctx.createGain();
  rGain.gain.setValueAtTime(0.3, 0);
  rGain.gain.exponentialRampToValueAtTime(0.001, 0.1);
  rattle.connect(bp).connect(rGain).connect(ctx.destination);
  snap.start(0);
  rattle.start(0);
  return ctx.startRendering();
}

// Trap clap: a tight cluster of reflections with a short diffuse tail, bright
// and dry. Doubles as the snare kit's 'clap' variant and the standalone clap
// weapon so both stay on-genre.
async function clap(): Promise<AudioBuffer> {
  const ctx = offline(0.28);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1750;
  bp.Q.value = 1.1;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1100;
  bp.connect(hp).connect(ctx.destination);
  for (const [at, level, dur] of [
    [0, 0.6, 0.01],
    [0.008, 0.65, 0.01],
    [0.017, 0.6, 0.01],
    [0.028, 0.72, 0.15],
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

// Trap rimshot: a dry, sharp "tock" for the fast cross-stick rolls. Short square
// body with a fast pitch drop plus a focused noise click; no tail.
async function rimshot(): Promise<AudioBuffer> {
  const ctx = offline(0.12);
  const tone = ctx.createOscillator();
  tone.type = 'square';
  tone.frequency.setValueAtTime(470, 0);
  tone.frequency.exponentialRampToValueAtTime(320, 0.025);
  const tGain = ctx.createGain();
  tGain.gain.setValueAtTime(0.5, 0);
  tGain.gain.exponentialRampToValueAtTime(0.001, 0.055);
  tone.connect(tGain).connect(ctx.destination);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 1.7;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.5, 0);
  nGain.gain.exponentialRampToValueAtTime(0.001, 0.04);
  noise.connect(bp).connect(nGain).connect(ctx.destination);
  tone.start(0);
  noise.start(0);
  return ctx.startRendering();
}

// ── Hats ─────────────────────────────────────────────────────────────────
// Trap hi-hat: crisp and bright, with the closed variant cut VERY short so the
// dense 16th rolls stay articulate instead of smearing into fizz. Metallic
// square cluster + bright noise, steep highpass, sparkle peak up top.
async function hat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.3 : 0.045;
  const ctx = offline(dur + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.3 : 0.4, 0);
  g.gain.exponentialRampToValueAtTime(open ? 0.04 : 0.001, open ? 0.05 : dur);
  if (open) g.gain.exponentialRampToValueAtTime(0.001, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 9000; // bright, glassy trap hat
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 12500;
  peak.Q.value = 1.0;
  peak.gain.value = 7;
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
  const nGain = ctx.createGain();
  nGain.gain.value = 0.55;
  noise.connect(nGain).connect(hp);
  noise.start(0);
  return ctx.startRendering();
}

// Shaker: a softer "chh" than the hat, a rounded sizzle band that fills the tick
// lane without the hat's sharp metallic bite.
async function shaker(): Promise<AudioBuffer> {
  const ctx = offline(0.15);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.13);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3800;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 7000;
  bp.Q.value = 1.0;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.12, 0.004);
  g.gain.linearRampToValueAtTime(0.3, 0.018);
  g.gain.exponentialRampToValueAtTime(0.001, 0.095);
  noise.connect(hp).connect(bp).connect(g).connect(ctx.destination);
  noise.start(0);
  return ctx.startRendering();
}

// ── Bass: THE 808 ──────────────────────────────────────────────────────────
// The booming, gliding sub that defines trap. A near-sine at two octaves under
// the root reference (rootHz/4 ≈ 55 Hz) with the classic short pitch glide INTO
// the fundamental at the attack. Choke on the bass role means each new note cuts
// the last, so long tails never stack into mud.
//   'bass' — the standard 808: rounded, lightly saturated so it survives phones.
//   'fat'  — a heavier, distorted 808 with a detuned saw layer for grit.
//   'sub'  — the deepest, cleanest, longest boom: the tier-4 once-per-phrase drop.
async function bass808(rootHz: number, mode: 'bass' | 'fat' | 'sub'): Promise<AudioBuffer> {
  const f0 = rootHz / 4; // ≈ 55 Hz, A1
  if (mode === 'sub') {
    // A long, clean, deep drop — a weight hitting the floor.
    const ctx = offline(1.3);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0 * 2, 0);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.75, 0.12); // deep glide down
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, 0);
    g.gain.exponentialRampToValueAtTime(0.95, 0.01);
    g.gain.setValueAtTime(0.95, 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, 1.2);
    osc.connect(g).connect(ctx.destination);
    // A short click so the drop has an attack on small speakers.
    const click = ctx.createBufferSource();
    click.buffer = noiseBuffer(ctx, 0.01);
    const clickHp = ctx.createBiquadFilter();
    clickHp.type = 'highpass';
    clickHp.frequency.value = 1500;
    const clickG = ctx.createGain();
    clickG.gain.setValueAtTime(0.28, 0);
    clickG.gain.exponentialRampToValueAtTime(0.001, 0.012);
    click.connect(clickHp).connect(clickG).connect(ctx.destination);
    osc.start(0);
    click.start(0);
    return ctx.startRendering();
  }
  const fat = mode === 'fat';
  const ctx = offline(fat ? 0.8 : 0.7);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0 * 2.2, 0); // the 808 glide into the note
  osc.frequency.exponentialRampToValueAtTime(f0, 0.06);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(fat ? 0.95 : 0.9, 0.008);
  g.gain.setValueAtTime(fat ? 0.95 : 0.9, fat ? 0.4 : 0.32);
  g.gain.exponentialRampToValueAtTime(0.001, fat ? 0.75 : 0.62);
  // Saturation gives the harmonics that make an 808 audible on phones; 'fat'
  // drives harder into distortion for the grimier variant.
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(fat ? 3.6 : 1.8);
  osc.connect(drive).connect(g).connect(ctx.destination);
  if (fat) {
    // A quiet detuned saw doubles the grit of the distorted 808.
    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = f0;
    saw.detune.value = 8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const sg = ctx.createGain();
    sg.gain.value = 0.3;
    saw.connect(lp).connect(sg).connect(drive);
    saw.start(0);
    saw.stop(fat ? 0.75 : 0.7);
  }
  // A short click transient so the 808 has definition and cuts through.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.008);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 1800;
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.18, 0);
  clickG.gain.exponentialRampToValueAtTime(0.001, 0.01);
  click.connect(clickHp).connect(clickG).connect(ctx.destination);
  osc.start(0);
  click.start(0);
  return ctx.startRendering();
}

// ── Bass slot alt: Reese ─────────────────────────────────────────────────
// The darker, grimier low-end alternative to the clean 808: hard-detuned saws
// beating against each other through a resonant lowpass, heavily saturated into
// a growling monster. Kept low (rootHz/4) and dark, more static than a DnB
// Reese — it broods rather than writhes.
async function reese(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const f0 = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(700, 0);
  lp.frequency.exponentialRampToValueAtTime(180, 0.5);
  lp.Q.value = 6;
  // A slow, shallow filter wobble for a little movement, not the DnB writhe.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 3.5;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 90;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start(0);
  lfo.stop(0.58);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(2.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.72, 0.02);
  g.gain.setValueAtTime(0.72, 0.32);
  g.gain.exponentialRampToValueAtTime(0.001, 0.56);
  lp.connect(drive).connect(g).connect(ctx.destination);
  for (const det of [-18, -6, 6, 18]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f0;
    o.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = 0.3;
    o.connect(og).connect(lp);
    o.start(0);
    o.stop(0.58);
  }
  // Clean sine sub under the growl keeps the low end solid.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = f0;
  const subG = ctx.createGain();
  subG.gain.value = 0.5;
  sub.connect(subG).connect(g);
  sub.start(0);
  sub.stop(0.58);
  return ctx.startRendering();
}

// ── Harmony ────────────────────────────────────────────────────────────────
// Dark trap chords: quartal detuned-saw voicing (root, +5, +10) kept low and
// filtered dim so the harmony broods behind the beat. 'pad' is a slow dark
// swell; 'stab' is a short filtered hit. A highpass keeps both clear of the
// 808's sub.
async function chord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const dur = pad ? 1.8 : 0.45;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 1300 : 1900; // dark
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = pad ? 240 : 200; // stay off the 808 sub
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.28, pad ? 0.25 : 0.006);
  master.gain.exponentialRampToValueAtTime(0.001, dur);
  lp.connect(hp).connect(master).connect(ctx.destination);
  let vibGain: GainNode | null = null;
  if (pad) {
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 4.0;
    vibGain = ctx.createGain();
    vibGain.gain.value = rootHz * 0.003;
    vib.connect(vibGain);
    vib.start(0);
  }
  for (const semis of [0, 5, 10]) {
    for (const detune of [-8, 0, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = detune;
      if (vibGain) vibGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.14;
      osc.connect(g).connect(lp);
      osc.start(0);
    }
  }
  return ctx.startRendering();
}

// Dark choir wash: a dim "ooh"-leaning vowel (lower formants than a bright
// gospel "aah") with a slow breathy swell and a long tail. Atmospheric backing,
// held not struck.
async function choir(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.9);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.linearRampToValueAtTime(0.28, 0.32);
  master.gain.setValueAtTime(0.28, 1.1);
  master.gain.exponentialRampToValueAtTime(0.001, 1.85);
  master.connect(ctx.destination);
  // Darker formants (F1 ~620, F2 ~1000, F3 ~2300) = a dim "ooh/aah".
  const formants: [number, number, number][] = [
    [620, 7, 0.7],
    [1000, 9, 0.4],
    [2300, 11, 0.14],
  ];
  const vib = ctx.createOscillator();
  vib.type = 'sine';
  vib.frequency.value = 4.8;
  const vibGain = ctx.createGain();
  vibGain.gain.value = rootHz * 0.006;
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
    bp.connect(fg).connect(master);
    for (const [mult, det] of [
      [1, -7],
      [1, 8],
      [2, 5],
      [3, -4],
      [4, 6],
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
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.9);
  const nbp = ctx.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = 1000;
  nbp.Q.value = 2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, 0);
  ng.gain.linearRampToValueAtTime(0.035, 0.32);
  ng.gain.exponentialRampToValueAtTime(0.001, 1.7);
  n.connect(nbp).connect(ng).connect(master);
  n.start(0);
  return ctx.startRendering();
}

// ── Melody ─────────────────────────────────────────────────────────────────
// The signature trap bell: a bright, ringing music-box/glockenspiel with
// inharmonic partials, high and sparkly — the hook voice. Fast attack, shimmering
// decay that clears before it muds.
async function bell(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.95);
  const partials: [number, number, number][] = [
    [1, 0.55, 0.9],
    [2.76, 0.26, 0.55],
    [5.4, 0.13, 0.34],
    [8.1, 0.06, 0.2],
  ];
  for (const [mult, level, dec] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rootHz * 2 * mult; // an octave up: the bright top voice
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(level, 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, dec);
    o.connect(g).connect(ctx.destination);
    o.start(0);
    o.stop(dec + 0.02);
  }
  const strike = ctx.createBufferSource();
  strike.buffer = noiseBuffer(ctx, 0.008);
  const shp = ctx.createBiquadFilter();
  shp.type = 'highpass';
  shp.frequency.value = 5500;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.13, 0);
  sg.gain.exponentialRampToValueAtTime(0.001, 0.008);
  strike.connect(shp).connect(sg).connect(ctx.destination);
  strike.start(0);
  return ctx.startRendering();
}

// Trap synth lead: a plucky detuned saw+square with a fast-closing resonant
// lowpass and a touch of drive — a bright cutting hook a little grittier than a
// pure sine, an octave up with a sine body underneath for weight.
async function lead(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.55);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz * 2;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = rootHz * 2;
  osc2.detune.value = 9;
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.value = rootHz; // octave-down body so it isn't thin
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(5000, 0);
  lp.frequency.exponentialRampToValueAtTime(1000, 0.28); // plucky close
  lp.Q.value = 3;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.4, 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, 0.5);
  const g2 = ctx.createGain();
  g2.gain.value = 0.4;
  const gBody = ctx.createGain();
  gBody.gain.value = 0.26;
  osc.connect(lp);
  osc2.connect(g2).connect(lp);
  body.connect(gBody).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  osc.start(0);
  osc2.start(0);
  body.start(0);
  return ctx.startRendering();
}

// The trap flute (whistle role): warm and breathy, a near-sine with a soft
// octave, a woody breath of air, and a vibrato that fades in so held notes waver
// like a played flute rather than a test tone. Sits high and sweet in the mix.
async function whistle(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.linearRampToValueAtTime(0.5, 0.05); // soft breathy onset
  g.gain.setValueAtTime(0.5, 0.42);
  g.gain.exponentialRampToValueAtTime(0.001, 0.64);
  g.connect(ctx.destination);
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 5.2;
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.0001, 0);
  lfoGain.gain.linearRampToValueAtTime(rootHz * 2 * 0.011, 0.3);
  lfo.connect(lfoGain);
  lfo.start(0);
  lfo.stop(0.68);
  for (const [mult, level] of [
    [1, 0.82],
    [2, 0.14],
    [3, 0.05],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rootHz * 2 * mult;
    lfoGain.connect(osc.frequency);
    const og = ctx.createGain();
    og.gain.value = level;
    osc.connect(og).connect(g);
    osc.start(0);
    osc.stop(0.68);
  }
  // Woody breath: bandpassed air so the onset reads as a flute, not a synth.
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.7);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = rootHz * 3;
  bp.Q.value = 1.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.09, 0);
  ng.gain.exponentialRampToValueAtTime(0.001, 0.35);
  n.connect(bp).connect(ng).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

// ── FX ───────────────────────────────────────────────────────────────────
// Crash: a bright cymbal for trap transitions — broadband noise wash plus an
// inharmonic metal core, long shimmering tail. Choked so repeats don't wash.
async function crash(): Promise<AudioBuffer> {
  const ctx = offline(1.5);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.45, 0.005);
  g.gain.exponentialRampToValueAtTime(0.06, 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, 1.35);
  g.connect(ctx.destination);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.5);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 9500;
  bp.Q.value = 0.4;
  const nGain = ctx.createGain();
  nGain.gain.value = 0.85;
  n.connect(hp).connect(bp).connect(nGain).connect(g);
  const base = 640;
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

// Riser: the trap uplifter — filtered noise whose level swells and whose
// bandpass sweeps up into a cut, anticipating the downbeat (the auto-dash's
// wind-up). Choked.
async function riser(): Promise<AudioBuffer> {
  const dur = 0.9;
  const ctx = offline(dur + 0.05);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(500, 0);
  bp.frequency.exponentialRampToValueAtTime(9500, dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, dur * 0.93);
  g.gain.exponentialRampToValueAtTime(0.001, dur);
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

export async function buildHiphopKit(rootHz: number): Promise<Map<Role, Kit>> {
  const [
    kickHard,
    kickSoft,
    snareBuf,
    clapBuf,
    rimshotBuf,
    hatClosed,
    hatOpen,
    shakerBuf,
    bassBuf,
    bassFat,
    bassSub,
    reeseBuf,
    chordStab,
    chordPad,
    choirBuf,
    bellBuf,
    leadBuf,
    whistleBuf,
    crashBuf,
    riserBuf,
  ] = await Promise.all([
    kick(true),
    kick(false),
    snare(),
    clap(),
    rimshot(),
    hat(false),
    hat(true),
    shaker(),
    bass808(rootHz, 'bass'),
    bass808(rootHz, 'fat'),
    bass808(rootHz, 'sub'),
    reese(rootHz),
    chord(rootHz, false),
    chord(rootHz, true),
    choir(rootHz),
    bell(rootHz),
    lead(rootHz),
    whistle(rootHz),
    crash(),
    riser(),
  ]);

  const kits = new Map<Role, Kit>();
  kits.set('kick', makeKit('kick', new Map([['hard', kickHard], ['soft', kickSoft]])));
  // The snare role carries a 'clap' alt variant; supply the trap clap for it.
  kits.set('snare', makeKit('snare', new Map([['snare', snareBuf], ['clap', clapBuf]])));
  kits.set('clap', makeKit('clap', new Map([['clap', clapBuf]])));
  kits.set('rimshot', makeKit('rimshot', new Map([['rimshot', rimshotBuf]])));
  kits.set('hat', makeKit('hat', new Map([['closed', hatClosed], ['open', hatOpen]])));
  kits.set('shaker', makeKit('shaker', new Map([['shaker', shakerBuf]])));
  kits.set('bass', makeKit('bass', new Map([['bass', bassBuf], ['fat', bassFat], ['sub', bassSub]])));
  kits.set('reese', makeKit('reese', new Map([['reese', reeseBuf]])));
  kits.set('chord', makeKit('chord', new Map([['stab', chordStab], ['pad', chordPad]])));
  kits.set('choir', makeKit('choir', new Map([['choir', choirBuf]])));
  kits.set('bell', makeKit('bell', new Map([['bell', bellBuf]])));
  kits.set('lead', makeKit('lead', new Map([['lead', leadBuf]])));
  kits.set('whistle', makeKit('whistle', new Map([['whistle', whistleBuf]])));
  kits.set('crash', makeKit('crash', new Map([['crash', crashBuf]])));
  kits.set('riser', makeKit('riser', new Map([['riser', riserBuf]])));
  return kits;
}
