// House — the one track. 124 BPM, four-on-the-floor. Every tier keeps the
// relentless dance pulse and grows into it: the kick never leaves the four
// downbeats, the clap owns 2 & 4, the open hats ride the offbeats, and the bass
// rolls only in the gaps between kicks so the low end stays clean. Chords stab
// on the offbeats, the Rhodes comps underneath, and the lead sings on top.
//
// Supported roles = exactly the roles the House kit voices: kick, clap, rimshot,
// hat, shaker, crash, riser, bass, chord, rhodes, lead. Key A minor pentatonic.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { CRASH, RISER } from './shared';

export const HOUSE_LADDERS: Partial<Record<Role, Chart[]>> = {
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
  // Backbeat: dry rimshot ticks that syncopate between the claps for groove.
  rimshot: [
    d('rimshot', '......o.......o.'),
    d('rimshot', '..o...o...o...o.'),
    d('rimshot', '..o...o...o.o.o.'),
    d('rimshot', '..o.o.o...o.o.oo'),
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
  // FX: phrase-top crash and the auto-dash riser, shared voicings (tempo carries
  // them the same in any genre).
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
};
