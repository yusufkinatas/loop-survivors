// The soundset: the game's single fixed voicing of the instrument catalog.
// There is no selection — one tempo, one swing, one hand-authored four-tier
// ladder per supported role. The soundset supports exactly the roles it
// supplies a ladder for; every other role is never offered and never voiced.
//
// The soundset drops instruments it does not suit, including whole band slots
// (see docs/game/band.ts). What remains still has to clear the playability
// floor below: a beat, a low end, a tick, and a melodic voice — so a full
// build always sounds like a track.
//
// Patterns are grounded in real production practice (four-on-the-floor kick +
// offbeat open hats, stabby chords). The coherence skeleton (minor pentatonic,
// chord roots 0/5/7) owns the theory so nothing can clash.

import { TIER_COUNT, validateChart } from './charts';
import { ROLES, type Role } from './kits';
import { SOUNDSET_LADDERS } from './ladders/house';
import type { Chart } from './charts';

export interface Soundset {
  bpm: number;
  /** Fraction of a 16th the offbeat 8ths are pushed late (the shuffle). */
  swing: number;
  /** Per-trigger damage multiplier. Parity balance now stores final source-
   *  anchored damage directly, so normal play uses an identity multiplier. */
  powerMul: number;
  /** The one track: a four-tier ladder for each supported role. A role absent
   *  here is an instrument the soundset is not built around — it is never
   *  offered, never voiced. Partial by design (whole slots may be dropped). */
  ladders: Partial<Record<Role, Chart[]>>;
}

export const SOUNDSET: Soundset = {
  bpm: 122,
  swing: 0.1,
  powerMul: 1,
  ladders: SOUNDSET_LADDERS,
};

// ---------------------------------------------------------------------------
// Supported instruments: the soundset supports exactly the roles it supplies a
// ladder for. Single source of truth for "these instruments exist" — read by
// the pick pool, the band rack, and the engine (unsupported voices never
// enable).
// ---------------------------------------------------------------------------

/** The roles the soundset is built around, in canonical ROLES order. */
export function supportedRoles(): Role[] {
  return ROLES.filter((r) => SOUNDSET.ladders[r] !== undefined);
}

/** Whether the soundset voices/offers a given role. */
export function soundsetSupports(role: Role): boolean {
  return SOUNDSET.ladders[role] !== undefined;
}

// Playability floor (Pillar 3: the game must be a good survivors-like muted).
// Instruments and even whole band slots may be dropped, but enough must remain
// for a real band: a beat, a low end, a tick, and at least one melodic voice.
// Roles are grouped by their band slot (kept in sync with src/game/band.ts
// SLOT_ROSTER); this file stays free of a runtime import of band.ts to avoid a
// cycle.
const FLOOR_GROUPS: { label: string; anyOf: Role[] }[] = [
  { label: 'a beat (Pulse)', anyOf: ['kick'] },
  { label: 'a low end (Bass)', anyOf: ['bass', 'pluck'] },
  { label: 'a tick (Hats)', anyOf: ['hat', 'shaker'] },
  { label: 'a melodic voice (Harmony/Melody)', anyOf: ['chord', 'rhodes', 'lead', 'bell'] },
];

// Guard the soundset's track at build time: a bad shipped chart is a build
// error, not a runtime surprise. Only supported roles are required, each
// supported ladder must have all four tiers, and the playability floor must
// clear.
{
  const supported = new Set(supportedRoles());
  if (supported.size === 0) {
    throw new Error('soundset: supports no instruments');
  }
  for (const role of supported) {
    const ladder = SOUNDSET.ladders[role]!;
    if (ladder.length !== TIER_COUNT) {
      throw new Error(`soundset: ${role} ladder must have ${TIER_COUNT} tiers`);
    }
    for (const chart of ladder) {
      if (chart.role !== role) {
        throw new Error(`soundset: ${role} ladder holds a ${chart.role} chart`);
      }
      validateChart(chart);
    }
  }
  for (const group of FLOOR_GROUPS) {
    if (!group.anyOf.some((r) => supported.has(r))) {
      throw new Error(`soundset: playability floor unmet — needs ${group.label}`);
    }
  }
}
