// Genres are the game's playable characters. Each genre has its OWN voicing of
// the soundset (its own kick, snare, hats, bass, melodic timbres — see
// src/audio/kits/<genre>.ts), its OWN instrument set (the roles it is optimized
// for; a genre may drop instruments it does not suit, including whole band
// slots), and ONE track — a single hand-picked pattern per supported role, no
// alternatives (src/audio/ladders/<genre>.ts). Pick a genre and the whole build
// re-voices AND re-scopes: a House kick is a different sound from a Techno
// kick, and the two genres offer different instruments.
//
// Patterns are grounded in real production practice: House four-on-floor +
// offbeat open hats, Synthwave straight machine drums + 16th arps, Techno
// relentless four-on-floor + offbeat hats. The coherence skeleton (minor pentatonic, chord roots 0/5/7)
// still owns the theory, so no genre can clash.
//
// A genre "supports" exactly the roles it supplies a ladder for: `ladders` is
// partial, and supportedRoles(genre) derives from its keys — the single source
// of truth for "optimized for these instruments", read by the pick pool, the
// band rack, and the engine (unsupported voices never enable). This file is a
// thin assembler: metadata here, the actual track in ladders/<genre>.ts.

import { TIER_COUNT, validateChart } from './charts';
import { ROLES, type Role } from './kits';
import { HOUSE_LADDERS } from './ladders/house';
import { SYNTHWAVE_LADDERS } from './ladders/synthwave';
import { TECHNO_LADDERS } from './ladders/techno';
import type { Chart } from './charts';

export type GenreId = 'house' | 'synthwave' | 'techno';

export interface Genre {
  id: GenreId;
  name: string;
  /** One-line character pitch for the select screen. */
  blurb: string;
  /** Accent color for the select card. */
  color: string;
  bpm: number;
  /** Fraction of a 16th the offbeat 8ths are pushed late (the shuffle). */
  swing: number;
  /** Per-trigger damage compensation for tempo (docs/plan.md, tempo & damage):
   *  a fast genre fires more triggers, so each hits softer. */
  powerMul: number;
  /** The genre's one track: a four-tier ladder for each role it supports. A
   *  role absent here is an instrument this genre is not optimized for — it is
   *  never offered, never voiced. Partial by design (genres may drop slots). */
  ladders: Partial<Record<Role, Chart[]>>;
}

const HOUSE: Genre = {
  id: 'house',
  name: 'House',
  blurb: 'Four-on-the-floor. Offbeat hats, stabby chords. Steady and relentless.',
  color: '#4dc3ff',
  bpm: 124,
  swing: 0.06,
  powerMul: 0.9,
  ladders: HOUSE_LADDERS,
};

const SYNTHWAVE: Genre = {
  id: 'synthwave',
  name: 'Synthwave',
  blurb: 'Neon 80s. Machine-tight drums, big gated snare, relentless arps.',
  color: '#ff5ad0',
  bpm: 100,
  swing: 0,
  powerMul: 1.1,
  ladders: SYNTHWAVE_LADDERS,
};

const TECHNO: Genre = {
  id: 'techno',
  name: 'Techno',
  blurb: 'Hypnotic warehouse pulse. Four-on-floor, offbeat hats, dark stabs.',
  color: '#8a8f9e',
  bpm: 130,
  swing: 0,
  powerMul: 0.86,
  ladders: TECHNO_LADDERS,
};

export const GENRES: Genre[] = [HOUSE, SYNTHWAVE, TECHNO];

export const GENRE_BY_ID: Record<GenreId, Genre> = Object.fromEntries(
  GENRES.map((g) => [g.id, g]),
) as Record<GenreId, Genre>;

/** The genre selected before one is chosen (engine construction, headless). */
export const DEFAULT_GENRE: GenreId = 'house';

// ---------------------------------------------------------------------------
// Supported instruments: a genre supports exactly the roles it supplies a
// ladder for. This is the single source of truth for "optimized for these
// instruments" — the pick pool, the band rack, and the engine all read it.
// ---------------------------------------------------------------------------

/** The roles a genre is optimized for, in canonical ROLES order. */
export function supportedRoles(id: GenreId): Role[] {
  const ladders = GENRE_BY_ID[id].ladders;
  return ROLES.filter((r) => ladders[r] !== undefined);
}

/** Whether a genre voices/offers a given role. */
export function genreSupports(id: GenreId, role: Role): boolean {
  return GENRE_BY_ID[id].ladders[role] !== undefined;
}

// Playability floor (Pillar 3: the game must be a good survivors-like muted).
// A genre may drop instruments and even whole band slots, but it must keep
// enough for a real band and healthy damage coverage: a beat, a low end, a
// tick, and at least one melodic voice. Roles are grouped by their band slot
// (kept in sync with src/game/band.ts SLOT_ROSTER); this file stays free of a
// runtime import of band.ts to avoid a cycle.
const FLOOR_GROUPS: { label: string; anyOf: Role[] }[] = [
  { label: 'a beat (Pulse)', anyOf: ['kick', 'tom', 'heartbeat'] },
  { label: 'a low end (Bass)', anyOf: ['bass', 'pluck', 'reese'] },
  { label: 'a tick (Hats)', anyOf: ['hat', 'shaker', 'ride'] },
  { label: 'a melodic voice (Harmony/Melody)', anyOf: ['chord', 'rhodes', 'choir', 'lead', 'bell', 'whistle'] },
];

// Guard every genre's track at build time: a bad shipped chart is a build
// error, not a runtime surprise. Only SUPPORTED roles are required (a genre may
// omit others), each supported ladder must have all four tiers, and every genre
// must clear the playability floor.
for (const genre of GENRES) {
  const supported = new Set(supportedRoles(genre.id));
  if (supported.size === 0) {
    throw new Error(`${genre.id}: supports no instruments`);
  }
  for (const role of supported) {
    const ladder = genre.ladders[role]!;
    if (ladder.length !== TIER_COUNT) {
      throw new Error(`${genre.id}: ${role} ladder must have ${TIER_COUNT} tiers`);
    }
    for (const chart of ladder) {
      if (chart.role !== role) {
        throw new Error(`${genre.id}: ${role} ladder holds a ${chart.role} chart`);
      }
      validateChart(chart);
    }
  }
  for (const group of FLOOR_GROUPS) {
    if (!group.anyOf.some((r) => supported.has(r))) {
      throw new Error(`${genre.id}: playability floor unmet — needs ${group.label}`);
    }
  }
}
