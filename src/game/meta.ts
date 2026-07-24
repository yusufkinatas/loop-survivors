// Persistent career progression is a player-directed shop of permanent
// power-ups, cloned from Vampire Survivors' PowerUp screen: the same names,
// base prices, rank caps, effects, and price scaling. Every instrument and
// passive item is unlocked from the first run; music notes collected during a
// run bank at the end and buy power-up ranks.

import type { Role } from '../audio/kits';
import { neutralPowerUpMods, type PowerUpMods } from './items';

const META_SAVE_KEY = 'loop-survivors.meta.v3';
/** Older schemas, newest first; read for migration, removed on reset. */
const LEGACY_META_SAVE_KEYS = ['loop-survivors.meta.v2', 'loop-survivors.meta.v1'] as const;

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

const META_WEAPONS: readonly Role[] = ['kick', 'snare', 'hat', 'bass', 'chord', 'clap', 'arp', 'lead'];

export const POWER_UP_IDS = [
  'maxHealth',
  'recovery',
  'area',
  'speed',
  'duration',
  'amount',
  'moveSpeed',
  'magnet',
  'growth',
] as const;

export type PowerUpId = (typeof POWER_UP_IDS)[number];

export interface PowerUpDefinition {
  id: PowerUpId;
  name: string;
  description: string;
  /** Price of the first rank; later ranks scale (see nextRankPrice). */
  baseCost: number;
  maxRank: number;
}

/** Vampire Survivors' numbers, verbatim (vampire.survivors.wiki/w/PowerUps):
 *  base price, rank cap, and per-rank effect all match the source game. The
 *  effects themselves are applied in derivePowerUpMods below. */
export const POWER_UPS: Record<PowerUpId, PowerUpDefinition> = {
  maxHealth: {
    id: 'maxHealth', name: 'Max Health', baseCost: 200, maxRank: 3,
    description: 'Raises maximum health by 10% per rank.',
  },
  recovery: {
    id: 'recovery', name: 'Recovery', baseCost: 200, maxRank: 5,
    description: 'Regenerates 0.1 health per second per rank.',
  },
  area: {
    id: 'area', name: 'Area', baseCost: 300, maxRank: 2,
    description: 'Attacks cover 5% more ground per rank.',
  },
  speed: {
    id: 'speed', name: 'Speed', baseCost: 300, maxRank: 2,
    description: 'Projectiles travel 10% faster per rank.',
  },
  duration: {
    id: 'duration', name: 'Duration', baseCost: 300, maxRank: 2,
    description: 'Weapon effects last 15% longer per rank.',
  },
  amount: {
    id: 'amount', name: 'Amount', baseCost: 5000, maxRank: 1,
    description: 'Every weapon that throws something throws one more.',
  },
  moveSpeed: {
    id: 'moveSpeed', name: 'Move Speed', baseCost: 600, maxRank: 2,
    description: 'You move 5% faster per rank.',
  },
  magnet: {
    id: 'magnet', name: 'Magnet', baseCost: 300, maxRank: 2,
    description: 'Pickups reach you from 25% farther per rank.',
  },
  growth: {
    id: 'growth', name: 'Growth', baseCost: 900, maxRank: 5,
    description: 'Gain 3% more experience per rank.',
  },
};

/** Every rank the shop can ever sell, the denominator of career progress. */
const TOTAL_POWER_UP_RANKS = POWER_UP_IDS.reduce((sum, id) => sum + POWER_UPS[id].maxRank, 0);

export interface MetaV3 {
  version: 3;
  runs: number;
  /** Spendable music notes. */
  notes: number;
  /** All music notes ever banked, including notes later spent. */
  lifetimeNotes: number;
  bestTimeS: number;
  lifetimeKills: number;
  lifetimeChests: number;
  /** Owned rank per power-up; absent means rank 0. */
  powerUps: Partial<Record<PowerUpId, number>>;
  milestones: string[];
  mastery: Partial<Record<Role, MasteryProgress>>;
  seen: string[];
}

export interface PowerUpShopState {
  def: PowerUpDefinition;
  rank: number;
  maxed: boolean;
  /** Price of the next rank; 0 once maxed. */
  price: number;
  affordable: boolean;
}

export interface CollectionProgress {
  owned: number;
  total: number;
  ratio: number;
  complete: boolean;
}

function defaultMetaState(): MetaV3 {
  return {
    version: 3,
    runs: 0,
    notes: 0,
    lifetimeNotes: 0,
    bestTimeS: 0,
    lifetimeKills: 0,
    lifetimeChests: 0,
    powerUps: {},
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

/** What the retired content shop charged, kept only so a migrated save can be
 *  made whole: those unlocks are free now, so the notes spent on them come
 *  back as spendable notes. Weapon and item ids double as offer ids here,
 *  exactly as they did in the v2 schema. */
const LEGACY_SHOP_COSTS: Record<string, number> = {
  heavyAmp: 90, recoveryTape: 100, clap: 110, needleTips: 130, extensionCable: 150,
  paddedJacket: 170, arp: 180, magnetLanyard: 220, lead: 260, doubleTake: 280, secondWind: 320,
};

function legacyRefund(parsed: Record<string, unknown>): number {
  const ids = new Set<string>();
  if (parsed.version === 2) {
    if (Array.isArray(parsed.purchases)) {
      for (const id of parsed.purchases) if (typeof id === 'string') ids.add(id);
    }
  } else {
    // v1 stored no purchase list; its unlock arrays imply one. Core content
    // (never sold) simply misses the cost table and refunds nothing.
    for (const value of [parsed.unlockedWeapons, parsed.unlockedItems]) {
      if (!Array.isArray(value)) continue;
      for (const id of value) if (typeof id === 'string') ids.add(id);
    }
    if (parsed.secondWind === true) ids.add('secondWind');
  }
  let refund = 0;
  for (const id of ids) refund += LEGACY_SHOP_COSTS[id] ?? 0;
  return refund;
}

function sanitize(raw: unknown): MetaV3 {
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

  if (parsed.version === 3) {
    state.notes = Math.floor(safeNumber(parsed.notes));
    const ranks = parsed.powerUps && typeof parsed.powerUps === 'object'
      ? (parsed.powerUps as Record<string, unknown>)
      : {};
    for (const id of POWER_UP_IDS) {
      const rank = Math.min(POWER_UPS[id].maxRank, Math.floor(safeNumber(ranks[id])));
      if (rank > 0) state.powerUps[id] = rank;
    }
  } else {
    // v2 spent notes on content unlocks that are free now; v1 banked
    // reputation, converted at the historical quarter rate. Either way the
    // old shop's spending is refunded so no earned note is ever lost.
    const banked = parsed.version === 2 ? safeNumber(parsed.notes) : safeNumber(parsed.reputation) / 4;
    state.notes = Math.floor(banked + legacyRefund(parsed));
  }
  state.lifetimeNotes = Math.max(state.notes, Math.floor(safeNumber(parsed.lifetimeNotes, state.notes)));

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
  state: MetaV3;
  notesEarned: number;
  walletBefore: number;
  walletAfter: number;
  newMilestones: MilestoneId[];
  collection: CollectionProgress;
}

export class MetaStore {
  readonly state: MetaV3;
  private readonly storage: Storage | null;

  constructor(storage: Storage | null = browserStorage()) {
    this.storage = storage;
    let raw: unknown = null;
    try {
      const saved = storage?.getItem(META_SAVE_KEY)
        ?? storage?.getItem(LEGACY_META_SAVE_KEYS[0])
        ?? storage?.getItem(LEGACY_META_SAVE_KEYS[1]);
      if (saved) raw = JSON.parse(saved);
    } catch {
      raw = null;
    }
    this.state = sanitize(raw);
    if (raw && (raw as { version?: unknown }).version !== 3) this.save();
  }

  save(): void {
    try {
      this.storage?.setItem(META_SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage can be unavailable or full; a run must remain playable.
    }
  }

  rank(id: PowerUpId): number {
    return Math.max(0, Math.min(POWER_UPS[id].maxRank, Math.floor(this.state.powerUps[id] ?? 0)));
  }

  private totalRanks(): number {
    return POWER_UP_IDS.reduce((sum, id) => sum + this.rank(id), 0);
  }

  /** Vampire Survivors' exact pricing: the next rank of a power-up costs its
   *  base price times (1 + ranks of it already owned), plus a fee of
   *  floor(20 * 1.1^total ranks owned across every power-up) once anything at
   *  all has been bought. Only the very first purchase escapes the fee. */
  nextRankPrice(id: PowerUpId): number {
    const owned = this.rank(id);
    if (owned >= POWER_UPS[id].maxRank) return 0;
    const totalBought = this.totalRanks();
    const base = POWER_UPS[id].baseCost * (1 + owned);
    const fees = totalBought >= 1 ? Math.floor(20 * Math.pow(1.1, totalBought)) : 0;
    return base + fees;
  }

  collection(): CollectionProgress {
    const owned = this.totalRanks();
    const total = TOTAL_POWER_UP_RANKS;
    return { owned, total, ratio: total > 0 ? owned / total : 1, complete: owned >= total };
  }

  shop(): PowerUpShopState[] {
    return POWER_UP_IDS.map((id) => {
      const rank = this.rank(id);
      const maxed = rank >= POWER_UPS[id].maxRank;
      const price = this.nextRankPrice(id);
      return {
        def: POWER_UPS[id],
        rank,
        maxed,
        price,
        affordable: !maxed && this.state.notes >= price,
      };
    });
  }

  purchase(id: PowerUpId): boolean {
    const rank = this.rank(id);
    if (rank >= POWER_UPS[id].maxRank) return false;
    const price = this.nextRankPrice(id);
    if (this.state.notes < price) return false;
    this.state.notes -= price;
    this.state.powerUps[id] = rank + 1;
    this.save();
    return true;
  }

  /** The owned ranks as run bonuses. Effects are Vampire Survivors' own:
   *  Max Health and Magnet compound per rank (the wiki's +33.1% and +56.25%
   *  max effects); everything else adds. Area widens orbits at half rate,
   *  matching the Wide Lens passive it stacks with. */
  powerUpMods(): PowerUpMods {
    const mods = neutralPowerUpMods();
    mods.maxHpMul = Math.pow(1.1, this.rank('maxHealth'));
    mods.hpRegenPerSecond = this.rank('recovery') * 0.1;
    mods.areaMul = 1 + this.rank('area') * 0.05;
    mods.orbitDistanceMul = 1 + this.rank('area') * 0.025;
    mods.projectileSpeedMul = 1 + this.rank('speed') * 0.10;
    mods.durationMul = 1 + this.rank('duration') * 0.15;
    mods.extraProjectiles = this.rank('amount');
    mods.moveMul = 1 + this.rank('moveSpeed') * 0.05;
    mods.magnetMul = Math.pow(1.25, this.rank('magnet'));
    mods.xpGainMul = 1 + this.rank('growth') * 0.03;
    return mods;
  }

  /** Developer-only: put the career back to a genuine first-boot state.
   *
   *  "Just clear localStorage" fails this, twice over:
   *
   *  1. THERE ARE LEGACY KEYS. The constructor falls back to the v2 and v1
   *     keys and migrates them, so clearing only the v3 key lets an old save
   *     resurrect the whole career on the next boot. All of them go.
   *  2. THE LIVE OBJECT OUTLIVES THE STORAGE. `state` is built once at startup
   *     and held for the session, so clearing storage leaves the wallet, the
   *     rank meter and the shop cards showing stale values until a reload. The
   *     reset is therefore applied IN PLACE — `state` is readonly by reference
   *     and every holder must see the same change.
   *
   *  Writing the fresh defaults back out is deliberate: it leaves a v3 save on
   *  disk, so the next boot reads that and never consults a legacy key again. */
  resetProgress(): void {
    try {
      this.storage?.removeItem(META_SAVE_KEY);
      for (const key of LEGACY_META_SAVE_KEYS) this.storage?.removeItem(key);
    } catch {
      // Same reasoning as save(): storage can be unavailable, and the in-memory
      // reset below still has to happen.
    }
    Object.assign(this.state, defaultMetaState());
    this.save();
  }

  /** Developer-only sandbox helper. Normal runs earn notes only as pickups. */
  grantNotes(amount: number): void {
    const granted = Math.max(0, Math.floor(safeNumber(amount)));
    this.state.notes += granted;
    this.state.lifetimeNotes += granted;
    this.save();
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
