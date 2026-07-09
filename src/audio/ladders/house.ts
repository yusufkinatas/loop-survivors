// The fixed House arrangement: 120 BPM, four-on-the-floor, and a restrained
// four-tier ladder for each active weapon. Every dense layer has one clear job:
// kick on the beats, clap on 2 and 4, open hats between the beats, short low-end
// answers in the kick gaps, and sparse pitched hooks over the top.
//
// A tier grows by cadence, phrase variation, or a deliberately rare payoff. It
// does not turn every voice into sixteenth notes. The catalog itself is locked
// in docs/phases/house-foundation-refactor.md.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';

export const SOUNDSET_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Beat: the non-negotiable House anchor. Every tier keeps the four main
  // beats; upper tiers add only quiet pickups and one bar-four kick flourish.
  kick: [
    d('kick', 'X...x...x...x...'),
    d('kick', 'X...x...x...x...', 'X...x...x...x..-'),
    d('kick', 'X...x..-x...x...', 'X...x...x...x..-'),
    d(
      'kick',
      'X...x...x...x...',
      'X...x...x...x..-',
      'X...x..-x...x...',
      'X...x...x..-x.oX',
    ),
  ],

  // Snap: 909 clap on beats 2 and 4. Ghost pickups decorate the turnaround but
  // never replace the backbeat that makes the groove readable.
  clap: [
    d('clap', '....X.......X...'),
    d('clap', '....X.......X...', '....X.......X..-'),
    d('clap', '....X.......X...', '....X...-...X..-'),
    d(
      'clap',
      '....X.......X...',
      '....X.......X..-',
      '....X...-...X...',
      '....X...-...X.ox',
    ),
  ],

  // Tick: open hats first, then closed hats fill selected gaps. Only this lane
  // is allowed to become a crisp near-sixteenth texture at tier four.
  hat: [
    d('hat', '..O...O...O...O.'),
    d('hat', 'o.O.o.O.o.O.o.O.'),
    d('hat', 'x.O.o.O.x.O.o.O.'),
    d('hat', 'xxO.xxO.xxO.xxO.', 'xxO.xxO.xxO.xoOx'),
  ],

  // Groove choice A: a dry wooden click living around the main drums. The
  // chain weapon grows from a few offbeat answers into a two-bar syncopation.
  rimshot: [
    d('rimshot', '......o.......o.'),
    d('rimshot', '..o...x...o...x.'),
    d('rimshot', '..o...x...o...x.', '..o.o.x...o...x.'),
    d('rimshot', '..o...x...o...x.', '..o.o.x...o.o.xx'),
  ],

  // Groove choice B: soft sand-like motion. Continuous sixteenths are allowed
  // here because they are deliberately quiet and replace, rather than stack
  // with, the rimshot lane.
  shaker: [
    d('shaker', '..o...o...o...o.'),
    d('shaker', 'o.o.o.o.o.o.o.o.'),
    d('shaker', 'xoooxoooxoooxooo'),
    d('shaker', 'xoooxoooxoooxooo', 'xoooxoooxoooxoox'),
  ],

  // FX: phrase punctuation, never texture. Tier four turns the quiet bar-four
  // pickup into a full impact, matching the shockwave's marquee payoff.
  crash: [
    d('crash', 'X...............', '................', '................', '................'),
    d('crash', 'X...............', '................', 'X...............', '................'),
    d('crash', 'X...............', '................', 'X...............', '............o...'),
    d('crash', 'X...............', '................', 'X...............', '............X...'),
  ],

  // Low choice A: short rolling bass notes, always between kick hits. Tier four
  // keeps the cadence readable and turns its final answer into the rare sub
  // variant, which also drives the weapon's authored combat peak.
  bass: [
    m('bass', 1, [
      [2, 0.9, 0],
      [10, 0.82, 0],
      [14, 0.68, -5],
    ]),
    m('bass', 1, [
      [2, 0.9, 0],
      [6, 0.72, -2],
      [10, 0.84, 0],
      [14, 0.7, -5],
    ]),
    m('bass', 2, [
      [2, 0.9, 0, 'fat'],
      [6, 0.72, -2, 'fat'],
      [10, 0.84, 0, 'fat'],
      [14, 0.7, -5, 'fat'],
      [B + 2, 0.88, 3, 'fat'],
      [B + 6, 0.7, 0, 'fat'],
      [B + 10, 0.82, 3, 'fat'],
      [B + 13, 0.58, 0, 'fat'],
      [B + 14, 0.68, -2, 'fat'],
    ]),
    m('bass', 4, [
      [2, 0.9, 0, 'fat'], [6, 0.72, -2, 'fat'], [10, 0.84, 0, 'fat'], [14, 0.7, -5, 'fat'],
      [B + 2, 0.88, 3, 'fat'], [B + 6, 0.7, 0, 'fat'], [B + 10, 0.82, 3, 'fat'], [B + 14, 0.68, -2, 'fat'],
      [2 * B + 2, 0.9, 0, 'fat'], [2 * B + 6, 0.72, -5, 'fat'], [2 * B + 10, 0.84, 3, 'fat'], [2 * B + 14, 0.7, 0, 'fat'],
      [3 * B + 2, 0.9, 5, 'fat'], [3 * B + 6, 0.72, 3, 'fat'], [3 * B + 10, 0.84, 0, 'fat'], [3 * B + 14, 1, -5, 'sub'],
    ]),
  ],

  // Low choice B: a short 303-like answer, not a continuous alarm. No event
  // lands on a kick step. Its phrase gets more conversational, not much denser.
  acid: [
    m('acid', 1, [
      [3, 0.62, 0],
      [11, 0.58, 7],
    ]),
    m('acid', 1, [
      [3, 0.65, 0],
      [7, 0.54, 3],
      [11, 0.6, 7],
    ]),
    m('acid', 2, [
      [3, 0.66, 0],
      [7, 0.54, 3],
      [11, 0.62, 7],
      [B + 2, 0.62, 5],
      [B + 6, 0.54, 7],
      [B + 11, 0.64, 10],
      [B + 14, 0.52, 7],
    ]),
    m('acid', 4, [
      [3, 0.68, 0], [7, 0.54, 3], [11, 0.62, 7],
      [B + 2, 0.64, 5], [B + 6, 0.54, 7], [B + 11, 0.66, 10], [B + 14, 0.52, 7],
      [2 * B + 3, 0.68, 3], [2 * B + 7, 0.54, 0], [2 * B + 11, 0.64, 7],
      [3 * B + 2, 0.66, 5], [3 * B + 6, 0.56, 7], [3 * B + 10, 0.7, 10], [3 * B + 14, 0.58, 7], [3 * B + 15, 0.74, 5],
    ]),
  ],

  // Color choice A: one pre-voiced chord per event, kept off the kick. The
  // final bar swaps one short stab for a sustained pad rather than stacking two
  // combat triggers on the same musical moment.
  chord: [
    m('chord', 1, [
      [2, 0.72, 0, 'stab'],
      [10, 0.66, 0, 'stab'],
    ]),
    m('chord', 1, [
      [2, 0.74, 0, 'stab'],
      [6, 0.58, 7, 'stab'],
      [10, 0.68, 0, 'stab'],
    ]),
    m('chord', 2, [
      [2, 0.74, 0, 'stab'],
      [6, 0.58, 7, 'stab'],
      [10, 0.68, 0, 'stab'],
      [B + 2, 0.74, 5, 'stab'],
      [B + 10, 0.68, 7, 'stab'],
      [B + 14, 0.56, 0, 'stab'],
    ]),
    m('chord', 4, [
      [2, 0.74, 0, 'stab'], [10, 0.68, 0, 'stab'], [14, 0.56, 5, 'stab'],
      [B + 2, 0.74, 7, 'stab'], [B + 10, 0.68, 7, 'stab'], [B + 14, 0.56, 5, 'stab'],
      [2 * B + 2, 0.74, 5, 'stab'], [2 * B + 10, 0.68, 7, 'stab'], [2 * B + 14, 0.56, 0, 'stab'],
      [3 * B + 2, 0.62, 5, 'pad'], [3 * B + 10, 0.7, 0, 'stab'], [3 * B + 14, 0.58, 7, 'stab'],
    ]),
  ],

  // Color choice B: warm electric-piano replies a sixteenth later than the
  // straight offbeat stabs, giving the alternative its own gentle pocket.
  rhodes: [
    m('rhodes', 1, [
      [3, 0.58, 3],
      [11, 0.54, 7],
    ]),
    m('rhodes', 1, [
      [3, 0.6, 3],
      [7, 0.5, 7],
      [11, 0.56, 10],
    ]),
    m('rhodes', 2, [
      [3, 0.6, 3],
      [7, 0.5, 7],
      [11, 0.56, 10],
      [B + 3, 0.6, 5],
      [B + 7, 0.5, 10],
      [B + 11, 0.56, 12],
      [B + 14, 0.48, 7],
    ]),
    m('rhodes', 4, [
      [3, 0.62, 3], [7, 0.5, 7], [11, 0.58, 10],
      [B + 3, 0.62, 5], [B + 7, 0.5, 10], [B + 11, 0.58, 12],
      [2 * B + 3, 0.62, 7], [2 * B + 7, 0.5, 12], [2 * B + 11, 0.58, 10],
      [3 * B + 3, 0.64, 5], [3 * B + 6, 0.48, 7], [3 * B + 10, 0.58, 10], [3 * B + 14, 0.54, 12], [3 * B + 15, 0.48, 7],
    ]),
  ],

  // Hook choice A: a sparse four-bar synth phrase. Each tier completes more of
  // the same rise-and-fall idea instead of repeating a one-bar alarm.
  lead: [
    m('lead', 4, [
      [2, 0.72, 7], [10, 0.64, 10], [B + 6, 0.68, 12],
      [2 * B + 2, 0.72, 10], [2 * B + 14, 0.62, 7], [3 * B + 10, 0.68, 3],
    ]),
    m('lead', 4, [
      [2, 0.72, 7], [10, 0.64, 10], [B + 2, 0.58, 12], [B + 10, 0.68, 10],
      [2 * B + 2, 0.72, 12], [2 * B + 14, 0.62, 15], [3 * B + 6, 0.6, 10], [3 * B + 14, 0.68, 7],
    ]),
    m('lead', 4, [
      [2, 0.72, 7], [6, 0.56, 10], [10, 0.64, 12],
      [B + 2, 0.58, 10], [B + 10, 0.68, 7],
      [2 * B + 2, 0.74, 12], [2 * B + 8, 0.56, 15], [2 * B + 14, 0.62, 17],
      [3 * B + 6, 0.6, 10], [3 * B + 14, 0.68, 7],
    ]),
    m('lead', 4, [
      [2, 0.74, 7], [6, 0.56, 10], [10, 0.66, 12],
      [B + 2, 0.6, 10], [B + 8, 0.54, 12], [B + 14, 0.68, 7],
      [2 * B + 2, 0.76, 12], [2 * B + 8, 0.58, 15], [2 * B + 14, 0.64, 17],
      [3 * B + 6, 0.62, 12], [3 * B + 10, 0.56, 10], [3 * B + 14, 0.7, 7],
    ]),
  ],

  // Hook choice B: short human-like syllables answering across the four bars.
  // The delayed-pop weapon stays sparse even at tier four.
  whistle: [
    m('whistle', 4, [
      [6, 0.72, 7], [B + 14, 0.66, 10], [2 * B + 6, 0.72, 12], [3 * B + 14, 0.66, 10],
    ]),
    m('whistle', 4, [
      [6, 0.72, 7], [14, 0.58, 10], [B + 10, 0.68, 12],
      [2 * B + 6, 0.72, 10], [2 * B + 14, 0.58, 7], [3 * B + 10, 0.68, 3],
    ]),
    m('whistle', 4, [
      [6, 0.72, 7], [14, 0.58, 10], [B + 6, 0.66, 12], [B + 14, 0.58, 10],
      [2 * B + 6, 0.74, 12], [2 * B + 14, 0.6, 15], [3 * B + 6, 0.66, 10], [3 * B + 14, 0.7, 7],
    ]),
    m('whistle', 4, [
      [6, 0.74, 7], [12, 0.54, 10], [B + 2, 0.58, 12], [B + 10, 0.68, 10],
      [2 * B + 6, 0.76, 12], [2 * B + 12, 0.56, 15], [2 * B + 15, 0.5, 17],
      [3 * B + 6, 0.68, 12], [3 * B + 10, 0.58, 10], [3 * B + 14, 0.72, 7],
    ]),
  ],
};
