// "Show Me Love" — Robin S (StoneBridge mix, 1993). Development-only,
// instrumental reference study. No Robin S vocal, vocal imitation, stem,
// MIDI, master audio, or keyboard sample is included. Production context:
// https://djmag.com/longreads/solid-gold-how-robin-s-show-me-love-became-one-dance-music-s-most-iconic-anthems
// The D-minor-family riff, rhythms, and synthesized M1-era organ-like timbre
// are ear-built approximations adapted to Track Lab's 16-step grid.

import {
  fetchSample,
  growingOneShot,
  houseOrgan,
  layerBuffers,
  noiseRiser,
  noteHz,
  padTriad,
  variants,
} from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const SAMPLE = '/samples/covers/featured/showmelove/';
const HOUSE = '/samples/house/';

const ORGAN_RHYTHM: readonly (readonly number[])[] = [
  [0, 3, 6, 10, 12],
  [2, 6, 9, 14],
  [0, 4, 7, 10, 14],
  [2, 5, 8, 11, 14, 15],
];

function organRiff(variant: 'warm' | 'bright', sparse: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let bar = 0; bar < 8; bar++) {
    const note = BASS_ROOTS[bar % BASS_ROOTS.length];
    const fullSteps = ORGAN_RHYTHM[bar % ORGAN_RHYTHM.length];
    const steps = sparse ? fullSteps.filter((_, index) => index % 2 === 0) : fullSteps;
    for (const [hitIndex, step] of steps.entries()) {
      const accent = hitIndex === 0 ? 0.95 : step >= 14 ? 0.72 : 0.78;
      events.push({ step: bar * 16 + step, velocity: accent, note, variant });
    }
  }
  return { bars: 8, events };
}

const BASS_ROOTS = [0, -2, -4, -2] as const;

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
// The producer described two discreet minor string chords as the only chorus
// lift. Each sample is already a full minor chord, so one musical hit remains
// one gameplay event when this lane is used as a weapon.
const strings = hits(8, [
  [0, 0, 0.3, 0, 'minor'],
  [2, 0, 0.27, -5, 'minor'],
  [4, 0, 0.3, 0, 'minor'],
  [6, 0, 0.27, -5, 'minor'],
]);
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
  bpm: 120,
  bars: 8,
  swing: 0.035,
  pump: { amount: 0.18, release: 0.16 },
  humanizeGain: 0.035,
  humanizeCents: 0,
  notes:
    'Instrumental-only reference study. The nasal organ sound is one monophonic bassline, not a ' +
    'separate bass plus upper chords; together with the kick it supplies the low end. The peak adds ' +
    'only a very quiet two-chord string cushion, preserving the record’s restraint. Sections: ' +
    'organ intro → simple groove → break / build → club peak.',
  arrangement: [
    { sectionId: 'intro', bars: 8 },
    { sectionId: 'groove', bars: 16 },
    { sectionId: 'build', bars: 8 },
    { sectionId: 'peak', bars: 16 },
  ],
  voices: [
    {
      id: 'kick',
      name: 'Classic house kick',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: (ctx) =>
        fetchSample(ctx, HOUSE + 'kick.wav').then((b) =>
          growingOneShot(b, 'kick', [680, 2100, 5600]),
        ),
    },
    {
      id: 'clap',
      name: 'Heavy snare / kick snap',
      color: '#ffc93c',
      pitched: false,
      gain: 0.9,
      build: async (ctx) => {
        const [snare, kick] = await Promise.all([
          fetchSample(ctx, SAMPLE + 'snare.wav'),
          fetchSample(ctx, HOUSE + 'kick.wav'),
        ]);
        const layered = await layerBuffers([{ buffer: snare }, { buffer: kick, gain: 0.2 }]);
        return growingOneShot(layered, 'clap', [1350, 3900, 9200]);
      },
    },
    {
      id: 'hats',
      name: 'Open / closed hats',
      color: '#3ce0ff',
      pitched: false,
      gain: 0.82,
      build: async (ctx) =>
        variants([
          ['closed', await fetchSample(ctx, HOUSE + 'hat_closed.wav')],
          ['open', await fetchSample(ctx, HOUSE + 'hat_open.wav')],
        ]),
    },
    {
      id: 'perc',
      name: 'Tick / bell percussion',
      color: '#8fb7ff',
      pitched: false,
      gain: 0.55,
      defaultVariant: 'tick',
      build: async (ctx) =>
        variants([
          ['tick', await fetchSample(ctx, SAMPLE + 'tick.wav')],
          ['bell', await fetchSample(ctx, SAMPLE + 'bell.wav')],
        ]),
    },
    {
      id: 'organ',
      name: 'Organ bassline / hook',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 1.0,
      defaultVariant: 'warm',
      noteRows: [0, -2, -4],
      build: async () =>
        variants([
          [
            'warm',
            await houseOrgan({ rootHz: noteHz('D2'), seconds: 0.4, drive: 2.0, brightness: 0.82 }),
          ],
          [
            'bright',
            await houseOrgan({ rootHz: noteHz('D2'), seconds: 0.44, drive: 2.35, brightness: 1.2 }),
          ],
        ]),
    },
    {
      id: 'strings',
      name: 'Quiet chorus strings',
      color: '#4dff88',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.42,
      defaultVariant: 'minor',
      noteRows: [0, -5],
      build: async () =>
        variants([
          [
            'minor',
            await padTriad({
              rootHz: noteHz('D3'),
              seconds: 3.75,
              attack: 0.28,
              semitones: [0, 3, 7],
            }),
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
      build: async (ctx) => {
        const [crash, rise] = await Promise.all([
          fetchSample(ctx, HOUSE + 'crash.wav'),
          noiseRiser({ seconds: 7.7, peak: 0.34 }),
        ]);
        const samples = await growingOneShot(crash, 'crash', [1100, 4100, 9800]);
        samples.set('rise', rise);
        return samples;
      },
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'organ intro',
      charts: { perc: introPerc, organ: sparseOrgan },
    },
    {
      id: 'groove',
      name: 'simple groove',
      charts: {
        kick,
        clap,
        hats: sparseHats,
        perc: introPerc,
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
        organ: sparseOrgan,
        strings,
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
        organ: brightOrgan,
        strings,
        fx: peakFx,
      },
    },
  ],
};
