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
