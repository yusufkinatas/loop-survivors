// Genres are the game's playable characters. Every genre plays the exact same
// twelve-weapon soundset (src/audio/kits.ts) but through its own tempo, swing,
// and per-weapon patterns — "same tools, different tracks". Pick a genre and
// the whole build re-voices: a kick in House drives four-on-the-floor, the same
// kick in Lo-Fi lays back behind the beat, in Drum & Bass it snaps a breakbeat.
//
// Patterns are grounded in real production practice (see the M3-era research):
// House four-on-floor + offbeat open hats, Lo-Fi swung boom-bap, Synthwave
// straight machine drums + 16th arps, Hip-Hop halftime + rolling trap hats +
// booming 808 + a melodic hook, Drum & Bass 174 two-step + rolling sub, Techno
// relentless four-on-floor + offbeat hats. The coherence skeleton (minor
// pentatonic, chord roots 0/5/7) still owns the theory, so no genre can clash.

import type { Chart } from './charts';
import { TIER_COUNT, validateChart } from './charts';
import { ROLES, type Role } from './kits';
import { B, d, m } from './groove';

export type GenreId = 'lofi' | 'house' | 'synthwave' | 'hiphop' | 'dnb' | 'techno';

export interface Genre {
  id: GenreId;
  name: string;
  /** One-line character pitch for the select screen. */
  blurb: string;
  /** Accent color for the select card. */
  color: string;
  bpm: number;
  /** Fraction of a 16th the offbeat 8ths are pushed late (the shuffle). */
  swing: number;
  /** Per-trigger damage compensation for tempo (docs/plan.md, tempo & damage):
   *  a fast genre fires more triggers, so each hits softer. */
  powerMul: number;
  ladders: Record<Role, Chart[]>;
}

// ---- shared fx ladders: zap (lightning) and crash (shockwave) read the same
// across genres; tempo carries them, so they don't need per-genre authoring.

const ZAP: Chart[] = [
  d('zap', '........x.......'),
  d('zap', '....x.......x...'),
  d('zap', '....x...x...x...'),
  // Tier 4 stays punctuation: tier-3's 4/8/12 plus a phrase-end accent, not a
  // wall of 16ths reading as texture.
  d('zap', '....x...x...x..x'),
];

const CRASH: Chart[] = [
  d('crash', 'X...............', '................', '................', '................'),
  d('crash', 'X...............', '................', 'X...............', '................'),
  d('crash', 'X...............', '................', 'X...............', '............o...'),
  d('crash', 'X...............', '................', 'X...............', '........o.x.X...'),
];

// riser (FX slot, sub-phase C): the auto-dash's build-and-release. Like crash
// and zap it reads the same across genres — a sparse phrase-level swell whose
// release grants a movement surge. Tempo carries it; no per-genre authoring.
// The cadence climbs tier to tier so the dash comes more often (1 -> 2 -> 3 ->
// 4 per phrase), staying transition punctuation, never texture.
const RISER: Chart[] = [
  d('riser', 'X...............', '................', '................', '................'),
  d('riser', 'X...............', '................', 'X...............', '................'),
  d('riser', 'X...............', '........o.......', 'X...............', '................'),
  d('riser', 'X...............', '........o.......', 'X...............', '........x.......'),
];

// =====================================================================
// LO-FI — 84 BPM, heavily swung boom-bap, warm and dusty.
// =====================================================================
const LOFI: Genre = {
  id: 'lofi',
  name: 'Lo-Fi',
  blurb: 'Slow, swung boom-bap. Dusty and warm. Hits soft but heavy.',
  color: '#d9a05b',
  bpm: 84,
  swing: 0.34,
  powerMul: 1.35,
  ladders: {
    riser: RISER,
    ride: [
      // Freeze sweep: a lazy jazz ride ping. Moderate by rule — quarters that
      // open into a swung 8th feel, growing by accents and the bell (O), never
      // a 16th wall. Each ping freezes a slice of enemies.
      d('ride', 'o...o...o...o...'),
      d('ride', 'x...o...x...o...'),
      d('ride', 'o.o.o.o.o.o.o.o.'),
      d('ride', 'x.o.o.o.x.o.o.o.', 'x.o.o.o.x.o.o.oO'),
    ],
    reese: [
      // The low growling monster, dialed to lo-fi: sparse heavy hits that sit
      // in the kick's gaps (kick is on 0 and 10) and grow by weight, not count.
      // Low notes only: 0, -5, -7, -2, -12.
      m('reese', 2, [[6, 0.85, 0], [B + 6, 0.8, -5]]),
      m('reese', 2, [[6, 0.85, 0], [12, 0.7, -7], [B + 6, 0.8, -5], [B + 12, 0.7, -2]]),
      m('reese', 2, [[6, 0.9, 0], [12, 0.65, -7], [B + 2, 0.7, -7], [B + 6, 0.85, -5], [B + 12, 0.7, -2]]),
      m('reese', 2, [
        [2, 0.7, 0], [6, 0.95, 0], [12, 0.7, -7],
        [B + 2, 0.7, -7], [B + 6, 0.9, -5], [B + 12, 0.75, -2], [B + 14, 0.7, -12],
      ]),
    ],
    choir: [
      // Airy 'aah' pad: held and sparse. Grows by stacking a second and third
      // voice into the chord (root, fifth, octave), not by adding onsets.
      m('choir', 2, [[0, 0.5, 0], [B, 0.5, 5]]),
      m('choir', 2, [[0, 0.5, 0], [0, 0.45, 7], [B, 0.5, 5], [B, 0.45, 10]]),
      m('choir', 2, [
        [0, 0.5, 0], [0, 0.45, 7], [8, 0.4, 3],
        [B, 0.5, 5], [B, 0.45, 10], [B + 8, 0.4, 7],
      ]),
      m('choir', 2, [
        [0, 0.55, 0], [0, 0.5, 7], [0, 0.45, 12], [8, 0.4, 3],
        [B, 0.55, 5], [B, 0.5, 10], [B, 0.45, 12], [B + 8, 0.4, 7],
      ]),
    ],
    bell: [
      // Twinkly music-box, the brightest voice: sparse high sparkles that grow
      // into a fuller arpeggiated line. High notes only: 10, 12, 15, 17, 19.
      m('bell', 2, [[8, 0.55, 12], [B + 8, 0.5, 15]]),
      m('bell', 2, [[8, 0.55, 12], [12, 0.45, 15], [B + 8, 0.5, 10], [B + 12, 0.45, 15]]),
      m('bell', 2, [
        [0, 0.5, 12], [8, 0.55, 15], [12, 0.45, 17],
        [B, 0.5, 10], [B + 8, 0.55, 15], [B + 12, 0.45, 12],
      ]),
      m('bell', 4, [
        [0, 0.5, 12], [8, 0.55, 15], [12, 0.45, 17], [B, 0.5, 10], [B + 8, 0.55, 15],
        [2 * B, 0.5, 17], [2 * B + 8, 0.55, 19], [3 * B, 0.5, 15], [3 * B + 8, 0.55, 12], [3 * B + 12, 0.45, 10],
      ]),
    ],
    whistle: [
      // Smooth sung hook, one enemy tagged per note: kept SPARSE by rule, long
      // singable tones high in the mix. 1-3 notes a bar. Notes: 7, 10, 12, 15.
      m('whistle', 2, [[0, 0.6, 7], [B, 0.55, 10]]),
      m('whistle', 2, [[0, 0.6, 7], [8, 0.5, 10], [B, 0.55, 12], [B + 8, 0.5, 10]]),
      m('whistle', 2, [
        [0, 0.65, 7], [8, 0.55, 10],
        [B, 0.6, 12], [B + 8, 0.55, 15], [B + 12, 0.5, 12],
      ]),
      m('whistle', 4, [
        [0, 0.65, 7], [8, 0.55, 10], [B, 0.6, 12], [B + 8, 0.55, 10],
        [2 * B, 0.6, 15], [2 * B + 8, 0.55, 12], [3 * B, 0.6, 10], [3 * B + 8, 0.55, 7],
      ]),
    ],

    kick: [
      d('kick', 'X.........o.....'),
      d('kick', 'X.....-...o.....'),
      d('kick', 'X.....-...o.....', 'X.....-...o.x...'),
      d('kick', 'X.....-...o.....', 'X.....-...o.x.-.'),
    ],
    snare: [
      d('snare', '....x.......x...'),
      d('snare', '....x.....-.x...'),
      d('snare', '....x.....-.x...', '....x...-.-.x...'),
      d('snare', '....x.....-.x...', '....x...-.-.x.xx'),
    ],
    hat: [
      d('hat', 'o.o.o.o.o.o.o.o.'),
      d('hat', 'x.o.x.o.x.o.x.o.'),
      d('hat', 'x.o.x.o.x.o.x.oO'),
      d('hat', 'x-o.x-o.x-o.x-oO', 'x-o.x-o.x-o.x-xO'),
    ],
    clap: [
      d('clap', '............x...'),
      d('clap', '....x.......x...'),
      d('clap', '....x.......x...', '....x.......x.o.'),
      d('clap', '....x.......x...', '....x.......x.xx'),
    ],
    rimshot: [
      // Backbeat, lazy and sparse: beat-4 tock alone, then beat-2 joins, then a
      // ghost pickup, then a second bar with an extra ghost. Grows by feel.
      d('rimshot', '............x...'),
      d('rimshot', '....x.......x...'),
      d('rimshot', '....x.....-.x...'),
      d('rimshot', '....x.....-.x...', '....x...-.-.x...'),
    ],
    tom: [
      // Pulse: laid-back low pulse on beat 3. Sparse by rule; tiers grow by
      // weight and pitch, then a half-note (beat 1+3) pulse, never clutter.
      m('tom', 2, [[8, 0.55, 0], [B + 8, 0.55, 0]]),
      m('tom', 2, [[8, 0.6, 0], [B + 8, 0.6, -2]]),
      m('tom', 2, [[0, 0.5, 0], [8, 0.6, 0], [B, 0.5, 0], [B + 8, 0.6, -2]]),
      m('tom', 2, [
        [0, 0.55, 0], [8, 0.65, 0], [B, 0.55, 0], [B + 8, 0.65, -2], [B + 14, 0.6, 3],
      ]),
    ],
    cowbell: [
      m('cowbell', 1, [[10, 0.5, 0]]),
      m('cowbell', 2, [[6, 0.45, 0], [10, 0.5, 7]]),
      m('cowbell', 2, [[6, 0.45, 0], [10, 0.5, 7], [B + 6, 0.45, 5], [B + 10, 0.5, 3]]),
      m('cowbell', 2, [
        [6, 0.45, 0], [10, 0.5, 7], [14, 0.4, 5],
        [B + 6, 0.45, 5], [B + 10, 0.5, 3], [B + 14, 0.5, 0],
      ]),
    ],
    crash: CRASH,
    zap: ZAP,
    heartbeat: [
      d('heartbeat', '....x.o.........'),
      d('heartbeat', '....x.o.....x.o.'),
      d('heartbeat', '..-.x.o.....x.o.'),
      d('heartbeat', '..-.x.o.....x.o.', '..-.x.o...-.x.o.'),
    ],
    shaker: [
      d('shaker', 'o...o...o...o...'),
      d('shaker', 'o.o.o.o.o.o.o.o.'),
      d('shaker', 'o.o.o.o.o.o.o.oo'),
      d('shaker', 'o-o.o-o.o-o.o-o.', 'o-o.o-o.o-o.o-oo'),
    ],
    acid: [
      m('acid', 1, [[4, 0.5, 0], [10, 0.45, 3]]),
      m('acid', 1, [[4, 0.55, 0], [7, 0.45, 3], [10, 0.5, 7], [14, 0.45, 5]]),
      m('acid', 2, [[4, 0.55, 0], [7, 0.45, 3], [10, 0.5, 7], [14, 0.45, 5], [B + 4, 0.55, 5], [B + 10, 0.5, 10]]),
      m('acid', 2, [
        [2, 0.5, 0], [4, 0.55, 3], [7, 0.45, 5], [10, 0.5, 7], [14, 0.45, 10],
        [B + 2, 0.5, 5], [B + 4, 0.55, 7], [B + 10, 0.5, 12], [B + 14, 0.45, 7],
      ]),
    ],
    pluck: [
      m('pluck', 2, [[0, 0.95, 0], [B + 8, 0.65, -5]]),
      m('pluck', 2, [[0, 0.95, 0], [8, 0.6, -5], [B, 0.9, -2], [B + 8, 0.65, -7]]),
      m('pluck', 2, [[0, 0.95, 0], [6, 0.6, -5], [10, 0.6, 0], [B, 0.9, -2], [B + 8, 0.65, -7], [B + 14, 0.6, -5]]),
      m('pluck', 4, [
        [0, 0.95, 0], [6, 0.6, -5], [10, 0.6, 0], [B, 0.9, -2], [B + 8, 0.65, -7],
        [2 * B, 0.95, 3], [2 * B + 10, 0.6, -2], [3 * B, 0.9, -5], [3 * B + 8, 0.65, -7], [3 * B + 14, 0.6, -12],
      ]),
    ],
    rhodes: [
      m('rhodes', 2, [[8, 0.55, 3], [B + 8, 0.5, 7]]),
      m('rhodes', 2, [[0, 0.5, 3], [8, 0.55, 7], [B, 0.5, 10], [B + 8, 0.5, 5]]),
      m('rhodes', 2, [[0, 0.5, 3], [6, 0.45, 7], [8, 0.55, 10], [B, 0.5, 5], [B + 8, 0.5, 3], [B + 12, 0.45, 7]]),
      m('rhodes', 4, [
        [0, 0.5, 3], [8, 0.55, 7], [B, 0.5, 10], [B + 8, 0.5, 5],
        [2 * B, 0.5, 7], [2 * B + 8, 0.55, 10], [3 * B, 0.5, 5], [3 * B + 8, 0.5, 3], [3 * B + 12, 0.45, 7],
      ]),
    ],
    bass: [
      m('bass', 2, [[0, 1.0, 0], [B + 8, 0.7, -2]]),
      m('bass', 2, [[0, 1.0, 0], [12, 0.6, 0], [B, 0.9, -2], [B + 8, 0.7, -5]]),
      m('bass', 2, [[0, 1.0, 0], [8, 0.6, 3], [12, 0.6, 0], [B, 0.9, -2], [B + 8, 0.7, -5], [B + 14, 0.6, 0]]),
      m('bass', 4, [
        [0, 1.0, 0], [12, 0.6, 0], [B, 0.9, -2], [B + 8, 0.7, -5],
        [2 * B, 1.0, 0], [2 * B + 10, 0.6, 3], [3 * B, 0.9, 5], [3 * B + 8, 0.7, -2], [3 * B + 14, 0.6, 0],
      ]),
    ],
    chord: [
      m('chord', 2, [[4, 0.6, 0, 'stab'], [B + 12, 0.55, 5, 'stab']]),
      m('chord', 2, [[0, 0.5, 0, 'pad'], [4, 0.65, 0, 'stab'], [B + 4, 0.6, 5, 'stab'], [B + 12, 0.55, 7, 'stab']]),
      m('chord', 2, [
        [0, 0.5, 0, 'pad'], [4, 0.65, 0, 'stab'], [10, 0.4, 0, 'stab'],
        [B, 0.5, 5, 'pad'], [B + 4, 0.6, 5, 'stab'], [B + 12, 0.55, 7, 'stab'],
      ]),
      m('chord', 4, [
        [0, 0.5, 0, 'pad'], [4, 0.65, 0, 'stab'],
        [B + 4, 0.6, 5, 'stab'], [2 * B, 0.5, 7, 'pad'], [2 * B + 4, 0.6, 7, 'stab'],
        [3 * B + 4, 0.6, 5, 'stab'], [3 * B + 12, 0.6, 0, 'stab'],
      ]),
    ],
    arp: [
      m('arp', 1, [[0, 0.5, 0], [4, 0.45, 7], [8, 0.5, 12], [12, 0.45, 7]]),
      m('arp', 1, [[0, 0.55, 0], [4, 0.5, 7], [6, 0.45, 10], [8, 0.55, 12], [12, 0.5, 7], [14, 0.45, 5]]),
      m('arp', 2, [
        [0, 0.55, 0], [4, 0.5, 7], [8, 0.55, 12], [12, 0.5, 7],
        [B, 0.55, 3], [B + 4, 0.5, 10], [B + 8, 0.55, 15], [B + 12, 0.5, 10],
      ]),
      m('arp', 2, [
        [0, 0.55, 0], [2, 0.4, 5], [4, 0.5, 7], [6, 0.4, 10], [8, 0.55, 12], [10, 0.4, 10], [12, 0.5, 7], [14, 0.4, 5],
        [B, 0.55, 3], [B + 4, 0.5, 10], [B + 8, 0.55, 15], [B + 12, 0.5, 12],
      ]),
    ],
    lead: [
      m('lead', 2, [[0, 0.7, 7], [8, 0.6, 5], [B, 0.7, 3]]),
      m('lead', 2, [[0, 0.7, 7], [6, 0.6, 5], [8, 0.6, 3], [B, 0.7, 5], [B + 8, 0.6, 0]]),
      m('lead', 4, [
        [0, 0.7, 7], [6, 0.6, 5], [8, 0.6, 3], [B, 0.7, 5], [B + 8, 0.6, 0],
        [2 * B, 0.7, 3], [2 * B + 6, 0.6, 5], [2 * B + 8, 0.7, 7], [3 * B, 0.7, 10], [3 * B + 8, 0.6, 7], [3 * B + 12, 0.7, 5],
      ]),
      m('lead', 4, [
        [0, 0.7, 7], [6, 0.6, 5], [8, 0.6, 3], [12, 0.5, 12], [B, 0.7, 5], [B + 8, 0.6, 0], [B + 14, 0.5, 3],
        [2 * B, 0.7, 3], [2 * B + 6, 0.6, 5], [2 * B + 8, 0.7, 7], [2 * B + 12, 0.6, 12],
        [3 * B, 0.7, 10], [3 * B + 8, 0.6, 7], [3 * B + 12, 0.7, 5], [3 * B + 14, 0.6, 3],
      ]),
    ],
  },
};

// =====================================================================
// HOUSE — 124 BPM, straight four-on-the-floor, offbeat open hats.
// =====================================================================
const HOUSE: Genre = {
  id: 'house',
  name: 'House',
  blurb: 'Four-on-the-floor. Offbeat hats, stabby chords. Steady and relentless.',
  color: '#4dc3ff',
  bpm: 124,
  swing: 0.06,
  powerMul: 0.9,
  ladders: {
    riser: RISER,
    // Ride: bright offbeat ride ping, freeze sweep. Moderate 8th feel (never a
    // 16th wall). Grows by promoting offbeats to accents, then a phrase-end lift.
    ride: [
      d('ride', 'o...o...o...o...'),
      d('ride', 'o.o.o.o.o.o.o.o.'),
      d('ride', 'o.x.o.x.o.x.o.x.'),
      d('ride', 'o.x.o.x.o.x.o.x.', 'o.x.o.x.o.x.o.xX'),
    ],
    // Reese: thick growling low bass on the offbeats, clear of the four-on-floor
    // kick (0/4/8/12). Weight ladder: sparse heavy hits, then more movement and
    // pickup ghosts, always staying low.
    reese: [
      m('reese', 1, [[2, 0.9, 0], [10, 0.85, -5]]),
      m('reese', 1, [[2, 0.9, 0], [6, 0.75, -7], [10, 0.85, 0], [14, 0.75, -5]]),
      m('reese', 2, [
        [2, 0.9, 0], [6, 0.75, -7], [10, 0.85, 0], [14, 0.75, -5],
        [B + 2, 0.9, 3], [B + 6, 0.75, -2], [B + 10, 0.85, 3], [B + 14, 0.75, -5],
      ]),
      m('reese', 2, [
        [2, 0.9, 0], [6, 0.75, -7], [10, 0.85, 0], [14, 0.75, -5], [15, 0.6, 0],
        [B + 2, 0.9, 3], [B + 6, 0.75, -2], [B + 10, 0.85, 3], [B + 14, 0.75, -5], [B + 15, 0.6, -7],
      ]),
    ],
    // Choir: airy sung 'aah' pad, held and sparse. One long note per bar, then a
    // stacked voice, then a fuller voicing and a chord change. Grows in harmony,
    // not density.
    choir: [
      m('choir', 1, [[0, 0.55, 0]]),
      m('choir', 1, [[0, 0.6, 0], [0, 0.5, 7]]),
      m('choir', 2, [[0, 0.6, 0], [0, 0.5, 7], [B, 0.6, 3], [B, 0.5, 10]]),
      m('choir', 2, [
        [0, 0.6, 0], [0, 0.5, 7], [0, 0.45, 12],
        [B, 0.6, 3], [B, 0.5, 10], [B, 0.45, 12],
      ]),
    ],
    // Bell: twinkly high music-box, the brightest voice. Sparkly arpeggiated
    // figures on the 8th grid, climbing higher and fuller each tier.
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
    // Whistle: pure smooth sung hook, one hit tags one enemy so it stays sparse.
    // Long high notes, 1-3 per bar, building a singable rise-and-fall phrase.
    whistle: [
      m('whistle', 2, [[0, 0.7, 7], [B, 0.7, 10]]),
      m('whistle', 2, [[0, 0.7, 7], [8, 0.65, 10], [B, 0.7, 12], [B + 8, 0.65, 10]]),
      m('whistle', 2, [
        [0, 0.7, 7], [8, 0.65, 10],
        [B, 0.7, 12], [B + 6, 0.6, 15], [B + 10, 0.65, 12],
      ]),
      m('whistle', 2, [
        [0, 0.7, 7], [6, 0.6, 10], [10, 0.65, 12],
        [B, 0.7, 12], [B + 6, 0.6, 15], [B + 10, 0.65, 17],
      ]),
    ],

    kick: [
      d('kick', 'X...X...X...X...'),
      d('kick', 'X...X...X...X...'),
      d('kick', 'X...X...X...X...', 'X...X...X...X..-'),
      d('kick', 'X...X...X...X...', 'X...X...X...X.XX'),
    ],
    snare: [
      d('snare', '....x.......x...'),
      d('snare', '....x.......x...'),
      d('snare', '....x.......x...', '....x.......x..o'),
      d('snare', '....x.......x...', '....x.......x.xx'),
    ],
    hat: [
      d('hat', '..O...O...O...O.'),
      d('hat', 'o.O.o.O.o.O.o.O.'),
      d('hat', 'x.O.x.O.x.O.x.O.'),
      d('hat', 'xxO.xxO.xxO.xxO.'),
    ],
    clap: [
      d('clap', '....x.......x...'),
      d('clap', '....x.......x...'),
      d('clap', '....x.......x...', '....x.......x.o.'),
      d('clap', '....o...o...x...', '....o...o...x.xx'),
    ],
    rimshot: [
      // Clean four-on-floor backbeat on 2 and 4; tiers 3-4 add a ghost pickup
      // into beat 3 (step 7) and a phrase-end ghost (step 15). Stays a backbeat.
      d('rimshot', '....x.......x...'),
      d('rimshot', '....x.......x...'),
      d('rimshot', '....x..-....x...'),
      d('rimshot', '....x..-....x..-'),
    ],
    tom: [
      // Pulse: offbeat low groove under the four-on-floor kick, sitting on the
      // "and"s (2/6/10/14) so it never lands on the kick's 0/4/8/12.
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
    cowbell: [
      m('cowbell', 1, [[2, 0.45, 0], [10, 0.45, 0]]),
      m('cowbell', 1, [[2, 0.5, 7], [6, 0.45, 0], [10, 0.5, 7], [14, 0.45, 0]]),
      m('cowbell', 2, [[2, 0.5, 7], [6, 0.45, 0], [10, 0.5, 7], [14, 0.45, 5], [B + 2, 0.5, 5], [B + 10, 0.5, 3]]),
      m('cowbell', 2, [
        [2, 0.5, 7], [6, 0.45, 0], [10, 0.5, 7], [14, 0.45, 5],
        [B + 2, 0.5, 5], [B + 6, 0.45, 7], [B + 10, 0.5, 10], [B + 14, 0.45, 7],
      ]),
    ],
    crash: CRASH,
    zap: ZAP,
    heartbeat: [
      d('heartbeat', '..xo............'),
      d('heartbeat', '..xo......xo....'),
      d('heartbeat', '..xo..o...xo....'),
      d('heartbeat', '..xo..o...xo....', '..xo..o...xo..o.'),
    ],
    shaker: [
      d('shaker', 'o.o.o.o.o.o.o.o.'),
      d('shaker', 'oooooooooooooooo'),
      d('shaker', 'xoooxoooxoooxooo'),
      d('shaker', 'xoooxoooxoooxooo', 'xoooxoooxoooxoox'),
    ],
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
    bass: [
      m('bass', 1, [[2, 0.9, 0], [10, 0.8, 0], [14, 0.7, 0]]),
      m('bass', 1, [[2, 0.9, 0], [6, 0.7, -2], [10, 0.85, 0], [14, 0.7, -5]]),
      m('bass', 2, [
        [2, 0.9, 0], [6, 0.7, -2], [10, 0.85, 0], [14, 0.7, -5],
        [B + 2, 0.9, 3], [B + 6, 0.7, 0], [B + 10, 0.85, 3], [B + 14, 0.7, -2],
      ]),
      m('bass', 2, [
        [2, 0.9, 0], [6, 0.7, -2], [10, 0.85, 0], [14, 0.7, -5], [15, 0.6, 0],
        [B + 2, 0.9, 3], [B + 6, 0.7, 0], [B + 10, 0.85, 5], [B + 14, 0.7, 3],
      ]),
    ],
    chord: [
      m('chord', 1, [[2, 0.7, 0, 'stab'], [10, 0.65, 0, 'stab']]),
      m('chord', 1, [[2, 0.75, 0, 'stab'], [6, 0.6, 5, 'stab'], [10, 0.7, 0, 'stab'], [14, 0.6, 7, 'stab']]),
      m('chord', 2, [
        [2, 0.75, 0, 'stab'], [6, 0.6, 5, 'stab'], [10, 0.7, 0, 'stab'], [14, 0.6, 7, 'stab'],
        [B + 2, 0.75, 5, 'stab'], [B + 10, 0.7, 7, 'stab'],
      ]),
      m('chord', 2, [
        [0, 0.5, 0, 'pad'], [2, 0.75, 0, 'stab'], [6, 0.6, 5, 'stab'], [10, 0.7, 0, 'stab'], [14, 0.6, 7, 'stab'],
        [B, 0.5, 7, 'pad'], [B + 2, 0.75, 7, 'stab'], [B + 6, 0.6, 5, 'stab'], [B + 10, 0.7, 5, 'stab'],
      ]),
    ],
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
    lead: [
      m('lead', 2, [[0, 0.75, 0], [8, 0.7, 7], [B + 4, 0.7, 5]]),
      m('lead', 2, [[0, 0.75, 0], [4, 0.6, 3], [8, 0.7, 7], [B, 0.7, 5], [B + 8, 0.65, 3]]),
      m('lead', 4, [
        [0, 0.75, 0], [4, 0.6, 3], [8, 0.7, 7], [B, 0.7, 5], [B + 8, 0.65, 3],
        [2 * B, 0.75, 7], [2 * B + 8, 0.7, 10], [3 * B, 0.7, 12], [3 * B + 8, 0.7, 7],
      ]),
      m('lead', 4, [
        [0, 0.75, 0], [4, 0.6, 3], [8, 0.7, 7], [12, 0.6, 12], [B, 0.7, 5], [B + 8, 0.65, 3],
        [2 * B, 0.75, 7], [2 * B + 8, 0.7, 10], [2 * B + 12, 0.6, 15], [3 * B, 0.7, 12], [3 * B + 8, 0.7, 7], [3 * B + 12, 0.7, 5],
      ]),
    ],
  },
};

// =====================================================================
// SYNTHWAVE — 100 BPM, dead straight, gated snare, driving 16th arps.
// =====================================================================
const SYNTHWAVE: Genre = {
  id: 'synthwave',
  name: 'Synthwave',
  blurb: 'Neon 80s. Machine-tight drums, big gated snare, relentless arps.',
  color: '#ff5ad0',
  bpm: 100,
  swing: 0,
  powerMul: 1.1,
  ladders: {
    riser: RISER,
    // ride — freeze sweep. Bright machine ride, dead straight like the kit. Stays
    // moderate (quarter -> 8th feel), growing by accents and one ringing open, not
    // into a 16th wall, so each hit reads as a clean slice of the freeze.
    ride: [
      d('ride', 'x...x...x...x...'),
      d('ride', 'x.x.x.x.x.x.x.x.'),
      d('ride', 'X.x.x.x.X.x.x.xO'),
      d('ride', 'X.x.x.x.X.x.x.x.', 'X.x.x.x.X.x.x.xO'),
    ],
    // reese — growling detuned monster bass. Low notes only, dead-straight rolling.
    // Sits off the kick's 0/4/8/12 downbeats (odd/offbeat steps), weighting up and
    // adding 16th rolls tier to tier while staying heavy and dark.
    reese: [
      m('reese', 1, [[2, 0.9, 0], [10, 0.85, -5]]),
      m('reese', 1, [[2, 0.9, 0], [6, 0.8, 0], [10, 0.85, -5], [14, 0.8, -5]]),
      m('reese', 2, [
        [2, 0.95, 0], [6, 0.8, 0], [10, 0.9, -5], [14, 0.8, -5],
        [B + 2, 0.95, -7], [B + 6, 0.8, -7], [B + 10, 0.9, -2], [B + 14, 0.8, -2],
      ]),
      m('reese', 2, [
        [2, 1.0, 0], [3, 0.7, 0], [6, 0.85, 0], [7, 0.65, 0], [10, 0.95, -5], [11, 0.7, -5], [14, 0.85, -5], [15, 0.65, -5],
        [B + 2, 1.0, -7], [B + 3, 0.7, -7], [B + 6, 0.85, -7], [B + 7, 0.65, -7], [B + 10, 0.95, -2], [B + 11, 0.7, -2], [B + 14, 0.85, -2], [B + 15, 0.65, -2],
      ]),
    ],
    // choir — airy 'aah' pad. Sustained and sparse: one long note per bar at first,
    // growing by STACKING voices (root, fifth, octave) into a lush held chord over a
    // four-bar move, never by adding density.
    choir: [
      m('choir', 2, [[0, 0.5, 0], [B, 0.5, 5]]),
      m('choir', 2, [[0, 0.5, 0], [0, 0.5, 7], [B, 0.5, 5], [B, 0.5, 12]]),
      m('choir', 4, [
        [0, 0.55, 0], [0, 0.5, 7], [B, 0.55, 5], [B, 0.5, 12],
        [2 * B, 0.55, 7], [2 * B, 0.5, 12], [3 * B, 0.55, 5], [3 * B, 0.5, 10],
      ]),
      m('choir', 4, [
        [0, 0.6, 0], [0, 0.55, 7], [0, 0.5, 12], [B, 0.6, 5], [B, 0.55, 12], [B, 0.5, 17],
        [2 * B, 0.6, 7], [2 * B, 0.55, 12], [2 * B, 0.5, 15], [3 * B, 0.6, 5], [3 * B, 0.55, 10], [3 * B, 0.5, 12],
      ]),
    ],
    // bell — twinkly music-box. The brightest voice, high and arpeggiated on the
    // synthwave even-step grid, sparkling quarters then 8ths then a fuller two-bar
    // line with 16th ornaments up top.
    bell: [
      m('bell', 1, [[0, 0.7, 12], [4, 0.65, 15], [8, 0.7, 19], [12, 0.65, 15]]),
      m('bell', 1, [[0, 0.7, 12], [2, 0.6, 15], [4, 0.65, 17], [6, 0.6, 15], [8, 0.7, 19], [10, 0.6, 17], [12, 0.65, 15], [14, 0.6, 12]]),
      m('bell', 2, [
        [0, 0.7, 12], [2, 0.6, 15], [4, 0.65, 17], [6, 0.6, 15], [8, 0.7, 19], [10, 0.6, 17], [12, 0.65, 15], [14, 0.6, 12],
        [B, 0.7, 15], [B + 2, 0.6, 17], [B + 4, 0.65, 19], [B + 6, 0.6, 17], [B + 8, 0.7, 22], [B + 10, 0.6, 19], [B + 12, 0.65, 17], [B + 14, 0.6, 15],
      ]),
      m('bell', 2, [
        [0, 0.75, 12], [1, 0.55, 15], [2, 0.6, 15], [4, 0.7, 17], [6, 0.6, 15], [8, 0.75, 19], [10, 0.6, 17], [12, 0.7, 15], [14, 0.6, 12], [15, 0.55, 10],
        [B, 0.75, 15], [B + 2, 0.6, 17], [B + 4, 0.7, 19], [B + 6, 0.6, 17], [B + 8, 0.75, 22], [B + 9, 0.55, 19], [B + 10, 0.6, 19], [B + 12, 0.7, 17], [B + 14, 0.6, 15],
      ]),
    ],
    // whistle — pure sung hook (one enemy tagged per hit, so it stays sparse). A
    // singable high-ish line of long notes, 1-3 per bar, growing over four bars with
    // a gentle wobble ornament, never dense.
    whistle: [
      m('whistle', 2, [[0, 0.75, 12], [B, 0.7, 10]]),
      m('whistle', 2, [[0, 0.75, 12], [8, 0.7, 10], [B, 0.75, 7], [B + 8, 0.7, 10]]),
      m('whistle', 4, [
        [0, 0.8, 12], [8, 0.7, 10], [B, 0.8, 7], [B + 8, 0.7, 10],
        [2 * B, 0.8, 15], [2 * B + 8, 0.7, 12], [3 * B, 0.8, 10], [3 * B + 8, 0.7, 7],
      ]),
      m('whistle', 4, [
        [0, 0.85, 12], [4, 0.7, 15], [8, 0.75, 10], [B, 0.85, 7], [B + 8, 0.7, 10], [B + 12, 0.65, 12],
        [2 * B, 0.85, 15], [2 * B + 8, 0.75, 12], [3 * B, 0.85, 10], [3 * B + 4, 0.7, 12], [3 * B + 8, 0.75, 7],
      ]),
    ],

    kick: [
      d('kick', 'X.......X.......'),
      d('kick', 'X...X...X...X...'),
      d('kick', 'X...X...X...X...', 'X...X...X...X..-'),
      d('kick', 'X...X...X...X...', 'X...X...X...XX.X'),
    ],
    snare: [
      d('snare', '....X.......X...'),
      d('snare', '....X.......X...'),
      d('snare', '....X.......X...', '....X.......X..o'),
      d('snare', '....X.......X...', '....X.......X.XX'),
    ],
    hat: [
      d('hat', 'x.x.x.x.x.x.x.x.'),
      d('hat', 'xxxxxxxxxxxxxxxx'),
      d('hat', 'xxxxxxxxxxxxxxxO'),
      d('hat', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxO'),
    ],
    clap: [
      d('clap', '....x.......x...'),
      d('clap', '....x.......x...'),
      d('clap', '....x.......x...', '....x.......x.o.'),
      d('clap', '....x.......x...', '....x...o...x.xx'),
    ],
    rimshot: [
      // Crisp machine-tight backbeat, accented on 2 and 4; tier 4 tightens with
      // ghosts (steps 10 and 15) across a second bar. Dead straight, no swing.
      d('rimshot', '....X.......X...'),
      d('rimshot', '....X.......X...'),
      d('rimshot', '....X.......X...', '....X.......X..-'),
      d('rimshot', '....X.......X...', '....X.....-.X.-.'),
    ],
    tom: [
      // Pulse: machine-tight straight low pattern on the offbeats, growing into
      // a driving 8th-note pulse under the kick. Dead-straight, no clutter.
      m('tom', 2, [[2, 0.65, 0], [10, 0.65, 0], [B + 2, 0.65, 0], [B + 10, 0.65, 0]]),
      m('tom', 2, [
        [2, 0.65, 0], [6, 0.6, 0], [10, 0.65, 0], [14, 0.6, 0],
        [B + 2, 0.65, -2], [B + 6, 0.6, -2], [B + 10, 0.65, -2], [B + 14, 0.6, -2],
      ]),
      m('tom', 2, [
        [2, 0.65, 0], [6, 0.6, 0], [10, 0.65, 0], [14, 0.6, 0],
        [B + 2, 0.65, -2], [B + 6, 0.6, 0], [B + 10, 0.65, -2], [B + 14, 0.6, 3],
      ]),
      m('tom', 2, [
        [2, 0.65, 0], [6, 0.6, 0], [10, 0.65, 0], [14, 0.6, 0],
        [B + 2, 0.65, -2], [B + 6, 0.6, 0], [B + 10, 0.65, -2],
        [B + 12, 0.65, 0], [B + 13, 0.7, 3], [B + 14, 0.75, 5], [B + 15, 0.8, 7],
      ]),
    ],
    cowbell: [
      m('cowbell', 1, [[4, 0.5, 0], [12, 0.5, 7]]),
      m('cowbell', 1, [[0, 0.5, 0], [4, 0.5, 7], [8, 0.5, 12], [12, 0.5, 7]]),
      m('cowbell', 2, [[0, 0.5, 0], [4, 0.5, 7], [8, 0.5, 12], [12, 0.5, 7], [B, 0.5, 5], [B + 8, 0.5, 10]]),
      m('cowbell', 2, [
        [0, 0.5, 0], [4, 0.5, 7], [8, 0.5, 12], [12, 0.5, 7],
        [B, 0.5, 5], [B + 4, 0.5, 10], [B + 8, 0.5, 15], [B + 12, 0.5, 10],
      ]),
    ],
    crash: CRASH,
    zap: ZAP,
    heartbeat: [
      d('heartbeat', '..xo............'),
      d('heartbeat', '..xo......xo....'),
      d('heartbeat', '..xo..-...xo....'),
      d('heartbeat', '..xo..-...xo....', '..xo..-...xo..o.'),
    ],
    shaker: [
      d('shaker', 'o.o.o.o.o.o.o.o.'),
      d('shaker', 'oooooooooooooooo'),
      d('shaker', 'xoooxoooxoooxooo'),
      d('shaker', 'xoxoxoxoxoxoxoxo', 'xoxoxoxoxoxoxoxx'),
    ],
    acid: [
      m('acid', 1, [[0, 0.55, 0], [4, 0.5, 7], [8, 0.55, 12], [12, 0.5, 7]]),
      m('acid', 1, [[0, 0.6, 0], [2, 0.5, 7], [4, 0.6, 12], [6, 0.5, 10], [8, 0.6, 7], [10, 0.5, 10], [12, 0.6, 3], [14, 0.5, 7]]),
      m('acid', 2, [
        [0, 0.6, 0], [2, 0.5, 7], [4, 0.6, 12], [6, 0.5, 10], [8, 0.6, 7], [10, 0.5, 10], [12, 0.6, 3], [14, 0.5, 7],
        [B, 0.6, 5], [B + 4, 0.6, 10], [B + 8, 0.6, 15], [B + 12, 0.6, 10],
      ]),
      m('acid', 2, [
        [0, 0.6, 0], [2, 0.5, 7], [4, 0.6, 12], [6, 0.5, 15], [8, 0.6, 12], [10, 0.5, 7], [12, 0.6, 3], [14, 0.5, 7],
        [B, 0.6, 5], [B + 2, 0.5, 10], [B + 4, 0.6, 15], [B + 6, 0.5, 17], [B + 8, 0.6, 15], [B + 10, 0.5, 10], [B + 12, 0.6, 5], [B + 14, 0.5, 10],
      ]),
    ],
    pluck: [
      m('pluck', 1, [[0, 0.9, 0], [4, 0.8, 0], [8, 0.85, 0], [12, 0.8, -5]]),
      m('pluck', 1, [[0, 0.9, 0], [2, 0.7, 0], [4, 0.8, 0], [6, 0.7, 0], [8, 0.85, -5], [10, 0.7, -5], [12, 0.8, 0], [14, 0.7, 0]]),
      m('pluck', 2, [
        [0, 0.9, 0], [2, 0.7, 0], [4, 0.8, 0], [8, 0.85, 0], [10, 0.7, 0], [12, 0.8, 0],
        [B, 0.9, -5], [B + 4, 0.8, -5], [B + 8, 0.85, -5], [B + 12, 0.8, -5],
      ]),
      m('pluck', 2, [
        [0, 0.9, 0], [2, 0.7, 0], [4, 0.8, 0], [6, 0.7, 0], [8, 0.85, 0], [10, 0.7, 0], [12, 0.8, 0], [14, 0.7, 0],
        [B, 0.9, -2], [B + 2, 0.7, -2], [B + 4, 0.8, -2], [B + 8, 0.85, -2], [B + 10, 0.7, -2], [B + 12, 0.8, -2],
      ]),
    ],
    rhodes: [
      m('rhodes', 2, [[0, 0.55, 3], [B, 0.55, 7]]),
      m('rhodes', 2, [[0, 0.55, 3], [8, 0.5, 7], [B, 0.55, 10], [B + 8, 0.5, 7]]),
      m('rhodes', 4, [[0, 0.55, 3], [B, 0.55, 7], [2 * B, 0.55, 10], [3 * B, 0.55, 7]]),
      m('rhodes', 4, [
        [0, 0.55, 3], [8, 0.5, 7], [B, 0.55, 7], [B + 8, 0.5, 10],
        [2 * B, 0.55, 10], [2 * B + 8, 0.5, 12], [3 * B, 0.55, 7], [3 * B + 8, 0.5, 3],
      ]),
    ],
    bass: [
      m('bass', 1, [[0, 0.9, 0], [4, 0.8, 12], [8, 0.85, 0], [12, 0.8, 12]]),
      m('bass', 1, [[0, 0.9, 0], [2, 0.7, 12], [4, 0.8, 0], [6, 0.7, 12], [8, 0.85, 0], [10, 0.7, 12], [12, 0.8, 0], [14, 0.7, 12]]),
      m('bass', 2, [
        [0, 0.9, 0], [2, 0.7, 12], [4, 0.8, 0], [6, 0.7, 12], [8, 0.85, 0], [10, 0.7, 12], [12, 0.8, 0], [14, 0.7, 12],
        [B, 0.9, -5], [B + 2, 0.7, 7], [B + 4, 0.8, -5], [B + 6, 0.7, 7], [B + 8, 0.85, -5], [B + 12, 0.8, -5],
      ]),
      m('bass', 2, [
        [0, 0.9, 0], [2, 0.7, 12], [4, 0.8, 0], [6, 0.7, 12], [8, 0.85, 0], [10, 0.7, 12], [12, 0.8, 0], [14, 0.7, 12],
        [B, 0.9, -2], [B + 2, 0.7, 10], [B + 4, 0.8, -2], [B + 6, 0.7, 10], [B + 8, 0.85, -2], [B + 10, 0.7, 10], [B + 12, 0.8, -2], [B + 14, 0.7, 10],
      ]),
    ],
    chord: [
      m('chord', 2, [[0, 0.5, 0, 'pad'], [2 * B - B, 0.5, 5, 'pad']]),
      m('chord', 2, [[0, 0.55, 0, 'pad'], [B, 0.55, 5, 'pad']]),
      m('chord', 4, [[0, 0.55, 0, 'pad'], [B, 0.55, 5, 'pad'], [2 * B, 0.55, 7, 'pad'], [3 * B, 0.55, 5, 'pad']]),
      m('chord', 4, [
        [0, 0.55, 0, 'pad'], [8, 0.55, 0, 'stab'], [B, 0.55, 5, 'pad'], [B + 8, 0.55, 5, 'stab'],
        [2 * B, 0.55, 7, 'pad'], [2 * B + 8, 0.55, 7, 'stab'], [3 * B, 0.55, 5, 'pad'], [3 * B + 8, 0.6, 0, 'stab'],
      ]),
    ],
    arp: [
      m('arp', 1, [[0, 0.6, 0], [2, 0.55, 7], [4, 0.6, 12], [6, 0.55, 7], [8, 0.6, 0], [10, 0.55, 7], [12, 0.6, 12], [14, 0.55, 7]]),
      m('arp', 1, [[0, 0.6, 0], [2, 0.55, 7], [4, 0.6, 12], [6, 0.55, 15], [8, 0.6, 12], [10, 0.55, 7], [12, 0.6, 3], [14, 0.55, 7]]),
      m('arp', 2, [
        [0, 0.6, 0], [2, 0.55, 7], [4, 0.6, 12], [6, 0.55, 15], [8, 0.6, 12], [10, 0.55, 7], [12, 0.6, 3], [14, 0.55, 7],
        [B, 0.6, 5], [B + 2, 0.55, 10], [B + 4, 0.6, 15], [B + 6, 0.55, 17], [B + 8, 0.6, 15], [B + 10, 0.55, 10], [B + 12, 0.6, 5], [B + 14, 0.55, 10],
      ]),
      m('arp', 2, [
        [0, 0.65, 0], [2, 0.55, 7], [4, 0.65, 12], [6, 0.55, 15], [8, 0.65, 12], [10, 0.55, 7], [12, 0.65, 3], [14, 0.55, 7],
        [B, 0.65, 5], [B + 2, 0.55, 10], [B + 4, 0.65, 15], [B + 6, 0.55, 19], [B + 8, 0.65, 15], [B + 10, 0.55, 10], [B + 12, 0.65, 5], [B + 14, 0.55, 10],
      ]),
    ],
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
  },
};

// =====================================================================
// HIP-HOP — 140 BPM, halftime snare, rolling trap hats, booming 808,
// a melodic keys/bell hook. Modern trap-flavored hip-hop.
// =====================================================================
const HIPHOP: Genre = {
  id: 'hiphop',
  name: 'Hip-Hop',
  blurb: 'Trap-flavored boom. Halftime snare, rolling hats, a booming 808, a melodic hook.',
  color: '#ff8c2b',
  bpm: 140,
  swing: 0.1,
  powerMul: 0.8,
  ladders: {
    riser: RISER,
    ride: [
      // Freeze sweep: a ringing ride ping that stays out of the rolling hats'
      // fast lane. Moderate quarter/8th feel, grows by offbeats and accents
      // (never a 16th wall) so each hit reads as one clean freeze slice.
      d('ride', 'o...o...o...o...'),
      d('ride', 'o.o.o.o.o.o.o.o.'),
      d('ride', 'X.o.X.o.X.o.X.o.', 'X.o.X.o.X.o.X.oo'),
      d('ride', 'X.o.X.o.X.o.X.oo', 'X.oXX.o.X.oXX.oo'),
    ],
    reese: [
      // The growling 808-monster in the bass slot: low, heavy, syncopated off
      // the kick core (0/7/10), onset pushed to step 3 off the one. Grows into
      // a rolling low monster by weight and extra low hits, never up in pitch.
      m('reese', 2, [[3, 0.95, 0], [B + 3, 0.9, -5]]),
      m('reese', 2, [[3, 0.95, 0], [6, 0.7, 0], [B + 3, 0.9, -5], [B + 14, 0.75, -2]]),
      m('reese', 4, [
        [3, 1.0, 0], [6, 0.7, 0], [14, 0.75, 0], [B + 3, 0.9, -5], [B + 6, 0.65, -5], [B + 14, 0.75, -2],
        [2 * B + 3, 1.0, 3], [2 * B + 14, 0.75, 0], [3 * B + 3, 0.9, -2], [3 * B + 8, 0.75, -5],
      ]),
      m('reese', 4, [
        [3, 1.0, 0], [6, 0.7, 0], [11, 0.7, -2], [14, 0.7, 0], [B + 3, 0.9, -5], [B + 6, 0.65, -5], [B + 11, 0.65, -7], [B + 14, 0.75, -2],
        [2 * B + 3, 1.0, 3], [2 * B + 6, 0.7, 0], [2 * B + 11, 0.65, 0], [2 * B + 14, 0.7, 0], [3 * B + 3, 0.9, -2], [3 * B + 6, 0.65, -5], [3 * B + 11, 0.65, -7],
      ]),
    ],
    choir: [
      // Airy "aah" pad in the harmony slot: sustained and sparse, one held note
      // per bar. Grows by stacking a second and third voiced note into a lush
      // chord, not by adding density.
      m('choir', 2, [[0, 0.5, 0], [B, 0.5, 7]]),
      m('choir', 2, [[0, 0.5, 0], [0, 0.45, 7], [B, 0.5, 7], [B, 0.45, 12]]),
      m('choir', 4, [
        [0, 0.5, 0], [0, 0.45, 7], [B, 0.5, 5], [B, 0.45, 12],
        [2 * B, 0.5, 7], [2 * B, 0.45, 10], [3 * B, 0.5, 3], [3 * B, 0.45, 10],
      ]),
      m('choir', 4, [
        [0, 0.5, 0], [0, 0.45, 3], [0, 0.4, 7], [B, 0.5, 5], [B, 0.45, 10], [B, 0.4, 12],
        [2 * B, 0.5, 7], [2 * B, 0.45, 10], [2 * B, 0.4, 12], [3 * B, 0.5, 3], [3 * B, 0.45, 7], [3 * B, 0.4, 10],
      ]),
    ],
    bell: [
      // Twinkly music-box hook in the melody slot: sparkly high arpeggios, the
      // brightest voice. Grows from a sparse figure into a fuller melodic run.
      m('bell', 2, [[0, 0.6, 12], [10, 0.55, 15], [B, 0.6, 10], [B + 10, 0.55, 12]]),
      m('bell', 2, [[0, 0.6, 12], [6, 0.5, 15], [10, 0.55, 17], [B, 0.6, 10], [B + 6, 0.5, 12], [B + 10, 0.55, 15]]),
      m('bell', 4, [
        [0, 0.6, 12], [6, 0.5, 15], [10, 0.55, 17], [B, 0.6, 10], [B + 6, 0.5, 15], [B + 10, 0.55, 12],
        [2 * B, 0.6, 15], [2 * B + 6, 0.5, 17], [2 * B + 10, 0.55, 19], [3 * B, 0.6, 12], [3 * B + 6, 0.5, 10], [3 * B + 10, 0.55, 7],
      ]),
      m('bell', 4, [
        [0, 0.6, 12], [4, 0.5, 15], [6, 0.5, 17], [10, 0.55, 19], [B, 0.6, 10], [B + 4, 0.5, 12], [B + 6, 0.5, 15], [B + 10, 0.55, 17],
        [2 * B, 0.6, 15], [2 * B + 4, 0.5, 17], [2 * B + 6, 0.5, 19], [2 * B + 10, 0.55, 15], [3 * B, 0.6, 12], [3 * B + 4, 0.5, 10], [3 * B + 6, 0.5, 7], [3 * B + 10, 0.55, 10],
      ]),
    ],
    whistle: [
      // Smooth sung hook in the melody slot: sparse, singable, longer notes so
      // each hit cleanly tags one enemy. High-ish and never dense; grows the
      // hook, not the note count.
      m('whistle', 2, [[0, 0.7, 12], [B, 0.7, 10]]),
      m('whistle', 2, [[0, 0.7, 12], [8, 0.6, 15], [B, 0.7, 10], [B + 8, 0.6, 7]]),
      m('whistle', 4, [
        [0, 0.7, 12], [8, 0.6, 15], [B, 0.7, 10], [2 * B, 0.7, 15], [2 * B + 8, 0.6, 12], [3 * B, 0.7, 10], [3 * B + 8, 0.6, 7],
      ]),
      m('whistle', 4, [
        [0, 0.7, 12], [6, 0.6, 15], [B, 0.7, 10], [B + 8, 0.6, 12],
        [2 * B, 0.7, 15], [2 * B + 6, 0.6, 12], [3 * B, 0.7, 10], [3 * B + 8, 0.6, 7],
      ]),
    ],

    kick: [
      d('kick', 'X.........X.....'),
      d('kick', 'X......X..X.....'),
      d('kick', 'X......X..X.....', 'X......X..X..X..'),
      d('kick', 'X......X..X.....', 'X..X...X..X.X.X.'),
    ],
    snare: [
      d('snare', '........X.......'),
      d('snare', '........X.......'),
      d('snare', '........X.......', '........X.....-x'),
      d('snare', '........X.......', '........X...-.xX'),
    ],
    hat: [
      d('hat', 'x.x.x.x.x.x.x.x.'),
      d('hat', 'xxxxxxxxxxxxxxxx'),
      d('hat', 'xxxxxxxxxxxxXXXX', 'xxxxxxxxxxxxxxxx'),
      d('hat', 'xxxxxxxxXXXXxxxx', 'xxxxXXXXxxxxXXXX'),
    ],
    clap: [
      d('clap', '........x.......'),
      d('clap', '........x.......'),
      d('clap', '........x.......', '........x......o'),
      d('clap', '........x.......', '....o...x....oxx'),
    ],
    rimshot: [
      // Halftime: the big answering tock lands on beat 3 (step 8) at low tiers,
      // then fills toward 2/4 with soft hits and ghosted syncopation by tier 4.
      // Laid-back and sparse.
      d('rimshot', '........X.......'),
      d('rimshot', '........X.......'),
      d('rimshot', '....o...X.......', '....o...X.......'),
      d('rimshot', '....o...X...o...', '....o...X..-.o-.'),
    ],
    cowbell: [
      // Motion thinned (hats own the fast layer): sparse offbeats, growing by
      // range not density — punctuation, not a wall.
      m('cowbell', 1, [[2, 0.45, 0], [10, 0.45, 7]]),
      m('cowbell', 1, [[2, 0.5, 0], [10, 0.5, 7], [14, 0.45, 10]]),
      m('cowbell', 2, [[2, 0.5, 0], [10, 0.5, 7], [B + 2, 0.5, 5], [B + 10, 0.5, 3]]),
      m('cowbell', 2, [
        [2, 0.5, 0], [10, 0.5, 7], [14, 0.45, 12],
        [B + 2, 0.5, 5], [B + 10, 0.5, 10],
      ]),
    ],
    tom: [
      // Pulse: halftime low foundation on beats 2 and 4, sparse and steady,
      // sitting in the gaps the 808 (3/5/6/8/11/14) and kick (0/7/10) leave.
      m('tom', 2, [[4, 0.6, 0], [B + 4, 0.6, 0]]),
      m('tom', 2, [[4, 0.6, 0], [12, 0.6, 0], [B + 4, 0.65, -2], [B + 12, 0.65, -2]]),
      m('tom', 2, [[4, 0.6, 0], [12, 0.6, 0], [B + 4, 0.65, -2], [B + 12, 0.65, 0], [B + 15, 0.6, 3]]),
      m('tom', 2, [[4, 0.6, 0], [12, 0.6, 0], [B + 4, 0.65, -2], [B + 12, 0.65, 0], [B + 13, 0.6, 3], [B + 14, 0.7, 5], [B + 15, 0.75, 7]]),
    ],
    crash: CRASH,
    zap: ZAP,
    heartbeat: [
      d('heartbeat', '....xo..........'),
      d('heartbeat', '....xo......xo..'),
      d('heartbeat', '..-.xo......xo..'),
      d('heartbeat', '..-.xo......xo..', '..-.xo......xo.o'),
    ],
    shaker: [
      d('shaker', '..o...o...o...o.'),
      d('shaker', 'o.o.o.o.o.o.o.o.'),
      d('shaker', 'o.oo.o.oo.o.oo.o'),
      d('shaker', 'o.oo.o.oo.o.oo.o', 'o.oo.o.oo.oooo.o'),
    ],
    acid: [
      // Motion thinned: sparse offbeat punctuation, never a wall; grows by range.
      m('acid', 1, [[6, 0.45, 0], [14, 0.45, 7]]),
      m('acid', 1, [[6, 0.5, 0], [10, 0.45, 3], [14, 0.5, 7]]),
      m('acid', 2, [[6, 0.5, 0], [14, 0.45, 7], [B + 6, 0.5, 5], [B + 14, 0.45, 10]]),
      m('acid', 2, [
        [6, 0.5, 0], [10, 0.45, 3], [14, 0.5, 7],
        [B + 6, 0.5, 5], [B + 10, 0.45, 10], [B + 14, 0.45, 12],
      ]),
    ],
    pluck: [
      // Round upright "bomp" landing BETWEEN the kick hits (kick core 0/7/10),
      // like the 808 bass — off steps 0, 7 and 10.
      m('pluck', 2, [[3, 0.95, 0], [B + 3, 0.85, -5]]),
      m('pluck', 2, [[3, 0.95, 0], [8, 0.6, 0], [B + 3, 0.85, -5], [B + 14, 0.7, -2]]),
      m('pluck', 4, [
        [3, 0.95, 0], [14, 0.6, 0], [B + 3, 0.85, -5], [B + 11, 0.6, -2],
        [2 * B + 3, 0.95, 3], [2 * B + 14, 0.6, 0], [3 * B + 3, 0.85, -2], [3 * B + 8, 0.6, -5],
      ]),
      m('pluck', 4, [
        [3, 0.95, 0], [6, 0.6, 0], [14, 0.6, -2], [B + 5, 0.85, -5], [B + 8, 0.6, -2], [B + 11, 0.6, -5],
        [2 * B + 3, 0.95, 3], [2 * B + 6, 0.6, 0], [2 * B + 14, 0.6, 0],
        [3 * B + 5, 0.85, -2], [3 * B + 8, 0.6, -5], [3 * B + 11, 0.6, -7],
      ]),
    ],
    rhodes: [
      m('rhodes', 2, [[8, 0.55, 3], [B + 8, 0.5, 7]]),
      m('rhodes', 2, [[4, 0.5, 3], [8, 0.55, 7], [B + 4, 0.5, 10], [B + 8, 0.5, 5]]),
      m('rhodes', 2, [[4, 0.5, 3], [8, 0.55, 7], [12, 0.45, 10], [B + 4, 0.5, 5], [B + 8, 0.55, 3]]),
      m('rhodes', 4, [
        [4, 0.5, 3], [8, 0.55, 7], [B + 4, 0.5, 10], [B + 8, 0.5, 5],
        [2 * B + 4, 0.5, 7], [2 * B + 8, 0.55, 10], [3 * B + 4, 0.5, 5], [3 * B + 8, 0.5, 3],
      ]),
    ],
    bass: [
      // Booming 808: long, low, syncopated notes landing BETWEEN the kick hits
      // (kick core 0/7/10), never on them. Onset pushed to step 3, off the one.
      m('bass', 2, [[3, 1.0, 0], [B + 3, 0.9, -5]]),
      m('bass', 2, [[3, 1.0, 0], [6, 0.7, 0], [B + 3, 0.9, -5], [B + 14, 0.8, -2]]),
      m('bass', 4, [
        [3, 1.0, 0], [14, 0.7, 0], [B + 3, 0.9, -5], [B + 14, 0.8, -2],
        [2 * B + 3, 1.0, 3], [2 * B + 14, 0.7, 0], [3 * B + 3, 0.9, -2], [3 * B + 8, 0.8, -5],
      ]),
      m('bass', 4, [
        [3, 1.0, 0], [6, 0.7, 0], [14, 0.7, -2], [B + 5, 0.9, -5], [B + 8, 0.8, -2], [B + 11, 0.7, -5],
        [2 * B + 3, 1.0, 3], [2 * B + 6, 0.7, 0], [2 * B + 14, 0.7, 0],
        [3 * B + 5, 0.9, -2], [3 * B + 8, 0.7, -5], [3 * B + 11, 0.7, -7],
      ]),
    ],
    chord: [
      m('chord', 2, [[4, 0.6, 0, 'stab'], [B + 12, 0.55, 5, 'stab']]),
      m('chord', 2, [[0, 0.5, 0, 'pad'], [4, 0.65, 0, 'stab'], [B + 4, 0.6, 5, 'stab'], [B + 12, 0.55, 7, 'stab']]),
      m('chord', 2, [
        [0, 0.5, 0, 'pad'], [4, 0.65, 0, 'stab'], [10, 0.4, 0, 'stab'],
        [B, 0.5, 5, 'pad'], [B + 4, 0.6, 5, 'stab'], [B + 12, 0.55, 7, 'stab'],
      ]),
      m('chord', 4, [
        [0, 0.5, 0, 'pad'], [4, 0.65, 0, 'stab'], [B + 4, 0.6, 5, 'stab'],
        [2 * B, 0.5, 7, 'pad'], [2 * B + 4, 0.6, 7, 'stab'], [3 * B + 4, 0.6, 5, 'stab'], [3 * B + 12, 0.6, 0, 'stab'],
      ]),
    ],
    arp: [
      // Motion thinned: sparse syncopated punctuation, not a 16th-note wall.
      // Tiers grow via range and a second bar, never by filling every step.
      m('arp', 1, [[0, 0.5, 0], [6, 0.45, 3], [10, 0.5, 7]]),
      m('arp', 1, [[0, 0.55, 0], [6, 0.45, 3], [10, 0.5, 7], [14, 0.45, 10]]),
      m('arp', 2, [
        [0, 0.55, 0], [6, 0.45, 3], [10, 0.5, 7],
        [B, 0.55, 5], [B + 6, 0.45, 10], [B + 10, 0.5, 12],
      ]),
      m('arp', 2, [
        [0, 0.55, 0], [6, 0.45, 3], [10, 0.5, 7], [14, 0.45, 12],
        [B, 0.55, 5], [B + 6, 0.45, 10], [B + 10, 0.5, 15], [B + 14, 0.45, 7],
      ]),
    ],
    lead: [
      m('lead', 2, [[0, 0.8, 7], [8, 0.7, 5], [B, 0.8, 3]]),
      m('lead', 2, [[0, 0.8, 7], [4, 0.65, 5], [8, 0.7, 3], [B, 0.8, 5], [B + 8, 0.7, 0]]),
      m('lead', 4, [
        [0, 0.8, 7], [4, 0.65, 5], [8, 0.7, 3], [B, 0.8, 5], [B + 8, 0.7, 0],
        [2 * B, 0.8, 3], [2 * B + 6, 0.65, 5], [2 * B + 8, 0.75, 7], [3 * B, 0.8, 10], [3 * B + 8, 0.7, 7], [3 * B + 12, 0.75, 5],
      ]),
      m('lead', 4, [
        [0, 0.8, 7], [4, 0.65, 5], [8, 0.7, 3], [12, 0.6, 10], [B, 0.8, 5], [B + 8, 0.7, 0], [B + 14, 0.6, 3],
        [2 * B, 0.8, 3], [2 * B + 6, 0.65, 5], [2 * B + 8, 0.75, 7], [2 * B + 12, 0.6, 12], [3 * B, 0.8, 10], [3 * B + 8, 0.7, 7], [3 * B + 12, 0.75, 5], [3 * B + 14, 0.65, 3],
      ]),
    ],
  },
};

// =====================================================================
// DRUM & BASS — 174 BPM, two-step break, rolling sub, fast melody.
// =====================================================================
const DNB: Genre = {
  id: 'dnb',
  name: 'Drum & Bass',
  blurb: 'Breakneck two-step at 174. A rolling sub and a fast, sharp break.',
  color: '#4dffc3',
  bpm: 174,
  swing: 0,
  powerMul: 0.66,
  ladders: {
    riser: RISER,
    ride: [
      // Freeze sweep: a bright ride ping that rings. At 174 it stays moderate
      // (quarter/8th feel, never the 16th wall the hat already owns) so each
      // freeze lands as a readable slice. Grows by offbeats then accents.
      d('ride', 'o...o...o...o...'),
      d('ride', 'o.o.o.o.o.o.o.o.'),
      d('ride', 'x.o.x.o.x.o.x.o.'),
      d('ride', 'x.o.x.o.x.o.x.o.', 'x.o.x.o.x.o.x.oO'),
    ],
    reese: [
      // The DnB monster: a thick growling sub that rolls. LOW notes only, sits
      // on the root with the kick on the one, then rolls off it (stays clear of
      // the second kick at step 10). Even steps only (8th cap at 174); grows
      // from sparse weight into the signature busy roll.
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
    choir: [
      // Airy 'aah' pad: sustained and sparse, one held note per half-phrase.
      // Mid range. Grows by voicing (stacking a second, then third note at the
      // same onset) into a lush held chord, not by adding rhythm. Even steps.
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
    bell: [
      // Twinkly music-box: the brightest voice, high sparkly arpeggios. Even
      // steps only at 174. Grows from a few pings into a fuller arpeggiated line
      // across the phrase, staying up in the high register.
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
    whistle: [
      // Smooth sung hook: each hit tags one enemy, so it stays SPARSE (1-3
      // notes per bar, longer notes, high-ish). Even steps only at 174. Grows
      // into a fuller singable line across the phrase, never dense.
      m('whistle', 2, [[0, 0.7, 7], [B + 8, 0.65, 10]]),
      m('whistle', 2, [[0, 0.7, 7], [8, 0.65, 10], [B, 0.7, 12], [B + 8, 0.65, 7]]),
      m('whistle', 4, [
        [0, 0.7, 7], [8, 0.65, 10],
        [B, 0.7, 12], [B + 8, 0.65, 10],
        [2 * B, 0.7, 10], [2 * B + 8, 0.65, 12],
        [3 * B, 0.7, 7], [3 * B + 8, 0.65, 10],
      ]),
      m('whistle', 4, [
        [0, 0.7, 7], [8, 0.65, 10], [12, 0.6, 12],
        [B, 0.7, 12], [B + 8, 0.65, 10],
        [2 * B, 0.7, 15], [2 * B + 8, 0.65, 12], [2 * B + 12, 0.6, 10],
        [3 * B, 0.7, 12], [3 * B + 8, 0.65, 7],
      ]),
    ],

    kick: [
      d('kick', 'X.........X.....'),
      d('kick', 'X.........X.....'),
      d('kick', 'X.........X.....', 'X.......X.X.....'),
      d('kick', 'X.........X.....', 'X.....X.X.X....X'),
    ],
    snare: [
      d('snare', '....X.......X...'),
      d('snare', '....X.......X...'),
      d('snare', '....X...-...X..-', '....X..-....X.-.'),
      d('snare', '....X...-...X..-', '....X..-.-..X.-x'),
    ],
    hat: [
      d('hat', 'x.x.x.x.x.x.x.x.'),
      d('hat', 'xoxoxoxoxoxoxoxo'),
      d('hat', 'xoxoxoxOxoxoxoxO'),
      d('hat', 'xoxoxoxOxoxoxoxO', 'xoxoxOxoxoxoxXxO'),
    ],
    clap: [
      d('clap', '....x.......x...'),
      d('clap', '....x.......x...'),
      d('clap', '....x.......x...', '....x......ox...'),
      d('clap', '....x.......x...', '....x.....o.x.xx'),
    ],
    rimshot: [
      // Classic break: the rim answers on beats 2 and 4 (steps 4, 12). At 174,
      // hits and ghosts stay on EVEN (8th) steps only — odd 16ths read as an
      // error tone. Grows with even-step ghosts across a second bar.
      d('rimshot', '....X.......X...'),
      d('rimshot', '....X.......X...'),
      d('rimshot', '....X.......X...', '....X.....-.X...'),
      d('rimshot', '....X...-...X...', '....X.-.-...X.-.'),
    ],
    tom: [
      // Pulse: steady low pulse anchored on beat 3, EVEN steps only (8th-note
      // grid max — odd 16th spacing reads as an error tone at 174 BPM).
      m('tom', 2, [[8, 0.6, 0], [B + 8, 0.6, 0]]),
      m('tom', 2, [[8, 0.6, 0], [14, 0.6, 0], [B + 8, 0.65, -2], [B + 14, 0.6, 0]]),
      m('tom', 2, [[2, 0.55, 0], [8, 0.6, 0], [14, 0.6, 0], [B + 2, 0.55, 0], [B + 8, 0.65, -2], [B + 14, 0.6, 3]]),
      m('tom', 2, [[2, 0.55, 0], [8, 0.6, 0], [14, 0.6, 0], [B + 2, 0.55, 0], [B + 8, 0.65, -2], [B + 10, 0.6, 0], [B + 14, 0.7, 3]]),
    ],
    cowbell: [
      // Motion thinned + capped at 8th notes (even steps only): 16ths read as
      // an error tone at 174. Tiers grow by range, staying on the 8th grid.
      m('cowbell', 1, [[0, 0.5, 7], [8, 0.5, 12]]),
      m('cowbell', 1, [[0, 0.5, 7], [4, 0.45, 10], [8, 0.5, 12], [12, 0.45, 7]]),
      m('cowbell', 2, [[0, 0.5, 7], [4, 0.45, 10], [8, 0.5, 12], [12, 0.45, 7], [B, 0.5, 5], [B + 8, 0.5, 10]]),
      m('cowbell', 2, [
        [0, 0.5, 7], [4, 0.45, 12], [8, 0.5, 15], [12, 0.45, 10],
        [B, 0.5, 10], [B + 4, 0.45, 7], [B + 8, 0.5, 12], [B + 12, 0.45, 15],
      ]),
    ],
    crash: CRASH,
    zap: ZAP,
    heartbeat: [
      d('heartbeat', '........x.o.....'),
      d('heartbeat', 'x.o.....x.o.....'),
      d('heartbeat', 'x.o...o.x.o.....'),
      d('heartbeat', 'x.o...o.x.o.....', 'x.o...o.x.o...o.'),
    ],
    shaker: [
      // Capped at 8th notes (even steps only): a 16th shaker reads as an error
      // tone at 174. Grows by density then accents, staying on the 8th grid.
      d('shaker', 'o...o...o...o...'),
      d('shaker', 'o.o.o.o.o.o.o.o.'),
      d('shaker', 'x.o.x.o.x.o.x.o.'),
      d('shaker', 'x.o.x.o.x.o.x.o.', 'x.o.x.o.x.o.x.O.'),
    ],
    acid: [
      // Motion thinned + capped at 8th notes (even steps only): sparse
      // punctuation, growing by range, never a 16th wall (error tone at 174).
      m('acid', 1, [[8, 0.5, 0], [14, 0.45, 7]]),
      m('acid', 1, [[0, 0.5, 0], [8, 0.5, 7], [14, 0.45, 10]]),
      m('acid', 2, [[0, 0.5, 0], [8, 0.5, 7], [14, 0.45, 10], [B, 0.5, 5], [B + 8, 0.5, 10]]),
      m('acid', 2, [
        [0, 0.5, 0], [6, 0.45, 3], [8, 0.5, 7], [14, 0.45, 12],
        [B, 0.5, 5], [B + 6, 0.45, 10], [B + 8, 0.5, 15], [B + 14, 0.45, 7],
      ]),
    ],
    pluck: [
      // Rolling sub "bomp", even steps only at 174. Grows across the phrase.
      m('pluck', 4, [[0, 1.0, 0], [2 * B, 0.95, -5]]),
      m('pluck', 4, [[0, 1.0, 0], [B + 8, 0.7, 0], [2 * B, 0.95, -5], [3 * B + 8, 0.7, -5]]),
      m('pluck', 4, [
        [0, 1.0, 0], [10, 0.6, 0], [B + 8, 0.7, 0], [2 * B, 0.95, -5], [2 * B + 10, 0.6, -5], [3 * B + 8, 0.7, -2],
      ]),
      m('pluck', 4, [
        [0, 1.0, 0], [6, 0.6, 0], [10, 0.6, -2], [B, 0.8, 0], [B + 8, 0.7, 3], [B + 14, 0.6, 0],
        [2 * B, 0.95, -5], [2 * B + 8, 0.7, -5], [2 * B + 14, 0.6, -2], [3 * B, 0.9, -2], [3 * B + 8, 0.7, -5], [3 * B + 14, 0.6, -7],
      ]),
    ],
    rhodes: [
      m('rhodes', 4, [[0, 0.55, 3], [2 * B, 0.5, 7]]),
      m('rhodes', 4, [[0, 0.55, 3], [B, 0.5, 7], [2 * B, 0.55, 10], [3 * B, 0.5, 7]]),
      m('rhodes', 4, [
        [0, 0.55, 3], [8, 0.5, 7], [B, 0.5, 10], [2 * B, 0.55, 7], [2 * B + 8, 0.5, 10], [3 * B, 0.5, 5],
      ]),
      m('rhodes', 4, [
        [0, 0.55, 3], [8, 0.5, 7], [B, 0.5, 10], [B + 8, 0.5, 7],
        [2 * B, 0.55, 10], [2 * B + 8, 0.5, 12], [3 * B, 0.5, 7], [3 * B + 8, 0.5, 3],
      ]),
    ],
    bass: [
      m('bass', 4, [[0, 1.0, 0], [2 * B, 0.95, -5]]),
      m('bass', 4, [[0, 1.0, 0], [B + 8, 0.7, 0], [2 * B, 0.95, -5], [3 * B + 8, 0.7, -5]]),
      m('bass', 4, [
        [0, 1.0, 0], [10, 0.6, 0], [B + 8, 0.7, 0], [2 * B, 0.95, -5], [2 * B + 10, 0.6, -5], [3 * B + 8, 0.7, -2],
      ]),
      m('bass', 4, [
        [0, 1.0, 0], [6, 0.6, 0], [10, 0.6, -2], [B, 0.8, 0], [B + 8, 0.7, 3], [B + 14, 0.6, 0],
        [2 * B, 0.95, -5], [2 * B + 8, 0.7, -5], [2 * B + 14, 0.6, -2], [3 * B, 0.9, -2], [3 * B + 8, 0.7, -5], [3 * B + 14, 0.6, -7],
      ]),
    ],
    chord: [
      m('chord', 4, [[0, 0.5, 0, 'pad'], [2 * B, 0.5, 7, 'pad']]),
      m('chord', 4, [[0, 0.55, 0, 'pad'], [2 * B, 0.55, 7, 'pad']]),
      m('chord', 4, [[0, 0.55, 0, 'pad'], [B, 0.5, 0, 'stab'], [2 * B, 0.55, 7, 'pad'], [3 * B, 0.5, 5, 'stab']]),
      m('chord', 4, [
        [0, 0.55, 0, 'pad'], [8, 0.5, 0, 'stab'], [B, 0.5, 0, 'stab'],
        [2 * B, 0.55, 7, 'pad'], [2 * B + 8, 0.5, 7, 'stab'], [3 * B, 0.55, 5, 'pad'], [3 * B + 8, 0.5, 0, 'stab'],
      ]),
    ],
    arp: [
      // Motion thinned + capped at 8th notes (even steps only): the fast break
      // owns the ticking layer, so this stays sparse quarter-ish punctuation
      // and grows by range, never into a full 8th-note wall (a 16th wall reads
      // as an error tone at 174).
      m('arp', 1, [[0, 0.55, 0], [4, 0.5, 7], [8, 0.55, 12], [12, 0.5, 7]]),
      m('arp', 1, [[0, 0.6, 0], [4, 0.5, 7], [8, 0.6, 12], [12, 0.5, 15]]),
      m('arp', 2, [
        [0, 0.6, 0], [4, 0.5, 7], [8, 0.6, 12], [12, 0.5, 7],
        [B, 0.6, 5], [B + 4, 0.5, 10], [B + 8, 0.6, 15], [B + 12, 0.5, 10],
      ]),
      m('arp', 2, [
        [0, 0.6, 0], [4, 0.5, 7], [6, 0.5, 12], [8, 0.6, 15], [12, 0.5, 10],
        [B, 0.6, 5], [B + 4, 0.5, 10], [B + 6, 0.5, 15], [B + 8, 0.6, 17], [B + 12, 0.5, 12],
      ]),
    ],
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
  },
};

// =====================================================================
// TECHNO — 130 BPM, relentless four-on-floor, offbeat hats, dark stabs.
// =====================================================================
const TECHNO: Genre = {
  id: 'techno',
  name: 'Techno',
  blurb: 'Hypnotic warehouse pulse. Four-on-floor, offbeat hats, dark stabs.',
  color: '#8a8f9e',
  bpm: 130,
  swing: 0,
  powerMul: 0.86,
  ladders: {
    riser: RISER,
    // Ride: freeze-sweep in the hats slot. Warehouse ride ping that rides the
    // pulse. Moderate by design (quarter -> 8th feel, never a 16th wall);
    // grows by accenting beats then opening the offbeats into bright rings.
    ride: [
      d('ride', 'o...o...o...o...'),
      d('ride', 'o.o.o.o.o.o.o.o.'),
      d('ride', 'x.o.x.o.x.o.x.o.'),
      d('ride', 'x.O.x.O.x.O.x.O.', 'x.O.x.O.x.O.x.OX'),
    ],
    // Reese: growling low monster in the bass slot. Sits on the offbeats
    // (2/6/10/14) to stay clear of the four-on-floor kick; grows by weight and
    // a short roll pickup, not by climbing. Low notes only (0, -5, -2, -7).
    reese: [
      m('reese', 1, [[2, 0.85, 0], [10, 0.85, 0]]),
      m('reese', 1, [[2, 0.9, 0], [6, 0.8, 0], [10, 0.9, -5], [14, 0.8, -5]]),
      m('reese', 2, [
        [2, 0.9, 0], [6, 0.8, 0], [10, 0.9, -5], [14, 0.8, -5],
        [B + 2, 0.9, 0], [B + 6, 0.8, 0], [B + 10, 0.9, -2], [B + 14, 0.8, -7],
      ]),
      m('reese', 2, [
        [2, 1.0, 0], [6, 0.85, 0], [10, 0.95, -5], [13, 0.6, -5], [14, 0.85, -5],
        [B + 2, 1.0, 0], [B + 6, 0.85, 0], [B + 10, 0.95, -2], [B + 14, 0.85, -7],
      ]),
    ],
    // Choir: airy held 'aah' pad in the harmony slot. Sustained and sparse,
    // one attack per bar at tier 1; grows by stacking voices into a fuller
    // chord (not by adding notes), with a lush mid-bar shift at tier 4.
    choir: [
      m('choir', 2, [[0, 0.5, 0], [B, 0.5, 7]]),
      m('choir', 2, [[0, 0.5, 0], [0, 0.45, 7], [B, 0.5, 7], [B, 0.45, 12]]),
      m('choir', 2, [
        [0, 0.55, 0], [0, 0.5, 7], [0, 0.45, 10],
        [B, 0.55, 3], [B, 0.5, 10], [B, 0.45, 12],
      ]),
      m('choir', 2, [
        [0, 0.6, 0], [0, 0.55, 7], [0, 0.5, 10],
        [8, 0.45, 5], [8, 0.4, 12],
        [B, 0.6, 3], [B, 0.55, 10], [B, 0.5, 12],
        [B + 8, 0.45, 7], [B + 8, 0.4, 15],
      ]),
    ],
    // Bell: twinkly music-box ping in the melody slot. Bright and high, but
    // kept short and repetitive (techno melody stays a looping figure, never a
    // tune). High notes only (12, 15, 17, 19); grows into a fuller arpeggio.
    bell: [
      m('bell', 1, [[0, 0.55, 12], [8, 0.5, 15]]),
      m('bell', 1, [[0, 0.55, 12], [4, 0.5, 15], [8, 0.55, 12], [12, 0.5, 15]]),
      m('bell', 1, [[0, 0.55, 12], [4, 0.5, 15], [8, 0.55, 17], [10, 0.5, 15], [12, 0.55, 12], [14, 0.5, 15]]),
      m('bell', 2, [
        [0, 0.55, 12], [4, 0.5, 15], [8, 0.55, 17], [10, 0.5, 15], [12, 0.55, 12], [14, 0.5, 15],
        [B, 0.55, 12], [B + 4, 0.5, 15], [B + 8, 0.55, 19], [B + 10, 0.5, 17], [B + 12, 0.55, 15], [B + 14, 0.5, 12],
      ]),
    ],
    // Whistle: pure smooth sung hook in the melody slot. Sparse by mandate
    // (each note tags one enemy) — 1-3 long, high-ish notes per bar (7, 10,
    // 12, 15), a singable loop that grows a touch without getting dense.
    whistle: [
      m('whistle', 2, [[0, 0.6, 7], [B, 0.6, 10]]),
      m('whistle', 2, [[0, 0.6, 7], [8, 0.55, 10], [B, 0.6, 12], [B + 8, 0.55, 10]]),
      m('whistle', 2, [[0, 0.6, 7], [6, 0.55, 10], [B, 0.6, 12], [B + 6, 0.55, 10], [B + 12, 0.55, 7]]),
      m('whistle', 2, [
        [0, 0.65, 7], [6, 0.55, 10], [12, 0.55, 12],
        [B, 0.65, 15], [B + 6, 0.55, 12], [B + 12, 0.55, 10],
      ]),
    ],

    kick: [
      d('kick', 'X...X...X...X...'),
      d('kick', 'X...X...X...X...'),
      d('kick', 'X...X...X...X...', 'X...X...X...X..-'),
      d('kick', 'X...X...X...X...', 'X...X...X...XX.-'),
    ],
    snare: [
      d('snare', '............x...'),
      d('snare', '....o.......x...'),
      d('snare', '....o.......x...', '....o.......x..o'),
      d('snare', '....o.......x...', '....o.......x.xx'),
    ],
    hat: [
      d('hat', '..O...O...O...O.'),
      d('hat', 'x.O.x.O.x.O.x.O.'),
      d('hat', 'xxO.xxO.xxO.xxO.'),
      d('hat', 'xxOxxxOxxxOxxxOx'),
    ],
    clap: [
      d('clap', '............x...'),
      d('clap', '............x...'),
      d('clap', '....o.......x...', '....o.......x...'),
      d('clap', '....o.......x...', '....o.......x.oo'),
    ],
    rimshot: [
      // Steady, hypnotic backbeat on 2 and 4; tier 3 adds an offbeat ghost
      // pickup (step 10), tier 4 a second bar with another offbeat ghost (14).
      // Repetitive by design.
      d('rimshot', '....x.......x...'),
      d('rimshot', '....x.......x...'),
      d('rimshot', '....x.....-.x...'),
      d('rimshot', '....x.....-.x...', '....x.....-.x.-.'),
    ],
    tom: [
      m('tom', 2, [[B + 4, 0.65, 0], [B + 12, 0.65, 0]]),
      m('tom', 2, [[4, 0.6, 0], [12, 0.6, 0], [B + 4, 0.65, -2], [B + 12, 0.65, -2]]),
      m('tom', 2, [[4, 0.6, 0], [12, 0.6, 0], [B + 4, 0.65, -2], [B + 12, 0.65, 0], [B + 14, 0.6, 3]]),
      m('tom', 2, [[4, 0.6, 0], [12, 0.6, 0], [B + 4, 0.65, -2], [B + 12, 0.65, 0], [B + 13, 0.6, 3], [B + 14, 0.7, 5], [B + 15, 0.75, 7]]),
    ],
    cowbell: [
      m('cowbell', 1, [[2, 0.5, 0], [6, 0.5, 0], [10, 0.5, 0], [14, 0.5, 0]]),
      m('cowbell', 1, [[2, 0.5, 0], [6, 0.5, 7], [10, 0.5, 0], [14, 0.5, 7]]),
      m('cowbell', 2, [[2, 0.5, 0], [6, 0.5, 7], [10, 0.5, 0], [14, 0.5, 7], [B + 2, 0.5, 3], [B + 6, 0.5, 10], [B + 10, 0.5, 3], [B + 14, 0.5, 10]]),
      m('cowbell', 2, [
        [2, 0.5, 0], [6, 0.5, 7], [10, 0.5, 0], [14, 0.5, 7],
        [B + 2, 0.5, 3], [B + 6, 0.5, 10], [B + 10, 0.5, 5], [B + 14, 0.5, 12],
      ]),
    ],
    crash: CRASH,
    zap: ZAP,
    heartbeat: [
      d('heartbeat', '..xo............'),
      d('heartbeat', '..xo......xo....'),
      d('heartbeat', '..xo..o...xo....'),
      d('heartbeat', '..xo..o...xo....', '..xo..o...xo..o.'),
    ],
    shaker: [
      d('shaker', 'o.o.o.o.o.o.o.o.'),
      d('shaker', 'oooooooooooooooo'),
      d('shaker', 'xoooxoooxoooxooo'),
      d('shaker', 'xoooxoooxoooxooo', 'xoooxoooxoooxoox'),
    ],
    acid: [
      // Short, repetitive, hypnotic: a narrow-range squelch that loops, never a
      // tune-y line (a melodic techno acid would read as a genre bug).
      m('acid', 1, [[0, 0.5, 0], [6, 0.5, 0], [10, 0.5, 3], [14, 0.5, 0]]),
      m('acid', 1, [[0, 0.55, 0], [3, 0.45, 0], [6, 0.5, 3], [10, 0.55, 0], [14, 0.45, 3]]),
      m('acid', 1, [[0, 0.55, 0], [2, 0.45, 0], [6, 0.5, 3], [8, 0.5, 0], [10, 0.55, 3], [14, 0.45, 0]]),
      m('acid', 2, [
        [0, 0.55, 0], [3, 0.45, 0], [6, 0.5, 3], [10, 0.55, 0], [14, 0.45, 3],
        [B, 0.55, 0], [B + 3, 0.45, 0], [B + 6, 0.5, 3], [B + 10, 0.55, 5], [B + 14, 0.45, 3],
      ]),
    ],
    pluck: [
      m('pluck', 1, [[2, 0.9, 0], [6, 0.85, 0], [10, 0.9, 0], [14, 0.85, 0]]),
      m('pluck', 1, [[2, 0.9, 0], [6, 0.85, 0], [10, 0.9, -5], [14, 0.85, -5]]),
      m('pluck', 2, [
        [2, 0.9, 0], [6, 0.85, 0], [10, 0.9, 0], [14, 0.85, 0],
        [B + 2, 0.9, -5], [B + 6, 0.85, -5], [B + 10, 0.9, -2], [B + 14, 0.85, -2],
      ]),
      m('pluck', 2, [
        [2, 0.9, 0], [5, 0.7, 0], [6, 0.85, 0], [10, 0.9, 0], [13, 0.7, 0], [14, 0.85, 0],
        [B + 2, 0.9, -5], [B + 6, 0.85, -5], [B + 10, 0.9, -2], [B + 14, 0.85, -2],
      ]),
    ],
    rhodes: [
      m('rhodes', 2, [[2, 0.55, 3], [B + 10, 0.5, 7]]),
      m('rhodes', 2, [[2, 0.6, 3], [10, 0.5, 3], [B + 2, 0.55, 5], [B + 10, 0.5, 7]]),
      m('rhodes', 2, [
        [2, 0.6, 3], [6, 0.5, 3], [10, 0.55, 3], [B + 2, 0.6, 5], [B + 6, 0.5, 5], [B + 10, 0.55, 7],
      ]),
      m('rhodes', 2, [
        [0, 0.45, 3], [2, 0.6, 3], [6, 0.5, 3], [10, 0.55, 3], [14, 0.5, 3],
        [B, 0.45, 7], [B + 2, 0.6, 7], [B + 10, 0.55, 5],
      ]),
    ],
    bass: [
      m('bass', 1, [[2, 0.9, 0], [6, 0.85, 0], [10, 0.9, 0], [14, 0.85, 0]]),
      m('bass', 1, [[2, 0.9, 0], [6, 0.85, 0], [10, 0.9, -5], [14, 0.85, -5]]),
      m('bass', 2, [
        [2, 0.9, 0], [6, 0.85, 0], [10, 0.9, 0], [14, 0.85, 0],
        [B + 2, 0.9, -5], [B + 6, 0.85, -5], [B + 10, 0.9, -2], [B + 14, 0.85, -2],
      ]),
      m('bass', 2, [
        [2, 0.9, 0], [5, 0.7, 0], [6, 0.85, 0], [10, 0.9, 0], [13, 0.7, 0], [14, 0.85, 0],
        [B + 2, 0.9, -5], [B + 6, 0.85, -5], [B + 10, 0.9, -2], [B + 13, 0.7, -2], [B + 14, 0.85, -2],
      ]),
    ],
    chord: [
      m('chord', 2, [[2, 0.6, 0, 'stab'], [B + 10, 0.55, 5, 'stab']]),
      m('chord', 2, [[2, 0.65, 0, 'stab'], [10, 0.55, 0, 'stab'], [B + 2, 0.6, 5, 'stab'], [B + 10, 0.55, 7, 'stab']]),
      m('chord', 2, [
        [2, 0.65, 0, 'stab'], [6, 0.5, 0, 'stab'], [10, 0.55, 0, 'stab'],
        [B + 2, 0.6, 5, 'stab'], [B + 6, 0.5, 5, 'stab'], [B + 10, 0.55, 7, 'stab'],
      ]),
      m('chord', 2, [
        [0, 0.45, 0, 'pad'], [2, 0.65, 0, 'stab'], [6, 0.5, 0, 'stab'], [10, 0.55, 0, 'stab'], [14, 0.5, 0, 'stab'],
        [B, 0.45, 7, 'pad'], [B + 2, 0.6, 7, 'stab'], [B + 10, 0.55, 5, 'stab'],
      ]),
    ],
    arp: [
      m('arp', 1, [[0, 0.5, 0], [4, 0.5, 3], [8, 0.5, 7], [12, 0.5, 10]]),
      m('arp', 1, [[0, 0.55, 0], [2, 0.45, 3], [4, 0.5, 7], [6, 0.45, 10], [8, 0.55, 7], [10, 0.45, 3], [12, 0.5, 0], [14, 0.45, 3]]),
      m('arp', 1, [[0, 0.55, 0], [2, 0.5, 3], [4, 0.55, 7], [6, 0.5, 10], [8, 0.55, 12], [10, 0.5, 10], [12, 0.55, 7], [14, 0.5, 3]]),
      m('arp', 2, [
        [0, 0.55, 0], [2, 0.5, 3], [4, 0.55, 7], [6, 0.5, 10], [8, 0.55, 12], [10, 0.5, 10], [12, 0.55, 7], [14, 0.5, 3],
        [B, 0.55, 5], [B + 2, 0.5, 7], [B + 4, 0.55, 10], [B + 6, 0.5, 12], [B + 8, 0.55, 15], [B + 10, 0.5, 12], [B + 12, 0.55, 7], [B + 14, 0.5, 5],
      ]),
    ],
    lead: [
      m('lead', 2, [[0, 0.7, 0], [8, 0.65, 7], [B + 8, 0.7, 5]]),
      m('lead', 2, [[0, 0.7, 0], [4, 0.6, 3], [8, 0.65, 7], [B, 0.7, 10], [B + 8, 0.65, 7]]),
      m('lead', 4, [
        [0, 0.7, 0], [8, 0.65, 7], [B, 0.7, 10], [B + 8, 0.65, 7],
        [2 * B, 0.7, 3], [2 * B + 8, 0.65, 10], [3 * B, 0.7, 12], [3 * B + 8, 0.65, 10],
      ]),
      m('lead', 4, [
        [0, 0.7, 0], [4, 0.55, 3], [8, 0.65, 7], [B, 0.7, 10], [B + 8, 0.65, 7], [B + 12, 0.55, 12],
        [2 * B, 0.7, 3], [2 * B + 8, 0.65, 10], [3 * B, 0.7, 12], [3 * B + 8, 0.65, 10], [3 * B + 12, 0.7, 7],
      ]),
    ],
  },
};

export const GENRES: Genre[] = [LOFI, HOUSE, SYNTHWAVE, HIPHOP, DNB, TECHNO];

export const GENRE_BY_ID: Record<GenreId, Genre> = Object.fromEntries(
  GENRES.map((g) => [g.id, g]),
) as Record<GenreId, Genre>;

/** The genre selected before one is chosen (engine construction, headless). */
export const DEFAULT_GENRE: GenreId = 'house';

// Guard every genre's ladders at build time: a bad shipped chart is a build
// error, not a runtime surprise, and every genre must cover all twelve weapons.
for (const genre of GENRES) {
  for (const role of ROLES) {
    const ladder = genre.ladders[role];
    if (!ladder || ladder.length !== TIER_COUNT) {
      throw new Error(`${genre.id}: ${role} ladder must have ${TIER_COUNT} tiers`);
    }
    for (const chart of ladder) {
      if (chart.role !== role) {
        throw new Error(`${genre.id}: ${role} ladder holds a ${chart.role} chart`);
      }
      validateChart(chart);
    }
  }
}
