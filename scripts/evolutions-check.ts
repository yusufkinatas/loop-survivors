import assert from 'node:assert/strict';
import type { Role } from '../src/audio/kits';
import {
  EVOLUTIONS,
  EVOLUTION_BY_ROLE,
  EVOLUTION_IDS,
  GEARS,
  GEAR_BY_ROLE,
  GEAR_CAPACITY,
  GEAR_IDS,
  eligibleEvolutions,
  eligibleGear,
  type GearId,
} from '../src/game/evolutions';
import { rollOffers } from '../src/game/picks';
import { mulberry32 } from '../src/game/rng';
import { RunWorld } from '../src/game/run';

const liveRoles: Role[] = ['kick', 'snare', 'hat', 'arp', 'bass', 'chord', 'lead', 'clap', 'bell'];

assert.equal(GEAR_IDS.length, liveRoles.length);
assert.equal(EVOLUTION_IDS.length, liveRoles.length);
for (const role of liveRoles) {
  const gear = GEAR_BY_ROLE.get(role);
  const evolution = EVOLUTION_BY_ROLE.get(role);
  assert.ok(gear, `${role} has Gear`);
  assert.ok(evolution, `${role} has evolution`);
  assert.equal(evolution.gear, gear.id);
}
assert.equal(new Set(GEAR_IDS.map((id) => GEARS[id].role)).size, liveRoles.length);
assert.equal(new Set(EVOLUTION_IDS.map((id) => EVOLUTIONS[id].role)).size, liveRoles.length);

const kickII = new Map<Role, number>([['kick', 2]]);
assert.equal(eligibleGear(kickII, new Set(), 59.99).length, 0);
assert.deepEqual(eligibleGear(kickII, new Set(), 60).map(({ id }) => id), ['heavyBoots']);
assert.equal(eligibleGear(new Map([['kick', 1]]), new Set(), 60).length, 0);
assert.equal(eligibleGear(new Map(), new Set(), 60).length, 0);
assert.equal(
  eligibleGear(kickII, new Set<GearId>(['laserSight', 'needleCase', 'gyroscope', 'leadWeight']), 60).length,
  0,
);

for (let seed = 1; seed <= 64; seed++) {
  const offers = rollOffers(kickII, new Set(), mulberry32(seed), 60);
  assert.equal(offers.filter((offer) => offer.kind === 'gear').length, 1);
  const weaponRoles = offers
    .filter((offer) => offer.kind === 'weapon')
    .map((offer) => offer.role);
  assert.equal(new Set(weaponRoles).size, weaponRoles.length);
}

const nearlyComplete = new Map<Role, number>([
  ['kick', 3], ['snare', 4], ['hat', 4], ['arp', 4], ['bass', 4], ['chord', 4], ['lead', 4],
]);
const thinOffers = rollOffers(nearlyComplete, new Set(), mulberry32(42), 180);
assert.equal(thinOffers.filter((offer) => offer.kind === 'weapon').length, 1);
assert.equal(thinOffers.filter((offer) => offer.kind === 'gear').length, 2);
assert.equal(new Set(thinOffers.filter((offer) => offer.kind === 'gear').map((offer) => offer.gear)).size, 2);

const tiers = new Map<Role, number>();
const ownedGear = new Set<GearId>();
const evolved = new Set<Role>();
for (let count = 0; count <= 4; count++) {
  tiers.clear();
  ownedGear.clear();
  evolved.clear();
  for (let i = 0; i < count; i++) {
    const role = liveRoles[i];
    tiers.set(role, 4);
    ownedGear.add(GEAR_BY_ROLE.get(role)!.id);
  }
  assert.equal(eligibleEvolutions(tiers, ownedGear, evolved).length, count);
}
tiers.set('kick', 3);
assert.equal(eligibleEvolutions(tiers, ownedGear, evolved).some(({ role }) => role === 'kick'), false);
tiers.set('kick', 4);
ownedGear.delete('heavyBoots');
assert.equal(eligibleEvolutions(tiers, ownedGear, evolved).some(({ role }) => role === 'kick'), false);
ownedGear.add('heavyBoots');
evolved.add('kick');
assert.equal(eligibleEvolutions(tiers, ownedGear, evolved).some(({ role }) => role === 'kick'), false);

let chestCollections = 0;
const world = new RunWorld(
  { width: 800, height: 800 },
  {
    onLevelUp() {},
    onChestCollected() { chestCollections++; },
    onDeath() {},
    onVictory() {},
    onHit() {},
  },
  { scripted: false, fx: false, rng: mulberry32(7) },
);
const chest = world.spawnChest(100, 0);
world.update(1 / 60);
assert.equal(chestCollections, 0);
assert.equal(world.chests[0], chest);
assert.equal(chest.x, 100, 'chest is not magnetized');
world.player.x = 100;
world.update(1 / 60);
assert.equal(chestCollections, 1);
assert.equal(world.chests.length, 0);

assert.equal(GEAR_CAPACITY, 4);
console.log('evolution/gear Sub-phase A checks passed');

