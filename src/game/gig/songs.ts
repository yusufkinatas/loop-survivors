// THE SET LIST: what a run IS under The Gig (#268).
//
// The base's run is one 30-minute authored set at one constant tempo — pillar 5,
// and this file breaks it deliberately and completely. A run here is a GIG:
//
//   SONG 1  five minutes, slow and heavy          95 BPM, a heavy shuffle
//   CHANGEOVER                                    the room empties; rebuild
//   SONG 2  five minutes, four-on-the-floor      124 BPM, a house shuffle
//   CHANGEOVER
//   SONG 3  five minutes, fast and bright        140 BPM, dead straight
//   ENCORE  ninety seconds, everything at once   140 BPM
//
// Seventeen and a half minutes, and the ending is a SUMMIT rather than a timer —
// #253 asked for exactly that, and an encore is what an ending looks like when
// the fiction supplies it instead of a clock.
//
// ---------------------------------------------------------------------------
// HOW GENRE IS FAKED, AND WHAT IT IS DELIBERATELY NOT
// ---------------------------------------------------------------------------
//
// #268 asked for "three genres without building three soundsets" and named the
// prototype-grade fake: tempo plus chart density from the shared palette. Charts
// are the player's here, so density is not the branch's to weight. What is:
//
//   TEMPO      95 / 124 / 140. The single biggest change, and free: content is
//              single sounds rather than baked clips, so nothing time-stretches.
//   SWING      0.18 / 0.10 / 0.00. Nearly free and enormously audible — the
//              same take shuffles, then grooves, then marches.
//   PRESSURE   three separate curves, cut from three different windows of Mad
//              Forest's own authored table (below). #268 flagged this stack as
//              needing three curves; taking them from measured data rather than
//              inventing them keeps the enemy side honest.
//   OFFERS     each song weights which instruments the level-up pool draws
//              heavier. An offer-weight knob, exactly like the base's existing
//              early-drum nudge, and explicitly NOT a grouping rule.
//
// AND WHAT IT IS NOT: there is no per-instrument genre multiplier. The obvious
// build would have been "an instrument out of its home genre hits softer",
// keyed on the palette's seat x attack grid. #266 ruled that grid **a mixing
// taxonomy, never a gameplay rule** — the designer's words were "to prevent the
// creativeness" — so reading it as a damage rule is not available, and inventing
// a parallel table that means the same thing would be the same move wearing a
// hat.
//
// What replaces it is better anyway, because it is entirely audible: **the take
// itself is the genre-shaped thing.** A dense take cut at 95 becomes a blur at
// 140, and on a choking voice (a new note cuts the ringing one — bass, sub,
// upright, drone, organ, flute all choke) it becomes a stutter where every note
// is killed before it speaks. A sparse take that sounded lost at 95 becomes a
// groove at 140. So "an instrument that rules a slow heavy song is dead weight
// in a fast one" comes out of the instrument's own nature and the player's own
// performance, with nothing hidden in a table. Whether the changeover is worth
// its cost is then a real question rather than an arithmetic one.

import {
  STAGE_EVENTS,
  STAGE_WAVES,
  type StageEvent,
  type StageWave,
} from '../madforest';
import type { StageScript } from '../run';
import type { Role } from '../../audio/kits';
import type { EnemyKind } from '../config';

/** What a section of the gig is. Songs and changeovers and the encore are all
 *  one shape, because the run is a list of them and the controller should not
 *  care which kind it is looking at. */
export interface GigSection {
  kind: 'song' | 'changeover' | 'encore';
  /** Screen name. Never a musical term — a song title is a song title. */
  name: string;
  /** Position in the set, for the card: "SONG 2 OF 3". Empty for changeovers. */
  label: string;
  startS: number;
  endS: number;
  bpm: number;
  /** Fraction of a 16th the offbeat eighths lay back by (the shuffle). */
  swing: number;
  /** Roles the level-up pool draws heavier on during this section. */
  favours: readonly Role[];
}

const SONG_S = 300;
const CHANGEOVER_S = 25;
const ENCORE_S = 90;

/** How much heavier a favoured instrument draws. The base already has one of
 *  these (the early drum nudge at 1.7x), so the size is calibrated against
 *  something rather than picked: a thumb on the scale, not a gate. */
export const FAVOUR_FACTOR = 2.1;

/** The set list. Timestamps are absolute run seconds, so the director never
 *  has to be told a section changed — it walks one table, as it always did. */
export const GIG_SECTIONS: readonly GigSection[] = buildSections();

function buildSections(): GigSection[] {
  const out: GigSection[] = [];
  let t = 0;
  const song = (name: string, index: number, bpm: number, swing: number, favours: Role[]): void => {
    out.push({
      kind: 'song', name, label: `SONG ${index} OF 3`,
      startS: t, endS: t + SONG_S, bpm, swing, favours,
    });
    t += SONG_S;
  };
  const changeover = (): void => {
    // A changeover already plays at the tempo of the song it is leading INTO.
    // That is the whole reason it is worth cutting a take there: you are
    // rehearsing against what you are about to play, not against what you just
    // finished.
    const next = out.length === 1 ? 1 : 2;
    const bpm = next === 1 ? 124 : 140;
    const swing = next === 1 ? 0.1 : 0;
    out.push({
      kind: 'changeover', name: 'CHANGEOVER', label: '',
      startS: t, endS: t + CHANGEOVER_S, bpm, swing, favours: [],
    });
    t += CHANGEOVER_S;
  };

  // Song 1 wants weight: the room is cold and the set opens on the bottom end.
  song('LOAD-IN', 1, 95, 0.18, ['sub', 'upright', 'drone', 'organ', 'kick', 'bass']);
  changeover();
  // Song 2 is the floor: the pulse and the low end carry it.
  song('THE FLOOR', 2, 124, 0.1, ['kick', 'clap', 'snare', 'bass', 'chord', 'hat']);
  changeover();
  // Song 3 goes up: everything bright and quick.
  song('LAST CALL', 3, 140, 0, ['hat', 'shaker', 'arp', 'bell', 'flute', 'chank', 'lead']);
  out.push({
    kind: 'encore', name: 'ENCORE', label: 'THE ENCORE',
    startS: t, endS: t + ENCORE_S, bpm: 140, swing: 0, favours: [],
  });
  t += ENCORE_S;
  return out;
}

/** When the gig is played out. The set list's own end, not a constant. */
export const GIG_LENGTH_S = GIG_SECTIONS[GIG_SECTIONS.length - 1].endS;

export function sectionAt(timeS: number): GigSection {
  for (const section of GIG_SECTIONS) {
    if (timeS < section.endS) return section;
  }
  return GIG_SECTIONS[GIG_SECTIONS.length - 1];
}

// ---------------------------------------------------------------------------
// Three pressure curves, cut from one authored table
// ---------------------------------------------------------------------------
//
// Mad Forest's thirty rows are already three different games: minutes 0-4 are a
// slow open, 8-12 are the mid-game grind with its first real swarms, and 20-24
// are the flower-wall storm. Lifting three five-minute windows out of it gives
// three genuinely distinct curves off measured data — and it means the enemies a
// song throws are enemies somebody already balanced, rather than three tables
// this session guessed at.
//
// The windows are chosen for CONTRAST rather than for continuity, so each song
// arrives as its own kind of pressure:
const SONG_WINDOWS: readonly { fromMinute: number }[] = [
  { fromMinute: 0 }, // slow, sparse, big single bodies
  { fromMinute: 8 }, // the grind: high floors, fast drips, bat swarms
  { fromMinute: 20 }, // the storm: flower walls, venus, 300-body floors
];

/** The encore reads Mad Forest's last minute — its hardest authored row. */
const ENCORE_MINUTE = 29;

/** Seconds of quiet at the top of a song before its first spawn: the band
 *  counting in.
 *
 *  THE FIRST ONE IS LONG, and it is the FLOOR RULE (#255) — "a player holding
 *  one weapon must always be able to play it. No mechanic may make the opening
 *  feel powerless." The gig's opening move is: walk onto an instrument, wait for
 *  it to enter on the next bar, then record its first bar with nothing else
 *  playing. That is three bar lines before a single note attacks anything, and
 *  it is the one place The Gig could genuinely leave a player defenceless.
 *  Fourteen seconds of empty stage is what buys it.
 *
 *  THE LATER ONES ARE SHORT on purpose. Songs 2 and 3 open straight out of a
 *  changeover, and #268 wants song three to "open deliberately thin because you
 *  just rebuilt" — a generous free window there would soften exactly the beat
 *  the stack is trying to test. */
const COUNT_IN_S = 14;
const LATER_COUNT_IN_S = 6;

function offsetWave(wave: StageWave, atS: number): StageWave {
  return { atS, pattern: wave.pattern, minimum: wave.minimum, intervalS: wave.intervalS };
}

function offsetEvent(event: StageEvent, atS: number): StageEvent {
  return { ...event, atS };
}

/** An idle row: no pattern and a zero floor, so the director's backfill loop
 *  runs once, spawns nothing and exits. What a changeover looks like to the
 *  stage script. */
function idleWave(atS: number): StageWave {
  return { atS, pattern: [], minimum: 0, intervalS: 5 };
}

/** Build the whole gig's stage script.
 *
 *  Nothing in `run.ts`'s director changes: it still walks one wave table and one
 *  event table sorted by absolute run seconds. The three curves and the two
 *  empty rooms are all expressed as rows, which is what `StageScript` was left
 *  as a seam for (#265). */
export function buildGigStage(): StageScript {
  const waves: StageWave[] = [];
  const events: StageEvent[] = [];

  for (const section of GIG_SECTIONS) {
    if (section.kind === 'changeover') {
      waves.push(idleWave(section.startS));
      continue;
    }
    const minutes = section.kind === 'encore'
      ? [ENCORE_MINUTE]
      : windowMinutes(section);
    // Each source minute owns an equal slice of the section, after the count-in.
    const open = section.startS + (section.startS === 0 ? COUNT_IN_S : LATER_COUNT_IN_S);
    const span = (section.endS - open) / minutes.length;
    minutes.forEach((minute, i) => {
      const at = open + i * span;
      const source = waveAtMinute(minute);
      waves.push(offsetWave(source, at));
      for (const event of eventsInMinute(minute)) {
        // Keep the event's own offset inside its minute, scaled into the slice.
        const withinMinute = event.atS - minute * 60;
        const scaled = (withinMinute / 60) * span;
        events.push(offsetEvent(event, at + Math.min(span - 1, Math.max(0, scaled))));
      }
    });
  }

  // A changeover must arrive on an EMPTY stage, and the base's sweeps and flower
  // walls outlive their spawn instant by up to 60 seconds. The controller clears
  // the field at each boundary; dropping any event that would fire in the last
  // few seconds of a song stops one from being spawned into a room that is about
  // to be emptied anyway.
  const boundaries = GIG_SECTIONS.filter((s) => s.kind === 'changeover').map((s) => s.startS);
  const keep = events.filter((e) => !boundaries.some((b) => e.atS > b - 4 && e.atS <= b));

  return {
    waves,
    events: keep.sort((a, b) => a.atS - b.atS),
    startingKind: 'redBat2' as EnemyKind,
    // Zero, not ten. The base opens with ten bodies already in play (Mad Forest
    // §6) and the count-in exists precisely so the first take is unpressured.
    startingSpawns: 0,
    victoryAtS: GIG_LENGTH_S,
  };
}

function windowMinutes(section: GigSection): number[] {
  const index = GIG_SECTIONS.filter((s) => s.kind === 'song').indexOf(section);
  const from = SONG_WINDOWS[Math.max(0, index)].fromMinute;
  return [from, from + 1, from + 2, from + 3, from + 4];
}

function waveAtMinute(minute: number): StageWave {
  const atS = minute * 60;
  let wave = STAGE_WAVES[0];
  for (const row of STAGE_WAVES) if (row.atS <= atS) wave = row;
  return wave;
}

function eventsInMinute(minute: number): StageEvent[] {
  const from = minute * 60;
  return STAGE_EVENTS.filter((e) => e.atS >= from && e.atS < from + 60);
}
