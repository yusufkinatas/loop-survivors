// Shared FX ladders reusable across genres: the transition/punctuation voices
// (zap = lightning, crash = shockwave, riser = the auto-dash wind-up) read the
// same in any genre because tempo carries them — a genre that supports one may
// import it here instead of re-authoring. A genre is free to author its own
// FX ladders in its ladders/<genre>.ts instead, or to drop the FX slot.

import type { Chart } from '../charts';
import { d } from '../groove';

/** zap (FX): sparse lightning punctuation, not texture. */
export const ZAP: Chart[] = [
  d('zap', '........x.......'),
  d('zap', '....x.......x...'),
  d('zap', '....x...x...x...'),
  d('zap', '....x...x...x..x'),
];

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
