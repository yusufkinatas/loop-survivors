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
  | { readonly evolve: Role };

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
    name: 'arp evolved with Double Take, cap overshot in one trigger',
    seed: 0x0ca901,
    weapons: [['arp', 4]],
    // Double Take turns one trigger into 6 counter-rotating PAIRS, i.e. 12
    // orbiters, so the third trigger lands 36 and the cap has to retire 12 in
    // one pass. Double Take is also the only item in this file that makes
    // extraProjectiles non-zero, so the fan loops in both arp spawners run
    // with count > 1 exactly here.
    items: [['extensionCable', 5], ['doubleTake', 5]],
    evolved: ['arp'],
    enemies: ring('zombie', 125, 8),
    hp: 1e6,
    steps: [
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
    // band deliberately leaves out. extraProjectiles and orbitDistanceMul are
    // both non-identity here, so the arp's fan count and its built orbit
    // radius are both off their defaults.
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
 *  tallies, the ordered fx stream and the rng draw count, so a change anywhere
 *  in the frame lands in the diff. */
function digest(world: RunWorld, rngDraws: number): string[] {
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

  // The rng draw COUNT. Roll-order drift is the failure mode most likely to
  // pass everything else: a module that draws once more or once less than the
  // world code it replaced still produces the right damage on the frame under
  // test, then desynchronizes every drop, every amped roll and every splitter
  // for the rest of the run. Nothing above catches that on its own.
  lines.push(`rngDraws: ${rngDraws}`);

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
  // Wrap the seeded stream so the harness can count draws without the world
  // knowing it is being watched.
  const base = mulberry32(s.seed);
  let draws = 0;
  const rng = () => { draws += 1; return base(); };

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
    stageMagnetRng: mulberry32(s.seed ^ 0x51a6e),
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
