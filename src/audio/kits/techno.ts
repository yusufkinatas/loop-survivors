// Techno kit — 130 BPM warehouse voicing of the soundset. Cold, mechanical,
// hypnotic. The identity is a relentless four-on-floor kick with real drive, a
// bright cutting 909-style hat for the signature offbeat, a screaming resonant
// 303 acid, dark detuned stabs, a tight rubbery driving bass, and a growling
// low rumble. Every voice is engineered darker/harder than the neutral builtin
// so the genre reads unmistakably as techno rather than a re-EQ of house/lofi.
//
// Supported set (12 roles, all eight band slots represented):
//   Pulse: kick | Backbeat: clap, rimshot | Hats: hat, ride | Motion: acid
//   FX: crash, riser | Bass: bass, reese | Harmony: chord | Melody: lead
// Dropped as off-genre: snare, tom, heartbeat, shaker, cowbell, arp, zap,
// pluck, rhodes, choir, bell, whistle.

import { makeKit, noiseBuffer, offline, softClipCurve, type Kit, type Role } from '../kits';

// --- Pulse -----------------------------------------------------------------

// Four-on-floor warehouse kick: a fast pitch drop landing on a solid ~48 Hz
// sub, harder saturation than a clean kick for the driving edge, and a tight
// high click so it cuts on any system. Hard = the pulse; soft = a quieter
// ghost/pickup. Weightier and grittier than a DnB kick, tighter than a Lo-Fi one.
async function technoKick(hard: boolean): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(hard ? 190 : 150, 0);
  body.frequency.exponentialRampToValueAtTime(hard ? 55 : 50, 0.04);
  body.frequency.exponentialRampToValueAtTime(hard ? 48 : 46, 0.18);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(hard ? 1.0 : 0.72, 0);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, hard ? 0.34 : 0.26);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(hard ? 3.0 : 1.8); // warehouse grit
  body.connect(bodyGain).connect(drive).connect(ctx.destination);
  // Tight click transient (short, high) so the four-on-floor snaps.
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.006);
  const clickHp = ctx.createBiquadFilter();
  clickHp.type = 'highpass';
  clickHp.frequency.value = 2600;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(hard ? 0.35 : 0.18, 0);
  clickGain.gain.exponentialRampToValueAtTime(0.001, 0.006);
  click.connect(clickHp).connect(clickGain).connect(ctx.destination);
  body.start(0);
  click.start(0);
  return ctx.startRendering();
}

// --- Backbeat --------------------------------------------------------------

// Bright, tight techno clap: a burst cluster of highpassed noise smacks through
// a bandpass "smack" formant, then a short bright decaying band for the
// warehouse spring-verb sheen. Brighter and a touch longer-tailed than the
// neutral clap.
async function technoClap(): Promise<AudioBuffer> {
  const ctx = offline(0.4);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 1.2;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1100;
  bp.connect(hp).connect(ctx.destination);
  for (const [at, level, dur] of [
    [0, 0.6, 0.01],
    [0.008, 0.65, 0.01],
    [0.017, 0.6, 0.01],
    [0.027, 0.7, 0.16],
  ] as const) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(g).connect(bp);
    src.start(at);
  }
  // Bright reverb-tail band for the warehouse sheen.
  const tail = ctx.createBufferSource();
  tail.buffer = noiseBuffer(ctx, 0.3);
  const tbp = ctx.createBiquadFilter();
  tbp.type = 'bandpass';
  tbp.frequency.value = 2200;
  tbp.Q.value = 0.8;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, 0.03);
  tg.gain.linearRampToValueAtTime(0.16, 0.05);
  tg.gain.exponentialRampToValueAtTime(0.001, 0.32);
  tail.connect(tbp).connect(tg).connect(ctx.destination);
  tail.start(0);
  return ctx.startRendering();
}

// Dry mechanical "tick": a short high square body with a fast pitch drop plus a
// sharp bandpassed noise crack, no tail — the hypnotic offbeat pulse.
async function technoRimshot(): Promise<AudioBuffer> {
  const ctx = offline(0.12);
  const tone = ctx.createOscillator();
  tone.type = 'square';
  tone.frequency.setValueAtTime(520, 0);
  tone.frequency.exponentialRampToValueAtTime(340, 0.02);
  const tGain = ctx.createGain();
  tGain.gain.setValueAtTime(0.45, 0);
  tGain.gain.exponentialRampToValueAtTime(0.001, 0.05);
  tone.connect(tGain).connect(ctx.destination);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.04);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2900;
  bp.Q.value = 2.0;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.5, 0);
  nGain.gain.exponentialRampToValueAtTime(0.001, 0.035);
  noise.connect(bp).connect(nGain).connect(ctx.destination);
  tone.start(0);
  tone.stop(0.06);
  noise.start(0);
  return ctx.startRendering();
}

// --- Hats ------------------------------------------------------------------

// Bright, hard 909-style metallic hat. Closed = a crisp tick; open = a long
// sizzling ring for the signature offbeat "tss". Very bright (steep 8.8k
// highpass + a 12k presence peak) so offbeat hats cut through the four-on-floor.
async function technoHat(open: boolean): Promise<AudioBuffer> {
  const dur = open ? 0.32 : 0.045;
  const ctx = offline(dur + 0.05);
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.3 : 0.4, 0);
  g.gain.exponentialRampToValueAtTime(open ? 0.06 : 0.001, open ? 0.05 : dur);
  if (open) g.gain.exponentialRampToValueAtTime(0.001, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8800;
  const peak = ctx.createBiquadFilter();
  peak.type = 'peaking';
  peak.frequency.value = 12000;
  peak.Q.value = 1.4;
  peak.gain.value = 7;
  hp.connect(peak).connect(g).connect(ctx.destination);
  const base = 340;
  for (const mult of [1, 1.35, 1.8, 2.44, 3.21, 4.15]) {
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

// Cold metallic ride ping that rings out: inharmonic square partials + a bright
// noise wash. Darker and tighter than a jazz ride — a warehouse ride that also
// serves the freeze-sweep utility.
async function technoRide(): Promise<AudioBuffer> {
  const ctx = offline(0.8);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 6000;
  bp.Q.value = 0.6;
  bp.connect(ctx.destination);
  const base = 520;
  const partials: [number, number][] = [
    [1, 0.2],
    [1.42, 0.13],
    [1.86, 0.11],
    [2.38, 0.12],
    [3.24, 0.09],
    [4.2, 0.07],
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
    o.stop(0.8);
  }
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.8);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7800;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, 0);
  ng.gain.exponentialRampToValueAtTime(0.11, 0.004);
  ng.gain.exponentialRampToValueAtTime(0.02, 0.18);
  ng.gain.exponentialRampToValueAtTime(0.001, 0.75);
  n.connect(hp).connect(ng).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

// --- Motion ----------------------------------------------------------------

// The star. Aggressive squelchy 303: a sawtooth through a very-high-resonance
// lowpass that sweeps down, hammered by saturation so the resonant peak screams
// and the harmonics stay alive. Rendered at the root (mid register) so a chart
// note reads as a dark, rubbery, vocal acid blip.
async function technoAcid(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.32);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 18; // screaming resonance
  lp.frequency.setValueAtTime(rootHz * 8, 0);
  lp.frequency.exponentialRampToValueAtTime(rootHz * 1.05, 0.2);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(3.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.28);
  osc.connect(lp).connect(drive).connect(g).connect(ctx.destination);
  osc.start(0);
  osc.stop(0.3);
  return ctx.startRendering();
}

// --- FX --------------------------------------------------------------------

// Dark warehouse crash: a broadband noise roar plus an inharmonic metal core,
// a touch shorter and darker than a bright pop crash. Choked, so phrase-level
// accents don't wash together.
async function technoCrash(): Promise<AudioBuffer> {
  const ctx = offline(1.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.42, 0.005);
  g.gain.exponentialRampToValueAtTime(0.06, 0.28);
  g.gain.exponentialRampToValueAtTime(0.001, 1.2);
  g.connect(ctx.destination);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.3);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 8000;
  bp.Q.value = 0.4;
  const nGain = ctx.createGain();
  nGain.gain.value = 0.85;
  n.connect(hp).connect(bp).connect(nGain).connect(g);
  const base = 560;
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

// Reversed-cymbal swell: bandpassed noise whose gain ramps up into a cut and
// whose passband sweeps up, so it anticipates the downbeat — the auto-dash's
// wind-up.
async function technoRiser(): Promise<AudioBuffer> {
  const dur = 0.85;
  const ctx = offline(dur + 0.05);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(500, 0);
  bp.frequency.exponentialRampToValueAtTime(9500, dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, dur * 0.92);
  g.gain.exponentialRampToValueAtTime(0.001, dur);
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

// --- Bass ------------------------------------------------------------------

// Driving offbeat techno bass: a saw through a resonant lowpass that closes
// fast (a tight rubbery "tuck") over a modest sine sub, with light drive. Kept
// deliberately upper-bass focused and short so it locks around the kick's sub
// on the offbeats instead of masking it.
async function technoBass(rootHz: number): Promise<AudioBuffer> {
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
  lp.frequency.exponentialRampToValueAtTime(180, 0.18);
  lp.Q.value = 6;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.6, 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, 0.32);
  const subG = ctx.createGain();
  subG.gain.value = 0.4; // modest sub, leaves the kick room
  osc.connect(lp).connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  osc.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// Tier-3+ weight: a saw+detuned-square pair, more grit and a slower filter
// close, more sub. Same driving line, fatter.
async function technoBassFat(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz / 4;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = rootHz / 4;
  osc2.detune.value = 8;
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1600, 0);
  lp.frequency.exponentialRampToValueAtTime(160, 0.28);
  lp.Q.value = 6;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(3.0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.72, 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, 0.4);
  const oscG = ctx.createGain();
  oscG.gain.value = 0.6;
  const osc2G = ctx.createGain();
  osc2G.gain.value = 0.3;
  const subG = ctx.createGain();
  subG.gain.value = 0.5;
  osc.connect(oscG).connect(lp);
  osc2.connect(osc2G).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  sub.connect(subG).connect(g);
  osc.start(0);
  osc2.start(0);
  sub.start(0);
  return ctx.startRendering();
}

// The tier-4 once-per-phrase drop: a long pitch-falling sine that lands like a
// weight hitting the floor, with a short click so it has an attack. Placed on an
// offbeat in the chart so it never stacks on the downbeat kick.
async function technoBassSub(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(1.2);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rootHz / 2, 0);
  osc.frequency.exponentialRampToValueAtTime(rootHz / 8, 0.3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.9, 0.01);
  g.gain.setValueAtTime(0.9, 0.5);
  g.gain.exponentialRampToValueAtTime(0.001, 1.1);
  const click = ctx.createBufferSource();
  click.buffer = noiseBuffer(ctx, 0.008);
  const clickG = ctx.createGain();
  clickG.gain.setValueAtTime(0.22, 0);
  clickG.gain.exponentialRampToValueAtTime(0.001, 0.008);
  osc.connect(g).connect(ctx.destination);
  click.connect(clickG).connect(ctx.destination);
  osc.start(0);
  click.start(0);
  return ctx.startRendering();
}

// Dark warehouse rumble: four hard-detuned saws grinding against each other
// through a resonant lowpass, saturated into a monster, with a clean sine sub
// underneath. Less wobble than a DnB Reese — a slow, shallow filter drift for a
// steadier static grind that sits under the pulse.
async function technoReese(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(700, 0);
  lp.frequency.exponentialRampToValueAtTime(220, 0.45);
  lp.Q.value = 6;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 3.0;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 70; // shallow drift, not a wobble
  lfo.connect(lfoGain).connect(lp.frequency);
  lfo.start(0);
  lfo.stop(0.58);
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(2.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.7, 0.015);
  g.gain.setValueAtTime(0.7, 0.34);
  g.gain.exponentialRampToValueAtTime(0.001, 0.55);
  lp.connect(drive).connect(g).connect(ctx.destination);
  for (const det of [-18, -6, 6, 18]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = rootHz / 4;
    o.detune.value = det;
    const og = ctx.createGain();
    og.gain.value = 0.3;
    o.connect(og).connect(lp);
    o.start(0);
    o.stop(0.58);
  }
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = rootHz / 4;
  const subG = ctx.createGain();
  subG.gain.value = 0.45;
  sub.connect(subG).connect(g);
  sub.start(0);
  sub.stop(0.58);
  return ctx.startRendering();
}

// --- Harmony ---------------------------------------------------------------

// Dark minimal techno chord, quartal voicing (root, +5, +10 semitones — stacked
// fourths stay inside the note set when the chart shifts the whole sample to the
// other allowed chord roots). Stab = short, cold, wide-detuned saws under a low
// lowpass (a dark punch); pad = the same voicing held as a slow dark drone with
// a subtle breathing vibrato. Highpassed to stay clear of the bass.
async function technoChord(rootHz: number, pad: boolean): Promise<AudioBuffer> {
  const dur = pad ? 1.5 : 0.42;
  const ctx = offline(dur + 0.1);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = pad ? 1300 : 1700; // dark
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = pad ? 240 : 200;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.3, pad ? 0.2 : 0.005);
  master.gain.exponentialRampToValueAtTime(0.001, dur);
  lp.connect(hp).connect(master).connect(ctx.destination);
  let vibGain: GainNode | null = null;
  if (pad) {
    const vib = ctx.createOscillator();
    vib.type = 'sine';
    vib.frequency.value = 3.5;
    vibGain = ctx.createGain();
    vibGain.gain.value = rootHz * 0.003;
    vib.connect(vibGain);
    vib.start(0);
  }
  for (const semis of [0, 5, 10]) {
    for (const detune of [-10, 0, 10]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = rootHz * Math.pow(2, semis / 12);
      osc.detune.value = detune;
      if (vibGain) vibGain.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.13;
      osc.connect(g).connect(lp);
      osc.start(0);
    }
  }
  return ctx.startRendering();
}

// --- Melody ----------------------------------------------------------------

// Sparse dark hypnotic lead: a detuned saw+square stab (an octave up) over a
// quiet triangle body for weight, through a resonant lowpass that closes fast,
// with light drive. Cuts through the band but stays cold and edgy, never sweet —
// a stab-hook, not a soaring melody.
async function technoLead(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = rootHz * 2;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = rootHz * 2;
  osc2.detune.value = 10;
  const oscSub = ctx.createOscillator();
  oscSub.type = 'triangle';
  oscSub.frequency.value = rootHz;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4200, 0);
  lp.frequency.exponentialRampToValueAtTime(800, 0.3);
  lp.Q.value = 4;
  const drive = ctx.createWaveShaper();
  drive.curve = softClipCurve(1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.001, 0);
  g.gain.exponentialRampToValueAtTime(0.36, 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, 0.42);
  const g2 = ctx.createGain();
  g2.gain.value = 0.4;
  const gSub = ctx.createGain();
  gSub.gain.value = 0.25;
  osc.connect(lp);
  osc2.connect(g2).connect(lp);
  oscSub.connect(gSub).connect(lp);
  lp.connect(drive).connect(g).connect(ctx.destination);
  osc.start(0);
  osc2.start(0);
  oscSub.start(0);
  return ctx.startRendering();
}

export async function buildTechnoKit(rootHz: number): Promise<Map<Role, Kit>> {
  const [
    kickHard,
    kickSoft,
    clap,
    rimshot,
    hatClosed,
    hatOpen,
    ride,
    acid,
    crash,
    riser,
    bass,
    bassFat,
    bassSub,
    reese,
    chordStab,
    chordPad,
    lead,
  ] = await Promise.all([
    technoKick(true),
    technoKick(false),
    technoClap(),
    technoRimshot(),
    technoHat(false),
    technoHat(true),
    technoRide(),
    technoAcid(rootHz),
    technoCrash(),
    technoRiser(),
    technoBass(rootHz),
    technoBassFat(rootHz),
    technoBassSub(rootHz),
    technoReese(rootHz),
    technoChord(rootHz, false),
    technoChord(rootHz, true),
    technoLead(rootHz),
  ]);

  const kits = new Map<Role, Kit>();
  kits.set('kick', makeKit('kick', new Map([['hard', kickHard], ['soft', kickSoft]])));
  kits.set('clap', makeKit('clap', new Map([['clap', clap]])));
  kits.set('rimshot', makeKit('rimshot', new Map([['rimshot', rimshot]])));
  kits.set('hat', makeKit('hat', new Map([['closed', hatClosed], ['open', hatOpen]])));
  kits.set('ride', makeKit('ride', new Map([['ride', ride]])));
  kits.set('acid', makeKit('acid', new Map([['acid', acid]])));
  kits.set('crash', makeKit('crash', new Map([['crash', crash]])));
  kits.set('riser', makeKit('riser', new Map([['riser', riser]])));
  kits.set('bass', makeKit('bass', new Map([['bass', bass], ['fat', bassFat], ['sub', bassSub]])));
  kits.set('reese', makeKit('reese', new Map([['reese', reese]])));
  kits.set('chord', makeKit('chord', new Map([['stab', chordStab], ['pad', chordPad]])));
  kits.set('lead', makeKit('lead', new Map([['lead', lead]])));
  return kits;
}
