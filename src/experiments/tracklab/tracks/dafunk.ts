// "Da Funk" — Daft Punk (1995). 111 BPM, G minor, dead straight, no pump
// (the groove breathes by arrangement, not sidechain — Homework-era).
//
// Transcription provenance (research dossier, July 2026): hook riff from a
// parsed cover MIDI, note-for-note confirmed by a second tab source, played
// in parallel fourths; drum grid and bass from Attack Magazine's
// deconstruction + the same MIDI. Approximations: the sampled Vaughn Mason
// funk loop and Barry White fill bar are not recreated (machine skeleton
// only); the TB-303 acid line has no slides here (discrete steps, line
// authored in the sourced G/Bb/C/Eb/F note set); the rave stab's chord
// voicing is inferred as G minor.

import { fetchSample, funkBass, funkLead, noteHz, sawStab, variants } from '../labkits';
import { hits, type LabTrack, type LabChart, type LabChartEvent } from './types';

const S = '/samples/covers/';

// Hook: each bar = a long target note, then a 3-note pickup run (8th notes)
// landing the next long note early on step 14 — the funk push. Run
// velocities are MIDI-verified: 0.8, 0.8, then 0.6 (the third note ducks).
// Parallel fourths: every note doubled +5 semitones (whether the record's
// double sits a fourth above or below is unconfirmed — audition by ear;
// flip the +5 to -5 to try the other reading).
function hook(): LabChart {
  const rows: [number, number, number, number][] = [
    [0, 0, 1.0, 0],
    [0, 8, 0.8, -2],
    [0, 10, 0.8, 0],
    [0, 12, 0.6, 3],
    [0, 14, 1.0, -5],
    [1, 8, 0.8, -7],
    [1, 10, 0.8, -5],
    [1, 12, 0.6, -2],
    [1, 14, 1.0, -9],
    [2, 8, 0.8, -10],
    [2, 10, 0.8, -9],
    [2, 12, 0.6, -5],
    [2, 14, 1.0, -12],
    [3, 8, 0.8, -10],
    [3, 12, 0.7, -9],
  ];
  const events: LabChartEvent[] = [];
  for (const [bar, step, vel, note] of rows) {
    events.push({ step: bar * 16 + step, velocity: vel, note });
    events.push({ step: bar * 16 + step, velocity: vel * 0.8, note: note + 5 });
  }
  return { bars: 4, events };
}

// Rave stab: Gm chord (G3 + Bb3 + D4) as one punchy hit, on the dossier's
// syncopated 1, 3, 6, 9, 13 grid (0-indexed 0, 2, 5, 8, 12).
function stabChart(): LabChart {
  const events: LabChartEvent[] = [];
  for (const [step, vel] of [
    [0, 0.8],
    [2, 0.6],
    [5, 0.75],
    [8, 0.6],
    [12, 0.7],
  ] as const) {
    for (const note of [0, -4, -7]) {
      events.push({ step, velocity: vel * (note === 0 ? 1 : 0.85), note });
    }
  }
  return { bars: 1, events };
}

// Acid line (authored, not transcribed): 2 bars in the sourced note set
// {0,3,5,8,10} across octaves, accent-heavy, restless like a 303.
const acidChart = hits(2, [
  [0, 1, 0.9, 0],
  [0, 3, 0.55, 12],
  [0, 4, 0.75, 10],
  [0, 6, 0.6, 8],
  [0, 7, 0.85, 0],
  [0, 9, 0.6, 3],
  [0, 11, 0.75, 5],
  [0, 12, 0.55, 3],
  [0, 14, 0.9, 12],
  [1, 1, 0.9, 0],
  [1, 3, 0.55, 15],
  [1, 4, 0.75, 12],
  [1, 6, 0.6, 10],
  [1, 8, 0.85, 8],
  [1, 10, 0.6, 5],
  [1, 11, 0.75, 3],
  [1, 13, 0.55, 0],
  [1, 14, 0.9, -2],
]);

const kickChart = hits(1, [
  [0, 0, 1.0],
  [0, 4, 0.95],
  [0, 8, 1.0],
  [0, 12, 0.95],
]);

const clapChart = hits(1, [
  [0, 4, 0.95],
  [0, 12, 0.95],
]);

function hatChart(variant: string): LabChart {
  const events: LabChartEvent[] = [];
  for (let s = 0; s < 16; s += 2) {
    events.push({ step: s, velocity: s % 4 === 0 ? 0.75 : 0.5, variant });
  }
  events.push({ step: 15, velocity: 0.4, variant }); // the 16th push into the next bar
  return { bars: 1, events };
}

const bassChart = hits(1, [
  [0, 0, 1.0, 0],
  [0, 4, 0.95, 0],
  [0, 8, 1.0, 0],
  [0, 12, 0.95, 0],
]);

export const DA_FUNK: LabTrack = {
  id: 'dafunk',
  title: 'Da Funk',
  artist: 'Daft Punk',
  genre: 'french electro-funk',
  bpm: 111,
  bars: 8,
  swing: 0,
  pump: undefined, // 1995: no sidechain pump; the arrangement breathes instead
  notes:
    'Hook transcription is MIDI-confirmed; the dusty sampled funk loop under the real record is not ' +
    'recreated, so this skeleton is drier than the original. Acid section: 303 line approximated ' +
    'without slides. Sections: groove → hook → acid → peak.',
  voices: [
    {
      id: 'kick',
      name: 'Kick (909 deep)',
      color: '#ff5a3c',
      pitched: false,
      build: (ctx) => fetchSample(ctx, S + '909/kick.wav').then((b) => variants([['kick', b]])),
    },
    {
      id: 'clap',
      name: 'Clap',
      color: '#ffc93c',
      pitched: false,
      build: (ctx) => fetchSample(ctx, S + '909/clap.wav').then((b) => variants([['clap', b]])),
    },
    {
      id: 'hat',
      name: 'Hi-hat (808/909)',
      color: '#3ce0ff',
      pitched: false,
      gain: 0.9,
      build: async (ctx) =>
        variants([
          ['808', await fetchSample(ctx, S + '808/hat-closed.wav')],
          ['909', await fetchSample(ctx, S + '909/hat-closed.wav')],
        ]),
    },
    {
      id: 'bass',
      name: 'Pluck bass (G)',
      color: '#a06bff',
      pitched: true,
      choke: true,
      noteRows: [0],
      build: async () => variants([['pluck', await funkBass({ rootHz: noteHz('G1'), decay: 0.32 })]]),
    },
    {
      id: 'lead',
      name: 'Lead hook',
      color: '#ff6bd6',
      pitched: true,
      gain: 0.95,
      noteRows: [3, 0, -2, -5, -7, -9, -10, -12],
      build: async () =>
        variants([
          ['lead', await funkLead({ rootHz: noteHz('G4'), decay: 0.62, drive: 3.4, q: 7, cutoff: 3000, sweepTo: 700 })],
        ]),
    },
    {
      id: 'stab',
      name: 'Rave stab',
      color: '#4dff88',
      pitched: true,
      gain: 0.8,
      noteRows: [0, -4, -7],
      build: async () =>
        variants([
          ['stab', await sawStab({ rootHz: noteHz('D4'), decay: 0.26, drive: 2.6, cutoff: 2800, sweepTo: 900, q: 2 })],
        ]),
    },
    {
      id: 'acid',
      name: 'Acid 303',
      color: '#9dff3c',
      pitched: true,
      choke: true,
      gain: 0.85,
      noteRows: [15, 12, 10, 8, 5, 3, 0, -2],
      build: async () =>
        variants([
          ['303', await sawStab({ rootHz: noteHz('G2'), decay: 0.2, drive: 4.5, cutoff: 1100, sweepTo: 260, q: 13, saws: 1 })],
        ]),
    },
  ],
  sections: [
    {
      id: 'groove',
      name: 'groove',
      charts: { kick: kickChart, clap: clapChart, hat: hatChart('808'), bass: bassChart },
    },
    {
      id: 'hook',
      name: 'hook',
      charts: { kick: kickChart, clap: clapChart, hat: hatChart('808'), bass: bassChart, lead: hook() },
    },
    {
      id: 'acid',
      name: 'acid',
      charts: { kick: kickChart, clap: clapChart, hat: hatChart('909'), stab: stabChart(), acid: acidChart },
    },
    {
      id: 'peak',
      name: 'peak',
      charts: {
        kick: kickChart,
        clap: clapChart,
        hat: hatChart('909'),
        bass: bassChart,
        lead: hook(),
        stab: stabChart(),
        acid: acidChart,
      },
    },
  ],
};
