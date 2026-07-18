// Dependency-free integration checks for the live endless game. Run with
// `npm run verify`; failures throw and produce a non-zero exit.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Role } from '../audio/kits';
import { AUDIO_SET_LIST } from '../audio/audio-sets';
import { AFTERHOURS_ROLES, AFTERHOURS_VARIANTS } from '../audio/kits/afterhours';
import { VOICE_MIX_GAIN } from '../audio/engine';
import {
  EVOLUTIONS,
  ITEM_IDS,
  ITEMS,
  deriveBuildMods,
  eligibleEvolutions,
  type ItemId,
} from './items';
import {
  CORE_ITEMS,
  CORE_WEAPONS,
  MILESTONE_IDS,
  MetaStore,
  SHOP_OFFERS,
} from './meta';
import {
  ALL_ENEMY_KINDS,
  ENEMY_LABELS,
  RUN,
  WEAPONS,
  type EnemyKind,
} from './config';
import { rollOffers } from './picks';
import { RunWorld, type RunEvents } from './run';
import {
  SANDBOX_ENEMY_CATALOG,
  SANDBOX_EVOLUTION_CATALOG,
  SANDBOX_ITEM_CATALOG,
  SANDBOX_WEAPON_CATALOG,
} from './sandbox';
import { endlessScale, waveRecipe } from './endless';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const silentEvents: RunEvents = {
  onLevelUp: () => undefined,
  onDeath: () => undefined,
  onVictory: () => undefined,
  onHit: () => undefined,
};

// Passive items remain meaningful at every tier and include the requested
// movement, projectile speed, pierce, bounce, damage, pickup, and regeneration
// axes. Recovery is intentionally the one standalone non-evolution passive.
const allItems = new Map<ItemId, number>(ITEM_IDS.map((id) => [id, 5]));
const mods = deriveBuildMods(allItems);
assert.equal(mods.moveMul, 1.2);
assert.equal(mods.projectileSpeedMul, 1.5);
assert.equal(mods.extraPierce, 3);
assert.equal(mods.bounceCount, 3);
assert.equal(mods.damageMul, 1.25);
assert.equal(mods.maxHpBonus, 40);
assert.equal(mods.armorBonus, 2);
assert.equal(mods.hpRegenPerSecond, 0.5);
for (const id of ITEM_IDS) {
  assert(ITEMS[id].description.length > 12, `${id} needs a one-line description`);
  assert.equal(ITEMS[id].levelLines.length, 5, `${id} needs five useful tiers`);
}
assert.equal(ITEMS.recoveryTape.evolutionPartner, undefined);

// Every live weapon has one unique ultimate evolution and every paired item is
// represented exactly once.
const evolutionRoles = Object.values(EVOLUTIONS).map(({ role }) => role);
assert.equal(new Set(evolutionRoles).size, 9);
assert.deepEqual(
  new Set(Object.values(EVOLUTIONS).map(({ item }) => item)),
  new Set(ITEM_IDS.filter((id) => ITEMS[id].evolutionPartner !== undefined)),
);

// Sandbox coverage is sourced from the production registries, so new content
// cannot silently disappear from the developer arena.
assert.deepEqual(new Set(SANDBOX_ENEMY_CATALOG), new Set(ALL_ENEMY_KINDS));
assert.deepEqual(new Set(SANDBOX_ITEM_CATALOG), new Set(ITEM_IDS));
assert.deepEqual(new Set(SANDBOX_WEAPON_CATALOG), new Set(evolutionRoles));
assert.deepEqual(
  new Set(SANDBOX_EVOLUTION_CATALOG.map(({ role }) => role)),
  new Set(evolutionRoles),
);

// Audio coverage and mix calibration remain intact after removing palette
// switching. An arpeggio is a rapid run of separate notes; its gain and the
// chord gain must stay above unity, while the dense hi-hat is restrained.
assert.deepEqual(new Set(AFTERHOURS_ROLES), new Set(evolutionRoles));
assert.equal(
  Object.values(AFTERHOURS_VARIANTS).reduce((total, variants) => total + (variants?.length ?? 0), 0),
  12,
);
assert.equal(VOICE_MIX_GAIN.hat, 0.708);
assert((VOICE_MIX_GAIN.chord ?? 0) > 1);
assert((VOICE_MIX_GAIN.arp ?? 0) > 1);
const hatDamage = WEAPONS.hat!.map(({ damage }) => damage);
assert.deepEqual(hatDamage, [2, 2, 2, 3]);
assert(hatDamage[0] >= 2, 'base hi-hat must kill the weakest 1 HP enemy');

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const paletteFiles = AUDIO_SET_LIST.flatMap((set) =>
  Object.values(set.samples).flatMap((samples) =>
    (samples ?? []).map((sample) => ({ set, sample })),
  ),
);
assert(paletteFiles.length >= 6, 'one complete six-file audio palette must ship');
for (const { set, sample } of paletteFiles) {
  const relative = `${set.sampleRoot}/${sample.file}`.replace(/^\//, 'public/');
  assert(existsSync(new URL(relative, `file://${repositoryRoot}/`)), `${set.name} is missing ${sample.file}`);
}

// Shop progression is player-directed. A run banks exactly the notes picked
// up; performance never auto-purchases content.
const storage = new MemoryStorage();
const meta = new MetaStore(storage);
assert.deepEqual(meta.state.unlockedWeapons, [...CORE_WEAPONS]);
assert.deepEqual(meta.state.unlockedItems, [...CORE_ITEMS]);
assert.equal(meta.collection().total, SHOP_OFFERS.length);
meta.grantNotes(500);
assert(meta.purchase('heavyAmp'));
assert(meta.purchase('recoveryTape'));
const purchasesBeforeRun = [...meta.state.purchases];
const settlement = meta.settleRun({
  timeS: 615,
  level: 20,
  kills: 800,
  notesCollected: 37,
  headlinersKilled: 2,
  evolutionsMade: 1,
  milestones: ['first5m', 'firstEvolution'],
  damageByRole: { kick: 12_000 },
  killsByRole: { kick: 250 },
  evolutionsByRole: { kick: 1 },
});
assert.equal(settlement.notesEarned, 37);
assert.deepEqual(meta.state.purchases, purchasesBeforeRun);
assert(MILESTONE_IDS.every((id) => typeof id === 'string'));

// Ordinary level rewards still roll real weapon/item/encore offers and never
// duplicate the same exact weapon in one choice set.
const offers = rollOffers({
  tiers: new Map<Role, number>(),
  items: new Map(),
  unlockedRoles: new Set(evolutionRoles),
  unlockedItems: new Set(ITEM_IDS),
  rng: (() => { let n = 0; return () => ((n++ * 0.37) % 1); })(),
  timeS: 60,
  level: 2,
  encore: { damagePct: 0, movePct: 0, areaPct: 0 },
});
assert(offers.length > 0 && offers.length <= 3);
const offeredWeapons = offers.filter((offer) => offer.kind === 'weapon').map((offer) => offer.role);
assert.equal(new Set(offeredWeapons).size, offeredWeapons.length);

// Endless scaling grows at every minute and never invalidates the enemy
// registry. Five-minute headliner beats survive as evolution delivery.
let previous = endlessScale(8);
for (let minute = 9; minute <= 180; minute++) {
  const next = endlessScale(minute);
  assert(next.hpMul >= previous.hpMul);
  assert(next.damageMul >= previous.damageMul);
  assert(next.speedMul >= previous.speedMul);
  const recipe = waveRecipe(minute);
  assert(recipe.pattern.length > 0);
  assert(recipe.pattern.every((kind) => ALL_ENEMY_KINDS.includes(kind)));
  if (minute % 5 === 0) assert(recipe.headlinerCount >= 1);
  previous = next;
}

// All twenty enemy kinds retain production spawn behavior and unique,
// player-facing Neon Crypt names.
assert.equal(ALL_ENEMY_KINDS.length, 20);
assert.equal(new Set(Object.values(ENEMY_LABELS)).size, ALL_ENEMY_KINDS.length);
const enemyWorld = new RunWorld({ width: 1280, height: 720 }, silentEvents, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
for (let i = 0; i < ALL_ENEMY_KINDS.length; i++) {
  const kind = ALL_ENEMY_KINDS[i] as EnemyKind;
  assert(enemyWorld.spawnEnemyAt(kind, 200 + i * 10, 100));
}
assert.equal(new Set(enemyWorld.enemies.map(({ kind }) => kind)).size, ALL_ENEMY_KINDS.length);

// Every maxed weapon+partner recipe becomes eligible, evolves once, and stays
// tied to its original role.
const evolutionWorld = new RunWorld({ width: 1280, height: 720 }, silentEvents, {
  scripted: false,
  fx: false,
});
for (const evolution of Object.values(EVOLUTIONS)) {
  evolutionWorld.addWeapon(evolution.role, 4);
  evolutionWorld.addItem(evolution.item, 5);
}
assert.equal(eligibleEvolutions(evolutionWorld.tiers, evolutionWorld.items, evolutionWorld.evolved).length, 9);
for (const evolution of Object.values(EVOLUTIONS)) {
  assert.equal(evolutionWorld.evolve(evolution.role)?.id, evolution.id);
}
assert.equal(evolutionWorld.evolved.size, 9);

// XP and music notes remain ordinary independent pickups.
let collectedNotes = 0;
const pickupWorld = new RunWorld(
  { width: 1280, height: 720 },
  { ...silentEvents, onNoteCollected: (value) => { collectedNotes += value; } },
  { scripted: false, fx: false },
);
pickupWorld.spawnGemAt(0, 0, 3);
pickupWorld.spawnMusicNoteAt(0, 0, 5);
pickupWorld.update(1 / 60);
assert.equal(pickupWorld.xp, 3);
assert.equal(collectedNotes, 5);
assert.equal(pickupWorld.notesCollected, 5);
assert.equal(RUN.maxGems, 400);

console.log('systems-check: items, shop, enemies, endless scaling, pickups, audio, and evolutions passed');
