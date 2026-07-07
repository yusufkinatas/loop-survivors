// Lo-Fi's one track: slow swung boom-bap (84 BPM, swing 0.34). A lazy dusty
// pocket — kick on 1 with soft syncopated answers, a fat backbeat on 2 and 4,
// swung hats, a warm walking upright bass, and the harmony out front (mellow
// Rhodes comping, warm chord pads, a lush choir wash) with the odd bell twinkle.
//
// Eleven supported roles, four growing tiers each. The FX and Motion slots are
// dropped (nothing clinical or aggressive belongs here); the genre leans on its
// Harmony (Rhodes/chord/choir) and warm Bass. Low voices stay in the low octaves
// (bass/pluck rendered at rootHz/2), bright voices stay high (bell an octave up).
// Kick and bass never share a step's sub: the kick owns ~50 Hz, the bass sits an
// octave above it.

import type { Chart } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';

export const LOFI_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse — soft round kick. '1' accented, syncopated soft answers on the
  // off-eighths; tier 4 adds a soft ('-') ghost pickup into the loop.
  kick: [
    d('kick', 'X.......o.......'),
    d('kick', 'X.....o.o.......'),
    d('kick', 'X.....o.o.o.....'),
    d('kick', 'X.....o.o.o...-.'),
  ],

  // Backbeat — dusty snare on 2 and 4, growing ghost notes for the boom-bap
  // pocket.
  snare: [
    d('snare', '....X.......X...'),
    d('snare', '....X.......X..-'),
    d('snare', '....X..-....X..-'),
    d('snare', '....X..-....X.o-'),
  ],

  // Backbeat alt — woody cross-stick answering the same 2-and-4, softer and
  // drier than the snare, filling more off-counts as it climbs.
  rimshot: [
    d('rimshot', '....o.......o...'),
    d('rimshot', '....o.......o..o'),
    d('rimshot', '....o..o....o..o'),
    d('rimshot', '....o..o..o.o..o'),
  ],

  // Hats — soft swung ticks, from lazy quarters up to full 16ths with ghosts;
  // an open hat ('O') lifts the last off-beat.
  hat: [
    d('hat', 'o...o...o...o...'),
    d('hat', 'o.o.o.o.o.o.o.o.'),
    d('hat', 'o.o-o.o-o.o-o.oO'),
    d('hat', 'o-o-o-o-o-o-o-oO'),
  ],

  // Hats alt — warm shaker texture, densifying from quarters to steady 16ths.
  shaker: [
    d('shaker', 'o...o...o...o...'),
    d('shaker', 'o.o.o.o.o.o.o.o.'),
    d('shaker', 'o-o.o-o.o-o.o-o.'),
    d('shaker', 'o-o-o-o-o-o-o-o-'),
  ],

  // Bass — warm upright, root on the downbeat then a lazy pentatonic walk in the
  // low octave (0, -2, +3, -5). Tier 4 stretches to four bars and drops to the
  // 'fat' variant on the strong roots.
  bass: [
    m('bass', 2, [[0, 1.0, 0], [B, 0.9, -2]]),
    m('bass', 2, [[0, 1.0, 0], [10, 0.6, 3], [B, 0.9, -2], [B + 8, 0.6, -5]]),
    m('bass', 2, [[0, 1.0, 0], [6, 0.55, 0], [10, 0.6, 3], [B, 0.9, -2], [B + 8, 0.7, -5], [B + 12, 0.6, 0]]),
    m('bass', 4, [
      [0, 1.0, 0, 'fat'], [10, 0.6, 3], [B, 0.9, -2], [B + 8, 0.7, -5],
      [2 * B, 1.0, 0, 'fat'], [2 * B + 6, 0.55, 3], [2 * B + 10, 0.6, 0],
      [3 * B, 0.9, -2], [3 * B + 8, 0.7, -5], [3 * B + 12, 0.6, 0],
    ]),
  ],

  // Bass alt — plucked upright walking a touch busier, same low octave.
  pluck: [
    m('pluck', 2, [[0, 1.0, 0], [B, 0.9, -2], [B + 8, 0.6, 3]]),
    m('pluck', 2, [[0, 1.0, 0], [8, 0.6, -5], [B, 0.9, -2], [B + 8, 0.6, 3]]),
    m('pluck', 2, [[0, 1.0, 0], [6, 0.5, 3], [8, 0.6, -5], [B, 0.9, -2], [B + 8, 0.6, 3], [B + 12, 0.5, 0]]),
    m('pluck', 4, [
      [0, 1.0, 0], [8, 0.6, -5], [B, 0.9, -2], [B + 8, 0.6, 3],
      [2 * B, 1.0, 0], [2 * B + 6, 0.5, 3], [2 * B + 10, 0.6, -5],
      [3 * B, 0.9, -2], [3 * B + 8, 0.6, 3], [3 * B + 12, 0.5, 0],
    ]),
  ],

  // Harmony centrepiece — mellow Rhodes comping soft chords (stacked notes on a
  // step). Two voicings alternate: a min7 shell [0,7,10] and a lift [5,12,15].
  // More chords land per phrase as it grows.
  rhodes: [
    m('rhodes', 2, [
      [0, 0.6, 0], [0, 0.55, 7], [0, 0.5, 10],
      [B, 0.6, 0], [B, 0.55, 7], [B, 0.5, 10],
    ]),
    m('rhodes', 2, [
      [0, 0.6, 0], [0, 0.55, 7], [0, 0.5, 10],
      [10, 0.5, 5], [10, 0.45, 12], [10, 0.4, 15],
      [B, 0.6, 0], [B, 0.55, 7], [B, 0.5, 10],
    ]),
    m('rhodes', 2, [
      [0, 0.6, 0], [0, 0.55, 7], [0, 0.5, 10],
      [10, 0.5, 5], [10, 0.45, 12], [10, 0.4, 15],
      [B, 0.6, 0], [B, 0.55, 7], [B, 0.5, 10],
      [B + 10, 0.5, 5], [B + 10, 0.45, 12], [B + 10, 0.4, 15],
    ]),
    m('rhodes', 4, [
      [0, 0.6, 0], [0, 0.55, 7], [0, 0.5, 10],
      [10, 0.5, 5], [10, 0.45, 12], [10, 0.4, 15],
      [B, 0.6, 0], [B, 0.55, 7], [B, 0.5, 10],
      [2 * B, 0.6, 0], [2 * B, 0.55, 7], [2 * B, 0.5, 10],
      [2 * B + 10, 0.5, 5], [2 * B + 10, 0.45, 12], [2 * B + 10, 0.4, 15],
      [3 * B, 0.6, 0], [3 * B, 0.55, 7], [3 * B, 0.5, 10],
    ]),
  ],

  // Harmony — warm chord pads (held) with soft stabs filling in. Chord roots are
  // restricted to 0/5/7; the sample carries the quartal voicing.
  chord: [
    m('chord', 2, [[0, 0.6, 0, 'pad']]),
    m('chord', 2, [[0, 0.6, 0, 'pad'], [B, 0.55, 7, 'pad']]),
    m('chord', 2, [[0, 0.6, 0, 'pad'], [8, 0.5, 5, 'stab'], [B, 0.55, 7, 'pad'], [B + 8, 0.5, 0, 'stab']]),
    m('chord', 4, [
      [0, 0.6, 0, 'pad'], [8, 0.5, 5, 'stab'], [B, 0.55, 7, 'pad'], [B + 8, 0.5, 0, 'stab'],
      [2 * B, 0.6, 5, 'pad'], [2 * B + 8, 0.5, 0, 'stab'], [3 * B, 0.55, 7, 'pad'],
    ]),
  ],

  // Harmony — lush choir wash, one long held pad at a time (choke), evolving up
  // the pentatonic across the phrase.
  choir: [
    m('choir', 2, [[0, 0.5, 0]]),
    m('choir', 2, [[0, 0.5, 0], [B, 0.45, 7]]),
    m('choir', 4, [[0, 0.5, 0], [B, 0.45, 7], [2 * B, 0.5, 3]]),
    m('choir', 4, [[0, 0.5, 0], [B, 0.45, 7], [2 * B, 0.5, 3], [3 * B, 0.45, 10]]),
  ],

  // Melody — mellow bell twinkle up high, a sparse pentatonic figure that fills
  // into a little four-bar melody at the top tier.
  bell: [
    m('bell', 2, [[0, 0.5, 7], [B + 8, 0.45, 3]]),
    m('bell', 2, [[0, 0.5, 7], [8, 0.4, 10], [B, 0.45, 3], [B + 8, 0.4, 0]]),
    m('bell', 2, [[0, 0.5, 12], [4, 0.4, 10], [8, 0.4, 7], [12, 0.4, 3], [B, 0.45, 7], [B + 8, 0.4, 3]]),
    m('bell', 4, [
      [0, 0.5, 12], [4, 0.4, 10], [8, 0.4, 7], [12, 0.4, 3],
      [B, 0.45, 7], [B + 6, 0.4, 10], [B + 10, 0.4, 3],
      [2 * B, 0.5, 15], [2 * B + 8, 0.4, 10],
      [3 * B, 0.45, 7], [3 * B + 8, 0.4, 3],
    ]),
  ],
};
