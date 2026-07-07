// Synthwave's one track. 100 BPM, dead straight (swing 0). The whole thing is
// built on machine-locked even 16ths: a four-on-the-floor kick, a big gated
// snare/clap on 2 and 4, hats that climb from 8ths to a 16th wall, a relentless
// arp, an octave-pulsing analog bass, lush super-saw chords, and bright lead +
// bell hooks up top. Tiers only ever add density, weight, range or a fill — a
// build maxes into a fuller neon track, never a different one.
//
// Supported roles (must equal the kit's supported set):
//   kick, snare, clap, hat, bass, chord, arp, lead, bell, crash, riser
//
// Note-set discipline: minor pentatonic (0,3,5,7,10 mod 12) for every pitched
// voice; chord root shifts kept to 0/5/7. Bass sits two octaves down (rendered
// at rootHz/4) with an octave-up pulse; lead/bell/arp sing an octave up.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { CRASH, RISER } from './shared';

export const SYNTHWAVE_LADDERS: Partial<Record<Role, Chart[]>> = {
  // FX — shared transition voices; both grow in cadence by tier.
  crash: CRASH,
  riser: RISER,

  // PULSE — four-on-the-floor, the engine of the genre. Grows from a half-time
  // 1-and-3 into a driving four-on-floor, then a two-bar with a soft pickup and
  // a syncopated tail.
  kick: [
    d('kick', 'X.......X.......'),
    d('kick', 'X...X...X...X...'),
    d('kick', 'X...X...X...X...', 'X...X...X...X..-'),
    d('kick', 'X...X...X...X...', 'X...X...X..-X.X-'),
  ],

  // BACKBEAT — the gated snare on 2 and 4. Grows by a pickup ghost, then a
  // two-bar with a crack fill, then a bigger fill into the phrase turnaround.
  snare: [
    d('snare', '....X.......X...'),
    d('snare', '....X.......X..o'),
    d('snare', '....X.......X...', '....X.......X.oX'),
    d('snare', '....X.......X...', '....X...o..XX.XX'),
  ],

  // BACKBEAT (alt) — the bright 80s clap, the layer/alternative to the snare.
  // Same backbeat spine, its own fill shape.
  clap: [
    d('clap', '....x.......x...'),
    d('clap', '....x.......x..o'),
    d('clap', '....x.......x...', '....x.......x.xx'),
    d('clap', '....x.......x...', '....x...o...xXxx'),
  ],

  // HATS — climb from a steady 8th tick to a relentless 16th wall, then add an
  // open-hat accent, then spread across two bars. The genre's forward motor.
  hat: [
    d('hat', 'x.x.x.x.x.x.x.x.'),
    d('hat', 'xxxxxxxxxxxxxxxx'),
    d('hat', 'xxxxxxxxxxxxxxxO'),
    d('hat', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxO'),
  ],

  // BASS — the octave-pulse analog bass (root then its octave, the "I Feel
  // Love" engine). Grows 8ths -> 16ths -> a two-bar move to the fifth below
  // (-5) with 'fat' weight on the downbeats -> a fuller, harder-accented two
  // bars. Stays low; note 12 is only the octave of the root (still bass range).
  bass: [
    m('bass', 1, [
      [0, 0.9, 0], [2, 0.75, 12], [4, 0.85, 0], [6, 0.75, 12],
      [8, 0.85, 0], [10, 0.75, 12], [12, 0.8, 0], [14, 0.75, 12],
    ]),
    m('bass', 1, [
      [0, 0.9, 0], [1, 0.7, 12], [2, 0.75, 0], [3, 0.7, 12], [4, 0.85, 0], [5, 0.7, 12], [6, 0.75, 0], [7, 0.7, 12],
      [8, 0.85, 0], [9, 0.7, 12], [10, 0.75, 0], [11, 0.7, 12], [12, 0.8, 0], [13, 0.7, 12], [14, 0.75, 0], [15, 0.7, 12],
    ]),
    m('bass', 2, [
      [0, 0.95, 0, 'fat'], [1, 0.7, 12], [2, 0.75, 0], [3, 0.7, 12], [4, 0.85, 0], [5, 0.7, 12], [6, 0.75, 0], [7, 0.7, 12],
      [8, 0.9, 0, 'fat'], [9, 0.7, 12], [10, 0.75, 0], [11, 0.7, 12], [12, 0.8, 0], [13, 0.7, 12], [14, 0.75, 0], [15, 0.7, 12],
      [B, 0.95, -5, 'fat'], [B + 1, 0.7, 7], [B + 2, 0.75, -5], [B + 3, 0.7, 7], [B + 4, 0.85, -5], [B + 5, 0.7, 7], [B + 6, 0.75, -5], [B + 7, 0.7, 7],
      [B + 8, 0.9, -5, 'fat'], [B + 9, 0.7, 7], [B + 10, 0.75, -5], [B + 11, 0.7, 7], [B + 12, 0.8, -5], [B + 13, 0.7, 7], [B + 14, 0.75, -5], [B + 15, 0.7, 7],
    ]),
    m('bass', 2, [
      [0, 1.0, 0, 'fat'], [1, 0.75, 12], [2, 0.8, 0], [3, 0.75, 12], [4, 0.9, 0, 'fat'], [5, 0.75, 12], [6, 0.8, 0], [7, 0.75, 12],
      [8, 0.9, 0, 'fat'], [9, 0.75, 12], [10, 0.8, 0], [11, 0.75, 12], [12, 0.9, 0, 'fat'], [13, 0.75, 12], [14, 0.8, 0], [15, 0.75, 12],
      [B, 1.0, -5, 'fat'], [B + 1, 0.75, 7], [B + 2, 0.8, -5], [B + 3, 0.75, 7], [B + 4, 0.9, -5, 'fat'], [B + 5, 0.75, 7], [B + 6, 0.8, -5], [B + 7, 0.75, 7],
      [B + 8, 0.9, -2, 'fat'], [B + 9, 0.75, 10], [B + 10, 0.8, -2], [B + 11, 0.75, 10], [B + 12, 0.9, -2, 'fat'], [B + 13, 0.75, 10], [B + 14, 0.8, -2], [B + 15, 0.75, 10],
    ]),
  ],

  // HARMONY — lush super-saw pads that swell under everything, growing from one
  // move per two bars into a four-bar progression, then adding rhythmic stabs.
  // Root shifts kept to 0/5/7 (the only legal chord roots).
  chord: [
    m('chord', 2, [[0, 0.5, 0, 'pad'], [B, 0.5, 5, 'pad']]),
    m('chord', 2, [[0, 0.55, 0, 'pad'], [8, 0.5, 7, 'pad'], [B, 0.55, 5, 'pad'], [B + 8, 0.5, 7, 'pad']]),
    m('chord', 4, [
      [0, 0.55, 0, 'pad'], [8, 0.5, 0, 'stab'], [B, 0.55, 5, 'pad'], [B + 8, 0.5, 5, 'stab'],
      [2 * B, 0.55, 7, 'pad'], [2 * B + 8, 0.5, 7, 'stab'], [3 * B, 0.55, 5, 'pad'], [3 * B + 8, 0.5, 5, 'stab'], [3 * B + 12, 0.55, 0, 'stab'],
    ]),
    m('chord', 4, [
      [0, 0.6, 0, 'pad'], [4, 0.5, 0, 'stab'], [8, 0.5, 0, 'stab'], [12, 0.5, 0, 'stab'],
      [B, 0.6, 5, 'pad'], [B + 4, 0.5, 5, 'stab'], [B + 8, 0.5, 5, 'stab'], [B + 12, 0.5, 5, 'stab'],
      [2 * B, 0.6, 7, 'pad'], [2 * B + 4, 0.5, 7, 'stab'], [2 * B + 8, 0.5, 7, 'stab'], [2 * B + 12, 0.5, 7, 'stab'],
      [3 * B, 0.6, 5, 'pad'], [3 * B + 4, 0.5, 5, 'stab'], [3 * B + 8, 0.5, 5, 'stab'], [3 * B + 12, 0.6, 0, 'stab'],
    ]),
  ],

  // MOTION — the relentless arp. Climbs from an 8th-note figure to full 16ths,
  // then two bars, then two bars with higher ornaments and harder accents.
  arp: [
    m('arp', 1, [
      [0, 0.6, 0], [2, 0.55, 7], [4, 0.6, 12], [6, 0.55, 7],
      [8, 0.6, 0], [10, 0.55, 7], [12, 0.6, 12], [14, 0.55, 7],
    ]),
    m('arp', 1, [
      [0, 0.65, 0], [1, 0.55, 3], [2, 0.6, 7], [3, 0.55, 10], [4, 0.65, 12], [5, 0.55, 15], [6, 0.6, 12], [7, 0.55, 10],
      [8, 0.65, 7], [9, 0.55, 10], [10, 0.6, 12], [11, 0.55, 15], [12, 0.65, 17], [13, 0.55, 15], [14, 0.6, 12], [15, 0.55, 7],
    ]),
    m('arp', 2, [
      [0, 0.65, 0], [1, 0.55, 3], [2, 0.6, 7], [3, 0.55, 10], [4, 0.65, 12], [5, 0.55, 15], [6, 0.6, 12], [7, 0.55, 10],
      [8, 0.65, 7], [9, 0.55, 10], [10, 0.6, 12], [11, 0.55, 15], [12, 0.65, 17], [13, 0.55, 15], [14, 0.6, 12], [15, 0.55, 7],
      [B, 0.65, 5], [B + 1, 0.55, 7], [B + 2, 0.6, 10], [B + 3, 0.55, 12], [B + 4, 0.65, 15], [B + 5, 0.55, 17], [B + 6, 0.6, 15], [B + 7, 0.55, 12],
      [B + 8, 0.65, 10], [B + 9, 0.55, 12], [B + 10, 0.6, 15], [B + 11, 0.55, 17], [B + 12, 0.65, 15], [B + 13, 0.55, 12], [B + 14, 0.6, 10], [B + 15, 0.55, 7],
    ]),
    m('arp', 2, [
      [0, 0.7, 0], [1, 0.55, 3], [2, 0.65, 7], [3, 0.55, 10], [4, 0.7, 12], [5, 0.55, 15], [6, 0.65, 17], [7, 0.55, 15],
      [8, 0.7, 12], [9, 0.55, 15], [10, 0.65, 17], [11, 0.55, 19], [12, 0.7, 22], [13, 0.55, 19], [14, 0.65, 15], [15, 0.55, 12],
      [B, 0.7, 5], [B + 1, 0.55, 7], [B + 2, 0.65, 10], [B + 3, 0.55, 12], [B + 4, 0.7, 15], [B + 5, 0.55, 17], [B + 6, 0.65, 19], [B + 7, 0.55, 17],
      [B + 8, 0.7, 15], [B + 9, 0.55, 17], [B + 10, 0.65, 19], [B + 11, 0.55, 22], [B + 12, 0.7, 24], [B + 13, 0.55, 22], [B + 14, 0.65, 19], [B + 15, 0.55, 15],
    ]),
  ],

  // MELODY (1) — the soaring lead hook. A sparse singable line that fills out
  // over four bars, gaining an ornament pass at the top tier.
  lead: [
    m('lead', 2, [[0, 0.8, 12], [8, 0.7, 7], [B, 0.8, 10]]),
    m('lead', 2, [[0, 0.8, 12], [4, 0.7, 10], [8, 0.75, 7], [B, 0.8, 5], [B + 8, 0.7, 7]]),
    m('lead', 4, [
      [0, 0.8, 12], [4, 0.7, 10], [8, 0.75, 7], [B, 0.8, 5], [B + 8, 0.7, 7],
      [2 * B, 0.8, 10], [2 * B + 8, 0.75, 12], [3 * B, 0.85, 15], [3 * B + 8, 0.75, 12],
    ]),
    m('lead', 4, [
      [0, 0.8, 12], [4, 0.7, 10], [8, 0.75, 7], [12, 0.6, 15], [B, 0.8, 5], [B + 8, 0.7, 7],
      [2 * B, 0.8, 10], [2 * B + 8, 0.75, 12], [2 * B + 12, 0.65, 17], [3 * B, 0.85, 15], [3 * B + 8, 0.75, 12], [3 * B + 12, 0.8, 10],
    ]),
  ],

  // MELODY (2) — the glassy FM-bell sparkle, the brightest voice, arpeggiated
  // high on the even grid. Grows from quarters to 8ths to a fuller two-bar line
  // with 16th ornaments up top.
  bell: [
    m('bell', 1, [[0, 0.7, 12], [4, 0.65, 15], [8, 0.7, 19], [12, 0.65, 15]]),
    m('bell', 1, [
      [0, 0.7, 12], [2, 0.6, 15], [4, 0.65, 17], [6, 0.6, 15],
      [8, 0.7, 19], [10, 0.6, 17], [12, 0.65, 15], [14, 0.6, 12],
    ]),
    m('bell', 2, [
      [0, 0.7, 12], [2, 0.6, 15], [4, 0.65, 17], [6, 0.6, 15], [8, 0.7, 19], [10, 0.6, 17], [12, 0.65, 15], [14, 0.6, 12],
      [B, 0.7, 15], [B + 2, 0.6, 17], [B + 4, 0.65, 19], [B + 6, 0.6, 17], [B + 8, 0.7, 22], [B + 10, 0.6, 19], [B + 12, 0.65, 17], [B + 14, 0.6, 15],
    ]),
    m('bell', 2, [
      [0, 0.75, 12], [1, 0.55, 15], [2, 0.6, 15], [4, 0.7, 17], [6, 0.6, 15], [8, 0.75, 19], [10, 0.6, 17], [12, 0.7, 15], [14, 0.6, 12], [15, 0.55, 10],
      [B, 0.75, 15], [B + 2, 0.6, 17], [B + 4, 0.7, 19], [B + 6, 0.6, 17], [B + 8, 0.75, 22], [B + 9, 0.55, 19], [B + 10, 0.6, 19], [B + 12, 0.7, 17], [B + 14, 0.6, 15],
    ]),
  ],
};
