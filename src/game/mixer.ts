// The mixer (branch mixer-system): the alternative growth system. Instead of
// tier-up cards, the player owns an ARSENAL of instruments and distributes two
// separate point pools across it, live, like a mixing engineer:
//
//  - COMPLEXITY (C, 0-4): which pattern an instrument plays. Maps 1:1 onto the
//    existing four-tier chart ladders — more complexity = more notes per 4-bar
//    phrase = more damage events. C0 = muted (plays nothing, fires nothing).
//  - POWER (P, 1-4): how strong each note is. Maps 1:1 onto the existing
//    WEAPONS[role][p-1] stat blocks; the audio gets fuller/brighter with P.
//
// The old tier T is exactly (C=T, P=T) — all authored charts and stat blocks
// are reused, unbundled onto two axes.
//
// Points are granted by level-ups (+1C +1P each) and are freely redistributable
// at any time via the mixer panel; changes land at the next bar. Milestone
// levels hire a new instrument instead (seeded at C1/P1 — those two points stay
// redistributable, so every level-up is worth exactly 2 points and the total
// budget over ~13 level-ups matches the old 14 tier-picks).
//
// FRESHNESS (the anti-camping system): only HOT patterns (C >= 3) wear out.
// C1-C2 is the sustainable groove and never fatigues. A hot instrument is fresh
// for FRESH_PHRASES 4-bar phrases, then goes STALE (flat x0.6 damage, dull
// sound — "this loop went stale", one step, no death spiral). Resting it
// (C <= 2 or muted) for REST_PHRASES full phrases makes it PRIMED; pushing a
// primed instrument back to C >= 3 is THE DROP: x1.5 damage for PRIMED_PHRASES
// phrases, then a fresh hot window. Rotating peaks beats camping; ignoring the
// system underperforms but never spirals. All state changes evaluate on phrase
// boundaries only, so the system is countable and immune to micro-toggling.
//
// Everything here is pure data + rules: deterministic, headless-safe, shared
// by the game, the mixer UI, and the autoplay bot.

import { STEPS_PER_PHRASE, SKELETON } from '../audio/scale';
import { SOUNDSET } from '../audio/soundset';
import type { Role } from '../audio/kits';

// ---- caps and the point economy ----

export const C_MAX = 4;
export const P_MAX = 4;

/** Levels that hire a new instrument (3-card offer) instead of granting
 *  points. Paces the 8-slot band across the run: 2nd voice ~0:40, 8th ~7:20.
 *  A hire level with no unopened slot falls back to a normal point level. */
export const HIRE_LEVELS: ReadonlySet<number> = new Set([2, 3, 5, 7, 9, 11, 13]);

export function isHireLevel(level: number): boolean {
  return HIRE_LEVELS.has(level);
}

// ---- freshness knobs ----

/** An instrument is HOT (its pattern wears out) at this complexity or above. */
export const HOT_C = 3;
/** Hot phrases before the pattern goes stale (~63s at 122 BPM). */
export const FRESH_PHRASES = 8;
/** Hot phrases at which the UI warns "this part is getting old". */
export const WARN_PHRASES = 6;
/** Stale: flat per-note damage multiplier. One step, no further decay. */
export const STALE_MUL = 0.6;
/** Full phrases at C<=2 (or muted) to become primed. */
export const REST_PHRASES = 2;
/** The drop: damage multiplier while the primed window runs. */
export const PRIMED_MUL = 1.5;
/** Phrases the drop bonus lasts after a primed instrument goes hot. */
export const PRIMED_PHRASES = 4;

/** Seconds per 4-bar phrase at the soundset's tempo (the freshness clock). */
export const PHRASE_S = (60 / SOUNDSET.bpm / SKELETON.stepsPerBeat) * STEPS_PER_PHRASE;

// ---- per-instrument freshness state ----

export interface FreshState {
  /** Full phrases spent hot since the last refresh (primed phrases excluded). */
  hotPhrases: number;
  /** Consecutive full phrases spent resting (C<=2 or muted). */
  restPhrases: number;
  /** Rested long enough: the next push to hot triggers the drop. */
  primed: boolean;
  /** Phrases of drop bonus remaining (counts down while hot). */
  primedLeft: number;
  /** Anti-fiddle: the role ran hot at some point during the current phrase,
   *  so this phrase can never count as rest. Cleared each boundary. */
  hotThisPhrase: boolean;
}

export function freshInit(): FreshState {
  return { hotPhrases: 0, restPhrases: 0, primed: false, primedLeft: 0, hotThisPhrase: false };
}

/** Stale = the hot window is exhausted. The damage penalty (and the dull
 *  voicing) only bites while the instrument is actually hot. */
export function isStale(f: FreshState): boolean {
  return f.hotPhrases >= FRESH_PHRASES;
}

/** The freshness damage multiplier for a role playing at complexity c. */
export function freshMul(f: FreshState | undefined, c: number): number {
  if (!f || c < HOT_C) return 1;
  if (f.primedLeft > 0) return PRIMED_MUL;
  if (isStale(f)) return STALE_MUL;
  return 1;
}

/** Called by the allocation path whenever a role's complexity crosses INTO the
 *  hot band. Consumes a primed star into the drop window; a non-primed re-entry
 *  simply resumes its old hot counter (the 2-phrase rest is the only refresh). */
export function onGoHot(f: FreshState): void {
  f.restPhrases = 0;
  if (f.primed) {
    f.primed = false;
    f.primedLeft = PRIMED_PHRASES;
    f.hotPhrases = 0;
  }
  f.hotThisPhrase = true;
}

/** Advance one phrase boundary for a role sitting at complexity c. */
export function tickPhrase(f: FreshState, c: number): void {
  if (c >= HOT_C) {
    f.restPhrases = 0;
    if (f.primedLeft > 0) f.primedLeft--;
    else f.hotPhrases++;
  } else if (!f.hotThisPhrase) {
    f.primedLeft = 0;
    if (!f.primed) {
      f.restPhrases++;
      if (f.restPhrases >= REST_PHRASES) {
        f.primed = true;
        f.hotPhrases = 0;
        f.restPhrases = 0;
      }
    }
  } else {
    // Ran hot for part of the phrase: no rest credit, no hot progress.
    f.restPhrases = 0;
  }
  f.hotThisPhrase = false;
}

// ---- allocation drafts (shared by the mixer UI and the bot) ----

/** A full desired distribution: complexity and power per arsenal role.
 *  Muted roles carry c=0, p=0; playing roles 1<=c<=4, 1<=p<=4. */
export type Allocation = Map<Role, { c: number; p: number }>;

/** Validate a draft against the granted totals. Returns an error string, or
 *  null when the draft is legal. The silence rule is hard: at least one
 *  instrument must be playing. */
export function validateAllocation(
  alloc: Allocation,
  totalC: number,
  totalP: number,
): string | null {
  let sumC = 0;
  let sumP = 0;
  let playing = 0;
  for (const [role, a] of alloc) {
    if (a.c === 0) {
      if (a.p !== 0) return `${role}: a muted instrument holds no power`;
      continue;
    }
    if (a.c < 1 || a.c > C_MAX) return `${role}: complexity ${a.c} out of range`;
    if (a.p < 1 || a.p > P_MAX) return `${role}: power ${a.p} out of range`;
    playing++;
    sumC += a.c;
    sumP += a.p;
  }
  if (playing === 0) return 'the track cannot go silent';
  if (sumC > totalC) return `complexity overspent (${sumC}/${totalC})`;
  if (sumP > totalP) return `power overspent (${sumP}/${totalP})`;
  return null;
}
