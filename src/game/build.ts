// What a build does to weapon numbers, and the evolution catalog.
//
// PROTOTYPE BASE (#265). The eleven passive items and the nine career power-up
// ranks that used to feed this file are gone: every round-1 engine spends the
// build slots passives occupied on its own objects (patterns, takes, stage
// positions, upkeep). What survives is the SEAM they fed — one struct that
// every weapon module reads and no weapon module bakes around.
//
// The struct is deliberately kept at full width with neutral values. A
// prototype's new power currency writes into `RunWorld.mods` and every weapon
// picks it up without learning where the number came from. Do not delete a
// field because nothing currently sets it; that is the point of the seam.

import type { Role } from '../audio/kits';
import { WEAPON_MAX_LEVEL } from './weapons/levels';

/** The single channel between "what the build is" and "what a weapon does".
 *  Values are multipliers unless their name says bonus. */
export interface BuildMods {
  moveMul: number;
  projectileSpeedMul: number;
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
  /** Scales every experience gem's value. Was the career's Growth rank; kept in
   * the struct because "how fast the decision stream runs" is a lever several
   * round-1 engines will want, and a prototype that wants it should not have to
   * re-thread a second stat source through the world. */
  xpGainMul: number;
  /** Extra emissions per trigger on every weapon that emits a countable thing.
   * Read by RunWorld.fanAround for the fanned weapons, and directly by
   * Railshot, which emits rails rather than world projectiles. Weapons that
   * emit one continuous shape — the Kick's strike, the Chord's zone, the Clap's
   * flash (and Nova's fixed ring of shards), Subquake's ring — deliberately
   * ignore it. */
  extraProjectiles: number;
}

/** The base every run starts from: a build that modifies nothing. Weapons at
 *  their authored tier numbers, and no stat layer on top. */
export function neutralBuildMods(): BuildMods {
  return {
    moveMul: 1,
    projectileSpeedMul: 1,
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
    xpGainMul: 1,
    extraProjectiles: 0,
  };
}

const EVOLUTION_IDS = [
  'redlineStomp',
  'railshot',
  'prismRain',
  'subquake',
  'afterhours',
  'neonSerpent',
  'nova',
  'eventHorizon',
] as const;

type EvolutionId = (typeof EVOLUTION_IDS)[number];

export interface EvolutionDefinition {
  id: EvolutionId;
  role: Role;
  name: string;
  color: number;
  description: string;
  signature: string;
  gainDb: number;
}

const EVOLUTIONS: Record<EvolutionId, EvolutionDefinition> = {
  redlineStomp: {
    id: 'redlineStomp', role: 'kick', name: 'Redline Stomp', color: 0xff8a55, gainDb: 0,
    description: 'Four floor strips cross through the entire crowd in one colossal stomp.', signature: 'four-way cross',
  },
  railshot: {
    id: 'railshot', role: 'snare', name: 'Railshot', color: 0xffdf72, gainDb: 0,
    description: 'An instant 900-range beam with infinite pierce; every fourth hit fires twin rails.', signature: 'infinite rail beam',
  },
  prismRain: {
    id: 'prismRain', role: 'hat', name: 'Strobe Lane', color: 0x6febff, gainDb: -3,
    description: 'A barrage of chips rails toward the nearest enemy, each popping in a small blast where it lands.', signature: 'auto-aimed blast lane',
  },
  subquake: {
    id: 'subquake', role: 'bass', name: 'Subquake', color: 0xbb91ff, gainDb: 0,
    description: 'The directional wave becomes an expanding, infinite-pierce seismic ring.', signature: 'expanding quake ring',
  },
  afterhours: {
    id: 'afterhours', role: 'chord', name: 'Afterhours', color: 0x76ff92, gainDb: 0,
    description: 'Big zones of one fixed size that prowl the field, each hunting the nearest body it does not already cover.', signature: 'prowling zone',
  },
  neonSerpent: {
    id: 'neonSerpent', role: 'lead', name: 'Neon Serpent', color: 0xff70d4, gainDb: -1.5,
    description: 'A sharp serpent leaps deep through a file of enemies and grows a giant head every fifth trigger.', signature: 'retargeting serpent',
  },
  nova: {
    id: 'nova', role: 'clap', name: 'Nova', color: 0xff719f, gainDb: 0,
    description: 'A bigger flash clears the ring, then a full circle of shards is flung outward across the arena.', signature: 'shatter nova',
  },
  eventHorizon: {
    id: 'eventHorizon', role: 'arp', name: 'Event Horizon', color: 0x5effd8, gainDb: 0,
    description: 'Counter-rotating pairs breathe around you as a dense orbiting crown.', signature: 'counter-orbiting crown',
  },
};

export const EVOLUTION_BY_ROLE: Partial<Record<Role, EvolutionDefinition>> = Object.fromEntries(
  Object.values(EVOLUTIONS).map((evolution) => [evolution.role, evolution]),
) as Partial<Record<Role, EvolutionDefinition>>;

/** THE EVOLUTION GATE, in one expression: the weapon at max level. Nothing
 *  else.
 *
 *  The old recipe also asked for the paired passive at any level (Vampire
 *  Survivors' classic rule, adopted in #227). #265 cut passives, so the gate
 *  was re-gated on the weapon ladder alone rather than replaced with a new
 *  ingredient — #256's ruling, on the grounds that the decision worth keeping
 *  is *which weapon you push to max under a build cap*, and that is entirely
 *  in the eight weapon levels.
 *
 *  The offer surface did not move: a ready evolution is still paid by the next
 *  chest, never by a level-up. Eligibility is a question asked at chest-open;
 *  there is no minimum-time rule and nothing here reads the clock. */
export function eligibleEvolutions(
  tiers: ReadonlyMap<Role, number>,
  evolved: ReadonlySet<Role>,
): EvolutionDefinition[] {
  const out: EvolutionDefinition[] = [];
  for (const [role, tier] of tiers) {
    const evolution = EVOLUTION_BY_ROLE[role];
    if (!evolution || evolved.has(role) || tier < WEAPON_MAX_LEVEL) continue;
    out.push(evolution);
  }
  return out;
}
