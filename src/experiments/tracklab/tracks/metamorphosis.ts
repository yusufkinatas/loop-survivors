// "METAMORPHOSIS" — INTERWORLD (drift phonk, 2021). 175 BPM felt as 87.5
// half-time (snare on beat 3), straight 16ths, E minor. The whole main
// track is a 4-bar loop — C, E minor, B, A minor — with one gliding 808
// root per bar and the cowbell hook riding on top. Intensity is encoded
// by melody octave and layer count, not by new material; the payoff is
// the final section, where everything modulates a whole step down to
// D minor (the actual "metamorphosis").
//
// Transcription provenance (research dossier, July 2026): melody and 808
// verified note-for-note against a moderator-approved Songsterr tab,
// re-parsed independently by the fact-check agent (all 97 measures, zero
// out-of-scale notes); drum grid (kick 1, hats 5/13, snare 9) confirmed
// by band-limited onset analysis of the official audio preview; 808 loop
// roots confirmed by per-bar FFT. Signature quirk, measured twice: the
// melody layer sits ~a quarter-tone (+50 cents) off concert pitch while
// the 808 stays in tune — only the lead voices carry tune: 0.5 here.
// Approximations: the 808's bar-to-bar pitch glide becomes a retrigger;
// the Memphis vocal chop (enters ~0:22 in the record) is omitted; the
// D-minor final section is tab-only evidence (medium confidence).

import { cowbell808, drone, fetchSample, noteHz, phonkSnare, sub808, variants } from '../labkits';
import { hits, type LabChart, type LabChartEvent, type LabTrack } from './types';

const S = '/samples/covers/';
const LEAD_DETUNE = 0.5; // the melody layer's quarter-tone, measured

// Melody tables: [step, note] per bar, notes in semitones from E4. The
// downbeat of every bar is a two-note hit (melody note + chord tone).
type Row = [number, number];
const MAIN: { dyad: number; rows: Row[] }[] = [
  { dyad: -4, rows: [[0, 3], [6, 3], [8, -4], [10, 10], [12, 3]] }, // C
  { dyad: 0, rows: [[0, 7], [6, 7], [8, 0], [12, 10], [14, 7]] }, // Em
  { dyad: -5, rows: [[0, 2], [6, 2], [8, -5], [12, 2], [14, 5]] }, // B5
  { dyad: -7, rows: [[0, 0], [6, 0], [8, -7], [10, 3], [12, 0]] }, // Am
];
const FINAL: { dyad: number; rows: Row[] }[] = [
  { dyad: -6, rows: [[0, 1], [6, 1], [8, -6], [10, 8], [12, 1]] }, // Bb
  { dyad: -2, rows: [[0, 5], [6, 5], [8, -2], [12, 8], [14, 5]] }, // Dm
  { dyad: -7, rows: [[0, 0], [6, 0], [8, -7], [12, 0], [14, 3]] }, // Am
  { dyad: -9, rows: [[0, -2], [6, -2], [8, -9], [10, 1], [12, -2]] }, // Gm
];

/** Build an 8-bar melody chart (the 4-bar loop twice) at an octave shift.
 *  The double voice plays the SAME chart notes as the lead: its buffer is
 *  already rendered an octave down (root E3 vs E4), so the octave lives in
 *  the sample, not the chart — keeping playback rate near 1.0 so the
 *  cowbell transient stays tight instead of smearing at half speed.
 *  isDouble only adds the tab's one divergent note (the Em bar ends F#). */
function melody(table: typeof MAIN, octave: number, isDouble = false): LabChart {
  const events: LabChartEvent[] = [];
  for (let half = 0; half < 2; half++) {
    table.forEach((bar, i) => {
      const base = (half * 4 + i) * 16;
      for (const [s, n] of bar.rows) {
        let note = n;
        if (isDouble && table === MAIN && i === 1 && s === 14) note = 2;
        const vel = s === 0 ? 0.92 : s === 8 ? 0.72 : s >= 10 ? 0.85 : 0.8;
        events.push({ step: base + s, velocity: vel, note: note + octave });
        if (s === 0) events.push({ step: base, velocity: 0.72, note: bar.dyad + octave });
      }
    });
  }
  return { bars: 8, events };
}

/** One gliding 808 root per bar, held the whole bar (glide approximated
 *  by retriggering). Notes in semitones from E1. */
function bassLoop(roots: number[]): LabChart {
  const events: LabChartEvent[] = [];
  for (let half = 0; half < 2; half++) {
    roots.forEach((n, i) => {
      events.push({ step: (half * 4 + i) * 16, velocity: 0.95, note: n });
    });
  }
  return { bars: 8, events };
}
const bassMain = bassLoop([8, 0, 7, 5]); // C2 E1 B1 A1
const bassFinal = bassLoop([6, 10, 5, 3]); // Bb1 D2 A1 G1
const bassBreakTail = hits(8, [[0, 0, 0.8, 5]]); // the lone A1 ringing into the break

// Kick 1, hat 5, snare 9, hat 13 (1-indexed) — the verified half-time bar.
function drums(): { kick: LabChart; snare: LabChart; hats: LabChart } {
  const kick: LabChartEvent[] = [];
  const snare: LabChartEvent[] = [];
  const hats: LabChartEvent[] = [];
  for (let b = 0; b < 8; b++) {
    kick.push({ step: b * 16, velocity: 1.0 });
    snare.push({ step: b * 16 + 8, velocity: 0.95 });
    hats.push({ step: b * 16 + 4, velocity: 0.5 }, { step: b * 16 + 12, velocity: 0.5 });
  }
  return {
    kick: { bars: 8, events: kick },
    snare: { bars: 8, events: snare },
    hats: { bars: 8, events: hats },
  };
}
const kit = drums();

/** Ambient pad: root + fifth per bar, whole notes. Semitones from E3. */
function padLoop(pairs: [number, number][]): LabChart {
  const events: LabChartEvent[] = [];
  for (let half = 0; half < 2; half++) {
    pairs.forEach(([root, fifth], i) => {
      const base = (half * 4 + i) * 16;
      events.push({ step: base, velocity: 0.55, note: root });
      events.push({ step: base, velocity: 0.45, note: fifth });
    });
  }
  return { bars: 8, events };
}
const padMain = padLoop([[-4, 3], [0, 7], [-5, 2], [-7, 0]]);
const padFinal = padLoop([[-6, 1], [-2, 5], [-7, 0], [-9, -2]]);

export const METAMORPHOSIS: LabTrack = {
  id: 'metamorphosis',
  title: 'METAMORPHOSIS',
  artist: 'INTERWORLD',
  genre: 'drift phonk',
  bpm: 175,
  bars: 8,
  swing: 0,
  pump: { amount: 0.2, release: 0.16 },
  humanizeGain: 0.04,
  humanizeCents: 0,
  notes:
    'Half-time at 175: the snare sits on beat 3, so it feels like 87.5. Melody and 808 are ' +
    'note-for-note from a verified transcription; the cowbell layer rides a quarter-tone sharp ' +
    'like the record while the 808 stays in tune. The finale drops the whole song a step into ' +
    'D minor — the actual metamorphosis. Sections: intro → drop → peak → break → finale.',
  voices: [
    {
      id: 'kick',
      name: 'Kick (808)',
      color: '#ff5a3c',
      pitched: false,
      ducker: true,
      build: (ctx) => fetchSample(ctx, S + '808/kick.wav').then((b) => variants([['kick', b]])),
    },
    {
      id: 'snare',
      name: 'Phonk snare',
      color: '#ffc93c',
      pitched: false,
      build: async () => variants([['snare', await phonkSnare({ drive: 2.6, wet: 0.4 })]]),
    },
    {
      id: 'hats',
      name: 'Hats',
      color: '#3ce0ff',
      pitched: false,
      gain: 0.85,
      build: (ctx) => fetchSample(ctx, S + '808/hat-closed.wav').then((b) => variants([['closed', b]])),
    },
    {
      id: 'bass',
      name: '808 glide bass',
      color: '#a06bff',
      pitched: true,
      choke: true,
      ducked: true,
      gain: 1.1,
      noteRows: [10, 8, 7, 6, 5, 3, 0],
      build: async () => variants([['sub', await sub808({ rootHz: noteHz('E1'), decay: 1.45, drive: 3.5 })]]),
    },
    {
      id: 'lead',
      name: 'Cowbell hook',
      color: '#ff6bd6',
      pitched: true,
      tune: LEAD_DETUNE,
      gain: 0.95,
      noteRows: [10, 7, 5, 3, 2, 0, -2, -4, -5, -6, -7, -9],
      build: async () =>
        variants([['cowbell', await cowbell808({ rootHz: noteHz('E4'), decay: 0.4, drive: 5, wet: 0.35 })]]),
    },
    {
      id: 'double',
      name: 'Hook double (oct down)',
      color: '#d16bff',
      pitched: true,
      tune: LEAD_DETUNE,
      gain: 0.65,
      noteRows: [0, -12],
      build: async () =>
        variants([['cowbell', await cowbell808({ rootHz: noteHz('E3'), decay: 0.45, drive: 4.5, wet: 0.3 })]]),
    },
    {
      id: 'pad',
      name: 'Water pad',
      color: '#9dff3c',
      pitched: true,
      ducked: true,
      gain: 0.75,
      noteRows: [7, 0, -7],
      build: async () => variants([['pad', await drone({ rootHz: noteHz('E3'), seconds: 1.7, attack: 0.12 })]]),
    },
  ],
  sections: [
    {
      // The low-octave intro melody plays on the double voice (its buffer
      // is natively an octave down) so it runs at rate ~1.0 — pitching the
      // lead buffer down 12 would halve its speed and smear the attack.
      id: 'intro',
      name: 'intro',
      charts: { double: melody(MAIN, 0, true), pad: padMain },
    },
    {
      id: 'drop',
      name: 'drop',
      charts: {
        kick: kit.kick,
        snare: kit.snare,
        hats: kit.hats,
        bass: bassMain,
        lead: melody(MAIN, 0),
        double: melody(MAIN, 0, true),
        pad: padMain,
      },
    },
    {
      id: 'peak',
      name: 'peak',
      charts: {
        kick: kit.kick,
        snare: kit.snare,
        hats: kit.hats,
        bass: bassMain,
        lead: melody(MAIN, 12),
        double: melody(MAIN, 12, true),
        pad: padMain,
      },
    },
    {
      id: 'break',
      name: 'break',
      charts: { double: melody(MAIN, 0, true), pad: padMain, bass: bassBreakTail },
    },
    {
      id: 'finale',
      name: 'finale (D minor)',
      charts: {
        kick: kit.kick,
        snare: kit.snare,
        hats: kit.hats,
        bass: bassFinal,
        lead: melody(FINAL, 0),
        double: melody(FINAL, 0, true),
        pad: padFinal,
      },
    },
  ],
};
