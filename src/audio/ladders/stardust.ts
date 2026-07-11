// "Music Sounds Better with You" — Stardust (1998). 124 BPM French filter
// house in A minor, dead straight. The whole record is one sampled bar (the
// opening seconds of Chaka Khan's "Fate", 1981, run through an SP-1200
// sampler whose 12-bit crunch is part of the sound) plus 909 drums, a Korg
// Trident bassline, and a sung mantra. There is no build-up and no breakdown:
// the arrangement is a low-pass filter (a "dullness knob" that removes
// brightness) snapping between on/off states over the loop. Here that filter
// IS the tier ladder — the Rhodes climbs from murky to sparkling as it levels.
//
// Provenance (docs/research/house-track-dossiers.md, stardust section):
//   CONFIRMED — 909 kick four-on-the-floor; SP-1200 loop; Trident bass exists;
//     master-bus pump (a compressor squeezing the WHOLE mix on every kick);
//     on/off filter arrangement (Braxe interview quotes).
//   PROBABLE  — the Em7/Fmaj7 chord vamp with a passing Cmaj7 (Hooktheory +
//     two guitar transcriptions agree); the EP-stab grid (steps 0/3/6/8/11);
//     the guitar "chuck" scratches (two muted 16ths ending beats 3 and 4);
//     clap on 2 & 4; closed 8th hats with an open hat before each barline.
//   INFERRED  — the exact bassline (only "root-following, hooky, four bars"
//     is sourced) and the vocal melody (only its range is confirmed). Both
//     are kept simple and idiomatic; check against the record at the gate.
//   Shaker: not on the record — an idiomatic 16th filler so the Hats slot
//   has a rival (playability floor / band-slot choice), authored to the
//   house shaker's discipline.
//
// Key: A natural minor (the vamp's Em7/Fmaj7/Cmaj7 pitch classes rel. A).
// Note offsets: E = +7 (or -5), F = +8 (or -4), G = -2/+10, B = +2, C = +3.
// The EP chords are BAKED into the rhodes kit variants (em/fa/cm at four
// filter states), so rhodes charts always play note 0 and pick a variant —
// chord identity and brightness both live in the sample, not the note.
//
// Grid: 16 steps/bar, beats on 0/4/8/12. Swing 0 — all groove is inside the
// sampled bar (velocity movement), never the clock.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { RISER } from './shared';

export const STARDUST_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse: the 909 kick, CONFIRMED four-on-the-floor at vel 1.0. The four
  // beats never move at any tier; growth is soft ghost pickups ('-', the
  // quiet variant) in the phrase tail only — the house-law kick discipline.
  kick: [
    d('kick', 'X...X...X...X...'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X...',
      'X...X...X...X...', 'X...X...X...X..-'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X...',
      'X...X...X...X...', 'X...X...X...X.--'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X..-',
      'X...X...X...X...', 'X...X...X..-X.--'),
  ],
  // Backbeat: 909 clap on 2 & 4 (PROBABLE, vel ~0.85 → 'x'). The backbeat
  // never moves; growth is the step-15 pickup pulling into the next bar
  // (INFERRED, gameplay growth — the record's clap just sits on 2 & 4).
  clap: [
    d('clap', '....x.......x...'),
    d('clap', '....x.......x...', '....x.......x..-'),
    d('clap', '....x.......x...', '....x.......x..o'),
    d('clap', '....x.......x..o', '....x.......x.oo'),
  ],
  // Hats: closed 8ths with velocity movement and an open hat before each
  // barline (PROBABLE — "eighth note closed hi-hat and an open hi-hat before
  // the end of each bar", closed velocities varied "to add some groove").
  // Tiers walk toward that exact bar: off-8ths only → all 8ths → the dossier
  // groove → the full groove breathing across two bars with accents.
  hat: [
    d('hat', '..o...o...o...o.'),
    d('hat', 'o.o.o.o.o.o.o.O.'),
    d('hat', 'x.o.x.o.x.o.x.O.'),
    d('hat',
      'X.o.x.o.x.o.x.O.',
      'x.o.X.o.x.o.x.O.'),
  ],
  // Hats rival: straight 16th shaker filler (NOT on the record — idiomatic).
  // Densifies on-beats → 8ths → 16th pairs pushing into each beat → full
  // 16ths with off-beat accents. Straight, no swing: French-touch machine.
  shaker: [
    d('shaker', 'o...o...o...o...'),
    d('shaker', 'o.o.o.o.o.o.o.o.'),
    d('shaker', 'o.oxo.oxo.oxo.ox'),
    d('shaker', 'ooxoooxoooxoooxo'),
  ],
  // Motion: the loop's rhythm-guitar "chucks" — two muted 16th-note scratches
  // (strings damped by the palm so the strum is a pitched "chk", not a chord)
  // ending beats 3 and 4: steps 10,11 and 14,15 (PROBABLE grid, vel ~0.6).
  // Both pairs sit in each bar's Fmaj7 half, so note 0 (A, the third of F)
  // fits; tier 4's barline pair rings brighter ('twang') on E (+7, the
  // chord's top color) to lift into the next bar. Tier 4 IS the dossier
  // pattern — the chuck stays sparse by nature; its damage rides velocity.
  arp: [
    m('arp', 1, [[14, 0.7, 0], [15, 0.75, 0]]),
    m('arp', 1, [[10, 0.7, 0], [11, 0.75, 0], [14, 0.7, 0], [15, 0.75, 0]]),
    m('arp', 2, [
      [10, 0.7, 0], [11, 0.75, 0], [14, 0.7, 0], [15, 0.75, 0],
      [B + 10, 0.7, 0], [B + 11, 0.75, 0], [B + 14, 0.75, 0, 'twang'], [B + 15, 0.8, 0, 'twang'],
    ]),
    m('arp', 2, [
      [10, 0.7, 0], [11, 0.75, 0], [14, 0.75, 0], [15, 0.8, 0],
      [B + 10, 0.7, 0], [B + 11, 0.75, 0], [B + 14, 0.8, 7, 'twang'], [B + 15, 0.85, 7, 'twang'],
    ]),
  ],
  // Bass: the Korg Trident line (equipment CONFIRMED, the line INFERRED —
  // only "root-following, hooky, four bars" is sourced). Roots follow the
  // half-bar chords: E (+7) under Em7, F (+8) under Fmaj7, with an octave
  // bounce (+19/+20) closing each half. Tier 4 is the four-bar shape with a
  // two-16th F→E walk at the very end, turning the loop around. Unlike the
  // house bass this line DOES land on the kick's downbeats — the master-bus
  // pump (kick ducks everything) is what keeps the low end clean.
  bass: [
    m('bass', 1, [[0, 0.85, 7], [8, 0.85, 8]]),
    m('bass', 1, [[0, 0.85, 7], [3, 0.8, 7], [8, 0.85, 8], [11, 0.8, 8]]),
    m('bass', 2, [
      [0, 0.85, 7], [3, 0.8, 7], [6, 0.65, 19], [8, 0.85, 8], [11, 0.8, 8], [14, 0.65, 20],
      [B, 0.85, 7], [B + 3, 0.8, 7], [B + 6, 0.65, 19], [B + 8, 0.85, 8], [B + 11, 0.8, 8], [B + 14, 0.65, 20],
    ]),
    m('bass', 4, [
      [0, 0.85, 7], [3, 0.8, 7], [6, 0.65, 19], [8, 0.85, 8], [11, 0.8, 8], [14, 0.65, 20],
      [B, 0.85, 7], [B + 3, 0.8, 7], [B + 6, 0.65, 19], [B + 8, 0.85, 8], [B + 11, 0.8, 8], [B + 14, 0.65, 20],
      [2 * B, 0.85, 7], [2 * B + 3, 0.8, 7], [2 * B + 6, 0.65, 19], [2 * B + 8, 0.85, 8], [2 * B + 11, 0.8, 8], [2 * B + 14, 0.65, 20],
      [3 * B, 0.85, 7], [3 * B + 3, 0.8, 7], [3 * B + 6, 0.65, 19], [3 * B + 8, 0.85, 8], [3 * B + 11, 0.8, 8],
      // the walk: F then E on the last two 16ths, back to the top of the loop
      [3 * B + 14, 0.75, 8], [3 * B + 15, 0.7, 7],
    ]),
  ],
  // Harmony: THE filtered EP loop — the sampled electric-piano chord stabs.
  // Grid per bar (PROBABLE): 0 / 3 / 6 in the Em7 half, 8 / 11 in the Fmaj7
  // half; the second cycle opens on Cmaj7 (the passing color). Every note is
  // 0 — the chord voicing AND the filter state are baked into the variant
  // (em/fa/cm × closed/half/open/bright). THE TIER LADDER IS THE FILTER:
  // tiers add hits AND brightness, exactly the record's on-off arrangement.
  // Velocities are the dossier's shape (1.0/.7/.8/.9/.7) scaled ~0.7 so the
  // maxed DPS sits near the house rhodes anchor.
  rhodes: [
    m('rhodes', 1, [[0, 0.7, 0, 'em_closed'], [8, 0.65, 0, 'fa_closed']]),
    m('rhodes', 1, [
      [0, 0.7, 0, 'em_half'], [3, 0.5, 0, 'em_half'],
      [8, 0.65, 0, 'fa_half'], [11, 0.5, 0, 'fa_half'],
    ]),
    m('rhodes', 2, [
      [0, 0.7, 0, 'em_open'], [3, 0.5, 0, 'em_open'], [6, 0.55, 0, 'em_open'],
      [8, 0.65, 0, 'fa_open'], [11, 0.5, 0, 'fa_open'],
      [B, 0.7, 0, 'cm_open'], [B + 3, 0.5, 0, 'cm_open'], [B + 6, 0.55, 0, 'cm_open'],
      [B + 8, 0.65, 0, 'fa_open'], [B + 11, 0.5, 0, 'fa_open'],
    ]),
    m('rhodes', 2, [
      [0, 0.7, 0, 'em_bright'], [3, 0.5, 0, 'em_bright'], [6, 0.55, 0, 'em_bright'],
      [8, 0.65, 0, 'fa_bright'], [11, 0.5, 0, 'fa_bright'],
      [B, 0.7, 0, 'cm_bright'], [B + 3, 0.5, 0, 'cm_bright'], [B + 6, 0.55, 0, 'cm_bright'],
      [B + 8, 0.65, 0, 'fa_bright'], [B + 11, 0.5, 0, 'fa_bright'],
    ]),
  ],
  // Melody: the vocal hook as an instrument (melody INFERRED — only the
  // E3-D5 range is confirmed; check against the record at the gate).
  // Rendered root A4, so: -5 = "I", -2 = G, 0 = A, +2 = B, +3 = C.
  // Phrasing: "I feel right" (0/2/4) → the "music sounds better with you"
  // 8th-note run from step 8 resolving on step 4 of the next bar → repeat →
  // the "ooh ba-by" pickup at the loop tail. The 'open' variant (a wider
  // mouth vowel) marks the phrase peak. Tiers grow from the three-note
  // mantra fragment to the full four-bar hook.
  lead: [
    m('lead', 4, [
      [0, 0.7, -5], [2, 0.65, -2], [4, 0.7, 0],
      [2 * B, 0.7, -5], [2 * B + 2, 0.65, -2], [2 * B + 4, 0.7, 0],
    ]),
    m('lead', 4, [
      [0, 0.7, -5], [2, 0.65, -2], [4, 0.7, 0],
      [B + 12, 0.6, -2], [B + 14, 0.65, 0],
      [2 * B, 0.7, -5], [2 * B + 2, 0.65, -2], [2 * B + 4, 0.7, 0],
      [3 * B + 12, 0.6, -2], [3 * B + 14, 0.65, 0],
    ]),
    m('lead', 4, [
      [0, 0.7, -5], [2, 0.65, -2], [4, 0.7, 0],
      [8, 0.7, 0], [10, 0.65, 3], [12, 0.7, 3, 'open'], [14, 0.65, 2],
      [B, 0.7, 0], [B + 2, 0.6, -2], [B + 4, 0.7, 0],
      [2 * B, 0.7, -5], [2 * B + 2, 0.65, -2], [2 * B + 4, 0.7, 0],
      [3 * B + 12, 0.6, -2], [3 * B + 14, 0.65, 0],
    ]),
    m('lead', 4, [
      [0, 0.7, -5], [2, 0.65, -2], [4, 0.7, 0],
      [8, 0.7, 0], [10, 0.65, 3], [12, 0.7, 3, 'open'], [14, 0.65, 2],
      [B, 0.7, 0], [B + 2, 0.6, -2], [B + 4, 0.7, 0],
      [2 * B, 0.7, -5], [2 * B + 2, 0.65, -2], [2 * B + 4, 0.7, 0],
      [2 * B + 8, 0.7, 0], [2 * B + 10, 0.65, 3], [2 * B + 12, 0.7, 3, 'open'], [2 * B + 14, 0.65, 2],
      [3 * B, 0.7, 0], [3 * B + 2, 0.6, -2], [3 * B + 4, 0.7, 0],
      [3 * B + 12, 0.6, -2], [3 * B + 14, 0.65, 0],
    ]),
  ],
  // FX: the record has "no risers, no crashes to speak of" — its FX is the
  // filter itself. The crash stays SPARSER than the shared house ladder
  // (phrase-top only, a mid answer late): just enough punctuation for the
  // game's phrase turnaround.
  crash: [
    d('crash', 'X...............', '................', '................', '................'),
    d('crash', 'X...............', '................', 'o...............', '................'),
    d('crash', 'X...............', '................', 'x...............', '................'),
    d('crash', 'X...............', '................', 'x...............', '........o.......'),
  ],
  // FX rival: the riser is the auto-dash utility weapon — pure gameplay
  // (Pillar 3), so it keeps the standard shared ladder even though the
  // record has none. Voiced by the base kit.
  riser: RISER,
};
