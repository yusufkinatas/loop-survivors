// "Sahara" — Hensonn (drift phonk, 2021). 115 BPM, half-time feel (the
// snare backbeat lands on beat 3, so it *feels* like 57.5), dead straight
// 16ths. The whole track is a 2-bar chord vamp: D major for 2 bars, then
// everything slides one semitone up to Eb major for 2 bars, forever. The
// mix hierarchy is extreme and intentional: the 808 sub gallop IS the mix
// (measured ~15-20 dB above the bell), everything else rides on top.
//
// Transcription provenance (research dossier, July 2026): BPM confirmed by
// onset autocorrelation of the official audio preview; chords from a
// beat-level Chordify map (full track); bell hook rhythm from a MuseScore
// transcription cross-checked against measured audio accents; 808 gallop
// figure from the same transcription, note choice (the sub plays the FIFTH
// of each chord: A under D, Bb under Eb) measured from the audio spectrum.
// Signature detail, also measured: the master is tuned ~+47 cents sharp —
// every pitched voice here carries tune: 0.47 to keep that eerie offset.
// Approximation: bar-level micro-placement of the bell pickup pair is
// partially inferred; the two 1-bar FX dropout bars are represented by
// section switching rather than charted.

import { fetchSample, noteHz, padTriad, phonkBell, phonkSnare, sub808, variants } from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const S = '/samples/covers/';
const DETUNE = 0.47; // semitones sharp of A440, measured from the record

// The bell hook, one shape per chord bar, root = A4 (the repeated fifth
// over D). D bars: F#(-3) pickup, then staccato A(0)s. Eb bars: the same
// grid a semitone up: G(-2) and Bb(+1). Every 4th bar the back half turns
// into the dotted-16th turnaround figure.
function bellHook(variant: string): LabChart {
  const events: LabChartEvent[] = [];
  const bar = (b: number, third: number, fifth: number) => {
    events.push(
      { step: b * 16 + 0, velocity: 0.85, note: third, variant },
      { step: b * 16 + 2, velocity: 0.8, note: fifth, variant },
      { step: b * 16 + 4, velocity: 0.9, note: fifth, variant },
      { step: b * 16 + 10, velocity: 0.75, note: fifth, variant },
      { step: b * 16 + 12, velocity: 0.85, note: fifth, variant },
    );
  };
  const turnaround = (b: number, third: number, fifth: number) => {
    events.push(
      { step: b * 16 + 0, velocity: 0.85, note: third, variant },
      { step: b * 16 + 2, velocity: 0.8, note: fifth, variant },
      { step: b * 16 + 4, velocity: 0.9, note: fifth, variant },
      { step: b * 16 + 8, velocity: 0.8, note: fifth, variant },
      { step: b * 16 + 11, velocity: 0.75, note: fifth, variant },
      { step: b * 16 + 12, velocity: 0.7, note: third, variant },
      { step: b * 16 + 14, velocity: 0.85, note: fifth, variant },
    );
  };
  for (const half of [0, 4]) {
    bar(half + 0, -3, 0); // D
    bar(half + 1, -3, 0); // D
    bar(half + 2, -2, 1); // Eb
    turnaround(half + 3, -2, 1); // Eb, with the fill
  }
  return { bars: 8, events };
}

// 808 sub gallop: dotted-8th + 16th pairs (accents on the beats, pickups a
// 16th before the next), on the chord's FIFTH: A1 for D bars, Bb1 for Eb.
function gallop(crescendo: boolean): LabChart {
  const events: LabChartEvent[] = [];
  for (let b = 0; b < 8; b++) {
    const note = b % 4 < 2 ? 0 : 1;
    const scale = crescendo ? 0.5 + 0.07 * b : 1;
    for (const [s, v] of [
      [0, 0.95],
      [3, 0.75],
      [4, 0.9],
      [7, 0.75],
      [8, 0.95],
      [11, 0.75],
      [12, 0.9],
      [15, 0.78],
    ] as const) {
      events.push({ step: b * 16 + s, velocity: Math.min(1, v * scale), note });
    }
  }
  return { bars: 8, events };
}

// Half-time drums, 2-bar loop: bar A kick on the 1, bar B kick on beat 2,
// snare always on beat 3. Bar 8 carries the 16th snare roll into the next
// phrase (the genre's tension device — no risers, just rolls).
function drums(withKick: boolean, withRoll: boolean): { kick: LabChart; snare: LabChart } {
  const kick: LabChartEvent[] = [];
  const snare: LabChartEvent[] = [];
  for (let b = 0; b < 8; b++) {
    if (withKick) {
      if (b % 2 === 0) kick.push({ step: b * 16 + 0, velocity: 1.0 });
      else {
        kick.push({ step: b * 16 + 4, velocity: 0.95 });
        if (b % 4 === 1) kick.push({ step: b * 16 + 15, velocity: 0.45 });
      }
    }
    snare.push({ step: b * 16 + 8, velocity: 0.95 });
  }
  if (withRoll) {
    for (const [i, v] of [0.4, 0.45, 0.5, 0.6, 0.72, 0.88].entries()) {
      snare.push({ step: 7 * 16 + 10 + i, velocity: v });
    }
  }
  return {
    kick: { bars: 8, events: kick },
    snare: { bars: 8, events: snare },
  };
}

const dropDrums = drums(true, true);
const breakDrums = drums(false, true);
const buildSnare = drums(false, true).snare;

// Second bell/keys voice: the chord root held as a half note under the
// hook (D4 in D bars, Eb4 in Eb bars) — the glue between hook and harmony.
const keysChart = hits(8, [
  [0, 4, 0.6, 0],
  [1, 4, 0.55, 0],
  [2, 4, 0.6, 1],
  [3, 4, 0.55, 1],
  [4, 4, 0.6, 0],
  [5, 4, 0.55, 0],
  [6, 4, 0.6, 1],
  [7, 4, 0.55, 1],
]);

// Pad: whole-note triads tied across each 2-bar chord block.
const padChart = hits(8, [
  [0, 0, 0.7, 0],
  [2, 0, 0.7, 1],
  [4, 0, 0.7, 0],
  [6, 0, 0.7, 1],
]);

const crashChart = hits(8, [[0, 0, 0.8, null, 'crash']]);

export const SAHARA: LabTrack = {
  id: 'sahara',
  title: 'Sahara',
  artist: 'Hensonn',
  genre: 'drift phonk',
  bpm: 115,
  bars: 8,
  swing: 0,
  pump: { amount: 0.22, release: 0.18 }, // subtle at most, per the record
  humanizeGain: 0.04,
  humanizeCents: 0,
  notes:
    'Half-time: the snare sits on beat 3, so 115 feels like 57.5. The 808 sub gallop is deliberately ' +
    'the loudest thing — that is the record, not a mix error. Every pitched voice is tuned +47 cents ' +
    'sharp like the master. Sections: intro → build → drop → break.',
  voices: [
    {
      id: 'kick',
      name: 'Kick (808 boom)',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: (ctx) => fetchSample(ctx, S + '808/kick-boom.wav').then((b) => variants([['kick', b]])),
    },
    {
      id: 'snare',
      name: 'Phonk snare',
      color: '#ffc93c',
      pitched: false,
      build: async () => variants([['snare', await phonkSnare({ drive: 2.8, wet: 0.45 })]]),
    },
    {
      id: 'bass',
      name: '808 sub gallop',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 1.15, // the sub IS the mix
      tune: DETUNE,
      noteRows: [1, 0],
      build: async () => variants([['sub', await sub808({ rootHz: noteHz('A1'), decay: 1.5, drive: 4 })]]),
    },
    {
      id: 'bell',
      name: 'Bell hook',
      color: '#ff6bd6',
      pitched: true,
      tune: DETUNE,
      gain: 0.9,
      noteRows: [1, 0, -2, -3],
      defaultVariant: 'clean',
      build: async () =>
        variants([
          ['clean', await phonkBell({ rootHz: noteHz('A4'), decay: 1.4, wet: 0.55 })],
          ['crunch', await phonkBell({ rootHz: noteHz('A4'), decay: 1.4, wet: 0.5, drive: 3.2 })],
        ]),
    },
    {
      id: 'keys',
      name: 'Keys (chord root)',
      color: '#4dff88',
      pitched: true,
      tune: DETUNE,
      gain: 0.7,
      noteRows: [1, 0],
      build: async () =>
        variants([['keys', await phonkBell({ rootHz: noteHz('D4'), decay: 1.7, wet: 0.35, partialGains: [1, 0.25, 0.3, 0.2] })]]),
    },
    {
      id: 'pad',
      name: 'Desert pad',
      color: '#9dff3c',
      pitched: true,
      choke: true,
      ducked: true,
      tune: DETUNE,
      gain: 0.8,
      noteRows: [1, 0],
      build: async () => variants([['pad', await padTriad({ rootHz: noteHz('D3'), seconds: 4.4 })]]),
    },
    {
      id: 'fx',
      name: 'Crash',
      color: '#9a9ab0',
      pitched: false,
      gain: 0.7,
      build: (ctx) => fetchSample(ctx, S + '808/crash.wav').then((b) => variants([['crash', b]])),
    },
  ],
  sections: [
    {
      id: 'intro',
      name: 'intro',
      charts: { bell: bellHook('clean'), keys: keysChart, pad: padChart },
    },
    {
      id: 'build',
      name: 'build',
      charts: {
        bell: bellHook('clean'),
        keys: keysChart,
        pad: padChart,
        bass: gallop(true),
        snare: buildSnare,
      },
    },
    {
      id: 'drop',
      name: 'drop',
      charts: {
        kick: dropDrums.kick,
        snare: dropDrums.snare,
        bass: gallop(false),
        bell: bellHook('crunch'),
        keys: keysChart,
        pad: padChart,
        fx: crashChart,
      },
    },
    {
      id: 'break',
      name: 'break',
      charts: {
        snare: breakDrums.snare,
        bass: gallop(false),
        bell: bellHook('clean'),
        pad: padChart,
      },
    },
  ],
};
