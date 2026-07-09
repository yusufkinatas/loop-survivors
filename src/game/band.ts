// The House band: eight typed position-slots that cap a build into a group.
//
// Each slot holds at most ONE instrument, drawn from that slot's roster. A full
// build is a complete band — eight voices, each in its own frequency lane and
// rhythmic job. The active roster is deliberately small: one fixed House
// skeleton plus meaningful two-way forks. Dormant prototype roles remain in the
// Role union but have no slot and cannot be offered. See
// docs/phases/house-foundation-refactor.md.
//
// NOTE: `role` (from kits.ts) is the atomic weapon id. A `Slot` is the band
// position several weapons can compete for. Do not conflate the two.

import type { Role } from '../audio/kits';
import { soundsetSupports } from '../audio/soundset';

/** The eight band positions, in the on-screen rack order. */
export type Slot =
  | 'pulse'
  | 'backbeat'
  | 'hats'
  | 'motion'
  | 'fx'
  | 'bass'
  | 'harmony'
  | 'melody';

/** Rack / socket order (matches the spec table top-to-bottom). */
export const SLOTS: readonly Slot[] = [
  'pulse',
  'backbeat',
  'hats',
  'motion',
  'fx',
  'bass',
  'harmony',
  'melody',
];

/** Internal design names (docs/code only — never shown to the player). */
export const SLOT_DESIGN: Record<Slot, string> = {
  pulse: 'Pulse',
  backbeat: 'Backbeat',
  hats: 'Hats',
  motion: 'Motion',
  fx: 'FX/Transition',
  bass: 'Bass',
  harmony: 'Harmony',
  melody: 'Melody',
};

/** Plain player-facing words — the only slot names that reach the screen. */
export const SLOT_LABEL: Record<Slot, string> = {
  pulse: 'Beat',
  backbeat: 'Snap',
  hats: 'Tick',
  motion: 'Groove',
  fx: 'FX',
  bass: 'Low',
  harmony: 'Color',
  melody: 'Hook',
};

// The complete active House catalog. Alternatives exist only where the choice
// changes both the combat shape and the musical part; the fixed skeleton does
// not grow filler substitutes merely to make every roster the same size.
export const SLOT_ROSTER: Record<Slot, Role[]> = {
  pulse: ['kick'],
  backbeat: ['clap'],
  hats: ['hat'],
  motion: ['rimshot', 'shaker'],
  fx: ['crash'],
  bass: ['bass', 'acid'],
  harmony: ['chord', 'rhodes'],
  melody: ['lead', 'whistle'],
};

/** Inverse of SLOT_ROSTER, built once so the two can never drift. Dormant
 * prototype roles are intentionally absent. */
export const ROLE_SLOT: Readonly<Partial<Record<Role, Slot>>> = (() => {
  const map: Partial<Record<Role, Slot>> = {};
  for (const slot of SLOTS) {
    for (const role of SLOT_ROSTER[slot]) map[role] = slot;
  }
  return map;
})();

/** The band position a weapon belongs to. */
export function slotOf(role: Role): Slot {
  const slot = ROLE_SLOT[role];
  if (!slot) throw new Error(`inactive weapon has no band slot: ${role}`);
  return slot;
}

/** A slot's roster restricted to the instruments the soundset supports.
 *  Empty when the soundset drops the whole slot (supports no member of it). */
export function supportedRoster(slot: Slot): Role[] {
  return SLOT_ROSTER[slot].filter((r) => soundsetSupports(r));
}

/** The band slots the soundset actually fills (drops the ones it supports
 *  nothing in). */
export function supportedSlots(): Slot[] {
  return SLOTS.filter((s) => supportedRoster(s).length > 0);
}

/** The instrument currently filling a slot, if any, given the owned tiers. */
export function ownerOfSlot(slot: Slot, tiers: ReadonlyMap<Role, number>): Role | undefined {
  for (const role of SLOT_ROSTER[slot]) {
    if (tiers.has(role)) return role;
  }
  return undefined;
}

/** True once any roster member of the slot is owned (audition over). */
export function slotFilled(slot: Slot, tiers: ReadonlyMap<Role, number>): boolean {
  return ownerOfSlot(slot, tiers) !== undefined;
}

// --- Offer-weighting knobs (design rules 5 & 6, and the early drum nudge) ----

/**
 * The House foundation has one starting weapon: Kick. Everything else enters
 * through level-up, while dormant prototypes stay unavailable everywhere.
 */
export function barredFromStart(role: Role): boolean {
  return role !== 'kick' || !soundsetSupports(role);
}

/** Roles eligible as a starting instrument, in a stable order. */
export function startableRoles(roles: readonly Role[]): Role[] {
  return roles.filter((role) => !barredFromStart(role));
}

/**
 * The gentle early drum nudge: for roughly the first two minutes, empty Pulse
 * and Backbeat slots draw heavier so most runs open with a beat to build on. A
 * thumb on the scale, not a guarantee — an all-melody build stays possible and
 * stays the player's own fault.
 */
export const EARLY_NUDGE_UNTIL_S = 120;
export const EARLY_NUDGE_FACTOR = 1.7;
const EARLY_NUDGE_SLOTS: ReadonlySet<Slot> = new Set<Slot>(['pulse', 'backbeat']);

export function earlyNudgeApplies(slot: Slot, timeS: number): boolean {
  return timeS < EARLY_NUDGE_UNTIL_S && EARLY_NUDGE_SLOTS.has(slot);
}
