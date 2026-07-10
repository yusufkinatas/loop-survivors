// Shared FX ladders: the transition/punctuation voices (crash = shockwave,
// riser = the auto-dash wind-up). A ladder file may import
// one of these instead of re-authoring it.

import type { Chart } from '../charts';
import { d } from '../groove';

/** crash (FX): the phrase-top accent, always on step 0 of bar 1. Growth adds
 *  a mid-phrase splash (bar 3) and, at the top tier, softer echo splashes. */
export const CRASH: Chart[] = [
  d('crash', 'X...............', '................', '................', '................'),
  d('crash', 'X...............', '................', 'x...............', '................'),
  d('crash', 'X...............', '........o.......', 'x...............', '................'),
  d('crash', 'X...............', '........o.......', 'X...............', '........o.......'),
];

/** riser (FX): a build over the tail of the phrase that resolves into the next
 *  downbeat. The main release always fires at the top of bar 4 (a bar-long
 *  sweep landing on the phrase turnaround); higher tiers add earlier, softer
 *  wind-ups so the dash comes more often (1 -> 2 -> 3 -> 4 per phrase). */
export const RISER: Chart[] = [
  d('riser', '................', '................', '................', 'X...............'),
  d('riser', '................', '........o.......', '................', 'X...............'),
  d('riser', '................', 'x...............', '........o.......', 'X...............'),
  d('riser', '........o.......', 'x...............', '........o.......', 'X...............'),
];
