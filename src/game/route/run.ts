// THE ROUTE, as one run's state: where you are on it, what is behind the doors,
// and what the arrangement has been doing.
//
// A run is a sequence of four beats, repeated:
//
//   ROOM     a fight long enough to hear a section play out
//   DOORS    the room is played out and three doors drop; the crowd is still here
//   GATE     the corridor: the room pays, the door charges, and you arrange
//   ROOM     ...
//
// and the last room is a summit whose clear ends the set. Nothing here touches the
// engine, the world, or the DOM — `game.ts` drives the transitions and `sync.ts`
// pushes the result at the band. What lives here is the route, the log, and the
// one measurement this whole prototype exists to produce.

import type { Rng } from '../rng';
import { RouteBuild } from './build';
import { rollDoors, type DoorOffer, type RoomReward } from './gates';
import {
  BAR_UNLOCK_AT_ROOM,
  firstRoom,
  phrasesToSeconds,
  ROUTE_ROOMS,
  type RoomSpec,
} from './rooms';
import { pattern, type PatternBars } from './patterns';

export type RoutePhase = 'room' | 'doors' | 'gate' | 'over';

/** One sample of what the band was playing. */
export interface DensitySample {
  timeS: number;
  /** Hits per bar, whole band. The number `docs/baseline/` measured climbing
   *  2.00 -> 23.00 across a run and never once falling. */
  density: number;
  /** Voices making a sound. */
  playing: number;
  /** Which room the run was in. */
  room: number;
  phase: RoutePhase;
}

/** The first room's reward is authored rather than rolled: a run has to reach its
 *  first gate holding something, or the first bench has nothing to arrange. */
const OPENING_REWARD: RoomReward = { kind: 'pattern', pattern: 'backbeat' };

export class RouteRun {
  readonly build = new RouteBuild();

  /** Where on the route the player is standing. 0 is the opening room. */
  room: RoomSpec = firstRoom();
  phase: RoutePhase = 'room';

  /** What the room being fought will pay when it is cleared. Decided by the door
   *  that led into it (the opening room's is authored). */
  pendingReward: RoomReward = OPENING_REWARD;
  /** Set once the corridor's reward has been claimed, so the door cannot open on
   *  an unclaimed prize. */
  rewardClaimed = false;

  /** The three doors on offer, and the one taken. */
  doors: DoorOffer[] = [];
  chosen: DoorOffer | null = null;
  tollPaid = false;

  /** Plain-language history: what the player did at every gate. Printed at the
   *  end of a run and copied into the branch's capture notes, because a per-
   *  mechanic verdict needs to be able to point at the decisions that produced
   *  it. */
  readonly log: string[] = [];

  readonly density: DensitySample[] = [];

  private rng: Rng;
  private lastSampleAtS = -1;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  get depth(): number {
    return this.room.depth;
  }

  get roomSeconds(): number {
    return phrasesToSeconds(this.room.phrases);
  }

  get roomsLeft(): number {
    return Math.max(0, ROUTE_ROOMS - 1 - this.room.depth);
  }

  /** THE MEASUREMENT (#256's hard floor, first half). Sampled once a second, so
   *  a run produces a curve rather than an anecdote and "density fell because the
   *  player chose it" is either in the data or it is not. */
  sample(timeS: number): void {
    const at = Math.floor(timeS);
    if (at === this.lastSampleAtS) return;
    this.lastSampleAtS = at;
    this.density.push({
      timeS: at,
      density: round2(this.build.density()),
      playing: this.build.playingCount(),
      room: this.room.depth,
      phase: this.phase,
    });
  }

  /** Whether the density curve ever fell. The floor asks for one fall; this
   *  reports every one of them, and how deep. */
  falls(): { atS: number; from: number; to: number }[] {
    const out: { atS: number; from: number; to: number }[] = [];
    for (let i = 1; i < this.density.length; i++) {
      const before = this.density[i - 1];
      const now = this.density[i];
      if (now.density < before.density - 1e-9) {
        out.push({ atS: now.timeS, from: before.density, to: now.density });
      }
    }
    return out;
  }

  /** The whole density curve as a table, for the branch's capture notes. */
  densityTable(): string {
    const rows = ['| t | triggers/bar | voices | room | phase |', '|---|---|---|---|---|'];
    for (const s of this.density) {
      rows.push(`| ${s.timeS} | ${s.density.toFixed(2)} | ${s.playing} | ${s.room} | ${s.phase} |`);
    }
    return rows.join('\n');
  }

  // ---- the route ---------------------------------------------------------

  /** The room is played out. Roll the doors that lead out of it. */
  openDoors(): DoorOffer[] {
    this.phase = 'doors';
    this.doors = this.room.summit ? [] : rollDoors(this.build, this.room.depth, this.rng);
    return this.doors;
  }

  /** A door was walked onto: into the corridor. */
  takeDoor(door: DoorOffer): void {
    this.chosen = door;
    this.phase = 'gate';
    this.tollPaid = door.toll.kind === 'none';
    this.rewardClaimed = false;
  }

  /** Everything the corridor still wants before the door may open. */
  gateBlockers(): string[] {
    const out: string[] = [];
    if (!this.rewardClaimed) out.push('the room has not paid out yet');
    if (!this.tollPaid) out.push('the toll is unpaid');
    return out;
  }

  /** Walk through. Returns the bar unlock the new room brings, if any. */
  enterChosenRoom(): { room: RoomSpec; unlockedBars: PatternBars | null } {
    const door = this.chosen;
    if (!door) return { room: this.room, unlockedBars: null };
    this.room = door.room;
    this.pendingReward = door.reward;
    this.phase = 'room';
    this.doors = [];
    this.chosen = null;
    const unlocked = BAR_UNLOCK_AT_ROOM.includes(this.room.depth)
      ? this.build.unlockNextBar()
      : null;
    return { room: this.room, unlockedBars: unlocked };
  }

  finish(): void {
    this.phase = 'over';
  }

  // ---- the log -----------------------------------------------------------

  note(line: string): void {
    this.log.push(`[room ${this.room.depth}] ${line}`);
  }

  /** What the door the player took said about itself, in one line. */
  describeDoor(door: DoorOffer): string {
    return `${door.room.name} · pays ${describeReward(door.reward)} · costs ${describeToll(door)}`;
  }
}

export function describeReward(reward: RoomReward): string {
  if (reward.kind === 'pattern') return pattern(reward.pattern).name;
  if (reward.kind === 'instrument') return 'a new instrument';
  if (reward.kind === 'levels') return `${reward.levels} levels`;
  return `${reward.stacks} weight`;
}

export function describeToll(door: DoorOffer): string {
  switch (door.toll.kind) {
    case 'none': return 'nothing';
    case 'level': return 'a level';
    case 'pattern': return 'a pattern';
    case 'instrument': return 'an instrument';
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
