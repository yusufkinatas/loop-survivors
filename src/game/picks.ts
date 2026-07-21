// The level-up economy's one source of truth. A configured roll mixes weapon
// hires/upgrades with passive items until the build fills its two flat caps
// (BUILD.weaponCap / BUILD.itemCap). Once that finite build is complete, the
// same API rolls a small capped set of run-only Encore bonuses so a long run
// keeps paying out.
//
// There are no weapon categories: any weapon may be offered alongside any
// other, and hiring one never retires another from the pool. The only thing
// that closes the hire pool is the cap.
//
// Everything here is pure in the supplied state and RNG. Pools use fixed
// catalog order and weighted draws use a stable index tie-break, so a seeded
// run receives identical offers on every platform.

import { TIER_COUNT } from '../audio/charts';
import { soundsetSupports } from '../audio/soundset';
import { ROLES, type Role } from '../audio/kits';
import { BUILD } from './config';
import {
  ITEM_IDS,
  itemMaxLevel,
  itemLevel,
  type ItemId,
} from './items';
import type { Rng } from './rng';

const OFFER_COUNT = 3;
const WEAPON_WEIGHT = 3;
const NEW_ITEM_WEIGHT = 2.4;
const OWNED_ITEM_WEIGHT = 2.8;
const FORCED_ITEM_LEVEL = 5;
const FORCED_ITEM_UNTIL_OWNED = 2;

export interface WeaponPickOption {
  kind: 'weapon';
  role: Role;
  tier: number;
}

interface ItemPickOption {
  kind: 'item';
  item: ItemId;
  tier: number;
}

const ENCORE_IDS = ['heal', 'damage', 'move', 'area'] as const;
type EncoreId = (typeof ENCORE_IDS)[number];

interface EncorePickOption {
  kind: 'encore';
  encore: EncoreId;
  /** Heal amount or percentage-point increase to the run-only bonus. */
  amount: number;
  /** null for the repeatable heal; percentage-point ceiling otherwise. */
  cap: number | null;
}

type PickKind = 'weapon' | 'item' | 'encore';

/**
 * A pick discriminated by `kind`. The default remains the weapon shape while
 * the existing shell migrates to configured offers; use `AnyPickOption` (or
 * `PickOption<PickKind>`) anywhere that handles the complete economy.
 */
type PickOption<K extends PickKind = 'weapon'> =
  K extends 'weapon'
    ? WeaponPickOption
    : K extends 'item'
      ? ItemPickOption
      : K extends 'encore'
        ? EncorePickOption
        : never;

export type AnyPickOption = PickOption<PickKind>;

/** Current run-only Encore bonuses, stored as percentage points. */
interface EncoreProgress {
  damagePct: number;
  movePct: number;
  areaPct: number;
}

const EMPTY_ENCORE_PROGRESS: Readonly<EncoreProgress> = {
  damagePct: 0,
  movePct: 0,
  areaPct: 0,
};

export interface RollOffersInput {
  tiers: ReadonlyMap<Role, number>;
  items: ReadonlyMap<ItemId, number>;
  unlockedRoles: ReadonlySet<Role>;
  unlockedItems: ReadonlySet<ItemId>;
  rng: Rng;
  timeS: number;
  level: number;
  encore?: Readonly<EncoreProgress>;
}

type BuildPickOption = WeaponPickOption | ItemPickOption;

interface WeightedOption<T> {
  option: T;
  weight: number;
}

interface RankedOption<T> extends WeightedOption<T> {
  /** Fixed pool position, used to settle the vanishingly rare equal RNG key. */
  index: number;
  key: number;
}

function ownedItemCount(items: ReadonlyMap<ItemId, number>): number {
  let count = 0;
  for (const id of ITEM_IDS) {
    if (itemLevel(items, id) > 0) count += 1;
  }
  return count;
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

function buildFinitePool(input: RollOffersInput): WeightedOption<BuildPickOption>[] {
  const pool: WeightedOption<BuildPickOption>[] = [];

  // The cap closes the hire pool, not the upgrade pool: a capped build keeps
  // being offered tier-ups of the weapons it already owns.
  const weaponSlotsFull = ownedWeaponCount(input.tiers) >= BUILD.weaponCap;
  for (const role of ROLES) {
    // A previously owned role remains upgradeable if a repaired/migrated save
    // no longer lists it as unlocked. New hires require both meta unlock and
    // soundset support.
    if (!soundsetSupports(role)) continue;
    const tier = Math.max(0, Math.min(TIER_COUNT, Math.floor(input.tiers.get(role) ?? 0)));
    if (tier === 0) {
      if (weaponSlotsFull || !input.unlockedRoles.has(role)) continue;
      pool.push({ option: { kind: 'weapon', role, tier: 1 }, weight: weaponWeight(role, input.timeS) });
    } else if (tier < TIER_COUNT) {
      pool.push({
        option: { kind: 'weapon', role, tier: tier + 1 },
        weight: weaponWeight(role, input.timeS),
      });
    }
  }

  const itemSlotsFull = ownedItemCount(input.items) >= BUILD.itemCap;
  for (const item of ITEM_IDS) {
    const tier = itemLevel(input.items, item);
    if (tier === 0) {
      if (itemSlotsFull || !input.unlockedItems.has(item)) continue;
      pool.push({ option: { kind: 'item', item, tier: 1 }, weight: NEW_ITEM_WEIGHT });
    } else if (tier < itemMaxLevel(item)) {
      // As with an owned weapon, an item already in this run remains legal if
      // meta state is repaired underneath it.
      pool.push({ option: { kind: 'item', item, tier: tier + 1 }, weight: OWNED_ITEM_WEIGHT });
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

function selectFiniteOffers(
  pool: readonly WeightedOption<BuildPickOption>[],
  rng: Rng,
  forceItem: boolean,
): BuildPickOption[] {
  const ranked = rankOptions(pool, rng);
  const requiredItem = forceItem
    ? ranked.find((candidate) => candidate.option.kind === 'item')
    : undefined;
  const selected: RankedOption<BuildPickOption>[] = [];

  // Reserve the best-ranked item before filling the remaining cards. Sorting
  // selected cards back by rank below means a forced item has no fixed screen
  // position.
  if (requiredItem) selected.push(requiredItem);

  // No cross-card exclusion rule survives: each role appears in the pool at
  // most once, so taking the ranked order in order cannot repeat a weapon.
  for (const candidate of ranked) {
    if (selected.length >= OFFER_COUNT) break;
    if (candidate === requiredItem) continue;
    selected.push(candidate);
  }

  selected.sort((a, b) => b.key - a.key || a.index - b.index);
  return selected.slice(0, OFFER_COUNT).map(({ option }) => option);
}

const ENCORE_STEPS = {
  damage: { amount: 2, cap: 20 },
  move: { amount: 2, cap: 10 },
  area: { amount: 3, cap: 15 },
} as const;

function safeProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildEncorePool(progress: Readonly<EncoreProgress>): WeightedOption<EncorePickOption>[] {
  const pool: WeightedOption<EncorePickOption>[] = [
    { option: { kind: 'encore', encore: 'heal', amount: 15, cap: null }, weight: 1 },
  ];
  const values = {
    damage: safeProgress(progress.damagePct),
    move: safeProgress(progress.movePct),
    area: safeProgress(progress.areaPct),
  } as const;

  for (const encore of ['damage', 'move', 'area'] as const) {
    const { amount, cap } = ENCORE_STEPS[encore];
    const remaining = cap - values[encore];
    if (remaining <= 0) continue;
    pool.push({
      option: {
        kind: 'encore',
        encore,
        amount: Math.min(amount, remaining),
        cap,
      },
      weight: 1,
    });
  }
  return pool;
}

function rollEncoreOffers(
  progress: Readonly<EncoreProgress>,
  rng: Rng,
): EncorePickOption[] {
  const ranked = rankOptions(buildEncorePool(progress), rng);
  // Healing remains an option even after every bounded stat reaches its cap.
  // Reserve it just like the early forced item, then retain weighted ordering.
  const heal = ranked.find((candidate) => candidate.option.encore === 'heal')!;
  const selected = [heal];
  for (const candidate of ranked) {
    if (selected.length >= OFFER_COUNT) break;
    if (candidate !== heal) selected.push(candidate);
  }
  selected.sort((a, b) => b.key - a.key || a.index - b.index);
  return selected.map(({ option }) => option);
}

function rollConfiguredOffers(input: RollOffersInput): AnyPickOption[] {
  const pool = buildFinitePool(input);
  if (pool.length === 0) {
    return rollEncoreOffers(input.encore ?? EMPTY_ENCORE_PROGRESS, input.rng);
  }
  const forceItem =
    Math.floor(input.level) >= FORCED_ITEM_LEVEL &&
    ownedItemCount(input.items) < FORCED_ITEM_UNTIL_OWNED &&
    pool.some(({ option }) => option.kind === 'item');
  return selectFiniteOffers(pool, input.rng, forceItem);
}

/** Full configured economy used by normal runs. */
export function rollOffers(input: RollOffersInput): AnyPickOption[] {
  return rollConfiguredOffers(input);
}

export interface RollStartingWeaponsInput {
  tiers: ReadonlyMap<Role, number>;
  unlockedRoles: ReadonlySet<Role>;
  rng: Rng;
  timeS: number;
}

/**
 * The opening hire: the three weapons a run starts by choosing between. This
 * is not a level-up offer, so the pool holds only tier-0 hires — never an
 * item, never an Encore, never an upgrade of something already owned. The
 * usual gates still apply (soundset support, meta unlock) and the draw goes
 * through the same weighted rank, so a seeded run opens identically
 * everywhere. Returns fewer than OFFER_COUNT only if fewer weapons are
 * available to hire at all.
 */
export function rollStartingWeapons(input: RollStartingWeaponsInput): WeaponPickOption[] {
  const pool: WeightedOption<WeaponPickOption>[] = [];
  for (const role of ROLES) {
    if (!soundsetSupports(role)) continue;
    if (!input.unlockedRoles.has(role)) continue;
    const tier = Math.max(0, Math.min(TIER_COUNT, Math.floor(input.tiers.get(role) ?? 0)));
    if (tier !== 0) continue;
    pool.push({
      option: { kind: 'weapon', role, tier: 1 },
      weight: weaponWeight(role, input.timeS),
    });
  }

  // rankOptions returns the pool already ordered best-first, so taking in
  // order keeps the weighted ordering the cards are drawn in.
  return rankOptions(pool, input.rng)
    .slice(0, OFFER_COUNT)
    .map(({ option }) => option);
}
