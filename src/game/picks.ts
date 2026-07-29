// The level-up economy's one source of truth. A configured roll offers weapon
// hires and upgrades until the build fills its flat cap (BUILD.weaponCap) and
// every hired weapon is maxed. Once that finite build is complete, the same API
// returns the Encore: a fixed pair of offers that pay a long run out without
// ever adding to the build.
//
// PROTOTYPE BASE (#265): the passive half of this pool is gone with the items
// themselves, so a level-up is now weapons or nothing. That makes this file the
// smallest and most obvious seam in the base — a prototype whose power currency
// is patterns, tape, stage positions or upkeep widens `AnyPickOption` and
// rewrites `rollOffers`. Its one caller is `presentNextUpgrade` in game.ts, and
// the pedestal copy and the scoop both switch exhaustively on `kind`, so the
// typechecker names every site that has to learn about a new pick.
//
// There are no weapon categories: any weapon may be offered alongside any
// other, and hiring one never retires another from the pool. The only thing
// that closes the hire pool is the cap.
//
// Everything here is pure in the supplied state and RNG. Pools use fixed
// catalog order and weighted draws use a stable index tie-break, so a seeded
// run receives identical offers on every platform.

import { soundsetSupports } from '../audio/soundset';
import { ROLES, type Role } from '../audio/kits';
import { BUILD } from './config';
import { hasWeaponModule } from './weapons';
import { WEAPON_MAX_LEVEL } from './weapons/levels';
import type { Rng } from './rng';

const OFFER_COUNT = 3;
const WEAPON_WEIGHT = 3;

/** A pick is a +1 INCREMENT, never a target level: the option names the thing,
 *  and the shell resolves what level that means against live state at the
 *  moment it is scooped. Rolling a concrete level here is what made two
 *  pedestals for the same weapon read "2 → 3" and "3 → 4" side by side. */
export interface WeaponPickOption {
  kind: 'weapon';
  role: Role;
}

/** The Encore's fixed pair, in screen order. Never rolled, never weighted. */
const ENCORE_IDS = ['firstAid', 'tipJar'] as const;
type EncoreId = (typeof ENCORE_IDS)[number];

interface EncorePickOption {
  kind: 'encore';
  encore: EncoreId;
}

/** Everything a level-up can offer. Kept as a discriminated union of more than
 *  one member on purpose: a prototype that adds its own pick kind (a pattern, a
 *  reel of tape, a stage position) widens this type and the shell's exhaustive
 *  switches then point at every site that has to learn about it. */
export type AnyPickOption = WeaponPickOption | EncorePickOption;

export interface RollOffersInput {
  tiers: ReadonlyMap<Role, number>;
  /** Increments already promised to a weapon but not yet in `tiers`: scooped
   *  pickups waiting for their bar, plus every un-scooped pedestal on the
   *  ground (both surfaces — a triangle and a chest payout can be out at once).
   *  Counted into the ladder tests so a pickup doomed to be wasted is never
   *  offered. NOT counted into the build cap, which asks what is OWNED. */
  pendingTiers: ReadonlyMap<Role, number>;
  rng: Rng;
  timeS: number;
}

/** The finite half of the economy — everything that is still an addition to the
 *  build, as opposed to the Encore that pays out once there is nothing left to
 *  add. One member today; a prototype's own pick kind joins it here. */
type BuildPickOption = WeaponPickOption;

interface WeightedOption<T> {
  option: T;
  weight: number;
}

interface RankedOption<T> extends WeightedOption<T> {
  /** Fixed pool position, used to settle the vanishingly rare equal RNG key. */
  index: number;
  key: number;
}

function ownedWeaponCount(tiers: ReadonlyMap<Role, number>): number {
  let count = 0;
  for (const tier of tiers.values()) {
    if (tier > 0) count += 1;
  }
  return count;
}

/**
 * The gentle early drum nudge: for roughly the first two minutes, the beat
 * weapons draw heavier so most runs open with a beat to build on. A thumb on
 * the scale, not a guarantee — an all-melody build stays possible and stays
 * the player's own fault.
 *
 * This is an offer-weight knob, not a grouping: the roles listed here have no
 * relationship to each other beyond drawing heavier early, and owning one does
 * nothing to the others' odds.
 */
const EARLY_NUDGE_UNTIL_S = 120;
const EARLY_NUDGE_FACTOR = 1.7;
const EARLY_NUDGE_ROLES: ReadonlySet<Role> = new Set<Role>(['kick', 'snare', 'clap']);

/** A weapon's weight, including the existing gentle early drum nudge. */
function weaponWeight(role: Role, timeS: number): number {
  let weight = WEAPON_WEIGHT;
  if (timeS < EARLY_NUDGE_UNTIL_S && EARLY_NUDGE_ROLES.has(role)) weight *= EARLY_NUDGE_FACTOR;
  return weight;
}

function pending<K>(counts: ReadonlyMap<K, number>, key: K): number {
  return Math.max(0, Math.floor(counts.get(key) ?? 0));
}

function buildFinitePool(input: RollOffersInput): WeightedOption<BuildPickOption>[] {
  const pool: WeightedOption<BuildPickOption>[] = [];

  // The cap closes the hire pool, not the upgrade pool: a capped build keeps
  // being offered tier-ups of the weapons it already owns.
  const weaponSlotsFull = ownedWeaponCount(input.tiers) >= BUILD.weaponCap;
  for (const role of ROLES) {
    // Every weapon is career-unlocked from the start; the gates left on a new
    // hire are soundset support and gameplay.
    //
    // THE GAMEPLAY GATE IS NOT DECORATION. The palette (#266) lands in two
    // steps — the twelve new voices get their sound and their rhythm first, and
    // their weapon modules after — so between those steps a role has a ladder
    // (which is what soundsetSupports asks) while having no behaviour at all.
    // `RunWorld.fireTrigger` optional-chains into the module, so such a role
    // would be offered, hired, levelled, and silently deal no damage for a
    // whole run. It stays audible in the Sandbox, which is where the palette is
    // judged by ear; it is simply never offered until it can fight.
    if (!soundsetSupports(role) || !hasWeaponModule(role)) continue;
    const tier = Math.max(0, Math.min(WEAPON_MAX_LEVEL, Math.floor(input.tiers.get(role) ?? 0)));
    // Ownership (hire vs upgrade, and the cap) asks about the LIVE build; the
    // ladder test asks where the weapon will stand once every promise lands.
    const effective = Math.min(WEAPON_MAX_LEVEL, tier + pending(input.pendingTiers, role));
    if (tier === 0) {
      if (weaponSlotsFull) continue;
      if (effective >= WEAPON_MAX_LEVEL) continue;
      pool.push({ option: { kind: 'weapon', role }, weight: weaponWeight(role, input.timeS) });
    } else if (effective < WEAPON_MAX_LEVEL) {
      pool.push({ option: { kind: 'weapon', role }, weight: weaponWeight(role, input.timeS) });
    }
  }

  return pool;
}

function rngKey(rng: Rng, weight: number): number {
  // log(U) / weight is the numerically stable form of U^(1/weight). Higher
  // (closer to zero) wins. Clamp a broken endpoint RNG without adding calls.
  const draw = rng();
  const sample = Number.isFinite(draw)
    ? Math.max(Number.MIN_VALUE, Math.min(1, draw))
    : 0.5;
  return Math.log(sample) / weight;
}

function rankOptions<T>(pool: readonly WeightedOption<T>[], rng: Rng): RankedOption<T>[] {
  const ranked = pool.map((candidate, index) => ({
    ...candidate,
    index,
    key: rngKey(rng, candidate.weight),
  }));
  ranked.sort((a, b) => b.key - a.key || a.index - b.index);
  return ranked;
}

/** The forced-passive rule that used to live here — guarantee an item card by
 *  level 5 until two are owned — went with the passives (#265). Nothing
 *  replaces it: with one kind of card left there is nothing to guarantee. */
function selectFiniteOffers(
  pool: readonly WeightedOption<BuildPickOption>[],
  rng: Rng,
): BuildPickOption[] {
  // No cross-card exclusion rule is needed: each role appears in the pool at
  // most once, so taking the ranked order in order cannot repeat a weapon.
  return rankOptions(pool, rng)
    .slice(0, OFFER_COUNT)
    .map(({ option }) => option);
}

/**
 * The Encore: with the finite pool empty there is nothing left to improve, so
 * the screen is the same two cards every time — a First Aid or a Tip Jar. No
 * weighting, no draw, and deliberately no RNG call: an Encore must not shift a
 * seeded run's later rolls. Two cards, not OFFER_COUNT — heal-vs-notes is the
 * whole decision a maxed build has left.
 */
function encoreOffers(): EncorePickOption[] {
  return ENCORE_IDS.map((encore) => ({ kind: 'encore', encore }));
}

/** Full configured economy used by normal runs. */
export function rollOffers(input: RollOffersInput): AnyPickOption[] {
  const pool = buildFinitePool(input);
  if (pool.length === 0) return encoreOffers();
  return selectFiniteOffers(pool, input.rng);
}

export interface RollStartingWeaponsInput {
  tiers: ReadonlyMap<Role, number>;
  rng: Rng;
  timeS: number;
}

/**
 * The opening hire: the three weapons a run starts by choosing between. This
 * is not a level-up offer, so the pool holds only tier-0 hires — never an
 * item, never an Encore, never an upgrade of something already owned. The
 * soundset-support gate still applies and the draw goes through the same
 * weighted rank, so a seeded run opens identically everywhere. Returns fewer
 * than OFFER_COUNT only if fewer weapons are available to hire at all.
 */
export function rollStartingWeapons(input: RollStartingWeaponsInput): WeaponPickOption[] {
  const pool: WeightedOption<WeaponPickOption>[] = [];
  for (const role of ROLES) {
    if (!soundsetSupports(role)) continue;
    const tier = Math.max(0, Math.min(WEAPON_MAX_LEVEL, Math.floor(input.tiers.get(role) ?? 0)));
    if (tier !== 0) continue;
    pool.push({
      option: { kind: 'weapon', role },
      weight: weaponWeight(role, input.timeS),
    });
  }

  // rankOptions returns the pool already ordered best-first, so taking in
  // order keeps the weighted ordering the cards are drawn in.
  return rankOptions(pool, input.rng)
    .slice(0, OFFER_COUNT)
    .map(({ option }) => option);
}
