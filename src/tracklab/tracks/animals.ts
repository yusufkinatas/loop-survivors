// "Animals" — Martin Garrix (2013). Development-only instrumental study:
// 128 BPM, F minor, a melodic breakdown, rising drum build, and a deliberately
// sparse wooden/horn-like drop hook. Production reference (original project):
// https://www.youtube.com/watch?v=CfCmoEixxro
// Arrangement reference:
// https://www.musicradar.com/tuition/tech/anatomy-of-a-hit-martin-garrix-animals-636619
// Every grid and timbre below is an ear-built approximation rendered by our
// synth helpers. No master audio, stems, MIDI, spoken line, or vocal imitation.

import {
  clap909,
  crash,
  drone,
  funkLead,
  hat808,
  kick909,
  metalStab,
  noiseRiser,
  noteHz,
  snare,
  sub808,
  variants,
} from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const kickChart = hits(1, [
  [0, 0, 1],
  [0, 4, 0.97],
  [0, 8, 1],
  [0, 12, 0.97],
]);

const backbeat = hits(1, [
  [0, 4, 0.94, null, 'clap'],
  [0, 12, 0.94, null, 'clap'],
]);

function buildSnare(): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const steps = bar < 4 ? [4, 12] : bar < 6 ? [0, 4, 8, 12] : bar === 6 ? [0, 2, 4, 6, 8, 10, 12, 14] : Array.from({ length: 16 }, (_, i) => i);
    steps.forEach((step, i) => {
      events.push({
        step: bar * 16 + step,
        velocity: Math.min(1, 0.43 + bar * 0.055 + i * 0.014),
        variant: bar < 4 ? 'clap' : 'snare',
      });
    });
  }
  return { bars: 8, events };
}

// A dry three-step pulse supplies the famous clock-like tension. The drop
// swaps it for standard open offbeats plus faint closed ticks.
function tickingHats(drop: boolean): LabChart {
  const events: LabChartEvent[] = [];
  if (!drop) {
    for (const step of [0, 3, 6, 9, 12, 15]) {
      events.push({ step, velocity: step % 6 === 0 ? 0.5 : 0.34, variant: 'tick' });
    }
  } else {
    for (const step of [2, 6, 10, 14]) {
      events.push({ step, velocity: 0.7, variant: 'open' });
    }
    for (const step of [0, 4, 8, 12, 15]) {
      events.push({ step, velocity: step === 15 ? 0.27 : 0.35, variant: 'tick' });
    }
  }
  return { bars: 1, events };
}

function dropBass(): LabChart {
  const roots = [0, 0, 0, 0, 0, 0, -5, 0];
  const events: LabChartEvent[] = [];
  roots.forEach((note, bar) => {
    [2, 6, 10, 14].forEach((step, i) => {
      events.push({ step: bar * 16 + step, velocity: i === 0 ? 0.95 : 0.82, note });
    });
  });
  return { bars: 8, events };
}

// Minimal two-bar call-and-answer, repeated with an ascending last-bar fill.
// It intentionally captures the drop's rhythm and pitch-space rather than
// claiming to be a note-for-note transcription.
function dropHook(variant: 'wood' | 'bite'): LabChart {
  const a = [
    [0, 0, 1],
    [3, 0, 0.82],
    [6, 0, 0.9],
    [9, 0, 0.82],
    [12, 3, 0.94],
    [14, 0, 0.86],
  ] as const;
  const b = [
    [0, 0, 0.98],
    [3, 0, 0.8],
    [6, 7, 0.94],
    [8, 0, 0.86],
    [11, 0, 0.82],
    [14, -2, 0.9],
  ] as const;
  const fill = [
    [0, 0, 0.98],
    [2, 0, 0.78],
    [4, 3, 0.84],
    [6, 0, 0.8],
    [8, 7, 0.94],
    [10, 3, 0.84],
    [12, 0, 0.92],
    [14, -2, 0.84],
  ] as const;
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const shape = bar === 7 ? fill : bar % 2 === 0 ? a : b;
    for (const [step, note, velocity] of shape) {
      events.push({ step: bar * 16 + step, velocity, note, variant });
    }
  }
  return { bars: 8, events };
}

// Four-bar F-minor festival phrase, played twice. The second pass changes its
// final two notes so the 8-bar loop points back to the beginning cleanly.
function breakdownMelody(): LabChart {
  const phrase = [
    [[0, 7], [4, 7], [8, 3], [12, 5], [14, 7]],
    [[0, 10], [4, 10], [8, 8], [12, 7]],
    [[0, 3], [4, 3], [8, 0], [12, 3], [14, 5]],
    [[0, 7], [4, 5], [8, 3], [12, 0]],
  ] as const;
  const events: LabChartEvent[] = [];
  for (let half = 0; half < 2; half++) {
    phrase.forEach((bar, i) => {
      bar.forEach(([step, note], noteIndex) => {
        const isEnding = half === 1 && i === 3 && noteIndex >= bar.length - 2;
        events.push({
          step: (half * 4 + i) * 16 + step,
          velocity: step === 0 ? 0.84 : 0.7,
          note: isEnding ? note + (noteIndex === bar.length - 1 ? -2 : 0) : note,
        });
      });
    });
  }
  return { bars: 8, events };
}

const chords = [
  [0, 3, 7],
  [-4, 0, 3],
  [3, 7, 10],
  [-2, 2, 5],
  [0, 3, 7],
  [-4, 0, 3],
  [3, 7, 10],
  [-2, 2, 5],
] as const;

function chordBed(): LabChart {
  const events: LabChartEvent[] = [];
  chords.forEach((chord, bar) => {
    chord.forEach((note, i) => {
      events.push({ step: bar * 16, velocity: 0.38 - i * 0.04, note });
    });
  });
  return { bars: 8, events };
}

function peakMelody(): LabChart {
  const source = breakdownMelody();
  return {
    bars: 8,
    events: source.events
      .filter((event) => event.step >= 64)
      .map((event) => ({ ...event, note: (event.note ?? 0) + 12, velocity: event.velocity * 0.72 })),
  };
}

const buildFx = hits(8, [[4, 0, 0.9, null, 'riser']]);
const dropFx = hits(8, [[0, 0, 0.95, null, 'crash']]);
const peakFx = hits(8, [
  [0, 0, 0.95, null, 'crash'],
  [4, 0, 0.7, null, 'riser'],
]);

export const ANIMALS: LabTrack = {
  id: 'animals',
  title: 'Animals',
  artist: 'Martin Garrix',
  genre: 'big-room house',
  bpm: 128,
  bars: 8,
  swing: 0,
  pump: { amount: 0.6, release: 0.23 },
  humanizeGain: 0.025,
  humanizeCents: 0,
  notes:
    'Instrumental reference study only. The quiet clock-like ticks and broad melody create tension; ' +
    'the drop removes most notes and answers with a short synthetic wooden horn over a large kick. ' +
    'All timing and sound design are local approximations, and the original spoken line is omitted.',
  voices: [
    {
      id: 'kick',
      name: 'Big-room kick (pump driver)',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: async () => variants([['kick', await kick909({ decay: 0.34, drive: 3.4 })]]),
    },
    {
      id: 'percussion',
      name: 'Clap / rising snare roll',
      color: '#ffc93c',
      pitched: false,
      build: async () =>
        variants([
          ['clap', await clap909({ decay: 0.25 })],
          ['snare', await snare({ tone: 195, noiseHz: 2600, decay: 0.18, drive: 2.4 })],
        ]),
    },
    {
      id: 'hats',
      name: 'Clock ticks / open hats',
      color: '#3ce0ff',
      pitched: false,
      ducked: true,
      gain: 0.76,
      build: async () =>
        variants([
          ['tick', await hat808({ open: false, hpf: 9200 })],
          ['open', await hat808({ open: true, hpf: 7200 })],
        ]),
    },
    {
      id: 'bass',
      name: 'Short low bass (F)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 1.12,
      noteRows: [0, -5],
      build: async () => variants([['sub', await sub808({ rootHz: noteHz('F1'), decay: 0.34, drive: 2.8 })]]),
    },
    {
      id: 'hook',
      name: 'Synthetic wooden drop horn',
      color: '#ff6bd6',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.9,
      noteRows: [7, 3, 0, -2],
      defaultVariant: 'wood',
      build: async () =>
        variants([
          ['wood', await metalStab({ rootHz: noteHz('F3'), decay: 0.22, drive: 2.4, bpHz: 760 })],
          ['bite', await metalStab({ rootHz: noteHz('F3'), decay: 0.25, drive: 4.2, bpHz: 1050 })],
        ]),
    },
    {
      id: 'melody',
      name: 'Breakdown melody',
      color: '#4dff88',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.76,
      noteRows: [22, 20, 19, 17, 15, 12, 10, 8, 7, 5, 3, 0],
      build: async () =>
        variants([
          [
            'lead',
            await funkLead({
              rootHz: noteHz('F4'),
              decay: 0.53,
              q: 3.2,
              cutoff: 3300,
              sweepTo: 980,
              drive: 1.4,
            }),
          ],
        ]),
    },
    {
      id: 'chords',
      name: 'Wide breakdown chords (notes together)',
      color: '#9dff3c',
      pitched: true,
      ducked: true,
      gain: 0.5,
      noteRows: [10, 7, 5, 3, 2, 0, -2, -4],
      build: async () => variants([['bed', await drone({ rootHz: noteHz('F3'), seconds: 1.82, attack: 0.12 })]]),
    },
    {
      id: 'fx',
      name: 'Build sweep / impact crash',
      color: '#9a9ab0',
      pitched: false,
      gain: 0.75,
      build: async () =>
        variants([
          ['riser', await noiseRiser({ seconds: 7.3, peak: 0.48 })],
          ['crash', await crash({ decay: 1.5 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'breakdown',
      name: 'melodic break',
      charts: { hats: tickingHats(false), melody: breakdownMelody(), chords: chordBed() },
    },
    {
      id: 'build',
      name: 'rising build',
      charts: {
        percussion: buildSnare(),
        hats: tickingHats(false),
        melody: breakdownMelody(),
        chords: chordBed(),
        fx: buildFx,
      },
    },
    {
      id: 'drop',
      name: 'sparse drop',
      charts: {
        kick: kickChart,
        percussion: backbeat,
        hats: tickingHats(true),
        bass: dropBass(),
        hook: dropHook('wood'),
        fx: dropFx,
      },
    },
    {
      id: 'peak',
      name: 'drop variation',
      charts: {
        kick: kickChart,
        percussion: backbeat,
        hats: tickingHats(true),
        bass: dropBass(),
        hook: dropHook('bite'),
        melody: peakMelody(),
        fx: peakFx,
      },
    },
  ],
};
