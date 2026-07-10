// "One" — Swedish House Mafia (2010). Development-only instrumental study:
// 126 BPM, D minor, and a short electro hook made from a pitched kick-like
// sound. Reference architecture comes from the original-project walkthrough:
// https://www.youtube.com/watch?v=vLbGrfnRGK4
// Key/tempo/contour were sanity-checked against the community analysis at:
// https://www.hooktheory.com/theorytab/view/swedish-house-mafia/one
// Every grid and timbre below is an ear-built approximation rendered by our
// synth helpers. No master audio, stems, MIDI, vocals, or vocal imitation.

import {
  clap909,
  crash,
  drone,
  hat808,
  housePiano,
  kick808,
  kick909,
  noiseRiser,
  noteHz,
  sub808,
  variants,
} from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const kickChart = hits(1, [
  [0, 0, 1],
  [0, 4, 0.96],
  [0, 8, 1],
  [0, 12, 0.96],
]);

const clapChart = hits(1, [
  [0, 4, 0.92],
  [0, 12, 0.92],
]);

function buildClaps(): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const steps = bar < 6 ? [4, 12] : bar === 6 ? [2, 4, 6, 10, 12, 14] : [0, 2, 4, 6, 8, 10, 12, 14, 15];
    steps.forEach((step, i) => {
      events.push({
        step: bar * 16 + step,
        velocity: Math.min(1, 0.56 + bar * 0.045 + i * 0.018),
      });
    });
  }
  return { bars: 8, events };
}

function hats(dense: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (const step of [2, 6, 10, 14]) {
    events.push({ step, velocity: 0.76, variant: 'open' });
  }
  if (dense) {
    for (const step of [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15]) {
      events.push({ step, velocity: step % 4 === 0 ? 0.44 : 0.29, variant: 'closed' });
    }
  }
  return { bars: 1, events };
}

// The D-D-A-G-F-E-D contour is the recognizable part; the placement and
// turnaround are deliberately compressed into an 8-bar game-ready phrase.
function hook(variant: 'muted' | 'open'): LabChart {
  const a = [
    [0, 0, 1],
    [2, 0, 0.82],
    [6, 7, 0.96],
    [8, 5, 0.9],
    [12, 3, 0.9],
    [14, 2, 0.84],
  ] as const;
  const b = [
    [0, 0, 0.98],
    [3, 0, 0.76],
    [6, 0, 0.84],
    [9, 0, 0.78],
    [12, 0, 0.88],
    [14, 0, 0.78],
  ] as const;
  const turnaround = [
    [0, 0, 0.96],
    [2, 2, 0.8],
    [4, 3, 0.84],
    [6, 5, 0.9],
    [8, 3, 0.84],
    [10, 2, 0.8],
    [12, 0, 0.94],
    [14, -2, 0.78],
    [15, 0, 0.92],
  ] as const;
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const shape = bar === 7 ? turnaround : bar % 2 === 0 ? a : b;
    for (const [step, note, velocity] of shape) {
      events.push({ step: bar * 16 + step, velocity, note, variant });
    }
  }
  return { bars: 8, events };
}

// G minor -> Bb -> D minor -> C, two bars each. Several piano notes at the
// same step mean "play these notes together" rather than a special sample.
const harmony = [
  [5, 8, 12],
  [5, 8, 12],
  [8, 12, 15],
  [8, 12, 15],
  [0, 3, 7],
  [0, 3, 7],
  [-2, 2, 5],
  [-2, 2, 5],
] as const;

function pianoChords(dense: boolean): LabChart {
  const events: LabChartEvent[] = [];
  harmony.forEach((chord, bar) => {
    const steps = dense ? [2, 6, 10, 14] : [2, 10];
    for (const step of steps) {
      chord.forEach((note, i) => {
        events.push({ step: bar * 16 + step, velocity: 0.62 - i * 0.06, note });
      });
    }
  });
  return { bars: 8, events };
}

function padChords(): LabChart {
  const events: LabChartEvent[] = [];
  harmony.forEach((chord, bar) => {
    chord.forEach((note, i) => {
      events.push({ step: bar * 16, velocity: 0.4 - i * 0.045, note });
    });
  });
  return { bars: 8, events };
}

function bass(dense: boolean): LabChart {
  const roots = [5, 5, 8, 8, 0, 0, -2, -2];
  const events: LabChartEvent[] = [];
  roots.forEach((note, bar) => {
    const steps = dense ? [2, 6, 10, 14] : [2, 10];
    steps.forEach((step, i) => {
      events.push({ step: bar * 16 + step, velocity: i === 0 ? 0.92 : 0.8, note });
    });
  });
  return { bars: 8, events };
}

const riser = hits(8, [[4, 0, 0.82, null, 'riser']]);
const downbeatCrash = hits(8, [[0, 0, 0.9, null, 'crash']]);
const peakFx = hits(8, [
  [0, 0, 0.92, null, 'crash'],
  [4, 0, 0.7, null, 'riser'],
]);

export const ONE: LabTrack = {
  id: 'one',
  title: 'One',
  artist: 'Swedish House Mafia',
  genre: 'progressive / electro house',
  bpm: 126,
  bars: 8,
  swing: 0,
  pump: { amount: 0.57, release: 0.25 },
  humanizeGain: 0.025,
  humanizeCents: 0,
  notes:
    'Instrumental reference study only. Its main hook is a synthesized kick bent into a playable ' +
    'tone, then reinforced by low bass, bright piano notes played together, and a strong kick-driven ' +
    'volume pulse. All timing and sound design are local approximations; no source recording or voice is used.',
  voices: [
    {
      id: 'kick',
      name: 'Four-beat kick (pump driver)',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: async () => variants([['kick', await kick909({ decay: 0.3, drive: 2.8 })]]),
    },
    {
      id: 'clap',
      name: 'Clap / build roll',
      color: '#ffc93c',
      pitched: false,
      build: async () => variants([['clap', await clap909({ decay: 0.24 })]]),
    },
    {
      id: 'hats',
      name: 'Open hats / quiet ticks',
      color: '#3ce0ff',
      pitched: false,
      ducked: true,
      gain: 0.8,
      build: async () =>
        variants([
          ['closed', await hat808({ open: false, hpf: 7600 })],
          ['open', await hat808({ open: true, hpf: 7000 })],
        ]),
    },
    {
      id: 'bass',
      name: 'Short low bass (D)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 1.05,
      noteRows: [8, 5, 0, -2],
      build: async () => variants([['sub', await sub808({ rootHz: noteHz('D1'), decay: 0.34, drive: 2.2 })]]),
    },
    {
      id: 'hook',
      name: 'Pitched-kick hook (D)',
      color: '#ff6bd6',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.92,
      noteRows: [7, 5, 3, 2, 0, -2],
      defaultVariant: 'open',
      build: async () =>
        variants([
          [
            'muted',
            await kick808({
              from: noteHz('D4'),
              to: noteHz('D3'),
              decay: 0.23,
              drive: 2.7,
              click: 0.42,
            }),
          ],
          [
            'open',
            await kick808({
              from: noteHz('D4'),
              to: noteHz('D3'),
              decay: 0.29,
              drive: 5.1,
              click: 0.62,
            }),
          ],
        ]),
    },
    {
      id: 'piano',
      name: 'Bright piano chords (notes together)',
      color: '#4dff88',
      pitched: true,
      ducked: true,
      gain: 0.68,
      noteRows: [15, 12, 8, 7, 5, 3, 2, 0, -2],
      build: async () =>
        variants([['piano', await housePiano({ rootHz: noteHz('D4'), decay: 0.72, brightness: 1.28, wet: 0.12 })]]),
    },
    {
      id: 'pad',
      name: 'Wide background chord bed',
      color: '#9dff3c',
      pitched: true,
      ducked: true,
      gain: 0.48,
      noteRows: [15, 12, 8, 7, 5, 3, 2, 0, -2],
      build: async () => variants([['pad', await drone({ rootHz: noteHz('D3'), seconds: 1.82, attack: 0.15 })]]),
    },
    {
      id: 'fx',
      name: 'Transition sweep / crash',
      color: '#9a9ab0',
      pitched: false,
      gain: 0.72,
      build: async () =>
        variants([
          ['riser', await noiseRiser({ seconds: 7.35, peak: 0.42 })],
          ['crash', await crash({ decay: 1.35 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'pulse',
      name: 'hook tease',
      charts: { hats: hats(false), hook: hook('muted'), pad: padChords() },
    },
    {
      id: 'build',
      name: 'piano build',
      charts: {
        kick: kickChart,
        clap: buildClaps(),
        hats: hats(false),
        bass: bass(false),
        hook: hook('muted'),
        piano: pianoChords(false),
        pad: padChords(),
        fx: riser,
      },
    },
    {
      id: 'drop',
      name: 'hook drop',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hats(true),
        bass: bass(true),
        hook: hook('open'),
        fx: downbeatCrash,
      },
    },
    {
      id: 'peak',
      name: 'full peak',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hats(true),
        bass: bass(true),
        hook: hook('open'),
        piano: pianoChords(true),
        pad: padChords(),
        fx: peakFx,
      },
    },
  ],
};
