// Synthwave kit: the neon-80s voicing of the soundset. Everything here is pure
// synthesis on purpose — synthwave IS a synthesizer genre, so oscillators and
// filters ARE the authentic instrument, not a stand-in for a sample.
//
// The sound signatures this kit chases:
//   - Machine-tight drums: a punchy tuned kick (LinnDrum/DMX lineage) and a
//     BIG gated-reverb snare — a bright noise burst that slams on, holds a dense
//     plateau, then is cut dead by a hard gate. That abrupt tail-chop is the
//     single most identifiable 80s drum gesture.
//   - Analog-bright, detuned everything: super-saw chords and leads with wide
//     detune so voices beat against each other and shimmer.
//   - A driving analog synth bass (saw + sine sub) that pulses straight 8ths/16ths.
//   - A relentless plucky arp and a glassy FM bell (DX7 lineage) up top.
//   - Dead straight, no swing (the genre config carries swing 0); the timbres
//     just need to be crisp enough that machine-locked 16ths stay articulate.
//
// Supported roles (a tight, idiomatic set — one voice per band slot except the
// two melodic/backbeat slots that synthwave genuinely doubles up):
//   Pulse    kick
//   Backbeat snare (gated), clap (bright 80s layer/alt)
//   Hats     hat
//   Motion   arp   (the relentless 16th signature)
//   FX       crash, riser
//   Bass     bass  (bass/fat/sub weight variants)
//   Harmony  chord (stab/pad super-saw)
//   Melody   lead, bell
// Dropped everywhere else: tom, heartbeat, rimshot, shaker, ride, cowbell, acid,
// zap, pluck, reese, rhodes, choir, whistle — none read as core synthwave.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

// ---------------------------------------------------------------------------
// PULSE — a tight, tuned 80s kick. Short sine body with a fast pitch drop to a
// defined fundamental (~50 Hz) so it thumps without booming, plus a bright
// highpassed click for the machine "snap". Light saturation for analog punch.
// 'hard' is the main hit; 'soft' is a quieter, slightly darker ghost.
// ---------------------------------------------------------------------------
async function synthKick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hard ? 190 : 150, 0);
  body.frequency.exponentialRampToValueAtTime(hard ? 52 : 46, 0.07);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(hard ? 1.0 : 0.78, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, hard ? 0.3 : 0.24);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(hard ? 1.9 : 1.3);
  body.connect(bodyGain).connect(drive).connect(ctx.destination);
  // Bright click: a very short highpassed noise tick = the beater "snap" that
  // keeps the kick present on small speakers.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.008);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 2600;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(hard ? 0.34 : 0.18, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.01);
  click.connect(clickHp).connect(clickGain).connect(ctx.destination);
  body.start(0);
  click.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// BACKBEAT — the gated-reverb snare, the genre's signature drum. Three layers:
//   1. Snap: bright highpassed noise crack for the initial transient.
//   2. Tonal shell: two triangle partials give the drum a pitched "thwack".
//   3. GATED tail: a bright broadband noise "reverb" that swells on fast, holds
//      a loud plateau (dense ambience), then is CUT to silence in ~8 ms. The
//      hard chop is the gate slamming shut — the unmistakable 80s sound.
// ---------------------------------------------------------------------------
async function synthSnare(): Promise<AudioBuffer> {
  const ctx = offline(0.4);
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.08);
  const snapHp = ctx.createBiquadFilter();
  snapHp.type = 'highpass';
  snapHp.frequency.value = 1800;
  const snapGain = ctx.createGain();
  snapGain.gain.setValueAtTime(0.8, 0);
  snapGain.gain.exponentialRampToValueAtTime(0.001, 0.06);
  snap.connect(snapHp).connect(snapGain).connect(ctx.destination);
  for (const [f, level, dec] of [
    [190, 0.5, 0.12],
    [300, 0.22, 0.08],
  ] as const) {
    const tone = ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(f * 1.3, 0);
    tone.frequency.exponentialRampToValueAtTime(f, 0.04);
    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(level, 0);
    tGain.gain.exponentialRampToValueAtTime(0.001, dec);
    tone.connect(tGain).connect(ctx.destination);
    tone.start(0);
    tone.stop(dec + 0.02);
  }
  // Gated reverb tail. A peaking boost ~4 kHz gives the bright, splashy body of
  // a plate reverb; the envelope is the whole trick: fast slam-on, a held
  // plateau, then a hard linear cut to near-silence (the gate).
  const GATE = 0.17;
  const tail = ctx.createBufferSource();
  tail.buffer = noiseBuffer(ctx, 0.3);
  const tailHp = ctx.createBiquadFilter();
  tailHp.type = 'highpass';
  tailHp.frequency.value = 1200;
  const tailPk = ctx.createBiquadFilter();
  tailPk.type = 'peaking';
  tailPk.frequency.value = 4000;
  tailPk.Q.value = 0.8;
  tailPk.gain.value = 5;
  const tailGain = ctx.createGain();
  tailGain.gain.setValueAtTime(0.0001, 0);
  tailGain.gain.linearRampToValueAtTime(0.5, 0.006); // slam on
  tailGain.gain.setValueAtTime(0.5, GATE - 0.02); // dense plateau
  tailGain.gain.linearRampToValueAtTime(0.0001, GATE); // GATE slams shut
  tail.connect(tailHp).connect(tailPk).connect(tailGain).connect(ctx.destination);
  snap.start(0);
  tail.start(0);
  return ctx.startRendering();
}

// A bright 80s hand-clap: four tight noise reflections through a mid formant,
// then its own small gated tail so it reads as the big-room clap that so often
// doubled the snare on these records.
async function synthClap(): Promise<AudioBuffer> {
  const ctx = offline(0.32);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 1.1;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1000;
  bp.connect(hp).connect(ctx.destination);
  for (const [at, level, dur] of [
    [0, 0.6, 0.01],
    [0.008, 0.65, 0.01],
    [0.018, 0.6, 0.01],
    [0.03, 0.7, 0.02],
  ] as const) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(g).connect(bp);
    src.start(at);
  }
  // Small gated tail (same slam-hold-cut shape as the snare, scaled down).
  const tail = ctx.createBufferSource();
  tail.buffer = noiseBuffer(ctx, 0.18);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, 0.03);
  tg.gain.linearRampToValueAtTime(0.28, 0.045);
  tg.gain.setValueAtTime(0.28, 0.11);
  tg.gain.linearRampToValueAtTime(0.0001, 0.125);
  tail.connect(bp);
  tail.connect(tg).connect(ctx.destination);
  tail.start(0.03);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// HATS — crisp machine hi-hats. A steep highpass with a peaking lift up at
// 12 kHz keeps them glassy and digital; the six-square inharmonic cluster gives
// a real metallic "tick" pitch so rolling 16ths don't smear into white fizz.
// Closed snaps shut fast; open rings ~0.3 s.
// ---------------------------------------------------------------------------
async function synthHat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.3 : 0.045;
  const ctx = offline(dur + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.3 : 0.4, 0);
  g.gain.exponentialRampToValueAtTime(open ? 0.04 : 0.001, open ? 0.05 : dur);
  if (open) g.gain.exponentialRampToValueAtTime(0.001, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 9000;
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 12000;
  peak.Q.value = 1.0;
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
  const nGain = ctx.createGain();
  nGain.gain.value = 0.55;
  noise.connect(nGain).connect(hp);
  noise.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// BASS — the driving analog synth bass. Saw for harmonic body (sits in the low
// mids, distinct from the kick's pure sub) plus a clean sine sub for weight,
// two octaves under the root reference. A resonant lowpass closes over the note
// so a pulsing 8th/16th line stays tight; light drive rounds it. Kept tight and
// not too dark so the octave-pulse pattern reads as MOTION, not mud — and the
// kick's ~50 Hz sub still has room because the bass fundamental sits at ~55 Hz
// only briefly before the filter closes and the octave hits carry ~110 Hz.
// ---------------------------------------------------------------------------
async function synthBass(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  const f = rootHz / 4;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 4;
  lp.frequency.setValueAtTime(1400, 0);
  lp.frequency.exponentialRampToValueAtTime(220, 0.28);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.6, 0.008);
  g.gain.setValueAtTime(0.6, 0.2);
  g.gain.exponentialRampToValueAtTime(0.001, 0.42);
  const subG = ctx.createGain();
  // Trimmed so the kick (~52 Hz body) owns the very bottom on the shared
  // four-on-the-floor downbeats; the saw still carries the bass in the low mids.
  subG.gain.value = 0.4;
  saw.connect(lp).connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  saw.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// 'fat' — the tier-3+ weight variant: a second detuned saw thickens it into a
// super-saw growl, more drive, a brighter/slower filter close.
async function synthBassFat(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const f = rootHz / 4;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const saw2 = ctx.createOscillator();
  saw2.type = 'sawtooth';
  saw2.frequency.value = f;
  saw2.detune.value = 12;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 4;
  lp.frequency.setValueAtTime(1800, 0);
  lp.frequency.exponentialRampToValueAtTime(200, 0.42);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(2.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.75, 0.008);
  g.gain.setValueAtTime(0.75, 0.28);
  g.gain.exponentialRampToValueAtTime(0.001, 0.52);
  const sawG = ctx.createGain();
  sawG.gain.value = 0.55;
  const saw2G = ctx.createGain();
  saw2G.gain.value = 0.4;
  const subG = ctx.createGain();
  // Same sub-room trim as the plain bass: keep the kick's fundamental clear.
  subG.gain.value = 0.42;
  saw.connect(sawG).connect(lp);
  saw2.connect(saw2G).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  saw.start(0);
  saw2.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// 'sub' — the tier-4 once-per-phrase drop: a long pitch-falling sine that lands
// like a weight, with a tiny click so the attack survives small speakers.
async function synthBassSub(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.3);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rootHz / 2, 0);
  osc.frequency.exponentialRampToValueAtTime(rootHz / 8, 0.32);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.9, 0.01);
  g.gain.setValueAtTime(0.9, 0.55);
  g.gain.exponentialRampToValueAtTime(0.001, 1.2);
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.01);
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.24, 0);
  clickG.gain.exponentialRampToValueAtTime(0.001, 0.01);
  osc.connect(g).connect(ctx.destination);
  click.connect(clickG).connect(ctx.destination);
  osc.start(0);
  click.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// HARMONY — lush super-saw chords. Quartal voicing (root, +5, +10 semitones)
// stays inside the note set under the allowed chord shifts (0/+5/+7). Each note
// is FOUR saws spread ±11 cents so they beat and shimmer — the wide, warm
// analog-poly wash synthwave lives on. A highpass keeps it off the bass/kick.
//   'stab': short, punchy, filter opens fast — rhythmic chord hits.
//   'pad':  slow swell, slow vibrato breath, long lush tail — held chords.
// ---------------------------------------------------------------------------
async function synthChord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const dur = pad ? 1.6 : 0.5;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 2200 : 3000;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 200;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.3, pad ? 0.22 : 0.006);
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
    for (const detune of [-11, -4, 4, 11]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = detune;
      if (vibGain) vibGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.11;
      osc.connect(g).connect(lp);
      osc.start(0);
    }
  }
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// MOTION — the relentless arp. A bright detuned saw+square pluck an octave up,
// through a fast-closing resonant lowpass so each 16th is a crisp, glassy blip
// that machine-guns cleanly. This is the voice that never stops in synthwave.
// ---------------------------------------------------------------------------
async function synthArp(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.35);
  const base = rootHz * 2;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = base;
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  o2.frequency.value = base;
  o2.detune.value = 8;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(6000, 0);
  lp.frequency.exponentialRampToValueAtTime(1100, 0.14);
  lp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.45, 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, 0.28);
  const o2g = ctx.createGain();
  o2g.gain.value = 0.45;
  o.connect(lp);
  o2.connect(o2g).connect(lp);
  lp.connect(g).connect(ctx.destination);
  o.start(0);
  o2.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// MELODY (1) — the soaring lead. Two detuned saws + a detuned square give the
// fat, wide, singing lead tone; a triangle an octave down fills the body so it
// carries weight. A bright lowpass that only partly closes keeps it cutting.
// ---------------------------------------------------------------------------
async function synthLead(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const f = rootHz * 2;
  const o1 = ctx.createOscillator();
  o1.type = 'sawtooth';
  o1.frequency.value = f;
  const o2 = ctx.createOscillator();
  o2.type = 'sawtooth';
  o2.frequency.value = f;
  o2.detune.value = 10;
  const o3 = ctx.createOscillator();
  o3.type = 'square';
  o3.frequency.value = f;
  o3.detune.value = -8;
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.value = rootHz; // octave-down fill for weight
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2;
  lp.frequency.setValueAtTime(5200, 0);
  lp.frequency.exponentialRampToValueAtTime(1600, 0.4);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.4, 0.01);
  g.gain.setValueAtTime(0.4, 0.35);
  g.gain.exponentialRampToValueAtTime(0.001, 0.55);
  const o2g = ctx.createGain();
  o2g.gain.value = 0.5;
  const o3g = ctx.createGain();
  o3g.gain.value = 0.4;
  const bodyG = ctx.createGain();
  bodyG.gain.value = 0.28;
  o1.connect(lp);
  o2.connect(o2g).connect(lp);
  o3.connect(o3g).connect(lp);
  body.connect(bodyG).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  o1.start(0);
  o2.start(0);
  o3.start(0);
  body.start(0);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// MELODY (2) — the glassy FM bell (DX7 lineage). A sine carrier frequency-
// modulated by an inharmonic sine (ratio ~1.41). The modulation index is huge
// at the attack (bright, metallic, clangorous) then decays fast, so the bell
// starts glassy and mellows to a pure ping — the classic 80s digital bell.
// ---------------------------------------------------------------------------
async function synthBell(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.9);
  const carrierF = rootHz * 2; // an octave up: the sparkly top voice
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = carrierF;
  const mod = ctx.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = carrierF * 1.41; // inharmonic ratio = bell timbre
  const modIndex = ctx.createGain();
  modIndex.gain.setValueAtTime(carrierF * 4, 0); // bright, clangorous attack
  modIndex.gain.exponentialRampToValueAtTime(carrierF * 0.05, 0.35); // mellow tail
  mod.connect(modIndex).connect(carrier.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, 0.8);
  carrier.connect(g).connect(ctx.destination);
  // Soft mallet strike: a tiny highpassed noise tick for physical contact.
  const strike = ctx.createBufferSource();
  strike.buffer = noiseBuffer(ctx, 0.006);
  const shp = ctx.createBiquadFilter();
  shp.type = 'highpass';
  shp.frequency.value = 6000;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.1, 0);
  sg.gain.exponentialRampToValueAtTime(0.001, 0.006);
  strike.connect(shp).connect(sg).connect(ctx.destination);
  mod.start(0);
  carrier.start(0);
  strike.start(0);
  mod.stop(0.85);
  carrier.stop(0.85);
  return ctx.startRendering();
}

// ---------------------------------------------------------------------------
// FX — a big, bright crash (phrase accents) and a rising noise sweep (the
// auto-dash wind-up). The crash leans bright/splashy to match the gated snare's
// plate-verb character; both are choked by ROLE_META so repeats don't stack.
// ---------------------------------------------------------------------------
async function synthCrash(): Promise<AudioBuffer> {
  const ctx = offline(1.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, 0.005);
  g.gain.exponentialRampToValueAtTime(0.07, 0.28);
  g.gain.exponentialRampToValueAtTime(0.001, 1.2);
  g.connect(ctx.destination);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.3);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 0.4;
  const nGain = ctx.createGain();
  nGain.gain.value = 0.85;
  n.connect(hp).connect(bp).connect(nGain).connect(g);
  // Inharmonic metal partials for a shimmering pitched core.
  const base = 680;
  for (const mult of [1, 1.41, 1.87, 2.53, 3.34, 4.37]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = base * mult;
    const og = ctx.createGain();
    og.gain.value = 0.028;
    o.connect(og).connect(g);
    o.start(0);
    o.stop(1.3);
  }
  n.start(0);
  return ctx.startRendering();
}

async function synthRiser(): Promise<AudioBuffer> {
  const dur = 0.85;
  const ctx = offline(dur + 0.05);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(700, 0);
  bp.frequency.exponentialRampToValueAtTime(11000, dur); // rising sweep
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, dur * 0.92); // swell to the top
  g.gain.exponentialRampToValueAtTime(0.001, dur); // cut on the hit
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

export async function buildSynthwaveKit(rootHz: number): Promise<Map<Role, Kit>> {
  const kits = new Map<Role, Kit>();
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
    arp,
    lead,
    bell,
    crash,
    riser,
  ] = await Promise.all([
    synthKick(true),
    synthKick(false),
    synthSnare(),
    synthClap(),
    synthHat(false),
    synthHat(true),
    synthBass(rootHz),
    synthBassFat(rootHz),
    synthBassSub(rootHz),
    synthChord(rootHz, false),
    synthChord(rootHz, true),
    synthArp(rootHz),
    synthLead(rootHz),
    synthBell(rootHz),
    synthCrash(),
    synthRiser(),
  ]);

  kits.set('kick', makeKit('kick', new Map([['hard', kickHard], ['soft', kickSoft]])));
  // The snare role carries a 'clap' variant too (auditionable in the room, never
  // charted here — the charted backbeat is the gated 'snare'). We reuse the same
  // bright clap render so both slots sound like one 80s kit.
  kits.set('snare', makeKit('snare', new Map([['snare', snare], ['clap', clap]])));
  kits.set('clap', makeKit('clap', new Map([['clap', clap]])));
  kits.set('hat', makeKit('hat', new Map([['closed', hatClosed], ['open', hatOpen]])));
  kits.set('bass', makeKit('bass', new Map([['bass', bass], ['fat', bassFat], ['sub', bassSub]])));
  kits.set('chord', makeKit('chord', new Map([['stab', stab], ['pad', pad]])));
  kits.set('arp', makeKit('arp', new Map([['arp', arp]])));
  kits.set('lead', makeKit('lead', new Map([['lead', lead]])));
  kits.set('bell', makeKit('bell', new Map([['bell', bell]])));
  kits.set('crash', makeKit('crash', new Map([['crash', crash]])));
  kits.set('riser', makeKit('riser', new Map([['riser', riser]])));
  return kits;
}
