// "Satisfaction" — Benny Benassi presents The Biz (2002). 130 BPM, A#/Bb
// minor with the Phrygian rub: the riff keeps grinding B natural (one half
// step above the root) against A#. Dead straight, mechanical, and the mix's
// signature is the extreme pump: every kick slams the riff down 6-10 dB and
// lets it swell back — overdone on purpose, per the production lore.
//
// Transcription provenance (research dossier, July 2026): riff notes parsed
// byte-level from a fan MIDI, cross-confirmed by a bass tab (A#2 core, F2,
// A#1 dip, B2 neighbor; 8-bar phrase A B A B A B A T with a staccato-triple
// turnaround). Drum grid inferred but genre-canonical.
// Approximation: the record's ~130ms portamento (pitch glide between riff
// notes) becomes hard steps in a one-shot engine.
//
// The record's robot vocals (MacinTalk Fred + Victoria) were removed on the
// developer's ear — he didn't like them. The voice samples were deleted too
// (public/samples/covers/voice/ is gone).

import { fetchSample, noiseRiser, sawStab, variants } from '../labkits';
import { noteHz } from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const S = '/samples/covers/';

// The riff, notes relative to the voice's root: 0=A#, -5=F, -12=A# an octave
// down, +1=B natural (the Phrygian bite).
function riffChart(variant: string, scale = 1): LabChart {
  const A: [number, number, number][] = [
    [0, 1.0, 0],
    [3, 0.95, -5],
    [6, 1.0, -12],
    [12, 0.72, 1],
    [13, 0.72, 1],
    [14, 0.9, 1],
  ];
  const B: [number, number, number][] = [
    [0, 1.0, 0],
    [3, 0.95, -5],
    [6, 0.85, 0],
    [8, 0.85, 1],
    [10, 0.85, 0],
    [12, 0.85, 1],
    [14, 0.9, 0],
  ];
  const T: [number, number, number][] = [0, 4, 8, 12].flatMap((s) => [
    [s, 0.78, 1],
    [s + 1, 0.78, 1],
    [s + 2, 0.92, 1],
  ]) as [number, number, number][];
  const shape = [A, B, A, B, A, B, A, T];
  const events: LabChartEvent[] = [];
  shape.forEach((bar, i) => {
    for (const [step, vel, note] of bar) {
      events.push({ step: i * 16 + step, velocity: Math.min(1, vel * scale), note, variant });
    }
  });
  return { bars: 8, events };
}

const kickChart = hits(1, [
  [0, 0, 1.0],
  [0, 4, 1.0],
  [0, 8, 1.0],
  [0, 12, 1.0],
]);

const clapChart = hits(1, [
  [0, 4, 0.95],
  [0, 12, 0.95],
]);

function hatsChart(withSixteenths: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (const s of [2, 6, 10, 14]) events.push({ step: s, velocity: 0.85, variant: 'open' });
  if (withSixteenths) {
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 2) continue; // the open hat owns the offbeats
      events.push({ step: s, velocity: 0.28, variant: 'closed' });
    }
  }
  return { bars: 1, events };
}

const fxCrash = hits(8, [[0, 0, 0.9, null, 'crash']]);
const fxRiser = hits(8, [[4, 0, 0.9, null, 'riser']]);

async function riffSamples(rootHz: number, thin: boolean): Promise<Map<string, AudioBuffer>> {
  const c = thin ? 1.35 : 1;
  return variants([
    ['muffled', await sawStab({ rootHz, decay: 0.45, cutoff: 420 * c, sweepTo: 300, q: 1.5, drive: 1.6 })],
    ['mid', await sawStab({ rootHz, decay: 0.42, cutoff: 1400 * c, sweepTo: 620, q: 2.5, drive: 3 })],
    ['open', await sawStab({ rootHz, decay: 0.4, cutoff: 3600 * c, sweepTo: 1200, q: 4, drive: 5.5 })],
  ]);
}

export const SATISFACTION: LabTrack = {
  id: 'satisfaction',
  title: 'Satisfaction',
  artist: 'Benny Benassi',
  genre: 'electro house',
  bpm: 130,
  bars: 8,
  swing: 0,
  pump: { amount: 0.62, release: 0.27 },
  humanizeGain: 0.03, // mechanical by design
  humanizeCents: 0,
  notes:
    'The riff is the bass is the melody; its filter opening across sections IS the arrangement ' +
    '(muffled → mid → open variants). The record’s pitch-glide between riff notes is approximated ' +
    'with hard steps. Sections: intro → build → drop → breakdown. (Robot vocals removed per ear.)',
  voices: [
    {
      id: 'kick',
      name: 'Kick (pump driver)',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: (ctx) => fetchSample(ctx, S + '909/kick-short.wav').then((b) => variants([['kick', b]])),
    },
    {
      id: 'clap',
      name: 'Clap',
      color: '#ffc93c',
      pitched: false,
      build: (ctx) => fetchSample(ctx, S + '909/clap.wav').then((b) => variants([['clap', b]])),
    },
    {
      id: 'hats',
      name: 'Hats (909)',
      color: '#3ce0ff',
      pitched: false,
      ducked: true,
      gain: 0.9,
      build: async (ctx) =>
        variants([
          ['open', await fetchSample(ctx, S + '909/hat-open.wav')],
          ['closed', await fetchSample(ctx, S + '909/hat-closed.wav')],
        ]),
    },
    {
      id: 'bass',
      name: 'Riff bass (A#)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      noteRows: [1, 0, -5, -12],
      defaultVariant: 'open',
      build: () => riffSamples(noteHz('A#2'), false),
    },
    {
      id: 'lead',
      name: 'Riff lead (octave up)',
      color: '#ff6bd6',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 0.8,
      noteRows: [1, 0, -5, -12],
      defaultVariant: 'open',
      build: () => riffSamples(noteHz('A#3'), true),
    },
    {
      id: 'fx',
      name: 'FX (crash / riser)',
      color: '#9a9ab0',
      pitched: false,
      gain: 0.8,
      build: async (ctx) =>
        variants([
          ['crash', await fetchSample(ctx, S + '909/crash.wav')],
          ['riser', await noiseRiser({ seconds: 7.3, peak: 0.5 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'intro',
      charts: { kick: kickChart, hats: hatsChart(false), bass: riffChart('muffled', 0.92) },
    },
    {
      id: 'build',
      name: 'build',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hatsChart(false),
        bass: riffChart('mid'),
        lead: riffChart('mid', 0.7),
        fx: fxRiser,
      },
    },
    {
      id: 'drop',
      name: 'drop',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hats: hatsChart(true),
        bass: riffChart('open'),
        lead: riffChart('open', 0.82),
        fx: fxCrash,
      },
    },
    {
      id: 'breakdown',
      name: 'breakdown',
      charts: {
        bass: riffChart('muffled', 0.85),
        fx: fxRiser,
      },
    },
  ],
};
