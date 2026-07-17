// Dependency-free integration checks for the systems added to the endless
// tour. Run with `npm run verify`; failures throw and produce a non-zero exit.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Role } from '../audio/kits';
import { AUDIO_SET_LIST } from '../audio/audio-sets';
import { AFTERHOURS_ROLES, AFTERHOURS_VARIANTS } from '../audio/kits/afterhours';
import { VOICE_MIX_GAIN } from '../audio/engine';
import { EVOLUTIONS, ITEM_IDS, deriveBuildMods, type ItemId } from './items';
import {
  CORE_ITEMS,
  CORE_VENUES,
  CORE_WEAPONS,
  MILESTONE_IDS,
  MetaStore,
  SHOP_OFFERS,
} from './meta';
import { ALL_ENEMY_KINDS, ENEMY_LABELS, WEAPONS, type EnemyKind } from './config';
import { rollOffers } from './picks';
import { RunWorld, type RunEvents } from './run';
import {
  SANDBOX_ENEMY_CATALOG,
  SANDBOX_EVOLUTION_CATALOG,
  SANDBOX_ITEM_CATALOG,
  SANDBOX_VENUE_CATALOG,
} from './sandbox';
import { endlessScale, VENUE_IDS, waveRecipe } from './tour';

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
assert.deepEqual(new Set(SANDBOX_ENEMY_CATALOG), new Set(ALL_ENEMY_KINDS),
  'the sandbox must expose every opening, endless, child, event, and boss enemy');
assert.deepEqual(new Set(SANDBOX_ITEM_CATALOG), new Set(ITEM_IDS),
  'the sandbox must expose every passive item');
assert.deepEqual(
  new Set(SANDBOX_EVOLUTION_CATALOG.map(({ role }) => role)),
  new Set(evolutionRoles),
  'the sandbox must expose every weapon evolution',
);
assert.deepEqual(new Set(SANDBOX_VENUE_CATALOG), new Set(VENUE_IDS),
  'the sandbox must expose every Infinite Night Tour venue');
assert.deepEqual(new Set(AFTERHOURS_ROLES), new Set(evolutionRoles),
  'the fresh audio kit must cover every live weapon');
assert.equal(
  Object.values(AFTERHOURS_VARIANTS).reduce((total, variants) => total + (variants?.length ?? 0), 0),
  12,
  'the fresh audio kit must expose every canonical chart variant',
);
assert.equal(VOICE_MIX_GAIN.hat, 0.708,
  'the dense hi-hat voice needs a calibrated cut after every palette swap');
assert((VOICE_MIX_GAIN.chord ?? 0) > 1 && (VOICE_MIX_GAIN.arp ?? 0) > 1,
  'chord and arp voices need calibrated lifts at the shared voice bus');
const hatDamageLadder = WEAPONS.hat!.map(({ damage }) => damage);
assert.deepEqual(hatDamageLadder, [2, 2, 2, 3]);
assert(hatDamageLadder.every((damage, index) => index === 0 || damage >= hatDamageLadder[index - 1]),
  'raising base hi-hat damage must never make a later tier a downgrade');
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
  notesCollected: 602,
  headlinersKilled: 2,
  evolutionsMade: 3,
  milestones: MILESTONE_IDS,
  venuesVisited: ['alley', 'warehouse'],
});
assert.equal(settlement.notesEarned, 602);
assert.equal(settlement.walletBefore, 0);
assert.equal(settlement.walletAfter, 602);
assert.deepEqual(meta.unlockedRoles(), new Set(CORE_WEAPONS),
  'run performance must not automatically unlock shop weapons');
assert.deepEqual(meta.unlockedItemIds(), new Set(CORE_ITEMS),
  'run performance must not automatically unlock shop passives');
assert.deepEqual(meta.unlockedVenueIds(), new Set(CORE_VENUES),
  'run performance must not automatically unlock shop venues');
assert.equal(settlement.collection.owned, 0);
assert.equal(settlement.collection.total, SHOP_OFFERS.length);
assert.equal(settlement.collection.complete, false);
const lockedArp = meta.shop().find(({ offer }) => offer.id === 'arp')!;
assert.equal(lockedArp.shelfLocked, true);
assert.equal(lockedArp.purchasesNeeded, 2);
assert.equal(lockedArp.affordable, true);
assert.equal(meta.purchase('arp'), false,
  'enough notes must not bypass a shop shelf requirement');
assert(meta.purchase('heavyAmp'));
assert(meta.unlockedItemIds().has('heavyAmp'));
assert(meta.purchase('clap'));
assert(meta.unlockedRoles().has('clap'));
assert.equal(meta.purchase('heavyAmp'), false, 'a shop purchase must be one-time');
assert.equal(meta.shop().find(({ offer }) => offer.id === 'arp')!.shelfLocked, false);
assert(meta.purchase('arp'));
assert(meta.unlockedRoles().has('arp'));
assert.equal(meta.state.notes, 412, 'shop costs must be deducted from the note wallet');
const roundTrippedMeta = new MetaStore(storage);
assert.equal(roundTrippedMeta.state.version, 2);
assert.equal(roundTrippedMeta.state.notes, 412, 'the v2 note wallet should round-trip');
assert.deepEqual(roundTrippedMeta.state.purchases, ['heavyAmp', 'clap', 'arp'],
  'shop purchases should round-trip in purchase order');
const repeatVenueSettlement = meta.settleRun({
  timeS: 0,
  level: 1,
  kills: 0,
  notesCollected: 0,
  headlinersKilled: 0,
  evolutionsMade: 0,
  milestones: [],
  venuesVisited: ['alley', 'warehouse'],
});
assert.deepEqual(repeatVenueSettlement.newVenues, [],
  'venue discovery should only be recorded on a career first visit');

const expectedEnemyLabels = {
  swarmer: 'Shardling',
  tank: 'Wallstack',
  darter: 'Needlejack',
  splitter: 'Crackbox',
  charger: 'Rail Ram',
  circler: 'Orbit Leech',
  shielded: 'Phase Guard',
  elite: 'Blackout Idol',
  bat: 'Static Mite',
  redBat: 'Flare Mite',
  redBat2: 'Night Mite',
  zombie: 'Cable Husk',
  skeleton: 'Jackwalker',
  ghost: 'Echo Shard',
  greenMudman: 'Moss Cabinet',
  grayMudman: 'Cracked Cabinet',
  flower: 'Mute Bloom',
  glowingBat: 'Signal Crown',
  mantis: 'The Shear',
  batSwarm: 'Static Rush',
} satisfies Record<EnemyKind, string>;
assert.deepEqual(ENEMY_LABELS, expectedEnemyLabels,
  'every simulation archetype needs its complete fresh player-facing identity');
assert.equal(new Set(Object.values(ENEMY_LABELS)).size, Object.keys(ENEMY_LABELS).length,
  'enemy display names should be unique');
assert.equal(
  Object.values(ENEMY_LABELS).some((label) => /\b(bat|zombie|skeleton|ghost|mudman|mantis)\b/i.test(label)),
  false,
  'the fresh roster must not leak an old fantasy enemy name',
);

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

const collectedNoteEvents: Array<[value: number, total: number]> = [];
const noteWorld = new RunWorld(
  { width: 1280, height: 720 },
  {
    ...events,
    onNoteCollected: (value, total) => collectedNoteEvents.push([value, total]),
  },
  { scripted: false, fx: false, rng: () => 0.99 },
);
for (let i = 0; i < 7; i++) noteWorld.spawnEnemyAt('bat', 80 + i * 20, 0);
noteWorld.killVisible();
assert.equal(noteWorld.musicNotes.length, 1,
  'ordinary enemies should guarantee a small music-note drop by the seventh dry kill');
assert.deepEqual(noteWorld.musicNotes[0].tier, 'note');
assert.equal(noteWorld.musicNotes[0].value, 1);
noteWorld.player.x = noteWorld.musicNotes[0].x;
noteWorld.player.y = noteWorld.musicNotes[0].y;
noteWorld.update(0);
assert.equal(noteWorld.notesCollected, 1);
assert.equal(noteWorld.musicNotes.length, 0);
assert.deepEqual(collectedNoteEvents, [[1, 1]],
  'walking onto a music note should collect it once and report the run total');

const hatWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
hatWorld.invincible = true;
hatWorld.addWeapon('hat', 1);
const weakestEnemy = hatWorld.spawnEnemyAt('bat', 80, 0)!;
assert.equal(weakestEnemy.hp, 1, 'the Static Mite fixture should remain the 1-HP baseline');
hatWorld.fireTrigger({ role: 'hat', time: 0, velocity: 1, step: 0, variant: 'closed' });
for (let i = 0; i < 60 && !weakestEnemy.dead; i++) hatWorld.update(1 / 120);
assert.equal(weakestEnemy.dead, true,
  'one base tier-I hi-hat trigger must be able to kill the weakest enemy');

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

console.log('systems-check: items, note shop, pickups, enemies, endless director, and evolutions passed');
