// Shared FX ladders: the transition/punctuation voices (crash = shockwave,
// riser = the auto-dash wind-up). A ladder file may import
// one of these instead of re-authoring it.

import type { Chart } from '../charts';
import { d } from '../groove';

/** crash (FX): phrase-level shockwave accents. */
export const CRASH: Chart[] = [
  d('crash', 'X...............', '................', '................', '................'),
  d('crash', 'X...............', '................', 'X...............', '................'),
  d('crash', 'X...............', '................', 'X...............', '............o...'),
  d('crash', 'X...............', '................', 'X...............', '........o.x.X...'),
];

/** riser (FX): the auto-dash's build-and-release, climbing in cadence by tier
 *  (1 -> 2 -> 3 -> 4 releases per phrase) so the dash comes more often. */
export const RISER: Chart[] = [
  d('riser', 'X...............', '................', '................', '................'),
  d('riser', 'X...............', '................', 'X...............', '................'),
  d('riser', 'X...............', '........o.......', 'X...............', '................'),
  d('riser', 'X...............', '........o.......', 'X...............', '........x.......'),
];
