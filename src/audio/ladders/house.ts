// The one track. 122 BPM classic house, four-on-the-floor. Every tier keeps
// the relentless dance pulse and grows into it: the kick never leaves the four
// downbeats, the clap/snare own 2 & 4, the open hats ride the off-beats
// (steps 2/6/10/14), and the bass answers the kick only in the gaps so the
// low end stays clean. Chords stab syncopated with an anticipation into the
// next bar, and the lead sings call-and-response on top in 3-3-2 groupings.
//
// Grid: 16 steps per bar. Beats on 0/4/8/12, off-beats ("and"s) on 2/6/10/14.
// Swing comes from the soundset globally; patterns stay on the straight grid.
//
// Retired catalog voices have no ladder, so they are never weapons. Key A
// minor pentatonic.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';

export const SOUNDSET_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse: four-on-the-floor, dead on every beat at EVERY tier. Kick growth
  // now comes from Whip-mapped damage/Amount/Area; extra ghost triggers would
  // also create extra gameplay strips and violate the four-beat contract.
  kick: [
    d('kick', 'X...X...X...X...'),
    d('kick', 'X...X...X...X...'),
    d('kick', 'X...X...X...X...'),
    d('kick', 'X...X...X...X...'),
  ],
  // Backbeat: the wide clap locked to steps 4 and 12 (beats 2 & 4) at every
  // tier. Growth is the classic Chicago extra clap on step 15 pulling into
  // the next bar — the backbeat itself never moves.
  clap: [
    d('clap', '....X.......X...'),
    d('clap', '....X.......X...', '....X.......X..-'),
    d('clap', '....X.......X...', '....X.......X..o'),
    d('clap', '....X.......X..o', '....X.......X.oo'),
  ],
  // Backbeat alternative: same law as the clap — 2 & 4 locked, growth only in
  // the step-15 pickup.
  snare: [
    d('snare', '....x.......x...'),
    d('snare', '....x.......x...', '....x.......x..-'),
    d('snare', '....x.......x...', '....x.......x..o'),
    d('snare', '....x.......x..o', '....x.......x.oo'),
  ],
  // Hats: the signature off-beat open "tss". Tier 1 sparse (opens on 6 and 14
  // with soft closed on 2 and 10), tier 2 opens on all four off-beats, tiers
  // 3-4 add closed 16th pairs pushing into each open hat.
  hat: [
    d('hat', '..o...O...o...O.'),
    d('hat', '..O...O...O...O.'),
    d('hat', 'x.O...O.x.O...O.'),
    d('hat', 'xxO.xxO.xxO.xxO.'),
  ],
  // Bass: OFF-BEAT bass answering the kick — staccato hits on 2/6/10/14, never
  // on the kick's 0/4/8/12. Root/fifth movement (0/7/12), growth = 16th
  // pickups (13/15) and octave jumps at high tiers on the fat variant.
  bass: [
    m('bass', 1, [[2, 0.9, 0], [10, 0.85, 0]]),
    m('bass', 1, [[2, 0.9, 0], [6, 0.75, 0], [10, 0.85, 7], [14, 0.75, 0]]),
    m('bass', 2, [
      [2, 0.9, 0, 'fat'], [6, 0.75, 0, 'fat'], [10, 0.85, 7, 'fat'], [14, 0.75, 0, 'fat'],
      [B + 2, 0.9, 0, 'fat'], [B + 6, 0.75, 7, 'fat'], [B + 10, 0.85, 0, 'fat'], [B + 15, 0.6, 0, 'fat'],
    ]),
    m('bass', 2, [
      [2, 0.9, 0, 'fat'], [6, 0.75, 0, 'fat'], [10, 0.85, 7, 'fat'], [13, 0.55, 0, 'fat'], [14, 0.75, 12, 'fat'],
      [B + 2, 0.9, 0, 'fat'], [B + 6, 0.75, 7, 'fat'], [B + 10, 0.85, 12, 'fat'], [B + 13, 0.55, 7, 'fat'], [B + 14, 0.75, 0, 'fat'], [B + 15, 0.6, 0, 'fat'],
    ]),
  ],
  // Harmony: syncopated piano stabs. Low tiers avoid the downbeat entirely;
  // step 15 anticipates the next bar's chord; tier 4 is the pumping riff
  // (Ride On Time feel) with a pad swelling under the downbeats. Chord roots
  // move 0 -> 5/7 across the two bars.
  chord: [
    m('chord', 1, [[2, 0.75, 0, 'stab'], [10, 0.7, 0, 'stab']]),
    m('chord', 1, [[2, 0.8, 0, 'stab'], [7, 0.6, 0, 'stab'], [10, 0.7, 7, 'stab'], [15, 0.6, 0, 'stab']]),
    m('chord', 2, [
      [2, 0.8, 0, 'stab'], [7, 0.6, 0, 'stab'], [10, 0.7, 7, 'stab'], [15, 0.6, 5, 'stab'],
      [B + 2, 0.8, 5, 'stab'], [B + 7, 0.6, 5, 'stab'], [B + 10, 0.7, 7, 'stab'], [B + 15, 0.6, 0, 'stab'],
    ]),
    m('chord', 2, [
      [0, 0.5, 0, 'pad'], [2, 0.8, 0, 'stab'], [4, 0.6, 0, 'stab'], [7, 0.65, 0, 'stab'], [10, 0.75, 7, 'stab'], [12, 0.6, 7, 'stab'], [15, 0.65, 5, 'stab'],
      [B, 0.5, 5, 'pad'], [B + 2, 0.8, 5, 'stab'], [B + 4, 0.6, 5, 'stab'], [B + 7, 0.65, 7, 'stab'], [B + 10, 0.75, 7, 'stab'], [B + 12, 0.6, 5, 'stab'], [B + 15, 0.65, 0, 'stab'],
    ]),
  ],
  // Melody: call-and-response phrases over the full four bars. Low tiers leave
  // air in bar 4; mid tiers phrase in 3-3-2 groupings (steps 0/3/6 + 8/11/14 —
  // hits every 3 then 2 steps, the push-pull that makes dance leads bounce);
  // tier 4 adds stuttered chop repetition (the same note machine-gunned).
  lead: [
    m('lead', 4, [
      [0, 0.75, 7], [6, 0.65, 10],
      [B + 4, 0.7, 12], [B + 10, 0.6, 10],
      [2 * B, 0.75, 7], [2 * B + 6, 0.65, 12],
      // bar 4: air
    ]),
    m('lead', 4, [
      [0, 0.75, 7], [3, 0.6, 10], [6, 0.7, 12],
      [B + 4, 0.7, 10], [B + 10, 0.6, 7],
      [2 * B, 0.75, 7], [2 * B + 3, 0.6, 10], [2 * B + 6, 0.7, 12],
      [3 * B + 4, 0.65, 10],
      // bar 4 mostly air
    ]),
    m('lead', 4, [
      [0, 0.75, 7], [3, 0.6, 10], [6, 0.7, 12], [8, 0.7, 15], [11, 0.6, 12], [14, 0.65, 10],
      [B + 4, 0.7, 12], [B + 10, 0.6, 7],
      [2 * B, 0.75, 7], [2 * B + 3, 0.6, 10], [2 * B + 6, 0.7, 12], [2 * B + 8, 0.7, 15], [2 * B + 11, 0.6, 17], [2 * B + 14, 0.65, 15],
      [3 * B + 4, 0.7, 12], [3 * B + 10, 0.6, 10],
    ]),
    m('lead', 4, [
      [0, 0.75, 7], [3, 0.6, 10], [6, 0.7, 12], [8, 0.7, 15], [11, 0.6, 12], [14, 0.65, 10],
      [B + 4, 0.7, 12], [B + 10, 0.6, 7], [B + 14, 0.55, 10],
      [2 * B, 0.75, 7], [2 * B + 3, 0.6, 10], [2 * B + 6, 0.7, 12], [2 * B + 8, 0.7, 15], [2 * B + 11, 0.6, 17], [2 * B + 14, 0.65, 15],
      // stuttered chop: the same note repeated on 16ths, resolving down
      [3 * B, 0.7, 12], [3 * B + 1, 0.55, 12], [3 * B + 2, 0.7, 12], [3 * B + 3, 0.55, 12],
      [3 * B + 6, 0.7, 10], [3 * B + 8, 0.7, 7], [3 * B + 12, 0.6, 10],
    ]),
  ],
  // Motion: driving pentatonic climb. Grows from a quarter-note outline of the
  // figure to full running 16ths across two bars.
  arp: [
    m('arp', 1, [[0, 0.55, 0], [4, 0.5, 3], [8, 0.55, 7], [12, 0.5, 12]]),
    m('arp', 1, [
      [0, 0.55, 0], [2, 0.45, 3], [4, 0.5, 7], [6, 0.45, 10], [8, 0.55, 12], [10, 0.45, 10], [12, 0.5, 7], [14, 0.45, 3],
    ]),
    m('arp', 2, [
      [0, 0.55, 0], [1, 0.4, 3], [2, 0.45, 7], [4, 0.5, 12], [6, 0.45, 10], [8, 0.55, 7], [10, 0.45, 10], [12, 0.5, 12], [14, 0.45, 7],
      [B, 0.55, 3], [B + 2, 0.45, 7], [B + 4, 0.5, 10], [B + 6, 0.45, 12], [B + 8, 0.55, 15], [B + 10, 0.45, 12], [B + 12, 0.5, 10], [B + 14, 0.45, 7],
    ]),
    // Near-running 16ths but with rests punched on 5/9/13 in each bar so the
    // line breathes and its trigger rate stays comparable to the other
    // melodic roles at max tier (a solid 16th wall is the hats' privilege).
    m('arp', 2, [
      [0, 0.55, 0], [1, 0.4, 3], [2, 0.5, 7], [3, 0.4, 12], [4, 0.55, 7], [6, 0.5, 7], [7, 0.4, 12],
      [8, 0.55, 15], [10, 0.5, 10], [11, 0.4, 7], [12, 0.55, 12], [14, 0.5, 7], [15, 0.4, 3],
      [B, 0.55, 5], [B + 1, 0.4, 7], [B + 2, 0.5, 10], [B + 3, 0.4, 12], [B + 4, 0.55, 15], [B + 6, 0.5, 10], [B + 7, 0.4, 7],
      [B + 8, 0.55, 12], [B + 10, 0.5, 7], [B + 11, 0.4, 5], [B + 12, 0.55, 3], [B + 14, 0.5, 7], [B + 15, 0.4, 10],
    ]),
  ],
};
