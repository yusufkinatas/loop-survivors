// "Losing It" — FISHER (2018). 125 BPM tech house in G with an Ab "rub"
// (a note one half-step above the root that keeps grinding against it — that
// rub IS the hook's tension) and a Bb accent. Note set {0, 1, 3} = G, Ab, Bb.
//
// Transcription provenance (research dossier, July 2026):
// - CONFIRMED: 125 BPM; the G/Ab/Bb pitch set (three independent sources);
//   four-on-the-floor kick; the drop being radically sparse (6-8 elements,
//   no chords, no pads).
// - PROBABLE: clap on beat 2 only (NOT the usual 2-and-4 — one detailed
//   deconstruction is explicit about this); closed hats on the off-beat 8ths
//   in a 4-bar loop, dropping the last hat of bar 4; a ride cymbal joining
//   only in the fourth drop.
// - INFERRED: the exact step placement of the wobble-bass tab, the rimshot
//   figures, and the chant rhythm ("I'm(0) lo(4)-sing(6) it(8)"). Kept simple
//   and idiomatic per the dossier's own warning.
//
// Sparseness is the identity here: these ladders deliberately stay thinner
// than the house ones. Tiers grow by velocity, sample variants, and the
// dossier's own answer bars — never by inventing notes the record doesn't
// have. The record's pitch slides (the bass "talking") don't exist in a
// one-shot engine; charts fake them by rotating the bass's three filter
// colors (bass/fat/sub = three "wah" vowel shapes) across the phrase.

import type { Chart, ChartEvent } from '../charts';
import type { Role } from '../kits';
import { B, d, m } from '../groove';
import { CRASH, RISER } from './shared';

// The closed off-beat hats, dossier verbatim: hits on the "and"s (steps
// 2/6/10/14 — halfway between the kick's beats), and the last hat of bar 4
// dropped so the 4-bar loop audibly "turns over".
const HAT_LOOP = [
  '..x...x...x...x.',
  '..x...x...x...x.',
  '..x...x...x...x.',
  '..x...x...x.....',
];
const hatTier3 = d('hat', ...HAT_LOOP);
// Tier 4 = the fourth drop: the same closed hats plus a ride cymbal (a big
// washy cymbal played like a steady pulse) on every beat, charted as the kit's
// extra 'ride' variant. On-beat ride + off-beat hats = a continuous 8th tick.
const hatTier4: Chart = {
  ...hatTier3,
  events: [
    ...hatTier3.events,
    ...Array.from({ length: 16 }, (_, i): ChartEvent => ({ step: i * 4, velocity: 0.5, variant: 'ride' })),
  ],
};

export const LOSINGIT_LADDERS: Partial<Record<Role, Chart[]>> = {
  // Pulse: four-on-the-floor at full velocity, dossier CONFIRMED. Placement
  // never changes across tiers; growth is soft ghost pickups ('-' = the soft
  // kick variant) at the phrase tail — the final build's 8th/16th flavor.
  kick: [
    d('kick', 'X...X...X...X...'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X...',
      'X...X...X...X...', 'X...X...X...X..-'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X..-',
      'X...X...X...X...', 'X...X...X...X.--'),
    d('kick',
      'X...X...X...X...', 'X...X...X...X..-',
      'X...X...X...X...', 'X...X...X..-X.--'),
  ],
  // Backbeat: the dry clap sits on beat 2 ONLY (step 4) — the deconstruction
  // is explicit that it is not the usual 2-and-4. Growth materializes the
  // dossier's two-bar variant: a beat-4 answer in the second bar.
  clap: [
    d('clap', '....X...........'),
    d('clap', '....X...........', '....X.......-...'),
    d('clap', '....X...........', '....X.......o...'),
    d('clap', '....X...........', '....X.......x...'),
  ],
  // Hats: closed off-beat 8ths, muted-feeling and steady; tier 4 adds the
  // fourth drop's ride layer (see above). Tiers 1-2 thin the same loop out.
  hat: [
    d('hat', '..x.......x.....'),
    d('hat', '..x...o...x...o.'),
    hatTier3,
    hatTier4,
  ],
  // Hats rival: the rimshot (a click off the drum's metal rim) plays the
  // dossier's drops-only 16th figures. Placement INFERRED; growth = the
  // answering second bar and, at tier 4, ghost off-beats and a two-hit roll
  // pulling the loop around.
  shaker: [
    d('shaker', '......o..o......'),
    d('shaker', '......x..o....o.'),
    d('shaker', '......x..o....o.', '......x..o..o.x.'),
    d('shaker', '..-...x..o..o.x.', '..-...x..o..oxx.'),
  ],
  // Backbeat rival: the build's snare roll, compressed into the phrase tail.
  // A roll = the same drum hit repeatedly, faster and louder, to wind tension
  // up; the dossier's velocity ramp is 0.3 -> 1.0. Growth = the roll starting
  // earlier and doubling from 8ths to 16ths.
  snare: [
    d('snare',
      '................', '................',
      '................', '............o.x.'),
    d('snare',
      '................', '................',
      '................', '........-.o.x.X.'),
    d('snare',
      '................', '................',
      '............-.-.', '........--ooxxXX'),
    d('snare',
      '................', '................',
      '........-.-.o.o.', '----ooooxxxxXXXX'),
  ],
  // FX: phrase-top crash and the auto-dash riser, shared voicings (the
  // dossier's reverse-crash-into-the-drop and white-noise builds map onto
  // the shared shapes cleanly).
  crash: CRASH,
  riser: RISER,
  // Bass: THE talking wobble — the entire identity of the track. Always off
  // the kick (never on steps 0/4/8/12), pitch set G/Ab/Bb dossier-CONFIRMED,
  // step placement INFERRED. Tier 1 = off-beat-only G; tier 2 adds the bar-2
  // answer (the Bb/Ab/G turn); tiers 3-4 open the full 4-bar tab and rotate
  // the three filter colors ('bass' = the up-"wa", 'fat' = the wide open
  // "waaah" on accents and holds, 'sub' = the closed dark growl between) to
  // fake the record's per-note filter movement. Bar 4's Ab slide down to G
  // becomes an Ab accent decaying through two soft G's.
  bass: [
    m('bass', 1, [[2, 0.9, 0], [6, 0.8, 0], [10, 0.9, 0], [14, 0.8, 0]]),
    m('bass', 2, [
      [2, 0.9, 0], [6, 0.8, 0], [10, 0.9, 0], [14, 0.8, 0],
      [B + 2, 0.9, 0], [B + 6, 0.8, 0], [B + 8, 1.0, 3], [B + 10, 0.9, 1], [B + 12, 1.0, 0],
    ]),
    m('bass', 4, [
      [2, 0.9, 0, 'bass'], [6, 0.8, 0, 'sub'], [10, 0.9, 0, 'bass'], [14, 0.8, 0, 'sub'],
      [B + 2, 0.9, 0, 'bass'], [B + 6, 0.8, 0, 'sub'], [B + 8, 1.0, 3, 'fat'], [B + 10, 0.9, 1, 'bass'], [B + 12, 1.0, 0, 'fat'],
      [2 * B + 2, 0.9, 0, 'bass'], [2 * B + 6, 0.8, 0, 'sub'], [2 * B + 10, 0.9, 0, 'bass'], [2 * B + 14, 0.8, 0, 'sub'],
      [3 * B + 2, 0.9, 0, 'bass'], [3 * B + 6, 0.8, 0, 'sub'], [3 * B + 8, 1.0, 1, 'fat'], [3 * B + 12, 0.8, 0, 'sub'],
    ]),
    m('bass', 4, [
      [2, 0.9, 0, 'bass'], [6, 0.8, 0, 'sub'], [10, 0.9, 0, 'fat'], [14, 0.8, 0, 'sub'],
      [B + 2, 0.9, 0, 'bass'], [B + 6, 0.8, 0, 'sub'], [B + 8, 1.0, 3, 'fat'], [B + 10, 0.9, 1, 'bass'], [B + 12, 1.0, 0, 'fat'],
      [2 * B + 2, 0.9, 0, 'bass'], [2 * B + 6, 0.8, 0, 'sub'], [2 * B + 10, 0.9, 0, 'fat'], [2 * B + 14, 0.8, 0, 'sub'],
      // The talking phrase: Ab accent, then the fake slide down to G.
      [3 * B + 2, 0.9, 0, 'bass'], [3 * B + 6, 0.8, 0, 'sub'], [3 * B + 8, 1.0, 1, 'fat'],
      [3 * B + 10, 0.7, 0, 'bass'], [3 * B + 12, 0.6, 0, 'sub'],
    ]),
  ],
  // Motion: the wobble's top layer — the same 4-bar pattern one octave up
  // with "effect variations, not note variations" (dossier: the lead repeats
  // the bass's pattern). The acid kit renders the brighter, thinner color;
  // charts stay at the bass's step grid, thinned at low tiers.
  acid: [
    m('acid', 1, [[2, 0.55, 0], [10, 0.5, 0]]),
    m('acid', 1, [[2, 0.55, 0], [6, 0.5, 0], [10, 0.55, 0], [14, 0.5, 0]]),
    m('acid', 2, [
      [2, 0.55, 0], [6, 0.5, 0], [10, 0.55, 0], [14, 0.5, 0],
      [B + 2, 0.55, 0], [B + 6, 0.5, 0], [B + 8, 0.6, 3], [B + 10, 0.55, 1], [B + 12, 0.6, 0],
    ]),
    m('acid', 4, [
      [2, 0.55, 0], [6, 0.5, 0], [10, 0.55, 0], [14, 0.5, 0],
      [B + 2, 0.55, 0], [B + 6, 0.5, 0], [B + 8, 0.6, 3], [B + 10, 0.55, 1], [B + 12, 0.6, 0],
      [2 * B + 2, 0.55, 0], [2 * B + 6, 0.5, 0], [2 * B + 10, 0.55, 0], [2 * B + 14, 0.5, 0],
      [3 * B + 2, 0.55, 0], [3 * B + 6, 0.5, 0], [3 * B + 8, 0.6, 1], [3 * B + 10, 0.5, 0], [3 * B + 12, 0.45, 0],
    ]),
  ],
  // Melody: the deadpan chant, "I'm(0) lo(4)-sing(6) it(8)" — one spoken
  // phrase per bar, monotone on the root (the record's vocal is pitchless
  // speech, so every note is 0). The syllables are the kit's vowel variants:
  // 'lead' = "I'm" (open ah), 'oh' = "lo", 'ih' = "sing", 'eh' = "it".
  // Growth = the chant repeating with growing mania (louder each bar), and
  // tier 4 doubling up in bar 4 ("...losing it, losing it").
  lead: [
    m('lead', 2, [
      [0, 0.7, 0, 'lead'], [4, 0.6, 0, 'oh'], [6, 0.65, 0, 'ih'], [8, 0.7, 0, 'eh'],
    ]),
    m('lead', 2, [
      [0, 0.7, 0, 'lead'], [4, 0.6, 0, 'oh'], [6, 0.65, 0, 'ih'], [8, 0.7, 0, 'eh'],
      [B, 0.75, 0, 'lead'], [B + 4, 0.65, 0, 'oh'], [B + 6, 0.7, 0, 'ih'], [B + 8, 0.75, 0, 'eh'],
    ]),
    m('lead', 4, [
      [0, 0.6, 0, 'lead'], [4, 0.55, 0, 'oh'], [6, 0.55, 0, 'ih'], [8, 0.6, 0, 'eh'],
      [B, 0.65, 0, 'lead'], [B + 4, 0.6, 0, 'oh'], [B + 6, 0.6, 0, 'ih'], [B + 8, 0.65, 0, 'eh'],
      [2 * B, 0.7, 0, 'lead'], [2 * B + 4, 0.65, 0, 'oh'], [2 * B + 6, 0.65, 0, 'ih'], [2 * B + 8, 0.7, 0, 'eh'],
      [3 * B, 0.75, 0, 'lead'], [3 * B + 4, 0.7, 0, 'oh'], [3 * B + 6, 0.7, 0, 'ih'], [3 * B + 8, 0.75, 0, 'eh'],
    ]),
    m('lead', 4, [
      [0, 0.65, 0, 'lead'], [4, 0.6, 0, 'oh'], [6, 0.6, 0, 'ih'], [8, 0.65, 0, 'eh'],
      [B, 0.7, 0, 'lead'], [B + 4, 0.65, 0, 'oh'], [B + 6, 0.65, 0, 'ih'], [B + 8, 0.7, 0, 'eh'],
      [2 * B, 0.75, 0, 'lead'], [2 * B + 4, 0.7, 0, 'oh'], [2 * B + 6, 0.7, 0, 'ih'], [2 * B + 8, 0.75, 0, 'eh'],
      // Bar 4, the mania: the phrase lands, then stutters straight into a
      // second, clipped "losing it".
      [3 * B, 0.8, 0, 'lead'], [3 * B + 4, 0.75, 0, 'oh'], [3 * B + 6, 0.75, 0, 'ih'], [3 * B + 8, 0.8, 0, 'eh'],
      [3 * B + 10, 0.7, 0, 'oh'], [3 * B + 12, 0.75, 0, 'ih'], [3 * B + 14, 0.8, 0, 'eh'],
    ]),
  ],
};
