// Dependency-free integration checks for the endless-run systems. Run with
// `npm run verify`; failures throw and produce a non-zero exit.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Role } from '../audio/kits';
import { AUDIO_SET_LIST } from '../audio/audio-sets';
import { AFTERHOURS_ROLES, AFTERHOURS_VARIANTS } from '../audio/kits/afterhours';
import {
  VOICE_MIX_GAIN,
  canDispatchPhraseBoundary,
  nextUnheardPhraseTime,
} from '../audio/engine';
import { EVOLUTIONS, ITEM_IDS, ITEMS, deriveBuildMods, itemMaxLevel, type ItemId } from './items';
import {
  CORE_ITEMS,
  CORE_WEAPONS,
  MILESTONE_IDS,
  MetaStore,
  SHOP_OFFERS,
} from './meta';
import { ALL_ENEMY_KINDS, ENEMY_LABELS, RUN, STAGE_MAGNET, WEAPONS, type EnemyKind } from './config';
import { rollOffers } from './picks';
import { RunWorld, type RunEvents } from './run';
import {
  SANDBOX_ENEMY_CATALOG,
  SANDBOX_EVOLUTION_CATALOG,
  SANDBOX_ITEM_CATALOG,
} from './sandbox';
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
assert.equal(mods.projectileSpeedMul, 2.0);
assert.equal(mods.extraPierce, 3);
assert.equal(mods.bounceCount, 3);
assert.equal(mods.damageMul, 1.25);
assert.equal(mods.maxHpBonus, 40);
assert.equal(mods.armorBonus, 2);
assert.equal(mods.hpRegenPerSecond, 0.5);
// Double Take stops at two levels, so the all-items-at-5 sweep clamps to 2.
assert.equal(mods.extraProjectiles, 2);

for (const id of ITEM_IDS) {
  assert.equal(ITEMS[id].levelLines.length, itemMaxLevel(id),
    `${id} must carry exactly one copy line per level it can reach`);
}

const evolutionRoles = Object.values(EVOLUTIONS).map(({ role }) => role);
assert.equal(new Set(evolutionRoles).size, 9, 'every evolution must have a unique weapon');
const recipeItems = new Set(Object.values(EVOLUTIONS).map(({ item }) => item));
const pairedItems = new Set(ITEM_IDS.filter((id) => ITEMS[id].evolutionPartner !== undefined));
assert.deepEqual(recipeItems, pairedItems,
  'every paired passive should complete exactly one evolution recipe');
const standaloneItems = new Set(ITEM_IDS.filter((id) => ITEMS[id].evolutionPartner === undefined));
assert.deepEqual(standaloneItems, new Set<ItemId>(['recoveryTape', 'doubleTake']),
  'Recovery Tape and Double Take are the deliberate standalone passives');
assert.deepEqual(new Set(SANDBOX_ENEMY_CATALOG), new Set(ALL_ENEMY_KINDS),
  'the sandbox must expose every opening, endless, child, event, and boss enemy');
assert.deepEqual(new Set(SANDBOX_ITEM_CATALOG), new Set(ITEM_IDS),
  'the sandbox must expose every passive item');
assert.deepEqual(
  new Set(SANDBOX_EVOLUTION_CATALOG.map(({ role }) => role)),
  new Set(evolutionRoles),
  'the sandbox must expose every weapon evolution',
);
assert.deepEqual(new Set(AFTERHOURS_ROLES), new Set(evolutionRoles),
  'the fresh audio kit must cover every live weapon');
assert.equal(
  Object.values(AFTERHOURS_VARIANTS).reduce((total, variants) => total + (variants?.length ?? 0), 0),
  12,
  'the fresh audio kit must expose every canonical chart variant',
);
assert.equal(VOICE_MIX_GAIN.hat, 0.708,
  'the dense hi-hat voice needs a calibrated cut after every palette swap');
const phraseMarkers = [
  { step: 0, time: 10 },
  { step: 16, time: 12 },
  { step: 64, time: 18 },
];
assert.equal(nextUnheardPhraseTime(phraseMarkers, 9.95), 10,
  'Pressure armed inside lookahead must claim the next unheard phrase');
assert.equal(nextUnheardPhraseTime(phraseMarkers, 9.95, 10), 18,
  'the Drop finish must reserve the strictly following phrase');
assert.equal(nextUnheardPhraseTime(phraseMarkers, 18), null,
  'a heard phrase boundary must never be reused');
assert.equal(canDispatchPhraseBoundary(10, 10.5, 9), false,
  'an overdue catch-up boundary must not start a Drop');
assert.equal(canDispatchPhraseBoundary(18, 17.95, 9), true,
  'the next genuinely unheard boundary should start a queued Drop');
assert.equal(canDispatchPhraseBoundary(10, 10.5, 9, true), true,
  'phrase-end cleanup must accept its intended elapsed boundary after a stall');
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
assert.equal(paletteFiles.length, 6, 'the single six-file house palette must ship');
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
  chestsOpened: 2,
  evolutionsMade: 3,
  milestones: MILESTONE_IDS,
});
assert.equal(settlement.notesEarned, 602);
assert.equal(settlement.walletBefore, 0);
assert.equal(settlement.walletAfter, 602);
assert.deepEqual(meta.unlockedRoles(), new Set(CORE_WEAPONS),
  'run performance must not automatically unlock shop weapons');
assert.deepEqual(meta.unlockedItemIds(), new Set(CORE_ITEMS),
  'run performance must not automatically unlock shop passives');
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
assert.equal(meta.state.notes, 222, 'shop costs must be deducted from the note wallet');
const roundTrippedMeta = new MetaStore(storage);
assert.equal(roundTrippedMeta.state.version, 2);
assert.equal(roundTrippedMeta.state.notes, 222, 'the v2 note wallet should round-trip');
assert.deepEqual(roundTrippedMeta.state.purchases, ['heavyAmp', 'clap', 'arp'],
  'shop purchases should round-trip in purchase order');
const recoveryMeta = new MetaStore(new MemoryStorage());
recoveryMeta.grantNotes(100);
assert(recoveryMeta.purchase('recoveryTape'), 'Recovery Tape should be buyable from the first shop shelf');
assert(recoveryMeta.unlockedItemIds().has('recoveryTape'),
  'buying Recovery Tape should add it to the passive offer pool');

const expectedEnemyLabels = {
  swarmer: 'Shardling',
  tank: 'Wallstack',
  darter: 'Needlejack',
  splitter: 'Crackbox',
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
  dummy: 'Practice Cabinet',
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

const recoveryWorld = new RunWorld(
  { width: 1280, height: 720 },
  events,
  { scripted: false, fx: false, rng: () => 0.99 },
);
recoveryWorld.player.hp = 50;
recoveryWorld.addItem('recoveryTape', 5);
recoveryWorld.update(2);
assert.equal(recoveryWorld.player.hp, 51,
  'max-level Recovery Tape should restore 0.5 HP each second');
recoveryWorld.player.hp = recoveryWorld.playerMaxHp - 0.25;
recoveryWorld.update(2);
assert.equal(recoveryWorld.player.hp, recoveryWorld.playerMaxHp,
  'passive regeneration must clamp at maximum health');
recoveryWorld.player.hp = 0;
recoveryWorld.update(2);
assert.equal(recoveryWorld.player.hp, 0,
  'passive regeneration must never revive a defeated player');

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

assert.equal(STAGE_MAGNET.dropChance, 0.0012, 'Stage Magnet should remain a rare 0.12% drop');
assert.equal(STAGE_MAGNET.pityKills, 700, 'rare pickup bad-luck protection must stay finite');
const vacuumEvents: Array<{ gems: number; notes: number }> = [];
const magnetWorld = new RunWorld(
  { width: 1280, height: 720 },
  {
    ...events,
    onStageMagnet: (result) => vacuumEvents.push(result),
  },
  { scripted: false, fx: false, rng: () => 0.99, stageMagnetRng: () => 0 },
);
magnetWorld.spawnEnemyAt('bat', 80, 0);
magnetWorld.killVisible();
assert.equal(magnetWorld.stageMagnets.length, 1,
  'an independently forced rare-drop roll should create one Stage Magnet');
magnetWorld.stageMagnets[0].x = magnetWorld.player.x;
magnetWorld.stageMagnets[0].y = magnetWorld.player.y;
magnetWorld.spawnGemAt(120, 0, 1);
magnetWorld.spawnMusicNoteAt(-120, 0, 3);
const offscreenX = magnetWorld.player.x + magnetWorld.worldW;
magnetWorld.spawnGemAt(offscreenX, 0, 2);
magnetWorld.spawnMusicNoteAt(offscreenX, 30, 1);
magnetWorld.chests.push({ x: 100, y: 0, color: 0xffd45c });
magnetWorld.update(0);
assert.equal(magnetWorld.stageMagnets.length, 0, 'walking onto a Stage Magnet should consume it once');
assert.deepEqual(vacuumEvents, [{ gems: 2, notes: 1 }],
  'the vacuum snapshot should include only currently visible loose resources');
assert.equal(magnetWorld.chests.length, 1,
  'Stage Magnet must not auto-collect the decision-bearing chest');
const laterGem = { x: 160, y: 0, xp: 1, tier: 'blue' as const };
const laterNote = { x: -160, y: 0, value: 1, tier: 'note' as const };
magnetWorld.gems.push(laterGem);
magnetWorld.musicNotes.push(laterNote);
for (let i = 0; i < 120; i++) magnetWorld.update(1 / 120);
assert.equal(magnetWorld.xp, 2, 'vacuumed XP must pass through ordinary XP accounting');
assert.equal(magnetWorld.notesCollected, 3, 'vacuumed notes must preserve their exact value');
assert.equal(magnetWorld.gems.includes(laterGem), true,
  'a gem created after the snapshot must not be vacuumed');
assert.equal(magnetWorld.musicNotes.includes(laterNote), true,
  'a note created after the snapshot must not be vacuumed');
assert.equal(magnetWorld.gems.some((gem) => gem.vacuumed), false,
  'all marked visible gems should arrive within the vacuum window');
assert.equal(magnetWorld.musicNotes.some((note) => note.vacuumed), false,
  'all marked visible notes should arrive within the vacuum window');

const overflowSnapshotWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
for (let i = 0; i < RUN.maxGems; i++) {
  overflowSnapshotWorld.spawnGemAt((i % 20) - 10, Math.floor(i / 20) - 10, 1);
}
for (let i = 0; i < RUN.maxMusicNotes; i++) {
  overflowSnapshotWorld.spawnMusicNoteAt((i % 18) - 9, Math.floor(i / 18) - 5, 1);
}
overflowSnapshotWorld.vacuumVisiblePickups();
overflowSnapshotWorld.spawnGemAt(180, 0, 2);
overflowSnapshotWorld.spawnMusicNoteAt(-180, 0, 3);
const postSnapshotGem = overflowSnapshotWorld.gems[overflowSnapshotWorld.gems.length - 1];
const postSnapshotNote = overflowSnapshotWorld.musicNotes[overflowSnapshotWorld.musicNotes.length - 1];
assert.equal(overflowSnapshotWorld.gems.length, RUN.maxGems + 1,
  'a capped all-inbound gem field needs one bounded post-snapshot overflow object');
assert.equal(overflowSnapshotWorld.musicNotes.length, RUN.maxMusicNotes + 1,
  'a capped all-inbound note field needs one bounded post-snapshot overflow object');
assert.equal(postSnapshotGem.vacuumed, undefined,
  'a gem dropped after activation must not merge into a vacuumed overflow gem');
assert.equal(postSnapshotNote.vacuumed, undefined,
  'a note dropped after activation must not merge into a vacuumed overflow note');
assert.equal(postSnapshotGem.xp, 2);
assert.equal(postSnapshotNote.value, 3);

magnetWorld.spawnStageMagnetAt(200, 0);
magnetWorld.clearSandboxEntities();
assert.equal(magnetWorld.stageMagnets.length, 0, 'Sandbox reset must clear Stage Magnets');

const pityWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.99,
  stageMagnetRng: () => 1,
});
for (let i = 0; i < STAGE_MAGNET.pityKills - 1; i++) {
  pityWorld.spawnEnemyAt('bat', 80, 0);
  pityWorld.killVisible();
  pityWorld.update(0);
}
assert.equal(pityWorld.stageMagnets.length, 0, 'pity should not fire one kill early');
pityWorld.spawnEnemyAt('bat', 80, 0);
pityWorld.killVisible();
assert.equal(pityWorld.stageMagnets.length, 1,
  'the 700th eligible dry kill must guarantee a Stage Magnet');

const hatWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
hatWorld.invincible = true;
hatWorld.addWeapon('hat', 1);
const weakestEnemy = hatWorld.spawnEnemyAt('bat', 80, 0)!;
assert.equal(weakestEnemy.hp, 1, 'the Static Mite fixture should remain the 1-HP baseline');
// Hi-hat fires along the walk heading now, which defaults to +x, so the target
// has to sit ON that line. spawnEnemyAt takes a sprite-feet position and offsets
// the circle center off-axis, so pin the center dead ahead of the player.
weakestEnemy.x = hatWorld.player.x + 80;
weakestEnemy.y = hatWorld.player.y;
hatWorld.fireTrigger({ role: 'hat', time: 0, velocity: 1, step: 0, variant: 'closed' });
for (let i = 0; i < 60 && !weakestEnemy.dead; i++) hatWorld.update(1 / 120);
assert.equal(weakestEnemy.dead, true,
  'one base tier-I hi-hat trigger must be able to kill the weakest enemy');

// Hi-hat is the Knife: it fires along the walk heading with zero scatter, and
// it never consults enemy positions. Walking one direction must give the exact
// same angle every trigger, with or without anything on screen.
const laneWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
  control: () => ({ x: 0, y: -1 }),
});
laneWorld.invincible = true;
laneWorld.addWeapon('hat', 1);
laneWorld.update(1 / 120);
// An enemy far off the heading must not bend the shot.
laneWorld.spawnEnemyAt('bat', 300, 0);
const shotAngles: number[] = [];
for (let i = 0; i < 2; i++) {
  laneWorld.projectiles.length = 0;
  laneWorld.fireTrigger({ role: 'hat', time: 0, velocity: 1, step: 0, variant: 'closed' });
  const shot = laneWorld.projectiles[0];
  assert.ok(shot, 'a hi-hat trigger must spawn a chip');
  shotAngles.push(Math.atan2(shot.vy, shot.vx));
}
assert.equal(shotAngles[0], shotAngles[1],
  'consecutive hi-hat shots on a constant heading must share one exact angle');
assert.ok(Math.abs(shotAngles[0] - -Math.PI / 2) < 1e-9,
  'hi-hat must fire along the walk heading, not at the nearest enemy');

// No enemies at all: still fires along the heading, never a random fallback.
const emptyLane = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
  control: () => ({ x: -1, y: 0 }),
});
emptyLane.invincible = true;
emptyLane.addWeapon('hat', 1);
emptyLane.update(1 / 120);
emptyLane.projectiles.length = 0;
emptyLane.fireTrigger({ role: 'hat', time: 0, velocity: 1, step: 0, variant: 'closed' });
assert.ok(Math.abs(Math.atan2(emptyLane.projectiles[0].vy, emptyLane.projectiles[0].vx) - Math.PI) < 1e-9,
  'hi-hat with an empty screen must still rail along the walk direction');

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

const bossWaveWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  rng: () => 0.5,
  fx: false,
});
bossWaveWorld.invincible = true;
bossWaveWorld.timeS = 599.99;
bossWaveWorld.update(0.02);
assert(bossWaveWorld.enemies.some((enemy) => enemy.spawnClass === 'boss'),
  'five-minute endless marks should spawn elite bosses');

const chestWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
chestWorld.invincible = true;
const bossEnemy = chestWorld.spawnSandboxBoss('mantis')!;
bossEnemy.hp = 1;
bossEnemy.shieldHp = 0;
chestWorld.killVisible();
assert.equal(chestWorld.chests.length, 1,
  'a defeated elite boss should drop exactly one chest on the ground');

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

const pincerWorld = new RunWorld({ width: 1280, height: 720 }, events, {
  scripted: false,
  fx: false,
  rng: () => 0.5,
});
pincerWorld.addWeapon('clap', 4);
pincerWorld.addItem('paddedJacket', 5);
assert(pincerWorld.evolve('clap'));
// Three close enemies fill the pincer's target slots.
const pinchTarget = pincerWorld.spawnEnemyAt('bat', 160, 0)!;
pincerWorld.spawnEnemyAt('bat', 0, 150);
pincerWorld.spawnEnemyAt('bat', -150, 0);
// Well outside every pincer. The three enemies above fill all TWO_HANDS.targets
// slots, so this one is never picked, and it sits 150 units from the nearest
// pinch point — more than three times the 42-unit crush radius and past the
// 96-unit inward tug. That local reach is the property this evolution exists to
// hold: the hands crush what they grab instead of becoming a second
// player-centred blast the way Subquake (a 288-375 unit ring) is meant to be.
const bystander = pincerWorld.spawnEnemyAt('bat', 0, 300)!;
const cornerEnemy = pincerWorld.spawnEnemyAt(
  'bat',
  pincerWorld.worldW * 0.45,
  pincerWorld.worldH * 0.45,
)!;
pincerWorld.update(0);
const targetHpBefore = pinchTarget.hp;
const bystanderHpBefore = bystander.hp;
const cornerHpBefore = cornerEnemy.hp;
pincerWorld.fireTrigger({ role: 'clap', time: 0, velocity: 1, step: 0 });
assert(pinchTarget.hp === targetHpBefore, 'Two Hands damage lands when the hands meet, not on the trigger');
// Step past the close time so the slabs snap shut.
for (let i = 0; i < 12; i++) pincerWorld.update(1 / 60);
assert(pinchTarget.hp < targetHpBefore, 'Two Hands should crush the enemy it picked');
assert(bystander.hp === bystanderHpBefore,
  'Two Hands must stay local: nothing at 300 units should be damaged');
assert(cornerEnemy.hp === cornerHpBefore, 'Two Hands must not reach the arena corners');

console.log('systems-check: items, note shop, Stage Magnet, enemies, endless director, and evolutions passed');
