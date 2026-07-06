// The pick economy's one source of truth, shared by the game's level-up
// screen and the autoplay bot (docs/tools/autoplay-bot.md). Offers are a
// weighted draw over three kinds: new/upgraded weapons, items, and per-weapon
// effects. Both consumers roll with their own RNG (the game unseeded, the bot
// seeded) and take three. The rng->option mapping is deterministic: the pool
// is built in a fixed order (ROLES, then ITEM_IDS, then ROLES x WEAPON_EFFECTS).

import { TIER_COUNT } from '../audio/charts';
import { ROLES, type Role } from '../audio/kits';
import { EFFECT_IDS, type EffectId } from '../audio/voicefx';
import { WEAPON_EFFECTS } from './effects';
import { ITEM_IDS, ITEMS, type ItemId } from './items';
import type { Rng } from './rng';

/** A level-up option: a new weapon / tier-up, an item level, or an effect
 *  slotted onto an owned weapon (D2 — the central reconciliation union). */
export type PickOption =
  | { kind: 'weapon'; role: Role; tier: number }
  | { kind: 'item'; item: ItemId; level: number }
  | { kind: 'effect'; role: Role; effect: EffectId };

export function buildPickPool(
  tiers: ReadonlyMap<Role, number>,
  items: ReadonlyMap<ItemId, number>,
  effects: ReadonlyMap<Role, EffectId>,
): PickOption[] {
  const pool: PickOption[] = [];
  for (const role of ROLES) {
    const tier = tiers.get(role);
    if (!tier) pool.push({ kind: 'weapon', role, tier: 1 });
    else if (tier < TIER_COUNT) pool.push({ kind: 'weapon', role, tier: tier + 1 });
  }
  for (const id of ITEM_IDS) {
    const lvl = items.get(id) ?? 0;
    if (lvl < ITEMS[id].maxLevel) pool.push({ kind: 'item', item: id, level: lvl + 1 });
  }
  // Effects appear only once a weapon is worth modifying (tier 2+) and it has
  // no effect yet (one slot per weapon, max). Eligibility is derived (D10).
  for (const role of ROLES) {
    if ((tiers.get(role) ?? 0) >= 2 && !effects.has(role)) {
      for (const effect of WEAPON_EFFECTS[role]) {
        if (EFFECT_IDS.includes(effect)) pool.push({ kind: 'effect', role, effect });
      }
    }
  }
  return pool;
}

export function shuffleWith<T>(arr: readonly T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const WEAPON_WEIGHT = 3;
export const ITEM_WEIGHT = 1;
export const EFFECT_WEIGHT = 1;

/** The three cards a level-up offers (fewer once the pool thins out). Weighted
 *  draw (Efraimidis-Spirakis: key = rng()^(1/weight), take the top three).
 *  Weapons weigh 3x items/effects, so early offers are mostly weapons and the
 *  mix tilts to items/effects as weapons max out — no unlock levels needed. */
export function rollOffers(
  tiers: ReadonlyMap<Role, number>,
  items: ReadonlyMap<ItemId, number>,
  effects: ReadonlyMap<Role, EffectId>,
  rng: Rng,
): PickOption[] {
  const pool = buildPickPool(tiers, items, effects);
  const weightOf = (o: PickOption): number =>
    o.kind === 'weapon' ? WEAPON_WEIGHT : o.kind === 'item' ? ITEM_WEIGHT : EFFECT_WEIGHT;
  const keyed = pool.map((o) => ({ o, k: Math.pow(rng(), 1 / weightOf(o)) }));
  keyed.sort((a, b) => b.k - a.k);
  return keyed.slice(0, 3).map((x) => x.o);
}
