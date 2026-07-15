import assert from 'node:assert/strict';
import type { Role } from '../src/audio/kits';
import {
  GEAR_BY_ROLE,
  GEAR_CAPACITY,
  eligibleEvolutions,
  type GearId,
} from '../src/game/evolutions';
import { rollOffers, type PickOption } from '../src/game/picks';
import { PendingRewardQueue, rewardChoiceAngles } from '../src/game/rewards';
import { mulberry32 } from '../src/game/rng';

// Same-frame rewards keep insertion order. A chest never jumps an earlier XP
// reward, and a later level never gets lost behind it.
const queue = new PendingRewardQueue();
queue.enqueue({ kind: 'level', level: 2 });
queue.enqueue({ kind: 'chest' });
queue.enqueue({ kind: 'level', level: 3 });
assert.deepEqual(
  [queue.dequeue(), queue.dequeue(), queue.dequeue()],
  [{ kind: 'level', level: 2 }, { kind: 'chest' }, { kind: 'level', level: 3 }],
);
assert.equal(queue.dequeue(), undefined);
queue.enqueue({ kind: 'chest' });
queue.clear();
assert.equal(queue.length, 0);

// Chest-choice geometry is exact at every supported eligible count. Zero has
// no token, one schedules directly, and normal two-card offers keep the old
// triangle rather than borrowing the evolution layout.
assert.deepEqual(rewardChoiceAngles(0, true), []);
assert.deepEqual(rewardChoiceAngles(1, true), [0]);
assert.deepEqual(rewardChoiceAngles(2, true), [0, 180]);
assert.deepEqual(rewardChoiceAngles(3, true), [0, 120, 240]);
assert.deepEqual(rewardChoiceAngles(4, true), [0, 90, 180, 270]);
assert.deepEqual(rewardChoiceAngles(2, false), [0, 120]);

// Preparing 0–4 recipes yields exactly that many chest candidates. This is the
// pure conversion seam used when a queued chest reaches the front.
const liveRoles: Role[] = ['kick', 'snare', 'hat', 'arp', 'bass', 'chord', 'lead', 'clap', 'bell'];
for (let count = 0; count <= GEAR_CAPACITY; count++) {
  const tiers = new Map<Role, number>();
  const gear = new Set<GearId>();
  for (let index = 0; index < count; index++) {
    const role = liveRoles[index];
    tiers.set(role, 4);
    gear.add(GEAR_BY_ROLE.get(role)!.id);
  }
  assert.equal(eligibleEvolutions(tiers, gear, new Set()).length, count);
}

// Once a recipe piece is legal, a full offer reserves two weapon alternatives
// plus exactly one Gear card. Choosing Gear is a real opportunity cost: the
// paired weapon tier does not advance, and the Gear cannot appear again.
for (let seed = 1; seed <= 512; seed++) {
  const tiers = new Map<Role, number>([['kick', 2]]);
  const gear = new Set<GearId>();
  const offers = rollOffers(tiers, gear, mulberry32(seed), 60);
  assert.equal(offers.length, 3);
  assert.equal(offers.filter((offer) => offer.kind === 'weapon').length, 2);
  assert.deepEqual(
    offers.filter((offer) => offer.kind === 'gear').map((offer) => offer.gear),
    ['heavyBoots'],
  );

  const tierBefore = tiers.get('kick');
  gear.add('heavyBoots');
  assert.equal(tiers.get('kick'), tierBefore);
  const next = rollOffers(tiers, gear, mulberry32(seed), 61);
  assert.equal(next.some((offer) => offer.kind === 'gear' && offer.gear === 'heavyBoots'), false);
}

// The locked tier weighting must materially favor Gear paired with a completed
// weapon over Gear paired with a tier-II weapon.
const weightedTiers = new Map<Role, number>([['kick', 2], ['hat', 4]]);
let tierTwoGear = 0;
let tierFourGear = 0;
for (let seed = 1; seed <= 4_096; seed++) {
  const gearOffer = rollOffers(weightedTiers, new Set(), mulberry32(seed), 60)
    .find((offer) => offer.kind === 'gear');
  assert.ok(gearOffer);
  if (gearOffer.gear === 'heavyBoots') tierTwoGear++;
  if (gearOffer.gear === 'needleCase') tierFourGear++;
}
assert.ok(tierFourGear > tierTwoGear * 2, `${tierFourGear} should strongly exceed ${tierTwoGear}`);

// Offer-pressure audit only—not an automatic playtest or balance verdict.
// Starting from the real Kick-I build, a deliberate player takes Kick whenever
// offered, otherwise Heavy Boots, then another weapon. Across this fixed seed
// cohort, at least 90% prepare Dancefloor within twelve post-minute reward
// screens. The developer still owns whether twelve screens are realistically
// earned by 5:00 and whether the cost feels good in a live run.
function deliberateKickChoice(options: PickOption[], tiers: ReadonlyMap<Role, number>): PickOption | undefined {
  return options.find((option) => option.kind === 'weapon' && option.role === 'kick')
    ?? options.find((option) => option.kind === 'gear' && option.gear === 'heavyBoots')
    ?? options.find((option) => option.kind === 'weapon' && tiers.has(option.role))
    ?? options.find((option) => option.kind === 'weapon')
    ?? options[0];
}

const sampleCount = 4_096;
let prepared = 0;
for (let seed = 1; seed <= sampleCount; seed++) {
  const tiers = new Map<Role, number>([['kick', 1]]);
  const gear = new Set<GearId>();
  const rng = mulberry32(seed);
  for (let reward = 0; reward < 12; reward++) {
    const choice = deliberateKickChoice(rollOffers(tiers, gear, rng, 60 + reward), tiers);
    assert.ok(choice);
    if (choice.kind === 'weapon') tiers.set(choice.role, choice.tier);
    else gear.add(choice.gear);
  }
  if (tiers.get('kick') === 4 && gear.has('heavyBoots')) prepared++;
}
const preparednessRate = prepared / sampleCount;
assert.ok(preparednessRate >= 0.9, `Kick recipe preparedness ${(preparednessRate * 100).toFixed(1)}%`);

console.log(
  `evolution economy checks passed (Dancefloor prepared after 12 post-minute rewards: ${(preparednessRate * 100).toFixed(1)}%)`,
);
