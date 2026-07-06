// Items (Feature 5): VS-like passives + one reactive active. Every item folds
// into a single global multiplier bag (Mods) the run reads at fixed call sites
// (damage/area/duration/speed/move/magnet/xp/crit/contact/regen) plus the
// reactive Drop nova. Recomputed from scratch whenever items change, so it is
// order-independent, pure, and headless-safe (no rng, no fx). Named after
// mixing-chain effects so the name maps to the mechanic by intuition.

export type ItemId =
  | 'gain'
  | 'reverb'
  | 'layer'
  | 'distortion'
  | 'tempo'
  | 'sustain'
  | 'sub'
  | 'limiter'
  | 'feedback'
  | 'drop';

/** Ordered for deterministic pool building (fixed iteration order). */
export const ITEM_IDS: readonly ItemId[] = [
  'gain',
  'reverb',
  'layer',
  'distortion',
  'tempo',
  'sustain',
  'sub',
  'limiter',
  'feedback',
  'drop',
];

/** The global multiplier bag the run reads at fixed call sites. */
export interface Mods {
  damageMul: number; // all outgoing weapon damage
  areaMul: number; // weapon radius / aura / zone / blast / cone / orbit
  durMul: number; // projectile+zone+orbit lifetime
  projSpeedMul: number; // projectile & wave travel speed
  moveMul: number; // player move speed
  magnetMul: number; // gem magnet radius
  xpMul: number; // xp per gem
  multishot: number; // EXTRA aimed projectiles (0 = base single shot)
  critChance: number; // 0..1, rolled per enemy hit
  critMul: number; // crit damage factor
  contactTakenMul: number; // <=1, scales contact damage the player takes
  regenPerS: number; // hp/sec passive regen
  // reactive "Drop" nova:
  dropEnabled: boolean;
  dropThreshold: number; // fraction of max hp that arms it
  dropCooldownS: number;
  dropRadius: number;
  dropDamage: number;
  dropKnockback: number;
}

export const BASE_MODS: Mods = {
  damageMul: 1,
  areaMul: 1,
  durMul: 1,
  projSpeedMul: 1,
  moveMul: 1,
  magnetMul: 1,
  xpMul: 1,
  multishot: 0,
  critChance: 0,
  critMul: 2.2,
  contactTakenMul: 1,
  regenPerS: 0,
  dropEnabled: false,
  dropThreshold: 0.3,
  dropCooldownS: 28,
  dropRadius: 300,
  dropDamage: 24,
  dropKnockback: 70,
};

export interface ItemDef {
  id: ItemId;
  name: string;
  color: string; // CSS hex, drives --voice-color on the card/chip
  maxLevel: number;
  /** One plain gameplay line per level (VS-style, zero music jargon). */
  desc: string[];
  /** Mutate the accumulator for the OWNED level. Called once per owned item. */
  contribute(m: Mods, level: number): void;
}

const at = (arr: number[], lvl: number): number => arr[lvl - 1];

export const ITEMS: Record<ItemId, ItemDef> = {
  gain: {
    id: 'gain',
    name: 'Gain',
    color: '#ff5a3c',
    maxLevel: 5,
    desc: ['+10% damage to everything', '+20% damage', '+32% damage', '+45% damage', '+60% damage'],
    contribute: (m, l) => {
      m.damageMul *= at([1.1, 1.2, 1.32, 1.45, 1.6], l);
    },
  },
  reverb: {
    id: 'reverb',
    name: 'Reverb',
    color: '#4dff88',
    maxLevel: 4,
    desc: ['+14% blast, wave & zone size', '+30% area', '+48% area', '+70% area'],
    contribute: (m, l) => {
      m.areaMul *= at([1.14, 1.3, 1.48, 1.7], l);
    },
  },
  layer: {
    id: 'layer',
    name: 'Layer',
    color: '#ffc93c',
    maxLevel: 2,
    desc: [
      'aimed shots (snare/hat/lead) fire one extra projectile',
      'aimed shots (snare/hat/lead) fire two extra',
    ],
    contribute: (m, l) => {
      m.multishot += l;
    }, // single owned entry, so += level
  },
  distortion: {
    id: 'distortion',
    name: 'Distortion',
    color: '#ff6bd6',
    maxLevel: 4,
    desc: ['12% chance to deal 2.2x', '20% crit chance', '28% crit chance', '36% crit for 2.6x'],
    contribute: (m, l) => {
      m.critChance += at([0.12, 0.2, 0.28, 0.36], l);
      if (l >= 4) m.critMul = 2.6;
    },
  },
  tempo: {
    id: 'tempo',
    name: 'Tempo',
    color: '#3ce0ff',
    maxLevel: 3,
    desc: ['+10% move speed', '+20% move speed', '+32% move speed'],
    contribute: (m, l) => {
      m.moveMul *= at([1.1, 1.2, 1.32], l);
    },
  },
  sustain: {
    id: 'sustain',
    name: 'Sustain',
    color: '#33e6c2',
    maxLevel: 3,
    desc: ['orbits, zones & shots last +25% longer', '+50% duration', '+80% duration'],
    contribute: (m, l) => {
      m.durMul *= at([1.25, 1.5, 1.8], l);
    },
  },
  sub: {
    id: 'sub',
    name: 'Sub',
    color: '#a06bff',
    maxLevel: 3,
    desc: ['pull gems 50% further, +10% xp', '+100% magnet, +20% xp', '+160% magnet, +32% xp'],
    contribute: (m, l) => {
      m.magnetMul *= at([1.5, 2.0, 2.6], l);
      m.xpMul *= at([1.1, 1.2, 1.32], l);
    },
  },
  limiter: {
    id: 'limiter',
    name: 'Limiter',
    color: '#b9c2dd',
    maxLevel: 3,
    desc: ['take 15% less contact damage', 'take 28% less', 'take 40% less'],
    contribute: (m, l) => {
      m.contactTakenMul *= at([0.85, 0.72, 0.6], l);
    },
  },
  feedback: {
    id: 'feedback',
    name: 'Feedback',
    color: '#ff4f7d',
    maxLevel: 3,
    desc: ['regenerate 1 hp/sec', 'regenerate 2 hp/sec', 'regenerate 3.5 hp/sec'],
    contribute: (m, l) => {
      m.regenPerS += at([1, 2, 3.5], l);
    },
  },
  drop: {
    id: 'drop',
    name: 'Drop',
    color: '#66b3ff',
    maxLevel: 2,
    desc: ['at 30% hp, blast a shockwave that clears space (28s)', 'stronger blast, 18s cooldown'],
    contribute: (m, l) => {
      m.dropEnabled = true;
      m.dropCooldownS = at([28, 18], l);
      m.dropRadius = at([300, 380], l);
      m.dropDamage = at([24, 30], l);
      m.dropKnockback = at([70, 90], l);
    },
  },
};
