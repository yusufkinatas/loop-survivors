// THE VENUE: this stack's answer to run-to-run variance (#247's fog item, and
// on the round-1 rubric for all five stacks).
//
// The other four stacks roll patterns, tape or offers. This one rolls the
// GEOMETRY, because geometry is what the whole stack is made of: the build is a
// stage plot, so the thing that has to differ between runs is the floor you are
// drawing it on. A run rolls a venue — its size, its shape, and where the power
// sockets are — and that changes what a good stage plot even IS.
//
// It is variance you can SEE before you have made a single decision, which is
// what separates it from a hidden roll. Walk in, look at where the sockets are,
// and the run has already asked you a different question than the last one.
//
// THE ALTERNATIVE CONSIDERED, and recorded because this session made the call
// alone (map Notes, round-1 agent-driven mode): roll the OFFER POOL instead —
// a run draws a subset of the nineteen voices. That is the more conventional
// answer and it makes run two sound different. It does not make run two PLAY
// differently, which is what #253 asked for, and this stack's play is entirely
// about where things stand. So: the floor, not the roster.

import { WORLD_SCALE } from '../config';
import type { Rng } from '../rng';

interface Socket {
  x: number;
  y: number;
}

export interface Venue {
  readonly id: string;
  readonly name: string;
  /** Half-extents from the venue's centre at (0, 0). The player is clamped
   *  inside; enemies arrive through the walls. */
  readonly halfW: number;
  readonly halfH: number;
  readonly sockets: readonly Socket[];
  /** One line, shown once when the run opens. The venue is information, and
   *  #253 rewrote pillar 3 to "the music is the reward, the screen is the
   *  information" — so the screen is allowed to say what the room is. */
  readonly blurb: string;
}

interface VenueArchetype {
  id: string;
  name: string;
  halfW: number;
  halfH: number;
  blurb: string;
  /** Socket positions as fractions of the half-extents, so one archetype scales
   *  without its layout deforming. */
  sockets: readonly (readonly [number, number])[];
}

const U = WORLD_SCALE;

/** Five rooms, each asking a different question of the same five pieces of gear.
 *
 *  They are deliberately NOT balanced against each other. The Basement is a
 *  worse room than the Warehouse and is supposed to be: a run that opens in a
 *  cramped room is a run where masking is the problem you spend the night
 *  solving, and knowing that on sight is the point. */
const ARCHETYPES: readonly VenueArchetype[] = [
  {
    id: 'basement',
    name: 'The Basement',
    halfW: 900 * U, halfH: 640 * U,
    blurb: 'Low ceiling, three outlets on one wall. Everything is going to step on everything.',
    sockets: [[-0.55, -0.6], [0, -0.62], [0.55, -0.6]],
  },
  {
    id: 'club',
    name: 'The Club',
    halfW: 1180 * U, halfH: 820 * U,
    blurb: 'A square room with the power in the corners. Plug in or spread out — not both.',
    sockets: [[-0.62, -0.6], [0.62, -0.6], [-0.62, 0.6], [0.62, 0.6]],
  },
  {
    id: 'theatre',
    name: 'The Theatre',
    halfW: 1340 * U, halfH: 900 * U,
    blurb: 'Sockets along the back of the stage, in an arc. Room to work in front of them.',
    sockets: [[-0.7, -0.5], [-0.36, -0.66], [0, -0.72], [0.36, -0.66], [0.7, -0.5]],
  },
  {
    id: 'warehouse',
    name: 'The Warehouse',
    halfW: 1620 * U, halfH: 1120 * U,
    blurb: 'Far too big and the power is scattered. Easy to wire up, a long way to run.',
    sockets: [[-0.72, -0.44], [-0.2, 0.6], [0.3, -0.62], [0.74, 0.2], [-0.1, -0.1], [0.66, -0.7]],
  },
  {
    id: 'festival',
    name: 'The Festival Field',
    halfW: 1880 * U, halfH: 1220 * U,
    blurb: 'Two stages, a field between them. Whichever one you build on, the other is a long walk.',
    sockets: [
      [-0.76, -0.42], [-0.62, 0], [-0.76, 0.42],
      [0.76, -0.42], [0.62, 0], [0.76, 0.42],
    ],
  },
];

/** The endless plane the base runs on, for the `venue` layer switched off. Kept
 *  as a Venue rather than as a null case so nothing downstream has to branch:
 *  the bounds are simply far enough away to never be reached, and the sockets
 *  are the Theatre's, laid out around the origin, so the `sockets` layer can
 *  still be judged on its own. */
export function unboundedVenue(): Venue {
  const theatre = ARCHETYPES[2];
  return {
    id: 'plane',
    name: 'The Endless Plane',
    halfW: 1e7,
    halfH: 1e7,
    blurb: 'No walls. The base game’s floor, for comparison.',
    sockets: theatre.sockets.map(([fx, fy]) => ({ x: fx * theatre.halfW, y: fy * theatre.halfH })),
  };
}

/** Roll one venue. Draws exactly twice off the supplied stream — the archetype
 *  and the orientation — so adding a venue never shifts a seeded run by more
 *  than the value of the first draw.
 *
 *  Orientation is a mirror rather than a rotation: mirroring keeps the room's
 *  aspect ratio (and therefore its relationship to the 16:9 camera), while a
 *  90-degree rotation would turn the Theatre's wide back wall into a tall side
 *  wall and quietly make it a different room. */
export function rollVenue(rng: Rng): Venue {
  const archetype = ARCHETYPES[Math.min(ARCHETYPES.length - 1, Math.floor(rng() * ARCHETYPES.length))];
  const flip = rng() < 0.5 ? -1 : 1;
  return {
    id: archetype.id,
    name: archetype.name,
    halfW: archetype.halfW,
    halfH: archetype.halfH,
    blurb: archetype.blurb,
    sockets: archetype.sockets.map(([fx, fy]) => ({
      x: fx * flip * archetype.halfW,
      y: fy * archetype.halfH,
    })),
  };
}

/** Clamp a point inside the venue, leaving `margin` of floor at the wall. */
export function clampToVenue(
  venue: Venue,
  x: number,
  y: number,
  margin = 0,
): { x: number; y: number } {
  const w = Math.max(0, venue.halfW - margin);
  const h = Math.max(0, venue.halfH - margin);
  return {
    x: Math.max(-w, Math.min(w, x)),
    y: Math.max(-h, Math.min(h, y)),
  };
}
