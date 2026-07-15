// Weapon evolutions: the final form past tier 4 (docs/phases/weapon-evolutions.md).
//
// This file is the game-side registry — the evolved DISPLAY NAME, its honest
// gameplay line, and the swappable eligibility rule. The audio-side half (the
// evolved chart and the transformed voicing) lives in the soundset
// (soundsetEvolves / SOUNDSET.evolved). A role is only truly evolvable when
// BOTH halves are present, which hasEvolution() enforces so the two can never
// drift into offering an evolution that has no chart to play.
//
// Sub-phase A ships the kick only; B and C fill in the rest by adding rows here
// (plus their evolved chart, voicing, stats, and gameplay). Nothing else has to
// change — the trigger, ceremony, and UI all read this registry.

import { EVOLVED_TIER, TIER_COUNT } from '../audio/charts';
import { soundsetEvolves } from '../audio/soundset';
import type { Role } from '../audio/kits';

export { EVOLVED_TIER };

export interface Evolution {
  /** The evolved form's own name, shown on the card, the band rack, and the
   *  ceremony (e.g. the kick's "The Drop"). */
  name: string;
  /** One honest gameplay line, terse VS-style, for the card/overlay. */
  line: string;
}

/** Every weapon's evolution. A role absent here has no final form (it maxes at
 *  tier 4 and leaves the pool as before). */
export const EVOLUTIONS: Partial<Record<Role, Evolution>> = {
  kick: {
    name: 'The Drop',
    line: 'every beat erupts an outward knockback ring',
  },
  // Sub-phase B: the extension evolutions.
  bass: {
    name: 'The Sub',
    line: 'heavy walls that sweep across the arena',
  },
  chord: {
    name: 'Sustain',
    line: 'a huge lingering kill-field, heavy slow',
  },
  arp: {
    name: 'Arp Carousel',
    line: 'a dense spinning ring of blades',
  },
  bell: {
    name: 'Carillon',
    line: 'shards that shatter again, a cascade through the pack',
  },
};

/** Whether a role has a shipped evolution — both a registry entry here AND an
 *  evolved chart in the soundset. Keeps the two halves in lockstep. */
export function hasEvolution(role: Role): boolean {
  return EVOLUTIONS[role] !== undefined && soundsetEvolves(role);
}

/** The evolved form's display name (falls back to a plain label if somehow
 *  called for a role without one, so UI never renders "undefined"). */
export function evolvedName(role: Role): string {
  return EVOLUTIONS[role]?.name ?? 'Evolved';
}

/** The evolved form's honest gameplay line. */
export function evolvedLine(role: Role): string {
  return EVOLUTIONS[role]?.line ?? '';
}

// --- the swappable eligibility rule ---------------------------------------
//
// Today: a weapon evolves once it is maxed (tier 4) and has an evolution. Kept
// as one function so a future items phase can tighten it to "tier 4 AND owns
// the paired item" without touching the trigger, pool, or UI
// (docs/phases/weapon-evolutions.md, "eligibility is a swappable rule").

/** True while a weapon is eligible to be offered its evolution card: maxed,
 *  has an evolution, and not already evolved. */
export function canEvolve(role: Role, tiers: ReadonlyMap<Role, number>): boolean {
  return tiers.get(role) === TIER_COUNT && hasEvolution(role);
}

/** True once a weapon has taken its evolution (it is playing EVOLVED_TIER). */
export function isEvolved(role: Role, tiers: ReadonlyMap<Role, number>): boolean {
  return tiers.get(role) === EVOLVED_TIER;
}
