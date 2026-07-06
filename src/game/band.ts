// The band: eight typed position-slots that cap a build into a group.
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
import type { GenreId } from '../audio/genres';

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

// The roster for each slot — only today's twelve instruments (sub-phase A). The
// bracketed future hires (heartbeat, rimshot, shaker, ride, acid, riser, Reese,
// pluck bass, Rhodes, choir pad, bell, whistle) land in sub-phases B and C.
export const SLOT_ROSTER: Record<Slot, Role[]> = {
  pulse: ['kick', 'tom'],
  backbeat: ['snare', 'clap'],
  hats: ['hat'],
  motion: ['arp', 'cowbell'],
  fx: ['crash', 'zap'],
  bass: ['bass'],
  harmony: ['chord'],
  melody: ['lead'],
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
 * Design rule 5: the FX slot is barred from the STARTING-weapon offer — a
 * tier-1 FX voice is near silent for minutes, a musically dead first pick. It
 * stays fully available on level-up.
 */
export function barredFromStart(role: Role): boolean {
  return slotOf(role) === 'fx';
}

/** Roles eligible as a starting instrument, in a stable order. */
export function startableRoles(roles: readonly Role[]): Role[] {
  return roles.filter((r) => !barredFromStart(r));
}

/**
 * Design rule 6: genre-weighted roster draws. When a slot with more than one
 * of today's instruments comes up, the genre's idiomatic member is favoured
 * (House leads with clap, DnB with snare, ...). A soft multiplier on the draw
 * weight, never a lock — the off-genre member can still appear. Anything
 * unlisted is 1.0. Single-member slots (Hats/Bass/Harmony/Melody) are unaffected.
 */
const GENRE_ROLE_AFFINITY: Record<GenreId, Partial<Record<Role, number>>> = {
  lofi: { snare: 1.3, clap: 0.7, arp: 1.2, cowbell: 0.85, tom: 1.1 },
  house: { clap: 1.5, snare: 0.7, cowbell: 1.3, arp: 0.85 },
  synthwave: { snare: 1.15, clap: 0.9, arp: 1.35, cowbell: 0.7 },
  hiphop: { snare: 1.4, clap: 0.75, cowbell: 1.15, arp: 0.9 },
  dnb: { snare: 1.5, clap: 0.7, arp: 1.3, cowbell: 0.75 },
  techno: { clap: 1.3, snare: 0.85, cowbell: 1.2, arp: 0.9, tom: 1.15 },
};

export function genreRoleWeight(genreId: GenreId, role: Role): number {
  return GENRE_ROLE_AFFINITY[genreId]?.[role] ?? 1;
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
