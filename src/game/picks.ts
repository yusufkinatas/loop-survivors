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
import { PALETTE_ATTACK, ROLES, type Attack, type Role } from '../audio/kits';
import { BUILD } from './config';
import { hasWeaponModule } from './weapons';
import { WEAPON_MAX_LEVEL } from './weapons/levels';
import type { Rng } from './rng';

const OFFER_COUNT = 3;
const WEAPON_WEIGHT = 3;
/** Under a weapon, deliberately. See the Headroom card block below. */
const HEADROOM_WEIGHT = 1.6;

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

/** THE CIRCUIT'S OWN POWER CURRENCY (#270), and the pick kind the base's seam
 *  was left open for.
 *
 *  #255 says this stack's power buys "reach and hold — how much ground you can
 *  cover and keep — plus upkeep capacity". Weapon levels already buy reach and
 *  hold; nothing in the base buys upkeep capacity, because nothing in the base
 *  has upkeep. These three cards are it:
 *
 *   - `capacity` — a deeper pool. Longer bursts of the whole band before the
 *     brownout, without making the band any cheaper to hold.
 *   - `regen`    — a faster refill. Raises the SUSTAINABLE size of the band,
 *     which is the only card here that makes the resting state less partial.
 *   - `bank`     — a bigger bank, and a longer Blackout out of it. Buys a taller
 *     peak rather than a wider floor.
 *
 *  They are repeatable and never run out, which is deliberate: #265 measured the
 *  base's decision stream dying at minute fourteen with every level-up after that
 *  an Encore, and named each stack's own currency as what has room to fill it.
 *  This is what fills it here — and unlike a stat card it is a real decision,
 *  because the three answers to "the band is too expensive" are genuinely
 *  different shapes. */
const HEADROOM_UPGRADE_IDS = ['capacity', 'regen', 'bank'] as const;
export type HeadroomUpgradeId = (typeof HEADROOM_UPGRADE_IDS)[number];

interface HeadroomPickOption {
  kind: 'headroom';
  upgrade: HeadroomUpgradeId;
}

/** Everything a level-up can offer. Kept as a discriminated union of more than
 *  one member on purpose: a prototype that adds its own pick kind (a pattern, a
 *  reel of tape, a stage position) widens this type and the shell's exhaustive
 *  switches then point at every site that has to learn about it. */
export type AnyPickOption = WeaponPickOption | EncorePickOption | HeadroomPickOption;

export interface RollOffersInput {
  tiers: ReadonlyMap<Role, number>;
  /** THE CIRCUIT (#270): how many Headroom cards the run has already taken, per
   *  flavour. Read only to keep a single flavour from being offered forever once
   *  the weapon pool empties — the cards never run out, but a screen of three
   *  identical ones is not a decision. Omitted with the layer off. */
  headroomTaken?: ReadonlyMap<HeadroomUpgradeId, number>;
  /** THE COVERAGE GUARANTEE (#270). The attack kinds the OWNED build can answer
   *  — owned rather than active, because a voice muted to save upkeep has not
   *  stopped being an answer the player holds. Omitted with the layer off.
   *
   *  While this set holds fewer than two of the three kinds, one of the three
   *  offers is reserved for a weapon that adds a missing one. Two kinds and the
   *  player is on their own for the third, which is where the real decision is.
   *
   *  Why a floor at two rather than three: a band that can answer only ONE kind
   *  loses to two thirds of the bestiary and cannot fight its way back, and #255's
   *  floor rule is about never being powerless. A band that answers two is
   *  choosing to gamble on the third not turning up, which is exactly the bet
   *  Coverage exists to offer ("drop a kind on purpose to concentrate"). */
  covered?: ReadonlySet<Attack>;
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
 *  add. Two members now: The Circuit's Headroom cards join the weapons, which is
 *  what stops the pool ever emptying and the Encore ever appearing. */
type BuildPickOption = WeaponPickOption | HeadroomPickOption;

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

  // THE CIRCUIT'S HEADROOM CARDS (#270). Weighted UNDER a weapon so the band
  // still leads the early build — the pool is meant to be something you widen
  // once holding the band starts to hurt, not something you open on.
  //
  // The least-taken flavour draws heaviest. Not a cap and not exclusion: three
  // copies of `regen` is a legitimate build (a big sustainable band), it just
  // should not be what the roll hands you by default once weapons run out.
  if (input.headroomTaken) {
    const taken = input.headroomTaken;
    let fewest = Infinity;
    for (const id of HEADROOM_UPGRADE_IDS) fewest = Math.min(fewest, taken.get(id) ?? 0);
    for (const upgrade of HEADROOM_UPGRADE_IDS) {
      const count = taken.get(upgrade) ?? 0;
      pool.push({
        option: { kind: 'headroom', upgrade },
        weight: HEADROOM_WEIGHT * (count === fewest ? 1 : 0.45),
      });
    }
  }

  return pool;
}

/** Weapons that would ADD an attack kind the build cannot answer yet, in
 *  catalog order. The coverage guarantee's shortlist. */
function coverageFillers(input: RollOffersInput): WeaponPickOption[] {
  const covered = input.covered;
  if (!covered || covered.size >= 2) return [];
  const weaponSlotsFull = ownedWeaponCount(input.tiers) >= BUILD.weaponCap;
  // At the cap there is no hire left to make, so there is no filler to offer
  // either. That is not an oversight: a build that filled all five slots inside
  // one attack kind, while the wheel showed two holes the whole time, has made
  // five choices to get there. The constraint biting is the point.
  if (weaponSlotsFull) return [];
  const out: WeaponPickOption[] = [];
  for (const role of ROLES) {
    if (!soundsetSupports(role) || !hasWeaponModule(role)) continue;
    if ((input.tiers.get(role) ?? 0) > 0) continue;
    const attack = PALETTE_ATTACK[role];
    if (!attack || covered.has(attack)) continue;
    out.push({ kind: 'weapon', role });
  }
  return out;
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
  const offers = selectFiniteOffers(pool, input.rng);
  // THE COVERAGE GUARANTEE, applied AFTER the roll rather than by re-weighting
  // it. Re-weighting would make the guarantee probabilistic, which is not a
  // guarantee; and it would move the whole roll, so a seeded run's later offers
  // would change the moment coverage was toggled. Substituting one card leaves
  // every other draw exactly where the base put it.
  const fillers = coverageFillers(input);
  if (fillers.length === 0) return offers;
  const alreadyHelps = offers.some(
    (offer) => offer.kind === 'weapon' && fillers.some((filler) => filler.role === offer.role),
  );
  if (alreadyHelps) return offers;
  const filler = fillers[Math.min(fillers.length - 1, Math.floor(input.rng() * fillers.length))];
  // Replace the LAST card, never the first: the first card is the one the player
  // reads first, and a guarantee should not also decide what leads the screen.
  const out = [...offers];
  out[out.length - 1] = filler;
  return out;
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
