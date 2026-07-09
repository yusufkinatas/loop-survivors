// The one track. 124 BPM, four-on-the-floor. Every tier keeps the relentless
// dance pulse and grows into it: the kick never leaves the four downbeats, the
// clap owns 2 & 4, the open hats ride the offbeats, and the bass rolls only in
// the gaps between kicks so the low end stays clean. Chords stab on the
// offbeats, the Rhodes comps underneath, and the lead sings on top.
//
// Supported roles = the full instrument catalog. Key A minor pentatonic.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { CRASH, RISER } from './shared';

export const SOUNDSET_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse: the four-on-the-floor kick, dead on every beat. Grows with soft
  // ghost pickups into the phrase turnaround, never syncopating off the four.
  kick: [
    d('kick', 'X...X...X...X...'),
    d('kick', 'X...X...X...X...', 'X...X...X...X..-'),
    d('kick', 'X...X...X...X...', 'X...X...X..-X..-'),
    d('kick', 'X...X...X...X...', 'X..-X...X..-X..X'),
  ],
  // Backbeat: the wide 909 clap on 2 & 4. Adds pickup claps and a soft push on
  // beat 3, but the accents stay locked to the backbeat.
  clap: [
    d('clap', '....X.......X...'),
    d('clap', '....X.......X...', '....X.......X..o'),
    d('clap', '....X.......X...', '....X...o...X.o.'),
    d('clap', '....X...o...X...', '....X...o...X.oo'),
  ],
  // Hats: the signature offbeat open hat, then closed 8ths, then louder, then
  // 16th closed pairs pushing into each open — the house "tss".
  hat: [
    d('hat', '..O...O...O...O.'),
    d('hat', 'o.O.o.O.o.O.o.O.'),
    d('hat', 'x.O.x.O.x.O.x.O.'),
    d('hat', 'xxO.xxO.xxO.xxO.'),
  ],
  // Hats: shaker fills the 16ths under the hats, growing from 8ths to accented.
  shaker: [
    d('shaker', 'o.o.o.o.o.o.o.o.'),
    d('shaker', 'oooooooooooooooo'),
    d('shaker', 'xoooxoooxoooxooo'),
    d('shaker', 'xoooxoooxoooxooo', 'xoooxoooxoooxoox'),
  ],
  // FX: phrase-top crash and the auto-dash riser, shared voicings.
  crash: CRASH,
  riser: RISER,
  // Bass: the rolling sub. Only ever on the offbeats and 16th pickups (2/6/10/14
  // + 13/15), never on the kick's 0/4/8/12, so kick and bass interlock instead
  // of colliding. Upper tiers switch to the fatter, grittier variant.
  bass: [
    m('bass', 1, [[2, 0.9, 0], [10, 0.85, 0], [14, 0.7, -2]]),
    m('bass', 1, [[2, 0.9, 0], [6, 0.8, -2], [10, 0.85, 0], [14, 0.75, -5]]),
    m('bass', 2, [
      [2, 0.9, 0, 'fat'], [6, 0.8, -2, 'fat'], [10, 0.85, 0, 'fat'], [14, 0.75, -5, 'fat'],
      [B + 2, 0.9, 3, 'fat'], [B + 6, 0.8, 0, 'fat'], [B + 10, 0.85, 3, 'fat'], [B + 14, 0.75, -2, 'fat'],
    ]),
    m('bass', 2, [
      [2, 0.9, 0, 'fat'], [6, 0.8, -2, 'fat'], [10, 0.85, 0, 'fat'], [13, 0.6, 0, 'fat'], [14, 0.75, -5, 'fat'], [15, 0.6, 0, 'fat'],
      [B + 2, 0.9, 3, 'fat'], [B + 6, 0.8, 0, 'fat'], [B + 10, 0.85, 5, 'fat'], [B + 13, 0.6, 5, 'fat'], [B + 14, 0.75, 3, 'fat'],
    ]),
  ],
  // Harmony: stabby chords on the offbeats (quartal roots 0/5/7). Top tier lays
  // a slow pad under the stabs and moves the harmony across the two bars.
  chord: [
    m('chord', 1, [[2, 0.7, 0, 'stab'], [10, 0.65, 0, 'stab']]),
    m('chord', 1, [[2, 0.75, 0, 'stab'], [6, 0.6, 7, 'stab'], [10, 0.7, 0, 'stab'], [14, 0.6, 5, 'stab']]),
    m('chord', 2, [
      [2, 0.75, 0, 'stab'], [6, 0.6, 7, 'stab'], [10, 0.7, 0, 'stab'], [14, 0.6, 5, 'stab'],
      [B + 2, 0.75, 7, 'stab'], [B + 6, 0.6, 5, 'stab'], [B + 10, 0.7, 7, 'stab'], [B + 14, 0.6, 0, 'stab'],
    ]),
    m('chord', 2, [
      [0, 0.5, 0, 'pad'], [2, 0.75, 0, 'stab'], [6, 0.6, 7, 'stab'], [10, 0.7, 0, 'stab'], [14, 0.6, 5, 'stab'],
      [B, 0.5, 5, 'pad'], [B + 2, 0.75, 5, 'stab'], [B + 6, 0.6, 7, 'stab'], [B + 10, 0.7, 7, 'stab'], [B + 14, 0.6, 0, 'stab'],
    ]),
  ],
  // Harmony: deep-house Rhodes comp, mid register, offbeat placement, growing
  // fuller and climbing across the phrase.
  rhodes: [
    m('rhodes', 1, [[2, 0.55, 3], [10, 0.5, 7]]),
    m('rhodes', 1, [[2, 0.6, 3], [6, 0.5, 7], [10, 0.55, 10], [14, 0.5, 7]]),
    m('rhodes', 2, [
      [2, 0.6, 3], [6, 0.5, 7], [10, 0.55, 10], [14, 0.5, 7],
      [B + 2, 0.6, 5], [B + 10, 0.55, 10],
    ]),
    m('rhodes', 2, [
      [2, 0.6, 3], [6, 0.5, 7], [10, 0.55, 10], [14, 0.5, 12],
      [B + 2, 0.6, 5], [B + 6, 0.5, 10], [B + 10, 0.55, 12], [B + 14, 0.5, 7],
    ]),
  ],
  // Melody: the singing topline, an octave up. A short hook, then a longer
  // rise-and-fall phrase over the full four bars.
  lead: [
    m('lead', 2, [[0, 0.75, 7], [8, 0.7, 10], [B + 4, 0.7, 12]]),
    m('lead', 2, [[0, 0.75, 7], [4, 0.6, 10], [8, 0.7, 12], [B, 0.7, 10], [B + 8, 0.65, 7]]),
    m('lead', 4, [
      [0, 0.75, 7], [4, 0.6, 10], [8, 0.7, 12], [B, 0.7, 10], [B + 8, 0.65, 7],
      [2 * B, 0.75, 12], [2 * B + 8, 0.7, 15], [3 * B, 0.7, 17], [3 * B + 8, 0.7, 12],
    ]),
    m('lead', 4, [
      [0, 0.75, 7], [4, 0.6, 10], [8, 0.7, 12], [12, 0.6, 15], [B, 0.7, 10], [B + 8, 0.65, 7],
      [2 * B, 0.75, 12], [2 * B + 8, 0.7, 15], [2 * B + 12, 0.6, 17], [3 * B, 0.7, 17], [3 * B + 8, 0.7, 12], [3 * B + 12, 0.6, 10],
    ]),
  ],

  // ---------------------------------------------------------------------------
  // The rest of the catalog. Same House voicing, so every band slot has a full
  // roster and no instrument is unreachable.
  // ---------------------------------------------------------------------------

  // Backbeat: the plain 909 snare on 2 & 4, an alternative to the clap.
  snare: [
    d('snare', '....x.......x...'),
    d('snare', '....x.......x...'),
    d('snare', '....x.......x...', '....x.......x..o'),
    d('snare', '....x.......x...', '....x.......x.xx'),
  ],
  // Pulse: offbeat low tom groove under the four-on-floor kick, sitting on the
  // "and"s (2/6/10/14) so it never lands on the kick's 0/4/8/12.
  tom: [
    m('tom', 2, [[10, 0.6, 0], [B + 10, 0.6, 0]]),
    m('tom', 2, [[2, 0.6, 0], [10, 0.6, 0], [B + 2, 0.6, -2], [B + 10, 0.6, -2]]),
    m('tom', 2, [
      [2, 0.6, 0], [6, 0.55, 0], [10, 0.6, 0], [14, 0.55, 0],
      [B + 2, 0.6, -2], [B + 6, 0.55, -2], [B + 10, 0.6, -2], [B + 14, 0.55, 0],
    ]),
    m('tom', 2, [
      [2, 0.6, 0], [6, 0.55, 0], [10, 0.6, 0], [14, 0.55, 0],
      [B + 2, 0.6, -2], [B + 6, 0.55, -2], [B + 10, 0.6, -2],
      [B + 13, 0.6, 3], [B + 14, 0.7, 5], [B + 15, 0.75, 7],
    ]),
  ],
  // Motion: the squelchy acid line, a rolling 16th figure that climbs the scale.
  acid: [
    m('acid', 1, [[2, 0.5, 0], [6, 0.5, 3], [10, 0.5, 7], [14, 0.5, 10]]),
    m('acid', 1, [[0, 0.55, 0], [3, 0.45, 3], [6, 0.5, 7], [10, 0.55, 10], [13, 0.45, 7], [14, 0.45, 5]]),
    m('acid', 2, [
      [0, 0.55, 0], [3, 0.45, 3], [6, 0.5, 7], [10, 0.55, 10], [14, 0.45, 7],
      [B, 0.55, 5], [B + 3, 0.45, 7], [B + 6, 0.5, 10], [B + 10, 0.55, 12], [B + 14, 0.45, 10],
    ]),
    m('acid', 2, [
      [0, 0.55, 0], [2, 0.45, 3], [3, 0.45, 5], [6, 0.5, 7], [8, 0.5, 10], [10, 0.55, 12], [11, 0.45, 10], [14, 0.45, 7],
      [B, 0.55, 5], [B + 3, 0.45, 7], [B + 6, 0.5, 10], [B + 8, 0.5, 12], [B + 10, 0.55, 15], [B + 14, 0.45, 10],
    ]),
  ],
  // Bass: a plucked bass lobbed to the nearest pack, off the kick's downbeats.
  pluck: [
    m('pluck', 1, [[2, 0.9, 0], [10, 0.8, 0], [14, 0.7, -5]]),
    m('pluck', 1, [[2, 0.9, 0], [6, 0.7, -5], [10, 0.85, 0], [14, 0.7, -7]]),
    m('pluck', 2, [
      [2, 0.9, 0], [6, 0.7, -5], [10, 0.85, 0], [14, 0.7, -7],
      [B + 2, 0.9, 3], [B + 6, 0.7, -2], [B + 10, 0.85, 3], [B + 14, 0.7, -5],
    ]),
    m('pluck', 2, [
      [2, 0.9, 0], [6, 0.7, -5], [10, 0.85, 0], [13, 0.6, 0], [14, 0.7, -7],
      [B + 2, 0.9, 3], [B + 6, 0.7, -2], [B + 10, 0.85, 5], [B + 14, 0.7, 3],
    ]),
  ],
  // Motion: arpeggiated 16th figure climbing the pentatonic, driving the groove.
  arp: [
    m('arp', 1, [[0, 0.5, 0], [4, 0.5, 7], [8, 0.5, 12], [12, 0.5, 7]]),
    m('arp', 1, [[0, 0.55, 0], [2, 0.45, 3], [4, 0.5, 7], [6, 0.45, 10], [8, 0.55, 12], [10, 0.45, 10], [12, 0.5, 7], [14, 0.45, 3]]),
    m('arp', 2, [
      [0, 0.55, 0], [2, 0.45, 3], [4, 0.5, 7], [6, 0.45, 10], [8, 0.55, 12], [10, 0.45, 10], [12, 0.5, 7], [14, 0.45, 3],
      [B, 0.55, 5], [B + 2, 0.45, 7], [B + 4, 0.5, 10], [B + 6, 0.45, 12], [B + 8, 0.55, 15], [B + 12, 0.5, 10],
    ]),
    m('arp', 2, [
      [0, 0.55, 0], [2, 0.45, 3], [4, 0.5, 7], [6, 0.45, 10], [8, 0.55, 12], [10, 0.45, 10], [12, 0.5, 7], [14, 0.45, 3],
      [B, 0.55, 5], [B + 2, 0.45, 7], [B + 4, 0.5, 10], [B + 6, 0.45, 12], [B + 8, 0.55, 15], [B + 10, 0.45, 12], [B + 12, 0.55, 10], [B + 14, 0.45, 7],
    ]),
  ],
  // Melody: twinkly high music-box bell, sparkly arps climbing higher each tier.
  bell: [
    m('bell', 1, [[2, 0.6, 12], [10, 0.55, 15]]),
    m('bell', 1, [[2, 0.6, 12], [6, 0.5, 15], [10, 0.55, 17], [14, 0.5, 15]]),
    m('bell', 2, [
      [2, 0.6, 12], [6, 0.5, 15], [10, 0.55, 17], [14, 0.5, 15],
      [B + 2, 0.6, 15], [B + 6, 0.5, 19], [B + 10, 0.55, 17], [B + 14, 0.5, 12],
    ]),
    m('bell', 2, [
      [0, 0.55, 12], [2, 0.6, 15], [6, 0.5, 17], [10, 0.55, 19], [14, 0.5, 15],
      [B, 0.55, 15], [B + 2, 0.6, 17], [B + 6, 0.5, 19], [B + 10, 0.55, 22], [B + 14, 0.5, 15],
    ]),
  ],
};
