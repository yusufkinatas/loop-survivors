// Sound kits: the atomic unit of a weapon is a kit plus a chart
// (docs/plan.md, "Weapons as sound"). A kit is a small family of related
// samples. M1 ships with synthesized placeholder samples rendered offline at
// startup so the rehearsal room works out of the box; real CC0 pack samples
// are auditioned in the room by loading files over these slots. Pitched kits
// hold one sample at the root and get note variants by playback-rate shifting.

// The soundset: twelve instrument types. Genres reuse this exact set of
// tools; a genre only changes how they are played (tempo, swing, patterns).
// Six drums/fx (unpitched) and six pitched voices.
export type Role =
  | 'kick'
  | 'snare'
  | 'hat'
  | 'bass'
  | 'chord'
  | 'lead'
  | 'clap'
  | 'tom'
  | 'cowbell'
  | 'arp'
  | 'zap'
  | 'crash'
  // The band, sub-phase B — the first damage hires (docs/phases/the-band.md).
  | 'rimshot';

export const ROLES: readonly Role[] = [
  'kick',
  'snare',
  'hat',
  'clap',
  'tom',
  'cowbell',
  'crash',
  'zap',
  'bass',
  'chord',
  'arp',
  'lead',
  'rimshot',
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

async function renderRimshot(): Promise<AudioBuffer> {
  // Dry woody "tock": a short square body with a fast pitch drop, plus a bright
  // click transient. No tail — the sharp answering hit on the off-counts.
  const ctx = offline(0.14);
  const tone = ctx.createOscillator();
  tone.type = 'square';
  tone.frequency.setValueAtTime(440, 0);
  tone.frequency.exponentialRampToValueAtTime(300, 0.03);
  const tGain = ctx.createGain();
  tGain.gain.setValueAtTime(0.5, 0);
  tGain.gain.exponentialRampToValueAtTime(0.001, 0.07);
  tone.connect(tGain).connect(ctx.destination);
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.06);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 1.6;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.5, 0);
  nGain.gain.exponentialRampToValueAtTime(0.001, 0.05);
  noise.connect(bp).connect(nGain).connect(ctx.destination);
  tone.start(0);
  noise.start(0);
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
  osc.connect(oscG).connect(lp);
  osc2.connect(osc2G).connect(lp);
  lp.connect(g).connect(ctx.destination);
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

// A pitched mid-drum. Sine+triangle body with a short pitch drop and a noise
// attack, so a tom melody (fills, hip-hop/DnB rolls) reads as pitched but hits
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

// The classic 808 cowbell: two detuned square waves a ~1.48 ratio apart
// through a bandpass. Pitched so hip-hop cowbell riffs land on the note set.
async function renderCowbell(rootHz: number): Promise<AudioBuffer> {
  const ctx = offline(0.5);
  const base = rootHz * 2;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = base * 1.4;
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.6, 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, 0.35);
  bp.connect(g).connect(ctx.destination);
  for (const f of [base, base * 1.48]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = 0.5;
    o.connect(og).connect(bp);
    o.start(0);
  }
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

// An electric zap: a fast-falling saw through a bandpass with a highpassed
// noise crackle. Reads as a lightning snap.
async function renderZap(): Promise<AudioBuffer> {
  const ctx = offline(0.28);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(1900, 0);
  osc.frequency.exponentialRampToValueAtTime(210, 0.14);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.6, 0);
  g.gain.exponentialRampToValueAtTime(0.001, 0.16);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.12);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.3, 0);
  ng.gain.exponentialRampToValueAtTime(0.001, 0.1);
  osc.connect(bp).connect(g).connect(ctx.destination);
  n.connect(hp).connect(ng).connect(ctx.destination);
  osc.start(0);
  n.start(0);
  return ctx.startRendering();
}

// A cymbal crash: bright filtered white noise with a long tail. Choked so
// repeated crashes don't stack into a wash.
async function renderCrash(): Promise<AudioBuffer> {
  const ctx = offline(1.5);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 1.5);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 9000;
  bp.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.5, 0.005);
  g.gain.exponentialRampToValueAtTime(0.06, 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, 1.35);
  n.connect(hp).connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

/** Render every builtin kit. Called once at startup. */
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
    cowbell,
    arp,
    zap,
    crash,
    rimshot,
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
    renderCowbell(rootHz),
    renderArp(rootHz),
    renderZap(),
    renderCrash(),
    renderRimshot(),
  ]);

  const kits = new Map<Role, Kit>();
  const add = (
    role: Role,
    name: string,
    color: string,
    pitched: boolean,
    entries: [string, AudioBuffer][],
    choke = false,
  ) => {
    kits.set(role, {
      role,
      name,
      color,
      pitched,
      choke,
      samples: new Map(entries),
      defaultVariant: entries[0][0],
    });
  };

  add('kick', 'Kick', '#ff5a3c', false, [
    ['hard', kickHard],
    ['soft', kickSoft],
  ]);
  add('snare', 'Snare', '#ffc93c', false, [
    ['snare', snare],
    ['clap', clap], // auditionable in the room, never charted
  ]);
  add('hat', 'Hi-hat', '#3ce0ff', false, [
    ['closed', hatClosed],
    ['open', hatOpen],
  ]);
  add(
    'bass',
    'Bass',
    '#a06bff',
    true,
    [
      ['bass', bass],
      ['fat', bassFat], // tier 3+ weight
      ['sub', bassSub], // tier 4 once-per-phrase drop
    ],
    true,
  );
  add('chord', 'Chord', '#4dff88', true, [
    ['stab', stab],
    ['pad', pad],
  ]);
  add('lead', 'Lead', '#ff6bd6', true, [['lead', lead]]);
  add('clap', 'Clap', '#ff4f7d', false, [['clap', clap]]);
  add('tom', 'Tom', '#d08a4a', true, [['tom', tom]], true);
  add('cowbell', 'Cowbell', '#c7f24a', true, [['cowbell', cowbell]]);
  add('arp', 'Arp', '#33e6c2', true, [['arp', arp]]);
  add('zap', 'Zap', '#66b3ff', false, [['zap', zap]]);
  add('crash', 'Crash', '#b9c2dd', false, [['crash', crash]], true);
  add('rimshot', 'Rimshot', '#ff8f5e', false, [['rimshot', rimshot]]);
  return kits;
}
