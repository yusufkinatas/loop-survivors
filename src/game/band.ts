// The band: seven typed position-slots that cap a build into a group.
//
// Each slot holds at most ONE instrument, drawn from that slot's roster. A full
// build is a complete band — eight voices, each in its own frequency lane and
// rhythmic job. Slots cap OWNERSHIP (filling one permanently retires its other
// roster members from the pick pool), which is what keeps a full build sounding
// like a track instead of a pile of voices. See docs/phases/the-band.md.
//
// NOTE: `role` (from kits.ts) is the atomic weapon id. A `Slot` is the band
// position several weapons can compete for. Do not conflate the two.

import type { Role } from '../audio/kits';
import { soundsetSupports } from '../audio/soundset';

/** The seven band positions, in the on-screen rack order. */
export type Slot =
  | 'pulse'
  | 'backbeat'
  | 'hats'
  | 'motion'
  | 'bass'
  | 'harmony'
  | 'melody';

/** Rack / socket order (matches the spec table top-to-bottom). */
export const SLOTS: readonly Slot[] = [
  'pulse',
  'backbeat',
  'hats',
  'motion',
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
  bass: 'Low',
  harmony: 'Color',
  melody: 'Hook',
};

// The roster for each slot — the full instrument catalog. The soundset
// supports only a subset (supportedRoster filters to it); the rest stay dormant
// code, never offered and never voiced.
export const SLOT_ROSTER: Record<Slot, Role[]> = {
  pulse: ['kick', 'tom'],
  backbeat: ['snare', 'clap'],
  hats: ['hat', 'shaker'],
  motion: ['arp', 'acid'],
  bass: ['bass', 'pluck'],
  harmony: ['chord', 'rhodes'],
  melody: ['lead', 'bell'],
};

/** Inverse of SLOT_ROSTER, built once so the two can never drift. */
export const ROLE_SLOT: Record<Role, Slot> = (() => {
  const map = {} as Record<Role, Slot>;
  for (const slot of SLOTS) {
    for (const role of SLOT_ROSTER[slot]) map[role] = slot;
  }
  return map;
})();

/** The band position a weapon belongs to. */
export function slotOf(role: Role): Slot {
  return ROLE_SLOT[role];
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

// --- Offer-weighting knobs (the early drum nudge) ----

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
