// THE ROOMS — the run shape (#267, package 6 of #255): Hades, sized for music.
//
// A run is a route of discrete rooms with doors between them, not one continuous
// thirty-minute clock. Two things make it this package rather than a generic
// level select:
//
//   A ROOM IS LONG ENOUGH TO HEAR A SECTION PLAY OUT. The designer's own note on
//   #255 is that Hades' rooms end too fast, and that "this package's whole tuning
//   problem is that one number". So the number is written in PHRASES rather than
//   seconds (`ROOM_PHRASES` below) — the unit the music is actually built in —
//   and it is the first thing to change if a room feels wrong.
//
//   DOORS SHOW WHAT IS BEHIND THEM. Reward type, enemy type, and what the room
//   will SOUND like. That last one is the whole reason the shape suits this
//   engine: it lets the player arrange FOR something, which is the retooling
//   answer #255 left open, and it is what stops a toll from having one right
//   answer — the right thing to give up depends on what is through the door.
//
// The pressure schedule is this file's own. `docs/mad-forest-spec.md`'s thirty
// authored minutes assume one continuous arena and cannot survive being cut into
// rooms; prototypes are explicitly exempt from the held-fixed schedule (#255,
// the designer's ruling) and told to "adjust enemies as needed". THE BESTIARY IS
// UNTOUCHED — every statline is still Mad Forest's. What changed is when and in
// what company each kind arrives.

import type { EnemyKind } from '../config';
import type { StageEvent, StageWave } from '../madforest';
import type { StageScript } from '../run';
import { SKELETON } from '../../audio/scale';
import { SOUNDSET } from '../../audio/soundset';

/**
 * THE TUNING NUMBER OF THE WHOLE PACKAGE, and it is written in phrases on
 * purpose. A phrase is four bars — the length the engine loops material in and
 * the length a section of a track is built out of. Ten phrases is forty bars,
 * about eighty seconds at the soundset's tempo: long enough that an arrangement
 * has been stated, repeated, and heard, which is exactly what "sized for music"
 * has to mean.
 *
 * If a room feels like it ends before you have heard it, this is the number.
 */
const ROOM_PHRASES = 10;

/** The summit is longer: it is the ending, and #253 asks for an ending that is a
 *  summit rather than a stop. */
const SUMMIT_PHRASES = 16;

/** How many rooms a route is. Eleven gates and a summit — the gate count is what
 *  decides how many times a run can be pruned, and eleven is enough that a run
 *  has a shape and few enough that no single toll is trivial. */
export const ROUTE_ROOMS = 12;

/** Rooms the player enters before the second and the fourth bar open. Authored
 *  rather than rolled: bar count is a PROGRESSION axis (the designer's addition
 *  on #255), so it arrives at the same place in every run and is announced when
 *  it does. */
export const BAR_UNLOCK_AT_ROOM: readonly number[] = [4, 8];

const secondsPerBar = (): number => (SKELETON.beatsPerBar * 60) / SOUNDSET.bpm;

export function phrasesToSeconds(phrases: number): number {
  return phrases * 4 * secondsPerBar();
}

/** What kind of fight is behind a door. This is the telegraph the player reads,
 *  and it is the thing an arrangement can be chosen FOR — which is what turns the
 *  toll from a tax into a decision. */
export type Crowd = 'swarm' | 'wall' | 'cellar' | 'rush' | 'boss';

export interface CrowdShape {
  crowd: Crowd;
  /** The room's name on the door. */
  name: string;
  /** What is in there, in the player's words. */
  bodies: string;
  /** What it asks of an arrangement. Plain words, no theory and no numbers: this
   *  is the line that tells the player what to go and arrange. */
  asks: string;
}

export const CROWDS: Readonly<Record<Crowd, CrowdShape>> = {
  swarm: {
    crowd: 'swarm', name: 'The Long Hall',
    bodies: 'Thin bodies, hundreds of them, coming from everywhere.',
    asks: 'Wants a busy band. Every extra hit finds something.',
  },
  wall: {
    crowd: 'wall', name: 'The Standing Room',
    bodies: 'A slow, solid crowd that closes in and does not scatter.',
    asks: 'Wants something that covers ground rather than something fast.',
  },
  cellar: {
    crowd: 'cellar', name: 'The Cellar',
    bodies: 'A handful of very heavy bodies. They soak everything.',
    asks: 'Wants few, huge hits. A busy band wastes most of itself here.',
  },
  rush: {
    crowd: 'rush', name: 'The Passage',
    bodies: 'Fast movers and sweeps that cross the room end to end.',
    asks: 'Wants something playing at every moment, not in bursts.',
  },
  boss: {
    crowd: 'boss', name: 'The Balcony',
    bodies: 'One enormous thing, and enough company to keep you honest.',
    asks: 'Wants your heaviest single voice pointed at one target.',
  },
};

export interface RoomSpec {
  /** 0-based position on the route. */
  depth: number;
  crowd: Crowd;
  name: string;
  phrases: number;
  script: StageScript;
  /** True for the last room: clearing it wins the run. */
  summit: boolean;
}

// ---------------------------------------------------------------------------
// The pressure, per crowd shape, scaled by how deep on the route the room is
// ---------------------------------------------------------------------------
//
// Every kind and every statline is Mad Forest's, untouched. What each row picks
// is WHICH kinds arrive together and how many are kept alive — the two levers the
// base's own wave table uses, applied to a room instead of a minute.

/** Roster by depth band: [rooms 0-3, rooms 4-7, rooms 8+]. */
type Bands = readonly [readonly EnemyKind[], readonly EnemyKind[], readonly EnemyKind[]];

interface CrowdPressure {
  bands: Bands;
  /** Live population floor at depth 0, and how much each room deeper adds. */
  minimum: number;
  minimumPerDepth: number;
  intervalS: number;
  /** Sweeps and bosses this shape brings with it. */
  events?(depth: number, phrases: number): StageEvent[];
}

const band = (depth: number): 0 | 1 | 2 => (depth < 4 ? 0 : depth < 8 ? 1 : 2);

const PRESSURE: Readonly<Record<Crowd, CrowdPressure>> = {
  // Chaff, and lots of it. The room where a dense arrangement earns its keep:
  // every trigger finds a body, and overkill is not a cost when the bodies have
  // one hit point.
  swarm: {
    bands: [['redBat2', 'bat'], ['bat', 'redBat', 'redBat2'], ['bat', 'redBat', 'redBat2', 'ghost']],
    minimum: 40, minimumPerDepth: 14, intervalS: 0.4,
  },
  // A slow solid mass. Nothing here is individually dangerous; being surrounded
  // is.
  wall: {
    bands: [['zombie'], ['zombie', 'skeleton'], ['skeleton', 'grayMudman', 'zombie']],
    minimum: 30, minimumPerDepth: 10, intervalS: 0.3,
  },
  // Few, enormous, and slow. THE ROOM THAT PUNISHES A BUSY BAND, and it does it
  // through a mechanic that was already there rather than a new rule: #273 found
  // `damageByRole` credits only `min(hp, amount)`, so a small hit on a 500 hp
  // body wastes nothing and a huge hit on a 1 hp body wastes almost all of
  // itself. Against these, heavy single hits land everything they carry.
  cellar: {
    bands: [['greenMudman'], ['giantBat', 'grayMudman'], ['mantis', 'bigMummy', 'venus']],
    minimum: 8, minimumPerDepth: 1.5, intervalS: 1.6,
  },
  // Speed. Ghosts ignore knockback entirely, and the sweeps cross the room on a
  // fixed line, so a band with holes in it gets hit in the holes.
  rush: {
    bands: [['ghost'], ['ghost', 'werewolf'], ['werewolf', 'ghost', 'silverBat']],
    minimum: 24, minimumPerDepth: 8, intervalS: 0.35,
    events: (depth, phrases) => {
      const kind: EnemyKind = depth < 6 ? 'batSwarm' : 'ghostSwarm';
      const total = phrasesToSeconds(phrases);
      const spacing = 11;
      return [{
        atS: 8, type: 'sweep', kind, countPer: 6 + depth,
        chance: 1, occurrences: Math.max(1, Math.floor((total - 8) / spacing)), spacingS: spacing,
      }];
    },
  },
  // One Giant, plus company. The Giants are their own statlines (mad-forest-spec
  // 2d) and carry HP x Level, so this room's difficulty tracks the run rather
  // than the route.
  boss: {
    bands: [['bat'], ['redBat', 'zombie'], ['skeleton', 'ghost']],
    minimum: 14, minimumPerDepth: 4, intervalS: 0.9,
    events: (depth) => {
      const giants: EnemyKind[] = ['giantWerewolf', 'giantMantis', 'giantMummy', 'giantBlueVenus'];
      return [{ atS: 3, type: 'boss', kind: giants[Math.min(giants.length - 1, Math.floor(depth / 3))], chest: true }];
    },
  },
};

function scriptFor(crowd: Crowd, depth: number, phrases: number): StageScript {
  const p = PRESSURE[crowd];
  const roster = p.bands[band(depth)];
  const minimum = Math.round(p.minimum + p.minimumPerDepth * depth);
  // One wave row, held for the whole room. A room is a place rather than a
  // schedule: its pressure is a constant the player learns inside the first
  // phrase and then plays against, which is what makes "arrange for what is
  // through the door" a real instruction.
  const waves: StageWave[] = [{ atS: 0, pattern: roster, minimum, intervalS: p.intervalS }];
  return {
    waves,
    events: p.events?.(depth, phrases) ?? [],
    startingKind: roster[0],
    startingSpawns: Math.max(6, Math.round(minimum / 3)),
    // NO CLOCK EVER WINS A ROUTE RUN. A set is over when the summit is cleared
    // (`RunWorld.declareVictory`), so the run-shape seam's own length is pushed out
    // of reach rather than left at Mad Forest's 30:00 — which would end a route
    // halfway up it. This is where the stack breaks `docs/plan.md`'s pillar 5.
    victoryAtS: Infinity,
  };
}

/** The room behind a door. */
export function makeRoom(crowd: Crowd, depth: number): RoomSpec {
  const summit = depth >= ROUTE_ROOMS - 1;
  const phrases = summit ? SUMMIT_PHRASES : ROOM_PHRASES;
  return {
    depth,
    crowd,
    name: summit ? 'The Roof' : CROWDS[crowd].name,
    phrases,
    script: summit ? summitScript(depth, phrases) : scriptFor(crowd, depth, phrases),
    summit,
  };
}

/** THE SUMMIT. #253 asks for an ending that is a summit rather than a stop, so
 *  the last room is the only one that stacks two Giants on top of a full crowd
 *  and runs half again as long. It is also the only room whose clear ends the
 *  run: the route, not a clock, decides when a set is over — which is where this
 *  stack breaks `docs/plan.md`'s pillar 5 outright. */
function summitScript(depth: number, phrases: number): StageScript {
  const base = scriptFor('wall', depth, phrases);
  return {
    ...base,
    waves: [{ atS: 0, pattern: ['skeleton', 'werewolf', 'grayMudman'], minimum: 170, intervalS: 0.25 }],
    events: [
      { atS: 4, type: 'boss', kind: 'giantBlueVenus', chest: true },
      { atS: phrasesToSeconds(phrases) * 0.5, type: 'boss', kind: 'giantMummy', chest: true },
      {
        atS: 20, type: 'sweep', kind: 'ghostSwarm', countPer: 14,
        chance: 1, occurrences: 6, spacingS: 14,
      },
    ],
  };
}

/** The opening room: authored, never rolled, so every run starts in the same
 *  place. A route needs somewhere to be standing before it offers a door. */
export function firstRoom(): RoomSpec {
  return makeRoom('swarm', 0);
}

/** Which crowd shapes may stand behind a door at this depth. The Balcony is held
 *  back until the run has a band worth pointing at one target, and the Cellar
 *  until there is a heavy voice to point. */
export function crowdsAvailableAt(depth: number): Crowd[] {
  // THREE FROM THE FIRST GATE. The first pass opened only two shapes at depth 0
  // and the first gate therefore offered two doors — and a route whose first
  // decision is a coin flip has taught the player that doors are not really a
  // choice. The Cellar and the Balcony are still held back, because both ask for a
  // heavy voice and a level-1 band has not got one yet.
  const out: Crowd[] = ['swarm', 'wall', 'rush'];
  if (depth >= 2) out.push('cellar');
  if (depth >= 3) out.push('boss');
  return out;
}
