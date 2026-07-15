// Canonical registry for the post-parity weapon-evolution feature. Gear is a
// silent, one-level passive build component; evolutions replace a tier-IV
// weapon in its existing band slot without creating a tier-V chart.

import type { Role } from '../audio/kits';

export const GEAR_CAPACITY = 4;
export const GEAR_OFFER_TIME_S = 60;

/** Locked gameplay numbers from the implementation handoff. Keeping these
 * beside the recipe registry prevents evolution-only tuning from leaking into
 * generic weapon config. */
export const GEAR_TUNING = {
  heavyBootsReachMul: 1.15,
  laserSightRangeMul: 1.25,
  laserSightSpeedMul: 1.25,
  needleCasePierceAdd: 1,
  gyroscopeSpeedMul: 1.25,
  leadWeightDamageMul: 1.15,
  leadWeightShoveMul: 1.2,
  hourglassLifetimeMul: 1.25,
  compassRangeMul: 1.35,
  boxingCloseRange: 140,
  boxingDamageMul: 1.2,
  boxingShoveMul: 1.3,
  prismDamageMul: 1.4,
  prismLifetimeMul: 1.2,
} as const;

export const EVOLUTION_TUNING = {
  dancefloor: { echoDamageMul: 0.6, strikeLifeS: 0.2, kickRehitS: 1.35 },
  deadCenter: { width: 16, bonusPerLesser: 0.15, bonusCap: 0.75, tracerS: 0.1 },
  needleStorm: { maxCuts: 8, cutExpiryS: 1.5, consumeMul: 1.5 },
  orrery: {
    capPerRing: 6,
    innerStart: 82,
    outerStart: 126,
    innerMin: 66,
    innerMax: 106,
    outerMin: 110,
    outerMax: 158,
    noteRadiusStep: 8,
    minGap: 24,
    radiusMoveS: 0.12,
  },
  undertow: {
    shove: 14,
    wallSpeed: 150,
    wallLifeS: 1.5,
    wallThickness: 64,
    wallSpanMul: 1.5,
    rehitS: 0.45,
    damageMul: 0.65,
  },
  cathedral: { radiusMul: 0.72, offsetMul: 0.35, damageMul: 0.75, overlapSlowMul: 0.18 },
  headliner: {
    range: 900,
    dashS: 0.12,
    damageMul: 2,
    comboStep: 0.1,
    comboCap: 0.5,
  },
  standingOvation: {
    radius: 140,
    closeS: 0.12,
    releaseAtS: 0.2,
    endS: 0.28,
    corridorWidth: 48,
    damageMul: 1.75,
    stunS: 0.35,
    throwDist: 32,
  },
  glassChoir: {
    preferredMinRange: 180,
    clusterRadius: 120,
    assignmentRadius: 180,
    shards: 8,
  },
} as const;

export type GearId =
  | 'heavyBoots'
  | 'laserSight'
  | 'needleCase'
  | 'gyroscope'
  | 'leadWeight'
  | 'hourglass'
  | 'compass'
  | 'boxingGloves'
  | 'prism';

export type EvolutionId =
  | 'dancefloor'
  | 'deadCenter'
  | 'needleStorm'
  | 'orrery'
  | 'undertow'
  | 'cathedral'
  | 'headliner'
  | 'standingOvation'
  | 'glassChoir';

export interface GearConf {
  id: GearId;
  role: Role;
  name: string;
  color: number;
  pickLine: string;
  rackLine: string;
}

export interface EvolutionConf {
  id: EvolutionId;
  role: Role;
  name: string;
  gear: GearId;
  color: number;
  fantasy: string;
  pickLine: string;
}

export const GEAR_IDS: readonly GearId[] = [
  'heavyBoots',
  'laserSight',
  'needleCase',
  'gyroscope',
  'leadWeight',
  'hourglass',
  'compass',
  'boxingGloves',
  'prism',
];

export const EVOLUTION_IDS: readonly EvolutionId[] = [
  'dancefloor',
  'deadCenter',
  'needleStorm',
  'orrery',
  'undertow',
  'cathedral',
  'headliner',
  'standingOvation',
  'glassChoir',
];

export const GEARS: Record<GearId, GearConf> = {
  heavyBoots: {
    id: 'heavyBoots', role: 'kick', name: 'Heavy Boots', color: 0xff5a3c,
    pickLine: 'Pairs with Kick · player attacks reach +15%',
    rackLine: 'Player-anchored attacks reach 15% farther.',
  },
  laserSight: {
    id: 'laserSight', role: 'snare', name: 'Laser Sight', color: 0xffc93c,
    pickLine: 'Pairs with Snare · aimed shots farther + faster',
    rackLine: 'Aimed shots acquire 25% farther away and travel 25% faster.',
  },
  needleCase: {
    id: 'needleCase', role: 'hat', name: 'Needle Case', color: 0x3ce0ff,
    pickLine: 'Pairs with Hi-Hat · shots pass through +1',
    rackLine: 'Finite-pierce projectiles pass through one more enemy.',
  },
  gyroscope: {
    id: 'gyroscope', role: 'arp', name: 'Gyroscope', color: 0x33e6c2,
    pickLine: 'Pairs with Arp · orbit + homing turn faster',
    rackLine: 'Orbiters rotate and homing shots turn 25% faster.',
  },
  leadWeight: {
    id: 'leadWeight', role: 'bass', name: 'Lead Weight', color: 0xa06bff,
    pickLine: 'Pairs with Bass · damage +15% · shove +20%',
    rackLine: 'Weapon damage +15%; attacks that already push shove +20%.',
  },
  hourglass: {
    id: 'hourglass', role: 'chord', name: 'Hourglass', color: 0x4dff88,
    pickLine: 'Pairs with Chord · lasting attacks +25%',
    rackLine: 'Persistent weapon entities last 25% longer.',
  },
  compass: {
    id: 'compass', role: 'lead', name: 'Compass', color: 0xff6bd6,
    pickLine: 'Pairs with Lead · homing range +35%',
    rackLine: 'Homing attacks search 35% farther and avoid claimed targets.',
  },
  boxingGloves: {
    id: 'boxingGloves', role: 'clap', name: 'Boxing Gloves', color: 0xff4f7d,
    pickLine: 'Pairs with Clap · nearby damage + shove',
    rackLine: 'Nearby hits deal 20% more damage and shove 30% farther.',
  },
  prism: {
    id: 'prism', role: 'bell', name: 'Prism', color: 0xffd76b,
    pickLine: 'Pairs with Bell · shards stronger + longer',
    rackLine: 'Secondary projectiles deal 40% more damage and live 20% longer.',
  },
};

export const EVOLUTIONS: Record<EvolutionId, EvolutionConf> = {
  dancefloor: {
    id: 'dancefloor', role: 'kick', name: 'Dancefloor', gear: 'heavyBoots', color: 0xff5a3c,
    fantasy: 'Every fourth beat repeats the places you stamped during the bar.',
    pickLine: 'Beat 4 repeats your last four Kick positions',
  },
  deadCenter: {
    id: 'deadCenter', role: 'snare', name: 'Dead Center', gear: 'laserSight', color: 0xffc93c,
    fantasy: 'Crowds lined up before a tough target charge one perfect shot.',
    pickLine: 'Crowds charge one stronger elite shot',
  },
  needleStorm: {
    id: 'needleStorm', role: 'hat', name: 'Needle Storm', gear: 'needleCase', color: 0x3ce0ff,
    fantasy: 'Closed ticks build cuts and each bright open hit consumes them.',
    pickLine: 'Closed hits build Cuts · open hits consume them',
  },
  orrery: {
    id: 'orrery', role: 'arp', name: 'Orrery', gear: 'gyroscope', color: 0x33e6c2,
    fantasy: 'Two orbiting rings open and close as the notes rise and fall.',
    pickLine: 'Two rings open and close with the notes',
  },
  undertow: {
    id: 'undertow', role: 'bass', name: 'Undertow', gear: 'leadWeight', color: 0xa06bff,
    fantasy: 'Every wave pushes and the pattern ending carries a moving wall.',
    pickLine: "Waves push · the pattern's last note carries a wall",
  },
  cathedral: {
    id: 'cathedral', role: 'chord', name: 'Cathedral', gear: 'hourglass', color: 0x4dff88,
    fantasy: 'Every chord creates three overlapping rooms that trap the horde.',
    pickLine: 'Every Chord creates three overlapping slow zones',
  },
  headliner: {
    id: 'headliner', role: 'lead', name: 'Headliner', gear: 'compass', color: 0xff6bd6,
    fantasy: 'One soloist dashes between different enemies with every note.',
    pickLine: 'One soloist dashes between different enemies',
  },
  standingOvation: {
    id: 'standingOvation', role: 'clap', name: 'Standing Ovation', gear: 'boxingGloves', color: 0xff4f7d,
    fantasy: 'Two palms crush, stun, and throw back everything nearby.',
    pickLine: 'Two palms crush, stun, and throw nearby enemies',
  },
  glassChoir: {
    id: 'glassChoir', role: 'bell', name: 'Glass Choir', gear: 'prism', color: 0xffd76b,
    fantasy: 'One bell breaks into glass reflections that seek separate enemies.',
    pickLine: 'Bell shards curve toward different enemies',
  },
};

export const GEAR_BY_ROLE: ReadonlyMap<Role, GearConf> = new Map(
  GEAR_IDS.map((id) => [GEARS[id].role, GEARS[id]]),
);

export const EVOLUTION_BY_ROLE: ReadonlyMap<Role, EvolutionConf> = new Map(
  EVOLUTION_IDS.map((id) => [EVOLUTIONS[id].role, EVOLUTIONS[id]]),
);

export function eligibleGear(
  tiers: ReadonlyMap<Role, number>,
  owned: ReadonlySet<GearId>,
  timeS: number,
  capacity = GEAR_CAPACITY,
): GearConf[] {
  if (timeS < GEAR_OFFER_TIME_S || owned.size >= capacity) return [];
  return GEAR_IDS.map((id) => GEARS[id]).filter(
    (gear) => !owned.has(gear.id) && (tiers.get(gear.role) ?? 0) >= 2,
  );
}

export function canOwnGear(
  gear: GearId,
  tiers: ReadonlyMap<Role, number>,
  owned: ReadonlySet<GearId>,
  timeS: number,
  capacity = GEAR_CAPACITY,
): boolean {
  return eligibleGear(tiers, owned, timeS, capacity).some((candidate) => candidate.id === gear);
}

export function canEvolve(
  role: Role,
  tiers: ReadonlyMap<Role, number>,
  gear: ReadonlySet<GearId>,
  evolved: ReadonlySet<Role>,
): boolean {
  const conf = EVOLUTION_BY_ROLE.get(role);
  return !!conf && tiers.get(role) === 4 && gear.has(conf.gear) && !evolved.has(role);
}

export function eligibleEvolutions(
  tiers: ReadonlyMap<Role, number>,
  gear: ReadonlySet<GearId>,
  evolved: ReadonlySet<Role>,
): EvolutionConf[] {
  return EVOLUTION_IDS.map((id) => EVOLUTIONS[id]).filter((conf) =>
    canEvolve(conf.role, tiers, gear, evolved),
  );
}
