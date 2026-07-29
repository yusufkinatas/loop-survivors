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
  // The palette's eleven (#273). Eight of nineteen weapons could transform and
  // eleven dead-ended, which made "push an evolvable weapon" the right play for
  // a reason that had nothing to do with the weapon — and quietly steered every
  // round-1 build back onto the original eight voices, under-testing the eleven
  // #266 had just built. Symmetry was the fix; the designer chose to reach it by
  // BUILDING rather than by cutting the eight.
  'standingWave',
  'walkingLine',
  'feedbackLoop',
  'nightbloom',
  'wallOfSound',
  'windmill',
  'peal',
  'vortex',
  'rattlebox',
  'tide',
  'slipstream',
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

  // ---- The palette's eleven (#273) ----------------------------------------
  //
  // EACH ONE CLAIMS A SHAPE FAMILY NOTHING ELSE OWNS. With eight evolutions and
  // nineteen base weapons already on the field, "a bigger version of itself" was
  // never going to clear #255's floor rule — you can always tell which one just
  // fired. So every entry below is a different KIND of thing rather than a
  // different size of one: a wave that comes back, a shot that hits on the beat,
  // fields that wire themselves together, an arrival that splits, ground you
  // hold, a blade that turns, strikes that arrive in sequence, a spiral, a
  // ricochet, a field that breathes, and a wake you leave behind.
  //
  // AND EACH IS LED BY THE SOUND, per #266's rule: the transformation is the
  // instrument's own gesture taken further, not a gameplay idea handed a voice.
  //
  // `gainDb` trims the four whose evolved timbre lands on a voice that is either
  // continuous or very dense (see the role tables in audio/engine.ts). The other
  // seven need no trim: an evolution adds GEOMETRY, and geometry makes no sound
  // — the chart is untouched, so none of these adds a single trigger.
  standingWave: {
    id: 'standingWave', role: 'sub', name: 'Standing Wave', color: 0xb79eff, gainDb: -1.5,
    description: 'The pressure front reaches its limit, turns, and sweeps back through the same ground — the return pass drags bodies inward.', signature: 'reflected front',
  },
  walkingLine: {
    id: 'walkingLine', role: 'upright', name: 'Walking Line', color: 0xe8a878, gainDb: 0,
    description: 'The snaking shot lands a hit every time it crosses its own aim line, so it stamps the beat down the whole of its path.', signature: 'a hit per beat',
  },
  feedbackLoop: {
    id: 'feedbackLoop', role: 'drone', name: 'Feedback Loop', color: 0x7a6bd0, gainDb: -1.5,
    description: 'Planted fields wire themselves together, and the cables between them cut anything that crosses.', signature: 'wired fields',
  },
  nightbloom: {
    id: 'nightbloom', role: 'rhodes', name: 'Nightbloom', color: 0x8ee2ff, gainDb: 0,
    description: 'An orb that arrives opens into three smaller ones that drift on and bloom again where they land.', signature: 'splitting bloom',
  },
  wallOfSound: {
    id: 'wallOfSound', role: 'organ', name: 'Wall of Sound', color: 0xffcb7a, gainDb: 0,
    description: 'The beam turns ninety degrees and stands: a long bar across the ground ahead of you, holding for seconds.', signature: 'standing barrier',
  },
  windmill: {
    id: 'windmill', role: 'chank', name: 'Windmill', color: 0xbde06f, gainDb: 0,
    description: 'A double blade through you instead of a chop beside you, stepping around a full turn as you play.', signature: 'turning double blade',
  },
  peal: {
    id: 'peal', role: 'bell', name: 'Peal', color: 0xfff2b0, gainDb: 0,
    description: 'One trigger marks a run of strikes marching away from you, landing one after another, the last the heaviest.', signature: 'marching strikes',
  },
  vortex: {
    id: 'vortex', role: 'flute', name: 'Vortex', color: 0xc4d3ff, gainDb: 0,
    description: 'The curve keeps tightening, so the shot flies out wide and then winds inward, closing a spiral through the crowd.', signature: 'inward spiral',
  },
  rattlebox: {
    id: 'rattlebox', role: 'shaker', name: 'Rattlebox', color: 0xa6f0e4, gainDb: -1.5,
    description: 'The grains stop expiring and start ricocheting, rattling off the walls of the arena until they are spent.', signature: 'ricocheting grains',
  },
  tide: {
    id: 'tide', role: 'pad', name: 'Tide', color: 0xded2ff, gainDb: 0,
    description: 'The field breathes on the pulse, at its widest and fiercest on the crest of every swell.', signature: 'breathing field',
  },
  slipstream: {
    id: 'slipstream', role: 'air', name: 'Slipstream', color: 0xe6ecf5, gainDb: -1.5,
    description: 'The field sheds a fading wake, so everywhere you have just walked keeps hissing behind you.', signature: 'a wake you leave',
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
