// Pick policies (docs/tools/autoplay-bot.md): how a bot chooses among the
// REAL three-card offers. The offer system stays part of what is measured —
// a focused bot that gets starved by offers is a finding about the pick
// economy, not noise. No forced build orders.

import { ROLES, type Role } from '../audio/kits';
import { startableRoles } from '../game/band';
import type { PickOption } from '../game/picks';
import type { Rng } from '../game/rng';
import type { PickChooser } from './conductor';

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
  choose: PickChooser;
}

function pickRandom(options: PickOption[], rng: Rng): PickOption {
  return options[Math.floor(rng() * options.length)];
}

/** Parse a policy spec: 'random' | 'deep' | 'wide' | 'focus:<role>'. */
export function makePolicy(spec: string): Policy {
  if (spec === 'random') {
    return {
      name: spec,
      startingKit: randomStart,
      choose: (options, _world, rng) => pickRandom(options, rng),
    };
  }
  if (spec === 'deep') {
    return {
      name: spec,
      startingKit: randomStart,
      choose: (options, _world, rng) => pickRandom(options, rng),
    };
  }
  if (spec === 'wide') {
    return {
      name: spec,
      startingKit: randomStart,
      choose: (options, _world, rng) => pickRandom(options, rng),
    };
  }
  const focus = /^focus:(\w+)$/.exec(spec);
  if (focus && (ROLES as readonly string[]).includes(focus[1])) {
    const role = focus[1] as Role;
    // take the focus role when offered, else random — starvation by the
    // offer system is part of what this policy measures
    return {
      name: spec,
      startingKit: () => role,
      choose: (options, _world, rng) => {
        const mine = options.find((o) => o.role === role);
        return mine ?? pickRandom(options, rng);
      },
    };
  }
  throw new Error(`unknown policy: ${spec} (use random | deep | wide | focus:<role>)`);
}
