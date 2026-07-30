// What a level-up offers under The Shell.
//
// THE THREE CURRENCIES ARE THE THREE THINGS A GATE EATS, and that is the join
// between the two layers rather than a coincidence. A level-up hands out an
// instrument, a pattern, or a level; a door takes an instrument, a pattern, or a
// level. So every pick a player takes is something a gate can later ask for, and
// every toll is paid in the same coin the run has been paying out — which is what
// makes "give something up" a decision about the build rather than a raid on
// whatever the player happens to be holding.
//
// Patterns draw heaviest. They are the loot (#255: "finding a great pattern is a
// bigger event than finding an instrument"), and a level buys no notes at all
// here, so a pool weighted toward levels would be a pool weighted toward silence.
//
// Pure in the build and the rng, like `rollOffers` it stands beside.

import { ROLES, type Role } from '../../audio/kits';
import type { AnyPickOption } from '../picks';
import type { Rng } from '../rng';
import { hasWeaponModule } from '../weapons';
import { WEAPON_MAX_LEVEL } from '../weapons/levels';
import type { RouteBuild } from './build';
import { isBedRole, pattern, PATTERN_IDS, shellFits, type PatternId } from './patterns';

const OFFER_COUNT = 3;

const HIRE_WEIGHT = 3;
const LEVEL_WEIGHT = 3;
/** Patterns are the loot. */
const PATTERN_WEIGHT = 6;
/** A pattern this run has never been offered draws heavier still: the discovery
 *  is the reward, so the pool leans toward things the player has not heard. */
const FRESH_PATTERN_BONUS = 2;

export interface RouteOffersInput {
  build: RouteBuild;
  /** Levels already promised to a shell but not yet paid in — scooped pickups
   *  riding to their bar, plus every pedestal still on the ground. */
  promised: ReadonlyMap<Role, number>;
  rng: Rng;
}

interface Weighted {
  option: AnyPickOption;
  weight: number;
}

/**
 * Three cards, or the Encore when there is genuinely nothing left to offer.
 *
 * A pattern card names BOTH the pattern and the shell it will go into, and the
 * pedestal says what it displaces. That is deliberate: slotting is destructive
 * (#255's rule for this layer), and a destructive choice made on a pedestal with
 * no destination on it would be a coin flip. Moving patterns AROUND is the bench's
 * job, off the clock, where there is time to think — the arena only ever offers
 * "this, here, instead of that".
 */
export function rollRouteOffers(input: RouteOffersInput): AnyPickOption[] {
  const { build, promised, rng } = input;
  const pool: Weighted[] = [];
  const level = (role: Role): number => (build.shells.get(role)?.level ?? 0) + (promised.get(role) ?? 0);

  for (const role of ROLES) {
    if (!hasWeaponModule(role)) continue;
    const shell = build.shells.get(role);
    if (!shell) {
      if (build.canHire(role)) pool.push({ option: { kind: 'weapon', role }, weight: HIRE_WEIGHT });
      continue;
    }
    if (level(role) < WEAPON_MAX_LEVEL) {
      pool.push({ option: { kind: 'weapon', role }, weight: LEVEL_WEIGHT });
    }
  }

  // One pattern card per shell at most, so three cards never read as three
  // variations of the same decision.
  for (const [role, shell] of build.shells) {
    if (isBedRole(role)) continue;
    const candidates = PATTERN_IDS.filter((id) =>
      id !== shell.pattern
      && pattern(id).bars <= build.unlockedBars
      && shellFits(role, pattern(id)));
    if (candidates.length === 0) continue;
    const id = weightedPatternPick(candidates, build, rng);
    pool.push({ option: { kind: 'pattern', role, pattern: id }, weight: PATTERN_WEIGHT });
  }

  if (pool.length === 0) {
    return [{ kind: 'encore', encore: 'firstAid' }, { kind: 'encore', encore: 'tipJar' }];
  }
  return rank(pool, rng).slice(0, OFFER_COUNT);
}

/** Pick which pattern this shell's card offers, leaning toward something the run
 *  has not produced yet. */
function weightedPatternPick(candidates: readonly PatternId[], build: RouteBuild, rng: Rng): PatternId {
  const weights = candidates.map((id) => (build.seenPatterns.has(id) ? 1 : FRESH_PATTERN_BONUS));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** The same weighted rank the base's pool uses: log(U)/weight, higher wins, pool
 *  position settles a tie, so a seeded run draws identically everywhere. */
function rank(pool: readonly Weighted[], rng: Rng): AnyPickOption[] {
  return pool
    .map((candidate, index) => {
      const draw = rng();
      const sample = Number.isFinite(draw) ? Math.max(Number.MIN_VALUE, Math.min(1, draw)) : 0.5;
      return { ...candidate, index, key: Math.log(sample) / candidate.weight };
    })
    .sort((a, b) => b.key - a.key || a.index - b.index)
    .map(({ option }) => option);
}

/** The opening hire, under The Shell: three instruments, and each card is really
 *  "this sound, playing this". So the run's first decision is already a musical
 *  one rather than a colour. */
export function rollRouteStartingShells(build: RouteBuild, rng: Rng): AnyPickOption[] {
  const pool: Weighted[] = [];
  for (const role of ROLES) {
    if (!hasWeaponModule(role) || !build.canHire(role)) continue;
    // The percussion nudge the base opens with (picks.ts) is dropped here on
    // purpose: under The Shell a hire arrives holding a starter pattern, so an
    // opening melodic pick already has a rhythm and the "start with a beat to
    // build on" worry does not apply. Recorded on #267 as a call.
    pool.push({ option: { kind: 'weapon', role }, weight: HIRE_WEIGHT });
  }
  return rank(pool, rng).slice(0, OFFER_COUNT);
}
