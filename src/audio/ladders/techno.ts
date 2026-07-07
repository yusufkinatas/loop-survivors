// Techno track — one four-tier ladder per supported role, 130 BPM, no swing.
// The feel is a relentless hypnotic warehouse loop: an unbroken four-on-floor
// kick, open hats on the offbeat, a driving offbeat bass that dodges the kick's
// sub, a dark repetitive acid squelch and cold stab motion, and a sparse lead
// hook. Tiers grow by density and weight, never by wandering — techno stays a
// loop, so growth thickens the groove rather than turning it into a tune.
//
// Supported set matches src/audio/kits/techno.ts exactly (12 roles):
//   kick, clap, rimshot, hat, ride, acid, crash, riser, bass, reese, chord, lead.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { CRASH, RISER } from './shared';

export const TECHNO_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse — the relentless four-on-floor. Always on every beat; growth is a
  // soft ghost pickup ('-' = the soft kick variant) and a second-bar double.
  kick: [
    d('kick', 'X...X...X...X...'),
    d('kick', 'X...X...X...X..-'),
    d('kick', 'X...X...X...X..-', 'X...X...X...XX.-'),
    d('kick', 'X...X...X...X..-', 'X...X...X..-XX.o'),
  ],

  // Backbeat — the clap on beats 2 and 4 (the warehouse hand-clap). Sparse to
  // start (beat 4 only), then the full backbeat, then pickups.
  clap: [
    d('clap', '............x...'),
    d('clap', '....x.......x...'),
    d('clap', '....x.......x...', '....x.......x..o'),
    d('clap', '....x.......x...', '....x.....o.x.oo'),
  ],

  // Backbeat (alt) — a dry mechanical tick on the offbeats (the 'and' of each
  // beat). Hypnotic and metronomic; grows by filling ghosts between the ticks.
  rimshot: [
    d('rimshot', '..o...o...o...o.'),
    d('rimshot', '..x...x...x...x.'),
    d('rimshot', '..x.-.x.-.x.-.x.'),
    d('rimshot', '..x.-.x.-.x.-.x.', '..x.-.x.-.x.--x.'),
  ],

  // Hats — the signature. Open hats on the offbeat 'tss'; closed 16ths fill in
  // as it grows into a driving wall with open accents.
  hat: [
    d('hat', '..O...O...O...O.'),
    d('hat', 'x.O.x.O.x.O.x.O.'),
    d('hat', 'xxO.xxO.xxO.xxO.'),
    d('hat', 'xxOxxxOxxxOxxxOx', 'xxOxxxOxxxOxxxOO'),
  ],

  // Hats (alt) — the ride/freeze sweep. Rides the pulse from quarters up to an
  // offbeat 8th feel with bright open rings; moderate by design, never a wall.
  ride: [
    d('ride', 'o...o...o...o...'),
    d('ride', 'o.o.o.o.o.o.o.o.'),
    d('ride', 'x.o.x.o.x.o.x.o.'),
    d('ride', 'x.O.x.O.x.O.x.O.', 'x.O.x.O.x.O.x.OX'),
  ],

  // Motion — the dark 303 acid squelch. A short, narrow-range figure that loops
  // hypnotically; grows in density, not melodically. Notes stay in {0,3,5}.
  acid: [
    m('acid', 1, [[0, 0.6, 0], [6, 0.5, 0], [10, 0.55, 3], [14, 0.5, 0]]),
    m('acid', 1, [[0, 0.6, 0], [3, 0.5, 0], [6, 0.55, 3], [10, 0.6, 0], [14, 0.5, 3]]),
    m('acid', 1, [[0, 0.6, 0], [2, 0.5, 0], [4, 0.45, 3], [6, 0.55, 0], [8, 0.5, 3], [10, 0.6, 0], [14, 0.5, 3]]),
    m('acid', 2, [
      [0, 0.6, 0], [2, 0.5, 0], [4, 0.45, 3], [6, 0.55, 0], [8, 0.5, 3], [10, 0.6, 0], [14, 0.5, 3],
      [B, 0.6, 0], [B + 2, 0.5, 0], [B + 4, 0.45, 3], [B + 6, 0.55, 5], [B + 8, 0.5, 3], [B + 10, 0.6, 0], [B + 14, 0.5, 5],
    ]),
  ],

  // FX — phrase-level shockwave accents and the auto-dash wind-up (shared).
  crash: CRASH,
  riser: RISER,

  // Bass — the driving low. Sits on the offbeats (2/6/10/14) to leave the
  // downbeat kick its sub. Grows into fatter weight; tier 4 lands a once-per-
  // phrase 'sub' drop on an offbeat (never on the downbeat kick). Low notes only.
  bass: [
    m('bass', 1, [[2, 0.9, 0], [6, 0.85, 0], [10, 0.9, 0], [14, 0.85, 0]]),
    m('bass', 1, [[2, 0.9, 0], [6, 0.85, 0], [10, 0.9, -5], [13, 0.6, -5], [14, 0.85, -5]]),
    m('bass', 2, [
      [2, 0.9, 0, 'fat'], [6, 0.85, 0], [10, 0.9, -5, 'fat'], [14, 0.85, -5],
      [B + 2, 0.9, 0, 'fat'], [B + 6, 0.85, 0], [B + 10, 0.9, -2, 'fat'], [B + 14, 0.85, -7],
    ]),
    m('bass', 2, [
      [2, 1.0, 0, 'sub'], [6, 0.85, 0, 'fat'], [10, 0.9, -5, 'fat'], [13, 0.7, -5], [14, 0.85, -5, 'fat'],
      [B + 2, 0.95, 0, 'fat'], [B + 6, 0.85, 0], [B + 10, 0.9, -2, 'fat'], [B + 13, 0.7, -2], [B + 14, 0.85, -7, 'fat'],
    ]),
  ],

  // Bass (alt) — the dark growling rumble, also on the offbeats. Grows by weight
  // and a short roll pickup, not by climbing. Low notes only (0, -5, -2, -7).
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

  // Harmony — dark minimal stabs on the offbeats (chord roots {0,5,7} only).
  // Repetitive by mandate; tier 4 lays a held 'pad' drone under the stabs.
  chord: [
    m('chord', 2, [[2, 0.6, 0, 'stab'], [B + 10, 0.55, 5, 'stab']]),
    m('chord', 2, [[2, 0.65, 0, 'stab'], [10, 0.55, 0, 'stab'], [B + 2, 0.6, 5, 'stab'], [B + 10, 0.55, 7, 'stab']]),
    m('chord', 2, [
      [2, 0.65, 0, 'stab'], [6, 0.5, 0, 'stab'], [10, 0.55, 0, 'stab'],
      [B + 2, 0.6, 5, 'stab'], [B + 6, 0.5, 5, 'stab'], [B + 10, 0.55, 7, 'stab'],
    ]),
    m('chord', 2, [
      [0, 0.4, 0, 'pad'], [2, 0.65, 0, 'stab'], [6, 0.5, 0, 'stab'], [10, 0.55, 0, 'stab'], [14, 0.5, 0, 'stab'],
      [B, 0.4, 7, 'pad'], [B + 2, 0.6, 7, 'stab'], [B + 6, 0.5, 7, 'stab'], [B + 10, 0.55, 5, 'stab'],
    ]),
  ],

  // Melody — a sparse dark hook. A few long high notes that loop; grows into a
  // two- then four-bar figure without getting dense. High notes only.
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
};
