// Dependency-free integration checks for the systems added to the endless
// tour. Run with `npm run verify`; failures throw and produce a non-zero exit.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Role } from '../audio/kits';
import { AUDIO_SET_LIST } from '../audio/audio-sets';
import { AFTERHOURS_ROLES, AFTERHOURS_VARIANTS } from '../audio/kits/afterhours';
import { EVOLUTIONS, ITEM_IDS, deriveBuildMods, type ItemId } from './items';
import {
  MAX_TOUR_RANK,
  MILESTONE_IDS,
  MetaStore,
  rankForReputation,
  rankProgress,
  reputationAtRank,
} from './meta';
import { rollOffers } from './picks';
import { RunWorld, type RunEvents } from './run';
import { endlessScale, waveRecipe } from './tour';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const allItems = new Map<ItemId, number>(ITEM_IDS.map((id) => [id, 5]));
const mods = deriveBuildMods(allItems);
assert.equal(mods.moveMul, 1.2);
assert.equal(mods.projectileSpeedMul, 1.5);
assert.equal(mods.extraPierce, 3);
assert.equal(mods.bounceCount, 3);
assert.equal(mods.damageMul, 1.25);
assert.equal(mods.maxHpBonus, 40);
assert.equal(mods.armorBonus, 2);

const evolutionRoles = Object.values(EVOLUTIONS).map(({ role }) => role);
assert.equal(new Set(evolutionRoles).size, 9, 'every evolution must have a unique weapon');
assert.equal(new Set(Object.values(EVOLUTIONS).map(({ item }) => item)).size, 9,
  'every passive should complete one evolution recipe');
assert.deepEqual(new Set(AFTERHOURS_ROLES), new Set(evolutionRoles),
  'the fresh audio kit must cover every live weapon');
assert.equal(
  Object.values(AFTERHOURS_VARIANTS).reduce((total, variants) => total + (variants?.length ?? 0), 0),
  12,
  'the fresh audio kit must expose every canonical chart variant',
);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const paletteFiles = AUDIO_SET_LIST.flatMap((set) =>
  Object.values(set.samples).flatMap((specs) =>
    (specs ?? []).map((spec) => ({ set, spec })),
  ),
);
assert.equal(paletteFiles.length, 18, 'three complete six-file house palettes must ship');
for (const { set, spec } of paletteFiles) {
  const relativePath = `${set.sampleRoot}/${spec.file}`.replace(/^\//, 'public/');
  assert(existsSync(new URL(relativePath, `file://${repositoryRoot}/`)),
    `${set.name} is missing ${spec.file}`);
}

const storage = new MemoryStorage();
const meta = new MetaStore(storage);
const settlement = meta.settleRun({
  timeS: 360,
  level: 12,
  kills: 400,
  headlinersKilled: 2,
  evolutionsMade: 3,
  milestones: MILESTONE_IDS,
  venuesVisited: ['alley', 'warehouse'],
});
assert.equal(settlement.breakdown.level, 22);
assert.equal(settlement.breakdown.newVenues, 50);
assert.equal(settlement.breakdown.total, 602);
assert.equal(settlement.rankAfter, 5);
assert(meta.unlockedRoles().has('clap'));
assert(meta.unlockedRoles().has('arp'));
assert(meta.unlockedItemIds().has('heavyAmp'));
assert.equal(new MetaStore(storage).state.reputation, 602, 'career save should round-trip');
const repeatVenueSettlement = meta.settleRun({
  timeS: 0,
  level: 1,
  kills: 0,
  headlinersKilled: 0,
  evolutionsMade: 0,
  milestones: [],
  venuesVisited: ['alley', 'warehouse'],
});
assert.equal(repeatVenueSettlement.breakdown.newVenues, 0,
  'venue reputation should only pay on a career first visit');
for (let rank = 1; rank <= MAX_TOUR_RANK; rank++) {
  assert.equal(rankForReputation(reputationAtRank(rank)), rank);
}
assert.equal(rankForReputation(Number.MAX_SAFE_INTEGER), MAX_TOUR_RANK,
  'career display must stop at the authored rank-15 finale');
assert.deepEqual(rankProgress(Number.MAX_SAFE_INTEGER), {
  rank: MAX_TOUR_RANK,
  maxed: true,
  earnedIntoRank: 0,
  costToNext: 0,
  remaining: 0,
  ratio: 1,
  nextRewards: [],
});

const maxTiers = new Map<Role, number>(evolutionRoles.map((role) => [role, 4]));
const encoreOffers = rollOffers({
  tiers: maxTiers,
  items: allItems,
  unlockedRoles: new Set(evolutionRoles),
  unlockedItems: new Set(ITEM_IDS),
  rng: () => 0.5,
  timeS: 3_600,
  level: 99,
  encore: { damagePct: 20, movePct: 10, areaPct: 15 },
});
assert.deepEqual(encoreOffers, [{ kind: 'encore', encore: 'heal', amount: 15, cap: null }]);

let victories = 0;
let minuteSeen = -1;
const events: RunEvents = {
  onLevelUp: () => undefined,
  onDeath: () => assert.fail('invincible simulation died'),
  onVictory: () => { victories += 1; },
  onHit: () => undefined,
  onMinute: (minute) => { minuteSeen = minute; },
};
const world = new RunWorld({ width: 1280, height: 720 }, events, {
  rng: () => 0.5,
  fx: false,
});
world.invincible = true;
world.timeS = 479.99;
world.update(0.02);
assert.equal(victories, 0, 'minute eight must not end an endless run');
assert.equal(minuteSeen, 8);
assert(world.enemyCount > 0, 'the endless director should take over at minute eight');
assert(world.enemies.every((enemy) => enemy.spawnMinute === 8));
world.update(0.6);
assert(world.enemyCount >= waveRecipe(8).minimum,
  'the endless director should backfill its live population floor');

const headlinerWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  rng: () => 0.5,
  fx: false,
});
headlinerWorld.invincible = true;
headlinerWorld.timeS = 599.99;
headlinerWorld.update(0.02);
assert(headlinerWorld.enemies.some((enemy) => enemy.headliner),
  'five-minute tour marks should spawn a Headliner');

assert(waveRecipe(15).pattern.length > waveRecipe(14).pattern.length,
  'late endless rows should combine adjacent enemy families');
assert(endlessScale(120).hpMul > endlessScale(60).hpMul);
assert(endlessScale(120).damageMul > endlessScale(60).damageMul);
assert.equal(endlessScale(120).speedMul, 1.3, 'enemy speed must retain its clarity cap');

const evolutionWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  rng: () => 0.5,
});
evolutionWorld.invincible = true;
for (const [role] of maxTiers) evolutionWorld.addWeapon(role, 4);
for (const [item] of allItems) evolutionWorld.addItem(item, 5);
assert.equal(evolutionWorld.eligibleEvolutions().length, 9);
for (const role of evolutionRoles) assert(evolutionWorld.evolve(role));
assert.equal(evolutionWorld.evolutionsMade, 9);
assert.equal(evolutionWorld.eligibleEvolutions().length, 0);

evolutionWorld.spawnEnemyAt('tank', 100, 0);
for (const role of evolutionRoles) {
  evolutionWorld.fireTrigger({ role, time: 0, velocity: 1, step: 0, variant: role === 'bass' ? 'fat' : undefined });
}
evolutionWorld.update(1 / 60);
const evolvedOutputCount = evolutionWorld.projectiles.length + evolutionWorld.zones.length +
  evolutionWorld.shockwaves.length + evolutionWorld.gravityWells.length + (evolutionWorld.fx?.length ?? 0);
assert(evolvedOutputCount > evolutionRoles.length,
  'evolved triggers should create their expanded gameplay and visual patterns');

const healWorld = new RunWorld({ width: 1280, height: 720 }, events, { fx: false });
healWorld.player.hp = 1;
healWorld.applyEncoreChoice('heal');
assert.equal(healWorld.player.hp, 16, 'Encore healing should grant exactly 15 HP');

const goldWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  fx: false,
  headlinerGold: true,
});
assert.equal(goldWorld.headlinerGold, true, 'the final career cosmetic must reach the live world');

const gateWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
  unlockedVenues: ['alley', 'warehouse', 'rooftop'],
});
gateWorld.invincible = true;
gateWorld.timeS = 279.99;
gateWorld.update(0.02);
assert.equal(gateWorld.venueGates.length, 2);
assert(gateWorld.venueGates.every(({ venue }) => venue !== gateWorld.venue),
  'a tour gate must never offer the current venue');
const firstGate = gateWorld.venueGates[0];
gateWorld.player.x = firstGate.x;
gateWorld.player.y = firstGate.y;
gateWorld.update(0.01);
gateWorld.timeS = 299.99;
gateWorld.update(0.02);
assert.equal(gateWorld.venue, firstGate.venue);
assert(gateWorld.venuesVisited.has(firstGate.venue));
gateWorld.timeS = 579.99;
gateWorld.update(0.02);
assert(gateWorld.venueGates.every(({ venue }) => venue !== gateWorld.venue),
  'later gates must still exclude the current venue');
assert(!gateWorld.venuesVisited.has(gateWorld.venueGates[0].venue),
  'unvisited venues should sort before revisits');

const railWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
railWorld.timeS = 49.99;
railWorld.update(0.02);
railWorld.timeS = 55.99;
railWorld.update(0.02);
assert.equal(railWorld.neonRail?.phase, 'preview');
assert.equal(railWorld.neonRail?.points.length, 2);
assert.equal(Math.hypot(
  railWorld.neonRail!.points[1].x - railWorld.neonRail!.points[0].x,
  railWorld.neonRail!.points[1].y - railWorld.neonRail!.points[0].y,
), 120, 'a stationary Neon Loop should fall back to a visible 120-unit rail');

function enemyTravel(venue: 'warehouse' | 'alley'): number {
  const probe = new RunWorld({ width: 1280, height: 720 }, events, {
    scripted: false,
    fx: false,
    rng: () => 0.5,
  });
  probe.invincible = true;
  probe.venue = venue;
  const enemy = probe.spawnEnemyAt('zombie', 500, 0)!;
  const start = enemy.x;
  probe.update(0.1);
  return start - enemy.x;
}
const warehouseTravel = enemyTravel('warehouse');
const alleyTravel = enemyTravel('alley');
assert(Math.abs(alleyTravel / warehouseTravel - 1.12) < 0.01,
  'venue speed danger should be applied live to the existing crowd');

const pressureWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
pressureWorld.invincible = true;
pressureWorld.addWeapon('kick', 4);
pressureWorld.pressureState = 'cooldown';
pressureWorld.pressureCooldownT = 45;
pressureWorld.pressureHeat = 0;
pressureWorld.spawnEnemyAt('bat', 25, 0);
pressureWorld.fireTrigger({ role: 'kick', time: 0, velocity: 1, step: 0 });
pressureWorld.update(1 / 60);
assert.equal(pressureWorld.pressureHeat, 0,
  'close kills must not recharge Pressure Break during cooldown');
pressureWorld.pressureState = 'break';
pressureWorld.addWeapon('snare', 1);
pressureWorld.fireTrigger({ role: 'snare', time: 2, velocity: 0.9, step: 4 });
assert.equal(pressureWorld.projectiles.length, 0,
  'Pressure Break should bank gameplay before its release');
const pressureRelease = pressureWorld.releasePressureBreak();
assert.equal(pressureRelease.length, 1);
assert.deepEqual(pressureRelease[0], {
  trigger: { role: 'snare', time: 2, velocity: 0.9, step: 4 },
  power: 1,
});
assert.equal(pressureWorld.projectiles.length, 1,
  'the returned audio replay metadata must accompany one released gameplay attack');

const redlineWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
redlineWorld.addWeapon('kick', 4);
redlineWorld.addItem('highTops', 5);
assert(redlineWorld.evolve('kick'));
const farHorizontal = redlineWorld.spawnEnemyAt('bat', redlineWorld.worldW * 0.48, 0)!;
const farVertical = redlineWorld.spawnEnemyAt('bat', 0, redlineWorld.worldH * 0.48)!;
redlineWorld.fireTrigger({ role: 'kick', time: 0, velocity: 1, step: 0 });
assert(farHorizontal.dead && farVertical.dead,
  'Redline Stomp should cross the complete visible arena');

const ovationWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
ovationWorld.addWeapon('clap', 4);
ovationWorld.addItem('paddedJacket', 5);
assert(ovationWorld.evolve('clap'));
const cornerEnemy = ovationWorld.spawnEnemyAt(
  'bat',
  ovationWorld.worldW * 0.45,
  ovationWorld.worldH * 0.45,
)!;
ovationWorld.update(0);
const cornerHpBefore = cornerEnemy.hp;
ovationWorld.fireTrigger({ role: 'clap', time: 0, velocity: 1, step: 0 });
assert(cornerEnemy.hp < cornerHpBefore, 'Standing Ovation should reach the visible arena corners');

console.log('systems-check: items, meta, offers, endless director, and all evolutions passed');
