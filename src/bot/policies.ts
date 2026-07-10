// Pick policies (docs/tools/autoplay-bot.md), mixer edition: how a bot plays
// the point economy — which instrument it hires from the REAL offer roll, and
// how it distributes/rotates its complexity and power points. The offer system
// stays part of what is measured; no forced build orders.
//
// Every policy shares one deterministic allocator: start from the world's
// current mix, optionally rest stale patterns (the freshness rotation the
// player is expected to perform), then spend the unspent pools by a
// policy-specific preference order. Policies are floor detectors, not
// optimizers, per the bot's charter.

import { ROLES, type Role } from '../audio/kits';
import { startableRoles } from '../game/band';
import {
  C_MAX,
  HOT_C,
  isStale,
  P_MAX,
  type Allocation,
} from '../game/mixer';
import type { Rng } from '../game/rng';
import type { RunWorld } from '../game/run';

// FX is barred from the starting-weapon offer (design rule 5): a tier-1 FX
// voice is near-silent for minutes, a musically dead opener. The random
// openers draw from the startable roster; an explicit focus:<role> may still
// name an FX weapon, since that is a deliberate build-order probe.
const STARTABLE: readonly Role[] = startableRoles(ROLES);
const randomStart = (rng: Rng): Role => STARTABLE[Math.floor(rng() * STARTABLE.length)];

export interface Policy {
  name: string;
  /** The start-screen choice: which instrument the run opens on. */
  startingKit(rng: Rng): Role;
  /** Milestone hire: choose one of the offered instruments. */
  chooseHire(offers: Role[], world: RunWorld, rng: Rng): Role;
  /** Recompute the full allocation (called at bar boundaries after points
   *  were granted, a hire landed, or a phrase rolled over). Null = no change. */
  mix(world: RunWorld, rng: Rng): Allocation | null;
}

function pickRandom<T>(options: T[], rng: Rng): T {
  return options[Math.floor(rng() * options.length)];
}

/** The shared allocator. `priority` scores each owned role (higher = fed
 *  first, ties broken by arsenal order); `rotate` rests stale patterns at
 *  complexity 2 and prefers pushing primed roles hot (the drop). */
function greedyMix(
  world: RunWorld,
  priority: (role: Role, index: number) => number,
  rotate: boolean,
): Allocation | null {
  const alloc: Allocation = new Map();
  for (const role of world.arsenal) {
    alloc.set(role, {
      c: world.complexity.get(role) ?? 0,
      p: world.power.get(role) ?? 0,
    });
  }

  // Rotation: a stale hot pattern drops to the sustainable groove (C2); its
  // freed points go back to the pools and get re-spent below — usually into
  // a primed peer, which is exactly the player's drop loop.
  if (rotate) {
    for (const [role, a] of alloc) {
      const f = world.fresh.get(role);
      if (a.c >= HOT_C && f && f.primedLeft <= 0 && isStale(f)) a.c = 2;
    }
  }

  const scored = world.arsenal.map((role, i) => ({
    role,
    // Primed roles jump the queue when rotating: banked complexity should
    // trigger their drop rather than top up an already-hot pattern.
    score: priority(role, i) + (rotate && world.fresh.get(role)?.primed ? 1000 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  let sumC = 0;
  let sumP = 0;
  for (const a of alloc.values()) {
    sumC += a.c;
    sumP += a.p;
  }
  let poolC = world.totalC - sumC;
  let poolP = world.totalP - sumP;

  let progress = true;
  while (progress && (poolC > 0 || poolP > 0)) {
    progress = false;
    for (const { role } of scored) {
      const a = alloc.get(role)!;
      if (a.c < 1) continue; // policies never unmute (they never mute either)
      if (poolC > 0 && a.c < C_MAX) {
        a.c++;
        poolC--;
        progress = true;
      }
      if (poolP > 0 && a.p < P_MAX) {
        a.p++;
        poolP--;
        progress = true;
      }
    }
  }

  // No-op drafts return null so the conductor skips the apply.
  let changed = false;
  for (const [role, a] of alloc) {
    if (
      (world.complexity.get(role) ?? 0) !== a.c ||
      (world.power.get(role) ?? 0) !== a.p
    ) {
      changed = true;
      break;
    }
  }
  return changed ? alloc : null;
}

/** Parse a policy spec: 'random' | 'deep' | 'wide' | 'focus:<role>'. */
export function makePolicy(spec: string): Policy {
  if (spec === 'random') {
    // Random hires, random feed order each mix (one rng call per owned role,
    // stable arsenal order — deterministic under the seeded rng).
    return {
      name: spec,
      startingKit: randomStart,
      chooseHire: (offers, _world, rng) => pickRandom(offers, rng),
      mix: (world, rng) => greedyMix(world, () => rng(), true),
    };
  }
  if (spec === 'deep') {
    // Feed the earliest hires first: the starting instrument runs hot and
    // capped, later voices live on leftovers.
    return {
      name: spec,
      startingKit: randomStart,
      chooseHire: (offers, _world, rng) => pickRandom(offers, rng),
      mix: (world) => greedyMix(world, (_role, i) => -i, true),
    };
  }
  if (spec === 'wide') {
    // Equalize: feed whichever voice currently holds the least.
    return {
      name: spec,
      startingKit: randomStart,
      chooseHire: (offers, _world, rng) => pickRandom(offers, rng),
      mix: (world) =>
        greedyMix(
          world,
          (role) => -((world.complexity.get(role) ?? 0) + (world.power.get(role) ?? 0)),
          true,
        ),
    };
  }
  const focus = /^focus:(\w+)$/.exec(spec);
  if (focus && (ROLES as readonly string[]).includes(focus[1])) {
    const role = focus[1] as Role;
    // Dump everything into the focus role and camp it hot — rotation OFF, a
    // deliberate probe of the stale penalty and of single-voice floors.
    return {
      name: spec,
      startingKit: () => role,
      chooseHire: (offers, _world, rng) =>
        offers.includes(role) ? role : pickRandom(offers, rng),
      mix: (world) =>
        greedyMix(world, (r) => (r === role ? 1 : 0), false),
    };
  }
  throw new Error(`unknown policy: ${spec} (use random | deep | wide | focus:<role>)`);
}
