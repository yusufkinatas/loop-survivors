// "Around the World" — Daft Punk (1997). Development-only instrumental
// reference study: no master audio, stems, MIDI, robot voice, or voice
// imitation is used. Structural references:
// https://magazine.waxpoetics.com/article/daft-punk-go-from-sampling-disco-records-to-creating-a-dance-masterpiece/
// https://learningmusic.ableton.com/make-basslines/around-the-world.html
// https://www.attackmagazine.com/technique/passing-notes/daft-punk-basslines-the-ultimate-guide/
// Every note, rhythm, arrangement choice, and synthesized timbre below is an
// ear-built approximation for the Track Lab, not a sourced transcription.

import {
  clap909,
  crash,
  funkBass,
  funkLead,
  hat808,
  kick909,
  noiseRiser,
  noteHz,
  sawStab,
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
  [0, 4, 0.88],
  [0, 12, 0.92],
]);

function hatsChart(dense: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let step = 0; step < 16; step += 2) {
    const open = step % 4 === 2;
    events.push({ step, velocity: open ? 0.72 : 0.34, variant: open ? 'open' : 'closed' });
  }
  if (dense) {
    for (const step of [3, 7, 11, 15]) {
      events.push({ step, velocity: step === 15 ? 0.42 : 0.28, variant: 'closed' });
    }
  }
  return { bars: 1, events };
}

// One bar each of A minor, C major, E minor, and D major, repeated once.
// The exact record line is deliberately not copied; this keeps the contour
// and syncopated disco-bass job while using an independently authored phrase.
function bassLine(): LabChart {
  const events: LabChartEvent[] = [];
  const chords = [
    { root: 0, third: 3, fifth: 7 },
    { root: 3, third: 7, fifth: 10 },
    { root: 7, third: 10, fifth: 14 },
    { root: 5, third: 9, fifth: 12 },
  ] as const;
  for (let bar = 0; bar < 8; bar++) {
    const chord = chords[bar % chords.length];
    const phrase = [
      [0, 0.94, chord.root],
      [3, 0.56, chord.fifth],
      [5, 0.78, chord.root + 12],
      [7, 0.58, chord.third],
      [8, 0.9, chord.root],
      [11, 0.68, chord.fifth],
      [13, 0.8, chord.third],
      [15, bar % 4 === 3 ? 0.88 : 0.62, chord.root + 12],
    ] as const;
    for (const [step, velocity, note] of phrase) {
      events.push({ step: bar * 16 + step, velocity, note });
    }
  }
  return { bars: 8, events };
}

// Short chord punches on the spaces between the kicks. This is a local synth
// standing in for the record's clipped, guitar-like rhythm layer.
function clippedChords(): LabChart {
  const events: LabChartEvent[] = [];
  const voicings = [
    [0, 3, 7],
    [3, 7, 10],
    [7, 10, 14],
    [5, 9, 12],
  ] as const;
  for (let bar = 0; bar < 8; bar++) {
    const notes = voicings[bar % voicings.length];
    for (const [step, velocity] of [
      [2, 0.58],
      [6, 0.68],
      [10, 0.56],
      [14, 0.76],
    ] as const) {
      for (const note of notes) {
        events.push({ step: bar * 16 + step, velocity: velocity * 0.68, note });
      }
    }
  }
  return { bars: 8, events };
}

// Bright upper-register reply. It follows the same harmony but uses a newly
// authored rhythm so the study reads as a layered French-house arrangement
// without reproducing the master phrase note for note.
function synthHook(): LabChart {
  const events: LabChartEvent[] = [];
  const chordTones = [
    [12, 15, 19],
    [15, 19, 22],
    [19, 22, 26],
    [17, 21, 24],
  ] as const;
  const steps = [0, 3, 6, 8, 11, 14] as const;
  for (let bar = 0; bar < 8; bar++) {
    const notes = chordTones[bar % chordTones.length];
    steps.forEach((step, i) => {
      const note = notes[(i + (bar % 2)) % notes.length];
      events.push({ step: bar * 16 + step, velocity: i === 0 || i === 3 ? 0.78 : 0.58, note });
    });
  }
  return { bars: 8, events };
}

const fxCrash = hits(8, [[0, 0, 0.72, null, 'crash']]);
const fxFull = hits(8, [
  [0, 0, 0.78, null, 'crash'],
  [6, 0, 0.45, null, 'riser'],
]);

export const AROUND_THE_WORLD: LabTrack = {
  id: 'aroundtheworld',
  title: 'Around the World',
  artist: 'Daft Punk',
  genre: 'French house / disco',
  bpm: 121,
  bars: 8,
  swing: 0.035,
  humanizeGain: 0.025,
  humanizeCents: 1.5,
  notes:
    'Instrumental-only, locally synthesized reference study. The robot voice is absent rather than ' +
    'imitated. Listen for layers joining a simple drum-machine floor, round bass, clipped rhythm, ' +
    'and bright synth reply. All phrases and sounds are ear-built approximations.',
  voices: [
    {
      id: 'kick',
      name: 'Drum-machine kick',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: async () => variants([['kick', await kick909({ decay: 0.24, drive: 1.7 })]]),
    },
    {
      id: 'clap',
      name: 'Dry clap',
      color: '#ffc93c',
      pitched: false,
      gain: 0.84,
      build: async () => variants([['clap', await clap909({ decay: 0.19 })]]),
    },
    {
      id: 'hats',
      name: 'Disco hats',
      color: '#3ce0ff',
      pitched: false,
      gain: 0.74,
      defaultVariant: 'closed',
      build: async () =>
        variants([
          ['closed', await hat808({ open: false, hpf: 7600 })],
          ['open', await hat808({ open: true, hpf: 7200 })],
        ]),
    },
    {
      id: 'bass',
      name: 'Round analog bass (A)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      gain: 1.05,
      noteRows: [19, 17, 15, 14, 12, 10, 9, 7, 5, 3, 0],
      build: async () => variants([['bass', await funkBass({ rootHz: noteHz('A1'), decay: 0.28, drive: 1.9 })]]),
    },
    {
      id: 'rhythm',
      name: 'Clipped rhythm synth (guitar-like)',
      color: '#4dff88',
      pitched: true,
      gain: 0.68,
      noteRows: [14, 12, 10, 9, 7, 5, 3, 0],
      build: async () =>
        variants([
          [
            'chop',
            await sawStab({
              rootHz: noteHz('A3'),
              decay: 0.085,
              detune: 5,
              cutoff: 3400,
              sweepTo: 900,
              q: 1.2,
              drive: 1.5,
              saws: 2,
            }),
          ],
        ]),
    },
    {
      id: 'lead',
      name: 'Bright synth reply',
      color: '#ff6bd6',
      pitched: true,
      ducked: true,
      gain: 0.72,
      noteRows: [26, 24, 22, 21, 19, 17, 15, 12],
      build: async () =>
        variants([
          [
            'lead',
            await funkLead({ rootHz: noteHz('A3'), decay: 0.24, q: 3.2, cutoff: 3900, sweepTo: 1200, drive: 1.45 }),
          ],
        ]),
    },
    {
      id: 'fx',
      name: 'Transition effects',
      color: '#9a9ab0',
      pitched: false,
      gain: 0.66,
      build: async () =>
        variants([
          ['crash', await crash({ decay: 1.1 })],
          ['riser', await noiseRiser({ seconds: 3.75, peak: 0.3 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'intro machine',
      charts: { kick: kickChart, hats: hatsChart(false), rhythm: clippedChords() },
    },
    {
      id: 'bass-groove',
      name: 'bass groove',
      charts: { kick: kickChart, clap: clapChart, hats: hatsChart(false), bass: bassLine() },
    },
    {
      id: 'layers',
      name: 'layers arrive',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hatsChart(true),
        bass: bassLine(),
        rhythm: clippedChords(),
        lead: synthHook(),
        fx: fxCrash,
      },
    },
    {
      id: 'full-groove',
      name: 'full groove',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hatsChart(true),
        bass: bassLine(),
        rhythm: clippedChords(),
        lead: synthHook(),
        fx: fxFull,
      },
    },
  ],
};
