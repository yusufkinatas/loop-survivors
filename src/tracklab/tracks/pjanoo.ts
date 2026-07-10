// "Pjanoo" — Eric Prydz (2008). Development-only instrumental reference
// study. Point Blank's deconstruction identifies the main building blocks as
// varied house drums, a bright M1-style piano, and a separate synth arpeggio:
// https://www.pointblankmusicschool.com/blog/track-deconstruction-eric-prydz-pjanoo-w-ski-oakenfull-at-bmc/
// No audio, MIDI, stems, acapella, or human performance is imported. Every
// note, rhythm, chord shape, arrangement choice, and timbre below is an
// ear-built approximation rendered by local Track Lab synthesis.

import {
  clap909,
  crash,
  drone,
  funkBass,
  hat808,
  housePiano,
  kick909,
  noiseRiser,
  noteHz,
  sawStab,
  variants,
} from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const kickChart = hits(1, [
  [0, 0, 1],
  [0, 4, 0.97],
  [0, 8, 1],
  [0, 12, 0.97],
]);

const clapChart = hits(1, [
  [0, 4, 0.92],
  [0, 12, 0.96],
]);

function hatsChart(dense: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (const step of [2, 6, 10, 14]) {
    events.push({ step, velocity: step === 14 ? 0.82 : 0.72, variant: 'open' });
  }
  for (const step of [0, 4, 8, 12]) {
    events.push({ step, velocity: 0.28, variant: 'closed' });
  }
  if (dense) {
    for (const step of [1, 3, 5, 7, 9, 11, 13, 15]) {
      events.push({ step, velocity: step === 15 ? 0.42 : 0.24, variant: 'closed' });
    }
  }
  return { bars: 1, events };
}

// G minor center, using an eight-bar Gm–F–Eb–Eb–F–Cm–Cm–Dm arc. This is an
// independently played approximation of the broad harmonic movement, not a
// transcription. Each entry is relative to G.
const CHORDS = [
  { root: 0, tones: [0, 3, 7, 12] },
  { root: -2, tones: [-2, 2, 5, 10] },
  { root: -4, tones: [-4, 0, 3, 8] },
  { root: -4, tones: [-4, 0, 3, 8] },
  { root: -2, tones: [-2, 2, 5, 10] },
  { root: -7, tones: [-7, -4, 0, 5] },
  { root: -7, tones: [-7, -4, 0, 5] },
  { root: -5, tones: [-5, -2, 2, 7] },
] as const;

function bassLine(): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const root = CHORDS[bar].root;
    for (const [step, velocity, note] of [
      [0, 0.92, root],
      [3, 0.52, root],
      [6, 0.74, root + 7],
      [8, 0.9, root],
      [11, 0.58, root + 12],
      [14, 0.78, root + 7],
    ] as const) {
      events.push({ step: bar * 16 + step, velocity, note });
    }
  }
  return { bars: 8, events };
}

// One-note piano buffers are stacked at the same step to make exact local
// chord shapes. The two-note G/Bb answer in the upper register is deliberately
// simple; its rhythm is ear-built and changes at the end of the phrase.
function pianoHook(variant: 'soft' | 'bright', scale = 1): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = CHORDS[bar].tones;
    for (const [step, velocity] of [
      [0, 0.82],
      [8, 0.7],
    ] as const) {
      for (const note of chord) {
        events.push({ step: bar * 16 + step, velocity: velocity * scale * 0.74, note, variant });
      }
    }
    const answer = bar === 7
      ? ([
          [3, 15],
          [5, 12],
          [7, 15],
          [10, 12],
          [12, 15],
          [15, 12],
        ] as const)
      : ([
          [3, 12],
          [5, 15],
          [7, 12],
          [10, 15],
          [12, 12],
          [14, 15],
        ] as const);
    for (const [step, note] of answer) {
      events.push({ step: bar * 16 + step, velocity: 0.68 * scale, note, variant });
    }
  }
  return { bars: 8, events };
}

function arpChart(dense: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = CHORDS[bar].tones;
    const steps = dense ? [1, 3, 5, 7, 9, 11, 13, 15] : [1, 5, 9, 13];
    steps.forEach((step, i) => {
      const note = chord[(i + bar) % chord.length] + 12;
      events.push({ step: bar * 16 + step, velocity: dense ? 0.48 : 0.38, note });
    });
  }
  return { bars: 8, events };
}

// The string voice is also one synthesized note. Three simultaneous events
// make each chord, so minor and major shapes remain explicit in the chart.
function stringsChart(): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    for (const note of CHORDS[bar].tones.slice(0, 3)) {
      events.push({ step: bar * 16, velocity: 0.42, note });
    }
  }
  return { bars: 8, events };
}

const fxBuild = hits(8, [[6, 0, 0.62, null, 'riser']]);
const fxDrop = hits(8, [[0, 0, 0.82, null, 'crash']]);

export const PJANOO: LabTrack = {
  id: 'pjanoo',
  title: 'Pjanoo',
  artist: 'Eric Prydz',
  genre: 'progressive house',
  bpm: 126,
  bars: 8,
  swing: 0,
  pump: { amount: 0.36, release: 0.22 },
  humanizeGain: 0.025,
  humanizeCents: 0,
  notes:
    'Instrumental-only, locally synthesized reference study. The bright piano is assembled from ' +
    'individual generated notes, with a separate pulsing synth and string bed. All phrases, chord ' +
    'shapes, and sounds are ear-built approximations. Sections: intro → build → drop → breakdown.',
  voices: [
    {
      id: 'kick',
      name: 'House kick',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: async () => variants([['kick', await kick909({ decay: 0.27, drive: 2.1 })]]),
    },
    {
      id: 'clap',
      name: 'Wide clap',
      color: '#ffc93c',
      pitched: false,
      gain: 0.9,
      build: async () => variants([['clap', await clap909({ decay: 0.28 })]]),
    },
    {
      id: 'hats',
      name: 'Open / closed hats',
      color: '#3ce0ff',
      pitched: false,
      ducked: true,
      gain: 0.78,
      defaultVariant: 'closed',
      build: async () =>
        variants([
          ['closed', await hat808({ open: false, hpf: 7600 })],
          ['open', await hat808({ open: true, hpf: 7000 })],
        ]),
    },
    {
      id: 'bass',
      name: 'Warm bass (G)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.98,
      noteRows: [12, 10, 8, 7, 5, 3, 2, 0, -2, -4, -5, -7],
      build: async () => variants([['bass', await funkBass({ rootHz: noteHz('G1'), decay: 0.34, drive: 1.55 })]]),
    },
    {
      id: 'piano',
      name: 'Bright piano hook',
      color: '#ff6bd6',
      pitched: true,
      ducked: true,
      gain: 0.82,
      defaultVariant: 'bright',
      noteRows: [15, 12, 10, 8, 7, 5, 3, 2, 0, -2, -4, -5, -7],
      build: async () =>
        variants([
          ['soft', await housePiano({ rootHz: noteHz('G3'), decay: 0.9, brightness: 0.6, wet: 0.16 })],
          ['bright', await housePiano({ rootHz: noteHz('G3'), decay: 1.1, brightness: 1.2, wet: 0.2 })],
        ]),
    },
    {
      id: 'arp',
      name: 'Pulsing synth notes',
      color: '#4dff88',
      pitched: true,
      ducked: true,
      gain: 0.54,
      noteRows: [27, 24, 22, 20, 19, 17, 15, 14, 12, 10, 8, 7, 5],
      build: async () =>
        variants([
          [
            'arp',
            await sawStab({
              rootHz: noteHz('G3'),
              decay: 0.13,
              detune: 8,
              cutoff: 2800,
              sweepTo: 780,
              q: 2.4,
              drive: 1.35,
              saws: 3,
            }),
          ],
        ]),
    },
    {
      id: 'strings',
      name: 'Slow string bed',
      color: '#9dff3c',
      pitched: true,
      ducked: true,
      gain: 0.5,
      noteRows: [7, 5, 3, 2, 0, -2, -4, -5, -7],
      build: async () => variants([['strings', await drone({ rootHz: noteHz('G3'), seconds: 1.82, attack: 0.24 })]]),
    },
    {
      id: 'fx',
      name: 'Transition effects',
      color: '#9a9ab0',
      pitched: false,
      gain: 0.68,
      build: async () =>
        variants([
          ['crash', await crash({ decay: 1.35 })],
          ['riser', await noiseRiser({ seconds: 3.75, peak: 0.42 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'intro pulse',
      charts: { kick: kickChart, hats: hatsChart(false), bass: bassLine(), arp: arpChart(false) },
    },
    {
      id: 'build',
      name: 'piano build',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hatsChart(true),
        bass: bassLine(),
        piano: pianoHook('soft', 0.84),
        arp: arpChart(false),
        fx: fxBuild,
      },
    },
    {
      id: 'drop',
      name: 'full piano drop',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hatsChart(true),
        bass: bassLine(),
        piano: pianoHook('bright'),
        arp: arpChart(true),
        strings: stringsChart(),
        fx: fxDrop,
      },
    },
    {
      id: 'breakdown',
      name: 'piano breakdown',
      charts: {
        piano: pianoHook('soft', 0.76),
        arp: arpChart(false),
        strings: stringsChart(),
        fx: fxBuild,
      },
    },
  ],
};
