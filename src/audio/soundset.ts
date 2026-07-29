// The soundset: the game's single fixed voicing of the instrument catalog.
// There is no selection — one tempo, one swing, one hand-authored four-tier
// ladder per supported role. The soundset supports exactly the roles it
// supplies a ladder for; every other role is never offered and never voiced.
//
// The soundset drops instruments it does not suit, including whole band slots
// (see src/game/band.ts). What remains still has to clear the playability
// floor below: a beat, a low end, a tick, and a melodic voice — so a full
// build always sounds like a track.
//
// Patterns are grounded in real production practice (four-on-the-floor kick +
// offbeat open hats, stabby chords). The coherence skeleton (minor pentatonic,
// chord roots 0/5/7) owns the theory so nothing can clash.

import { TIER_COUNT, validateChart } from './charts';
import { PALETTE_ROLES, PALETTE_SEATS, ROLES, type Role } from './kits';
import { PALETTE_COMPOSED_BPM, PALETTE_SAMPLES } from './palette-samples';
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
  { label: 'a low end (Bass)', anyOf: ['bass'] },
  { label: 'a tick (Hats)', anyOf: ['hat'] },
  { label: 'a melodic voice (Harmony/Melody)', anyOf: ['chord', 'lead'] },
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

  // The band is the palette (#266), and it is exactly the palette. A voice with
  // a seat but no ladder is a weapon the pick pool would never offer and the
  // Sandbox would list as silent; a voice with a ladder but no seat is one the
  // arrangement was never checked against its neighbours. Both are the kind of
  // mistake that only shows up as "something sounds wrong" three sessions
  // later, so both are build errors here.
  for (const role of PALETTE_ROLES) {
    if (!supported.has(role)) throw new Error(`palette: ${role} has a seat but no ladder`);
  }
  const seated = new Set<Role>(PALETTE_ROLES);
  for (const role of supported) {
    if (!seated.has(role)) throw new Error(`palette: ${role} has a ladder but no seat`);
  }

  // A COMPOSED bed is a whole number of bars of real music baked into a file,
  // so it is only in time at the tempo it was rendered at. Nothing else in the
  // game would notice a tempo change; the pad's chord cycle would silently
  // drift off the bar and there would be no error to follow, only a track that
  // had stopped lining up.
  const composed = Object.values(PALETTE_SAMPLES).filter((v) => v.bedBars > 0);
  if (composed.length > 0 && SOUNDSET.bpm !== PALETTE_COMPOSED_BPM) {
    throw new Error(
      `palette: ${composed.length} composed bed(s) were rendered at ` +
      `${PALETTE_COMPOSED_BPM} bpm but the soundset plays at ${SOUNDSET.bpm} — ` +
      're-run tools/fetch-palette-samples.mjs with the new tempo',
    );
  }

  // Every seat needs real depth inside it — #266's own complaint about the
  // eight-voice band was that "two options is not a role, it is a pair", so a
  // seat that thins out to two voices has quietly reintroduced the problem the
  // palette exists to fix.
  //
  // TEXTURE IS THE EXCEPTION, and it is the designer's ruling rather than a
  // loophole. It was already the exception to the two-attack rule (held IS its
  // attack); after the first listening pass it became the exception here too.
  // `wind` was cut because a constant wind sound has no musical precedent — it
  // is a transition device, the same category as the banned riser — and the
  // designer chose two real background sounds over three with one invented. A
  // pair is the honest size of this seat, not a shortfall to be padded.
  const SEAT_MINIMUM: Readonly<Record<string, number>> = { texture: 2 };
  for (const [seat, voices] of Object.entries(PALETTE_SEATS)) {
    const min = SEAT_MINIMUM[seat] ?? 3;
    if (voices.length < min) {
      throw new Error(`palette: seat ${seat} has ${voices.length} voices, needs ${min}`);
    }
  }
}
