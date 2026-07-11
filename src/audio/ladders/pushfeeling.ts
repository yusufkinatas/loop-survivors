// "Push the Feeling On" — Nightcrawlers, MK Dub of Doom (1992/95). 123 BPM,
// B minor, swung 16ths over a dead-straight kick (the MK shuffle: the soundset
// delays every odd 16th step; these charts stay on the straight grid).
//
// Transcription provenance (docs/research/house-track-dossiers.md, July 2026):
// kick/clap CONFIRMED from a karaoke MIDI; the M1 organ bass chain, the organ
// stab line, the chopped-vocal hook, and the sung "push the feeling on" phrase
// are PROBABLE (one full MIDI transcription, contour ear-checked); hat/shaker
// detail is INFERRED from the record and kept simple and idiomatic. Chord
// voicings (Bm and G) come from Chordify's chord detection; the exact record
// voicings are INFERRED.
//
// Authoring deviations from the dossier tabs, and why:
// - Velocities are gameplay stats (damage/size), so the tabs' hot 0.85-1.0
//   lines are scaled down to sit near the house ladders' tier-4 average; the
//   ACCENT SHAPE (which hit is strongest) is kept verbatim. The tracklab
//   arrangement (src/tracklab/tracks/pushfeeling.ts) uses the tab velocities
//   untouched — that is the listening copy.
// - The organ stabs' grace-note flick (dossier: a quick wrong note, A, sliding
//   into the right chord a 16th later) becomes a soft SAME-chord pre-hit one
//   step before the main hit: the chord role's root shifts are locked to the
//   Bm/G roots (0 and 8 mod 12), so the out-of-key A grace can't be spelled.
//   The swung 16th grid supplies the "flick" feel instead.
// - The dossier's every-8th-bar snare fill is folded onto the clap's bar 4
//   (the phrase is 4 bars; snare is not a supported role on this track).
//
// Note spelling, relative to B: F# = -5 (the fifth below, where the record's
// bass sits), D = +3, A = -2, C# = +2, E = +5, G root shift = -4 (pitch class
// 8, the G below B — the dossier's G2-rooted voicing).

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { RISER } from './shared';

export const PUSHFEELING_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse: dead-straight four-on-the-floor at EVERY tier (MIDI-confirmed; MK
  // dubs put all the shuffle in the top layers, never the kick). Growth is
  // house-law ghost pickups (soft variant) at phrase tails only — the four
  // downbeats never move.
  kick: [
    d('kick', 'X...X...X...X...'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X..-'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X..-',
      'X...X...X...X...', 'X...X...X...X..-'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X..-',
      'X...X...X...X...', 'X...X...X...X.--'),
  ],
  // Backbeat: clap locked to beats 2 & 4 (MIDI-confirmed, v0.95 flat). Growth
  // = the dossier's every-8th-bar fill (steps 11/12/14) landing on bar 4 of
  // the phrase at the top tiers; the backbeat itself never moves.
  clap: [
    d('clap', '....X.......X...'),
    d('clap', '....X.......X...', '....X.......X..-'),
    d('clap',
      '....X.......X...', '....X.......X...',
      '....X.......X...', '....X.......X.x.'),
    d('clap',
      '....X.......X...', '....X.......X...',
      '....X.......X...', '....X......xX.x.'),
  ],
  // Hats (INFERRED layer): open hats on all four off-beats with closed 16ths
  // filling around them — the dossier's CH row has gaps exactly on the swung
  // odd steps (1/5/9/13), so the shuffle breathes there. Tier 4 = the merged
  // dossier grid (closed 0/3/4/7/8/11/12/15, open 2/6/10/14).
  hat: [
    d('hat', '..O...O...O...O.'),
    d('hat', 'x.O...O.x.O...O.'),
    d('hat', 'x.Oox.O.x.Oox.O.'),
    d('hat', 'x.Oox.Oox.Oox.Oo'),
  ],
  // Hats rival (INFERRED): the swung shaker — running 16ths, soft on the beat
  // and accented on the swung off-16ths (the dossier's alternating loud/soft
  // pairs). Growth: quarters -> 8ths -> gapped 16ths -> the full swung wall.
  shaker: [
    d('shaker', 'o...o...o...o...'),
    d('shaker', 'o.x.o.x.o.x.o.x.'),
    d('shaker', 'oxoxoxo.oxoxoxo.'),
    d('shaker', 'oxoxoxoxoxoxoxox'),
  ],
  // Bass: THE M1 organ bass (PROBABLE, MIDI). The dotted-8th chain — hit beat
  // 1, hit beat 2, then every 3 sixteenths (steps 0, 4, 7, 10, 13) — pulsing
  // B with the chain tail dropping to F# (bar 1) and lifting to D (bar 2).
  // Tier 1 is just the two beat hits; the chain fills in, then learns the
  // F# tail, then the full two-bar B/F# -> B/D alternation.
  bass: [
    m('bass', 1, [[0, 0.95, 0], [4, 0.85, 0]]),
    m('bass', 1, [[0, 0.95, 0], [4, 0.85, 0], [7, 0.8, 0], [10, 0.8, 0], [13, 0.8, 0]]),
    m('bass', 1, [[0, 0.95, 0], [4, 0.85, 0], [7, 0.8, -5], [10, 0.8, -5], [13, 0.8, -5]]),
    m('bass', 2, [
      [0, 0.95, 0], [4, 0.85, 0], [7, 0.8, -5], [10, 0.8, -5], [13, 0.8, -5],
      [B, 0.95, 0], [B + 4, 0.85, 0], [B + 7, 0.8, 3], [B + 10, 0.8, 3], [B + 13, 0.8, 3],
    ]),
  ],
  // Harmony: M1 organ stabs shadowing the bass rhythm (PROBABLE skeleton,
  // INFERRED voicings): bar 1 the Bm chord (root 0, 'stab'), bar 2 the G major
  // chord (root -4, the 'gmaj' major-voiced variant — see the kit file). The
  // main hit sits on step 1 at every tier (the dossier's pushed entry); from
  // tier 3 a soft same-chord grace hit lands on step 0 — the flick. Tier 4
  // adds a step-15 anticipation of the NEXT bar's chord.
  chord: [
    m('chord', 2, [
      [1, 0.8, 0, 'stab'],
      [B + 1, 0.8, -4, 'gmaj'],
    ]),
    m('chord', 2, [
      [1, 0.85, 0, 'stab'], [4, 0.7, 0, 'stab'],
      [B + 1, 0.85, -4, 'gmaj'], [B + 4, 0.7, -4, 'gmaj'],
    ]),
    m('chord', 2, [
      [0, 0.45, 0, 'stab'], [1, 0.85, 0, 'stab'], [4, 0.7, 0, 'stab'],
      [7, 0.65, 0, 'stab'], [10, 0.65, 0, 'stab'], [13, 0.65, 0, 'stab'],
      [B, 0.45, -4, 'gmaj'], [B + 1, 0.85, -4, 'gmaj'], [B + 4, 0.7, -4, 'gmaj'],
      [B + 7, 0.65, -4, 'gmaj'], [B + 10, 0.65, -4, 'gmaj'], [B + 13, 0.65, -4, 'gmaj'],
    ]),
    m('chord', 2, [
      [0, 0.45, 0, 'stab'], [1, 0.85, 0, 'stab'], [4, 0.7, 0, 'stab'],
      [7, 0.7, 0, 'stab'], [10, 0.7, 0, 'stab'], [13, 0.7, 0, 'stab'], [15, 0.55, -4, 'gmaj'],
      [B, 0.45, -4, 'gmaj'], [B + 1, 0.85, -4, 'gmaj'], [B + 4, 0.7, -4, 'gmaj'],
      [B + 7, 0.7, -4, 'gmaj'], [B + 10, 0.7, -4, 'gmaj'], [B + 13, 0.7, -4, 'gmaj'], [B + 15, 0.55, 0, 'stab'],
    ]),
  ],
  // Melody: THE chopped-vocal hook (PROBABLE, MIDI) — short vowel bursts
  // replayed as a melody, memorable gibberish by design. Variants rotate the
  // vowel per hit to fake the Akai key-group chopping. Tiers: the opening
  // call, the full bar, both alternating endings, then four bars ending in a
  // stuttered-chop turnaround (the same syllable machine-gunned).
  lead: [
    m('lead', 1, [
      [0, 0.65, 0, 'ah'], [3, 0.55, -2, 'eh'], [6, 0.55, -5, 'oh'], [8, 0.65, 0, 'ah'],
    ]),
    m('lead', 1, [
      [0, 0.65, 0, 'ah'], [3, 0.55, -2, 'eh'], [6, 0.55, -5, 'oh'], [8, 0.65, 0, 'ah'],
      [11, 0.55, 2, 'ih'], [13, 0.5, 0, 'eh'], [14, 0.55, 2, 'ah'],
    ]),
    m('lead', 2, [
      [0, 0.65, 0, 'ah'], [3, 0.55, -2, 'eh'], [6, 0.55, -5, 'oh'], [8, 0.65, 0, 'ah'],
      [11, 0.55, 2, 'ih'], [13, 0.5, 0, 'eh'], [14, 0.55, 2, 'ah'],
      [B, 0.65, 0, 'ah'], [B + 3, 0.55, -2, 'eh'], [B + 6, 0.55, -5, 'oh'], [B + 8, 0.65, 0, 'ah'],
      [B + 10, 0.55, -2, 'ih'], [B + 12, 0.55, 0, 'eh'], [B + 14, 0.55, 2, 'oh'],
    ]),
    m('lead', 4, [
      [0, 0.65, 0, 'ah'], [3, 0.55, -2, 'eh'], [6, 0.55, -5, 'oh'], [8, 0.65, 0, 'ah'],
      [11, 0.55, 2, 'ih'], [13, 0.5, 0, 'eh'], [14, 0.55, 2, 'ah'],
      [B, 0.65, 0, 'ah'], [B + 3, 0.55, -2, 'eh'], [B + 6, 0.55, -5, 'oh'], [B + 8, 0.65, 0, 'ah'],
      [B + 10, 0.55, -2, 'ih'], [B + 12, 0.55, 0, 'eh'], [B + 14, 0.55, 2, 'oh'],
      [2 * B, 0.65, 0, 'ah'], [2 * B + 3, 0.55, -2, 'eh'], [2 * B + 6, 0.55, -5, 'oh'], [2 * B + 8, 0.65, 0, 'ah'],
      [2 * B + 11, 0.55, 2, 'ih'], [2 * B + 13, 0.5, 0, 'eh'], [2 * B + 14, 0.55, 2, 'ah'],
      // Bar 4: the front of the hook, then the stuttered-chop turnaround.
      [3 * B, 0.65, 0, 'ah'], [3 * B + 3, 0.55, -2, 'eh'], [3 * B + 6, 0.55, -5, 'oh'], [3 * B + 8, 0.65, 0, 'ah'],
      [3 * B + 10, 0.5, 0, 'ih'], [3 * B + 11, 0.5, 0, 'ih'], [3 * B + 12, 0.55, 0, 'eh'], [3 * B + 14, 0.55, 2, 'ah'],
    ]),
  ],
  // Melody rival: the sung "push the feeling on" phrase (PROBABLE, MIDI; the
  // 95 Revisited edit's foreground line), voiced as a soft pluck. Bar 1 rises
  // to the high A; bar 2 answers on repeated C#s. Tiers: the rise, the full
  // bar, both bars, then accents up plus a step-15 pickup into the loop.
  bell: [
    m('bell', 1, [[0, 0.5, 0], [4, 0.5, 3], [6, 0.5, 5]]),
    m('bell', 1, [
      [0, 0.55, 0], [2, 0.4, 0], [4, 0.5, 3], [6, 0.5, 5],
      [8, 0.55, 10], [11, 0.5, 7], [14, 0.45, 7],
    ]),
    m('bell', 2, [
      [0, 0.55, 0], [2, 0.4, 0], [4, 0.5, 3], [6, 0.5, 5],
      [8, 0.55, 10], [11, 0.5, 7], [14, 0.45, 7],
      [B, 0.55, 0], [B + 2, 0.4, 0], [B + 4, 0.5, 3], [B + 6, 0.5, 5],
      [B + 8, 0.5, 2], [B + 11, 0.45, 2], [B + 14, 0.45, 2],
    ]),
    m('bell', 2, [
      [0, 0.6, 0], [2, 0.4, 0], [4, 0.5, 3], [6, 0.5, 5],
      [8, 0.6, 10], [11, 0.5, 7], [14, 0.45, 7],
      [B, 0.6, 0], [B + 2, 0.4, 0], [B + 4, 0.5, 3], [B + 6, 0.5, 5],
      [B + 8, 0.55, 2], [B + 11, 0.5, 2], [B + 14, 0.45, 2], [B + 15, 0.35, 0],
    ]),
  ],
  // FX: the auto-dash riser, shared voicing. The record builds tension by
  // muting layers rather than sweeps, so the riser stays utility-only and
  // there is no crash ladder on this track.
  riser: RISER,
};
