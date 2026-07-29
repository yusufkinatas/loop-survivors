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
//
// ---------------------------------------------------------------------------
// THE PALETTE (#266): twelve more ladders, taking the band from eight to
// twenty. The eight above are UNCHANGED — this branch is the control that all
// five round-1 prototypes are measured against, so the original arrangement had
// to survive the widening untouched.
//
// THE ONE RULE THE NEW LADDERS OBEY, and the reason they look the way they do:
// **no two voices in the same seat share a rhythm.** That is #266's floor
// ("you can always tell which one just fired") applied to the ear. Two voices
// far apart in pitch never fight — a kick and a bass have coexisted here from
// the start — but two voices in the same seat landing on the same steps do not
// read as two instruments. They read as one thicker, blurrier instrument, the
// way two people singing the exact same note read as one louder person.
//
// So each seat's steps are divided up, and the division is the arrangement:
//
//   LOW ANCHOR    bass 2/6/10/14 (offbeats) · upright 0/4/8/12 (walking
//                 quarters) · sub step 0 every TWO bars · drone step 0 every
//                 FOUR bars. Sub and upright do share the downbeat, which is
//                 correct rather than a collision — a sub under a walking bass
//                 is ordinary production — because one plays four notes a bar
//                 and the other plays one every two.
//   HARMONIC      chord 2/7/10/15 (syncopated stabs) · rhodes 4/12 (with the
//                 backbeat) · organ 0/8 (held) · chank 1/5/9/13 (the "e" of
//                 each beat, a dry 16th scratch).
//   BRIGHT LINE   lead 0/3/6 phrasing · arp running figures · bell 8/14 (high
//                 and sparse, bells want space) · flute 10 and bar-2 step 2
//                 (entering on offbeats, the way a wind instrument does).
//   PERCUSSION    kick 0/4/8/12 · clap and snare 4/12 · hat offbeat opens ·
//                 shaker 3/7/11/15, the "a" of each beat.
//   TEXTURE       phrase-length notes only. See below.
//
// Collisions ACROSS seats are left alone: they are how a band works.
//
// TEXTURE IS DIFFERENT, AND #266 FLAGGED IT AS THE ONE PLACE THE CONTROL IS
// INVENTED RATHER THAN REPRODUCED. A held sound has no firing moment, so these
// three trigger once per phrase and their weapons damage continuously while the
// sound rings. Their rungs therefore grow through HARMONIC MOVEMENT — more
// chord changes across the phrase — rather than through more notes, because
// there is no existing behaviour for a held sound to match. Every other voice
// in the game buys power by playing more; these buy it by playing wider.

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
  // Motion: driving pentatonic climb that FILLS IN as the weapon levels. Starts
  // as a bare half-note outline (two notes a bar) so a level-1 arp is a thin,
  // slow-turning ring, and grows to full running 16ths only at the top — the
  // density arrives late, not up front. Each orbiter is one note, so this ramp
  // IS the arp's early-vs-late orbiter count.
  arp: [
    // Stage 1 (levels 1-2): half-note outline, root then fifth. Two notes a bar.
    m('arp', 1, [[0, 0.55, 0], [8, 0.5, 7]]),
    // Stage 2 (levels 3-4): quarter-note climb — one note per beat.
    m('arp', 1, [[0, 0.55, 0], [4, 0.5, 3], [8, 0.55, 7], [12, 0.5, 12]]),
    // Stage 3 (levels 5-6): running 8ths, the figure up and back down.
    m('arp', 1, [
      [0, 0.55, 0], [2, 0.45, 3], [4, 0.5, 7], [6, 0.45, 10], [8, 0.55, 12], [10, 0.45, 10], [12, 0.5, 7], [14, 0.45, 3],
    ]),
    // Stage 4 (levels 7-8): near-running 16ths but with rests punched on 5/9/13
    // in each bar so the line breathes and its trigger rate stays comparable to
    // the other melodic roles at max tier (a solid 16th wall is the hats'
    // privilege).
    m('arp', 2, [
      [0, 0.55, 0], [1, 0.4, 3], [2, 0.5, 7], [3, 0.4, 12], [4, 0.55, 7], [6, 0.5, 7], [7, 0.4, 12],
      [8, 0.55, 15], [10, 0.5, 10], [11, 0.4, 7], [12, 0.55, 12], [14, 0.5, 7], [15, 0.4, 3],
      [B, 0.55, 5], [B + 1, 0.4, 7], [B + 2, 0.5, 10], [B + 3, 0.4, 12], [B + 4, 0.55, 15], [B + 6, 0.5, 10], [B + 7, 0.4, 7],
      [B + 8, 0.55, 12], [B + 10, 0.5, 7], [B + 11, 0.4, 5], [B + 12, 0.55, 3], [B + 14, 0.5, 7], [B + 15, 0.4, 10],
    ]),
  ],

  // =========================================================================
  // THE PALETTE (#266)
  // =========================================================================

  // ---- Low anchor ---------------------------------------------------------

  // Sub: the true floor of the track. ONE note every two bars at the bottom
  // rung, and never more than a note per beat at the top — this voice exists to
  // be underneath, and a busy sub is just a muddy bass. Growth is the note
  // moving (0 -> 7 -> 5) far more than the note count rising.
  sub: [
    m('sub', 2, [[0, 0.9, 0]]),
    m('sub', 2, [[0, 0.9, 0], [B, 0.85, 0]]),
    m('sub', 2, [[0, 0.9, 0], [8, 0.7, 0], [B, 0.85, 7], [B + 8, 0.7, 7]]),
    m('sub', 2, [
      [0, 0.95, 0], [8, 0.75, 0], [12, 0.6, 0],
      [B, 0.85, 7], [B + 8, 0.75, 7], [B + 12, 0.6, 5],
    ]),
  ],
  // Upright: a walking acoustic bass. Quarters on 0/4/8/12 — the one place in
  // the low seat nothing else lives, and the pattern a walking bass actually
  // plays. It is the busiest voice in its seat by design: where the sub holds
  // and the drone sits, this one moves, which is what makes it a different
  // decision rather than a different colour.
  upright: [
    m('upright', 2, [[0, 0.85, 0], [8, 0.75, 7]]),
    m('upright', 2, [[0, 0.85, 0], [4, 0.7, 3], [8, 0.8, 7], [12, 0.7, 5]]),
    m('upright', 2, [
      [0, 0.85, 0], [4, 0.7, 3], [8, 0.8, 7], [12, 0.7, 5],
      [B, 0.85, 7], [B + 4, 0.7, 5], [B + 8, 0.8, 3], [B + 12, 0.7, 0],
    ]),
    m('upright', 2, [
      [0, 0.9, 0], [4, 0.7, 3], [6, 0.5, 5], [8, 0.8, 7], [12, 0.7, 5], [14, 0.5, 3],
      [B, 0.85, 7], [B + 4, 0.7, 10], [B + 6, 0.5, 7], [B + 8, 0.8, 5], [B + 12, 0.7, 3], [B + 14, 0.5, 0],
    ]),
  ],
  // Drone: the low seat's sustained voice, and the reason the seat clears the
  // two-attack rule at all. One held note per phrase at the bottom rung. Its
  // rendered buffer runs 2.6 s — well over a bar — so re-articulating it often
  // would just be choking itself; the growth is the note moving underneath the
  // track, not more notes.
  drone: [
    m('drone', 4, [[0, 0.55, 0]]),
    m('drone', 4, [[0, 0.6, 0], [2 * B, 0.5, 7]]),
    m('drone', 4, [[0, 0.6, 0], [2 * B, 0.55, 7], [3 * B, 0.45, 5]]),
    m('drone', 4, [[0, 0.65, 0], [B, 0.5, 7], [2 * B, 0.6, 5], [3 * B, 0.5, 7]]),
  ],

  // ---- Harmonic body ------------------------------------------------------

  // Rhodes: keys landing WITH the backbeat on 4 and 12, which is where the
  // chord's syncopated stabs deliberately are not. Growth adds the pushed
  // step-9 anticipation and then the second bar's answer.
  rhodes: [
    m('rhodes', 2, [[4, 0.7, 0], [12, 0.65, 0]]),
    m('rhodes', 2, [[4, 0.75, 0], [12, 0.7, 7], [B + 4, 0.75, 5], [B + 12, 0.7, 0]]),
    m('rhodes', 2, [
      [4, 0.75, 0], [9, 0.55, 3], [12, 0.7, 7],
      [B + 4, 0.75, 5], [B + 9, 0.55, 7], [B + 12, 0.7, 0],
    ]),
    m('rhodes', 2, [
      [4, 0.8, 0], [9, 0.6, 3], [12, 0.7, 7], [14, 0.5, 5],
      [B + 4, 0.8, 5], [B + 9, 0.6, 7], [B + 12, 0.75, 3], [B + 14, 0.5, 0],
    ]),
  ],
  // Organ: held, on 0 and 8. Its buffer sustains 1.3 s, roughly two beats, so
  // these are long overlapping tones rather than stabs. Growth is the harmony
  // moving across the phrase.
  organ: [
    m('organ', 2, [[0, 0.6, 0]]),
    m('organ', 2, [[0, 0.6, 0], [B, 0.55, 7]]),
    m('organ', 2, [[0, 0.6, 0], [8, 0.5, 7], [B, 0.6, 5], [B + 8, 0.5, 0]]),
    m('organ', 2, [
      [0, 0.65, 0], [8, 0.55, 7], [12, 0.45, 10],
      [B, 0.6, 5], [B + 8, 0.55, 3], [B + 12, 0.45, 0],
    ]),
  ],
  // Chank: the dry 16th scratch, on the "e" of each beat (1/5/9/13). Nothing
  // else in the harmonic seat is there, and it is the most genre-portable voice
  // in the palette — a muted chank sits in disco, funk, house and rock without
  // changing. Growth fills the scratch in toward a continuous chop.
  chank: [
    m('chank', 2, [[5, 0.7, 0], [13, 0.65, 0]]),
    m('chank', 2, [[1, 0.55, 0], [5, 0.75, 0], [9, 0.6, 0], [13, 0.7, 0]]),
    m('chank', 2, [
      [1, 0.55, 0], [5, 0.75, 0], [9, 0.6, 0], [13, 0.7, 0],
      [B + 1, 0.55, 5], [B + 5, 0.75, 5], [B + 9, 0.6, 5], [B + 13, 0.7, 5],
    ]),
    m('chank', 2, [
      [1, 0.6, 0], [3, 0.45, 0], [5, 0.8, 0], [9, 0.65, 0], [11, 0.45, 0], [13, 0.75, 0],
      [B + 1, 0.6, 5], [B + 3, 0.45, 5], [B + 5, 0.8, 5], [B + 9, 0.65, 7], [B + 11, 0.45, 7], [B + 13, 0.75, 7],
    ]),
  ],

  // ---- Bright line --------------------------------------------------------

  // Bell: high and sparse. Bells want space — a bell on every beat is an alarm,
  // not an instrument — so even the top rung stays under one hit per beat. Sits
  // on 8 and 14, clear of the lead's 0/3/6 phrasing.
  bell: [
    m('bell', 2, [[8, 0.6, 12]]),
    m('bell', 2, [[8, 0.6, 12], [B + 4, 0.55, 15]]),
    m('bell', 2, [[8, 0.65, 12], [14, 0.5, 15], [B + 4, 0.6, 19], [B + 10, 0.5, 15]]),
    m('bell', 2, [
      [8, 0.7, 12], [14, 0.55, 15],
      [B + 4, 0.6, 19], [B + 10, 0.55, 15], [B + 14, 0.45, 12],
    ]),
  ],
  // Flute: long breathy notes entering on offbeats, the way a wind instrument
  // does — it needs air before the note, so it never lands on a downbeat. Its
  // buffer runs 1.05 s, so these overlap into each other across the phrase.
  flute: [
    m('flute', 4, [[10, 0.55, 7]]),
    m('flute', 4, [[10, 0.6, 7], [B + 2, 0.5, 10]]),
    m('flute', 4, [[10, 0.6, 7], [B + 2, 0.55, 10], [2 * B + 10, 0.6, 12]]),
    m('flute', 4, [
      [10, 0.6, 7], [B + 2, 0.55, 10], [2 * B + 10, 0.6, 12],
      [3 * B + 2, 0.5, 10], [3 * B + 10, 0.5, 7],
    ]),
  ],

  // ---- Percussion ---------------------------------------------------------

  // Shaker: the "a" of each beat — the last 16th before the next beat lands.
  // Clear of the kick's downbeats, the backbeat's 4 and 12, and the hats'
  // offbeat opens, so the whole kit interlocks rather than stacks.
  //
  // THE TOP RUNG LEAVES THE DOWNBEATS EMPTY, and that is a trigger-rate
  // decision as much as a musical one. A shaker running solid 16ths is ordinary
  // in real music, but here a trigger is an attack, so 16 a bar would have made
  // this the highest-damage weapon in the game — and the arp's ladder already
  // records the house norm that a solid 16th wall is the hats' privilege.
  // Dropping 0/4/8/12 lands it at 12 a bar, level with the hat, and is what a
  // shaker does anyway: it fills around the kick rather than doubling it.
  shaker: [
    d('shaker', '...o...o...o...o'),
    d('shaker', '...x...x...x...x'),
    d('shaker', '.-.x.-.x.-.x.-.x'),
    d('shaker', '.x-x.x-x.x-x.x-x'),
  ],

  // ---- Texture ------------------------------------------------------------
  //
  // Phrase-length notes. These three trigger rarely and their weapons damage
  // continuously while the sound rings, so the rungs buy WIDTH (more harmonic
  // movement across the phrase) rather than density. See the header.

  // Pad: the warm cushion. Quiet, slow, and the most audible thing a player can
  // choose to drop.
  pad: [
    m('pad', 4, [[0, 0.45, 0]]),
    m('pad', 4, [[0, 0.5, 0], [2 * B, 0.45, 7]]),
    m('pad', 4, [[0, 0.5, 0], [B, 0.4, 5], [2 * B, 0.5, 7], [3 * B, 0.4, 5]]),
    m('pad', 4, [
      [0, 0.55, 0], [B, 0.45, 5], [2 * B, 0.55, 7], [2 * B + 8, 0.4, 10], [3 * B, 0.45, 5],
    ]),
  ],
  // Air: vinyl hiss and crackle. Unpitched, so it is written as a drum string.
  //
  // ENTERS ON BAR 2, not bar 1. All three texture voices naturally want the top
  // of the phrase, and writing them that way made them arrive together and fuse
  // into one composite wash — the exact same-seat smear the floor rule exists to
  // stop, just built out of held sounds instead of hits. Staggering the three
  // entries is also plainly better arrangement: a cushion and a swell should not
  // land on the same beat.
  air: [
    d('air', '................', 'o...............', '................', '................'),
    d('air', '................', 'o...............', '................', 'o...............'),
    d('air', '................', 'x...............', '........o.......', 'o...............'),
    d('air', '................', 'x...............', 'o.......o.......', 'x...............'),
  ],
  // Wind: the moving wash, entering on bar 3 — last of the three, lifting into
  // the top of the next phrase. Its weapon lays a trail behind the player rather
  // than a field around them, so it does nothing standing still — but its SOUND
  // still has to breathe on the phrase, and its 2.4 s sweep is most of two bars.
  wind: [
    d('wind', '................', '................', 'o...............', '................'),
    d('wind', '................', '................', 'o...............', '........o.......'),
    d('wind', '........o.......', '................', 'x...............', '........o.......'),
    d('wind', '........x.......', '................', 'x.......o.......', '........o.......'),
  ],
};
