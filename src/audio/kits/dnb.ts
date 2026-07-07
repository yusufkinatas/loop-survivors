// Drum & Bass kit. This genre's OWN voicing of the soundset — not the builtin
// kit played faster. DnB at 174 lives on a tight punchy break and a rolling
// low-end monster, so every voice here is engineered for that:
//
//   - kick:  short, clicky, fast pitch-drop, decays out of the way by ~0.2s so
//            the sub belongs to the bass, never a long 808 boom.
//   - snare: a sharp cracking break snare — bright noise snap + tight tonal body
//            + a touch of drive, with a medium rattle for ghost-note shuffle.
//   - hat:   very short, bright, metallic — built to ride 16ths at 174 without
//            smearing; the open variant is a quick spit, not a wash.
//   - ride:  bright bell ping with a shimmering tail (the freeze weapon).
//   - reese: the monster. Hard-detuned saws beating against each other through a
//            resonant, LFO-wobbled lowpass, saturated, over a clean sine sub.
//   - bass:  a cleaner rolling sub with a little saw bite — the reese's sober
//            cousin, tight filter close so fast rolls stay articulate.
//   - chord: stabby detuned quartal voicing (stab = short/bright, pad = long/airy).
//   - choir: an airy formant "aah" pad for liquid-DnB atmosphere.
//   - lead:  a bright, gritty cutting line an octave up.
//   - bell:  twinkly inharmonic music-box sparkle up top.
//   - crash/riser: bright cymbal punctuation and the reversed-swell build.
//
// Supported set (12 roles, one or two per band slot): kick / snare / hat / ride /
// crash / riser / reese / bass / chord / choir / lead / bell. Dropped as un-DnB:
// tom, heartbeat, clap-slot, rimshot, arp, cowbell, acid, zap, pluck, rhodes,
// whistle. Kits are stamped via makeKit so identity (name/color/choke) stays
// canonical; only the buffers are this genre's own.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

// ---------------------------------------------------------------------------
// Drums / FX (unpitched)
// ---------------------------------------------------------------------------

// Tight DnB kick: a fast two-stage pitch drop to a defined ~48 Hz fundamental,
// a hard click transient for cut, and a SHORT decay so it punches then clears
// the sub for the bass/reese. Hard = punchier and clickier; soft = a rounder,
// slightly lower thud with less snap, still tight.
async function renderKick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.3);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hard ? 195 : 155, 0);
  body.frequency.exponentialRampToValueAtTime(hard ? 55 : 50, 0.03);
  body.frequency.exponentialRampToValueAtTime(hard ? 46 : 43, 0.1);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(hard ? 1.0 : 0.86, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, hard ? 0.19 : 0.24);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(hard ? 2.8 : 1.9); // punch, not boom
  body.connect(bodyGain).connect(drive).connect(ctx.destination);
  // Click: a bright highpassed noise spit + a fast beater tick, so the attack
  // slices through a busy mix. DnB kicks are defined by their top-end snap.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.008);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 2400;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(hard ? 0.5 : 0.24, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.01);
  click.connect(clickHp).connect(clickGain).connect(ctx.destination);
  const tick = ctx.createOscillator();
  tick.type = 'triangle';
  tick.frequency.setValueAtTime(hard ? 720 : 460, 0);
  tick.frequency.exponentialRampToValueAtTime(190, 0.018);
  const tickGain = ctx.createGain();
  tickGain.gain.setValueAtTime(hard ? 0.3 : 0.14, 0);
  tickGain.gain.exponentialRampToValueAtTime(0.001, 0.022);
  tick.connect(tickGain).connect(ctx.destination);
  body.start(0);
  click.start(0);
  tick.start(0);
  tick.stop(0.04);
  return ctx.startRendering();
}

// Sharp break snare: a fast bright noise crack, a mid rattle for the "wires"
// shuffle, a short pitched shell, and light drive for the crack DnB lives on.
async function renderSnare(): Promise<AudioBuffer> {
  const ctx = offline(0.28);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.8); // sharpen the crack
  drive.connect(ctx.destination);
  // Crack: high noise band, very fast decay.
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.1);
  const snapHp = ctx.createBiquadFilter();
  snapHp.type = 'highpass';
  snapHp.frequency.value = 1900;
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.85, 0);
  snapGain.gain.exponentialRampToValueAtTime(0.001, 0.045);
  snap.connect(snapHp).connect(snapGain).connect(drive);
  // Rattle: focused mid noise, slightly longer, for ghost-note shuffle.
  const rattle = ctx.createBufferSource();
  rattle.buffer = noiseBuffer(ctx, 0.24);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3000;
  bp.Q.value = 0.7;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.4, 0);
  nGain.gain.exponentialRampToValueAtTime(0.001, 0.12);
  rattle.connect(bp).connect(nGain).connect(drive);
  // Tonal shell: two triangle partials give the drum a cracking pitched body.
  for (const [f, level, dec] of [
    [235, 0.42, 0.09],
    [355, 0.2, 0.06],
  ] as const) {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(f * 1.3, 0);
    tone.frequency.exponentialRampToValueAtTime(f, 0.04);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(level, 0);
    tGain.gain.exponentialRampToValueAtTime(0.001, dec);
    tone.connect(tGain).connect(drive);
    tone.start(0);
    tone.stop(dec + 0.02);
  }
  snap.start(0);
  rattle.start(0);
  return ctx.startRendering();
}

// Clap variant of the snare role (auditionable, sparingly charted): four tight
// noise reflections through a bandpass formant, bright to match the break.
async function renderClap(): Promise<AudioBuffer> {
  const ctx = offline(0.3);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1750;
  bp.Q.value = 1.1;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1000;
  bp.connect(hp).connect(ctx.destination);
  for (const [at, level, dur] of [
    [0, 0.55, 0.01],
    [0.008, 0.6, 0.01],
    [0.018, 0.55, 0.01],
    [0.028, 0.68, 0.16],
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

// Fast crisp DnB hat: a steep highpass with a high peaking notch and a cluster
// of inharmonic squares give a bright metallic "tick"; closed snaps shut in
// ~40ms so 16ths at 174 stay articulate. Open is a quick spit, not a wash.
async function renderHat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.22 : 0.04;
  const ctx = offline(dur + 0.04);
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.3 : 0.4, 0);
  g.gain.exponentialRampToValueAtTime(open ? 0.05 : 0.001, open ? 0.05 : dur);
  if (open) g.gain.exponentialRampToValueAtTime(0.001, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 9000; // brighter than the builtin hat: DnB sizzle
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 12000;
  peak.Q.value = 1.3;
  peak.gain.value = 7;
  hp.connect(peak).connect(g).connect(ctx.destination);
  const base = 380;
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

// Ride (freeze weapon): a bright, focused "ping" cluster of inharmonic squares
// with a shimmering high-noise ring-out. Attack articulate, tail sings, so each
// freeze reads as a distinct bright slice.
async function renderRide(): Promise<AudioBuffer> {
  const ctx = offline(0.85);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 6800;
  bp.Q.value = 0.5;
  bp.connect(ctx.destination);
  const base = 540;
  const partials: [number, number][] = [
    [1, 0.2],
    [1.41, 0.14],
    [1.83, 0.12],
    [2.37, 0.13],
    [3.19, 0.1],
    [4.11, 0.08],
    [5.43, 0.06],
  ];
  for (const [mult, dec] of partials) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, 0);
    og.gain.exponentialRampToValueAtTime(0.13, 0.003);
    og.gain.exponentialRampToValueAtTime(0.001, 0.22 + dec * 3);
    o.connect(og).connect(bp);
    o.start(0);
    o.stop(0.85);
  }
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.85);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, 0);
  ng.gain.exponentialRampToValueAtTime(0.12, 0.004);
  ng.gain.exponentialRampToValueAtTime(0.02, 0.18);
  ng.gain.exponentialRampToValueAtTime(0.001, 0.8);
  n.connect(hp).connect(ng).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

// Crash: bright broadband cymbal roar with an inharmonic metal core and a long
// tail. Choked, so phrase-top accents don't stack into a wash.
async function renderCrash(): Promise<AudioBuffer> {
  const ctx = offline(1.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.45, 0.005);
  g.gain.exponentialRampToValueAtTime(0.06, 0.28);
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
  const nGain = ctx.createGain();
  nGain.gain.value = 0.85;
  n.connect(hp).connect(bp).connect(nGain).connect(g);
  const base = 660;
  for (const mult of [1, 1.41, 1.87, 2.53, 3.34, 4.37]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.value = 0.03;
    o.connect(og).connect(g);
    o.start(0);
    o.stop(1.4);
  }
  n.start(0);
  return ctx.startRendering();
}

// Riser (auto-dash wind-up): reversed-cymbal swell — filtered noise whose gain
// ramps up into a cut and whose bandpass sweeps up, anticipating the downbeat.
// The staple DnB build-up.
async function renderRiser(): Promise<AudioBuffer> {
  const dur = 0.8;
  const ctx = offline(dur + 0.05);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(650, 0);
  bp.frequency.exponentialRampToValueAtTime(9500, dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, dur * 0.92);
  g.gain.exponentialRampToValueAtTime(0.001, dur);
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// Pitched voices (rendered AT THE ROOT, note 0; engine pitch-shifts by rate)
// ---------------------------------------------------------------------------

// The Reese: DnB's signature monster. Four saws detuned hard against each other
// (±7c, ±24c) beat and writhe; a resonant lowpass with a fast LFO wobble gives
// the growl movement; heavy saturation thickens it; a clean sine sub keeps the
// low end solid. Two octaves under the root reference (~55 Hz). Choked and
// fast-attacked so a rolling line stays tight and articulate.
async function renderReese(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.55);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1000, 0);
  lp.frequency.exponentialRampToValueAtTime(230, 0.45);
  lp.Q.value = 8; // resonant snarl
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 7.5; // fast wobble = the writhing growl
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 200;
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start(0);
  lfo.stop(0.55);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(2.8); // thicken into a monster
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.72, 0.008); // fast attack for rolls
  g.gain.setValueAtTime(0.72, 0.28);
  g.gain.exponentialRampToValueAtTime(0.001, 0.52);
  lp.connect(drive).connect(g).connect(ctx.destination);
  for (const det of [-24, -7, 7, 24]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = rootHz / 4;
    o.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = 0.3;
    o.connect(og).connect(lp);
    o.start(0);
    o.stop(0.55);
  }
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const subG = ctx.createGain();
  subG.gain.value = 0.55;
  sub.connect(subG).connect(g);
  sub.start(0);
  sub.stop(0.55);
  return ctx.startRendering();
}

// Bass (the reese's sober cousin): a clean rolling sub with a little saw bite,
// through a resonant lowpass that closes fast so fast rolls stay articulate.
// Distinct from the reese — moving, not growling — and distinct from the kick
// (more mid saw content) so kick and bass don't collide in the sub.
async function renderBass(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz / 4;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1300, 0);
  lp.frequency.exponentialRampToValueAtTime(150, 0.28); // fast close = tight roll
  lp.Q.value = 4;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.62, 0.008);
  g.gain.setValueAtTime(0.62, 0.24);
  g.gain.exponentialRampToValueAtTime(0.001, 0.46);
  const subG = ctx.createGain();
  subG.gain.value = 0.6;
  osc.connect(lp).connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  osc.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// Bass "fat": the same rolling line with more grit and a slower filter close —
// a saw + detuned square over the sub for a bigger tier-3 weight.
async function renderBassFat(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz / 4;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = rootHz / 4;
  osc2.detune.value = 11;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600, 0);
  lp.frequency.exponentialRampToValueAtTime(130, 0.45);
  lp.Q.value = 4;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(3.0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.85, 0.01);
  g.gain.setValueAtTime(0.85, 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, 0.56);
  const oscG = ctx.createGain();
  oscG.gain.value = 0.6;
  const osc2G = ctx.createGain();
  osc2G.gain.value = 0.35;
  const subG = ctx.createGain();
  subG.gain.value = 0.68;
  osc.connect(oscG).connect(lp);
  osc2.connect(osc2G).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  osc.start(0);
  osc2.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// Bass "sub": the once-per-phrase drop — a long pitch-falling sine that lands
// like a weight on the floor, with a short click so it survives small speakers.
async function renderBassSub(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.3);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rootHz / 2, 0);
  osc.frequency.exponentialRampToValueAtTime(rootHz / 8, 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.9, 0.01);
  g.gain.setValueAtTime(0.9, 0.55);
  g.gain.exponentialRampToValueAtTime(0.001, 1.2);
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.01);
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.28, 0);
  clickG.gain.exponentialRampToValueAtTime(0.001, 0.01);
  osc.connect(g).connect(ctx.destination);
  click.connect(clickG).connect(ctx.destination);
  osc.start(0);
  click.start(0);
  return ctx.startRendering();
}

// Chord: a detuned quartal voicing (root, +5, +10 semitones — stacked fourths
// that stay in the note set at the allowed chord roots 0/5/7). A highpass keeps
// it above the bass/reese. Stab = fast attack, bright, short and punchy. Pad =
// slow breathy swell, darker, long atmospheric tail for liquid-DnB space.
async function renderChord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const dur = pad ? 1.8 : 0.5;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 1700 : 3000; // stab brighter, pad softer
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = pad ? 260 : 220; // stay clear of the sub
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.3, pad ? 0.22 : 0.005);
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
    }
  }
  return ctx.startRendering();
}

// Choir: an airy sung "aah" pad for liquid-DnB atmosphere. Three vowel formants
// (F1~800, F2~1150, F3~2900) over detuned saw harmonics, a slow breathy swell,
// a long lush tail, and a shared vibrato so the section breathes.
async function renderChoir(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.9);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, 0);
  master.gain.linearRampToValueAtTime(0.3, 0.3);
  master.gain.setValueAtTime(0.3, 1.1);
  master.gain.exponentialRampToValueAtTime(0.001, 1.85);
  master.connect(ctx.destination);
  const formants: [number, number, number][] = [
    [800, 6, 0.7],
    [1150, 8, 0.45],
    [2900, 10, 0.18],
  ];
  const vib = ctx.createOscillator();
  vib.type = 'sine';
  vib.frequency.value = 5.2;
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
      [5, -6],
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
  nbp.frequency.value = 1150;
  nbp.Q.value = 2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, 0);
  ng.gain.linearRampToValueAtTime(0.04, 0.3);
  ng.gain.exponentialRampToValueAtTime(0.001, 1.7);
  n.connect(nbp).connect(ng).connect(master);
  n.start(0);
  return ctx.startRendering();
}

// Lead: a bright, gritty cutting line an octave up — square + detuned saw over
// a triangle body sub, through a resonant lowpass that closes over the note,
// with a little drive for edge. Made to slice over the break.
async function renderLead(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.55);
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
  lp.frequency.setValueAtTime(5200, 0);
  lp.frequency.exponentialRampToValueAtTime(950, 0.38);
  lp.Q.value = 2.2;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.4, 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, 0.5);
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

// Bell: twinkly inharmonic music-box sparkle, two octaves up, with a soft mallet
// strike. The bright top voice for liquid-DnB sparkle; decays fast enough to
// stay clear in busy passages.
async function renderBell(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.85);
  const partials: [number, number, number][] = [
    [1, 0.55, 0.75],
    [2.76, 0.26, 0.46],
    [5.4, 0.13, 0.3],
    [8.1, 0.07, 0.18],
  ];
  for (const [mult, level, dec] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = rootHz * 2 * mult;
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
  shp.frequency.value = 5200;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.12, 0);
  sg.gain.exponentialRampToValueAtTime(0.001, 0.008);
  strike.connect(shp).connect(sg).connect(ctx.destination);
  strike.start(0);
  return ctx.startRendering();
}

export async function buildDnbKit(rootHz: number): Promise<Map<Role, Kit>> {
  const [
    kickHard,
    kickSoft,
    snare,
    clap,
    hatClosed,
    hatOpen,
    ride,
    crash,
    riser,
    reese,
    bass,
    bassFat,
    bassSub,
    stab,
    pad,
    choir,
    lead,
    bell,
  ] = await Promise.all([
    renderKick(true),
    renderKick(false),
    renderSnare(),
    renderClap(),
    renderHat(false),
    renderHat(true),
    renderRide(),
    renderCrash(),
    renderRiser(),
    renderReese(rootHz),
    renderBass(rootHz),
    renderBassFat(rootHz),
    renderBassSub(rootHz),
    renderChord(rootHz, false),
    renderChord(rootHz, true),
    renderChoir(rootHz),
    renderLead(rootHz),
    renderBell(rootHz),
  ]);

  const kits = new Map<Role, Kit>();
  kits.set('kick', makeKit('kick', new Map([['hard', kickHard], ['soft', kickSoft]])));
  kits.set('snare', makeKit('snare', new Map([['snare', snare], ['clap', clap]])));
  kits.set('hat', makeKit('hat', new Map([['closed', hatClosed], ['open', hatOpen]])));
  kits.set('ride', makeKit('ride', new Map([['ride', ride]])));
  kits.set('crash', makeKit('crash', new Map([['crash', crash]])));
  kits.set('riser', makeKit('riser', new Map([['riser', riser]])));
  kits.set('reese', makeKit('reese', new Map([['reese', reese]])));
  kits.set('bass', makeKit('bass', new Map([['bass', bass], ['fat', bassFat], ['sub', bassSub]])));
  kits.set('chord', makeKit('chord', new Map([['stab', stab], ['pad', pad]])));
  kits.set('choir', makeKit('choir', new Map([['choir', choir]])));
  kits.set('lead', makeKit('lead', new Map([['lead', lead]])));
  kits.set('bell', makeKit('bell', new Map([['bell', bell]])));
  return kits;
}
