// Passive items and weapon evolutions. This is the single source of truth for
// offer cards, simulation modifiers, HUD copy, and evolution recipes.

import type { Role } from '../audio/kits';

export const ITEM_IDS = [
  'highTops',
  'fastForward',
  'needleTips',
  'mirrorball',
  'wideLens',
  'heavyAmp',
  'extensionCable',
  'magnetLanyard',
  'paddedJacket',
  'recoveryTape',
  'doubleTake',
] as const;

export type ItemId = (typeof ITEM_IDS)[number];

export const ITEM_MAX_LEVEL = 5;
export const ITEM_SLOT_CAP = 6;

/** Hue is the weapon language: every role owns one (`KIT_COLORS`). Passives
 * deliberately share a single cool off-white so a glance separates "weapon"
 * from "passive", and the glyph alone identifies which passive it is. Keep the
 * `.item-socket` / `.pause-item` CSS fallbacks in `src/style.css` in sync. */
export const ITEM_NEUTRAL_COLOR = 0xcfd8e3;
export const ITEM_NEUTRAL_CSS = `#${ITEM_NEUTRAL_COLOR.toString(16).padStart(6, '0')}`;

export interface ItemDefinition {
  id: ItemId;
  name: string;
  shortName: string;
  glyph: string;
  description: string;
  /** One line of copy per level; its length must equal the item's max level. */
  levelLines: readonly string[];
  /** Omitted when the item rides the standard five-level ladder. */
  maxLevel?: number;
  /** Omitted for utility passives that deliberately do not form a recipe. */
  evolutionPartner?: Role;
}

export const ITEMS: Record<ItemId, ItemDefinition> = {
  highTops: {
    id: 'highTops', name: 'High-Tops', shortName: 'Move', glyph: '↗',
    description: 'Move faster without changing the rhythm.', evolutionPartner: 'kick',
    levelLines: ['+4% move speed', '+8% total move speed', '+12% total move speed', '+16% total move speed', '+20% total move speed'],
  },
  fastForward: {
    id: 'fastForward', name: 'Fast Forward', shortName: 'Shot Speed', glyph: '»',
    description: 'Moving projectiles travel faster.', evolutionPartner: 'snare',
    levelLines: ['+20% projectile speed', '+40% total projectile speed', '+60% total projectile speed', '+80% total projectile speed', '+100% total projectile speed'],
  },
  needleTips: {
    id: 'needleTips', name: 'Needle Tips', shortName: 'Pierce', glyph: '◆',
    description: 'Shots pass through more enemies and hit harder.', evolutionPartner: 'lead',
    levelLines: ['+1 pierce', '+1 pierce, +6% shot damage', '+2 pierce, +6% shot damage', '+2 pierce, +12% shot damage', '+3 pierce, +12% shot damage'],
  },
  mirrorball: {
    id: 'mirrorball', name: 'Mirrorball', shortName: 'Bounce', glyph: '◇',
    description: 'Moving projectiles rebound from arena rails.', evolutionPartner: 'hat',
    levelLines: ['1 bounce, retains 65% power', '1 bounce, retains 75% power', '2 bounces, retain 75% power', '2 bounces, retain 85% power', '3 bounces, retain 85% power'],
  },
  wideLens: {
    id: 'wideLens', name: 'Wide Lens', shortName: 'Area', glyph: '◉',
    description: 'Attacks cover more ground; orbiters travel slightly wider.', evolutionPartner: 'chord',
    levelLines: ['+6% attack area', '+12% total attack area', '+18% total attack area', '+24% total attack area', '+30% total attack area'],
  },
  heavyAmp: {
    id: 'heavyAmp', name: 'Heavy Amp', shortName: 'Might', glyph: '▲',
    description: 'Every weapon hits harder and shoves farther.', evolutionPartner: 'bass',
    levelLines: ['+5% damage, +4% shove', '+10% damage, +8% shove', '+15% damage, +12% shove', '+20% damage, +16% shove', '+25% damage, +20% shove'],
  },
  extensionCable: {
    id: 'extensionCable', name: 'Extension Cable', shortName: 'Duration', glyph: '∞',
    description: 'Projectiles, zones, and orbiters stay active longer.', evolutionPartner: 'arp',
    levelLines: ['+8% attack duration', '+16% total attack duration', '+24% total attack duration', '+32% total attack duration', '+40% total attack duration'],
  },
  magnetLanyard: {
    id: 'magnetLanyard', name: 'Magnet Lanyard', shortName: 'Pickup', glyph: '✦',
    description: 'Experience gems find you from farther away and fly faster.', evolutionPartner: 'bell',
    levelLines: ['+20% gem range, +8% pull', '+40% range, +16% pull', '+60% range, +24% pull', '+80% range, +32% pull', '+100% range, +40% pull'],
  },
  paddedJacket: {
    id: 'paddedJacket', name: 'Padded Jacket', shortName: 'Guard', glyph: '▣',
    description: 'Raises maximum health, heals immediately, and adds armor.', evolutionPartner: 'clap',
    levelLines: ['+8 max HP and heal 8', '+16 total max HP', '+24 max HP, +1 armor', '+32 total max HP', '+40 max HP, +2 armor'],
  },
  recoveryTape: {
    id: 'recoveryTape', name: 'Recovery Tape', shortName: 'Regen', glyph: '✚',
    description: 'Slowly restores missing health throughout the run.',
    levelLines: ['+0.1 HP/sec regeneration', '+0.2 HP/sec regeneration', '+0.3 HP/sec regeneration', '+0.4 HP/sec regeneration', '+0.5 HP/sec regeneration'],
  },
  doubleTake: {
    id: 'doubleTake', name: 'Double Take', shortName: 'Shots', glyph: '⧉',
    description: 'Every weapon that throws something throws more of it.', maxLevel: 2,
    levelLines: ['+1 projectile', '+2 projectiles'],
  },
};

/** Most passives climb five levels; Double Take deliberately stops at two. */
export function itemMaxLevel(id: ItemId): number {
  return ITEMS[id].maxLevel ?? ITEM_MAX_LEVEL;
}

/** All passive effects are recomputed here so weapon branches never bake in
 * individual item logic. Values are multipliers unless their name says bonus. */
export interface BuildMods {
  moveMul: number;
  projectileSpeedMul: number;
  projectileDamageMul: number;
  extraPierce: number;
  bounceCount: number;
  bounceRetention: number;
  areaMul: number;
  orbitDistanceMul: number;
  knockbackMul: number;
  damageMul: number;
  durationMul: number;
  magnetMul: number;
  pullMul: number;
  maxHpBonus: number;
  armorBonus: number;
  hpRegenPerSecond: number;
  /** Extra shots per trigger on every projectile weapon (Double Take). */
  extraProjectiles: number;
}

export const BASE_BUILD_MODS: Readonly<BuildMods> = {
  moveMul: 1,
  projectileSpeedMul: 1,
  projectileDamageMul: 1,
  extraPierce: 0,
  bounceCount: 0,
  bounceRetention: 0.65,
  areaMul: 1,
  orbitDistanceMul: 1,
  knockbackMul: 1,
  damageMul: 1,
  durationMul: 1,
  magnetMul: 1,
  pullMul: 1,
  maxHpBonus: 0,
  armorBonus: 0,
  hpRegenPerSecond: 0,
  extraProjectiles: 0,
};

export function itemLevel(items: ReadonlyMap<ItemId, number>, id: ItemId): number {
  return Math.max(0, Math.min(itemMaxLevel(id), Math.floor(items.get(id) ?? 0)));
}

export function deriveBuildMods(items: ReadonlyMap<ItemId, number>): BuildMods {
  const move = itemLevel(items, 'highTops');
  const fast = itemLevel(items, 'fastForward');
  const needle = itemLevel(items, 'needleTips');
  const bounce = itemLevel(items, 'mirrorball');
  const area = itemLevel(items, 'wideLens');
  const amp = itemLevel(items, 'heavyAmp');
  const cable = itemLevel(items, 'extensionCable');
  const magnet = itemLevel(items, 'magnetLanyard');
  const jacket = itemLevel(items, 'paddedJacket');
  const recovery = itemLevel(items, 'recoveryTape');
  const duplicate = itemLevel(items, 'doubleTake');
  const needlePierce = [0, 1, 1, 2, 2, 3][needle];
  const needleDamage = [1, 1, 1.06, 1.06, 1.12, 1.12][needle];
  const bounceCount = [0, 1, 1, 2, 2, 3][bounce];
  const bounceRetention = [0.65, 0.65, 0.75, 0.75, 0.85, 0.85][bounce];
  return {
    moveMul: 1 + move * 0.04,
    projectileSpeedMul: 1 + fast * 0.20,
    projectileDamageMul: needleDamage,
    extraPierce: needlePierce,
    bounceCount,
    bounceRetention,
    areaMul: 1 + area * 0.06,
    orbitDistanceMul: 1 + area * 0.03,
    knockbackMul: 1 + amp * 0.04,
    damageMul: 1 + amp * 0.05,
    durationMul: 1 + cable * 0.08,
    magnetMul: 1 + magnet * 0.20,
    pullMul: 1 + magnet * 0.08,
    maxHpBonus: jacket * 8,
    armorBonus: jacket >= 5 ? 2 : jacket >= 3 ? 1 : 0,
    hpRegenPerSecond: recovery * 0.1,
    extraProjectiles: duplicate,
  };
}

/** Health gained when Padded Jacket advances one tier. */
export function paddedJacketHeal(previousLevel: number, nextLevel: number): number {
  return Math.max(0, Math.min(ITEM_MAX_LEVEL, nextLevel) - Math.max(0, previousLevel)) * 8;
}

export const EVOLUTION_IDS = [
  'redlineStomp',
  'railshot',
  'prismRain',
  'subquake',
  'afterhours',
  'neonSerpent',
  'standingOvation',
  'eventHorizon',
  'gravityBell',
] as const;

export type EvolutionId = (typeof EVOLUTION_IDS)[number];

export interface EvolutionDefinition {
  id: EvolutionId;
  role: Role;
  item: ItemId;
  name: string;
  color: number;
  description: string;
  signature: string;
  gainDb: number;
}

export const EVOLUTIONS: Record<EvolutionId, EvolutionDefinition> = {
  redlineStomp: {
    id: 'redlineStomp', role: 'kick', item: 'highTops', name: 'Redline Stomp', color: 0xff8a55, gainDb: 0,
    description: 'Four floor strips cross through the entire crowd in one colossal stomp.', signature: 'four-way cross',
  },
  railshot: {
    id: 'railshot', role: 'snare', item: 'fastForward', name: 'Railshot', color: 0xffdf72, gainDb: 0,
    description: 'An instant 900-range beam with infinite pierce; every fourth hit fires twin rails.', signature: 'infinite rail beam',
  },
  prismRain: {
    id: 'prismRain', role: 'hat', item: 'mirrorball', name: 'Prism Rain', color: 0x6febff, gainDb: -3,
    description: 'Faster blades redirect between distinct targets in a controlled ricochet storm.', signature: 'smart ricochet rain',
  },
  subquake: {
    id: 'subquake', role: 'bass', item: 'heavyAmp', name: 'Subquake', color: 0xbb91ff, gainDb: 0,
    description: 'The directional wave becomes an expanding, infinite-pierce seismic ring.', signature: 'expanding quake ring',
  },
  afterhours: {
    id: 'afterhours', role: 'chord', item: 'wideLens', name: 'Afterhours', color: 0x76ff92, gainDb: 0,
    description: 'Huge drifting slow zones seek the densest crowd and merge into supercells.', signature: 'hunting supercell',
  },
  neonSerpent: {
    id: 'neonSerpent', role: 'lead', item: 'needleTips', name: 'Neon Serpent', color: 0xff70d4, gainDb: -1.5,
    description: 'A sharp homing serpent pierces six targets and grows a giant head every fifth trigger.', signature: 'retargeting serpent',
  },
  standingOvation: {
    id: 'standingOvation', role: 'clap', item: 'paddedJacket', name: 'Standing Ovation', color: 0xff719f, gainDb: 0,
    description: 'A full arena ring blasts outward, then claps inward and rewards packed crowds.', signature: 'outward and inward rings',
  },
  eventHorizon: {
    id: 'eventHorizon', role: 'arp', item: 'extensionCable', name: 'Event Horizon', color: 0x5effd8, gainDb: 0,
    description: 'Counter-rotating pairs breathe around you as a dense orbiting crown.', signature: 'counter-orbiting crown',
  },
  gravityBell: {
    id: 'gravityBell', role: 'bell', item: 'magnetLanyard', name: 'Gravity Bell', color: 0xffe77a, gainDb: -2.5,
    description: 'The impact pulls the horde inward before shattering into ten seeking crystals.', signature: 'gravity well shatter',
  },
};

export const EVOLUTION_BY_ROLE: Partial<Record<Role, EvolutionDefinition>> = Object.fromEntries(
  Object.values(EVOLUTIONS).map((evolution) => [evolution.role, evolution]),
) as Partial<Record<Role, EvolutionDefinition>>;

export function eligibleEvolution(
  role: Role,
  weaponTier: number,
  items: ReadonlyMap<ItemId, number>,
  evolved: ReadonlySet<Role>,
): EvolutionDefinition | null {
  const evolution = EVOLUTION_BY_ROLE[role];
  if (!evolution || evolved.has(role) || weaponTier < 4) return null;
  return itemLevel(items, evolution.item) >= ITEM_MAX_LEVEL ? evolution : null;
}

export function eligibleEvolutions(
  tiers: ReadonlyMap<Role, number>,
  items: ReadonlyMap<ItemId, number>,
  evolved: ReadonlySet<Role>,
): EvolutionDefinition[] {
  const out: EvolutionDefinition[] = [];
  for (const [role, tier] of tiers) {
    const evolution = eligibleEvolution(role, tier, items, evolved);
    if (evolution) out.push(evolution);
  }
  return out;
}
