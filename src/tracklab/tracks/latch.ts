// "Latch" — Disclosure (2012). Development-only instrumental reference
// study: no Sam Smith vocal, vocal-like replacement, stem, MIDI, or master
// audio is used. The palette and grid were rebuilt by ear from synthesized
// one-shots after consulting Disclosure's original Logic-project walkthrough:
// https://www.youtube.com/watch?v=u-0Q41XB7U4
// Harmony, micro-timing, and timbres are approximations for this engine.

import {
  clap909,
  crash,
  funkBass,
  hat808,
  kick909,
  noiseRiser,
  noteHz,
  sawStab,
  snare,
  sub808,
  variants,
} from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

// Ear-built F-minor-family movement. Each row is a compact four-note chord
// voiced from F3. The extra notes make the harmony carry the instrumental
// study where the original lead vocal would normally sit.
const CHORDS: readonly (readonly number[])[] = [
  [0, 3, 7, 10], // F minor 7
  [0, 3, 7, 10],
  [-2, 2, 5, 7], // Eb 6
  [-2, 2, 5, 7],
  [3, 7, 10, 14], // Ab major 7
  [3, 7, 10, 14],
  [-4, 0, 3, 7], // Db major 7
  [-4, 0, 3, 7],
];

const ROOTS = [0, 0, -2, -2, 3, 3, -4, -4] as const;

function chordChart(variant: 'soft' | 'open', dense: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const steps = dense
      ? bar % 2 === 0
        ? [0, 3, 7, 10, 14]
        : [2, 6, 9, 13, 15]
      : bar % 2 === 0
        ? [0, 7, 14]
        : [2, 9, 15];
    for (const [hitIndex, step] of steps.entries()) {
      const accent = hitIndex === 0 ? 0.88 : hitIndex === steps.length - 1 ? 0.72 : 0.64;
      CHORDS[bar].forEach((note, noteIndex) => {
        events.push({
          step: bar * 16 + step,
          velocity: accent * (noteIndex === 0 ? 1 : 0.82),
          note,
          variant,
        });
      });
    }
  }
  return { bars: 8, events };
}

function kickChart(full: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const steps = full
      ? [0, 4, 8, 12]
      : bar % 2 === 0
        ? [0, 8, 12]
        : [0, 4, 10, 12];
    for (const step of steps) {
      events.push({ step: bar * 16 + step, velocity: step % 4 === 0 ? 0.96 : 0.68 });
    }
    // A small pre-bar kick makes the otherwise steady floor feel garage-led.
    if (full && bar % 4 === 3) events.push({ step: bar * 16 + 15, velocity: 0.42 });
  }
  return { bars: 8, events };
}

function clapChart(withGhosts: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    events.push(
      { step: bar * 16 + 4, velocity: 0.82 },
      { step: bar * 16 + 12, velocity: 0.9 },
    );
    if (withGhosts && bar % 4 === 3) {
      events.push({ step: bar * 16 + 15, velocity: 0.3 });
    }
  }
  return { bars: 8, events };
}

function hatsChart(full: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 2; bar++) {
    const base = bar * 16;
    const openSteps = full ? [2, 6, 10, 14] : [6, 14];
    for (const step of openSteps) {
      events.push({ step: base + step, velocity: 0.66, variant: 'open' });
    }
    const closedSteps = full ? [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15] : [3, 7, 11, 15];
    for (const step of closedSteps) {
      events.push({
        step: base + step,
        velocity: step % 4 === 0 ? 0.34 : step % 2 === 1 ? 0.28 : 0.22,
        variant: 'closed',
      });
    }
  }
  return { bars: 2, events };
}

function percussionChart(): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const steps = bar % 2 === 0 ? [3, 11, 15] : [1, 6, 9, 14];
    for (const step of steps) {
      events.push({ step: bar * 16 + step, velocity: step % 3 === 0 ? 0.48 : 0.34 });
    }
  }
  return { bars: 8, events };
}

function subChart(full: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    events.push({ step: bar * 16, velocity: 0.88, note: ROOTS[bar] });
    if (full) {
      events.push({ step: bar * 16 + 8, velocity: 0.68, note: ROOTS[bar] });
      if (bar % 2 === 1) events.push({ step: bar * 16 + 14, velocity: 0.5, note: ROOTS[bar] });
    }
  }
  return { bars: 8, events };
}

function midBassChart(full: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const steps = full
      ? bar % 2 === 0
        ? [0, 3, 7, 10, 14]
        : [2, 6, 9, 13, 15]
      : [0, 7, 14];
    steps.forEach((step, index) => {
      const fifthPickup = full && index === steps.length - 1;
      events.push({
        step: bar * 16 + step,
        velocity: index === 0 ? 0.82 : 0.62,
        note: ROOTS[bar] + (fifthPickup ? 7 : 0),
      });
    });
  }
  return { bars: 8, events };
}

const introAir = hits(8, [
  [0, 0, 0.28, null, 'air'],
  [2, 0, 0.24, null, 'air'],
  [4, 0, 0.28, null, 'air'],
  [6, 0, 0.24, null, 'air'],
]);

const liftAir = hits(8, [[4, 0, 0.7, null, 'rise']]);
const hookAir = hits(8, [
  [0, 0, 0.72, null, 'crash'],
  [4, 0, 0.55, null, 'crash'],
]);

const softChords = chordChart('soft', false);
const fullSoftChords = chordChart('soft', true);
const openChords = chordChart('open', true);
const looseKick = kickChart(false);
const fullKick = kickChart(true);
const plainClap = clapChart(false);
const busyClap = clapChart(true);
const sparseHats = hatsChart(false);
const fullHats = hatsChart(true);
const percussion = percussionChart();
const sparseSub = subChart(false);
const fullSub = subChart(true);
const sparseMidBass = midBassChart(false);
const fullMidBass = midBassChart(true);

export const LATCH: LabTrack = {
  id: 'latch',
  title: 'Latch',
  artist: 'Disclosure',
  genre: 'garage-leaning house',
  bpm: 122,
  bars: 8,
  swing: 0.12,
  pump: { amount: 0.3, release: 0.2 },
  humanizeGain: 0.045,
  humanizeCents: 2,
  notes:
    'Instrumental-only, ear-built reference study: short several-note synth punches carry the hook ' +
    'instead of a singer. A clean sub and a shorter mid-bass play related notes so the low end feels ' +
    'layered without using stems. Sections: harmony intro → loose groove → lift → instrumental hook.',
  voices: [
    {
      id: 'kick',
      name: 'Round house kick',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: async () => variants([['kick', await kick909({ decay: 0.25, drive: 1.8 })]]),
    },
    {
      id: 'clap',
      name: 'Loose clap',
      color: '#ffc93c',
      pitched: false,
      gain: 0.86,
      build: async () => variants([['clap', await clap909({ decay: 0.24 })]]),
    },
    {
      id: 'hats',
      name: 'Swung hats',
      color: '#3ce0ff',
      pitched: false,
      ducked: true,
      gain: 0.78,
      build: async () =>
        variants([
          ['closed', await hat808({ open: false, hpf: 7600 })],
          ['open', await hat808({ open: true, hpf: 7000 })],
        ]),
    },
    {
      id: 'perc',
      name: 'Garage tick',
      color: '#8fb7ff',
      pitched: false,
      gain: 0.52,
      build: async () =>
        variants([['tick', await snare({ tone: 310, noiseHz: 4300, decay: 0.075, drive: 1.15 })]]),
    },
    {
      id: 'sub',
      name: 'Clean sub (F)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.94,
      noteRows: [3, 0, -2, -4],
      build: async () =>
        variants([['sub', await sub808({ rootHz: noteHz('F1'), decay: 0.76, drive: 1.75 })]]),
    },
    {
      id: 'bass',
      name: 'Mid-bass pluck',
      color: '#d16bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.72,
      noteRows: [10, 7, 5, 3, 0, -2, -4],
      build: async () =>
        variants([['pluck', await funkBass({ rootHz: noteHz('F2'), decay: 0.28, drive: 1.8 })]]),
    },
    {
      id: 'chords',
      name: 'Short synth chords',
      color: '#4dff88',
      pitched: true,
      ducked: true,
      gain: 0.78,
      defaultVariant: 'soft',
      noteRows: [14, 10, 7, 5, 3, 2, 0, -2, -4],
      build: async () =>
        variants([
          [
            'soft',
            await sawStab({
              rootHz: noteHz('F3'),
              decay: 0.23,
              cutoff: 1450,
              sweepTo: 520,
              q: 2.2,
              drive: 1.65,
              detune: 7,
            }),
          ],
          [
            'open',
            await sawStab({
              rootHz: noteHz('F3'),
              decay: 0.25,
              cutoff: 3400,
              sweepTo: 820,
              q: 3.2,
              drive: 2.15,
              detune: 10,
            }),
          ],
        ]),
    },
    {
      id: 'air',
      name: 'Synth air / transitions',
      color: '#9a9ab0',
      pitched: false,
      ducked: true,
      gain: 0.5,
      defaultVariant: 'air',
      build: async () =>
        variants([
          ['air', await noiseRiser({ seconds: 1.85, peak: 0.13 })],
          ['rise', await noiseRiser({ seconds: 7.6, peak: 0.32 })],
          ['crash', await crash({ decay: 1.15 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'harmony intro',
      charts: { hats: sparseHats, chords: softChords, air: introAir },
    },
    {
      id: 'groove',
      name: 'loose groove',
      charts: {
        kick: looseKick,
        clap: plainClap,
        hats: sparseHats,
        perc: percussion,
        sub: sparseSub,
        bass: sparseMidBass,
        chords: softChords,
      },
    },
    {
      id: 'lift',
      name: 'lift',
      charts: {
        kick: fullKick,
        clap: busyClap,
        hats: fullHats,
        perc: percussion,
        sub: sparseSub,
        bass: fullMidBass,
        chords: fullSoftChords,
        air: liftAir,
      },
    },
    {
      id: 'hook',
      name: 'instrumental hook',
      charts: {
        kick: fullKick,
        clap: busyClap,
        hats: fullHats,
        perc: percussion,
        sub: fullSub,
        bass: fullMidBass,
        chords: openChords,
        air: hookAir,
      },
    },
  ],
};
