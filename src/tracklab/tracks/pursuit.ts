// "Pursuit" — Gesaffelstein (Aleph, 2013). 109 BPM, A minor with a
// chromatic bite: the stab riff grinds C against C# over a relentless A1
// sub pulse. Straight 16ths, zero swing, everything over-compressed; the
// glue is hard bass-to-kick sidechain pumping.
//
// Transcription provenance (research dossier, July 2026): note-level
// patterns extracted from a Songsterr Guitar Pro transcription (5 tracks,
// data files parsed), tempo cross-checked against the official audio's
// bar-sync points (112 bars / 244s = 109 BPM). The track's signature
// arrangement trick is sourced, not inferred: every 8th bar of a drop, ALL
// drums cut for exactly one bar while the riff transposes up a minor third
// (A root -> C root), then slams back in. Sections here follow the tab's
// 8-bar groups: intro → build → drop → drop var → breakdown.

import { drone, fetchSample, growingOneShot, metalStab, noteHz, variants, whistle } from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const SAMPLE = '/samples/covers/featured/pursuit/';

// Riff lane, split per the tab: bass = A1 pulses (root 0, turnaround +3 =
// C2), stab = C3-family hits (0 = C3, +1 = C#3, +3 = D#3, +4 = E3).

// Pattern A (intro/build). Stab steps with their notes; bass fills the rest.
const STAB_A: [number, number][] = [
  [0, 0],
  [3, 1],
  [6, 0],
  [8, 0],
  [11, 1],
  [14, 0],
];
const BASS_A = [1, 2, 4, 5, 7, 9, 10, 12, 13, 15];

// Pattern B (drops): displaced 3-3-2 stabs, pure minor third, no C#.
const STAB_B: [number, number][] = [
  [1, 0],
  [4, 0],
  [7, 0],
  [9, 0],
  [12, 0],
  [15, 0],
];
const BASS_B = [0, 2, 3, 5, 6, 8, 10, 11, 13, 14];

// Drop turnaround bar (drums silent): C-root riff.
const STAB_T: [number, number][] = [
  [1, 3],
  [4, 4],
  [7, 3],
  [10, 4],
  [13, 3],
  [15, 3],
];
const BASS_T = [0, 2, 3, 5, 6, 8, 9, 11, 12, 14];

function riff(
  pattern: 'A' | 'B',
): { bass: LabChart; stab: LabChart } {
  const bassEvents: LabChartEvent[] = [];
  const stabEvents: LabChartEvent[] = [];
  const bassSteps = pattern === 'A' ? BASS_A : BASS_B;
  const stabSteps = pattern === 'A' ? STAB_A : STAB_B;
  for (let bar = 0; bar < 7; bar++) {
    for (const s of bassSteps) bassEvents.push({ step: bar * 16 + s, velocity: 0.85, note: 0 });
    for (const [s, n] of stabSteps) stabEvents.push({ step: bar * 16 + s, velocity: 0.95, note: n });
  }
  // Bar 8: the turnaround. Same rhythm a minor third up for the bass; the
  // stabs move to D#/E. In the intro the tab only marks the second half.
  if (pattern === 'A') {
    for (const s of BASS_A) bassEvents.push({ step: 7 * 16 + s, velocity: 0.85, note: 3 });
    for (const [s, n] of [
      [8, 3],
      [11, 4],
      [14, 3],
    ] as const) {
      stabEvents.push({ step: 7 * 16 + s, velocity: 0.9, note: n });
    }
  } else {
    for (const s of BASS_T) bassEvents.push({ step: 7 * 16 + s, velocity: 0.85, note: 3 });
    for (const [s, n] of STAB_T) stabEvents.push({ step: 7 * 16 + s, velocity: 0.9, note: n });
  }
  return { bass: { bars: 8, events: bassEvents }, stab: { bars: 8, events: stabEvents } };
}

const riffA = riff('A');
const riffB = riff('B');

// Drums. Drop charts are 8 bars so bar 8 can be SILENT (the sourced cut).
function dropDrums(variation: boolean): { kick: LabChart; clap: LabChart; hats: LabChart } {
  const kick: LabChartEvent[] = [];
  const clap: LabChartEvent[] = [];
  const hats: LabChartEvent[] = [];
  for (let bar = 0; bar < 7; bar++) {
    for (const s of [0, 4, 8, 12]) kick.push({ step: bar * 16 + s, velocity: 1.0 });
    for (const s of [4, 12]) clap.push({ step: bar * 16 + s, velocity: 0.9 });
    if (!variation) {
      // pairs of 16ths pulling into every beat: t-k-DUN
      for (const s of [2, 3, 6, 7, 10, 11, 14, 15]) {
        hats.push({ step: bar * 16 + s, velocity: s % 4 === 3 ? 0.5 : 0.35, variant: 'closed' });
      }
    } else {
      for (const s of [1, 3, 9, 11, 14]) hats.push({ step: bar * 16 + s, velocity: 0.45, variant: 'closed' });
      for (const s of [6, 15]) hats.push({ step: bar * 16 + s, velocity: 0.6, variant: 'splash' });
    }
  }
  return {
    kick: { bars: 8, events: kick },
    clap: { bars: 8, events: clap },
    hats: { bars: 8, events: hats },
  };
}

const drop1 = dropDrums(false);
const drop2 = dropDrums(true);

const tickChart = hits(1, [
  [0, 4, 0.5],
  [0, 12, 0.5],
]);

const introClap = hits(1, [
  [0, 4, 0.9],
  [0, 12, 0.9],
]);

// Drone re-attacks every two bars (tied whole notes in the tab).
const droneChart = hits(8, [
  [0, 0, 0.8, 0],
  [2, 0, 0.8, 0],
  [4, 0, 0.8, 0],
  [6, 0, 0.8, 0],
]);

// Breakdown: sourced 4-bar drum pattern (played twice per 8), riff with
// gaps and quiet ghost notes, and the detuned whistle wobbling A#4/A4.
function breakdownDrums(): { kick: LabChart; clap: LabChart; hats: LabChart } {
  const kick: LabChartEvent[] = [];
  const clap: LabChartEvent[] = [];
  const hats: LabChartEvent[] = [];
  for (let half = 0; half < 2; half++) {
    const b = half * 4 * 16;
    // bar 1
    kick.push({ step: b + 0, velocity: 0.95 }, { step: b + 8, velocity: 0.9 }, { step: b + 9, velocity: 0.8 });
    clap.push({ step: b + 4, velocity: 0.85 }, { step: b + 12, velocity: 0.85 });
    hats.push({ step: b + 5, velocity: 0.45, variant: 'closed' }, { step: b + 6, velocity: 0.55, variant: 'splash' });
    hats.push({ step: b + 13, velocity: 0.45, variant: 'closed' }, { step: b + 14, velocity: 0.55, variant: 'splash' });
    // bars 2-3: kick doubled at the top
    for (const bar of [1, 2]) {
      const o = b + bar * 16;
      kick.push({ step: o + 0, velocity: 0.95 }, { step: o + 1, velocity: 0.8 }, { step: o + 8, velocity: 0.9 }, { step: o + 9, velocity: 0.8 });
      clap.push({ step: o + 4, velocity: 0.85 }, { step: o + 12, velocity: 0.85 });
      hats.push({ step: o + 5, velocity: 0.45, variant: 'closed' }, { step: o + 6, velocity: 0.55, variant: 'splash' });
      hats.push({ step: o + 13, velocity: 0.45, variant: 'closed' }, { step: o + 14, velocity: 0.55, variant: 'splash' });
    }
    // bar 4: fill
    const f = b + 3 * 16;
    kick.push({ step: f + 0, velocity: 0.95 }, { step: f + 1, velocity: 0.8 }, { step: f + 10, velocity: 0.85 });
    clap.push({ step: f + 4, velocity: 0.85 }, { step: f + 8, velocity: 0.8 }, { step: f + 12, velocity: 0.85 });
    hats.push({ step: f + 5, velocity: 0.45, variant: 'closed' }, { step: f + 6, velocity: 0.55, variant: 'splash' });
  }
  return {
    kick: { bars: 8, events: kick },
    clap: { bars: 8, events: clap },
    hats: { bars: 8, events: hats },
  };
}

const bdDrums = breakdownDrums();

const bdBass = hits(1, [
  [0, 0, 0.85, 0],
  [0, 3, 0.4, 0],
  [0, 4, 0.85, 0],
  [0, 6, 0.85, 0],
  [0, 11, 0.4, 0],
  [0, 12, 0.85, 0],
  [0, 14, 0.4, 0],
  [0, 15, 0.85, 0],
]);

const bdStab = hits(1, [
  [0, 1, 0.9, 0],
  [0, 2, 0.85, 0],
  [0, 7, 0.9, 0],
  [0, 9, 0.85, 0],
  [0, 10, 0.85, 0],
]);

const whistleChart = hits(1, [
  [0, 0, 0.8, 0],
  [0, 2, 0.7, -1],
  [0, 6, 0.7, -1],
  [0, 8, 0.8, 0],
  [0, 10, 0.7, -1],
  [0, 14, 0.7, -1],
]);

export const PURSUIT: LabTrack = {
  id: 'pursuit',
  title: 'Pursuit',
  artist: 'Gesaffelstein',
  genre: 'dark techno / EBM',
  bpm: 109,
  bars: 8,
  swing: 0,
  pump: { amount: 0.55, release: 0.24 },
  humanizeGain: 0,
  humanizeCents: 0,
  notes:
    'Note-level patterns sourced from a full fan transcription. The signature move is built in: in ' +
    'the drop sections, bar 8 cuts all drums for one bar while the riff climbs a minor third, then ' +
    'slams back. Real processed machine hits replace the thin synthetic drums, and timing is fully ' +
    'deterministic. Sections: intro → build → drop → drop var → breakdown.',
  arrangement: [
    { sectionId: 'intro', bars: 8 },
    { sectionId: 'build', bars: 8 },
    { sectionId: 'drop', bars: 16 },
    { sectionId: 'dropvar', bars: 16 },
    { sectionId: 'breakdown', bars: 8 },
  ],
  voices: [
    {
      id: 'kick',
      name: 'Kick (distorted)',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: (ctx) =>
        fetchSample(ctx, SAMPLE + 'kick.wav').then((b) =>
          growingOneShot(b, 'kick', [620, 1900, 5200]),
        ),
    },
    {
      id: 'clap',
      name: 'Industrial clap',
      color: '#ffc93c',
      pitched: false,
      build: (ctx) =>
        fetchSample(ctx, SAMPLE + 'clap.wav').then((b) =>
          growingOneShot(b, 'clap', [1250, 3600, 8800]),
        ),
    },
    {
      id: 'tick',
      name: 'Tick perc',
      color: '#8fb7ff',
      pitched: false,
      gain: 0.8,
      build: (ctx) =>
        fetchSample(ctx, SAMPLE + 'hat_closed.wav').then((b) => variants([['tick', b]])),
    },
    {
      id: 'hats',
      name: 'Hats',
      color: '#3ce0ff',
      pitched: false,
      ducked: true,
      gain: 0.85,
      build: async (ctx) =>
        variants([
          ['closed', await fetchSample(ctx, SAMPLE + 'hat_closed.wav')],
          ['splash', await fetchSample(ctx, SAMPLE + 'hat_splash.wav')],
        ]),
    },
    {
      id: 'bass',
      name: 'Sub pulse (A1)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.9,
      noteRows: [3, 0],
      tune: -3,
      build: (ctx) =>
        fetchSample(ctx, SAMPLE + 'bass_c.wav').then((b) => variants([['sub', b]])),
    },
    {
      id: 'stab',
      name: 'Metal stab (C3)',
      color: '#ff6bd6',
      pitched: true,
      ducked: true,
      noteRows: [4, 3, 1, 0],
      build: async () =>
        variants([
          [
            'stab',
            await metalStab({
              rootHz: noteHz('C3'),
              decay: 0.2,
              drive: 8.5,
              bpHz: 860,
              noise: 0.16,
            }),
          ],
        ]),
    },
    {
      id: 'drone',
      name: 'Siren drone (D#)',
      color: '#9dff3c',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.7,
      noteRows: [0],
      build: async () => variants([['drone', await drone({ rootHz: noteHz('D#4'), seconds: 4.6 })]]),
    },
    {
      id: 'whistle',
      name: 'Whistle (breakdown)',
      color: '#ffffff',
      pitched: true,
      choke: true,
      gain: 0.85,
      noteRows: [0, -1],
      build: async () => variants([['whistle', await whistle({ rootHz: noteHz('A#4'), decay: 0.5 })]]),
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'intro',
      charts: { tick: tickChart, bass: riffA.bass, stab: riffA.stab, drone: droneChart },
    },
    {
      id: 'build',
      name: 'build',
      charts: { tick: tickChart, clap: introClap, bass: riffA.bass, stab: riffA.stab, drone: droneChart },
    },
    {
      id: 'drop',
      name: 'drop',
      charts: { kick: drop1.kick, clap: drop1.clap, hats: drop1.hats, bass: riffB.bass, stab: riffB.stab },
    },
    {
      id: 'dropvar',
      name: 'drop var',
      charts: { kick: drop2.kick, clap: drop2.clap, hats: drop2.hats, bass: riffB.bass, stab: riffB.stab },
    },
    {
      id: 'breakdown',
      name: 'breakdown',
      charts: {
        kick: bdDrums.kick,
        clap: bdDrums.clap,
        hats: bdDrums.hats,
        bass: bdBass,
        stab: bdStab,
        whistle: whistleChart,
      },
    },
  ],
};
