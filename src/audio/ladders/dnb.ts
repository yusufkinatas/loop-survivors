// Drum & Bass: one track, a four-tier ladder for each of the 12 supported roles.
// 174 BPM, no swing. The identity is a tight two-step break (kick on 1 and the
// "&" of 3, snare cracking on 2 and 4 with amen ghost-shuffle), a rolling
// low-end monster (reese) plus a cleaner rolling sub (bass), a busy 16th hat, a
// singing ride for the freeze, stabby/airy chords and a choir pad for
// atmosphere, and a bright lead + bell up top. FX/utility are the reversed-swell
// riser (auto-dash) and the crash (phrase-top shockwave).
//
// Rules honoured: minor-pentatonic notes only (chords limited to roots 0/5/7);
// low voices (reese/bass) stay two octaves down, bright voices (bell/lead) up;
// melodic/tonal onsets stay on the EVEN (8th) grid — at 174 an odd-16th tonal
// note reads as an error rather than groove — while the break drums may chop
// finer for the amen feel. Every tier grows in onsets/notes/weight.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { CRASH, RISER } from './shared';

export const DNB_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse — the two-step kick: beat 1 and the "&" of 3 (step 10), the DnB
  // backbone. Grows by pickups and a second bar that rolls under the break.
  kick: [
    d('kick', 'X.........x.....'),
    d('kick', 'X.........x...x.'),
    d('kick', 'X.........x...x.', 'X.....x...x.....'),
    d('kick', 'X....x....x...x.', 'X.....x.x.x....x'),
  ],
  // Backbeat — the cracking break snare on 2 and 4, growing an amen-style
  // ghost shuffle ('-') across a second bar. This is where the break lives.
  snare: [
    d('snare', '....X.......X...'),
    d('snare', '....X.....-.X...'),
    d('snare', '....X.....-.X...', '....X..-..-.X..-'),
    d('snare', '....X..-..-.X..-', '..-.X.-.o.-.X.-o'),
  ],
  // Hats — busy 16th ride: ghosts fill in, then the offbeats open ('O') and
  // accent, then a second bar doubles the density. Bright and crisp at 174.
  hat: [
    d('hat', 'x.x.x.x.x.x.x.x.'),
    d('hat', 'x-x-x-x-x-x-x-x-'),
    d('hat', 'xoxoxoxOxoxoxoxO'),
    d('hat', 'xoxoxoxOxoxoxoxO', 'xoxoxOxoxoxxxXxO'),
  ],
  // Ride — the freeze weapon. Kept moderate (quarter -> 8th feel, never the
  // 16th wall the hat owns) so each freeze reads as a clean bright slice.
  ride: [
    d('ride', 'o...o...o...o...'),
    d('ride', 'o.o.o.o.o.o.o.o.'),
    d('ride', 'x.o.x.o.x.o.x.o.'),
    d('ride', 'x.o.x.o.x.o.x.o.', 'x.o.x.o.x.o.x.oO'),
  ],
  // FX — phrase-top shockwave and the auto-dash wind-up (shared, tempo-carried).
  crash: CRASH,
  riser: RISER,
  // Bass slot, voice 1 — the Reese monster. LOW notes only, sits on the root
  // with the kick on the one, then rolls off it, clear of the second kick.
  // Even (8th) grid; grows from sparse weight into the signature busy roll.
  reese: [
    m('reese', 2, [[0, 0.95, 0], [B + 8, 0.9, -5]]),
    m('reese', 2, [[0, 0.95, 0], [8, 0.8, 0], [B, 0.9, -5], [B + 8, 0.8, -5]]),
    m('reese', 2, [
      [0, 0.95, 0], [6, 0.75, 0], [8, 0.8, -2], [14, 0.7, 0],
      [B, 0.9, -5], [B + 6, 0.75, -5], [B + 8, 0.8, -7], [B + 14, 0.7, -5],
    ]),
    m('reese', 2, [
      [0, 0.95, 0], [4, 0.7, 0], [6, 0.75, -2], [8, 0.85, 0], [12, 0.7, -5], [14, 0.75, 0],
      [B, 0.9, -5], [B + 4, 0.7, -5], [B + 6, 0.75, -7], [B + 8, 0.85, -5], [B + 12, 0.7, -2], [B + 14, 0.75, -5],
    ]),
  ],
  // Bass slot, voice 2 — the sober cousin: a cleaner rolling sub over a full
  // 4-bar phrase. Grows to a busy roll; tier 4 drops the once-per-phrase 'sub'
  // weight at the phrase top. LOW notes only, even grid.
  bass: [
    m('bass', 4, [[0, 1.0, 0], [2 * B, 0.95, -5]]),
    m('bass', 4, [[0, 1.0, 0, 'sub'], [B + 8, 0.7, 0], [2 * B, 0.95, -5], [3 * B + 8, 0.7, -5]]),
    m('bass', 4, [
      [0, 1.0, 0, 'sub'], [10, 0.6, 0], [B + 8, 0.7, 0],
      [2 * B, 0.95, -5], [2 * B + 10, 0.6, -5], [3 * B + 8, 0.7, -2],
    ]),
    m('bass', 4, [
      [0, 1.0, 0, 'sub'], [6, 0.6, 0, 'fat'], [10, 0.6, -2], [B, 0.8, 0, 'fat'], [B + 8, 0.7, 3], [B + 14, 0.6, 0],
      [2 * B, 0.95, -5], [2 * B + 8, 0.7, -5], [2 * B + 14, 0.6, -2],
      [3 * B, 0.9, -2, 'fat'], [3 * B + 8, 0.7, -5], [3 * B + 14, 0.6, -7],
    ]),
  ],
  // Harmony — stabby atmospheric chords. Pad holds the space; stabs punch on
  // the even grid. Chord roots limited to 0/5/7. Grows from held pad into a
  // pad-plus-stab call-and-response across the phrase.
  chord: [
    m('chord', 4, [[0, 0.5, 0, 'pad'], [2 * B, 0.5, 7, 'pad']]),
    m('chord', 4, [[0, 0.55, 0, 'pad'], [B, 0.5, 0, 'stab'], [2 * B, 0.55, 7, 'pad']]),
    m('chord', 4, [
      [0, 0.55, 0, 'pad'], [B, 0.5, 0, 'stab'],
      [2 * B, 0.55, 7, 'pad'], [3 * B, 0.5, 5, 'stab'], [3 * B + 8, 0.45, 5, 'stab'],
    ]),
    m('chord', 4, [
      [0, 0.55, 0, 'pad'], [8, 0.5, 0, 'stab'], [B, 0.5, 0, 'stab'],
      [2 * B, 0.55, 7, 'pad'], [2 * B + 8, 0.5, 7, 'stab'],
      [3 * B, 0.55, 5, 'pad'], [3 * B + 8, 0.5, 0, 'stab'],
    ]),
  ],
  // Harmony — the airy 'aah' pad. Sustained and sparse; grows by VOICING
  // (stacking a second, then third note at the same onset) into a lush held
  // chord, not by adding rhythm. Mid range, even grid.
  choir: [
    m('choir', 4, [[0, 0.5, 0], [2 * B, 0.5, 7]]),
    m('choir', 4, [[0, 0.5, 0], [0, 0.45, 7], [2 * B, 0.5, 7], [2 * B, 0.45, 12]]),
    m('choir', 4, [
      [0, 0.5, 0], [0, 0.45, 7], [B, 0.45, 5],
      [2 * B, 0.5, 7], [2 * B, 0.45, 12], [3 * B, 0.45, 10],
    ]),
    m('choir', 4, [
      [0, 0.5, 0], [0, 0.45, 7], [0, 0.4, 10], [B, 0.45, 5],
      [2 * B, 0.5, 7], [2 * B, 0.45, 12], [2 * B, 0.4, 15], [3 * B, 0.45, 10],
    ]),
  ],
  // Melody — a bright, cutting lead line an octave up. Grows from a short hook
  // into a fuller sung phrase across four bars. High-ish, even grid.
  lead: [
    m('lead', 2, [[0, 0.75, 7], [8, 0.7, 12], [B, 0.75, 10]]),
    m('lead', 2, [[0, 0.75, 7], [4, 0.65, 10], [8, 0.7, 12], [B, 0.75, 7], [B + 8, 0.7, 5]]),
    m('lead', 4, [
      [0, 0.75, 7], [4, 0.65, 10], [8, 0.7, 12], [B, 0.75, 7], [B + 8, 0.7, 5],
      [2 * B, 0.75, 10], [2 * B + 8, 0.7, 15], [3 * B, 0.8, 12], [3 * B + 8, 0.7, 7],
    ]),
    m('lead', 4, [
      [0, 0.75, 7], [4, 0.65, 10], [8, 0.7, 12], [12, 0.6, 15], [B, 0.75, 7], [B + 8, 0.7, 5], [B + 12, 0.6, 10],
      [2 * B, 0.75, 10], [2 * B + 8, 0.7, 15], [2 * B + 12, 0.65, 17], [3 * B, 0.8, 12], [3 * B + 8, 0.7, 7], [3 * B + 12, 0.75, 5],
    ]),
  ],
  // Melody — twinkly music-box bell, the brightest voice. High sparkly
  // arpeggios; grows from a few pings into a fuller line, staying up top.
  bell: [
    m('bell', 2, [[0, 0.65, 12], [8, 0.6, 15], [B, 0.65, 17], [B + 8, 0.6, 12]]),
    m('bell', 2, [
      [0, 0.65, 12], [4, 0.55, 15], [8, 0.6, 17], [12, 0.55, 15],
      [B, 0.65, 12], [B + 8, 0.6, 10],
    ]),
    m('bell', 4, [
      [0, 0.65, 12], [4, 0.55, 15], [8, 0.6, 17], [12, 0.55, 15],
      [B, 0.65, 12], [B + 8, 0.6, 10],
      [2 * B, 0.65, 15], [2 * B + 4, 0.55, 17], [2 * B + 8, 0.6, 19], [3 * B, 0.65, 15], [3 * B + 8, 0.6, 12],
    ]),
    m('bell', 4, [
      [0, 0.65, 12], [4, 0.55, 15], [8, 0.6, 17], [12, 0.55, 15],
      [B, 0.65, 12], [B + 4, 0.55, 15], [B + 8, 0.6, 10], [B + 12, 0.55, 12],
      [2 * B, 0.65, 15], [2 * B + 4, 0.55, 17], [2 * B + 8, 0.6, 19], [2 * B + 12, 0.55, 17],
      [3 * B, 0.65, 15], [3 * B + 4, 0.55, 12], [3 * B + 8, 0.6, 10], [3 * B + 12, 0.55, 12],
    ]),
  ],
};
