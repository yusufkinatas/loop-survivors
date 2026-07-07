// Hip-Hop — one track: trap-flavored boom at a 140 BPM halftime feel.
//
// The groove is halftime: the snare/clap lands on beat 3 (step 8) so at 140 BPM
// it reads as a heavy, spacious ~70 BPM backbeat. The kick is tight and
// syncopated; the booming, gliding 808 (bass) owns the sub and moves in the
// kick's gaps so the two never mud up. The hi-hats do the trademark rolling
// trap thing — accented 8ths with ghosted 16ths between (the 'x-' pairs), then
// bursts of straight 16ths reading as rolls, and open hats to cap phrases. The
// melodic top is dark and sparse: trap bells, a plucky lead, and the breathy
// trap flute (whistle), over dim filtered chords and a brooding choir wash.
// Reese is the grimier low-end alternative to the clean 808.
//
// Every note is minor-pentatonic (offsets ≡ 0,3,5,7,10 mod 12); chord roots are
// 0/5/7 only. Low voices (bass, reese) stay in low octaves; bright voices
// (bell, lead, whistle) stay high. Tiers 1→4 always grow.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { CRASH, RISER } from './shared';

export const HIPHOP_LADDERS: Partial<Record<Role, Chart[]>> = {
  // ── Pulse: tight syncopated trap kick, boom on 1 with pickups. Grows into a
  // two-bar phrase with a rolling end fill. Stays out of the 808's sustain.
  kick: [
    d('kick', 'X.....X.........'),
    d('kick', 'X.....X...X.....'),
    d('kick', 'X.....X...X.....', 'X.....X...X...X.'),
    d('kick', 'X.....X...X.....', 'X.....X...X.X.XX'),
  ],

  // ── Backbeat: halftime snare on beat 3 (step 8). Grows a ghost pickup, then a
  // roll into the downbeat, then a full trap snare-roll fill.
  snare: [
    d('snare', '........X.......'),
    d('snare', '........X......-'),
    d('snare', '........X.......', '........X.....xx'),
    d('snare', '........X.......', '........X...xxxX'),
  ],

  // ── Backbeat alt: clap, also on beat 3, growing into layered clap rolls.
  clap: [
    d('clap', '........X.......'),
    d('clap', '........X.....o.'),
    d('clap', '........X.......', '........X...o.x.'),
    d('clap', '........X.......', '........X.o.x.xX'),
  ],

  // ── Backbeat alt: rimshot, sharp syncopated hits that grow into the
  // accelerating cross-stick roll that ends a trap phrase.
  rimshot: [
    d('rimshot', '......x.......x.'),
    d('rimshot', '......x...x...x.'),
    d('rimshot', '......x...x...x.', '......x...x...xx'),
    d('rimshot', '......x...x...x.', 'x.x.x.x.xxxxxxxx'),
  ],

  // ── Hats: the rolling trap hi-hat. 8ths, then accented 8ths with ghosted
  // 16ths between them, then rolls (16th bursts) and open-hat caps.
  hat: [
    d('hat', 'x.x.x.x.x.x.x.x.'),
    d('hat', 'x-x-x-x-x-x-x-x-'),
    d('hat', 'x-x-x-x-x-x-x-xx', 'x-x-x-x-x-x-xxxO'),
    d('hat', 'x-x-xxxxx-x-x-x-', 'x-x-x-x-xxxxxxxO'),
  ],

  // ── Hats alt: shaker texture filling the tick lane, growing by weight.
  shaker: [
    d('shaker', 'o.o.o.o.o.o.o.o.'),
    d('shaker', 'oooooooooooooooo'),
    d('shaker', 'xoooxoooxoooxooo', 'xoooxoooxoooxoox'),
    d('shaker', 'xooxoooxxooxooox', 'xooxoooxxooxooxx'),
  ],

  // ── Bass: THE 808. Booming and sparse, gliding between low roots in the
  // kick's gaps. 'fat' (distorted) hits weight the accents from tier 3; the
  // tier-4 phrase opens with the deep 'sub' drop. Notes stay in low octaves.
  bass: [
    m('bass', 2, [[0, 1.0, 0], [B + 8, 0.9, -5]]),
    m('bass', 2, [[0, 1.0, 0], [10, 0.85, -5], [B, 1.0, -7], [B + 8, 0.9, -2]]),
    m('bass', 2, [
      [0, 1.0, 0, 'fat'], [6, 0.8, 0], [10, 0.85, -5],
      [B, 1.0, -7, 'fat'], [B + 8, 0.9, -2], [B + 12, 0.8, -5],
    ]),
    m('bass', 4, [
      [0, 1.0, 0, 'sub'], [6, 0.8, 0], [10, 0.85, -5],
      [B, 1.0, -7, 'fat'], [B + 8, 0.9, -2], [B + 12, 0.8, -5],
      [2 * B, 1.0, 0, 'fat'], [2 * B + 6, 0.8, 3], [2 * B + 10, 0.85, -5],
      [3 * B, 1.0, -7, 'fat'], [3 * B + 8, 0.9, -2], [3 * B + 12, 0.8, 0],
    ]),
  ],

  // ── Bass slot alt: Reese, the grimier low-end monster. Sparse heavy hits off
  // the kick, low notes only, growing by weight and movement.
  reese: [
    m('reese', 2, [[8, 0.9, 0], [B + 8, 0.85, -5]]),
    m('reese', 2, [[8, 0.9, 0], [14, 0.75, -7], [B + 8, 0.85, -5], [B + 14, 0.75, -2]]),
    m('reese', 2, [
      [6, 0.8, 0], [8, 0.9, 0], [14, 0.75, -7],
      [B + 6, 0.8, -5], [B + 8, 0.9, -5], [B + 14, 0.75, -2],
    ]),
    m('reese', 2, [
      [2, 0.7, 0], [6, 0.8, 0], [8, 0.95, 0], [14, 0.75, -7],
      [B + 2, 0.7, -7], [B + 6, 0.8, -5], [B + 8, 0.9, -5], [B + 14, 0.75, -2], [B + 15, 0.7, -12],
    ]),
  ],

  // ── Harmony: dark filtered chords. A held pad and chord change, growing
  // stabs on the backbeat and a fuller four-bar move. Roots 0/5/7 only.
  chord: [
    m('chord', 2, [[0, 0.5, 0, 'pad'], [B, 0.5, 5, 'pad']]),
    m('chord', 2, [[0, 0.5, 0, 'pad'], [8, 0.6, 0, 'stab'], [B, 0.5, 5, 'pad'], [B + 8, 0.6, 7, 'stab']]),
    m('chord', 2, [
      [0, 0.5, 0, 'pad'], [8, 0.6, 0, 'stab'], [12, 0.55, 0, 'stab'],
      [B, 0.5, 5, 'pad'], [B + 8, 0.6, 7, 'stab'], [B + 12, 0.55, 5, 'stab'],
    ]),
    m('chord', 4, [
      [0, 0.5, 0, 'pad'], [8, 0.6, 0, 'stab'],
      [B, 0.5, 5, 'pad'], [B + 8, 0.6, 5, 'stab'],
      [2 * B, 0.5, 7, 'pad'], [2 * B + 8, 0.6, 7, 'stab'], [2 * B + 12, 0.55, 7, 'stab'],
      [3 * B, 0.5, 0, 'pad'], [3 * B + 8, 0.6, 0, 'stab'], [3 * B + 12, 0.55, 0, 'stab'],
    ]),
  ],

  // ── Harmony alt: brooding choir wash. Held and sparse, growing by STACKING
  // voices (root, fifth, octave) into a dim chord, not by adding onsets.
  choir: [
    m('choir', 2, [[0, 0.5, 0], [B, 0.5, 3]]),
    m('choir', 2, [[0, 0.5, 0], [0, 0.45, 7], [B, 0.5, 3], [B, 0.45, 10]]),
    m('choir', 4, [
      [0, 0.5, 0], [0, 0.45, 7], [B, 0.5, 3], [B, 0.45, 10],
      [2 * B, 0.5, 5], [2 * B, 0.45, 12], [3 * B, 0.5, 0], [3 * B, 0.45, 7],
    ]),
    m('choir', 4, [
      [0, 0.55, 0], [0, 0.5, 7], [0, 0.45, 12], [B, 0.55, 3], [B, 0.5, 10], [B, 0.45, 15],
      [2 * B, 0.55, 5], [2 * B, 0.5, 12], [3 * B, 0.55, 0], [3 * B, 0.5, 7], [3 * B, 0.45, 12],
    ]),
  ],

  // ── Melody: the trap bell hook. Sparse high sparkle growing into a fuller
  // four-bar arpeggiated line. Bright high notes only.
  bell: [
    m('bell', 2, [[0, 0.6, 12], [8, 0.55, 15], [B + 4, 0.6, 19]]),
    m('bell', 2, [[0, 0.6, 12], [6, 0.5, 15], [8, 0.55, 17], [B, 0.6, 15], [B + 8, 0.55, 19], [B + 12, 0.5, 15]]),
    m('bell', 2, [
      [0, 0.6, 12], [4, 0.5, 15], [8, 0.55, 17], [12, 0.5, 15],
      [B, 0.6, 19], [B + 6, 0.5, 17], [B + 8, 0.55, 22], [B + 12, 0.5, 19],
    ]),
    m('bell', 4, [
      [0, 0.6, 12], [4, 0.5, 15], [8, 0.55, 17], [12, 0.5, 15],
      [B, 0.6, 19], [B + 6, 0.5, 17], [B + 8, 0.55, 15], [B + 12, 0.5, 12],
      [2 * B, 0.6, 15], [2 * B + 4, 0.5, 17], [2 * B + 8, 0.55, 19], [2 * B + 12, 0.5, 22],
      [3 * B, 0.6, 19], [3 * B + 6, 0.5, 17], [3 * B + 8, 0.55, 15], [3 * B + 12, 0.5, 12],
    ]),
  ],

  // ── Melody alt: plucky trap lead. A mid-high line that grows over four bars.
  lead: [
    m('lead', 2, [[0, 0.7, 0], [8, 0.65, 7], [B, 0.7, 5]]),
    m('lead', 2, [[0, 0.7, 0], [6, 0.6, 3], [8, 0.65, 7], [B, 0.7, 5], [B + 8, 0.65, 3]]),
    m('lead', 4, [
      [0, 0.7, 0], [6, 0.6, 3], [8, 0.65, 7], [B, 0.7, 5], [B + 8, 0.65, 3],
      [2 * B, 0.7, 7], [2 * B + 8, 0.65, 10], [3 * B, 0.7, 12], [3 * B + 8, 0.65, 7],
    ]),
    m('lead', 4, [
      [0, 0.7, 0], [4, 0.6, 3], [8, 0.65, 7], [12, 0.55, 5],
      [B, 0.7, 5], [B + 8, 0.65, 3], [B + 12, 0.55, 7],
      [2 * B, 0.7, 7], [2 * B + 6, 0.6, 10], [2 * B + 8, 0.65, 12],
      [3 * B, 0.7, 10], [3 * B + 8, 0.65, 7], [3 * B + 12, 0.6, 5],
    ]),
  ],

  // ── Melody alt: the trap flute (whistle). One hit tags one enemy, so it stays
  // SPARSE — a singable high hook of long notes, 1-3 per bar, growing over four.
  whistle: [
    m('whistle', 2, [[0, 0.7, 7], [B, 0.65, 10]]),
    m('whistle', 2, [[0, 0.7, 7], [8, 0.6, 10], [B, 0.65, 12], [B + 8, 0.6, 10]]),
    m('whistle', 2, [
      [0, 0.7, 7], [8, 0.6, 10],
      [B, 0.65, 12], [B + 6, 0.6, 15], [B + 10, 0.6, 12],
    ]),
    m('whistle', 4, [
      [0, 0.75, 7], [8, 0.65, 10], [B, 0.75, 12], [B + 8, 0.65, 10],
      [2 * B, 0.75, 15], [2 * B + 8, 0.65, 12], [3 * B, 0.75, 10], [3 * B + 8, 0.65, 7],
    ]),
  ],

  // ── FX: crash (shockwave) and riser (auto-dash wind-up) read the same across
  // genres — tempo carries them. Trap leans on both for transitions/buildups.
  crash: CRASH,
  riser: RISER,
};
