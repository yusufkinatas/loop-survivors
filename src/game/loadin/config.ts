// Every tuning number The Load-In adds, in one place — the same discipline
// src/game/config.ts keeps for the base.
//
// The numbers that matter most are the three GEOMETRY bands, because they are
// the whole constraint under test. They are chosen so that the three distances
// between two pieces of gear read as three different situations:
//
//     0 .. presence sum         MASKED    they are stepping on each other
//     presence sum .. + band    CABLED    they are wired together
//     beyond that               ALONE     they cover separate ground
//
// The cable band starts exactly where masking ends. That is deliberate: the
// sweet spot is not a third number to learn, it is "just far enough apart not
// to muddy each other". One rule, read off the picture.

import { WORLD_SCALE } from '../config';

export const STAGE = {
  /** How much floor one piece of gear claims, before level. This is what
   *  masking measures and what the presence ring draws — NOT the weapon's own
   *  reach, which differs wildly per weapon (the air field is 155 units, the
   *  kick strip crosses the screen). A uniform footprint is what makes the
   *  constraint readable: two circles either overlap or they do not, and you can
   *  see it without knowing anything about either instrument. */
  presenceRadius: 96 * WORLD_SCALE,
  /** Presence grows with the weapon's level — "power buys radius", per the
   *  ticket. A maxed piece claims ~35% more floor, so a late stage plot that was
   *  spread perfectly at level 2 has quietly grown into itself. That is intended:
   *  it is the erosion #253 asked for, and it arrives as a geometry problem
   *  rather than as a difficulty number. */
  presencePerLevel: 0.05,
  /** Width of the cable band beyond the point where two presences separate. */
  cableBand: 150 * WORLD_SCALE,
  /** Most cables one piece may be an endpoint of. Uncapped, five pieces in a
   *  ring would all pair with all, which turns the geometry puzzle into "spread
   *  out" with no counter-pressure. */
  cablesPerRig: 2,
  /** Output a full mask takes away, and what one cable pays back. A rig buried
   *  in the blob runs at 0.4; a well-placed rig with two cables runs at 1.36.
   *  That is ~10.6 dB between the worst and best stage plot, which is the range
   *  the base could not produce at all (`docs/baseline/`: 0.4-0.6 LU, forever). */
  maskDepth: 0.6,
  cableGain: 0.18,
  /** A rig plugged into a venue socket. Also immune to knockdown — a bolted
   *  amp is the safe option, and safety is what you trade for standing where the
   *  socket is rather than where the geometry wants you. */
  socketGain: 0.25,
  socketRadius: 54 * WORLD_SCALE,
  /** Floor and ceiling on a rig's output, so no arrangement of gear can silence
   *  a voice outright (that would break the audibility rule from the wrong end:
   *  a voice you can still be damaged for owning must still be heard) or push
   *  the limiter into doing the mixing. */
  minOutput: 0.34,
  maxOutput: 1.7,
} as const;

export const HAUL = {
  /** How close the player must be to lift a piece. Generous: fumbling for the
   *  grab is not the decision this mechanic exists to create. */
  grabRadius: 46 * WORLD_SCALE,
  /** Where the carried stack is set back down, as a ring around the player. */
  dropRadius: 52 * WORLD_SCALE,
  /** Move-speed cost per carried piece, before crew. Five pieces at 0.13 leaves
   *  you at 35% speed — slow enough that hauling the whole band across a venue
   *  is a genuine commitment, not a free repositioning. */
  costPerPiece: 0.13,
  /** The slowest the player can ever be made by carrying, before crew raises it.
   *  A floor exists so a full haul is punishing rather than helpless: #255's
   *  floor rule says no mechanic may make the player feel powerless. */
  minMoveMul: 0.35,
  /** Vertical spacing of the carried stack above the player's head, for the view. */
  stackStep: 13 * WORLD_SCALE,
} as const;

export const GEAR = {
  /** Gear health, and what a body standing in it costs per second. Sized so a
   *  crowd passing THROUGH a piece is survivable and a crowd PARKED on it is
   *  not — leading the horde over your own stage is the loop, so the cost has to
   *  be about how long you leave them there. */
  hp: 150,
  contactDpsScale: 0.55,
  /** Seconds of no contact before a piece starts healing, and how fast. Without
   *  regen the late game is pure attrition and the stage plot stops being a
   *  decision. */
  regenDelayS: 3,
  regenPerS: 14,
  /** Body radius: what an enemy has to overlap to damage it, and what the view
   *  draws. Sized against the player (9 units) rather than against the presence
   *  ring: a piece of gear is a thing on the floor you walk up to, and the first
   *  pass drew it small enough to read as a marker for the ring instead of as
   *  the object the ring belongs to. */
  radius: 23 * WORLD_SCALE,
  /** Seconds a downed piece lies there before the player may right it. Short:
   *  the punishment is the trip, not the wait. */
  rightDelayS: 0.35,
} as const;

export const CREW = {
  /** THE SECOND CURRENCY, and the answer to the base's measured problem: with
   *  passives cut the decision stream runs dry at 13:27 (#265). Crew is what
   *  fills the back half, and it buys exactly what the ticket says this stack's
   *  power buys — "how fast gear can be moved".
   *
   *  Eight rungs, matching WEAPON_MAX_LEVEL, so the two currencies read as the
   *  same shape of ladder. */
  maxLevel: 8,
  /** Fraction of the carry cost one crew level removes. At 8 a carried piece
   *  costs 44% of what it costs with no crew. */
  costReliefPerLevel: 0.07,
  /** How much the carry floor rises per level: at 8 a full haul still moves at
   *  59% rather than 35%. */
  floorPerLevel: 0.03,
  /** Gear toughness per level — a roadie's other job. */
  gearHpPerLevel: 22,
  gearRegenPerLevel: 2.5,
  /** Draw weight in the level-up pool, against WEAPON_WEIGHT of 3. Deliberately
   *  under a weapon's: crew must not crowd out the band in the first minutes. */
  offerWeight: 2,
} as const;

export const CROWD = {
  /** THE WIN-CONDITION TOGGLE (package 19, hosted here per #256). Off by default
   *  — it is a second answer to what a run IS, and running both at once would
   *  make every verdict about the stack unreadable. */
  /** Fans alive at once. A hard cap: the crowd is scenery with a job, not a
   *  second horde to simulate. */
  maxFans: 70,
  /** A fan is a BUFFER, and the first pass made it a casualty: thirty fans were
   *  eaten by twenty-five bodies in eight seconds, so the crowd never got to be
   *  the thing standing between the player and the horde. At these numbers one
   *  fan holds one body for about ten seconds, which is long enough to be worth
   *  leading the crowd somewhere. */
  fanHp: 62,
  /** How fast a fan drifts toward the player, as a fraction of player speed. */
  followSpeed: 0.42,
  /** How close a fan tries to stay. They form a loose ring rather than a pile. */
  personalSpace: 44 * WORLD_SCALE,
  fanRadius: 11 * WORLD_SCALE,
  /** An enemy standing in a fan is slowed to this and chews on the fan instead. */
  enemySlow: 0.35,
  fanChewDps: 6,
  /** Output a rig gains per fan standing in its presence, and the cap. "A
   *  converted enemy joins the crowd, amplifies you" — this is the amplifying. */
  gainPerFan: 0.035,
  maxFanGain: 0.4,
  /** The room meter: 0..1, and the run ends at 0. */
  startRoom: 0.62,
  perFanGained: 0.013,
  perFanLost: 0.014,
  /** Base drain per second, multiplied by how one-sided the mix is. A room
   *  bores of one sound, so variety is survival — and the one thing that makes
   *  a mix one-sided in this stack is hauling most of the band at once. That is
   *  the interlock: The Crowd puts a price on the valley.
   *
   *  TUNED AGAINST THE VALLEY, not against a feeling. The first pass emptied a
   *  full room in eighteen seconds of silence, which is less than one crossing
   *  of a venue — so the toggle did not put a price on hauling, it banned it.
   *  At these numbers a full haul costs the room about 1.4% a second and a full
   *  room buys roughly forty seconds of silence, which is a long walk and a real
   *  decision rather than a stopwatch. */
  drainPerS: 0.006,
  /** Seconds of trigger history the variety measure looks at. */
  varietyWindowS: 8,
  /** Drain multiplier at perfectly even and at perfectly concentrated. */
  varietyBest: 0.45,
  varietyWorst: 2.4,
} as const;
