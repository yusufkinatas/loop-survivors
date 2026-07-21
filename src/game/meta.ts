// Persistent career progression is a player-directed shop. Enemies shed
// collectible music notes during a run; notes bank at death and buy permanent
// content unlocks. Nothing here grants repeatable raw damage, health, or speed.

import type { Role } from '../audio/kits';
import { ITEM_IDS, type ItemId } from './items';

const META_SAVE_KEY = 'loop-survivors.meta.v2';
const LEGACY_META_SAVE_KEY = 'loop-survivors.meta.v1';

const MILESTONE_IDS = [
  'first5m',
  'fullBand',
  'firstEvolution',
] as const;

type MilestoneId = (typeof MILESTONE_IDS)[number];

interface MasteryProgress {
  damage: number;
  kills: number;
  evolutions: number;
}

const CORE_WEAPONS: readonly Role[] = ['kick', 'snare', 'hat', 'bass', 'chord'];
const CORE_ITEMS: readonly ItemId[] = ['highTops', 'fastForward', 'mirrorball', 'wideLens'];

const META_WEAPONS: readonly Role[] = ['kick', 'snare', 'hat', 'bass', 'chord', 'clap', 'arp', 'lead', 'bell'];

const SHOP_OFFER_IDS = [
  'heavyAmp',
  'clap',
  'arp',
  'needleTips',
  'recoveryTape',
  'lead',
  'extensionCable',
  'paddedJacket',
  'doubleTake',
  'bell',
  'magnetLanyard',
  'secondWind',
  'startItem',
] as const;

export type ShopOfferId = (typeof SHOP_OFFER_IDS)[number];
type ShopOfferKind = 'weapon' | 'item' | 'perk';

export interface ShopOffer {
  id: ShopOfferId;
  kind: ShopOfferKind;
  contentId: string;
  name: string;
  description: string;
  cost: number;
  /** Collection purchases required before this shelf opens. */
  minOwned: number;
}

export const SHOP_OFFERS: readonly ShopOffer[] = [
  { id: 'heavyAmp', kind: 'item', contentId: 'heavyAmp', name: 'Heavy Amp', cost: 90, minOwned: 0,
    description: 'More damage and shove; completes the Bass evolution recipe.' },
  { id: 'recoveryTape', kind: 'item', contentId: 'recoveryTape', name: 'Recovery Tape', cost: 100, minOwned: 0,
    description: 'Slow health regeneration; a standalone passive with no evolution.' },
  { id: 'clap', kind: 'weapon', contentId: 'clap', name: 'Clap', cost: 110, minOwned: 0,
    description: 'A close circular blast that controls the crowd.' },

  { id: 'arp', kind: 'weapon', contentId: 'arp', name: 'Arp', cost: 180, minOwned: 2,
    description: 'A rapid run of separate notes orbiting the player.' },
  { id: 'needleTips', kind: 'item', contentId: 'needleTips', name: 'Needle Tips', cost: 130, minOwned: 2,
    description: 'Piercing projectiles and the Lead evolution recipe.' },

  { id: 'lead', kind: 'weapon', contentId: 'lead', name: 'Lead', cost: 260, minOwned: 5,
    description: 'A bright homing melody weapon.' },
  { id: 'extensionCable', kind: 'item', contentId: 'extensionCable', name: 'Extension Cable', cost: 150, minOwned: 5,
    description: 'Longer attacks and the Arp evolution recipe.' },
  { id: 'paddedJacket', kind: 'item', contentId: 'paddedJacket', name: 'Padded Jacket', cost: 170, minOwned: 5,
    description: 'Health, armor, and the Clap evolution recipe.' },
  { id: 'doubleTake', kind: 'item', contentId: 'doubleTake', name: 'Double Take', cost: 280, minOwned: 5,
    description: 'Two levels only: every projectile weapon fires one, then two extra shots.' },

  { id: 'bell', kind: 'weapon', contentId: 'bell', name: 'Bell', cost: 360, minOwned: 8,
    description: 'Heavy crystal shots that shatter on impact.' },
  { id: 'magnetLanyard', kind: 'item', contentId: 'magnetLanyard', name: 'Magnet Lanyard', cost: 220, minOwned: 8,
    description: 'Long-range pickup pull and the Bell evolution recipe.' },
  { id: 'secondWind', kind: 'perk', contentId: 'secondWind', name: 'Second Wind', cost: 320, minOwned: 8,
    description: 'Revive once per run at 30% health.' },
  { id: 'startItem', kind: 'perk', contentId: 'startItem', name: 'Opening Loadout', cost: 300, minOwned: 8,
    description: 'Choose one unlocked passive to begin at tier I.' },
] as const;

const SHOP_BY_ID = new Map<ShopOfferId, ShopOffer>(SHOP_OFFERS.map((offer) => [offer.id, offer]));

export interface MetaV2 {
  version: 2;
  runs: number;
  /** Spendable music notes. */
  notes: number;
  /** All music notes ever banked, including notes later spent. */
  lifetimeNotes: number;
  bestTimeS: number;
  lifetimeKills: number;
  lifetimeChests: number;
  purchases: ShopOfferId[];
  unlockedWeapons: Role[];
  unlockedItems: ItemId[];
  secondWind: boolean;
  startItem?: ItemId;
  milestones: string[];
  mastery: Partial<Record<Role, MasteryProgress>>;
  seen: string[];
}

export interface ShopOfferState {
  offer: ShopOffer;
  purchased: boolean;
  shelfLocked: boolean;
  purchasesNeeded: number;
  affordable: boolean;
}

export interface CollectionProgress {
  owned: number;
  total: number;
  ratio: number;
  complete: boolean;
}

function defaultMetaState(): MetaV2 {
  return {
    version: 2,
    runs: 0,
    notes: 0,
    lifetimeNotes: 0,
    bestTimeS: 0,
    lifetimeKills: 0,
    lifetimeChests: 0,
    purchases: [],
    unlockedWeapons: [...CORE_WEAPONS],
    unlockedItems: [...CORE_ITEMS],
    secondWind: false,
    milestones: [],
    mastery: {},
    seen: [],
  };
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function filterIds<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const allowedSet = new Set<string>(allowed);
  return [...new Set(value.filter((id): id is T => typeof id === 'string' && allowedSet.has(id)))];
}

function addUnique<T>(array: T[], value: T): void {
  if (!array.includes(value)) array.push(value);
}

function rebuildUnlocks(state: MetaV2): void {
  state.unlockedWeapons = [...CORE_WEAPONS];
  state.unlockedItems = [...CORE_ITEMS];
  state.secondWind = false;
  for (const id of state.purchases) {
    const offer = SHOP_BY_ID.get(id);
    if (!offer) continue;
    if (offer.kind === 'weapon') addUnique(state.unlockedWeapons, offer.contentId as Role);
    if (offer.kind === 'item') addUnique(state.unlockedItems, offer.contentId as ItemId);
    if (id === 'secondWind') state.secondWind = true;
  }
  if (!state.purchases.includes('startItem') ||
      (state.startItem && !state.unlockedItems.includes(state.startItem))) {
    delete state.startItem;
  }
}

function inferLegacyPurchases(raw: Record<string, unknown>): ShopOfferId[] {
  const weapons = filterIds(raw.unlockedWeapons, META_WEAPONS);
  const items = filterIds(raw.unlockedItems, ITEM_IDS);
  const purchases: ShopOfferId[] = [];
  for (const offer of SHOP_OFFERS) {
    if (offer.kind === 'weapon' && weapons.includes(offer.contentId as Role)) addUnique(purchases, offer.id);
    if (offer.kind === 'item' && items.includes(offer.contentId as ItemId)) addUnique(purchases, offer.id);
  }
  if (raw.secondWind === true) addUnique(purchases, 'secondWind');
  // Preserve perks that an old automatic rank had earned even when no starting
  // passive was selected. This threshold is the old rank-12 lifetime
  // reputation floor.
  const reputation = Math.floor(safeNumber(raw.reputation));
  if (reputation >= 2_255) addUnique(purchases, 'startItem');
  return purchases;
}

function sanitize(raw: unknown): MetaV2 {
  const state = defaultMetaState();
  if (!raw || typeof raw !== 'object') return state;
  const parsed = raw as Record<string, unknown>;
  state.runs = Math.floor(safeNumber(parsed.runs));
  state.bestTimeS = safeNumber(parsed.bestTimeS);
  state.lifetimeKills = Math.floor(safeNumber(parsed.lifetimeKills));
  state.lifetimeChests = Math.floor(safeNumber(parsed.lifetimeChests));
  state.milestones = filterIds(parsed.milestones, MILESTONE_IDS);
  state.seen = Array.isArray(parsed.seen)
    ? [...new Set(parsed.seen.filter((id): id is string => typeof id === 'string').slice(0, 256))]
    : [];

  const isV2 = parsed.version === 2;
  state.purchases = isV2
    ? filterIds(parsed.purchases, SHOP_OFFER_IDS)
    : inferLegacyPurchases(parsed);
  // Migration converts one quarter of old reputation to spendable notes while
  // preserving every already-earned unlock. Existing players never lose work.
  state.notes = Math.floor(isV2 ? safeNumber(parsed.notes) : safeNumber(parsed.reputation) / 4);
  state.lifetimeNotes = Math.max(state.notes, Math.floor(safeNumber(parsed.lifetimeNotes, state.notes)));

  if (typeof parsed.startItem === 'string' && ITEM_IDS.includes(parsed.startItem as ItemId)) {
    state.startItem = parsed.startItem as ItemId;
  }
  if (parsed.mastery && typeof parsed.mastery === 'object') {
    const mastery = parsed.mastery as Partial<Record<Role, Partial<MasteryProgress>>>;
    for (const role of META_WEAPONS) {
      const entry = mastery[role];
      if (!entry || typeof entry !== 'object') continue;
      state.mastery[role] = {
        damage: safeNumber(entry.damage),
        kills: Math.floor(safeNumber(entry.kills)),
        evolutions: Math.floor(safeNumber(entry.evolutions)),
      };
    }
  }
  rebuildUnlocks(state);
  return state;
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export interface RunProgressInput {
  timeS: number;
  level?: number;
  kills: number;
  notesCollected: number;
  chestsOpened: number;
  evolutionsMade: number;
  milestones: readonly MilestoneId[];
  damageByRole?: Partial<Record<Role, number>>;
  killsByRole?: Partial<Record<Role, number>>;
  evolutionsByRole?: Partial<Record<Role, number>>;
}

export interface RunSettlement {
  state: MetaV2;
  notesEarned: number;
  walletBefore: number;
  walletAfter: number;
  newMilestones: MilestoneId[];
  collection: CollectionProgress;
}

export class MetaStore {
  readonly state: MetaV2;
  private readonly storage: Storage | null;

  constructor(storage: Storage | null = browserStorage()) {
    this.storage = storage;
    let raw: unknown = null;
    try {
      const saved = storage?.getItem(META_SAVE_KEY) ?? storage?.getItem(LEGACY_META_SAVE_KEY);
      if (saved) raw = JSON.parse(saved);
    } catch {
      raw = null;
    }
    this.state = sanitize(raw);
    if (raw && (raw as { version?: unknown }).version !== 2) this.save();
  }

  save(): void {
    try {
      this.storage?.setItem(META_SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage can be unavailable or full; a run must remain playable.
    }
  }

  collection(): CollectionProgress {
    const owned = this.state.purchases.length;
    const total = SHOP_OFFERS.length;
    return { owned, total, ratio: total > 0 ? owned / total : 1, complete: owned >= total };
  }

  shop(): ShopOfferState[] {
    const owned = this.state.purchases.length;
    return SHOP_OFFERS.map((offer) => ({
      offer,
      purchased: this.state.purchases.includes(offer.id),
      shelfLocked: owned < offer.minOwned,
      purchasesNeeded: Math.max(0, offer.minOwned - owned),
      affordable: this.state.notes >= offer.cost,
    }));
  }

  purchase(id: ShopOfferId): boolean {
    const offer = SHOP_BY_ID.get(id);
    if (!offer || this.state.purchases.includes(id)) return false;
    if (this.state.purchases.length < offer.minOwned || this.state.notes < offer.cost) return false;
    this.state.notes -= offer.cost;
    this.state.purchases.push(id);
    rebuildUnlocks(this.state);
    this.save();
    return true;
  }

  /** Developer-only sandbox helper. Normal runs earn notes only as pickups. */
  grantNotes(amount: number): void {
    const granted = Math.max(0, Math.floor(safeNumber(amount)));
    this.state.notes += granted;
    this.state.lifetimeNotes += granted;
    this.save();
  }

  hasPurchase(id: ShopOfferId): boolean {
    return this.state.purchases.includes(id);
  }

  unlockedRoles(): Set<Role> {
    return new Set(this.state.unlockedWeapons);
  }

  unlockedItemIds(): Set<ItemId> {
    return new Set(this.state.unlockedItems);
  }

  selectStartItem(item: ItemId | undefined): boolean {
    if (item === undefined) {
      delete this.state.startItem;
      this.save();
      return true;
    }
    if (!this.hasPurchase('startItem') || !this.state.unlockedItems.includes(item)) return false;
    this.state.startItem = item;
    this.save();
    return true;
  }

  settleRun(run: RunProgressInput): RunSettlement {
    const milestoneSet = new Set(this.state.milestones);
    const newMilestones = [...new Set(run.milestones)].filter((id) => !milestoneSet.has(id));
    for (const id of newMilestones) addUnique(this.state.milestones, id);

    const notesEarned = Math.max(0, Math.floor(safeNumber(run.notesCollected)));
    const walletBefore = this.state.notes;
    this.state.notes += notesEarned;
    this.state.lifetimeNotes += notesEarned;
    this.state.runs += 1;
    this.state.bestTimeS = Math.max(this.state.bestTimeS, Math.max(0, run.timeS));
    this.state.lifetimeKills += Math.max(0, Math.floor(run.kills));
    this.state.lifetimeChests += Math.max(0, Math.floor(run.chestsOpened));

    for (const role of META_WEAPONS) {
      const damage = safeNumber(run.damageByRole?.[role]);
      const kills = Math.floor(safeNumber(run.killsByRole?.[role]));
      const evolutions = Math.floor(safeNumber(run.evolutionsByRole?.[role]));
      if (damage === 0 && kills === 0 && evolutions === 0) continue;
      const mastery = this.state.mastery[role] ?? { damage: 0, kills: 0, evolutions: 0 };
      mastery.damage += damage;
      mastery.kills += kills;
      mastery.evolutions += evolutions;
      this.state.mastery[role] = mastery;
    }
    this.save();
    return {
      state: this.state,
      notesEarned,
      walletBefore,
      walletAfter: this.state.notes,
      newMilestones,
      collection: this.collection(),
    };
  }
}
