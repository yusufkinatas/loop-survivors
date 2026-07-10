// "Show Me Love" — Robin S (StoneBridge mix, 1993). Development-only,
// instrumental reference study. No Robin S vocal, vocal imitation, stem,
// MIDI, master audio, or keyboard sample is included. Production context:
// https://djmag.com/longreads/solid-gold-how-robin-s-show-me-love-became-one-dance-music-s-most-iconic-anthems
// The D-minor-family riff, rhythms, and synthesized M1-era organ-like timbre
// are ear-built approximations adapted to Track Lab's 16-step grid.

import {
  clap909,
  cowbell808,
  crash,
  hat808,
  houseOrgan,
  kick909,
  noiseRiser,
  noteHz,
  variants,
} from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

// Dm7 → C6 → Bbmaj7 → C7, repeated. The four notes are charted separately
// so the organ sound stays reusable and the visible grid shows the harmony.
const ORGAN_CHORDS: readonly (readonly number[])[] = [
  [0, 3, 7, 10],
  [-2, 2, 5, 7],
  [-4, 0, 3, 7],
  [-2, 2, 5, 8],
];

const ORGAN_RHYTHM: readonly (readonly number[])[] = [
  [0, 3, 6, 10, 12],
  [2, 6, 9, 14],
  [0, 4, 7, 10, 14],
  [2, 5, 8, 11, 14, 15],
];

function organRiff(variant: 'warm' | 'bright', sparse: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const chord = ORGAN_CHORDS[bar % ORGAN_CHORDS.length];
    const fullSteps = ORGAN_RHYTHM[bar % ORGAN_RHYTHM.length];
    const steps = sparse ? fullSteps.filter((_, index) => index % 2 === 0) : fullSteps;
    for (const [hitIndex, step] of steps.entries()) {
      const accent = hitIndex === 0 ? 0.95 : step >= 14 ? 0.72 : 0.78;
      chord.forEach((note, noteIndex) => {
        events.push({
          step: bar * 16 + step,
          velocity: accent * (noteIndex === 0 ? 1 : 0.86),
          note,
          variant,
        });
      });
    }
  }
  return { bars: 8, events };
}

const BASS_ROOTS = [0, -2, -4, -2] as const;

function organBass(sparse: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const root = BASS_ROOTS[bar % BASS_ROOTS.length];
    const fullSteps = ORGAN_RHYTHM[bar % ORGAN_RHYTHM.length];
    const steps = sparse ? fullSteps.filter((_, index) => index === 0 || index === 2) : fullSteps;
    steps.forEach((step, index) => {
      events.push({
        step: bar * 16 + step,
        velocity: index === 0 ? 0.9 : 0.68,
        note: root,
      });
    });
  }
  return { bars: 8, events };
}

function kickChart(): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    for (const step of [0, 4, 8, 12]) {
      events.push({ step: bar * 16 + step, velocity: step === 0 ? 1 : 0.94 });
    }
  }
  // One quiet pickup announces the loop without disturbing the simple floor.
  events.push({ step: 7 * 16 + 15, velocity: 0.36 });
  return { bars: 8, events };
}

function clapChart(full: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    events.push(
      { step: bar * 16 + 4, velocity: 0.86 },
      { step: bar * 16 + 12, velocity: 0.92 },
    );
  }
  if (full) {
    events.push(
      { step: 7 * 16 + 13, velocity: 0.28 },
      { step: 7 * 16 + 14, velocity: 0.38 },
      { step: 7 * 16 + 15, velocity: 0.52 },
    );
  }
  return { bars: 8, events };
}

function hatsChart(full: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 2; bar++) {
    const base = bar * 16;
    for (const step of [2, 6, 10, 14]) {
      events.push({ step: base + step, velocity: 0.7, variant: 'open' });
    }
    const closedSteps = full ? [0, 4, 7, 8, 12, 15] : [0, 8];
    for (const step of closedSteps) {
      events.push({ step: base + step, velocity: step % 4 === 0 ? 0.34 : 0.24, variant: 'closed' });
    }
  }
  return { bars: 2, events };
}

function percussionChart(full: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const base = bar * 16;
    const ticks = bar % 2 === 0 ? [3, 11] : [1, 9, 15];
    for (const step of ticks) {
      events.push({ step: base + step, velocity: 0.28, variant: 'tick' });
    }
    if (full && bar % 2 === 1) {
      events.push({ step: base + 6, velocity: 0.38, variant: 'bell' });
    }
  }
  return { bars: 8, events };
}

const introPerc = percussionChart(false);
const fullPerc = percussionChart(true);
const kick = kickChart();
const clap = clapChart(false);
const clapFill = clapChart(true);
const sparseHats = hatsChart(false);
const fullHats = hatsChart(true);
const warmOrgan = organRiff('warm', false);
const sparseOrgan = organRiff('warm', true);
const brightOrgan = organRiff('bright', false);
const sparseBass = organBass(true);
const fullBass = organBass(false);
const buildFx = hits(8, [[4, 0, 0.72, null, 'rise']]);
const peakFx = hits(8, [
  [0, 0, 0.78, null, 'crash'],
  [4, 0, 0.58, null, 'crash'],
]);

export const SHOW_ME_LOVE: LabTrack = {
  id: 'showmelove',
  title: 'Show Me Love',
  artist: 'Robin S',
  genre: 'classic organ house',
  bpm: 121,
  bars: 8,
  swing: 0.035,
  pump: { amount: 0.18, release: 0.16 },
  humanizeGain: 0.035,
  humanizeCents: 0,
  notes:
    'Instrumental-only, ear-built reference study. The nasal organ-style sound does both jobs: ' +
    'separately charted low notes provide the bass while several higher notes strike together as ' +
    'the famous rhythmic hook. Sections: organ intro → simple groove → break / build → club peak.',
  voices: [
    {
      id: 'kick',
      name: 'Classic house kick',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: async () => variants([['kick', await kick909({ decay: 0.29, drive: 2.05 })]]),
    },
    {
      id: 'clap',
      name: 'House clap',
      color: '#ffc93c',
      pitched: false,
      gain: 0.9,
      build: async () => variants([['clap', await clap909({ decay: 0.25 })]]),
    },
    {
      id: 'hats',
      name: 'Open / closed hats',
      color: '#3ce0ff',
      pitched: false,
      gain: 0.82,
      build: async () =>
        variants([
          ['closed', await hat808({ open: false, hpf: 7600 })],
          ['open', await hat808({ open: true, hpf: 7000 })],
        ]),
    },
    {
      id: 'perc',
      name: 'Tick / bell percussion',
      color: '#8fb7ff',
      pitched: false,
      gain: 0.55,
      defaultVariant: 'tick',
      build: async () =>
        variants([
          ['tick', await hat808({ open: false, hpf: 9400 })],
          ['bell', await cowbell808({ rootHz: 720, decay: 0.13, drive: 1.2 })],
        ]),
    },
    {
      id: 'organBass',
      name: 'Low organ notes',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.9,
      noteRows: [0, -2, -4],
      build: async () =>
        variants([
          [
            'bass',
            await houseOrgan({ rootHz: noteHz('D2'), seconds: 0.38, drive: 2.15, brightness: 0.65 }),
          ],
        ]),
    },
    {
      id: 'organ',
      name: 'M1-era organ-style hook',
      color: '#4dff88',
      pitched: true,
      ducked: true,
      gain: 0.8,
      defaultVariant: 'warm',
      noteRows: [10, 8, 7, 5, 3, 2, 0, -2, -4],
      build: async () =>
        variants([
          [
            'warm',
            await houseOrgan({ rootHz: noteHz('D3'), seconds: 0.44, drive: 1.7, brightness: 0.86 }),
          ],
          [
            'bright',
            await houseOrgan({ rootHz: noteHz('D3'), seconds: 0.48, drive: 2.05, brightness: 1.3 }),
          ],
        ]),
    },
    {
      id: 'fx',
      name: 'Crash / build noise',
      color: '#9a9ab0',
      pitched: false,
      gain: 0.6,
      defaultVariant: 'crash',
      build: async () =>
        variants([
          ['crash', await crash({ decay: 1.35 })],
          ['rise', await noiseRiser({ seconds: 7.7, peak: 0.34 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'organ intro',
      charts: { perc: introPerc, organBass: sparseBass, organ: warmOrgan },
    },
    {
      id: 'groove',
      name: 'simple groove',
      charts: {
        kick,
        clap,
        hats: sparseHats,
        perc: introPerc,
        organBass: fullBass,
        organ: warmOrgan,
      },
    },
    {
      id: 'build',
      name: 'break / build',
      charts: {
        clap,
        hats: sparseHats,
        perc: fullPerc,
        organBass: sparseBass,
        organ: sparseOrgan,
        fx: buildFx,
      },
    },
    {
      id: 'peak',
      name: 'club peak',
      charts: {
        kick,
        clap: clapFill,
        hats: fullHats,
        perc: fullPerc,
        organBass: fullBass,
        organ: brightOrgan,
        fx: peakFx,
      },
    },
  ],
};
