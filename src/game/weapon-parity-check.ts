// Golden-vector parity harness for the weapon-module migration.
//
// WHY THIS EXISTS
// ---------------
// Nine weapons move out of run.ts and into src/game/weapons/*, one issue at a
// time. Each extraction claims "behavior unchanged". The only honest way to
// check that claim is a differential: run the same scripted world before and
// after and compare. A cross-commit differential (a worktree at HEAD~1 against
// HEAD) cannot live inside `npm run verify` — verify sees one commit.
//
// The equivalent that CAN live inside verify is a GOLDEN VECTOR: run a set of
// scripted, fully deterministic scenarios against a real RunWorld, digest the
// resulting world state, and compare that digest against a baseline RECORDED IN
// THE REPO (weapon-parity-baseline.json). "Behavior did not change" stops being
// a claim in a commit message and becomes a check anyone on the branch re-runs.
//
// This is deliberately NOT a unit test. It asserts nothing about what the kick
// SHOULD do. It asserts only that what the whole world DOES today is what it
// did when the baseline was recorded. Intent lives in systems-check.ts; this
// file is the tripwire underneath it.
//
// WHY A REAL RunWorld AND NOT A FAKE CONTEXT
// ------------------------------------------
// systems-check.ts drives weapon modules through a hand-written fake context
// and calls inst.tick() directly. That is the right shape for pinning a
// module's contract, but it means NOTHING exercises the world's call site — the
// `this.tickWeapons('strikes', dt)` line in RunWorld.update(). Mis-wire that
// line to a phase no module declares and every fake-context check still passes
// while all base kick damage silently becomes zero. Every scenario here goes
// through world.update(), so the wiring is under test too.
//
// HOW TO RE-RECORD THE BASELINE
// -----------------------------
// Only when a behavior change is INTENTIONAL and reviewed. Re-recording is a
// deliberate, explicit act; it never happens as a side effect of running the
// check.
//
//     npm run record:weapon-parity     (i.e. RECORD_WEAPON_PARITY=1 node --import tsx src/game/weapon-parity-check.ts)
//
// Then READ THE DIFF on weapon-parity-baseline.json before staging it. Every
// changed line is a gameplay change you are signing for. A diff bigger than the
// change you set out to make is the harness telling you something else moved.
// A baseline re-recorded in the same commit as an "extract weapon N, behavior
// unchanged" refactor is a contradiction — the diff should be empty there.
//
// HOW A FUTURE WEAPON EXTRACTION PLUGS IN
// ---------------------------------------
// Add scenarios to SCENARIOS below, one block per weapon, then re-record. The
// harness itself does not change: the digest is weapon-agnostic (it walks the
// world's entity arrays and per-role tallies, not kick-specific fields). The
// intended order for an extraction is:
//
//   1. BEFORE touching run.ts, add the new weapon's scenarios and re-record the
//      baseline on the UNCHANGED code. That baseline is the pre-refactor
//      behavior, captured while it is still trustworthy.
//   2. Do the extraction.
//   3. Run `npm run verify`. A green run is the differential: the module
//      reproduces the world code it replaced, entity for entity and rng draw
//      for rng draw.
//
// Step 1 first is the whole point. Recording after the refactor records the
// bug.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Role } from '../audio/kits';
import type { EnemyKind } from './config';
import type { ItemId } from './items';
import { mulberry32 } from './rng';
import { RunWorld, type FxEvent, type RunEvents } from './run';

const BASELINE_URL = new URL('./weapon-parity-baseline.json', import.meta.url);
const BASELINE_PATH = fileURLToPath(BASELINE_URL);
const RECORD = process.env.RECORD_WEAPON_PARITY === '1';

/** Fixed step. Every scenario advances the world in whole frames of this, so a
 *  scenario's timeline is frame-exact and independent of any real clock. */
const SIM_DT = 1 / 60;
/** Fixed canvas. Redline Stomp's reach is a fraction of the visible extent, so
 *  this number is load-bearing: changing it moves the evolved footprint. */
const VIEW = { width: 1280, height: 720 } as const;

// ---------------------------------------------------------------- scenarios --

/** One scripted beat of a scenario. */
export type ParityStep =
  /** Fire one Trigger for a role. Velocity and variant are fixed at the
   *  sound-only defaults — ADR-0001 says they cannot reach the world, and
   *  soundOnlyOutput in systems-check.ts is what proves it. */
  | { readonly fire: Role }
  /** Advance the world by n frames of SIM_DT. */
  | { readonly frames: number }
  /** Evolve mid-scenario, so the base -> evolved transition is captured with a
   *  base strike still in flight. */
  | { readonly evolve: Role }
  /** Set the movement stick for every frame from here on, as a raw (not
   *  necessarily unit) control vector. Added for the hi-hat (#141), the one
   *  weapon that aims by STEERING: it fires down player.moveDirX/Y and never
   *  consults nearestEnemy, so with a stick that is never touched every hat
   *  scenario would fire down the +x the player is initialised to and the
   *  heading would not be under test at all.
   *
   *  INERT FOR EVERY SCENARIO THAT DOES NOT USE IT. RunWorld's default control
   *  is `() => ({ x: 0, y: 0 })` and the harness now supplies a function that
   *  returns exactly that until a `walk` step changes it, so no pre-existing
   *  baseline entry moves. `{ walk: [0, 0] }` stops the player WITHOUT
   *  resetting the heading, which is the rule movePlayer states and the only
   *  way to script it. */
  | { readonly walk: readonly [number, number] };

export interface ParityScenario {
  readonly name: string;
  /** Seed for the run's main rng stream. Different per scenario so a bug that
   *  only shows on one draw sequence is not hidden by a single shared seed. */
  readonly seed: number;
  /** [role, tier] pairs added before the script runs. */
  readonly weapons: readonly (readonly [Role, number])[];
  /** [item, level] pairs. Evolutions need their item at max level. */
  readonly items?: readonly (readonly [ItemId, number])[];
  /** Roles evolved during setup, before the script runs. */
  readonly evolved?: readonly Role[];
  /** [kind, dx, dy] — hand-placed at an exact offset from the player, with the
   *  circle center pinned afterwards. spawnEnemyAt takes a sprite-feet position
   *  and offsets the stored center off it, so without the pin the geometry
   *  under test would be off by the foot offset. */
  readonly enemies: readonly (readonly [EnemyKind, number, number])[];
  /** Enemies get this much hp instead of their bestiary roll, so a damage
   *  change shows up as an hp delta rather than being masked by a kill. Omit to
   *  keep natural hp, which is what makes kills and drops part of the digest. */
  readonly hp?: number;
  readonly steps: readonly ParityStep[];
}

/** Offsets chosen against the kick's real geometry, so a geometry change moves
 *  the digest instead of landing inside the same hit set.
 *
 *  stripBaseWidth is 85 * WORLD_SCALE ~= 149.1 world units of full reach, and
 *  stripBaseHeight is 22 * WORLD_SCALE ~= 38.6 of full thickness. So:
 *    dx 40   deep inside the strip at any plausible size
 *    dx 110  inside full reach, OUTSIDE a halved one
 *    dx 200  outside the strip entirely; only Redline Stomp reaches it
 *    dy 26   inside full half-thickness, OUTSIDE a halved one
 *  Behind the player (dx -60) pins the facing-side rule and the tier-2
 *  opposite-side follow-up. */
const KICK_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['zombie', 40, 0],
  ['zombie', 110, 0],
  ['zombie', 200, 0],
  ['zombie', 40, 26],
  ['zombie', -60, 0],
  ['zombie', 0, 200],
];

/** `count` enemies evenly spaced on a circle of `radius` around the player,
 *  starting at `phase`.
 *
 *  Every other weapon aims; the arp sweeps. Its geometry is entirely angular,
 *  so the only field that gives an orbiter a comparable target at every phase
 *  of its sweep — and therefore the only one that can see a change in HOW FAST
 *  it sweeps or HOW OFTEN it is allowed to re-hit — is a ring. */
function ring(
  kind: EnemyKind,
  radius: number,
  count: number,
  phase = 0,
): readonly (readonly [EnemyKind, number, number])[] {
  return Array.from({ length: count }, (_, i) => {
    const a = phase + (Math.PI * 2 * i) / count;
    return [kind, radius * Math.cos(a), radius * Math.sin(a)] as const;
  });
}

/** Targets laid out against the arp's real orbit radii — 80 / 92 / 106 / 122
 *  per tier, and the evolved orbit that breathes between 100 and 150. An
 *  orbiter's own radius is 8-10 and a zombie's is ~21, so the swept band is
 *  roughly the orbit radius +-29:
 *    ring 80    the tier-1 orbit, on the nose
 *    ring 122   the tier-4 orbit, on the nose, offset in phase so the two
 *               rings never share an angle and a pass through one is not also
 *               a pass through the other
 *    45         inside every orbit — an orbiter must never reach it, which is
 *               what makes "orbits the player" different from "a zone"
 *    160 / -170 outside every base orbit; only the evolved orbit's outward
 *               breath comes near. */
const ARP_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ...ring('zombie', 80, 6),
  ...ring('zombie', 122, 6, Math.PI / 6),
  ['zombie', 45, 0],
  ['zombie', 0, 160],
  ['zombie', -170, 0],
];

/** Enemies in single file straight down the +x axis, the direction the snare
 *  aims when its only target sits there. A file is to a piercing shot what a
 *  ring is to an orbiter: the only layout where "how many bodies does one shot
 *  pass through" is readable off the digest at all. */
function file(
  kind: EnemyKind,
  xs: readonly number[],
): readonly (readonly [EnemyKind, number, number])[] {
  return xs.map((x) => [kind, x, 0] as const);
}

/** The base snare's pierce ladder is 2 / 3 / 4 / 6, so the file has to be
 *  LONGER than the largest budget or the top rung reads the same as the one
 *  below it — the shot has to run out of pierce, not out of targets.
 *
 *  ELITES, not zombies, and the reason is the aim jitter. aimFan(0.08) rolls
 *  the heading up to +-0.08 rad off the target, which at the far end of a
 *  500-unit file is +-40 units of lateral drift; a zombie (radius 21) plus the
 *  shot (radius 7) only covers 28 of that, so the LAST body in a zombie file
 *  would be hit or missed depending on the seed and the ladder would stop being
 *  the thing under test. An elite is radius 34, covers 41, and is spaced 70
 *  apart so no two overlap. Elite speed is 48, the slowest body in the
 *  bestiary, so the file barely deforms over the ~0.75s the shot takes to
 *  cross it.
 *
 *  Eight bodies: six is exactly tier 4's budget, so #7 and #8 are the markers
 *  that say the shot DIED rather than ran out of file. */
const SNARE_FILE: readonly (readonly [EnemyKind, number, number])[] = file(
  'elite',
  [70, 140, 210, 280, 350, 420, 490, 560],
);

/** FLOWERS, and the whole bass block rests on why. The bass is the widest and
 *  slowest thing in the game — a tier-4 wave is radius 42 travelling 150 for
 *  2.6s, and Subquake is a ring that grows from 40 to 288 over 1.2s — so both
 *  halves of the weapon are pinned by WHERE THEIR EDGE IS at a given moment.
 *  Every other body in the bestiary charges the player fast enough to cross
 *  that edge on its own: a zombie closes 44.6 units per second, so over a
 *  2.6-second wave it walks 116 units into a boundary the scenario is trying
 *  to hold still. The flower moves at 8.9 — under 11 units across a whole
 *  Subquake life — so a flower placed at radius R is still, to within a body's
 *  width, at radius R when the edge arrives. It is the only body in the
 *  bestiary that can hold a geometry pin for the seconds this weapon takes.
 *
 *  Flower radius is 17.544, so the swept band around a tier-N wave is
 *  39.54 / 45.54 / 51.54 / 59.54 — four boundaries six units apart, which is
 *  what makes the ladder's `radius` readable as hit-or-miss and not only as a
 *  total. Rings, not files, for the same reason the arp uses them: a ring
 *  samples every perpendicular distance from 0 to R at once, so one ring is a
 *  fine comb across the wave's whole width instead of a single sample on the
 *  axis. Ring counts are set so the arc spacing clears a flower's 35.1-unit
 *  diameter and the separation pass inside world.update(0) leaves every body
 *  exactly where this list puts it; phases are stepped so no two rings share
 *  an angle and a pass through one is not also a pass through the next. */
const BASS_SWEPT_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ...ring('flower', 60, 8, 0),
  ...ring('flower', 140, 12, 0.13),
  ...ring('flower', 220, 12, 0.26),
  ...ring('flower', 300, 12, 0.39),
  ...ring('flower', 380, 12, 0.52),
  ...ring('flower', 460, 12, 0.65),
];

/** The same comb, spaced for SUBQUAKE'S ring rather than for a travelling
 *  wave. The ring is player-centred and grows
 *  `40 + (288 * areaMul - 40) * min(1, age / 1.2)`, so with no Wide Lens its
 *  reach against a flower runs 57.5 at spawn to 305.5 at full extent. Rings
 *  every 50 units out to 360 bracket that whole sweep, and — because the ring
 *  passes each of them at a DIFFERENT MOMENT — a scenario that stops
 *  mid-expansion reads the growth curve directly off which rings were reached.
 *  Three stop times against these radii pin the start radius, the max radius
 *  and the 1.2-second growth duration as three separately falsifiable numbers,
 *  which matters because the digest's shockwave line carries only pos, damage
 *  and life: `radius` and `maxRadius` are NOT digested and have no other
 *  cover. */
const BASS_QUAKE_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ...ring('flower', 60, 8, 0),
  ...ring('flower', 110, 10, 0.21),
  ...ring('flower', 160, 12, 0.42),
  ...ring('flower', 210, 12, 0.63),
  ...ring('flower', 260, 12, 0.84),
  ...ring('flower', 310, 12, 1.05),
  ...ring('flower', 360, 12, 1.26),
];

/** Bodies on an arc of `radius` around a point OFFSET FROM THE PLAYER by
 *  (cx, cy), at the listed angles in degrees.
 *
 *  Added for the chord (#141), and the offset centre is the whole reason it
 *  exists. Every other weapon so far fires from the player, so a ring around
 *  the player is a ring around the thing under test. A chord zone is THROWN:
 *  it lands on the nearest enemy and its geometry is measured from THERE, so
 *  the field has to be built around a point that is not the origin.
 *
 *  THE ANGLES ARE THE CONSTRAINT, not decoration. The zone lands on whichever
 *  body is nearest the PLAYER, so every other body in the field must be
 *  FARTHER from the player than the anchor is or it steals the throw and the
 *  centre of the geometry moves. With the anchor out along +x at (cx, 0),
 *  keeping every arc angle inside [-90, 90] guarantees exactly that:
 *  |(cx + R cos t, R sin t)| >= cx for every cos t >= 0. */
function arcAt(
  kind: EnemyKind,
  cx: number,
  cy: number,
  radius: number,
  degrees: readonly number[],
): readonly (readonly [EnemyKind, number, number])[] {
  return degrees.map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [kind, cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as const;
  });
}

/** Where every base chord scenario throws its zone: far enough out that the
 *  zone's whole footprint sits away from the player, close enough to be well
 *  inside ZONE_THROW_RANGE (420). */
const CHORD_ANCHOR = 170;

/** A comb of concentric arcs around the thrown zone's centre, cut so that each
 *  of the four base tiers reaches a DIFFERENT set of them.
 *
 *  SWARMERS, and the size is the reason. The chord's radius ladder is
 *  48 / 56 / 64 / 76 — four boundaries EIGHT UNITS APART — and damageArea
 *  resolves a hit as `circlesOverlap`, i.e. at `zone.radius + body.radius`. A
 *  zombie (radius 21.05) or a flower (17.5, and it alternates) is wider than
 *  the gap between two rungs, so two arcs cut to separate tier 2 from tier 3
 *  would be closer together than one body is wide and the separation pass in
 *  world.update(0) would shove them into each other before anything fired. A
 *  swarmer is radius 9 — 18 across, the smallest body in the game that is not
 *  a darter — so arcs eight units apart survive separation once they are
 *  stepped 22.5 degrees in phase, and the ladder becomes readable.
 *
 *  THE CUTS, against contact distances of 57 / 65 / 73 / 85:
 *    arc 53   inside every tier
 *    arc 61   tiers 2, 3, 4      (t1's reach stops at 57)
 *    arc 69   tiers 3, 4         (t2's stops at 65)
 *    arc 79   tier 4 only        (t3's stops at 73)
 *    arc 89   no tier reaches it — the "the zone stopped here" marker
 *  Every cut clears its nearest boundary by at least four units, which is more
 *  than the 1.58 a swarmer walks in the single frame these scenarios run
 *  before the zone's first tick lands.
 *
 *  The anchor sits at the head of the list so it is unambiguously the throw
 *  target: it is the only body at distance CHORD_ANCHOR and every arc angle is
 *  inside [-90, 90], so nothing else can tie it, let alone beat it. */
const CHORD_ARC_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['swarmer', CHORD_ANCHOR, 0],
  ...arcAt('swarmer', CHORD_ANCHOR, 0, 53, [-90, -45, 0, 45, 90]),
  ...arcAt('swarmer', CHORD_ANCHOR, 0, 61, [-67.5, -22.5, 22.5, 67.5]),
  ...arcAt('swarmer', CHORD_ANCHOR, 0, 69, [-90, -45, 0, 45, 90]),
  ...arcAt('swarmer', CHORD_ANCHOR, 0, 79, [-67.5, -22.5, 22.5, 67.5]),
  ...arcAt('swarmer', CHORD_ANCHOR, 0, 89, [-90, -45, 0, 45, 90]),
];

/** Bodies parked inside a thrown zone plus one witness outside it, for the
 *  scenarios that pin the SLOW rather than the damage.
 *
 *  ZOMBIES, and here the speed is the point rather than the problem. A zone's
 *  slow is only ever visible as a body moving less far than it should, and the
 *  digest records `lastMove=` — the exact per-frame velocity movEnemies chose,
 *  AFTER `speed *= e.zoneSlowMul`. A zombie walks 44.65 units a second, so
 *  0.55 of that is a difference of 20 units a second in a digested number; a
 *  flower's 8.9 would put the whole signal down in the fourth decimal.
 *
 *  THE WITNESS IS OFF TO THE SIDE, not further down the axis, and the first
 *  version of this field got that wrong. A zombie parked 120 units past the
 *  zone — comfortably outside tier 4's reach of 97 — WALKS 52 UNITS toward the
 *  player over the 70 frames these scenarios run and ends up inside the zone
 *  after all, recording a slowed lastMove and quietly deleting the control. At
 *  (200, 400) it is 400 from the zone centre and closes on the PLAYER, not on
 *  the zone, so it is still 350 clear at the end and still outside even the
 *  evolved 174-unit reach. It records the UNSLOWED lastMove in the same digest,
 *  so "everything slowed" and "nothing slowed" are told apart without reading a
 *  second scenario — and at 447 from the player it can never steal the throw
 *  from the anchor at 200.
 *
 *  Spacing is 50 on the arc against a zombie's 42.11 diameter, so separation
 *  leaves the field alone. */
const CHORD_SLOW_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['zombie', 200, 0],
  ...arcAt('zombie', 200, 0, 50, [-90, -30, 30, 90]),
  ['zombie', 200, 400],
];

/** Sixty-one bodies laid out so that the drift target Afterhours picks under
 *  its SAMPLING STRIDE is a different body from the one it would pick if it
 *  scanned the whole array. See the scenario for the arithmetic.
 *
 *  Even array indices are a loose ring at 300; odd indices are a packed grid
 *  parked far off at +x; the throw anchor is appended LAST so it does not
 *  shift the parity of everything behind it. */
const CHORD_STRIDE_FIELD: readonly (readonly [EnemyKind, number, number])[] = (() => {
  const out: (readonly [EnemyKind, number, number])[] = [];
  for (let i = 0; i < 30; i++) {
    const a = (Math.PI * 2 * i) / 30;
    // EVEN index: loose ring, 62.8 apart, so each member's neighbour count
    // inside the 120-unit radius is exactly itself plus its two neighbours.
    out.push(['flower', 300 * Math.cos(a), 300 * Math.sin(a)] as const);
    // ODD index: a 6-wide grid on 50-unit spacing, parked 700+ units out on
    // the OPPOSITE side, where nothing on the ring can see it. Every member has
    // 9-plus neighbours. Opposite side on purpose: it makes "the stride picked
    // the ring" and "a full scan picked the grid" point the drift in two
    // directions 180 degrees apart, instead of two nearby bearings that a
    // digest would separate only in the second decimal.
    out.push(['flower', -700 - (i % 6) * 50, -100 + Math.floor(i / 6) * 50] as const);
  }
  // Index 60. Nearest to the player at 150, and 150 from the nearest ring
  // member, so it neither steals a neighbour count nor ties the throw.
  out.push(['flower', 0, -150] as const);
  return out;
})();

/** FLOWERS for every lead geometry pin, and the reason is sharper here than
 *  anywhere else in this file. The lead is the only weapon that STEERS AFTER IT
 *  LEAVES THE PLAYER: every frame it re-picks the nearest body it has not
 *  already hit and turns toward it at `turnRate` rad/s. So a lead pin is never
 *  "was this body inside a footprint at time T" — it is "which body was nearest
 *  the seeker at every one of the ~140 frames it was alive", and a target that
 *  walks re-answers that question continuously. A zombie closes 44.65 units a
 *  second and would move 98 units over a tier-4 seeker's 2.2s life, which is
 *  more than the gaps these fields are cut to. A flower moves 8.9 — under 20
 *  units across a whole seeker — so a flower placed at radius R is still, to
 *  within half a body, at radius R when the turn arrives.
 *
 *  Flower radius is 17.544, so a tier-4 seeker (radius 7) makes contact at
 *  24.5 and separation inside world.update(0) needs 35.1 between any two
 *  bodies. Every gap below clears both by a wide margin.
 *
 *  All lead fields also stay inside the ARENA RAILS — |x| < 739.6, |y| < 416 at
 *  this VIEW — so that the one scenario that DOES carry Mirrorball is the only
 *  place a bounce can happen, and a rail reflection never leaks into a pin that
 *  is about homing. */

/** A zig-zag a seeker can only thread by TURNING, alternating sides of the
 *  firing axis as it goes out. This is the field that puts `turnRate` under
 *  test: 10 rad/s base against 14 evolved is not a damage difference, it is a
 *  different curve, a different arrival frame at each body, and — when the turn
 *  is too slow to make the next corner — a different SET of bodies reached.
 *  A straight file could not tell the two apart at all.
 *
 *  The head sits alone at 120 with the next body at 260, so `nearestEnemy` has
 *  an unambiguous aim lock and the trigger's angle is not seed-dependent. */
const LEAD_CHAIN_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['flower', 120, 0],
  ['flower', 230, 120],
  ['flower', 300, -110],
  ['flower', 430, 90],
  ['flower', 470, -140],
  ['flower', 600, 60],
  ['flower', 640, -90],
  ['flower', 720, 30],
];

/** The 320-UNIT HOMING GATE, from both sides, through world state.
 *
 *  `pr.homingRange` is Infinity on a base seeker and 320 on a Neon Serpent —
 *  a FIELD set at spawn since #140, so it is not a branch anything can read off
 *  the shared loop, and today it is pinned ONLY by a pair of asserts in
 *  systems-check. This field puts it in the digest instead.
 *
 *  The shape: a BAIT at 60 takes the aim lock and the first hit, which puts it
 *  in the shot's hit set and frees the seeker to look for a second target.
 *  Every other body then sits off the firing axis, so a turn is the only way to
 *  it, and the distances are cut against 320 measured FROM THE BAIT:
 *    (0, 250)    257 from the bait   inside the gate; both modes reach it
 *    (0, -300)   306 from the bait but 550 from (0, 250), so which hop the
 *                seeker is on decides whether it is a candidate at all — the
 *                marker that says the recorded chain is an ORDER, not a count
 *    (-520, 0)   580 from the bait, 574 from (0, 250), and on the far side of
 *                the player from everything else, so no point on the reachable
 *                path is ever within 320 of it. Only unrestricted base homing
 *                crosses to it.
 *  RECORDED: base takes the bait, (0, 250) and then the long crossing to
 *  (-520, 0) — three bodies, 12 damage. A Neon Serpent stops after two, at
 *  11.2. That gap between two baseline entries built from the identical field
 *  and the identical build IS the 320.
 *
 *  Extension Cable is in both gate scenarios so a base seeker has the 3.36s of
 *  life it needs to actually make the far crossing — otherwise "the base seeker
 *  did not reach it" would mean "it expired", not "the gate is Infinity". */
const LEAD_GATE_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['flower', 60, 0],
  ['flower', 0, 250],
  ['flower', 0, -300],
  ['flower', -520, 0],
];

/** Thirteen bodies in single file, which is to the lead's pierce budget what
 *  SNARE_FILE is to the snare's — except the budgets here are far bigger, so
 *  the file has to be far longer.
 *
 *  THE BUDGETS: base tier 4 is pierce 2, and with Needle Tips at max it is 7.
 *  Neon Serpent is `LEAD_SERPENT.basePierce` (6) put THROUGH applyBuild, so it
 *  is 6 + 5 = 11 — and per #146 eleven is the only value it ever has, because
 *  `eligibleEvolution` will not hand out the evolution unless Needle Tips is
 *  already at ITEM_MAX_LEVEL. Thirteen bodies is past both budgets, so in each
 *  case the last bodies in the file are the markers that say the seeker DIED OF
 *  PIERCE rather than ran out of targets — which is the only way a change to
 *  the 6 shows up as anything other than a number nobody reads.
 *
 *  Spacing 50 against a flower's 35.1 diameter, ending at 680 so the whole file
 *  is inside the arena rails and inside AIM_RANGE (750). A tier-4 seeker covers
 *  912 units in its life, comfortably past the end. */
const LEAD_PIERCE_FILE: readonly (readonly [EnemyKind, number, number])[] = file(
  'flower',
  [80, 130, 180, 230, 280, 330, 380, 430, 480, 530, 580, 630, 680],
);

/** Every body OUTSIDE AIM_RANGE (750), which is the only way to reach the
 *  lead's second rng shape.
 *
 *  `aimDir` draws ONCE when it has a target (the ±0.08 jitter) and TWICE when
 *  it does not (a whole random heading, then the jitter). Every other lead
 *  scenario in this file has a target, so without this one the untargeted
 *  branch is never taken and a module that drew the heading unconditionally —
 *  or skipped the jitter draw — would move nothing. `rngDraws` is the only
 *  channel that catches it.
 *
 *  It doubles as the cleanest statement of the gate: a base seeker's Infinity
 *  homing locks onto a ring member 800 units away and curves out to it, and a
 *  Neon Serpent's 320 leaves it blind for its whole life and it flies the
 *  random heading straight. Ring spacing is 419 on the arc, so separation never
 *  touches it. */
const LEAD_UNAIMED_RING: readonly (readonly [EnemyKind, number, number])[] = ring(
  'flower',
  800,
  12,
);

/** One body at `radius` from the player on the bearing `deg`. The clap is the
 *  first weapon whose footprint is ANGULAR AROUND THE PLAYER — a cone with a
 *  half-angle, not a circle, a strip or a travelling shot — so its fields are
 *  naturally written in polar coordinates and every other helper in this file
 *  reads awkwardly for it. */
function polar(
  kind: EnemyKind,
  radius: number,
  deg: number,
): readonly [EnemyKind, number, number] {
  return orbitOf(kind, 0, 0, radius, deg);
}

/** The same, around a point offset from the player. arcAt does this for a whole
 *  list of bearings; the clap's satellites are one body per bearing per
 *  distance, so a single-body form reads straight. */
function orbitOf(
  kind: EnemyKind,
  cx: number,
  cy: number,
  radius: number,
  deg: number,
): readonly [EnemyKind, number, number] {
  const a = (deg * Math.PI) / 180;
  return [kind, cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
}

/** THE CONE, read as two independent ladders — one angular, one radial.
 *
 *  The base clap is `damageCone`: a half-angle `arc` and a reach `radius`, both
 *  climbing per tier (0.65/0.72/0.80/0.90 rad = 37.24/41.25/45.84/51.57
 *  degrees; 80/88/98/108 units). Those are TWO SEPARATE NUMBERS and a field
 *  that only varied distance would read the reach ladder four times and the arc
 *  ladder never — halve every `arc` in the table and a purely radial field
 *  would not move a single line of the digest.
 *
 *  SWARMERS, radius 9, for the chord's reason sharpened. The angular rungs here
 *  are FOUR TO FIVE DEGREES apart, because that is how tightly the arc ladder
 *  itself is cut, and separation inside world.update(0) pushes any two bodies
 *  apart to the sum of their radii. A swarmer needs 18 between centres; a
 *  zombie needs 42.1 and a flower 35.1, and neither could hold two adjacent
 *  rungs apart at all.
 *
 *  THE ANCHOR at (46, 0) is load-bearing twice over. It is THE NEAREST BODY IN
 *  THE FIELD, so `aimDir` locks the cone's axis to exactly +x and every bearing
 *  below is a bearing off the axis rather than off a seed — the first cut of
 *  this field had a rung at radius 44 and the axis silently swung 48.7 degrees
 *  onto it, which collapsed the whole angular ladder into "one side hit, the
 *  other did not". NOTHING ELSE IN THIS FIELD MAY SIT INSIDE 46. And it sits
 *  OUTSIDE the 34-unit point-blank exemption, so it is an arc hit like
 *  everything else; the exemption gets its own field rather than contaminating
 *  this one.
 *
 *  THE ANGULAR LADDER, one rung per tier boundary. Rungs ALTERNATE SIDES of the
 *  axis and alternate radius, and both alternations are forced: at these radii
 *  a four-degree gap is under six units of arc, so two rungs on the same side at
 *  the same radius would be shoved into each other before anything fired.
 *  Every rung is well inside tier 1's reach, so distance is never the
 *  discriminator and the ONLY thing separating them is `arc`:
 *    +30   @ 85    every tier
 *    -39.2 @ 85    tiers 2, 3, 4     (t1's half-angle stops at 37.24)
 *    +43.5 @ 85    tiers 3, 4        (t2's stops at 41.25)
 *    -48.7 @ 60    tier 4 only       (t3's stops at 45.84)
 *    +58   @ 85    no tier reaches it
 *  The extra body at -30 @ 60 is the SYMMETRY WITNESS: it mirrors the +30 rung
 *  across the axis at a different distance, so "the cone is centred on the aim
 *  line" and "the cone is a half-plane" are told apart. The other rungs cannot
 *  be mirrored — a mirror of -48.7 would land 9.5 degrees from the +43.5 rung —
 *  and CLAP_POINT_BLANK_FIELD carries both sides at every bearing instead.
 *
 *  THE RADIAL LADDER, held at a constant +-12 degrees — well inside every
 *  tier's half-angle, so here the ANGLE is never the discriminator and only
 *  `radius` is. Cut against contact distances of 89/97/107/117 (reach + a
 *  swarmer's 9), the sign alternating so two consecutive rungs are 20 units
 *  apart rather than 10:
 *    85    every tier
 *    94    tiers 2, 3, 4
 *    105   tiers 3, 4
 *    114   tier 4 only
 *    124   no tier — the "the cone stopped here" marker
 *    145   no BASE tier, but inside a Wide-Lensed tier 4 (108 * 1.3 + 9 = 149.4)
 *    165   outside even that; the marker for the Wide Lens scenario
 *  applyBuild multiplies `radius` by areaMul and leaves `arc` alone, so those
 *  last two rungs are the only place in this file where that asymmetry is
 *  visible: with Wide Lens the reach ladder moves out and the angular ladder
 *  above does not move at all. */
const CLAP_CONE_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  polar('swarmer', 46, 0),
  polar('swarmer', 85, 30), polar('swarmer', 60, -30),
  polar('swarmer', 85, -39.2),
  polar('swarmer', 85, 43.5),
  polar('swarmer', 60, -48.7),
  polar('swarmer', 85, 58),
  polar('swarmer', 85, 12), polar('swarmer', 94, -12), polar('swarmer', 105, 12),
  polar('swarmer', 114, -12), polar('swarmer', 124, 12),
  polar('swarmer', 145, -12), polar('swarmer', 165, 12),
];

/** THE 34-UNIT POINT-BLANK EXEMPTION, from both sides.
 *
 *  `damageCone` has a branch no other weapon has: a body closer than 34 units
 *  is damaged REGARDLESS OF BEARING, so a clap swung at something in front also
 *  connects with whatever is hanging off the player's back. It is a bare
 *  literal in run.ts today and the extraction has to carry it out as a named
 *  stat; until then this field is the only thing that would notice it moving.
 *
 *  The cut is at 33.5 against 34.5, on bearings 115 to 175 degrees off the axis
 *  where NO tier's arc reaches:
 *    33.5 @ 175, 33.5 @ -85    hit, and only the exemption can explain it
 *    34.5 @ 115, 34.5 @ -120   one unit further out and not hit at all
 *  ONE UNIT APART, and it can be that tight because the cone resolves
 *  SYNCHRONOUSLY at fire time: these scenarios fire on the frame after the
 *  world is built, so no body has moved a millimetre from where this list puts
 *  it and there is no drift to leave margin for. A first cut at 33/36 left the
 *  whole interval [33, 36] free to move without moving the digest. Now anything
 *  outside (33.5, 34.5] shows up: 33.4 puts the first pair out of the
 *  exemption, 34.7 pulls the second pair into it.
 *
 *  The witness at (37, 0) is inside the arc AND outside the exemption, so it
 *  keeps recording a hit whichever way the 34 moves — the line that says the
 *  cone itself still works while the exemption is being probed. The anchor at
 *  17 is nearest, so the axis is +x as everywhere else; it is also inside the
 *  exemption, which is the ordinary case. The pair at 60 are out of reach on
 *  every count. */
const CLAP_POINT_BLANK_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  polar('swarmer', 17, 0),
  polar('swarmer', 33.5, 175), polar('swarmer', 33.5, -85),
  polar('swarmer', 37, 0),
  polar('swarmer', 34.5, 115), polar('swarmer', 34.5, -120),
  polar('swarmer', 60, 155), polar('swarmer', 60, -160),
];

/** TWO HANDS: the three-target cap, and the crush/tug ladder around one of the
 *  three.
 *
 *  The evolution picks `TWO_HANDS.targets` (3) nearest bodies and snaps a slab
 *  pair shut on each. Two constants decide what a closed pair does — a
 *  `pinchRadius` of 42 that damages, and a `tugRadius` of 96 that only drags —
 *  and they are read at DIFFERENT geometric gates: the crush is
 *  `circlesOverlap`, so it resolves at 42 + a body's radius, while the tug is a
 *  bare centre-distance compare against 96. A field that only measured one of
 *  them would leave the other free to move.
 *
 *  FLOWERS. The crush lands 0.12s (eight frames) after the trigger, at the
 *  position the target held WHEN IT FIRED, so every boundary in this field has
 *  to survive eight frames of the horde walking. A flower covers 1.19 units in
 *  that time; a zombie covers 5.94 and a swarmer 12.67, which is more than the
 *  margin some of these cuts have.
 *
 *  THE CAP: A at 100, B at 105, C at 110, on three bearings 120 degrees apart
 *  so no pinch's 96-unit tug can reach another's cluster (the closest pair is
 *  177 apart). Decoys sit at 280 and 340. Raise the 3 and a decoy grows a
 *  pincer; lower it and C loses one.
 *
 *  THE LADDER hangs off A only, at bearings inside [-90, 90] of +x from A so
 *  that every satellite is FARTHER FROM THE PLAYER than C is (120 to 201
 *  against C's 110) and none of them can steal a slot in the top three. Cut
 *  against contact at 42 + 17.544 = 59.54 and the tug's 96:
 *    52    crushed AND tugged
 *    70    outside the crush, still tugged  — the pin on 42
 *    96    tugged                           — the pin on 96 from inside
 *    99    neither                          — the pin on 96 from outside
 *
 *  THE LAST TWO ARE THREE UNITS APART and cannot honestly be closer. Unlike the
 *  cone, a pincer resolves EIGHT FRAMES after the trigger, and in those frames
 *  a flower creeps about 1.2 units toward the player — so a body placed at 96
 *  is at roughly 94.8 from the (fixed) pinch centre when the tug is measured,
 *  and one placed at 99 is at roughly 97.8. That leaves 96 pinned to the open
 *  interval (95, 97): tugRadius 94 or 98 moves the digest, 95 or 97 does not.
 *  Tighter cuts than that would be pinning the drift estimate, not the
 *  constant. `pinchRadius` needs no such care because it is echoed verbatim in
 *  the `slam` fx event and in the slab beam geometry; `tugRadius` reaches world
 *  state ONLY through which bodies were dragged, which is why it is the one
 *  Two Hands constant whose cuts had to be cut twice.
 *  A, B and C sit AT their own pinch centres when the trigger fires, and eight
 *  frames later they have crept 1.19 units off it. So each takes the crush and
 *  then a tug of `Math.min(TWO_HANDS.tug, d)` — 1.19, not 30. That clamp is
 *  only observable on a body this close to a pinch centre, and it is the reason
 *  the Heavy Amp row leaves those three knock vectors untouched while it grows
 *  every satellite's by a fifth: a clamped tug is not scaled by anything.
 *
 *  The same field reads a second time under Wide Lens, where areaMul 1.3 puts
 *  the crush at 54.6 (contact 72.1, so 52 AND 70 are crushed) and the tug at
 *  124.8 (so 88 AND 108 are dragged). Every rung changes category at once,
 *  which is what says both constants are scaled and neither is a literal. */
const CLAP_PINCH_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['flower', 100, 0],
  polar('flower', 105, 120), polar('flower', 110, -120),
  orbitOf('flower', 100, 0, 52, 80),
  orbitOf('flower', 100, 0, 70, -80),
  orbitOf('flower', 100, 0, 96, 30),
  orbitOf('flower', 100, 0, 99, -30),
  polar('flower', 280, -60), polar('flower', 340, 45),
];

/** Three targets close enough that their crushes OVERLAP, at natural hp.
 *
 *  `updateClapPinches` walks `clapPinches` BACKWARDS, so three pincers spawned
 *  by one trigger and closing on the same frame resolve LAST-SPAWNED FIRST —
 *  the reverse of the nearest-first order `nearestEnemies` handed out. While
 *  nothing dies that order is invisible; the moment a body sits inside two
 *  crushes and has 5 hp, it decides WHICH pinch is credited with the kill,
 *  which killsByRole entry moves first, and where in the ordered fx stream the
 *  drop lands. Reversing the loop would rewrite this scenario and nothing else
 *  in the file.
 *
 *  SWARMERS at their natural 5 hp against a tier-4 crush of 6 * 1.52 = 9.12, so
 *  every body the crush reaches dies on the frame it is reached. The three
 *  targets are 46 to 100 apart — inside each other's 59.54 crush contact, so
 *  each of them is in two or three crushes at once — and the pair hanging off
 *  the first at 45 and 68 straddle the swarmer crush contact of 51. */
const CLAP_CLUSTER_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['swarmer', 100, 0],
  ['swarmer', 104, 46], ['swarmer', 96, -50],
  orbitOf('swarmer', 100, 0, 45, 20),
  orbitOf('swarmer', 100, 0, 68, -15),
  ['swarmer', 260, 0],
];

/** Every body outside AIM_RANGE (750), which is the only way to reach the
 *  clap's SECOND rng shape — and, on the evolution, its only empty-field
 *  branch.
 *
 *  `aimDir` draws once with a target and TWICE without, so a module that drew
 *  unconditionally would move nothing anywhere else in this block; `rngDraws`
 *  is the only channel that catches it. The base cone then swings at a random
 *  heading and connects with nothing.
 *
 *  On Two Hands the same field reaches a branch with no other cover at all:
 *  `nearestEnemies` comes back empty and the weapon claps AHEAD OF THE PLAYER
 *  at `TWO_HANDS.openGap` (74) along the aim line instead of eating the
 *  trigger. Nothing is damaged, so the pin is entirely in the fx stream — the
 *  slab beams are drawn at `pinch.gap` off the centre, so the 74 appears twice
 *  in the recorded coordinates and moving it moves both. */
const CLAP_FAR_RING: readonly (readonly [EnemyKind, number, number])[] = ring(
  'flower',
  820,
  4,
);

/** Bodies that take the OTHER branches through damageEnemy and shove: a ghost
 *  has knockbackMul 0 and cannot be shoved at all, a shielded body spends its
 *  shield pool before its hp. Hand-placed rather than remapped from
 *  CLAP_CONE_FIELD because both are far wider than a swarmer and separation
 *  would collapse that field's degree-scale rungs. The ghost at 45 is nearest,
 *  so the axis is +x; the shielded body at 200 is the out-of-reach witness. */
const CLAP_TOUGH_FIELD: readonly (readonly [EnemyKind, number, number])[] = [
  ['ghost', 45, 0],
  ['shielded', 95, 25],
  ['ghost', 62, -58],
  ['shielded', 200, 0],
];

export const SCENARIOS: readonly ParityScenario[] = [
  // ---- the kick, solo, across the whole tier ladder -----------------------
  // One block per tier because the ladder is not one shape scaled four ways:
  // tier 1 is a single strip, tiers 2+ add the opposite-side follow-up, and
  // tiers 3/4 widen the area. A damage-ladder edit that touches one rung has to
  // move exactly one of these.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `kick base tier ${tier}, solo, damage meter`,
    seed: 0x5eed00 + tier,
    weapons: [['kick', tier]],
    enemies: KICK_FIELD,
    // Absurd hp turns every enemy into a damage meter. A target that dies hides
    // exactly the difference this scenario exists to catch: halve the damage
    // and a one-hit kill is still a one-hit kill.
    hp: 1e6,
    steps: [{ fire: 'kick' }, { frames: 30 }],
  })),

  // The same ladder with natural hp, so kills, killsByRole, gem/note drops and
  // the rng draws behind them are all in the digest. This is the half of the
  // coverage the damage-meter scenarios deliberately give up.
  ...([1, 4] as const).map((tier): ParityScenario => ({
    name: `kick base tier ${tier}, solo, lethal`,
    seed: 0x11e70 + tier,
    weapons: [['kick', tier]],
    enemies: KICK_FIELD,
    steps: [{ fire: 'kick' }, { frames: 30 }],
  })),

  // Repeated triggers: per-strike dedup means each new trigger hits fresh, and
  // overlapping strikes from a fast beat grid must not merge or double-count.
  {
    name: 'kick base tier 4, four triggers on a beat grid',
    seed: 0xbea7,
    weapons: [['kick', 4]],
    enemies: KICK_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'kick' }, { frames: 7 },
      { fire: 'kick' }, { frames: 7 },
      { fire: 'kick' }, { frames: 7 },
      { fire: 'kick' }, { frames: 30 },
    ],
  },

  // ---- Redline Stomp ------------------------------------------------------
  {
    name: 'kick evolved (Redline Stomp), damage meter',
    seed: 0x2ed011,
    weapons: [['kick', 4]],
    items: [['highTops', 5]],
    evolved: ['kick'],
    enemies: [
      ...KICK_FIELD,
      // Out on the arms and in a corner: the cross reaches the first and must
      // not reach the second.
      ['zombie', 600, 0],
      ['zombie', 0, 300],
      ['zombie', 500, 300],
    ],
    hp: 1e6,
    steps: [{ fire: 'kick' }, { frames: 20 }],
  },
  {
    name: 'kick evolved (Redline Stomp), lethal, splitters',
    seed: 0x2ed012,
    weapons: [['kick', 4]],
    items: [['highTops', 5]],
    evolved: ['kick'],
    // Splitters push children mid-pass, and Redline Stomp iterates the LIVE
    // enemy array, so its own kills grow the collection it is walking. Pinning
    // that is pinning both the hits and every rng draw behind them.
    enemies: [
      ['splitter', 60, 0],
      ['splitter', 140, 0],
      ['splitter', 0, 120],
      ['zombie', 300, 0],
    ],
    steps: [{ fire: 'kick' }, { frames: 30 }],
  },

  // ---- mid-evolve ---------------------------------------------------------
  // Evolving with a base strip STILL IN FLIGHT. The mode is a live getter over
  // RunWorld.evolved, so the in-flight strip keeps ticking as a base strip
  // while the next trigger resolves as a stomp. That seam has no other cover.
  {
    name: 'kick mid-evolve with a base strip in flight',
    seed: 0x91d3,
    weapons: [['kick', 4]],
    items: [['highTops', 5]],
    enemies: KICK_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'kick' },
      { frames: 4 },
      { evolve: 'kick' },
      { frames: 4 },
      { fire: 'kick' },
      { frames: 30 },
    ],
  },

  // ---- the kick in a band -------------------------------------------------
  // The migration's real risk is not the module in isolation; it is the module
  // sharing a frame with eight weapons that have not moved yet. Phase order,
  // the shared spatial hash, the shared rng stream and damage attribution are
  // all only under test when something else is firing in the same frame.
  {
    name: 'kick in a full band, base, damage meter',
    seed: 0xba9d1,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: KICK_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 60 },
    ],
  },
  {
    name: 'kick in a full band, base, lethal',
    seed: 0xba9d2,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: KICK_FIELD,
    steps: [
      { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 60 },
    ],
  },
  {
    name: 'kick in a full evolved band, loaded build',
    seed: 0xba9d3,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    // Every evolution item at max, so the build multipliers applyBuild folds in
    // — and buildMods.knockbackMul, which Redline Stomp reads and the base
    // strip deliberately does not — are all non-identity.
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: KICK_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 60 },
    ],
  },

  // Knockback-immune and shielded bodies take different branches through
  // damageEnemy and through the kick's two asymmetric knock paths.
  {
    name: 'kick base tier 4 against shielded and knock-immune bodies',
    seed: 0x5b1e1d,
    weapons: [['kick', 4]],
    enemies: [
      ['shielded', 40, 0],
      ['shielded', 110, 0],
      ['ghost', 40, 20],
      ['ghost', 110, -20],
    ],
    hp: 1e6,
    steps: [{ fire: 'kick' }, { frames: 30 }],
  },

  // ==========================================================================
  // THE ARP (#140)
  // ==========================================================================
  // Recorded BEFORE the extraction, on the unchanged run.ts, per the order at
  // the top of this file. The arp is the migration's stress test: unlike the
  // kick it owns no pass of its own, so almost all of its behavior lives in
  // the SHARED projectile loop as `pr.role === 'arp'` branches — orbit motion,
  // the timer re-hit, the pierce exemption, the arena-rail exemption. None of
  // that is reachable from a fake context, and none of it moves the digest
  // unless a scenario actually sweeps something.

  // ---- the orbit, solo, across the whole tier ladder ----------------------
  // The ladder is a geometry ladder, not just a damage ladder: the orbit
  // radius grows 80 -> 92 -> 106 -> 122 and the lifetime 2.0s -> 3.2s, so each
  // tier sweeps a different ring for a different number of turns. Ending
  // mid-flight is deliberate: a live orbiter's digested x,y IS its orbit
  // angle, so ARP_OMEGA is under test through position, not just damage.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `arp base tier ${tier}, solo, damage meter`,
    seed: 0xa2b000 + tier,
    weapons: [['arp', tier]],
    enemies: ARP_FIELD,
    hp: 1e6,
    steps: [{ fire: 'arp' }, { frames: 100 }],
  })),

  // The same ladder with natural hp, so kills, drops and the rng draws behind
  // them are in the digest. Bats die to a single touch, so this pins WHICH
  // enemies an orbiter reaches and in what ORDER; the chip-kill coverage that
  // needs a target to survive several touches lives in the parked scenarios
  // below.
  ...([1, 4] as const).map((tier): ParityScenario => ({
    name: `arp base tier ${tier}, solo, lethal`,
    seed: 0xa2b100 + tier,
    weapons: [['arp', tier]],
    enemies: [...ring('bat', 80, 8), ...ring('bat', 122, 8, Math.PI / 8), ['zombie', 45, 0]],
    steps: [{ fire: 'arp' }, { frames: 200 }],
  })),

  // ---- the timer re-hit (ADR-0002) ----------------------------------------
  // WHY CIRCLERS. Every other enemy charges the player, so it crosses the
  // swept band once and is gone — a target that leaves can only ever be hit
  // once, and a scenario built on one is blind to the re-hit rule it claims to
  // cover. The circler is the only body in the bestiary that HOLDS a radius
  // (CIRCLER.orbitR = 150) and sweeps tangentially instead, so it is the only
  // way to park something inside the orbit and leave it there.
  //
  // Wide Lens pushes the tier-4 orbit out to 122 * 1.15 ~= 140 and fattens the
  // orbiter to radius 13, which puts the 150 ring inside the swept band;
  // Extension Cable stretches the lifetime to ~4.5s, about 2.4 turns. Spins
  // are +-1 per circler off the run rng, so some co-rotate with the orbiter
  // (slow relative sweep, long dwell) and some counter-rotate (fast, short) —
  // both relationships to ORBIT_REHIT_S in one scenario.
  {
    name: 'arp base tier 4, timer re-hit against circlers parked on the orbit',
    seed: 0x0a2b17,
    weapons: [['arp', 4]],
    items: [['wideLens', 5], ['extensionCable', 5]],
    enemies: ring('circler', 150, 10),
    hp: 1e6,
    steps: [{ fire: 'arp' }, { frames: 280 }],
  },
  // The same field with the circlers' natural 10hp against tier-4's 3 damage:
  // four chips to a kill. Now the re-hit INTERVAL is not just a damage total,
  // it is which frame each circler dies on, which gem drops when, and every
  // rng draw downstream of that. One extra or one missing clear per second
  // reorders the whole tail of the scenario.
  {
    name: 'arp base tier 4, chip-kills circlers on the re-hit timer',
    seed: 0x0a2b18,
    weapons: [['arp', 4]],
    items: [['wideLens', 5], ['extensionCable', 5]],
    enemies: ring('circler', 150, 10),
    steps: [{ fire: 'arp' }, { frames: 280 }],
  },
  // Several orbiters layered on a beat grid, so re-hit windows from different
  // spawn phases interleave over the same parked bodies. Each orbiter carries
  // its OWN hit set and its OWN rehit countdown; a refactor that hoists either
  // onto the weapon instead of the projectile collapses them into one shared
  // schedule and this scenario moves.
  {
    name: 'arp base tier 4, four triggers on a beat grid over parked circlers',
    seed: 0x0a2b19,
    weapons: [['arp', 4]],
    items: [['wideLens', 5], ['extensionCable', 5]],
    enemies: ring('circler', 150, 10),
    hp: 1e6,
    steps: [
      { fire: 'arp' }, { frames: 11 },
      { fire: 'arp' }, { frames: 11 },
      { fire: 'arp' }, { frames: 11 },
      { fire: 'arp' }, { frames: 260 },
    ],
  },

  // ---- the base fan: Double Take WITHOUT the evolution ---------------------
  // spawnOrbiters' fan loop had NO coverage before this. Both Double Take
  // scenarios in this file set evolved:['arp'], so every one of them ran
  // fireEventHorizon and the BASE spawner never once ran with count > 1. That
  // left the arp's most delicate contract untested: exactly ONE rng draw per
  // trigger, no matter how many orbiters the trigger produces, with the copies
  // spaced evenly around the ring from that single angle. Moving
  // `const baseAngle = ctx.rng() * Math.PI * 2` from above the fan loop to
  // inside it — the mutation the header above calls the single easiest thing to
  // get wrong — passed all 35 scenarios. It fails here, twice over: the three
  // orbiters no longer sit 120 degrees apart on one ring, and the arp starts
  // drawing three times per trigger instead of once, which moves rngDraws and
  // therefore desynchronizes every draw the rest of the run makes.
  //
  // Double Take clamps at level 2 (systems-check pins extraProjectiles === 2),
  // so this is 3 orbiters per trigger, 120 degrees apart. Two triggers, so the
  // second trigger's independent draw is in the digest as well.
  {
    name: 'arp base tier 4 with Double Take, three orbiters from one draw',
    seed: 0x0a2b1d,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5], ['doubleTake', 5]],
    enemies: [...ring('circler', 122, 12), ...ring('zombie', 80, 6)],
    hp: 1e6,
    steps: [
      { fire: 'arp' }, { frames: 40 },
      { fire: 'arp' }, { frames: 220 },
    ],
  },

  // ---- the pierce exemption (ADR-0002) ------------------------------------
  // Twenty circlers parked on the orbit and one orbiter that must sweep all of
  // them, repeatedly, without being consumed. maxPierce on an orbiter is 1 —
  // the spawner overwrites pierce with Infinity after baseProjectile has
  // already defaulted maxPierce from the (absent) conf.pierce — so a single
  // shared `pr.pierce -= 1` reaching this orbiter kills it on its FIRST touch,
  // one hit into a scenario that records dozens.
  //
  // Needle Tips at max is in the build on purpose. It is pierce-only since
  // #145 and the arp's ladder carries no pierce key, so it must stay a total
  // no-op here (ADR-0002's "consequences"). It is also exactly what would mask
  // a regression: with +5 pierce a wrongly-pierce-spending orbiter survives
  // five hits instead of one and still looks vaguely alive. Twenty parked
  // targets over 2.4 turns is far past anything +5 can cover.
  {
    name: 'arp base tier 4, pierce exemption through parked circlers',
    seed: 0x0a2b91,
    weapons: [['arp', 4]],
    items: [['wideLens', 5], ['extensionCable', 5], ['needleTips', 5]],
    enemies: ring('circler', 150, 20),
    hp: 1e6,
    steps: [{ fire: 'arp' }, { frames: 280 }],
  },
  // Big slow bodies rather than parked ones: an elite is radius 34, so the
  // swept band is wide enough that a pass DWELLS inside one instead of
  // clipping it. Different dwell-vs-interval relationship from the circlers,
  // and it keeps a non-circler body in the re-hit coverage in case circler
  // steering itself ever changes.
  {
    name: 'arp base tier 4, sweeping a ring of elites',
    seed: 0x0a2b92,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5]],
    enemies: ring('elite', 122, 8),
    hp: 1e6,
    steps: [{ fire: 'arp' }, { frames: 280 }],
  },

  // ---- Event Horizon ------------------------------------------------------
  // The evolved orbit is a different shape, not a bigger one: counter-rotating
  // PAIRS, a radius that breathes 100..150 off pr.age instead of the stored
  // orbitRadius, 1.25x size, 1.35x lifetime, 0.8x damage, and its own 0.45s
  // re-hit instead of 0.35s. Rings at 100, 125 and 150 sit on the inner, mid
  // and outer extremes of that breath, so the oscillation itself is in the
  // digest — a mid-radius-only field would look identical to a fixed orbit.
  {
    name: 'arp evolved (Event Horizon), damage meter',
    seed: 0x0e40e1,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5]],
    evolved: ['arp'],
    enemies: [
      ...ring('zombie', 100, 6),
      ...ring('zombie', 125, 6, Math.PI / 6),
      ...ring('zombie', 150, 6, Math.PI / 3),
      ['zombie', 45, 0],
      ['zombie', 210, 0],
    ],
    hp: 1e6,
    steps: [{ fire: 'arp' }, { frames: 200 }],
  },
  // Event Horizon re-hits on 0.45s, not ORBIT_REHIT_S's 0.35s — a second,
  // separate interval that the extraction has to keep separate. Circlers park
  // at 150, which is exactly the outer extreme of the evolved breath, so the
  // pair only reaches them at the top of each oscillation: the re-hit timer
  // and the radius oscillation gate each other here, and neither one alone
  // explains the recorded damage.
  {
    name: 'arp evolved (Event Horizon), 0.45s re-hit against parked circlers',
    seed: 0x0e40e2,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5]],
    evolved: ['arp'],
    enemies: ring('circler', 150, 10),
    hp: 1e6,
    steps: [{ fire: 'arp' }, { frames: 280 }],
  },
  {
    name: 'arp evolved (Event Horizon), chip-kills parked circlers',
    seed: 0x0e40e4,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5]],
    evolved: ['arp'],
    enemies: ring('circler', 150, 10),
    steps: [{ fire: 'arp' }, { frames: 280 }],
  },
  {
    name: 'arp evolved (Event Horizon), lethal, splitters',
    seed: 0x0e40e3,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5]],
    evolved: ['arp'],
    // hp 6 against 2.4 evolved damage: three chips and a splitter bursts. So
    // the re-hit cadence decides the FRAME each burst happens on, and each
    // burst pushes four swarmers into the live enemy array that an
    // never-dying orbiter then keeps sweeping — the collection grows under
    // the loop that is walking it.
    enemies: [...ring('splitter', 125, 6), ...ring('circler', 150, 4, 0.5)],
    hp: 6,
    steps: [{ fire: 'arp' }, { frames: 240 }],
  },

  // ---- the orbiter cap ----------------------------------------------------
  // Event Horizon retires its oldest evolved orbiters down to 24 whenever a
  // trigger pushes the count past it. Both ways of reaching the cap are here
  // because they exercise different halves of the while-loop: creeping up on
  // it two at a time, and blowing straight through it. Note the cap counts
  // EVOLVED arp orbiters only, and splices by identity out of the shared
  // projectile array — the inline 24 becomes a named stat in the extraction,
  // and if that stat is read against the wrong population these move.
  {
    name: 'arp evolved, orbiter cap reached two at a time',
    seed: 0x0ca900,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5]],
    evolved: ['arp'],
    enemies: ring('zombie', 125, 8),
    hp: 1e6,
    steps: [
      ...Array.from({ length: 15 }, () => [{ fire: 'arp' as const }, { frames: 3 }]).flat(),
      { frames: 30 },
    ],
  },
  {
    name: 'arp evolved with Double Take, cap overshot by a whole trigger',
    seed: 0x0ca901,
    weapons: [['arp', 4]],
    // THE ARITHMETIC, because the version of this scenario before the #140
    // follow-up got it wrong and the wrong number was load-bearing. Double Take
    // CLAMPS AT LEVEL 2 (systems-check pins extraProjectiles === 2), so a
    // trigger is 3 pairs = 6 orbiters — not the 6 pairs / 12 orbiters the old
    // comment claimed. At 6 per trigger, three triggers reach 18 against a cap
    // of 24 and the retire loop never ran at all: the scenario was named for
    // an overshoot it could not produce, and disabling the cap outright left
    // it green.
    //
    // FIVE triggers. Four land exactly 24 — ON the cap, which retires nothing,
    // pinning the boundary as > and not >= — and the fifth lands 30, so one
    // pass retires SIX orbiters and the while-loop genuinely loops. The frame
    // gaps stay short so nothing expires on its own and every retirement is
    // the cap's doing.
    items: [['extensionCable', 5], ['doubleTake', 5]],
    evolved: ['arp'],
    enemies: ring('zombie', 125, 8),
    hp: 1e6,
    steps: [
      { fire: 'arp' }, { frames: 4 },
      { fire: 'arp' }, { frames: 4 },
      { fire: 'arp' }, { frames: 4 },
      { fire: 'arp' }, { frames: 4 },
      { fire: 'arp' }, { frames: 40 },
    ],
  },

  // ---- mid-evolve ---------------------------------------------------------
  // A base orbiter still in the air when the arp evolves. pr.evolved is frozen
  // at spawn, so that orbiter keeps its stored orbitRadius, its 0.35s re-hit
  // and its base damage while the next trigger's Event Horizon pairs breathe
  // around it on 0.45s. Base and evolved arp behavior coexist in the same
  // shared loop, in the same frame, on the same role — the single seam most
  // likely to be "simplified" into one mode flag by the extraction.
  {
    name: 'arp mid-evolve with a base orbiter still circling',
    seed: 0x0a2ed0,
    weapons: [['arp', 4]],
    items: [['extensionCable', 5]],
    enemies: ARP_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'arp' },
      { frames: 30 },
      { evolve: 'arp' },
      { frames: 6 },
      { fire: 'arp' },
      { frames: 150 },
    ],
  },

  // ---- the arp in a band --------------------------------------------------
  // Ordering. The orbiter is the longest-lived thing any weapon spawns and it
  // shares the shared projectile array, the shared spatial hash and the shared
  // rng stream with eight weapons that have not moved yet. The arp draws
  // exactly ONE rng value per trigger (its base orbit angle) no matter how
  // many orbiters that trigger produces — the single easiest thing to get
  // wrong by moving the draw inside the fan loop, and invisible to everything
  // except rngDraws.
  {
    name: 'arp in a full band, base, damage meter',
    seed: 0x0a2ba1,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: ARP_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'arp' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' },
      { fire: 'bell' },
      { frames: 120 },
    ],
  },
  {
    name: 'arp in a full band, base, lethal',
    seed: 0x0a2ba2,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: ARP_FIELD,
    steps: [
      { fire: 'arp' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' },
      { fire: 'bell' },
      { frames: 120 },
    ],
  },
  {
    name: 'arp in a full evolved band with Double Take',
    seed: 0x0a2ba3,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    // Every evolution item at max PLUS Double Take, which the kick's loaded
    // band deliberately leaves out. extraProjectiles (2, clamped) and
    // orbitDistanceMul are both non-identity here, so the arp's fan count and
    // its built orbit radius are both off their defaults — and so are the fan
    // counts of the eight unmigrated weapons firing alongside it.
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5], ['doubleTake', 5],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: ARP_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'arp' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' },
      { fire: 'bell' },
      { frames: 120 },
    ],
  },

  // ==========================================================================
  // THE SNARE (#141)
  // ==========================================================================
  // Recorded BEFORE the extraction, on the unchanged run.ts, per the order at
  // the top of this file.
  //
  // The snare is the third shape the migration has met. The kick owned a pass
  // of its own; the arp owned the shared projectile loop through
  // ProjectileBehavior. The snare owns NEITHER in its base form — it spawns
  // plain shots that ride shared physics unchanged — and its whole identity
  // splits across four places instead:
  //
  //   1. a pierce LADDER (2/3/4/6), spent by the shared pierce rule;
  //   2. WEAPON_SHOVE.snare = 8, read inside the shared projectile loop from a
  //      role-keyed table (config.ts), one of the two allowlisted role-keyed
  //      tables in systems-check's INTERIM_EXCEPTIONS;
  //   3. SPARK_HIT_ROLES containing 'snare', a second role-keyed table read in
  //      the same loop, pushing a view-only spark per hit;
  //   4. Railshot, which spawns no projectile at all — an instant damageLine
  //      with NO pierce budget in the arithmetic anywhere.
  //
  // Items 2 and 3 are invisible to the world's entity arrays except through the
  // knock channel and the ordered fx stream, and both of those are digested, so
  // every scenario below that lands a base hit is also pinning them. That is
  // deliberate: the extraction moves both into the module (a field on the shot
  // for the shove, ctx.fx for the spark) and neither has any other cover.

  // ---- the pierce ladder, solo, across the whole tier ladder ---------------
  // One block per tier because the snare's ladder is a PIERCE ladder as much as
  // a damage one: 2 -> 3 -> 4 -> 6 bodies per shot against damage 5 -> 7 -> 9
  // -> 13. Against SNARE_FILE with absurd hp, each rung has a different, exact
  // total (10 / 21 / 36 / 78) and a different count of shoved, sparked bodies,
  // so an edit to either half of the ladder moves exactly one of these.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `snare base tier ${tier}, solo, pierce ladder`,
    seed: 0x50a000 + tier,
    weapons: [['snare', tier]],
    enemies: SNARE_FILE,
    // Absurd hp turns the file into a damage meter AND keeps every body in the
    // file alive, which is what makes the pierce count readable: a body that
    // dies is skipped by nothing here, but a body that dies stops recording the
    // knock the shove gave it.
    hp: 1e6,
    steps: [{ fire: 'snare' }, { frames: 60 }],
  })),

  // The same ladder with natural hp, so kills, killsByRole, gem/note drops and
  // the rng draws behind them are all in the digest. Zombies at 10hp against
  // tier 1's 5 survive a touch and against tier 4's 13 do not, so the two rungs
  // record genuinely different tails. The file is seven long: six is tier 4's
  // pierce budget, so the seventh is the "the shot stopped here" marker.
  ...([1, 4] as const).map((tier): ParityScenario => ({
    name: `snare base tier ${tier}, solo, lethal file`,
    seed: 0x50a100 + tier,
    weapons: [['snare', tier]],
    enemies: file('zombie', [55, 100, 145, 190, 235, 280, 325]),
    steps: [{ fire: 'snare' }, { frames: 60 }],
  })),

  // Four triggers on a beat grid. Each shot carries its OWN hit set and its OWN
  // pierce budget; a refactor that hoists either onto the weapon collapses four
  // independent budgets into one shared one and this scenario moves. The gaps
  // are short enough that all four shots are in the air together, so the file
  // is being pierced by several shots at once.
  {
    name: 'snare base tier 4, four triggers on a beat grid',
    seed: 0x50a17,
    weapons: [['snare', 4]],
    enemies: SNARE_FILE,
    hp: 1e6,
    steps: [
      { fire: 'snare' }, { frames: 6 },
      { fire: 'snare' }, { frames: 6 },
      { fire: 'snare' }, { frames: 6 },
      { fire: 'snare' }, { frames: 60 },
    ],
  },

  // ---- the aim draw --------------------------------------------------------
  // aimDir has two branches and they draw a DIFFERENT NUMBER OF TIMES: with a
  // target inside AIM_RANGE (750) it draws once, for the jitter; with an empty
  // screen it draws twice, once for a random heading and once for the jitter.
  // Every other snare scenario here takes the first branch. This one takes the
  // second — the ring sits at 800, outside AIM_RANGE — so the draw count is
  // pinned on both sides and rngDraws catches a module that forgets the empty
  // -screen roll. Stopping at 60 frames leaves the shot LIVE, and a live shot's
  // digested x,y IS the random heading it rolled.
  {
    name: 'snare base tier 4, no target in aim range, random heading',
    seed: 0x50a2a1,
    weapons: [['snare', 4]],
    enemies: ring('zombie', 800, 16),
    hp: 1e6,
    steps: [{ fire: 'snare' }, { frames: 60 }],
  },

  // ---- the fan -------------------------------------------------------------
  // Double Take clamps at level 2, so a trigger is 3 shots. aimFan aims ONCE
  // and fans around that heading, so the whole trigger costs the same rng draws
  // as a single shot — the same "move the draw inside the loop" mistake the arp
  // block calls out, in the weapon that actually goes through aimFan. Two
  // triggers, so the second trigger's independent draw is recorded too.
  //
  // CONCENTRIC RINGS, not a file: the fanned shots leave on headings +-7
  // degrees off the aim line, so a file down one axis is a field only the
  // middle shot can see. Three rings also keep every body clear of every other
  // — ring members are 78 units apart at the innermost radius against a
  // zombie's 21 — so nothing here is moved by the separation pass and the
  // three shots really do diverge across a field they each reach.
  {
    name: 'snare base tier 4 with Double Take, one aim draw fans three shots',
    seed: 0x50a2fa,
    weapons: [['snare', 4]],
    items: [['doubleTake', 2]],
    enemies: [
      ...ring('zombie', 150, 12),
      ...ring('zombie', 300, 12, Math.PI / 12),
      ...ring('zombie', 460, 12),
    ],
    hp: 1e6,
    steps: [
      { fire: 'snare' }, { frames: 20 },
      { fire: 'snare' }, { frames: 60 },
    ],
  },

  // ---- shared physics the base snare rides unchanged ----------------------
  // Base snare shots take shared travel AND the arena rails, which is the half
  // of ProjectileBehavior the snare must NOT implement: an extraction that
  // gives the snare a steer() returning true silently exempts it from the rails
  // exactly the way the arp is exempted, and nothing but a bouncing shot
  // notices. Mirrorball at 5 is 3 bounces at 85% retention; Fast Forward
  // doubles the speed so the shot actually reaches a rail inside its 1.5s life.
  // The rails sit at +-739 x and +-416 y for this canvas, and the aim anchor
  // out on the diagonal sends the shot into the y rail first.
  {
    name: 'snare base tier 4 with Mirrorball, shots ride the arena rails',
    seed: 0x50a80c,
    weapons: [['snare', 4]],
    items: [['mirrorball', 5], ['fastForward', 5]],
    enemies: [
      ['zombie', 300, 300],
      ...ring('zombie', 520, 12),
      ...ring('zombie', 700, 12, Math.PI / 12),
    ],
    hp: 1e6,
    steps: [{ fire: 'snare' }, { frames: 70 }],
  },

  // ==========================================================================
  // RAILSHOT
  // ==========================================================================
  // A different weapon wearing the same role: no projectile, no travel, no
  // pierce budget. One damageLine of length 900 and half-width max(7, radius *
  // 1.25) fired from the player along the aim heading, at 1.50x damage, shoving
  // 16 * knockbackMul. It walks `this.enemies` in ARRAY ORDER, not hash order
  // and not distance order, so the order of its damage (and of every rng draw a
  // kill triggers) is the spawn order of the field.

  // ---- the beam's geometry -------------------------------------------------
  // ONE trigger, so triggerCounts.snare is 1 and the twin rails deliberately do
  // NOT fire — this is the single-beam shape, and it is also what proves the
  // every-fourth rule is a rule and not "always".
  //
  // MIND THE SEPARATION PASS. The harness runs one world.update(0) to build the
  // spatial hash before anything fires, and that update also runs enemy-enemy
  // separation, which SHOVES OVERLAPPING BODIES APART before the first trigger
  // ever lands. Any two bodies placed closer than the sum of their radii are
  // therefore not where this list says they are. The first version of this
  // scenario bracketed the 900 with two elites 20 apart; radius 34 each, so
  // separation pushed them to 896 and 964 and the bracket silently widened to
  // +-30. It still LOOKED like a range pin, and changing 900 to 880 passed it.
  // Every pair below is spaced past the sum of its radii on purpose.
  //
  // THE PINS, against tier 4 (conf.radius 8, so half-width max(7, 10) = 10).
  // The reach cut is at along <= 900 + radius, so for a circler (radius 10) it
  // falls at 910:
  //   circler at 870   comfortably inside the reach
  //   circler at 895   inside, and only 15 short of the cut
  //   circler at 920   outside, and only 10 past it
  //   circler diameter is 20 and they sit 25 apart, so separation leaves them
  //   alone and the bracket really is 15 wide
  //   swarmer +-24     lateral 24 > 10 + 9, outside the single beam; these are
  //                    the bodies the twin rails exist to reach, and on a first
  //                    trigger they must come through untouched
  //   swarmer at 30    the aim anchor, nearest body, so the heading is ~0
  // Aim jitter is +-0.02 rad here (Railshot aims tighter than the base shot),
  // which is 18 units of lateral drift out at 900 against a circler's 10 plus
  // the beam's 10, so the three on-axis bodies stay inside the beam's width and
  // only their RANGE decides them.
  {
    name: 'snare evolved (Railshot), single beam, 900-range and width pins',
    seed: 0x2a115e,
    weapons: [['snare', 4]],
    items: [['fastForward', 5]],
    evolved: ['snare'],
    enemies: [
      ['swarmer', 30, 0],
      ['circler', 870, 0],
      ['circler', 895, 0],
      ['circler', 920, 0],
      ['swarmer', 200, 24],
      ['swarmer', 200, -24],
      ['zombie', 400, 0],
      ['zombie', -300, 0],
    ],
    hp: 1e6,
    steps: [{ fire: 'snare' }, { frames: 30 }],
  },

  // ---- every fourth trigger ------------------------------------------------
  // FOUR FIRES WITH NO FRAMES BETWEEN THEM, on purpose. The twin rails are
  // offset +-24 units perpendicular to the heading and are only 7 half-widths
  // wide, so the bodies that separate "twin fired" from "twin did not" sit in a
  // band a few units thick — and a single frame of enemy movement is wider than
  // that band. Firing all four inside one frame freezes the field at exactly
  // the placed geometry, which is the only way the boundary pins below mean
  // anything. triggerCounts increments before the switch, so the FOURTH fire is
  // the one where count % 4 === 0.
  //
  // THE PINS, at tier 4 (main half-width 10, twin half-width 7 at offset 24,
  // swarmer radius 9, so a twin reaches out to 24 + 16 = 40):
  //   +-24 at x 200    main misses (24 > 19), twin hits dead centre
  //   +39.5 at x 20    main misses; distance from the +24 rail is 15.5, so the
  //                    twin's 7 + the body's 9 = 16 just reaches it
  //   -40.5 at x 20    main misses; distance from the -24 rail is 16.5, just
  //                    past the same 16
  // HALF-UNIT OFFSETS, deliberately. The first version of these pins sat at 39
  // and 41, one unit either side, and that put the inside pin at a distance of
  // exactly 15 — which is still inside a twin half-width of 6. Shrinking the
  // 0.7 twin-width multiplier to 0.6 therefore changed nothing anywhere and the
  // mutation passed green. Landing the pins at 15.5 and 16.5 puts the boundary
  // BETWEEN them instead of on top of one, so the rule flips in both directions
  // for the smallest change either constant can take.
  //
  // The inside pin and the outside pin sit on OPPOSITE rails, which is not
  // decoration: they are one unit apart in lateral offset, and two swarmers
  // (radius 9) that close get shoved apart by the separation pass in
  // world.update(0) long before the first trigger, which would move the very
  // boundary they exist to hold. On opposite rails they are 80 apart and stay
  // put, and the two rails are exact mirror images, so one body per side pins
  // the same number. Both sit at x 20, not further out, so the +-0.02 aim
  // jitter has a lever arm of under half a unit on them; the aim anchor at x 30
  // is still the nearest body (30 < 44.3) so it, not one of them, sets the
  // heading.
  //
  // Twin damage is 0.65x the main beam's and twin shove is 8 against the main
  // 16, so the two rails are separable in the digest by damage AND by knock —
  // a body reached only by a twin records the smaller of each.
  {
    name: 'snare evolved (Railshot), fourth trigger fires the twin rails',
    seed: 0x2a114a,
    weapons: [['snare', 4]],
    items: [['fastForward', 5]],
    evolved: ['snare'],
    enemies: [
      ['swarmer', 30, 0],
      ['swarmer', 200, 24],
      ['swarmer', 200, -24],
      ['swarmer', 20, 39.5],
      ['swarmer', 20, -40.5],
      ['zombie', 500, 0],
    ],
    hp: 1e6,
    steps: [
      { fire: 'snare' }, { fire: 'snare' }, { fire: 'snare' }, { fire: 'snare' },
      { frames: 30 },
    ],
  },

  // ---- infinite pierce is INFINITE ----------------------------------------
  // Railshot's reach is not a large pierce number, it is the ABSENCE of one:
  // damageLine has no pierce arithmetic at all. Fifteen zombies in single file
  // out to x 900 is past anything a number would plausibly be, so an extraction
  // that "helpfully" states the infinity as a stat and then feeds it through a
  // finite path fails here and nowhere else.
  //
  // Needle Tips at max is in the build for the same reason ADR-0002's arp
  // scenario carries it: +5 pierce is exactly what would MASK a regression by
  // letting a wrongly-pierce-limited beam reach eleven bodies and still look
  // roughly alive. Fifteen is well past that. (Unlike the arp, the snare's
  // ladder does carry a pierce key, so Needle Tips is a real build here for the
  // BASE weapon — it is only the evolved beam that must ignore it.)
  {
    name: 'snare evolved (Railshot), infinite pierce through a fifteen-deep file',
    seed: 0x2a1191,
    weapons: [['snare', 4]],
    items: [['fastForward', 5], ['needleTips', 5]],
    evolved: ['snare'],
    enemies: file('zombie', [
      60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660, 720, 780, 840, 900,
    ]),
    hp: 1e6,
    steps: [{ fire: 'snare' }, { frames: 30 }],
  },

  // Natural hp, so the beam's kills, drops and the rng draws behind them are in
  // the digest — and splitters, which push children into the LIVE enemy array
  // that damageLine is walking, so the collection grows under the loop. Four
  // triggers with no frames between, so the twin rails land on the fourth into
  // a field the first three already reshaped.
  {
    name: 'snare evolved (Railshot), lethal file with splitters',
    seed: 0x2a1115,
    weapons: [['snare', 4]],
    items: [['fastForward', 5]],
    evolved: ['snare'],
    enemies: [
      ...file('splitter', [80, 160, 240, 320]),
      ...file('zombie', [400, 470, 540, 610]),
      ['circler', 200, 26],
      ['circler', 200, -26],
    ],
    steps: [
      { fire: 'snare' }, { fire: 'snare' }, { fire: 'snare' }, { fire: 'snare' },
      { frames: 90 },
    ],
  },

  // ---- the two shove constants --------------------------------------------
  // Main rail 16, twin rails 8, both scaled by buildMods.knockbackMul and then
  // again by each body's own knockbackMul inside shove(). Heavy Amp at 5 makes
  // knockbackMul 1.20 so neither constant is sitting at identity, and the three
  // bodies below have three different knockbackMul values (swarmer 1, zombie
  // 0.8, ghost 0 — immune), so the whole chain from the constant to the knock
  // channel is readable off one digest. Fourth trigger, so both constants are
  // exercised in the same frame.
  {
    name: 'snare evolved (Railshot) with Heavy Amp, main and twin shove',
    seed: 0x2a1158,
    weapons: [['snare', 4]],
    items: [['fastForward', 5], ['heavyAmp', 5]],
    evolved: ['snare'],
    enemies: [
      ['swarmer', 30, 0],
      ['swarmer', 200, 24],
      ['swarmer', 200, -24],
      ['zombie', 300, 0],
      ['ghost', 380, 0],
      ['zombie', 460, 24],
    ],
    hp: 1e6,
    steps: [
      { fire: 'snare' }, { fire: 'snare' }, { fire: 'snare' }, { fire: 'snare' },
      { frames: 30 },
    ],
  },

  // ---- mid-evolve ----------------------------------------------------------
  // A base snare shot still travelling down the file when the snare evolves.
  // The shot keeps its pierce budget, its shove and its per-hit spark and rides
  // shared physics to the end of its life, while the next trigger resolves as
  // an instant beam that spawns nothing. Base and evolved snare in the same
  // frame on the same role — the seam an extraction is most likely to unify
  // into one mode flag. Fast Forward is required for the evolution and doubles
  // the in-flight shot's speed, so the base half of this scenario is also the
  // only place the built `speed` is non-identity.
  {
    name: 'snare mid-evolve with a base shot still in flight',
    seed: 0x50a2ed,
    weapons: [['snare', 4]],
    items: [['fastForward', 5]],
    enemies: SNARE_FILE,
    hp: 1e6,
    steps: [
      { fire: 'snare' },
      { frames: 3 },
      { evolve: 'snare' },
      { frames: 3 },
      { fire: 'snare' },
      { frames: 60 },
    ],
  },

  // ---- the snare in a band -------------------------------------------------
  // Ordering. The snare shares the projectile array, the spatial hash, the rng
  // stream and the WEAPON_SHOVE table with weapons that have not moved yet —
  // clap and bass are the other two entries in that table, and lead is the
  // other entry in SPARK_HIT_ROLES, so a band scenario is the only place a
  // change to either table shows up as somebody ELSE'S damage moving.
  {
    name: 'snare in a full band, base, damage meter',
    seed: 0x50aba1,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: SNARE_FILE,
    hp: 1e6,
    steps: [
      { fire: 'snare' }, { fire: 'kick' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 120 },
    ],
  },
  {
    name: 'snare in a full band, base, lethal',
    seed: 0x50aba2,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: [
      ...file('zombie', [55, 100, 145, 190, 235, 280, 325]),
      ...ring('zombie', 150, 8, Math.PI / 8),
    ],
    steps: [
      { fire: 'snare' }, { fire: 'kick' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 120 },
    ],
  },
  {
    name: 'snare in a full evolved band, loaded build, four snare triggers',
    seed: 0x50aba3,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5], ['doubleTake', 2],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: SNARE_FILE,
    hp: 1e6,
    // FOUR snare triggers, so the twin rails fire inside a loaded evolved band
    // — the one place where the twin rails' 0.65x damage and 8 shove have to be
    // told apart from eight other weapons' output on the same bodies in the
    // same frame. Wide Lens is in the build, so conf.radius is 8 * 1.30 = 10.4
    // and the beam's half-width is max(7, 13) = 13 rather than 10: the max() is
    // under test as an expression, not just as a number.
    steps: [
      { fire: 'snare' }, { fire: 'kick' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'snare' }, { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' },
      { fire: 'snare' }, { fire: 'bell' }, { fire: 'arp' },
      { fire: 'snare' },
      { frames: 120 },
    ],
  },

  // ==========================================================================
  // THE HI-HAT (#141)
  // ==========================================================================
  // Recorded BEFORE the extraction, on the unchanged run.ts, per the order at
  // the top of this file.
  //
  // The hat is the fourth shape the migration has met, and the first whose
  // identity is a QUESTION IT DOES NOT ASK. Every other weapon so far consults
  // the world to decide where its output goes — the kick reads its facing, the
  // arp orbits the player, the snare calls aimDir. The hat calls
  // `fanAround(this.moveDir())`: it fires straight down player.moveDirX/Y with
  // zero scatter, never touches nearestEnemy, and therefore DRAWS NO RNG AT
  // FIRE TIME AT ALL. That last fact is the single easiest thing to lose in an
  // extraction — `aimFan(0)` looks like a tidier spelling of the same line and
  // is not: it targets, and it draws once (twice on an empty screen). rngDraws
  // is what catches it, and it only catches it if a scenario fires the hat
  // without anything else drawing, which is why the solo blocks below all sit
  // at absurd hp.
  //
  // ROLE-KEYED TABLES: THE HAT IS IN NEITHER, and that is a finding, not an
  // omission. WEAPON_SHOVE is { clap: 12, bass: 6 } and SPARK_HIT_ROLES is
  // { lead } — the hat appears in neither, so unlike the snare it takes no
  // share of either table with it and neither INTERIM_EXCEPTIONS entry changes.
  // A hat chip lands damage and nothing else: no knock, no spark. The scenarios
  // below record that ABSENCE (every hat-only hit leaves knock at 0,0,0 and
  // pushes no fx), so an extraction that "tidies up" by giving the hat a shove
  // or a spark it never had fails here.
  //
  // WHAT THE HAT OWNS, and where each one is readable:
  //   - the tier ladder, damage 2/2/2/3 and pierce 2/2/3/4 against speed
  //     440/450/460/480, radius 3, lifetime 0.8/0.85/0.9/0.95;
  //   - HAT_LANE.speedMul 1.5, HAT_LANE.lifetimeMul 2.0, the inline evolved
  //     1.30 damage multiplier and the evolved pierce of Infinity;
  //   - HAT_LANE.stagger [0, 26, 52, 78], cycled on triggerCounts.hat.
  // Most of those are pinned TWICE over. A projectile's digest line carries
  // `r=`, `dmg=`, `pierce=/maxPierce`, `life=` and `v=` directly, so any
  // scenario that ends with a chip still in the air pins the whole stat row as
  // a literal; the fields and files below pin them again BEHAVIOURALLY, as
  // which bodies a chip actually reaches. Both halves matter: the literal pin
  // catches a changed number, the behavioural pin catches a number that is
  // still right but is no longer being READ.

  /** Zombies in single file straight down +x, the heading the player is
   *  initialised to. Spaced 50 against a zombie's radius of ~21.05, so the
   *  separation pass inside world.update(0) leaves every one of them exactly
   *  where this list puts it (50 > 42.11).
   *
   *  SIX DEEP because the base ladder is a PIERCE ladder — 2 / 2 / 3 / 4 — and
   *  a file shorter than the top rung makes tier 4 read the same as "ran out of
   *  bodies". Six also fits inside tier 1's REACH (speed 440 x lifetime 0.8s =
   *  352 units, and the file's far end starts at 305 and walks toward the
   *  player while the chip flies), so every rung is limited by pierce and never
   *  by range. That separation is the point: it makes the two halves of the
   *  ladder fail independently. */
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `hat base tier ${tier}, solo, pierce ladder down the walk heading`,
    seed: 0x4a7000 + tier,
    weapons: [['hat', tier]],
    enemies: file('zombie', [55, 105, 155, 205, 255, 305]),
    // Absurd hp so the file stays six deep for the whole flight: a body that
    // died would be skipped, and "the chip stopped after N" would stop meaning
    // "the chip had N pierce".
    hp: 1e6,
    steps: [{ fire: 'hat' }, { frames: 60 }],
  })),

  /** The same ladder, stopped while the chip is STILL IN THE AIR and with
   *  nothing within reach to stop it. This is the literal pin: the digested
   *  projectile line carries radius, damage, pierce/maxPierce, remaining life
   *  and velocity, so all five numbers of a tier's stats block are recorded as
   *  values rather than only as consequences.
   *
   *  It is also the only place tiers 1 and 2 are TOLD APART. Their damage (2)
   *  and pierce (2) are identical, so against the file above they land the same
   *  8 total damage on the same two bodies and the two rungs are
   *  indistinguishable; only speed (440 vs 450) and lifetime (0.8 vs 0.85)
   *  differ, and both of those are only visible on a live chip. The ring sits
   *  at 900, outside any tier's reach, so it populates the spatial hash without
   *  ever being touched. */
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `hat base tier ${tier}, solo, one live chip pins the stat row`,
    seed: 0x4a7100 + tier,
    weapons: [['hat', tier]],
    enemies: ring('zombie', 900, 10),
    hp: 1e6,
    steps: [{ fire: 'hat' }, { frames: 20 }],
  })),

  // The same ladder with natural hp, so kills, killsByRole, gem/note drops and
  // the rng draws behind them are all in the digest. BATS, at 1hp: the base
  // hat's whole ladder is damage 2 or 3, so against anything tougher the pierce
  // budget runs out long before a body dies and the lethal half of the coverage
  // records nothing. A bat dies to any chip, so the file turns directly into
  // "which bodies did the chip reach, in what order" — and the drops that
  // follow are the ONLY rng this weapon is responsible for, since it draws none
  // of its own.
  ...([1, 4] as const).map((tier): ParityScenario => ({
    name: `hat base tier ${tier}, solo, lethal bat file`,
    seed: 0x4a7200 + tier,
    weapons: [['hat', tier]],
    // Bat radius ~12.28, spaced 40, so 40 > 24.56 and separation leaves them be.
    enemies: file('bat', [50, 90, 130, 170, 210, 250]),
    steps: [{ fire: 'hat' }, { frames: 60 }],
  })),

  // ---- the heading IS the aim ---------------------------------------------
  // The scenario the whole weapon rests on. The three nearest bodies in the
  // world sit BEHIND the player, so any extraction that reaches for aimDir or
  // aimFan — the obvious "every other weapon does it this way" move — empties
  // the first trigger into them and misses the +x file entirely. Then the
  // player TURNS and fires again: the second trigger must go up +y, which no
  // amount of targeting explains, because the +y file is farther away than the
  // bodies behind and farther than what is left of the +x file.
  //
  // Note the player is genuinely walking here, so the world is moving under the
  // weapon: the +y file's offsets are measured from the ORIGINAL player
  // position and the player has climbed ~32 units toward them by the time the
  // second trigger lands. Chips spawn at the player, so the heading is under
  // test against a moving origin, which is the real playing condition.
  {
    name: 'hat base tier 4, the walk heading aims it, not the nearest enemy',
    seed: 0x4a7a13,
    weapons: [['hat', 4]],
    enemies: [
      ['zombie', -45, 0],
      ['zombie', -95, 0],
      ['zombie', -145, 0],
      ...file('zombie', [150, 200, 250, 300]),
      ['zombie', 0, 150],
      ['zombie', 0, 200],
      ['zombie', 0, 250],
      ['zombie', 0, 300],
    ],
    hp: 1e6,
    steps: [
      { fire: 'hat' },
      { frames: 20 },
      { walk: [0, 1] },
      { frames: 12 },
      { fire: 'hat' },
      { frames: 40 },
    ],
  },

  // ---- standing still keeps the heading -----------------------------------
  // movePlayer only writes moveDirX/Y when the stick's magnitude clears 0.001,
  // so releasing it holds the last heading instead of zeroing it. That guard is
  // one `if` and it is entirely invisible until somebody stops walking: without
  // it the heading becomes (0, 0), the chip's velocity becomes (0, 0), and a
  // stationary chip sits on the player hitting whatever happens to touch it.
  // The player walks -y, stops for ten frames, and only THEN fires; the file is
  // down -y and the decoys are down +x, so a heading that reset to the (1, 0)
  // the player started at is caught here too, not just a zeroed one.
  {
    name: 'hat base tier 4, standing still keeps the last walk heading',
    seed: 0x4a75717,
    weapons: [['hat', 4]],
    enemies: [
      ['zombie', 0, -60],
      ['zombie', 0, -110],
      ['zombie', 0, -160],
      ['zombie', 0, -210],
      ['zombie', 60, 0],
      ['zombie', 110, 0],
    ],
    hp: 1e6,
    steps: [
      { walk: [0, -1] },
      { frames: 10 },
      { walk: [0, 0] },
      { frames: 10 },
      { fire: 'hat' },
      { frames: 40 },
    ],
  },

  // ---- the heading is NORMALIZED ------------------------------------------
  // A diagonal stick. moveDir hands back a unit vector, so the chip's speed on
  // a diagonal is the same 480 it is on an axis, split ~339.41 / ~339.41. Drop
  // the normalization and a diagonal chip travels at 480 on EACH axis, i.e.
  // ~1.41x its stated speed — a bug that never shows on the axis-aligned
  // headings every other scenario here uses. The chip is still live at the end,
  // so `v=` records the two components as literals.
  {
    name: 'hat base tier 4, a diagonal walk heading stays unit length',
    seed: 0x4a7d1a6,
    weapons: [['hat', 4]],
    enemies: [
      ['zombie', 106, 106],
      ['zombie', 156, 156],
      ['zombie', 205, 205],
      ['zombie', 250, -250],
    ],
    hp: 1e6,
    steps: [
      { walk: [1, 1] },
      { frames: 8 },
      { fire: 'hat' },
      { frames: 20 },
    ],
  },

  // ---- Double Take fans around the HEADING --------------------------------
  // fanAround exists so the hat can fan without ever consulting nearestEnemy;
  // aimFan is `fanAround(aimDir(spread))`. The two are one call apart and an
  // extraction that collapses them changes both WHERE the volley goes and how
  // many times the run draws. Double Take clamps at level 2, so a trigger is 3
  // chips at the heading and +-7 degrees off it.
  //
  // The three bodies at x 400 sit on those three lanes exactly: at 400 units
  // out, 7 degrees is 48.7 of lateral offset, which clears a zombie's 42.11
  // separation diameter so the field is where this list puts it. The pair at
  // +-100 lateral is outside every lane and must stay untouched. The decoy at
  // -40 is much nearer than any of them and is the aim magnet.
  //
  // TWO triggers, and the SECOND volley is still in the air at the end, so all
  // three headings are in the digest as velocities as well as as hits — and
  // rngDraws must stay at whatever the drops cost and not one draw more,
  // because three chips still cost zero aim rolls.
  //
  // The first volley is given 50 frames, not 20. Twenty leaves the chips short
  // of a field 400 units out and the scenario records three velocity vectors
  // and no damage at all — which pins the headings but not the CONSEQUENCE of
  // them, and it is the consequence that says the lanes are still lanes.
  {
    name: 'hat base tier 4 with Double Take, three chips fan around the heading',
    seed: 0x4a72fa,
    weapons: [['hat', 4]],
    items: [['doubleTake', 2]],
    enemies: [
      ['zombie', -40, 0],
      ['zombie', 400, 0],
      ['zombie', 397, 48.7],
      ['zombie', 397, -48.7],
      ['zombie', 400, 100],
      ['zombie', 400, -100],
    ],
    hp: 1e6,
    steps: [
      { fire: 'hat' }, { frames: 50 },
      { fire: 'hat' }, { frames: 20 },
    ],
  },

  // ---- the chip is THREE UNITS WIDE ---------------------------------------
  // radius 3 is the smallest number any weapon in the game carries, and it is
  // the one stat the hat's ladder never changes across four tiers — which makes
  // it exactly the kind of value an extraction can drop, round, or inherit from
  // a neighbour without anything noticing.
  //
  // FLOWERS, not zombies, and that is the whole reason this scenario can pin
  // anything. The bracket here is half a unit wide, and a zombie closes ~44.6
  // units a second: by the time a chip reaches it, a zombie has walked several
  // units off the offset this list states and the bracket has moved with it. A
  // flower's speed is ~8.92, the slowest body in the bestiary by a factor of
  // five, so over the ~0.1-0.4s of a chip's flight it drifts about half a unit
  // and the placed geometry is still, near enough, the geometry under test.
  //
  // MIND THE FRAME CYCLE. A flower is not one size. MAD_FOREST_FRAMES lists TWO
  // frames for it (26 and 32 wide, so radius ~17.544 and ~21.053) and pushEnemy
  // picks `counter % frames.length` — a per-kind cycling counter, not a roll —
  // so successive flowers ALTERNATE radius in spawn order. That is 3.5 units of
  // swing, seven times the bracket. The first version of this scenario listed
  // its two pins first and second, which handed them different bodies to be
  // measured against; the outer pin came out 21.053 wide, the boundary moved to
  // 24.05, and a chip of radius 3 sailed straight into a pin placed to be
  // outside it. Both mutations passed green.
  //
  // So THE ORDER OF THIS LIST IS LOAD-BEARING: pin, witness, pin. Positions 1
  // and 3 are both frame 0 (~17.544) and the witness in the middle absorbs
  // frame 1. Inserting or removing an enemy here re-deals every radius.
  //
  // THE PINS, against a shared flower radius of ~17.544, so contact is at
  // 17.544 + 3 = ~20.544:
  //   lateral 20.5 at x 60    inside, and drifts to ~19.54 by contact — so a
  //                           chip of radius 2 (threshold 19.544) MISSES it
  //   lateral 21.5 at x 200   outside, and drifts to ~21.0 by contact — so a
  //                           chip of radius 4 (threshold 21.544) HITS it
  // The boundary sits BETWEEN the two pins, so the smallest change radius can
  // take flips one of them, and the two directions flip different pins:
  // radius 2 records 0/3/0, radius 3 records 3/3/0, radius 4 records 3/3/3.
  // The pins sit 140 apart in x so the separation pass cannot push them into
  // each other and move the very offsets they exist to hold.
  {
    name: 'hat base tier 4, the chip is three units wide',
    seed: 0x4a7241,
    weapons: [['hat', 4]],
    enemies: [
      ['flower', 60, 20.5],
      // On-axis witness, and the frame-1 absorber. It proves the chip really
      // did fly down +x, so a run where BOTH pins go quiet reads as "missed
      // both" and not as "never fired".
      ['flower', 320, 0],
      ['flower', 200, 21.5],
    ],
    hp: 1e6,
    steps: [{ fire: 'hat' }, { frames: 40 }],
  },

  // ---- four triggers on a beat grid ---------------------------------------
  // The hat is the densest weapon in the game — density IS its ladder — so
  // several chips sharing the file is its normal condition, not an edge case.
  // Each chip carries its OWN hit set and its OWN pierce budget; a refactor
  // that hoists either onto the weapon collapses four independent budgets into
  // one shared one and this scenario moves. The gaps are short enough that all
  // four are in the air together.
  {
    name: 'hat base tier 4, four triggers on a beat grid',
    seed: 0x4a7b17,
    weapons: [['hat', 4]],
    enemies: file('zombie', [55, 105, 155, 205, 255, 305]),
    hp: 1e6,
    steps: [
      { fire: 'hat' }, { frames: 5 },
      { fire: 'hat' }, { frames: 5 },
      { fire: 'hat' }, { frames: 5 },
      { fire: 'hat' }, { frames: 50 },
    ],
  },

  // ==========================================================================
  // STROBE LANE
  // ==========================================================================
  // Same weapon, four multipliers deeper: damage x1.30, HAT_LANE.speedMul 1.5,
  // HAT_LANE.lifetimeMul 2.0 and pierce overwritten to Infinity, plus a spawn
  // offset cycled out of HAT_LANE.stagger. At tier 4 that is damage 3.9 at
  // speed 720 for 1.9s — 1368 units of reach against the base chip's 456.
  //
  // MIRRORBALL IS NOT OPTIONAL HERE. Strobe Lane's partner item is Mirrorball,
  // and eligibleEvolution gates every evolution on its partner sitting at max
  // level, so a Strobe Lane can only ever exist alongside bounceCount 3 and
  // bounceRetention 0.85. Every evolved chip in the real game bounces, and 1368
  // units of reach is nearly twice the 739.6 the x rail sits at for this
  // canvas, so it is not a corner the player has to go looking for — a lane
  // chip reaches the wall as a matter of course. That is its own scenario
  // below, because the ADR-0002 shape (a module claiming steer() and silently
  // exempting itself from the rails) is available to any extraction, and only a
  // chip that reaches a rail notices.

  // ---- the lane, damage meter ---------------------------------------------
  // Twelve deep and stopped before the chip reaches the rail, so this scenario
  // is pure reach and pure per-body damage with no reflection in it. The base
  // chip's 456 units of travel dies around the fifth body; the lane crosses the
  // whole file. Cut either multiplier and the file's far end goes quiet.
  {
    name: 'hat evolved (Strobe Lane), lane damage meter',
    seed: 0x4a75e01,
    weapons: [['hat', 4]],
    items: [['mirrorball', 5]],
    evolved: ['hat'],
    enemies: file('zombie', [55, 105, 155, 205, 255, 305, 355, 405, 455, 505, 555, 605]),
    hp: 1e6,
    steps: [{ fire: 'hat' }, { frames: 55 }],
  },

  // ---- infinite pierce is INFINITE ----------------------------------------
  // The lane's reach is not a large pierce number, it is the absence of one:
  // spawnProjectile writes Infinity over whatever the build pipeline produced.
  // Fifteen bodies is past anything a number would plausibly be.
  //
  // NEEDLE TIPS AT MAX, for the reason ADR-0002's arp scenario and the snare's
  // beam both carry it: +5 pierce is exactly what would MASK a regression, by
  // letting a wrongly-finite lane reach nine bodies and still look roughly
  // alive. It also pins a real asymmetry the extraction has to keep — the hat's
  // ladder DOES carry a pierce key, so Needle Tips is a live, stacking build on
  // the base weapon (tier 4 goes 4 -> 9), and a total no-op on the lane, which
  // overwrites the pipeline's answer rather than building on it. That is the
  // opposite of what #146 made Neon Serpent do, and it is correct here: an
  // infinity is not a floor to add to.
  {
    name: 'hat evolved (Strobe Lane), infinite pierce through a fifteen-deep file',
    seed: 0x4a75e91,
    weapons: [['hat', 4]],
    items: [['mirrorball', 5], ['needleTips', 5]],
    evolved: ['hat'],
    enemies: file('zombie', [
      50, 96, 142, 188, 234, 280, 326, 372, 418, 464, 510, 556, 602, 648, 694,
    ]),
    hp: 1e6,
    steps: [{ fire: 'hat' }, { frames: 58 }],
  },

  // ---- the stagger cycle --------------------------------------------------
  // HAT_LANE.stagger pushes each successive chip further along the lane so a
  // 16th-note wall draws as one streak instead of a clump at the player. It is
  // indexed by triggerCounts.hat, which increments BEFORE the switch, so the
  // FIRST trigger of a run takes stagger[1] = 26 and the fourth takes
  // stagger[0] = 0. Five triggers, so the cycle wraps and the fifth is proved
  // to land back on 26 rather than running off the end of the array.
  //
  // Two frames between triggers and all five still in the air at the end: five
  // chips travelling at a uniform 12 units a frame from five different starting
  // offsets, so the digest is the stagger table read straight off the
  // projectile positions. Change any entry and exactly one line moves; change
  // the modulo and the wrap moves.
  {
    name: 'hat evolved (Strobe Lane), five triggers cycle the lane stagger',
    seed: 0x4a757a6,
    weapons: [['hat', 4]],
    items: [['mirrorball', 5]],
    evolved: ['hat'],
    enemies: file('zombie', [120, 220, 320, 420, 520]),
    hp: 1e6,
    steps: [
      { fire: 'hat' }, { frames: 2 },
      { fire: 'hat' }, { frames: 2 },
      { fire: 'hat' }, { frames: 2 },
      { fire: 'hat' }, { frames: 2 },
      { fire: 'hat' }, { frames: 6 },
    ],
  },

  // ---- the lane rides the arena rails -------------------------------------
  // Mirrorball at max comes with the evolution, so bounceCount 3 and
  // bounceRetention 0.85 are the lane's PERMANENT condition. The rail sits at
  // 739.6 for this canvas and the lane reaches 1368, so the chip crosses it,
  // flips vx, loses 15% of its damage and comes back down the file it just
  // cleared — hitting nobody a second time, because the hit set persists.
  //
  // A lane chip must therefore ride shared travel and shared reflection, which
  // is the half of ProjectileBehavior the hat must NOT implement: a steer()
  // that returns true positions the chip itself and skips the rails silently,
  // exactly the way the arp is exempted, and nothing but a chip that reaches a
  // wall would ever notice. The chip is live at the end, so `bounces=` and the
  // retained `dmg=` are both literal pins on top of the behavioural one.
  {
    name: 'hat evolved (Strobe Lane), the lane rails off the arena bounds',
    seed: 0x4a75ba1,
    weapons: [['hat', 4]],
    items: [['mirrorball', 5]],
    evolved: ['hat'],
    enemies: [
      ...file('zombie', [120, 260, 400, 540, 680]),
      // Off-axis bodies on the return leg, so the reflected chip has something
      // to prove it is still armed with.
      ['zombie', 300, 30],
      ['zombie', 500, -30],
    ],
    hp: 1e6,
    steps: [{ fire: 'hat' }, { frames: 100 }],
  },

  // ---- lethal ------------------------------------------------------------
  // Natural-ish hp so kills, drops and the rng behind them land. hp 6 against
  // the lane's 3.9 is two chips to a kill, so the TRIGGER CADENCE decides which
  // frame each body dies on. Splitters push four swarmers each into the live
  // enemy array the chip is walking, and an infinite-pierce chip keeps sweeping
  // the collection that just grew under it.
  {
    name: 'hat evolved (Strobe Lane), lethal file with splitters',
    seed: 0x4a75111,
    weapons: [['hat', 4]],
    items: [['mirrorball', 5]],
    evolved: ['hat'],
    enemies: [
      ...file('splitter', [70, 130, 190, 250]),
      ...file('zombie', [330, 390, 450, 510]),
    ],
    hp: 6,
    steps: [
      { fire: 'hat' }, { frames: 8 },
      { fire: 'hat' }, { frames: 8 },
      { fire: 'hat' }, { frames: 60 },
    ],
  },

  // ---- the lane still steers ----------------------------------------------
  // Evolving does not change what aims the weapon: Strobe Lane is still fired
  // down the walk heading and still asks the world nothing. Same turn as the
  // base scenario above, with the lane's reach — so the +y file is 1368 units
  // of lane rather than 456, and a targeting regression that the base scenario
  // catches by a near miss is caught here by a mile.
  {
    name: 'hat evolved (Strobe Lane), the walk heading still aims it',
    seed: 0x4a75a13,
    weapons: [['hat', 4]],
    items: [['mirrorball', 5]],
    evolved: ['hat'],
    enemies: [
      ['zombie', -45, 0],
      ['zombie', -95, 0],
      ...file('zombie', [150, 250, 350, 450]),
      ['zombie', 0, 150],
      ['zombie', 0, 250],
      ['zombie', 0, 350],
      ['zombie', 0, 450],
    ],
    hp: 1e6,
    steps: [
      { fire: 'hat' },
      { frames: 20 },
      { walk: [0, 1] },
      { frames: 12 },
      { fire: 'hat' },
      { frames: 40 },
    ],
  },

  // ---- mid-evolve ---------------------------------------------------------
  // A base chip four frames down the lane when the hat evolves. pr.evolved is
  // frozen at spawn, so that chip keeps its finite pierce of 4, its 480 speed,
  // its 0.95s life and its damage of 3, and it received NO stagger — while the
  // next trigger spawns 26 units out at 720 with infinite pierce and 3.9
  // damage, overtakes it, and crosses the file it will never reach. Base and
  // evolved hat in the same frame on the same role, in the same shared
  // projectile loop: the seam an extraction is most likely to unify into one
  // mode flag read at tick time instead of at spawn time.
  //
  // The trigger arithmetic matters and is worth stating: the first trigger is
  // count 1 and is BASE, so it takes no stagger at all; the second is count 2
  // and is evolved, so it takes stagger[2] = 52, NOT the 26 a fresh evolved hat
  // would take. The counter does not reset on evolution and the extraction must
  // not make it.
  //
  // THE FILE IS SPLIT, and deliberately. A continuous ten-deep file spends the
  // base chip's four pierce inside twenty frames and it is gone long before the
  // scenario ends — leaving a digest with one projectile line in it and no
  // record that the two modes were ever in the array together at all. Three
  // bodies close in (inside the base chip's 456 units of reach, and one short
  // of its pierce budget) then a gap, then four more out past 456 where only
  // the lane reaches: the base chip lives out its whole 0.95s with a pierce to
  // spare, so BOTH chips are in the digest at the end, one behind the other,
  // with different speeds, lifetimes, pierce budgets and damage.
  {
    name: 'hat mid-evolve with a base chip still in the lane',
    seed: 0x4a72ed0,
    weapons: [['hat', 4]],
    items: [['mirrorball', 5]],
    enemies: file('zombie', [55, 105, 155, 500, 560, 620, 680]),
    hp: 1e6,
    steps: [
      { fire: 'hat' },
      { frames: 4 },
      { evolve: 'hat' },
      { frames: 4 },
      { fire: 'hat' },
      { frames: 40 },
    ],
  },

  // ---- the hat in a band --------------------------------------------------
  // Ordering. The hat shares the projectile array, the spatial hash and the rng
  // stream with weapons that have not moved yet, and it is the one weapon in
  // the band that contributes ZERO draws of its own — so in a band scenario the
  // hat's draw discipline is only visible as everybody ELSE's rolls landing in
  // the right order. An extraction that starts calling aimDir shifts every
  // subsequent draw in the frame, and these three scenarios are where that
  // shows up as another weapon's damage moving.
  //
  // The hat fires FIRST in each, so its chips are in the array before the other
  // eight weapons' entities are, which is the ordering the extraction has to
  // reproduce.
  {
    name: 'hat in a full band, base, damage meter',
    seed: 0x4a7ba1,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: file('zombie', [55, 105, 155, 205, 255, 305]),
    hp: 1e6,
    steps: [
      { fire: 'hat' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 120 },
    ],
  },
  {
    name: 'hat in a full band, base, lethal',
    seed: 0x4a7ba2,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    // SPLITTERS AT 40HP, NOT ZOMBIES AT 10, and that is the difference between
    // this scenario covering the hat and not covering it at all. The hat is by
    // some distance the slowest weapon in the band to arrive AND the weakest
    // per hit: a chip does 3 and takes seven frames just to reach a body 55
    // units out, while the kick resolves synchronously at fire time and the
    // snare's shot pierces six. Against a file of 10hp zombies the other eight
    // weapons had cleared the entire field by frame 35, with the chip still
    // 160 units short of the last body — the recorded digest had no `hat=` line
    // in damageByRole at all, a band scenario for the hat in which the hat did
    // nothing. A 40hp body survives the opening volley, so the chip arrives to
    // a field that is still standing and the ordering is genuinely under test.
    // Splitters also burst into swarmers as the band kills them, which grows
    // the enemy array under every loop walking it.
    //
    // The file starts at 200, past the kick's ~149-unit strip, for the same
    // reason: something has to still be alive out where a chip can reach it.
    enemies: [
      ...file('splitter', [200, 250, 300, 350, 400, 450]),
      ...ring('splitter', 300, 8, Math.PI / 8),
    ],
    steps: [
      { fire: 'hat' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 120 },
    ],
  },
  {
    name: 'hat in a full evolved band, loaded build, walking',
    seed: 0x4a7ba3,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5], ['doubleTake', 2],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: [
      ...file('zombie', [55, 105, 155, 205, 255, 305]),
      ...ring('zombie', 260, 12, Math.PI / 12),
    ],
    hp: 1e6,
    // THE ONLY BAND SCENARIO IN THIS FILE WHERE THE PLAYER MOVES. Nine weapons
    // firing while the origin slides is the real playing condition and nothing
    // else here covers it; for the hat specifically it is the only band
    // scenario where the heading is not the (1, 0) default, so a band-level
    // targeting regression cannot hide behind the two agreeing by accident.
    // Four hat triggers, so the stagger cycle runs inside a loaded band and the
    // lane's 26/52/78/0 have to be told apart from eight other weapons' output.
    steps: [
      { walk: [2, -1] },
      { frames: 10 },
      { fire: 'hat' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'bass' },
      { fire: 'hat' }, { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' },
      { fire: 'hat' }, { fire: 'bell' }, { fire: 'arp' },
      { fire: 'hat' },
      { frames: 120 },
    ],
  },

  // ==========================================================================
  // THE BASS (#141)
  // ==========================================================================
  // Recorded BEFORE the extraction, on the unchanged run.ts, per the order at
  // the top of this file.
  //
  // The bass is the fifth shape the migration has met, and the first whose two
  // halves live in DIFFERENT WORLD ARRAYS, updated in different phases of the
  // frame. The base weapon is a projectile — plain shared physics, no
  // ProjectileBehavior at all — and the evolution is a SHOCKWAVE, which is a
  // world entity with its own update loop that no weapon has ever owned.
  //
  //   base:    aimFan(0.08) -> one plain shot per direction, radius 22..42,
  //            INFINITE PIERCE, riding shared travel and the arena rails, with
  //            WEAPON_SHOVE.bass = 6 applied inside the shared projectile loop
  //            and NO spark (bass is not in SPARK_HIT_ROLES).
  //   evolved: spawnSubquake pushes ONE Shockwave onto world.shockwaves at the
  //            player's position, and updateShockwaves — which runs in the
  //            'shockwaves' phase, AFTER updateProjectiles and updateZones and
  //            BEFORE updateGravityWells — grows and resolves it.
  //
  // WHAT MAKES THIS THE HARDEST ONE SO FAR: THE SHOCKWAVE IS VIEW-READ. view.ts
  // iterates world.shockwaves, so storage STAYS world-side and only the update
  // LOGIC moves into the module, which then becomes the array's sole mutator —
  // the same split the arp made for projectiles. That is a seam with no
  // precedent in this file, and the digest only helps so far: a shockwave's
  // digest line is `pos / dmg / life` and NOTHING ELSE. radius, maxRadius, age,
  // shove and the per-wave `hit` set are all invisible to it. Every one of
  // those five is therefore pinned BEHAVIOURALLY below, or it is not pinned at
  // all.
  //
  // NO FX, ANYWHERE. spawnSubquake pushes nothing and updateShockwaves pushes
  // nothing; a Subquake's entire visual is view.ts reading the array. So in
  // every evolved scenario here the ordered fx stream contains only the world's
  // own 'dmg' events, and an extraction that "tidies up" by giving Subquake a
  // ring or a slam it never had fails on the fx stream. The base wave is the
  // same story for a different reason: bass is absent from SPARK_HIT_ROLES, so
  // a bass hit lands damage and a shove and pushes no spark.
  //
  // ROLE-KEYED TABLES: WEAPON_SHOVE still reads { clap: 12, bass: 6 }. The
  // bass's 6 leaves with this module; clap's 12 keeps the table (and the
  // INTERIM_EXCEPTIONS entry) alive until the clap follows. Every base scenario
  // below that lands a hit is pinning that 6 through the knock channel, which
  // is its only observable — and the band scenarios are where a change to the
  // shared table shows up as CLAP'S knock moving instead of the bass's.

  // ---- the base ladder, as literals ---------------------------------------
  // One live wave, nothing within reach, stopped in the air. The digested
  // projectile line carries radius, damage, pierce/maxPierce, remaining life
  // and velocity, so all five numbers of a tier's stats block are recorded as
  // VALUES rather than only as consequences — and `pierce=Infinity/Infinity` is
  // recorded as the literal string it prints as, which is the cheapest possible
  // guard against an extraction that restates the infinity as a big finite
  // number.
  //
  // The ring sits at 900, outside AIM_RANGE (750), so nothing is targetable:
  // aimDir takes its EMPTY-SCREEN branch and draws TWICE (a random heading,
  // then the jitter) instead of once. That is deliberate here — it means the
  // stat row and the two-draw branch are pinned by the same four scenarios —
  // and the heading it rolls is recorded as `v=` on the live wave.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `bass base tier ${tier}, solo, one live wave pins the stat row`,
    seed: 0xba55000 + tier,
    weapons: [['bass', tier]],
    enemies: ring('flower', 900, 10),
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 20 }],
  })),

  // ---- the base ladder, as consequences -----------------------------------
  // The behavioural half. The bass ladder moves FOUR numbers at once — damage
  // 3/5/8/13, radius 22/28/34/42, speed 135/140/145/150, lifetime
  // 2.3/2.4/2.5/2.6 — and the last three all show up as the same thing: which
  // bodies the wave's edge reached, and how far out it got before it died.
  // Against the concentric comb, radius decides how many bodies of each ring
  // fall inside the swept band and speed x lifetime decides which rings are
  // reached at all (310.5 / 336 / 362.5 / 390 units of raw travel, against
  // rings out at 460).
  //
  // 160 frames is 2.67s, past even tier 4's 2.6s life, so every wave is GONE at
  // the end and the digest is purely the field's record of what happened to it:
  // hp for the damage, knock for the 6-unit shove, position for both.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `bass base tier ${tier}, solo, the wave's width and reach`,
    seed: 0xba55100 + tier,
    weapons: [['bass', tier]],
    enemies: BASS_SWEPT_FIELD,
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 160 }],
  })),

  // The same ladder with natural hp, so kills, killsByRole, gem/note drops and
  // every rng draw behind them are in the digest. BATS at 1hp: the bass is a
  // wide slow sweep rather than a burst, so what its lethal half records is
  // WHICH bodies the band reached and IN WHAT ORDER — and hash order is the
  // order, because the base wave resolves inside the shared projectile loop
  // against `this.hash.query(...)`. (Subquake's lethal coverage is separate and
  // below, because it walks `this.enemies` in ARRAY order instead. The two
  // orders are different and the extraction has to keep them different.)
  ...([1, 4] as const).map((tier): ParityScenario => ({
    name: `bass base tier ${tier}, solo, lethal bat field`,
    seed: 0xba55200 + tier,
    // Bat radius 12.28, so ring counts here are set against a 24.6 diameter
    // rather than a flower's 35.1.
    enemies: [
      ...ring('bat', 70, 10),
      ...ring('bat', 150, 14, 0.11),
      ...ring('bat', 230, 14, 0.22),
      ...ring('bat', 310, 14, 0.33),
    ],
    weapons: [['bass', tier]],
    steps: [{ fire: 'bass' }, { frames: 160 }],
  })),

  // ---- infinite pierce is INFINITE ----------------------------------------
  // The bass ladder carries `pierce: Infinity` at every tier, and the shared
  // rule is `pr.pierce -= 1; if (pr.pierce <= 0)`. Infinity minus one is
  // Infinity, so the subtraction runs on every hit and never bites: a bass wave
  // is stopped by its LIFETIME and by nothing else. That is the identity of the
  // weapon — "slow wide low wave that rolls through everything" — and it is
  // exactly the property an extraction erases by restating the infinity as a
  // number.
  //
  // Sixteen flowers in single file, spaced 40 (past a flower's 35.1 diameter,
  // so the separation pass leaves them alone) and reaching x 655. Fast Forward
  // and Extension Cable are in the build to buy the reach that gets a wave all
  // the way down it: speed 150 x 1.20 = 180 and life 2.6 x 1.40 = 3.64, so raw
  // travel is 655 rather than 390.
  //
  // NEEDLE TIPS AT MAX, for the same reason ADR-0002's arp scenario and
  // Railshot's fifteen-deep file both carry it. withExtraPierce leaves an
  // infinite pierce untouched, so +5 must be a total no-op here — and +5 is
  // also precisely what would MASK a regression, by letting a wrongly-finite
  // wave reach six bodies instead of one and still look roughly alive. Sixteen
  // is well past anything +5 can cover.
  {
    name: 'bass base tier 4, infinite pierce down a sixteen-deep file',
    seed: 0xba55917,
    weapons: [['bass', 4]],
    items: [['fastForward', 5], ['extensionCable', 5], ['needleTips', 5]],
    enemies: file('flower', [
      55, 95, 135, 175, 215, 255, 295, 335, 375, 415, 455, 495, 535, 575, 615, 655,
    ]),
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 240 }],
  },

  // ---- the 6-unit shove ---------------------------------------------------
  // WEAPON_SHOVE.bass = 6, scaled by buildMods.knockbackMul and then again by
  // each body's own knockbackMul inside shove(). Heavy Amp at 5 makes the
  // build's multiplier 1.20 so the constant is not sitting at identity, and the
  // file below has FOUR different body-side multipliers on it — flower 1,
  // skeleton 1, zombie 0.8, ghost 0 (immune) — so the whole chain from the
  // constant to the knock channel is readable off one digest, including the
  // early return that leaves an immune body's knock at exactly 0,0,0.
  //
  // This scenario is also where the ABSENCE of a spark is pinned. bass is not
  // in SPARK_HIT_ROLES, so each of these hits pushes a 'dmg' event and nothing
  // else; the ordered fx stream here contains no 'spark' line at all, and an
  // extraction that gives the bass one fails on the fx stream before it fails
  // anywhere else.
  {
    name: 'bass base tier 4 with Heavy Amp, the wave shoves 6 and sparks nothing',
    seed: 0xba55510,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5]],
    enemies: [
      ['flower', 60, 0],
      ['ghost', 130, 0],
      ['zombie', 200, 0],
      ['skeleton', 270, 0],
      ['flower', 340, 0],
      ['zombie', 150, 44],
      ['ghost', 150, -44],
    ],
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 90 }],
  },

  // ---- shared physics the base wave rides unchanged -----------------------
  // The bass implements NO ProjectileBehavior: no steer, no onHit. That is a
  // real claim about the extraction, not an absence of one — a module that
  // gives the bass a steer() returning true silently exempts it from
  // reflectProjectileFromArena exactly the way the arp is exempted, and nothing
  // but a bouncing wave notices.
  //
  // Mirrorball at 5 is 3 bounces at 85% retention, and a bounce multiplies the
  // shot's damage by that retention, so a bounced wave's `dmg=` is a literal
  // record of how many rails it has met. Fast Forward and Extension Cable buy
  // the reach to get to one: the rails sit at +-739 x and +-416 y for this
  // canvas, the aim anchor out on the diagonal sends the wave into the y rail
  // first, and 655 units of travel is enough to reach it and come back.
  {
    name: 'bass base tier 4 with Mirrorball, the wave rides the arena rails',
    seed: 0xba5580c,
    weapons: [['bass', 4]],
    items: [['mirrorball', 5], ['fastForward', 5], ['extensionCable', 5]],
    enemies: [
      ['flower', 300, 300],
      ...ring('flower', 540, 14, 0.09),
      ...ring('flower', 700, 14, 0.31),
    ],
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 220 }],
  },

  // ---- the fan ------------------------------------------------------------
  // aimFan(0.08) aims ONCE and fans around that heading, so the whole trigger
  // costs the same rng draws as a single wave — the "move the draw inside the
  // loop" mistake the arp block calls out, in a weapon that goes through
  // aimFan. Double Take clamps at level 2, so a trigger is 3 waves at the aim
  // line and +-7 degrees off it. Two triggers, so the second trigger's
  // independent draw is recorded too, and the second volley is still in the air
  // at the end so all three headings are in the digest as velocities as well as
  // as hits.
  //
  // The concentric comb is the field for the same reason it is elsewhere: three
  // waves leaving on headings 7 degrees apart diverge to 49 units of separation
  // by x 400, which is more than a tier-4 wave's own 42, so past that range the
  // three lanes genuinely stop overlapping and the fan is doing something a
  // single wide wave could not.
  {
    name: 'bass base tier 4 with Double Take, one aim draw fans three waves',
    seed: 0xba552fa,
    weapons: [['bass', 4]],
    items: [['doubleTake', 2]],
    enemies: BASS_SWEPT_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'bass' }, { frames: 30 },
      { fire: 'bass' }, { frames: 100 },
    ],
  },

  // ---- several waves at once ----------------------------------------------
  // Four triggers on a beat grid. Each wave carries its OWN `hit` set, and
  // because pierce is infinite NONE of them ever retires early, so all four are
  // in the air together over the same field for most of the scenario — four
  // independent hit sets sweeping one comb. A refactor that hoists the hit set
  // onto the weapon instead of the shot collapses them into one and this
  // scenario moves; so does one that gives the waves a shared pierce budget,
  // because with four waves alive a budget that is being spent runs out.
  {
    name: 'bass base tier 4, four triggers on a beat grid',
    seed: 0xba55b17,
    weapons: [['bass', 4]],
    enemies: BASS_SWEPT_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'bass' }, { frames: 9 },
      { fire: 'bass' }, { frames: 9 },
      { fire: 'bass' }, { frames: 9 },
      { fire: 'bass' }, { frames: 160 },
    ],
  },

  // ==========================================================================
  // SUBQUAKE
  // ==========================================================================
  // The directional wave becomes an expanding, INFINITE-PIERCE SEISMIC RING:
  // one Shockwave pushed at the player's position, growing
  // `40 + (288 * areaMul - 40) * min(1, age / 1.2)` over a 1.2s life, dealing
  // `conf.damage * 1.55` and shoving `14 * knockbackMul` to every body its edge
  // crosses, once each.
  //
  // "Infinite pierce" here is a fact about the CODE, not a stat: updateShockwaves
  // has no budget, no count and no cap anywhere in it. The only thing that stops
  // a body being hit twice is the per-wave `hit` Set, and the only thing that
  // stops the ring is its lifetime. As with Railshot, infinite means infinite —
  // an extraction that names a finite number for it fails below.
  //
  // ONE NUMBER HERE IS GENUINELY UNOBSERVABLE, and it was found by trying to
  // break these scenarios rather than by reading the code. spawnSubquake writes
  // `radius: 40` onto the new Shockwave, and updateShockwaves OVERWRITES it —
  // `wave.radius = 40 + (wave.maxRadius - 40) * min(1, wave.age / 1.2)` — on the
  // very first tick, before any damage test reads it. The spawn-time write is
  // therefore dead: changing that 40 to 44 leaves every scenario in this file
  // green, and it is the only mutation tried against this block that did.
  // (Changing the 40 inside updateShockwaves, which IS live, is caught.) The
  // extraction must not read a passing check as evidence that the spawn-time
  // value is preserved; if the module states a start radius as a named stat,
  // that stat needs a LITERAL PIN in systems-check's fake-context checks,
  // because world state cannot see it.
  //
  // Subquake's evolution item is Heavy Amp, so EVERY evolved scenario here
  // necessarily carries knockbackMul 1.20 and damageMul 1.25. Neither the 14
  // nor the 1.55 is ever sitting at identity, which is the opposite of a
  // problem: it means a mutation to either one cannot hide behind a x1.

  // ---- the growth curve ---------------------------------------------------
  // FIVE STOP TIMES against one comb, and this is the only cover the ring's
  // geometry has. `radius` and `maxRadius` are not digested; the ring passes
  // each ring of flowers at a different moment; so stopping the scenario
  // part-way through the expansion converts the growth curve into a hit set.
  //
  // THE STOP TIMES ARE CUT AGAINST THE CROSSINGS, not spaced evenly. With no
  // Wide Lens the ring's reach against a flower (radius 17.544) is
  // `40 + 248 * min(1, age / 1.2) + 17.544`, and a flower drifts inward 8.916
  // per second while it waits, so ring R is crossed at
  // `t = (R - 57.544) / 215.583`: frames 14.6, 28.5, 42.4, 56.3 and 70.3 for
  // the 110, 160, 210, 260 and 310 rings. Each stop below sits a couple of
  // frames PAST one of those, which puts that ring 6 to 10 units inside the
  // edge and the next ring 40-odd units outside it — the same order of margin
  // the Railshot range pins use, and close enough that a small change to any
  // of the three constants moves a body across a boundary rather than merely
  // nudging the arithmetic:
  //   17 frames  reach 116.1  the 110 ring, by 8.6
  //   31 frames  reach 164.3  the 160 ring, by 8.9
  //   45 frames  reach 212.5  the 210 ring, by 9.2
  //   59 frames  reach 260.8  the 260 ring, by 9.6
  //   72 frames  reach 305.5  the 310 ring, by 6.2 — full extent
  //
  // Five readings of three separately falsifiable numbers. The early stops are
  // dominated by the START radius of 40, the last by the MAX radius of 288, and
  // the spacing BETWEEN them by the 1.2-second growth duration that maps one to
  // the other: a duration change leaves the endpoints alone and slides every
  // crossing in between, which is why one stop time could never have caught it.
  //
  // The first four leave the ring LIVE, so its `pos / dmg / life` row is
  // recorded alongside the field it has just swept. The fifth does not: at 72
  // frames the accumulated age passes 1.2, lifeS reaches 0 and the ring is
  // spliced out in the same pass it deals its last damage in — which is itself
  // the pin on the ring living exactly as long as it takes to finish growing.
  ...([17, 31, 45, 59, 72] as const).map((frames): ParityScenario => ({
    name: `bass evolved (Subquake), the ring ${frames} frames into its expansion`,
    seed: 0xba55d00 + frames,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5]],
    evolved: ['bass'],
    enemies: BASS_QUAKE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames }],
  })),

  // ---- the ring does not follow the player --------------------------------
  // spawnSubquake reads `this.player.x/y` ONCE, at fire time, and writes them
  // onto the Shockwave. updateShockwaves then never looks at the player again:
  // it grows a ring around a point in the world. An extraction that reads
  // ctx.player from inside tick() — the obvious shape, since ctx.player is
  // documented as a LIVE getter and the kick depends on it being one — turns
  // Subquake into a ring that drags along behind the player, and every scenario
  // above still passes because in all of them the player never moves.
  //
  // Two independent records of the same fact. The digest's shockwave line
  // carries `pos=`, so a ring that moved is a literal diff; and the field is
  // split so it is a behavioural diff too. The inner ring of flowers is placed
  // around the player's ORIGINAL position and is swept normally; the file out
  // at +x is placed past the ring's 305-unit reach from there, but the player
  // walks +x for the whole 1.2 seconds and ends up ~230 units along, which puts
  // those bodies well inside a ring that had followed him.
  {
    name: 'bass evolved (Subquake), the ring stays where it was fired',
    seed: 0xba55f13,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5], ['highTops', 5]],
    evolved: ['bass'],
    enemies: [
      ...ring('flower', 110, 10),
      ...ring('flower', 210, 12, 0.21),
      ...file('flower', [400, 450, 500, 550, 600]),
    ],
    hp: 1e6,
    steps: [
      { walk: [1, 0] },
      { frames: 10 },
      { fire: 'bass' },
      { frames: 60 },
    ],
  },

  // ---- the ring reads areaMul, not conf.radius ----------------------------
  // spawnSubquake computes its max radius as `288 * this.buildMods.areaMul` and
  // NEVER READS conf.radius at all — the built 42 * areaMul that the base wave
  // uses for its body is simply unused by the evolution. Those two are easy to
  // confuse in an extraction that puts both modes behind one stats block, and
  // they are numerically miles apart, so getting it wrong is loud.
  //
  // Wide Lens at 5 is areaMul 1.30, which moves the max radius from 288 to
  // 374.4 and the reach against a flower from 305.5 to 391.9 — past the 360
  // ring, which every scenario above leaves untouched. Run to 72 frames so the
  // comparison against the 72-frame scenario above is a like-for-like: same
  // field, same stop time, one item different, and the two hit sets must differ
  // by exactly the 360 ring.
  {
    name: 'bass evolved (Subquake) with Wide Lens, the ring grows with areaMul',
    seed: 0xba55a2e,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5], ['wideLens', 5]],
    evolved: ['bass'],
    enemies: BASS_QUAKE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 72 }],
  },

  // ---- once per body, and no cap on how many bodies -----------------------
  // TWO properties in one scenario, because one field proves both.
  //
  // ONCE PER BODY. The `hit` Set is the only thing standing between "the edge
  // crossed you" and "you are inside the ring", and every body here is inside
  // the ring for most of its life: the innermost flowers are swept at frame ~4
  // and the ring keeps growing around them for another sixty. So the correct
  // recorded damage is exactly 1x per body, and a lost hit set is not a subtle
  // regression — it is roughly sixty times the damage. hp 1e6 keeps every body
  // alive to record it rather than dying on the second tick and hiding it.
  //
  // NO CAP. Fifty-eight bodies are inside the ring at full extent, all of them
  // damaged by one trigger. updateShockwaves has no budget of any kind, so an
  // extraction that invents a `targets` or `maxHits` stat to describe "infinite
  // pierce" fails here at whatever number it picked.
  //
  // 120 frames is well past the ring's 1.2s life, so the ring is gone and what
  // is recorded is purely the field's account of it.
  {
    name: 'bass evolved (Subquake), one hit per body and no cap on bodies',
    seed: 0xba55ca9,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5]],
    evolved: ['bass'],
    enemies: [
      ...ring('flower', 60, 8),
      ...ring('flower', 110, 10, 0.21),
      ...ring('flower', 160, 12, 0.42),
      ...ring('flower', 210, 12, 0.63),
      ...ring('flower', 260, 12, 0.84),
    ],
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 120 }],
  },

  // ---- the 14-unit shove --------------------------------------------------
  // Subquake shoves 14 * buildMods.knockbackMul away from the RING'S CENTRE,
  // which is the fire-time player position and not the ring's edge — a
  // distinction with no other cover, since a body's knock vector points away
  // from whichever origin shove() was handed. Heavy Amp is mandatory for the
  // evolution so the build multiplier is 1.20; the four bodies below carry four
  // different body-side multipliers (flower 1, skeleton 1, zombie 0.8, ghost 0)
  // and sit at four different angles, so the direction and the magnitude of the
  // chain are both readable off one digest.
  //
  // The damage multiplier is pinned in the same breath: 1.55 on top of a built
  // 13 * 1.25, so each body records 25.1875 exactly.
  {
    name: 'bass evolved (Subquake), 1.55x damage and a 14-unit shove from the centre',
    seed: 0xba55e14,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5]],
    evolved: ['bass'],
    enemies: [
      ['flower', 90, 0],
      ['zombie', 0, 120],
      ['ghost', -150, 0],
      ['skeleton', 0, -180],
      ['flower', 160, 160],
      ['zombie', -170, 170],
    ],
    hp: 1e6,
    steps: [{ fire: 'bass' }, { frames: 100 }],
  },

  // ---- array order, and a field that grows under the loop -----------------
  // updateShockwaves walks `for (const enemy of this.enemies)` — the LIVE enemy
  // array, in ARRAY ORDER. Not hash order, which is what the base wave uses
  // inside the shared projectile loop, and not distance order, which is what
  // the expanding ring makes it LOOK like. So the order of a Subquake's damage
  // is the SPAWN ORDER of the field, and every rng draw a kill triggers lands in
  // that order.
  //
  // Splitters are how that becomes visible. A splitter bursting pushes four
  // swarmers onto the end of the live array, and a JS array iterator re-reads
  // length, so children pushed by a kill this ring made are visited BY THE SAME
  // RING IN THE SAME PASS — and, spawning at their parent's position, they are
  // already inside the ring's radius, so they are hit immediately rather than
  // waiting for the edge to reach them. The collection grows under the loop
  // that is walking it, exactly as it does for Redline Stomp, and a defensive
  // copy of the array in the extraction deletes those hits and every draw
  // behind them.
  //
  // THREE TRIGGERS, because one ring cannot kill a splitter. Evolved tier-4
  // damage is 25.1875 against a splitter's 40hp, and the `hit` set caps a ring
  // at one hit per body, so the kill can only come from a SECOND ring — which
  // is also what puts two rings of different ages over the same field at once.
  {
    name: 'bass evolved (Subquake), lethal, splitters burst into the ring\'s own pass',
    seed: 0xba55a44,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5]],
    evolved: ['bass'],
    enemies: [
      ...ring('splitter', 70, 8),
      ...ring('splitter', 140, 10, 0.31),
      ...ring('splitter', 210, 10, 0.62),
      ...ring('bat', 270, 12, 0.13),
    ],
    steps: [
      { fire: 'bass' }, { frames: 20 },
      { fire: 'bass' }, { frames: 20 },
      { fire: 'bass' }, { frames: 140 },
    ],
  },

  // ---- mid-evolve ---------------------------------------------------------
  // A base wave still rolling when the bass evolves. This is the sharpest
  // mid-evolve in the file so far, because the two modes do not merely coexist
  // on one role — they coexist in DIFFERENT WORLD ARRAYS updated in DIFFERENT
  // PHASES. The in-flight wave keeps being resolved by updateProjectiles with
  // its infinite pierce and its 6-unit shove, while the next trigger pushes a
  // Shockwave that updateShockwaves resolves two phases later in the same
  // frame, over the same bodies, from the same role, with a different damage
  // number and a different shove.
  //
  // The extraction has to keep those on separate paths AND in that order: the
  // bass's tickAt is the 'shockwaves' phase, which runs after the shared
  // projectile loop, so on any frame where both land the wave's damage is
  // attributed first. Swap them and damageByRole is unchanged, every hp is
  // unchanged, and only the ORDERED FX STREAM and the rng draw order say so.
  //
  // BUT NOT BY THIS SCENARIO, and the difference is worth stating rather than
  // assuming. Hoisting updateShockwaves above updateProjectiles IS caught, and
  // the scenario that catches it is the loaded evolved band at the bottom of
  // this block — not this one. Here the ring and the wave end up acting on
  // different bodies (the ring sweeps the near rings, the wave overtakes them
  // and reaches the far file), so there is no frame on which both resolve
  // against the same body and nothing for the order to change. What THIS
  // scenario pins is that the two modes coexist at all: two arrays, two phases,
  // one role, one frame. Phase ORDER is the band's job.
  //
  // The field is split for the same reason the hat's mid-evolve file is: the
  // near cluster is what the ring reaches, the far file is what only the
  // travelling wave reaches, so both modes have bodies of their own to act on
  // and neither one's record is swallowed by the other's.
  {
    name: 'bass mid-evolve with a base wave still rolling',
    seed: 0xba552ed,
    weapons: [['bass', 4]],
    items: [['heavyAmp', 5]],
    enemies: [
      ...ring('flower', 110, 10),
      ...ring('flower', 210, 12, 0.21),
      ...file('flower', [420, 460, 500, 540, 580]),
    ],
    hp: 1e6,
    steps: [
      { fire: 'bass' },
      { frames: 6 },
      { evolve: 'bass' },
      { frames: 6 },
      { fire: 'bass' },
      { frames: 150 },
    ],
  },

  // ---- the bass in a band -------------------------------------------------
  // Ordering. The base wave shares the projectile array, the spatial hash, the
  // rng stream and the WEAPON_SHOVE table with weapons that have not moved yet
  // — CLAP is the other entry in that table, so a band scenario is the only
  // place a change to it shows up as somebody else's knock moving. And because
  // a bass wave is the longest-lived shot in the game outside an arp orbiter
  // (2.6s, and it never spends pierce), it is still sweeping the field long
  // after every other weapon's trigger has resolved, which is what makes it
  // worth eight other weapons' worth of noise to record.
  //
  // The bass fires FIRST in each, so its wave is in the shared array before the
  // other eight weapons' entities are — the ordering the extraction has to
  // reproduce.
  {
    name: 'bass in a full band, base, damage meter',
    seed: 0xba55ba1,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: BASS_SWEPT_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'bass' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 160 },
    ],
  },
  {
    name: 'bass in a full band, base, lethal',
    seed: 0xba55ba2,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    // SPLITTERS AT 40HP, for the reason the hat's lethal band scenario spells
    // out: against a file of 10hp zombies the other eight weapons clear the
    // field before the slow wave has crossed half of it, and the scenario
    // records a band in which the bass did nothing. A 40hp body survives the
    // opening volley, so the wave arrives to a field still standing — and the
    // bursts grow the enemy array under every loop walking it.
    enemies: [
      ...ring('splitter', 90, 8),
      ...ring('splitter', 180, 12, 0.21),
      ...ring('splitter', 270, 12, 0.42),
      ...ring('splitter', 360, 12, 0.63),
    ],
    steps: [
      { fire: 'bass' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 160 },
    ],
  },
  {
    name: 'bass in a full evolved band, loaded build, walking',
    seed: 0xba55ba3,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5], ['doubleTake', 2],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: BASS_QUAKE_FIELD,
    hp: 1e6,
    // THE PLAYER WALKS, and for Subquake specifically that is not decoration:
    // it is the only band scenario in which the ring's fire-time anchor and the
    // player's position are ever different, so a ring that had learned to
    // follow the player is caught here as well as in its own scenario — this
    // time with eight other weapons' output on the same bodies to hide behind.
    // Wide Lens is in the build, so the max radius is 374.4 rather than 288 and
    // the areaMul read is under test inside a loaded band too.
    //
    // FOUR bass triggers, so four rings of four different ages overlap the same
    // field while the anchor of each sits at a different point along the walk.
    steps: [
      { walk: [2, -1] },
      { frames: 10 },
      { fire: 'bass' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'chord' }, { fire: 'lead' }, { fire: 'clap' },
      { fire: 'bass' }, { fire: 'bell' }, { fire: 'arp' },
      { fire: 'bass' },
      { frames: 160 },
    ],
  },

  // ==========================================================================
  // THE CHORD (#141)
  // ==========================================================================
  // Recorded BEFORE the extraction, on the unchanged run.ts, per the order at
  // the top of this file.
  //
  // The chord is the sixth shape the migration has met and the first that owns
  // an ENTITY TYPE nobody else uses. The kick owned a pass; the arp owned the
  // shared projectile loop through ProjectileBehavior; the snare, hat and bass
  // rode shared physics. The chord is the only weapon in the game that spawns
  // a Zone, and `updateZones` — a SHARED loop, inside the zero-branches guard's
  // protected set — is today almost entirely chord code:
  //
  //   1. THE THROW. It is the only weapon that does not fire from the player.
  //      `nearestEnemy(ZONE_THROW_RANGE)` picks a body inside 420 and the zone
  //      lands on that body's CENTRE; with nothing in range it drops underfoot.
  //      This extraction is the one that adds ctx.nearestEnemy.
  //   2. THE TICK GRID. A zone spawns with `tickT` 0, so it lands one tick
  //      IMMEDIATELY and then every ZONE_TICK_S (0.9s) for its whole life. The
  //      per-tier `damage` is per tick, not per trigger.
  //   3. THE SLOW. Each tick writes `slowT = ZONE_TICK_S + 0.15` and folds
  //      `zoneSlowMul = min(zoneSlowMul, z.slowMul)` onto everything it covers
  //      — ZONE_SLOW_MUL 0.55 base, 0.42 evolved. The min is a COMBINATION
  //      rule, not an assignment, and it only shows itself when two zones of
  //      different strengths cover the same body.
  //   4. AFTERHOURS: a 65-unit-a-second DRIFT toward the densest pack, and
  //      pairwise MERGING with three separate caps.
  //
  // WHAT THE DIGEST DOES AND DOES NOT SEE. The zone line carries
  // `pos / r / dmg / life / tick / evolved`, so conf.radius, conf.lifetimeS,
  // conf.damage, the evolved 1.55 / 1.35 / 1.25 multipliers, ZONE_TICK_S and
  // every merge cap are pinned AS LITERALS by any scenario that ends with a
  // zone alive. It does NOT carry `slowMul`, `driftSpeed`, `damageCap` or
  // `slow`, so those four have to be pinned BEHAVIOURALLY:
  //   - slowMul through `lastMove=`, the exact per-frame velocity moveEnemies
  //     chose after `speed *= e.zoneSlowMul`;
  //   - slow / slowT through `slow=` on the enemy line;
  //   - driftSpeed through where the zone has walked to;
  //   - damageCap through a merged zone's damage — see the cascade scenario,
  //     which is the only one that gets anywhere near it.
  //
  // THE CHORD DRAWS NO RNG AT FIRE TIME. nearestEnemy is a scan and spawnZone
  // rolls nothing, so a chord trigger costs zero draws — and the scenarios
  // below prove it by arithmetic rather than by a zero: every solo scenario
  // with absurd hp records `rngDraws: 1`, the fixed setup cost every scenario
  // in this file pays, and the ones that fire ONE trigger, FOUR triggers and
  // TEN triggers all record that same 1. That is the same trap the hat block
  // describes: `aimDir` is a one-line-tidier spelling of the throw and it DRAWS
  // (twice on an empty screen), which nothing but rngDraws would catch — and
  // under a per-trigger draw those three counts would read 1, 4 and 10.
  //
  // ROLE-KEYED TABLES: THE CHORD IS IN NEITHER, and like the hat that is a
  // finding rather than an omission. WEAPON_SHOVE is { clap: 12 } and
  // SPARK_HIT_ROLES is { lead }; a chord tick lands damage and a slow and
  // nothing else. Every scenario below records that ABSENCE — knock stays
  // 0,0,0 on every body a zone covers, and the fx stream carries `dmg` events
  // and death rings only — so an extraction that "tidies up" by giving the
  // zone a shove or a spark it never had fails here.

  // ---- the base ladder, as literals ---------------------------------------
  // One live zone and one body under it. The digested zone line is the tier's
  // whole stats block written out: radius 48/56/64/76, lifetime 2.0/2.2/2.5/2.8
  // and damage 1/1/1/2, plus `tick=` holding ZONE_TICK_S minus the one frame
  // that has elapsed since the spawn tick fired. The ring at 900 populates the
  // spatial hash without ever being in reach.
  //
  // ONE FRAME, deliberately: it is the shortest run that proves `tickT` starts
  // at ZERO. A zone that started its timer at ZONE_TICK_S instead would have
  // dealt nothing at all by here, and the damage line is what says otherwise.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `chord base tier ${tier}, solo, one live zone pins the stat row`,
    seed: 0xc40d00 + tier,
    weapons: [['chord', tier]],
    enemies: [['swarmer', CHORD_ANCHOR, 0], ...ring('zombie', 900, 8)],
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 1 }],
  })),

  // ---- the base ladder, as consequences -----------------------------------
  // The same four rungs read as WHICH BODIES the zone actually covers, against
  // the arc comb. The literal pin above catches a changed radius; this one
  // catches a radius that is still right but is no longer being READ — and it
  // catches the reach RULE as well as the number, because damageArea resolves
  // at `zone.radius + body.radius` and an extraction that compared against the
  // bare radius would drop the innermost arc at every tier.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `chord base tier ${tier}, solo, the radius comb`,
    seed: 0xc40c00 + tier,
    weapons: [['chord', tier]],
    enemies: CHORD_ARC_FIELD,
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 1 }],
  })),

  // ---- the tick grid -------------------------------------------------------
  // A whole zone life at 60fps. ZONE_TICK_S is 0.9 and a zone lands one tick on
  // spawn, so the tick count is 1 + floor(lifetimeS / 0.9): FOUR ticks at tier
  // 4 (2.8s) and THREE at tier 1 (2.0s). That relationship is the one config.ts
  // spells out at length and the one a "tidy" extraction is most likely to
  // break by starting the timer full — which costs exactly one tick per zone at
  // every tier and nothing else.
  //
  // Both rungs run past the zone's death (200 frames is 3.33s), so the digest
  // also records the retirement: an empty zones list, and a total damage figure
  // that stops climbing. The swarmers walk in toward the player while this
  // happens, which is real and deterministic — a body that walks OUT of a zone
  // between ticks is exactly the case that separates "damage per tick" from
  // "damage per zone".
  ...([1, 4] as const).map((tier): ParityScenario => ({
    name: `chord base tier ${tier}, solo, a whole zone life on the tick grid`,
    seed: 0xc40719 + tier,
    weapons: [['chord', tier]],
    enemies: CHORD_ARC_FIELD,
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 200 }],
  })),

  // ---- the throw -----------------------------------------------------------
  // ZONE_THROW_RANGE is 420 and nearestEnemy compares SQUARED distances with a
  // strict `<`, so the boundary is exactly 420 from the player. These two
  // scenarios bracket it ten units apart, and the difference between them is
  // not a damage total but the zone's own digested POSITION: at 415 the zone
  // lands on the body, at 425 it lands underfoot and the body — 425 out against
  // tier 4's reach of 76 + 17.5 — is never touched at all.
  //
  // FLOWERS, because the throw is resolved at fire time from the placed
  // geometry and a flower is the one body slow enough (8.9 a second) that the
  // placed geometry is still the geometry when the scenario ends. The ring at
  // 900 is out of range in both, so it can never be the target.
  {
    name: 'chord base tier 4, thrown at the nearest body inside the 420 range',
    seed: 0xc40417,
    weapons: [['chord', 4]],
    enemies: [['flower', 415, 0], ...ring('zombie', 900, 8)],
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 1 }],
  },
  {
    name: 'chord base tier 4, nothing inside the 420 range drops it underfoot',
    seed: 0xc40425,
    weapons: [['chord', 4]],
    enemies: [['flower', 425, 0], ...ring('zombie', 900, 8)],
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 1 }],
  },

  // ---- the zone does not follow the player ---------------------------------
  // A base zone's driftSpeed is 0: it is a carpet laid on the ground, not an
  // aura. The player fires, then walks away for a second and a half. The zone's
  // digested position must not move by one unit, and the arc comb it was thrown
  // onto must keep taking ticks while the player leaves.
  //
  // This is the shape the bass block calls out for Subquake and it is available
  // to any extraction: a module that keeps a reference to the player and
  // re-anchors its entity every tick looks tidier than one that copies two
  // numbers at spawn, and nothing but a scenario where the player MOVES ever
  // notices the difference.
  {
    name: 'chord base tier 4, the zone stays where it landed when the player walks off',
    seed: 0xc40a1c,
    weapons: [['chord', 4]],
    enemies: CHORD_ARC_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'chord' },
      { frames: 5 },
      { walk: [-1, 0] },
      { frames: 90 },
    ],
  },

  // ---- the slow ------------------------------------------------------------
  // The half of the weapon that is NOT damage, and the half with the thinnest
  // cover: `slowMul` is not a digested field on the zone, so the only trace
  // ZONE_SLOW_MUL leaves anywhere is a body moving more slowly than it should.
  // `lastMove=` records exactly that, frame by frame, and the unslowed witness
  // out at (200, 400) records what the same body does when no zone holds it.
  //
  // SEVENTY FRAMES, which is 1.167s, and the number is chosen against the two
  // constants that gate each other here. slowT is set to ZONE_TICK_S + 0.15 =
  // 1.05 and the next tick lands at 0.9, so the slow is RENEWED before it
  // expires and a held body never gets a full-speed frame. Cut the 0.15 to 0
  // and the two numbers meet exactly; cut ZONE_TICK_S's renewal and a gap opens
  // in the middle of the run. Either way a `lastMove` line moves.
  {
    name: 'chord base tier 4, the zone slows what it holds',
    seed: 0xc4051040,
    weapons: [['chord', 4]],
    enemies: CHORD_SLOW_FIELD,
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 70 }],
  },

  // ---- several zones at once ----------------------------------------------
  // Four triggers on a beat grid. Base zone lifetimes were deliberately raised
  // past two trigger intervals (config.ts says so at length) precisely so that
  // zones OVERLAP and the chord reads as a carpet building up rather than one
  // area teleporting around — so several live zones is the weapon's normal
  // condition, not an edge case.
  //
  // Each zone carries its OWN tickT, so the four tick grids interleave rather
  // than firing together; a refactor that hoists the timer onto the weapon
  // collapses four independent schedules into one and this scenario moves. Base
  // zones must ALSO never merge — the merge pass skips anything that is not
  // evolved — so the digest has to end with four separate zone lines, not one
  // fat one.
  {
    name: 'chord base tier 4, four triggers on a beat grid',
    seed: 0xc40b17,
    weapons: [['chord', 4]],
    enemies: CHORD_ARC_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'chord' }, { frames: 11 },
      { fire: 'chord' }, { frames: 11 },
      { fire: 'chord' }, { frames: 11 },
      { fire: 'chord' }, { frames: 120 },
    ],
  },

  // ---- lethal --------------------------------------------------------------
  // Natural hp, so kills, killsByRole, gem/note drops and every rng draw behind
  // them are in the digest — the half of the coverage the damage-meter
  // scenarios above deliberately give up.
  //
  // BATS at 1hp, because the base chord's damage ladder is 1 or 2 PER TICK and
  // against anything tougher the zone expires long before a body dies. A bat
  // dies to any tick, so the field turns directly into "which bodies did this
  // tick cover, in what order" — and the hash query order behind that ordering
  // is itself part of what the extraction must reproduce.
  {
    name: 'chord base tier 4, solo, lethal bat pack',
    seed: 0xc4011e7,
    weapons: [['chord', 4]],
    enemies: [
      ['bat', CHORD_ANCHOR, 0],
      ...arcAt('bat', CHORD_ANCHOR, 0, 40, [-90, -45, 0, 45, 90]),
      ...arcAt('bat', CHORD_ANCHOR, 0, 70, [-67.5, -22.5, 22.5, 67.5]),
      ...arcAt('bat', CHORD_ANCHOR, 0, 100, [-90, -45, 0, 45, 90]),
    ],
    steps: [{ fire: 'chord' }, { frames: 120 }],
  },
  // Splitters at 4hp against tier 4's 2 damage a tick: two ticks and a body
  // bursts, which means the TICK CADENCE decides the frame each burst happens
  // on. Each burst pushes four swarmers into the live enemy array, and
  // damageArea is walking a query buffer taken from the spatial hash before the
  // burst — so the collection grows under the loop, and the newcomers are only
  // reached on the NEXT tick. That ordering is part of what "behavior
  // unchanged" has to mean.
  {
    name: 'chord base tier 4, solo, lethal with splitters',
    seed: 0xc4015917,
    weapons: [['chord', 4]],
    enemies: [
      ['splitter', CHORD_ANCHOR, 0],
      ...arcAt('splitter', CHORD_ANCHOR, 0, 55, [-90, -30, 30, 90]),
      ...arcAt('splitter', CHORD_ANCHOR, 0, 95, [-60, 0, 60]),
    ],
    hp: 4,
    steps: [{ fire: 'chord' }, { frames: 200 }],
  },

  // ==========================================================================
  // AFTERHOURS
  // ==========================================================================
  // WIDE LENS IS NOT OPTIONAL HERE, and it changes the geometry of every
  // scenario below. Afterhours' partner item is Wide Lens and eligibleEvolution
  // gates every evolution on its partner sitting at max level, so an Afterhours
  // zone can only ever exist alongside areaMul 1.30. applyBuild multiplies
  // conf.radius by areaMul BEFORE spawnZone multiplies it by 1.55, so a tier-4
  // Afterhours zone is 76 * 1.30 * 1.55 = 153.14 units across, never 117.8.
  // Both multipliers are in the digested `r=`, in that order.
  //
  // The evolution is four separate changes on top of that: radius x1.55,
  // lifetime x1.35, damage x1.25, slowMul 0.42 instead of 0.55 — plus two
  // behaviours the base zone does not have at all, the drift and the merge.

  // THERE IS NO TIER LADDER HERE, and that is a rule rather than a gap:
  // eligibleEvolution refuses any weapon below tier 4, so an Afterhours zone
  // only ever exists at 76 * 1.30 * 1.55. Every scenario below is tier 4 for
  // that reason, and the consequences run deeper than scenario bookkeeping —
  // see the merge block.

  // ---- the evolved multipliers, as literals -------------------------------
  // One live zone, one frame. Every one of the three spawn multipliers is a
  // separate factor in a separate digested field, so an edit to any one of them
  // moves exactly one number.
  {
    name: 'chord evolved (Afterhours), one live zone pins the multipliers',
    seed: 0xaf7e04,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: [['swarmer', CHORD_ANCHOR, 0], ...ring('zombie', 900, 8)],
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 1 }],
  },

  // ---- the harder slow -----------------------------------------------------
  // The same field and the same seventy frames as the base slow scenario, so
  // the two digests are readable side by side: every `lastMove` under an
  // Afterhours zone is 18.7 units a frame — 0.42 of a zombie's walk — where the
  // base scenario records 24.5, which is 0.55 of it. The witness stays outside
  // both zones and records the full 44.65 in both, so the pair of digests
  // separates "the slow got stronger" from "everything got slower".
  {
    name: 'chord evolved (Afterhours), the harder slow',
    seed: 0xaf75104,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: CHORD_SLOW_FIELD,
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 70 }],
  },

  // ---- the drift -----------------------------------------------------------
  // Afterhours zones walk. Every frame the zone picks the live enemy with the
  // most neighbours inside 120 units and steps `driftSpeed * dt` toward it,
  // clamped to the remaining distance — 65 units a second, and driftSpeed is
  // NOT a digested field, so where the zone has got to is the only record of
  // it.
  //
  // The field is a lone throw anchor at 200 and a packed file out at 520-870.
  // The anchor has one neighbour (itself); the file's middle members have five,
  // so the drift target is a file member and the zone leaves the body it landed
  // on and crosses 162 units of open ground toward the pack over 150 frames.
  // A zone that had learned to follow the PLAYER instead would walk the other
  // way; a zone that had lost its drift would still be sitting on the anchor.
  {
    name: 'chord evolved (Afterhours), the zone drifts toward the densest pack',
    seed: 0xaf7d21f7,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: [['flower', 200, 0], ...file('flower', [520, 570, 620, 670, 720, 770, 820, 870])],
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 150 }],
  },

  // ---- the drift target is SAMPLED, not scanned ---------------------------
  // The single strangest line in the whole weapon, and the one an extraction is
  // most likely to "clean up" into something that reads better and behaves
  // differently:
  //
  //     for (let sample = 0; sample < this.enemies.length;
  //          sample += Math.max(1, Math.floor(this.enemies.length / 30)))
  //
  // It is a STRIDE over the enemy array, not a scan of it. Under thirty bodies
  // the stride is 1 and it happens to look like a scan, which is why every
  // other scenario in this block is blind to it: they all run small fields.
  // With SIXTY-ONE bodies the stride is 2, and only EVEN array indices are ever
  // considered as drift targets.
  //
  // CHORD_STRIDE_FIELD is built so that the parity of an index is the whole
  // answer. Even indices are a loose ring at 300 where every member has exactly
  // three neighbours; odd indices are a packed grid parked 700 units out at -x
  // where every member has nine or more. So:
  //   - as written (stride 2, evens only): the best sampled body is the first
  //     ring member, at (300, 0), and the zone drifts toward +x;
  //   - scanning every body (stride 1): a grid member wins outright and the
  //     zone drifts toward -x, 180 degrees the other way.
  // The throw anchor is appended LAST, at index 60, so it does not shift the
  // parity of everything behind it, and it sits 150 from the player (nearest,
  // so it takes the throw) and 150 from the nearest ring member (so it neither
  // ties the throw nor inflates anybody's neighbour count).
  //
  // Ties are resolved by `>` against a bestNeighbors seeded at -1, i.e. FIRST
  // sampled wins, so the target is pinned to one exact body and not to a set.
  {
    name: 'chord evolved (Afterhours), the drift target is sampled with a stride',
    seed: 0xaf751de,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: CHORD_STRIDE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'chord' }, { frames: 120 }],
  },

  // ---- the merge -----------------------------------------------------------
  // Afterhours zones that overlap fuse, pairwise, once per zone per frame,
  // AFTER the tick pass — which is why the pass order matters: each original
  // zone lands its currently scheduled tick at most once before it is absorbed.
  // The survivor is the NEWER zone (the loop walks the array from the top down
  // and `a` is the higher index), and it takes an area-weighted centroid, a
  // radius of `min(180, sqrt(ra^2 + rb^2))`, a lifetime of
  // `min(4.5, max + min * 0.25)` and a damage of
  // `min(a.damageCap, a.damage + b.damage * 0.5)`.
  //
  // A FINDING, recorded here because the extraction has to know it: THE RADIUS
  // CAP ALWAYS BINDS. Afterhours only exists at tier 4 with Wide Lens at max,
  // so every fresh zone is exactly 153.14 across and the very first merge asks
  // for sqrt(2) * 153.14 = 216.57 — already past 180. There is no reachable
  // state in which `Math.sqrt(totalArea)` decides a merged radius: the answer
  // is 180 on the first merge and 180 forever after. So these scenarios pin the
  // CAP, and the sqrt underneath it is pinned only as "whatever it produces is
  // at least 180". An extraction may not read that as licence to drop the
  // formula — it must be ported verbatim — but a mutation to the sqrt alone
  // will NOT fail this harness, and that has to be said out loud rather than
  // discovered later.
  //
  // The lifetime cap is different, and both sides of it are covered below: a
  // fresh pair asks for 3.78 + 0.945 = 4.725 and is clamped to 4.5, while a
  // pair whose older half has decayed past 2.88 seconds of life is NOT clamped
  // and the `max + min * 0.25` arithmetic decides the answer outright.

  // Two triggers eleven frames apart, both zones essentially fresh: the merge
  // asks for 216.57 radius and 4.725 lifetime and is clamped on BOTH. This is
  // the scenario that fails if either cap is removed.
  {
    name: 'chord evolved (Afterhours), two fresh zones merge and both caps bind',
    seed: 0xaf7c1a4,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: [['flower', 200, 0], ...arcAt('flower', 200, 0, 90, [-60, 0, 60])],
    hp: 1e6,
    steps: [
      { fire: 'chord' }, { frames: 11 },
      { fire: 'chord' }, { frames: 40 },
    ],
  },
  // The same pair NINETY FRAMES apart, and the gap is the whole point. The
  // older zone has burned 1.5 of its 3.78 seconds by the time the second lands,
  // so `max + min * 0.25` comes out at 3.78 + 2.28 * 0.25 = 4.35 — UNDER the
  // 4.5 cap — and the merged lifetime is the formula's answer rather than the
  // clamp's. This is the scenario that fails if the 0.25 coefficient moves, or
  // if `max`/`min` are swapped, or if somebody replaces the pair with an
  // average; the fresh-pair scenario above cannot see any of those, because the
  // clamp swallows all of them.
  {
    name: 'chord evolved (Afterhours), a decayed partner leaves the lifetime un-clamped',
    seed: 0xaf7de4c,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: [['flower', 200, 0], ...arcAt('flower', 200, 0, 90, [-60, 0, 60])],
    hp: 1e6,
    steps: [
      { fire: 'chord' }, { frames: 90 },
      { fire: 'chord' }, { frames: 60 },
    ],
  },
  // Four triggers on a beat grid, so the merge runs three times in a row and
  // the DAMAGE accumulator is the thing under test rather than the geometry.
  // The survivor is always the newest zone, so each merge is
  // `2.5 + previous * 0.5`: 3.75, then 4.375, then 4.6875 — a convergent series
  // that walks toward 5 and can never reach the 7.5 cap. Three separate rungs
  // of it are in one digest, so the 0.5 coefficient and the "newest survives"
  // direction both have cover.
  {
    name: 'chord evolved (Afterhours), four triggers accumulate merged damage',
    seed: 0xaf7ca9,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: [['flower', 200, 0], ...arcAt('flower', 200, 0, 90, [-60, 0, 60])],
    hp: 1e6,
    steps: [
      { fire: 'chord' }, { frames: 6 },
      { fire: 'chord' }, { frames: 6 },
      { fire: 'chord' }, { frames: 6 },
      { fire: 'chord' }, { frames: 60 },
    ],
  },
  // TEN TRIGGERS INSIDE ONE FRAME. Ten zones stack on the same point, and the
  // merge pass then cascades: it walks down the array fusing pairs, skipping an
  // extra index after each fusion (`i -= 1; break;` plus the loop's own `i--`),
  // so ONE pass halves the population rather than reducing it by one. That
  // index arithmetic is the most delicate thing in the whole loop and it has no
  // other cover — with one merge per frame the `i -= 1` is unobservable.
  //
  // It is also the only route anywhere near `damageCap` (spawn damage x3, so
  // 7.5). Under sequential triggers the accumulator converges on 5 and the cap
  // can NEVER bind; only a cascade, where the absorbed zone is itself already a
  // merge, pushes past that. Whether it reaches the clamp is recorded rather
  // than asserted — the digest says what the number is, and the extraction has
  // to reproduce it.
  {
    name: 'chord evolved (Afterhours), a same-frame cascade of merges',
    seed: 0xaf7ca5c,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: [['flower', 200, 0], ...arcAt('flower', 200, 0, 90, [-60, 0, 60])],
    hp: 1e6,
    steps: [
      { fire: 'chord' }, { fire: 'chord' }, { fire: 'chord' }, { fire: 'chord' },
      { fire: 'chord' }, { fire: 'chord' }, { fire: 'chord' }, { fire: 'chord' },
      { fire: 'chord' }, { fire: 'chord' },
      { frames: 60 },
    ],
  },

  // ---- lethal --------------------------------------------------------------
  // Natural-ish hp under a drifting, merging zone. Splitters at 6hp against
  // 2.5 damage a tick is three ticks to a burst, so the tick grid decides the
  // frame each burst lands on; the bursts push swarmers into the array the zone
  // is walking; and the zone MOVES while all of that happens, so which bodies
  // it covers changes between ticks. Two triggers, so a merge is in the middle
  // of it.
  {
    name: 'chord evolved (Afterhours), lethal with splitters',
    seed: 0xaf7115,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    evolved: ['chord'],
    enemies: [
      ['splitter', CHORD_ANCHOR, 0],
      ...arcAt('splitter', CHORD_ANCHOR, 0, 60, [-90, -30, 30, 90]),
      ...arcAt('splitter', CHORD_ANCHOR, 0, 110, [-60, 0, 60]),
      ...arcAt('splitter', CHORD_ANCHOR, 0, 160, [-45, 45]),
    ],
    hp: 6,
    steps: [
      { fire: 'chord' }, { frames: 20 },
      { fire: 'chord' }, { frames: 200 },
    ],
  },

  // ---- mid-evolve ----------------------------------------------------------
  // A base zone still ticking when the chord evolves, and the two of them
  // overlapping the same bodies. `evolved` is frozen on the zone at spawn, so
  // the base zone must keep its 98.8 radius, its 2.8-second life, its 0.55
  // slow and its ZERO drift while an Afterhours zone breathes 153 units across
  // it, walks at 65 a second, and tries to merge — and CANNOT, because the
  // merge pass skips any zone that is not evolved. Base and evolved chord in
  // the same frame in the same array, which is the seam an extraction is most
  // likely to unify into one mode flag read at tick time instead of at spawn
  // time.
  //
  // It is also the ONLY place the slow's combination rule is visible.
  // `e.zoneSlowMul = Math.min(e.zoneSlowMul, z.slowMul)` is a min, not an
  // assignment, so a body covered by both zones walks at 0.42 and not at 0.55
  // and not at 0.231 — three different answers that only differ when the two
  // strengths differ. Every other scenario here has one slowMul in play and
  // cannot tell a min from a write.
  {
    name: 'chord mid-evolve with a base zone still holding the pack',
    seed: 0xc402ed0,
    weapons: [['chord', 4]],
    items: [['wideLens', 5]],
    enemies: CHORD_SLOW_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'chord' },
      { frames: 20 },
      { evolve: 'chord' },
      { frames: 6 },
      { fire: 'chord' },
      { frames: 140 },
    ],
  },

  // ---- the chord in a band -------------------------------------------------
  // Ordering. A zone is the longest-lived entity any weapon leaves on the field
  // (2.8s base, 3.78 evolved, up to 4.5 merged) and it is the only one that
  // writes to a channel — `zoneSlowMul` — that every OTHER weapon then reads
  // indirectly, because a slowed body is somewhere different when the next
  // weapon's shot arrives. So the chord in a band is not just eight weapons of
  // noise around it: it is the one weapon whose output changes where everybody
  // else's output lands.
  //
  // The chord fires FIRST in each, so its zone is on the field before the other
  // eight weapons' entities are.
  {
    name: 'chord in a full band, base, damage meter',
    seed: 0xc40ba1,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: CHORD_ARC_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'chord' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 200 },
    ],
  },
  {
    name: 'chord in a full band, base, lethal',
    seed: 0xc40ba2,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    // SPLITTERS AT 40HP, for the reason the bass's lethal band scenario spells
    // out: the chord deals 2 damage a tick and needs its target to still be
    // standing several ticks later, and against 10hp bodies the other eight
    // weapons clear the field inside the first half-second.
    enemies: [
      ['splitter', CHORD_ANCHOR, 0],
      ...arcAt('splitter', CHORD_ANCHOR, 0, 60, [-90, -30, 30, 90]),
      ...arcAt('splitter', CHORD_ANCHOR, 0, 110, [-60, 0, 60]),
    ],
    steps: [
      { fire: 'chord' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'lead' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 200 },
    ],
  },
  {
    name: 'chord in a full evolved band, loaded build, walking',
    seed: 0xc40ba3,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5], ['doubleTake', 2],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: CHORD_ARC_FIELD,
    hp: 1e6,
    // EXTENSION CABLE is in this build and nowhere else in the chord block, so
    // this is the only scenario where durationMul is non-identity and the
    // zone's lifetime is 2.8 * 1.32 * 1.35 rather than 2.8 * 1.35 — applyBuild
    // and the evolution multiplier stacking in that order, inside a band.
    //
    // THREE chord triggers while the player WALKS, so three zones land at three
    // different points along the walk and then drift and merge on a field eight
    // other weapons are also working. A zone that had learned to follow the
    // player is caught here a second time, with everybody else's output on the
    // same bodies to hide behind.
    steps: [
      { walk: [2, -1] },
      { frames: 10 },
      { fire: 'chord' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'chord' }, { fire: 'bass' }, { fire: 'lead' }, { fire: 'clap' },
      { fire: 'chord' }, { fire: 'bell' }, { fire: 'arp' },
      { frames: 200 },
    ],
  },

  // ==========================================================================
  // THE LEAD (#141)
  // ==========================================================================
  // Recorded BEFORE the extraction, on the unchanged run.ts, per the order at
  // the top of this file.
  //
  // The lead is the seventh shape the migration has met, and it is the first
  // weapon whose identity is mostly INSIDE THE SHARED LOOP'S OWN MOTION rather
  // than beside it. It spawns plain projectiles like the snare — but with
  // `homing: true`, so the shared loop re-picks a target and turns the shot
  // every frame it is alive. Nothing about that is a branch any more: since
  // #140 the whole of it is FIELDS ON THE SHOT, set at spawn —
  //
  //   pr.homing        true, from `role === 'lead'` in baseProjectile;
  //   pr.turnRate      10 base, 14 evolved;
  //   pr.homingRange   Infinity base, 320 evolved (this is the field #140
  //                    created to get `pr.role !== 'lead'` out of the loop);
  //
  // — which means the lead is the weapon with the most behavior that the
  // shared loop will happily keep executing after the extraction, on values the
  // module is now responsible for setting. A module that forgets one of these
  // does not crash and does not fail a type check; it silently spawns a shot
  // that flies straight, or one that homes across the whole arena.
  //
  // The rest of its identity:
  //   - a tier ladder that is a PIERCE ladder as well (1/1/1/2), aimed with
  //     aimFan(0.08);
  //   - Neon Serpent: damage x1.40, turnRate 14, the 320 gate, and
  //     `LEAD_SERPENT.basePierce` (6) routed THROUGH applyBuild, so evolved
  //     pierce is invariantly 11 (#146);
  //   - a SUPERCHARGED EVERY FIFTH TRIGGER: damage x2 and
  //     `radius = max(12, radius * 1.7)`, gated on `triggerCounts.lead % 5`,
  //     a WORLD-OWNED counter that also ticks while the weapon is unevolved;
  //   - SPARK_HIT_ROLES, of which the lead is now the last member. Its per-hit
  //     spark (n=4, spread=12, in pr.color) is view-only and reaches the digest
  //     ONLY through the ordered fx stream, so every scenario below that lands
  //     a hit is also the only cover that table has. The extraction takes the
  //     lead's share through ctx.fx the way the snare did, and deletes the Set,
  //     its lookup, and its INTERIM_EXCEPTIONS entry with it.

  // ---- the tier ladder, solo ----------------------------------------------
  // Base pierce is 1 on tiers 1-3, so a bare seeker dies on the body it was
  // aimed at and these four scenarios read as a damage ladder plus the FRAME
  // AND PLACE the shot died: speed 340/350/360/380 decides when it arrives at
  // the head of the chain, and tier 4's pierce 2 is the first rung that reaches
  // a second body at all — which it can only do by turning.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `lead base tier ${tier}, solo, damage meter`,
    seed: 0x1ead00 + tier,
    weapons: [['lead', tier]],
    enemies: LEAD_CHAIN_FIELD,
    // Absurd hp turns every body into a damage meter AND keeps it in the
    // homing candidate set for the whole flight, which is what makes the
    // threading order readable: a body that dies stops being a target and the
    // seeker's next turn changes with it.
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 150 }],
  })),

  // The same ladder with a pierce budget, which is the only way the ladder's
  // OTHER three numbers become observable. Needle Tips at max lifts base pierce
  // to 6/6/6/7, so every rung threads the whole zig-zag and `speed`, `radius`
  // and `lifetimeS` all decide where the seeker is when the tail of the chain
  // comes up. Ending mid-flight is deliberate for the same reason it is in the
  // arp block: a live seeker's digested x,y,vx,vy IS its accumulated turn
  // history, so turnRate is under test through position, not only damage.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `lead base tier ${tier}, Needle Tips, threads the chain`,
    seed: 0x1ead10 + tier,
    weapons: [['lead', tier]],
    items: [['needleTips', 5]],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 150 }],
  })),

  // Natural hp, so kills, killsByRole, gem/note drops and the rng draws behind
  // them are in the digest. BATS, because a bat dies to one touch of any lead
  // tier and a flower (30hp) dies to none — so this is the scenario where the
  // homing candidate set SHRINKS UNDER THE SEEKER, one body per hit, and the
  // recorded chain is a record of the order it chose. The bats drift ~62 units
  // a second toward the player, which is exactly why they are not used for any
  // geometry pin above; here the order and the drops are the point.
  ...([1, 4] as const).map((tier): ParityScenario => ({
    name: `lead base tier ${tier}, solo, lethal`,
    seed: 0x1ead20 + tier,
    weapons: [['lead', tier]],
    items: [['needleTips', 5]],
    enemies: LEAD_CHAIN_FIELD.map(([, dx, dy]) => ['bat', dx, dy] as const),
    steps: [{ fire: 'lead' }, { frames: 150 }],
  })),

  // The ladder caught IN FLIGHT, and this block exists because the two above
  // did not catch it. Every other lead scenario ends with the seeker gone —
  // spent on pierce or expired — and a dead projectile contributes NO line to
  // the digest, so `lifetimeS` is only ever visible as "did it reach one more
  // body before it died". Moving tier 1's 2.2 to 2.3 changed nothing anywhere
  // in this file: 34 extra units of travel landed in the same gap.
  //
  // So: the out-of-range ring, where there is nothing within 750 to shorten the
  // flight, Needle Tips so an incidental hit cannot end it, and a 90-frame tail
  // against lives of 2.2-2.4s. Every tier's seeker is STILL ALIVE at the digest
  // and its projectile line carries `life=` (lifetimeS minus 1.5s), `pos=` and
  // `v=` (speed 340/350/360/380) and `r=` (6/6/6/7) as four separately
  // falsifiable numbers per rung, none of which needs a hit to be readable.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `lead base tier ${tier}, ladder caught in flight`,
    seed: 0x1ead90 + tier,
    weapons: [['lead', tier]],
    items: [['needleTips', 5]],
    enemies: LEAD_UNAIMED_RING,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 90 }],
  })),

  // ---- the pierce ladder against a file that outlasts it -------------------
  // A file is the layout where "how many bodies does one seeker pass through"
  // is readable straight off the digest. Thirteen bodies against a budget of 7
  // means the tail of the file is untouched and the seeker is GONE, which is
  // the difference between "ran out of pierce" and "ran out of targets".
  {
    name: 'lead base tier 4, Needle Tips, pierce runs out inside the file',
    seed: 0x1eadf1,
    weapons: [['lead', 4]],
    items: [['needleTips', 5]],
    enemies: LEAD_PIERCE_FILE,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 150 }],
  },
  // The same file with NO Needle Tips: pierce 2, so the shot stops two bodies
  // in. The pair brackets `applyBuild`'s `withExtraPierce` on the lead's own
  // tier value — the half of the pierce pipeline that the Neon Serpent
  // scenarios below cannot see, because there the base is LEAD_SERPENT's 6.
  {
    name: 'lead base tier 4, bare pierce 2 in the same file',
    seed: 0x1eadf2,
    weapons: [['lead', 4]],
    enemies: LEAD_PIERCE_FILE,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 150 }],
  },

  // ---- the homing gate, from both sides ------------------------------------
  // Base homing is UNRESTRICTED: `pr.homingRange` is Infinity, so the seeker
  // will cross the player and the whole arena to reach the far body at
  // (-520, 0). Extension Cable is here so it has the life to do it — otherwise
  // "did not reach" would mean "expired".
  {
    name: 'lead base tier 4, unrestricted homing across the gate field',
    seed: 0x1ead31,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['extensionCable', 5]],
    enemies: LEAD_GATE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 250 }],
  },
  // The identical field, the identical build, the identical script — the ONLY
  // difference is the evolution, so the diff between these two baseline entries
  // is the 320-unit gate and nothing else. Widening it, or losing it to a
  // default of Infinity, moves this entry toward the one above.
  {
    name: 'lead evolved (Neon Serpent), the 320-unit gate on the same field',
    seed: 0x1ead32,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['extensionCable', 5]],
    evolved: ['lead'],
    enemies: LEAD_GATE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 250 }],
  },

  // ---- the untargeted aim draw --------------------------------------------
  // Every other lead scenario has a body inside AIM_RANGE, so `aimDir` takes
  // its targeted path and draws ONCE. Here nothing is inside 750, so it draws
  // TWICE — a whole random heading, then the ±0.08 jitter on top. rngDraws is
  // the only channel that records the difference, and a module that drew the
  // heading unconditionally would produce a perfectly plausible shot while
  // desynchronizing every drop for the rest of the run.
  {
    name: 'lead base tier 4, no target in AIM_RANGE, two aim draws',
    seed: 0x1ead41,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['extensionCable', 5]],
    enemies: LEAD_UNAIMED_RING,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 200 }],
  },
  // Same two draws, and then the gate: a Neon Serpent fired at nothing is blind
  // at spawn, because every body on the ring is 800 away and its search stops
  // at 320. So it flies the random heading in a straight line and only ever
  // sees a ring member if its own travel carries it within 320 of one — which
  // over 3.36s of life it does, exactly once, 800-odd units from where it
  // started. A base seeker on the identical field curves out to a target from
  // frame one. The pair is the cleanest statement in this block of what the
  // gate changes: not how hard the seeker hits, but WHEN it is allowed to look.
  {
    name: 'lead evolved (Neon Serpent), fired blind at an out-of-range ring',
    seed: 0x1ead42,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['extensionCable', 5]],
    evolved: ['lead'],
    enemies: LEAD_UNAIMED_RING,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 200 }],
  },

  // ---- Neon Serpent --------------------------------------------------------
  // Damage x1.40, turnRate 14 instead of 10, and pierce 11. Needle Tips at max
  // is not an option here: `eligibleEvolution` refuses the evolution without
  // it, which is exactly why 11 is the only pierce a Neon Serpent ever has.
  {
    name: 'lead evolved (Neon Serpent), damage meter on the chain',
    seed: 0x1ead51,
    weapons: [['lead', 4]],
    items: [['needleTips', 5]],
    evolved: ['lead'],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 150 }],
  },
  // Pierce 11 against thirteen bodies: the budget runs out two short of the end
  // of the file, so the two survivors at 630 and 680 ARE the recorded value of
  // `LEAD_SERPENT.basePierce + extraPierce`. Change the 6 and the file's tail
  // moves; that is the only way that constant is observable at all.
  {
    name: 'lead evolved (Neon Serpent), pierce 11 runs out inside the file',
    seed: 0x1ead52,
    weapons: [['lead', 4]],
    items: [['needleTips', 5]],
    evolved: ['lead'],
    enemies: LEAD_PIERCE_FILE,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 150 }],
  },
  // Lethal, with splitters at 6hp against 5.6 evolved damage: one touch bursts
  // each one and pushes four swarmers into the LIVE enemy array that the
  // seeker is still homing through. The candidate set grows under the shot
  // mid-flight, and every turn after the first burst is taken against bodies
  // that did not exist when the trigger fired.
  {
    name: 'lead evolved (Neon Serpent), lethal, splitters burst under the seeker',
    seed: 0x1ead53,
    weapons: [['lead', 4]],
    items: [['needleTips', 5]],
    evolved: ['lead'],
    enemies: LEAD_CHAIN_FIELD.map(([, dx, dy]) => ['splitter', dx, dy] as const),
    hp: 6,
    steps: [{ fire: 'lead' }, { frames: 150 }],
  },

  // ---- the fifth trigger ---------------------------------------------------
  // `(triggerCounts.lead ?? 0) % 5 === 0` doubles a Neon Serpent's damage and
  // fattens it to `max(12, radius * 1.7)`. triggerCounts is incremented by the
  // world BEFORE the weapon runs, so the first trigger is count 1 and the FIFTH
  // is the supercharged one — an off-by-one here is a whole different shot on a
  // whole different beat, and nothing but a multi-trigger scenario sees it.
  //
  // Six triggers four frames apart, then a 40-frame tail: total 64 frames
  // against a 144-frame life, so ALL SIX SEEKERS ARE STILL ALIVE in the digest
  // with their own damage and radius on the projectile line. The fifth stands
  // out from the other five by inspection, which is what makes this readable as
  // a pin and not just a total.
  //
  // NO WIDE LENS, so the built radius is 7 and `7 * 1.7 = 11.9` loses to the
  // floor: this entry records the CLAMPED branch of that max().
  {
    name: 'lead evolved, six triggers, the fifth is supercharged',
    seed: 0x1ead61,
    weapons: [['lead', 4]],
    items: [['needleTips', 5]],
    evolved: ['lead'],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 40 },
    ],
  },
  // The OTHER branch of the same max(). Wide Lens at max is areaMul 1.30, so
  // the built radius is 9.1 and `9.1 * 1.7 = 15.47` beats the floor of 12.
  // Without this pair, a module that dropped the floor — or dropped the 1.7 —
  // would still reproduce the entry above exactly, because at tier 4 with no
  // area build the two branches happen to agree to within the clamp.
  {
    name: 'lead evolved with Wide Lens, the fifth trigger clears the radius floor',
    seed: 0x1ead62,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['wideLens', 5]],
    evolved: ['lead'],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 40 },
    ],
  },

  // ---- mid-evolve ----------------------------------------------------------
  // THE COUNTER IS WORLD-OWNED AND IT DOES NOT RESET. Three triggers fired
  // UNEVOLVED still advance triggerCounts.lead to 3, so the second trigger
  // after the evolution is the run's FIFTH and is the supercharged one. An
  // extraction that moves the counter into the module and starts it at zero —
  // or starts it at the evolution — puts the doubled shot on a different beat
  // and moves only this entry.
  {
    name: 'lead mid-evolve, base triggers still advance the fifth-shot counter',
    seed: 0x1ead71,
    weapons: [['lead', 4]],
    items: [['needleTips', 5]],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 4 },
      { evolve: 'lead' },
      { fire: 'lead' }, { frames: 4 },
      { fire: 'lead' }, { frames: 40 },
    ],
  },
  // A BASE seeker still in the air when the lead evolves. Every evolved value
  // is frozen onto the shot at spawn — pierce, turnRate, homingRange, damage —
  // so that seeker keeps hunting at Infinity range with a 10 rad/s turn while
  // the next trigger's serpent is gated at 320 and turns at 14, in the same
  // frame, in the same shared loop, on the same role. That is the seam an
  // extraction most wants to collapse into one mode flag read at tick time.
  {
    name: 'lead mid-evolve with a base seeker still hunting',
    seed: 0x1ead72,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['extensionCable', 5]],
    enemies: LEAD_GATE_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'lead' },
      { frames: 6 },
      { evolve: 'lead' },
      { frames: 6 },
      { fire: 'lead' },
      { frames: 250 },
    ],
  },

  // ---- Double Take ---------------------------------------------------------
  // The lead aims ONCE per trigger and fans the result: `aimFan(0.08)` is one
  // `aimDir` call feeding `fanAround`, so three seekers cost the same one rng
  // draw a single seeker does, and they leave MULTISHOT_FAN_RAD apart around
  // the aim line. Moving the draw inside the fan loop — the mutation the arp
  // block calls the single easiest thing to get wrong — triples rngDraws and
  // scatters the volley. Two triggers, so the second trigger's independent
  // draw is recorded too.
  {
    name: 'lead base tier 4 with Double Take, three seekers from one aim draw',
    seed: 0x1ead81,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['doubleTake', 5]],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'lead' }, { frames: 20 },
      { fire: 'lead' }, { frames: 150 },
    ],
  },

  // ---- the arena rails -----------------------------------------------------
  // THE LEAD IS A RAIL USER, and this is the pair that says so. The arp's
  // ProjectileBehavior.steer returns TRUE, which skips shared travel AND
  // reflectProjectileFromArena together (ADR-0002). The lead's must return
  // FALSE: it only nudges velocity and then lets shared motion and the rails
  // run. Nothing else in this file would notice the difference — with no
  // Mirrorball, `bounces` is 0 and the rail path returns immediately, so a lead
  // module that wrongly steered its own shots would reproduce every other entry
  // here exactly.
  //
  // Mirrorball at max is 3 bounces retaining 0.85, and the ring at 800 sits
  // outside the rails (|x| < 739.6, |y| < 416) so the seeker meets a wall
  // before it meets a body. `damage` on the digested projectile line drops by a
  // factor of 0.85 per bounce and `bounces` counts down, so both halves of the
  // rail rule are recorded, not just the reflection. RECORDED: the base seeker
  // spends all three bounces and lands at damage 2.4565, i.e. 4 * 0.85^3; the
  // evolved one spends one and sits at 4.76, i.e. 5.6 * 0.85. Two different
  // bounce counts and the same retention, in two entries.
  {
    name: 'lead base tier 4 with Mirrorball, homing into the arena rails',
    seed: 0x1ead91,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['mirrorball', 5], ['extensionCable', 5]],
    enemies: LEAD_UNAIMED_RING,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 200 }],
  },
  // The evolved half: blind at 320, so it rides the rails on a fixed heading
  // with no homing correction at all until a bounce happens to carry it within
  // reach of the ring. Pure rail geometry, uncontaminated by turning.
  {
    name: 'lead evolved (Neon Serpent) with Mirrorball, blind off the rails',
    seed: 0x1ead92,
    weapons: [['lead', 4]],
    items: [['needleTips', 5], ['mirrorball', 5], ['extensionCable', 5]],
    evolved: ['lead'],
    enemies: LEAD_UNAIMED_RING,
    hp: 1e6,
    steps: [{ fire: 'lead' }, { frames: 200 }],
  },

  // ---- the lead in a band --------------------------------------------------
  // Ordering, and for the lead it is sharper than for any weapon so far. Every
  // other weapon's footprint is decided at fire time; the lead's is decided
  // every frame, against the LIVE enemy array. So when eight other weapons are
  // killing, shoving and slowing bodies in the same frame, they are not noise
  // around the seeker — they are its input. A kill by the kick two phases
  // earlier removes a homing candidate and the seeker turns somewhere else.
  //
  // The lead fires FIRST in each, so its seekers are on the field before the
  // other eight weapons' entities are.
  {
    name: 'lead in a full band, base, damage meter',
    seed: 0x1eadb1,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    items: [['needleTips', 5]],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'lead' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'chord' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 150 },
    ],
  },
  {
    name: 'lead in a full band, base, lethal',
    seed: 0x1eadb2,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    items: [['needleTips', 5]],
    // SPLITTERS at natural 40hp, for the reason the chord's lethal band spells
    // out: against 10hp bodies the other eight weapons clear the field inside
    // the first half-second and the seeker spends its life with nothing to hunt
    // — which pins nothing. At 40hp the field survives long enough that the
    // candidate set is still shrinking while the seeker is still turning.
    enemies: LEAD_CHAIN_FIELD.map(([, dx, dy]) => ['splitter', dx, dy] as const),
    steps: [
      { fire: 'lead' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'chord' }, { fire: 'clap' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 150 },
    ],
  },
  {
    name: 'lead in a full evolved band, loaded build, walking',
    seed: 0x1eadb3,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    // Every evolution item at max PLUS Double Take, so the fan count, the
    // pierce, the radius, the speed and the lifetime a Neon Serpent spawns with
    // are all off their defaults at once — and Mirrorball is in it, so the
    // rails are live for the seekers in a band as well.
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5], ['doubleTake', 2],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: LEAD_CHAIN_FIELD,
    hp: 1e6,
    // FIVE lead triggers while the player walks, so the supercharged fifth
    // lands inside a full evolved band, on a field the other eight weapons are
    // also working, with the player somewhere other than where the first
    // trigger fired from.
    steps: [
      { walk: [2, -1] },
      { frames: 10 },
      { fire: 'lead' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'lead' }, { fire: 'bass' }, { fire: 'chord' }, { fire: 'clap' },
      { fire: 'lead' }, { fire: 'bell' }, { fire: 'arp' },
      { fire: 'lead' }, { frames: 6 },
      { fire: 'lead' },
      { frames: 150 },
    ],
  },

  // ---- the cone, solo, across the whole tier ladder ------------------------
  // Both of the base clap's ladders at once: CLAP_CONE_FIELD's angular rungs
  // are separated only by `arc` and its radial rungs only by `radius`, so a
  // tier row that edits either one has to move exactly one of these four.
  ...([1, 2, 3, 4] as const).map((tier): ParityScenario => ({
    name: `clap base tier ${tier}, solo, damage meter`,
    seed: 0xc1a900 + tier,
    weapons: [['clap', tier]],
    enemies: CLAP_CONE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  })),

  // Natural hp, so kills, killsByRole, gem/note drops and both rng streams
  // behind them are in the digest. A swarmer has 5 hp: tier 4's 6 kills on one
  // trigger, tier 1's 2 needs three, and BOTH are worth recording — the tier-1
  // run is the only place a body survives a clap and is shoved a second and a
  // third time from a knock channel that is still hot.
  {
    name: 'clap base tier 4, solo, lethal',
    seed: 0xc1a9e1,
    weapons: [['clap', 4]],
    enemies: CLAP_CONE_FIELD,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  },
  {
    name: 'clap base tier 1, solo, lethal, three triggers',
    seed: 0xc1a9e2,
    weapons: [['clap', 1]],
    enemies: CLAP_CONE_FIELD,
    steps: [
      { fire: 'clap' }, { frames: 5 },
      { fire: 'clap' }, { frames: 5 },
      { fire: 'clap' }, { frames: 30 },
    ],
  },

  // ---- the 34-unit point-blank exemption ----------------------------------
  // A clap swung forward also connects with whatever is on the player's back,
  // and that rule is a bare literal in run.ts. CLAP_POINT_BLANK_FIELD cuts it
  // at 33 against 36 on bearings no tier's arc reaches, so the number is
  // falsifiable in both directions.
  {
    name: 'clap base tier 4, the point-blank exemption from both sides',
    seed: 0xc1a9bb,
    weapons: [['clap', 4]],
    enemies: CLAP_POINT_BLANK_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  },
  // The same field on the NARROWEST arc. Tier 1's cone is 14 degrees tighter,
  // so if the exemption were ever folded into the arc test the two rows would
  // stop agreeing about the bodies at 33.
  {
    name: 'clap base tier 1, the point-blank exemption on the narrowest arc',
    seed: 0xc1a9bc,
    weapons: [['clap', 1]],
    enemies: CLAP_POINT_BLANK_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  },

  // ---- Wide Lens moves the reach and NOT the arc ---------------------------
  // applyBuild scales conf.radius by areaMul and leaves conf.arc alone. The
  // radial rungs at 145 and 165 exist only for this row: 145 comes inside a
  // Wide-Lensed tier 4 (108 * 1.3 + 9 = 149.4) and 165 stays out, while every
  // angular rung above records exactly what it records without the item.
  {
    name: 'clap base tier 4, Wide Lens stretches the reach and not the arc',
    seed: 0xc1a9a2,
    weapons: [['clap', 4]],
    items: [['wideLens', 5]],
    enemies: CLAP_CONE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  },

  // ---- the 12-unit shove, and the fact that it is RAW ----------------------
  // WEAPON_SHOVE.clap reaches damageCone UNMULTIPLIED — run.ts:760 passes the
  // 12 straight through, while the shared projectile loop's copy of the same
  // lookup scales by buildMods.knockbackMul. That asymmetry is invisible in
  // every other scenario here and it is exactly the kind of thing an extraction
  // "tidies up" while carrying the number across.
  //
  // These two rows are the pin, and they are only a pin AS A PAIR: one frame
  // after the trigger the knock channel is still hot, so the digest carries the
  // raw knock vector, and Heavy Amp at max (knockbackMul 1.20, damageMul 1.25)
  // must move the hp lines and NOT the knock lines. Scale the shove and the
  // second row's knock grows by a fifth.
  {
    name: 'clap base tier 4, the 12-unit shove, knock channel hot',
    seed: 0xc1a951,
    weapons: [['clap', 4]],
    enemies: CLAP_CONE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 1 }],
  },
  {
    name: 'clap base tier 4 with Heavy Amp, the shove is NOT scaled',
    seed: 0xc1a952,
    weapons: [['clap', 4]],
    items: [['heavyAmp', 5]],
    enemies: CLAP_CONE_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 1 }],
  },

  // ---- bodies that take the other branches --------------------------------
  // A ghost has knockbackMul 0 and shove() returns before writing anything; a
  // shielded body spends a shield pool before its hp. Both run through the
  // cone's per-hit path.
  {
    name: 'clap base tier 4 against shielded and knock-immune bodies',
    seed: 0xc1a9d0,
    weapons: [['clap', 4]],
    enemies: CLAP_TOUGH_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  },

  // ---- the untargeted aim draw --------------------------------------------
  // aimDir draws ONCE with a target and TWICE without. Every scenario above has
  // a target, so without this row the two-draw branch is never taken and a
  // module that drew the heading unconditionally would move nothing at all.
  // rngDraws is the only channel that catches it.
  {
    name: 'clap base tier 4, no target in range, the two-draw aim',
    seed: 0xc1a9f0,
    weapons: [['clap', 4]],
    enemies: CLAP_FAR_RING,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  },

  // ---- four triggers on a beat grid ---------------------------------------
  // The cone has no per-strike dedup and nothing to expire: each trigger is a
  // fresh, immediate pass, and the shoves stack into a knock channel that has
  // not finished decaying (SHOVE_S is 0.12, the grid here is 0.117).
  {
    name: 'clap base tier 4, four triggers on a beat grid',
    seed: 0xc1a9b4,
    weapons: [['clap', 4]],
    enemies: CLAP_CONE_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'clap' }, { frames: 7 },
      { fire: 'clap' }, { frames: 7 },
      { fire: 'clap' }, { frames: 7 },
      { fire: 'clap' }, { frames: 30 },
    ],
  },

  // ---- Two Hands: the cap, the crush and the tug ---------------------------
  // One trigger, three pincers, and the whole crush/tug ladder off the first of
  // them. Twenty frames is well past the 0.12 close, so the digest carries the
  // finished state: who was crushed, who was only dragged, who was untouched.
  {
    name: 'clap evolved (Two Hands), the three-target cap and the crush/tug ladder',
    seed: 0xc1a9e0,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5]],
    evolved: ['clap'],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 20 }],
  },

  // ---- the 0.12-second close, frame by frame -------------------------------
  // The pincer is the only weapon entity in the game whose whole life is a
  // TIMER with two scheduled moments, and neither of them is visible in world
  // state — the slabs are fx and nothing else, until the frame they land. So
  // these four rows read the timer off the ordered fx stream:
  //   frame 3   six beams (a spawn pair per pincer) and nothing more
  //   frame 4   the halfway pairs appear; closesAt - timeS has just crossed
  //             closeS * 0.5, i.e. timeS >= 0.06
  //   frame 7   still nothing landed; timeS 0.11667 is under closesAt 0.12
  //   frame 8   the crush, the tug, the slam and the spark, in that order
  // Frame 4 against frame 3 is the 0.5; frame 8 against frame 7 is the 0.12.
  // Frames 5, 6 and 7 also satisfy the halfway test, so the fact that the
  // halfway pair appears ONCE is the `midShown` latch under test as well —
  // without it frame 7 would carry twelve extra beams.
  //
  // A TIMER READ OFF A 60 Hz GRID IS PINNED TO 1/60, AND NO FINER. Both
  // moments are scheduled on the absolute clock and observed only on the frame
  // that crosses them, so closeS 0.12 and closeS 0.13 both land on frame 8 and
  // are indistinguishable here — 0.11 and 0.14 are caught, 0.125 is not. That
  // is a property of the world, not a gap in the field: a `pinches:` section in
  // the digest would fix it and would also rewrite every one of the 173 other
  // baseline entries, so the sub-frame residue belongs in a LITERAL PIN in
  // systems-check.ts (assert TWO_HANDS.closeS === 0.12) when the module lands,
  // and these four rows carry the observable half.
  ...([3, 4, 7, 8] as const).map((frames): ParityScenario => ({
    name: `clap evolved (Two Hands), stopped at frame ${frames} of the close`,
    seed: 0xc1a9c0 + frames,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5]],
    evolved: ['clap'],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames }],
  })),

  // ---- Wide Lens scales the gap, the crush AND the tug ---------------------
  // spawnPinch multiplies openGap and pinchRadius by areaMul, and the crush
  // multiplies tugRadius by it too — three separate reads of one item. At 1.30
  // every rung of CLAP_PINCH_FIELD changes category at once: 52 and 70 are both
  // crushed (contact 72.1), 88 and 108 are both dragged (124.8), and the slab
  // beams stand off 96.2 instead of 74.
  {
    name: 'clap evolved (Two Hands), Wide Lens on the gap, the crush and the tug',
    seed: 0xc1a9a3,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5], ['wideLens', 5]],
    evolved: ['clap'],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 20 }],
  },

  // ---- Heavy Amp DOES scale the tug ---------------------------------------
  // The mirror of the base cone's pair above, and the reason both are here: the
  // clap reads knockbackMul in exactly one of its two modes. The crush's own
  // damageArea passes shove 0 — the whole move pulls inward — and then
  // dragInward applies TWO_HANDS.tug * knockbackMul. Stopping on the close
  // frame keeps the knock vectors in the digest, so this row against
  // "stopped at frame 8" is the 30 and the 1.20 together.
  {
    name: 'clap evolved (Two Hands) with Heavy Amp, the tug IS scaled',
    seed: 0xc1a953,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5], ['heavyAmp', 5]],
    evolved: ['clap'],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 8 }],
  },

  // ---- the pincer array resolves BACKWARDS ---------------------------------
  // Three overlapping crushes, all closing on the same frame, against 5-hp
  // bodies. updateClapPinches walks the array from the end, so the pincer
  // spawned on the FARTHEST of the three targets resolves first, and with every
  // body inside two or three crushes that order decides which pinch is credited
  // with each kill and where each drop lands in the fx stream.
  {
    name: 'clap evolved (Two Hands), overlapping crushes, lethal',
    seed: 0xc1a9e3,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5]],
    evolved: ['clap'],
    enemies: CLAP_CLUSTER_FIELD,
    steps: [{ fire: 'clap' }, { frames: 30 }],
  },

  // ---- the empty-field branch ---------------------------------------------
  // nearestEnemies comes back empty and Two Hands claps openGap (74) ahead of
  // the player instead of eating the trigger, on the untargeted two-draw aim.
  // Nothing is damaged: the whole pin is the fx beam coordinates and rngDraws.
  {
    name: 'clap evolved (Two Hands), no target in range, claps ahead',
    seed: 0xc1a9f1,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5]],
    evolved: ['clap'],
    enemies: CLAP_FAR_RING,
    hp: 1e6,
    steps: [{ fire: 'clap' }, { frames: 20 }],
  },

  // ---- the crush does not follow the player --------------------------------
  // A pincer is pinned to the target's position AT FIRE TIME and to nothing
  // else. Walking the player hard for the eight frames of the close is the only
  // way to say so: if the crush tracked the player — or re-read the target — it
  // would land somewhere other than where the slabs were drawn.
  {
    name: 'clap evolved (Two Hands), the crush does not follow the player',
    seed: 0xc1a9a1,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5]],
    evolved: ['clap'],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'clap' },
      { walk: [-1, 1] },
      { frames: 20 },
    ],
  },

  // ---- two triggers, pincers at different phases ---------------------------
  // The second trigger lands on the frame the first trigger's slabs show their
  // halfway pair, so six pincers are live at once at two different points in
  // their timers, and the second three are spawned onto a field the first three
  // are about to crush. The array order the reverse loop walks is now
  // interleaved across triggers.
  {
    name: 'clap evolved (Two Hands), two triggers, pincers at different phases',
    seed: 0xc1a9b2,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5]],
    evolved: ['clap'],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'clap' }, { frames: 4 },
      { fire: 'clap' }, { frames: 30 },
    ],
  },

  // ---- mid-evolve ----------------------------------------------------------
  // The clap's seam is not a live entity — the cone resolves synchronously and
  // leaves nothing behind — it is the DECAYING SHOVE. Three frames after a base
  // trigger the knock channel is still riding (SHOVE_S is 0.12), so the world
  // evolves and the first pincers spawn while bodies are still being carried by
  // the cone's outward 12, and the crush's inward tug then lands on top of it.
  // Outward-then-inward on the same knock channel has no other cover.
  {
    name: 'clap mid-evolve with a cone shove still riding',
    seed: 0xc1a9d3,
    weapons: [['clap', 4]],
    items: [['paddedJacket', 5]],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'clap' },
      { frames: 3 },
      { evolve: 'clap' },
      { frames: 3 },
      { fire: 'clap' },
      { frames: 30 },
    ],
  },

  // ---- the clap in a band --------------------------------------------------
  // The migration's real risk is the module sharing a frame with the weapons
  // around it. For the clap the sharpest edge is the SHARED KNOCK CHANNEL:
  // shove() overwrites knockX/knockY outright rather than accumulating, so
  // whichever weapon shoved a body LAST in the frame owns its motion. The clap
  // fires last in the base rows and first in the evolved one, so both sides of
  // that race are recorded.
  {
    name: 'clap in a full band, base, damage meter',
    seed: 0xc1a9b91,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    enemies: CLAP_CONE_FIELD,
    hp: 1e6,
    steps: [
      { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'bell' }, { fire: 'arp' },
      { fire: 'clap' },
      { frames: 60 },
    ],
  },
  {
    name: 'clap in a full band, base, lethal',
    seed: 0xc1a9b92,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    // FLOWERS at their natural 30 hp, for the reason the chord's and the lead's
    // lethal bands spell out: five-hp swarmers are gone before the clap's turn
    // comes round and the row would pin nothing about the clap at all.
    enemies: CLAP_PINCH_FIELD,
    steps: [
      { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' }, { fire: 'bass' },
      { fire: 'chord' }, { fire: 'lead' }, { fire: 'bell' }, { fire: 'arp' },
      { fire: 'clap' },
      { frames: 60 },
    ],
  },
  {
    name: 'clap in a full evolved band, loaded build',
    seed: 0xc1a9b93,
    weapons: [
      ['kick', 4], ['snare', 4], ['hat', 4], ['bass', 4], ['chord', 4],
      ['lead', 4], ['clap', 4], ['bell', 4], ['arp', 4],
    ],
    items: [
      ['highTops', 5], ['fastForward', 5], ['mirrorball', 5], ['heavyAmp', 5],
      ['wideLens', 5], ['needleTips', 5], ['paddedJacket', 5],
      ['extensionCable', 5], ['magnetLanyard', 5],
    ],
    evolved: ['kick', 'snare', 'hat', 'bass', 'chord', 'lead', 'clap', 'bell', 'arp'],
    enemies: CLAP_PINCH_FIELD,
    hp: 1e6,
    // The clap FIRST here, so its three pincers are pinned to positions the
    // other eight weapons then spend eight frames shoving bodies out of, and
    // the crush lands into a field that has moved under it.
    steps: [
      { fire: 'clap' }, { fire: 'kick' }, { fire: 'snare' }, { fire: 'hat' },
      { fire: 'bass' }, { fire: 'chord' }, { fire: 'lead' }, { fire: 'bell' },
      { fire: 'arp' },
      { frames: 60 },
    ],
  },
];

// ------------------------------------------------------------------ digest --

/** Round hard, so the digest is stable across V8 versions without being so
 *  loose that a real change hides inside the tolerance. Six decimals is far
 *  below any gameplay-visible difference and far above float noise. */
function r(n: number): number {
  if (!Number.isFinite(n)) return n;
  const v = Math.round(n * 1e6) / 1e6;
  // Normalize -0 to 0 so a sign flip on a zero does not churn the baseline.
  return v === 0 ? 0 : v;
}

function fxLine(e: FxEvent): string {
  // Ordered, whole-event, type-agnostic. Serializing the event rather than
  // hand-picking fields means a new fx field shows up in the diff instead of
  // slipping through — the fx stream is the closest thing the world has to a
  // trace of what happened, in what order.
  const body = Object.entries(e)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => `${k}=${typeof v === 'number' ? r(v) : String(v)}`)
    .join(' ');
  return `fx ${e.type} ${body}`;
}

function sortedTally(t: Partial<Record<Role, number>>): string[] {
  return Object.entries(t)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([role, n]) => `  ${role}=${r(n as number)}`);
}

/** Everything the world has to show for the scenario, as diff-friendly lines.
 *
 *  Broad on purpose. A narrow digest — "the target's hp" — only catches the
 *  bug you already thought of. This walks the entity arrays, the per-role
 *  tallies, the ordered fx stream and both rng draw counts, so a change anywhere
 *  in the frame lands in the diff. */
function digest(world: RunWorld, draws: { main: number; magnet: number }): string[] {
  const lines: string[] = [];

  lines.push('enemies:');
  for (const e of world.enemies) {
    lines.push(
      `  #${e.id} ${e.kind} hp=${r(e.hp)} shield=${r(e.shieldHp)} pos=${r(e.x)},${r(e.y)}` +
        ` dead=${e.dead ? 1 : 0} knock=${r(e.knockX)},${r(e.knockY)},${r(e.knockT)}` +
        ` flash=${r(e.flashT)} slow=${r(e.slowT)} lastMove=${r(e.lastMoveX)},${r(e.lastMoveY)}`,
    );
  }

  lines.push('projectiles:');
  for (const p of world.projectiles) {
    lines.push(
      `  ${p.role} pos=${r(p.x)},${r(p.y)} v=${r(p.vx)},${r(p.vy)} r=${r(p.radius)}` +
        ` dmg=${r(p.damage)} pierce=${r(p.pierce)}/${r(p.maxPierce)} life=${r(p.lifeS)}` +
        ` age=${r(p.age)} bounces=${r(p.bounces)} evolved=${p.evolved ? 1 : 0}`,
    );
  }

  lines.push('zones:');
  for (const z of world.zones) {
    lines.push(
      `  ${z.source} pos=${r(z.x)},${r(z.y)} r=${r(z.radius)} dmg=${r(z.damage)}` +
        ` life=${r(z.lifeS)} tick=${r(z.tickT)} evolved=${z.evolved ? 1 : 0}`,
    );
  }

  lines.push('shockwaves:');
  for (const s of world.shockwaves) {
    lines.push(`  pos=${r(s.x)},${r(s.y)} dmg=${r(s.damage)} life=${r(s.lifeS)}`);
  }

  lines.push('gravityWells:');
  for (const g of world.gravityWells) {
    lines.push(`  pos=${r(g.x)},${r(g.y)} life=${r(g.lifeS)}`);
  }

  lines.push('pickups:');
  lines.push(`  gems=${world.gems.length} notes=${world.musicNotes.length}` +
    ` magnets=${world.stageMagnets.length} chests=${world.chests.length}`);

  lines.push('run:');
  lines.push(`  kills=${world.kills} level=${world.level} xp=${r(world.xp)}` +
    ` playerHp=${r(world.player.hp)} timeS=${r(world.timeS)}`);

  lines.push('damageByRole:');
  lines.push(...sortedTally(world.damageByRole));
  lines.push('killsByRole:');
  lines.push(...sortedTally(world.killsByRole));

  // The ORDERED fx stream. Order is the point: it is the only record of the
  // sequence effects landed in, and the base strip pushing its whip BEFORE
  // damage while Redline Stomp pushes its beams AFTER is exactly the kind of
  // ordering a refactor unifies away by accident.
  lines.push('fx (ordered):');
  for (const e of world.fx ?? []) lines.push(`  ${fxLine(e)}`);

  // The rng draw COUNTS. Roll-order drift is the failure mode most likely to
  // pass everything else: a module that draws once more or once less than the
  // world code it replaced still produces the right damage on the frame under
  // test, then desynchronizes every drop, every amped roll and every splitter
  // for the rest of the run. Nothing above catches that on its own.
  //
  // BOTH STREAMS, because a RunWorld has two. Only the main one used to be
  // counted, so a discarded stageMagnetRng() draw — which shifts every rare
  // drop for the rest of a real run — left all 35 scenarios matching. They are
  // separate lines rather than a sum so a diff says WHICH stream moved.
  lines.push(`rngDraws: ${draws.main}`);
  lines.push(`magnetRngDraws: ${draws.magnet}`);

  return lines;
}

// ------------------------------------------------------------------- runner --

const SILENT_EVENTS: RunEvents = {
  onLevelUp: () => undefined,
  onDeath: () => undefined,
  onVictory: () => undefined,
  onHit: () => undefined,
};

function runScenario(s: ParityScenario): string[] {
  // Wrap BOTH seeded streams so the harness can count draws without the world
  // knowing it is being watched. A world draws from the main stream and, for
  // rare drops, from its own stageMagnetRng; counting only the first leaves
  // half the roll order unpinned.
  const base = mulberry32(s.seed);
  const magnetBase = mulberry32(s.seed ^ 0x51a6e);
  const draws = { main: 0, magnet: 0 };
  const rng = () => { draws.main += 1; return base(); };
  const magnetRng = () => { draws.magnet += 1; return magnetBase(); };

  // The movement stick, driven by `walk` steps. Starts at the zero vector,
  // which is byte-for-byte what RunWorld defaults `control` to, so supplying
  // this function cannot move a scenario that never walks.
  const stick = { x: 0, y: 0 };

  const world = new RunWorld(VIEW, SILENT_EVENTS, {
    // No stage director: waves would spawn on their own schedule and the
    // scenario would stop being hand-placed.
    scripted: false,
    // fx ON: the ordered fx stream is a digested channel, not noise.
    fx: true,
    rng,
    // The rare-drop stream is seeded off the main rng by default, which is
    // deterministic here, but pinning it explicitly keeps a change to that
    // derivation from silently rewriting every baseline.
    stageMagnetRng: magnetRng,
    control: () => stick,
  });
  world.invincible = true;

  for (const [role, tier] of s.weapons) world.addWeapon(role, tier);
  for (const [item, level] of s.items ?? []) world.addItem(item, level);
  for (const role of s.evolved ?? []) {
    assert(world.evolve(role), `${s.name}: scenario asks to evolve ${role} but it is not eligible`);
  }

  for (const [kind, dx, dy] of s.enemies) {
    const e = world.spawnEnemyAt(kind, world.player.x + dx, world.player.y + dy);
    assert(e, `${s.name}: could not spawn ${kind}`);
    // Pin the stored circle center: spawnEnemyAt takes a sprite-feet position
    // and offsets the center off it, so the requested offset is not the one the
    // geometry sees until this runs.
    e.x = world.player.x + dx;
    e.y = world.player.y + dy;
    if (s.hp !== undefined) e.hp = s.hp;
  }

  // Populate the spatial hash at the pinned positions before anything fires.
  // Weapons that query the hash all silently miss against an unbuilt one.
  world.update(0);

  // Setup pushed rings and evolution flashes into fx. Everything above is
  // scaffolding, not behavior under test, so start the recorded stream here.
  world.fx!.length = 0;

  for (const step of s.steps) {
    if ('fire' in step) {
      world.fireTrigger({ role: step.fire, time: 0, velocity: 1, step: 0 });
    } else if ('evolve' in step) {
      assert(world.evolve(step.evolve), `${s.name}: mid-scenario evolve of ${step.evolve} failed`);
    } else if ('walk' in step) {
      stick.x = step.walk[0];
      stick.y = step.walk[1];
    } else {
      for (let i = 0; i < step.frames; i++) world.update(SIM_DT);
    }
  }

  return digest(world, draws);
}

// ------------------------------------------------------------------- verify --

type Baseline = Record<string, string[]>;

export function runWeaponParityChecks(): void {
  const names = new Set<string>();
  for (const s of SCENARIOS) {
    assert(!names.has(s.name), `duplicate parity scenario name: ${s.name}`);
    names.add(s.name);
  }

  const actual: Baseline = {};
  for (const s of SCENARIOS) actual[s.name] = runScenario(s);

  if (RECORD) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    console.log(
      `weapon parity: RE-RECORDED ${SCENARIOS.length} scenarios into ${BASELINE_PATH}.\n` +
        '  Read the diff before staging it. Every changed line is a gameplay change you are signing for.',
    );
    return;
  }

  let baseline: Baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
  } catch (err) {
    throw new Error(
      `weapon parity: cannot read the recorded baseline at ${BASELINE_PATH} (${String(err)}).\n` +
        '  The baseline is committed alongside this check. If it is genuinely missing, re-record\n' +
        '  it with `npm run record:weapon-parity` — but only from code you believe is correct.',
    );
  }

  const missing = SCENARIOS.map((s) => s.name).filter((n) => !(n in baseline));
  const extra = Object.keys(baseline).filter((n) => !names.has(n));
  if (missing.length || extra.length) {
    throw new Error(
      'weapon parity: the scenario list and the recorded baseline disagree.\n' +
        (missing.length ? `  scenarios with no baseline: ${missing.join(', ')}\n` : '') +
        (extra.length ? `  baseline entries with no scenario: ${extra.join(', ')}\n` : '') +
        '  Re-record with `npm run record:weapon-parity` after adding or renaming scenarios.',
    );
  }

  for (const s of SCENARIOS) {
    const want = baseline[s.name];
    const got = actual[s.name];
    if (want.join('\n') === got.join('\n')) continue;

    // Report the first few differing lines rather than two whole dumps: the
    // failure has to name what moved, or nobody will read it.
    const diffs: string[] = [];
    const n = Math.max(want.length, got.length);
    for (let i = 0; i < n && diffs.length < 12; i++) {
      if (want[i] === got[i]) continue;
      diffs.push(`    - recorded: ${want[i] ?? '(nothing)'}`);
      diffs.push(`    + now:      ${got[i] ?? '(nothing)'}`);
    }
    throw new Error(
      `weapon parity: world state changed for scenario "${s.name}".\n` +
        '  A weapon extraction that claims "behavior unchanged" must leave this identical.\n' +
        `${diffs.join('\n')}\n` +
        '  If this change is INTENTIONAL and reviewed, re-record with\n' +
        '  `npm run record:weapon-parity` and commit the baseline diff.',
    );
  }

  console.log(
    `weapon parity: ${SCENARIOS.length} scenarios match the recorded baseline`,
  );
}

runWeaponParityChecks();
