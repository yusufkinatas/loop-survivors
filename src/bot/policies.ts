// Bot pick policies over the real weapon-only three-card offers.

import { supportedRoles } from '../audio/soundset';
import type { Role } from '../audio/kits';
import { slotOf } from '../game/band';
import type { PickOption } from '../game/picks';
import type { Rng } from '../game/rng';
import type { PickChooser } from './conductor';

const CATALOG = supportedRoles();

export interface Policy {
  name: string;
  startingKit(rng: Rng): Role;
  choose: PickChooser;
}

function pickRandom(options: PickOption[], rng: Rng): PickOption {
  return options[Math.floor(rng() * options.length)];
}

export function makePolicy(spec: string): Policy {
  if (spec === 'random') {
    return { name: spec, startingKit: () => 'kick', choose: (options, _world, rng) => pickRandom(options, rng) };
  }
  if (spec === 'deep') {
    return {
      name: spec,
      startingKit: () => 'kick',
      choose: (options, _world, rng) => {
        const upgrades = options.filter((option) => option.tier > 1);
        if (upgrades.length === 0) return pickRandom(options, rng);
        const highest = Math.max(...upgrades.map((option) => option.tier));
        return pickRandom(upgrades.filter((option) => option.tier === highest), rng);
      },
    };
  }
  if (spec === 'wide') {
    return {
      name: spec,
      startingKit: () => 'kick',
      choose: (options, _world, rng) => {
        const fresh = options.filter((option) => option.tier === 1);
        return fresh.length > 0 ? pickRandom(fresh, rng) : pickRandom(options, rng);
      },
    };
  }
  const focus = /^focus:(\w+)$/.exec(spec);
  if (focus && (CATALOG as readonly string[]).includes(focus[1])) {
    const role = focus[1] as Role;
    const targetSlot = slotOf(role);
    return {
      name: spec,
      // Focus runs obey the real opening rule (Kick first), then lean toward
      // the requested weapon whenever its card appears.
      startingKit: () => 'kick',
      choose: (options, _world, rng) => {
        const target = options.find((option) => option.role === role);
        if (target) return target;
        // Never hire the target's roster rival as a random fallback: permanent
        // slot ownership would make the requested focus weapon unreachable.
        const safe = options.filter((option) => slotOf(option.role) !== targetSlot);
        return pickRandom(safe.length > 0 ? safe : options, rng);
      },
    };
  }
  throw new Error(`unknown policy: ${spec} (use random | deep | wide | focus:<weapon>)`);
}
