// Canonical registry for the post-parity weapon-evolution feature. Gear is a
// silent, one-level passive build component; evolutions replace a tier-IV
// weapon in its existing band slot without creating a tier-V chart.

import type { Role } from '../audio/kits';

export const GEAR_CAPACITY = 4;
export const GEAR_OFFER_TIME_S = 60;

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

