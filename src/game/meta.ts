// Versioned, non-punishing career progression. Reputation unlocks new choices
// and venues, never permanent raw damage, so each run is still won by its build.

import type { Role } from '../audio/kits';
import { ITEM_IDS, type ItemId } from './items';
import { isVenueId, type VenueId } from './tour';

export const META_SAVE_KEY = 'loop-survivors.meta.v1';

export const MILESTONE_IDS = [
  'first5m',
  'fullBand',
  'firstEvolution',
  'hitlessHeadliner',
  'loopCross',
  'pressureBreak',
] as const;

export type MilestoneId = (typeof MILESTONE_IDS)[number];

export interface MasteryProgress {
  damage: number;
  kills: number;
  evolutions: number;
}

export interface MetaV1 {
  version: 1;
  runs: number;
  reputation: number;
  bestTimeS: number;
  lifetimeKills: number;
  lifetimeHeadliners: number;
  unlockedWeapons: Role[];
  unlockedItems: ItemId[];
  unlockedVenues: VenueId[];
  rerolls: number;
  secondWind: boolean;
  startItem?: ItemId;
  milestones: string[];
  mastery: Partial<Record<Role, MasteryProgress>>;
  seen: string[];
}

export type RankRewardKind = 'weapon' | 'item' | 'venue' | 'perk' | 'palette';

export interface RankReward {
  rank: number;
  kind: RankRewardKind;
  contentId: string;
  name: string;
  description: string;
}

export const RANK_REWARDS: readonly RankReward[] = [
  { rank: 2, kind: 'weapon', contentId: 'clap', name: 'Clap', description: 'A close circular blast that controls a crowd at arm’s length.' },
  { rank: 2, kind: 'perk', contentId: 'reroll1', name: 'First Reroll', description: 'Refresh one level-up offer per run.' },
  { rank: 3, kind: 'item', contentId: 'heavyAmp', name: 'Heavy Amp', description: 'More damage and shove; evolves Bass.' },
  { rank: 4, kind: 'weapon', contentId: 'arp', name: 'Arp', description: 'A rapid run of separate notes orbiting the player.' },
  { rank: 5, kind: 'item', contentId: 'needleTips', name: 'Needle Tips', description: 'Piercing projectiles and the Lead evolution recipe.' },
  { rank: 6, kind: 'venue', contentId: 'metro', name: 'Last Train Metro', description: 'A dangerous venue with screen-clearing train lanes.' },
  { rank: 7, kind: 'weapon', contentId: 'lead', name: 'Lead', description: 'A bright homing melody weapon.' },
  { rank: 8, kind: 'item', contentId: 'extensionCable', name: 'Extension Cable', description: 'Longer attacks and the Arp evolution recipe.' },
  { rank: 9, kind: 'venue', contentId: 'basement', name: 'Flooded Basement', description: 'Slow puddles and longer zones.' },
  { rank: 9, kind: 'item', contentId: 'paddedJacket', name: 'Padded Jacket', description: 'Health, armor, and the Clap evolution recipe.' },
  { rank: 10, kind: 'weapon', contentId: 'bell', name: 'Bell', description: 'Heavy crystal shots that shatter on impact.' },
  { rank: 10, kind: 'perk', contentId: 'secondWind', name: 'Second Wind', description: 'Revive once per run at 30% health.' },
  { rank: 11, kind: 'item', contentId: 'magnetLanyard', name: 'Magnet Lanyard', description: 'Long-range gem pull and the Bell evolution recipe.' },
  { rank: 12, kind: 'perk', contentId: 'startItem', name: 'Tour Loadout', description: 'Choose one unlocked passive to begin at tier I.' },
  { rank: 13, kind: 'perk', contentId: 'reroll2', name: 'Second Reroll', description: 'Refresh a second offer each run.' },
  { rank: 14, kind: 'venue', contentId: 'dawn', name: 'Dawn Roof', description: 'Healing light and much harsher contact damage.' },
  { rank: 15, kind: 'palette', contentId: 'gold', name: 'Headliner Gold', description: 'A gold venue, enemy, and evolution palette.' },
] as const;

export const MAX_TOUR_RANK = 15;

export const CORE_WEAPONS: readonly Role[] = ['kick', 'snare', 'hat', 'bass', 'chord'];
export const CORE_ITEMS: readonly ItemId[] = ['highTops', 'fastForward', 'mirrorball', 'wideLens'];
export const CORE_VENUES: readonly VenueId[] = ['alley', 'warehouse', 'rooftop'];

const META_WEAPONS: readonly Role[] = ['kick', 'snare', 'hat', 'bass', 'chord', 'clap', 'arp', 'lead', 'bell'];
const META_VENUES: readonly VenueId[] = ['alley', 'warehouse', 'rooftop', 'metro', 'basement', 'dawn'];

export function reputationCostForNextRank(rank: number): number {
  return 80 + 25 * Math.max(0, Math.floor(rank) - 1);
}

/** Lifetime reputation at the beginning of a rank. */
export function reputationAtRank(rank: number): number {
  const completed = Math.max(0, Math.floor(rank) - 1);
  return completed * 80 + (25 * completed * (completed - 1)) / 2;
}

export function rankForReputation(reputation: number): number {
  const rep = Math.max(0, Math.floor(reputation));
  let rank = 1;
  while (rank < MAX_TOUR_RANK && rep >= reputationAtRank(rank + 1)) rank += 1;
  return rank;
}

export interface RankProgress {
  rank: number;
  maxed: boolean;
  earnedIntoRank: number;
  costToNext: number;
  remaining: number;
  ratio: number;
  nextRewards: readonly RankReward[];
}

export function rankProgress(reputation: number): RankProgress {
  const rank = rankForReputation(reputation);
  if (rank >= MAX_TOUR_RANK) {
    return {
      rank: MAX_TOUR_RANK,
      maxed: true,
      earnedIntoRank: 0,
      costToNext: 0,
      remaining: 0,
      ratio: 1,
      nextRewards: [],
    };
  }
  const floor = reputationAtRank(rank);
  const costToNext = reputationCostForNextRank(rank);
  const earnedIntoRank = Math.max(0, Math.floor(reputation) - floor);
  return {
    rank,
    maxed: false,
    earnedIntoRank,
    costToNext,
    remaining: Math.max(0, costToNext - earnedIntoRank),
    ratio: Math.min(1, earnedIntoRank / costToNext),
    nextRewards: RANK_REWARDS.filter((reward) => reward.rank === rank + 1),
  };
}

export function defaultMetaState(): MetaV1 {
  return {
    version: 1,
    runs: 0,
    reputation: 0,
    bestTimeS: 0,
    lifetimeKills: 0,
    lifetimeHeadliners: 0,
    unlockedWeapons: [...CORE_WEAPONS],
    unlockedItems: [...CORE_ITEMS],
    unlockedVenues: [...CORE_VENUES],
    rerolls: 0,
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

function applyRankRewards(state: MetaV1): void {
  const rank = rankForReputation(state.reputation);
  for (const reward of RANK_REWARDS) {
    if (reward.rank > rank) continue;
    if (reward.kind === 'weapon') addUnique(state.unlockedWeapons, reward.contentId as Role);
    if (reward.kind === 'item') addUnique(state.unlockedItems, reward.contentId as ItemId);
    if (reward.kind === 'venue') addUnique(state.unlockedVenues, reward.contentId as VenueId);
  }
  state.rerolls = rank >= 13 ? 2 : rank >= 2 ? 1 : 0;
  state.secondWind = rank >= 10;
  if (rank < 12 || (state.startItem && !state.unlockedItems.includes(state.startItem))) {
    delete state.startItem;
  }
}

function sanitize(raw: unknown): MetaV1 {
  const state = defaultMetaState();
  if (!raw || typeof raw !== 'object') return state;
  const parsed = raw as Partial<MetaV1>;
  state.runs = Math.floor(safeNumber(parsed.runs));
  state.reputation = Math.floor(safeNumber(parsed.reputation));
  state.bestTimeS = safeNumber(parsed.bestTimeS);
  state.lifetimeKills = Math.floor(safeNumber(parsed.lifetimeKills));
  state.lifetimeHeadliners = Math.floor(safeNumber(parsed.lifetimeHeadliners));
  state.unlockedWeapons = [...new Set([...CORE_WEAPONS, ...filterIds(parsed.unlockedWeapons, META_WEAPONS)])];
  state.unlockedItems = [...new Set([...CORE_ITEMS, ...filterIds(parsed.unlockedItems, ITEM_IDS)])];
  state.unlockedVenues = [...new Set([...CORE_VENUES, ...filterIds(parsed.unlockedVenues, META_VENUES)])];
  state.milestones = filterIds(parsed.milestones, MILESTONE_IDS);
  state.seen = Array.isArray(parsed.seen)
    ? [...new Set(parsed.seen.filter((id): id is string => typeof id === 'string').slice(0, 256))]
    : [];
  if (typeof parsed.startItem === 'string' && ITEM_IDS.includes(parsed.startItem as ItemId)) {
    state.startItem = parsed.startItem as ItemId;
  }
  if (parsed.mastery && typeof parsed.mastery === 'object') {
    for (const role of META_WEAPONS) {
      const entry = parsed.mastery[role];
      if (!entry || typeof entry !== 'object') continue;
      state.mastery[role] = {
        damage: safeNumber(entry.damage),
        kills: Math.floor(safeNumber(entry.kills)),
        evolutions: Math.floor(safeNumber(entry.evolutions)),
      };
    }
  }
  applyRankRewards(state);
  return state;
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export interface RunReputationInput {
  timeS: number;
  level?: number;
  kills: number;
  headlinersKilled: number;
  evolutionsMade: number;
  milestones: readonly MilestoneId[];
  damageByRole?: Partial<Record<Role, number>>;
  killsByRole?: Partial<Record<Role, number>>;
  evolutionsByRole?: Partial<Record<Role, number>>;
  venuesVisited?: readonly VenueId[];
}

export interface ReputationBreakdown {
  survival: number;
  level: number;
  kills: number;
  headliners: number;
  evolutions: number;
  milestones: number;
  newVenues: number;
  firstRun: number;
  total: number;
}

export interface RunSettlement {
  state: MetaV1;
  breakdown: ReputationBreakdown;
  newMilestones: MilestoneId[];
  newVenues: VenueId[];
  rankBefore: number;
  rankAfter: number;
  unlockedRewards: RankReward[];
  progress: RankProgress;
}

export class MetaStore {
  readonly state: MetaV1;
  private readonly storage: Storage | null;

  constructor(storage: Storage | null = browserStorage()) {
    this.storage = storage;
    let raw: unknown = null;
    try {
      const saved = storage?.getItem(META_SAVE_KEY);
      if (saved) raw = JSON.parse(saved);
    } catch {
      raw = null;
    }
    this.state = sanitize(raw);
  }

  save(): void {
    try {
      this.storage?.setItem(META_SAVE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage can be unavailable or full; a run must remain playable.
    }
  }

  rank(): number {
    return rankForReputation(this.state.reputation);
  }

  progress(): RankProgress {
    return rankProgress(this.state.reputation);
  }

  unlockedRoles(): Set<Role> {
    return new Set(this.state.unlockedWeapons);
  }

  unlockedItemIds(): Set<ItemId> {
    return new Set(this.state.unlockedItems);
  }

  unlockedVenueIds(): Set<VenueId> {
    return new Set(this.state.unlockedVenues);
  }

  hasGoldPalette(): boolean {
    return this.rank() >= 15;
  }

  selectStartItem(item: ItemId | undefined): boolean {
    if (item === undefined) {
      delete this.state.startItem;
      this.save();
      return true;
    }
    if (this.rank() < 12 || !this.state.unlockedItems.includes(item)) return false;
    this.state.startItem = item;
    this.save();
    return true;
  }

  markSeen(ids: readonly string[]): void {
    for (const id of ids) addUnique(this.state.seen, id);
    this.save();
  }

  unseenRewards(): RankReward[] {
    const rank = this.rank();
    return RANK_REWARDS.filter(
      (reward) => reward.rank <= rank && !this.state.seen.includes(`rank:${reward.rank}:${reward.contentId}`),
    );
  }

  settleRun(run: RunReputationInput): RunSettlement {
    const rankBefore = this.rank();
    const milestoneSet = new Set(this.state.milestones);
    const newMilestones = [...new Set(run.milestones)].filter((id) => !milestoneSet.has(id));
    for (const id of newMilestones) addUnique(this.state.milestones, id);
    const newVenues = [...new Set(run.venuesVisited ?? [])]
      .filter(isVenueId)
      .filter((id) => !this.state.seen.includes(`venue:${id}`));

    const breakdown: ReputationBreakdown = {
      survival: 20 + 15 * Math.floor(Math.max(0, run.timeS) / 60),
      level: Math.min(60, 2 * Math.max(0, Math.floor(safeNumber(run.level, 1)) - 1)),
      kills: Math.min(100, Math.floor(Math.max(0, run.kills) / 20)),
      headliners: 25 * Math.max(0, Math.floor(run.headlinersKilled)),
      evolutions: 20 * Math.max(0, Math.floor(run.evolutionsMade)),
      milestones: 40 * newMilestones.length,
      newVenues: 25 * newVenues.length,
      firstRun: this.state.runs === 0 ? 50 : 0,
      total: 0,
    };
    breakdown.total = breakdown.survival + breakdown.level + breakdown.kills + breakdown.headliners +
      breakdown.evolutions + breakdown.milestones + breakdown.newVenues + breakdown.firstRun;

    for (const id of newVenues) addUnique(this.state.seen, `venue:${id}`);

    this.state.reputation += breakdown.total;
    this.state.runs += 1;
    this.state.bestTimeS = Math.max(this.state.bestTimeS, Math.max(0, run.timeS));
    this.state.lifetimeKills += Math.max(0, Math.floor(run.kills));
    this.state.lifetimeHeadliners += Math.max(0, Math.floor(run.headlinersKilled));

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

    const rankAfter = rankForReputation(this.state.reputation);
    applyRankRewards(this.state);
    const unlockedRewards = RANK_REWARDS.filter(
      (reward) => reward.rank > rankBefore && reward.rank <= rankAfter,
    );
    this.save();
    return {
      state: this.state,
      breakdown,
      newMilestones,
      newVenues,
      rankBefore,
      rankAfter,
      unlockedRewards,
      progress: this.progress(),
    };
  }
}

export const MASTERY_THRESHOLDS = {
  evolutionHintDamage: 100_000,
  projectileSkinKills: 1_000,
  goldIconEvolutions: 3,
} as const;
